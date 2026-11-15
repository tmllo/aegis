# Inspiration4 labs against each person's own baseline

Published CBC and chemistry for four Inspiration4 crew, coded C001–C004 in NASA OSDR OSD-575. This is not the simulated AEGIS crew, and it is not medical advice.

Each baseline is the mean of that person's L-92, L-44 and L-3 draws, except C003's blood counts, which use L-44 and L-3 only. Percent change is the post-flight value against that mean. A value is outside the lab range when it is below the minimum or above the maximum printed on that same row. A post-flight value is called far from baseline only when it is still inside that range and |z| is at least 2, with z = (value − mean) / pre-flight sample sd. That is the same 2 SD idea as the app's amber flag. There is no sd floor. With two or three draws, a very small sd inflates z, so a flag is a description of this file, not a clinical alert.

## What stands out

C003's neutrophils stay inside 1,500–7,800 cells/µL at every post-flight draw, and every one of those draws is well below that person's own pre-flight pair. The two usable pre-flight counts average 6100 (sd 436, n = 2, because L-92 was dropped). Post-flight: R+1 -33.0% (z -4.62), R+45 -24.3% (z -3.40), R+82 -25.0% (z -3.50), R+194 -32.0% (z -4.47). White cells move with them (pre-flight 9.3 and 9.8 ×10³/µL, post-flight 7.0 to 8.8), so that is one finding, not two. The baseline is two high draws. The four later draws agree with each other, which is more than a single noisy point, and it is still a two-point baseline.

Glucose gives the same kind of result on a tighter baseline, and it is the analyte the chart shares with the synthetic crew. Inside the lab range and past 2 personal SD: C002 R+1 83.0 mg/dL (+13.7%, z +2.18), C002 R+194 84.0 mg/dL (+15.1%, z +2.40). C002's pre-flight glucose mean is 73.0 mg/dL (sd 4.6). 83 and 84 mg/dL are ordinary lab values and are high for this person. No other in-range glucose point clears 2 SD. C003 at R+1 is 103 mg/dL, just above the printed maximum of 99, so it is outside the lab range rather than an in-range personal flag.

Lymphocytes at R+1: C001 -27.3% (z -1.52); C002 -33.8% (z -1.64); C003 -20.4% (z -0.70); C004 +1.9% (z +0.05). Three of the four crew are down 20–34%, and every lymphocyte count we kept is inside 850–3,900. None of those drops reach 2 personal SD. Pre-flight lymphocyte CVs are already C001 18%, C002 21%, C003 29%, C004 34%. A large percent change is not a personal alert when the person already moves that much across three draws.

The R+45 chemistry draw is not usable as biology for three glucoses and one potassium. C002 glucose 44.0 mg/dL; C003 glucose 36.0 mg/dL; C004 glucose 43.0 mg/dL, all under 50. C004 potassium is 5.90 mmol/L on that same draw, so C004 shows both signs. C001's glucose is 84 mg/dL and is kept, and the other potassiums on that draw are 4.0, 4.1 and 4.4. Three glucoses collapsing together, one of them with a high potassium, is what happens when cells sit in the tube: they consume glucose and can leak potassium. Those four values are flagged and are not read as hypoglycemia or hyperkalemia. Percent change is still in the JSON.

## Inside the lab range, at least 2 personal SD away

Sorted in analyte order. WBC is listed under neutrophils because it is the same C003 shift. Potassium, hemoglobin, calcium and some platelet flags sit on pre-flight sds of a few tenths, so |z| ≥ 2 can be a few tenths of a unit. Those are in the table so nothing is hidden. They are not the headline.

