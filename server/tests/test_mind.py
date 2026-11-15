"""Mind layer tests (docs/backend/MIND-DESIGN.md). Run: python -m pytest server/tests -q"""
import datetime as dt
import json
import uuid

import pytest
from fastapi.testclient import TestClient

from server.api.app import create_app
from server.core.catalog import Catalog
from server.core.records import Observation
from server.core.store import Store
from server.mind import engine, records, repo
from server.mind.records import Note, Task, TaskEvent, checkin_batch

SELF_REPORT = ("self.stress", "self.energy", "self.social", "self.sleep_quality")


# ---- helpers -----------------------------------------------------------------
@pytest.fixture(scope="module")
def cat():
    return Catalog.load()


@pytest.fixture
def store(cat):
    return Store(":memory:", cat)


def days_from(start: str, n: int) -> list[str]:
    d0 = dt.date.fromisoformat(start)
    return [(d0 + dt.timedelta(days=i)).isoformat() for i in range(n)]


def put_series(store, cat, subject, metric, start, values):
    """One check-in reading per day from `start`, through the real adapter. Returns the days."""
    days = days_from(start, len(values))
    for d, v in zip(days, values):
        store.write(checkin_batch(cat, subject, metric, d, v))
    assert all(r["rejected"] == 0 for r in store.runs())
    return days


def for_metric(store, subject, metric):
    return [a for a in store.assessments(subject) if a.metric == metric]


# ---- catalog -----------------------------------------------------------------
def test_self_report_metrics_have_scales(cat):
    for key in SELF_REPORT:
        m = cat.metrics[key]
        assert m["kind"] == "self_report"
        sc = m["scale"]
        assert sc["min"] == 1 and sc["max"] == 5 and len(sc["words"]) == 5
        assert set(m["actions"]) >= {"amber", "red"}
    assert cat.metrics["self.stress"]["rule"].get("high_side_only") is True
    assert not cat.metrics["self.stress"]["rule"].get("low_side_only")


def test_routines_yaml_loads(cat):
    r = cat.extra["routines"]
    assert records.checkin_metrics(cat) == ["self.mood", *SELF_REPORT]
    assert {x["id"] for x in r["routines"]} >= {"checkin", "exercise", "sleep_window", "hydration", "journal", "call_home"}
    assert all(records.valid_schedule(x["schedule"]) for x in r["routines"])
    assert set(r["xp"]) >= {"task_done", "system_task_done", "checkin_day", "journal_day", "level_every"}
    assert records.scale_of(cat, "self.mood")["words"][0] == "Very low"


# ---- records.checkin_batch -----------------------------------------------------
@pytest.mark.parametrize("subject,metric,t,value", [
    ("nobody", "self.social", "2026-11-14", 3),           # unknown subject
    ("iss", "self.social", "2026-11-14", 3),              # not a crew member
    ("c1", "self.social", "2026-11-14", 6),               # out of scale
    ("c1", "self.social", "2026-11-14", 0),               # out of scale
    ("c1", "self.mood", "2026-11-14", 9),                 # out of scale (scale from routines.yaml)
    ("c1", "self.social", "14/11/2026", 3),               # bad t
    ("c1", "self.social", "2026-11-14T10:00", 3),         # bad t (no Z)
    ("c1", "self.social", "2026-11-14", True),            # bool is not a number
    ("c1", "self.social", "2026-11-14", "3"),             # string is not a number
    ("c1", "cabin.ppco2", "2026-11-14", 3),               # not a check-in metric
])
def test_checkin_batch_rejects(cat, subject, metric, t, value):
    with pytest.raises(ValueError):
        checkin_batch(cat, subject, metric, t, value)


def test_checkin_batch_valid_writes(cat, store):
    store.write(checkin_batch(cat, "c1", "self.social", "2026-11-14T08:30:00Z", 4))
    run = store.runs()[-1]
    assert run["rejected"] == 0 and run["n_rows"] == 1 and run["source"] == "checkin"
    o = store.observations(subject="c1", metric="self.social")
    assert len(o) == 1 and o[0].value == 4.0 and o[0].unit == "/5"


# ---- engine: self-report scoring -----------------------------------------------
BASE = "2026-10-01"


