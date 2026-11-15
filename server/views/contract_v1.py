"""Contract v1: rebuilds the three JSON files the app reads today, from the catalog + store + engine.

Same shape as contracts/DATA_CONTRACT.md. The golden test checks the rebuilt files equal the current ones
(apart from generated_at), so Emile's screens never notice the backend changed.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone

from ..core.catalog import Catalog
from ..core.store import Store
from ..engine.labs import LabResult
from ..engine.scoring import CrewResult, crew_series


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------- crew_data.json
def crew_data(cat: Catalog, store: Store, results: dict[str, CrewResult]) -> dict:
    ms = cat.mission
    metrics = [m for m in cat.metrics.values() if m["kind"] == "crew_daily"]
    ck = {m["key"]: m["contract_key"] for m in metrics}
    crew = []
    for s in cat.subjects_of("crew_sim"):
        r = results[s["id"]]
        series = [{"date": row["date"], **{ck[k]: v for k, v in row.items() if k != "date"}}
                  for row in crew_series(store, cat, s["id"])]
        crew.append({
            "id": s["id"], "name": s["label"], "role": s["role"], "age": s["age"],
            "baseline": {ck[k]: v for k, v in r.baseline.items()},
            "series": series,
            "flags": [{**f, "metric": ck[f["metric"]]} for f in r.flags],
            "status": r.status,
        })
    return {
        "meta": {"generated_at": now_iso(), "simulated": True, "note": ms["crew_note"]},
        "mission": {k: ms[k] for k in ("name", "environment", "start_date", "today")},
        "environments": {h["environment"]: {"label": h["label"], "dose_mSv_day": h["assumed_dose_mSv_day"]}
                         for h in cat.subjects_of("habitat")},
        "career_limit_mSv": ms["career_limit_mSv"],
        "metrics": {m["contract_key"]: {
            "label": m["label"], "unit": m["unit"], "body_region": m["body_region"], "absolute_red": m["absolute_red"],
            "explain": m["explain"], "how_to_measure": m["how_to_measure"], "actions": m["actions"],
            "low_side_only": m["rule"].get("low_side_only", False)} for m in metrics},
        "crew": crew,
    }


# ---------------------------------------------------------------- storm_forecast.json
def _hours(a: str, b: str) -> float:
    fmt = "%Y-%m-%dT%H:%M:%SZ"
    return (datetime.strptime(b, fmt) - datetime.strptime(a, fmt)).total_seconds() / 3600


def storm_forecast(cat: Catalog, store: Store, model_id: str = "storm_v1", splits=("test",)) -> dict:
    card = cat.models[model_id]
    fc = store.forecasts(model_id)
    cme = {link.from_id: link.to_id for link in store.links("linked_cme")}
    sep = {link.from_id: link.to_id for link in store.links("caused_sep")}
    others = {e.id: e for t in ("cme", "sep") for e in store.events(t)}
    events = []
    for e in store.events("flare"):
        f = fc.get(e.id)
        if f is None or f.split not in splits:
            continue
        c = others.get(cme.get(e.id, ""))
        s = others.get(sep.get(e.id, ""))
        onset = s.t_start if s else None
        events.append({
            "flare_id": e.id, "peak_time": e.t_peak, **e.attrs,
            "has_linked_cme": c is not None, "cme_speed_kms": c.attrs.get("speed_kms") if c else None,
            "p_storm": f.p, "alert_level": f.level, "actual_storm": s is not None, "storm_onset_time": onset,
            "lead_time_h": round(_hours(e.t_peak, onset), 2) if onset else None, "split": f.split,
        })
    meta = {"generated_at": now_iso(), "model": card["name"]}
    meta.update({k: card[k] for k in ("horizon_hours", "train_period", "test_period", "thresholds", "metrics_test",
                                      "feature_importance", "data_credit")})
    return {"meta": meta, "events": events}


# ---------------------------------------------------------------- real_crew.json
def _num(v):
    if v is None:
        return None
    r = round(float(v), 4)
    return int(round(r)) if math.isfinite(r) and abs(r - round(r)) < 1e-9 else r


def _r1(v):
    return None if v is None else round(v, 1)


def real_crew(cat: Catalog, store: Store, labs: LabResult) -> dict:
    src = cat.sources["osdr"]
    study = src["study"]
    order = {a["contract_key"]: i for i, a in enumerate(labs.analytes)}
    tp_index = {t["id"]: i for i, t in enumerate(labs.timepoints)}
    unit = {a["contract_key"]: a["unit"] for a in labs.analytes}

    flags = []
    for s in labs.scored:
        if s["excluded"]:
            continue
        kind = ("sample_handling_artefact" if s["artefact"] else "inside_lab_far_from_baseline" if s["far_from_baseline"]
                else "outside_lab_range" if s["outside_lab_range"] else None)
        if kind:
            flags.append({"crew": s["crew"], "timepoint": s["timepoint"], "phase": s["phase"], "analyte": s["analyte"],
                          "kind": kind, "value": _num(s["value"]), "unit": s["unit"], "pct_change": _r1(s["pct_change"]),
                          "z": s["z"], "lab_min": _num(s["lab_min"]), "lab_max": _num(s["lab_max"])})
    flags.sort(key=lambda f: (order[f["analyte"]], f["crew"], tp_index[f["timepoint"]]))

    def payload(s):
        p = {"value": _num(s["value"]), "unit": s["unit"], "lab_min": _num(s["lab_min"]), "lab_max": _num(s["lab_max"]),
             "outside_lab_range": s["outside_lab_range"], "pct_change": _r1(s["pct_change"]),
             "pct_of_baseline": _r1(s["pct_of_baseline"]), "z": s["z"], "far_from_baseline": s["far_from_baseline"],
             "artefact": s["artefact"], "excluded": s["excluded"]}
        if s["artefact"]:
            p["artefact_reason"] = s["artefact_reason"]
        if s["excluded"]:
            p["exclude_reason"] = s["exclude_reason"]
        else:
            p["baseline_n"] = labs.baselines[s["crew"]][s["analyte"]]["n"]
        return p

    by = {(s["crew"], s["analyte"], s["timepoint"]): s for s in labs.scored}
    crew = []
    for c in labs.crew:
        baseline = {k: {"n": b["n"], "timepoints": b["timepoints"], "mean": round(b["mean"], 4), "sd": round(b["sd"], 4),
                        "unit": b["unit"]} for k, b in labs.baselines[c].items()}
        series = [{"timepoint": t["id"], "phase": t["phase"], "day": t["day"],
                   **{a["contract_key"]: payload(by[(c, a["contract_key"], t["id"])]) for a in labs.analytes}}
                  for t in labs.timepoints]
        crew.append({"id": c, "baseline": baseline, "series": series})

    variation = {}
    for k, v in labs.variation.items():
        variation[k] = {"unit": v["unit"], "pooled_within_person_sd": round(v["pooled_sd"], 4), "df": v["df"],
                        "per_crew": {c: {"n": r["n"], "mean": round(r["mean"], 4), "sd": round(r["sd"], 4),
                                         "cv_pct": round(r["cv_pct"], 1)} for c, r in v["per_crew"].items()}}
    if "glucose" in variation and src.get("synthetic_comparison"):
        variation["glucose"]["synthetic_day_to_day_sd"] = src["synthetic_comparison"]

    exclusions = []
    for o in store.observations(source="osdr"):
        if o.attrs.get("excluded"):
            key = (cat.subjects[o.subject]["study_id"], o.t, o.attrs["panel"])
            if key not in [(e["crew"], e["timepoint"], e["panel"]) for e in exclusions]:
                exclusions.append({"crew": key[0], "timepoint": key[1], "panel": key[2], "reason": o.attrs["exclude_reason"],
                                   "evidence": o.attrs.get("evidence")})
    kinds = ("inside_lab_far_from_baseline", "outside_lab_range", "sample_handling_artefact")
    return {
        "meta": {"generated_at": now_iso(), "schema_version": study["schema_version"], "source": study["source_label"],
                 "mission": study["mission"], "simulated": False, "note": study["note"],
                 "timepoints": labs.timepoints, "day_meaning": study["day_meaning"], "baseline_rule": study["baseline_rule"],
                 "far_rule": study["far_rule"], "artefact_rule": study["artefact_rule"], "exclusions": exclusions,
                 "counts": {k: sum(f["kind"] == k for f in flags) for k in kinds}},
        "analytes": [{"key": a["contract_key"], "label": a["label"], "unit": unit[a["contract_key"]], "panel": a["panel"],
                      "column": a["source_column"], **({"unit_note": a["unit_note"]} if "unit_note" in a else {})}
                     for a in labs.analytes],
        "flags": flags,
        "variation": variation,
        "crew": crew,
    }
