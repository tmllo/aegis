"""ISS Live! cabin telemetry on the `iss` habitat.

Today: reads the recorded snapshot (docs/research/samples/isslive_lightstreamer_eclss_snapshot.json),
quality "recorded". S3 adds the live Lightstreamer client (see server/probes/iss_cabin_probe.py) with
the same output, quality "live".
TimeStamp = day-of-year x 24 + UTC hours (docs/research/2-data-sources/01-realtime-data-apis.md 1.4).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from ..core.catalog import Catalog
from ..core.records import Batch, Observation
from .base import read_json

SNAPSHOT = "docs/research/samples/isslive_lightstreamer_eclss_snapshot.json"


def iss_time(ts: str, year: int) -> str:
    t = datetime(year, 1, 1, tzinfo=timezone.utc) + timedelta(hours=float(ts) - 24)
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


class IssLiveSnapshot:
    source = "isslive"

    def __init__(self, path: str = SNAPSHOT):
        self.path = path

    def load(self, cat: Catalog) -> Batch:
        doc = read_json(self.path)
        year = int(doc["fetchedAtUTC"][:4])
        by_item = {m["source_item"]: m for m in cat.metrics.values() if "source_item" in m}
        batch = Batch(self.source, "recorded", note=f"{self.path} fetched {doc['fetchedAtUTC']}")
        for item, v in doc["items"].items():
            m = by_item.get(item)
            if m is None:
                continue
            try:
                value = float(v["CalibratedData"])
            except (TypeError, ValueError):
                continue
            batch.observations.append(Observation("iss", m["key"], iss_time(v["TimeStamp"], year), value, m["unit"],
                                                  self.source, "recorded",
                                                  {"item": item, "status_class": v.get("StatusClass"),
                                                   "fetched_at": doc["fetchedAtUTC"]}))
        return batch
