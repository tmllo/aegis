# e^x data core: one normalized backend

Written 2026-11-15 ~02:40 CET by Tomas + Claude. Supersedes section 3 of `BACKEND-PLAN.md` (build order); sections 1, 2, 5 still hold.

## Summary
| | |
|---|---|
| Problem today | Every pipeline invents its own shape. Metric definitions live inside `crew_data.json` (written by `make_sample_data.py`), the scoring rule exists three times (`ml/crew_flags.py`, `web/src/core/scoring.ts`, `docs/analysis/alert_testbench.py`), dose rates are typed by hand, sources are only listed in research notes, and each new feed would add a new file format |
| Fix | Same idea as database normalization: **store each fact once, compute everything else.** One catalog says what exists (metrics, subjects, sources). One store holds raw facts in four record types. One engine derives scores and forecasts. Views turn that into whatever the frontend needs |
| Frontend impact | None. The three contract files are rebuilt from the store, same shape, and Emile's radiation screen (commit 877dc9d) keeps working. New screens get a generic API instead of new files |
| Adding a new source | One catalog entry + one adapter file. Nothing downstream changes |
| Adding a new screen | Usually nothing (query the generic API). At most one new view |

## 1. The layers
```
SOURCES            ADAPTERS            STORE (facts)              ENGINE (derived)        VIEWS (outputs)
DONKI       ──►  donki.py    ─┐                                                      ┌─► crew_data.json      (contract v1)
NOAA SWPC   ──►  swpc.py     ─┤      observation  (long format)    scoring.py  ─────►├─► storm_forecast.json (contract v1)
ISS Live!   ──►  isslive.py  ─┤ ──►  event        (flare, CME, SEP) forecast.py ─────►├─► real_crew.json      (contract v1)
CCMC HAPI   ──►  hapi.py     ─┤      event_link                     dose.py     ─────►├─► /api/observations, /api/events,
OSDR CSVs   ──►  osdr.py     ─┤      run          (fetch log)       ▼                 │   /api/catalog, /api/now
Sim crew    ──►  simcrew.py  ─┤                                    forecast + assessment├─► /ws/bus (live events)
Check-in    ──►  checkin.py  ─┘         ▲ validated against ▲       (stored, recomputable)└─► export: web/public/data/*.json (offline demo)
                                   CATALOG: metric · subject · source (YAML, the single source of truth)
```
Rule: arrows only go right. An adapter never computes a score; a view never fetches a feed; the engine never formats JSON for a screen.

