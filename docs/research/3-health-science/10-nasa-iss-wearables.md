# ISS wearables: what is actually worn on the station

Source (user-supplied): [NASA, "Wearable Tech for Space Station Research"](https://www.nasa.gov/missions/station/iss-research/wearable-tech-for-space-station-research/) (Melissa L. Gaskill, JSC; published 2024-11-13, updated 2025-01-06). Read 2026-11-14.

## Summary
| Item | Detail |
|---|---|
| Content | 9 wearables used in ISS research, covering temperature, sleep, heart and breathing, personal CO2, radiation dose, radiation shielding. |
| Data access | Not stated for any device; no public data feed. Crew self-viewing not described. |
| Value for us | A NASA-sourced list of what can be measured in space, which the challenge asks teams to justify ("Which measurements can be performed in space?"). Each row below maps a device to an app indicator, so every simulated channel cites a real flown instrument. |
| Combine with | Bio-Monitor (09) for vitals; ISS Live! cabin CO2 (01) for the environment; thresholds (03). |

## Device to app-indicator map
| Device | Agency | Measures | Worn | Key finding | App indicator / channel | Source |
|---|---|---|---|---|---|---|
| T-Mini (Thermo-Mini) | ESA | Core body temperature | Headband | Links temperature to room temp, humidity, time of day, physical stress | Core temperature (with context: cabin temp from ISS Live) | [Investigation 8999](https://www.nasa.gov/mission/station/research-explorer/investigation/?#id=8999) |
| Thermolab (earlier) | ESA | Thermoregulation, cardiovascular response, rest and exercise | Sensors | Core temperature rose higher and faster during exercise in space and stayed up at rest | Exercise heat warning | [Investigation 297](https://www.nasa.gov/mission/station/research-explorer/investigation/?#id=297), [Sci Rep 2017](https://www.nature.com/articles/s41598-017-15560-w) |
| Actiwatch Spectrum | NASA | Motion + ambient light | Wrist | Crew slept significantly less in flight than before and after | Sleep hours, sleep quality, light exposure | [Facility 838](https://www.nasa.gov/mission/station/research-explorer/facility/?#id=838), [Study](https://www.sciencedirect.com/science/article/abs/pii/S147444221470122X) |
| Actiwatch Sleep-Long (earlier) | NASA | Light vs sleep-wake cycle | Wrist | Sleep deficiency linked to circadian changes; led to lighting countermeasures | Circadian rhythm view; "lighting" countermeasure | [Investigation 286](https://www.nasa.gov/mission/station/research-explorer/investigation/?#id=286), [npj Microgravity 2015](https://www.nature.com/articles/npjmgrav201519) |
| Wearable Monitoring | ASI (Italy) (unverified in article) | Heart rate and breathing during sleep | Sensor vest | Good signal quality without waking the wearer | Night HR and breathing rate | [Investigation 1144](https://www.nasa.gov/mission/station/research-explorer/investigation/?#id=1144), [Study](https://www.sciencedirect.com/science/article/abs/pii/S0924424717321969) |
| Personal CO2 Monitor | NASA | CO2 around the wearer | Clothing-attached | Worked as crew-worn or static monitor | Personal CO2 (local pockets can exceed the cabin average) | [Investigation 1839](https://www.nasa.gov/mission/station/research-explorer/investigation/?#id=1839), [Report](https://ttu-ir.tdl.org/server/api/core/bitstreams/72ada33c-f401-4579-9b1d-41ad915833ab/content) |
| EVARM | CSA | Radiation dose during spacewalks | Pocket dosimeters | Feasible way to target routine monitoring | EVA dose | [Investigation 162](https://www.nasa.gov/mission/station/research-explorer/investigation/?#id=162), [IEEE](https://ieeexplore.ieee.org/document/4493407) |
| Active Dosimeter | ESA | Dose over time vs orbit, altitude, solar cycle, flares | Worn | Whole-mission dose analysis; also flew on Artemis I Orion (25.5 days, 2022) | Cumulative dose vs career limit (600 mSv, see 03); flare spikes from NOAA SWPC (01) | [Investigation 1869](https://www.nasa.gov/mission/station/research-explorer/investigation/?#id=1869), [Study](https://www.sciencedirect.com/science/article/pii/S0939388923000387), [Artemis I radiation](https://www.nasa.gov/missions/artemis/artemis-1/artemis-i-radiation-measurements-validate-orion-safety-for-astronauts/) |
| AstroRad Vest | NASA / partners | Shielding against solar particle events | Vest | Tested on ISS, then Artemis I | Action card: "solar storm: put on vest, go to shelter" | [Investigation 7803](https://www.nasa.gov/mission/station/research-explorer/investigation/?#id=7803) |

## How to use this in the build
| Move | Reason |
|---|---|
| Label each simulated channel with the flown device it imitates (e.g. "Sleep: Actiwatch-class") | Answers "which measurements can be performed in space" with NASA sources; raises the Validity score |
| Add personal CO2 next to cabin CO2 from ISS Live | Shows why one cabin average is not enough; ties a live NASA feed to a body symptom (headache) |
| Radiation panel: Active Dosimeter-style cumulative dose + live NOAA proton flux + AstroRad action | Turns a live NASA/NOAA feed into a concrete crew action |
| Exercise heat alert from Thermolab finding | A space-specific rule other teams will not have |
| Sleep + light view from Actiwatch findings | Supports the "lighting" and sleep-hygiene guidance in 03 |

Note: the "Wearable Monitoring" agency is not stated in the article; confirm on the investigation page before citing it as ASI.
