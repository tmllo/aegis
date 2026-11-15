// The console frame: mark, centred section tabs, telemetry and square action buttons on top;
// crew selection on the left; the page (hero scene + glass cards) behind; credits at the foot.
import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useCabin } from '../data/cabin';
import { hasServer } from '../data/http';
import { DISCLAIMERS } from '../components/Footer';
import { Confirm, Icon, Mark, statusWord } from './ui';
import { LINK_DELAY, rowOf, SHORT } from './model';
import { useConsole } from './useConsole';
import { World } from './World';
import { useHud } from './hud';
import './console.css';

export const SECTIONS = [
  { to: '/', name: 'Crew' },
  { to: '/vitals', name: 'Vitals' },
  { to: '/cabin', name: 'Cabin' },
  { to: '/storm', name: 'Storm' },
  { to: '/systems', name: 'Systems' },
  { to: '/mind', name: 'Mind' },
] as const;

export function Shell() {
  const { data, cd, views, seat, cv, setCrew, day, loadState, error } = useConsole();
  const { cabin } = useCabin();
  const [server, setServer] = useState<boolean | null>(null);
  const [ask, setAsk] = useState<null | 'measure' | 'ground'>(null);
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    void hasServer().then(setServer);
  }, []);
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
      else if (e.key === 'Escape' && h.focus) nav('/vitals');
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [nav]);

  const issue = cd && cv?.issue ? rowOf(cd, cv.m, cv.scores, cv.issue.metric) : null;
  const ppco2 = cabin?.readings.find((r) => r.metric.key === 'cabin.ppco2');

  return (
    <div className="cx">
      <div className="cx-world">
        <World />
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
          <dl className="cx-tele">
            <div>
              <dt>Day</dt>
              <dd>{day ?? '--'}</dd>
            </div>
            <div>
              <dt>ppCO2</dt>
              <dd>{ppco2?.value != null ? ppco2.value.toFixed(ppco2.metric.digits) : '--'}</dd>
            </div>
            <div>
              <dt>Cabin</dt>
              <dd>REC</dd>
            </div>
            <div>
              <dt>Server</dt>
              <dd>{server == null ? '--' : server ? 'LIVE' : 'OFFLINE'}</dd>
            </div>
          </dl>
          <button type="button" className="sq" aria-label="Check-in" title="Check-in" onClick={() => nav('/mind')}>
            <Icon name="checkin" size={20} />
          </button>
          <button type="button" className="sq" aria-label="Re-measure" title="Re-measure" disabled={!issue} aria-pressed={!!sent.measure} onClick={() => setAsk('measure')}>
            <Icon name="measure" size={20} />
          </button>
          <button type="button" className="sq" aria-label="Escalate" title="Escalate" aria-pressed={!!sent.ground} onClick={() => setAsk('ground')}>
            <Icon name="ground" size={20} />
          </button>
        </div>
      </header>


      <footer className="cx-credits">
        {[...DISCLAIMERS, data ? `Space weather data: ${data.storm.meta.data_credit}` : ''].filter(Boolean).join('  ·  ')}
        {'  ·  '}Anatomy: BodyParts3D 4.0, DBCLS, CC BY 4.0 · Earth: NASA Blue and Black Marble, public domain · Clouds: Solar System Scope, CC BY 4.0 · Video: NASA KSC-20190225-MH-SPX01-0001, CC0
      </footer>
      <div className="cx-grain" aria-hidden />

      <Confirm
        open={ask === 'measure' && !!issue}
        code={issue ? `2.0${String(Object.keys(SHORT).indexOf(issue.k) + 10)}` : ''}
        title={issue ? `Re-measure ${SHORT[issue.k].toLowerCase()}` : ''}
        tag="Vitals"
        status={issue ? `${cv ? seat[cv.m.id] : ''} ${statusWord(issue.status)}` : ''}
        body={issue?.action ?? ''}
        danger={issue?.status === 'red'}
        onDone={() => {
          setSent((s) => ({ ...s, measure: true }));
          setAsk(null);
        }}
        onCancel={() => setAsk(null)}
      />
      <Confirm
        open={ask === 'ground'}
        code="1.001"
        title="Escalate"
        tag="Escalation"
        status={cd ? `Report arrives in ~${LINK_DELAY[cd.mission.environment] ?? 'unknown'}` : ''}
        body={cv ? `${seat[cv.m.id]} status goes to the flight surgeon.` : ''}
        go="Send"
        onDone={() => {
          setSent((s) => ({ ...s, ground: true }));
          setAsk(null);
        }}
        onCancel={() => setAsk(null)}
      />
    </div>
  );
}
