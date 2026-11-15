# Orbit API (for Emile's globe)

Server: `uvicorn server.api.app:app --port 8000`. Same rule as Cabin and Mind: call `GET /api/health` first. With no server, read the copied files under `web/public/orbits/` and `web/public/samples/orbits/` (see the end of this doc).
Status: PROPOSED (`contracts/CHANGELOG.md`). `storm_forecast.json` and `crew_data.json` do not change.

Examples below are real responses from `TestClient` with `AEGIS_DB=":memory:"` and `AEGIS_REFRESH=0`, recorded elements, server clock `2026-11-15T04:08Z`. `elements_age_h` is hours from the element epoch to that clock, rounded to 0.1, and it grows as the clock moves. Point positions at a fixed `at` do not.

**Honesty**
- `elements_age_h` is how old the elements are. Position error grows with it (about 1–3 km per day for the ISS). The recorded ISS set is epoch `2026-11-14T04:10:44Z`. Tiangong and most other objects in the recorded files are about 9 Nov 2026, so their age is much larger (Tiangong was 132.8 h at the example clock).
- `quality` is `recorded` (the files shipped with the server), `cached` (a live download kept in `server/data/celestrak`) or `live` (just downloaded). For a group it is the worst quality among the satellites in that group. An empty group is `recorded`.
- Eclipse times use a cylindrical Earth shadow and a low-precision Sun. Good to about a minute. There is no penumbra.
- `in_saa` is a point-in-polygon test against the NICER XTI exclusion contour from 2017-06-01 (`nixtisaareg20170601v003.fits`, ISS altitude, where the particle background rises). It is not a dose threshold. Schaefer, Paxton, Selby, Ogorzalek, Romeo, Wolven and Hsieh (2016), Space Weather 14(5), 330–342, doi:10.1002/2016SW001371, measured the SAA centroid drifting 0.36 ± 0.06 deg/yr west and 0.16 ± 0.09 deg/yr north at about 850 km (DMSP, 2004–2011). Applied to this 2017 contour, that is about 3 deg west by 2026. Those rates are from about 850 km, and the polygon is not shifted. `model.saa` carries this in full, and `model.saa_approximate` is true.
- `GET /api/health` shows `sources.celestrak.rows` = 0. The element sets live in the orbit tables, not in the core observation store. Use `objects` on `GET /api/orbit/groups`, and `quality` on each orbit response. No screen reads `getSources` yet.
- Live downloads (`AEGIS_CELESTRAK=live`) fetch each group at most every 6 hours, then fall back to the cache, then to the recorded files. The catalog cadence is `on build`, so a long-running server does not poll CelesTrak until the next start (`docs/backend/REQUESTS.md`).

**Conventions**
- Station `subject` is `iss` (NORAD 25544) or `tiangong` (NORAD 48274). Anything else is **404**.
- `at` is `YYYY-MM-DDTHH:MM:SSZ` (UTC). Leave it out and the track starts at the server clock. `date` is `YYYY-MM-DD` and defaults to the server's UTC date.
- `lat` / `lon` are geodetic, lon in −180..180. `alt_km` is height above the WGS84 ellipsoid.
- Errors you generate: `{"detail": "reason"}` with 404 (unknown station, group, NORAD id, or `.tle` name), 503 (that station has no elements stored) or 422 (bad `at` or `date`, both or neither of the element filters, too many track points). A query outside the numeric bounds (`minutes` 0–1440, `step_s` 5–600) gives FastAPI's standard 422 with a list in `detail`.
- `GET /api/orbit/elements` is gzip-compressed when the request `Accept-Encoding` contains `gzip`. `Content-Type` stays `application/json`, so `getJson` accepts it. Browsers decompress it. The other orbit routes are plain JSON.

| Method | Path | What |
|---|---|---|
| GET | `/api/orbit?subject=iss&minutes=180&step_s=30&at=` | station track, sunlit, SAA, crew pin, next events |
| GET | `/api/orbit/elements?subject=iss` | one station's two-line elements |
| GET | `/api/orbit/elements?norad=48274` | the same, by NORAD id |
| GET | `/api/orbit/elements?group=starlink` | every satellite in a toggle group |
| GET | `/api/orbit/day?subject=iss&date=` | sunrises, eclipses and SAA minutes for one UTC day |
| GET | `/api/orbit/groups` | the eight toggles |
| GET | `/orbits/iss.tle` | 3-line TLE text (also `tiangong`) |

---

