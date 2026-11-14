"""
Generate contract-shaped data so the web app can be built before the model exists.

    python ml/make_sample_data.py

Writes:
  contracts/crew_data.sample.json      simulated crew (also a fine starting point for the REAL crew file)
  contracts/storm_forecast.sample.json FAKE forecasts (random numbers, shape only)
  web/public/data/*.json               same files, so the app loads them immediately

Crew scenarios planted for the demo:
  c1 Commander: systolic BP drifting up over the last days -> heart amber
  c2 Engineer:  sleep falling                              -> brain red
  c3 Scientist: steady today, storm dose kept in history   -> overall green
Daily vitals are an AR(1) with correlated shocks. The planted days are applied
after that draw. Baseline flags live in ml/crew_flags.py.
"""
import json
import random
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from crew_flags import baseline as personal_baseline, flag_series as personal_flags, status_from as status_today

ROOT = Path(__file__).resolve().parents[1]
random.seed(7)

START, TODAY = date(2026, 9, 1), date(2026, 11, 14)
DAYS = (TODAY - START).days + 1
ENV = "moon"
ENVIRONMENTS = {
    "iss": {"label": "ISS", "dose_mSv_day": 0.5},
    "moon": {"label": "Lunar surface", "dose_mSv_day": 1.4},
    "transit": {"label": "Mars transit", "dose_mSv_day": 1.8},
    "mars": {"label": "Mars surface", "dose_mSv_day": 0.65},
}