def test_today_is_mission_day(cat):
    assert engine.today(cat) == cat.mission["today"]


def test_social_drop_flags_low_side(cat, store):
    days = put_series(store, cat, "c1", "self.social", BASE, [4] * 14 + [2, 2, 2])
    rows = engine.score_self_report(cat, store, "c1")
    social = [a for a in rows if a.metric == "self.social"]
    assert social, "a drop of 2 points for 3 days must be flagged"
    assert all(a.subject == "c1" and a.rule == "baseline_z@3d" for a in social)
    assert all(a.severity in ("amber", "red") and a.z < 0 for a in social)
    last = max(social, key=lambda a: a.t)
    assert last.t[:10] == days[-1] and last.severity == "red"
    assert last.z == pytest.approx(round((2 - 4) / 0.6, 2), abs=0.01)
    assert "below" in last.message
    assert last.action == cat.metrics["self.social"]["actions"]["red"]
    # stable days give nothing
    assert not [a for a in social if a.t[:10] <= days[13]]


def test_stress_drop_is_ignored_and_rise_alerts(cat, store):
    put_series(store, cat, "c1", "self.stress", BASE, [3] * 14 + [1, 1, 1])
    assert not [a for a in engine.score_self_report(cat, store, "c1") if a.metric == "self.stress"]

    put_series(store, cat, "c2", "self.stress", BASE, [3] * 14 + [5, 5, 5])
    up = [a for a in engine.score_self_report(cat, store, "c2") if a.metric == "self.stress"]
    assert up and all(a.z > 0 for a in up)
    last = max(up, key=lambda a: a.t)
    assert last.severity == "red" and "above" in last.message


def test_too_little_baseline_gives_nothing(cat, store):
    put_series(store, cat, "c1", "self.social", BASE, [2, 2])
    assert engine.score_self_report(cat, store, "c1") == []


def test_sync_opens_and_closes_a_system_task(cat, store):
    days = put_series(store, cat, "c1", "self.social", BASE, [4] * 14 + [2, 2, 2])
    out = engine.sync(cat, store, "c1")
    tid = f"sys-c1-self.social-{days[-1]}"
    assert tid in out["opened"] and out["closed"] == []
    t = repo.get_task(store, tid)
    assert t.origin == "system" and t.kind == "todo" and t.metric == "self.social" and t.created[:10] == days[-1]
    assert t.label == cat.metrics["self.social"]["actions"]["red"]
    assert t.attrs["severity"] == "red" and t.attrs["assessment_t"][:10] == days[-1]
    assert set(t.attrs) >= {"severity", "z", "message", "assessment_t", "rule"}
    assert for_metric(store, "c1", "self.social"), "sync stores the assessments"

    v = engine.task_view(cat, store, t, days[-1])
    assert v["done"] is False and v["status"] is None and v["origin"] == "system"

    # idempotent while nothing new arrives
    assert engine.sync(cat, store, "c1") == {"opened": [], "closed": []}

    # a newer reading closes the task
    nxt = days_from(days[-1], 2)[1]
    store.write(checkin_batch(cat, "c1", "self.social", f"{nxt}T09:00:00Z", 4))
    out = engine.sync(cat, store, "c1")
    assert tid in out["closed"]
    ev = repo.events(store, task_id=tid)
    assert [(e.status, e.t) for e in ev] == [("closed", f"{nxt}T09:00:00Z")]
    v = engine.task_view(cat, store, repo.get_task(store, tid), nxt)
    assert v["status"] == "closed" and v["done"] is True

    again = engine.sync(cat, store, "c1")
    assert tid not in again["closed"] and again["opened"] == []
    assert len(repo.events(store, task_id=tid)) == 1


def test_sync_all_subjects_is_idempotent(cat, store):
    put_series(store, cat, "c2", "self.stress", BASE, [2] * 14 + [5, 5, 5])
    first = engine.sync(cat, store)
    assert first["opened"] and all(i.startswith("sys-c2-self.stress-") for i in first["opened"])
    assert engine.sync(cat, store) == {"opened": [], "closed": []}


# ---- engine: habits ----------------------------------------------------------------
def _habit(store, schedule="daily", tid=None):
    t = Task(tid or f"self-c1-{uuid.uuid4().hex[:8]}", "c1", "habit", "Stretch", "self", "2026-09-01", schedule=schedule)
    assert repo.put_task(store, t)
    return t


