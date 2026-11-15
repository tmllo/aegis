// Guided demo: a 75 s run-through of the app in six beats. It only drives what already exists
// (router addresses, the selected crew member, the mission setting) and shows one sentence per
// beat in a lower band. Pause, Back, Next and Exit; arrow keys, Space and Esc; it pauses the
// moment the user touches the app, and never auto-advances under reduced motion.
import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMissionData, useMissionStore } from '../../data/store';
import type { EnvironmentId } from '../../data/types';
import { designations } from '../useConsole';
import { buildBeats, type Trend } from './script';
import { useDemo } from './store';
import './demo.css';

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const pad = (n: number) => String(n).padStart(2, '0');

/** One trend as a line over the last 14 days, with the person's usual as a dashed rule. */
function TrendLine({ t }: { t: Trend }) {
  const W = 220;
  const H = 44;
  const v = t.values;
  const nums = v.filter((x): x is number => x != null);
  if (nums.length < 2) return null;
  const all = t.usual != null ? [...nums, t.usual] : nums;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const x = (i: number) => (i / (v.length - 1)) * W;
  const y = (n: number) => 4 + (1 - (n - lo) / span) * (H - 8);
  const d = v.map((n, i) => (n == null ? '' : `${i === 0 || v[i - 1] == null ? 'M' : 'L'}${x(i).toFixed(1)} ${y(n).toFixed(1)}`)).join(' ');
  const last = nums[nums.length - 1];
  const unit = t.unit === '/5' ? ' of 5' : t.unit ? ` ${t.unit}` : '';
  return (
    <figure className="demo-trend" data-status={t.status}>
      <figcaption>
        <span>{t.label}</span>
        <b>
          {last.toFixed(t.digits)}
          {unit}
        </b>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`${t.label}, last ${v.length} days, now ${last.toFixed(t.digits)}${unit}`}>
        {t.usual != null && <line x1="0" x2={W} y1={y(t.usual)} y2={y(t.usual)} className="demo-usual" />}
        <path d={d} className="demo-line" />
        <circle cx={x(v.length - 1)} cy={y(last)} r="3" className="demo-dot" />
      </svg>
    </figure>
  );
}

