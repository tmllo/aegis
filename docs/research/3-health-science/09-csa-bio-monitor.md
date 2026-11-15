# CSA Bio-Monitor (and Bio-Analyzer): the real ISS health-monitoring system

Source (user-supplied): https://www.asc-csa.gc.ca/eng/sciences/bio-monitor.asp (page modified 2026-02-26). Read 2026-11-14.

## Summary
| Item | Detail |
|---|---|
| What it is | CSA wearable system on the ISS since December 2018: smart shirt + headband + tablet app. Built by Carre Technologies (Montreal); commercial version is Hexoskin / Astroskin. |
| Measures | Pulse and ECG, blood pressure, breathing rate and volume, skin temperature, SpO2, physical activity. |
| Data flow | Recorded on a battery pack; astronaut docks it on a base, data goes to Earth via the station's communications. Crew see vitals live on the tablet during a session. Ground science team only; no public data. |
| Why it matters for us | It is the closest real equivalent of what the challenge asks for, and it sets a credible parameter list for our simulated "suit stream". Its gap: it collects data for scientists; it does not interpret it for the crew. That is our product. |
| Live demo option | Hexoskin Smart streams HR, breathing rate and steps over Bluetooth LE; raw signals need a licensed Android SDK; REST API needs approval by email. Not practical in 48 h; simulate instead. |

## Bio-Monitor components
| Component | Role | Source |
|---|---|---|
| Smart shirt | Snug shirt with straps holding small metal sensors on the skin; worn during sleep and exercise | [CSA Bio-Monitor](https://www.asc-csa.gc.ca/eng/sciences/bio-monitor.asp) |
| Headband | Part of the system (CSA sensor list: skin temperature, SpO2) | [CSA Astroskin](https://www.asc-csa.gc.ca/eng/sciences/astroskin.asp) |
| Tablet app | Astronaut selects activity type and views vital signs during a session | [CSA Bio-Monitor](https://www.asc-csa.gc.ca/eng/sciences/bio-monitor.asp) |
| Battery pack + base | Docking the pack downloads the data | same |
| Xiphos processor card | Sends data from the ISS to Earth | same |
| Partners | Carre Technologies (developer), CALM Technologies (space engineering), Xiphos (processor), Katz Design (mechanical/CAD) | same |

## What it replaces (design cue: one garment instead of many devices)
| Old equipment | Bio-Monitor channel | Our app indicator |
|---|---|---|
| Electrocardiograph | ECG / pulse | Heart rate, rhythm |
| Blood pressure cuff | Blood pressure | Blood pressure |
| Fingertip oximeter | SpO2 | Oxygen saturation |
| Ankle activity bracelet | Activity | Activity, sleep |
| (none) | Breathing rate and volume | Breathing rate (link to cabin CO2 from ISS Live) |
| (none) | Skin temperature | Temperature (core runs about +1 C in flight; see 03) |

## Bio-Analyzer (companion device: blood, saliva, urine)
| Item | Detail | Source |
|---|---|---|
| What | Console-sized analyzer for fluids from a finger prick (a few drops) | [CSA Bio-Analyzer](https://www.asc-csa.gc.ca/eng/iss/bio-analyzer.asp) |
| Measures | Blood cells and biomarkers (e.g. specific cell counts). Page names no analytes such as glucose. | same |
| Time to result | Goal 2 to 3 hours | same |
| History | Flown April 2019 (Cygnus); first used May 2019 by David Saint-Jacques | same |
| Builders | Honeywell (COM DEV), Xiphos Q7 platform | same |
| Status 2026 | Not stated (unverified) | same |
| Our use | Justifies a "lab result" input path (blood count, biomarkers) in the app, matching the Inspiration4 OSDR labs in 02 and 07. |

## Hexoskin / Astroskin developer access
| Route | Real-time? | Access | Fit for 48 h | Source |
|---|---|---|---|---|
| Smart BLE stream | Yes: processed HR, breathing rate, steps (no raw) | Hexoskin Smart device | Only if a device is at hand | [Hexoskin streaming options](https://support.hexoskin.com/hexoskin-real-time-data-streaming-options-ble-and-sdk-onesync) |
| Android SDK | Yes, raw signals | Licensed (academic/research/government) | No | same |
| REST API (OAuth, JSON) | No: after sync; HRV, sleep and adjusted metrics only after OneSync | Email request to Hexoskin | No | [Hexoskin API docs](https://api.hexoskin.com/docs/), [Open API](https://support.hexoskin.com/hexoskin-open-api) |
| Astroskin | Bluetooth 2.1 live view; open API listed | Purchase | No | [Hexoskin vs Astroskin](https://support.hexoskin.com/what-are-the-differences-between-hexoskin-and-astroskin) |
| Standard BLE Heart Rate (0x180D) on Hexoskin Smart | Unverified | n/a | Check if a device is available | - |

## How to use this in the build
| Move | Reason |
|---|---|
| Name the simulated stream "Bio-Monitor-class suit stream" with exactly its six channels | Credible, grounded in a real CSA system; judges can verify it |
| Mirror the data flow: live view on device, batch sync to ground, ground sees data only after downlink | Makes the delay-aware escalation logic realistic |
| Add a "lab result" entry path (Bio-Analyzer style, results in 2-3 h) | Covers blood sugar and blood counts, which the suit cannot measure |
| Pitch line: "Bio-Monitor collects; our tool interprets for the crew" | Fills the gap named in 05-prior-art-and-judging.md |
| Never show real named astronauts' data | Bio-Monitor data is not public; use fictional crew (see 01) |
