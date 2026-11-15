# Rules for every agent working on server/

Read this whole file before writing code. Then read `server/README.md`, `docs/backend/NEXT.md` and your lane's files.

## 1. The shape of the backend (do not change it)
```
sources -> server/adapters/<id>.py -> store (core/store.py) -> engine -> views / api -> Emile's app
                     all checked against server/catalog/
```
Arrows only go right. An adapter never scores. A view or route never fetches a feed. The engine never formats a response.

## 2. Plug in, never edit shared files
Every new thing goes in as a new file at one of these plug points. They are discovered automatically.

| You are adding | Create | Discovered by |
|---|---|---|
| A data source | `server/adapters/<id>.py` defining `ADAPTER = YourClass()` and `ORDER = <int>` + its entry in `server/catalog/sources.d/<id>.yaml` | `server/adapters/__init__.py` |
| Metrics | `server/catalog/metrics.d/<lane>.yaml` (top-level `metrics:` list, same fields as `metrics.yaml`) | `core/catalog.py` (duplicate keys fail the build) |
| Subjects / sources | `server/catalog/subjects.d/<lane>.yaml`, `sources.d/<lane>.yaml` | same |
| Other config (routines, scales) | `server/catalog/<name>.yaml` | `cat.extra["<name>"]` |
| A feature with its own tables | a package `server/<feature>/` with `schema.sql`, `records.py`, `repo.py` (reads/writes using `store.db` under `store.lock`), `engine.py`, optional `plugin.py` with `after_build(cat, store)`, `api.py` with `router = APIRouter()` | `core/store.py` applies every `server/*/schema.sql`; `build.py` calls every `plugin.after_build`; `api/app.py` mounts every `server/*/api.py` |
| A core endpoint | `server/api/routes/<name>.py` with `router = APIRouter()` | `api/app.py` |
| Tests | `server/tests/test_<lane>.py` | pytest |

**Owned by nobody, edit only when your lane says so:** `server/core/*`, `server/build.py`, `server/api/app.py`, `server/api/deps.py`, the base `server/catalog/*.yaml` files, `server/requirements.txt`, `server/README.md`. If you need a change there, append it to `docs/backend/REQUESTS.md` (what, why, which file) and carry on with the rest.

**Never edit:** `web/` (Emile), `ml/` (only Tomas's ML lane), `contracts/` except adding a `PROPOSED` entry to `contracts/CHANGELOG.md`.

## 3. Emile's app is the customer
- The shapes it already calls are fixed: `contracts/CHANGELOG.md` (his cabin entry) and `web/src/data/*.ts`. `/api/observations` returns exactly `[{metric, t, value, quality}]`.
- Never rename or remove a field in a response. Add fields only. A new response shape gets a `PROPOSED` entry in `contracts/CHANGELOG.md` and an example in your lane's API doc.
- Metric keys are the ones in the catalog. Emile's screens use them as-is (`cabin.water_waste`, `self.mood`...).
- Every endpoint must work with no network: live adapters fall back to their recorded copy and say `quality: "recorded"` or `"cached"`.

## 4. Gates before every push (paste their output in your final report)
```
python -m server.build          # must print "identical to the app file" three times, rejected=0 for every run
python -m pytest server/tests -q   # all green
```
If a gate fails because of another lane's push, run `git fetch && git rebase origin/main` and re-run the gates. Do not "fix" another lane's file: write it in `docs/backend/REQUESTS.md`.

## 5. Git in parallel
- Work in your own worktree on your own branch (`lane/<name>`), never in the shared folder.
- Commit small. Before pushing: `git fetch origin`, `git rebase origin/main`, run the gates, then `git push origin HEAD:main`.
- A rejected push means someone pushed first: rebase, gates, push again.

## 6. Dependencies and data
- Ask the human before adding any package. Already allowed: pyyaml, pytest, fastapi, uvicorn, httpx, lightstreamer-client-lib.
- No real astronaut vitals. The crew is simulated. Inspiration4 (OSDR) is the only real crew data, reference only.
- No generative AI in scoring, alerts or tasks. Journal text never reaches a view for the ground.
- Write files as UTF-8 (`encoding="utf-8"`). On Windows set `$env:PYTHONIOENCODING="utf-8"`.

## 7. How to use sub-agents inside your lane
Split your lane by file, one sub-agent per file group, so they never touch the same file. When the code is done, give one fresh sub-agent this file and your diff and ask it to check every rule above and to run both gates. Fix what it finds, then push.

## 8. Final report (always this format)
1. What you added (files, endpoints with one example request and response)
2. Gate output
3. Anything Emile needs to know (new endpoint, new metric keys, a PROPOSED changelog entry)
4. Anything left in `docs/backend/REQUESTS.md`
