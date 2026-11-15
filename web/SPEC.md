# e^x Crew Station: app spec

Vite + React + R3F, Flight Record look (`src/styles/flight.css`). Offline by default. Dev: `npm run dev` (http://127.0.0.1:5630).

## Routes (the crew console, `src/console/`)
One persistent R3F scene (`World.tsx`: Earth with real-sun terminator, ISS track from a CelesTrak TLE, porcelain body in a grey studio) behind a HUD (`Shell.tsx`: mark + crew seats, section tabs 1-9, telemetry, actions). The camera flies between sections.
| Route | Screen |
|---|---|
| `/` | Crew: cabin rail, selected crew vitals rail (three-state widgets), active alerts + one action |
| `/vitals` | Body levels 1-3 (`?t=organ&k=metric&deep=1`), signal bars, analytics |
| `/cabin` | Recorded ISS cabin (14 Nov), radial dial, tanks, commands, pressure emergency confirm (`?drill=1`) |
| `/storm`, `/storm/replay` | Flares, Sun plot, dose, model scores, storm probability; May 2024 replay |
| `/systems` | Sensors -> Cabin -> e^x -> Crew HUD -> Escalation, sources from `docs/lineage.json` |
| `/mind` | Self-report, habits/to-dos (server tasks when `/api` answers), private journal |
| `/timeline` | All mission days; drag to replay the whole HUD as of a day |
| `/shelter` | Shelter drill from the latest verified warning; dose sheltered (estimate) vs not |
| `/compare` | All crew bodies side by side, one metric lit |
| `/handoff` | Case bundle for an onboard AI medical assistant, sent with the one-way light delay |
| `/concepts`, `/concepts/:id` | Design concepts, not in the nav |

Check: `node scripts/check-ui.mjs` clicks every control and fails on console errors or external requests.

## Data layer (`src/data`, the only network code)
- `http.ts`: `getJson(path)` relative to the app origin (rejects non-JSON, so a static host's index.html is "no server"); `hasServer()` probes `/api/health` once.
- `load.ts` + `store.ts`: `data/crew_data.json`, `data/storm_forecast.json`, `data/real_crew.json` (zustand store, selected crew, environment).
- `cabin.ts`: server `/api/observations?subject=iss&kind=cabin` if present, else `samples/isslive_lightstreamer_eclss_snapshot.json`. Catalog and limits: `samples/cabin_catalog.json`.
- Computations in `src/core` (pure, tested): `scoring`, `radiation` (feed order, dose), `cabin` (ISS TimeStamp decode, bands, staleness, emergency, report-to-ground).

## Backend hook
Tomas's server (docs/backend) serves `web/dist` at `/`, the contract files at `/data/*.json` and extras at `/api/*`. The same build then reads live files with no code change. New endpoints are added in `src/data` only. Proposed cabin shape: `contracts/CHANGELOG.md`.

## Body model swap point
`src/features/body/model/`:
- `model-map.json`: GLB url (under `public/`), GLB node name -> render layer + region, per-metric anchor overrides, `structureRanges`.
- `bodyModel.ts`: loads the GLB, collects meshes per layer (several nodes on one layer are merged, world transforms applied).

New model: drop the GLB in `public/models/`, edit `model-map.json` (url, node names, `structureRanges: false`, anchors if the body is not 1.72 m, feet at y = 0, facing +z). No other change. Metric -> structure placement: `docs/body-map.json`.

## Rules
Every number comes from `public/data/*.json`, `public/samples/*.json` or `src/core`. Limits tagged NASA or Team in the cabin catalog. CO and humidity have no public feed: shown as "Not connected", never invented. Motion via framer-motion and CSS, off under prefers-reduced-motion.
