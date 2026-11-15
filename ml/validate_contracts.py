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


HAB_CHANNELS = {"ppco2_mmhg", "ppo2_kpa", "cabin_pressure_kpa", "temp_c", "rh_pct"}
HAB_META = ("generated_at", "model", "simulated_habitat", "note", "sample_interval_min", "baseline_period",
            "thresholds", "min_duration_steps", "validation", "data_credit")
HAB_ANOM = ("id", "channel", "fault", "start", "end", "detected_at", "limit_crossed_at", "lead_time_h", "peak_score",
            "severity", "status", "planted", "detected", "message", "action", "linked_crew_flags")
LINKS = {"ppco2_mmhg": {"sleep_h", "mood"}, "ppo2_kpa": {"hr"}, "cabin_pressure_kpa": {"hr"},
         "temp_c": {"sleep_h", "temp"}, "rh_pct": set()}  # mirror of ml/anomaly/config.py LINK_TABLE


def check_habitat(d, crew):
    """v2 contract: contracts/HABITAT_CONTRACT.md."""
    from datetime import datetime, timedelta
    def ts(s): return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ")
    m = d.get("meta", {})
    for k in HAB_META:
        if k not in m: err(f"habitat.meta.{k} missing")
    if m.get("simulated_habitat") is not True: err("habitat.meta.simulated_habitat must be true")
    if "FAKE" in str(m.get("model", "")): warn("habitat: still the FAKE sample, not the real model output")
    th = m.get("thresholds", {})
    if set(th) != {"amber", "red"}: err(f"habitat.meta.thresholds keys bad: {set(th)}")
    v = m.get("validation")
    if v is not None:
        for k in ("dataset", "tuned_on", "tested_on", "protocol", "model", "baseline_static_3sigma"):
            if k not in v: err(f"habitat.meta.validation.{k} missing")
    ch = d.get("channels", {})
    if set(ch) != HAB_CHANNELS: err(f"habitat.channels keys mismatch: {set(ch) ^ HAB_CHANNELS}")
    for k, c in ch.items():
        if c.get("body_region") not in REGIONS: err(f"habitat.channels.{k}.body_region bad")
        for f in ("label", "unit", "subsystem", "limits", "absolute_red", "explain", "health_link", "actions"):
            if f not in c: err(f"habitat.channels.{k}.{f} missing")
    ser = d.get("series", [])
    if not ser: err("habitat.series empty"); return
    prev = None
    for i, r in enumerate(ser):
        t = str(r.get("time", ""))
        if not t.endswith("Z"): err(f"habitat.series[{i}].time not ISO 'Z'"); break
        if prev and t <= prev: err(f"habitat.series[{i}].time not strictly increasing"); break
        prev = t
        if set(r) != HAB_CHANNELS | {"time", "score"}: err(f"habitat.series[{i}] keys bad"); break
        if not isinstance(r.get("score"), dict) or set(r["score"]) != HAB_CHANNELS: err(f"habitat.series[{i}].score keys bad"); break
    mis = crew.get("mission", {})
    if ser[0]["time"][:10] > mis.get("start_date", "") or ser[-1]["time"][:10] < mis.get("today", ""):
        err(f"habitat.series {ser[0]['time']}..{ser[-1]['time']} does not cover mission {mis.get('start_date')}..{mis.get('today')}")
    flags = {(c["id"], f["metric"], f["date"]) for c in crew.get("crew", []) for f in c.get("flags", [])}
    crew_ids = {c["id"] for c in crew.get("crew", [])}
    for a in d.get("anomalies", []):
        aid = a.get("id", "?")
        miss = [k for k in HAB_ANOM if k not in a]
        if miss: err(f"habitat.anomalies[{aid}] missing {miss}"); continue
        if a["channel"] not in HAB_CHANNELS: err(f"habitat.anomalies[{aid}].channel bad")
        if a["severity"] not in ("amber", "red"): err(f"habitat.anomalies[{aid}].severity bad")
        if a["status"] not in ("active", "resolved"): err(f"habitat.anomalies[{aid}].status bad")
        if (a["status"] == "active") != (a["end"] is None): err(f"habitat.anomalies[{aid}] status/end mismatch")
        if a["detected"] != (a["detected_at"] is not None): err(f"habitat.anomalies[{aid}] detected/detected_at mismatch")
        if not a["planted"] and a["fault"] is not None: err(f"habitat.anomalies[{aid}] false alarm with a fault name")
        if a["detected_at"] and a["limit_crossed_at"]:
            exp = (ts(a["limit_crossed_at"]) - ts(a["detected_at"])).total_seconds() / 3600
            if a["lead_time_h"] is None or abs(a["lead_time_h"] - exp) > 1e-6: err(f"habitat.anomalies[{aid}].lead_time_h {a['lead_time_h']} != {exp}")
        elif a["lead_time_h"] is not None: err(f"habitat.anomalies[{aid}].lead_time_h should be null")
        hi = (ts((a["end"] or mis.get("today", "") + "T00:00:00Z")[:10] + "T00:00:00Z") + timedelta(days=3)).strftime("%Y-%m-%d")
        for lf in a["linked_crew_flags"]:
            if lf.get("crew_id") not in crew_ids: err(f"habitat.anomalies[{aid}] links unknown crew {lf.get('crew_id')}"); continue
            if lf.get("metric") not in LINKS.get(a["channel"], set()): err(f"habitat.anomalies[{aid}] links {lf.get('metric')} not in the link table")
            for dd in (lf.get("from"), lf.get("to")):
                if (lf["crew_id"], lf["metric"], dd) not in flags: err(f"habitat.anomalies[{aid}] link date {dd} is not a real {lf['crew_id']} {lf['metric']} flag")
                elif not a["start"][:10] <= dd <= hi: err(f"habitat.anomalies[{aid}] link date {dd} outside the anomaly window")
    st = d.get("status", {})
    if st.get("overall") not in SEV or set(st.get("by_channel", {})) != HAB_CHANNELS or not set(st["by_channel"].values()) <= SEV:
        err(f"habitat.status bad: {st}")
    an = d.get("anomalies", [])
    print(f"habitat: {len(ser)} rows, {len(an)} anomalies ({sum(a.get('planted', False) for a in an)} planted, "
          f"{sum(not a.get('planted', True) for a in an)} false alarms), status {st.get('overall')}")


def main():
    folder = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "web" / "public" / "data"
    loaded = {}
    for name, fn in (("storm_forecast.json", check_storm), ("crew_data.json", check_crew)):
        p = folder / name
        if not p.exists(): err(f"{p} not found"); continue
        d = json.loads(p.read_text(encoding="utf-8"))
        no_nan(d, name)
        fn(d)
        loaded[name] = d
    p = folder / "habitat_telemetry.json"
    if not p.exists(): err(f"{p} not found")
    else:
        d = json.loads(p.read_text(encoding="utf-8"))
        no_nan(d, "habitat_telemetry.json")
        check_habitat(d, loaded.get("crew_data.json", {}))
    for w in warnings: print("WARN ", w)
    for e in errors: print("ERROR", e)
    print("OK, matches the contract" if not errors else f"{len(errors)} error(s)")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
