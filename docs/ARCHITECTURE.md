# AEGIS architecture

The one page every agent reads before changing code. If code and this page disagree, the code is wrong or this page needs a deliberate update (tell Tomas and Emile).

AEGIS is a crew **health** monitor. Radiation, cabin air and space weather are causes that feed the body; they are not separate apps.

```
5 NASA hazards -> 5 body systems -> indicators -> inputs (by cadence) -> personal-baseline engine
      -> caution & warning class (who acts) -> fit for duty -> countermeasure -> re-measure -> outcome
```

## 1. Layers and who owns them

```
Real sources            NASA DONKI · NASA OSDR (Inspiration4) · NASA ISS Live! · CelesTrak · published norms
      |
ml/      (Tomas)        storm model (logistic regression) · synthetic crew generator · crew_flags.py
      |
server/  (Tomas)        data core: catalog -> adapters -> SQLite store -> engine -> views
      |
contracts/ (both)       DATA_CONTRACT.md: storm_forecast.json · crew_data.json · real_crew.json · /api/*
      |
web/public/data/        the contract files the app reads (read-only for the app)
      |
web/src/data/  (Emile)  the ONLY code that loads files or calls the network
      |
web/src/core/  (both)   pure logic, no React: scoring (personal baseline), radiation (dose), cabin (bands), alarm (C&W class of the radiation alarm)
      |
web/src/station/ (Emile) screens and UI state: Overview · Crew health · Check-in · Radiation · guided Demo
```

**Arrows only go down.** A lower layer never imports from a higher one:
- `src/core` never imports React, zustand, `src/station`, `src/console` or `src/data/{store,load,http}`. Types from `src/data/types` are fine.
- `src/station` never fetches. It reads through `src/data` and computes through `src/core`.
- Nothing in `web/` writes to `public/data/`.
- On the server: an adapter never scores, a view never fetches, the engine never formats output (`server/README.md`).

## 2. Personal-baseline engine (frozen)

`web/src/core/scoring.ts`, mirrored by `ml/crew_flags.py`, locked by the golden test `scoring.test.ts`.
3-day mean vs the astronaut's own first 14 mission days -> z. Low side only for sleep, mood, exercise. A hard limit (`absolute_red`) is red at once. Dose and bone loss use absolute bands.

Changing it needs Tomas: same rule in both files, golden test updated, `contracts/CHANGELOG.md` entry.

## 3. Caution & warning ladder

After NASA-STD-3001 Vol 2. The class says **who acts**.

| Class | Set by | Who acts | Duty |
|---|---|---|---|
| Nominal | Inside own baseline | Nobody | Cleared for EVA |
| Advisory | 1.5σ drift (UI-only early band) | Crew: self-care, keep logging | Cleared for EVA |
| Caution | ≥ 2σ (contract amber) | Crew re-checks; in the daily surgeon report | Re-check before EVA |
| Warning | ≥ 3σ or a hard limit (contract red), **or the storm model's shelter warning** | Flight surgeon now; for a storm forecast, all crew suspend EVA and shelter as a precaution | Hold / shelter |
| Emergency | **A measured event only**: storm particles arrived, cabin pressure below its floor | All crew, immediately | In storm shelter |

### The safety rule

> **Emergency comes only from a measured event. A model forecast can raise Warning, never Emergency, and can never lower a class set by a measurement.**

Why: the storm model has 42% precision at the warning cut (about one false alarm a month). That is a good early warning and a bad emergency trigger. Real spacecraft caution & warning systems fire emergencies on measured thresholds.

Code: `web/src/core/alarm.ts` (`alarmClass`) maps the radiation alarm phase to a class; `alarm.test.ts` locks the rule. `src/station/model.ts` (`actionQueue`), `StationApp.tsx` (Shelter overlay) and `pages/Radiation.tsx` (replay onset) use it. Screens never write `'emergency'` themselves. `web/scripts/check-all.sh` fails if they do.

## 4. Honest data

Every number on screen comes from `public/data/*.json`, `public/samples/*.json` or `src/core`. Never typed into a component.
Each source keeps its label: real, recorded, simulated or estimated. Where every number comes from: `docs/DATA-SOURCES.md`.
The footer keeps every disclaimer: simulated crew data, not medical advice, data credits, anatomy credit.
The storm model predicts the chance that a flare is linked to a GOES >10 MeV proton storm. It does not predict dose. Never label it as a dose forecast.

## 5. Checks

| Check | Command | Locks |
|---|---|---|
| Web guardrails | `bash web/scripts/check-all.sh` | Typecheck, unit tests, no network outside `src/data`, pure `src/core`, untouched `public/data`, no hand-written Emergency, offline build |
| Contract shapes | `python ml/validate_contracts.py` | JSON shapes |
| Server | `python -m pytest server/tests -q` | Data core |
| UI click-through (optional, needs Playwright) | `node web/scripts/check-ui.mjs` | No console errors, no external requests |

## 6. Where the detail lives

| Topic | File |
|---|---|
| Product, demo, split | `PROJECT_CONTEXT.md` |
| Health logic in the app (hazards -> systems -> inputs -> C&W -> loop) | `docs/HEALTH-SYSTEMS.md` |
| How every part connects | `docs/MAP.md` |
| Data contract | `contracts/DATA_CONTRACT.md`, `contracts/CHANGELOG.md` |
| Storm model | `ml/results/metrics.md`, `ml/results/DECISIONS.md` |
| Crew UX numbers and 10 design rules | `web/docs/crew-ux.md` |
| Visual identity | `web/docs/REDESIGN.md` |
| Tonight's frontend redesign rules | `web/REDESIGN-RULES.md` |
