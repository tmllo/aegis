# Live lane: fresh data and check-ins

Code: `server/api/refresh.py`, `server/api/routes/live.py`, `server/adapters/checkin.py`. The build is split into `build.build()` (load + derive) and `build.derive()` (derive only). Tests: `server/tests/test_live.py`.

## Keeping data fresh
When the API starts, it builds once and then starts one background thread. Every adapter whose source has a timed `cadence` in the catalog is re-run on that cadence:

| cadence | re-run every |
|---|---|
| `5 min`, `15 min`, `30 s`, `2 h` | that long |
| `hourly`, `daily` | 1 h, 24 h |
| `stream` | `AEGIS_STREAM_POLL_S` (default 60 s) |
| `on build`, `static`, `on input` | never |

Each pass works like this. `adapter.load()` runs with no lock held, so a slow feed blocks no request. Then `store.write()` takes `store.lock`, and `build.derive()` rebuilds assessments, plugin rows and the three contract views under the same lock. The new `/data/*.json` set is swapped in as a whole. If an adapter fails, its previous rows stay and it is retried on its next cadence. The space-weather adapters (`donki` 15 min, `swpc` 5 min, `hapi` daily) are picked up automatically when they land.

The store is the same SQLite file the whole time. The default is `server/data/aegis.db` (gitignored); set `AEGIS_DB` to change it, or `:memory:` for a throwaway store. At startup every adapter is loaded into that file again with INSERT OR REPLACE on the same keys. A refresh only adds a run. Neither recreates the store or deletes from a fact table (observation, event, forecast, or a plugin's note, task, task_event or sleep_session), so check-ins and notes survive both a refresh and a restart. The only table that is wiped and rebuilt is the derived `assessment` table. `AEGIS_REFRESH=0` turns the thread off. `server/tests/conftest.py` makes tests use `:memory:` with no thread.

```
GET /api/refresh
{"jobs": [{"source": "isslive", "every_s": 60.0, "next_in_s": 59.8, "runs": 0, "last_run": null,
           "last_rows": null, "last_rejected": null, "last_error": null}]}

POST /api/refresh                 (all polled sources now; ?source=isslive for one; 404 if not polled)
{"refreshed": ["isslive"], "jobs": [{"source": "isslive", "every_s": 60.0, "next_in_s": 59.9, "runs": 1,
           "last_run": 7, "last_rows": 10, "last_rejected": 0, "last_error": null}]}
```

## Check-in: `POST /api/observations`
A check-in goes through `server/adapters/checkin.py` and then the same `store.write` validation as every source. The stored row has `source: "checkin"` and `quality: "live"`. The adapter refuses these with a 422 before the store sees them:
- a subject that is not a `crew_sim` member
- a metric that is not `self.*` or of kind `self_report`
- a value that is not a finite number (strings and booleans are refused too)
- a `unit` that differs from the catalog unit
- a `t` that is not ISO 8601, or a time with no timezone
- a value outside the metric's optional `valid: {min, max}`

`t` defaults to now and is stored in UTC.

```
POST /api/observations
{"subject": "c1", "metric": "self.mood", "t": "2026-11-15", "value": 4}

200
{"subject": "c1", "metric": "self.mood", "t": "2026-11-15", "value": 4.0, "unit": "/5",
 "source": "checkin", "quality": "live", "run_id": 6, "assessments": []}

POST /api/observations
{"subject": "c1", "metric": "cabin.ppo2", "value": 4}

422
{"detail": "metric 'cabin.ppo2' is not a self-report metric"}
```

`assessments` lists the engine's flags for that subject, metric and day after the re-derive. It stays empty until the engine scores check-in rows (see `docs/backend/REQUESTS.md`, `crew_series`). The response to `GET /api/observations` does not change: the check-in appears there as `{metric, t, value, quality: "live"}`.

## Run
```
powershell -ExecutionPolicy Bypass -File server/run.ps1                    # http://127.0.0.1:8000, store server/data/aegis.db
powershell -ExecutionPolicy Bypass -File server/run.ps1 -Db server/data/demo.db -Port 8001
podman build -f server/Containerfile -t aegis-api .  ;  podman run -p 8000:8000 aegis-api
```
