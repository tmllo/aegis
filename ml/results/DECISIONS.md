# Decisions

## Summary

In progress. This run uses split A and does not open the test years (2024 onward). The closing summary replaces this paragraph when the run finishes.

## Checklist

- [x] Split — A: train through 2021, validation 2022–2023, test 2024–now held out and not opened
- [x] EDA — development set only, 1,024 flares, 42 storms
- [x] Charts — four PNGs in ml/results/
- [x] Models — logistic regression, C=10, validation Brier skill 0.418
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