| Crew | Analyte | Draw | Value | Mean | Change | z | Lab range |
|---|---|---|---:|---:|---:|---:|---|
| C003 | Absolute neutrophils | R+1 | 4088 | 6100 | -33.0% | -4.62 | 1500–7800 |
| C003 | Absolute neutrophils | R+45 | 4618 | 6100 | -24.3% | -3.40 | 1500–7800 |
| C003 | Absolute neutrophils | R+82 | 4576 | 6100 | -25.0% | -3.50 | 1500–7800 |
| C003 | Absolute neutrophils | R+194 | 4151 | 6100 | -32.0% | -4.47 | 1500–7800 |
| C003 | White blood cells | R+1 | 7.0 | 9.6 | -26.7% | -7.21 | 3.8–10.8 |
| C003 | White blood cells | R+45 | 7.8 | 9.6 | -18.3% | -4.95 | 3.8–10.8 |
| C003 | White blood cells | R+82 | 8.8 | 9.6 | -7.9% | -2.12 | 3.8–10.8 |
| C003 | White blood cells | R+194 | 7.4 | 9.6 | -22.5% | -6.08 | 3.8–10.8 |
| C002 | Glucose | R+1 | 83.0 | 73.00 | +13.7% | +2.18 | 65.0–99.0 |
| C002 | Glucose | R+194 | 84.0 | 73.00 | +15.1% | +2.40 | 65.0–99.0 |
| C002 | Potassium | R+1 | 3.50 | 3.90 | -10.3% | -4.00 | 3.50–5.30 |
| C002 | Potassium | R+45 | 4.10 | 3.90 | +5.1% | +2.00 | 3.50–5.30 |
| C002 | Potassium | R+82 | 3.70 | 3.90 | -5.1% | -2.00 | 3.50–5.30 |
| C002 | Potassium | R+194 | 4.40 | 3.90 | +12.8% | +5.00 | 3.50–5.30 |
| C003 | Potassium | R+45 | 4.40 | 3.50 | +25.7% | +4.50 | 3.50–5.30 |
| C001 | Platelets | R+194 | 214 | 245.3 | -12.8% | -2.81 | 140–400 |
| C002 | Platelets | R+1 | 252 | 237.0 | +6.3% | +2.17 | 140–400 |
| C002 | Platelets | R+45 | 252 | 237.0 | +6.3% | +2.17 | 140–400 |
| C003 | Platelets | R+45 | 396 | 356.0 | +11.2% | +2.57 | 140–400 |
| C003 | Platelets | R+194 | 185 | 356.0 | -48.0% | -10.99 | 140–400 |
| C001 | Hemoglobin | R+82 | 15.70 | 14.57 | +7.8% | +2.72 | 13.20–17.10 |
| C004 | Hemoglobin | R+82 | 16.40 | 16.80 | -2.4% | -2.00 | 13.20–17.10 |
| C004 | Calcium | R+1 | 9.80 | 10.10 | -3.0% | -3.00 | 8.60–10.30 |
| C004 | Calcium | R+45 | 9.80 | 10.10 | -3.0% | -3.00 | 8.60–10.30 |
| C004 | Calcium | R+194 | 9.80 | 10.10 | -3.0% | -3.00 | 8.60–10.30 |

C003 platelets at R+194 are 185 ×10³/µL against a pre-flight pair near 350, inside 140–400. R+1, R+45 and R+82 were 359, 396 and 345, so this is one late draw, not a change that starts at landing.

## Outside the printed lab range, and not an R+45 handling flag

| Crew | Analyte | Draw | Value | Lab range | Change vs own mean |
|---|---|---|---:|---|---:|
| C003 | Glucose | L-44 | 62.0 | 65.0–99.0 | -13.1% |
| C003 | Glucose | R+1 | 103.0 | 65.0–99.0 | +44.4% |
| C004 | Glucose | L-92 | 100.0 | 65.0–99.0 | +25.5% |
| C004 | Glucose | L-3 | 56.0 | 65.0–99.0 | -29.7% |
| C003 | Potassium | L-3 | 3.30 | 3.50–5.30 | -5.7% |
| C003 | Potassium | R+1 | 3.00 | 3.50–5.30 | -14.3% |
| C002 | Hemoglobin | L-3 | 11.50 | 11.70–15.50 | -8.0% |
| C002 | Hemoglobin | R+82 | 11.50 | 11.70–15.50 | -8.0% |

C002 hemoglobin at 11.5 g/dL is 0.2 below a minimum of 11.7, on L-3 and again at R+82. C004 glucose at L-92 is 100 against a maximum of 99. Those are at the edge of the printed interval. C004 at L-3 (56 mg/dL) and C003 at L-44 (62 mg/dL) are clearer pre-flight lows, and both stay in the baseline. C004's pre-flight glucose runs from 56 to 100, which is why that person's sd is 22 mg/dL and almost nothing post-flight looks extreme in z.

## Sample-handling flags

| Crew | Analyte | Draw | Value | Lab range | Change vs own mean | Rule |
|---|---|---|---:|---|---:|---|
| C002 | Glucose | R+45 | 44.0 | 65.0–99.0 | -39.7% | R+45 glucose under 50 mg/dL |
| C003 | Glucose | R+45 | 36.0 | 65.0–99.0 | -49.5% | R+45 glucose under 50 mg/dL |
| C004 | Glucose | R+45 | 43.0 | 65.0–99.0 | -46.0% | R+45 glucose under 50 mg/dL |
| C004 | Potassium | R+45 | 5.90 | 3.50–5.30 | +46.3% | R+45 potassium over 5.5 mmol/L |

## Pre-flight variation, and the synthetic glucose sd

The sd is the sample standard deviation of the L draws (n − 1). The pooled sd is the square root of the average variance, weighted by n − 1. C003's CBC analytes have n = 2. Every chemistry analyte, and the other crew's CBC, has n = 3. L-92, L-44 and L-3 are 48 days and then 41 days apart, so this is visit-to-visit scatter, not day-to-day scatter.

