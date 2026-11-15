// The station shell: six instrument pages in one frame (see frame.tsx), the e^x mark and the menu in
// the corners, the icon dock at the bottom, the storm-shelter alarm and toasts on top.
// Pages follow the challenge and NASA's Crew Health Care System: Crew status · Body · Daily check ·
// Care · Surgeon · Environment.
import { lazy, Suspense, useEffect, useState } from 'react';
import { alarmActive } from '../core/alarm';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ANATOMY_CREDIT, DISCLAIMERS } from '../components/Footer';
import type { Status } from '../data/types';
import Overview from './pages/Overview';
import { BRAND, LEVEL_STATUS, LINK_DELAY, RANK, fmtDay, useStationData } from './model';
import { useStation } from './state';
import { cue, Dot } from './ui';
import { Btn, roleOf } from './ds';
import { Dock } from './frame';
import { Demo } from './Demo';
import './station.css';
import './ds.css';
import './frame.css';
import './palette.css';
import './theme.css';

const Body = lazy(() => import('./pages/CrewHealth'));
const Check = lazy(() => import('./pages/Checkin'));
const Care = lazy(() => import('./pages/Care'));
const Surgeon = lazy(() => import('./pages/Surgeon'));
const Environment = lazy(() => import('./pages/Radiation'));
const Mind = lazy(() => import('./pages/Mind'));
const Cabin = lazy(() => import('./pages/Cabin'));
const Built = lazy(() => import('./pages/Built'));

const KEYS = ['/check', '/', '/mind', '/care', '/radiation', '/cabin'];

function Shell() {
  const { data, loadState, error, env, views, sw, day, queue } = useStationData();
  const alarm = useStation((s) => s.alarm);
  const setAlarm = useStation((s) => s.setAlarm);
  const sound = useStation((s) => s.sound);
  const toasts = useStation((s) => s.toasts);
  const setDemo = useStation((s) => s.setDemoStep);
  const me = useStation((s) => s.me);
  const setMe = useStation((s) => s.setMe);
  const nav = useNavigate();
  const loc = useLocation();
  const [menu, setMenu] = useState(false);
  // light or dark, remembered on this device
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      return localStorage.getItem('ex-theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const flipTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    try {
      localStorage.setItem('ex-theme', next);
    } catch {
      /* private window: keep it for this session only */
    }
  };

  // number keys 1-6 open the pages (not while typing)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < KEYS.length && !e.metaKey && !e.ctrlKey) nav(KEYS[i]);
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [nav]);
  useEffect(() => setMenu(false), [loc.pathname]);
  // sign in as the crew member with the most to look at, for the demo
  useEffect(() => {
    if (!me && views.length) setMe([...views].sort((a, b) => RANK[b.overall] - RANK[a.overall])[0].m.id);
  }, [me, views, setMe]);

  if (loadState === 'error') return <p className="st-fatal">Data files could not be loaded: {error}</p>;
  if (!data) return <div className="st-loading"><span className="st-logo">{BRAND}</span><i /></div>;

  const alarmOn = alarmActive(alarm.phase);
  const worst = (xs: Status[]): Status => (xs.includes('red') ? 'red' : xs.includes('amber') ? 'amber' : 'green');
  const crewS = worst(views.map((v) => v.overall));
  const envS: Status = alarmOn ? 'red' : sw ? LEVEL_STATUS[sw.level] : 'green';
  const medic = me === 'medic';
  const mine = views.find((v) => v.m.id === me);
  const careS: Status = mine ? (mine.issues.some((r) => r.status === 'red') ? 'red' : mine.issues.length ? 'amber' : 'green') : worst(queue.filter((q) => q.tone !== 'info').map((q) => q.tone as Status));

  return (
    <div className={`st ds is-frame ${alarmOn ? 'is-alarm' : ''}`} data-theme={theme}>
      <button type="button" className="fr-corner is-l ds-brand" onClick={() => (cue('tick', sound), nav('/'))} aria-label="e to the x, crew status">
        e<sup>x</sup>
      </button>
      <div className="fr-corner is-r ds-menu">
        <Btn kind="secondary" onClick={() => setMenu((m) => !m)}>
          Menu
        </Btn>
        {menu && (
          <div className="ds-menu-pop">
            <label className="ds-menu-row">
              <span>Signed in as</span>
              <select value={me ?? ''} onChange={(e) => (setMe(e.target.value), setMenu(false), nav('/'))}>
                {views.map((v) => (
                  <option key={v.m.id} value={v.m.id}>
                    {roleOf(v.m)}
                  </option>
                ))}
                <option value="medic">Crew medic</option>
              </select>
            </label>
            <div className="ds-menu-row">
              <span>Mission day</span>
              <b>
                {day} · {fmtDay(data.crew.mission.today)}
              </b>
            </div>
            <button type="button" className="ds-menu-row" onClick={flipTheme}>
              <span>Theme</span>
              <b>{theme === 'light' ? 'Light' : 'Dark'}</b>
            </button>
            <button type="button" className="ds-menu-row" onClick={() => { setMenu(false); setDemo(0); }}>
              <span>Guided demo</span>
              <b>Start</b>
            </button>
            <button type="button" className="ds-menu-row" onClick={() => { setMenu(false); nav('/built'); }}>
              <span>What we built</span>
              <b>Open</b>
            </button>
          </div>
        )}
      </div>

      <main className="st-main">
        <Suspense fallback={<div className="st-wait" />}>
          <Outlet />
        </Suspense>
        <Dock
          items={
            medic
              ? [
                  { to: '/', label: 'Crew', icon: 'crew', alert: crewS, end: true },
                  { to: '/radiation', label: 'Radiation', icon: 'environment', alert: envS },
                  { to: '/cabin', label: 'Cabin', icon: 'cabin' },
                  { to: '/surgeon', label: 'Surgeon', icon: 'surgeon' },
                ]
              : [
                  { to: '/check', label: 'Check in', icon: 'check', alert: mine && !mine.checkedIn ? 'amber' : undefined },
                  { to: '/', label: 'Me', icon: 'body', alert: mine?.overall, end: true },
                  { to: '/mind', label: 'Mind', icon: 'mind' },
                  { to: '/care', label: 'Care', icon: 'care', alert: careS },
                  { to: '/radiation', label: 'Radiation', icon: 'environment', alert: envS },
                  { to: '/cabin', label: 'Cabin', icon: 'cabin' },
                ]
          }
        />
      </main>

      <footer className="st-foot">
        <span>{DISCLAIMERS[0]}</span>
        <span>{DISCLAIMERS[1]}</span>
        <span>Space weather data: {data.storm.meta.data_credit}</span>
        <span>Signal delay to Earth ~ {LINK_DELAY[env]}</span>
        <span title={ANATOMY_CREDIT}>Anatomy: BodyParts3D, CC BY 4.0</span>
      </footer>

      {alarmOn && <Shelter onAck={() => setAlarm({ ...alarm, phase: 'sheltered' })} phase={alarm.phase} flare={alarm.flare} p={alarm.p} onOpen={() => nav('/radiation')} here={loc.pathname.startsWith('/radiation')} />}

      <div className="st-toasts" role="status">
        {toasts.map((t) => (
          <div key={t.id} className={`st-toast is-${t.tone}`}>
            <b>{t.title}</b>
            {t.body && <span>{t.body}</span>}
          </div>
        ))}
      </div>
      <Demo />
    </div>
  );
}

