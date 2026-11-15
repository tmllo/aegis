## Organ dose map, radiation path and forecast explainer: shared API contract (v0, PROPOSED)

Owner: Tomás (backend lane `server/radiation_organs/`, on `main`). Reader: Emile (crew-station, `web/`).
Data and sources: `docs/backend/RADIATION-ORGAN-DATA.md` (a copy of RADIATION-ORGAN-DATA.md).
Nothing here changes `storm_forecast.json` or `crew_data.json`.

Every response carries `quality` and `sources: [{id, label, url}]`:
- `quality: "estimate"` for doses and risks: modelled from published phantom data, not measured on our crew.
- `quality: "model"` for forecast numbers.

No real astronaut doses are used.

### Common query params
- `subject`: crew id (c1..c4) or `iss|moon|transit|mars`. Crew → uses that member's env, sex and cumulative dose from crew_data.json.
- `env`: `iss|moon|transit|mars`. Default = the subject's env, else `transit`.
- `scenario`:
  - `gcr`: background cosmic rays over `days`.
  - `spe`: one reference storm only.
  - `storm`: background + `p` × storm (the expected dose under the current forecast).
- `event`: `oct1989` (default, NASA design reference) or `aug1972`.
- `shield`:
  - `hull`: ~25 g/cm² Al.
  - `vest`: AstroRad, measured on Artemis I.
  - `shelter`: hull + ~5 g/cm² water. HAND-SET estimate.
