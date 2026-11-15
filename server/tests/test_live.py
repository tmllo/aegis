"""Live lane: background refresh on catalog cadence, and check-ins through POST /api/observations."""
import threading

import pytest
from fastapi.testclient import TestClient

from server.api import deps
from server.api.app import create_app
from server.api.refresh import Refresher, cadence_seconds
from server.core.records import Batch, Observation


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("AEGIS_REFRESH", "0")   # tests drive tick() themselves
    monkeypatch.delenv("AEGIS_DB", raising=False)
    return TestClient(create_app())


class Clock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


class FakeIss:
    """Stands in for a live adapter on the 'isslive' source (cadence 'stream')."""
    source = "isslive"

    def __init__(self, gate: threading.Event | None = None, fail: bool = False):
        self.n, self.gate, self.fail = 0, gate, fail

    def load(self, cat):
        if self.gate is not None:
            self.gate.wait(5)
        if self.fail:
            raise ConnectionError("feed down")
        self.n += 1
        return Batch("isslive", "live", [Observation("iss", "cabin.ppo2", f"2026-11-15T12:00:{self.n:02d}Z", 21.0 + self.n,
                                                     cat.metrics["cabin.ppo2"]["unit"], "isslive", "live")])


def _unit(key):
    return deps.cat().metrics[key]["unit"]


# ---- cadence -----------------------------------------------------------------
@pytest.mark.parametrize("text,seconds", [("5 min", 300), ("15 min", 900), ("30 s", 30), ("2 h", 7200),
                                          ("daily", 86400), ("hourly", 3600), ("stream", 42), ("on build", None),
                                          ("static", None), ("on input", None), (None, None), ("0 min", None)])
def test_cadence_seconds(text, seconds):
    assert cadence_seconds(text, stream_poll_s=42) == seconds


def test_only_polled_sources_get_jobs(client):
    jobs = {j["source"]: j["every_s"] for j in deps.refresher().status()}
    assert "isslive" in jobs                                    # cadence "stream"
    assert not {"sim_crew", "ml_forecast", "osdr", "checkin"} & set(jobs)


# ---- refresh -------------------------------------------------------------------
def test_refresh_runs_on_cadence_and_updates_views(client):
    clock, swapped = Clock(), []
    r = Refresher(deps.cat(), deps.store(), [FakeIss()], lambda f: (swapped.append(f), deps._set_files(f)),
                  stream_poll_s=60, clock=clock)
    assert r.tick() == []                                       # not due yet: build just loaded it
    clock.t += 61
    assert r.tick() == ["isslive"] and len(swapped) == 1        # due: one run, one re-derive
    assert r.tick() == []                                       # next one is 60 s away again
    rows = client.get("/api/observations", params={"subject": "iss", "metric": "cabin.ppo2"}).json()
    assert {"metric": "cabin.ppo2", "t": "2026-11-15T12:00:01Z", "value": 22.0, "quality": "live"} in rows
    assert client.get("/data/crew_data.json").json() == swapped[0]["crew_data.json"]
    assert client.get("/api/health").json()["sources"]["isslive"]["quality"] == "live"


def test_refresh_failure_keeps_old_rows(client):
    clock = Clock()
    before = client.get("/api/observations", params={"subject": "iss", "kind": "cabin"}).json()
    r = Refresher(deps.cat(), deps.store(), [FakeIss(fail=True)], deps._set_files, clock=clock)
    clock.t += 61
    assert r.tick() == []
    assert r.status()[0]["last_error"] == "ConnectionError: feed down"
    assert client.get("/api/observations", params={"subject": "iss", "kind": "cabin"}).json() == before


def test_slow_adapter_does_not_block_requests(client):
    gate, clock = threading.Event(), Clock()
    r = Refresher(deps.cat(), deps.store(), [FakeIss(gate=gate)], deps._set_files, clock=clock)
    clock.t += 61
    worker = threading.Thread(target=r.tick)
    worker.start()
    try:
        assert client.get("/api/observations", params={"subject": "iss", "kind": "cabin"}).status_code == 200
        res = client.post("/api/observations", json={"subject": "c1", "metric": "self.mood", "t": "2026-11-15", "value": 4})
        assert res.status_code == 200                           # writes too: load() holds no lock
    finally:
        gate.set()
        worker.join(5)
    assert not worker.is_alive() and r.status()[0]["runs"] == 1


