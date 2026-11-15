"""Mind layer endpoints (docs/backend/MIND-DESIGN.md "api.py"). Thin: parse, check, call engine/repo, return dicts.

No SQL and no scoring here. GET /api/observations stays the core route; this file only adds POST.
"""
from __future__ import annotations

import functools
import json
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Header, HTTPException
import re

from pydantic import BaseModel

CLIENT_ID = re.compile(r"[A-Za-z0-9_-]{1,64}")

from ..api import deps
from . import engine, records, repo

router = APIRouter()
PRIVATE = "journal is private to its crew member"


# ---- bodies ------------------------------------------------------------------
class ObservationIn(BaseModel):
    subject: str
    metric: str
    t: str | None = None
    value: float | int


class TaskIn(BaseModel):
    subject: str
    label: str
    id: str | None = None          # client-made id (offline-first apps); kept if valid, safe to resend
    kind: Literal["habit", "todo"] = "todo"
    schedule: str | None = None
    due: str | None = None
    metric: str | None = None


class TaskEventIn(BaseModel):
    t: str | None = None
    status: str


class NoteIn(BaseModel):
    text: str
    tags: list[str] = []
    t: str | None = None


def _serialized(fn):
    """Run a handler under store.lock (an RLock): FastAPI runs sync handlers in a thread pool and the store shares one
    sqlite connection, so a write-then-sync request must not interleave with another request's reads or writes."""
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        with deps.store().lock:
            return fn(*args, **kwargs)
    return wrapper


# ---- checks ------------------------------------------------------------------
def _crew(cat, subject: str) -> str:
    s = cat.subjects.get(subject)
    if s is None or s.get("kind") != "crew_sim":
        raise HTTPException(404, f"unknown crew member {subject!r}")
    return subject


def _day(name: str, value: str | None) -> str | None:
    if value is not None and not records.valid_day(value):
        raise HTTPException(422, f"{name} {value!r}: use YYYY-MM-DD")
    return value


def _time(name: str, value: str | None) -> str | None:
    if value is not None and not records.valid_time(value):
        raise HTTPException(422, f"{name} {value!r}: use YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ")
    return value


def _own_journal(subject: str, member: str | None) -> None:
    if member != subject:
        raise HTTPException(403, PRIVATE)


# ---- check-in ----------------------------------------------------------------
@router.get("/api/checkin")
@_serialized
def checkin(subject: str, date: str | None = None) -> dict:
    cat, store = deps.cat(), deps.store()
    _crew(cat, subject)
    return engine.checkin_form(cat, store, subject, _day("date", date))


@router.post("/api/observations", status_code=201)
@_serialized
def post_observation(body: ObservationIn) -> dict:
    cat, store = deps.cat(), deps.store()
    _crew(cat, body.subject)
    t = body.t if body.t is not None else engine.today(cat)
    try:
        batch = records.checkin_batch(cat, body.subject, body.metric, t, body.value)
    except ValueError as e:
        raise HTTPException(422, str(e))
    run_id = store.write(batch)
    run = next(r for r in store.runs() if r["id"] == run_id)
    if run["rejected"]:
        raise HTTPException(422, "; ".join(json.loads(run["errors"] or "[]")) or "rejected")
    res = engine.sync(cat, store, body.subject)
    day = records.day_of(t)
    same = [a for a in store.assessments(body.subject) if a.metric == body.metric and records.day_of(a.t) == day]
    latest = max(same, key=lambda a: a.t) if same else None
    o = batch.observations[0]
    return {
        "stored": {"metric": o.metric, "t": o.t, "value": o.value, "quality": o.quality},
        "assessment": None if latest is None else {"severity": latest.severity, "z": latest.z, "message": latest.message,
                                                   "action": latest.action, "t": latest.t},
        "opened_tasks": res.get("opened", []),
        "closed_tasks": res.get("closed", []),
    }


# ---- tasks -------------------------------------------------------------------
@router.get("/api/tasks")
@_serialized
def get_tasks(subject: str, date: str | None = None) -> dict:
    cat, store = deps.cat(), deps.store()
    _crew(cat, subject)
    d = _day("date", date) or engine.today(cat)
    return {"subject": subject, "date": d, "tasks": engine.tasks_for_day(cat, store, subject, d)}


