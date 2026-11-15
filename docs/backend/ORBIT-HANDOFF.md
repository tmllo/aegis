# Orbit lane handoff (2026-11-15, written mid-task so another agent can finish)

Worktree `C:\dev\aegis-orbit`, branch `lane/orbit`, based on origin/main `fa5c1cf`. Design: `docs/backend/ORBIT.md`. Rules: `docs/backend/AGENT-RULES.md`.

## State
| Step | Status |
|---|---|
| sgp4 added to `server/requirements.txt` (approved) | done, committed |
| `server/orbit/schema.sql` (orbit_object, orbit_group, orbit_membership, orbit_elements; one row per satellite) | done |
| `server/orbit/records.py` (ElementSet, OrbitBatch with dedupe by norad and newest epoch, TLE parsing) | done |
| `server/orbit/repo.py` (all SQL under store.lock) | done |
| `server/catalog/orbit.yaml` (8 groups, station links iss=25544 / tiangong=48274, NICER SAA polygon with basis and refs, credit, min_fetch_interval_h 6) | done |
| `server/catalog/sources.d/orbit.yaml` (source celestrak) | done |
| `server/adapters/celestrak.py` (recorded: 8 TLE files + newer ISS GP JSON; live `AEGIS_CELESTRAK=live`: each group at most every 6 h, cache in server/data/celestrak, fallback cached then recorded) | done |
| `server/orbit/engine.py` (SGP4, WGS84 geodetic, sunlit with a cylindrical shadow, SAA point-in-polygon, next events, day summary) | done (written by a sub-agent, verified: 15.49 orbits a day, max geodetic latitude 51.79, 15 sunrises, 10 SAA passes) |
| `server/orbit/plugin.py` (drains ADAPTER.pending into the tables, idempotent, writes the view) | done |
| `server/orbit/api.py`: /api/orbit, /api/orbit/elements (gzip, Content-Type application/json), /api/orbit/day, /api/orbit/groups, plus **/orbits/{iss,tiangong}.tle** | done |
| `server/views/orbit_stations.py` writes `server/out/orbits/stations.json` + `iss.tle`, `tiangong.tle` | done |
| `server/tests/test_orbit.py`: 16 tests incl. replays of Emile's getJson and useIssTrack | done, green |
| Full gates (`python -m server.build`, `python -m pytest server/tests -q`) | green at commit 66b115c (build: 4x identical, rejected=0; 114 tests passed before the replay test was added) |
| `docs/backend/ORBIT-API.md` + PROPOSED entry in `contracts/CHANGELOG.md` | **a sub-agent was writing these; check whether the files exist. If missing, write them from the brief below** |
| Rule review by a fresh sub-agent (AGENT-RULES section 7) | **started; its findings are not applied yet. If lost, re-run it: give it AGENT-RULES.md + `git diff origin/main...HEAD`** |
| Push: `git fetch origin && git rebase origin/main`, gates, `git push origin HEAD:main` | **not done** |
| Section 8 report to the human | **not done** |

## Deliberate deviations (keep them, or resolve via REQUESTS.md)
1. Elements are not core records, so `celestrak.load()` returns an empty core Batch (one run row, rows=0) and leaves `ADAPTER.pending`; `server/orbit/plugin.py` stores them. Side effect: `/api/health` `sources.celestrak.rows` is 0.
2. celestrak cadence is `on build`, not `6 h`: `server/tests/test_live.py` (live lane) asserts the refreshed list is exactly `["isslive"]`. REQUESTS.md entry filed. Once that test is fixed, set cadence to `6 h` in `sources.d/orbit.yaml`.
3. No `tiangong` subject: a habitat subject leaks into `crew_data.json` `environments` and breaks the identical gate. REQUESTS.md entry filed. Station links stay in `orbit.yaml` `stations`.
4. The SAA ref "Schaefer et al. 2016" (drift rates) was not opened by the research agent. Verify its title and authors or drop it (`orbit.yaml` saa.refs).

## Emile's frontend (origin/crew-station, last checked at 761afc0) vs the orbit lane
His app calls **no /api/orbit endpoint yet**. What touches this lane:
| His side | What it expects | Our status |
|---|---|---|
| `web/src/console/Globe.tsx` 257-289 `useIssTrack` | `fetch(BASE_URL + 'orbits/iss.tle')`, `r.ok`, 3-line TLE text (parseTle 226-237) | **Was a mismatch** (when the server serves web/dist he got his stale 9 Nov copy). **Fixed**: GET /orbits/iss.tle serves the newest stored elements (14 Nov). Test `test_replays_emiles_use_iss_track_fetch`. For vite dev and static builds he must copy `server/out/orbits/iss.tle` to `web/public/orbits/iss.tle` |
| `Globe.tsx` 239-255 `propagate` | two-body propagation, no J2 | Not a request mismatch, but a physics one: the ISS node drifts about 5 deg a day, so a 6-day-old TLE puts the track far off. Advice for him: draw `/api/orbit` points or use satellite.js (a new dependency, so ask first) |
| `web/src/data/http.ts` getJson | 2xx + content-type containing "json", default timeout 4000 ms | All orbit endpoints return application/json, including gzip ones. Big layers need `getJson(path, 20000)` |
| `Globe.tsx` `ll(lat, lon, r)` and `globe-lab/frame.ts` `ll` | lon 0 -> +X, 90E -> -Z, r in Earth radii | Our lat/lon is geodetic, lon in -180..180. Track r = 1 + alt_km/6371, placed inside the Earth-fixed group (not ORBIT_TILT) |
| `web/src/data/live.ts` getSources | `/api/health` `.sources[x].{quality, rows, at}` | celestrak shows rows=0 (deviation 1). No screen uses getSources yet |
| `vite.config.ts` | proxies only `/api` | /orbits/*.tle only reaches our server in a production build served by us |

## Brief for ORBIT-API.md (if the docs sub-agent's file is missing)
Sections: honesty (elements_age_h, quality, approximate eclipse and SAA, NICER 2017 contour drifting about 3 deg west by 2026); the endpoints with real example responses (TestClient with AEGIS_DB=":memory:", AEGIS_REFRESH=0); "your ISS track today" (the table above); drawing a track with ll (r = 1 + alt/6371, Earth-fixed group, colour each vertex by sunlit and in_saa, `now` = crew pin); toggling a layer (GET groups -> fetch elements once on first toggle -> Web Worker with satellite.js propagating about once a second -> one InstancedMesh/Points per layer -> dedupe by norad, since active contains everything); offline stations.json; credit "Orbital elements: CelesTrak (celestrak.org), Dr. T.S. Kelso".
CHANGELOG: PROPOSED 2026-11-15, orbit lane: new endpoints above + `/orbits/{iss,tiangong}.tle` + static `samples/orbits/stations.json`; no change to storm_forecast.json or crew_data.json.

## To finish
1. Apply the reviewer's serious findings (if any), rerun `python -m pytest server/tests/test_orbit.py -q`.
2. Make sure ORBIT-API.md and the CHANGELOG entry exist, then commit.
3. `git fetch origin && git rebase origin/main`; then `python -m server.build` and `python -m pytest server/tests -q`; then `git push origin HEAD:main`.
4. Report in the AGENT-RULES section 8 format, plus the mismatch table above.
