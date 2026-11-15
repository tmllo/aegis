"""Shared state for every router: one catalog, one store, the contract files. Built once at startup,
then kept fresh by the refresher (server/api/refresh.py) and by check-ins (rederive()).

The store lives on disk (default server/data/aegis.db, gitignored), so check-ins, notes and tasks survive a
restart. Startup re-runs every adapter into that same file (INSERT OR REPLACE on the same keys), and the
refresher only adds runs to it: neither ever recreates the store or wipes a fact table.

Environment:
  AEGIS_DB             SQLite path for the store (default server/data/aegis.db; ":memory:" for a throwaway).
  AEGIS_REFRESH=0      do not start the background refresh of live adapters.
  AEGIS_STREAM_POLL_S  seconds between re-runs of "stream" sources (default 60).
"""
from __future__ import annotations

import os
from pathlib import Path

from ..adapters import discover
from ..build import build, derive
from .refresh import Refresher

DEFAULT_DB = Path(__file__).resolve().parents[1] / "data" / "aegis.db"
_state: dict = {}


def db_path(db: str | None = None) -> str:
    path = db or os.environ.get("AEGIS_DB") or str(DEFAULT_DB)
    if path != ":memory:":
        Path(path).parent.mkdir(parents=True, exist_ok=True)
    return path


def init(db: str | None = None, refresh: bool | None = None) -> None:
    old = _state.get("refresher")
    if old is not None:
        old.stop()
    cat, store, files = build(db_path(db))
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