## GET /api/orbit?subject=iss&minutes=180&step_s=30&at=2026-11-15T04:00:00Z
`minutes` and `step_s` default to 180 and 30. The track is `minutes * 60 / step_s + 1` points and must stay under 5000.
`points` are every `step_s` from `start`. `now` is the same state at `start`: the crew pin at `at`, or at the server clock when you leave `at` out. `next` looks about 200 minutes ahead; a key is `null` when that crossing does not fall in the window.
```json
{"subject": "iss", "name": "ISS (ZARYA)", "norad": 25544, "epoch": "2026-11-14T04:10:44Z",
 "elements_age_h": 24.0, "quality": "recorded", "source": "celestrak",
 "credit": "CelesTrak (celestrak.org), Dr. T.S. Kelso",
 "start": "2026-11-15T04:00:00Z", "step_s": 30.0,
 "points": [
  {"t": "2026-11-15T04:00:00Z", "lat": 30.356, "lon": -48.763, "alt_km": 422.0, "sunlit": false, "in_saa": false},
  "... 359 more ...",
  {"t": "2026-11-15T07:00:00Z", "lat": 44.106, "lon": -116.786, "alt_km": 422.8, "sunlit": false, "in_saa": false}],
 "now": {"t": "2026-11-15T04:00:00Z", "lat": 30.356, "lon": -48.763, "alt_km": 422.0, "sunlit": false, "in_saa": false},
 "next": {"sunrise": "2026-11-15T04:16:59Z", "sunset": "2026-11-15T05:14:26Z",
          "saa_entry": "2026-11-15T04:17:19Z", "saa_exit": "2026-11-15T04:25:16Z"},
 "model": {
  "eclipse": "approximate: cylindrical Earth shadow (no penumbra), low-precision Sun position (Astronomical Almanac), timing good to about a minute",
  "position": "SGP4 from CelesTrak mean elements; error grows with elements_age_h (about 1-3 km per day for the ISS)",
  "saa": "Approximate. The standard SAA exclusion contour NASA uses for the NICER X-ray instrument on the ISS ... The polygon is not shifted.",
  "saa_approximate": true}}
```
361 points in this call. The full `model.saa` string is the basis in `server/catalog/orbit.yaml` (the honesty paragraph above).
`GET /api/orbit?subject=tiangong&at=2026-11-15T04:00:00Z` is the same shape with `"norad": 48274` and `"name": "CSS (TIANHE)"`.
`GET /api/orbit?subject=nope` → `404 {"detail": "unknown station subject 'nope'; known: ['iss', 'tiangong']"}`.
`GET /api/orbit?minutes=1440&step_s=5` → `422 {"detail": "too many points: minutes*60/step_s must stay under 5000"}`.
`GET /api/orbit?at=yesterday` → `422 {"detail": "at: not an ISO 8601 time: 'yesterday'"}`.

## GET /api/orbit/elements?subject=iss
One of `subject`, `group` or `norad`. The body below is after gzip decompression.
```json
{"subject": "iss", "norad": 25544, "name": "ISS (ZARYA)",
 "line1": "1 25544U 98067A   26318.17412740  .00009423  00000-0  17665-3 0  9992",
 "line2": "2 25544  51.6324 277.8691 0007369  23.7540 336.3788 15.49365732595001",
 "epoch": "2026-11-14T04:10:44Z", "elements_age_h": 24.0, "quality": "recorded",
 "credit": "CelesTrak (celestrak.org), Dr. T.S. Kelso"}
```

## GET /api/orbit/elements?norad=48274
Same shape. `subject` is `null` when you asked by NORAD id.
```json
{"subject": null, "norad": 48274, "name": "CSS (TIANHE)",
 "line1": "1 48274U 21035A   26313.64024902  .00024522  00000+0  27990-3 0  9992",
 "line2": "2 48274  41.4672 158.1554 0004580 282.0139  78.0187 15.61618563315880",
 "epoch": "2026-11-09T15:21:57Z", "elements_age_h": 132.8, "quality": "recorded",
 "credit": "CelesTrak (celestrak.org), Dr. T.S. Kelso"}
```
An unknown NORAD id is `404 {"detail": "no elements for NORAD 1"}`.