# Working values; verify before showing as facts (PROJECT_CONTEXT.md §10).
METRICS = {
    "hr": dict(label="Resting heart rate", unit="bpm", body_region="heart", low_only=False,
               absolute_red={"min": 40, "max": 110},
               explain="Fluid shifts toward the head and less work against gravity change how the heart works in space. A resting rate that drifts from your normal can signal fatigue, dehydration, illness or cardiovascular deconditioning.",
               how_to_measure="Seated, after 5 minutes of rest, first thing in the morning. Use the wrist monitor or count your pulse for 60 seconds.",
               actions={"amber": "Re-measure tonight at rest. Check hydration and sleep. Avoid heavy exercise until it settles.",
                        "red": "Stop strenuous activity, re-measure in 15 min, and contact the flight surgeon."}),
    "bp_sys": dict(label="Systolic blood pressure", unit="mmHg", body_region="heart", low_only=False,
                   absolute_red={"min": 85, "max": 150},
                   explain="Blood pressure changes as fluids redistribute in microgravity and after returning to gravity. A sustained rise above your own baseline deserves attention.",
                   how_to_measure="Cuff on the upper arm, seated and still, arm at heart level. Take two readings 1 minute apart and log the average.",
                   actions={"amber": "Repeat the measurement tonight. Review salt and fluid intake.",
                            "red": "Repeat now. If it's still high, contact the flight surgeon."}),
    "bp_dia": dict(label="Diastolic blood pressure", unit="mmHg", body_region="heart", low_only=False,
                   absolute_red={"min": 50, "max": 95},
                   explain="The pressure in your arteries between heartbeats. It's read together with systolic pressure.",
                   how_to_measure="Same reading as systolic.",
                   actions={"amber": "Repeat the measurement tonight.", "red": "Contact the flight surgeon."}),
    "glucose": dict(label="Blood glucose (fasting)", unit="mg/dL", body_region="blood", low_only=False,
                    absolute_red={"min": 60, "max": 180},
                    explain="Spaceflight can reduce insulin sensitivity. Tracking fasting glucose helps spot metabolic changes and diet issues early.",
                    how_to_measure="Finger-prick meter, before breakfast.",
                    actions={"amber": "Review meals and exercise for the last 2 days. Re-test tomorrow morning.",
                             "red": "If below 60: take fast sugar now and re-test in 15 min. If above 180: contact the flight surgeon."}),
    "temp": dict(label="Body temperature", unit="°C", body_region="whole_body", low_only=False,
                 absolute_red={"min": 35.5, "max": 38.3},
                 explain="Core temperature tends to run slightly higher in space. A jump above your baseline can be an early sign of infection, since the immune system changes in flight.",
                 how_to_measure="Thermometer under the tongue or in the ear, at rest.",
                 actions={"amber": "Re-measure in 4 hours and watch for symptoms.",
                          "red": "Isolate if possible, hydrate, and contact the flight surgeon."}),
    "sleep_h": dict(label="Sleep", unit="h", body_region="brain", low_only=True,
                    absolute_red={"min": 4.0, "max": 24},
                    explain="Light-dark cycles, noise and workload disrupt sleep in space. Chronic short sleep hurts mood, reaction time and mission safety.",
                    how_to_measure="Log the hours slept, or sync your wearable each morning.",
                    actions={"amber": "Protect tonight's sleep window: dim lights and no screens 1 h before bed. Ask for a lighter schedule tomorrow if needed.",
                             "red": "Flag to the commander and flight surgeon. Avoid safety-critical tasks."}),
    "mood": dict(label="Mood (1–5)", unit="/5", body_region="brain", low_only=True,
                 absolute_red={"min": 1.5, "max": 5},
                 explain="Isolation and confinement are among the five hazards of spaceflight. A downward trend in self-rated mood is an early signal worth acting on.",
                 how_to_measure="Daily self-rating: 1 = very low, 5 = great.",
                 actions={"amber": "Schedule a private call home or a crew social activity. Try the guided breathing module.",
                          "red": "Book a private conference with the flight psychologist."}),
    "exercise_min": dict(label="Exercise", unit="min", body_region="bones", low_only=True,
                         absolute_red={"min": 30, "max": 600},
                         explain="Without gravity, bones and muscles weaken quickly. Daily resistance and aerobic exercise is the main countermeasure.",
                         how_to_measure="Logged automatically by the exercise devices, or entered manually.",
                         actions={"amber": "Make up the missed volume over the next 2 days, prioritising resistance work.",
                                  "red": "Talk to the strength coach today: bone loss risk is rising."}),
    "bone_loss_pct": dict(label="Estimated bone loss", unit="%", body_region="bones", low_only=False,
                          absolute_red={"min": -100, "max": 5},
                          explain="An estimate of cumulative loss in bone mineral density at weight-bearing sites, driven by mission days and exercise compliance.",
                          how_to_measure="Estimated from mission day and exercise logs. Confirmed with scans when available.",
                          actions={"amber": "Increase resistance exercise and check calcium and vitamin D intake.",
                                   "red": "Flight surgeon review of countermeasures."}),
    "dose_mSv_day": dict(label="Radiation dose (daily)", unit="mSv", body_region="whole_body", low_only=False,
                         absolute_red={"min": 0, "max": 10},
                         explain="Measured by your personal dosimeter. It jumps during solar radiation storms.",
                         how_to_measure="Automatic from your personal dosimeter.",
                         actions={"amber": "Limit time outside shielded areas today.",
                                  "red": "Go to the storm shelter now. Postpone all EVAs."}),
    "dose_mSv_cum": dict(label="Radiation dose (mission total)", unit="mSv", body_region="whole_body", low_only=False,
                         absolute_red={"min": 0, "max": 600},
                         explain="Your total dose so far, compared against NASA's career limit.",
                         how_to_measure="Sum of your daily dosimeter readings.",
                         actions={"amber": "Review the EVA plan with the flight surgeon.",
                                  "red": "Career limit reached: no further exposure allowed."}),
}

