# CLAUDE.md (repo root, shared by both workstreams)

Project: AEGIS, a crew health monitor with radiation early-warning, for NASA Space Apps 2026 (deadline Sun 15 Nov 23:59 local).

**Read `PROJECT_CONTEXT.md` before doing anything.** It defines the product, the demo, the work split and the timeline.

## Workstreams
- `/ml`: Tomas (data, ML, exports). See `ml/CLAUDE.md`.
- `/web`: Emile (app, 3D, replay, sound). See `web/CLAUDE.md`.
- `/contracts`: the ONLY interface between them. `DATA_CONTRACT.md` + sample JSON files.
- `/docs`: shared thesis, research, analysis. Start at `docs/MAP.md` to see how every part connects.

## Rules for any agent in this repo
1. Stay in your workstream's folder. Do not edit the other one.
2. Never change the shape of `storm_forecast.json` or `crew_data.json` silently. Propose changes in `contracts/CHANGELOG.md` and tell the human.
3. The clock is the main constraint: prefer the simplest thing that works for the demo. Ask before adding a dependency or a new framework.
4. No real astronaut health data. Crew data is simulated.
5. Commit small and often with clear messages.