## GET /api/orbit/elements?group=stations
`sats` is `{norad, name, line1, line2}` only, so you can hand the lines to a propagator. `elements_age_h` is the age of the middle epoch in the group, which is why stations reads 136.9 h here even though the ISS row inside it is 24 h old.
```json
{"group": "stations", "label": "Crewed stations", "kind": "crewed", "objects": 15,
 "elements_age_h": 136.9, "quality": "recorded",
 "credit": "CelesTrak (celestrak.org), Dr. T.S. Kelso",
 "sats": [
  {"norad": 25544, "name": "ISS (ZARYA)",
   "line1": "1 25544U 98067A   26318.17412740  .00009423  00000-0  17665-3 0  9992",
   "line2": "2 25544  51.6324 277.8691 0007369  23.7540 336.3788 15.49365732595001"},
  "... 14 more, by norad ..."]}
```
`group=starlink` returns `objects` 10621. `group=active` returns `objects` 15883 and includes every other group, so dedupe by `norad` before you draw. Both are large: call `getJson(path, 20000)`.
`GET /api/orbit/elements` with no query, or with two of the three filters, is `422 {"detail": "give exactly one of subject, group or norad"}`.
`GET /api/orbit/elements?group=nope` → `404 {"detail": "unknown group 'nope'; known: ['active', 'galileo', 'geo', 'glo-ops', 'gps-ops', 'starlink', 'stations', 'visual']"}`.

## GET /api/orbit/day?subject=iss&date=2026-11-15
Counts run from 00:00Z to the next 00:00Z, sampled every 30 s. A sunrise, sunset or SAA entry is a transition inside the day, so a pass already underway at midnight is not counted as an entry and `sunrises` can differ from `sunsets` by one. `orbits` is the mean motion (revolutions per day), not a count of crossings.
```json
{"subject": "iss", "name": "ISS (ZARYA)", "norad": 25544, "date": "2026-11-15",
 "orbits": 15.49, "sunrises": 15, "sunsets": 16, "eclipse_minutes": 544.0,
 "saa_passes": 10, "saa_minutes": 141.5, "step_s": 30,
 "epoch": "2026-11-14T04:10:44Z", "elements_age_h": 24.0, "quality": "recorded",
 "model": {"eclipse": "...", "position": "...", "saa": "...", "saa_approximate": true}}
```
`model` is the same object as on `GET /api/orbit`.
`GET /api/orbit/day?date=2026-02-30` → `422 {"detail": "date: expected YYYY-MM-DD, got '2026-02-30'"}`.

## GET /api/orbit/groups
Catalog order, which is the toggle order. `default_on` is true only for `stations`. `elements_age_h` here is again the middle epoch of that group, at the `2026-11-15T04:08Z` clock. `about` is the line you can show under the toggle.
```json
[
 {"id": "stations", "label": "Crewed stations", "kind": "crewed", "objects": 15, "default_on": true,
  "elements_age_h": 136.9, "quality": "recorded", "credit": "CelesTrak (celestrak.org), Dr. T.S. Kelso",
  "about": "ISS and Tiangong with their modules and visiting vehicles. Tracks computed by the server with sunlit and SAA colouring."},
 {"id": "visual", "label": "Brightest satellites", "kind": "observation", "objects": 156, "default_on": false,
  "elements_age_h": 135.7, "quality": "recorded", "credit": "CelesTrak (celestrak.org), Dr. T.S. Kelso",
  "about": "The satellites bright enough to see with the naked eye."},
 {"id": "gps-ops", "label": "GPS", "kind": "navigation", "objects": 32, "default_on": false,
  "elements_age_h": 141.4, "quality": "recorded", "credit": "CelesTrak (celestrak.org), Dr. T.S. Kelso",
  "about": "Operational GPS constellation (USA)."},
 {"id": "galileo", "label": "Galileo", "kind": "navigation", "objects": 32, "default_on": false,
  "elements_age_h": 149.3, "quality": "recorded", "credit": "CelesTrak (celestrak.org), Dr. T.S. Kelso",
  "about": "Galileo navigation constellation (EU)."},
 {"id": "glo-ops", "label": "GLONASS", "kind": "navigation", "objects": 26, "default_on": false,
  "elements_age_h": 145.2, "quality": "recorded", "credit": "CelesTrak (celestrak.org), Dr. T.S. Kelso",
  "about": "Operational GLONASS constellation (Russia)."},
 {"id": "geo", "label": "Geostationary ring", "kind": "comms", "objects": 568, "default_on": false,
  "elements_age_h": 134.7, "quality": "recorded", "credit": "CelesTrak (celestrak.org), Dr. T.S. Kelso",
  "about": "Geostationary weather and communications satellites."},
 {"id": "starlink", "label": "Starlink", "kind": "comms", "objects": 10621, "default_on": false,
  "elements_age_h": 139.3, "quality": "recorded", "credit": "CelesTrak (celestrak.org), Dr. T.S. Kelso",
  "about": "SpaceX Starlink broadband constellation."},
 {"id": "active", "label": "Every active satellite", "kind": "scenery", "objects": 15883, "default_on": false,
  "elements_age_h": 138.1, "quality": "recorded", "credit": "CelesTrak (celestrak.org), Dr. T.S. Kelso",
  "about": "Every active satellite CelesTrak tracks (includes all of the groups above)."}
]
```
`kind` is `crewed`, `navigation`, `comms`, `observation` or `scenery`.