# D6, pre-approved. Vitals share 0.6; mood 0.6; sleep 0.5; exercise 0.4.
DRAW_METRICS = ["hr", "bp_sys", "bp_dia", "glucose", "temp", "sleep_h", "mood", "exercise_min"]
AR_PHI = {
    "hr": 0.6, "bp_sys": 0.6, "bp_dia": 0.6, "glucose": 0.6, "temp": 0.6,
    "mood": 0.6, "sleep_h": 0.5, "exercise_min": 0.4,
}
# Pairs not listed here are 0. Checked for positive definiteness before drawing.
APPROVED_CORR = (("sleep_h", "mood", 0.4), ("sleep_h", "hr", -0.3), ("hr", "bp_sys", 0.3))


def correlation_matrix():
    index = {name: i for i, name in enumerate(DRAW_METRICS)}
    matrix = np.eye(len(DRAW_METRICS))
    for a, b, rho in APPROVED_CORR:
        i, j = index[a], index[b]
        matrix[i, j] = matrix[j, i] = rho
    return matrix


def innovation_correlation(target, phi):
    """Shock correlations that leave the stationary correlations at `target`."""
    out = np.eye(len(phi))
    for i in range(len(phi)):
        for j in range(i + 1, len(phi)):
            scale = np.sqrt((1 - phi[i] ** 2) * (1 - phi[j] ** 2))
            out[i, j] = out[j, i] = target[i, j] * (1 - phi[i] * phi[j]) / scale
    return out


def min_eigenvalue(matrix):
    value = float(np.linalg.eigvalsh(matrix).min())
    if value <= 0:
        raise RuntimeError(f"correlation matrix is not positive definite (min eigenvalue {value})")
    return value


def draw_latent(member, n_days, rng, shock_chol, marginal_chol):
    """Stationary AR(1) in stated-sd units, correlated across metrics."""
    k = len(DRAW_METRICS)
    phi = np.array([AR_PHI[m] for m in DRAW_METRICS])
    z = np.zeros((n_days, k))
    z[0] = marginal_chol @ rng.standard_normal(k)
    scale = np.sqrt(1 - phi ** 2)
    for t in range(1, n_days):
        z[t] = phi * z[t - 1] + scale * (shock_chol @ rng.standard_normal(k))
    latent = {}
    for i, metric in enumerate(DRAW_METRICS):
        mu, sd = member["base"][metric]
        latent[metric] = mu + sd * z[:, i]
    return latent


CREW = [
    dict(id="c1", name="Cmdr. Ana Silva", role="Commander", age=44,
         base=dict(hr=(62, 3), bp_sys=(116, 4), bp_dia=(74, 3), glucose=(92, 5), temp=(36.9, 0.15),
                   sleep_h=(6.6, 0.4), mood=(4.2, 0.4), exercise_min=(125, 12))),
    dict(id="c2", name="Eng. Kenji Mori", role="Flight Engineer", age=38,
         base=dict(hr=(58, 3), bp_sys=(112, 4), bp_dia=(70, 3), glucose=(88, 5), temp=(36.8, 0.15),
                   sleep_h=(6.8, 0.4), mood=(4.0, 0.4), exercise_min=(130, 12))),
    dict(id="c3", name="Dr. Léa Martin", role="Mission Scientist", age=35,
         base=dict(hr=(66, 3), bp_sys=(110, 4), bp_dia=(68, 3), glucose=(90, 5), temp=(36.9, 0.15),
                   sleep_h=(6.3, 0.4), mood=(4.3, 0.4), exercise_min=(115, 12))),
]
STORM_DAY = 70  # a solar storm hits the base on this mission day (adds dose for everyone)


def _rounded_series(member, latent):
    """Rounded daily inputs with no planted days, so the baseline matches the file."""
    rows = []
    for d in range(DAYS):
        r = {"date": str(START + timedelta(days=d))}
        for m in member["base"]:
            v = float(latent[m][d])
            r[m] = round(v, 1) if m in ("temp", "sleep_h") else round(v)
            if m == "mood":
                r[m] = int(min(5, max(1, round(v))))
        rows.append(r)
    return rows


