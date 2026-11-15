"""Storm model v1 held-out predictions (ml/run_test_and_export.py output), normalized.

Each flare becomes a `flare` event. A linked CME becomes its own `cme` event (with its speed) and a
`linked_cme` link. A proton storm becomes one `sep` event per onset time, linked from every flare that
led to it (`caused_sep`). The prediction becomes a `forecast` row for model storm_v1.
The live DONKI adapter (S2) emits exactly the same shapes, so views never care where a flare came from.
"""
from __future__ import annotations

from ..core.catalog import Catalog
from ..core.records import Batch, Event, EventLink, Forecast
from .base import read_json

INPUT = "web/public/data/storm_forecast.json"
FLARE_ATTRS = ("flare_class", "class_flux", "source_location", "latitude_deg", "longitude_deg")


class MlForecast:
    source = "ml_forecast"
    model_id = "storm_v1"

    def __init__(self, path: str = INPUT):
        self.path = path

    def load(self, cat: Catalog) -> Batch:
        doc = read_json(self.path)
        batch = Batch(self.source, "exported", note=self.path)
        seps: set[str] = set()
        for e in doc["events"]:
            fid = e["flare_id"]
            batch.events.append(Event(fid, "flare", None, e["peak_time"], self.source, {k: e[k] for k in FLARE_ATTRS}))
            if e["has_linked_cme"]:
                cid = f"{fid}:cme"
                batch.events.append(Event(cid, "cme", None, None, self.source, {"speed_kms": e["cme_speed_kms"]}))
                batch.links.append(EventLink(fid, cid, "linked_cme", self.source))
            if e["actual_storm"]:
                onset = e["storm_onset_time"]
                sid = f"sep:{onset}"
                if sid not in seps:
                    seps.add(sid)
                    batch.events.append(Event(sid, "sep", onset, None, self.source, {"threshold": "GOES >10 MeV"}))
                batch.links.append(EventLink(fid, sid, "caused_sep", self.source))
            batch.forecasts.append(Forecast(fid, self.model_id, e["p_storm"], e["alert_level"], e["split"]))
        return batch


ORDER = 20
ADAPTER = MlForecast()
