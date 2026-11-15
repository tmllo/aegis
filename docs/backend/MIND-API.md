# Mind API (for Emile's 03 Mind screen)

Server: `uvicorn server.api.app:app --port 8000`. Same rule as Cabin: call `GET /api/health` first; with no server, the
screen runs on local data and keeps writes in a local queue, sent when `/api/health` answers.
Status: PROPOSED (`contracts/CHANGELOG.md`). Nothing in the three contract files changes.

**Conventions**
- `subject` is a crew id: `c1`, `c2`, `c3`. Any other subject gets **404**.
- "Today" is the mission day in `server/catalog/mission.yaml` (`2026-11-14`). Every `date` and `t` you leave out defaults
  to it. `date` is `YYYY-MM-DD`. `t` is `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM:SSZ` (UTC).
- Errors: `{"detail": "reason"}` with 404 (unknown subject or task), 403 (journal of someone else) or 422 (bad input).
  A body that does not match the model (wrong type, unknown `kind`) gives FastAPI's standard 422 with a list in `detail`.
- No generative AI anywhere. Alerts are the same personal-baseline rule as 01 Body.
- Simulated data: c1–c3 have a simulated check-in history (`quality: "simulated"`) from 1 Sep, with habits over the last
  21 days. c3's connection drops and stress rises over the last three days, so c3 shows the alert → task loop.

New metric keys (kind `self_report`, 1–5, five words each, hazard isolation, body region brain):
`self.stress` (alert on the high side), `self.energy`, `self.social`, `self.sleep_quality` (alert on the low side).
`self.mood` is unchanged.

| Method | Path | What |
|---|---|---|
| GET | `/api/catalog?kind=self_report` | metric definitions with `scale.words` (existing core route) |
| GET | `/api/checkin?subject=c1&date=` | the check-in form: 5 scores, words, today's values |
| POST | `/api/observations` | one check-in score |
| GET | `/api/tasks?subject=c1&date=` | the day's tasks with `origin`, `done`, `streak` |
| POST | `/api/tasks` | create a self habit or to-do |
| POST | `/api/tasks/{id}/events` | mark done / skipped |
| GET | `/api/progress?subject=c1&date=` | XP, level, streaks, badges |
| POST / GET | `/api/notes?subject=c1` | journal, header `X-Crew-Member: c1` required |
| GET | `/api/wellbeing?subject=c1&days=28&end=` | weekly summary, counts only, never journal text |
| GET | `/api/activities?subject=c1&date=` | self-help activities, the ones that help an open alert first |
| POST | `/api/activities/{id}/events` | log an activity as done (`{subject, t?}`) |

---

## GET /api/catalog?kind=self_report
Existing route. Returns `{metrics, subjects, sources}`; the self-report metrics now carry `scale`.
`self.mood`'s words come from `/api/checkin` until the catalog gets them (`REQUESTS.md`).
```json
{"metrics": [{
  "key": "self.stress", "label": "Stress (1–5)", "unit": "/5", "kind": "self_report",
  "hazard": "isolation", "body_region": "brain",
  "scale": {"min": 1, "max": 5, "words": ["Calm", "Settled", "Some pressure", "Strained", "Overwhelmed"]},
  "rule": {"type": "baseline_z", "high_side_only": true, "sd_floor": 0.6},
  "explain": "Sustained stress in isolation and confinement wears down sleep, attention and team work. ...",
  "how_to_measure": "Daily self-rating: 1 = calm, 5 = overwhelmed.",
  "actions": {"amber": "Take a 10-minute break off task and try the guided breathing module tonight. Re-rate tomorrow.",
              "red": "Tell the commander and book a private conference with the flight psychologist."}}, "..."],
 "subjects": ["..."], "sources": ["..."]}
```

## GET /api/checkin?subject=c3
The form in screen order. `value` is that day's latest score (any source), or `null`.
```json
{"subject": "c3", "date": "2026-11-14", "metrics": [
  {"key": "self.mood", "label": "Mood (1–5)", "unit": "/5",
   "scale": {"min": 1, "max": 5, "words": ["Very low", "Low", "Okay", "Good", "Great"]}, "value": 4},
  {"key": "self.stress", "label": "Stress (1–5)", "unit": "/5",
   "scale": {"min": 1, "max": 5, "words": ["Calm", "Settled", "Some pressure", "Strained", "Overwhelmed"]}, "value": 5.0},
  {"key": "self.energy", "...": "...", "value": 4.0},
  {"key": "self.social", "label": "Social connection (1–5)", "unit": "/5",
   "scale": {"min": 1, "max": 5, "words": ["Cut off", "Distant", "Okay", "Connected", "Close"]}, "value": 2.0},
  {"key": "self.sleep_quality", "...": "...", "value": 4.0}]}
```

