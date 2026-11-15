/*
 * Plan (Flight Record, environment surface)
 * Colours: ink-0 #14130F page, ink-1 #1B1913 bar, rule, paper #F4F1EA, paper-2 #B3B1A6, paper-3 #918F84. Status colours unused: a place is not a status.
 * Type: Instrument Serif for the place name (112) and the delay numeral (120); IBM Plex Sans 16-24 for rows; JetBrains Mono 14 for units and captions.
 * Space: 8 px steps (8, 12, 16, 24, 32, 48); 48 px page margin; 96 px bottom bar with the four places as the navigation.
 * Layout: left column (index, name, one line, what changes), centre plate (the focal point), right column (delay hero, facts).
 * Memorable element: the signal arc from craft to Earth; the dot travels in real time when the delay is seconds.
 * References: editorial screenshot (index 01/04, very large serif against small text), Flight Record body (plates, bottom bar), cockpit globe (one bright path on a quiet object).
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { DISCLAIMERS } from '../../components/Footer';
import { useMissionData, useMissionStore } from '../../data/store';
import type { EnvironmentId } from '../../data/types';
import type { ConceptMeta } from '../../registry';
import earthImg from './plates/earth.webp';
import { ORDER, PLACES, signalDuration, signalPath } from './places';
import './environment.css';

export const meta: ConceptMeta = {
  title: 'Environment',
  direction: 'Flight Record',
  surface: 'Crew Console',
};

const IMAGERY_CREDIT =
  'Imagery: NASA SVS CGI Moon Kit (LRO), NASA Blue Marble and Black Marble, NASA SVS Deep Star Maps 2020, Solar System Scope Mars and clouds (CC BY 4.0). NASA does not endorse this project.';

const REDUCED = '(prefers-reduced-motion: reduce)';
function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(REDUCED);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(REDUCED).matches,
  );
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1;
}

export default function EnvironmentConcept() {
  const { data, loadState, error } = useMissionData();
  const environment = useMissionStore((s) => s.environment);
  const setEnvironment = useMissionStore((s) => s.setEnvironment);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const reduced = useReducedMotion();

  const go = useCallback(
    (id: EnvironmentId, focus = false) => {
      setEnvironment(id);
      if (focus) tabs.current[ORDER.indexOf(id)]?.focus();
    },
    [setEnvironment],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!environment || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      if (e.target instanceof HTMLInputElement) return;
      const i = ORDER.indexOf(environment);
      const next = ORDER[(i + (e.key === 'ArrowRight' ? 1 : ORDER.length - 1)) % ORDER.length];
      go(next, true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [environment, go]);

  if (loadState === 'error') return <p className="ev-error">Mission data did not load: {error}. Check web/public/data.</p>;
  if (!data || !environment) return <div className="ev-root" aria-busy="true" />;

  const crew = data.crew;
  const place = PLACES[environment];
  const env = crew.environments[environment];
  const index = ORDER.indexOf(environment) + 1;
  const path = signalPath(place);
  const signal = signalDuration(place);
  const day = daysBetween(crew.mission.start_date, crew.mission.today);

  return (
    <div className="ev-root">
      <header className="ev-top">
        <p className="ev-brand">
          e<sup>x</sup>
          <span>Crew Station</span>
        </p>
        <p className="ev-mission ev-mono">
          <span>{crew.mission.name}</span>
          <span>Day {day}</span>
          <span>{crew.mission.today}</span>
        </p>
      </header>

      <main className="ev-main">
        <section className="ev-left" aria-live="polite">
          <p className="ev-index">
            {String(index).padStart(2, '0')}
            <small>/{String(ORDER.length).padStart(2, '0')}</small>
          </p>
          <h1 className="ev-name" key={`name-${environment}`}>
            {env.label}.
          </h1>
          <p className="ev-line" key={`line-${environment}`}>
            {place.line}
          </p>

          <dl className="ev-changes" key={`changes-${environment}`}>
            {place.changes.map((c) => (
              <div key={c.label}>
                <dt>{c.label}</dt>
                <dd>{c.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <figure className="ev-plate" aria-label={`${env.label}: signal path from ${place.craft.name.toLowerCase()} to Earth`}>
          <img key={place.plate} className="ev-img" src={place.plate} alt="" draggable={false} />
          <svg className="ev-overlay" viewBox="0 0 1600 1200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <g key={`sig-${environment}`}>
              <path id={`ev-path-${environment}`} className="ev-arc" d={path} pathLength={1} />
              {place.earth && (
                <image
                  href={earthImg}
                  x={place.earth.x - place.earth.r}
                  y={place.earth.y - place.earth.r}
                  width={place.earth.r * 2}
                  height={place.earth.r * 2}
                />
              )}
              <circle className="ev-craft" cx={place.craft.x} cy={place.craft.y} r={9} />
              <text className="ev-craft-label" x={place.craft.x + 22} y={place.craft.y + 6}>
                {place.craft.name}
              </text>
              {place.earth && (
                <text className="ev-craft-label" x={place.earth.x - place.earth.r - 18} y={place.earth.y + 6} textAnchor="end">
                  Earth
                </text>
              )}
              {reduced ? null : (
                <circle className="ev-signal" r={7}>
                  <animateMotion dur={`${signal.seconds}s`} repeatCount="indefinite" calcMode="linear" keyPoints="0;1" keyTimes="0;1">
                    <mpath href={`#ev-path-${environment}`} />
                  </animateMotion>
                </circle>
              )}
            </g>
          </svg>
          <figcaption className="ev-mono ev-caption">
            {reduced ? 'Signal path' : signal.realTime ? 'Signal shown in real time' : 'Signal shown as a time-lapse'}
          </figcaption>
        </figure>

        <section className="ev-right" key={`right-${environment}`}>
          <p className="ev-label">One way to Earth</p>
          <p className="ev-hero">
            <span className="ev-hero-num">{place.delay.value}</span>
            <span className="ev-hero-unit">{place.delay.unit}</span>
          </p>
          {place.delay.example && <p className="ev-mono ev-note">Example; 3 to 22 min over a mission</p>}
          <dl className="ev-facts">
            <div>
              <dt>Distance</dt>
              <dd>{place.distance}</dd>
            </div>
            <div>
              <dt>Gravity</dt>
              <dd>{place.gravity}</dd>
            </div>
            <div>
              <dt>Dose</dt>
              <dd>
                {env.dose_mSv_day} <small>mSv a day</small>
              </dd>
            </div>
            <div>
              <dt>Shelter</dt>
              <dd>{place.shelter}</dd>
            </div>
          </dl>
        </section>
      </main>

      <nav className="ev-bar" role="tablist" aria-label="Environment">
        {ORDER.map((id, i) => {
          const p = PLACES[id];
          const selected = id === environment;
          return (
            <button
              key={id}
              ref={(el) => (tabs.current[i] = el)}
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              className={`ev-tab${selected ? ' is-selected' : ''}`}
              onClick={() => go(id)}
            >
              <span className="ev-tab-main">
                <b>{crew.environments[id].label}</b>
                <small>
                  {p.delay.value} {p.delay.unit} to Earth
                </small>
              </span>
              {id === crew.mission.environment && <span className="ev-tab-hint">Mission</span>}
            </button>
          );
        })}
      </nav>

      <footer className="ev-foot">
        <p>{[...DISCLAIMERS, `Space weather data: ${data.storm.meta.data_credit}`, `Model: ${data.storm.meta.model}`].join('  /  ')}</p>
        <p>{IMAGERY_CREDIT}</p>
      </footer>
    </div>
  );
}
