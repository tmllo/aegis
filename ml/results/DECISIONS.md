# Decisions

## Summary

**Final model: v1 (logistic regression, C=10).** The pre-declared v2 (GOES flux harmonisation + Parker connectivity) gained +0.016 Brier skill on validation, under the +0.02 bar, so v1 stays. The test set was scored once, after that choice, on 15 Nov 2026. Primary counts are per distinct GOES >10 MeV storm. Lead time runs from issue time (later of flare peak and the latest linked CME start) to onset.

Test, January 2024 through 15 Nov 2026 (1,528 M/X flares, 29 linked flares, 17 storms, 35 months). Warning catches 16/17 storms, median lead 3.8 h, 1.0 false alarm per month, precision 42%. Watch catches 17/17, median lead 2.9 h, 6.1 false alarms per month. Brier skill vs the 4.10% climatology is 0.413. The same logistic regression refit on train with only flare size and longitude scores 0.055. Dropping 1–20 May 2024 leaves warning at 14/15 storms, median lead 2.5 h, skill 0.385, and the flare-only skill at −0.012. The one warning miss is the 5 Sep 2026 M1.0 (S12W68, probability 0.14), which watch does catch. Full table: `ml/results/score_report.json`.

Split A is in force. v1 is a logistic regression (C=10, no class weights) fit on flares through 2021. Climatology is the train+validation storm rate, 4.10%. On 540 validation flares and 15 storms, Brier skill against that climatology is 0.418. Warning, the highest threshold that still catches at least 80% of validation flares, is probability 0.159: 12/15 flares (10/13 storms), 0.625 false alarms per month, precision 44%, median issue-time lead 6.0 h per storm. Watch, the highest threshold that still catches at least 95%, is 0.031: 15/15 flares (13/13 storms), 3.25 false alarms per month. Fourteen of fifteen flares would be 93%, so the 95% rule allows no miss.

The best gradient booster scored 0.424. That is 0.006 ahead of the logistic model, inside the 0.02 band, so the simpler model was kept. C=10 is the top of the grid that was set beforehand; C=1 scored 0.409 and would have won on the same rule.

Concerns. The watch bar is one validation storm. The 28 Mar 2022 flare has probability 0.031, and catching it is what creates 78 false alarms instead of 17. On test, watch costs 6.1 false alarms per month. Warning is the cut that is usable, and its test lead is short: 3.8 h median, 2.5 h without 1–20 May. Validation was used for the grid, the family choice, and both thresholds. Test skill (0.413) happens to match validation (0.418), but almost all of it is the CME link and speed. Those are analyst products, and the speed is known after the first coronagraph frame, so the issue-time lead is still a little early. DONKI is an analyst list, not every flare, and the label is a curated GOES >10 MeV link. The synthetic crew matrix is positive definite (minimum eigenvalue 0.46), the demo cards are Ana heart amber, Kenji brain red, Léa green, and a 75-day draw only approximates the approved correlations (sleep lag-1 came out at 0.37 against 0.50). `web/public/data/storm_forecast.json` is the scored test export. `python ml/validate_contracts.py` passed.

## Checklist

- [x] Split — A: train through 2021, validation 2022–2023, test 2024–now scored once after the model was frozen
- [x] EDA — development set only, 1,024 flares, 42 storms
- [x] Charts — four PNGs in ml/results/
- [x] Models — logistic regression, C=10, validation Brier skill 0.418
- [x] Thresholds — watch 0.0308 (3.25 false alarms/month), warning 0.159 (0.63/month)
- [x] v1 saved — ml/models/v1.pkl and ml/results/scorecard_v1.md
- [x] Synthetic crew — correlations positive definite, demo cards unchanged, contract valid
- [x] Audit, issue-time lead time, v2 evaluated and rejected — v1 final
- [x] Pitch outline — ml/results/pitch_outline.md, test numbers filled from the one scoring run
- [x] Test — scored once on 15 Nov 2026; per-storm warning 16/17, skill 0.413, flare-time ablation 0.055
- [x] P8 — ml/results/metrics.md and three slide charts

## Rules for this run

Test rows are any flare with peak time in 2024 or later. Scripts that fit, score, or plot load only 2010–2023. Thresholds and model choice use validation only. Climatology is the storm rate on train and validation combined. No class weights. If two models are within 0.02 Brier skill on validation, the simpler one is kept (climatology, then logistic regression, then gradient boosting).

