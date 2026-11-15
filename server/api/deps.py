"""Shared state for every router: one catalog, one store, the contract files. Built once at startup,
then kept fresh by the refresher (server/api/refresh.py) and by check-ins (rederive()).

Environment:
  AEGIS_DB             SQLite path for the store (default: in memory). On disk, check-ins survive restarts.
  AEGIS_REFRESH=0      do not start the background refresh of live adapters.
  AEGIS_STREAM_POLL_S  seconds between re-runs of "stream" sources (default 60).
"""
from __future__ import annotations

import os

from ..adapters import discover
from ..build import build, derive
from .refresh import Refresher

_state: dict = {}


def init(db: str | None = None, refresh: bool | None = None) -> None:
    old = _state.get("refresher")
    if old is not None:
        old.stop()
    cat, store, files = build(db or os.environ.get("AEGIS_DB") or ":memory:")
    _state.update(cat=cat, store=store, files=files)
    r = Refresher(cat, store, discover(), _set_files, stream_poll_s=float(os.environ.get("AEGIS_STREAM_POLL_S", "60")))
    _state["refresher"] = r
    if refresh if refresh is not None else os.environ.get("AEGIS_REFRESH", "1") != "0":
        r.start()


def _set_files(files: dict) -> None:
    _state["files"] = files                    # swapped whole: a request sees the old set or the new one


def rederive() -> dict:
    """Recompute derived rows and contract views now (after a check-in). Returns the new files."""
    files = derive(cat(), store())
    _set_files(files)
    return files


def cat():
    return _state["cat"]


def store():
    return _state["store"]


def files() -> dict:
    return _state["files"]


def refresher() -> Refresher:
    return _state["refresher"]
