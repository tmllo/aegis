# Frontend sync (Emile's `origin/crew-station` vs this server)

## For Emile

- Checkup save posts `vital.resp_rate` and `cog.pvt_rt`. The server stores both as `crew_spot` (`quality: "estimated"`, source `checkup`) and returns `assessment: null` with no tasks. There are no alert cutoffs: NASA publishes none, and any cutoff is Tomás's call (`docs/backend/REQUESTS.md`). They are not `crew_daily`, so `crew_data.json` does not change.
- `crew-station` still has its own copy of `web/public/data`. It is behind main. On that branch, `git checkout origin/main -- web/public/data` brings the three contract files up to date. Do not edit them by hand.
- Vite dev proxies only `/api` (`web/vite.config.ts`). `/data` and `/orbits` are not proxied, so `npm run dev` reads the files in `web/public`, not this server. `fetch(BASE_URL + 'orbits/iss.tle')` in `Globe.tsx` and `web/src/globe-lab/iss.ts` reads `web/public/orbits/iss.tle` during `npm run dev`. `GET /orbits/iss.tle` on this server is used only when uvicorn serves the built app. Copy `server/out/orbits/iss.tle` into `web/public/orbits/` when the dev track should match the stored elements.
- There is still no `tiangong` subject. Use `GET /orbits/tiangong.tle` and `GET /api/orbit?subject=tiangong`. A habitat subject would leak into `crew_data.json` `environments` (see `docs/backend/REQUESTS.md`).
- CelesTrak elements reload at build and server start, not on a 6 h poll, until `test_live.py` stops requiring `refreshed == ["isslive"]`. A process left running keeps the elements it loaded at startup.

