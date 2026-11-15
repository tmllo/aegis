# AEGIS

A crew health monitor with a solar-radiation early warning, for NASA Space Apps 2026.

**Challenge:** Create Health Monitoring Software for Astronauts on Space Missions.

Astronauts check their own vitals against their own baseline, and the app warns before a solar particle storm using a model trained on NASA space-weather data. Crew vitals in the demo are simulated. The Inspiration4 lab panels are published NASA OSDR data (OSD-575 and OSD-569). This is not medical advice.

## Run the demo

From the repo root, with Python 3.12 and Node.js installed.

```bash
pip install -r server/requirements.txt
uvicorn server.api.app:app --port 8000
```

The API is at <http://127.0.0.1:8000> (`/api/health`, `/data/crew_data.json`, `/data/storm_forecast.json`).

The app:

```bash
cd web
npm ci
npm run dev
```

That serves the app at <http://127.0.0.1:5630>.

To serve the built app from the API instead, stay in `web`, run `npm run build`, then start uvicorn as above. It serves `web/dist` at <http://127.0.0.1:8000>.

## Credits

Official challenge resources:

- [NASA Human Research Program: 5 Hazards of Human Spaceflight](https://www.nasa.gov/hrp/hazards/)
- [Risks of Human Spaceflight](https://www.nasa.gov/hrp/risks/)
- [Ongoing HRP research](https://www.nasa.gov/hrp/ongoing-hrp-research/)
- [Canadian Space Agency: Monitoring radiation for astronaut health](https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp)

Data:

- NASA CCMC DONKI (flares, CMEs and solar energetic particle events)
- NASA Open Science Data Repository, OSD-575 and OSD-569 (Inspiration4 blood panels)
- NASA ISS Live! (cabin telemetry)
- CelesTrak (orbital elements; celestrak.org, Dr. T.S. Kelso)

Where each number on screen comes from: [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md).

## AI disclosure

Claude Code, Cursor (Grok) and Grok Bot were used.

## For the team

Product, demo script and split: [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md). How the research, model, contract and app connect: [docs/MAP.md](docs/MAP.md).
