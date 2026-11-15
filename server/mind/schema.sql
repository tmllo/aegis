-- Mind layer tables (docs/backend/NEXT.md 2.1). Applied by server/core/store.py on every Store().
-- Self-report scores are NOT here: they are rows in the core observation table (kind self_report).

-- Journal. Private by default: text never reaches a ground view, a contract file or /api/wellbeing.
CREATE TABLE IF NOT EXISTS note (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  t TEXT NOT NULL,                       -- ISO 8601 UTC
  kind TEXT NOT NULL DEFAULT 'journal',  -- journal
  text TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',       -- JSON list, chosen by the astronaut, never inferred
  private INTEGER NOT NULL DEFAULT 1);
CREATE INDEX IF NOT EXISTS note_by_subject ON note (subject, t);

-- Habits (recurring: schedule) and to-dos (one-off: due).
CREATE TABLE IF NOT EXISTS task (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  kind TEXT NOT NULL,                    -- habit | todo
  label TEXT NOT NULL,
  schedule TEXT,                         -- habit: "daily" | "days:mon,wed"; todo: NULL
  due TEXT,                              -- todo: YYYY-MM-DD; habit: NULL
  origin TEXT NOT NULL,                  -- self | routine | system
  metric TEXT,                           -- optional catalog metric key
  created TEXT NOT NULL,                 -- ISO 8601 UTC or mission day
  attrs TEXT NOT NULL DEFAULT '{}');     -- JSON: basis, routine id, severity, assessment ref
CREATE INDEX IF NOT EXISTS task_by_subject ON task (subject, origin);

-- Completions in time. Streaks are derived, never stored.
CREATE TABLE IF NOT EXISTS task_event (
  task_id TEXT NOT NULL REFERENCES task(id),
  t TEXT NOT NULL,
  status TEXT NOT NULL,                  -- done | skipped | closed (closed = system task, newer reading arrived)
  PRIMARY KEY (task_id, t));