def test_streak_three_days(cat, store):
    t = _habit(store)
    for d in ("2026-10-10", "2026-10-11", "2026-10-12"):
        repo.add_event(store, TaskEvent(t.id, d, "done"))
    v = engine.task_view(cat, store, t, "2026-10-12")
    assert v["done"] is True and v["status"] == "done" and v["streak"] == 3
    assert set(v) == {"id", "kind", "label", "origin", "metric", "schedule", "due", "created", "done", "status", "streak", "attrs"}
    # today not ticked yet: streak kept
    v = engine.task_view(cat, store, t, "2026-10-13")
    assert v["done"] is False and v["streak"] == 3


def test_missed_or_skipped_day_breaks_streak(cat, store):
    t = _habit(store)
    for d in ("2026-10-10", "2026-10-12"):
        repo.add_event(store, TaskEvent(t.id, d, "done"))
    assert engine.task_view(cat, store, t, "2026-10-12")["streak"] == 1

    t2 = _habit(store)
    repo.add_event(store, TaskEvent(t2.id, "2026-10-10", "done"))
    repo.add_event(store, TaskEvent(t2.id, "2026-10-11", "skipped"))
    repo.add_event(store, TaskEvent(t2.id, "2026-10-12", "done"))
    v = engine.task_view(cat, store, t2, "2026-10-11")
    assert v["status"] == "skipped" and v["done"] is False
    assert engine.task_view(cat, store, t2, "2026-10-12")["streak"] == 1


def test_days_schedule_skips_unscheduled_days(cat, store):
    t = _habit(store, "days:mon,wed")
    for d in ("2026-10-05", "2026-10-07", "2026-10-12"):     # Mon, Wed, Mon
        assert records.WEEKDAYS[dt.date.fromisoformat(d).weekday()] in ("mon", "wed")
        repo.add_event(store, TaskEvent(t.id, d, "done"))
    assert engine.task_view(cat, store, t, "2026-10-12")["streak"] == 3
    # Tue 13 is not scheduled: not listed for that day
    ids = {x["id"] for x in engine.tasks_for_day(cat, store, "c1", "2026-10-13")}
    assert t.id not in ids
    assert t.id in {x["id"] for x in engine.tasks_for_day(cat, store, "c1", "2026-10-12")}


def test_ensure_routines_and_auto_checkin(cat, store):
    n = engine.ensure_routines(cat, store)
    crew = [s for s in cat.subjects.values() if s.get("kind") == "crew_sim"]
    assert n == len(crew) * len(cat.extra["routines"]["routines"])
    assert engine.ensure_routines(cat, store) == 0
    t = repo.get_task(store, "routine-c1-checkin")
    assert t.origin == "routine" and t.kind == "habit" and t.attrs["auto"] == "checkin"
    assert repo.get_task(store, "routine-c1-journal").attrs["auto"] == "journal"

    store.write(checkin_batch(cat, "c1", "self.energy", "2026-10-20T07:00:00Z", 3))
    assert "2026-10-20" in engine.checkin_days(cat, store, "c1")
    assert engine.task_view(cat, store, t, "2026-10-20")["done"] is True
    assert engine.task_view(cat, store, t, "2026-10-21")["done"] is False


def test_auto_journal_done_on_note_day(cat, store):
    engine.ensure_routines(cat, store)
    repo.add_note(store, Note("note-x", "c1", "2026-10-20T21:00:00Z", "private words"))
    t = repo.get_task(store, "routine-c1-journal")
    assert engine.task_view(cat, store, t, "2026-10-20")["done"] is True
    assert engine.task_view(cat, store, t, "2026-10-19")["done"] is False


