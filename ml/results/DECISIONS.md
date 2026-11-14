# Decisions

## Summary

In progress. This run uses split A and does not open the test years (2024 onward). The closing summary replaces this paragraph when the run finishes.

## Checklist

- [x] Split — A: train through 2021, validation 2022–2023, test 2024–now held out and not opened
- [ ] EDA
- [ ] Charts
- [ ] Models
- [ ] Thresholds
- [ ] v1 saved
- [ ] Synthetic crew
- [ ] Pitch outline

## Rules for this run

Test rows are any flare with peak time in 2024 or later. Scripts that fit, score, or plot load only 2010–2023. Thresholds and model choice use validation only. Climatology is the storm rate on train and validation combined. No class weights. If two models are within 0.02 Brier skill on validation, the simpler one is kept (climatology, then logistic regression, then gradient boosting).

Watch is the highest threshold whose validation hit rate is at least 95%. Warning is the highest threshold whose validation hit rate is at least 80%. False alarms per month use the 24 calendar months from January 2022 through December 2023.

## D1 — Label

Main label `sep_linked_goes10`: DONKI links the flare to a GOES >10 MeV SEP. GOES >100 MeV, SOHO, STEREO, ACE, and REleASE model alerts do not count.

Sensitivity label `sep_within_72h_goes10`: a GOES >10 MeV onset in the 72 hours after peak. It is not the training target.

Rows in the modelling table are M-class and X-class only. The 28 Oct 2013 X1.0 location is stored as N07W65. Longitudes from 90° to 120° stay. A flare is removed when a GOES >10 MeV onset falls in the 48 hours before peak.

Development set only (test not opened):

| Split | Flares | Linked positives | Rate | Within 72h | Distinct GOES >10 events | Dates |
|---|---:|---:|---:|---:|---:|---|
| Train (≤2021) | 484 | 27 | 5.6% | 69 | 24 | 2010-06-12 → 2021-12-28 |
| Validation (2022–2023) | 540 | 15 | 2.8% | 55 | 13 | 2022-01-01 → 2023-12-31 |

Train is 438 M and 46 X. Validation is 521 M and 19 X. 2018 and 2019 have no M or X flares in the development set.

## D2 — Split

Option A. Train is every development flare with peak year ≤ 2021. Validation is 2022 and 2023. Test is 2024 through the end of the catalogue and is not loaded, scored, or plotted in this run.

Why this one: validation has two years and 13 separate GOES >10 MeV events, enough to set a cutoff. Putting 2022 into training would leave 2023 alone (10 linked flares, 8 GOES events), and 4 of those 10 flares fall in December 2023. Stopping training at 2019 only moves 2020–2021, which is one positive.

The validation positive rate (2.8%) is lower than the training rate (5.6%) because later years contain more logged M flares per storm. Thresholds are set on validation for that reason.
