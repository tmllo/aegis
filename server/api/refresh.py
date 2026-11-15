"""Keeps the API's data fresh: re-runs each live adapter on its catalog cadence, then re-derives.

    cadence (catalog/sources*.yaml)   re-run every
    "5 min", "15 min", "30 s", "2 h"  that long
    "hourly" / "daily"                1 h / 24 h
    "stream"                          AEGIS_STREAM_POLL_S seconds (default 60)
    "on build", "static", "on input"  never (loaded once by build, or written by a route)

One daemon thread. For each due adapter: load() runs with no lock held (a slow feed blocks nobody),
store.write() takes store.lock, then build.derive() rebuilds assessments, plugin rows and the contract
views under the same lock, and the new views are swapped in whole before the lock is released. Requests
read through deps.LockedStore, so they wait at most one write or derive (~0.1 s), never a fetch. A
recorded or cached batch identical to the last one is skipped (no run row, no derive). An adapter that raises keeps its previous rows and is retried on its next cadence; adapters
are expected to fall back to their recorded copy themselves (AGENT-RULES section 3).
"""
from __future__ import annotations

import logging
import re
import threading
import time
from typing import Callable

from ..build import derive
from ..core.catalog import Catalog
from ..core.store import Store

log = logging.getLogger("aegis.refresh")
_UNITS = {"s": 1, "sec": 1, "min": 60, "h": 3600, "hour": 3600, "hours": 3600, "d": 86400, "day": 86400, "days": 86400}
_NAMED = {"hourly": 3600, "daily": 86400}


def cadence_seconds(cadence: str | None, stream_poll_s: float = 60) -> float | None:
    """Seconds between runs for a catalog cadence string, or None if the source is not polled."""
    c = (cadence or "").strip().lower()
    if c == "stream":
        return stream_poll_s
    if c in _NAMED:
        return _NAMED[c]
    m = re.fullmatch(r"(?:every\s+)?(\d+(?:\.\d+)?)\s*([a-z]+)", c)
    if m and m.group(2) in _UNITS and float(m.group(1)) > 0:
        return float(m.group(1)) * _UNITS[m.group(2)]
    return None


class Refresher:
    def __init__(self, cat: Catalog, store: Store, adapters: list, on_files: Callable[[dict], None],
                 stream_poll_s: float = 60, clock: Callable[[], float] = time.monotonic):
        self.cat, self.store, self.on_files, self.clock = cat, store, on_files, clock
        now = clock()
        self.jobs = []
        for a in adapters:
            every = cadence_seconds(cat.sources.get(a.source, {}).get("cadence"), stream_poll_s)
            if every is not None:              # build() already ran it once: first re-run one cadence from now
                self.jobs.append({"adapter": a, "source": a.source, "every_s": every, "due": now + every,
                                  "runs": 0, "last_run": None, "last_rows": None, "last_rejected": None,
                                  "last_error": None, "unchanged": 0, "sig": None})
        self._tick = threading.Lock()          # one refresh pass at a time (thread or POST /api/refresh)
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    # ---- one pass -------------------------------------------------------------
    def tick(self, force: bool = False, only: str | None = None) -> list[str]:
        """Run every due job (force: every job now; only: just that source). Returns the sources that wrote."""
        with self._tick:
            now, wrote = self.clock(), []
            for job in self.jobs:
                if only is not None and job["source"] != only:
                    continue
                if not force and now < job["due"]:
                    continue
                job["due"] = now + job["every_s"]
                if self._stop.is_set():                        # replaced by a new init(): write nothing more
                    return wrote
                try:
                    batch = job["adapter"].load(self.cat)      # network or file read, no lock held
                    sig = signature(batch)
                    if batch.quality in ("recorded", "cached") and sig == job["sig"]:
                        job.update(unchanged=job["unchanged"] + 1, last_error=None)   # same fallback file: no new run
                        continue
                    run_id = self.store.write(batch)           # takes store.lock
                    run = run_info(self.store, run_id)
                    job.update(runs=job["runs"] + 1, last_run=run_id, last_error=None, sig=sig,
                               last_rows=run["n_rows"], last_rejected=run["rejected"])
                    wrote.append(job["source"])
                except Exception as e:                         # keep old rows, retry next cadence
                    job["last_error"] = f"{type(e).__name__}: {e}"
                    log.warning("refresh %s failed: %s", job["source"], job["last_error"])
            if wrote and not self._stop.is_set():
                with self.store.lock:                          # publish before a check-in can derive newer views
                    self.on_files(derive(self.cat, self.store))
            return wrote

    # ---- background thread ------------------------------------------------------
    def start(self) -> None:
        if not self.jobs or self._thread is not None:
            return
        self._thread = threading.Thread(target=self._loop, name="aegis-refresh", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=5)
            self._thread = None

    def _loop(self) -> None:
        while not self._stop.is_set():
            wait = max(0.5, min(j["due"] for j in self.jobs) - self.clock())
            if self._stop.wait(wait):
                return
            try:
                self.tick()
            except Exception:                                  # derive failed: log, keep serving old views
                log.exception("refresh pass failed")

    @property
    def running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def status(self) -> list[dict]:
        now = self.clock()
        return [{"source": j["source"], "every_s": j["every_s"], "next_in_s": round(max(0.0, j["due"] - now), 1),
                 "runs": j["runs"], "unchanged": j["unchanged"], "last_run": j["last_run"], "last_rows": j["last_rows"],
                 "last_rejected": j["last_rejected"], "last_error": j["last_error"]} for j in self.jobs]


def signature(batch) -> int:
    """Identity of a batch's facts, to skip re-storing an unchanged recorded fallback every cadence."""
    return hash(repr((
        [(o.subject, o.metric, o.t, o.value, o.unit, o.quality) for o in batch.observations],
        [(e.id, e.type, e.t_start, e.t_peak, sorted(e.attrs.items(), key=str)) for e in batch.events],
        [(k.from_id, k.to_id, k.relation) for k in batch.links],
        [(f.event_id, f.model_id, f.p, f.level, f.split) for f in batch.forecasts])))


def run_info(store, run_id: int) -> dict:
    """One run row by id (the store has no such read yet; see docs/backend/REQUESTS.md)."""
    with store.lock:
        return dict(store.db.execute("SELECT * FROM run WHERE id=?", (run_id,)).fetchone())
