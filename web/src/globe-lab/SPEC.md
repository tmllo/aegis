# Globe lab spec (single source of truth for every builder)

Goal: a Google-Earth-grade globe for the e^x Crew Station: physically based atmosphere, Earth-style
camera controls, a real sky (stars, Milky Way, Sun, Moon at their true positions), and a sharp surface.
It is built as a standalone lab page so it never collides with session 93, who owns the rest of
`aegis/web/`. Later 93 swaps it into `src/console/World.tsx` (see HANDOFF.md, written last).

## Hard rules
- Only touch: `globe-lab.html` (web root), `src/globe-lab/**`, `public/refs/globe-lab/**`. Never edit any
  other file in `aegis/web` (not World.tsx, Globe.tsx, package.json, vite.config.ts, router). No git commands.
- No new npm dependencies. Available: three 0.169, @react-three/fiber 8, @react-three/drei 9,
  @react-three/postprocessing 2 + postprocessing 6, zustand 4, react 18. `three-stdlib` is present via drei.
- Must run OFFLINE: every texture/catalog is a local file under `public/refs/globe-lab/`. No runtime fetch to the internet.
- Public-domain or CC BY sources only; every file listed in `public/refs/globe-lab/SOURCES.md` with URL + licence.
- Professional naming, no emojis, no agency logos. TypeScript strict (`noUnusedLocals`), `npx tsc --noEmit` must pass.
- Reference implementations you may read online for technique (do not paste large code; credit in a comment):
  CesiumJS `ScreenSpaceCameraController` / `SkyAtmosphere` / `GlobeSurfaceShader` (Apache-2.0),
  Sean O'Neil GPU Gems 2 ch.16 scattering, Bruneton precomputed scattering, takram three-geospatial (MIT).

## Frame and time (already written: `src/globe-lab/frame.ts`, do not change signatures)
- 1 scene unit = 1 Earth radius = 6371 km (`KM = 1/6371`). Earth is Earth-fixed and NOT rotated inside the lab;
  time moves Sun/Moon/stars around it. +Y = north pole, (lat 0, lon 0) = +X, lon 90E = -Z.
- Helpers: `ll(lat, lon, r)`, `toLatLon(v)`, `enu(p)`, `gmstDeg(d)`, `raDec(ra, dec, d, r)`, `sunDir(d)`, `moonPos(d)`.
- Equirectangular Earth maps: u = (lon+180)/360, v = (lat+90)/180 (three SphereGeometry default UVs match).
- All globe-lab components must work when placed inside an arbitrary parent group (the main app tilts the Earth
  by 0.32 rad). Shaders that need the camera or Sun therefore take them in the Earth group's LOCAL frame
  (compute per frame with `group.worldToLocal` / inverse matrixWorld), never assume world = local.

## Shared state: `src/globe-lab/store.ts` (written by the controls builder, read by everyone)
zustand store `useLab` with:
```
date: Date; rate: number (sim seconds per real second, 1 = real time); paused: boolean
setDate(d), setRate(r), togglePause()
layers: { atmosphere: boolean; clouds: boolean; stars: boolean; milkyway: boolean; grid: boolean; night: boolean }
toggleLayer(k)
readout: { lat: number; lon: number; altKm: number; heading: number; tilt: number }   // camera, written by controls
flyTo: { lat: number; lon: number; altKm?: number; heading?: number; tilt?: number; id: number } | null
requestFly(target)   // increments id
```
A `useLabClock()` hook (same file) advances `date` each frame by dt*rate when not paused (call it once, in the
lab app). Components read `date` from the store.

## Camera model (Google Earth / KML LookAt semantics)
State = { target lat, lon (point on the surface the camera looks at), range (km from target), heading (deg,
0 = north up, clockwise), tilt (deg, 0 = straight down, 90 = horizon) }. The camera is derived from this
state every frame; nothing else moves the camera.
- Altitude limits: min camera altitude 120 km, max range 80,000 km. Tilt max: 0 above 8,000 km altitude,
  ramps smoothly to 75 deg at 400 km and below. Clamp, never jitter.
- Dynamic clipping planes: near = max(0.5 km, 0.25 * altitude) in scene units, far = camera distance + 80.
  (No logarithmic depth buffer. Sky elements are drawn with depthTest off, see Sky.)
