# Assets: sources and licences

Everything below ships in `public/` and loads from the app's own origin (no runtime fetches).

| Asset | File(s) in `public/` | Source | Licence / credit |
|---|---|---|---|
| Earth day | `refs/earth/blue-marble-4k.jpg` | NASA Earth Observatory, Blue Marble Next Generation (July 2004) | Public domain. NASA Earth Observatory / Reto Stockli |
| Earth night lights | `refs/earth/black-marble-2k.jpg` | NASA Black Marble 2016 | Public domain. NASA Earth Observatory |
| Clouds, ocean specular | `refs/earth/clouds-2k.jpg`, `refs/earth/specular-2k.jpg` | Solar System Scope textures | CC BY 4.0, Solar System Scope |
| Star sky | `refs/space/starmap-4k.jpg` | NASA SVS Deep Star Maps 2020 (svs.gsfc.nasa.gov/4851) | Public domain. NASA/Goddard SVS; Gaia DR2: ESA/Gaia/DPAC |
| Moon colour + elevation | `refs/space/moon-color-2k.jpg`, `refs/space/moon-height-1k.jpg` | NASA SVS CGI Moon Kit (svs.gsfc.nasa.gov/4720) | Public domain. NASA SVS; LRO LROC and LOLA teams |
| Body | `models/body.glb` | BodyParts3D 4.0 via human-atlas | CC BY 4.0, DBCLS |
| Intro clip | `loading/loading-crew-*` | NASA, KSC-20190225-MH-SPX01-0001 | CC0 (public domain) |
| ISS orbit | `orbits/iss.tle` | CelesTrak (celestrak.org), Dr. T.S. Kelso | US-government-origin data, citation requested |
| Crew, storm, cabin data | `data/*.json`, `samples/*.json` | e^x team (simulated crew), NASA CCMC DONKI, ISS Live! | Simulated crew data, not real astronaut records |

Sound is synthesized in the browser (WebAudio); no audio files.
