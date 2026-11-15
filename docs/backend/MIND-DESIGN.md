# Mind layer: internal design (server/mind/)

For the backend lanes. Emile reads `MIND-API.md`. Source of truth for what to build: `NEXT.md` section 2.

## Files and who calls whom
```
records.py  Note, Task, TaskEvent, checkin_batch(cat, subject, metric, t, value) -> Batch   (written)
repo.py     SQL on store.db under store.lock                                                (written)
engine.py   scoring, system tasks, streaks/XP/badges, wellbeing. Reads via repo + store, writes via repo + store.write
plugin.py   after_build(cat, store): simulated history, routine tasks, engine.sync
api.py      router = APIRouter(); thin: parse, call engine/repo, return dicts. No SQL, no scoring.
```
Arrows only go right: api -> engine -> repo/store. The engine never formats an HTTP response (it returns plain dicts
of data; api.py may return them as-is). No generative AI anywhere.

## The mission day
"Today" is `cat.mission["today"]` (2026-11-14), the simulated mission day. Every default date, `created` and event `t`
falls back to it. Days are `t[:10]`. Weekday of a day: `datetime.date.fromisoformat(d).weekday()` -> `records.WEEKDAYS`.

## engine.py: the interface (exact names, used by plugin.py, api.py and tests)
```python
def today(cat) -> str                                          # cat.mission["today"]
def checkin_days(cat, store, subject) -> set[str]              # days with any obs of records.checkin_metrics(cat) from sources checkin or mind_sim
def score_self_report(cat, store, subject) -> list[Assessment]
def sync(cat, store, subject: str | None = None) -> dict        # {"opened": [task ids], "closed": [task ids]}
def ensure_routines(cat, store) -> int                         # rows created
def task_view(cat, store, task, date) -> dict                  # one task as the API shows it on that day
def tasks_for_day(cat, store, subject, date) -> list[dict]
def progress(cat, store, subject, date=None) -> dict
def wellbeing(cat, store, subject, days=28, end=None) -> dict
def checkin_form(cat, store, subject, date=None) -> dict
```

### score_self_report
For every metric with `kind == "self_report"` (not self.mood: it is crew_daily and scored by engine/scoring.py).
Per day, the mean of that subject's values that day (any source). Constants from `cat.mission["scoring"]`:
baseline = mean and sample sd (n-1) of the first `baseline_days` days that have a value, sd raised to `rule.sd_floor`,
needs >= 3 values. z on day d = (mean of the daily values on days d-2..d that exist - baseline mean) / sd.
Side: `rule.low_side_only` -> score = -z; `rule.high_side_only` -> score = z; else |z|. amber at `amber_z`, red at `red_z`.
Only days within the last `report_last_days` days ending at the subject's latest day for that metric.
Assessment(subject, metric, t=day, rule="baseline_z@3d", severity, z=round(z,2),
message=f"{label} 3-day average {abs(z):.1f}σ {'above' if z>0 else 'below'} your own baseline", action=metric["actions"][severity]).

### sync(cat, store, subject=None)
For each crew_sim subject (or just `subject`):
1. `repo.replace_assessments_for(store, s, self_report_keys, score_self_report(...))`.
2. System tasks: from `store.assessments(s)` (all metrics), the latest assessment per metric. Task id
   `f"sys-{s}-{metric}-{t[:10]}"`, kind `todo`, origin `system`, label = assessment.action, metric, created = t[:10],
   due = next day, attrs `{"severity", "z", "message", "assessment_t": t, "evidence_t", "rule"}`, where evidence_t =
   the newest stored reading of that metric when the task opens. `repo.put_task(..., replace=False)`;
   ids actually written go in "opened".
3. Close: each system task of s with no event yet: if `store.observations(subject=s, metric=task.metric)` has any row
   with `o.t > task.attrs["evidence_t"]` (plain string compare, so "2026-11-14T21:00:00Z" > "2026-11-14T10:00:00Z"), add
   `TaskEvent(id, <earliest such o.t>, "closed")`; id goes in "closed".

### ensure_routines
For each crew_sim subject and each `cat.extra["routines"]["routines"]` entry: Task id `f"routine-{s}-{r['id']}"`,
kind `habit`, origin `routine`, label, schedule, metric (or None), created = `cat.mission["start_date"]`,
attrs `{"routine": r["id"], "basis": r["basis"]}` plus `"auto": "checkin"` for id checkin and `"auto": "journal"` for id journal.

### Done-ness of a task on a day (task_view)
- habit: scheduled on d if `schedule == "daily"` or d's weekday is in `days:...`, and `created[:10] <= d`.
  status on d = the latest event of that task whose day == d (None if none). Auto habits are also "done" on d
  when d is in checkin_days (auto checkin) or note_days (auto journal) - derived, not stored.
  streak = consecutive scheduled days with done, ending at d if d is done, else ending at the previous scheduled day
  (so an un-ticked today does not break the streak). Unscheduled days are skipped, not breaks.
- todo: status = latest event with day <= d (None if none). streak = 0.
- done = status in ("done", "closed").
task_view returns
`{"id","kind","label","origin","metric","schedule","due","created","done","status","streak","attrs"}`.

