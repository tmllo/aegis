# Habitat anomaly module: decisions log

Built unattended on 2026-11-15 (about 19:56 to 20:40 local) while Tomas was away. Tutor mode was switched off for this build. Every decision below was taken without asking him, using the recommended option in `ml/anomaly/CLAUDE.md`, and is written so he can repeat it to a judge. Numbers are copied from `ml/results/anomaly_metrics.md` and the export run.

## Setup

| # | Decision | Taken | Rejected, and why |
|---|---|---|---|
| S1 | `cabin.json` (untracked ISS Live snapshot in the repo root) | Left untracked and untouched (Tomas chose option 1) | Committing it or ignoring it: not this module's call |
| S2 | pytest was missing from `.venv` | Installed it (`pip install pytest`, test-only) | Asking first: Tomas said not to stop for questions, and all tests have to run. Nothing in the app depends on it |
| S3 | Sample JSON → `web/public/data/habitat_telemetry.json` | Copied, then overwritten by the real export | — |

## Data

| # | Decision | Taken | Rejected, and why |
|---|---|---|---|
| D-1 | Where the SMAP/MSL arrays came from | (1) The original S3 zip returned **HTTP 403**. (2) Kaggle: no credentials on this machine. (3) Used the public mirror of the same `.npy` files in the TranAD repository on GitHub (`imperial-qore/TranAD`, `data/SMAP_MSL`) | Stopping and shipping layer 2 only (brief fallback). The mirror is the same dataset: its `labeled_anomalies.csv` is the same size as the official telemanom file (3,956 bytes, 82 rows), and the loader checks **every test array's length against `num_values`** in the official labels and raises an error on any mismatch. All 82 passed |
| D-2 | Duplicate label row | SMAP channel **P-2** is listed twice, with slightly different windows (`[5350, 6575]` and `[5300, 6420]`), and there is only one array. Kept the first row. That leaves **SMAP 54 channels / 68 anomalies** (not 55/69), **MSL 27 / 36** | Keeping both: it would count one anomaly twice |
| D-3 | Which columns | Column 0 = telemetry value. The forecasters (Ridge, HGB) also get the command flags at time t as inputs. Static and IsolationForest use the value only | Using the flags in all four: the static baseline must stay a one-line rule |

## Detectors (DA1)

| # | Decision | Taken | Rejected, and why |
|---|---|---|---|
| A-1 | Candidates | All four from the brief, same protocol: (a) static 3σ on the raw value, (b) Ridge forecast-residual, (c) HistGradientBoosting forecast-residual, (d) IsolationForest on rolling-window features (last, mean, std, min, max, slope). Every score is turned into a robust z against the fit period, so one threshold grid works for all | Deep models (LSTM, as in Hundman et al.): no torch/TensorFlow allowed, too slow for tonight, and harder to explain |
| A-2 | Extra baseline row | Also report **(a′) static with its threshold tuned**. The named 3σ baseline keeps threshold 3; only its duration and merge gap are tuned | Only the fixed 3σ: too easy to beat. A judge would ask "what about a tuned threshold?", and the answer turned out to matter (see V-3) |
| A-3 | Zero-MAD guard | If a channel's MAD is 0 (step-like channels, common in SMAP), fall back to its standard deviation, then to 1e-9 | A pure 1e-9 guard: any tiny change on a flat channel becomes a huge score, which would turn into thousands of false alarms. The test file still passes |

## Protocol (DA2, DA3)

| # | Decision | Taken | Rejected, and why |
|---|---|---|---|
| P-1 | Tuning split | **Tune on MSL, test once on SMAP** ("tuned on a Mars rover, tested on an Earth satellite it never saw") | SMAP→MSL: MSL is smaller, so a weaker test. Random 50/50 channels: channels on one spacecraft are correlated, so that leaks |
| P-2 | Scoring | Event-wise, **no point-adjust, early margin 0**. A labeled anomaly is a hit if any alarm overlaps it; an alarm that overlaps no label is one false alarm. Counts pooled over channels | Point-adjusted F1 inflates scores, and people who know the field discount it. A positive early margin would need a justification we don't have |
| P-3 | Target metric | **F0.5** (precision weighted). False alarms cost crew trust: constant alarms get muted | F1 |
| P-4 | Uncertainty | 2,000 bootstrap resamples **over SMAP channels**: a CI for the winner's F0.5, and a paired CI for winner minus static 3σ | Bootstrap over events: events within a channel are not independent |