| Analyte | Unit | C001 | C002 | C003 | C004 | Pooled sd |
|---|---|---:|---:|---:|---:|---:|
| Absolute lymphocytes | cells/µL | 404 (18%, n=3) | 480 (21%, n=3) | 759 (29%, n=2) | 725 (34%, n=3) | 587 |
| Absolute neutrophils | cells/µL | 611 (21%, n=3) | 479 (14%, n=3) | 436 (7%, n=2) | 1317 (27%, n=3) | 834 |
| White blood cells | 10³/µL | 0.9 (15%, n=3) | 0.9 (14%, n=3) | 0.4 (4%, n=2) | 2.2 (26%, n=3) | 1.3 |
| Glucose | mg/dL | 7.37 (10%, n=3) | 4.58 (6%, n=3) | 8.14 (11%, n=3) | 22.19 (28%, n=3) | 12.59 |
| Potassium | mmol/L | 0.35 (8%, n=3) | 0.10 (3%, n=3) | 0.20 (6%, n=3) | 0.29 (7%, n=3) | 0.25 |
| Platelets | 10³/µL | 11.2 (5%, n=3) | 6.9 (3%, n=3) | 15.6 (4%, n=2) | 36.3 (14%, n=3) | 21.5 |
| Hemoglobin | g/dL | 0.42 (3%, n=3) | 0.89 (7%, n=3) | 0.78 (6%, n=2) | 0.20 (1%, n=3) | 0.61 |
| Calcium | mg/dL | 0.21 (2%, n=3) | 0.45 (5%, n=3) | 0.53 (5%, n=3) | 0.10 (1%, n=3) | 0.37 |

Glucose is the only analyte in both this file and the synthetic daily model. Pooled Inspiration4 pre-flight sd: 12.59 mg/dL (8 degrees of freedom). The four person sds are 7.37, 4.58, 8.14, 22.19 mg/dL. The synthetic crew is built with a day-to-day sd of 5.00 mg/dL for each astronaut. On the continuous 75-day draws the realized sds are c1 5.11, c2 4.85, c3 4.83.

A daily sd should be smaller than a weeks-apart sd when glucose wanders. 5 mg/dL is a little higher than C002's weeks-apart sd (4.6) and lower than C001 (7.4) and C003 (8.1). It is far below C004 (22.2), whose baseline already includes 56 and 100 mg/dL. The awkward comparison is C002: a daily sd that already matches a six-week sd is, if anything, slightly wide. It is not wide enough, on four people and three draws with two of C004's points outside 65–99, to retune. The generator was not changed. The same comparison is appended to `synthetic_crew.md`.

## The chart

`ml/results/slide_real_crew.png` is lymphocytes and glucose, one panel per person, as a percent of that person's pre-flight mean. The blue band is the printed lab range on that scale. The amber band is ±2 pre-flight SD. Amber points are inside the lab range and outside the personal band. On this chart those points are C002 glucose at R+1 and R+194. No lymphocyte point leaves the amber band. Red crosses are outside the lab range. Grey crosses are the R+45 glucose flags and are not connected.

## Caveats

- n = 4. Four people cannot carry a population claim.
- The file is pre-flight and post-flight only. There is no in-flight sample, so a landing-day value cannot be separated from what happened during the flight.
- Baselines are three draws, or two for C003's blood counts. A 2 SD line from two or three points is wide and unstable.
- The pre-flight draws are weeks apart (48 days, then 41). The sd mixes assay noise with real change over about three months. It is not the day-to-day sd the synthetic crew uses.
- Lymphocytes and neutrophils are absolute counts. Percentages were not used, because a percent moves when the other lineage moves.
- The printed reference interval is not the same for every crew member. For C003 it also changes at R+1 on several analytes (hemoglobin's interval goes from 13.2–17.1 to 11.7–15.5 g/dL). Glucose stays 65–99 and lymphocytes stay 850–3,900, so those two bands do not move. Out-of-range always uses the interval on that row.
- Fasting status is not in the file. The glucose interval 65–99 mg/dL is a fasting interval.
- The hemoglobin source column is named `hemoglobin_value_percent`. The values are g/dL. Hematocrit, which is the percent, is not in this analysis.
- C003 L-92 CBC is dropped. The evidence it is shifted, not a real count: absolute neutrophils 10.1 cells/µL beside 71.1% neutrophils, MPV 330 fL, platelets 12.9 ×10³/µL, RDW 32.4%. The CMP row from that same draw is kept (glucose 77, potassium 3.7, calcium 9.3).
- No sd floor. C002 potassium (sd 0.10 mmol/L), C004 hemoglobin (sd 0.20 g/dL) and C004 calcium (sd 0.10 mg/dL) produce |z| ≥ 2 from small absolute gaps. Those rows are in the table above and are easy to over-read.
- Codes stay codes. This file does not attach names to C001–C004.
