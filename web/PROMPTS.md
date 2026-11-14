# Emile: Claude Code prompts, in order

Run from `/web` (Claude Code picks up both `../CLAUDE.md` and `web/CLAUDE.md`).

---
**E0 Context + scaffold (20 min)**
> Read ../CLAUDE.md, ../PROJECT_CONTEXT.md, web/CLAUDE.md and ../contracts/DATA_CONTRACT.md. Scaffold Vite + React + TS + Tailwind + React Three Fiber + drei + Recharts. Write TypeScript types for both JSON files from the contract and a data loader that fetches /data/crew_data.json and /data/storm_forecast.json. Build the crew overview screen from the real file shape. Dark mission-control theme.

**E1 3D body map (60–90 min)**
> Build the astronaut view: a clinical, translucent 3D human body with clickable regions brain, heart, blood (vessels), bones (skeleton) and whole_body (aura). Color each by crew.status[region]. Hover highlight, click opens the side panel. Keep it performant on a laptop. If a good free body model isn't quick to find, build it from stylised primitives. Clean beats realistic.

**E2 Metric panel (45 min)**
> Build the side panel: for the clicked region, list the metrics whose metrics[m].body_region matches, each with latest value, unit, status chip, a time-series chart with the baseline band (mean ± 2·sd) and flag markers, the explanation, how to measure, and the action for the current severity. Red shows a "Contact flight surgeon" button with a mock message modal.

**E3 Daily check-in + gamification (45 min)**
> Build the daily check-in stepper. Score values live with the client-side rule in the contract (z vs personal baseline, absolute_red limits, low_side_only). Append to the in-memory series and update the body colors and status immediately. Add streak, XP and a "mission-ready" badge. Add a soft chime on submit.

**E4 Radiation module (40 min)**
> Build the radiation screen: dose gauge (dose_mSv_cum vs career_limit_mSv), daily dose chart, live forecast feed from storm_forecast.events (latest first: class, location, p_storm bar, alert chip) and a model card from meta (horizon, test metrics, top features).

**E5 May 2024 replay (60–90 min): the demo climax**
> Build the replay mode per web/CLAUDE.md: test events from 2024-05-05 to 2024-05-20, play/scrub timeline, flares appear on a stylised Sun at their lat/lon, animated p_storm gauge, full-screen WARNING + alarm + "CREW TO STORM SHELTER" on warning alerts, particle-arrival effect at storm_onset_time, and a "Warned X h before arrival" counter. Show misses and false alarms honestly in a different color.

**E6 Integration + polish (30 min, after Tomas ships real JSON)**
> The real JSON files are in public/data. Check nothing breaks (nulls, missing fields, more events). Polish spacing, type sizes for a projector, transitions. Add the footer disclaimers and the NASA DONKI credit.

**E7 Ship (Sunday morning)**
> Make a production build that runs fully offline (fonts, models and sounds bundled), deploy to Vercel/Cloudflare Pages, and list the exact steps to run it locally from a USB stick.
