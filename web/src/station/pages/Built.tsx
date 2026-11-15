// What we built: one row per section of e^x, each tied to the problem it solves and to what backs it:
// the server endpoint (Tomas's data core), the research claim (docs/THESIS-DETAILS.md section 11, verified
// wording only) and the code that does the work. Static text: no data loading on this page.
import { Link } from 'react-router-dom';
import { Page } from '../frame';
import '../built.css';

type Proof = { k: 'Backend' | 'Research' | 'Code' | 'Data'; v: string };
const ROWS: { to: string; name: string; solves: string; proof: Proof[] }[] = [
  {
    to: '/check',
    name: 'Check in',
    solves: 'Problems surface between monthly exams. One minute a day scores each reading against your own usual range.',
    proof: [
      { k: 'Code', v: 'core/scoring.ts, tested: usual range = first 14 mission days' },
      { k: 'Backend', v: 'POST /api/observations, GET /api/checkin' },
      { k: 'Research', v: 'ISS crews average 6.1 h sleep vs 8.5 h scheduled' },
    ],
  },
  {
    to: '/body',
    name: 'Me',
    solves: 'Five body systems on one 3D body, 28 days of each vital, flagged days in colour.',
    proof: [
      { k: 'Data', v: 'crew_data.json, simulated crew (Tomas)' },
      { k: 'Research', v: 'Bone loss about 1% a month at weight-bearing sites without exercise' },
      { k: 'Code', v: 'station/model.ts builds every view from the same data' },
    ],
  },
  {
    to: '/care',
    name: 'Care',
    solves: 'Guidance on treatment: what to do, then re-measure to see whether it worked.',
    proof: [
      { k: 'Backend', v: 'GET/POST /api/tasks, /api/notes' },
      { k: 'Code', v: 'Countermeasure loop: detected, countermeasure, re-measure, outcome' },
    ],
  },
  {
    to: '/surgeon',
    name: 'Surgeon',
    solves: 'When a result goes to the crew and when to the flight surgeon, with the note prefilled.',
    proof: [
      { k: 'Research', v: 'NASA-STD-3001 caution and warning classes' },
      { k: 'Code', v: 'core/alarm.ts: Emergency only from a measured event, a forecast raises Warning at most' },
    ],
  },
  {
    to: '/radiation',
    name: 'Radiation',
    solves: 'The hazard the crew cannot feel: a proton-storm warning hours ahead, and dose against the career limit.',
    proof: [
      { k: 'Research', v: 'Held-out 2024-2026: warning caught 16 of 17 storms, 1 false alarm a month, median 3.8 h ahead (2.5 h outside May 2024)' },
      { k: 'Research', v: 'May 2024: warned about 39 h before the 10 May onset' },
      { k: 'Data', v: 'NASA DONKI flares, storm_forecast.json (Tomas)' },
      { k: 'Research', v: 'NASA-STD-3001: career effective dose < 600 mSv' },
    ],
  },
  {
    to: '/mind',
    name: 'Mind',
    solves: 'Isolation and confinement, one of NASA’s five hazards: five taps a day, private by default.',
    proof: [
      { k: 'Backend', v: 'Mind API: GET /api/wellbeing, /api/activities' },
      { k: 'Code', v: 'Offline: answers stay on the device and sync when the server answers' },
    ],
  },
  {
    to: '/cabin',
    name: 'Cabin',
    solves: 'Habitat faults that can make the crew ill, linked to crew readings as a possible environmental cause.',
    proof: [
      { k: 'Research', v: 'Detector validated on NASA SMAP/MSL telemetry; habitat telemetry simulated' },
      { k: 'Backend', v: 'GET /api/cabin/catalog, habitat_telemetry.json (contract v2.2)' },
    ],
  },
  {
    to: '/crew',
    name: 'Crew',
    solves: 'The medic’s view: every member and every hazard on one screen.',
    proof: [
      { k: 'Backend', v: 'GET /api/orbit, /orbits/{crew}.tle for the Earth seen from the base' },
      { k: 'Code', v: 'Health data private by default: each astronaut sees their own on Me' },
    ],
  },
];

/** Results, verified wording only (THESIS-DETAILS section 11). */
const FOUND: { n: string; t: string; s: string }[] = [
  { n: '16 of 17', t: 'storms warned', s: 'Held-out 2024\u20112026, 1 false alarm a month' },
  { n: '3.8 h', t: 'median warning ahead', s: '2.5 h outside May 2024' },
  { n: '39 h', t: 'warning before May 2024', s: 'Before the 10 May onset' },
  { n: 'Under 2', t: 'false alarms a month', s: 'Per astronaut, with the 3-day rule (from about 5); 6,000 simulated missions' },
];
/** What is behind the code (counted in the repo, 15 Nov). */
const BUILT: { n: string; t: string }[] = [
  { n: '14 years', t: 'NASA DONKI flares to train on (2010\u20112023)' },
  { n: '23', t: 'server endpoints in the data core' },
  { n: '152', t: 'automated tests (57 app, 95 server)' },
  { n: '0', t: 'AI in alerts or scoring' },
];

export default function Built() {
  return (
    <Page
      className="bt-page"
      title="What we built"
      object={
        <div className="bt-wrap">
          <div className="bt-intro">
            <p>Far from Earth, the crew is its own first doctor. e^x checks each astronaut against their own normal, every day, in about a minute.</p>
            <p>It says what to do and who to tell: yourself, the crew medic or the flight surgeon. It also warns of solar radiation storms hours before they arrive.</p>
            <p>It runs fully offline on the station. Alerts come from tested rules and a model trained on real NASA space-weather data.</p>
          </div>
          <dl className="bt-big">
            {FOUND.map((f) => (
              <div key={f.n}>
                <dt>{f.n}</dt>
                <dd>
                  <b>{f.t}</b>
                  <span>{f.s}</span>
                </dd>
              </div>
            ))}
          </dl>
          <dl className="bt-big is-small">
            {BUILT.map((f) => (
              <div key={f.t}>
                <dt>{f.n}</dt>
                <dd>
                  <b>{f.t}</b>
                </dd>
              </div>
            ))}
          </dl>
        <ol className="bt">
          {ROWS.map((r, i) => (
            <li key={r.to}>
              <Link to={r.to} className="bt-row">
                <span className="bt-n">{String(i + 1).padStart(2, '0')}</span>
                <span className="bt-main">
                  <b>{r.name}</b>
                  <span className="bt-solves">{r.solves}</span>
                </span>
                <dl className="bt-proof">
                  {r.proof.map((p) => (
                    <div key={p.v}>
                      <dt>{p.k}</dt>
                      <dd>{p.v}</dd>
                    </div>
                  ))}
                </dl>
              </Link>
            </li>
          ))}
        </ol>
        </div>
      }
    />
  );
}