Watch is the highest threshold whose validation hit rate is at least 95%. Warning is the highest threshold whose validation hit rate is at least 80%. False alarms per month use the 24 calendar months from January 2022 through December 2023.

## D1 — Label

Main label `sep_linked_goes10`: DONKI links the flare to a GOES >10 MeV SEP. GOES >100 MeV, SOHO, STEREO, ACE, and REleASE model alerts do not count.

Sensitivity label `sep_within_72h_goes10`: a GOES >10 MeV onset in the 72 hours after peak. It is not the training target.

Rows in the modelling table are M-class and X-class only. The 28 Oct 2013 X1.0 location is stored as N07W65. Longitudes from 90° to 120° stay. A flare is removed when a GOES >10 MeV onset falls in the 48 hours before peak.

Development set only (this table was written before the test was scored):

| Split | Flares | Linked positives | Rate | Within 72h | Distinct GOES >10 events | Dates |
|---|---:|---:|---:|---:|---:|---|
| Train (≤2021) | 484 | 27 | 5.6% | 69 | 24 | 2010-06-12 → 2021-12-28 |
| Validation (2022–2023) | 540 | 15 | 2.8% | 55 | 13 | 2022-01-01 → 2023-12-31 |

Train is 438 M and 46 X. Validation is 521 M and 19 X. 2018 and 2019 have no M or X flares in the development set.

## D2 — Split

Option A. Train is every development flare with peak year ≤ 2021. Validation is 2022 and 2023. Test is 2024 through the end of the catalogue and is not loaded, scored, or plotted in this run.

Why this one: validation has two years and 13 separate GOES >10 MeV events, enough to set a cutoff. Putting 2022 into training would leave 2023 alone (10 linked flares, 8 GOES events), and 4 of those 10 flares fall in December 2023. Stopping training at 2019 only moves 2020–2021, which is one positive.

The validation positive rate (2.8%) is lower than the training rate (5.6%) because later years contain more logged M flares per storm. Thresholds are set on validation for that reason.

## P2 — EDA

All four charts use the 1,024 development flares (2010–2023) and the main label. 42 of them are storms. No 2024 row was plotted.

### Storm rate by class

M: 28/959 = 2.9%. X: 14/65 = 21.5%. Chart: `ml/results/storm_rate_by_class.png`.

An X-class flare is tied to an Earth proton storm about one time in five; an M-class flare about one time in thirty. Size is a real signal, roughly seven to one. Most storms are still M-class, 28 of the 42, because M flares are what the catalogue is full of.

### Storm rate by longitude (Parker spiral)

30° bins, east to west. Every development flare falls inside −120° to 120°. Chart: `ml/results/parker_spiral_longitude.png`.

| Bin | Flares | Storms | Rate |
|---|---:|---:|---:|
| 120–90°E | 42 | 0 | 0.0% |
| 90–60°E | 170 | 3 | 1.8% |
| 60–30°E | 157 | 2 | 1.3% |
| 30–0°E | 126 | 5 | 4.0% |
| 0–30°W | 133 | 7 | 5.3% |
| 30–60°W | 166 | 11 | 6.6% |
| 60–90°W | 201 | 13 | 6.5% |
| 90–120°W | 29 | 1 | 3.4% |

The storm rate climbs from about 1–2% on the eastern disk to about 6–7% on the western disk. That is the Parker spiral: field lines from the Sun's western hemisphere connect to Earth, so those particles reach us. The last bin is over the limb, one storm in 29 flares, too thin to claim the curve keeps rising past 90°W.

### Linked CME

No linked CME: 5/722 = 0.7%. Linked CME: 37/302 = 12.3%. Chart: `ml/results/storm_rate_by_cme.png`.

A flare DONKI links to a CME is a storm about 12% of the time; a flare with no linked CME is a storm about 0.7% of the time. 37 of the 42 storms have that CME link. In this catalogue, an Earth proton event almost always comes with a CME the analysts already tied to the flare.

### CME speed

Among flares with a recorded CME speed. Chart: `ml/results/cme_speed_storm_vs_quiet.png`.

| Group | n | Median km/s | Middle half |
|---|---:|---:|---|
| No storm | 265 | 679 | 458–910 |
| Storm | 37 | 1,372 | 1,101–1,500 |

