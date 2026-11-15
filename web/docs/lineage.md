# e^x data lineage (summary of `lineage.json`)
1. `lineage.json` is a graph of 53 nodes and 74 edges in six one-way layers: sources, adapters, normalize, scoring and forecast, surfaces, handoff and ground. Every node and edge has a `ref` to the file the claim comes from.
2. **Crew vitals are simulated.** No public feed of astronaut vitals exists (Privacy Act of 1974), so the crew is fictional (docs/research/2-data-sources/01, section 5).
3. **Simulated crew pipeline (Tomas, build time):** published ranges -> `ml/make_sample_data.py` (AR(1), correlated shocks, planted demo days) -> `ml/crew_flags.py` (personal baseline, 3-day mean z) -> `web/public/data/crew_data.json`.
4. **Storm pipeline (Tomas, build time, real data):** NASA CCMC DONKI -> `fetch_donki.py` -> `prepare_model_flares.py` -> model v1 (`train_v1.py`) -> `run_test_and_export.py` -> `web/public/data/storm_forecast.json`.
5. **Real crew reference:** NASA OSDR Inspiration4 labs -> `real_crew.py` -> `real_crew.json`. Shown as a reference only; never scored, never merged with the simulated crew.
6. **Live inputs in the app:** the manual check-in and a Bluetooth heart strap (standard Heart Rate Service, Chrome only). Both are real.
7. **Simulated adapters:** replay of the crew file, a Bio-Monitor-class stream, a personal dosimeter.
8. **Planned devices (listed, not connected):** CSA Bio-Monitor (Astroskin), Actiwatch, ESA T-Mini, crew dosimeters, CSA Bio-Analyzer. Each maps to a metric key (docs/research/3-health-science/09 and 10).
9. **Real feeds kept as offline samples** (verified live 2026-11-14, files in `docs/research/samples/`): NOAA scales, GOES protons, GOES X-ray, SWPC alerts, Kp, iSWA HAPI dose (Mars, Moon), OSDR RadLab, ISS Live, ISS position, crew roster. The app makes no runtime external request.
10. **Normalize:** every reading becomes one FHIR Observation-shaped record with a LOINC code where one is verified, then goes onto the event bus.
11. **Core:** scoring (same rule as `crew_flags.py`, checked by a parity test), radiation (forecast feed, replay, dose gauge), escalation (status and environment decide who is told).
12. **Surfaces:** Crew Console, Radiation module, Wrist and Systems read only from the bus. The Systems map can be drawn straight from this file.
13. **Handoff and ground:** case bundle prepared for CMO-DA (not connected), link queue with delay and loss of signal (simulated, DTN-style), Ground view, flight surgeon.
14. **Data rule:** no value from the two JSON files is repeated in the lineage. Read numbers from the files or from `meta`.
15. **Open points** (in `meta.open_points`): environment dose rates are hand-set working values; CBC study number differs between research (OSD-569) and contract (OSD-575); CMO-DA and DTN have no research file; no LOINC for mood, exercise, bone loss or dose; Bio-Analyzer glucose is a team mapping.
