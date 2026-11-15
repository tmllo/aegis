"""NASA OSDR Inspiration4 blood panels: one observation per crew x analyte x timepoint.

Preferred input: the original CSVs in data/real/ (cmp.csv = OSD-575 chemistry, cbc.csv = OSD-569 blood count).
Fallback while those are not in the repo: the raw values and lab ranges inside web/public/data/real_crew.json.
Only facts are stored: value, unit, the lab range printed on that draw, and exclusions with their evidence.
z, percent change, artefacts and far-from-baseline are derived by server/engine/labs.py.
"""
from __future__ import annotations

import csv

from ..core.catalog import Catalog
from ..core.records import Batch, Observation
from .base import ROOT, read_json

CSV = {"cbc": ROOT / "data" / "real" / "cbc.csv", "cmp": ROOT / "data" / "real" / "cmp.csv"}
FALLBACK = "web/public/data/real_crew.json"


def _num(raw):
    text = (raw or "").strip()
    return None if text in ("", "NA", "N/A", "NaN", "nan") else float(text)


def _shifted_cbc(row) -> bool:
    """Column shift: a percent, an MPV or a platelet count landed in the wrong field (same test as ml/real_crew.py)."""
    neut, pct = _num(row["absolute_neutrophils_value_cells_per_microliter"]), _num(row["neutrophils_value_percent"])
    mpv, plt = _num(row["mpv_value_femtoliter"]), _num(row["platelet_count_value_thousand_per_microliter"])
    return bool((neut is not None and neut < 100 and pct is not None and pct > 50)
                or (mpv is not None and mpv > 30) or (plt is not None and plt < 50))


class Osdr:
    source = "osdr"

    def load(self, cat: Catalog) -> Batch:
        if all(p.is_file() for p in CSV.values()):
            return self._from_csv(cat)
        return self._from_export(cat)

    def _subject(self, cat: Catalog) -> dict[str, str]:
        return {s["study_id"]: s["id"] for s in cat.subjects_of("crew_real")}

    def _from_export(self, cat: Catalog) -> Batch:
        doc = read_json(FALLBACK)
        sub = self._subject(cat)
        by_key = cat.by_contract_key("lab_draw")
        evidence = {(e["crew"], e["timepoint"], e["panel"]): e for e in doc["meta"]["exclusions"]}
        batch = Batch(self.source, "exported", note=f"{FALLBACK} (original CSVs not in data/real/)")
        for member in doc["crew"]:
            for entry in member["series"]:
                for key, m in by_key.items():
                    d = entry[key]
                    attrs = {"phase": entry["phase"], "day": entry["day"], "lab_min": d["lab_min"], "lab_max": d["lab_max"],
                             "excluded": d["excluded"], "panel": m["panel"]}
                    if d["excluded"]:
                        ex = evidence.get((member["id"], entry["timepoint"], m["panel"]), {})
                        attrs.update(exclude_reason=d.get("exclude_reason"), evidence=ex.get("evidence"))
                    batch.observations.append(Observation(sub[member["id"]], m["key"], entry["timepoint"], d["value"],
                                                          m["unit"], self.source, "recorded", attrs))
        return batch

    def _from_csv(self, cat: Catalog) -> Batch:
        sub = self._subject(cat)
        tps = {t["id"]: t for t in cat.sources["osdr"]["timepoints"]}
        batch = Batch(self.source, "recorded", note="data/real/cbc.csv + cmp.csv")
        for panel, path in CSV.items():
            with path.open(encoding="utf-8-sig", newline="") as f:
                rows = list(csv.DictReader(f))
            for row in rows:
                parts = row["Sample Name"].split("_")
                crew, tp = parts[0], parts[2]
                shifted = panel == "cbc" and _shifted_cbc(row)
                for m in cat.metrics.values():
                    if m["kind"] != "lab_draw" or m["panel"] != panel:
                        continue
                    col = m["source_column"]
                    attrs = {"phase": tps[tp]["phase"], "day": tps[tp]["day"], "panel": panel, "excluded": shifted,
                             "lab_min": None if shifted else _num(row[col.replace("_value_", "_range_min_")]),
                             "lab_max": None if shifted else _num(row[col.replace("_value_", "_range_max_")])}
                    if shifted:
                        attrs.update(exclude_reason="shifted columns", evidence={
                            "absolute_neutrophils_cells_per_uL": _num(row["absolute_neutrophils_value_cells_per_microliter"]),
                            "neutrophils_percent": _num(row["neutrophils_value_percent"]),
                            "mpv_fL": _num(row["mpv_value_femtoliter"]),
                            "platelets_thousand_per_uL": _num(row["platelet_count_value_thousand_per_microliter"]),
                            "rdw_percent": _num(row["rdw_value_percent"])})
                    batch.observations.append(Observation(sub[crew], m["key"], tp, None if shifted else _num(row[col]),
                                                          m["unit"], self.source, "recorded", attrs))
        return batch
