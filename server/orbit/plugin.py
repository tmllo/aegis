"""Orbit build step: store the element sets the celestrak adapter just parsed, then write the stations view.

Called by server/build.py after the adapters (after_build(cat, store)), and again on every derive (live refresh,
check-in), so it is idempotent: pending sets are written once and drained; with nothing pending it only makes
sure the tables are filled (a fresh store reads the recorded files). Never deletes anything else.
"""
from __future__ import annotations

from ..adapters.celestrak import ADAPTER
from . import repo


def after_build(cat, store) -> None:
    batch, ADAPTER.pending = ADAPTER.pending, None
    if batch is None and repo.is_empty(store):
        batch = ADAPTER.load_recorded(cat)
    if batch is not None:
        repo.write_batch(cat, store, batch)
        from ..views.orbit_stations import write             # lazy: views import build, which imports plugins
        write(cat, store)
