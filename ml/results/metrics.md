# Metrics

Scored once on 15 Nov 2026, after the model and the two thresholds were frozen. Counts below are from that run and from the DONKI catalogue pulled through 11 Nov 2026. Charts: `slide_parker_spiral.png`, `slide_hit_vs_false_alarms.png`, `slide_may2024_timeline.png`.

## What the model predicts

v1 is a logistic regression. For one M-class or X-class flare it gives the probability that DONKI links that flare to a GOES >10 MeV proton storm.

Two cuts, chosen on 2022–2023 and left alone afterwards:

| Cut | Probability | Rule it was built to meet |
|---|---:|---|
| Watch | 0.031 | Highest threshold that still caught at least 95% of validation flares |
| Warning | 0.159 | Highest threshold that still caught at least 80% of validation flares |

The number is a probability of a catalogue link. It is not a dose, a particle intensity, or a health score. The crew display is a separate simulation.

Features: log flare size, solar longitude (west positive), whether DONKI linked a CME, and log CME speed. No class weights. Fit on flares with peak year ≤ 2021 only.

## Data and counts

NASA DONKI, flare peaks from 3 Apr 2010 through 11 Nov 2026.

| | Count |
|---|---:|
| Flares in the catalogue | 3,407 |
| Flares with a location | 3,407 |
| M | 2,620 |
| C | 583 |
| X | 156 |
| B | 47 |
| A | 1 |

The SEP feed has 494 rows. They are not 494 Earth storms.

| Instrument kind | Rows |
|---|---:|
| REleASE model alerts | 140 |
| STEREO | 122 |
| SOHO | 112 |
| GOES >10 MeV | 96 |
| GOES >100 MeV | 23 |
| ACE | 1 |

## How the label was cleaned

The training label is a DONKI link from the flare to a GOES >10 MeV event. GOES >100 MeV, SOHO, STEREO, ACE, and REleASE alerts do not count. On the raw catalogue that leaves 87 linked flares out of 3,407.

A second label, not used for training, marks any GOES >10 MeV onset in the 72 hours after peak. That one is much looser: 435 flares.

Then four cleaning steps:

1. Keep M and X only. C, B, and A flares are logged unevenly across years. That leaves 2,776 flares and 80 linked positives (49 of 2,620 M, 31 of 156 X).
2. The 28 Oct 2013 X1.0 was stored as N07W634. It is corrected to N07W65, the location of the same region a few hours later. The corrected flare is not a storm.
3. Longitudes from 90° to 120° stay. The modelling table keeps 75 of those over-limb flares.
4. Drop a flare when a GOES >10 MeV onset already falls in the 48 hours before peak. That removes 224 flares, 9 of them linked positives.

The modelling table is 2,552 flares and 71 linked positives.

## Split

Time split only. Train is peak year ≤ 2021. Validation is 2022–2023. Test is 2024 through 15 Nov 2026. The model was fit on train. The grid, the choice of logistic regression over boosting, and both thresholds used validation. Test was scored once after that.

| Split | Flares | Linked flares | Distinct GOES >10 storms | Linked-flare rate |
|---|---:|---:|---:|---:|
| Train, 2010–2021 | 484 | 27 | 24 | 5.6% |
| Validation, 2022–2023 | 540 | 15 | 13 | 2.8% |
| Test, 2024–15 Nov 2026 | 1,528 | 29 | 17 | 1.9% |

2018 and 2019 have no M or X flares in the development set. Climatology is the train+validation storm rate, 42/1,024 = 4.10%, stored with the model and not recomputed on test.

## Test, per storm, against climatology

A storm is caught if any flare linked to that GOES >10 MeV event is at or above the threshold. Lead time runs from issue time, the later of flare peak and the latest linked CME start, to onset. The earliest such issue time among the alerting flares is the one that counts. False alarms are still quiet flares, divided by 35 calendar months (January 2024 through November 2026). Dropping 1–20 May removes flares, not a fraction of a month.

| | Storms caught | Median lead | False alarms / month | Precision |
|---|---:|---:|---:|---:|
| Warning | 16/17 | 3.8 h | 1.0 (35 flares) | 42% |
| Watch | 17/17 | 2.9 h | 6.1 (213 flares) | 12% |
| Warning, without 1–20 May 2024 | 14/15 | 2.5 h | 0.97 | |
| Watch, without 1–20 May 2024 | 15/15 | 2.1 h | 5.7 | |

