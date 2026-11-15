// The console frame: mark, centred section tabs, telemetry and square action buttons on top;
// crew selection on the left; the page (hero scene + glass cards) behind; credits at the foot.
import { lazy, Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { hasServer } from '../data/http';
import { DISCLAIMERS } from '../components/Footer';
import { Mark, statusWord } from './ui';
import { useConsole } from './useConsole';
// three.js and the scene load only after the intro, so nothing competes with the video
const World = lazy(() => import('./World').then((m) => ({ default: m.World })));
import { useHud } from './hud';
import './console.css';

export const SECTIONS = [
  { to: '/', name: 'Crew' },
  { to: '/environment', name: 'Environment' },
  { to: '/systems', name: 'Systems' },
] as const;

export function Shell() {
  const { data, views, seat, cv, setCrew, day, loadState, error } = useConsole();
  const [server, setServer] = useState<boolean | null>(null);
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    void hasServer().then(setServer);
  }, []);
  // mount the 3D world once the loading screen has handed off
  const [worldOn, setWorldOn] = useState(() => !document.getElementById('boot') || document.documentElement.classList.contains('boot-done'));
  useEffect(() => {
    if (worldOn) return;
    const html = document.documentElement;
    const mo = new MutationObserver(() => html.classList.contains('boot-done') && setWorldOn(true));
    mo.observe(html, { attributes: true, attributeFilter: ['class'] });
    const id = window.setTimeout(() => setWorldOn(true), 6000); // never wait longer than this
    return () => {
      mo.disconnect();
      window.clearTimeout(id);
    };
  }, [worldOn]);
  // keys 1-6 switch sections
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      const i = Number(e.key) - 1;
      const h = useHud.getState();
      if (e.key === '0') h.doReset();
      else if (i >= 0 && i < SECTIONS.length) nav(SECTIONS[i].to);
      else if (e.key === 'ArrowLeft') h.setYaw(h.yaw - 0.15);
      else if (e.key === 'ArrowRight') h.setYaw(h.yaw + 0.15);
      else if (e.key === '+' || e.key === '=') h.setZoom(h.zoom * 1.15);
      else if (e.key === '-') h.setZoom(h.zoom / 1.15);
      else if (e.key === 'Escape' && h.focus) nav('/');
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [nav]);


  return (
    <div className="cx">
      <div className="cx-world">
        {worldOn && (
          <Suspense fallback={null}>
            <World />
          </Suspense>
        )}
      </div>
      {/* HUD framing: corner brackets and the centre reticle */}
      <div className="hud-frame" aria-hidden>
        <i className="c tl" />
        <i className="c tr" />
        <i className="c bl" />
        <i className="c br" />
        <i className="reticle" />
      </div>
      <div className="cx-page-wrap">
        <div className="cx-page" key={loc.pathname}>
          {loadState === 'error' ? (
            <p className="cx-error">Data not loaded: {error}</p>
          ) : (
            <Suspense fallback={<p className="cx-error cx-wait">Loading</p>}>
              <Outlet />
            </Suspense>
          )}
        </div>
      </div>

      <header className="cx-top">
        <div className="cx-brand">
          <span className="cx-mark">
            e<span>x</span>
          </span>
          <nav className="cx-crew" aria-label="Crew member">
            {views.map((v) => (
              <button key={v.m.id} type="button" className="sq" aria-pressed={v.m.id === cv?.m.id} title={statusWord(v.overall)} onClick={() => setCrew(v.m.id)}>
                <span>{seat[v.m.id]}</span>
                <Mark s={v.overall} size={8} />
              </button>
            ))}
          </nav>
        </div>
        <nav className="cx-tabs" aria-label="Sections">
          {SECTIONS.map((s, i) => (
            <NavLink key={s.to} to={s.to} end={s.to === '/'} className={({ isActive }) => (isActive ? 'on' : '')}>
              {s.name}
              <kbd>{i + 1}</kbd>
            </NavLink>
          ))}
        </nav>
        <div className="cx-icons">
          <span className="cx-day">Day {day ?? '--'}</span>
          <span className="cx-live" data-on={server || undefined} title={server ? 'Server live' : 'Offline'}>
            <i /> {server ? 'Live' : 'Offline'}
          </span>
        </div>
      </header>


      <footer className="cx-credits">
        {[...DISCLAIMERS, data ? `Space weather data: ${data.storm.meta.data_credit}` : ''].filter(Boolean).join('  ·  ')}
        {'  ·  '}Anatomy: BodyParts3D 4.0, DBCLS, CC BY 4.0 · Earth: NASA Blue and Black Marble, public domain · Clouds: Solar System Scope, CC BY 4.0 · Video: NASA KSC-20190225-MH-SPX01-0001, CC0 · Orbital elements: CelesTrak (celestrak.org)
      </footer>
      <div className="cx-grain" aria-hidden />

    </div>
  );
}