- `days`: background days. Default = the member's mission day count, else 30.
- `sex`: `f|m`. crew_data.json has no sex field, so the default is `f` (NASA's 600 mSv limit uses female model parameters). Override per request. It affects the breast and gonad risk share.

### Organ ids (fixed list, the frontend keys on these)
`skin, eye_lens, brain, salivary, thyroid, oesophagus, breast, lung, heart, liver, stomach, colon, bladder, gonads, red_marrow, bone_surface, kidney, pancreas, spleen`, plus the pseudo-organ `remainder` (risk only, no anchor).

### Anchors (where to draw on the body)
- Coordinates are in the body.glb frame used by `web/src/components/body3d/anchors.json`: metres, y up, height 1.72 m, +z = front, +x = the body's left (the heart sits at x +0.022).
- `mesh` names an existing body.glb node to tint when it exists: `skin`, `bones`, `heart`, `brain`, `eyes`, `lung_left`/`lung_right`. Otherwise draw a glow blob at `pos` with radius `r`.
- Positions without an anchors.json box are approximate (`approx: true`).

| id | mesh | pos [x,y,z] | r | anchors.json key |
|---|---|---|---|---|
| skin | skin | [0, 1.31, 0.146] | – | skin_chest |
| eye_lens | eyes | [0, 1.596, 0.050] | 0.03 | boxes.eyes |
| brain | brain | [0, 1.623, -0.021] | 0.08 | boxes.brain |
| salivary | – | [0, 1.53, 0.03] | 0.03 | approx |
| thyroid | – | [0, 1.44, 0.03] | 0.025 | boxes.jugular |
| oesophagus | – | [0, 1.36, -0.02] | 0.02 | approx |
| breast | – | [0, 1.30, 0.12] | 0.07 | approx |
| lung | lung_left, lung_right | [-0.018, 1.318, 0.001] | 0.11 | lungs |
| heart | heart | [0.022, 1.305, 0.023] | 0.06 | boxes.heart |
| liver | – | [-0.07, 1.17, 0.03] | 0.07 | approx |
| stomach | – | [0.06, 1.17, 0.03] | 0.05 | approx |
| spleen | – | [0.09, 1.16, -0.02] | 0.035 | approx |
| pancreas | – | [0.02, 1.13, 0.0] | 0.04 | approx |
| kidney | – | [0.002, 1.107, -0.015] | 0.06 | boxes.kidneys |
| colon | – | [0, 1.02, 0.03] | 0.09 | approx |
| bladder | – | [0, 0.90, 0.05] | 0.04 | approx |
| gonads | – | [0, 0.86, 0.02] | 0.04 | approx |
| red_marrow | bones_loadbearing | [0, 0.91, -0.035] | 0.12 | boxes.pelvis |
| bone_surface | bones | [0, 0.87, 0] | – | – |

### GET /api/radiation/organs
`/api/radiation/organs?subject=c1&env=moon&scenario=storm&event=oct1989&shield=hull&days=180`
```
{ subject, env, scenario, event, shield, days, sex,
  quality: "estimate",
  organs: [ {
    id: "lung", label: "Lungs",
    mesh: ["lung_left","lung_right"] | null, pos: [x,y,z], r, approx: false,
    dose_mSv: 254.5,              // organ dose equivalent for this scenario (NASA Q)
    dose_bg_mSv, dose_event_mSv,  // split: background GCR (+trapped at ISS) vs storm part
    w_T: 0.12, d_rel: 0.157,
    share_of_effective: 0.139,    // w_T*H_T / E
    share_of_risk: 0.226,         // H_T*D_rel / sum (sex-adjusted)
    risk_pct: 0.25,               // REID-style % = E*0.005%/mSv * share_of_risk  (estimate)
    limit: { kind: "30d"|"1y"|"career"|null, value: 250, unit: "mGy-Eq"|"mGy"|"mSv" } | null,
    pct_of_limit: 61.8 | null,
    level: "green"|"amber"|"red"|"info",   // <50 % green, 50-100 amber, >=100 red; info = no organ limit
    heat_dose: 0..1,              // dose_mSv / max dose_mSv in this response
    heat_risk: 0..1,              // share_of_risk / max share
    shelter_saves_mSv,            // hull minus shelter for the event part (null for gcr)
    source_ids: ["S4","S7","S8"]
  } ],
  totals: { effective_mSv, event_effective_mSv, bg_effective_mSv,
            reid_pct, career_limit_mSv: 600, pct_of_career, career_used_mSv,
            top_risk: ["breast","lung","stomach"], design_ref_limit_mSv: 250 },
  forecast: { p_storm, alert_level, flare_id, peak_time } | null,   // only for scenario=storm
  notes: ["Limits are mGy-Eq; values are mSv. Comparison approximate.", ...],
  sources: [ {id:"S4", label:"Houri et al. 2026, Sci. Adv. (Artemis I MARE)", url:"https://doi.org/10.1126/sciadv.adz1892"}, ... ] }
```

Rules:
- `gcr`: H_T = E_day(env) × days × profile_T.
  - The profile is uniform 1.0 for moon, transit and mars.
  - For iss it is 0.4 × trapped_ratio_T + 0.6 × 1.0.
- `spe`: H_T = table value for (event, shield). Shelter = hull × water factor.
- `storm`: bg + p_storm × event part. `p_storm` comes from the latest forecast row, with an optional `p=` override for the UI slider.
- `level` uses the 30-day limit for the event part, plus 30 days of background, for scenarios `spe` and `storm`. It uses the 1-year limit for `gcr` when days ≤ 365, otherwise career.

### GET /api/radiation/organs/compare
`/api/radiation/organs/compare?subject=c1&event=oct1989`

Returns the same organ ids, one row per shield, so the UI can animate the shelter effect:
`{ shields: ["hull","vest","shelter"], organs: [{ id, dose_mSv: {hull, vest, shelter}, pct_of_limit: {...}, level: {...} }], totals: { effective_mSv: {hull, vest, shelter} }, quality, sources }`

### GET /api/radiation/path
`/api/radiation/path?scenario=gcr|spe&event=aug1972&shield=hull`

This feeds the particle visual: space → hull → cabin → body (skin) → deep organ.
```
{ scenario, event, shield, quality: "estimate",
  particles: { kind: "GCR"|"SPE protons", spectrum: "hard"|"soft",
               note: "GCR: high-energy nuclei; shielding barely reduces dose" },
  stages: [
    { id: "space",   label: "Open space",        areal_g_cm2: 0,    rel_flux: 1.0,  dose_skin_mSv: null, dose_bfo_mSv: null },
    { id: "suit",    label: "Space suit (EVA)",  areal_g_cm2: 0.4,  rel_flux: 1.0,  dose_skin_mSv: 93500, dose_bfo_mSv: 2170 },
    { id: "vessel",  label: "Pressure vessel",   areal_g_cm2: 1,    rel_flux: 0.38, dose_skin_mSv: 35600, dose_bfo_mSv: 1800 },
    { id: "room",    label: "Equipment room",    areal_g_cm2: 5,    rel_flux: 0.046,... },
    { id: "shelter", label: "Storm shelter",     areal_g_cm2: 10,   rel_flux: 0.012,... },
    { id: "skin",    label: "Skin (first mm)",   ... }, { id: "organ", label: "Deep organs (BFO)", ... } ],
  current_stage: "vessel"|"shelter"|...,   // from shield
  body_gradient: { skin_to_deep: 20, source_id: "S1", note: "ISS EVA phantom" },
  organs_ref: "/api/radiation/organs?...",  // the same scenario for the heat map hand-off
  sources: [...] }
```

Values:
- SPE stages come from Wilson 1997 Table 5 (Aug 1972, Al). `rel_flux` = skin dose ÷ suit skin dose; it drives the particle count.
- `oct1989` uses the Simonsen 1992 water series (0.5/2/5/10 cm).
- GCR: `rel_flux` ≈ 1.0 at every stage, and dose ~flat (Artemis I skin 9.38 vs lung 9.44 mGy) (S3). The note says thicker shielding can even raise absorbed dose (S6).

### GET /api/forecast/explain
`/api/forecast/explain?env=moon`

This puts the storm forecast in one place for the UI. It reads the same rows as `/data/storm_forecast.json` (contract_v1) and never recomputes the headline.
```
{ model: "logistic_C10", horizon_h: 72, data_credit: "NASA CCMC DONKI", generated_at,
  quality: "model",
  now: { p_storm, alert_level: "none"|"watch"|"warning", flare_id, flare_class, peak_time,
         source_location, has_linked_cme, cme_speed_kms, thresholds: {watch, warning},
         action: "No action needed"|"Stay within reach of the shelter"|"Go to the shelter" },
  timeline: [ { t, flare_id, flare_class, p_storm, alert_level } ],   // flares in the last 72 h before now (or before the latest flare), oldest first
  headline: { n_storms: 17, caught: 16, hit_rate: 0.941, false_alarms_per_month: 1.0,
              median_lead_time_h: 3.83, brier_skill_vs_climatology: 0.412,
              test_period: ["2024-01-01", "..."], train_period: [...] },   // copied from meta.metrics_test; caught = round(hit_rate*n_storms)
  held_out_storms: [ { onset, caught: true, first_warning_flare_id, first_warning_at,
                       lead_time_h, flares_linked, max_p } ],              // 17 rows, built from split=test events grouped by storm_onset_time
  feature_importance: [...],                                               // from meta
  how_it_works: [ "Every solar flare NASA DONKI reports is scored the moment it peaks.",
                  "Inputs: flare class, where it sits on the Sun (western flares are magnetically connected to us), and whether a fast CME left with it.",
                  "A logistic model trained on 2010-2023 gives the chance of a >=10 MeV proton storm within 72 h.",
                  "Above the watch line: stay near the shelter. Above the warning line: go to the shelter.",
                  "Tested only on 2024-2026 flares it never saw." ],
  dose_if_storm: { event: "oct1989", hull_effective_mSv: 219.0, shelter_effective_mSv, vest_effective_mSv: 138.2 },  // links to the organ map
  sources: [ {id:"DONKI", url:"https://kauai.ccmc.gsfc.nasa.gov/DONKI/"}, ... ] }
```

Rules:
- Do NOT quote the v2 model anywhere.
- Lead times per storm are listed for display. The headline median is meta's 3.83 h. A per-storm recomputation can differ slightly, so never replace it.

### Frontend fallback
If `/api/health` fails or an endpoint 404s, the app uses `web/src/radiation/mockOrgans.ts`. That file embeds Table A of RADIATION-ORGAN-DATA.md, the stage table, and reads `storm_forecast.json` for the explainer, so the demo works offline.

The backend also writes `server/out/radiation/organs_demo.json`, a snapshot of `/organs?scenario=storm` for c1, `/organs/compare`, `/path` for gcr and spe, and `/forecast/explain`. Copy it to `web/public/samples/radiation/organs_demo.json`.

---

## Recorded examples

Taken from `TestClient` against the built forecast (`logistic_C10`, test split only). `quality` on the dose routes is `estimate`. The explainer is `quality: "model"`. Sources below are shortened to ids; each live item is `{id, label, url}`.

`pct_of_limit` is one decimal. 78.6 rounds to the 79% in the shelter check, and 46.8 rounds to 47%. Green is under 50, amber is 50 up to 100, red is 100 or more.

### GET /api/radiation/organs?subject=c1&env=moon&scenario=spe&event=oct1989&shield=hull&days=30
The reference storm on its own, so the table values show through.
```json
{"subject": "c1", "env": "moon", "scenario": "spe", "event": "oct1989", "shield": "hull",
 "days": 30, "sex": "f", "quality": "estimate",
 "organs": [
  {"id": "lung", "label": "Lungs", "mesh": ["lung_left", "lung_right"],
   "pos": [-0.018, 1.318, 0.001], "r": 0.11, "approx": false,
   "dose_mSv": 254.5, "dose_bg_mSv": 0.0, "dose_event_mSv": 254.5,
   "w_T": 0.12, "d_rel": 0.157, "share_of_effective": 0.139, "share_of_risk": 0.19,
   "risk_pct": 0.21, "limit": null, "pct_of_limit": null, "level": "info",
   "shelter_saves_mSv": 132.5, "source_ids": ["S4", "S7", "S8", "S9"]}],
 "totals": {"effective_mSv": 219.0, "event_effective_mSv": 219.0, "bg_effective_mSv": 0.0,
            "reid_pct": 1.095, "career_limit_mSv": 600.0, "design_ref_limit_mSv": 250.0,
            "top_risk": ["breast", "lung", "stomach"]},
 "forecast": null,
 "notes": ["Limits are mGy-Eq; organ values are NASA dose equivalent (mSv). Comparison approximate."]}
```
Skin is 494.4 mSv, red marrow 154.6. Vest effective dose is 138.2. Aug 1972 hull effective dose is 204.2. With `sex=m`, breast `share_of_risk` is 0. On a Moon GCR run every organ dose is the same and effective dose is 1.4 mSv times `days`.

Red marrow, Moon, Oct 1989, hull: 154.6 + 30 × 1.4 = 196.6 mSv against the 250 mGy-Eq 30-day limit, `pct_of_limit` 78.6, level `amber`. Shelter (75 mSv + 42) is 46.8, level `green`.

### GET /api/radiation/organs?subject=c1&scenario=storm&event=oct1989&shield=hull
Ana's mission day count is 75. The newest flare is M1.7 at `2026-11-11T21:21:00Z` with `p_storm` 0.017106, so the storm adds only a few mSv on top of 105 mSv of background. `top_risk` stays lung, breast, stomach. Pass `p=1` to draw the full reference storm.
```json
{"scenario": "storm", "days": 75, "sex": "f", "quality": "estimate",
 "totals": {"effective_mSv": 108.7, "event_effective_mSv": 3.7, "bg_effective_mSv": 105.0,
            "reid_pct": 0.544, "career_used_mSv": 109.4, "pct_of_career": 36.4,
            "career_limit_mSv": 600.0, "top_risk": ["lung", "breast", "stomach"],
            "design_ref_limit_mSv": 250.0},
 "forecast": {"p_storm": 0.017106, "alert_level": "none",
              "flare_id": "2026-11-11T21:06:00-FLR-001", "peak_time": "2026-11-11T21:21:00Z"}}
```
`career_used_mSv` is her latest simulated cumulative dose. `pct_of_career` adds this scenario on top of that, then divides by 600.

### GET /api/radiation/organs/compare?subject=c1&event=oct1989
```json
{"shields": ["hull", "vest", "shelter"],
 "organs": [{"id": "red_marrow",
             "dose_mSv": {"hull": 154.6, "vest": 116.8, "shelter": 75.0},
             "pct_of_limit": {"hull": 78.6, "vest": 63.5, "shelter": 46.8},
             "level": {"hull": "amber", "vest": "amber", "shelter": "green"}}],
 "totals": {"effective_mSv": {"hull": 219.0, "vest": 138.2, "shelter": 96.9}},
 "quality": "estimate"}
```
Shelter effective dose is derived (tissue weights on the sheltered organ doses), not a number from the paper. Label it an estimate.

### GET /api/radiation/path?scenario=spe&event=aug1972&shield=hull
```json
{"scenario": "spe", "event": "aug1972", "shield": "hull", "quality": "estimate",
 "particles": {"kind": "SPE protons", "spectrum": "soft"},
 "current_stage": "orion",
 "body_gradient": {"skin_to_deep": 20, "source_id": "S1", "note": "ISS EVA phantom. Skin dose was about 20 times the deep-organ dose."},
 "stages": [
  {"id": "space", "areal_g_cm2": 0, "rel_flux": 1.0, "dose_skin_mSv": null, "dose_bfo_mSv": null},
  {"id": "suit", "areal_g_cm2": 0.4, "rel_flux": 1.0, "dose_skin_mSv": 93500.0, "dose_bfo_mSv": 2170.0},
  {"id": "vessel", "areal_g_cm2": 1, "rel_flux": 0.381, "dose_skin_mSv": 35600.0, "dose_bfo_mSv": 1800.0},
  {"id": "room", "areal_g_cm2": 5, "rel_flux": 0.046, "dose_skin_mSv": 4270.0, "dose_bfo_mSv": 650.0},
  {"id": "orion", "areal_g_cm2": 24.8, "rel_flux": 0.008, "dose_skin_mSv": 708.4, "dose_bfo_mSv": 105.9},
  {"id": "shelter", "areal_g_cm2": 10, "rel_flux": 0.012, "dose_skin_mSv": 1100.0, "dose_bfo_mSv": 240.0}]}
```
`rel_flux` falls along suit, vessel, room, shelter. Orion is the Houri 2026 hull (708.4 mSv skin), a different model from the Wilson slab, so its flux is not between the room and the shelter. `shield=hull` and `shield=vest` set `current_stage` to `orion`. `shield=shelter` sets it to `shelter`. GCR uses the same stage ids with `rel_flux` 1.0 at every stage.

### GET /api/forecast/explain?env=moon
```json
{"model": "logistic_C10", "horizon_h": 72, "data_credit": "NASA CCMC DONKI", "quality": "model",
 "now": {"p_storm": 0.017106, "alert_level": "none", "flare_class": "M1.7",
         "flare_id": "2026-11-11T21:06:00-FLR-001", "peak_time": "2026-11-11T21:21:00Z",
         "source_location": "S07W46", "has_linked_cme": false, "cme_speed_kms": null,
         "action": "No action needed"},
 "headline": {"n_storms": 17, "caught": 16, "hit_rate": 0.941176, "false_alarms_per_month": 1.0,
              "median_lead_time_h": 3.83, "brier_skill_vs_climatology": 0.412519,
              "test_period": ["2024-01-01", "2026-11-15"], "train_period": ["2010-01-01", "2023-12-31"]},
 "held_out_storms": "17 rows. 16 caught. The miss is onset 2026-09-05T16:15:00Z (one flare, watch only, max p 0.13867).",
 "dose_if_storm": {"event": "oct1989", "hull_effective_mSv": 219.0, "vest_effective_mSv": 138.2,
                   "shelter_effective_mSv": 96.9}}
```
`caught` is `round(hit_rate × n_storms)`, which is 16. The headline median stays 3.83 h. Per-storm lead times are on `held_out_storms` and are not folded back into that median. Actions are `No action needed`, `Stay within reach of the shelter`, and `Go to the shelter`.

`python -m server.radiation_organs.export` writes `server/out/radiation/organs_demo.json` with `organs` (c1, storm), `compare` (oct1989), `path.gcr`, `path.spe` (aug1972) and `forecast`.
