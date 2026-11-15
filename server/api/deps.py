"""Shared state for every router: one catalog, one store, the contract files. Built once at startup."""
from __future__ import annotations

from ..build import build

_state: dict = {}


def init(db: str = ":memory:") -> None:
    cat, store, files = build(db)
    _state.update(cat=cat, store=store, files=files)


def cat():
    return _state["cat"]


def store():
    return _state["store"]


def files() -> dict:
    return _state["files"]
