# Notes for Emile (2026-11-15)

Orbit shapes and examples: `docs/backend/ORBIT-API.md`. Mind shapes: `docs/backend/MIND-API.md`. Both are PROPOSED in `contracts/CHANGELOG.md`. `storm_forecast.json` and `crew_data.json` are unchanged.

## Globe track drifts off the ISS

`useIssTrack` in `web/src/console/Globe.tsx` propagates the TLE with a two-body step and no J2. The ISS ascending node moves about 5 degrees a day, so a TLE that is six days old (the 9 Nov copy versus the 14 Nov elements) draws the station far from its real ground track.

Draw the `points` from `GET /api/orbit?subject=iss` instead. They are already SGP4, with `sunlit` and `in_saa` on each point. `satellite.js` would also propagate a fresh TLE, but it is a new dependency, so ask Tomas before adding it.

Place the track in the Earth-fixed group. The orbit-tilt group would twist the ground track. `ll(lat, lon, r)` uses lon 0 → +X, 90°E → −Z, and `r` in Earth radii. Our `lat` / `lon` are geodetic, lon in −180..180. Use `r = 1 + alt_km / 6371`, and colour each vertex from `sunlit` and `in_saa`. The field `now` is the crew pin at `at` (or at the server clock when you leave `at` out).

## Copy `iss.tle` for vite dev

`useIssTrack` fetches `orbits/iss.tle` and expects three lines of text (`parseTle`). Vite dev proxies `/api` only, so that path never reaches this server while you are on the dev server. A static build served from `web/public` has the same gap.

After `python -m server.build`, copy:

- `server/out/orbits/iss.tle` → `web/public/orbits/iss.tle`
- `server/out/orbits/tiangong.tle` → `web/public/orbits/tiangong.tle`, if you draw Tiangong from a file

When the Python server is the one serving the built app, `GET /orbits/iss.tle` and `GET /orbits/tiangong.tle` return the newest stored elements (ISS epoch 14 Nov 2026) and the copy is unnecessary.

Offline station file, same idea: copy `server/out/orbits/stations.json` to `web/public/samples/orbits/stations.json`.

## Longer timeout on the big layers

`getJson` in `web/src/data/http.ts` waits 4000 ms by default and accepts a response only when the status is 2xx and the content-type contains `json`. Every `/api/orbit*` route does that, including the gzip ones (`Content-Type` stays `application/json`; the browser decompresses).

Starlink and “every active satellite” are large. Call `getJson(path, 20000)` for `GET /api/orbit/elements?group=starlink` and `?group=active`.

## Habit untick

Unticking a habit sends no request, so the server keeps the task `done`. To undo it, post the same task and the same `t` with status `skipped`. A second event for that task and `t` replaces the first.

```http
POST /api/tasks/routine-c1-hydration/events
{"status": "skipped", "t": "2026-11-14"}
```

`status` is `"done"` or `"skipped"`. `"closed"` is server-only and returns 422.

## Activities are ready

The app does not call these yet. They are live on the server:

- `GET /api/activities?subject=c1&date=` — the 14 self-help activities. Ones that help an open alert are `suggested` and come first (red before amber).
- `POST /api/activities/{id}/events` with `{"subject": "c1"}` — logs it done and earns the usual task XP (10). The alert stays open until a newer reading clears it.

Shapes and a full example are in `docs/backend/MIND-API.md`.
