"""Simulated crew: the daily series written by ml/make_sample_data.py, as one observation per value.

Only the raw readings are taken. Baselines, flags and status in the file are derived data: the engine
recomputes them, and the golden test checks they come out the same.
"""
from __future__ import annotations

from ..core.catalog import Catalog
from ..core.records import Batch, Observation
from .base import read_json

INPUT = "web/public/data/crew_data.json"


class SimCrew:
    source = "sim_crew"

    def __init__(self, path: str = INPUT):
        self.path = path

    def load(self, cat: Catalog) -> Batch:
        doc = read_json(self.path)
        by_key = cat.by_contract_key("crew_daily")
        batch = Batch(self.source, "simulated", note=self.path)
        for member in doc["crew"]:
            for row in member["series"]:
                for key, value in row.items():
                    if key == "date":
                        continue
                    m = by_key[key]
                    batch.observations.append(Observation(member["id"], m["key"], row["date"], value, m["unit"],
                                                          self.source, "simulated"))
        return batch
