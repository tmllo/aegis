# Morning summary (07:30 Europe/Paris, 15 Nov 2026)

## What got pushed

`main` moved from `b169537` to `0d4b3bc`, then this summary.

| Commit | What |
|---|---|
| `bce28f8` | Schaefer et al. 2016 kept. Crossref DOI 10.1002/2016SW001371 matches the title, authors and Space Weather 14(5) 330–342. Both orbit deviations were already in REQUESTS.md. CelesTrak stays `on build`. |
| `3feea31` | `POST /api/observations` with `vital.glucose` (Emile's `entries.ts`) is stored as `lab.glucose`. Test replays that body. |
| `ff1e1ed` | README rewritten for a judge: how to run the API and the app, challenge and data credits, simulated crew, AI disclosure. GitHub issue #3 copied to `docs/DATA-SOURCES.md` (the `gh` CLI was not installed; the body came from the GitHub API). |
| `85683ac` | Bone-loss constant `0.045` → `0.027` (about 1%/month with no exercise). Same seed. End of the 75-day mission: Ana 0.46%, Kenji 0.42%, Léa 0.60%. |
| `597dd63` | Held-out pitch numbers in `docs/backend/PITCH-NUMBERS.md`. No new training. |
| `0d4b3bc` | Sync note for Emile's `3a65968` (shared vitals sliders). No server code change. |

Short log-only commits in between (`c3625e8`, `facd778`, `d0779ef`, `4df5617`, `c3af4ba`) only record those hashes in `docs/backend/OVERNIGHT-LOG.md`.

## Gate

At 07:30, before this summary:

```
cabin_catalog.json: identical to the app file
crew_data.json: identical to the app file
storm_forecast.json: identical to the app file
real_crew.json: identical to the app file
rejected=0 on every run
128 passed
```

## Emile overnight

`origin/crew-station` tip at 07:30 is `3a65968` ("Use shared vitals sliders across crew and organ views"). It did not move after 06:18.

Checked at the start (`3f718a8`, 41 commits ahead) and again when the tip moved `501fcc9` → `3a65968`. Integrated:

- Slider saves post catalog keys: `vital.hr`, `vital.bp_sys`, `vital.bp_dia`, `vital.temp`, `lab.glucose`, `self.sleep_h`, `self.mood`, `self.exercise_min`.
- The crew page's main button still posts `entries.ts` `VITAL`, including `vital.glucose`. The server stores that as `lab.glucose` (`3feea31`).
- Cabin, mind, wellbeing, tasks, notes, activities, orbit track and `/orbits/iss.tle` match the routes already on `main`.

His branch is not merged. The server changes are on `main` and do not need a `web/` edit to work once he runs against this API.

## For Emile

From `docs/backend/FRONTEND-SYNC.md`:

- Do not post `vital.resp_rate` or `cog.pvt_rt`. They are not in the catalog, so `POST /api/observations` returns 422. `vital.hr` is accepted. Adding them as `crew_daily` would change `crew_data.json`.
- Vite proxies only `/api`. `orbits/iss.tle` during `npm run dev` is `web/public/orbits/iss.tle`. Copy `server/out/orbits/iss.tle` there when the dev track should match the stored elements. `GET /orbits/iss.tle` on this server applies when uvicorn serves the built app.
- There is no `tiangong` subject. Use `GET /orbits/tiangong.tle` and `GET /api/orbit?subject=tiangong`.
- CelesTrak reloads at build and server start, not every 6 hours, until `test_live.py` stops requiring `refreshed == ["isslive"]`.
- The crew page's main button uses `VITAL`, which does not include sleep, mood or exercise. The slider does post those three. Add `self.sleep_h`, `self.mood` and `self.exercise_min` to `VITAL` if that button should store them. Glucose in `VITAL` can stay `vital.glucose`; the server maps it.

## Left before submission

- Slides, or a video of at most 30 seconds.
- The Space Apps form (title, summary, demo link, repo, data credits).
- One demo rehearsal on the local build: crew overview, the amber astronaut, a check-in, then the May 2024 replay. Pitch numbers are in `docs/backend/PITCH-NUMBERS.md`: 16 of 17 held-out storms, 1.0 false alarm per month, 3.83 h median lead, 72 h horizon, model `logistic_C10`. v2 was not accepted.

## Not committed

`web/package-lock.json` was already modified in the working tree at the start of the night, and `cabin.json` is untracked. Neither was part of this work.
