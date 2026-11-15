# Data contract (the only interface between /ml and /web)

JSON files served by the web app from `web/public/data/`:
- `storm_forecast.json`: produced by Tomas's model
- `crew_data.json`: produced by Tomas's baseline logic (crew is simulated)
- `real_crew.json`: published Inspiration4 lab draws, scored against each person's pre-flight mean. Not the simulated crew, and not an input to the check-in scorer.

Until the real files exist, the app loads `contracts/*.sample.json` (copied into `web/public/data/`). The samples are fake but **exactly** the real shape.

Rules: times are ISO 8601 UTC strings (`2024-05-10T17:23:00Z`); dates are `YYYY-MM-DD`; missing values are `null` (never `""` or `NaN`). Change the shape only via `CHANGELOG.md`.

---

## storm_forecast.json
```json
{
  "meta": {
    "generated_at": "2026-11-14T21:00:00Z",
    "model": "gradient_boosting_v1",
    "horizon_hours": 72,
    "train_period": ["2010-01-01", "2023-12-31"],
    "test_period":  ["2024-01-01", "2026-11-14"],
    "thresholds": { "watch": 0.2, "warning": 0.5 },
    "metrics_test": {
      "n_flares": 1234, "n_storms": 40,
      "hit_rate": 0.8, "false_alarms_per_month": 1.5,
      "median_lead_time_h": 6.5, "brier_skill_vs_climatology": 0.25
    },
    "feature_importance": [ { "feature": "longitude_deg", "importance": 0.31 } ],
    "data_credit": "NASA CCMC DONKI"
  },
  "events": [
    {
      "flare_id": "2024-05-13T09:36:00-FLR-001",
      "peak_time": "2024-05-13T09:44:00Z",
      "flare_class": "M6.6",
      "class_flux": 6.6e-5,
      "source_location": "S22W80",
      "latitude_deg": -22,
      "longitude_deg": 80,
      "has_linked_cme": true,
      "cme_speed_kms": 1800,
      "p_storm": 0.74,
      "alert_level": "warning",
      "actual_storm": true,
      "storm_onset_time": "2024-05-13T12:44:00Z",
      "lead_time_h": 3.0,
      "split": "test"
    }
  ]
}
```
| field | meaning |
|---|---|
| `p_storm` | model probability of a solar radiation storm (SEP event) within `horizon_hours` after `peak_time` |
| `alert_level` | `"none"` / `"watch"` / `"warning"`, derived from `meta.thresholds` |
| `actual_storm` | ground truth: did a storm follow? (UI shows hits, misses, false alarms) |
| `storm_onset_time`, `lead_time_h` | onset of the storm and hours between `peak_time` and onset; `null` if no storm |
| `longitude_deg` | solar longitude, **west positive** (W80 → 80, E30 → -30); `null` if unknown |
| `split` | `"train"` or `"test"`. **The replay must only use `test` events** (May 2024 is in test) |

The UI should show `events` sorted by `peak_time`. The replay window is 2024-05-05 → 2024-05-20.

---

