"""Alert-rule test bench on Tomas's synthetic crew generator (read-only use of ml/).

Question 1 (false alarms): on healthy simulated missions with no planted problem,
how often does each personal-baseline rule raise amber / red?
Question 2 (detection): when a real drift is injected, how often and how fast
does each rule catch it?

Rules compared
  A  "today z"    : z of today's value vs first-14-day baseline (DATA_CONTRACT, ml/crew_flags.py)
  B  "3-day mean" : z of the mean of today + previous 2 days (THESIS.md section 3A)
  C  "2 of 3"     : amber only if at least 2 of the last 3 days are >= 2 sigma; red at >= 3 sigma today
Absolute red limits are applied identically in all three, so they are left out here
(they do not change the comparison and rarely fire on healthy draws).

    python3 analysis/alert_testbench.py            (from NASA PROJECT/)
"""
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent / "ml"))
import make_sample_data as gen  # noqa: E402
from crew_flags import SD_FLOOR, AMBER_Z, RED_Z, BASELINE_DAYS  # noqa: E402

LOW_ONLY = {"sleep_h", "mood", "exercise_min"}
METRICS = gen.DRAW_METRICS
N_MISSIONS = 2000          # per crew member
DAYS = 75                  # same length as the demo mission
MONITORED = DAYS - BASELINE_DAYS


def setup():
    target = gen.correlation_matrix()
    phi = np.array([gen.AR_PHI[m] for m in METRICS])
    shock = gen.innovation_correlation(target, phi)
    return np.linalg.cholesky(shock), np.linalg.cholesky(target)


def rounded(member, latent):
    out = {}
    for m in METRICS:
        v = np.asarray(latent[m], dtype=float)
        if m in ("temp", "sleep_h"):
            v = np.round(v, 1)
        elif m == "mood":
            v = np.clip(np.round(v), 1, 5)
        else:
            v = np.round(v)
        out[m] = v
    return out


def baseline(series):
    b = {}
    for m in METRICS:
        x = series[m][:BASELINE_DAYS]
        b[m] = (x.mean(), max(SD_FLOOR[m], x.std(ddof=1)))
    return b


def scores(series, b, m):
    mu, sd = b[m]
    z = (series[m] - mu) / sd
    return -z if m in LOW_ONLY else np.abs(z)  # side-aware score per day


def flags(series, b, m, rule):
    """Severity per monitored day: 0 green, 1 amber, 2 red."""
    s = scores(series, b, m)
    mu, sd = b[m]
    out = np.zeros(DAYS, dtype=int)
    for t in range(BASELINE_DAYS, DAYS):
        if rule == "A":
            v = s[t]
            out[t] = 2 if v >= RED_Z else 1 if v >= AMBER_Z else 0
        elif rule == "B":
            raw = series[m][t - 2:t + 1].mean()
            z = (raw - mu) / sd
            v = -z if m in LOW_ONLY else abs(z)
            out[t] = 2 if v >= RED_Z else 1 if v >= AMBER_Z else 0
        elif rule == "C":
            last3 = s[t - 2:t + 1]
            if s[t] >= RED_Z and (last3 >= AMBER_Z).sum() >= 2:
                out[t] = 2
            elif (last3 >= AMBER_Z).sum() >= 2:
                out[t] = 1
    return out[BASELINE_DAYS:]


def episodes(sev, level):
    """Count separate alert episodes (a run of consecutive days counts once)."""
    hit = sev >= level
    return int(np.sum(hit[1:] & ~hit[:-1]) + hit[0])