The 722 flares with no speed are exactly the flares with no linked CME, so every linked CME in the development set has a speed. Storm CMEs are about twice as fast at the median. Fast ejections are the ones that drive the shock.

## P4 — Models

Target is `sep_linked_goes10`. Features are log10(flare flux), solar longitude (west positive), a linked-CME flag, and log10(CME speed). Missing speeds are median-imputed inside the logistic pipeline and left missing for gradient boosting. No class weights. Each candidate is fit on the 484 training flares and scored on the 540 validation flares.

Climatology predicts 42/1024 = 0.0410 for every flare. That rate uses train and validation together. Its validation Brier score is 0.0272, and its skill is 0 by definition.

Close call: a model within 0.02 validation Brier skill of the leader loses to the simpler family. Order of simplicity: climatology, logistic regression, gradient boosting.

| Candidate | Validation Brier | Brier skill |
|---|---:|---:|
| climatology | 0.0272 | 0.000 |
| logistic C=0.01 | 0.0241 | 0.115 |
| logistic C=0.1 | 0.0180 | 0.339 |
| logistic C=1 | 0.0161 | 0.409 |
| logistic C=10 | 0.0158 | 0.418 |
| boosting, lr 0.05, depth 2, leaf 20 | 0.0170 | 0.374 |
| boosting, lr 0.05, depth 2, leaf 40 | 0.0163 | 0.402 |
| boosting, lr 0.05, depth 3, leaf 20 | 0.0193 | 0.291 |
| boosting, lr 0.05, depth 3, leaf 40 | 0.0156 | 0.424 |
| boosting, lr 0.1, depth 2, leaf 20 | 0.0194 | 0.285 |
| boosting, lr 0.1, depth 2, leaf 40 | 0.0173 | 0.362 |
| boosting, lr 0.1, depth 3, leaf 20 | 0.0222 | 0.184 |
| boosting, lr 0.1, depth 3, leaf 40 | 0.0176 | 0.351 |

The best skill is 0.424, from the shallow booster with learning rate 0.05, depth 3 and leaf 40. Logistic regression at C=10 scores 0.418. The gap is 0.006, inside the 0.02 band, so the logistic model is the one we keep. C=1 scores 0.409 and would have won on the same rule. C=10 is the top of the grid that was set before looking.

Standardized coefficients, all pointing the way the physics goes: linked CME +1.03, log10 CME speed +1.00, longitude +0.66, log10 flux +0.52. West of central meridian raises the probability. On validation the model’s mean probability is 0.014 on the eastern hemisphere and 0.052 on the western hemisphere. The observed storm rates there are 0.4% and 5.0%.

Permutation importance on validation, measured as the rise in Brier score when that column is shuffled (`ml/results/feature_importance_v1.csv`):

| Feature | Brier increase |
|---|---:|
| log10 CME speed | 0.0090 |
| longitude | 0.0035 |
| log10 flare flux | 0.0031 |
| linked CME flag | 0.0030 |

Speed, longitude, and flare size all carry weight. The CME flag adds less once speed is in the model, because the fast CMEs are already the linked ones.

## D3 — Metrics

Reported on validation only. Hit rate is storms caught divided by the 15 validation storms. A false alarm is a non-storm flare at or above the threshold; per month divides that count by the 24 calendar months from January 2022 through December 2023. Precision is storms caught divided by flares at or above the threshold. Lead time is flare peak to the linked GOES >10 MeV onset, median over hits. Brier skill uses the train+validation climatology. Calibration is five quantile bins of validation probability.

## D4 — Thresholds

Watch is the highest threshold with hit rate at least 95%. Warning is the highest with hit rate at least 80%. With 15 storms, 14/15 is 93.3%, so the 95% rule means catching all 15.

| Cut | Threshold | Hit rate | Caught | False alarms | Per month | Precision | Median lead time |
|---|---:|---:|---:|---:|---:|---:|---:|
| Watch | 0.0308 | 100% | 15/15 | 78 | 3.25 | 16.1% | 7.9 h |
| Warning | 0.159 | 80% | 12/15 | 15 | 0.63 | 44.4% | 8.6 h |

Every hit has an onset, and none of those onsets are before the flare peak.

The watch bar is set by one storm, the 28 Mar 2022 flare, whose probability is 0.031. The next-lowest storm sits at 0.143. Catching that single extra storm is what moves the threshold from about 0.14 down to 0.031 and raises false alarms from 17 to 78. The rule still stands: 95% on 15 storms does not allow a miss.

