# AEGIS health system: how the app thinks

The app is a crew **health** monitor. Radiation, cabin air and space weather are not separate apps: they are *causes* that feed the body. Everything hangs off one chain:

```
5 NASA hazards → 5 body systems → indicators → inputs (by cadence) → personal-baseline engine
      → caution & warning class (who acts) → fit for duty → countermeasure → re-measure → outcome
```

## 1. Hazards → body systems (the spine)

| Body system | Readings in the app | NASA HRP hazards | Why it matters on a mission |
|---|---|---|---|
| Cardiovascular | systolic/diastolic BP, resting HR, live wrist HR | Altered gravity, closed environment | Headward fluid shift; risk on EVA and on return |
| Neuro & sleep | sleep, mood, stress, energy, reaction time (PVT) | Isolation, distance, closed environment | Attention and reaction time are mission safety |
| Musculoskeletal | exercise minutes, est. bone loss | Altered gravity | ~1%/month bone loss without load |
| Blood & metabolic | fasting glucose; Inspiration4 CBC/CMP as real-data proof | Closed environment, radiation | Labs catch what vitals miss |
| Radiation & thermal | daily dose, mission dose vs 600 mSv, body temp | Radiation, closed environment | Career dose; fever spreads in a closed habitat |

Code: `web/src/station/model.ts` (`SYSTEMS`, `HAZARD_LABEL`).

## 2. Inputs, by cadence

| Cadence | Input | Source in code |
|---|---|---|
| Continuous | Wrist band: HR (from own baseline), SpO₂, skin temp (demo values) | `wearable/useWristband.ts` |
| Daily health check | Sleep, mood, stress, energy, BP, HR, temp, glucose, exercise | `station/pages/Checkin.tsx` |
| Daily, optional sensors | Camera pulse scan (rPPG, on-device), 30 s reaction test (PVT) | `scan/useCameraScan.ts`, `inputs/useReactionTest.ts` |
| Periodic labs | Inspiration4 blood panels, NASA OSDR OSD-575 (real, n = 4) | `public/data/real_crew.json` |
| Environment | Cabin ppCO₂/ppO₂/pressure/temp (recorded ISS Live!), dose rate per location, space-weather forecast | `data/cabin.ts`, `crew_data.environments`, `storm_forecast.json` |

## 3. Engine: personal baseline

The contract rule, unchanged (`core/scoring.ts`, mirrors `ml/crew_flags.py`):
3-day mean vs the astronaut's own first 14 mission days → z. Low-side-only for sleep, mood, exercise. A hard limit (`absolute_red`) is red at once. Dose and bone loss use absolute bands.

**Real-data proof:** on the Inspiration4 panels, 25 post-flight results were inside the normal lab range but ≥ 2σ from that astronaut's own pre-flight baseline; only 8 were outside the lab range. A population range misses most of the change.

## 4. Caution & warning classes (after NASA-STD-3001 Vol 2, Table 10.3-1)

The class says **who acts**. It replaces the old "Watch / Act now" labels.

| Class | Rule | Who acts | Duty |
|---|---|---|---|
| Nominal | inside own baseline | none | Cleared for EVA |
| Advisory | 1.5σ drift (our early band, UI only) | Crew: self-care, keep logging | Cleared for EVA |
| Caution | ≥ 2σ (contract amber) | Crew re-checks; in the daily surgeon report | Re-check before EVA |
| Warning | ≥ 3σ or past a hard limit (contract red) | Flight surgeon reviews now | Hold: no EVA or safety-critical tasks |
| Emergency | Solar storm shelter warning | All crew, immediately | In storm shelter |

Fit-for-duty mapping is a team working rule, not a NASA rule. Say so if asked.

## 5. Countermeasure loop

Each caution/warning opens a loop: **Detected → Countermeasure → Re-measure → Outcome.**
Start the countermeasure on the system panel. The next health check re-scores the reading. Back inside the baseline means resolved; still flagged means escalated to the flight surgeon. Code: `station/health.tsx` (`Loop`), closed in `Checkin.tsx` on save.

## 6. Linked factors (systems view)

Each system panel lists the other signals that could explain it. Examples: cabin CO₂ feeds Neuro & sleep, sleep feeds BP and glucose, exercise feeds bone and heart, space weather and dose rate feed Radiation & thermal. Code: `station/health.tsx` (`Causes`).

## 7. Screens

- **Overview:** crew cleared for EVA (n/3), C&W counts, crew cards with a 5-system strip, the countermeasure queue, and the environment cards (radiation exposure, cabin air, crew dose).
- **Crew health (hub):** C&W class and owner, fit for duty, 5 systems, 28-day health record, 3D body tinted by system, system panel (readings + trends + loop + linked factors + live band + real-lab proof).
- **Health check:** 6 steps: sleep & mind, heart (with camera scan), body, exercise, alertness (PVT), then review. Saving updates every screen and closes loops.
- **Radiation:** May 2024 replay (held-out) that drives the station-wide Emergency shelter alarm, space weather now, crew dose vs career limit by location, held-out model scorecard, forecast feed.
- **Guided demo:** rail button "Demo", arrow keys, 7 beats.

## 8. Not built yet (good next steps)

- Organ dose on the 3D body from `server/radiation_organs` (engine exists on `main`, no web export yet).
- EVA suit lane from `server/eva` (NASA-STD-3001 colours already in `eva.yaml`).
- Mind layer activities (`server/catalog/activities.yaml`) as countermeasures for stress/sleep.
- Persist loops and extras to the data core (`/api/observations`) instead of session memory.
