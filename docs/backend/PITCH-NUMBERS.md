# Pitch numbers

Held-out test only. Source: `web/public/data/storm_forecast.json` `meta` (written by the shipped export). Do not quote training-set scores.

## Storm model

| | |
|---|---|
| Model | `logistic_C10` |
| Horizon | 72 hours |
| Train | 2010-01-01 to 2023-12-31 |
| Test | 2024-01-01 to 2026-11-15 |
| Flares in the test file | 1,528 |
| Storms (`metrics_test.n_storms`) | 17 |
| Hit rate | 0.941176 (16 of 17) |
| False alarms per month | 1.0 |
| Median lead time | 3.83 hours |
| Brier skill vs climatology | 0.412519 |

Data credit in the file: NASA CCMC DONKI.

Say it as: "On flares from 2024 through now, held out from training, it caught 16 of 17 storms, about one false alarm a month, with a median lead of 3.8 hours. The horizon is 72 hours."

## May 2024

Training stops on 31 December 2023, so May 2024 was never in the training set. In the test file, 12 flares are tied to storms with onset 2024-05-10T13:35:00Z or 2024-05-13T14:00:00Z. Those are the held-out May 2024 events.

## v2 is not the shipped model

`ml/results/v2_evaluation.json` has `"accepted": false`. The rule in that file is to accept v2 only if the Brier-skill gain is over 0.02 and the warning hit rate does not drop. It was not accepted. The numbers above are `logistic_C10`. Do not quote v2.

## Crew

Crew vitals are simulated. The Inspiration4 lab panels are real NASA OSDR data (OSD-575 and OSD-569).

## What "18%" means

It is the cumulative simulated mission dose divided by the 600 mSv NASA career limit (`career_limit_mSv` in `crew_data.json`). On 14 Nov 2026 that is Ana 109.4 mSv (18.2%), Kenji 111.0 mSv (18.5%), Léa 112.4 mSv (18.7%). The dose series is simulated. The 600 mSv limit is the NASA figure.
