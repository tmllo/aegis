# Next: integrate with Emile's app + the Mind layer

Written 2026-11-15 ~03:45 CET (Tomas + Claude). Backup of the data core before this: branch `backup/data-core-0335`.
Reads with: `docs/backend/DATA-CORE.md` (the core), `web/SPEC.md` (Emile's app), `contracts/CHANGELOG.md`.

## 1. What Emile's app needs from us today (read from web/, commit 4f781f5)
| App part | Calls | Our status |
|---|---|---|
| `src/data/http.ts` | `GET /api/health` (any JSON = server present) | Missing: S4 |
| 02 Cabin (`src/data/cabin.ts`) | `GET /api/observations?subject=iss&kind=cabin` → `[{ metric, t, value, quality }]` | Store has it (10 recorded rows), endpoint missing |
| 02 Cabin limits | `web/public/samples/cabin_catalog.json` (bands, NASA/Team source, refs) | Duplicates our catalog: move the bands into `server/catalog/metrics.yaml`, generate his file as a view |
| 02 Cabin storm feed + dose | `data/storm_forecast.json`, `data/crew_data.json` | Served identical by the core |
| 01 Body (7 plates) | `data/crew_data.json` | Served identical |

Mismatch to fix on our side: his key `cabin.water_waste`, ours `cabin.waste_water`. We rename ours (his is the one the screen uses). He also lists `cabin.co` and `cabin.humidity` as "not connected": add both to the catalog with `rule: display_only`, `connected: false`.

## 2. The Mind layer (new): behavioural health, journal, habits, to-dos
Why: isolation and confinement is one of NASA's five hazards, and on long missions the crew has to look after its own mental state between private psychological conferences with the ground. The challenge asks for mood, prompts to measure as part of the routine, and gamification. This layer covers all three.

### 2.1 Same core, three new kinds of fact
| Fact | Where | Why it is a separate table |
|---|---|---|
| Self-report scores (mood, stress, energy, social connection, sleep quality) | `observation`, like every other reading. New catalog metrics, kind `self_report`, hazard `isolation`, body region `brain`, rule `baseline_z` (stress high side, the others low side only) | They are numbers on a scale, so they get personal baselines and alerts for free |
| Journal entries | new table `note (id, subject, t, kind, text, tags[], private)` | Free text is not a number. Private by default: the text never leaves the device or reaches a view for the ground |
| Habits and to-dos | new tables `task (id, subject, kind, label, schedule, due, origin, metric, created)` and `task_event (task_id, t, status)` | A habit is a recurring task, a to-do a one-off task. Completions are events in time; streaks are derived |

`task.origin` is `self` (the astronaut made it), `routine` (from the catalog) or `system` (the engine made it from an alert). `task.metric` optionally links a task to a metric (re-measure blood pressure → `vital.bp_sys`).

### 2.2 Catalog additions
- `metrics.yaml`: `self.stress`, `self.energy`, `self.social`, `self.sleep_quality` (1-5, labelled words on every step, no emojis), existing `self.mood` stays.
- `routines.yaml` (new): default habits with their basis. Examples: daily check-in, exercise block (ISS crews exercise about 2 h a day, PROJECT_CONTEXT section 10, verify before a slide), sleep window, hydration, one journal line, call home (social connection). Each with `schedule`, `metric` link if any, and `basis`.

### 2.3 Engine additions (`server/engine/routines.py`)
- Streaks and XP per astronaut from `task_event` and check-ins (gamification).
- System tasks from alerts: every amber or red assessment creates a task from the metric's catalog action ("Repeat the measurement tonight") linked to that metric, closed automatically when a new reading comes in. This turns the alert rule into a routine the astronaut can act on: Detect → Notify → Verify.
- Behavioural summary for the private conference: weekly trend of the five self-report scores, sleep, check-in streak, journal count. Never the journal text.
- No generative AI anywhere in scoring or alerts (thesis rule). Journal tags are chosen by the astronaut, not inferred.

### 2.4 API (what Emile's 03 Mind screen calls)
| Method | Path | Body / returns |
|---|---|---|
| GET | `/api/catalog?kind=self_report` | metric definitions with scale words |
| POST | `/api/observations` | `{ subject, metric, t, value }` (check-in scores; goes through the check-in adapter, same validation) |
| GET | `/api/tasks?subject=c1&date=YYYY-MM-DD` | today's tasks with `origin`, `done`, `streak` |
| POST | `/api/tasks` | create a self task or habit |
| POST | `/api/tasks/{id}/events` | `{ t, status: "done" \| "skipped" }` |
| GET | `/api/progress?subject=c1` | XP, streaks, badges |
| POST / GET | `/api/notes?subject=c1` | journal entries, only for the same device or crew member; never in any ground view |
| GET | `/api/wellbeing?subject=c1&days=28` | the behavioural summary |
Offline: the app keeps writes in a local queue and sends them when the server answers `/api/health`. The demo works with no server (local only).

## 3. Priorities, by fit with what Emile built
| # | What | Why now | Lane |
|---|---|---|---|
| 1 | Server API: `/api/health`, `/api/observations` (his exact shape), `/api/catalog`, static app, `/data/*.json` from views | His Cabin screen already calls it | T1 |
| 2 | Cabin alignment + live ISS: rename `water_waste`, bands into our catalog, `cabin.co`/`humidity` not connected, live `isslive` adapter, view that writes his `cabin_catalog.json` | Turns his Cabin screen live, one source of truth for limits | T2 |
| 3 | Mind layer backend (section 2) + `docs/backend/MIND-API.md` for Emile | New screen 03 Mind; covers isolation, routine prompts, gamification | T3 |
| 4 | Live space weather: `donki` + `swpc` adapters, `engine/forecast.py`, split `live` | His Cabin screen already has the storm feed | Claude |
| 5 | Inspiration4 "lab says normal, own baseline says no" card | Data in the store; one card on 01 Body | Emile |
| 6 | Measured Mars and Moon dose (`hapi`) | Crew dose already on 02 Cabin | later |
| 7 | Two-device ground link, Systems screen | Needs 1 first | later |