## POST /api/observations
One score per request (send five for a full check-in). `t` is optional. Accepts the five check-in keys and also a crew
re-measure (any `crew_daily` key such as `vital.bp_sys`, which closes that metric's system task). Values outside the
1–5 scale get 422. `GET /api/observations` is unchanged and still returns exactly `[{metric, t, value, quality}]`.
```http
POST /api/observations
{"subject": "c1", "metric": "self.social", "t": "2026-11-14T10:00:00Z", "value": 1}
```
`201`
```json
{"stored": {"metric": "self.social", "t": "2026-11-14T10:00:00Z", "value": 1.0, "quality": "live"},
 "assessment": {"severity": "amber", "z": -2.22,
                "message": "Social connection (1–5) 3-day average 2.2σ below your own baseline",
                "action": "Schedule a call home and share a meal with the crew today.", "t": "2026-11-14"},
 "opened_tasks": ["sys-c1-self.social-2026-11-14"],
 "closed_tasks": []}
```
**Verify rule:** a task opened by a check-in score closes only when a newer reading of that score is no longer flagged.
A check-in that is still low leaves it open. A re-rating on the same day (same or later `t`) replaces the earlier rating.
A vitals task (`vital.*`) closes on any newer reading.
`assessment` is `null` when the score is within the person's usual range. The five check-in scores (mood included) are
scored live on every POST; on a day with a live check-in it replaces the simulated value. A crew re-measure
(`vital.*`) is not re-scored live (that happens at build); it only closes the open task, and `assessment` shows the
build-time one. Impossible dates (`2026-02-30`), non-finite or negative values give 422. A later reading of the same metric closes the
open system task: the same POST with `"t": "2026-11-14T21:00:00Z", "value": 4` returns
`"closed_tasks": ["sys-c1-self.social-2026-11-14"]` (Detect → Notify → Verify).
Error: `{"subject": "c1", "metric": "self.stress", "value": 7}` → `422 {"detail": "self.stress: value 7 outside 1-5"}`.

## GET /api/tasks?subject=c1&date=2026-11-14
Order: `system` (from alerts) first, then `routine` (catalog habits), then `self`. Habits appear on their scheduled days.
To-dos appear until finished, and on the day they are finished.
`done` is true for `done` and `closed` (system task closed by a new reading). `streak` counts consecutive scheduled days
done; an un-ticked today does not break it. The check-in and journal habits (`attrs.auto`) tick themselves when a
check-in or journal entry exists that day.
```json
{"subject": "c1", "date": "2026-11-14", "tasks": [
  {"id": "sys-c1-vital.bp_sys-2026-11-14", "kind": "todo", "origin": "system", "metric": "vital.bp_sys",
   "label": "Repeat the measurement tonight. Review salt and fluid intake.",
   "schedule": null, "due": "2026-11-15", "created": "2026-11-14", "done": false, "status": null, "streak": 0,
   "attrs": {"severity": "amber", "z": 2.54,
             "message": "Systolic blood pressure 3-day average 2.5σ above your own baseline for 3 days",
             "assessment_t": "2026-11-14", "evidence_t": "2026-11-14", "rule": "baseline_z@3d"}},
  {"id": "routine-c1-checkin", "kind": "habit", "origin": "routine", "metric": "self.mood",
   "label": "Daily check-in (mood, stress, energy, connection, sleep)",
   "schedule": "daily", "due": null, "created": "2026-09-01", "done": true, "status": "done", "streak": 75,
   "attrs": {"routine": "checkin", "auto": "checkin",
             "basis": "NASA lists isolation and confinement among the five hazards of human spaceflight; ..."}},
  "..."]}
```
`status` is `null | "done" | "skipped" | "closed"`. `attrs.basis` is the reason for a routine habit (show it on tap).

## POST /api/tasks
`origin` is always `self`. `kind`: `"todo"` (default; `due` defaults to today) or `"habit"` (`schedule` is `"daily"`,
the default, or `"days:mon,thu"`). `metric` is optional and must be a catalog key.
```http
POST /api/tasks
{"subject": "c1", "label": "Stretch before the EVA prep", "kind": "habit", "schedule": "days:mon,thu"}
```
`201`
```json
{"id": "self-c1-07b665fe", "kind": "habit", "label": "Stretch before the EVA prep", "origin": "self", "metric": null,
 "schedule": "days:mon,thu", "due": null, "created": "2026-11-14", "done": false, "status": null, "streak": 0, "attrs": {}}
```

## POST /api/tasks/{id}/events
`status`: `"done"` or `"skipped"` (`"closed"` is set by the server only, so it gives 422). `t` is optional. Posting again
for the same task and `t` replaces the status. An unknown id gives 404.
```http
POST /api/tasks/routine-c1-hydration/events
{"status": "done"}
```
`201`
```json
{"task_id": "routine-c1-hydration", "t": "2026-11-14", "status": "done",
 "task": {"id": "routine-c1-hydration", "kind": "habit", "label": "Hydration (drink to plan)", "origin": "routine",
          "metric": null, "schedule": "daily", "due": null, "created": "2026-09-01",
          "done": true, "status": "done", "streak": 6, "attrs": {"routine": "hydration", "basis": "..."}},
 "xp": 975}
```

## GET /api/progress?subject=c1
XP rules live in `server/catalog/routines.yaml`: 10 per self or routine task done, 20 per system task done or closed,
5 per check-in day, 5 per journal day. Level = 1 + xp // 100. `best_habit_streak` leaves out the two auto habits.
```json
{"subject": "c1", "date": "2026-11-14", "xp": 975, "level": 10, "level_xp": 900, "next_level_xp": 1000,
 "checkin_streak": 75, "checkin_days": 75, "best_habit_streak": 7,
 "streaks": {"routine-c1-call_home": 1, "routine-c1-checkin": 75, "routine-c1-exercise": 6, "routine-c1-hydration": 6,
             "routine-c1-journal": 0, "routine-c1-sleep_window": 7, "self-c1-07b665fe": 0},
 "system_tasks_closed": 0, "journal_days": 0,
 "badges": [{"id": "first_checkin", "label": "First check-in", "earned": true},
            {"id": "week_streak", "label": "Seven-day check-in streak", "earned": true},
            {"id": "month_streak", "label": "28-day check-in streak", "earned": true},
            {"id": "closed_loop", "label": "Closed the loop (acted on an alert)", "earned": false},
            {"id": "habit_keeper", "label": "A habit kept seven days running", "earned": true}]}
```

## POST / GET /api/notes?subject=c1   (journal, private)
Both need header `X-Crew-Member` equal to `subject`; otherwise you get
`403 {"detail": "journal is private to its crew member"}`. This is a device-level guard for the demo, not real
authentication. `text` is 1–4000 characters. Use at most 10 `tags`, chosen by the astronaut (never inferred). Journal
text appears only here: never in `/api/wellbeing`, `/api/progress`, `/api/tasks`, any ground view or any `/data/*.json`
(a test checks this).
```http
POST /api/notes?subject=c1
X-Crew-Member: c1
{"text": "Long day in the lab. Good call with my sister.", "tags": ["family"]}
```
`201`
```json
{"subject": "c1", "id": "note-532f0aba4402", "t": "2026-11-14", "kind": "journal",
 "text": "Long day in the lab. Good call with my sister.", "tags": ["family"], "private": true}
```
`GET /api/notes?subject=c1&since=2026-11-01` (same header) →
```json
{"subject": "c1", "notes": [{"id": "note-532f0aba4402", "t": "2026-11-14", "kind": "journal",
  "text": "Long day in the lab. Good call with my sister.", "tags": ["family"], "private": true}]}
```

## GET /api/wellbeing?subject=c3&days=14
For the private conference: weekly means of the five scores plus hours slept, check-in days and journal counts, and
self-report alerts in the window. `days` is 7–90 (default 28). Weeks are 7-day blocks ending at `end` (default today),
oldest first. `mean` averages the daily values, and `n` is the number of days with a value.
```json
{"subject": "c3", "from": "2026-11-01", "to": "2026-11-14", "days": 14,
 "weeks": [
  {"from": "2026-11-01", "to": "2026-11-07", "checkin_days": 7, "journal_entries": 0,
   "scores": {"self.mood": {"mean": 3.86, "n": 7}, "self.stress": {"mean": 2.14, "n": 7},
              "self.energy": {"mean": 3.43, "n": 7}, "self.social": {"mean": 3.86, "n": 7},
              "self.sleep_quality": {"mean": 3.86, "n": 7}, "self.sleep_h": {"mean": 6.01, "n": 7}}},
  {"from": "2026-11-08", "to": "2026-11-14", "checkin_days": 7, "journal_entries": 0,
   "scores": {"self.mood": {"mean": 4.86, "n": 7}, "self.stress": {"mean": 3.0, "n": 7}, "...": "..."}}],
 "trend": {"self.social": {"first": 3.86, "last": 3.29, "change": -0.57},
           "self.stress": {"first": 2.14, "last": 3.0, "change": 0.86}, "...": "..."},
 "checkin_streak": 75, "journal_entries": 0,
 "alerts": [
  {"metric": "self.social", "t": "2026-11-14", "severity": "red",
   "message": "Social connection (1–5) 3-day average 3.2σ below your own baseline"},
  {"metric": "self.stress", "t": "2026-11-14", "severity": "red",
   "message": "Stress (1–5) 3-day average 4.0σ above your own baseline"}, "..."],
 "journal_text_included": false}
```

## App compatibility (added 2026-11-15 04:25)
- `POST /api/tasks` accepts an optional `id` (1-64 letters, digits, `-`, `_`). Offline-first apps make the id on the device; the server keeps it, and sending the same task twice returns the existing one instead of a duplicate. Another crew member's id gives 409.
- `POST /api/tasks/{id}/events` accepts the app's routine names: `routine-c1-check-in`, `-exercise-block`, `-sleep-window`, `-hydration`, `-journal-line`, `-call-home` map to the server's routines through `aliases` in `server/catalog/routines.yaml`.
- Tested by `server/tests/test_mind_app_compat.py`, which replays `web/src/data/mind.ts`.

## GET /api/activities?subject=c3
The 14 self-help activities in `server/catalog/activities.yaml`. Each carries our own steps and the source it is based on:
WHO Doing What Matters / Self-Help Plus, VA PTSD Coach and ACT Coach, HI-SEAS Virtual Space Station and nature VR,
NASA BHP. An activity whose `helps` includes a metric with an open alert is `suggested`, and suggested ones come first
(red before amber). `because` names the alert and its system task. The same ids are also on each system task as
`attrs.activities`. This is a fixed rule with no inference.
```json
{"subject": "c3", "date": "2026-11-14",
 "open_alerts": [
  {"task_id": "sys-c3-self.social-2026-11-14", "metric": "self.social", "severity": "red", "t": "2026-11-14",
   "message": "Social connection (1–5) 3-day average 3.2σ below your own baseline"},
  {"task_id": "sys-c3-self.stress-2026-11-14", "metric": "self.stress", "severity": "red", "t": "2026-11-14",
   "message": "Stress (1–5) 3-day average 4.0σ above your own baseline"}],
 "activities": [
  {"id": "paced_breathing", "label": "Paced breathing", "minutes": 4, "category": "calm", "with": "solo",
   "helps": ["self.stress", "self.sleep_quality"],
   "steps": ["Sit or float somewhere you can stay still for a few minutes.",
             "Breathe in slowly through your nose for a count of four.",
             "Breathe out gently for a count of six, letting your shoulders drop.",
             "Repeat for about four minutes, coming back to the count when your mind wanders."],
   "basis": "Slow, paced breathing is one of the relaxation tools in the VA PTSD Coach app, used for stress in the moment.",
   "source": "VA National Center for PTSD, PTSD Coach (relaxation tools)",
   "url": "https://mhealth.amegroups.org/article/view/20524/20219",
   "suggested": true,
   "because": [{"metric": "self.stress", "severity": "red", "task_id": "sys-c3-self.stress-2026-11-14"}],
   "done_today": false, "times_done": 0},
  "... 13 more (suggested first)"]}
```
`category` is one of `calm`, `thoughts`, `values`, `connection`, `sleep`, `energy` or `conflict`. `with` is `solo`, `crew` or
`ground` (ground needs a call slot).

## POST /api/activities/{id}/events
Logs one activity as done. It is stored as a done event on the crew member's activity task
(`activity-<subject>-<id>`, origin `self`), so it earns task XP (10). It never closes an alert: only a new reading does.
An unknown activity or subject gives 404. A bad `t` gives 422.
```http
POST /api/activities/private_call_home/events
{"subject": "c3"}
```
`201`
```json
{"activity_id": "private_call_home", "task_id": "activity-c3-private_call_home", "t": "2026-11-14", "status": "done",
 "times_done": 1, "xp": 925}
```
