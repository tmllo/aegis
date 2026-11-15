# Live lane: fresh data and check-ins

Code: `server/api/refresh.py`, `server/api/routes/live.py`, `server/api/deps.py` (store, `LockedStore`). The build is split into `build.build()` (load + derive) and `build.derive()` (derive only). Tests: `server/tests/test_live.py`.

## Keeping data fresh
When the API starts, it builds once and then starts one background thread. Every adapter whose source has a timed `cadence` in the catalog is re-run on that cadence:

| cadence | re-run every |
|---|---|
| `5 min`, `15 min`, `30 s`, `2 h` | that long |
| `hourly`, `daily` | 1 h, 24 h |
| `stream` | `AEGIS_STREAM_POLL_S` (default 60 s) |
| `on build`, `static`, `on input` | never |

Each pass works like this. If a recorded or cached batch is identical to the last one (the ISS snapshot every 60 s, for example), it is skipped: no run row is added and nothing is re-derived. `adapter.load()` runs with no lock held, so a slow feed blocks no request. Then `store.write()` takes `store.lock`, and `build.derive()` rebuilds assessments, plugin rows and the three contract views under the same lock. The new `/data/*.json` set is swapped in as a whole. If an adapter fails, its previous rows stay and it is retried on its next cadence. The space-weather adapters (`donki` 15 min, `swpc` 5 min, `hapi` daily) are picked up automatically when they land.

The store is the same SQLite file the whole time. The default is `server/data/aegis.db` (gitignored). Routes read it through `deps.LockedStore`, which holds `store.lock` for every call, until `core/store.py` locks its own reads (REQUESTS.md). Set `AEGIS_DB` to change it, or `:memory:` for a throwaway store. At startup every adapter is loaded into that file again with INSERT OR REPLACE on the same keys. A refresh only adds a run. Neither recreates the store or deletes from a fact table (observation, event, forecast, or a plugin's note, task, task_event or sleep_session), so check-ins and notes survive both a refresh and a restart. The only table that is wiped and rebuilt is the derived `assessment` table. `AEGIS_REFRESH=0` turns the thread off. `server/tests/conftest.py` makes tests use `:memory:` with no thread.

```
GET /api/refresh
{"running": true, "jobs": [{"source": "isslive", "every_s": 60.0, "next_in_s": 59.8, "runs": 0, "unchanged": 0,
           "last_run": null, "last_rows": null, "last_rejected": null, "last_error": null}]}

POST /api/refresh                 (all polled sources now; ?source=isslive for one; 404 if not polled)
{"refreshed": ["isslive"], "running": true, "jobs": [{"source": "isslive", "every_s": 60.0, "next_in_s": 59.9,
           "runs": 1, "unchanged": 0, "last_run": 7, "last_rows": 10, "last_rejected": 0, "last_error": null}]}
```

## Check-ins
`POST /api/observations` belongs to the Mind lane (`server/mind/api.py`, shapes in `MIND-API.md`). This lane only makes sure what it stores lasts. Check-ins, notes, tasks and task events are written into the same store file that refreshes and restarts reuse. `server/tests/test_live.py` checks this: a check-in survives a refresh, a refresh creates no store and deletes no user row, and a file store survives a restart.

**For Emile:** a check-in sits next to the simulated value for the same day, so `GET /api/observations?subject=c1&metric=self.mood` can return two rows for one day, `quality: "simulated"` and `quality: "live"`. Prefer `live`.

## Run
```
powershell -ExecutionPolicy Bypass -File server/run.ps1                    # http://127.0.0.1:8000, store server/data/aegis.db
powershell -ExecutionPolicy Bypass -File server/run.ps1 -Db server/data/demo.db -Port 8001
podman build --format docker -f server/Containerfile -t aegis-api .  ;  podman run -p 8000:8000 aegis-api
```