## GET /orbits/iss.tle
What `useIssTrack` already fetches (`${BASE_URL}orbits/iss.tle`). Three lines of text, `Content-Type: text/plain; charset=utf-8`, plus `X-Elements-Epoch`, `X-Quality` and `Cache-Control: max-age=3600`. This is the newest stored ISS elements (14 Nov), including when the Python server is the thing serving `web/dist`.
```
ISS (ZARYA)
1 25544U 98067A   26318.17412740  .00009423  00000-0  17665-3 0  9992
2 25544  51.6324 277.8691 0007369  23.7540 336.3788 15.49365732595001
```
`GET /orbits/tiangong.tle` is the same for `CSS (TIANHE)`, epoch `2026-11-09T15:21:57Z`.
`GET /orbits/nope.tle` → `404` with the same detail as an unknown station.

## Your ISS track today
The app does not call `/api/orbit` yet. What it does call:

| Your code | What it expects | What to do |
|---|---|---|
| `Globe.tsx` `useIssTrack` | `fetch(BASE_URL + 'orbits/iss.tle')`, `r.ok`, 3-line text | When this server serves the app, that path is the 14 Nov elements. On vite dev, and in a static build, copy `server/out/orbits/iss.tle` to `web/public/orbits/iss.tle` after a build. Vite proxies `/api` only. |
| `Globe.tsx` `propagate` | two-body, no J2 | The ISS node moves about 5 deg a day, so a 6-day-old TLE draws the track far off. Draw `/api/orbit` points, or ask before adding `satellite.js`. |
| `http.ts` `getJson` | 2xx, content-type contains `json`, 4000 ms | Every `/api/orbit*` route qualifies. Big groups need `getJson(path, 20000)`. |
| `ll` in `Globe.tsx` and `globe-lab/frame.ts` | lon 0 → +X, 90°E → −Z, `r` in Earth radii | Geodetic lat/lon, lon −180..180. `r = 1 + alt_km / 6371`, inside the Earth-fixed group. |
| `live.ts` `getSources` | `/api/health` `.sources[x].{quality, rows, at}` | `celestrak.rows` is 0. Trust `GET /api/orbit/groups` for counts. |

## Drawing a track
1. `GET /api/orbit?subject=iss&minutes=180&step_s=30`.
2. For each point, `ll(lat, lon, 1 + alt_km / 6371)` in the Earth-fixed group.
3. Colour the vertex from `sunlit` and `in_saa` (a point can be both dark and inside the SAA).
4. Put the crew pin on `now`.

## Toggling a layer
1. `GET /api/orbit/groups` once, and build one toggle per row. `stations` starts on.
2. The first time a layer is switched on, `GET /api/orbit/elements?group=<id>` once. Keep the lines.
3. Propagate in a Web Worker about once a second. `satellite.js` does this; it is a new dependency, so ask Tomas first. The station layers can skip that and use `GET /api/orbit` points instead.
4. One `InstancedMesh` or `Points` per layer.
5. Dedupe by `norad`. `active` contains every other group.

## Offline, no server
`python -m server.build` writes `server/out/orbits/stations.json` plus `iss.tle` and `tiangong.tle`. Copy `stations.json` to `web/public/samples/orbits/stations.json`. Each station has its `line1` / `line2`, a 3-hour `track` (`points` with the same fields as `/api/orbit`), and a `day` summary. The file also carries `credit`, `model` and `saa.polygon` (`[lat, lon]` vertices). The copy steps for the `.tle` files are in `docs/backend/NOTES-FOR-EMILE.md`.

## Credit
Show this on the globe. It is the `credit` field of every orbit response:

`CelesTrak (celestrak.org), Dr. T.S. Kelso`

A footer line can read `Orbital elements: CelesTrak (celestrak.org), Dr. T.S. Kelso`. US-government-origin data, no licence, citation requested.
