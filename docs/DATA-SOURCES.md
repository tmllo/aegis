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
| EVA suit (heart rate, oxygen, CO2, coolant, battery, dose) | Simulated | `server/catalog/eva.yaml`. Suit pressure 4.3 psi and the 16.8 V battery are NASA EMU public facts. Every other number is a working value. Full list below. |
| Organ radiation map | Published phantom doses, with three estimates called out | Artemis I organ doses from Houri et al. 2026. Risk shares, the shelter factor and the expected dose are estimates, not NASA products. Full list below. |

## EVA suit simulation

All simulated. `server/catalog/eva.yaml` sets `quality: simulated`. No real astronaut physiology, and not medical advice. Resting heart rate is the member's simulated baseline in `crew_data.json` (mean of the first 14 mission days). The quiet dose rate is not stored in this file: the engine reads the habitat `assumed_dose_mSv_day` from `subjects.yaml` and converts it to µSv/h. Moon 1.4 mSv/day is Zhang et al. 2020 (Sci. Adv., doi:10.1126/sciadv.aaz1334), which is 58.33 µSv/h. Mars 0.65 mSv/day is Hassler et al. 2014 (Science, doi:10.1126/science.1244797), which is 27.08 µSv/h.

Two NASA facts are used as published. Everything else below is a working value we chose so the demo behaves.

| Constant | Value | Source |
|---|---|---|
| Suit pressure | 4.3 psi, held constant | NASA EMU operating pressure, 4.3 psia |
| Battery full voltage | 16.8 V | NASA EMU silver-zinc pack |
| Alert colours | emergency flashing red, warning red, caution yellow, advisory blue, nominal green | EVA contract (GitHub issue 4). It maps NASA-STD-3001 Volume 2 Table 10.3-1. Nominal is the idle colour in that contract, not an alert class |
| Status from level | emergency → abort, warning → warning, caution → caution, advisory stays nominal | Same contract. An advisory does not raise the status |

The numeric cutoffs in the alert table are working values. They are not a copy of a NASA-STD-3001 cell.

API bounds and the clock, all working values: a run is at most 240 minutes, the step is 1–60 s, and a response is capped at 5000 frames. `start_time` is `12:00:00Z` on the mission day, not the server clock, so two calls match. The offline files use subject c1, profile traverse, 60 minutes, step 5 s, storm on, for Moon and Mars.

### Sites

| | Moon | Mars | Source |
|---|---|---|---|
| Gravity | 0.166 g | 0.38 g | Moon is about 1.62 m/s² (0.165 g); the contract value is 0.166. Mars is about 3.71 m/s² (0.38 g) |
| Exterior temperature | −180 to 120 °C | −125 to 20 °C | Working values, rounded from NASA Moon and Mars facts |
| Sol | 708.7 h | 24.66 h | A lunar day is about 29.5 Earth days. A Mars sol is 24 h 39.6 min |
| One-way light time | 1.25–1.35 s | 240–1440 s | Moon is about 1.3 s. The contract uses 4–24 min for Mars; the real Earth–Mars range is about 3–22 min |
| Habitat pin | Artemis Base Camp, −89.5°, 0.0° | Jezero Base, 18.4° N, 77.5° E | Working values. A south-pole site near Shackleton, and Jezero crater. Not surveyed pins. The names match the simulated mission |

Waypoints are working values, in metres and degrees from the habitat.

| Moon | | Mars | |
|---|---|---|---|
| Ridge (m1) | 180 m, bearing 40°, inspect the ridge | Fan edge (a1) | 220 m, bearing 25°, walk the delta fan |
| Crater rim (m2) | 420 m, bearing 110°, photograph the rim | Outcrop (a2) | 480 m, bearing 95°, photograph the outcrop |
| Sample trench (m3) | 700 m, bearing 200°, collect regolith | Cache (a3) | 760 m, bearing 160°, collect a core |

### Physiology, suit and motion

Heart rate starts at the resting baseline, adds a suit overhead, then a locomotion term multiplied by gravity in g. The same task costs less on the Moon than on Mars. The suit term stays, because the suit is work in any gravity. Metabolic watts drive oxygen use, CO2 and heat. SpO2 is a demo trace, not a sensor and not a published EMU measurement.

