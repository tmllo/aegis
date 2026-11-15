# CLAUDE.md for /ml/anomaly: habitat anomaly detection (Tomas)

Read first: `../../CLAUDE.md`, `../../PROJECT_CONTEXT.md`, `../CLAUDE.md`, `../../contracts/HABITAT_CONTRACT.md`.

We are adding **one** module to the AEGIS backend: an anomaly detector for habitat life-support telemetry that flags drift **before** a hard limit is breached and links it to crew health flags.

## TUTOR MODE: who writes what (read this twice)
**Tomas writes the ML himself. You are his tutor and his plumber, not the author of the model.**
- **Tomas writes:** every `TODO(Tomas)` in `detector.py` and `evaluate.py`, the tuning loop in `run_validation.py`, and the threshold choices. His workbook is `ml/anomaly/LEARN.md`.
- **You write (plumbing, not the learning part):** `config.py`, `nasa_data.py` (download + loading), `habitat_sim.py`, `export_habitat.py`, `check_habitat()` in `validate_contracts.py`, plotting helpers, the CHANGELOG line.
- **On Tomas's files you may:** explain a concept (short, with a tiny numeric example), give a hint, point to the exact line that's wrong and say why, suggest what to print to debug, and review his code when he asks. **You may not** write or paste the implementation of a `TODO(Tomas)` function, even partially, unless he explicitly says "write it for me" (then do it and mark it in a comment `# written by Claude at Tomas's request`).
- **Hint ladder** when he's stuck: (1) a question that points at the issue → (2) the concept + a 3-line numeric example → (3) pseudocode in plain words → (4) only on request, the code.
- **Never edit `tests/test_anomaly.py`** to make it pass. The tests are his feedback loop.
- After each step he completes, ask him to explain it back in 2–3 lines, and correct him gently if it's off. That explanation is what he'll say to a judge.
- Same rules as `ml/CLAUDE.md`: decisions DA1–DA5 are his (give 2–3 options + a recommendation, wait), no training-set metrics, small rerunnable scripts. He talks casually: extract the intent, don't ask him to rephrase.

## Context you must not get wrong
- **This is not a separate Space Apps challenge.** None of the 14 official 2026 challenges covers spacecraft anomaly detection. It is a feature of our entry ("Create Health Monitoring Software for Astronauts on Space Missions"), justified by NASA's "hostile closed environment" hazard. Everything here must lead back to crew health. If a feature doesn't, cut it.
- **Two layers, both honest:**
  1. **Proof (real data):** the detector is tuned and tested on **NASA JPL SMAP + MSL labeled telemetry** (Hundman et al., KDD 2018: 82 channels, 105 labeled anomaly sequences, 69 SMAP / 36 MSL).
  2. **Product (simulated):** the same frozen detector runs on a **simulated habitat** stream (CO₂, O₂, pressure, temperature, humidity) with planted faults, and its anomalies are linked to the simulated crew.
- Never imply the habitat stream is real or that the CO₂ → sleep link is evidence. It is a planted scenario that illustrates a documented NASA concern.
- **Clock:** deadline 23:59 tonight. The storm forecast and crew exports ship first. This module is time-boxed to **~2.5 h** (Tomas is learning as he builds). If a step overruns by 50%, take the fallback in the "If behind" section.

## Deliverables
1. `ml/anomaly/` package (structure below), runnable with two commands.
2. `ml/results/anomaly_metrics.md` + 2 PNGs (`anomaly_pr_vs_baseline.png`, `habitat_co2_story.png`).
3. `web/public/data/habitat_telemetry.json` exactly per `contracts/HABITAT_CONTRACT.md`.
4. `validate_contracts.py` extended with `check_habitat()` (additive; existing checks untouched).
5. One line in `contracts/CHANGELOG.md` (v2: added habitat_telemetry.json, additive).

## Structure (keep it this small)
```
ml/anomaly/
  __init__.py
  config.py           # Claude: paths, seeds, channel list, link table, constants. No magic numbers elsewhere
  nasa_data.py        # Claude: download + load SMAP/MSL, parse labeled_anomalies.csv
  detector.py         # TOMAS (skeleton provided): lag features, ForecastResidualDetector, StaticThreshold, to_events
  evaluate.py         # TOMAS (skeleton provided): overlaps, event_metrics, false_alarms_per_10k
  habitat_sim.py      # Claude: simulated habitat stream + planted fault schedule (seeded, deterministic)
  run_validation.py   # TOMAS writes the tuning loop; Claude provides the loading/plot/report helpers
  export_habitat.py   # Claude: fit on baseline period, score, build events, link crew flags, write JSON
  LEARN.md            # Tomas's workbook
  tests/test_anomaly.py   # provided, verified against a reference solution. Never edit
```
Commands:
```
python -m ml.anomaly.run_validation
python -m ml.anomaly.export_habitat
python ml/validate_contracts.py
python -m pytest ml/anomaly/tests -q
```
Dependencies: numpy, pandas, scikit-learn, matplotlib (already in the venv). **No torch/TensorFlow.** Ask before adding anything.