def simulate(member, latent, own_baseline):
    rows, cum, bone = [], 0.0, 0.0
    for d in range(DAYS):
        day = START + timedelta(days=d)
        r = {"date": str(day)}
        for m, (mu, sd) in member["base"].items():
            v = float(latent[m][d])
            # Planted days are measured from this astronaut's own first-14-day
            # baseline. An AR(1) mean can sit off the catalogue value, and the
            # flags judge that baseline, not the catalogue.
            if member["id"] == "c3" and d == DAYS - 1 and m in own_baseline:
                mean, width = own_baseline[m]["mean"], own_baseline[m]["sd"]
                v = min(mean + 1.25 * width, max(mean - 1.25 * width, v))
            if member["id"] == "c1" and m == "bp_sys" and d >= DAYS - 5:
                mean, width = own_baseline[m]["mean"], own_baseline[m]["sd"]
                v = mean + width * (1.9 + 0.2 * (d - (DAYS - 5)))
            if member["id"] == "c2" and m == "sleep_h" and d >= DAYS - 6:
                mean, width = own_baseline[m]["mean"], own_baseline[m]["sd"]
                v = mean - width * (2.0 + 0.25 * (d - (DAYS - 6)))
            if member["id"] == "c2" and m == "mood" and d >= DAYS - 5:
                v = max(1, mu - 1.2)
            r[m] = round(v, 1) if m in ("temp", "sleep_h") else round(v)
            if m == "mood":
                r[m] = int(min(5, max(1, round(v))))
        dose = ENVIRONMENTS[ENV]["dose_mSv_day"] * random.uniform(0.9, 1.1)
        if d == STORM_DAY:
            dose += 6.0 if member["id"] != "c3" else 9.5  # c3 was on EVA prep
        cum += dose
        bone += 0.045 * (1.25 - min(1.25, r["exercise_min"] / 120))  # ~1%/month baseline, less if exercising
        r["dose_mSv_day"], r["dose_mSv_cum"] = round(dose, 2), round(cum, 1)
        r["bone_loss_pct"] = round(bone, 2)
        if random.random() < 0.03:  # occasional missed measurement
            r["glucose"] = None
        rows.append(r)
    return rows


def build_crew():
    """One seeded draw. Returns the contract payload and the pre-plant latent series."""
    random.seed(7)
    rng = np.random.default_rng(7)
    target = correlation_matrix()
    phi = np.array([AR_PHI[m] for m in DRAW_METRICS])
    shock = innovation_correlation(target, phi)
    spec = {
        "target": target,
        "min_eigenvalue_target": min_eigenvalue(target),
        "min_eigenvalue_innovation": min_eigenvalue(shock),
    }
    marginal_chol = np.linalg.cholesky(target)
    shock_chol = np.linalg.cholesky(shock)
    crew, latents = [], []
    dose_per_day = ENVIRONMENTS[ENV]["dose_mSv_day"]
    for m in CREW:
        latent = draw_latent(m, DAYS, rng, shock_chol, marginal_chol)
        own = personal_baseline(_rounded_series(m, latent), METRICS)
        s = simulate(m, latent, own)
        latents.append(latent)
        b = personal_baseline(s, METRICS)
        fl = personal_flags(s, b, METRICS, today=TODAY, env_dose_per_day=dose_per_day)
        crew.append({k: m[k] for k in ("id", "name", "role", "age")} |
                    {"baseline": b, "series": s, "flags": fl, "status": status_today(fl, METRICS, TODAY)})
    metrics_out = {k: {kk: vv for kk, vv in v.items() if kk != "low_only"} | {"low_side_only": v["low_only"]}
                   for k, v in METRICS.items()}
    payload = {
        "meta": {"generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "simulated": True,
                 "note": "Simulated crew from published ranges. Not real astronaut data."},
        "mission": {"name": "Artemis Base Camp (sim)", "environment": ENV, "start_date": str(START), "today": str(TODAY)},
        "environments": ENVIRONMENTS,
        "career_limit_mSv": 600,
        "metrics": metrics_out,
        "crew": crew,
    }
    return payload, spec, latents


