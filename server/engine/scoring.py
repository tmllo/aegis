"""The crew alert rule, once. Parameters come from the catalog (mission.yaml scoring + each metric's rule).

Same rule as contracts/DATA_CONTRACT.md (client-side section) and ml/crew_flags.py:
  baseline  = mean and sample sd of the first 14 mission days, sd raised to the metric's sd_floor
  live z    = (mean of today and the previous 2 days - baseline mean) / baseline sd
  amber at z 2, red at z 3 (low side only where the catalog says), red at once outside absolute_red
  dose, cumulative dose and bone loss use absolute rules only
The golden test (server/tests/test_golden.py) checks this reproduces every baseline, flag and status
in today's crew_data.json, and web/src/core/scoring.ts has its own golden test on the same file.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from ..core.catalog import Catalog
from ..core.records import Assessment
from ..core.store import Store


@dataclass
class CrewResult:
    baseline: dict
    flags: list[dict]
    status: dict
    assessments: list[Assessment]


def _score(z: float, low_only: bool) -> float:
    return -z if low_only else abs(z)


def _outside(value, limits) -> bool:
    return value is not None and (value < limits["min"] or value > limits["max"])


class CrewScorer:
    def __init__(self, cat: Catalog):
        self.cat = cat
        s = cat.mission["scoring"]
        self.baseline_days, self.window = s["baseline_days"], s["rolling_days"]
        self.amber_z, self.red_z, self.report_days = s["amber_z"], s["red_z"], s["report_last_days"]
        self.metrics = [m for m in cat.metrics.values() if m["kind"] == "crew_daily"]
        self.regions = cat.mission["body_regions"]

    # series: list of {"date": ..., metric_key: value}
    def baseline(self, series: list[dict]) -> dict:
        out = {}
        for m in self.metrics:
            if m["rule"]["type"] != "baseline_z":
                continue
            vals = [r[m["key"]] for r in series[: self.baseline_days] if r.get(m["key"]) is not None]
            if len(vals) < 3:
                continue
            mu = sum(vals) / len(vals)
            sd = max(m["rule"].get("sd_floor", 1e-6), math.sqrt(sum((v - mu) ** 2 for v in vals) / (len(vals) - 1)))
            out[m["key"]] = {"mean": round(mu, 2), "sd": round(sd, 2)}
        return out

    def window_mean(self, series, i, key):
        if series[i].get(key) is None:
            return None
        vals = [float(series[j][key]) for j in range(max(0, i - self.window + 1), i + 1) if series[j].get(key) is not None]
        return sum(vals) / len(vals) if vals else None

    def _z(self, series, i, key, base):
        w = self.window_mean(series, i, key)
        return None if w is None else (w - base[key]["mean"]) / base[key]["sd"]

    def _streak(self, series, i, key, base, low_only):
        end_z = self._z(series, i, key, base)
        if end_z is None or _score(end_z, low_only) < self.amber_z:
            return 0
        sign, n, j = (1 if end_z > 0 else -1), 0, i
        while j >= self.baseline_days:
            z = self._z(series, j, key, base)
            if z is None or _score(z, low_only) < self.amber_z or (1 if z > 0 else -1) != sign:
                break
            n, j = n + 1, j - 1
        return n

    def _message(self, m, z, streak, value):
        low_only = m["rule"].get("low_side_only", False)
        if z is not None and _score(z, low_only) >= self.amber_z:
            direction = "above" if z > 0 else "below"
            unit = "day" if streak == 1 else "days"
            msg = f"{m['label']} 3-day average {abs(z):.1f}σ {direction} your own baseline for {streak} {unit}"
            if _outside(value, m["absolute_red"]):
                msg += ", and outside the hard safety limit"
            return msg
        x = m["rule"].get("amber_if_above_x_habitat_rate")
        if x:
            return f"Radiation dose {value} mSv today: solar storm exposure, over {x}x the normal rate"
        return f"{m['label']} outside the hard safety limit"

    def score(self, subject: str, series: list[dict], habitat_rate: float) -> CrewResult:
        base = self.baseline(series)
        career = self.cat.mission["career_limit_mSv"]
        flags, assessments = [], []
        for i in range(max(self.baseline_days, len(series) - self.report_days), len(series)):
            for m in self.metrics:
                key, rule = m["key"], m["rule"]
                value = series[i].get(key)
                if value is None:
                    continue
                z, severity = None, None
                if key in base:
                    z = self._z(series, i, key, base)
                    sc = _score(z, rule.get("low_side_only", False))
                    severity = "red" if sc >= self.red_z else "amber" if sc >= self.amber_z else None
                if _outside(value, m["absolute_red"]):
                    severity = "red"
                if "amber_if_above_x_habitat_rate" in rule and value > rule["amber_if_above_x_habitat_rate"] * habitat_rate:
                    severity = "red" if value > m["absolute_red"]["max"] else "amber"
                if "amber_if_above_fraction_of_career_limit" in rule and value > rule["amber_if_above_fraction_of_career_limit"] * career:
                    severity = severity or "amber"
                if "amber_above" in rule and value > rule["amber_above"]:
                    severity = severity or "amber"
                if not severity:
                    continue
                streak = self._streak(series, i, key, base, rule.get("low_side_only", False)) if key in base else 0
                msg = self._message(m, z, streak, value)
                zr = round(z, 2) if z is not None else None
                flags.append({"date": series[i]["date"], "metric": key, "severity": severity, "z": zr,
                              "message": msg, "action": m["actions"][severity]})
                assessments.append(Assessment(subject, key, series[i]["date"],
                                              "baseline_z@3d" if key in base else "absolute", severity, zr, msg,
                                              m["actions"][severity]))
        return CrewResult(base, flags, self.status(flags, series[-1]["date"]), assessments)

    def status(self, flags, today) -> dict:
        order = {"green": 0, "amber": 1, "red": 2}
        regions = {r: "green" for r in self.regions}
        for f in flags:
            if f["date"] != today:
                continue
            region = self.cat.metrics[f["metric"]]["body_region"]
            if order[f["severity"]] > order[regions[region]]:
                regions[region] = f["severity"]
        regions["overall"] = max(regions.values(), key=lambda s: order[s])
        return regions


def crew_series(store: Store, cat: Catalog, subject: str) -> list[dict]:
    """Pivot one crew member's daily observations back into rows, in catalog metric order."""
    keys = [m["key"] for m in cat.metrics.values() if m["kind"] == "crew_daily"]
    rows: dict[str, dict] = {}
    for o in store.observations(subject=subject, source="sim_crew"):
        rows.setdefault(o.t, {})[o.metric] = o.value
    return [{"date": d, **{k: rows[d][k] for k in keys if k in rows[d]}} for d in sorted(rows)]


def score_all(store: Store, cat: Catalog) -> dict[str, CrewResult]:
    scorer = CrewScorer(cat)
    rate = cat.habitat_for_environment(cat.mission["environment"])["assumed_dose_mSv_day"]
    results = {s["id"]: scorer.score(s["id"], crew_series(store, cat, s["id"]), rate) for s in cat.subjects_of("crew_sim")}
    store.replace_assessments(a for r in results.values() for a in r.assessments)
    return results
