# e^x: thesis details (reference)

Positioning and pitch line now live in `docs/THESIS.md` (e^x feeds NASA's CMO-DA). Where this file differs, `docs/THESIS.md` wins.

Final version, 2026-11-15 00:50. Replaces the 2026-11-14 draft. Built from: all research in `docs/research/`, the cross-check `docs/AEGIS-RESEARCH-ALIGNMENT.md`, Tomas's frozen model and synthetic crew (repo `` at commit 82bf7b7), the alert-rule test bench in `docs/analysis/`, and a vetted outside review (ChatGPT, section 10).

NASA Space Apps 2026, challenge "Create Health Monitoring Software for Astronauts on Space Missions" (https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/).
Team: Tomas (data, ML, pitch) and Emile (app, 3D, sound). Product name: **e^x** (repo folder still ``).

## Summary
| Item | Final position |
|---|---|
| Problem | Far from Earth, the crew is its own first doctor. Sensors exist; turning readings into a decision does not. |
| Product | A daily self-check scored against each astronaut's own normal, a body map, an action per severity, distance-aware escalation, and a radiation storm warning built on real NASA data. |
| Proof, radiation | Frozen model scored once on 2024 to Nov 2026: warning caught 16 of 17 proton storms, 1.0 false alarm per month, median 3.8 h ahead. |
| Proof, health alerts | The synthetic crew is used as a test bench: 6,000 simulated missions show which alert rule astronauts could live with. |
| New since draft | Real test numbers; alert rule chosen by measurement; storm dates must match real data; "verify" step and wrist haptic cue added from the outside review. |
| Biggest risk | The web app does not exist yet (`web` has docs and data only). About 23 h remain. |

## 1. Thesis in one paragraph
Far from Earth, astronauts must be their own first doctor. The sensors already exist (CSA Bio-Monitor, ISS wearables); what is missing is the layer that **turns readings into a decision the crew can act on alone**. e^x is that layer: a daily self-check that compares each astronaut to **their own normal**, shows the result on a body map in plain language, tells them **what to do now**, asks them to **re-measure before escalating** when the signal is borderline, and decides **who must be told** based on **how far away Earth is**. It adds the one hazard where real NASA data lets us look ahead: a **solar radiation storm warning** trained on NASA DONKI 2010-2021 and scored once on 2024-2026. Both halves are tested the same honest way: the radiation model on real held-out storms, the health alerts on thousands of simulated missions.

**Pitch line (unchanged):** "Bio-Monitor collects. e^x decides what to do next, even 22 light-minutes from the nearest doctor."

## 2. What the research tells us
| # | Finding | Consequence for e^x | Source |
|---|---|---|---|
| 1 | No public astronaut vitals exist (Privacy Act, NASA-STD-3001). | Crew is simulated and labelled; expected, not a weakness. | docs/research/2-data-sources/01, 02 |
| 2 | NASA publishes no crew self-check thresholds. | Bands are clinical or team rules, each tagged; "not medical advice". | docs/research/3-health-science/03 |
| 3 | Agencies have sensors (Bio-Monitor, Actiwatch, dosimeters), not crew-facing interpretation. | Our value is interpretation, action, escalation. | docs/research/3-health-science/09, 10 |
| 4 | Distance changes who acts: Moon about 1.3 s light time (3-14 s operational), Mars up to 22 min one way. | Escalation ladder is delay-aware. | docs/AEGIS-RESEARCH-ALIGNMENT.md G1 |
| 5 | Radiation has the best open NASA data (DONKI, GOES). | Radiation warning is the differentiator and the "NASA data is core" proof. | docs/research/2-data-sources/01 |
| 6 | 50+ rival repos: body map, colours, baselines, offline are table stakes. | Do them well, do not pitch them as new. | docs/research/1-challenge-and-competition/06 |
| 7 | Rare among rivals: real NASA time series at the core (2 of 12) and measured accuracy (1 of 12, synthetic only). | We have both, on both halves. | docs/research/1-challenge-and-competition/06 |
| 8 | A naive personal-baseline rule fires constantly on healthy crews (section 5). | Alert fatigue is a real design problem; the rule is chosen by test. | `docs/analysis/alert_testbench_results.json` |

## 3. The solution
| Pillar | What the astronaut gets | How it works |
|---|---|---|
| A. Self-check | Daily check-in (HR, BP, glucose, temp, sleep, mood, exercise); status per body region | Baseline = own first 14 days. Score = z of the **3-day mean** (today + 2 previous days); amber at 2, red at 3; low side only for sleep, mood, exercise. Absolute limits on the raw value turn red at once. Dose and bone loss use absolute bands only. |
| B. Interpret, act, verify | Click a region: value, trend with personal band, plain explanation, how it is measured in space, the action | On amber: "re-measure" step; if the repeat confirms, it escalates. A red or absolute-limit value never waits for a repeat. |
| C. Escalate by distance | Green = self-care; amber = self-care + flag for next private medical conference; red = crew medical officer now + report queued to flight surgeon, "arrives in ~X" | One-way delay by environment: ISS about 0 s, Moon 3-14 s, Mars up to 22 min |
| D. Notify without a screen | A wrist cue: 1 pulse = check in, 2 = amber confirmed, long continuous = radiation warning or red | Simulated watch face in the app; real vibration on Android phones (Vibration API). The cue says *how urgent*; the body map says *where*. |
| E. Radiation warning | Cumulative dose vs 600 mSv career limit; probability per M/X flare; watch and warning | Logistic regression on DONKI flares (size, longitude, linked CME, CME speed), label = DONKI link to a GOES >10 MeV storm |
| F. Proof on real history | Replay of May 2024: flares appear, probability rises, warning fires, particles arrive | Held-out test years; misses and false alarms shown |

## 4. Radiation model: final numbers (Tomas, frozen, scored once)
| Item | Value |
|---|---|
| Data | NASA DONKI, 3,407 flares 2010 to 11 Nov 2026; modelling table 2,552 M/X flares, 71 storm-linked |
| Split (by time) | Train 2010-2021 (484 flares, 24 storms); validation 2022-2023 (540, 13); test Jan 2024 to 15 Nov 2026 (1,528, 17) |
| Model | Logistic regression, C=10; beat by boosting by only 0.006 skill, so the simpler model stays. Pre-declared v2 gained +0.016 (< 0.02 bar): rejected. |
| Thresholds (set on validation) | Watch 0.031 (catch >= 95%); warning 0.159 (catch >= 80%) |
| Test, warning | **16/17 storms**, **1.0 false alarm/month**, precision 42%, **median lead 3.8 h** from issue time |
| Test, watch | 17/17 storms, 6.1 false alarms/month, median lead 2.9 h |
| Skill vs climatology (4.1%) | Brier skill **0.413** (validation 0.418) |
| Without 1-20 May 2024 | Warning 14/15, median lead 2.5 h, skill 0.385 |
| Ablation, flare only (no CME) | Skill 0.055 (-0.012 without May): almost all skill comes from the CME link and speed |
| May 2024 | Both storms warned: 10 May onset first warned 8 May 21:40 (X1.0, p = 0.33), about 39 h ahead; 13 May onset about 4.5 h ahead. One false warning: 15 May X2.9 at S12E90. |
| The miss | 5 Sep 2026 M1.0 at S12W68, p = 0.14, onset under 1 h later; watch caught it |
| Physics check | Storm rate rises east to west (1-2% eastern disk, 6-7% western): the Parker spiral, rediscovered |

How to say it: "On storms it never saw, our warning caught 16 of 17, with about one false alarm a month, a median 3.8 hours before particles arrived." Always add: "It needs the CME speed from a coronagraph; without it the skill mostly disappears."

## 5. The synthetic crew, connected (the new value)
Tomas's generator (AR(1) daily persistence, approved correlations sleep-mood +0.4, sleep-HR -0.3, HR-BP +0.3, positive definite) is more than demo filler. It is a **test bench for the alert rule**, the health-side twin of the held-out storm test.

**Test** (`docs/analysis/alert_testbench.py`, reads Tomas's generator, changes nothing in ``): 2,000 healthy 75-day missions per astronaut (6,000 total), 14-day baseline, then 61 monitored days. Then the same with a drift injected on day 50.

| Rule | Days not green (healthy crew) | Alert episodes per astronaut-month | False red episodes per astronaut-month | Healthy missions with any false red |
|---|---:|---:|---:|---:|
| A: today's value z (current contract + `ml/crew_flags.py`) | 30% | 4.8 | 0.72 | 71% |
| **B: 3-day mean z (thesis rule)** | **14%** | **1.7** | **0.11** | **18%** |
| C: 2 of last 3 days >= 2 sigma | 18% | 1.9 | 0.45 | 53% |

| Injected drift | A: caught / median days | B: caught / median days |
|---|---|---|
| Systolic BP +2.5 sd over 5 days | 99.5% / 3 | 98% / 5 |
| Systolic BP +1.5 sd over 7 days (subtle) | 91% / 6 | 78% / 8 |
| Sleep -2.5 sd over 5 days | 99.7% / 3 | 98% / 5 |
| Heart rate +3 sd overnight | 100% / 0 | 99.8% / 2 |

**Decision:** rule B. It cuts false alarms by about two thirds and false reds by 85%, at a cost of about 2 days on a slow drift. Acute dangers still turn red at once through the absolute limits. The demo crew keeps its colours under rule B (checked on the current file): Ana systolic BP 2.54 sigma (amber), Kenji sleep -3.1 sigma (red), Léa green.

**How to say it:** "A rule that alarms a third of the time gets ignored. We ran 6,000 simulated missions and picked the rule that cut false alarms by two thirds." Caveat on the slide: simulated crew measures the rule, not human physiology.

**Second connection: storm dates match real data.** The crew's simulated storm dose sits on **5 Sep 2026**, the only real GOES >10 MeV storm in the mission window (1 Sep to 14 Nov 2026) and the model's one warning miss (watch caught it). Moved there by Tomas on 2026-11-15 (commit 10c6792), so every storm on screen is real.

## 6. Demo path
| Step | Screen | Message |
|---|---|---|
| 1 | Crew overview, Moon base, 3 crew: Ana amber, Kenji red, Léa green | Status at a glance |
| 2 | Ana -> 3D body -> heart amber | "Systolic BP 2.5 sigma above her own 3-day normal, 4 days running" -> action + who is told |
| 3 | Live check-in, wrist cue | Status updates; amber asks for a re-measure first |
| 4 | Switch to Mars transit | Red now reads "Do now: [action]. CMO notified. Report queued, arrives in ~11 min (example)" |
| 5 | Radiation -> replay May 2024 | Warning 39 h before the 10 May particles; one false warning shown honestly |
| 6 | Close | 16/17 storms, 1 false alarm/month, 3.8 h median; alert rule picked on 6,000 simulated missions |

Official demo: 30 s screen recording (problem 5 s, Ana + body + check-in 10 s, replay 10 s, numbers 5 s). The 90 s version is for a live pitch.

## 7. Real vs simulated data
| Data | Status | Shown as |
|---|---|---|
| Flares, CMEs, SEPs 2010 to Nov 2026 | Real, NASA CCMC DONKI | "Space weather data: NASA CCMC DONKI" |
| Storm forecast, 1,528 test flares | Real model output on held-out years (`storm_forecast.json`) | Forecast feed and replay |
| GOES >= 10 MeV flux, NOAA S-scale | Real, optional bundled files | Replay overlay, "space weather now" chip (should) |
| Inspiration4 glucose (OSD-575) | Real public crew labs | Reference strip, never scored (should) |
| Daily dose per environment | Working values in `crew_data.json`: ISS 0.5, Moon 1.4, transit 1.8, Mars 0.65 mSv/day | Dose context (Moon value still to verify) |
| Crew vitals | Simulated, AR(1) with approved correlations | "Simulated crew data, not real astronaut records" |

## 8. Indicator rules (as shipped in `crew_data.json`)
The app reads these values from the data file. This table now matches the file; the draft's different numbers are retired.

| Indicator | Region | Measured in space by | Absolute red | Personal rule |
|---|---|---|---|---|
| Heart rate | heart | Bio-Monitor-class garment | < 40 or > 110 bpm | 3-day mean z, both sides |
| Systolic / diastolic BP | heart | Bio-Monitor-class garment | sys < 85 or > 150; dia < 50 or > 95 | 3-day mean z, both sides |
| Glucose, fasting | blood | Finger prick on analyser | < 60 or > 180 mg/dL | 3-day mean z, both sides |
| Temperature | whole_body | Headband sensor (T-Mini class) | < 35.5 or > 38.3 C | 3-day mean z, both sides |
| Sleep | brain | Wrist actigraphy | < 4.0 h | 3-day mean z, low side |
| Mood 1-5 | brain | Self-report | 1 | 3-day mean z, low side |
| Exercise | bones | Exercise log (ARED/CEVIS/T2) | < 30 min | 3-day mean z, low side |
| Bone loss (model) | bones | Estimated; DXA only pre/post | > 5%; amber > 3% | none |
| Daily dose | whole_body | Personal dosimeter | > 10 mSv; amber > 3x environment rate | none |
| Cumulative dose | whole_body | Personal dosimeter | > 600 mSv (career limit); amber > 300 | none |

All bands are Team or Clinical, never NASA. UI line: "NASA does not publish crew self-check thresholds." Only the 600 mSv career limit is a NASA number.

## 9. What makes us different
| Rivals mostly have | e^x adds |
|---|---|
| Body map, colours, charts | Same, plus every metric explains the NASA hazard behind it |
| A "call flight surgeon" button | Distance-aware 3-tier escalation and a verify step before escalating (do it well; not unique) |
| Synthetic data only | Real NASA DONKI model, frozen and scored once on held-out years |
| Accuracy claims on fake data | Radiation: per-storm test metrics with the miss shown. Health: alert rule chosen on 6,000 simulated missions, false-alarm rate stated |
| Dashboards that must be watched | A wrist cue for urgency, so the crew need not look at a screen |

## 10. Outside review (ChatGPT, 14 Nov): what we take, fix, and drop
| ChatGPT point | Verdict | Why |
|---|---|---|
| Add an action -> verify -> escalate loop | **Take** (pillar B) | Cheap, in scope; fits alert fatigue finding. Never delays red. |
| Haptic notification on a wristband | **Take, small** (pillar D) | Simulated watch in the app + phone vibration. A feature, not the pitch. |
| Context modes (rest, exercise, work, EVA, sleep) | Stretch | Only if time: EVA mode makes the radiation warning override everything |
| Haptic torso vest, ear-worn device, new hardware | Drop | Hardware, not software; out of scope for the challenge |
| New tagline "adaptive human interface" | Drop | Weaker than the current line; the interface is not the core |
| "NASA's SUIT vest" | **Correct** | SUIT was ESA/TNO (Netherlands), worn by ESA astronaut André Kuipers on the ISS DELTA mission in April 2004. It signalled "down" for orientation, not health alerts. The "56 elements" count is unverified. |
| "NASA's Bio-Monitor" (cited to "Canadian Standards Association") | **Correct** | Bio-Monitor is the Canadian Space Agency's system |
| Lunar Health Monitor "TRL 5" | Do not quote | Orbital Research SBIR work; no TRL found in public sources |
| STARwatch as wrist hub | Mention only as "concept" | SBIR proposal for a wrist actigraph + Bluetooth hub; flight status unverified |
| "Don't sacrifice the radiation model" | Agree | ChatGPT did not know the ablation: the skill depends on CME data. We say so ourselves. |

Sources checked: [ESA, Wearing the SUIT experiment vest](https://www.esa.int/ESA_Multimedia/Images/2004/05/Wearing_the_SUIT_experiment_vest); [TNO, tactile vest for ISS](https://repository.tno.nl/SingleDoc?docId=8966); [STARwatch SBIR summary](https://www.inknowvation.com/node/150749); [NTRS, Lunar Health Monitor](https://ntrs.nasa.gov/citations/20120004093).

## 11. Claims we can make (verified)
| Claim | Wording |
|---|---|
| Career limit | NASA-STD-3001: career effective dose < 600 mSv |
| Storm design limit | Crew dose from the reference storm (Oct 1989) must stay below 250 mSv |
| Model result | "Held-out 2024-2026: warning caught 16 of 17 storms, 1 false alarm a month, median 3.8 h ahead (2.5 h outside May 2024)" |
| May 2024 | "G5 geomagnetic storm; the radiation storm peaked at S2 (about 207 pfu, 10 May), plus GLE74 on 11 May." We warned about 39 h before the 10 May onset. Never "superstorm" for the radiation part. |
| Limitation | "The model needs the CME speed; flare data alone is barely better than the base rate." |
| Alert rule | "On 6,000 simulated missions, the 3-day rule cut false alarms from about 5 to under 2 per astronaut-month." Simulated, say so. |
| Sleep | ISS crews average 6.1 h/night vs 8.5 h scheduled |
| Bone | About 1% per month at weight-bearing sites without exercise |
| Benchmark | Do not claim to beat NOAA SWPC; we beat climatology |

## 12. Open decisions
| Decision | Options | Recommendation | Owner |
|---|---|---|---|
| Alert rule | A today-z / B 3-day mean | Done 2026-11-15: B is in the contract, `ml/crew_flags.py` and crew file (commit 10c6792) | Tomas |
| Crew storm date | (a) 5 Sep / (b) label / (c) drop | Done 2026-11-15: moved to 5 Sep 2026 (a) | Tomas |
| Name in Tomas's docs | `ml/results/pitch_outline.md` still says "Aegis" | Rename to e^x before submission | Tomas |
| Lead-time field | `storm_forecast.json` `lead_time_h` is peak-to-onset; quoted medians are from issue time | App shows per-event lead from the field but quotes 3.8 h only from `meta.metrics_test` | Emile |
| Bone coefficient | Code gives about 1.7%/month without exercise vs 1% published | Fix if time; otherwise do not quote a rate from the app | Tomas |
| Web app | Not started | Build MVP first (section 13); haptics and verify after | Emile |

## 13. Scope
| Tier | Items |
|---|---|
| MVP | Crew overview; 3D body with colours; metric panel (chart, explanation, action); check-in that changes a colour; distance-aware escalation; environment switch; radiation feed; May 2024 replay; footer disclaimers and credits; deployed link + offline build |
| Should | Verify step on amber; simulated wrist cue (+ phone vibration); test-bench slide; GOES overlay; NOAA chip with cached fallback |
| Stretch | Context modes (EVA override); Inspiration4 glucose strip; Jan 2026 replay; Bluetooth HR strap |
| Not now | Haptic vest, ear-worn sensing (roadmap slide only); FHIR export; webcam vitals |

## 14. Submission rules
| Rule | Action |
|---|---|
| Demo <= 30 s video or <= 7 slides | 30 s screen recording |
| AI use disclosure | README "AI use" section + form; no NASA logos on generated media |
| References | Every data source, library, model, asset (DONKI, NOAA, OSDR, HRP/CSA, ESA SUIT if shown, npm/Python libs) |
| Public, no-login links | Repo public, deployment unprotected, test in a private window |
| Deadline | Sun 15 Nov 23:59 local |

## 15. Build brief (web workstream)
Unchanged from the draft except: client rule = 3-day mean z (section 3A) once Tomas updates the contract; quote headline numbers from `storm_forecast.json` `meta.metrics_test`, never recompute them; add the verify step and the wrist cue only after the MVP path works end to end. Read first: `CLAUDE.md`, `PROJECT_CONTEXT.md`, `web/CLAUDE.md`, `web/PROMPTS.md`, `contracts/DATA_CONTRACT.md`. Stack: Vite + React + TypeScript + Tailwind + React Three Fiber + drei + Recharts. Offline static build; the NOAA chip is the one allowed live call, with a cached fallback.
