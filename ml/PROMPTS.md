# Tomas: Claude Code prompts, in order

Run from the repo root. Paste one prompt, finish it, check the output, then the next. If something looks off, say so in your own words; that's the point.

---
**P0 Setup (5 min)**
> Read CLAUDE.md, PROJECT_CONTEXT.md, ml/CLAUDE.md and contracts/DATA_CONTRACT.md. Set up a Python venv with requests, pandas, numpy, scikit-learn, matplotlib. Then give me a 5-line summary of what I'm building tonight and the decisions I'll have to make.

**P1 Fetch (15–20 min, mostly waiting)**
> Run ml/fetch_donki.py from 2010-01-01 to today. When it finishes, show me: flares per year, flares by class, how many have a location, number of SEP events, and positives for each candidate label. Tell me if anything looks wrong.

**P2 EDA + Parker spiral chart (30 min)**
> Do task T2 from ml/CLAUDE.md. Make: (1) storm rate by flare class, (2) storm rate by solar longitude in 30° bins from east to west, (3) storm rate with vs without a linked CME, (4) CME speed for storm vs no-storm. Save the charts to ml/results/. Explain each in 3 lines like I'm going to say it to a judge. Is the Parker spiral visible?

**P3 Labels and split (15 min), decisions D1 + D2**
> Walk me through decisions D1 and D2 in ml/CLAUDE.md. Give me the options and your recommendation, then wait for my answer before writing code. After I choose, build the modelling dataset and show class balance per split.

**P4 Models (40 min)**
> Do T4: climatology baseline, logistic regression, gradient boosting. Tune only on validation. Show validation metrics side by side (hit rate, false alarms per month, Brier skill vs climatology) and feature importances. Explain why the best one wins. Don't touch the test set yet.

**P5 Thresholds + final test (25 min), decisions D3 + D4**
> Walk me through D4: plot hit rate vs false alarms per month on validation and help me pick watch and warning thresholds. Then freeze the model and evaluate ONCE on the test period. Show the test metrics, a reliability plot, and what happened during 5–20 May 2024 flare by flare: probability, alert, actual storm, lead time.

**P6 Export the real forecast (15 min)**
> Export web/public/data/storm_forecast.json exactly per contracts/DATA_CONTRACT.md (meta with real test metrics and feature importances, all test events with split "test"). Run ml/validate_contracts.py. Then tell me the three headline numbers for the pitch, worded honestly.

**P7 Crew baseline logic (30 min), decision D5**
> Do T6. Walk me through D5 first and wait for my choices. Then implement the flag logic, keep the planted demo scenarios (c1 heart amber, c2 sleep/brain, c3 green with a past storm dose), regenerate web/public/data/crew_data.json, and validate.

**P7b Synthetic crew upgrade (30 min), decision D6. Only after P6 has shipped**
> Upgrade make_sample_data.py: replace the independent Gaussian draws with AR(1) daily persistence and correlated noise across metrics (a Gaussian copula with a correlation matrix I'll approve: sleep↔mood positive, sleep↔hr negative, hr↔bp_sys positive). Keep the planted demo scenarios. Add a fidelity report (means and sds vs the stated ranges, the correlation matrix, lag-1 autocorrelation) to ml/results/synthetic_crew.md. Ask me before choosing the correlation values. Regenerate web/public/data/crew_data.json and validate.

**P8 Pitch material (30 min)**
> Write ml/results/metrics.md with: what the model predicts, the data (years, counts), the split, the test metrics vs climatology, the May 2024 story with lead times, the limitations (few storms, label noise, no real astronaut data), the synthetic crew fidelity results if P7b is done, and 3 clean charts for slides (Parker spiral, hit rate vs false alarms, May 2024 timeline). Keep the wording honest; no hype numbers.

---
**If you're stuck or behind:** skip P7b first, then P7 (the sample crew logic already works), and go straight to P8.
