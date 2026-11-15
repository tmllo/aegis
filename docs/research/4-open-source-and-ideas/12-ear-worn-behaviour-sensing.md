# Ear-worn behaviour sensing: does the technology add value to the NASA solution?

Scope: only the technology (a very low-cost, low-maintenance ear-worn sensor that reads tissue-conducted vibration, motion and ambient conditions over Bluetooth LE, records offline and syncs later), judged strictly on value for astronaut health monitoring. No livestock product framing.

## Verdict
| Question | Answer |
|---|---|
| Does it add value? | **Yes, for a specific gap.** It measures behaviour that standard vitals miss: eating, drinking, coughing, breathing pattern, shivering. These map to NASA in-flight risks that rival entries ignore: inadequate nutrition, dehydration, respiratory irritation (CO2, dust), thermal stress (see 03, 06, 10). |
| What does not transfer | Every motion metric that uses gravity as "down" (lying, standing, steps, head posture, droop angle) fails in microgravity. Useful only on the Moon or Mars. |
| Unique advantage vs flown devices | Bio-Monitor (09) and the ISS wearables (10) are shirts, vests, headbands and wrist units that need donning, charging and docking. An always-worn ear sensor with long battery life and offline storage removes crew time, which NASA lists as a scarce resource (REFORM requirements, 11). |
| Use in the 48 h build | Simulated "ear sensor" channel group in the data generator; no hardware needed. |

## Channels worth keeping (work in microgravity)
| Channel | Measured via | Crew health use | NASA risk (03) | Alert idea |
|---|---|---|---|---|
| Chewing cycles, eating time | Tissue-conducted vibration | Meal detection; intake trend vs personal baseline | Inadequate nutrition, body-mass loss | Eating time down > 25% vs baseline for 3 days -> prompt food log (proposed threshold) |
| Drinking (swallow) events | Vibration | Hydration proxy | Dehydration; target >= 2.5 L/day | Few drinking events by mid-day -> reminder |
| Cough frequency | Vibration + sound | Respiratory irritation | CO2, dust, infection | Cough rate up + cabin CO2 high (ISS Live, 01) -> check CO2 and ventilation |
| Respiration rate, rapid breathing | Vibration / motion | Breathing pattern | CO2 exposure, exertion, heat | Breathing rate above personal range at rest -> self-check |
| Shivering | Vibration rhythm | Cold stress | Thermal environment | Shivering + low ambient temp -> adjust module temp |
| Heart rate (estimate) | Ear PPG | Pulse trend | Cardiovascular | Same thresholds as 03 |
| Ear temperature (estimate) | Skin sensor | Fever / heat trend | Heat strain (core temp +1 C in flight, 03/10) | Estimate only; confirm with thermometer |
| Ambient temp, humidity, pressure, light | On-sensor environment | Personal micro-environment | Pressure leak, humidity, circadian light (Actiwatch, 10) | Pressure drop -> emergency banner |
| Battery voltage | Device | Sensor health | Crew time | Low battery -> swap reminder |
| No signal + no movement | Device logic | Unresponsive crew member or sensor lost | Emergency | Alarm to crew, then ground |

## Channels to drop for space
| Channel | Reason |
|---|---|
| Lying time, standing transitions, steps, head-down posture, posture variance, droop angle | Need gravity; meaningless in microgravity (keep only for a Moon/Mars mode) |
| Rumination, sucking rhythm, oestrus, calving, scours, lameness, mastitis, ketosis | Livestock-specific; no direct crew value |

## How it fits the solution
| Layer | Source |
|---|---|
| Vitals | Bio-Monitor-class stream (09), live Bluetooth heart-rate strap (04) |
| Behaviour | Ear-worn sensing channels above (simulated) |
| Environment | ISS Live! cabin telemetry, NOAA radiation (01) |
| Labs | Inspiration4 OSDR blood data (02, 07) |
| Logic | Personal baseline + drift detection, ranked "check yourself on these" list, flags not diagnoses, delay-aware escalation (03, 08) |

Unverified: battery life, cost, sensor accuracy and the exact channel set of any specific device are not published; all thresholds marked "proposed" are ours, not NASA's.