- FOV 36 deg (matches the main app).

## Files and owners
| File | Builder | Exports |
|---|---|---|
| `public/refs/globe-lab/*` + `SOURCES.md` | assets | textures + `stars.bin` (see Assets) |
| `src/globe-lab/store.ts` | controls | `useLab`, `useLabClock` |
| `src/globe-lab/GlobeControls.tsx` | controls | `<GlobeControls />` (inside Canvas; owns camera) |
| `src/globe-lab/Earth.tsx` | surface | `<Earth />` surface + clouds |
| `src/globe-lab/Atmosphere.tsx` + `scattering.glsl.ts` | surface | `<Atmosphere />`, shared GLSL |
| `src/globe-lab/Sky.tsx` | sky | `<Sky />` Milky Way, stars, Sun disc + glare, Moon |
| `src/globe-lab/LabApp.tsx`, `main.tsx`, `Hud.tsx`, `lab.css`, `/globe-lab.html` | integrator | the page |

## Assets (`public/refs/globe-lab/`, exact names; builders code against these names)
| File | Content | Size |
|---|---|---|
| `earth-day-8k.jpg` | NASA Blue Marble Next Generation (topo+bathy, Dec 2004) | 8192x4096 |
| `earth-day-hd-{0,1,2,3}.jpg` | same source at 16384x8192 split into 4 quadrants: 0 = lon -180..0 lat 0..90, 1 = lon 0..180 lat 0..90, 2 = lon -180..0 lat -90..0, 3 = lon 0..180 lat -90..0 | 8192x4096 each |
| `earth-night-4k.jpg` | NASA Black Marble 2016 | 4096x2048 |
| `earth-normal-4k.jpg` | tangent-space normal map from topography (or SSS normal map, CC BY 4.0) | 4096x2048 |
| `earth-water-8k.png` | ocean/water mask, white = water (8-bit gray) | 8192x4096 |
| `earth-clouds-8k.jpg` | cloud cover, white = cloud (8-bit gray) | 8192x4096 |
| `moon-2k.jpg` | NASA CGI Moon Kit (LRO) colour, lon 0 at image centre | 2048x1024 |
| `milkyway-4k.jpg` | NASA SVS Deep Star Maps 2020, celestial (equatorial) coords, tone-mapped so stars are faint and the Milky Way glow carries; RA 0 at centre, RA increases to the LEFT, Dec +90 at top | 4096x2048 |
| `stars.bin` | Yale Bright Star Catalogue (BSC5) V <= 6.5, Float32 little-endian, 4 per star: ra_deg, dec_deg, vmag, b_minus_v | ~9000 stars |

## Rendering spec
Earth (`Earth.tsx`):
- Sphere radius 1, 256x256 segments (or a cube-sphere), day map with sRGB colour space, anisotropy max.
- HD LOD: when camera altitude < 3,000 km, lazily load the 4 HD quadrants and draw them on 4 sphere-segment
  meshes (SphereGeometry phi/theta ranges) slightly crossfaded over the base; unload (dispose) above 6,000 km.
- Lighting in a custom shader (or MeshStandardMaterial with onBeforeCompile): Lambert day side with a soft
  terminator, night lights (Black Marble, warm tint) only on the night side, ocean sun glint (water mask x
  GGX/Blinn specular, roughness ~0.25), normal map relief strongest near the terminator, procedural detail
  noise (albedo + normal, fades in below 1,500 km altitude) so close views are not blurry.
- Clouds: shell at 1 + 8 km, lit by the Sun, darker on the night side, slow drift (rate-scaled), cast a soft
  shadow on the ground (sample cloud map offset along the Sun direction in the surface shader).
- Aerial perspective: ground colour = ground * transmittance + inscatter from `scattering.glsl.ts`, so the
  limb and terminator look like Google Earth (blue haze at the limb, warm band at sunrise/sunset).

Atmosphere (`Atmosphere.tsx`, `scattering.glsl.ts`):
- Single-scattering ray march (Rayleigh + Mie + ozone absorption), top of atmosphere 1 + 100 km scaled x1.0
  (allow an `exaggeration` uniform, default 1.6 for presentation), Rayleigh scale height 8 km, Mie 1.2 km,
  beta_R = (5.802, 13.558, 33.1) e-6 /m, beta_M 3.996e-6 /m, Mie g 0.8, ozone (0.650, 1.881, 0.085) e-6 /m.
  Convert to scene units. 16 view samples, 6 light samples (or a small precomputed transmittance LUT).