Warning lands on 12/15 exactly. The three misses are the three lowest probabilities (0.031, 0.143, 0.148).

Calibration, validation probabilities in five equal-count bins: the bottom four bins, 432 flares, contain no storms (mean probabilities 0.3%, 0.7%, 1.2%, 2.0%). The top bin, 108 flares, has mean probability 12.8% and an observed storm rate of 13.9% (15 storms). The ranking is doing the work. The probabilities in that top bin are close to the rate.

## D6 — Synthetic crew

Pre-approved correlations: sleep↔mood +0.4, sleep↔resting heart rate −0.3, heart rate↔systolic BP +0.3, every other pair 0. Minimum eigenvalue of that matrix: 0.461. The shock matrix that preserves those correlations under the AR(1) has minimum eigenvalue 0.456. Both are positive definite.

AR(1) coefficients: heart rate, systolic and diastolic BP, glucose and temperature 0.6; mood 0.6; sleep 0.5; exercise 0.4.

On the continuous draws (3 astronauts × 75 days), pooled correlations landed at sleep↔mood +0.50, sleep↔heart rate −0.19, heart rate↔systolic BP +0.44. Mean lag-1 was 0.56, 0.54, 0.51, 0.60 and 0.52 for the five vitals, 0.56 for mood, 0.37 for sleep and 0.45 for exercise. Means sit close to the stated values. Full table: `ml/results/synthetic_crew.md`. Seventy-five days is a short sample, so pairs that were set to 0 still wander by about 0.1–0.2.

Planted days are applied after the draw, measured from each astronaut's own first 14 days, because that is what the flags use. Flags score the 3-day mean. Today: Ana heart amber (BP 3-day average 2.5σ for 3 days), Kenji brain red (sleep 3-day average 3.1σ for 4 days), Léa overall green. The storm dose is on 5 Sep 2026, inside the series, and it is outside the last-7-day flag window so it does not colour today. The crew file was validated before the storm file was replaced. The storm file is now the scored test export.

## v1 saved

`ml/models/v1.pkl` is the logistic model fit on train only, plus the climatology rate and the two thresholds. `ml/results/scorecard_v1.md` holds the validation metrics above. The pickle records `test_scored: false`. Validation was used for the grid, the family choice, and the thresholds, so this scorecard is a little optimistic relative to a set that was never used for any of those choices.

## Audit and v2 (14 Nov)

This audit was written before the test was scored. Everything in this section uses 2010–2023 only. `issue_time.py` reads only CMEs linked to the flares it is given.

### Audit findings, by severity

High
1. CME features are hindsight-curated (`train_v1.py:48-49`, `fetch_donki.py:133,209`). The flare→CME link is made by DONKI analysts after the fact, plausibly more carefully when a proton event followed; the speed is the "most accurate" analysis, revised later, and the max over all linked CMEs. Only 5/42 storms lack a CME link (no-CME storm rate 0.7%). Dropping both CME features cuts validation Brier skill from 0.418 to 0.141, so most of the skill depends on information a real-time forecaster would get later and noisier. Cannot be fixed without real-time CME catalogues (e.g. CACTus/SWPC alerts); the pitch should say the model assumes a CME speed is available.
2. Lead time measured from flare peak (old `train_v1.py:264-266`), but the CME features exist only after the CME is seen. Fixed: issue time = later of peak and latest linked CME start. CME start is a first coronagraph frame; the speed arrives later still, so lead times remain slightly optimistic.

Medium
3. Hits and lead times counted per flare, not per storm. 15 validation "storms" are 13 distinct SEPs; Dec 2023 contributes three flares (16–31 h leads) to one event. Per-event warning hit rate is 10/13 (77%), below the 80% the threshold rule targets; per-event median lead is 6.0 h vs 8.6 h per flare. The scorecard now shows both.
4. All selection on one set (`train_v1.py:132,168,254`): grid, family, both thresholds chosen on validation and reported on validation. Hit rates equal the targets by construction, and each threshold sits exactly on a storm's probability (watch = the 28 Mar 2022 flare). C=10 is the top grid edge. Validation numbers are an upper bound; only the test set can say.
5. GOES flux scale shift: pre-2018 fluxes carry the GOES-8–15 0.7 factor, 2020+ do not. Train and validation are on different scales; likely part of why the validation storm rate per M flare is half the training rate (2.8% vs 5.6%).