# ---- engine: progress ----------------------------------------------------------------
def test_progress_xp_level_and_badges(cat, store):
    xp = cat.extra["routines"]["xp"]
    engine.ensure_routines(cat, store)
    date = "2026-10-20"
    put_series(store, cat, "c1", "self.energy", "2026-10-01", [3] * 20)          # 20 check-in days ending on date
    todo = Task("self-c1-todo1", "c1", "todo", "Fix the bunk light", "self", "2026-10-18", due="2026-10-19")
    repo.put_task(store, todo)
    repo.add_event(store, TaskEvent(todo.id, "2026-10-19", "done"))
    repo.add_event(store, TaskEvent("routine-c1-exercise", date, "done"))
    repo.add_note(store, Note("note-p", "c1", f"{date}T21:00:00Z", "private words"))

    p = engine.progress(cat, store, "c1", date)
    expected = 2 * xp["task_done"] + 20 * xp["checkin_day"] + 1 * xp["journal_day"]
    assert p["subject"] == "c1" and p["date"] == date
    assert p["xp"] == expected
    assert p["level"] == 1 + expected // xp["level_every"]
    assert p["checkin_days"] == 20 and p["checkin_streak"] == 20
    assert p["journal_days"] == 1 and p["system_tasks_closed"] == 0
    assert p["streaks"]["routine-c1-exercise"] == 1
    assert all(repo.get_task(store, k).kind == "habit" for k in p["streaks"])
    assert set(p) >= {"level_xp", "next_level_xp", "best_habit_streak", "badges"}
    badges = {b["id"]: b for b in p["badges"]}
    assert set(badges) == {b["id"] for b in cat.extra["routines"]["badges"]}
    assert all(isinstance(b["earned"], bool) and b["label"] for b in badges.values())
    assert badges["first_checkin"]["earned"] and badges["week_streak"]["earned"]
    assert not badges["month_streak"]["earned"] and not badges["closed_loop"]["earned"]
    # the auto check-in habit is done on every check-in day, so it carries a 20-day streak
    # streaks lists every habit, auto ones included; best_habit_streak and habit_keeper use non-auto habits only
    assert p["streaks"]["routine-c1-checkin"] == 20
    assert "routine-c1-journal" in p["streaks"]
    assert p["best_habit_streak"] == 1                      # exercise, done once; the 20-day auto check-in streak is excluded
    assert badges["habit_keeper"]["earned"] is False

    # a date before any check-in: nothing
    early = engine.progress(cat, store, "c1", "2026-09-15")
    assert early["checkin_days"] == 0 and early["checkin_streak"] == 0
    assert not {b["id"]: b for b in early["badges"]}["first_checkin"]["earned"]


def test_progress_counts_closed_system_task(cat, store):
    xp = cat.extra["routines"]["xp"]
    days = put_series(store, cat, "c1", "self.social", BASE, [4] * 14 + [2, 2, 2])
    engine.sync(cat, store, "c1")
    nxt = days_from(days[-1], 2)[1]
    store.write(checkin_batch(cat, "c1", "self.social", f"{nxt}T09:00:00Z", 4))
    engine.sync(cat, store, "c1")
    p = engine.progress(cat, store, "c1", nxt)
    assert p["system_tasks_closed"] >= 1
    assert {b["id"]: b for b in p["badges"]}["closed_loop"]["earned"] is True
    assert p["xp"] >= p["system_tasks_closed"] * xp["system_task_done"] + len(days + [nxt]) * xp["checkin_day"]


# ---- API -------------------------------------------------------------------------------
@pytest.fixture(scope="module")
def client():
    return TestClient(create_app())


def me(subject="c1"):
    return {"X-Crew-Member": subject}


def test_catalog_lists_self_report(client):
    keys = {m["key"] for m in client.get("/api/catalog", params={"kind": "self_report"}).json()["metrics"]}
    assert set(SELF_REPORT) <= keys


def test_notes_are_private(client):
    body = {"text": "a line"}
    assert client.post("/api/notes", params={"subject": "c1"}, json=body).status_code == 403
    assert client.post("/api/notes", params={"subject": "c1"}, json=body, headers=me("c2")).status_code == 403
    assert client.get("/api/notes", params={"subject": "c1"}).status_code == 403
    assert client.get("/api/notes", params={"subject": "c1"}, headers=me("c2")).status_code == 403


