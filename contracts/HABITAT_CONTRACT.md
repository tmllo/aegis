# Data contract v2 addition: `habitat_telemetry.json`

**Additive.** `storm_forecast.json` and `crew_data.json` are unchanged. This is a third file, served from `web/public/data/habitat_telemetry.json`, produced by `ml/anomaly/export_habitat.py`. Until the real file exists, the web app loads `contracts/habitat_telemetry.sample.json` (fake numbers, exact shape, `meta.model = "FAKE_SAMPLE_DO_NOT_PRESENT"`).

Same rules as the v1 contract: ISO 8601 UTC with `Z`, `null` for missing values (never `NaN` or `""`), shape changes only via `CHANGELOG.md`.

## Why this file exists
NASA lists "hostile closed environment" as one of the 5 human spaceflight hazards. The habitat's life-support telemetry is part of crew health: cabin CO₂ alone is linked to headaches and poor sleep on the ISS. This module watches the habitat with an anomaly detector that **flags drift before a hard limit is breached**, then links the anomaly to crew health flags it may explain.

## Shape
```json
{
  "meta": {
    "generated_at": "2026-11-15T21:30:00Z",
    "model": "forecast_residual_v1",
    "simulated_habitat": true,
    "note": "Habitat telemetry is simulated with planted faults. The detector is validated on real NASA SMAP/MSL spacecraft telemetry.",
    "sample_interval_min": 60,
    "baseline_period": ["2026-09-01", "2026-09-14"],
    "thresholds": { "amber": 4.0, "red": 7.0 },
    "min_duration_steps": 3,
    "validation": {
      "dataset": "NASA SMAP + MSL labeled telemetry anomalies (Hundman et al., KDD 2018)",
      "tuned_on": "MSL (27 channels, 36 labeled anomalies)",
      "tested_on": "SMAP (55 channels, 69 labeled anomalies)",
      "protocol": "event-wise, no point-adjust",
      "model": { "precision": 0.0, "recall": 0.0, "f0_5": 0.0, "false_alarms_per_10k_steps": 0.0 },
      "baseline_static_3sigma": { "precision": 0.0, "recall": 0.0, "f0_5": 0.0, "false_alarms_per_10k_steps": 0.0 }
    },
    "data_credit": "Detector validation: NASA JPL SMAP & MSL telemetry anomaly dataset"
  },
  "channels": {
    "ppco2_mmhg": {
      "label": "Cabin CO₂", "unit": "mmHg", "subsystem": "Life support · CO₂ removal",
      "body_region": "brain",
      "limits": { "min": null, "max": 3.0 },
      "absolute_red": { "min": null, "max": 5.3 },
      "explain": "...", "health_link": "...",
      "actions": { "amber": "...", "red": "..." }
    }
  },
  "series": [
    { "time": "2026-09-01T00:00:00Z", "ppco2_mmhg": 2.41, "ppo2_kpa": 21.12, "cabin_pressure_kpa": 101.31,
      "temp_c": 22.38, "rh_pct": 45.2,
      "score": { "ppco2_mmhg": 0.4, "ppo2_kpa": 0.7, "cabin_pressure_kpa": 0.3, "temp_c": 0.9, "rh_pct": 0.5 } }
  ],
  "anomalies": [
    {
      "id": "HAB-004", "channel": "ppco2_mmhg",
      "fault": "CO₂ scrubber degradation (simulated)",
      "start": "2026-11-08T06:00:00Z", "end": null,
      "detected_at": "2026-11-09T23:00:00Z",
      "limit_crossed_at": "2026-11-11T10:00:00Z",
      "lead_time_h": 35.0,
      "peak_score": 31.9, "severity": "red", "status": "active",
      "planted": true, "detected": true,
      "message": "Cabin CO₂ drifting up since 8 Nov, flagged 35 h before it crossed the 3 mmHg limit",
      "action": "Switch to the backup CO₂ removal bed, increase ventilation in crew quarters, log headaches or poor sleep.",
      "linked_crew_flags": [
        { "crew_id": "c2", "metric": "sleep_h", "from": "2026-11-10", "to": "2026-11-14",
          "note": "Sleep dropped 2 days after cabin CO₂ began rising. Simulated link." }
      ]
    }
  ],
  "status": { "overall": "red", "by_channel": { "ppco2_mmhg": "red", "ppo2_kpa": "green", "cabin_pressure_kpa": "green", "temp_c": "green", "rh_pct": "green" } }
}
```

## Fields
| field | meaning |
|---|---|
| channel keys | exactly `ppco2_mmhg`, `ppo2_kpa`, `cabin_pressure_kpa`, `temp_c`, `rh_pct` |
| `channels.<k>.body_region` | one of the 5 crew body regions; what the anomaly lights up on the body map |
| `limits` | operational limit; crossing it is amber by rule, regardless of the model |
| `absolute_red` | crossing it is red by rule, regardless of the model |
| `series` | one row per `sample_interval_min`, covering `mission.start_date` → `mission.today` from `crew_data.json`. Values may be `null` (sensor dropout) |
| `series[].score` | anomaly score per channel: robust z of the smoothed forecast error (≥ `thresholds.amber` sustained for `min_duration_steps` = anomaly) |
| `anomalies` | every detected event **and** every planted fault, including misses (`detected: false`, `detected_at: null`) and false alarms (`planted: false`, `fault: null`). The UI shows all three honestly |
| `detected_at` | first timestamp of the sustained run above `thresholds.amber` |
| `limit_crossed_at` | first time the channel crossed `limits` inside the event window; `null` if it never did |
| `lead_time_h` | `limit_crossed_at − detected_at` in hours. Positive = early warning. `null` if either is null |
| `severity` | `red` if `peak_score ≥ thresholds.red` or `absolute_red` was crossed, else `amber` |
| `status` | `active` if `end` is null (still ongoing at `mission.today`), else `resolved` |
| `linked_crew_flags` | crew flags (from `crew_data.json`) this anomaly may explain: the flag's metric is listed for this channel in the link table in `ml/anomaly/CLAUDE.md`, and the flag date falls between the anomaly `start` and (`end`, or `mission.today` if active) + 3 days. `from`/`to` are the first and last matching flag dates. Always worded as "possible", never as a diagnosis |
| `status.by_channel` | status at the last timestamp: worst of the active anomaly severity and the limit rules |

## Web usage (Emile)
- Habitat tab: one row per channel (sparkline, limit line, score strip, anomaly markers), anomaly cards, the validation card from `meta.validation`.
- Crew body panel: if an anomaly has a `linked_crew_flags` entry for this astronaut and metric, show a "Possible environmental cause" chip that links to the habitat anomaly.
- Mission header: a habitat status pill from `status.overall`.
- On screen: "Habitat telemetry simulated. Detector validated on NASA SMAP/MSL telemetry."