## Data (layer 1)
- Labels: `https://raw.githubusercontent.com/khundman/telemanom/master/labeled_anomalies.csv` (checked live: 82 rows, columns `chan_id,spacecraft,anomaly_sequences,class,num_values`; `anomaly_sequences` is a string list of `[start, end]` index pairs in the **test** array).
- Arrays: `data/train/<chan>.npy` and `data/test/<chan>.npy`, shape `(n_steps, n_features)`; **column 0 is the telemetry value**, the rest are one-hot command flags.
- Download, in order: (1) the original zip `https://s3-us-west-2.amazonaws.com/telemanom/data.zip` (legacy link, not verified tonight); (2) Kaggle: `kaggle datasets download -d patrickfleith/nasa-anomaly-detection-dataset-smap-msl` (needs `~/.kaggle/kaggle.json`); (3) if both fail, stop and ask Tomas. Store under `ml/data/nasa_smap_msl/` (git-ignored).
- Sanity print: channels per spacecraft (55/27), events per spacecraft (69/36), train/test lengths. Note: some sources list a duplicate MSL channel; dedupe by `chan_id`, log it.

## The detector (one class, both layers)
`ForecastResidualDetector` (recommended default for DA1):
1. **Forecast:** predict `x[t]` from the previous `L` values of the channel (+ the command columns at `t` for SMAP/MSL; + the other habitat channels' lags for the habitat). Ridge regression, standardized inputs. Fit on the **train** split only (SMAP/MSL) or the **baseline period** only (habitat, first 14 mission days).
2. **Error:** `e[t] = |x[t] − x̂[t]|`, smoothed with an EWMA (span `S`).
3. **Score:** robust z of the smoothed error against the fit period: `(e_s − median) / (1.4826·MAD)`. Scores are unit-free, so thresholds transfer across channels and spacecraft. That is the whole reason this design works for layer 2.
4. **Events:** score ≥ `amber` for ≥ `min_duration_steps` → event; merge events closer than `gap` steps; severity per the contract.
API: `fit(X_train) → self`, `score(X) → np.ndarray`, `to_events(scores, times) → list[dict]`. Pure functions where possible, no global state, seeds in `config.py`.

Baseline to beat (`StaticThreshold`): flag when `|x − median_train| > 3·1.4826·MAD_train` on the raw value, same event logic. If the model doesn't beat this on SMAP, **say so** in metrics.md. That's still a result.

## Evaluation protocol (non-negotiable)
- **Event-wise, no point-adjust.** A labeled sequence is a TP if any predicted event overlaps it (allow an early margin of `E` steps before the labeled start, set in DA3). Each predicted event that overlaps no label is one FP. Point-adjusted F1 inflates scores and judges who know the field will discount it.
- Report: precision, recall, **F0.5** (false alarms cost crew trust, so we weight precision), false alarms per 10k steps, median detection delay (steps from labeled start to first detection, hits only).
- **Split by spacecraft:** tune every hyperparameter and threshold on **MSL**, then evaluate **once** on **SMAP** (recommended in DA2). Pitch line: "tuned on a Mars rover, tested on an Earth satellite it never saw."
- Known critique to pre-empt: Wu & Keogh (2021) showed SMAP/MSL contains trivially detectable and mislabeled anomalies. Our answer: we report against a trivial baseline, use event-wise scoring, and don't claim state of the art.

## Habitat simulation (layer 2)
- Hourly, `mission.start_date` 00:00Z → `mission.today` 23:00Z (read both from `web/public/data/crew_data.json`, never hardcode). Seeded.
- Nominal behaviour: diurnal cycle tied to crew activity (CO₂ and temperature rise in the waking day), AR(1) sensor noise, occasional `null` dropouts (~0.5%).
- Nominal levels (working numbers, verify before they reach a slide): ppCO₂ ≈ 2.2–2.7 mmHg; ppO₂ ≈ 21 kPa; pressure ≈ 101.3 kPa; temperature ≈ 22–23 °C; RH ≈ 40–50 %.
- Limits in `config.py`, mirrored in the JSON `channels.*.limits/absolute_red`. CO₂ operational limit 3.0 mmHg = NASA-STD-3001 Vol 2 Rev C 1-hour average limit; CO₂ absolute red 5.3 mmHg = the older 180-day SMAC. The other limits are placeholders to verify (ppO₂ 19.5–23.1 kPa, pressure, temp 18.3–26.7 °C, RH 25–75 %).
- Planted faults (DA5 approves exact dates and magnitudes; defaults):
  | id | channel | window | shape | crew link |
  |---|---|---|---|---|
  | F1 | temp_c | 2026-09-22, ~4 h | thermal loop oscillation (contextual) | none |
  | F2 | cabin_pressure_kpa | 2026-10-03 → 10-05 | slow leak, −0.8 kPa, then repaired | none |
  | F3 | ppco2_mmhg | 2026-11-08 06:00 → ongoing | scrubber degradation, slow accelerating ramp to ~3.9 mmHg by `today` | **c2 sleep_h** (flags from 11-10) |
- F3 is the demo: the ramp must cross 3.0 mmHg **after** the detector fires, so the lead time is real for this run, not tuned by hand. Don't tweak the fault to flatter the model; tweak it once for realism (DA5), then freeze.
- Link table (`config.py`): `ppco2_mmhg → [sleep_h, mood]`, `ppo2_kpa → [hr]`, `cabin_pressure_kpa → [hr]`, `temp_c → [sleep_h, temp]`, `rh_pct → []`.

## Export (`export_habitat.py`)
1. Load `crew_data.json` (mission dates, flags), generate the habitat stream, fit the detector on `baseline_period`, score everything with the **thresholds frozen from run_validation** (read from `ml/results/anomaly_thresholds.json`, never re-tuned on the habitat).
2. Build `anomalies`: detected events + undetected planted faults (`detected: false`) + mark `planted` by overlap with the fault schedule. Compute `limit_crossed_at`, `lead_time_h`, severity, status, messages and actions (from `channels.*.actions`).
3. Link crew flags per the contract rule. Wording: "possible environmental cause".
4. Write JSON (round values, `null` not NaN), copy `meta.validation` from run_validation's output, then run `validate_contracts.py`.
5. Chart `habitat_co2_story.png`: CO₂ line, 3.0 mmHg limit, score strip, detection marker, limit-crossing marker, c2's nightly sleep on a second panel. This is the slide.

## Decision points (ask Tomas, recommend, wait)
- **DA1 Detector:** Ridge forecast-residual (recommended: explainable, fast, transfers via robust z) vs IsolationForest on rolling-window features (no forecast, weaker on slow drifts) vs HistGradientBoosting forecaster (stronger, slower, harder to explain).
- **DA2 Tuning split:** MSL→SMAP (recommended) vs SMAP→MSL vs 50/50 random channels (weaker claim; channels on one spacecraft are correlated).
- **DA3 Scoring:** early margin `E` (recommend 0, or a small value justified in one sentence), F0.5 vs F1 as the tuning target (recommend F0.5).
- **DA4 Thresholds:** `amber`, `red`, `min_duration_steps`, `L`, `S`, `gap`, from a small grid on MSL only. Show the precision/recall trade-off plot and frame it like the storm thresholds: "a missed scrubber failure costs more than a false check, but constant false alarms get muted."
- **DA5 Habitat scenario:** approve nominal levels, fault dates/magnitudes, the link table.

## Tests
`tests/test_anomaly.py` is provided (10 tests: lag features, score shape and centring, spike/drift detected but noise not, static baseline, event building, event-wise metrics incl. early margin and edge cases). They pass on a reference solution and fail on the skeleton. Run with `python -m pytest ml/anomaly/tests -q` from the repo root. You may add tests for your own plumbing (e.g. export passes `check_habitat()`, every planted fault appears in `anomalies`) in a separate file.

## `check_habitat()` (add to validate_contracts.py)
Required meta keys; channel keys exactly the five; `body_region` valid; series times strictly increasing, ISO `Z`, covering crew mission dates; no NaN; every `score` object has the five keys; anomaly `severity ∈ {amber, red}`, `status ∈ {active, resolved}`, `lead_time_h` consistent with the two timestamps; every `linked_crew_flags.crew_id` exists in crew_data and its dates match real flags; warn if `model` contains FAKE.

## If behind (in this order)
0. If Tomas is stuck on one function for more than 15 min, go up the hint ladder faster; offer "write it for me" for that one function only.
1. Drop F1 and the RH channel's extra polish; keep F2 + F3.
2. Skip the DA4 grid: use `L=30, S=10, amber=4, red=7, min_duration=3`, state it's untuned, still test once on SMAP.
3. If the NASA download fails after 15 min: ship layer 2 only, set `meta.validation` fields to `null`, and say on the slide "validation on NASA SMAP/MSL in progress". **Do not** invent validation numbers.
4. Never cut the honesty labels or the contract validation.

## What to say to a judge (draft; Tomas rewrites in his words)
"Crew health isn't only the body: the habitat is the fourth crew member. Our detector learns each sensor's normal behaviour and flags drift before it hits a safety limit. We tuned it on NASA's Mars rover telemetry and tested it once on a satellite it never saw. In the mission sim, it caught a failing CO₂ scrubber X hours before the limit, and linked it to the engineer whose sleep had collapsed. The habitat stream is simulated; the validation is real NASA data."
