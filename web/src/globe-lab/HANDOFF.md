# Globe lab: handoff to session 93

Standalone page: `http://127.0.0.1:5630/globe-lab.html` (entry `globe-lab.html` + `src/globe-lab/main.tsx`). No file outside `src/globe-lab/`, `public/refs/globe-lab/` and `globe-lab.html` was touched. Not committed (git is 93's).

## Summary
A Google-Earth-style globe built from open techniques (KML LookAt camera, CesiumJS-style grab controls, Bruneton-constant single scattering), fully offline, with the real Sun, Moon and stars for any date. Tests: `npx vitest run src/globe-lab` (9 pass), `npx tsc --noEmit` clean.

## What is in it
| Part | File | Notes |
|---|---|---|
| Frame + astronomy | `frame.ts` | 1 unit = Earth radius. `ll()` is the same mapping as `console/Globe.tsx` `ll()` (returns a Vector3). Sun, Moon (about 0.3 deg), GMST |
| Controls | `GlobeControls.tsx`, `camera-math.ts` | Grab drag + inertia, zoom to cursor, Shift/Ctrl/right drag = heading and tilt, double-click fly, arc fly-to, keys (arrows, +/-, N, U, R), touch pinch/rotate/tilt, ISS follow, limits 120 km to 80,000 km |
| Atmosphere | `scattering.glsl.ts`, `Atmosphere.tsx` | Rayleigh + Mie + ozone ray march; sky shell + aerial perspective on the ground; thickness x1.6 for legibility |
| Surface | `Earth.tsx` | Day map, night lights on the night side only, ocean glint, relief, clouds with ground shadows, detail noise below 1,500 km, lat/lon grid |
| Sky | `Sky.tsx`, `sky-math.ts` | 8,404 BSC5 stars (B-V colour), Milky Way (NASA SVS), Sun glare hidden by the Earth's limb, Moon with real phase |
| ISS | `iss.ts` | Same two-body TLE model as `Globe.tsx`, reads `public/orbits/iss.tle` |
| HUD | `Hud.tsx`, `lab.css` | Readout, compass, layers, UTC clock with 1x / 60x / 1 h/s, presets |

URL params for screenshots: `?lat=&lon=&alt=&hdg=&tilt=&t=<ISO>&rate=&paused=1&tiltgroup=0.32`.

## How to swap it into `console/World.tsx`
| Step | Change |
|---|---|
| 1 | Replace `<Stars>`, `<Sun>` and `<EarthGroup>` with one group: `<group ref={earth} rotation={[0.32, yaw, 0]}><Sky /><Earth /><Atmosphere /></group>`. Everything works inside a rotated parent (checked with `?tiltgroup=0.32`). |
| 2 | Mount `<SunTracker />` from `LabApp.tsx` (or call `useLabClock()` and `sunDir(date, SUN_LOCAL)` once per frame). |
| 3 | Camera: `GlobeControls` owns the camera. Mount it only on the Earth sections (`/`, `/storm`, `/systems`, `/mind`) and keep `CameraRig` + OrbitControls for `/vitals`, `/compare`, `/cabin`. Pass `earth={earthRef}` and an `initial` view per section (lat, lon, altKm, heading, tilt) instead of the current `viewFor()` positions. |
| 4 | Pins and tooltips: keep `Pin`; place them with `ll(lat, lon, r)` inside the same Earth group. |
| 5 | Tone mapping: the lab uses `<Canvas flat>` + `EffectComposer` (Bloom + ACES `ToneMapping`). With World's default renderer ACES and no composer it still renders (shaders include the tone-mapping chunk), but the Sun glare will not bloom. |

## Assets and memory
| Item | Value |
|---|---|
| Disk | 18 MB in `public/refs/globe-lab/` (licences in `SOURCES.md`) |
| GPU memory, estimate | about 650 MB with mipmaps (three 8k maps: day, clouds, water). For weaker laptops, use 4k clouds and water (about 300 MB total) |
| Missing | HD imagery tiles: NASA's 21,600 px Blue Marble returned 404 on 2026-11-15, so close views below about 600 km stay soft |

## Known limits
- Earth-fixed lab: the Earth does not spin, the sky and the Sun move instead (same as Google Earth).
- Moon and star positions are low precision (fine for display, not for navigation).
- Atmosphere is single scattering (no multiple scattering), so twilight is slightly too dark.
