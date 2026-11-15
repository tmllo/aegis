"""SQLite store of facts. Every write is checked against the catalog; a bad row is rejected, never stored half-right.

    store = Store(":memory:", catalog)            # or a file path, e.g. server/data/excore.db
    store.write(batch)                            # one Run per batch
    store.observations(subject="c1", metric="vital.bp_sys")
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from typing import Iterable

from .catalog import Catalog
from .records import Assessment, Batch, Event, EventLink, Forecast, Observation

SCHEMA = """
CREATE TABLE IF NOT EXISTS run (
  id INTEGER PRIMARY KEY, source TEXT NOT NULL, quality TEXT NOT NULL, started TEXT NOT NULL, finished TEXT,
  ok INTEGER, n_rows INTEGER, rejected INTEGER, note TEXT, errors TEXT);
CREATE TABLE IF NOT EXISTS observation (
  subject TEXT NOT NULL, metric TEXT NOT NULL, t TEXT NOT NULL, value, unit TEXT NOT NULL,
  source TEXT NOT NULL, quality TEXT NOT NULL, run_id INTEGER NOT NULL REFERENCES run(id), attrs TEXT NOT NULL,
  PRIMARY KEY (subject, metric, t, source));
CREATE TABLE IF NOT EXISTS event (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, t_start TEXT, t_peak TEXT, source TEXT NOT NULL,
  run_id INTEGER NOT NULL REFERENCES run(id), attrs TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS event_link (
  from_id TEXT NOT NULL REFERENCES event(id), to_id TEXT NOT NULL REFERENCES event(id), relation TEXT NOT NULL,
  source TEXT NOT NULL, PRIMARY KEY (from_id, to_id, relation));
CREATE TABLE IF NOT EXISTS forecast (
  event_id TEXT NOT NULL REFERENCES event(id), model_id TEXT NOT NULL, p REAL NOT NULL, level TEXT NOT NULL,
  split TEXT NOT NULL, PRIMARY KEY (event_id, model_id));
CREATE TABLE IF NOT EXISTS assessment (
  subject TEXT NOT NULL, metric TEXT NOT NULL, t TEXT NOT NULL, rule TEXT NOT NULL, severity TEXT NOT NULL,
  z REAL, message TEXT NOT NULL, action TEXT NOT NULL, PRIMARY KEY (subject, metric, t, rule));
CREATE INDEX IF NOT EXISTS obs_by_metric ON observation (metric, t);
CREATE INDEX IF NOT EXISTS event_by_time ON event (type, t_peak);
"""


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class Store:
    def __init__(self, path: str, catalog: Catalog):
        self.cat = catalog
        self.db = sqlite3.connect(path)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)

    # ---- validation ----------------------------------------------------------
    def _check_obs(self, o: Observation) -> str | None:
        if o.subject not in self.cat.subjects:
            return f"unknown subject {o.subject!r}"
        m = self.cat.metrics.get(o.metric)
        if m is None:
            return f"unknown metric {o.metric!r}"
        if o.unit != m["unit"]:
            return f"{o.metric}: unit {o.unit!r} != catalog {m['unit']!r}"
        if o.source not in self.cat.sources:
            return f"unknown source {o.source!r}"
        return None

    # ---- writes --------------------------------------------------------------
    def write(self, batch: Batch) -> int:
        """Store one adapter batch as one run. Returns the run id."""
        if batch.source not in self.cat.sources:
            raise ValueError(f"unknown source {batch.source!r}")
        cur = self.db.execute("INSERT INTO run (source, quality, started, note) VALUES (?,?,?,?)",
                              (batch.source, batch.quality, _now(), batch.note))
        run_id = cur.lastrowid
        errors, n = [], 0
        for o in batch.observations:
            err = self._check_obs(o)
            if err:
                errors.append(err)
                continue
            self.db.execute("INSERT OR REPLACE INTO observation VALUES (?,?,?,?,?,?,?,?,?)",
                            (o.subject, o.metric, o.t, o.value, o.unit, o.source, o.quality, run_id,
                             json.dumps(o.attrs, ensure_ascii=False)))
            n += 1
        for e in batch.events:
            self.db.execute("INSERT OR REPLACE INTO event VALUES (?,?,?,?,?,?,?)",
                            (e.id, e.type, e.t_start, e.t_peak, e.source, run_id, json.dumps(e.attrs, ensure_ascii=False)))
            n += 1
        for link in batch.links:
            self.db.execute("INSERT OR REPLACE INTO event_link VALUES (?,?,?,?)",
                            (link.from_id, link.to_id, link.relation, link.source))
            n += 1
        for f in batch.forecasts:
            if f.model_id not in self.cat.models:
                errors.append(f"unknown model {f.model_id!r}")
                continue
            self.db.execute("INSERT OR REPLACE INTO forecast VALUES (?,?,?,?,?)", (f.event_id, f.model_id, f.p, f.level, f.split))
            n += 1
        self.db.execute("UPDATE run SET finished=?, ok=?, n_rows=?, rejected=?, errors=? WHERE id=?",
                        (_now(), int(not errors), n, len(errors), json.dumps(errors[:50]), run_id))
        self.db.commit()
        return run_id

    def replace_assessments(self, rows: Iterable[Assessment]) -> None:
        """Derived data: wiped and rebuilt by the engine, never edited."""
        self.db.execute("DELETE FROM assessment")
        self.db.executemany("INSERT INTO assessment VALUES (?,?,?,?,?,?,?,?)",
                            [(a.subject, a.metric, a.t, a.rule, a.severity, a.z, a.message, a.action) for a in rows])
        self.db.commit()

    # ---- reads ---------------------------------------------------------------
    def observations(self, subject: str | None = None, metric: str | None = None, since: str | None = None,
                     source: str | None = None) -> list[Observation]:
        q, args = "SELECT * FROM observation WHERE 1=1", []
        for col, val in (("subject", subject), ("metric", metric), ("source", source)):
            if val is not None:
                q += f" AND {col}=?"
                args.append(val)
        if since:
            q += " AND t>=?"
            args.append(since)
        rows = self.db.execute(q + " ORDER BY subject, metric, t", args).fetchall()
        return [Observation(r["subject"], r["metric"], r["t"], r["value"], r["unit"], r["source"], r["quality"],
                            json.loads(r["attrs"])) for r in rows]

    def events(self, type: str | None = None, since: str | None = None) -> list[Event]:
        q, args = "SELECT * FROM event WHERE 1=1", []
        if type:
            q += " AND type=?"
            args.append(type)
        if since:
            q += " AND t_peak>=?"
            args.append(since)
        rows = self.db.execute(q + " ORDER BY t_peak, id", args).fetchall()
        return [Event(r["id"], r["type"], r["t_start"], r["t_peak"], r["source"], json.loads(r["attrs"])) for r in rows]

    def links(self, relation: str | None = None) -> list[EventLink]:
        q, args = "SELECT * FROM event_link", []
        if relation:
            q += " WHERE relation=?"
            args.append(relation)
        return [EventLink(r["from_id"], r["to_id"], r["relation"], r["source"]) for r in self.db.execute(q, args)]

    def forecasts(self, model_id: str) -> dict[str, Forecast]:
        rows = self.db.execute("SELECT * FROM forecast WHERE model_id=?", (model_id,))
        return {r["event_id"]: Forecast(r["event_id"], r["model_id"], r["p"], r["level"], r["split"]) for r in rows}

    def assessments(self, subject: str | None = None) -> list[Assessment]:
        q, args = "SELECT * FROM assessment", []
        if subject:
            q += " WHERE subject=?"
            args.append(subject)
        rows = self.db.execute(q + " ORDER BY subject, t, metric", args).fetchall()
        return [Assessment(r["subject"], r["metric"], r["t"], r["rule"], r["severity"], r["z"], r["message"], r["action"])
                for r in rows]

    def runs(self) -> list[dict]:
        return [dict(r) for r in self.db.execute("SELECT * FROM run ORDER BY id")]