- Rendered on a shell (BackSide, depthTest false, depthWrite false, renderOrder after the Earth) with blending
  `dst * transmittance + inscatter` (premultiplied custom blending). Works with the camera outside AND inside
  the atmosphere (sky colour near the horizon at low altitude).
- Exposure/tone mapping: renderer ACESFilmic, the Sun intensity uniform tuned so the day side is not blown out.

Sky (`Sky.tsx`):
- All sky elements are centred on the camera every frame (skybox), radius 50, depthTest false, depthWrite false,
  renderOrder -10, so the Earth and Moon always draw over them. Oriented with `raDec`/`gmstDeg` for the store date.
- Milky Way: sphere sampled in the fragment shader from direction -> RA/Dec -> uv of `milkyway-4k.jpg`, dim.
- Stars: Points from `stars.bin`, size and brightness from magnitude (pogson), colour from B-V (blackbody
  approximation), round soft sprite, no twinkle. Dim the sky when the camera is inside the sunlit atmosphere.
- Sun: bright disc at the true `sunDir`, plus a glare/bloom sprite drawn last whose opacity drops when the Earth
  (radius 1 + 30 km) occludes the Sun from the camera (analytic ray-sphere test, smooth over the limb).
- Moon: real position (`moonPos`), radius 1737 km, textured, lit by the real Sun direction so the phase is
  correct, near side (texture lon 0) facing the Earth.

Controls (`GlobeControls.tsx`), Google Earth feel:
- Left drag: grab the surface. The point under the cursor at pointerdown stays under the cursor (rotate the
  LookAt target by the quaternion that maps the current hit point to the grabbed point). Inertia on release
  (angular velocity decays with ~0.92 per frame at 60 fps, frame-rate independent).
- Wheel / trackpad pinch / two-finger pinch: zoom TOWARD THE CURSOR, exponential in range (each notch ~15 %),
  smoothed. Keep the point under the cursor fixed while zooming (same grab rotation trick).
- Shift + drag, Ctrl + drag, right drag, or two-finger vertical: horizontal = heading, vertical = tilt (orbit
  around the screen-centre target point).
- Double click: fly to that point and zoom in x0.4. Fly-to: slerp target, range follows a parabola that rises
  mid-flight when the distance is large (like Google Earth), 1.2-2.5 s depending on distance, ease in-out.
- Keys: arrows pan, + / - zoom, Shift+arrows tilt/heading, N = north up, U = tilt to 0, R = reset view.
- Respects `prefers-reduced-motion` (instant moves). Writes `useLab.readout` every frame (throttled to 10 Hz
  in a ref-diff so React does not re-render each frame). Consumes `useLab.flyTo` when its id changes.
- Clicking without dragging (< 4 px movement) must not move the camera, so pins stay clickable.

Integrator (`LabApp.tsx`, `Hud.tsx`, `main.tsx`, `lab.css`, `/globe-lab.html`):
- Full-viewport Canvas, background #000, dpr [1, 2], gl antialias, ACESFilmic tone mapping, sRGB output.
  Order: Sky, Earth, Atmosphere, Moon (in Sky), ISS track (reuse `useIssTrack` from `src/console/Globe.tsx`
  read-only import: positions are in its own ll() which equals frame.ll), postprocessing Bloom (threshold high,
  only the Sun and city lights bloom).
- HUD in the Crew Station style (graphite, teal accent #5fd3d6, JetBrains Mono numbers, Inter Tight labels; fonts
  via @fontsource imports already in the app): bottom-left readout LAT / LON / ALT km / HDG / TILT;
  top-right compass (click = north up, shows heading) and tilt button; right column layer toggles
  (Atmosphere, Clouds, Stars, Milky Way, Night lights, Grid); bottom time bar (UTC clock, Now, pause, 1x / 60x /
  3600x); preset buttons: ISS (follow current ISS position), Houston, Kennedy, Baikonur, Madrid, Full disc.
  Footer line with source credits (short). Low text, no emojis.
- `/globe-lab.html` at the web root loads `src/globe-lab/main.tsx` (Vite serves it on the existing :5630 dev server).
