# CLAUDE.md for /web (Emile's workstream)

You are helping **Emile** build the app half of AEGIS (see `../PROJECT_CONTEXT.md`). Emile is a strong web/3D builder (React, three.js / React Three Fiber, TypeScript, Tailwind) and does sound design. Move fast; he knows what he's doing.

## READ FIRST (15 Nov): the redesign rules override the older sections below
1. `../docs/ARCHITECTURE.md`: layers, what may import what, the caution & warning ladder and the safety rule.
2. `REDESIGN-RULES.md`: tonight's job is visual polish and flow. Restyle, don't restructure. Frozen vs free, scope (the `src/station/` app), freeze time, definition of done.
3. Run `bash scripts/check-all.sh` before every commit and push. Do not commit while it is red.

Where this file and those two disagree, those two win. The "Screens" section below describes the first MVP, not the current `src/station/` app.

## Hard constraints
- **Data comes only from** `public/data/storm_forecast.json` and `public/data/crew_data.json`, shaped per `../contracts/DATA_CONTRACT.md`. They currently hold sample/fake data; Tomas overwrites them with real outputs around 21:00. **No code changes should be needed when the real files land.** Never hardcode values that live in the JSON.
- Don't edit `/ml` or the contract. Need a field? Write it in `../contracts/CHANGELOG.md` and tell Tomas.
- **Must run offline at the venue:** static build (`vite build`), no runtime calls to external APIs, fonts and models bundled locally. Deployed link is a backup.
- Show on screen: "Simulated crew data, not real astronaut records" and "Not medical advice" (footer), plus "Space weather data: NASA CCMC DONKI".
- Target: laptop + projector at 1920×1080. Must also be legible from the back of a room (big type, high contrast).

## Suggested stack
Vite + React + TypeScript + Tailwind + React Three Fiber (+ drei) + a light chart lib (Recharts or visx). Howler or the Web Audio API for sound. Use what's fastest for you.

## Screens (MVP in this order)
1. **Crew overview**: mission header (name, environment, mission day), crew cards with overall status color (green/amber/red), today's flags count. Environment switch (ISS / Moon / transit / Mars) changes the displayed daily dose rate (stretch).
2. **Astronaut view: 3D body map (centerpiece).** Clickable regions: `brain`, `heart`, `blood`, `bones`, `whole_body` (aura/halo for radiation + temperature). Each glows by `status[region]`. Click → side panel with: each metric mapped to that region (`metrics[m].body_region`), latest value + unit, status chip, time-series chart with baseline band (mean ± 2·sd) and flag markers, `explain`, `how_to_measure`, and the action for the current severity. Red shows a "Contact flight surgeon" button (opens a mock message).
3. **Daily check-in**: stepper form for hr, bp_sys/bp_dia, glucose, temp, sleep_h, mood (emoji 1–5), exercise_min. Score each value live with the client-side rule in the contract (z vs personal baseline, absolute limits, low-side-only metrics). Append to the in-memory series and update the body colors instantly. Gamification: streak, XP, a small "mission-ready" badge. Keep state in memory (no backend).
4. **Radiation module**: dose gauge (`dose_mSv_cum` vs `career_limit_mSv`), daily dose chart, live forecast feed from `storm_forecast.events` (latest first: class, location, p_storm bar, alert chip). Model card from `meta` (horizon, test metrics, top features).
5. **May 2024 replay (demo climax)**: filter `events` with `split == "test"` and `peak_time` in 2024-05-05 → 2024-05-20. A timeline scrubber/play button runs through time. Each flare pops onto a stylised Sun at its lat/lon (west = right side as seen from Earth). The p_storm gauge animates. On `warning`: full-screen banner + alarm + "CREW TO STORM SHELTER". When the clock reaches `storm_onset_time`: particles hit, and the counter shows "Warned X h before arrival". Show misses and false alarms honestly too (different color); judges trust that.

## Design direction
Mission-control calm, not sci-fi noise: dark UI, one accent per status (green/amber/red), big numerals, lots of space. The 3D body should feel clinical and premium (translucent body, glowing organs), not cartoonish. Motion only where it carries meaning (status change, alarm, replay). Sound: a subtle UI tick, a check-in chime, and one serious alarm for the shelter warning.

## Definition of done
Overview → body → panel with chart + action → live check-in changes a color → radiation feed → replay with alarm. All from the JSON files, offline build working, deployed link, and a 30-second screen recording of the demo path.

## Habitat module guardrails (non-negotiable)
- Data comes ONLY from web/public/data/habitat_telemetry.json, read as specified in contracts/HABITAT_CONTRACT.md + CHANGELOG v2.2. Never hardcode values, thresholds, dates, crew ids or lead times.
- Read amber/red from meta.thresholds. Never assume 1.0 or any fixed number.
- If lead_time_h is negative or null, never show "flagged before the limit"; show "limit rule fired first" or hide it.
- Every planted fault is shown honestly: caught / missed (detected: false) / false alarm (planted: false).
- Wording for crew links is always "Possible environmental cause", never a diagnosis.
- These labels must be visible: footer "Habitat telemetry simulated. Detector validated on NASA SMAP/MSL telemetry." and the existing "Not medical advice".
- Never edit anything in /ml, /contracts or web/public/data/*.json. If the shape seems wrong, stop and tell Emile to tell Tomas.
- The habitat module must not break the MVP: crew overview, body map, check-in and the radiation replay must still work after every commit. Run the app and click through the demo path before each push.
- Time box: habitat UI done by 22:45. After that, only fixes that break the demo.