function Player() {
  const { data } = useMissionData();
  const nav = useNavigate();
  const { i, playing, record, go, exit, setPlaying } = useDemo();
  const setCrew = useMissionStore((s) => s.setSelectedCrewId);
  const setEnv = useMissionStore((s) => s.setEnvironment);
  const still = useMemo(reduced, []);
  // what the user had before the demo, restored on exit
  const before = useRef<{ crew: string | null; env: EnvironmentId | null } | null>(null);
  if (!before.current) before.current = { crew: useMissionStore.getState().selectedCrewId, env: useMissionStore.getState().environment };

  const beats = useMemo(() => (data ? buildBeats(data.crew, data.storm, designations(data.crew.crew)) : []), [data]);
  const beat = beats[i];
  const bar = useRef<HTMLElement>(null);
  const elapsed = useRef(0);

  // apply the beat: mission setting, crew member, address
  useEffect(() => {
    if (!beat) return;
    elapsed.current = 0;
    // flags for a screen recorder (demo-video pipeline): which beat is on, and when it ends
    const root = document.documentElement;
    root.dataset.demo = 'playing';
    root.dataset.demoBeat = beat.id;
    window.dispatchEvent(new CustomEvent('ex-demo-beat', { detail: { index: i, id: beat.id, seconds: beat.seconds } }));
    setEnv(beat.env);
    if (beat.crew) setCrew(beat.crew);
    nav(beat.to, { replace: true });
  }, [beat]); // eslint-disable-line react-hooks/exhaustive-deps

  // leave the app as it was
  const leave = () => {
    const b = before.current;
    if (b?.env) setEnv(b.env);
    if (b?.crew) setCrew(b.crew);
    exit();
    nav('/', { replace: true });
    const root = document.documentElement;
    root.dataset.demo = 'done';
    delete root.dataset.demoBeat;
    window.dispatchEvent(new CustomEvent('ex-demo-done'));
  };
  const next = () => (i < beats.length - 1 ? go(i + 1) : leave());
  const back = () => go(Math.max(0, i - 1));
  const act = useRef({ next, back, leave });
  act.current = { next, back, leave };

  // auto-advance with a progress hairline (not under reduced motion)
  useEffect(() => {
    if (!beat) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (useDemo.getState().playing && !still) elapsed.current += dt;
      const k = Math.min(1, elapsed.current / beat.seconds);
      bar.current?.style.setProperty('--k', String(still ? 1 : k));
      if (k >= 1 && !still) {
        act.current.next();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [beat, still]);

  // keys, and "the user takes over": any input outside the band pauses the run
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const a = act.current;
      if (e.key === 'ArrowRight') a.next();
      else if (e.key === 'ArrowLeft') a.back();
      else if (e.key === ' ') setPlaying(!useDemo.getState().playing);
      else if (e.key === 'Escape') a.leave();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    const takeover = (e: Event) => {
      if ((e.target as HTMLElement | null)?.closest?.('.demo')) return;
      if (useDemo.getState().playing && !useDemo.getState().record) setPlaying(false);
    };
    window.addEventListener('keydown', key, true);
    window.addEventListener('pointerdown', takeover, true);
    window.addEventListener('wheel', takeover, { capture: true, passive: true });
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('pointerdown', takeover, true);
      window.removeEventListener('wheel', takeover, true);
    };
  }, [setPlaying]);

  if (!beat) return null;
  const auto = playing && !still;
  return createPortal(
    <section className="demo" role="region" aria-label="Guided demo" data-playing={auto} data-record={record || undefined}>
      <ol className="demo-steps" aria-hidden>
        {beats.map((b, k) => (
          <li key={b.id} data-state={k < i ? 'done' : k === i ? 'now' : 'next'} ref={k === i ? (bar as React.RefObject<HTMLLIElement>) : undefined} />
        ))}
      </ol>
      <div className="demo-row">
        <div className="demo-meta">
          <span className="demo-n">
            {pad(i + 1)} / {pad(beats.length)}
          </span>
          <span className="demo-title">{beat.title}</span>
        </div>
        <div className="demo-main">
          {beat.trends && (
            <div className="demo-trends">
              <TrendLine t={beat.trends[0]} />
              <TrendLine t={beat.trends[1]} />
              <span className="demo-note">Last 14 days · dashed line = usual</span>
            </div>
          )}
          <p className="demo-say" aria-live="polite" key={beat.id}>
            {beat.caption}
          </p>
        </div>
        <div className="demo-ctl">
          <button type="button" onClick={back} disabled={i === 0}>
            Back
          </button>
          {!still && (
            <button type="button" onClick={() => setPlaying(!playing)} aria-pressed={!playing}>
              {playing ? 'Pause' : 'Play'}
            </button>
          )}
          <button type="button" className="demo-next" onClick={next}>
            {i < beats.length - 1 ? 'Next' : 'Finish'}
          </button>
          <button type="button" onClick={leave}>
            Exit
          </button>
        </div>
      </div>
      <span className="demo-sim">Simulated crew data · real solar flares (NASA DONKI) · warnings from the eˣ model, not an official forecast</span>
    </section>,
    document.body,
  );
}

/** The top-bar entry point. Also starts from the address ?demo=1. */
export function DemoButton() {
  const on = useDemo((s) => s.on);
  const start = useDemo((s) => s.start);
  const loc = useLocation();
  useEffect(() => {
    const q = new URLSearchParams(loc.search);
    if (q.get('demo') === '1' && !useDemo.getState().on) start(q.get('record') === '1');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <button type="button" className="demo-open" aria-pressed={on} hidden={on && useDemo.getState().record} onClick={() => (on ? useDemo.getState().exit() : start())}>
        Demo
      </button>
      {on && <Player />}
    </>
  );
}
