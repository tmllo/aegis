# AEGIS: NASA Space Apps 2026 starter kit

Crew health monitor with a radiation storm early-warning. **Start with `PROJECT_CONTEXT.md`.**

## What's in here
| File | For | What |
|---|---|---|
| `PROJECT_CONTEXT.md` | both (humans + agents) | product, demo script, split, timeline, done criteria, rules, facts to verify |
| `CLAUDE.md` | both agents | shared rules (Claude Code reads it automatically) |
| `contracts/DATA_CONTRACT.md` | both | the exact shape of the two JSON files: the only interface between you |
| `contracts/*.sample.json` | Emile | realistic sample data to build against right now |
| `ml/CLAUDE.md`, `ml/PROMPTS.md` | Tomas | context for your Claude Code + prompts P0–P8 in order |
| `ml/fetch_donki.py` | Tomas | pulls NASA DONKI flares/CMEs/radiation storms → `data/processed/flares.csv` (tested on mock data; first real run tonight) |
| `ml/make_sample_data.py` | Tomas | simulated crew (planted demo scenarios) + FAKE forecast in the right shape |
| `ml/validate_contracts.py` | Tomas | run before every export: catches shape errors before Emile's app breaks |
| `web/CLAUDE.md`, `web/PROMPTS.md` | Emile | context for his Claude Code + prompts E0–E7 in order |
| `web/public/data/*.json` | both | the files the app reads. Sample now, real after Tomas exports |

## First 15 minutes
1. Tomas: create a GitHub repo, push this folder, invite Emile. Add Emile to the team on spaceappschallenge.org.
2. Both: read `PROJECT_CONTEXT.md` (5 min).
3. Tomas: `cd` to the repo, open Claude Code, paste `ml/PROMPTS.md` → P0.
4. Emile: `cd web`, open Claude Code, paste `web/PROMPTS.md` → E0.
5. Agree a check-in time (suggested 21:00, when the real `storm_forecast.json` lands).

```bash
pip install requests pandas numpy scikit-learn matplotlib
python ml/fetch_donki.py --start 2010-01-01     # ~15-20 min, cached so reruns are instant
python ml/make_sample_data.py                    # regenerate samples
python ml/validate_contracts.py                  # check web/public/data/*.json
```
