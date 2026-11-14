# Scorecard v1 (validation only)

Model: `logistic_C10` (logistic).
Fit on train flares with peak year ≤ 2021. Validation is 2022–2023 (540 flares, 15 storms). The test years were not scored.

Climatology rate, train and validation combined: 0.0410.
Brier skill versus that climatology, on validation: 0.4183.

A false alarm is a non-storm flare at or above the threshold. The month count is the 24 calendar months from January 2022 through December 2023.

| Cut | Rule | Threshold | Hit rate (flares) | Storm flares caught | Storm events caught | False alarms / month | Precision | Median lead time, per flare (h) | Median lead time, per event (h) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Watch | highest threshold with hit rate ≥ 95% | 0.0308 | 1.000 | 15/15 | 13/13 | 3.250 | 0.161 | 7.87 | 4.2 |
| Warning | highest threshold with hit rate ≥ 80% | 0.1589 | 0.800 | 12/15 | 10/13 | 0.625 | 0.444 | 8.56 | 6.03 |

Watch lead times: 15 of 15 hits have an onset, 0 of those are negative.
Warning lead times: 12 of 12 hits have an onset, 0 of those are negative.

Lead time runs from issue time to the linked GOES >10 MeV onset. Issue time is the later of the flare peak and the linked CME's start time (flare peak when there is no CME), because the CME features cannot be known before the CME is seen. Per event: one lead time per distinct SEP, from the earliest flare at or above the threshold. Measured from flare peak instead (the old definition), the per-flare medians are 7.87 h (watch) and 8.56 h (warning). Negative lead time means the onset is before the issue time. The main label is an analyst link, not a guarantee that the flare came first.

Validation was used to pick the grid point, to pick the model family, and to set these two thresholds. These validation numbers are therefore a bit optimistic. The held-out test score is not in this file.
