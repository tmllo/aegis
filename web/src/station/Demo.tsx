// Guided demo, inside the app: seven short steps along the real path (Me -> Check in -> Care -> Surgeon ->
// Radiation -> Replay). Each step opens the screen, frames the one part that matters with a spotlight, and
// the bottom strip says what data that part shows and where it comes from. Built from the live data.
// Arrow keys move, Esc closes.
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RANK, issueLine, useStationData } from './model';
import { Btn } from './ds';
import { useStation } from './state';
import './demo.css';

interface Beat {
  to: string;
  /** CSS selectors tried in order; the first one on screen gets the spotlight */
  target: string[];
  title: string;
  say: string;
  data: string;
  source: string;
}

export function useBeats(): Beat[] {
  const { data, views } = useStationData();
  return useMemo(() => {
    if (!data) return [];
    const byRank = [...views].sort((a, b) => RANK[b.overall] - RANK[a.overall]);
    const worst = byRank[0];
    const meta = data.storm.meta;
    const mt = meta.metrics_test;
    const yr = (s: string) => s.slice(0, 4);
    return [
      {
        to: '/',
        target: ['.fr-title'],
        title: 'Am I OK?',
        say: 'One status and one sentence for me. Only I and my medic see it.',
        data: 'Sleep, mood, heart rate, exercise, blood pressure',
        source: 'Simulated crew data (crew_data.json, Tomas)',
      },
      {
        to: '/',
        target: ['.fr-left .fr-check.is-red', '.fr-left .fr-check.is-amber', '.fr-left'],
        title: 'Why',
        say: worst?.issue ? `${issueLine(worst.issue)}. Flagged against my own usual range, not a textbook one.` : 'Each reading is judged against my own usual range, not a textbook one.',
        data: 'Each value vs my usual range',
        source: 'Usual range = my first 14 mission days (scoring.ts, tested)',
      },
      {
        to: '/check',
        target: ['.fr-object > *', '.fr-object'],
        title: 'Daily check',
        say: 'One question per screen, about a minute. Saving re-scores everything.',
        data: 'My answers, heart rate estimate, reaction test',
        source: 'Entered by the astronaut, scored on this device',
      },
      {
        to: '/care',
        target: ['.fr-object > *', '.fr-object'],
        title: 'What to do',
        say: 'A concrete next step, then a re-check to see if it worked.',
        data: 'Next step and re-check time',
        source: 'NASA-STD-3001 caution and warning classes',
      },
      {
        to: '/surgeon',
        target: ['.fr-object > *', '.fr-object'],
        title: 'Contact Earth support',
        say: 'A ready note for the Earth support team. It is queued and sends when the link is up.',
        data: 'Note: what I said, what was measured, plan',
        source: 'Built from my 28-day trends and today’s check',
      },
      {
        to: '/radiation',
        target: ['.fr-right'],
        title: 'Radiation',
        say: `The hazard I can’t feel. ${Math.round(mt.hit_rate * mt.n_storms)} of ${mt.n_storms} storms warned on years the model never saw.`,
        data: 'Storm chance next 72 h, my dose vs limit',
        source: `NASA DONKI flares ${yr(meta.train_period[0])}–${yr(meta.test_period[1])}, storm model (Tomas)`,
      },
      {
        to: '/radiation#replay',
        target: ['.fr-object > *', '.fr-object'],
        title: 'May 2024 storm',
        say: 'Press play. The shelter warning goes out hours before the particles arrive.',
        data: 'Real flares and particle arrivals, May 2024',
        source: 'NASA DONKI, recorded; never used in training',
      },
    ];
  }, [data, views]);
}

type Box = { x: number; y: number; w: number; h: number } | null;

/** Finds the first selector on screen and follows it while the page settles (lazy pages, layout shifts). */
function useSpot(selectors: string[] | undefined, key: string): Box {
  const [box, setBox] = useState<Box>(null);
  useLayoutEffect(() => {
    if (!selectors) return setBox(null);
    let alive = true;
    const measure = () => {
      if (!alive) return;
      // frame the content, not the column: the union of the visible children of the target
      const floor = (document.querySelector('.dm-bar')?.getBoundingClientRect().top ?? innerHeight) - 16;
      for (const s of selectors) {
        const el = document.querySelector(s);
        if (!el) continue;
        const parts = (el.children.length ? Array.from(el.children) : [el]).map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
        if (!parts.length) continue;
        const pad = 12;
        const l = Math.min(...parts.map((r) => r.left)) - pad;
        const t = Math.max(8, Math.min(...parts.map((r) => r.top)) - pad);
        const rgt = Math.max(...parts.map((r) => r.right)) + pad;
        const b = Math.min(floor, Math.max(...parts.map((r) => r.bottom)) + pad);
        setBox({ x: l, y: t, w: rgt - l, h: Math.max(40, b - t) });
        return;
      }
    };
    const timers = [0, 120, 400, 900, 1600].map((t) => window.setTimeout(measure, t));
    addEventListener('resize', measure);
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
      removeEventListener('resize', measure);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return box;
}

export function Demo() {
  const step = useStation((s) => s.demoStep);
  const set = useStation((s) => s.setDemoStep);
  const beats = useBeats();
  const nav = useNavigate();
  const beat = step != null ? beats[step] : null;
  const box = useSpot(beat?.target, `${step}`);

  useEffect(() => {
    if (beat) nav(beat.to);
  }, [beat, nav]);

  useEffect(() => {
    if (step == null) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') set(Math.min(beats.length - 1, step + 1));
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') set(Math.max(0, step - 1));
      if (e.key === 'Escape') set(null);
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [step, beats.length, set]);

  if (!beat || step == null) return null;
  const last = step === beats.length - 1;
  return (
    <>
      <div
        className={`dm-spot${box ? ' is-on' : ''}`}
        aria-hidden
        style={box ? { left: box.x, top: box.y, width: box.w, height: box.h } : undefined}
      />
      <section className="dm-bar" role="dialog" aria-label={`Demo step ${step + 1} of ${beats.length}`}>
        <div className="dm-step">
          <span className="dm-n">
            {step + 1} / {beats.length}
          </span>
          <b key={step}>{beat.title}</b>
        </div>
        <p className="dm-say" key={`s${step}`}>
          {beat.say}
        </p>
        <dl className="dm-data" key={`d${step}`}>
          <div>
            <dt>Shows</dt>
            <dd>{beat.data}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{beat.source}</dd>
          </div>
        </dl>
        <div className="dm-act">
          <Btn kind="quiet" onClick={() => (step ? set(step - 1) : set(null))}>
            {step ? 'Back' : 'Close'}
          </Btn>
          <Btn kind="primary" onClick={() => (last ? set(null) : set(step + 1))}>
            {last ? 'Finish' : 'Next'}
          </Btn>
        </div>
        <div className="dm-track" aria-hidden>
          {beats.map((_, i) => (
            <i key={i} className={i <= step ? 'is-on' : ''} />
          ))}
        </div>
      </section>
    </>
  );
}
