# LEARN.md: build the anomaly detector yourself (~2.5 h)

You write the ML. Claude Code builds the plumbing (data download, habitat sim, JSON export) and acts as your tutor: it explains, hints and reviews, but won't write your functions unless you say "write it for me".

Feedback loop for every step: `python -m pytest ml/anomaly/tests -q`. Make the step's tests go green before moving on.

---

## Step 0. The idea (5 min, read only)
A sensor behaving normally is **predictable** from its own recent past. So:
1. Train a model to predict the next value from the last `L` values, on normal data only.
2. On new data, measure how wrong the prediction is (the **error**).
3. If the error stays unusually large for a while, behaviour has changed. That's an anomaly.

Why not simply "value above X"? A slow drift (a failing CO₂ scrubber) can stay below the limit for days while already being abnormal. Catching it **before** the limit is the whole point. Same story as the radiation module: warn before the damage.

> Explain back: why does a forecast error catch a drift earlier than a fixed limit does?

## Step 1. Lag features (15 min) → `make_lag_features`
Models like Ridge take a table: rows = examples, columns = inputs. A time series isn't a table yet, so you **slide a window**: each row is the last `L` values, the target is the next one.
```
x = [0, 1, 2, 3, 4], L = 2
X = [[0,1], [1,2], [2,3]]    y = [2, 3, 4]
```
`exog` = extra inputs known at the moment you predict (SMAP/MSL command flags, or other cabin sensors). Append `exog[t]` to the row predicting `x[t]`.

Tests: `test_lag_features_example`, `test_lag_features_with_exog`.
> Explain back: what are the rows, the columns and the target? Why can't `exog` come from the future?

## Step 2. Forecast + error (25 min) → `fit`, `_smoothed_error`
- **StandardScaler**: puts every column on the same scale so regularisation treats them fairly.
- **Ridge**: linear regression with a penalty (`alpha`) that stops the weights from exploding when columns are correlated (lags always are). Fast, stable, explainable.
- **Absolute error** `|y − ŷ|`, then **EWMA smoothing** (`span`): one bad point is noise; a run of bad points is a signal. Bigger span = calmer but slower to react. That trade-off is yours to tune later.
- Fit on **train only**. If the model sees the anomaly during training, it learns to predict it and stops flagging it. That's leakage.

> Explain back: what does `span` trade off? What goes wrong if you fit on the test data?

## Step 3. Robust z-score (20 min) → finish `fit`, `score`
You need "how unusual is this error?" in units that mean the same on every sensor. A z-score does that, but mean and sd get dragged by the anomalies themselves. So use the **median** and the **MAD** (median absolute deviation), with ×1.4826 so MAD ≈ sd for normal data:
```
z = (error − median_train) / (1.4826 · MAD_train)
```
Errors on the training data → median 0. A z of 4 means "4 robust standard deviations above normal error".

**Why this matters for the pitch:** z has no units. A threshold tuned on Mars rover telemetry means the same thing on cabin CO₂. That's what lets you validate on real NASA data and deploy on the habitat.

Also write `StaticThreshold` (the same robust z, but on the raw value instead of the error). It's the baseline you must beat.

Tests: `test_score_shape_and_nan_padding`, `test_training_scores_are_centered`, `test_detects_spike_and_drift_not_noise`, `test_static_threshold`.
> Explain back: why median/MAD instead of mean/sd? Why does a unit-free score transfer across sensors?

## Step 4. From scores to events (15 min) → `to_events`
Operators don't want 200 red timesteps, they want "one event from 14:00 to 19:00". Rules: above threshold, lasting at least `min_duration` steps (kills single-point blips), merge events separated by ≤ `gap` steps.

Test: `test_to_events_examples`.

## Step 5. Honest evaluation (20 min) → `evaluate.py`
- **Event-wise**: a labelled anomaly is caught if any alarm overlaps it; an alarm overlapping nothing is a false alarm.
- **No point-adjust** (a common trick that counts the whole anomaly as caught after one lucky point; it inflates scores).
- **F0.5** weights precision more than recall: constant false alarms get muted by crews, and a muted alarm catches nothing.
- **Delay**: how many steps after the true start you fired. Negative = early (inside the allowed early margin).

Tests: `test_event_metrics_hand_example`, `test_early_margin`, `test_edge_cases_and_rate`. **All 10 green → your detector is done.**
> Explain back: why F0.5 and not accuracy? What is point-adjust and why don't we use it?

## Step 6. Real NASA data: tune on Mars, test on Earth (35 min) → `run_validation.py`
Claude Code downloads SMAP/MSL and gives you a loader. You write the loop:
1. For each **MSL** channel: fit on its train array, score its test array, build events, compare to its labels. Sum TP/FP/FN across channels → precision, recall, F0.5.
2. Try a small grid (`threshold` 3–8, `span` 5/10/20, `L` 20/50). Pick the best F0.5 **on MSL only** (decisions DA2–DA4).
3. Freeze. Run **once** on **SMAP**. Do the same for `StaticThreshold`. Save thresholds to `ml/results/anomaly_thresholds.json`.
4. Write down the honest one-liner, even if the baseline wins.

Why split by spacecraft: tuning and testing on the same data is grading your own exam. MSL → SMAP is the strongest honest claim: "tuned on a Mars rover, tested once on a satellite it never saw."
> Explain back: what would be dishonest about tuning thresholds on SMAP and reporting SMAP?

## Step 7. Habitat + story (20 min, mostly Claude's plumbing)
Claude Code runs your frozen detector on the simulated habitat and writes `habitat_telemetry.json`. Your job: check the result makes sense (each planted fault caught or not, CO₂ lead time, false alarms) and approve the scenario (DA5). Then write your 20-second demo line in your own words.

---
**If you run out of time:** after 15 min stuck on any one function, ask Claude Code "write it for me" for that function only, and make sure you can explain it afterwards. Don't skip Step 5's honesty or Step 6's split; those are what make this credible.