## crew_data.json
```json
{
  "meta": { "generated_at": "...", "simulated": true, "note": "Simulated crew from published ranges. Not real astronaut data." },
  "mission": { "name": "Artemis Base Camp (sim)", "environment": "moon", "start_date": "2026-09-01", "today": "2026-11-14" },
  "environments": {
    "iss":     { "label": "ISS",          "dose_mSv_day": 0.5 },
    "moon":    { "label": "Lunar surface", "dose_mSv_day": 1.4 },
    "transit": { "label": "Mars transit",  "dose_mSv_day": 1.8 },
    "mars":    { "label": "Mars surface",  "dose_mSv_day": 0.65 }
  },
  "career_limit_mSv": 600,
  "metrics": {
    "hr": { "label": "Resting heart rate", "unit": "bpm", "body_region": "heart",
             "explain": "...", "how_to_measure": "...",
             "actions": { "amber": "...", "red": "..." },
             "absolute_red": { "min": 40, "max": 110 } }
  },
  "crew": [
    {
      "id": "c1", "name": "Commander A. Silva", "role": "Commander", "age": 44,
      "baseline": { "hr": { "mean": 62, "sd": 4 } },
      "series": [
        { "date": "2026-09-01", "hr": 61, "bp_sys": 116, "bp_dia": 74, "glucose": 92,
          "temp": 36.8, "sleep_h": 6.4, "mood": 4, "exercise_min": 120,
          "bone_loss_pct": 0.0, "dose_mSv_day": 1.4, "dose_mSv_cum": 1.4 }
      ],
      "flags": [
        { "date": "2026-11-12", "metric": "bp_sys", "severity": "amber", "z": 2.3,
          "message": "Systolic BP 2.3σ above your own baseline for 4 days",
          "action": "Repeat measurement tonight; review salt/fluid intake; notify flight surgeon if above 140" }
      ],
      "status": { "heart": "amber", "brain": "green", "blood": "green", "bones": "green", "whole_body": "green", "overall": "amber" }
    }
  ]
}
```
| field | meaning |
|---|---|
| `metrics.<key>` | metadata for each indicator: label, unit, which `body_region` it lights up, explanation, how to measure, actions per severity, absolute red limits (always red regardless of baseline), `low_side_only` (true = only low values are bad, e.g. sleep) |
| `body_region` | one of `brain`, `heart`, `blood`, `bones`, `whole_body` (the 3D body's clickable regions) |
| `baseline` | each astronaut's personal mean/sd per metric, from their first 14 mission days |
| `series` | one row per day; any metric can be `null` (missed measurement) |
| `flags` | alerts from the baseline logic; severity `amber` or `red` |
| `status` | latest status per body region + overall (worst of all) |

Metric keys: `hr`, `bp_sys`, `bp_dia`, `glucose`, `temp`, `sleep_h`, `mood` (1–5 self-report), `exercise_min`, `bone_loss_pct` (estimated cumulative), `dose_mSv_day`, `dose_mSv_cum`.

**Client-side scoring for live check-ins (web).** This is the rule `ml/crew_flags.py` uses. A new check-in must implement it exactly.

For a new value `x` of metric `m` on day `t`:

- `dose_mSv_day`, `dose_mSv_cum` and `bone_loss_pct` have no personal z-score and are not averaged. Red when `x` is outside `absolute_red`. Daily dose is also amber when it is above 3× that environment's `dose_mSv_day` and still inside the hard limit. Cumulative dose is amber above half of `career_limit_mSv`. Bone loss is amber above 3%.
- Every other metric has a baseline: the mean and sample standard deviation of that astronaut's first 14 mission days. The stored `baseline[m].sd` already includes the sd floor. Do not recompute it.
- Let `w` be the mean of the non-null values of `m` on days `t`, `t−1` and `t−2`. That is the new check-in averaged with the previous 2 days. Leave a missing day out of the mean. If the new value is the only one present, `w = x`. If the new value is missing, there is no check-in.
- `z = (w − baseline[m].mean) / baseline[m].sd`.
- `sleep_h`, `mood` and `exercise_min` count on the low side only: the score is `−z`. A high value is not an alert. Heart rate, both blood pressures, glucose and temperature count on both sides: the score is `|z|`.
- Amber when the score is ≥ 2. Red when the score is ≥ 3, or when the raw check-in `x` (not the 3-day mean) is outside `absolute_red`.

The `z` stored on a flag is this 3-day-mean z.

---

## real_crew.json

Published CBC and chemistry for Inspiration4, NASA OSDR OSD-575, crew codes C001–C004. `meta.simulated` is `false`. Do not merge this file into `crew_data.json`, and do not run the live check-in rule on it. The demo crew stays the simulated file.

Times are not calendar dates. Each draw has a `timepoint` id (`L-92`, `L-44`, `L-3`, `R+1`, `R+45`, `R+82`, `R+194`), a `phase` (`pre` or `post`), and a `day`. For `L` draws, `day` is days before launch and is negative. For `R` draws, `day` is days after return and is positive. The mission sits between `L-3` and `R+1`. There is no in-flight sample.

```json
{
  "meta": {
    "generated_at": "2026-11-15T00:15:40Z",
    "schema_version": 1,
    "source": "NASA OSDR OSD-575",
    "mission": "Inspiration4",
    "simulated": false,
    "baseline_rule": "Mean of the available L timepoints for that person and analyte.",
    "far_rule": "Post-flight, inside the printed lab range, not an artefact, and |z| >= 2.",
    "artefact_rule": "At R+45 only: glucose under 50 mg/dL, or potassium over 5.5 mmol/L.",
    "exclusions": [
      { "crew": "C003", "timepoint": "L-92", "panel": "cbc", "reason": "shifted columns" }
    ],
    "counts": {
      "inside_lab_far_from_baseline": 25,
      "outside_lab_range": 8,
      "sample_handling_artefact": 4
    }
  },
  "analytes": [
    { "key": "lymphocytes", "label": "Absolute lymphocytes", "unit": "cells/µL", "panel": "cbc" }
  ],
  "flags": [
    {
      "crew": "C002", "timepoint": "R+1", "phase": "post", "analyte": "glucose",
      "kind": "inside_lab_far_from_baseline", "value": 83, "unit": "mg/dL",
      "pct_change": 13.7, "z": 2.18, "lab_min": 65, "lab_max": 99
    }
  ],
  "variation": {
    "glucose": {
      "unit": "mg/dL",
      "pooled_within_person_sd": 12.59,
      "df": 8,
      "per_crew": { "C002": { "n": 3, "mean": 73.0, "sd": 4.58, "cv_pct": 6.3 } },
      "synthetic_day_to_day_sd": {
        "stated_mg_dl": 5,
        "realized_mg_dl": [{ "crew": "c1", "sd": 5.11 }]
      }
    }
  },
  "crew": [
    {
      "id": "C001",
      "baseline": {
        "glucose": { "n": 3, "timepoints": ["L-92", "L-44", "L-3"], "mean": 77.3333, "sd": 7.3711, "unit": "mg/dL" }
      },
      "series": [
        {
          "timepoint": "R+1", "phase": "post", "day": 1,
          "glucose": {
            "value": 90, "unit": "mg/dL", "lab_min": 65, "lab_max": 99,
            "outside_lab_range": false, "pct_change": 16.4, "pct_of_baseline": 116.4,
            "z": 1.72, "far_from_baseline": false, "artefact": false, "excluded": false,
            "baseline_n": 3
          }
        }
      ]
    }
  ]
}
```

| field | meaning |
|---|---|
| `analytes[].key` | `lymphocytes`, `neutrophils`, `wbc`, `glucose`, `potassium`, `platelets`, `hemoglobin`, `calcium`. Lymphocytes and neutrophils are absolute counts, not percents. |
| `hemoglobin` unit | g/dL. The source column is named `hemoglobin_value_percent`; the numbers match g/dL. See `unit_note`. |
| `crew[].baseline` | Pre-flight mean and sample sd (n − 1) for that person. C003's CBC analytes have `n: 2` (L-92 excluded). No sd floor. |
| `series[].day` | Days before launch (negative) or days after return (positive). Not one continuous clock. |
| `value` | The lab result. `null` when `excluded` is true. |
| `lab_min`, `lab_max` | Reference interval printed on that draw. Intervals differ by person, and C003's interval changes at R+1 for some analytes. |
| `outside_lab_range` | `true` when `value < lab_min` or `value > lab_max`. A value sitting on the boundary is inside. |
| `pct_change` | `100 * (value - baseline.mean) / baseline.mean`, including on artefact rows. |
| `z` | `(value - baseline.mean) / baseline.sd`, rounded to 2 decimals. |
| `far_from_baseline` | `true` only for a post-flight value inside the lab range, not an artefact, with `\|z\| >= 2`. `null` for pre-flight draws, excluded rows, and artefacts. |
| `artefact` | `true` for R+45 glucose under 50 mg/dL, or R+45 potassium over 5.5 mmol/L. Sample handling, not biology. |
| `excluded` | `true` only for C003 L-92 CBC analytes (shifted columns). The CMP row from that draw is kept. |
| `flags[].kind` | `inside_lab_far_from_baseline`, `outside_lab_range`, or `sample_handling_artefact`. An artefact that is also outside the lab range is recorded once, as the artefact. |
| `variation` | Within-person sd from the pre-flight draws. These draws are weeks apart, so this is not a day-to-day sd. `glucose.synthetic_day_to_day_sd` copies the stated and realized sds from the synthetic crew report. The generator is not fit to this file. |

The findings note is `ml/results/real_crew.md`. The slide is `ml/results/slide_real_crew.png`.
