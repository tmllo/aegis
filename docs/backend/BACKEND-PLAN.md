# e^x backend plan (Tomas + Claude)

Written 2026-11-15 ~02:10 CET. Owner: Tomas. Folder: `server/` (new, Tomas's workstream, like `ml/`).
Deadline: Sun 15 Nov 23:59. The demo must still work with **no backend and no Wi-Fi**.

## 1. What the frontend needs today (read from the code, commit 5532689)
| Where | What it does | Backend consequence |
|---|---|---|
| `web/src/data/load.ts` | `fetch(BASE_URL + "data/" + file)` for `crew_data.json`, `storm_forecast.json`, `real_crew.json` (optional), once per page load | The whole integration surface. A server that serves these three paths **in the contract shape** plugs in with zero frontend change |
| `web/src/data/types.ts` | Contract types. `StormEvent.split` is a `Split` union | Live flares need a new split value (`"live"`): contract change, see section 4 |
| `web/src/core/bus.ts` | In-memory event bus: `observation`, `flag`, `status`, `alert`, `report`, `device` | Lives in one tab. The Ground view (flight surgeon) on a second device needs these events relayed: WebSocket, section 3 B2 |
| `web/src/core/observation.ts` | FHIR-shaped `Observation` | Server stores and returns the same shape. No new format |
| `web/src/concepts/*` | Only `_example` exists. No screens yet | Re-check with the watcher (section 5) after every push from Emile |

## 2. Design rules
1. **Offline first.** The static build with the three JSON files is the demo. The backend only adds things on top. If the server is unreachable, the app behaves exactly as today.
2. **Speak the contract.** The server returns the same JSON shapes as `contracts/DATA_CONTRACT.md`. New shapes go through `contracts/CHANGELOG.md` and Emile's agreement first.
3. **One process, one URL.** FastAPI serves `web/dist/` at `/`, the live contract files at `/data/*.json`, and extras at `/api/*`. Because the built app fetches `/data/...` relative to its own origin, serving it from the server switches it to live data with no code change. Same thing runs on a laptop, a USB stick or a container (fits the "server-ready" check in `BUILD-KICKOFF.md` section 3).
4. **Every live number falls back to a cached copy** with its "cached at" time, so venue Wi-Fi can't break the demo.
5. Python (FastAPI + uvicorn), reusing `ml/` code and `ml/models/v1.pkl`. No database beyond SQLite. No auth (local demo).

## 3. Build order (stop wherever the clock says)
| Step | What | Visible in the demo? | Needs Emile? |
|---|---|---|---|
| **B1** | `server/app.py`: serve `web/dist` + `/data/*.json` (copies of the exported files) + `/api/health`. Containerfile + README "run on a station server" | Indirectly (Systems screen: "server-ready") | No |
| **B2** | Live Sun: every 15 min pull DONKI flares (last 7 days) with linked CMEs, compute the v1 features with the same code as `ml/prepare_model_flares.py`, score with `v1.pkl`, append to `storm_forecast.json` events as `split: "live"`. `/api/space-weather/now`: GOES >10 MeV protons, latest X-ray flares, Kp, NOAA scales from SWPC JSON. Cache to disk; fall back to `docs/research/samples/` | **Yes**: "this is today's Sun, scored by our model" | Contract change (split `"live"`, new `space_weather_now` shape). Emile shows it on the radiation screen |
| **B3** | `/ws/bus`: WebSocket relay of bus records (`report`, `alert`, `status`, `observation`) between devices. Crew Console on the laptop, Ground view on a phone: the report really arrives on another device after the simulated light delay (`link.ts` keeps doing the delay) | **Yes**: two-device demo | A ~40-line `web/src/core/remote.ts` bridge, only active when the page is served by the server. We write it as a handoff in `docs/handoff/`, his agent drops it in |
| B4 | `POST /api/observations` (check-ins) to SQLite, merged into `crew_data.json` series on GET | No (persistence is invisible on stage) | No |
| Cut | ISS Live! cabin telemetry (Lightstreamer), auth, cloud database | Only if everything else is done | |

## 4. Contract changes to agree with Emile (not merged yet)
- `storm_forecast.json`: `split` may also be `"live"` (flares after `test_period` end, scored by the server). Same fields. `meta.metrics_test` unchanged (live flares never enter the headline numbers).
- New file `space_weather_now.json` (also at `/api/space-weather/now`): `{ fetched_at, cached: bool, goes_p10_pfu: {time, value}[], xray_flares: {class, peak_time}[], kp: {time, value}[], noaa_scales: {R, S, G} }`. Exact shape written in `DATA_CONTRACT.md` when Emile says yes.
- Bus over WebSocket: one message = one `BusRecord` from `core/bus.ts` as JSON, plus `origin` (device id) so a device ignores its own echo.

## 5. How we keep seeing the frontend
Emile only pushes `main` when he says "push", so we can't see his work by default.
1. **Ask Emile**: at each phase gate, push a WIP branch with screenshots: `git push origin HEAD:web-wip`, screenshots from `npm run shot` committed to `web/docs/shots/`. It doesn't touch `main`.
2. **Watcher prompt** (Tomas runs it in Claude Code after each push, or on a loop):
   > git fetch --all. For main and web-wip: diff web/src/data/, web/src/core/ and every fetch(, WebSocket, EventSource or /data/ /api/ string in web/src since the last run (last commit noted at the bottom of docs/backend/FRONTEND-NEEDS.md). Update docs/backend/FRONTEND-NEEDS.md: every screen that exists, what data each reads, which fields, which bus events, and what the backend must add or change. Flag anything that breaks the contract. Open the web-wip screenshots and describe each screen in two lines. Commit and push docs/backend only.
3. **Run his branch yourself**: `git worktree add ../aegis-web-wip origin/web-wip`, then `cd ../aegis-web-wip/web && npm ci && npm run dev`, open `http://127.0.0.1:5620/concepts`.

## 6. Done means
- `uvicorn server.app:app` serves the full app at `http://127.0.0.1:8000`, works with Wi-Fi off (cached data), and `python ml/validate_contracts.py` passes on what `/data/*.json` returns.
- Tests in `server/tests/`: contract shape of every served file, live-scoring parity (`v1.pkl` on a past flare gives the same `p_storm` as the export), fallback when the network is down.