## Tuning (DA4), MSL only

| # | Decision | Taken | Rejected, and why |
|---|---|---|---|
| T-1 | Grid | Ridge L ∈ {10, 30, 60} × span ∈ {5, 10, 30}. HGB L ∈ {10, 30} × span ∈ {5, 30}. IsolationForest window ∈ {10, 30, 60}. Shared: threshold ∈ {2 … 30} (10 values), min duration ∈ {1, 3, 10}, merge gap ∈ {0, 10, 50}. Fixed before the first run | Big grid or Bayesian search: slow, and it overfits MSL's 36 anomalies |
| T-2 | Winner rule | Best MSL F0.5, ties broken by fewer false alarms | — |
| T-3 | **Winner** | **(b) Ridge, L=60, span=30, amber=30, min duration 10, gap 50.** MSL F0.5 0.76, vs HGB 0.60, IsolationForest 0.53 and static 3σ 0.33 | — |
| T-4 | Red threshold | Rule: the lowest grid cutoff above amber where ≥80% of MSL alarms with that peak score are true. Amber is already the top of the grid, so nothing qualified and the rule's fallback applied: **red = 2 × amber = 60** | Picking red by eye |
| T-5 | Optima on the grid edge | Several optima sit on the grid edge (threshold 30, gap 50, L 60, span 30). **We did not widen the grid and re-run**, because SMAP had already been scored and a second round would quietly turn it into a tuning set. Logged as a limitation | Widen and re-score: the cleaner numbers would not be honest |

## Results on SMAP (scored once)

| detector | precision | recall | F0.5 | false alarms / 10k steps | median delay (steps) |
|---|---|---|---|---|---|
| (a) static 3σ | 0.22 | 0.41 | 0.25 | 5.16 | 15.5 |
| (a′) static, tuned threshold | 0.56 | 0.41 | **0.52** | 0.92 | 16.5 |
| **(b) Ridge (winner)** | 0.43 | 0.49 | **0.44** | 1.17 | 17 |
| (c) HGB | 0.27 | 0.65 | 0.31 | 5.25 | 17.5 |
| (d) IsolationForest | 0.77 | 0.15 | 0.42 | 1.19 | 12.5 |

- V-1: Ridge beats the static 3σ baseline on the point estimate (0.44 vs 0.25; 4.4× fewer false alarms per step; 33 vs 28 anomalies caught).
- V-2: **But the 95% bootstrap CI of the difference is −0.04 to +0.49, so it includes 0.** The winner's own F0.5 CI is 0.29–0.74. The gain is likely, but not statistically clear on 54 channels.
- V-3: **A static threshold tuned on MSL the same way (threshold 30) scores 0.52 on SMAP, which beats Ridge.** Said plainly: on SMAP, the model does not beat a well-tuned one-line rule. This agrees with Wu & Keogh's critique of this benchmark (see EXPLAINED.md).
- V-4: IsolationForest's high precision is an artefact. Precision counts alarms, and it breaks a few anomalies into many short alarms (171 "true" alarms on only 10 anomalies caught).

## Habitat (DA5, layer 2, simulated)

| # | Decision | Taken | Rejected, and why |
|---|---|---|---|
| H-1 | Scenario | Defaults from the brief, **unchanged**: F1 thermal oscillation 22 Sep 13:00–17:00 (±1.2 °C, 1.5 h period); F2 leak 3–5 Oct (−0.8 kPa, repaired over 6 h); F3 CO₂ scrubber ramp from 8 Nov 06:00, accelerating (power 2) to 3.9 mmHg by 14 Nov 23:00. Nominal levels from the brief (CO₂ 2.4 mmHg with a 0.18 diurnal hump, O₂ 21.1 kPa, 101.3 kPa, 22.5 °C, 45 %RH), AR(1) noise, 0.5 % dropouts, seed 20261115 | Tuning the faults after seeing the detector's output: forbidden by the brief and by Tomas |
| H-2 | Detector inputs on the habitat | The value's own lags + **hour-of-day (sin, cos)** at time t. The crew's daily schedule plays the role that command flags play on SMAP/MSL | Other channels' values at time t: CO₂ and O₂ move together during a scrubber fault, so that would partly hide the fault |
| H-3 | Fit period | The first 14 mission days, per channel. Dropouts held at the last value for the model only; the JSON keeps `null` | — |
| H-4 | Thresholds | **Frozen from MSL: amber 30, red 60, min duration 10, gap 50. Not re-tuned on the habitat** | Re-tuning on the habitat: it would make the demo look better and mean nothing |
| H-5 | Crew links | Link table from the brief. A flag is linked if its metric is listed for the channel and its date falls between the anomaly start and (end, or today) + 3 days. Wording: "Possible environmental cause, not a diagnosis. Simulated link." | — |

