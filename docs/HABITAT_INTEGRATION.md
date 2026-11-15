# AEGIS: habitat anomaly detection, integration plan

## What I found
- **It isn't a separate challenge.** The 14 official 2026 Space Apps challenges (checked on spaceappschallenge.org tonight) include nothing about spacecraft anomaly detection. You probably saw ESA's anomaly-detection benchmark or NASA's research call on onboard anomaly response; neither is a Space Apps challenge.
- **So it has to grow out of the health challenge, not sit beside it.** It does, legitimately: "hostile closed environment" is one of NASA's 5 hazards named in our challenge, and cabin CO₂ is a documented ISS crew-health problem (NASA-STD-3001 now limits the 1-hour average to 3 mmHg; crews report headaches and poor sleep around 3.5 mmHg).
- **Framing:** "Habitat watch". The habitat is treated as a fourth crew member. The detector flags life-support drift before a safety limit and links it to the crew symptoms it may explain.

## Design in one picture
```
NASA SMAP+MSL (real, labeled) ─► tune on MSL, test once on SMAP ─► frozen thresholds + honest metrics
                                                                        │
crew_data.json (mission dates, flags) ─► habitat_sim (planted faults) ─► same detector ─► habitat_telemetry.json ─► web
```
- One detector class (Ridge forecast → smoothed error → robust z) serves both layers. The robust-z score is unit-free, which is why thresholds tuned on spacecraft telemetry transfer to the habitat.
- Additive contract: a new `habitat_telemetry.json`. `storm_forecast.json` and `crew_data.json` don't change, so nothing Emile has built breaks.

## Where to put it
Unzip into the root of your `aegis` repo (the folder with `CLAUDE.md`, `PROJECT_CONTEXT.md`, `ml/`, `web/`, `contracts/`). The `aegis-anomaly-patch/` folder's contents merge into it: `ml/anomaly/` is new, `contracts/` and `web/` get new files only. Nothing existing is overwritten. Then commit and tell Emile.

## Files in this patch
| file | for |
|---|---|
| `ml/anomaly/CLAUDE.md` | the Claude Code brief, in **tutor mode**: Tomas writes the ML, Claude does plumbing and tutoring |
| `ml/anomaly/LEARN.md` | Tomas's workbook: concepts, steps, explain-back questions |
| `ml/anomaly/detector.py`, `evaluate.py` | skeletons with `TODO(Tomas)`: the ML you write |
| `ml/anomaly/tests/test_anomaly.py` | 10 tests, verified against a reference solution: your feedback loop |
| `ml/anomaly/PROMPTS.md` | prompts to paste, in order (A0–A5) |
| `contracts/HABITAT_CONTRACT.md` | the new data contract |
| `contracts/habitat_telemetry.sample.json` | fake but exact-shape sample (1,800 hourly rows, 4 anomalies incl. a false alarm) so Emile can start now |
| `web/HABITAT_UI.md` | Emile's prompt and the new demo beat |

## Go / no-go (be strict)
It's ~2.5 h for you (learning while building) + ~1 h UI for Emile, against a 23:59 deadline.
- **Go** only if the real `storm_forecast.json` and `crew_data.json` have shipped and the MVP demo path runs end to end.
- **Emile can start the UI immediately** against the sample; it's independent of your ML work.
- **Hard stop at 22:45:** whatever layer works ships; anything else is cut. The submission text, deck and video matter more than a fourth module.

## Demo change
Insert after the amber-heart beat: Kenji red brain → sleep → "Possible environmental cause: cabin CO₂" → habitat chart → "flagged X h before the limit". It strengthens the health story (root cause, not just alarms), so it earns its 20 seconds.
