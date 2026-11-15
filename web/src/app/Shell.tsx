// App shell: editorial top bar (01 Body, 02 Cabin), crew switcher, mission facts,
// a vertical caption on the right edge, and the footer with every disclaimer.
import { motion, useReducedMotion } from 'framer-motion';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ANATOMY_CREDIT, DISCLAIMERS } from '../components/Footer';
import { useMissionData, useMissionStore } from '../data/store';
import { Shape } from '../ui/status';
import './shell.css';

const SECTIONS = [
  { no: '01', name: 'Body', to: '/body' },
  { no: '02', name: 'Cabin', to: '/cabin' },
] as const;

export function Shell() {
  const { data, loadState, error } = useMissionData();
  const crewId = useMissionStore((s) => s.selectedCrewId);
  const setCrew = useMissionStore((s) => s.setSelectedCrewId);
  const environment = useMissionStore((s) => s.environment);
  const still = useReducedMotion();
  const { pathname } = useLocation();
  const crew = data?.crew;
  const day = crew ? Math.round((Date.parse(crew.mission.today) - Date.parse(crew.mission.start_date)) / 86_400_000) + 1 : null;
  // One key per section, so switching crew or opening a plate does not replay the entrance.
  const section = pathname.startsWith('/cabin/replay') ? 'replay' : pathname.split('/')[1] || 'body';

  return (
    <div className="app">
      <header className="app-nav">
        <p className="app-brand">
          e<sup>x</sup>
          <span>Crew Station</span>
        </p>
        <nav className="app-sections" aria-label="Sections">
          {SECTIONS.map((s) => (
            <NavLink key={s.to} to={s.to} className={({ isActive }) => `app-section fx-press${isActive ? ' is-active' : ''}`}>
              <span className="app-section-no">{s.no}</span>
              {s.name}
            </NavLink>
          ))}
        </nav>
        {crew && (
          <div className="app-crew" role="tablist" aria-label="Crew">
            {crew.crew.map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={c.id === crewId}
                className={`app-crew-btn fx-press${c.id === crewId ? ' is-active' : ''}`}
                onClick={() => setCrew(c.id)}
              >
                <Shape status={c.status.overall} size={14} />
                {c.name.split(' ').slice(-1)[0]}
              </button>
            ))}
          </div>
        )}
        {crew && environment && (
          <p className="app-mission fx-mono">
            <span>{crew.environments[environment].label}</span>
            <span>Day {day}</span>
            <span>{crew.mission.today}</span>
          </p>
        )}
      </header>
      <main className="app-main">
        {loadState === 'error' ? (
          <p className="app-error">{error}</p>
        ) : (
          <motion.div
            key={section}
            className="app-page"
            initial={still ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <Outlet />
          </motion.div>
        )}
        <p className="app-edge" aria-hidden="true">
          {DISCLAIMERS[0]} <span>/</span> {DISCLAIMERS[1]}
        </p>
      </main>
      <footer className="app-foot">
        <p>{[...DISCLAIMERS, ...(data ? [`Space weather data: ${data.storm.meta.data_credit}`, `Model: ${data.storm.meta.model}`] : [])].join('  /  ')}</p>
        <p>{ANATOMY_CREDIT}</p>
      </footer>
    </div>
  );
}