Low
6. Climatology uses train+validation labels (`train_v1.py:122`), so the baseline sees validation. Sensitivity is small: v1 skill is 0.431 vs train-only rate, 0.418 vs train+val, 0.415 vs the validation rate itself. The 0.415 figure is the most conservative.
7. False alarms counted per flare; bursts from one active region count several times. Excluding flares inside an ongoing storm (`prepare_model_flares.py:196`) is reasonable operationally but the score never covers those flares.
8. A no-CME forecast can only be issued once you've waited long enough to see no CME, so the issue time for no-CME flares is also slightly early.

No split leak found: the time split holds, no duplicate flare IDs, no missing longitudes, and the loader drops 2024+ before use. One validation flare (31 Dec 2023) is linked to a 3 Jan 2024 onset; that is its own label, not a test row.

### Lead time from issue time (v1, validation)

| Cut | Per flare (from peak → from issue) | Per event, from issue | Events caught |
|---|---:|---:|---:|
| Watch 0.0308 | 7.87 → 7.87 h | 4.2 h | 13/13 |
| Warning 0.159 | 8.56 → 8.56 h | 6.0 h | 10/13 |

The per-flare medians do not move because the CMEs start a median 0.4 h after peak and the median hits have CMEs starting before peak. The real change is counting per event.

### v2 (pre-declared, `train_v2.py`)

Two changes together, nothing tuned: (1) divide pre-2018 GOES fluxes by 0.7; (2) replace linear longitude with cos(longitude − 60°), connectivity to the nominal Parker footpoint. Same C=10, features otherwise, thresholds by the same rules. Rule set beforehand: accept only if Brier skill gains more than 0.02 and the warning hit rate does not drop.

| | Brier skill | Warning thr. | Warning caught | Warning FA/month | Precision | Per-event lead (warning) |
|---|---:|---:|---:|---:|---:|---:|
| v1 | 0.418 | 0.159 | 12/15 (10/13 events) | 0.625 | 0.44 | 6.0 h |
| v2 | 0.434 | 0.164 | 12/15 (10/13 events) | 0.458 | 0.52 | 8.6 h |

Gain +0.016, under 0.02. **v2 rejected; v1 stays final.** No v2.pkl saved. Ablations (information only, not candidates): connectivity alone 0.454, harmonisation alone 0.404. Connectivity alone would have passed, but choosing it after seeing those numbers would be selecting on validation again, so it is not adopted. Full output: `ml/results/v2_evaluation.json`.

## Test (scored once, 15 Nov 2026)

`python ml/run_test_and_export.py` ran once, after v1 was frozen. Thresholds were not moved. Primary hit rate and median lead are per distinct GOES >10 MeV storm, from issue time. Each event's `lead_time_h` in `storm_forecast.json` stays peak to onset, as the contract defines it. False alarms stay per flare. The month count is 35 (January 2024 through November 2026) and is not reduced when 1–20 May is dropped.

| Cut | Storms caught | Median lead from issue | False alarms / month | Precision | Flares caught |
|---|---:|---:|---:|---:|---:|
| Watch 0.0308 | 17/17 | 2.9 h | 6.09 (213 flares) | 12% | 29/29 |
| Warning 0.159 | 16/17 | 3.8 h | 1.00 (35 flares) | 42% | 25/29 |

Brier skill vs the stored 4.10% climatology: v1 0.413. Flare-time ablation (train-only logistic regression, C=10, log flare size and longitude, no CME link and no CME speed): 0.055. That ablation is a floor, not a candidate.

Without 1–20 May 2024 (same 35 months): warning 14/15 storms, median lead 2.5 h, 0.97 false alarms per month; watch 15/15, median lead 2.1 h, 5.69 per month. v1 skill 0.385. Flare-time ablation −0.012.

The warning miss is one flare, the 5 Sep 2026 M1.0 at S12W68, probability 0.139, onset the same afternoon. Watch catches it. No hit has a negative lead. May 2024 has two storms, both warned: the 10 May onset (first warning flare 8 May 21:40, about 39 h) and the 13 May onset (about 4.5 h). The flare-by-flare May table is `ml/results/may2024_flares.csv` (112 flares; 86 stayed at none). Reliability plot: `ml/results/reliability.png`.
