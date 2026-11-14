# Synthetic crew fidelity

Simulated crew. Not real astronaut data. Numbers below are the continuous AR(1) draws, before rounding and before the planted demo days (Ana's blood pressure, Kenji's sleep and mood, Léa's last-day hold).

## Positive definite

Approved correlation matrix minimum eigenvalue: 0.4611.
Innovation correlation matrix minimum eigenvalue: 0.4564.
Both are positive, so the Cholesky draws are valid.

Approved off-diagonal pairs: sleep↔mood +0.40, sleep↔resting HR −0.30, HR↔systolic BP +0.30. Every other pair is 0.

AR(1) coefficients: vitals 0.60 (heart rate, both blood pressures, glucose, temperature), mood 0.60, sleep 0.50, exercise 0.40.

## Approved correlation

| | hr | bp_sys | bp_dia | glucose | temp | sleep_h | mood | exercise_min |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| hr | 1.00 | 0.30 | 0.00 | 0.00 | 0.00 | -0.30 | 0.00 | 0.00 |
| bp_sys | 0.30 | 1.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| bp_dia | 0.00 | 0.00 | 1.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| glucose | 0.00 | 0.00 | 0.00 | 1.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| temp | 0.00 | 0.00 | 0.00 | 0.00 | 1.00 | 0.00 | 0.00 | 0.00 |
| sleep_h | -0.30 | 0.00 | 0.00 | 0.00 | 0.00 | 1.00 | 0.40 | 0.00 |
| mood | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.40 | 1.00 | 0.00 |
| exercise_min | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 1.00 |

## Realized correlation

Three astronauts, 75 days each, standardized by that astronaut's stated mean and sd, then pooled.

| | hr | bp_sys | bp_dia | glucose | temp | sleep_h | mood | exercise_min |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| hr | 1.00 | 0.44 | 0.06 | 0.10 | 0.03 | -0.19 | 0.03 | -0.00 |
| bp_sys | 0.44 | 1.00 | 0.16 | 0.11 | 0.01 | 0.18 | 0.15 | 0.06 |
| bp_dia | 0.06 | 0.16 | 1.00 | 0.08 | 0.07 | 0.14 | 0.02 | -0.06 |
| glucose | 0.10 | 0.11 | 0.08 | 1.00 | -0.14 | -0.06 | 0.02 | -0.09 |
| temp | 0.03 | 0.01 | 0.07 | -0.14 | 1.00 | 0.04 | 0.04 | -0.01 |
| sleep_h | -0.19 | 0.18 | 0.14 | -0.06 | 0.04 | 1.00 | 0.50 | 0.08 |
| mood | 0.03 | 0.15 | 0.02 | 0.02 | 0.04 | 0.50 | 1.00 | 0.08 |
| exercise_min | -0.00 | 0.06 | -0.06 | -0.09 | -0.01 | 0.08 | 0.08 | 1.00 |

## Lag-1 autocorrelation

| Metric | Target | Ana | Kenji | Léa | Mean |
|---|---:|---:|---:|---:|---:|
| hr | 0.60 | 0.55 | 0.63 | 0.50 | 0.56 |
| bp_sys | 0.60 | 0.53 | 0.53 | 0.55 | 0.54 |
| bp_dia | 0.60 | 0.56 | 0.54 | 0.41 | 0.51 |
| glucose | 0.60 | 0.68 | 0.59 | 0.54 | 0.60 |
| temp | 0.60 | 0.49 | 0.46 | 0.61 | 0.52 |
| sleep_h | 0.50 | 0.28 | 0.51 | 0.32 | 0.37 |
| mood | 0.60 | 0.49 | 0.51 | 0.67 | 0.56 |
| exercise_min | 0.40 | 0.36 | 0.49 | 0.50 | 0.45 |

## Means and standard deviations

| Crew | Metric | Stated mean | Realized mean | Stated sd | Realized sd |
|---|---|---:|---:|---:|---:|
| c1 | hr | 62.00 | 61.19 | 3.00 | 2.46 |
| c1 | bp_sys | 116.00 | 114.85 | 4.00 | 3.25 |
| c1 | bp_dia | 74.00 | 74.15 | 3.00 | 2.86 |
| c1 | glucose | 92.00 | 89.67 | 5.00 | 5.11 |
| c1 | temp | 36.90 | 36.90 | 0.15 | 0.12 |
| c1 | sleep_h | 6.60 | 6.39 | 0.40 | 0.33 |
| c1 | mood | 4.20 | 3.94 | 0.40 | 0.32 |
| c1 | exercise_min | 125.00 | 122.97 | 12.00 | 11.81 |
| c2 | hr | 58.00 | 58.64 | 3.00 | 2.75 |
| c2 | bp_sys | 112.00 | 111.65 | 4.00 | 3.95 |
| c2 | bp_dia | 70.00 | 70.92 | 3.00 | 2.63 |
| c2 | glucose | 88.00 | 87.14 | 5.00 | 4.85 |
| c2 | temp | 36.80 | 36.80 | 0.15 | 0.14 |
| c2 | sleep_h | 6.80 | 6.76 | 0.40 | 0.41 |
| c2 | mood | 4.00 | 4.03 | 0.40 | 0.38 |
| c2 | exercise_min | 130.00 | 125.38 | 12.00 | 12.99 |
| c3 | hr | 66.00 | 66.37 | 3.00 | 3.15 |
| c3 | bp_sys | 110.00 | 110.86 | 4.00 | 4.17 |
| c3 | bp_dia | 68.00 | 68.10 | 3.00 | 2.62 |
| c3 | glucose | 90.00 | 88.08 | 5.00 | 4.83 |
| c3 | temp | 36.90 | 36.91 | 0.15 | 0.17 |
| c3 | sleep_h | 6.30 | 6.26 | 0.40 | 0.37 |
| c3 | mood | 4.30 | 4.26 | 0.40 | 0.39 |
| c3 | exercise_min | 115.00 | 114.17 | 12.00 | 13.67 |

With 75 days, a mean can sit a few tenths of a standard deviation off the stated value, and a single lag-1 estimate wobbles. The targets are the process, not a promise that one short mission matches them to two decimals.

The JSON stores mood as an integer from 1 to 5 and rounds the other daily inputs. Those stored values are coarser than this table. Bone loss and radiation dose are built from the daily inputs and the planted storm day; they are not part of the correlation matrix.
