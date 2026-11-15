"""isslive adapter: recorded default, live mode and its fallbacks. No network: live uses fake clients."""
from __future__ import annotations

import threading
from datetime import datetime, timezone

import pytest

from server.adapters.isslive import ENV, IssLiveSnapshot, iss_time
from server.core.catalog import Catalog


@pytest.fixture(scope="module")
def cat():
    return Catalog.load()


def cabin_items(cat):
    return {m["source_item"]: m for m in cat.metrics.values()
            if "source_item" in m and m["key"].startswith("cabin.")}


class FakeSession:
    """Delivers the given updates from another thread after connect(), like Lightstreamer does."""

    def __init__(self, updates, on_update):
        self.updates, self.on_update, self.closed = updates, on_update, False

    def connect(self):
        def run():
            for item, fields in self.updates:
                self.on_update(item, fields)
        threading.Thread(target=run, daemon=True).start()

    def close(self):
        self.closed = True


def test_default_mode_is_recorded(cat, monkeypatch):
    monkeypatch.delenv(ENV, raising=False)
    b = IssLiveSnapshot().load(cat)
    assert b.quality == "recorded"
    assert b.observations and all(o.quality == "recorded" and o.subject == "iss" for o in b.observations)
    assert "cabin.pressure" in {o.metric for o in b.observations}


def test_live_mode_returns_live_rows(cat, monkeypatch):
    monkeypatch.setenv(ENV, "live")
    items = cabin_items(cat)
    updates = [(item, {"Value": "1", "TimeStamp": "7372.5", "Status.Class": "24", "CalibratedData": f"{i}.5"})
               for i, item in enumerate(items)]
    updates.insert(0, ("NOT_AN_ITEM", {"TimeStamp": "7372.5", "CalibratedData": "9"}))
    updates.insert(1, (next(iter(items)), {"TimeStamp": "7372.5", "CalibratedData": "n/a"}))
    sessions = []

    def factory(server, adapter_set, its, fields, on_update):
        assert set(its) == set(items) and "CalibratedData" in fields
        s = FakeSession(updates, on_update)
        sessions.append(s)
        return s

    b = IssLiveSnapshot(timeout=5.0, client_factory=factory).load(cat)
    assert b.quality == "live"
    assert f"{len(items)} of {len(items)}" in b.note and "push.lightstreamer.com" in b.note
    assert {o.metric for o in b.observations} == {m["key"] for m in items.values()}
    for o in b.observations:
        m = cat.metrics[o.metric]
        assert o.unit == m["unit"] and o.quality == "live" and o.source == "isslive"
        assert o.attrs["item"] == m["source_item"] and o.attrs["status_class"] == "24" and o.attrs["received_at"]
        assert o.t == iss_time("7372.5", datetime.now(timezone.utc).year)
    assert sessions[0].closed


def test_live_mode_partial_fills_missing_from_recorded(cat):
    items = cabin_items(cat)
    first = next(iter(items))
    updates = [(first, {"TimeStamp": "7372.5", "Status.Class": "24", "CalibratedData": "1.5"})]
    b = IssLiveSnapshot(mode="live", timeout=0.2,
                        client_factory=lambda s, a, its, f, on_update: FakeSession(updates, on_update)).load(cat)
    assert b.quality == "live" and "filled from the recorded snapshot" in b.note
    live = [o for o in b.observations if o.quality == "live"]
    assert [o.metric for o in live] == [items[first]["key"]]
    recorded = {o.metric for o in b.observations if o.quality == "recorded"}
    assert recorded and items[first]["key"] not in recorded
    assert len({o.metric for o in b.observations}) == len(b.observations)


def test_live_mode_nothing_arrives_falls_back(cat):
    s = {}

    def factory(server, adapter_set, its, fields, on_update):
        s["x"] = FakeSession([], on_update)
        return s["x"]

    b = IssLiveSnapshot(timeout=0.2, mode="live", client_factory=factory).load(cat)
    assert b.quality == "recorded" and b.observations
    assert "fell back" in b.note and "no usable update" in b.note
    assert s["x"].closed


def test_live_mode_factory_raises_falls_back(cat):
    def factory(*a):
        raise ConnectionError("boom")

    b = IssLiveSnapshot(timeout=0.2, mode="live", client_factory=factory).load(cat)
    assert b.quality == "recorded" and b.observations
    assert "fell back" in b.note and "boom" in b.note
