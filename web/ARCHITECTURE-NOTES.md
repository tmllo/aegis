# e^x Crew Station: architecture notes (scaffold)

Stack (exact versions in `package.json`): Vite 5, React 18, TypeScript 5.6, Tailwind 3 (classic config), three 0.169, @react-three/fiber 8, @react-three/drei 9, Recharts 2, react-router-dom 6, zustand 4, framer-motion 11, Vitest 2, Playwright.

## Folders
| Path | What | Rule |
|---|---|---|
| `public/data/*.json` | Tomas's files: `crew_data`, `storm_forecast`, `real_crew` | Never edit. Every number on screen comes from here or from `core/` |
| `public/models/aegis-body.glb` | Body model (BodyParts3D, CC BY 4.0) | Credit must stay visible (`components/Footer.tsx`) |
| `src/data/` | `types.ts` (contract types), `load.ts` (cached fetch), `store.ts` (zustand) | Shared. Do not edit from a concept |
| `src/core/` | Pure TS, no React: `observation`, `scoring`, `bus`, `lineage` | Shared. Tests next to each file |
| `src/components/` | Shared pieces: `body/AegisBody.tsx`, `Footer.tsx` | Shared |
| `src/styles/` | `tokens.css` (CSS variables), `fonts.css` (bundled fonts), `index.css` | Shared. Override tokens in your concept, not here |
| `src/concepts/<id>/` | One folder per concept | Yours. Edit only your own folder |
| `scripts/shot.mjs` | Headless screenshot with WebGL | |

## Store (`src/data/store.ts`)
`useMissionData()` loads the three files once and returns `{ data, loadState, error }`; `data = { crew, storm, real }` (`real` is `null` if the file is missing).
`useMissionStore` holds `data`, `selectedCrewId`, `selectedRegion`, `environment` and the setters `setSelectedCrewId`, `setSelectedRegion`, `setEnvironment`. `environment` starts as `mission.environment` from the file. `useSelectedCrew()` returns the picked crew member.

## Core
- `scoring.ts`: the contract's client-side rule. `statusOn(member, crewData, date?, environment?)` gives region status plus per-metric scores; `scoreCheckIn(...)` scores a new value; `scoreMetric`, `scoreDay`, `windowMean`, `regionStatus` are the parts. The golden test reproduces every crew member's `status` and stored `flags` (with z) from `crew_data.json`.
- `bus.ts`: `createBus<Events>()` and the app-wide `bus` (`emit`, `on`, `onAny`, `subscribe` + `getSnapshot` for `useSyncExternalStore`).
- `observation.ts`: `Observation` (FHIR-shaped), `toFhir`, `seriesToObservations`.
- `lineage.ts`: `LineageGraph` types and an empty `LINEAGE` to fill.

## Concept registry
`src/registry.ts` uses `import.meta.glob('./concepts/*/index.tsx')`. To add a concept, create `src/concepts/<id>/index.tsx` with
```tsx
export const meta = { title: 'Name', direction: 'one line', surface: 'Crew Console' };
export default function Concept() { ... }
```
It appears on `/concepts` and is served at `/concepts/<id>`. No shared file changes. Copy `src/concepts/_example/` to start.
The route wraps each concept in `<div data-concept="<id>">`. Put your look in a CSS file in your folder, scoped as `[data-concept="<id>"] { --bg: 8 14 30; --font-sans: 'Space Grotesk', sans-serif; }`. Colour tokens are RGB channels (`8 14 30`), so Tailwind alpha works (`bg-surface/60`). Tailwind names: `bg`, `surface`, `surface-2`, `line`, `text`, `dim`, `faint`, `accent`, `ok`, `warn`, `crit`; fonts `font-sans|mono|display`; `min-h-touch` (56 px).
Bundled font families: Inter Tight (300-600), JetBrains Mono (400, 500), Instrument Serif (400, italic), IBM Plex Sans (300-600), Space Grotesk (300-700). Latin subset; add another weight in `styles/fonts.css` only if needed.

## Run
```
npm run dev          # http://127.0.0.1:5620 (strict port)
npx vite --port <p> --strictPort     # a concept builder's own server, then open /concepts/<id>
npm run typecheck && npm test && npm run build
node scripts/shot.mjs <url> <outPng> [width=1920] [height=1080] [waitMs=2500]
```
The screenshot script runs Chromium with software WebGL (ANGLE + SwiftShader). The 7 MB body needs about 5000 ms wait on a first load.