| Constant | Value | Source |
|---|---|---|
| Oxygen, kJ per litre | 20.9 | Working conversion from metabolic watts to oxygen volume |
| Respiratory quotient | 0.85 | Working value. CO2 production is 0.85 times oxygen use |
| Heart rate, suit overhead | 22 bpm | Working value |
| Heart rate, locomotion at 1 g | 55 bpm | Working value, then × gravity in g |
| Metabolic rest / suit / locomotion at 1 g | 120 / 160 / 350 W | Working values. Suited rest is about 100–150 W and a busy EVA is a few hundred watts, in the range NASA quotes for EVA work. These three numbers are hand-set |
| SpO2 rest, and the demo slopes | 98%; 0.15 per mmHg above 8 mmHg CO2; 0.05 per percent of tank below 40%; floor 88% | Demo trace. Working values |
| Respiration | 12 bpm at rest, +16 with activity, +0.35 bpm per mmHg above 6 mmHg | Working values |
| Core temperature | 37.0 °C; +0.003 °C per watt above 150 W; +0.02 °C per degree of coolant above 18 °C | Working values |
| Oxygen tank | 700 L | Working value. A one-hour nominal EVA uses a small fraction. The emergency leak reaches the warning band and does not empty the tank |
| Helmet CO2 | setpoint 3.8 mmHg; gain 0.60 mmHg per litre missed; removal 0.98 nominal, 0.50 degraded, 0.05 fault | Working values. A healthy scrubber holds helmet CO2 near a few mmHg |
| Coolant loop | 16 °C at rest, +0.01 °C per watt | Working values |
| Battery empty point and drain | 14.0 V, 420 min from full to empty | Working values. The 16.8 V full point is the NASA pack |
| Ground speed | 1.1 m/s, activity floor 0.45, wobble period 37 s | Working values. Speed is 1.1 × the profile scale × (0.45 + 0.55 × activity). The seed is subject, site and profile, so two crew members differ. The storm is not in the seed |
| Exterior trace | sunlit true, day fraction 0.82, swing 0.04 | Working value. An EVA is planned in daylight |
| Storm dose | ×30 from 40% of the way through | Working values, so the gauge jumps. Not a measured solar particle event |

### Profiles

All working values.

| Profile | Motion | What is planted |
|---|---|---|
| Walk | steady, base 0.32, wobble 0.04, speed scale 0.15 | Easy walk near the habitat |
| Traverse | legs, base 0.55, leg amplitude 0.08, 3 legs, wobble 0.04, speed scale 0.45 | A steady walk out to the waypoints |
| Sample | burst, base 0.30, burst 0.85, every 180 s for 50 s, wobble 0.03, speed scale 0.25 | Short high-effort geology bursts |
| Emergency | same leg walk, speed scale 0.40 | Scrubber nominal → degraded at 900 s → fault at 2100 s. Oxygen leak 1.7% of tank per minute from 900 s. Coolant rises 0.32 °C per minute from 900 s. Tuned so a 60-minute run reaches warning and does not reach abort |

### Alert cutoffs

Worst band first. High means the value is at or above the cutoff. Low means at or below. One alert per code. All cutoffs are working values.

| Code | Cutoffs | Note |
|---|---|---|
| HR_HIGH | advisory 120, caution 140, warning 160, emergency 180 bpm | Not a NASA-STD-3001 table cell |
| PPCO2_HIGH | 5, 8, 12, 20 mmHg | A healthy EMU holds helmet CO2 near a few mmHg. The public suit caution numbers are not copied here |
| O2_LOW | advisory 55, caution 40, warning 25, emergency 10% | Remaining tank, not the suit atmosphere. 100% is a full tank |
| COOLANT_HOT | 20, 24, 30, 40 °C | Liquid cooling loop |
| BATTERY_LOW | advisory 30%, caution 15% | A one-hour EVA on a 7-hour pack does not reach these |
| SCRUBBER | degraded → caution, fault → warning | Nominal is silent. Only the emergency profile plants the failure |
| ABORT_TO_HABITAT | emergency at 150 µSv/h, action exactly "ABORT TO HABITAT" | Above either quiet surface rate and below the storm rate, so only storm=1 fires it |

## Organ radiation map

The heat map uses published phantom and shielding numbers. Three things on that screen are our estimates, and the UI should say so.

- **Risk shares are ICRP, not a NASA organ table.** Each organ's share of cancer plus heritable harm is its dose times its ICRP Publication 103 relative detriment (2007, Table A.4.1, as reproduced by Breckow 2020). No NSCR-2012 organ-by-organ REID table was retrieved. For a male crew member the engine sets the breast detriment to 0 and renormalises, which is a simplification, because the ICRP factors are sex-averaged.
- **The shelter factor is estimated.** It is the ratio of dose behind 10 cm of water to dose behind 5 cm, from Simonsen et al. 1992, applied on top of the Orion hull dose. Behind about 25 g/cm² the spectrum is already hardened, so this overstates how much a shelter still saves. Organs missing from that paper use the nearest listed organ as a proxy. The Oct 1989 shelter column is that factor times the hull dose, then rounded. Label it an estimate. The Aug 1972 shelter is the same factor times the hull dose.
- **Expected dose is illustrative.** The storm model says whether a ≥10 MeV proton storm follows a flare. It does not say how large the storm is. Expected dose is the forecast chance times an Aug 1972 or Oct 1989 reference dose. It shows the stakes. It is not a forecast of dose. Don't quote v2, which wasn't accepted.

The linear risk used on the map is also derived, not NSCR: NASA's career limit of 600 mSv keeps the risk of exposure-induced death under 3% at a conservative age and sex (NASA-STD-3001 Vol 1 Rev C), so the map uses 0.005% REID per mSv. ICRP 103's nominal whole-population detriment is about 5.5% per Sv and is context only. Organ positions on the body model are hand-placed, not taken from a voxel phantom.

### What is taken from a paper