@router.post("/api/tasks", status_code=201)
@_serialized
def post_task(body: TaskIn) -> dict:
    cat, store = deps.cat(), deps.store()
    _crew(cat, body.subject)
    label = body.label.strip()
    if not label:
        raise HTTPException(422, "label must not be empty")
    if body.metric is not None and body.metric not in cat.metrics:
        raise HTTPException(422, f"unknown metric {body.metric!r}")
    today = engine.today(cat)
    if body.kind == "habit":
        schedule = body.schedule if body.schedule is not None else "daily"
        if not records.valid_schedule(schedule):
            raise HTTPException(422, f"schedule {schedule!r}: use 'daily' or 'days:mon,wed'")
        due = None
    else:
        schedule = None
        due = _day("due", body.due) or today
    if body.id is not None:
        if not CLIENT_ID.fullmatch(body.id):
            raise HTTPException(422, "id: 1-64 characters, letters, digits, '-' or '_'")
        existing = repo.get_task(store, body.id)
        if existing is not None:
            if existing.subject != body.subject:
                raise HTTPException(409, f"task {body.id!r} belongs to another crew member")
            return engine.task_view(cat, store, existing, today)       # same call sent twice: no duplicate
    task = records.Task(body.id or f"self-{body.subject}-{uuid4().hex[:8]}", body.subject, body.kind, label, "self", today,
                        schedule=schedule, due=due, metric=body.metric)
    repo.put_task(store, task)
    return engine.task_view(cat, store, task, today)


@router.post("/api/tasks/{task_id}/events", status_code=201)
@_serialized
def post_task_event(task_id: str, body: TaskEventIn) -> dict:
    cat, store = deps.cat(), deps.store()
    task_id = engine.resolve_task_id(cat, task_id)                      # accepts the app's routine names too
    task = repo.get_task(store, task_id)
    if task is None:
        raise HTTPException(404, f"unknown task {task_id!r}")
    if body.status not in records.USER_STATUSES:
        raise HTTPException(422, f"status {body.status!r}: use one of {', '.join(records.USER_STATUSES)}")
    t = _time("t", body.t) or engine.today(cat)
    repo.add_event(store, records.TaskEvent(task_id, t, body.status))
    return {"task_id": task_id, "t": t, "status": body.status,
            "task": engine.task_view(cat, store, task, records.day_of(t)),
            "xp": engine.progress(cat, store, task.subject)["xp"]}


# ---- progress ----------------------------------------------------------------
@router.get("/api/progress")
@_serialized
def get_progress(subject: str, date: str | None = None) -> dict:
    cat, store = deps.cat(), deps.store()
    _crew(cat, subject)
    return engine.progress(cat, store, subject, _day("date", date))


# ---- journal (private) -------------------------------------------------------
def _note_dict(n: records.Note) -> dict:
    return {"id": n.id, "t": n.t, "kind": n.kind, "text": n.text, "tags": list(n.tags), "private": n.private}


@router.post("/api/notes", status_code=201)
@_serialized
def post_note(subject: str, body: NoteIn, x_crew_member: str | None = Header(None)) -> dict:
    cat, store = deps.cat(), deps.store()
    _crew(cat, subject)
    _own_journal(subject, x_crew_member)
    if not body.text.strip() or len(body.text) > 4000:
        raise HTTPException(422, "text must be 1 to 4000 characters")
    if len(body.tags) > 10:
        raise HTTPException(422, "at most 10 tags")
    t = _time("t", body.t) or engine.today(cat)
    note = records.Note(f"note-{uuid4().hex[:12]}", subject, t, body.text, tags=list(body.tags))
    repo.add_note(store, note)
    return {"subject": subject, **_note_dict(note)}


@router.get("/api/notes")
@_serialized
def get_notes(subject: str, since: str | None = None, x_crew_member: str | None = Header(None)) -> dict:
    cat, store = deps.cat(), deps.store()
    _crew(cat, subject)
    _own_journal(subject, x_crew_member)
    return {"subject": subject, "notes": [_note_dict(n) for n in repo.notes(store, subject, _time("since", since))]}


# ---- wellbeing (no journal text) ---------------------------------------------
@router.get("/api/wellbeing")
@_serialized
def get_wellbeing(subject: str, days: int = 28, end: str | None = None) -> dict:
    cat, store = deps.cat(), deps.store()
    _crew(cat, subject)
    if not 7 <= days <= 90:
        raise HTTPException(422, "days must be 7 to 90")
    return engine.wellbeing(cat, store, subject, days, _day("end", end))
