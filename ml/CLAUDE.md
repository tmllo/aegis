# CLAUDE.md for /ml (Tomas's workstream)

You are helping **Tomas** build the data + ML half of AEGIS (see `../PROJECT_CONTEXT.md`).
Tomas has a business and data-analytics background and is moving into a technical career. **This workstream is where he learns ML properly.** Speed matters (deadline tonight ~21:00 for the first real export), but he must understand and own every modelling decision.

## How to work with Tomas
- At each **decision point (D1–D5 below), stop and ask him**. Give 2–3 options with the trade-off in plain language and your recommendation. Don't decide silently.
- After each step, give a 3-line "what this shows" explanation he could repeat to a judge.
- He talks casually and fast. Extract the intent and execute; don't ask him to rephrase.
- Keep code in small scripts/notebooks he can rerun top to bottom. No hidden state.
- Never report training-set performance as a result.

## Inputs
- `ml/fetch_donki.py` (provided, tested on mock data): pulls DONKI FLR/CME/SEP and writes `data/processed/flares.csv` (+ `cmes.csv`, `seps.csv`). Columns include `class_flux`, `latitude_deg`, `longitude_deg` (west positive), `has_linked_cme`, `cme_speed_kms`, `cme_half_angle_deg`, `active_region`, and candidate labels `sep_linked`, `sep_within_24h`, `sep_within_72h` (+ onset times), plus `sep_in_prior_48h`.
- `ml/make_sample_data.py`: simulated crew + FAKE storm forecasts (shape only).

## Outputs (must match `../contracts/DATA_CONTRACT.md` exactly)
- `web/public/data/storm_forecast.json`
- `web/public/data/crew_data.json`
- `ml/results/metrics.md` + 3 PNG charts for the pitch deck
- Validate before shipping: `python ml/validate_contracts.py`

## Tasks
- **T1 Fetch:** run `python ml/fetch_donki.py --start 2010-01-01`. Sanity checks: flares per year (should follow the solar cycle, peaking around 2014 and 2024–25), share of flares with a location, number of SEP events. If the API errors, retry, or use the fallback (`NASA_API_KEY` env var from api.nasa.gov).
- **T2 EDA:** storm rate by flare class (C/M/X) and by longitude bin (e.g. 30° bins, east → west); CME linked vs not; CME speed. Make the **Parker spiral chart**: storm rate vs solar longitude. Western flares should dominate. This chart goes in the deck.
- **T3 Labels + split (D1, D2).**
- **T4 Models:** (a) climatology baseline = predict the historical storm rate for every flare; (b) logistic regression on log10(class_flux), longitude features, has_linked_cme, log CME speed; (c) gradient boosting (sklearn `HistGradientBoostingClassifier`, which handles NaN natively). Use class weights or nothing, **not** SMOTE.
- **T5 Evaluate + thresholds (D3, D4):** on the test period only.
- **T6 Crew baseline logic (D5):** replace `flag_series` in `make_sample_data.py` (or write `ml/crew_flags.py`) and regenerate `crew_data.json`.
- **T6b Synthetic crew upgrade (only after T7's storm export has shipped):** replace the independent Gaussian draws in `make_sample_data.py` with AR(1) daily persistence + correlated noise across metrics (Gaussian copula / Cholesky of a correlation matrix, decision D6). Keep the planted scenarios. Write a fidelity report to `ml/results/synthetic_crew.md`: means and sds vs stated ranges, the correlation matrix, lag-1 autocorrelation per metric. Write it fresh; don't copy P Stone team code.
- **T7 Export + pitch numbers:** write `storm_forecast.json` (all test events with `split: "test"`; train events optional with `split: "train"`), `metrics.md`, charts.

## Decision points (ask Tomas)
- **D1 Label:** `sep_linked` (curated by DONKI analysts, causal, may miss some) vs `sep_within_72h` (time window, catches more but includes storms caused by other flares) vs a combination. Also: drop or keep flares with `sep_in_prior_48h` (already inside a storm)? Recommend: `sep_linked` as the main label, report the window label as a robustness check.
- **D2 Split:** must be **by time**, never random. Storms cluster (May 2024 had a dozen linked events), so a random split leaks. Recommend: train ≤ 2021, validation 2022–2023 (for tuning thresholds), test 2024 → today (contains the May 2024 replay). Don't touch test until the model is frozen.
- **D3 Metrics:** accuracy is meaningless (storms are a small share of flares). Report on test: hit rate (recall) of storms, false alarms per month, precision, median lead time (flare peak → storm onset, for hits), Brier skill score vs climatology, and a reliability (calibration) plot.
- **D4 Thresholds:** pick `watch` and `warning` on the **validation** set from the trade-off between catching storms and false alarms. Frame it as a mission decision: "a missed storm is far worse than an unnecessary hour in the shelter."
- **D5 Baseline alerts:** baseline window (first 14 days?), rolling window (3-day mean?), amber/red z thresholds, robust stats (median/MAD) vs mean/sd, and low-side-only metrics. Must stay consistent with the client-side rule in the contract.

- **D6 Synthetic crew correlations:** propose a correlation matrix with plain-language reasoning (sleep↔mood positive, sleep↔resting HR negative, HR↔systolic BP positive, the others near 0) and AR(1) coefficients per metric (vitals ~0.5–0.7, mood ~0.6). Tomas approves the values. Keep the matrix positive definite.

## Physics in one paragraph (for explanations)
Solar energetic particles are charged and travel along the Sun's magnetic field, which the solar wind drags into a spiral (the Parker spiral). Field lines from the Sun's **western** hemisphere (as seen from Earth) connect to Earth, so particles from western flares reach us easily and quickly, while eastern events rarely do. Big, fast CMEs drive shocks that accelerate particles too. So the expected strong features are flare size, western longitude, and a fast linked CME. If the model's importances show this, say "the model rediscovered the Parker spiral."

## Known gotchas
- DONKI `linkedEvents` can be `null`. Flares can link to several SEPs; CME speed comes from the "most accurate" analysis.
- Some flares have no `sourceLocation`. Keep them with NaN longitude; gradient boosting handles it. For logistic regression, impute and add a missing flag.
- Lead time can be negative or tiny for a time-window label; report the median over hits only.
- The fake sample file has `model: FAKE_SAMPLE_DO_NOT_PRESENT`. Make sure the real export replaces it.