| What the map shows | Number | Source |
|---|---|---|
| GCR almost uniform through the body | Artemis I, inside Orion: 9.38 mGy front skin, 9.44 lung, 9.42 stomach, 10.07 uterus, 9.56 spine, 10.17 back skin | Artemis I MARE team, *Space radiation measurements during the Artemis I lunar mission*, Nature, 2024, doi:10.1038/s41586-024-07927-7 |
| Cruise rate behind the hull | 0.379 mGy/day. With quality factor 3.1 that is 1.18 mSv/day | Houri, Berger et al. 2026, below |
| Per-organ solar-storm dose inside Orion, with and without the AstroRad vest | Whole-body phantom, NASA dose equivalent. Oct 1989 effective dose 219.0 mSv in the hull and 138.2 mSv with the vest. Aug 1972: 204.2 and 85.3 mSv. Oct 1989 skin 494.4 mSv, red marrow 154.6 mSv. The vest cut effective dose 37–39% (Oct 1989) and 58–61% (Aug 1972) | Houri J.M., Berger T. et al. 2026, *First evaluation of wearable radiation protection for human deep space exploration, as flown on Artemis I*, Sci. Adv. 12, eadz1892, doi:10.1126/sciadv.adz1892. Median shielding at the phantom's seat is about 24.8 g/cm² aluminium. The full organ table is `docs/backend/RADIATION-ORGAN-DATA.md` |
| Skin much higher than deep organs on an EVA | Skin dose about 20 times the deep-organ dose (Reitz et al. 2009). Dose drops about 10 times in the first 8 mm. ISS phantom effective dose 0.59 ± 0.04 mSv/day | Reitz G. et al. 2009, *Astronaut's organ doses inferred from measurements in a human phantom outside the ISS*, Radiat. Res. 171:225–235, doi:10.1667/rr1559.1. The 8 mm drop and the 0.59 mSv/day are from the MATROSHKA summary, Reitz, https://three.jsc.nasa.gov/articles/PhantomsReitz.pdf |
| How aluminium thickness cuts a solar storm | Aug 1972, dose equivalent. Suit 0.4 g/cm²: skin 9350 cSv, BFO 217 cSv. Pressure vessel 1 g/cm²: 3560 and 180. Equipment room 5 g/cm²: 427 and 65. Shelter 10 g/cm²: 110 and 24. A 10 g/cm² aluminium shelter meets the 30-day limits | Wilson J.W. et al. 1997, *Exposures to Solar Particle Events in Deep Space Missions*, NASA TP-3668 |
| Water-slab doses, and the shelter ratio | Oct 1989 protons, absorbed dose. Skin 721, 298, 96, 35 cGy at 0.5, 2, 5 and 10 cm of water. BFO 80, 55, 31, 15 cGy. The 10 cm / 5 cm ratio is the shelter factor above | Simonsen L.C., Atwell W., Nealy J.E., Cucinotta F.A. 1992, *Radiation dose to critical body organs for October 1989 proton event*, NASA TP-3237 |
| Tissue weights and detriment | w_T and D_rel per organ. Remainder w_T is 0.12. Other-solid detriment is 0.198 | ICRP Publication 103 (2007). Weights as tabulated for effective dose. Detriment from Table A.4.1 |
| Short-term and career limits | Lens 1000 / 2000 / 4000 mGy-Eq (30-day / 1-year / career). Skin 1500 / 3000 / 6000. Blood-forming organs 250 / 500 / no career limit. Heart 250 / 500 / 1000. Brain 500 / 1000 / 1500 mGy. Career effective dose 600 mSv. Design-reference solar storm 250 mSv | NASA-STD-3001 Volume 1 Revision C (2023), Table 4.8-1 and §4.8.2 |

Limits are in mGy-Eq. The organ values from Houri et al. are NASA dose equivalent in mSv. Comparing the two is approximate. Proton RBE for those limits is 1.5.

Quiet daily rates on the map are the ones already in `subjects.yaml`: ISS 0.5, Moon 1.4, transit 1.8, Mars 0.65 mSv/day. Inside the ISS the engine mixes 40% trapped-proton shape and 60% uniform GCR. That 40% split is a working value. Moon and Mars reuse the uniform GCR shape at their own daily rate.

## Watch in the pitch

- Don't quote a monthly bone loss rate from the app.
- "18%" is the share of the career radiation limit already used, from a simulated dose.
- The SpO2 number is made up. The EVA SpO2 trace is a demo too.
- On the organ map, the risk shares, the shelter saving and the "expected dose" are estimates. The phantom doses and the NASA limits are not.
- The Inspiration4 labs are real but not on screen.

## Script for judges

"Crew vitals are simulated from published ranges and clearly labelled. Bone loss uses NASA's roughly 1% a month loss without exercise, reduced by exercise. The storm chance is our model on real NASA DONKI data: it caught 16 of 17 storms in 2024–26 with about one false alarm a month. Cabin air is real ISS Live telemetry, the orbit uses real CelesTrak data, and the Inspiration4 blood panels are real NASA OSDR data."

## Quick fixes, if there's time

- Bone constant is now 0.027 (about 1%/month with no exercise). Done 2026-11-15.
- Remove the SpO2 chip or label it "demo".
- Show the Inspiration4 card.
