# Tomas: Claude Code prompts (tutor mode, you write the ML)

Run from the repo root. Your workbook is `ml/anomaly/LEARN.md`. Only start once `storm_forecast.json` and `crew_data.json` have shipped.

---
**A0 Setup (10 min, Claude builds)**
> Read CLAUDE.md, PROJECT_CONTEXT.md, ml/CLAUDE.md, ml/anomaly/CLAUDE.md (tutor mode!) and contracts/HABITAT_CONTRACT.md. Add the v2 line to contracts/CHANGELOG.md and a one-line pointer to HABITAT_CONTRACT.md at the end of DATA_CONTRACT.md. Copy contracts/habitat_telemetry.sample.json to web/public/data/habitat_telemetry.json if missing. Create config.py. Don't touch detector.py, evaluate.py or the tests. Run the tests so I see them all fail, then start the NASA download (nasa_data.py) in the background.

**A1 Learn + build the detector (≈ 1 h 30, I write it)**
> I'm doing LEARN.md steps 1 to 5 myself. Be my tutor: when I ask, explain with a tiny numeric example, give hints using the hint ladder, review my code, but don't write my TODOs unless I say "write it for me". After each step, ask me to explain it back.

(Then just talk to it while you code: "check my make_lag_features", "why is test_training_scores_are_centered failing", "explain MAD again".)

**A2 NASA data check (5 min, Claude)**
> Show me the SMAP/MSL sanity numbers (channels and labelled events per spacecraft, lengths) and plot 3 channels with their labels shaded. Give me a load_channel(chan_id) helper I can use in run_validation.py.

**A3 Tune on MSL, test once on SMAP (35 min, I write the loop), DA2 + DA4**
> Walk me through DA2 and DA4 as options with your recommendation, then let me write the tuning loop in run_validation.py myself. Review it for leakage before I run it. After I freeze the thresholds, help me write ml/results/anomaly_metrics.md and the precision/recall chart vs the static baseline.

**A4 Habitat + export (20 min, Claude builds), DA5**
> Walk me through DA5, wait for my OK, then build habitat_sim.py, export_habitat.py (using MY detector and MY frozen thresholds) and check_habitat(). Write web/public/data/habitat_telemetry.json, run validate_contracts.py and the tests, and make habitat_co2_story.png. Tell me what was caught, missed, and the CO₂ lead time.

**A5 Pitch (10 min)**
> Quiz me with the 4 questions a judge is most likely to ask about this module, and correct my answers. Then add the "Habitat watch" section to ml/results/metrics.md in my wording. Commit.
