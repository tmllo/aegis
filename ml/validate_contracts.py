"""
Check that the JSON files the web app reads match contracts/DATA_CONTRACT.md.

    python ml/validate_contracts.py                 # checks web/public/data/*.json
    python ml/validate_contracts.py path/to/dir     # checks another folder
Exit code 1 if anything is wrong.
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGIONS = {"brain", "heart", "blood", "bones", "whole_body"}
SEV = {"green", "amber", "red"}
METRIC_KEYS = {"hr", "bp_sys", "bp_dia", "glucose", "temp", "sleep_h", "mood", "exercise_min",
               "bone_loss_pct", "dose_mSv_day", "dose_mSv_cum"}
errors, warnings = [], []


def err(msg): errors.append(msg)
def warn(msg): warnings.append(msg)


def no_nan(obj, path="$"):
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        err(f"{path}: NaN/inf (use null)")
    elif isinstance(obj, dict):
        for k, v in obj.items():
            no_nan(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj[:5000]):
            no_nan(v, f"{path}[{i}]")


def check_storm(d):
    m = d.get("meta", {})
    for k in ("generated_at", "model", "horizon_hours", "train_period", "test_period", "thresholds", "metrics_test", "data_credit"):
        if k not in m: err(f"storm.meta.{k} missing")
    if "FAKE" in str(m.get("model", "")): warn("storm: still the FAKE sample, not the real model output")
    th = m.get("thresholds", {})
    ev = d.get("events")
    if not isinstance(ev, list) or not ev: err("storm.events missing/empty"); return
    req = ("flare_id", "peak_time", "flare_class", "class_flux", "source_location", "latitude_deg", "longitude_deg",
           "has_linked_cme", "cme_speed_kms", "p_storm", "alert_level", "actual_storm", "storm_onset_time",
           "lead_time_h", "split")
    for i, e in enumerate(ev):
        miss = [k for k in req if k not in e]
        if miss: err(f"storm.events[{i}] missing {miss}"); continue
        p = e["p_storm"]
        if not isinstance(p, (int, float)) or not 0 <= p <= 1: err(f"events[{i}].p_storm out of [0,1]: {p}")
        if e["alert_level"] not in ("none", "watch", "warning"): err(f"events[{i}].alert_level bad: {e['alert_level']}")
        elif th and isinstance(p, (int, float)):
            exp = "warning" if p >= th["warning"] else "watch" if p >= th["watch"] else "none"
            if exp != e["alert_level"]: err(f"events[{i}] alert_level {e['alert_level']} != thresholds -> {exp}")
        if e["split"] not in ("train", "test"): err(f"events[{i}].split bad")
        if e["actual_storm"] and not e["storm_onset_time"]: warn(f"events[{i}] storm without onset time")
        if not str(e["peak_time"]).endswith("Z"): err(f"events[{i}].peak_time not ISO UTC 'Z': {e['peak_time']}")
    may = [e for e in ev if e.get("split") == "test" and "2024-05-05" <= str(e.get("peak_time", ""))[:10] <= "2024-05-20"]
    if not may: err("no test events in the May 2024 replay window (2024-05-05..2024-05-20)")
    if any(e.get("split") == "train" and "2024-05-05" <= str(e.get("peak_time", ""))[:10] <= "2024-05-20" for e in ev):
        err("May 2024 events marked as TRAIN: replay would not be honest")
    print(f"storm: {len(ev)} events, {sum(e.get('split') == 'test' for e in ev)} test, {len(may)} in May 2024 replay window")


def check_crew(d):
    for k in ("meta", "mission", "environments", "career_limit_mSv", "metrics", "crew"):
        if k not in d: err(f"crew.{k} missing")
    if not d.get("meta", {}).get("simulated"): warn("crew.meta.simulated is not true")
    mets = d.get("metrics", {})
    if set(mets) != METRIC_KEYS: err(f"crew.metrics keys mismatch: {set(mets) ^ METRIC_KEYS}")
    for k, v in mets.items():
        if v.get("body_region") not in REGIONS: err(f"metrics.{k}.body_region bad")
        for f in ("label", "unit", "explain", "how_to_measure", "actions", "absolute_red", "low_side_only"):
            if f not in v: err(f"metrics.{k}.{f} missing")
    env = d.get("mission", {}).get("environment")
    if env not in d.get("environments", {}): err(f"mission.environment '{env}' not in environments")
    for c in d.get("crew", []):
        cid = c.get("id", "?")
        for f in ("id", "name", "role", "baseline", "series", "flags", "status"):
            if f not in c: err(f"crew[{cid}].{f} missing")
        for m, b in c.get("baseline", {}).items():
            if m not in METRIC_KEYS: err(f"crew[{cid}].baseline.{m} unknown")
            if not b.get("sd") or b["sd"] <= 0: err(f"crew[{cid}].baseline.{m}.sd must be > 0")
        for r in c.get("series", [])[:1]:
            miss = (METRIC_KEYS | {"date"}) - set(r)
            if miss: err(f"crew[{cid}].series rows missing {miss}")
        for fl in c.get("flags", []):
            if fl.get("severity") not in ("amber", "red"): err(f"crew[{cid}] flag severity bad")
            if fl.get("metric") not in METRIC_KEYS: err(f"crew[{cid}] flag metric bad")
        st = c.get("status", {})
        if set(st) != REGIONS | {"overall"} or not set(st.values()) <= SEV: err(f"crew[{cid}].status bad: {st}")
    print(f"crew: {len(d.get('crew', []))} members, {len(d.get('crew', [{}])[0].get('series', []))} days")


def main():
    folder = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "web" / "public" / "data"
    for name, fn in (("storm_forecast.json", check_storm), ("crew_data.json", check_crew)):
        p = folder / name
        if not p.exists(): err(f"{p} not found"); continue
        d = json.loads(p.read_text(encoding="utf-8"))
        no_nan(d, name)
        fn(d)
    for w in warnings: print("WARN ", w)
    for e in errors: print("ERROR", e)
    print("OK, matches the contract" if not errors else f"{len(errors)} error(s)")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
