# Data sources

Copied from GitHub issue [#3](https://github.com/tmllo/aegis/issues/3), "Data sources: where every number in the app comes from (read before the pitch)" (tmllo, opened 2026-11-15). `gh` was not on PATH; the body below is the issue text from the GitHub API.

# AEGIS: where every number comes from (checked 15 Nov 2026, from main and crew-station)

| On screen | Real or simulated | Where it comes from |
|---|---|---|
| Crew vitals (HR, BP, glucose, temperature, sleep, mood, exercise) | Simulated | ml/make_sample_data.py: AR(1) process plus correlated shocks, seed 7, written to web/public/data/crew_data.json. Labelled "not real astronaut data". |
| Estimated bone loss % | Simulated | make_sample_data.py adds `0.027 * (1.25 - min(1.25, exercise_min/120))` per day. With no exercise that is about 1%/month (NASA's figure for weight-bearing sites without countermeasures). At 2 h/day it is about 0.2%/month. On screen it is the cumulative total after 75 days (Ana 0.46%, Kenji 0.42%, Léa 0.60%). Amber at 3% is a team rule. Red at 5% follows NASA-STD-3001 (bone density must stay at or above 95% of preflight). |
| "18%" radiation | Simulated dose divided by a real limit | Cumulative mission dose divided by the 600 mSv career limit (NASA-STD-3001), computed in web/src/core/radiation.ts. The dose series is a simulated Moon mission: 1.4 mSv/day ±10%, plus a planted storm spike on 5 Sep (+6 or +9.5 mSv). Ana is at 18.2%, Kenji 18.5%, Léa 18.7%. |
| Storm chance % | Real inputs, our model's output | Logistic model trained on NASA CCMC DONKI flares and CMEs (2010–2023) and tested on 2024–2026. It caught 16 of 17 storms, with 1 false alarm a month, a 3.8 h median lead, Brier skill 0.41, and a 72 h horizon. This is not an official NASA forecast. Don't quote v2, which wasn't accepted. |
| Cabin air (CO2, O2, pressure, temperature, water tanks) | Real | NASA ISS Live! telemetry. The app normally shows a recorded snapshot from 14 Nov; live data needs AEGIS_ISSLIVE=live. CO and humidity aren't connected. |
| ISS orbit on the globe | Real elements, computed positions | CelesTrak TLEs, with positions computed by SGP4 on the server. The offline fallback uses a cruder two-body model. The SAA shape is approximate, based on the NICER instrument's contour. |
| Inspiration4 labs | Real | NASA OSDR OSD-575 and OSD-569, pre- and post-flight blood draws. Loaded by the app but not shown anywhere yet. |
| Mind scores and habits | Simulated history plus real check-ins | server/mind/plugin.py builds seeded history. Today's check-ins are your own inputs. |
| Self-help activities | Written by the team, each citing a source | server/catalog/activities.yaml cites VA PTSD Coach, WHO, NASA BHP and HI-SEAS. |
| Wrist HR, SpO2, skin temperature | Simulated, uncited | web/src/wearable/wristSim.ts. SpO2 is hardcoded around 97.6 with no source. |
| Camera heart-rate scan | Live | rPPG from the laptop webcam. It measures whoever is sitting in front of it, not an astronaut. |
| Vital ranges (HR 40–110 and so on) | Team or clinical rules | NASA doesn't publish crew self-check thresholds. The 600 mSv limit is the only NASA number among them. |

## Watch in the pitch

- Don't quote a monthly bone loss rate from the app.
- "18%" is the share of the career radiation limit already used, from a simulated dose.
- The SpO2 number is made up.
- The Inspiration4 labs are real but not on screen.

## Script for judges

"Crew vitals are simulated from published ranges and clearly labelled. Bone loss uses NASA's roughly 1% a month loss without exercise, reduced by exercise. The storm chance is our model on real NASA DONKI data: it caught 16 of 17 storms in 2024–26 with about one false alarm a month. Cabin air is real ISS Live telemetry, the orbit uses real CelesTrak data, and the Inspiration4 blood panels are real NASA OSDR data."

## Quick fixes, if there's time

- Bone constant is now 0.027 (about 1%/month with no exercise). Done 2026-11-15.
- Remove the SpO2 chip or label it "demo".
- Show the Inspiration4 card.