function Shelter({ phase, flare, p, onAck, onOpen, here }: { phase: string; flare?: string; p?: number; onAck: () => void; onOpen: () => void; here: boolean }) {
  if (phase === 'arrived')
    return (
      <div className="st-shelterbar">
        <Dot s="red" pulse />
        <b>Emergency · storm in progress</b>
        <span>Particles have arrived. All crew stay in the shelter. Dose monitored every 5 min.</span>
        {!here && <button onClick={onOpen}>Open environment</button>}
      </div>
    );
  if (phase === 'sheltered')
    return (
      <div className="st-shelterbar">
        <Dot s="red" pulse />
        <b>Crew in storm shelter</b>
        <span>EVA suspended until particle flux drops. Dose monitored every 5 min.</span>
        {!here && <button onClick={onOpen}>Open environment</button>}
      </div>
    );
  return (
    <div className="st-shelter" role="alertdialog" aria-label="Solar storm warning">
      <div className="st-shelter-box">
        <p className="st-cap">Warning · solar storm forecast · NASA-STD-3001 class</p>
        <h2>All crew to the storm shelter</h2>
        <p className="st-shelter-sub">
          Flare {flare} · storm chance {p != null ? Math.round(p * 100) : '—'}% in the next 72 h. A forecast, not yet measured: suspend EVA and shelter as a precaution, wear dosimeters.
        </p>
        <div className="st-shelter-steps">
          <span>1 · Stop EVA and outside work</span>
          <span>2 · Move to the shelter</span>
          <span>3 · Confirm headcount with ground</span>
        </div>
        <button className="st-btn is-white is-xl" onClick={onAck}>
          Crew sheltered · confirm
        </button>
      </div>
    </div>
  );
}

/** Home: an astronaut lands on their own status; the crew medic on the crew view. */
function Home() {
  const me = useStation((s) => s.me);
  return me === 'medic' ? <Overview /> : <Body />;
}

/** Old links (/crew/:id, /checkin/:id) keep working. */
function Moved({ to }: { to: string }) {
  const { id } = useParams();
  const loc = useLocation();
  return <Navigate to={`${to}${id ? `/${id}` : ''}${loc.search}`} replace />;
}

export function StationApp() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<Home />} />
          <Route path="/crew" element={<Overview />} />
          <Route path="/body" element={<Body />} />
          <Route path="/body/:id" element={<Body />} />
          <Route path="/check" element={<Check />} />
          <Route path="/check/:id" element={<Check />} />
          <Route path="/care" element={<Care />} />
          <Route path="/surgeon" element={<Surgeon />} />
          <Route path="/radiation" element={<Environment />} />
          <Route path="/mind" element={<Mind />} />
          <Route path="/cabin" element={<Cabin />} />
          <Route path="/built" element={<Built />} />
          <Route path="/environment" element={<Navigate to="/radiation" replace />} />
          <Route path="/crew/:id" element={<Moved to="/body" />} />
          <Route path="/checkin" element={<Moved to="/check" />} />
          <Route path="/checkin/:id" element={<Moved to="/check" />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