**What happened (frozen detector, no changes):**
- F1 thermal: **caught**, 2 h after onset (peak score 52, amber).
- F2 leak: **missed** (peak 21, under amber 30). A slow linear leak is easy to forecast, so the forecast error stays small.
- F3 CO₂: **caught, but late.** CO₂ crossed 3.0 mmHg on 12 Nov 09:00; the model flagged on 13 Nov 00:00, so **lead time = −15 h**. The 3.0 mmHg limit rule (amber by rule, regardless of the model) would have fired first. Linked to c2's low-sleep flags (11–14 Nov).
- False alarms: **0** over 75 days × 5 channels.

**Shadow check (printed by the export, not shipped):** the static 3σ baseline with its own frozen MSL config, run on the same stream, flags F3 at 11 Nov 12:00, **21 h before** the limit. It also catches F2 (4 Oct 06:00) and misses F1, with 0 false alarms. The two detectors complement each other: the forecast-residual model catches *changes in behaviour* (oscillation), and the static rule catches *slow level drift* (leak, scrubber). **We did not switch to it or combine them tonight.** Choosing the detector after seeing its results on the demo scenario would be tuning on the test. Next step: validate "residual OR static" as one detector, tuned on MSL, on data neither has seen.

## v1 → v2: level + residual ensemble (deliberate, documented iteration, Tomas's call)

**Root cause of v1's misses.** A one-step forecast-residual detector tracks slow drifts: the forecaster adapts to the new level, so the residual stays small, and the EWMA span of 30 adds lag on top. It suits abrupt or contextual faults (spikes, oscillations, a broken daily rhythm). A level detector suits slow drifts. This is a known property of the method, and v1 confirmed it twice: on SMAP a tuned static rule beat Ridge, and on the habitat the CO₂ ramp and the leak got past the model.

