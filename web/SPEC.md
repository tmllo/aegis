# e^x Crew Station: app spec

Vite + React + R3F, Flight Record look (`src/styles/flight.css`). Offline by default. Dev: `npm run dev` (http://127.0.0.1:5630).

## Routes
| Route | Screen | Source |
|---|---|---|
| `/body` (default) | 01 Body: 3D body, seven plates with leader callouts, side note (value vs own band mean +/- 2 sd, days running, explanation, action, re-measure). URL keeps `?crew=&plate=&metric=` | `src/features/body/` |
| `/cabin` | 02 Cabin: air (pressure, ppO2, ppCO2, CO planned, temperature, humidity planned), water tanks, crew dose (today, career vs limit), storm forecast feed, model card | `src/features/cabin/` |
| `/cabin/replay` | May 2024 replay (the radiation concept, reused) | `src/concepts/radiation/` |
| `/concepts`, `/concepts/:id` | Design concepts, not in the nav | `src/concepts/*` |

Shell (`src/app/Shell.tsx`): nav 01 Body / 02 Cabin, crew switcher (shared by both sections), mission facts, footer with every disclaimer and the anatomy credit.

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