def crew_file():
    payload, _, _ = build_crew()
    return payload


def fake_storm_file():
    """FAKE numbers in the real shape. Includes a May 2024-like sequence for the replay UI."""
    ev = []
    t0 = datetime(2024, 5, 5, tzinfo=timezone.utc)
    seq = [  # (hours from t0, class, location, cme, p, storm_after_h)
        (20, "M1.2", "S18E40", False, 0.04, None), (52, "X1.0", "S20E25", True, 0.18, None),
        (75, "M9.8", "S17E10", True, 0.35, None), (101, "X2.2", "S18W05", True, 0.48, 30.0),
        (126, "X1.1", "S17W20", True, 0.55, 18.0), (150, "M4.0", "S19W35", False, 0.28, None),
        (196, "M6.6", "S22W80", True, 0.74, 3.0), (225, "X8.7", "S19W90", True, 0.81, 17.0),
        (260, "C8.0", "N12E60", False, 0.02, None), (300, "M2.1", "N08E44", False, 0.05, None),
    ]
    for h, cls, loc, cme, p, after in seq:
        pt = t0 + timedelta(hours=h)
        letter = cls[0]; flux = {"C": 1e-6, "M": 1e-5, "X": 1e-4}[letter] * float(cls[1:])
        lat = int(loc[1:3]) * (1 if loc[0] == "N" else -1)
        lon = int(loc[4:]) * (1 if loc[3] == "W" else -1)
        onset = (pt + timedelta(hours=after)).strftime("%Y-%m-%dT%H:%M:%SZ") if after else None
        ev.append(dict(flare_id=pt.strftime("%Y-%m-%dT%H:%M:00-FLR-001"), peak_time=pt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                       flare_class=cls, class_flux=flux, source_location=loc, latitude_deg=lat, longitude_deg=lon,
                       has_linked_cme=cme, cme_speed_kms=random.choice([900, 1300, 1800, 2400]) if cme else None,
                       p_storm=p, alert_level="warning" if p >= 0.5 else "watch" if p >= 0.2 else "none",
                       actual_storm=after is not None, storm_onset_time=onset, lead_time_h=after, split="test"))
    # background flares across 2024-2026
    for _ in range(120):
        pt = datetime(2024, 1, 1, tzinfo=timezone.utc) + timedelta(hours=random.uniform(0, 24 * 1000))
        letter = random.choices("CMX", [70, 26, 4])[0]
        cls = f"{letter}{random.uniform(1, 9.9):.1f}"
        lon = random.randint(-90, 90); lat = random.randint(-30, 30)
        loc = f"{'N' if lat >= 0 else 'S'}{abs(lat):02d}{'W' if lon >= 0 else 'E'}{abs(lon):02d}"
        p = min(0.95, max(0.01, random.betavariate(1, 12) * (3 if letter == "X" else 1.5 if letter == "M" else 0.7) * (1.4 if lon > 20 else 0.7)))
        storm = random.random() < p
        after = round(random.uniform(1, 40), 1) if storm else None
        ev.append(dict(flare_id=pt.strftime("%Y-%m-%dT%H:%M:00-FLR-001"), peak_time=pt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                       flare_class=cls, class_flux={"C": 1e-6, "M": 1e-5, "X": 1e-4}[letter] * float(cls[1:]),
                       source_location=loc, latitude_deg=lat, longitude_deg=lon, has_linked_cme=random.random() < 0.3,
                       cme_speed_kms=None, p_storm=round(p, 3),
                       alert_level="warning" if p >= 0.5 else "watch" if p >= 0.2 else "none",
                       actual_storm=storm, storm_onset_time=(pt + timedelta(hours=after)).strftime("%Y-%m-%dT%H:%M:%SZ") if after else None,
                       lead_time_h=after, split="test"))
    ev.sort(key=lambda e: e["peak_time"])
    return {
        "meta": {"generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                 "model": "FAKE_SAMPLE_DO_NOT_PRESENT", "horizon_hours": 72,
                 "train_period": ["2010-01-01", "2023-12-31"], "test_period": ["2024-01-01", "2026-11-14"],
                 "thresholds": {"watch": 0.2, "warning": 0.5},
                 "metrics_test": {"n_flares": len(ev), "n_storms": sum(e["actual_storm"] for e in ev),
                                  "hit_rate": 0.0, "false_alarms_per_month": 0.0, "median_lead_time_h": 0.0,
                                  "brier_skill_vs_climatology": 0.0},
                 "feature_importance": [{"feature": f, "importance": i} for f, i in
                                        [("longitude_deg", 0.31), ("class_flux", 0.27), ("cme_speed_kms", 0.22), ("has_linked_cme", 0.12), ("latitude_deg", 0.08)]],
                 "data_credit": "NASA CCMC DONKI"},
        "events": ev,
    }


