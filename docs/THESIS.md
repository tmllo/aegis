# e^x: thesis

NASA Space Apps 2026, "Create Health Monitoring Software for Astronauts on Space Missions". Team: Tomas (data, ML) and Emile (app). Full detail, rule tables and sources: `docs/THESIS-DETAILS.md`.

## Summary
| | |
|---|---|
| Problem | Far from Earth, the crew is its own first doctor. Sensors exist; knowing when something is wrong does not. |
| Solution | e^x checks each astronaut against their own normal, warns of radiation storms from real NASA data, and hands a case to NASA's onboard AI medic. |
| Line | **"CMO-DA answers when the crew asks. e^x tells them when to ask."** |

## 1. How it fits NASA's infrastructure
| Step | What | Already exists at NASA |
|---|---|---|
| Sense | Daily vitals, sleep, mood, exercise, dose | CSA Bio-Monitor, wrist actigraphy, dosimeters |
| Decide | e^x: personal baseline + radiation warning. Rules and a tested model, no AI in the alert. | (our part) |
| Hand off | Structured case summary to the AI medic | CMO-DA, NASA JSC offline AI medic (Google, Red Hat), tested on a ground copy of HPE Spaceborne Computer-2 |
| Escalate | Crew medical officer now, report queued to Earth with the delay shown | ISS today; Moon seconds, Mars up to 22 min one way |

Runs fully offline, on hardware NASA already flies. The AI explains; humans decide.

## 2. Proof
| Half | Test | Result |
|---|---|---|
| Radiation warning | NASA DONKI flares, trained 2010-2021, scored once on 2024-Nov 2026 | Caught **16 of 17** proton storms, **1 false alarm a month**, median **3.8 h** ahead. May 2024: warned ~39 h ahead. |
| Health alerts | Tomas's simulated crew, 6,000 missions | 3-day rule: **1.7** alerts per astronaut-month vs 4.8 for a one-day rule, still catches 98% of real drifts |

Say honestly: the storm model needs the CME speed; the crew is simulated.

## 3. Demo (30 s)
| Seconds | Screen |
|---|---|
| 0-5 | Problem: Mars, 22 min from a doctor |
| 5-15 | Ana amber: blood pressure above her own normal 4 days -> body map -> action -> re-measure |
| 15-20 | Hand off to CMO-DA: case summary appears |
| 20-27 | Replay May 2024: warning fires before the particles arrive |
| 27-30 | 16/17 storms, 1 false alarm a month |

## 4. Build by tonight
| Priority | Item |
|---|---|
| 1 | Crew overview, 3D body, metric panel, check-in, escalation with delay, May 2024 replay, deploy |
| 2 | "Hand off to CMO-DA" case summary |
| 3 | Optional: local AI model reads the summary in the live pitch; public link shows saved text |

## 5. Open decisions
| Decision | Recommendation | Owner |
|---|---|---|
| Alert rule | Done 2026-11-15 (commit 10c6792): 3-day average in contract, `ml/crew_flags.py` and crew file | Tomas |
| Crew storm date | Done: simulated storm dose now on 5 Sep 2026, the real storm | Tomas |
| Name | "Aegis" -> e^x in Tomas's pitch notes and repo docs | Tomas |