def test_note_text_never_leaves_the_device(client):
    secret = f"secret-journal-{uuid.uuid4().hex}"
    before = client.get("/api/wellbeing", params={"subject": "c1"}).json()["journal_entries"]
    r = client.post("/api/notes", params={"subject": "c1"}, json={"text": secret, "tags": ["calm"]}, headers=me("c1"))
    assert r.status_code == 201
    note = r.json()
    assert note["text"] == secret and note["id"].startswith("note-") and note["private"] is True

    got = client.get("/api/notes", params={"subject": "c1"}, headers=me("c1"))
    assert got.status_code == 200 and got.json()["subject"] == "c1"
    assert secret in [n["text"] for n in got.json()["notes"]]
    assert set(got.json()["notes"][0]) == {"id", "t", "kind", "text", "tags", "private"}

    wb = client.get("/api/wellbeing", params={"subject": "c1"})
    assert wb.status_code == 200
    assert wb.json()["journal_text_included"] is False
    assert wb.json()["journal_entries"] == before + 1

    urls = ["/api/wellbeing?subject=c1", "/api/progress?subject=c1", "/api/tasks?subject=c1", "/api/health",
            "/api/observations", "/api/observations?subject=c1", "/api/checkin?subject=c1", "/api/catalog",
            "/data/crew_data.json", "/data/storm_forecast.json", "/data/real_crew.json"]
    for u in urls:
        r = client.get(u)
        assert r.status_code == 200, u
        assert secret not in r.text, u


def test_note_validation(client):
    assert client.post("/api/notes", params={"subject": "c1"}, json={"text": ""}, headers=me()).status_code == 422
    assert client.post("/api/notes", params={"subject": "c1"}, json={"text": "x" * 4001}, headers=me()).status_code == 422
    assert client.post("/api/notes", params={"subject": "c1"}, json={"text": "ok", "tags": ["t"] * 11},
                       headers=me()).status_code == 422


def test_wellbeing_shape(client):
    r = client.get("/api/wellbeing", params={"subject": "c1", "days": 28})
    w = r.json()
    assert r.status_code == 200 and w["subject"] == "c1" and w["days"] == 28
    assert len(w["weeks"]) == 4
    assert set(w["weeks"][0]["scores"]) >= {*records.checkin_metrics(deps_cat()), "self.sleep_h"}
    assert set(w) >= {"from", "to", "weeks", "trend", "checkin_streak", "journal_entries", "alerts", "journal_text_included"}


def deps_cat():
    from server.api import deps
    return deps.cat()


def test_post_observation(client):
    r = client.post("/api/observations", json={"subject": "c1", "metric": "self.energy", "t": "2026-11-14T10:00:00Z", "value": 3})
    assert r.status_code == 201, r.text
    b = r.json()
    assert b["stored"] == {"metric": "self.energy", "t": "2026-11-14T10:00:00Z", "value": 3.0, "quality": "live"}
    assert set(b) >= {"assessment", "opened_tasks", "closed_tasks"}
    rows = client.get("/api/observations", params={"subject": "c1", "metric": "self.energy"}).json()
    assert rows and all(set(x) == {"metric", "t", "value", "quality"} for x in rows)
    assert any(x["t"] == "2026-11-14T10:00:00Z" for x in rows)
    form = client.get("/api/checkin", params={"subject": "c1"}).json()
    assert [m["key"] for m in form["metrics"]] == records.checkin_metrics(deps_cat())


def test_post_observation_defaults_t_to_today(client):
    r = client.post("/api/observations", json={"subject": "c2", "metric": "self.social", "value": 4})
    assert r.status_code == 201 and r.json()["stored"]["t"][:10] == deps_cat().mission["today"]


@pytest.mark.parametrize("body", [
    {"subject": "c1", "metric": "self.energy", "value": 7},
    {"subject": "c1", "metric": "self.energy", "value": 3, "t": "yesterday"},
    {"subject": "c1", "metric": "cabin.ppco2", "value": 3},
])
def test_post_observation_422(client, body):
    assert client.post("/api/observations", json=body).status_code == 422


def test_tasks_flow(client):
    label = f"Clean filter {uuid.uuid4().hex[:6]}"
    r = client.post("/api/tasks", json={"subject": "c1", "label": label})
    assert r.status_code == 201, r.text
    t = r.json()
    assert t["origin"] == "self" and t["kind"] == "todo" and t["done"] is False and t["id"].startswith("self-c1-")
    listed = client.get("/api/tasks", params={"subject": "c1"}).json()
    assert listed["subject"] == "c1" and label in [x["label"] for x in listed["tasks"]]

    r = client.post(f"/api/tasks/{t['id']}/events", json={"status": "done"})
    assert r.status_code == 201, r.text
    e = r.json()
    assert e["task_id"] == t["id"] and e["status"] == "done" and e["task"]["done"] is True and isinstance(e["xp"], int)

    assert client.post(f"/api/tasks/{t['id']}/events", json={"status": "closed"}).status_code == 422
    assert client.post("/api/tasks/no-such-task/events", json={"status": "done"}).status_code == 404