def _fmt(matrix):
    header = "| | " + " | ".join(DRAW_METRICS) + " |"
    rule = "|---|" + "|".join("---:" for _ in DRAW_METRICS) + "|"
    lines = [header, rule]
    for i, name in enumerate(DRAW_METRICS):
        cells = " | ".join(f"{matrix[i, j]:.2f}" for j in range(len(DRAW_METRICS)))
        lines.append(f"| {name} | {cells} |")
    return "\n".join(lines)


def fidelity_report(spec, latents):
    """Generator check on the continuous draws, before rounding and planted days."""
    z = []
    lag1 = {m: [] for m in DRAW_METRICS}
    moments = []
    for member, latent in zip(CREW, latents):
        block = []
        for metric in DRAW_METRICS:
            mu, sd = member["base"][metric]
            series = latent[metric]
            block.append((series - mu) / sd)
            lag1[metric].append(float(np.corrcoef(series[:-1], series[1:])[0, 1]))
            moments.append({
                "crew": member["id"],
                "metric": metric,
                "stated_mean": mu,
                "realized_mean": float(series.mean()),
                "stated_sd": sd,
                "realized_sd": float(series.std(ddof=1)),
            })
        z.append(np.vstack(block))
    stacked = np.hstack(z)
    realized = np.corrcoef(stacked)
    lines = [
        "# Synthetic crew fidelity",
        "",
        "Simulated crew. Not real astronaut data. Numbers below are the continuous AR(1) draws, before rounding and before the planted demo days (Ana's blood pressure, Kenji's sleep and mood, Léa's last-day hold).",
        "",
        "## Positive definite",
        "",
        f"Approved correlation matrix minimum eigenvalue: {spec['min_eigenvalue_target']:.4f}.",
        f"Innovation correlation matrix minimum eigenvalue: {spec['min_eigenvalue_innovation']:.4f}.",
        "Both are positive, so the Cholesky draws are valid.",
        "",
        "Approved off-diagonal pairs: sleep↔mood +0.40, sleep↔resting HR −0.30, HR↔systolic BP +0.30. Every other pair is 0.",
        "",
        "AR(1) coefficients: vitals 0.60 (heart rate, both blood pressures, glucose, temperature), mood 0.60, sleep 0.50, exercise 0.40.",
        "",
        "## Approved correlation",
        "",
        _fmt(spec["target"]),
        "",
        "## Realized correlation",
        "",
        "Three astronauts, 75 days each, standardized by that astronaut's stated mean and sd, then pooled.",
        "",
        _fmt(realized),
        "",
        "## Lag-1 autocorrelation",
        "",
        "| Metric | Target | Ana | Kenji | Léa | Mean |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for metric in DRAW_METRICS:
        vals = lag1[metric]
        lines.append(
            f"| {metric} | {AR_PHI[metric]:.2f} | {vals[0]:.2f} | {vals[1]:.2f} | {vals[2]:.2f} | {np.mean(vals):.2f} |"
        )
    lines += [
        "",
        "## Means and standard deviations",
        "",
        "| Crew | Metric | Stated mean | Realized mean | Stated sd | Realized sd |",
        "|---|---|---:|---:|---:|---:|",
    ]
    for row in moments:
        lines.append(
            f"| {row['crew']} | {row['metric']} | {row['stated_mean']:.2f} | {row['realized_mean']:.2f} | "
            f"{row['stated_sd']:.2f} | {row['realized_sd']:.2f} |"
        )
    lines += [
        "",
        "With 75 days, a mean can sit a few tenths of a standard deviation off the stated value, and a single lag-1 estimate wobbles. The targets are the process, not a promise that one short mission matches them to two decimals.",
        "",
        "The JSON stores mood as an integer from 1 to 5 and rounds the other daily inputs. Those stored values are coarser than this table. Bone loss and radiation dose are built from the daily inputs and the planted storm day; they are not part of the correlation matrix.",
        "",
    ]
    return "\n".join(lines)


def assert_demo(crew):
    by = {c["id"]: c["status"] for c in crew["crew"]}
    problems = []
    if by["c1"]["heart"] != "amber":
        problems.append(f"c1 heart is {by['c1']['heart']}, expected amber")
    if by["c2"]["brain"] != "red":
        problems.append(f"c2 brain is {by['c2']['brain']}, expected red")
    if by["c3"]["overall"] != "green":
        problems.append(f"c3 overall is {by['c3']['overall']}, expected green")
    if problems:
        raise RuntimeError("planted demo scenarios did not land: " + "; ".join(problems))


def write_crew(path=None):
    """Rewrite crew_data.json only. Leaves the storm forecast file alone."""
    crew, spec, latents = build_crew()
    assert_demo(crew)
    path = Path(path) if path else ROOT / "web" / "public" / "data" / "crew_data.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(crew, ensure_ascii=False)
    path.write_text(text, encoding="utf-8")
    sample = ROOT / "contracts" / "crew_data.sample.json"
    sample.write_text(json.dumps(crew, indent=1, ensure_ascii=False), encoding="utf-8")
    report = ROOT / "ml" / "results" / "synthetic_crew.md"
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(fidelity_report(spec, latents), encoding="utf-8")
    for c in crew["crew"]:
        print(c["id"], c["name"], c["status"], f"{len(c['flags'])} flags")
        for f in c["flags"]:
            print(f"  {f['date']} {f['metric']:16} {f['severity']:5} z={f['z']}  {f['message']}")
    print(f"Wrote {path}")
    print(f"Wrote {report}")
    return crew


def main():
    crew, storm = crew_file(), fake_storm_file()
    for folder in (ROOT / "contracts", ROOT / "web" / "public" / "data"):
        folder.mkdir(parents=True, exist_ok=True)
    (ROOT / "contracts" / "crew_data.sample.json").write_text(json.dumps(crew, indent=1, ensure_ascii=False), encoding="utf-8")
    (ROOT / "contracts" / "storm_forecast.sample.json").write_text(json.dumps(storm, indent=1, ensure_ascii=False), encoding="utf-8")
    (ROOT / "web" / "public" / "data" / "crew_data.json").write_text(json.dumps(crew, ensure_ascii=False), encoding="utf-8")
    (ROOT / "web" / "public" / "data" / "storm_forecast.json").write_text(json.dumps(storm, ensure_ascii=False), encoding="utf-8")
    for c in crew["crew"]:
        print(c["name"], c["status"], f"{len(c['flags'])} flags")
    print("storm events:", len(storm["events"]))


if __name__ == "__main__":
    main()