def false_alarm_study(rng, shock_chol, marg_chol):
    res = {r: {"amber_days": 0, "red_days": 0, "amber_ep": 0, "red_ep": 0,
               "missions_any_red": 0, "per_metric_amber_ep": {m: 0 for m in METRICS}} for r in "ABC"}
    member_days = 0
    for member in gen.CREW:
        for _ in range(N_MISSIONS):
            ser = rounded(member, gen.draw_latent(member, DAYS, rng, shock_chol, marg_chol))
            b = baseline(ser)
            member_days += MONITORED
            for r in "ABC":
                worst = np.zeros(MONITORED, dtype=int)
                for m in METRICS:
                    f = flags(ser, b, m, r)
                    res[r]["per_metric_amber_ep"][m] += episodes(f, 1)
                    worst = np.maximum(worst, f)
                res[r]["amber_days"] += int((worst >= 1).sum())
                res[r]["red_days"] += int((worst >= 2).sum())
                res[r]["amber_ep"] += episodes(worst, 1)
                res[r]["red_ep"] += episodes(worst, 2)
                res[r]["missions_any_red"] += int((worst >= 2).any())
    months = member_days / 30.44
    n = len(gen.CREW) * N_MISSIONS
    summary = {}
    for r, v in res.items():
        summary[r] = {
            "share_of_days_not_green": round(v["amber_days"] / member_days, 3),
            "share_of_days_red": round(v["red_days"] / member_days, 4),
            "amber_or_red_episodes_per_astronaut_month": round(v["amber_ep"] / months, 2),
            "red_episodes_per_astronaut_month": round(v["red_ep"] / months, 3),
            "missions_with_any_false_red": round(v["missions_any_red"] / n, 3),
            "amber_episodes_per_month_by_metric": {m: round(c / months, 2) for m, c in v["per_metric_amber_ep"].items()},
        }
    return summary


def detection_study(rng, shock_chol, marg_chol, metric, size_sd, ramp_days):
    """Inject a drift on `metric` starting day 50: ramps linearly to size_sd over ramp_days, then holds."""
    start = 50
    res = {r: {"caught": 0, "delays": [], "red": 0} for r in "ABC"}
    n = 0
    for member in gen.CREW:
        mu_cat, sd_cat = member["base"][metric]
        sign = -1 if metric in LOW_ONLY else 1
        for _ in range(N_MISSIONS // 2):
            lat = gen.draw_latent(member, DAYS, rng, shock_chol, marg_chol)
            shift = np.zeros(DAYS)
            for t in range(start, DAYS):
                shift[t] = size_sd * min(1.0, (t - start + 1) / ramp_days)
            lat[metric] = lat[metric] + sign * sd_cat * shift
            ser = rounded(member, lat)
            b = baseline(ser)
            n += 1
            for r in "ABC":
                f = flags(ser, b, metric, r)
                post = f[start - BASELINE_DAYS:]
                idx = np.argmax(post >= 1) if (post >= 1).any() else None
                if idx is not None:
                    res[r]["caught"] += 1
                    res[r]["delays"].append(int(idx))
                res[r]["red"] += int((post >= 2).any())
    return {r: {"detected": round(v["caught"] / n, 3),
                "median_days_to_first_amber": (float(np.median(v["delays"])) if v["delays"] else None),
                "reached_red": round(v["red"] / n, 3)} for r, v in res.items()}


def main():
    rng = np.random.default_rng(2026)
    shock_chol, marg_chol = setup()
    out = {
        "setup": {"missions_per_member": N_MISSIONS, "crew": len(gen.CREW), "days": DAYS,
                  "baseline_days": BASELINE_DAYS, "generator": "ml/make_sample_data.py (AR(1) + approved correlations)",
                  "note": "Simulated crew. Measures the alert rule, not human physiology."},
        "false_alarms_healthy": false_alarm_study(rng, shock_chol, marg_chol),
        "detection": {
            "bp_sys +2.5 sd, ramp 5 days": detection_study(rng, shock_chol, marg_chol, "bp_sys", 2.5, 5),
            "bp_sys +1.5 sd, ramp 7 days": detection_study(rng, shock_chol, marg_chol, "bp_sys", 1.5, 7),
            "sleep_h -2.5 sd, ramp 5 days": detection_study(rng, shock_chol, marg_chol, "sleep_h", 2.5, 5),
            "hr +3 sd, step": detection_study(rng, shock_chol, marg_chol, "hr", 3.0, 1),
        },
    }
    path = HERE / "alert_testbench_results.json"
    path.write_text(json.dumps(out, indent=2))
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
