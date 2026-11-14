# AEGIS — Crew Health Monitor with Radiation Early-Warning
**NASA Space Apps 2026 · Challenge: "Create Health Monitoring Software for Astronauts on Space Missions"**
Team: Tomas (data + ML + pitch) · Emile (app + 3D + sound)
Hard deadline: submission closes **Sun 15 Nov, 23:59 local**. In-person pitch at the local event on Sunday (check the exact slot).

> "Aegis" is a working name. Rename freely; just do it in one place.

---

## 1. One-liner
A self-assessment health app for astronauts that warns **before** the damage, not after: personal-baseline alerts on vitals, plus an ML early-warning for solar radiation storms trained on 15 years of real NASA space-weather data.

**Pitch line:** "Built for Mars, deployable in any hospital-at-home programme tomorrow."

## 2. What the official challenge asks (paraphrased from the official page)
- A **visual tool** that helps astronauts **assess their own health** during missions and gives **guidance on treatments and health improvements**.
- Context: NASA's Human Research Program lists 5 hazards: **space radiation**, isolation and confinement, distance from Earth, gravity fields, and hostile closed environments. They lead to immune changes, bone loss, cardiovascular events, poor nutrition, and behavioral health problems.
- Example indicators: blood pressure, heart rate, blood sugar, body temperature, daily sleep hours, mood. Any input type is fine (keyboard, clicks, camera).
- Questions they want answered: which measurements can be done in space, how hazards affect each indicator, **when a result warrants attention from the crew or from flight surgeons**, and what actions prevent a critical condition.
- Suggested UI: **clickable human body** where each part shows function and status; **color coding**; **dynamic charts over time**; **gamification**; prompts to take measurements as part of the routine; simple explanations (don't assume astronauts know everything); different environments (spacecraft, station, rover, Moon/Mars base).
- Official resources: NASA HRP "5 Hazards", "Risks of Human Spaceflight", ongoing HRP research; CSA "Monitoring Radiation for Astronaut Health".

**Implication:** the self-assessment app is the core and must be complete. The radiation ML forecaster is our differentiator, not the whole product.

## 3. The product
| Module | What it does | Owner |
|---|---|---|
| Crew overview | Mission header, environment switch (ISS / Moon / Mars / transit), crew cards colored by worst status | Emile |
| 3D body map | Clickable regions: **brain** (mood, sleep), **heart** (HR, BP), **blood** (glucose), **bones/muscle** (exercise, est. bone loss), **whole body** (temp, radiation dose). Each opens a panel: status color, chart over time, plain-language explanation, recommended action, "call flight surgeon" if red | Emile |
| Daily check-in | Astronaut enters vitals, sleep and mood; streak + XP gamification; instant re-scoring against personal baseline | Emile (UI), Tomas (scoring logic spec) |
| Personal-baseline alerts (ML #1) | Flags drift from **each astronaut's own normal** (rolling baseline, z-score/robust stats), not generic ranges. Each flag has a severity and an action | Tomas |
| Synthetic crew generator | Real astronaut records are protected, so the crew is **synthetic and validated**: daily persistence (AR(1)), correlated metrics (Gaussian copula: sleep↔mood, sleep↔HR, HR↔BP), planted demo scenarios, plus a fidelity report (ranges, correlations, lag-1 autocorrelation). Same approach as Tomas's synthetic financial time-series work, written fresh for this project | Tomas |
| Radiation module (ML #2) | Cumulative dose vs NASA career limit + **solar radiation storm forecast**: P(SEP event within the horizon) for each flare, with alert levels | Tomas (model), Emile (UI) |
| May 2024 replay | Timeline scrubber over the May 2024 superstorm (held out from training). Flares appear → probability rises → WARNING → shelter alarm → actual storm arrives → "warned X h ahead" | Emile (UI), Tomas (honest held-out predictions) |

## 4. The demo moment (90 seconds, rehearse it)
1. Open on the crew overview: Moon base, 3 astronauts, one amber.
2. Click the amber astronaut → 3D body → heart glows amber → "BP drifting 2.3σ above *her own* baseline for 4 days → action: fluid/salt check, repeat measurement tonight, notify flight surgeon if > X".
3. Do a 10-second check-in live → streak +1 → status updates.
4. Switch to Radiation → "Replay: May 2024 superstorm" → press play → flares pop on the Sun → probability climbs → **WARNING + alarm** → storm hits → "Crew sheltered X hours before the particles arrived. This storm was never seen in training."
5. Close: the numbers (hit rate, false alarms per month, median lead time) + "Built for Mars, deployable in hospital-at-home tomorrow."

## 4b. Judge Q&A to prepare
- **"Is your data real?"** Space weather: yes, 15 years of NASA DONKI. Crew: real astronaut records are protected, so I built a validated synthetic crew generator, the same approach I used for synthetic financial time series. Show the fidelity report.
- **"How good is the model?"** Quote held-out test numbers only, vs the climatology baseline. Mention May 2024 was never seen in training.
- **"Who would use this?"** Crews on Artemis and Mars missions; on Earth, hospital-at-home and remote crews (offshore, polar, military).

## 5. Architecture
```
NASA DONKI API ──► ml/fetch_donki.py ──► data/processed/flares.csv
                                           │
                           ml/ (EDA, labels, model, eval)  ← Tomas
                                           │ export
                                           ▼
contracts/ (shape of the data) ──► web/public/data/storm_forecast.json
                                   web/public/data/crew_data.json
                                           │
                                 web/ (React app, 3D, replay, sound) ← Emile
```
**The only interface between the two workstreams is `/contracts`.** Emile builds against `contracts/*.sample.json` from minute one; Tomas overwrites `web/public/data/*.json` with real outputs when ready (~21:00). If the shape needs to change, write it in `contracts/CHANGELOG.md` and tell the other person. Never change a field silently.

## 6. Work split
**Tomas — data, ML, numbers, pitch** (`/ml`)
- Pull DONKI flares, CMEs and SEP events, 2010 → today (script provided)
- EDA: storm rate by flare class and by solar longitude (the Parker spiral story)
- Decide the label definition, the train/test split, and alert thresholds (these are deliberate learning decisions; Claude Code must ask, not decide)
- Train baseline (climatology) → logistic regression → gradient boosting; evaluate honestly
- Export `storm_forecast.json` per contract, including the May 2024 held-out period
- Personal-baseline flag logic → export `crew_data.json`
- Synthetic crew upgrade (AR(1) + correlated metrics + fidelity report), **only after the real storm forecast has shipped**
- Pitch: slides, the 3 headline numbers, the venture angle

**Emile — app, 3D, interaction, sound** (`/web`)
- App shell, crew overview, environment switch
- 3D clickable body map with status colors
- Metric panels with charts, explanations and actions
- Daily check-in + gamification
- Radiation module UI + May 2024 replay + shelter alarm sound
- Offline-capable build + deploy (Vercel or Cloudflare) + 30-second demo video

## 7. Timeline (tonight → tomorrow)
| Time | Tomas | Emile |
|---|---|---|
| 18:15–18:30 | Both: read this doc, create repo, add Emile to the Space Apps team | same |
| 18:30–19:15 | Run fetch, sanity-check counts | Scaffold app, load sample JSON, crew overview |
| 19:15–21:00 | EDA → labels → split → models → eval | 3D body map + metric panels + charts |
| ~21:00 | **Ship real `storm_forecast.json`** | Swap to real file |
| 21:00–22:30 | Baseline flags + synthetic crew upgrade → **ship real `crew_data.json`** | Check-in + gamification, radiation module |
| 22:30–00:00 | Validate May 2024 replay, headline metrics + 3 charts for the deck | Replay + alarm, integration, polish |
| 00:00–00:30 | Both: full demo run-through, fix only what breaks the demo | same |
| Sun morning | Deck, submission text, rehearse pitch | Deploy, offline build on a USB/laptop, 30 s demo video |

## 8. Definition of done
**MVP (must exist by midnight):** crew overview · clickable body with colored statuses · panel with chart + action · check-in that changes a status · radiation panel with forecast feed · May 2024 replay with alarm · real model output from held-out data · deployed link.
**Should (skip if behind):** synthetic crew upgrade + fidelity report (the answer to "is your data real?").
**Stretch (only if MVP is solid):** environment switch changes dose rate · Mars dose context from Curiosity RAD · camera input · voice prompts · Sun 3D model in replay.
**Cut first if late:** gamification polish, environment switch, any second chart type.

## 9. Ground rules
- **No real astronaut health data.** Crew data is synthetic, generated from published ranges and validated (the challenge says individual records are protected). Say so on screen.
- **Write the generator fresh.** Reuse the *ideas* from P Stone (copula, fidelity checks), not the team's code: much of it is teammates' work.
- **Not medical advice**: add a small disclaimer in the app footer.
- **Credit data**: "Space weather data: NASA CCMC DONKI." Use NASA imagery only per NASA media guidelines.
- **Honest metrics only.** Report hit rate, false alarms and lead time on the held-out period. Never show training accuracy as a result.
- Emile is on the team on the Space Apps site.
- Commit often. Demo from a local build, with the deployed link as backup (venue Wi-Fi will fail).

## 10. Facts to verify before they go on a slide
Check each against a primary source; they're working numbers, not citations.
- NASA career radiation limit: 600 mSv (NASA standard updated 2022).
- Typical daily dose: ISS ≈ 0.3–0.8 mSv/day; Mars transit ≈ 1.8 mSv/day and Mars surface ≈ 0.6–0.7 mSv/day (Curiosity RAD); lunar surface ≈ 1.4 mSv/day (Chang'e-4).
- Bone loss without countermeasures ≈ 1–1.5% per month at weight-bearing sites.
- ISS crews sleep ≈ 6 h/night on average; exercise ≈ 2 h/day.
- Storm and flare counts: quote only from our own pipeline output.

## 11. Submission checklist (verify on the submission form)
- [ ] Project title + short summary (problem → solution → impact)
- [ ] Demo: past years asked for a short video (~30 s) or a short slide deck. Check this year's form
- [ ] Link to the deployed app + public GitHub repo
- [ ] Which NASA data/resources were used (DONKI, HRP pages, CSA radiation page)
- [ ] Use of AI tools disclosed if the form asks
- [ ] Team members listed (both)