| # | Decision | Taken | Rejected, and why |
|---|---|---|---|
| E-1 | Members | Level = the MSL-tuned static rule (**its tuned threshold z = 30**, min duration 1, gap 50; not 3σ). Residual = the v1 Ridge (L 60, span 30, amber 30, min duration 10, gap 50). **Configs unchanged, no new grid search** | Re-tuning the pair jointly: a new search after seeing SMAP would be more test-set reuse |
| E-2 | Combination | Event = union of both members' events, overlapping events merged. `source` = level / residual / both | Voting (both must fire): it would lose the very drifts the level rule is there for |
| E-3 | Habitat score | Per channel, max(level score / level amber, residual score / residual amber), so **1.0 = amber for both**; red = 2.0 (v1's red/amber ratio). `meta.min_duration_steps` = 1 (the shorter rule). Logged in `contracts/CHANGELOG.md`. Also added an optional `anomalies[].source` field | Keeping raw scores: two different scales in one strip |
| E-4 | **Test-set reuse** | SMAP was already scored in v1, and v2 was designed *because* of those results. **The v2 SMAP numbers are a second look at the test set.** The v1 SMAP numbers stay the clean, pre-registered result. `meta.validation.protocol` in the JSON says so | Presenting v2's SMAP numbers as held-out |

**v2 results.**

| detector | MSL F0.5 | SMAP precision | SMAP recall | SMAP F0.5 | SMAP false alarms / 10k |
|---|---|---|---|---|---|
| v2 ensemble (second look) | 0.64 | 0.38 | 0.53 | **0.40** (CI 0.30–0.66) | 2.09 |
| v1 Ridge (pre-registered) | 0.76 | 0.43 | 0.49 | **0.44** | 1.17 |
| static, tuned threshold | 0.54 | 0.56 | 0.41 | **0.52** | 0.92 |
| static 3σ | 0.33 | 0.22 | 0.41 | **0.25** | 5.16 |

- v2 catches the most SMAP anomalies (36 of 68; 25 by both members, 8 by residual only, 3 by level only), but it also adds both members' false alarms (91 = 40 level + 51 residual). Precision drops, so **F0.5 falls below v1 and below the tuned static rule**. Paired CIs: v2 − v1 −0.21 to +0.04; v2 − tuned static −0.42 to +0.01; v2 − 3σ −0.06 to +0.40.
- **Habitat: v2 changes nothing.** The level rule's MSL threshold (z = 30 on the raw value) never fires on the smooth simulated signal: CO₂ at 3.9 mmHg is only about z ≈ 11 above its baseline. MSL/SMAP channels are normalised and step-like with heavy tails, so a raw-value z threshold tuned there does not transfer to a smooth habitat sensor. The residual z transfers better, because it measures surprise rather than level. So: F1 caught 2 h after onset (residual), F2 missed, F3 flagged **15 h after** the 3 mmHg limit, 0 false alarms. Shipped anyway, per Tomas's rule (faults and thresholds untouched).
- Lesson to say out loud: in this data, simple rules are strong, and **thresholds for level rules are sensor-specific**: they should come from each sensor's own engineering limits and noise, not from another spacecraft. The honest next step is a level rule set from the habitat's own limits (as the 3.0 mmHg rule already is), validated on fresh data.

## v2 → v3: habitat-site calibration, then reverted to v1 by a pre-set rule (Tomas's call)

**Root cause addressed.** Robust-z thresholds don't carry over across domains. MSL telemetry is jumpy, so its tuned thresholds land at z ≈ 30; the cabin sensors are smooth, so CO₂ at 3.9 mmHg only reaches z ≈ 11. Real deployments calibrate on their own nominal data.

| # | Decision | Taken | Rejected, and why |
|---|---|---|---|
| C-1 | Calibration rule (fixed before any result) | Per channel and per detector: amber = **1.25 × the smallest threshold with zero events on the baseline period** (first 14 days, before any fault; same min duration); red = 2 × amber. Code: `zero_event_threshold()` in `export_habitat.py`; constants in `config.py` | Looking at the fault windows, or tuning the margin after seeing the result |
| C-2 | Kept fixed | L, span, min duration, gap from MSL; faults unchanged; normalised score (1.0 = amber) | — |
| C-3 | Safety valve (fixed before any result) | More than 3 false alarms over the mission → revert the export to v1 | Shipping a noisy detector to a crew screen |
| C-4 | `meta.validation` | Headline = v1 Ridge on SMAP (clean). v2 numbers are in the `protocol` text as the second look. v3 doesn't touch spacecraft validation | — |

**What happened.** v3 raised **19 false alarms**, all from the residual member (ppO₂ 5, temperature 5, pressure 5, RH 3, CO₂ 1; the level member raised none). The rule fired and **the shipped export is v1** (`forecast_residual_ridge_v1`, amber 30, red 60). v3's per-fault "detections" are not real: every one **started before its fault** (F1: 20 Sep vs 22 Sep; F2: 2 Oct vs 3 Oct; F3: 14 Oct vs 8 Nov, a meaningless 689 h "lead"). They are false-alarm runs, chained by the 50-step merge gap, that happened to overlap the faults. Most likely cause: 14 days (276 usable residual scores after the 60-step warm-up) can't bound the tail of the residual score over the next 61 days, and a 1.25 margin on a sample maximum is thin. We did not change the margin or the rule after seeing this.

**What ships, and what we'd do next.** The v1 export: F1 caught 2 h after onset, F2 missed, F3 flagged 15 h after the 3 mmHg limit, 0 false alarms. The hard 3.0 mmHg limit rule is always on. Next (not tonight): calibrate on a longer nominal period, or set the threshold from a target false-alarm rate (an extreme-value fit of the baseline scores) instead of the sample maximum, and validate it on a second simulated mission with different seeds before it reaches a crew screen.

## What changed in shared files
- `contracts/CHANGELOG.md`: one v2 line. `contracts/DATA_CONTRACT.md`: one pointer line at the end. `storm_forecast.json` and `crew_data.json` untouched.
- `ml/validate_contracts.py`: `check_habitat()` added; existing checks unchanged. The habitat file is now required in `web/public/data/`.
- `.gitignore`: `ml/data/`.

## Not done / known gaps
- The limits other than CO₂ are placeholders from the brief, not yet checked against NASA-STD-3001.
- Emile's UI must handle `lead_time_h < 0` (flagged after the limit) and `detected: false` (missed). Both are in the real file now.