- The Cabin storm line still comes from the last event in `storm_forecast.json`, not from today's Sun. `GET /api/space-weather/now` is a recorded SWPC sample (14 Nov 2026, `quality: "recorded"`, `cached: true`): GOES >=10 MeV, the latest x-ray flare, Kp, and NOAA R/S/G. It does not change the forecast file. Point the card at it when you want that sample instead of the historical flare.
- Organ rows from `GET /api/radiation/organs` now include `target`, a body3d `TargetId` or null. `red_marrow` and `bone_surface` are `bone`. `heart` is `heart`. `brain` and `eye_lens` are `brain`. `stomach`, `liver`, `pancreas`, `colon`, `kidney` and `spleen` are `metabolic`. Skin, lung, breast and the rest are null, including `remainder`. Copy `server/out/radiation/organs_demo.json` to `web/public/samples/radiation/organs_demo.json` (`python -m server.radiation_organs.export` rewrites it).
- EVA frames keep `bio`, `suit` and `env`, and add `metrics` with catalog keys `eva.hr`, `eva.ppco2`, `eva.o2` and `eva.dose_rate`. A 60-minute run at 5-second steps answers in under a second. Copy `server/out/eva/moon_traverse_storm.json` and `mars_traverse_storm.json` to `web/public/samples/eva/`. `python -m server.build` rewrites them.
- `web/src/console/entries.ts` `VITAL` still maps glucose to `vital.glucose`. The server stores that as `lab.glucose`. The crew page's main button (`act` in `CrewPage.tsx`) posts through `VITAL`, so sleep, mood and exercise on that button are not sent (they are not in the map). The slider does send `self.sleep_h`, `self.mood` and `self.exercise_min`. Add those three keys to `VITAL` if that button should store them too.
- One-origin demo, from the repo root: `bash scripts/serve_demo.sh`. It fetches `origin/crew-station`, builds it under `/tmp/aegis-web` (never this repo's `web/`), and serves that build at <http://127.0.0.1:8000/> with deep links working. `bash scripts/smoke_e2e.sh` checks the API. Add `--lanes` for EVA and the organ map, and `--web DIST` for the deep links.

## Integration

Checked against `origin/crew-station` `3a65968`. Shape OK means the fields the app reads are present.

| Call | Status | Shape |
|---|---|---|
| GET /api/health | 200 | ok. `sources.*.quality`, `rows`, `at` |
| GET /api/cabin/catalog | 200 | `stale_after_h`, metric `key`, `label`, `short`, `unit`, `item`, `digits`, `bands`, `source` |
| GET /api/observations?subject=iss&kind=cabin | 200 | `metric`, `t`, `value`, `quality` |
| POST /api/observations (vitals, self-report, `vital.resp_rate`, `cog.pvt_rt`) | 201 | `assessment` null or `severity`/`message`/`action`, `opened_tasks`, `closed_tasks` |
| GET /api/checkin?subject=c1&date=2026-11-14 | 200 | `metrics[].key`, `scale.words` length 5 |
| GET /api/tasks, POST /api/tasks, POST /api/tasks/{id}/events | 200 / 201 | task `id`, `kind`, `label`, `origin`, `metric`, `done`, `status`, `streak`, `attrs` |
| GET /api/progress | 200 | `xp`, `level`, `checkin_streak`, `best_habit_streak` |
| GET /api/wellbeing?days=7 and days=14 | 200 | week `from`/`to`/`checkin_days`/`scores`, `trend`, `checkin_streak`, `alerts` |
| GET /api/activities, POST /api/activities/{id}/events | 200 / 201 | `id`, `label`, `minutes`, `steps`, `source`, `suggested`, `because`, `done_today` |
| GET/POST /api/notes with X-Crew-Member | 200 / 201 | `notes[].id`, `t`, `text`. Without the header: 403, no note text |
| POST /api/refresh | 200 | JSON |
| GET /api/orbit?subject=iss&minutes=100&step_s=20&at=… | 200 | `points[].t`, `lat`, `lon`, `alt_km` |
| GET /orbits/iss.tle | 200 | 3-line TLE |
| GET /data/{crew_data,storm_forecast,real_crew}.json | 200 | the contract files, identical to the app copies |
| GET /environment, /checkup, /mind with no file | 200 text/html | `index.html` when `AEGIS_WEB_DIST` is set. Unknown `/api` stays JSON 404 |
| GET /api/eva/sites, /api/eva/sim, POST /api/eva/assess | 200 | frames also carry `metrics` (`eva.hr`, `eva.ppco2`, `eva.o2`, `eva.dose_rate`). 60 min / 5 s in 78 ms |
| GET /api/radiation/organs, /compare, /path, /api/forecast/explain | 200 | each organ has `target` (`bone`, `heart`, `brain`, `metabolic`, or null) |
| GET /api/space-weather/now | 200 | recorded SWPC sample. The Cabin card does not call it yet |

## Log

- 2026-11-15 08:35 Europe/Paris. `contracts/frontend_reads.json` lists every call the crew-station app makes, and `server/tests/test_frontend_contract.py` checks the fields it reads. `scripts/check_frontend_reads.py` fails if a new `getJson`, `postJson` or `fetch` path is not in that list.

- 2026-11-15 06:18 Europe/Paris. Emile `3a65968` ("Use shared vitals sliders across crew and organ views"). `CrewPage` and `InfoSheet` now edit through `MetricSlider`, which posts catalog keys (`lab.glucose`, `vital.hr`, `vital.bp_sys`, `vital.bp_dia`, `vital.temp`, `self.sleep_h`, `self.mood`, `self.exercise_min`). The crew page's main button still posts `VITAL`, including `vital.glucose`, which the server already maps to `lab.glucose`. No new server change.

- 2026-11-15 06:05 Europe/Paris. New commits `846b4db`..`501fcc9` (vitals slider, organ panel). `MetricSlider` posts catalog keys (`lab.glucose`, `vital.temp`, `self.sleep_h`, `self.mood`, `self.exercise_min`, and the blood-pressure and heart-rate keys). `entries.ts` still posts `vital.glucose`. Server now maps that one name to `lab.glucose` and stores the catalog key. Test `test_emiles_entries_posts_glucose_as_vital_glucose` replays the body. Sleep, mood and exercise from `saveEntry` are the For Emile note above.
- 2026-11-15 05:55 Europe/Paris. Emile's tip `3f718a8` ("Ultra-simple daily check and Mind: one question per screen…"), 41 commits ahead of `main`. Compared `web/src/data/{live,mind,cabin,http}.ts`, `web/src/console/mind/api.ts`, `web/src/console/checkup/CheckupPage.tsx`, `web/src/wearable/useWristband.ts`, `web/src/globe-lab/iss.ts` with the routes. Matches, no server edit: `GET api/health` sources `{quality, rows, at}`; `POST api/refresh`; `POST api/observations` for `vital.hr` and `self.*` returns `assessment`, `opened_tasks`, `closed_tasks` (plus `stored`); `GET api/observations?subject=iss&kind=cabin` is `[{metric, t, value, quality}]`; `GET api/cabin/catalog`; `GET api/wellbeing?days=7|14`; `GET/POST api/tasks`, `POST api/tasks/{id}/events`; `GET api/progress`; `GET/POST api/notes` with `X-Crew-Member`; `GET api/activities` and `POST api/activities/{id}/events` with `{subject}` or `{subject, t}` (`YYYY-MM-DD` is a valid `t`); `GET api/orbit?subject=iss&minutes=100&step_s=20&at=<ISO>` points include `t`, `lat`, `lon`, `alt_km` (also `sunlit`, `in_saa`). Mismatches left for him are the two unknown checkup metrics and the Vite `/orbits` path, above. No server change.