### tasks_for_day
habits scheduled on d, plus todos with `created[:10] <= d` that are either unfinished (no event with day < d) or
finished on d. Order: system first, then routine, then self; then label.

### progress(cat, store, subject, date=None)  (date defaults to today)
XP from `routines.yaml xp`: task_done x (done events of self/routine tasks that are not auto) +
system_task_done x (system tasks with a done or closed event) + checkin_day x len(checkin_days <= date) +
journal_day x days with notes. level = 1 + xp // level_every.
```
{"subject","date","xp","level","level_xp","next_level_xp",
 "checkin_streak","checkin_days","best_habit_streak","streaks": {task_id: streak on date, habits only},
 "system_tasks_closed","journal_days",
 "badges": [{"id","label","earned": bool}]}
```
best_habit_streak = the best streak among habits that are not auto (check-in and journal habits have their own XP and
badges). level_xp / next_level_xp = (level-1)*level_every / level*level_every.
checkin_streak = consecutive days ending at date (or date-1 if date has no check-in yet). Badge rules (routines.yaml):
checkin_days, checkin_streak, system_tasks_closed, best_habit_streak: earned when the value >= the threshold.

### wellbeing(cat, store, subject, days=28, end=None)   NEVER journal text
Window = the `days` days ending at end (default today). Blocks of 7 days ending at `end` (oldest first; a partial
oldest block is fine). Scores: records.checkin_metrics(cat) (5 self-reports incl. self.mood) plus `self.sleep_h`.
```
{"subject","from","to","days",
 "weeks": [{"from","to","scores": {metric: {"mean": float|None (2 dp), "n": int}}, "checkin_days": int, "journal_entries": int}],
 "trend": {metric: {"first": mean of first week, "last": mean of last week, "change": last-first (2 dp)}},
 "checkin_streak": int, "journal_entries": int (window total),
 "alerts": [{"metric","t","severity","message"}]   (assessments of the 5 scores + self.sleep_h in the window),
 "journal_text_included": false}
```

### checkin_form(cat, store, subject, date=None)
`{"subject","date","metrics": [{"key","label","unit","scale": {"min","max","words"}, "value": latest value that day or None}]}`
in `records.checkin_metrics(cat)` order, scale from `records.scale_of`.

## plugin.after_build(cat, store)
1. Simulated check-in history (source `mind_sim`, quality `simulated`, `random.Random(f"mind-{subject}")`): every day
   from mission start_date to today, each crew_sim subject, integer 1-5 for self.stress/energy/social/sleep_quality
   around a personal level with small noise. Scripted demo drift: c3 `self.social` on the last 3 days is 2, 2, 2 and
   c3 `self.stress` on the last 3 days is 4, 4, 5 so the engine flags them (no other hard-coded alert). One
   `store.write(Batch(...))` per build, rejected must be 0.
2. `engine.ensure_routines`.
3. Simulated habit history: for days before today, done events on routine habits exercise, hydration, sleep_window,
   call_home with a deterministic ~85 % hit rate (same seeded Random). Nothing for today, so the demo can tick it.
4. `engine.sync(cat, store)`.

## api.py
Every subject must be a crew_sim subject, else 404. Errors: 422 with `{"detail": reason}` (HTTPException).
- `GET  /api/checkin?subject=c1&date=` -> engine.checkin_form
- `POST /api/observations` body `{subject, metric, t?, value}` (t defaults to today) -> store.write(checkin_batch(...));
  if the run has rejected > 0 -> 422 with its error; then `engine.sync(cat, store, subject)`.
  201 `{"stored": {"metric","t","value","quality"}, "assessment": {latest assessment of that metric on that day as
  {"severity","z","message","action","t"}} | None, "opened_tasks": [...], "closed_tasks": [...]}`.
  (GET /api/observations stays the core route, untouched.)
- `GET  /api/tasks?subject=c1&date=` -> `{"subject","date","tasks": engine.tasks_for_day(...)}`
- `POST /api/tasks` body `{subject, label, kind: "habit"|"todo" (default todo), schedule?, due?, metric?}`. origin
  always `self`. habit needs a valid schedule (records.valid_schedule), default "daily"; todo due default today.
  metric must be in the catalog if given. id `f"self-{subject}-{uuid4().hex[:8]}"`, created today.
  201 -> engine.task_view(task, today).
- `POST /api/tasks/{id}/events` body `{t?, status: "done"|"skipped"}` (t default today; "closed" rejected 422).
  404 unknown id. 201 `{"task_id","t","status","task": task_view on day(t),"xp": progress xp}`.
- `GET  /api/progress?subject=c1&date=` -> engine.progress
- `POST /api/notes?subject=c1` body `{text, tags?: [str], t?}`; `GET /api/notes?subject=c1&since=`.
  Both require header `X-Crew-Member` equal to subject, else 403 "journal is private to its crew member".
  Text 1..4000 chars, tags <= 10 strings. id `f"note-{uuid4().hex[:12]}"`. POST 201 the note; GET
  `{"subject","notes":[{"id","t","kind","text","tags","private"}]}`.
- `GET  /api/wellbeing?subject=c1&days=28&end=` -> engine.wellbeing (days 7..90, else 422).
Use pydantic models (fastapi ships pydantic) for the bodies. Get cat/store from `server.api.deps`.