def test_habit_task_via_api(client):
    r = client.post("/api/tasks", json={"subject": "c1", "label": "Stretch", "kind": "habit"})
    assert r.status_code == 201 and r.json()["schedule"] == "daily"
    bad = client.post("/api/tasks", json={"subject": "c1", "label": "Stretch", "kind": "habit", "schedule": "days:xyz"})
    assert bad.status_code == 422
    assert client.post("/api/tasks", json={"subject": "c1", "label": "x", "metric": "self.nope"}).status_code == 422


@pytest.mark.parametrize("url", ["/api/tasks", "/api/progress", "/api/wellbeing", "/api/checkin"])
def test_unknown_subject_404(client, url):
    assert client.get(url, params={"subject": "nobody"}).status_code == 404
    assert client.get(url, params={"subject": "iss"}).status_code == 404


def test_unknown_subject_post_404(client):
    assert client.post("/api/observations", json={"subject": "nobody", "metric": "self.energy", "value": 3}).status_code == 404
    assert client.post("/api/tasks", json={"subject": "nobody", "label": "x"}).status_code == 404


@pytest.mark.parametrize("days,code", [(6, 422), (91, 422), (7, 200), (90, 200)])
def test_wellbeing_days_range(client, days, code):
    assert client.get("/api/wellbeing", params={"subject": "c1", "days": days}).status_code == code


# ---- build ------------------------------------------------------------------------------
def test_build_has_mind_sim_and_no_rejects():
    from server.build import build
    _, store, _ = build()
    runs = store.runs()
    assert all(r["rejected"] == 0 for r in runs), [r for r in runs if r["rejected"]]
    assert any(r["source"] == "mind_sim" for r in runs)
    assert store.observations(subject="c1", source="mind_sim")
    assert repo.get_task(store, "routine-c1-checkin") is not None


def test_alerting_checkin_does_not_close_its_own_task():
    """The reading that raises the alert opens the task; only a later reading closes it (Detect -> Notify -> Verify)."""
    c = TestClient(create_app())
    first = c.post("/api/observations", json={"subject": "c1", "metric": "self.social", "t": "2026-11-14T10:00:00Z",
                                              "value": 1}).json()
    tid = "sys-c1-self.social-2026-11-14"
    assert tid in first["opened_tasks"] and tid not in first["closed_tasks"]
    again = c.post("/api/observations", json={"subject": "c1", "metric": "self.social", "t": "2026-11-14T21:00:00Z",
                                              "value": 4}).json()
    assert tid in again["closed_tasks"]


def test_impossible_dates_and_bad_values_are_422():
    c = TestClient(create_app())
    assert c.get("/api/progress", params={"subject": "c1", "date": "2026-13-01"}).status_code == 422
    assert c.get("/api/wellbeing", params={"subject": "c1", "end": "2026-02-30"}).status_code == 422
    assert c.post("/api/tasks/routine-c1-hydration/events", json={"status": "done", "t": "2026-02-30"}).status_code == 422
    assert c.post("/api/observations", json={"subject": "c1", "metric": "self.mood", "t": "2026-02-30",
                                             "value": 3}).status_code == 422
    assert c.post("/api/observations", json={"subject": "c1", "metric": "vital.bp_sys", "value": -50}).status_code == 422


def test_live_mood_checkin_is_scored():
    """self.mood is crew_daily, but a live check-in is scored at once by the Mind engine (same rule)."""
    c = TestClient(create_app())
    r = c.post("/api/observations", json={"subject": "c1", "metric": "self.mood", "t": "2026-11-14T09:00:00Z",
                                          "value": 1}).json()
    assert r["assessment"]["severity"] == "red"
    assert "sys-c1-self.mood-2026-11-14" in r["opened_tasks"]