## 2. Catalog (what exists): `server/catalog/*.yaml`
| File | One entry per | Fields |
|---|---|---|
| `metrics.yaml` | measurable thing | `key` (namespaced: `vital.bp_sys`, `lab.lymph_abs`, `cabin.ppco2`, `dose.daily`, `sw.goes_p10`), `label`, `unit` (UCUM), `kind` (vital, lab, cabin, dose, space_weather), `hazard` (one of NASA's five), `body_region` (brain, heart, blood, bones, whole_body or none), `rule` (`baseline_z` with `low_side_only`, or `absolute_bands`, or `display_only`), `absolute_red`, `explain`, `how_to_measure`, `actions.amber/red`, `loinc` (only if verified), `contract_key` (the old name in `crew_data.json`, e.g. `bp_sys`) |
| `subjects.yaml` | thing that is measured | `id`, `kind` (`crew_sim`, `crew_real`, `habitat`, `star`), `label`, `located_in` (crew → habitat), `real` (bool). Examples: `c1` Ana (crew_sim, in `moon_base`), `i4-c001` (crew_real), `iss` (habitat, real), `moon_base` (habitat, simulated), `mars_surface` (habitat, real dose via Curiosity), `sun` |
| `sources.yaml` | origin of data | `id`, `org`, `url`, `licence`, `real` or `simulated`, `cadence`, `adapter`, `fallback` (sample file in `docs/research/samples/`), `credit` (exact footer text) |

The current `crew_data.json` `metrics` block becomes the first 11 entries of `metrics.yaml`, word for word. The generator then reads the catalog instead of owning it.

## 3. Store (facts): SQLite `server/data/excore.db`, four record types
| Table | Key | Columns | Note |
|---|---|---|---|
| `observation` | (subject, metric, t, source) | value, unit, quality (`live`, `cached`, `recorded`, `simulated`), run_id | Long format: one row per reading. Crew vitals, lab draws, cabin CO2, dose, GOES flux all live here |
| `event` | id | type (`flare`, `cme`, `sep`, `gst`), t_start, t_peak, t_end, attrs (JSON: class, lat, lon, speed) | Space-weather events from DONKI |
| `event_link` | (from_id, to_id) | relation (`linked_cme`, `caused_sep`) | Replaces flags like `has_linked_cme` stored on the flare |
| `run` | id | source, started, finished, ok, n_rows, cached, error | Every fetch, so the Systems screen can show data age and provenance |

Derived tables (written only by the engine, safe to delete and rebuild):
| Table | Key | Columns |
|---|---|---|
| `forecast` | (event_id, model_id) | p, level, split (`train`, `val`, `test`, `live`) |
| `assessment` | (subject, metric, t, rule_id) | window_mean, z, severity, reason |

Validation on write: subject and metric must exist in the catalog, the unit must match the metric's unit, `t` is UTC ISO 8601. A row that fails is rejected and logged in `run.error`, never stored half-right.

## 4. Engine (derived)
| Module | What | Single implementation of |
|---|---|---|
| `scoring.py` | 3-day mean vs the first 14 days, amber at z 2, red at 3, absolute red limits, low side only where the catalog says | The contract rule. `ml/crew_flags.py` imports it; `scoring.ts` is checked against its golden output |
| `forecast.py` | Loads the model card + `ml/models/v1.pkl`, computes the v1 features with `ml/` code, writes `forecast` rows | The storm model |
| `dose.py` | Cumulative dose per crew member from daily dose and the habitat's measured rate | Dose accumulation (replaces hand-set rates when HAPI data exists) |

Habitat facts reach crew through `located_in`: cabin CO2 is stored once on `iss`, and every crew member in `iss` sees it on their brain region. Nothing is copied per person.

## 5. Views (outputs)
| View | Output | Consumer |
|---|---|---|
| `contract_v1` | `crew_data.json`, `storm_forecast.json`, `real_crew.json`, same shape as `contracts/DATA_CONTRACT.md` | Today's app, unchanged. Golden test: rebuilt files equal the current files |
| `now` | `environment_now`, `space_weather_now` | New panels (after Emile's yes) |
| generic | `/api/catalog`, `/api/subjects`, `/api/sources`, `/api/observations?subject=&metric=&since=`, `/api/events?type=&since=`, `/api/assessments?subject=` | Any new screen, without backend work |
| `export` | `python -m server.export` writes `web/public/data/*.json` | The offline demo build |

How Emile's new things plug in: if the data exists, his screen queries the generic API. If it's a new measurable thing, we add a catalog entry and an adapter. If it's a new summary, we add a view. Adapters never change for a UI reason.

## 6. Folder layout
```
server/
  catalog/      metrics.yaml  subjects.yaml  sources.yaml
  core/         models.py (pydantic records)  catalog.py (load + validate)  store.py (SQLite)
  adapters/     base.py  simcrew.py  osdr.py  donki.py  swpc.py  isslive.py  hapi.py  checkin.py
  engine/       scoring.py  forecast.py  dose.py
  views/        contract_v1.py  now.py  generic.py
  api/          app.py  ws.py
  jobs/         scheduler.py  (each source on its catalog cadence)
  probes/       iss_cabin_probe.py  (standalone: see the live feed now)
  export.py
  tests/
```

## 7. ISS cabin (the fifth hazard)
- Source: ISS Live! via Lightstreamer, server `https://push.lightstreamer.com`, adapter set `ISSLIVE`, mode `MERGE`, fields `Value`, `TimeStamp`, `Status.Class`, `CalibratedData`. Python client: `pip install lightstreamer-client-lib` (official SDK, `from lightstreamer.client import ...`).
- Items (from `docs/research/2-data-sources/01-realtime-data-apis.md`): `USLAB000058` cabin pressure, `USLAB000059` cabin temperature, `USLAB000053` Lab ppO2, `USLAB000055` Lab ppCO2, `NODE3000001` to `NODE3000003` Node 3 ppO2, ppN2, ppCO2, `NODE3000005` urine tank, `NODE3000008` waste water, `NODE3000009` clean water, `TIME_000001` signal (Status.Class 24 = signal acquired).
- Units: the dictionaries say PSIA/PSI/CNT, observed values are mmHg and degrees C. Label from observation.
- `TimeStamp` = day-of-year × 24 + UTC hours. Always show data age: some items hadn't changed for 11 to 12 days.
- Catalog entries: `cabin.ppco2` (mmHg, hazard closed_environment, body_region brain, rule `absolute_bands` with the NASA limit of a 1-hour average at or below 3 mmHg, source: NASA OCHMO CO2 brief), `cabin.ppo2`, `cabin.pressure`, `cabin.temp`, `cabin.water_clean`, `cabin.urine_tank` (all `display_only` until a limit is sourced).
- Historical cabin series for a baseline: OSDR Environmental Data App (ISS temperature, humidity, CO2, radiation for Rodent Research windows), listed in `02-datasets.md`, not yet tested.
- Fallback: the 14 Nov snapshot in `docs/research/samples/isslive_lightstreamer_eclss_snapshot.json`, marked `recorded`.
- Open decision: the demo crew is at a simulated Moon base, the cabin feed is the real ISS. Either the environment switch to ISS shows the live cabin, or the Moon base cabin is simulated and the ISS feed is shown as "reference: real ISS right now".

## 8. Build order
| Step | What | Who |
|---|---|---|
| S0 spine | `core/models.py`, `core/catalog.py`, `core/store.py`, `adapters/base.py`, the three catalog files populated from today's data | Claude (first, everything else imports it) |
| S1 | `simcrew.py` + `osdr.py` adapters wrapping today's outputs, `views/contract_v1.py`, golden test: rebuilt files equal the current ones | Tomas terminal |
| S2 | `donki.py`, `swpc.py`, `engine/forecast.py`, live split | Claude |
| S3 | `isslive.py`, `hapi.py`, `engine/dose.py` | Tomas terminal |
| S4 | `api/app.py` (generic + now views, static app), `api/ws.py`, `jobs/scheduler.py`, Containerfile | Tomas terminal |
| S5 | `checkin.py` + persistence | later |