def test_background_thread_ticks(client):
    done = threading.Event()
    r = Refresher(deps.cat(), deps.store(), [FakeIss()], lambda f: done.set(), stream_poll_s=0.01)
    r.start()
    try:
        assert done.wait(5)
    finally:
        r.stop()


def test_post_refresh_endpoint(client):
    res = client.post("/api/refresh", params={"source": "isslive"})
    assert res.status_code == 200 and res.json()["refreshed"] == ["isslive"]
    assert client.post("/api/refresh", params={"source": "sim_crew"}).status_code == 404
    assert client.get("/api/refresh").json()["jobs"][0]["runs"] == 1


# ---- check-in ------------------------------------------------------------------
def test_checkin_stored_and_returned(client):
    res = client.post("/api/observations", json={"subject": "c1", "metric": "self.mood", "t": "2026-11-15", "value": 4})
    assert res.status_code == 200, res.text
    body = res.json()
    assert {k: body[k] for k in ("subject", "metric", "t", "value", "unit", "source", "quality")} == {
        "subject": "c1", "metric": "self.mood", "t": "2026-11-15", "value": 4.0, "unit": _unit("self.mood"),
        "source": "checkin", "quality": "live"}
    assert isinstance(body["assessments"], list) and isinstance(body["run_id"], int)
    rows = client.get("/api/observations", params={"subject": "c1", "metric": "self.mood", "since": "2026-11-15"}).json()
    assert {"metric": "self.mood", "t": "2026-11-15", "value": 4.0, "quality": "live"} in rows
    assert client.get("/api/health").json()["sources"]["checkin"]["quality"] == "live"


def test_checkin_instant_normalised_to_utc(client):
    res = client.post("/api/observations", json={"subject": "c2", "metric": "self.sleep_h", "t": "2026-11-15T09:30:00+01:00",
                                                 "value": 7.5})
    assert res.status_code == 200 and res.json()["t"] == "2026-11-15T08:30:00Z"


def test_checkin_returns_assessments_for_that_day(client, monkeypatch):
    from server.core.records import Assessment
    a = Assessment("c1", "self.mood", "2026-11-15", "baseline_z@3d", "amber", -2.1, "low", "call home")
    real = deps.rederive

    def rederive_with_flag():
        files = real()
        deps.store().replace_assessments([*deps.store().assessments(), a])
        return files

    monkeypatch.setattr(deps, "rederive", rederive_with_flag)
    body = client.post("/api/observations", json={"subject": "c1", "metric": "self.mood", "t": "2026-11-15", "value": 2}).json()
    assert body["assessments"] == [{"subject": "c1", "metric": "self.mood", "t": "2026-11-15", "rule": "baseline_z@3d",
                                    "severity": "amber", "z": -2.1, "message": "low", "action": "call home"}]


@pytest.mark.parametrize("payload,why", [
    ({"subject": "iss", "metric": "self.mood", "value": 3}, "not a crew member"),
    ({"subject": "nobody", "metric": "self.mood", "value": 3}, "not a crew member"),
    ({"subject": "c1", "metric": "cabin.ppo2", "value": 3}, "not a self-report metric"),
    ({"subject": "c1", "metric": "self.nope", "value": 3}, "not a self-report metric"),
    ({"subject": "c1", "metric": "self.mood", "value": "4"}, "finite number"),
    ({"subject": "c1", "metric": "self.mood", "value": True}, "finite number"),
    ({"subject": "c1", "metric": "self.mood"}, "finite number"),
    ({"subject": "c1", "metric": "self.mood", "value": 3, "unit": "kg"}, "unit"),
    ({"subject": "c1", "metric": "self.mood", "value": 3, "t": "yesterday"}, "ISO 8601"),
    ({"subject": "c1", "metric": "self.mood", "value": 3, "t": "2026-11-15T08:00:00"}, "timezone"),
])
def test_checkin_rejected(client, payload, why):
    n_runs = len(deps.store().runs())
    res = client.post("/api/observations", json=payload)
    assert res.status_code == 422 and why in res.text
    assert len(deps.store().runs()) == n_runs                   # refused before the store: no run, no row
