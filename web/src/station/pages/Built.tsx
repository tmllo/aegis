// What we built: one row per section of e^x, each tied to the problem it solves and to what backs it:
// the server endpoint (Tomas's data core), the research claim (docs/THESIS-DETAILS.md section 11, verified
// wording only) and the code that does the work. Static text: no data loading on this page.
import { ANATOMY_CREDIT, DISCLAIMERS } from '../../components/Footer';
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
    name: 'Earth support',
    solves: 'When a result goes to the crew and when to the Earth support team, with the note prefilled.',
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

/** Where every number comes from (counts from ml/results/metrics.md, anomaly_metrics.md and the data files, 15 Nov). */
const DATA: { src: string; what: string; n: string; kind: 'Real' | 'Simulated' }[] = [
  { src: 'NASA CCMC DONKI', what: 'Solar flares, eruptions and proton events, Apr 2010 to Nov 2026', n: '3,407 flares', kind: 'Real' },
  { src: 'NASA OSDR OSD-575', what: 'Inspiration4 blood labs, each against that person’s own pre-flight baseline', n: '4 crew', kind: 'Real' },
  { src: 'NASA JPL SMAP and MSL', what: 'Spacecraft telemetry with labelled faults, to tune and test the cabin detector', n: '81 channels, 104 faults', kind: 'Real' },
  { src: 'Crew readings', what: '11 daily readings per astronaut, modelled on the CSA Bio-Monitor channel set', n: '3 crew, 75 days', kind: 'Simulated' },
  { src: 'Cabin telemetry', what: 'CO₂, oxygen, pressure, temperature and humidity, hourly, with 3 planted faults', n: '1,800 hours', kind: 'Simulated' },
];
/** How each model learns: train, tune and test never share data. */
const LEARN: { name: string; rows: [string, string][] }[] = [
  {
    name: 'Radiation forecast',
    rows: [
      ['Predicts', 'The chance that a flare is followed by a proton storm (GOES >10 MeV). Never a dose'],
      ['Inputs', 'Flare size, solar longitude, linked eruption, eruption speed'],
      ['Model', 'Logistic regression, chosen over gradient boosting on validation'],
      ['Train', '484 flares, 2010‑2021'],
      ['Tune', '540 flares, 2022‑2023: model choice and both alert thresholds'],
      ['Test', '1,528 flares, 2024‑2026, scored once after freezing'],
      ['Result', '16 of 17 storms warned, 41% better than the long-run storm rate (Brier skill)'],
    ],
  },
  {
    name: 'Cabin fault detector',
    rows: [
      ['Predicts', 'Whether a channel has left its own expected pattern'],
      ['Model', 'Ridge forecast of the next value; the alert is the size of the miss'],
      ['Tune', 'NASA MSL only: 27 channels, 36 labelled faults'],
      ['Test', 'NASA SMAP, scored once: 54 channels, 68 labelled faults'],
      ['Result', '33 of 68 faults found, 43% of alerts real (a plain 3‑sigma rule: 22%)'],
      ['Honest', 'A planted fault it missed is shown as Missed on the Cabin page'],
    ],
  },
];
/** What was put on a common scale, and how. */
const NORM: [string, string][] = [
  ['Crew readings', 'Scored against that astronaut’s own first 14 mission days, on a 3-day average, so one odd reading does not raise an alert'],
  ['Flare size and eruption speed', 'Log scale, then standardised; a missing value takes the median'],
  ['Solar longitude', 'One convention, west positive; one mis-stored 2013 position corrected'],
  ['Storm label', 'M and X flares only; one definition of a storm (GOES >10 MeV); flares inside a running storm removed: 3,407 to 2,552'],
  ['Self-reports', 'Mood, stress, energy, sleep and connection on one 1 to 5 scale with a word per step'],
  ['Every source', 'One catalogue of metrics and units, one record per reading, each marked live, recorded or simulated'],
];
const VALUE: { t: string; s: string }[] = [
  { t: 'Earlier', s: 'A storm warning hours ahead, and a health drift flagged days before it is an emergency' },
  { t: 'Personal', s: 'Your own normal, not a population range: under 2 false alarms a month per astronaut' },
  { t: 'Autonomous', s: 'Works with no link to Earth; says what the crew handles and what goes to Earth support' },
  { t: 'Honest', s: 'Every number carries its source and whether it is real, recorded or simulated' },
];
const AI: [string, string][] = [
  ['Used for', 'Claude (Anthropic), through Claude Code, wrote most of the web app code and helped research and draft documents from the team’s prompts'],
  ['The team’s own', 'The concept, the data choices, the model design, the validation and every decision'],
  ['Not used for', 'Any alert, score or forecast. The radiation model is a logistic regression the team trained and validated'],
  ['One exception', 'The optional Mind chat calls Google Gemini only if a key is pasted on the device; otherwise replies are scripted. Labelled AI demo, not medical advice; it never decides escalation'],
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
            <p>It says what to do and who to tell: yourself, the crew medic or the Earth support team. It also warns of solar radiation storms hours before they arrive.</p>
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

          <section className="bt-sect">
            <h2>Value</h2>
            <dl className="bt-value">
              {VALUE.map((v) => (
                <div key={v.t}>
                  <dt>{v.t}</dt>
                  <dd>{v.s}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="bt-sect">
            <h2>Data collected</h2>
            <table className="bt-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>What</th>
                  <th>Size</th>
                  <th>Kind</th>
                </tr>
              </thead>
              <tbody>
                {DATA.map((d) => (
                  <tr key={d.src}>
                    <td>
                      <b>{d.src}</b>
                    </td>
                    <td>{d.what}</td>
                    <td className="bt-num">{d.n}</td>
                    <td className={d.kind === 'Real' ? 'bt-real' : 'bt-sim'}>{d.kind}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="bt-sect">
            <h2>How the models learn</h2>
            <div className="bt-two">
              {LEARN.map((m) => (
                <div key={m.name}>
                  <h3>{m.name}</h3>
                  <dl className="bt-kv">
                    {m.rows.map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </section>

          <section className="bt-sect">
            <h2>What we normalised</h2>
            <dl className="bt-kv is-wide">
              {NORM.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="bt-sect">
            <h2>AI acknowledgement</h2>
            <dl className="bt-kv is-wide">
              {AI.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="bt-credits">
            <h2>Credits</h2>
            <ul>
              <li>{DISCLAIMERS[0]}</li>
              <li>{DISCLAIMERS[1]}</li>
              <li>Space weather data: NASA CCMC DONKI</li>
              <li>{ANATOMY_CREDIT}</li>
              <li>Suit: Apollo 11 A7L, Smithsonian National Air and Space Museum 3D scan, CC0 (3d.si.edu); patches and flag painted out</li>
              <li>Night sky: NASA SVS Deep Star Maps 2020, public domain (svs.gsfc.nasa.gov/4851)</li>
              <li>Background: Earth filmed from the International Space Station, NASA JSC "Earth from Space in 4K, Expedition 65", public domain</li>
              <li>Studio light for the suit render: Poly Haven studio_small_09 HDRI, CC0</li>
            </ul>
          </section>
        </div>
      }
    />
  );
}
