"""Emile's app (web/src/data/mind.ts) sends its own task ids and its own routine names. Both must work."""
import os

os.environ.setdefault("AEGIS_DB", ":memory:")
os.environ.setdefault("AEGIS_REFRESH", "0")

from fastapi.testclient import TestClient  # noqa: E402

from server.api.app import create_app  # noqa: E402

c = TestClient(create_app())
TASK = {"id": "abc123", "subject": "c1", "kind": "todo", "label": "Fix filter", "origin": "self", "created": "2026-11-15T03:00:00Z"}


def test_client_task_id_is_kept_and_resend_is_safe():
    a = c.post("/api/tasks", json=TASK)
    b = c.post("/api/tasks", json=TASK)
    assert a.status_code in (200, 201) and a.json()["id"] == "abc123"
    assert b.json()["id"] == "abc123"
    ids = [t["id"] for t in c.get("/api/tasks", params={"subject": "c1", "date": "2026-11-14"}).json()["tasks"]]
    assert ids.count("abc123") <= 1


def test_event_on_client_task():
    c.post("/api/tasks", json=TASK)
    r = c.post("/api/tasks/abc123/events", json={"subject": "c1", "t": "2026-11-14T12:00:00Z", "status": "done"})
    assert r.status_code == 201


def test_emiles_routine_names_tick_the_servers_habits():
    for name in ["check-in", "exercise-block", "sleep-window", "hydration", "journal-line", "call-home"]:
        r = c.post(f"/api/tasks/routine-c1-{name}/events", json={"subject": "c1", "t": "2026-11-14T12:00:00Z", "status": "done"})
        assert r.status_code == 201, (name, r.text)


def test_bad_client_id_rejected():
    assert c.post("/api/tasks", json={**TASK, "id": "../etc"}).status_code == 422


def test_emiles_entries_posts_glucose_as_vital_glucose():
    """CrewPage and InfoSheet call saveEntry, which posts metric vital.glucose (web/src/console/entries.ts)."""
    body = {"subject": "c1", "metric": "vital.glucose", "t": "2026-11-15T06:10:00Z", "value": 95}
    r = c.post("/api/observations", json=body)
    assert r.status_code == 201, r.text
    assert r.json()["stored"] == {"metric": "lab.glucose", "t": "2026-11-15T06:10:00Z", "value": 95.0, "quality": "live"}
    rows = c.get("/api/observations", params={"subject": "c1", "metric": "lab.glucose"}).json()
    assert r.json()["stored"] in rows
