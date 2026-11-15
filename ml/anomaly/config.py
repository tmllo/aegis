"""All paths, seeds, grids and constants for the habitat anomaly module. No magic numbers elsewhere."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ML = ROOT / "ml"
RESULTS = ML / "results"
NASA_DIR = ML / "data" / "nasa_smap_msl"            # git-ignored
CREW_JSON = ROOT / "web" / "public" / "data" / "crew_data.json"
HABITAT_JSON = ROOT / "web" / "public" / "data" / "habitat_telemetry.json"
THRESHOLDS_JSON = RESULTS / "anomaly_thresholds.json"
VALIDATION_JSON = RESULTS / "anomaly_validation.json"
ENSEMBLE_JSON = RESULTS / "anomaly_ensemble_v2.json"   # v2 frozen config + numbers (written by run_v2)

SEED = 20261115

# ---------- NASA SMAP / MSL ----------
LABELS_URL = "https://raw.githubusercontent.com/khundman/telemanom/master/labeled_anomalies.csv"
DATA_URLS = [
    "https://s3-us-west-2.amazonaws.com/telemanom/data.zip",                       # (1) original, 403 on 2026-11-15
    "kaggle:patrickfleith/nasa-anomaly-detection-dataset-smap-msl",               # (2) needs ~/.kaggle creds
    "https://raw.githubusercontent.com/imperial-qore/TranAD/main/data/SMAP_MSL",  # (3) public mirror of the same npy files
]
EXPECTED = {"SMAP": {"channels": 55, "events": 69}, "MSL": {"channels": 27, "events": 36}}
TUNE_ON, TEST_ON = "MSL", "SMAP"   # DA2

# ---------- evaluation (DA3) ----------
EARLY_MARGIN = 0
BETA = 0.5
N_BOOT = 2000

# ---------- tuning grid (DA4), searched on MSL only ----------
GRID = {
    "static":  {"model": [{}]},
    "ridge":   {"model": [{"L": L, "span": s} for L in (10, 30, 60) for s in (5, 10, 30)]},
    "hgb":     {"model": [{"L": L, "span": s} for L in (10, 30) for s in (5, 30)]},
    "iforest": {"model": [{"W": W} for W in (10, 30, 60)]},
}
THRESHOLD_GRID = [2, 3, 4, 5, 6, 8, 10, 15, 20, 30]
MIN_DURATION_GRID = [1, 3, 10]
GAP_GRID = [0, 10, 50]
STATIC_FIXED_THRESHOLD = 3.0       # the "3 sigma" baseline keeps its threshold; duration/gap are tuned
RED_PRECISION_TARGET = 0.8         # red = lowest peak-score cutoff whose MSL events are >= 80% true
DETECTOR_LABELS = {
    "static": "(a) Static 3σ on raw value",
    "static_tuned": "(a') Static, threshold tuned",
    "ridge": "(b) Ridge forecast-residual",
    "hgb": "(c) HistGradientBoosting forecast-residual",
    "iforest": "(d) IsolationForest on rolling windows",
}

# ---------- habitat simulation (layer 2, DA5) ----------
BASELINE_DAYS = 14
DROPOUT_RATE = 0.005
CHANNEL_KEYS = ["ppco2_mmhg", "ppo2_kpa", "cabin_pressure_kpa", "temp_c", "rh_pct"]
# nominal level, diurnal amplitude (peak mid-waking day), AR(1) phi, AR(1) innovation sd, decimals
NOMINAL = {
    "ppco2_mmhg":         {"level": 2.40,  "diurnal": 0.18, "phi": 0.85, "sd": 0.035, "dp": 2},
    "ppo2_kpa":           {"level": 21.10, "diurnal": 0.10, "phi": 0.85, "sd": 0.04,  "dp": 2},
    "cabin_pressure_kpa": {"level": 101.30, "diurnal": 0.05, "phi": 0.90, "sd": 0.03, "dp": 2},
    "temp_c":             {"level": 22.50, "diurnal": 0.40, "phi": 0.85, "sd": 0.06,  "dp": 2},
    "rh_pct":             {"level": 45.0,  "diurnal": 2.0,  "phi": 0.85, "sd": 0.5,   "dp": 1},
}
WAKE_HOUR, SLEEP_HOUR = 7, 23      # crew waking day (UTC); diurnal bump is a smooth hump over it

# Planted faults (defaults from ml/anomaly/CLAUDE.md, frozen before the detector was run on them)
FAULTS = [
    {"id": "F1", "channel": "temp_c", "start": "2026-09-22T13:00:00Z", "end": "2026-09-22T17:00:00Z",
     "shape": "oscillation", "amp": 1.2, "period_h": 1.5,
     "fault": "Thermal control loop oscillation (simulated)"},
    {"id": "F2", "channel": "cabin_pressure_kpa", "start": "2026-10-03T10:00:00Z", "end": "2026-10-05T18:00:00Z",
     "shape": "leak", "drop": 0.8, "repair_h": 6,
     "fault": "Slow cabin leak (simulated)"},
    {"id": "F3", "channel": "ppco2_mmhg", "start": "2026-11-08T06:00:00Z", "end": None,
     "shape": "ramp", "target": 3.9, "power": 2.0,
     "fault": "CO₂ scrubber degradation (simulated)"},
]

# v3 site calibration (fixed before seeing results): per channel and detector, on the baseline period only
SITECAL_MARGIN = 1.25        # amber = 1.25 x the smallest threshold giving zero events in the baseline
SITECAL_RED_FACTOR = 2.0     # red = 2 x amber
SITECAL_MAX_FALSE_ALARMS = 3 # more false alarms than this over the mission -> revert the export to v1

LINK_TABLE = {
    "ppco2_mmhg": ["sleep_h", "mood"],
    "ppo2_kpa": ["hr"],
    "cabin_pressure_kpa": ["hr"],
    "temp_c": ["sleep_h", "temp"],
    "rh_pct": [],
}
LINK_WINDOW_DAYS = 3

CHANNELS = {
    "ppco2_mmhg": {
        "label": "Cabin CO₂", "unit": "mmHg", "subsystem": "Life support · CO₂ removal", "body_region": "brain",
        "limits": {"min": None, "max": 3.0}, "absolute_red": {"min": None, "max": 5.3},
        "explain": "Exhaled CO₂ builds up in a closed cabin and is removed by scrubbers. In space, crews report symptoms at lower levels than on Earth.",
        "health_link": "Headaches, poor sleep, fatigue and slower thinking are reported as CO₂ rises.",
        "actions": {"amber": "Check the scrubber status; increase airflow in crew quarters.",
                    "red": "Switch to backup CO₂ removal; notify flight surgeon of any headaches."},
    },
    "ppo2_kpa": {
        "label": "Oxygen (partial pressure)", "unit": "kPa", "subsystem": "Life support · O₂ generation", "body_region": "whole_body",
        "limits": {"min": 19.5, "max": 23.1}, "absolute_red": {"min": 17.0, "max": 25.0},
        "explain": "How much oxygen is available to breathe. Too little causes hypoxia; too much raises fire risk.",
        "health_link": "Low oxygen causes fatigue, headache and poor judgement before you notice it.",
        "actions": {"amber": "Check the O₂ generator and sensors.",
                    "red": "Don emergency masks per procedure and contact ground."},
    },
    "cabin_pressure_kpa": {
        "label": "Cabin pressure", "unit": "kPa", "subsystem": "Structure · pressure shell", "body_region": "whole_body",
        "limits": {"min": 100.0, "max": 102.7}, "absolute_red": {"min": 97.0, "max": 104.0},
        "explain": "Total air pressure in the habitat. A slow drop usually means a leak.",
        "health_link": "A pressure drop reduces the oxygen you can absorb; a fast drop is an emergency.",
        "actions": {"amber": "Run the leak-check procedure.",
                    "red": "Isolate the affected module and move crew to the safe haven."},
    },
    "temp_c": {
        "label": "Cabin temperature", "unit": "°C", "subsystem": "Thermal control", "body_region": "whole_body",
        "limits": {"min": 18.3, "max": 26.7}, "absolute_red": {"min": 15.0, "max": 30.0},
        "explain": "Air temperature kept by the thermal control system.",
        "health_link": "Heat stress worsens sleep, hydration and exercise tolerance.",
        "actions": {"amber": "Check the thermal control loop.",
                    "red": "Reduce activity, hydrate, and contact ground."},
    },
    "rh_pct": {
        "label": "Relative humidity", "unit": "%", "subsystem": "Life support · humidity control", "body_region": "whole_body",
        "limits": {"min": 25, "max": 75}, "absolute_red": {"min": 15, "max": 85},
        "explain": "Moisture in the air, removed by the condensing heat exchanger.",
        "health_link": "Very dry air irritates eyes and airways; very humid air encourages microbial growth.",
        "actions": {"amber": "Check the condensing heat exchanger.",
                    "red": "Contact ground; inspect for condensation and free water."},
    },
}
