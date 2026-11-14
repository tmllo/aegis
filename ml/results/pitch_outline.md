# Pitch outline

Validation numbers below are real. Anything marked [TEST RESULT] is not filled in. The 2024–2026 flares were not scored.

## Problem

Astronauts need a health check they can do themselves, and a warning before a solar radiation storm rather than after the dose has arrived. A missed storm means the crew is still outside the shelter. An unnecessary shelter hour is the cheaper mistake.

## Product

Aegis is a self-assessment app for a small crew. Each person is scored against their own recent baseline, not a generic normal range. The body map turns a drift in blood pressure, sleep, or mood into a color and a next action. Alongside that, a flare model gives the probability that an Earth proton storm (GOES >10 MeV) is linked to this flare, with a watch and a warning.

The crew on screen is simulated. Real astronaut records are protected. Say that out loud.

## Data

NASA DONKI, pulled from 2010 through 14 Nov 2026. The modelling table keeps M-class and X-class flares only, because C, B, and A flares are logged inconsistently across years.

The SEP feed is not one row per Earth storm. It mixes GOES proton channels, SOHO, STEREO, and REleASE forecast alerts. The training label is narrower: a flare DONKI links to a GOES >10 MeV event. A 72-hour GOES >10 MeV onset is the sensitivity check, not the target. Flares that peak while a GOES >10 MeV storm has already started in the previous 48 hours are removed. One bad location, the 28 Oct 2013 X1.0 stored as N07W634, is corrected to N07W65. Longitudes out to 120° stay.

The model was built only on peaks through 2023.

| Split | Years | Flares | Linked storms | Rate |
|---|---|---:|---:|---:|
| Train | 2010–2021 | 484 | 27 | 5.6% |
| Validation | 2022–2023 | 540 | 15 | 2.8% |
| Test | 2024–now | [TEST RESULT] | [TEST RESULT] | [TEST RESULT] |

Train is 438 M and 46 X. Validation is 521 M and 19 X. 2018 and 2019 contributed no M or X flares.

## Method

Three models, no class weights. Climatology predicts the combined train and validation storm rate, 4.1%, for every flare. Logistic regression and a small gradient-boosting grid were fit on train only and scored on validation. Features: log flare size, solar longitude (west positive), whether DONKI linked a CME, and log CME speed.

Boosting’s best validation Brier skill was 0.424. Logistic regression at C=10 was 0.418. The gap is under the 0.02 rule, so the simpler model is v1. Standardized coefficients all point the same way as the physics: a linked CME and a faster CME raise the probability most, then western longitude, then a larger flare.

Watch and warning were set on validation only. Watch is the highest threshold that still catches at least 95% of storms. Warning is the highest that still catches at least 80%.

## Parker spiral

On the 1,024 development flares, the storm rate rises from east to west.

| Longitude | Storm rate | Flares |
|---|---:|---:|
| 120–90°E | 0.0% | 42 |
| 90–60°E | 1.8% | 170 |
| 60–30°E | 1.3% | 157 |
| 30–0°E | 4.0% | 126 |
| 0–30°W | 5.3% | 133 |
| 30–60°W | 6.6% | 166 |
| 60–90°W | 6.5% | 201 |
| 90–120°W | 3.4% | 29 |

Eastern-disk flares storm about 1–2% of the time. The western disk is about 6–7%. That is the Parker spiral: the Sun’s western hemisphere is magnetically connected to Earth. The bin past 90°W is one storm in 29 flares, too small to lean on. The same east-to-west rise shows up in the model: on validation its mean probability is 1.4% east of the central meridian and 5.2% to the west.

X-class flares storm 21.5% of the time (14/65) against 2.9% for M-class (28/959). A linked CME storms 12.3% of the time (37/302) against 0.7% with no linked CME (5/722). When a CME speed is recorded, the median is 1,372 km/s for storms and 679 km/s otherwise.

## Validation results

540 flares, 15 storms, 24 months (January 2022–December 2023). Brier skill versus climatology: 0.418.

| Cut | Threshold | Hit rate | False alarms per month | Precision | Median lead time |
|---|---:|---:|---:|---:|---:|
| Watch | 0.031 | 15/15 (100%) | 3.25 | 16% | 7.9 h |
| Warning | 0.159 | 12/15 (80%) | 0.63 | 44% | 8.6 h |

The bottom four fifths of validation probabilities contained no storms. The top fifth had a mean probability of 12.8% and an observed rate of 13.9%.

Test, to be filled once and not before the model is frozen:

- Hit rate at warning: [TEST RESULT]
- False alarms per month at warning: [TEST RESULT]
- Hit rate at watch: [TEST RESULT]
- False alarms per month at watch: [TEST RESULT]
- Brier skill vs climatology: [TEST RESULT]
- Median lead time on warning hits: [TEST RESULT]
- May 2024, flare by flare (probability, alert, actual storm, lead time): [TEST RESULT]

## Limitations

Fifteen validation storms is a small set to tune two thresholds. The 95% watch rule cannot miss even one of them, so a single low-scoring storm on 28 Mar 2022 pulls the watch threshold down to 0.031 and produces 3.25 false alarms per month. Fourteen of fifteen would have been 93%, which fails that rule. Warning, at 0.63 false alarms per month, is the cut that is usable in a demo.

Validation was used three times: the grid, the choice of logistic over boosting, and the thresholds. The 0.418 skill is a bit optimistic. The honest number is the test skill, and it is still [TEST RESULT].

DONKI is an analyst list, not every GOES flare. The model learns flares someone chose to write down. The label is a curated link to a GOES >10 MeV event, so some real proton events with no link are counted as negatives, and a link is not proof the particles were caused by that flare.

C=10 was the top of the logistic grid. C=1 scored 0.409 and would have won under the same simplicity rule. The family is stable. The exact penalty is not something to quote as a discovery.

The crew is synthetic. The approved correlations are positive definite, and a 75-day draw only approximates them (sleep’s lag-1 came out at 0.37 against a target of 0.50). No real astronaut health data is in the app.
