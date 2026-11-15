// The station: one frame (rail, status strip, alert bar, footer) around four screens that hand off to
// each other. Overview -> Crew health -> Check-in -> back to Crew health; Radiation -> replay -> alarm.
import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { DISCLAIMERS } from '../components/Footer';
import type { EnvironmentId } from '../data/types';
import Overview from './pages/Overview';
import { BRAND, LEVEL_STATUS, LEVEL_WORD, PLACE, TAGLINE, WORD, fmtDay, seatOf, useStationData } from './model';
import { useStation } from './state';
import { cue, Dot, Icon } from './ui';
import { Demo, DemoButton } from './Demo';
import './station.css';

const CrewHealth = lazy(() => import('./pages/CrewHealth'));
const Checkin = lazy(() => import('./pages/Checkin'));
const Radiation = lazy(() => import('./pages/Radiation'));

const NAV = [
  { to: '/', label: 'Overview', icon: Icon.overview, key: '1' },
  { to: '/crew', label: 'Crew health', icon: Icon.crew, key: '2' },
  { to: '/checkin', label: 'Check-in', icon: Icon.checkin, key: '3' },
  { to: '/radiation', label: 'Radiation', icon: Icon.radiation, key: '4' },
];

function Shell() {
  const { data, loadState, error, env, setEnv, views, sw, day, queue } = useStationData();
  const alarm = useStation((s) => s.alarm);
  const setAlarm = useStation((s) => s.setAlarm);
  const sound = useStation((s) => s.sound);
  const setSound = useStation((s) => s.setSound);
  const toasts = useStation((s) => s.toasts);
  const seed = useStation((s) => s.seed);
  const nav = useNavigate();
  const loc = useLocation();

  // seed XP / streaks from the logged days so the numbers look lived-in
  useEffect(() => {
    if (!data) return;
    const xp: Record<string, number> = {};
    const st: Record<string, number> = {};
    for (const m of data.crew.crew) {
      // a full check-in day has every self-measured reading
      const full = (r: (typeof m.series)[number]) => (['hr', 'bp_sys', 'bp_dia', 'glucose', 'temp', 'sleep_h', 'mood', 'exercise_min'] as const).every((k) => r[k] != null);
      xp[m.id] = m.series.filter(full).length * 40;
      let s = 0;
      for (let i = m.series.length - 2; i >= 0 && full(m.series[i]); i--) s++;
      st[m.id] = s;
    }
    seed(xp, st);
  }, [data, seed]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      const n = NAV.find((x) => x.key === e.key);
      if (n && !e.metaKey && !e.ctrlKey) nav(n.to);
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [nav]);

  if (loadState === 'error') return <p className="st-fatal">Data files could not be loaded: {error}</p>;
  if (!data) return <div className="st-loading"><span className="st-logo">{BRAND}</span><i /></div>;

  const red = views.filter((v) => v.overall === 'red');
  const top = queue.find((q) => q.tone === 'red');
  const alarmOn = alarm.phase === 'warning' || alarm.phase === 'sheltered';

  return (
    <div className={`st ${alarmOn ? 'is-alarm' : ''}`}>
      <aside className="st-rail">
        <div className="st-brand" onClick={() => nav('/')}>
          <svg viewBox="0 0 32 32" className="st-mark" aria-hidden>
            <path d="M16 2 4 7v8c0 7.5 5.1 13.4 12 15 6.9-1.6 12-7.5 12-15V7z" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M9 17h4l2-5 3 9 2-4h3" fill="none" stroke="#5eead4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{BRAND}</span>
        </div>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `st-nav${isActive ? ' is-on' : ''}`} onClick={() => cue('tick', sound)}>
              <n.icon />
              <span>{n.label}</span>
              {n.to === '/crew' && red.length > 0 && <b className="st-badge is-red">{red.length}</b>}
              {n.to === '/checkin' && views.some((v) => !v.checkedIn) && <b className="st-badge">{views.filter((v) => !v.checkedIn).length}</b>}
              {n.to === '/radiation' && sw && sw.level !== 'none' && <b className={`st-badge is-${LEVEL_STATUS[sw.level]}`}>!</b>}
            </NavLink>
          ))}
        </nav>
        <div className="st-rail-foot">
          <button className="st-iconbtn" onClick={() => setSound(!sound)} title={sound ? 'Sound on' : 'Sound off'}>
            <Icon.sound on={sound} />
          </button>
          <DemoButton />
        </div>
      </aside>

      <header className="st-top">
        <div className="st-mission">
          <p className="st-cap">{TAGLINE}</p>
          <h1>{data.crew.mission.name}</h1>
        </div>
        <div className="st-facts">
          <label className="st-fact st-env">
            <span>Location</span>
            <select value={env} onChange={(e) => setEnv(e.target.value as EnvironmentId)}>
              {(Object.keys(data.crew.environments) as EnvironmentId[]).map((k) => (
                <option key={k} value={k}>
                  {data.crew.environments[k].label}
                </option>
              ))}
            </select>
          </label>
          <div className="st-fact">
            <span>Mission day</span>
            <b>{day}</b>
          </div>
          <div className="st-fact">
            <span>Date</span>
            <b>{fmtDay(data.crew.mission.today)}</b>
          </div>
        </div>
        <div className="st-crewpills">
          {views.map((v) => (
            <button key={v.m.id} className={`st-pill is-${v.overall}`} onClick={() => nav(`/crew/${v.m.id}`)} title={`${v.m.name}: ${WORD[v.overall]}`}>
              <Dot s={v.overall} pulse />
              <span>{seatOf(v.m)}</span>
            </button>
          ))}
          {sw && (
            <button className={`st-pill is-${alarmOn ? 'red' : LEVEL_STATUS[sw.level]}`} onClick={() => nav('/radiation')}>
              <Icon.radiation />
              <span>{alarmOn ? 'STORM WARNING' : `Space weather · ${LEVEL_WORD[sw.level]}`}</span>
            </button>
          )}
        </div>
      </header>

      {top && !alarmOn && !loc.pathname.startsWith('/crew') && !loc.pathname.startsWith('/checkin') && (
        <div className="st-alertbar">
          <Dot s="red" pulse size={9} />
          <b>{top.who}</b>
          <span>{top.title}</span>
          <button onClick={() => nav(top.to)}>
            {top.cta} <Icon.arrow />
          </button>
        </div>
      )}

      <main className="st-main">
        <Suspense fallback={<div className="st-wait" />}>
          <Outlet />
        </Suspense>
      </main>

      <footer className="st-foot">
        <span>{DISCLAIMERS[0]}</span>
        <span>{DISCLAIMERS[1]}</span>
        <span>Space weather data: {data.storm.meta.data_credit}</span>
        <span>Signal delay to Earth from {PLACE[env].toLowerCase()} ~ {env === 'moon' ? '1.3 s' : env === 'iss' ? '< 1 s' : 'minutes'}</span>
      </footer>

      {alarmOn && <Shelter onAck={() => setAlarm({ ...alarm, phase: 'sheltered' })} phase={alarm.phase} flare={alarm.flare} p={alarm.p} onOpen={() => nav('/radiation')} here={loc.pathname.startsWith('/radiation')} />}

      <div className="st-toasts">
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
  if (phase === 'sheltered')
    return (
      <div className="st-shelterbar">
        <Dot s="red" pulse />
        <b>Crew in storm shelter</b>
        <span>EVA suspended until particle flux drops. Dose monitored every 5 min.</span>
        {!here && <button onClick={onOpen}>Open radiation</button>}
      </div>
    );
  return (
    <div className="st-shelter" role="alertdialog" aria-label="Solar storm warning">
      <div className="st-shelter-box">
        <p className="st-cap">Solar radiation storm warning</p>
        <h2>All crew to the storm shelter</h2>
        <p className="st-shelter-sub">
          Flare {flare} · storm chance {p != null ? Math.round(p * 100) : '—'}% in the next 72 h. Suspend EVA, move to the shielded area, wear dosimeters.
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

export function StationApp() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<Overview />} />
          <Route path="/crew" element={<CrewHealth />} />
          <Route path="/crew/:id" element={<CrewHealth />} />
          <Route path="/checkin" element={<Checkin />} />
          <Route path="/checkin/:id" element={<Checkin />} />
          <Route path="/radiation" element={<Radiation />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

