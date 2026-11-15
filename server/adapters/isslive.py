"""ISS Live! cabin telemetry on the `iss` habitat.

Two modes, chosen at load time:
  recorded (default)  reads the snapshot SNAPSHOT, quality "recorded". Tests and the offline build use this.
  live (opt-in)       set AEGIS_ISSLIVE=live. Connects to NASA's public ISS Live! feed (Lightstreamer server
                      https://push.lightstreamer.com, adapter set ISSLIVE, MERGE subscription with snapshot),
                      subscribes to the `source_item` of every catalog metric whose key starts with "cabin.",
                      collects until every item has a value or the timeout (15 s) passes, then disconnects.
                      Quality "live". If nothing usable arrives, the library is missing or connecting fails,
                      it returns the recorded snapshot instead (quality "recorded", note says why).

    $env:AEGIS_ISSLIVE="live"; python -m server.build      # PowerShell
    AEGIS_ISSLIVE=live python -m server.build              # bash

TimeStamp = day-of-year x 24 + UTC hours (docs/research/2-data-sources/01-realtime-data-apis.md 1.4).
Working reference client: server/probes/iss_cabin_probe.py. This adapter never scores.
"""
from __future__ import annotations

import os
import threading
from datetime import datetime, timedelta, timezone
from typing import Callable

from ..core.catalog import Catalog
from ..core.records import Batch, Observation
from .base import read_json

SNAPSHOT = "docs/research/samples/isslive_lightstreamer_eclss_snapshot.json"
SERVER = "https://push.lightstreamer.com"
ADAPTER_SET = "ISSLIVE"
FIELDS = ["Value", "TimeStamp", "Status.Class", "CalibratedData"]
ENV = "AEGIS_ISSLIVE"

# on_update(item, {field: value}) is called from the client's threads.
OnUpdate = Callable[[str, dict], None]
# client_factory(server, adapter_set, items, fields, on_update) -> session with connect() and close().
ClientFactory = Callable[[str, str, list, list, OnUpdate], object]


def iss_time(ts: str, year: int) -> str:
    t = datetime(year, 1, 1, tzinfo=timezone.utc) + timedelta(hours=float(ts) - 24)
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


class _LightstreamerSession:
    """Thin wrapper over lightstreamer-client-lib (imported lazily so the offline path never needs it)."""

    def __init__(self, server: str, adapter_set: str, items: list, fields: list, on_update: OnUpdate):
        from lightstreamer.client import LightstreamerClient, Subscription, SubscriptionListener

        class _Listener(SubscriptionListener):
            def onItemUpdate(self, update) -> None:  # noqa: N802 (SDK name)
                on_update(update.getItemName(), {f: update.getValue(f) for f in fields})

        self._sub = Subscription("MERGE", list(items), list(fields))
        self._sub.setRequestedSnapshot("yes")
        self._sub.addListener(_Listener())
        self._client = LightstreamerClient(server, adapter_set)

    def connect(self) -> None:
        self._client.subscribe(self._sub)
        self._client.connect()

    def close(self) -> None:
        try:
            self._client.unsubscribe(self._sub)
        finally:
            self._client.disconnect()


def lightstreamer_factory(server, adapter_set, items, fields, on_update):
    return _LightstreamerSession(server, adapter_set, items, fields, on_update)


class IssLiveSnapshot:
    source = "isslive"

    def __init__(self, path: str = SNAPSHOT, timeout: float = 15.0, mode: str | None = None,
                 client_factory: ClientFactory | None = None, server: str = SERVER, adapter_set: str = ADAPTER_SET):
        self.path = path
        self.timeout = timeout
        self.mode = mode                      # None = read AEGIS_ISSLIVE at load time
        self.client_factory = client_factory or lightstreamer_factory
        self.server = server
        self.adapter_set = adapter_set

    def load(self, cat: Catalog) -> Batch:
        mode = (self.mode or os.environ.get(ENV, "recorded")).strip().lower()
        if mode != "live":
            return self.load_recorded(cat)
        return self.load_live(cat)

    # ---- recorded snapshot -------------------------------------------------------------------
    def load_recorded(self, cat: Catalog, why: str = "") -> Batch:
        doc = read_json(self.path)
        year = int(doc["fetchedAtUTC"][:4])
        by_item = {m["source_item"]: m for m in cat.metrics.values() if "source_item" in m}
        note = f"{self.path} fetched {doc['fetchedAtUTC']}"
        if why:
            note = f"live fell back to recorded: {why}; {note}"
        batch = Batch(self.source, "recorded", note=note)
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

    # ---- live feed ---------------------------------------------------------------------------
    def load_live(self, cat: Catalog) -> Batch:
        by_item = {m["source_item"]: m for m in cat.metrics.values()
                   if "source_item" in m and m["key"].startswith("cabin.")}
        if not by_item:
            return self.load_recorded(cat, "no cabin.* metric with a source_item in the catalog")
        year = datetime.now(timezone.utc).year
        lock = threading.Lock()
        done = threading.Event()
        rows: dict[str, Observation] = {}

        def on_update(item: str, fields: dict) -> None:
            m = by_item.get(item)
            if m is None:
                return
            try:
                value = float(fields.get("CalibratedData"))
                t = iss_time(fields.get("TimeStamp"), year)
                if t > (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ"):
                    t = iss_time(fields.get("TimeStamp"), year - 1)   # stamped last year, read just after 1 Jan
            except (TypeError, ValueError):
                return
            obs = Observation("iss", m["key"], t, value, m["unit"], self.source, "live",
                              {"item": item, "status_class": fields.get("Status.Class"),
                               "received_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")})
            with lock:
                rows[item] = obs
                if len(rows) >= len(by_item):
                    done.set()

        session = None
        try:
            session = self.client_factory(self.server, self.adapter_set, list(by_item), list(FIELDS), on_update)
            session.connect()
            done.wait(self.timeout)
        except ImportError as e:
            return self.load_recorded(cat, f"lightstreamer client not importable ({e})")
        except Exception as e:  # noqa: BLE001 (any client failure means fall back)
            return self.load_recorded(cat, f"connecting to {self.server} failed ({type(e).__name__}: {e})")
        finally:
            if session is not None:
                try:
                    session.close()
                except Exception:  # noqa: BLE001
                    pass

        with lock:
            got = [rows[i] for i in by_item if i in rows]
        if not got:
            return self.load_recorded(cat, f"no usable update from {self.server} within {self.timeout:g} s")
        live_keys = {o.metric for o in got}
        filled = [o for o in self.load_recorded(cat).observations
                  if o.metric not in live_keys and o.metric.startswith("cabin.")]
        note = f"{self.server} adapter set {self.adapter_set}: {len(got)} of {len(by_item)} items arrived"
        if filled:
            note += f"; {len(filled)} filled from the recorded snapshot (quality recorded)"
        batch = Batch(self.source, "live", note=note)
        batch.observations.extend(got + filled)
        return batch


ORDER = 40
ADAPTER = IssLiveSnapshot()