Per flare, which counts the same storm more than once: warning 25/29, median lead 4.8 h; watch 29/29, median lead 4.8 h. No hit has a negative lead. The JSON field `lead_time_h` on each flare is still peak to onset. The medians above are from issue time.

Brier skill against the 4.10% climatology is **0.413**. Zero would mean the probabilities are no better than guessing 4.1% every time. The same skill on validation was 0.418. Without 1–20 May 2024 the test skill is 0.385.

Climatology assigns 4.10% to every flare. That is above watch (3.1%) and below warning (15.9%). Used as an alert, it would put all 1,528 test flares on watch (17/17 storms, about 43 false alarms per month) and it would warn on none. Warning is the cut climatology cannot make. Chart: `slide_hit_vs_false_alarms.png`.

The warning miss is one flare, the 5 Sep 2026 M1.0 at S12W68, probability 0.14, onset the same afternoon. Watch catches it.

## Flare-time ablation

The same logistic regression, same penalty (C=10), refit on train only, with flare size and longitude and without the CME link or the CME speed. This is the information known from the flare itself. It is a floor, not a second model, and it was not used to pick thresholds.

| | Brier skill vs the 4.10% climatology |
|---|---:|
| v1, full test | 0.413 |
| Flare size and longitude only | 0.055 |
| v1, without 1–20 May 2024 | 0.385 |
| Flare size and longitude only, without 1–20 May 2024 | −0.012 |

Without the May cluster, flare size and longitude score slightly worse than guessing 4.1%. Almost all of the 0.413 sits in the CME link and the CME speed.

## May 2024

112 M and X flares from 1 to 20 May. Two GOES >10 MeV storms, both warned.

The 10 May 13:35 onset is linked to eight flares. The first warning is the 8 May 21:40 X1.0 at S20W17, probability 0.33, about 39 hours before onset. Earlier flares that same day were only at watch.

The 13 May 14:00 onset is linked to four flares that morning, all at warning. The first is the 13 May 08:20 M1.2, about 4.5 hours before onset.

Ten May flares reached warning and sixteen reached watch. Eighty-six stayed below watch. One warning was wrong: the 15 May X2.9 at S12E90, probability 0.35, with no linked storm. Eastern longitude is a hard place to be connected to Earth, and the model still warned. Chart: `slide_may2024_timeline.png`.

Taking those twenty days out of the test metrics leaves warning at 14/15 storms and a 2.5 hour median lead. May is the long-lead case. It is not the typical one.

## Parker spiral

On the 1,024 development flares, before 2024, the storm rate rises from east to west. Chart: `slide_parker_spiral.png`.

| Longitude | Storms | Flares | Rate |
|---|---:|---:|---:|
| 120–90°E | 0 | 42 | 0.0% |
| 90–60°E | 3 | 170 | 1.8% |
| 60–30°E | 2 | 157 | 1.3% |
| 30–0°E | 5 | 126 | 4.0% |
| 0–30°W | 7 | 133 | 5.3% |
| 30–60°W | 11 | 166 | 6.6% |
| 60–90°W | 13 | 201 | 6.5% |
| 90–120°W | 1 | 29 | 3.4% |

The western disk is about 6–7%. The bin past 90°W is one storm in 29 flares.

## Limitations

Seventeen test storms is a small number. One miss moves the hit rate by six points. The validation thresholds were set on 15 flares, and the 95% watch rule could not miss a single one of them, so watch sits at 0.031, below the 4.1% base rate.

The CME link is an analyst link, made after the fact, and the speed is the “most accurate” analysis, taken as the max over linked CMEs. The ablation says how much of the skill that is. Issue time uses the first coronagraph frame; the speed is measured later, so a 3.8 hour lead is a little early as well as short.

DONKI is the list of flares someone wrote down, not every GOES flare. A proton storm with no link is counted as a quiet flare. A link is not proof that flare caused the particles.

C=10 was the top of a grid that was set beforehand. C=1 scored 0.409 on validation and would have won under the same simplicity rule. The family is stable. The exact penalty is not a result.

The crew is synthetic. Three approved correlations are positive definite (minimum eigenvalue 0.46). On a 75-day draw they land in the right direction and not on the target: sleep↔mood +0.50 against +0.40, sleep↔heart rate −0.19 against −0.30, heart rate↔systolic BP +0.44 against +0.30. Sleep’s lag-1 is 0.37 against a target of 0.50. No real astronaut health data is in the app. Detail: `synthetic_crew.md`.
