// Guided demo: a one-minute interactive walkthrough. A soft cursor moves over the real app and
// taps its real controls (crew seat, body, a reading, the daily check, the forecast, the shelter
// drill) while a lower band shows one sentence per step. Everything it changes is undone on exit. Pause, Back, Next and Exit; arrow keys, Space and Esc; it pauses the
// moment the user touches the app, and never auto-advances under reduced motion.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { useMissionData, useMissionStore } from '../../data/store';
import type { EnvironmentId } from '../../data/types';
import { designations } from '../useConsole';
import { useEntries } from '../entries';
import type { Trend } from './script';
import { buildTour, type Stage } from './tour';
import { useDemo } from './store';
import './demo.css';

/** Router navigation without a router context: the player lives in its own root, so it keeps
 *  running wherever the Demo button is mounted (a menu that closes, for example). */
function navTo(to: string) {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
  window.history.replaceState(window.history.state, '', `${base}${to}`);
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
}

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

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

class Left extends Error {}

function Player() {
  const { data } = useMissionData();
  const { i, playing, record, go, exit, setPlaying } = useDemo();
  const still = useMemo(reduced, []);
  // what the user had before the demo, restored on exit: crew member, location, typed values
  const before = useRef<{ crew: string | null; env: EnvironmentId | null; entries: ReturnType<typeof useEntries.getState>['byMember'] } | null>(null);
  if (!before.current) before.current = { crew: useMissionStore.getState().selectedCrewId, env: useMissionStore.getState().environment, entries: useEntries.getState().byMember };

  const steps = useMemo(() => (data ? buildTour(data.crew, data.storm, designations(data.crew.crew)) : []), [data]);
  const step = steps[i];
  const bar = useRef<HTMLElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const [runs, setRuns] = useState(0); // bumped to replay the current step

  const restore = () => {
    const b = before.current;
    if (!b) return;
    useEntries.setState({ byMember: b.entries });
    if (b.env) useMissionStore.getState().setEnvironment(b.env);
    if (b.crew) useMissionStore.getState().setSelectedCrewId(b.crew);
  };
  const leave = () => {
    restore();
    exit();
    navTo('/');
    const root = document.documentElement;
    root.dataset.demo = 'done';
    delete root.dataset.demoBeat;
    window.dispatchEvent(new CustomEvent('ex-demo-done'));
  };
  const next = () => (i < steps.length - 1 ? go(i + 1) : leave());
  const back = () => (i > 0 ? go(i - 1) : setRuns((n) => n + 1));
  const act = useRef({ next, back, leave });
  act.current = { next, back, leave };

  // run the step: the cursor acts on the real app, then the step holds, then the next one starts
  useEffect(() => {
    if (!step) return;
    let gone = false;
    let elapsed = 0;
    const root = document.documentElement;
    root.dataset.demo = 'playing';
    root.dataset.demoBeat = step.id;
    window.dispatchEvent(new CustomEvent('ex-demo-beat', { detail: { index: i, id: step.id, seconds: step.seconds } }));

    const tick = (ms: number) =>
      new Promise<void>((res, rej) => {
        let left = ms;
        let last = performance.now();
        const loop = (now: number) => {
          if (gone) return rej(new Left());
          const dt = now - last;
          last = now;
          if (useDemo.getState().playing || still) {
            left -= dt;
            elapsed += dt;
            bar.current?.style.setProperty('--k', String(Math.min(1, elapsed / (step.seconds * 1000))));
          }
          if (left <= 0) res();
          else requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      });
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
    };
    const find = async (selector: string, text?: string, row?: string): Promise<HTMLElement | null> => {
      for (let n = 0; n < 12; n++) {
        let list = [...document.querySelectorAll<HTMLElement>(row ? '.vrow' : selector)].filter((e) => !e.closest('.demo') && shown(e));
        if (row) list = list.filter((e) => e.querySelector('.vrow-l')?.textContent?.trim().startsWith(row)).map((e) => e.querySelector<HTMLElement>(selector)).filter((e): e is HTMLElement => !!e);
        if (text) list = list.filter((e) => (e.textContent ?? '').toLowerCase().includes(text.toLowerCase()));
        if (list[0]) return list[0];
        await tick(200);
      }
      return null;
    };
    const moveTo = async (x: number, y: number) => {
      const c = cursor.current;
      if (!c) return;
      c.dataset.on = 'true';
      c.style.transform = `translate(${x}px, ${y}px)`;
      await tick(still ? 0 : 720);
      c.dataset.tap = 'true';
      await tick(still ? 0 : 260);
      delete c.dataset.tap;
    };
    const stage: Stage = {
      nav: async (to) => {
        if (window.location.pathname + window.location.search !== to) navTo(to);
        await tick(120);
      },
      tap: async (selector, text, opts) => {
        const el = await find(selector, text, opts?.row);
        if (!el) return false;
        el.scrollIntoView({ block: 'nearest' });
        const r = el.getBoundingClientRect();
        await moveTo(r.left + r.width / 2, r.top + r.height / 2);
        if (opts?.press !== false) el.click();
        return true;
      },
      tapAt: async (fx, fy) => moveTo(innerWidth * fx, innerHeight * fy),
      type: async (selector, value) => {
        const el = (await find(selector)) as HTMLInputElement | null;
        if (!el) return false;
        const r = el.getBoundingClientRect();
        await moveTo(r.left + r.width / 2, r.top + r.height / 2);
        // set the real field the way typing does, so the app's own change handler runs
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      },
      wait: tick,
      setCrew: (id) => useMissionStore.getState().setSelectedCrewId(id),
      setEnv: (e) => useMissionStore.getState().setEnvironment(e),
    };

    (async () => {
      try {
        await step.run(stage);
        if (cursor.current) delete cursor.current.dataset.on;
        // hold until the step's time is up, then move on (never on its own under reduced motion)
        await tick(Math.max(600, step.seconds * 1000 - elapsed));
        if (!still) act.current.next();
      } catch (e) {
        if (!(e instanceof Left)) throw e;
      }
    })();
    return () => {
      gone = true;
    };
  }, [step, runs, still]); // eslint-disable-line react-hooks/exhaustive-deps

  // put the app back if the player is torn down any other way
  useEffect(() => restore, []); // eslint-disable-line react-hooks/exhaustive-deps

  // keys, and "the user takes over": any real input outside the band pauses the run
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && e.isTrusted) return;
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
      if (!e.isTrusted || (e.target as HTMLElement | null)?.closest?.('.demo')) return;
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

  if (!step) return null;
  const auto = playing && !still;
  return createPortal(
    <>
      <div className="demo-cursor" ref={cursor} aria-hidden />
      <section className="demo" role="region" aria-label="Guided demo" data-playing={auto} data-record={record || undefined}>
        <ol className="demo-steps" aria-hidden>
          {steps.map((b, k) => (
            <li key={b.id} data-state={k < i ? 'done' : k === i ? 'now' : 'next'} ref={k === i ? (bar as React.RefObject<HTMLLIElement>) : undefined} />
          ))}
        </ol>
        <div className="demo-row">
          <div className="demo-meta">
            <span className="demo-n">
              {i + 1} of {steps.length}
            </span>
            <span className="demo-title">{step.title}</span>
          </div>
          <div className="demo-main">
            {step.trends && (
              <div className="demo-trends">
                <TrendLine t={step.trends[0]} />
                <TrendLine t={step.trends[1]} />
                <span className="demo-note">Last 14 days. The dashed line is their usual.</span>
              </div>
            )}
            <p className="demo-say" aria-live="polite" key={step.id}>
              {step.say}
            </p>
          </div>
          <div className="demo-ctl">
            <button type="button" onClick={back}>
              Back
            </button>
            {!still && (
              <button type="button" onClick={() => setPlaying(!playing)} aria-pressed={!playing}>
                {playing ? 'Pause' : 'Play'}
              </button>
            )}
            <button type="button" className="demo-next" onClick={next}>
              {i < steps.length - 1 ? 'Next' : 'Finish'}
            </button>
            <button type="button" onClick={leave}>
              Exit
            </button>
          </div>
        </div>
        <span className="demo-sim">Simulated crew data. Real solar flares from NASA DONKI. Warnings come from the e{'ˣ'} model, not an official forecast. Changes made in the demo are undone when it ends.</span>
      </section>
    </>,
    document.body,
  );
}

function Host() {
  const on = useDemo((s) => s.on);
  return on ? <Player /> : null;
}

// The player mounts itself once, outside the app tree, and starts from the address ?demo=1
// (add &record=1 for a clean recording run).
if (typeof document !== 'undefined') {
  const el = document.createElement('div');
  el.id = 'demo-host';
  document.body.appendChild(el);
  createRoot(el).render(<Host />);
  const q = new URLSearchParams(window.location.search);
  if (q.get('demo') === '1') setTimeout(() => useDemo.getState().start(q.get('record') === '1'), 0);
}

/** The entry point: a button, wherever the host app puts it. */
export function DemoButton() {
  const on = useDemo((s) => s.on);
  const record = useDemo((s) => s.record);
  return (
    <button type="button" className="demo-open" aria-pressed={on} hidden={on && record} onClick={() => (on ? useDemo.getState().exit() : useDemo.getState().start())}>
      Demo
    </button>
  );
}
