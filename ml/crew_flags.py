"""Personal-baseline alerts for the simulated crew.

Mirrors the live check-in rule in contracts/DATA_CONTRACT.md:

    w = mean of the non-null values on this day and the previous 2 days
    z = (w - baseline.mean) / baseline.sd

Amber when the relevant side of that 3-day mean reaches 2, red at 3, and red
immediately when the raw check-in sits outside absolute_red. Sleep, mood and
exercise count on the low side only. Heart rate, blood pressure, glucose and
temperature count on both sides. Daily dose, cumulative dose and bone loss stay
on absolute limits and are not averaged, so a past storm does not repaint
today's status.

The z stored on a flag is the same number a live check-in would compute from
the new value and the previous two days. The message adds how many days in a
row that 3-day mean has stayed over the line.

    python ml/crew_flags.py
"""
import math

BASELINE_DAYS = 14
REPORT_LAST_DAYS = 7
ROLLING_DAYS = 3
AMBER_Z = 2
RED_Z = 3

# Quiet baselines would turn ordinary day-to-day noise into false alarms.
SD_FLOOR = dict(hr=3, bp_sys=4, bp_dia=3, glucose=7, temp=0.15, sleep_h=0.4, mood=0.6, exercise_min=12)
# Judged by absolute rules, not a personal z-score.
NO_Z = {"dose_mSv_day", "dose_mSv_cum", "bone_loss_pct"}


def baseline(series, metrics, sd_floor=SD_FLOOR, skip=NO_Z, days=BASELINE_DAYS):
    """Mean and sd of each astronaut's first `days` mission days."""
    out = {}
    for m in metrics:
        if m in skip:
            continue
        vals = [r[m] for r in series[:days] if r.get(m) is not None]
        if len(vals) < 3:
            continue
        mu = sum(vals) / len(vals)
        var = sum((v - mu) ** 2 for v in vals) / (len(vals) - 1)
        sd = max(sd_floor.get(m, 1e-6), math.sqrt(var))
        out[m] = {"mean": round(mu, 2), "sd": round(sd, 2)}
    return out


def _score(z, low_only):
    return -z if low_only else abs(z)


def _outside(value, limits):
    return value is not None and (value < limits["min"] or value > limits["max"])


def window_mean(series, i, metric, window=ROLLING_DAYS):
    """Mean of this day's value and the previous days in the window.

    A missing day is left out. A missing value today is not a check-in.
    """
    if series[i].get(metric) is None:
        return None
    vals = []
    for j in range(max(0, i - window + 1), i + 1):
        value = series[j].get(metric)
        if value is not None:
            vals.append(float(value))
    if not vals:
        return None
    return sum(vals) / len(vals)


def _z(series, i, metric, base):
    mean_value = window_mean(series, i, metric)
    if mean_value is None:
        return None
    return (mean_value - base[metric]["mean"]) / base[metric]["sd"]


def _streak(series, i, metric, base, low_only, baseline_days):
    """Days in a row, ending at i, whose 3-day mean stays on the same side of the amber line."""
    end_z = _z(series, i, metric, base)
    if end_z is None or _score(end_z, low_only) < AMBER_Z:
        return 0
    sign = 1 if end_z > 0 else -1
    n = 0
    j = i
    while j >= baseline_days:
        z = _z(series, j, metric, base)
        if z is None or _score(z, low_only) < AMBER_Z or (1 if z > 0 else -1) != sign:
            break
        n += 1
        j -= 1
    return n


def _message(meta, z, streak, value, limits, metric):
    if z is not None and _score(z, meta["low_only"]) >= AMBER_Z:
        direction = "above" if z > 0 else "below"
        unit = "day" if streak == 1 else "days"
        msg = f"{meta['label']} 3-day average {abs(z):.1f}σ {direction} your own baseline for {streak} {unit}"
        if _outside(value, limits):
            msg += ", and outside the hard safety limit"
        return msg
    if metric == "dose_mSv_day":
        return f"Radiation dose {value} mSv today: solar storm exposure, over 3x the normal rate"
    return f"{meta['label']} outside the hard safety limit"


def flag_series(series, base, metrics, *, today, env_dose_per_day, career_limit_mSv=600,
                baseline_days=BASELINE_DAYS, report_last_days=REPORT_LAST_DAYS):
    """Flags for the last `report_last_days` days. Status uses `today` only."""
    flags = []
    start = max(baseline_days, len(series) - report_last_days)
    for i in range(start, len(series)):
        for metric, meta in metrics.items():
            value = series[i].get(metric)
            if value is None:
                continue
            limits = meta["absolute_red"]
            z = None
            severity = None
            if metric in base:
                z = _z(series, i, metric, base)
                score = _score(z, meta["low_only"])
                if score >= RED_Z:
                    severity = "red"
                elif score >= AMBER_Z:
                    severity = "amber"
            if _outside(value, limits):
                severity = "red"
            if metric == "dose_mSv_day" and value > 3 * env_dose_per_day:
                severity = "red" if value > limits["max"] else "amber"
            if metric == "dose_mSv_cum" and value > 0.5 * career_limit_mSv:
                severity = severity or "amber"
            if metric == "bone_loss_pct" and value > 3:
                severity = severity or "amber"
            if not severity:
                continue
            streak = _streak(series, i, metric, base, meta["low_only"], baseline_days) if metric in base else 0
            flags.append({
                "date": series[i]["date"],
                "metric": metric,
                "severity": severity,
                "z": round(z, 2) if z is not None else None,
                "message": _message(meta, z, streak, value, limits, metric),
                "action": meta["actions"][severity],
            })
    return flags


def status_from(flags, metrics, today):
    """Worst severity per body region, from today's flags only."""
    order = {"green": 0, "amber": 1, "red": 2}
    regions = {r: "green" for r in ("brain", "heart", "blood", "bones", "whole_body")}
    last = str(today)
    for flag in flags:
        if flag["date"] != last:
            continue
        region = metrics[flag["metric"]]["body_region"]
        if order[flag["severity"]] > order[regions[region]]:
            regions[region] = flag["severity"]
    regions["overall"] = max(regions.values(), key=lambda s: order[s])
    return regions


if __name__ == "__main__":
    import make_sample_data
    make_sample_data.write_crew()
