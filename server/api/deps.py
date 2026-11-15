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

import inspect
import os
from pathlib import Path

from ..adapters import discover
from ..build import build, derive
from ..core.store import Store
from .refresh import Refresher

DEFAULT_DB = Path(__file__).resolve().parents[1] / "data" / "aegis.db"
_state: dict = {}


def db_path(db: str | None = None) -> str:
    path = db or os.environ.get("AEGIS_DB") or str(DEFAULT_DB)
    if path != ":memory:":
        Path(path).parent.mkdir(parents=True, exist_ok=True)
    return path


class LockedStore:
    """The store as routes see it: every method call holds store.lock.

    Store reads share one sqlite connection across the API's worker threads without the lock, and two
    concurrent reads can raise or return partial rows (docs/backend/REQUESTS.md, core/store.py). Until the
    store locks its own reads, this wrapper serialises them. Attributes (db, lock, cat) pass through;
    code that uses store.db directly must hold store.lock itself (AGENT-RULES section 2).
    """

    def __init__(self, store: Store):
        self._store = store

    def __getattr__(self, name):
        attr = getattr(self._store, name)
        if not inspect.ismethod(attr):           # db (a callable Connection), lock, cat pass through
            return attr
        lock = self._store.lock

        def locked(*a, **k):
            with lock:
                return attr(*a, **k)
        return locked


def init(db: str | None = None, refresh: bool | None = None) -> None:
    old = _state.get("refresher")
    if old is not None:
        old.stop()
    cat, store, files = build(db_path(db))
    _state.update(cat=cat, store=store, locked=LockedStore(store), files=files)
    r = Refresher(cat, store, discover(), lambda f: _set_files(f, store),
                  stream_poll_s=float(os.environ.get("AEGIS_STREAM_POLL_S", "60")))
    _state["refresher"] = r
    if refresh if refresh is not None else os.environ.get("AEGIS_REFRESH", "1") != "0":
        r.start()


def _set_files(files: dict, source_store: Store | None = None) -> None:
    """Swap the contract views whole. Views built from a store that init() has since replaced are dropped."""
    if source_store is None or source_store is _state.get("store"):
        _state["files"] = files


def rederive(cat_=None, store_: Store | None = None) -> dict:
    """Recompute derived rows and contract views now, from the store the caller wrote to (for a route that writes facts)."""
    store_ = store_ or _state["store"]
    files = derive(cat_ or _state["cat"], store_)
    _set_files(files, store_)
    return files


def cat():
    return _state["cat"]


def store() -> LockedStore:
    return _state["locked"]


def raw_store() -> Store:
    """The Store itself, for code that manages store.lock on its own (refresher, derive)."""
    return _state["store"]


def files() -> dict:
    return _state["files"]


def refresher() -> Refresher:
    return _state["refresher"]
