"""All reads and writes of the Mind tables, on store.db under store.lock. No scoring here, no formatting.

Journal text is only returned by notes(); every other read here returns counts or ids, never text.
"""
from __future__ import annotations

import json
from typing import Iterable

from ..core.records import Assessment
from ..core.store import Store
from .records import Note, Task, TaskEvent


# ---- notes (journal) ---------------------------------------------------------
def add_note(store: Store, n: Note) -> None:
    with store.lock:
        store.db.execute("INSERT INTO note (id, subject, t, kind, text, tags, private) VALUES (?,?,?,?,?,?,?)",
                         (n.id, n.subject, n.t, n.kind, n.text, json.dumps(n.tags, ensure_ascii=False), int(n.private)))
        store.db.commit()


def notes(store: Store, subject: str, since: str | None = None) -> list[Note]:
    """Full entries with text. Only for the crew member's own device (api.py checks), never for a ground view."""
    q, args = "SELECT * FROM note WHERE subject=?", [subject]
    if since:
        q += " AND t>=?"
        args.append(since)
    with store.lock:
        rows = store.db.execute(q + " ORDER BY t, id", args).fetchall()
    return [Note(r["id"], r["subject"], r["t"], r["text"], r["kind"], json.loads(r["tags"]), bool(r["private"])) for r in rows]


def note_days(store: Store, subject: str) -> dict[str, int]:
    """{YYYY-MM-DD: number of entries}. Counts only, no text: what the wellbeing summary and XP may see."""
    with store.lock:
        rows = store.db.execute("SELECT substr(t, 1, 10) AS d, COUNT(*) AS n FROM note WHERE subject=? GROUP BY d",
                                (subject,)).fetchall()
    return {r["d"]: r["n"] for r in rows}


# ---- tasks -------------------------------------------------------------------
def _task(r) -> Task:
    return Task(r["id"], r["subject"], r["kind"], r["label"], r["origin"], r["created"], r["schedule"], r["due"],
                r["metric"], json.loads(r["attrs"]))


def put_task(store: Store, t: Task, replace: bool = False) -> bool:
    """Insert a task. replace=False keeps an existing row with the same id (idempotent builds). True if a row was written."""
    verb = "INSERT OR REPLACE" if replace else "INSERT OR IGNORE"
    with store.lock:
        cur = store.db.execute(f"{verb} INTO task (id, subject, kind, label, schedule, due, origin, metric, created, attrs) "
                               "VALUES (?,?,?,?,?,?,?,?,?,?)",
                               (t.id, t.subject, t.kind, t.label, t.schedule, t.due, t.origin, t.metric, t.created,
                                json.dumps(t.attrs, ensure_ascii=False)))
        store.db.commit()
    return cur.rowcount > 0


def get_task(store: Store, task_id: str) -> Task | None:
    with store.lock:
        r = store.db.execute("SELECT * FROM task WHERE id=?", (task_id,)).fetchone()
    return _task(r) if r else None


def tasks(store: Store, subject: str, origin: str | None = None) -> list[Task]:
    q, args = "SELECT * FROM task WHERE subject=?", [subject]
    if origin:
        q += " AND origin=?"
        args.append(origin)
    with store.lock:
        rows = store.db.execute(q + " ORDER BY origin, created, id", args).fetchall()
    return [_task(r) for r in rows]


# ---- task events -------------------------------------------------------------
def add_event(store: Store, e: TaskEvent) -> None:
    """Same task and same t replaces (a tap that changes done to skipped)."""
    with store.lock:
        store.db.execute("INSERT OR REPLACE INTO task_event (task_id, t, status) VALUES (?,?,?)", (e.task_id, e.t, e.status))
        store.db.commit()


def events(store: Store, subject: str | None = None, task_id: str | None = None) -> list[TaskEvent]:
    q, args = "SELECT e.* FROM task_event e JOIN task k ON k.id = e.task_id WHERE 1=1", []
    if subject:
        q += " AND k.subject=?"
        args.append(subject)
    if task_id:
        q += " AND e.task_id=?"
        args.append(task_id)
    with store.lock:
        rows = store.db.execute(q + " ORDER BY e.task_id, e.t", args).fetchall()
    return [TaskEvent(r["task_id"], r["t"], r["status"]) for r in rows]


# ---- self-report assessments (rows in the core assessment table) -------------
def replace_assessments_for(store: Store, subject: str, metrics: Iterable[str], rows: Iterable[Assessment]) -> None:
    """Rebuild one subject's assessments for the given metrics only; crew_daily assessments from engine/scoring stay."""
    metrics = list(metrics)
    with store.lock:
        if metrics:
            store.db.execute(f"DELETE FROM assessment WHERE subject=? AND metric IN ({','.join('?' * len(metrics))})",
                             [subject, *metrics])
        store.db.executemany("INSERT OR REPLACE INTO assessment VALUES (?,?,?,?,?,?,?,?)",
                             [(a.subject, a.metric, a.t, a.rule, a.severity, a.z, a.message, a.action) for a in rows])
        store.db.commit()
