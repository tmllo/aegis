"""Real-crew lab scoring (Inspiration4), once. Same rules as ml/real_crew.py, stated in sources.yaml (osdr.rules):

  baseline  = mean and sample sd (n - 1, no floor) of that person's non-excluded pre-flight draws
  z         = (value - baseline mean) / baseline sd, rounded to 2 before the cutoff
  artefact  = at R+45 only: glucose under 50 mg/dL or potassium over 5.5 mmol/L (sample handling)
  far       = post-flight, not an artefact, inside the lab range printed on that draw, and |z| >= 2
"""
from __future__ import annotations

import math
import statistics
from dataclasses import dataclass

from ..core.catalog import Catalog
from ..core.store import Store


def artefact_reason(analyte: str, timepoint: str, value):
    if timepoint != "R+45" or value is None:
        return None
    if analyte == "glucose" and value < 50:
        return "R+45 glucose under 50 mg/dL"
    if analyte == "potassium" and value > 5.5:
        return "R+45 potassium over 5.5 mmol/L"
    return None


def outside_range(value, low, high):
    if value is None or low is None or high is None:
        return None
    return bool(value < low or value > high)


@dataclass
class LabResult:
    analytes: list[dict]          # catalog metrics, in order
    crew: list[str]               # study ids, in order
    timepoints: list[dict]
    baselines: dict               # crew -> analyte -> {n, timepoints, mean, sd}
    scored: list[dict]            # one per draw, with derived fields
    variation: dict


def score_labs(store: Store, cat: Catalog) -> LabResult:
    src = cat.sources["osdr"]
    far_z = None
    analytes = [m for m in cat.metrics.values() if m["kind"] == "lab_draw"]
    tps = src["timepoints"]
    tp_index = {t["id"]: i for i, t in enumerate(tps)}
    subjects = cat.subjects_of("crew_real")
    crew_ids = [s["study_id"] for s in subjects]
    sid_of = {s["id"]: s["study_id"] for s in subjects}

    raw = []
    for o in store.observations(source="osdr"):
        a = cat.metrics[o.metric]
        far_z = a["rule"]["far_z"]
        raw.append({"crew": sid_of[o.subject], "analyte": a["contract_key"], "timepoint": o.t, "phase": o.attrs["phase"],
                    "day": o.attrs["day"], "value": o.value, "unit": o.unit, "lab_min": o.attrs.get("lab_min"),
                    "lab_max": o.attrs.get("lab_max"), "excluded": o.attrs.get("excluded", False),
                    "exclude_reason": o.attrs.get("exclude_reason")})
    raw.sort(key=lambda r: (tp_index[r["timepoint"]],))

    baselines: dict = {c: {} for c in crew_ids}
    for c in crew_ids:
        for a in analytes:
            k = a["contract_key"]
            pts = [r for r in raw if r["crew"] == c and r["analyte"] == k and r["phase"] == "pre" and not r["excluded"]]
            vals = [p["value"] for p in pts]
            baselines[c][k] = {"n": len(pts), "timepoints": [p["timepoint"] for p in pts],
                               "mean": statistics.fmean(vals), "sd": statistics.stdev(vals), "unit": a["unit"]}

    scored = []
    for r in raw:
        b = baselines[r["crew"]][r["analyte"]]
        s = dict(r)
        if r["excluded"]:
            s.update(artefact=False, artefact_reason=None, outside_lab_range=None, pct_change=None,
                     pct_of_baseline=None, z=None, far_from_baseline=None)
        else:
            z = round((r["value"] - b["mean"]) / b["sd"], 2)
            reason = artefact_reason(r["analyte"], r["timepoint"], r["value"])
            outside = outside_range(r["value"], r["lab_min"], r["lab_max"])
            far = bool(outside is False and abs(z) >= far_z) if r["phase"] == "post" and reason is None else None
            s.update(artefact=reason is not None, artefact_reason=reason, outside_lab_range=outside,
                     pct_change=100.0 * (r["value"] - b["mean"]) / b["mean"], pct_of_baseline=100.0 * r["value"] / b["mean"],
                     z=z, far_from_baseline=far)
        scored.append(s)

    variation = {}
    for a in analytes:
        k = a["contract_key"]
        per_crew, pieces = {}, []
        for c in crew_ids:
            b = baselines[c][k]
            per_crew[c] = {"n": b["n"], "mean": b["mean"], "sd": b["sd"], "cv_pct": 100.0 * b["sd"] / b["mean"]}
            pieces.append((b["n"] - 1, b["sd"]))
        df = sum(d for d, _ in pieces)
        variation[k] = {"unit": a["unit"], "pooled_sd": math.sqrt(sum(d * sd ** 2 for d, sd in pieces) / df), "df": df,
                        "per_crew": per_crew}
    return LabResult(analytes, crew_ids, tps, baselines, scored, variation)
