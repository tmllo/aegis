# server/: the e^x data core

One normalized backend. Store each fact once, compute everything else. Design: `docs/backend/DATA-CORE.md`.

```
catalog/   what exists        metrics.yaml · subjects.yaml · sources.yaml · mission.yaml · models.yaml
core/      the rules of the   records.py (the only record types) · catalog.py (load + check) · store.py (SQLite, validated writes)
           game
adapters/  sources -> records simcrew · ml_forecast · osdr · isslive (snapshot now, live in S3)
engine/    derived            scoring.py (crew alert rule, once) · labs.py (Inspiration4 baselines)
views/     records -> outputs contract_v1.py (the 3 JSON files the app reads, same shape)
build.py   runs it all        adapters -> store -> engine -> views
probes/    standalone checks  iss_cabin_probe.py (see the live ISS cabin feed)
tests/     golden + integrity
```

## Run
```
pip install -r server/requirements.txt
python -m server.build                 # rebuild and compare with web/public/data (all 3 must say "identical")
python -m server.build --write-app     # overwrite web/public/data/*.json once the check passes
python -m pytest server/tests -q
```

## Lego rules
| You want to | Do this | Touch nothing else |
|---|---|---|
| Add a source | Entry in `catalog/sources.yaml`, its metrics in `catalog/metrics.yaml`, one file in `adapters/`, one line in `ADAPTERS` (`build.py`) | Store, engine, views |
| Add a metric | Entry in `catalog/metrics.yaml` (unit, hazard, body region, rule, explain, actions) | Code, unless it needs a new rule type |
| Add a screen's data | Query the store in a new `views/` file (or the generic API in S4) | Adapters |
| Change the alert rule | `engine/scoring.py` + `catalog/mission.yaml` constants; golden test must pass, then `web/src/core/scoring.ts` | Adapters, views |
| Change a JSON shape | `contracts/CHANGELOG.md` first, agree with Emile, then `views/contract_v1.py` | Store |

Arrows only go right: an adapter never scores, a view never fetches, the engine never formats output.

## Known gaps
- The Inspiration4 adapter reads the raw values out of `real_crew.json` until `data/real/cmp.csv` and `cbc.csv` are committed. With the CSVs present it reads them directly (same output).
- `sources.yaml` `osdr.synthetic_comparison` (simulated glucose day-to-day sd) is copied from `ml/results/synthetic_crew.md`, not recomputed.
- Habitat dose rates are still the hand-set working values (`subjects.yaml`, `assumed_dose_mSv_day`) until the HAPI adapter lands (S3).
