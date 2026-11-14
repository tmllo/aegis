# Scorecard v1 (validation only)

Model: `logistic_C10` (logistic).
Fit on train flares with peak year ≤ 2021. Validation is 2022–2023 (540 flares, 15 storms). The test years were not scored.

Climatology rate, train and validation combined: 0.0410.
Brier skill versus that climatology, on validation: 0.4183.

A false alarm is a non-storm flare at or above the threshold. The month count is the 24 calendar months from January 2022 through December 2023.

| Cut | Rule | Threshold | Hit rate | Storms caught | False alarms / month | Precision | Median lead time (h) |
|---|---|---:|---:|---:|---:|---:|---:|
| Watch | highest threshold with hit rate ≥ 95% | 0.0308 | 1.000 | 15/15 | 3.250 | 0.161 | 7.87 |
| Warning | highest threshold with hit rate ≥ 80% | 0.1589 | 0.800 | 12/15 | 0.625 | 0.444 | 8.56 |

Watch lead times: 15 of 15 hits have an onset, 0 of those are negative.
Warning lead times: 12 of 12 hits have an onset, 0 of those are negative.

Negative lead time means the linked GOES >10 MeV onset is before the flare peak. The main label is an analyst link, not a guarantee that the flare came first.

Validation was used to pick the grid point, to pick the model family, and to set these two thresholds. These validation numbers are therefore a bit optimistic. The held-out test score is not in this file.
