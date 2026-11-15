"""The Mind layer: self-report check-ins, private journal, habits and to-dos (docs/backend/NEXT.md section 2).

schema.sql  note, task, task_event (applied by core/store.py)
records.py  Note, Task, TaskEvent + checkin_batch (the check-in adapter: POST body -> core Batch)
repo.py     reads/writes on store.db under store.lock (the only SQL in this package besides schema.sql)
engine.py   self-report scoring, system tasks, streaks/XP/badges, weekly wellbeing summary (no journal text)
plugin.py   after_build: simulated check-in history, routine tasks, engine sync
api.py      /api/checkin, POST /api/observations, /api/tasks, /api/progress, /api/notes, /api/wellbeing
"""
