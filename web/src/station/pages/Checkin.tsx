// Daily check: one question per screen, about a minute. Inputs start empty; a step left empty is
// "Skipped". Every value is scored live against the astronaut's own usual range (core/scoring through
// model.buildView). Blood pressure is asked on BP days (every third mission day) or when flagged.
// Saving updates every screen and is kept for the flight surgeon.
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { MetricKey } from '../../data/types';
import { buildView, MOOD_WORD, useStationData, SYSTEMS, RANK, CW_LABEL, CW_RANK, fmtV } from '../model';
import { Btn, CW_STATUS, roleOf } from '../ds';
import { Bar, Check, Page, SideCap } from '../frame';
import { RowVital } from '../vitals';
import { useStation, type Extras } from '../state';
import { cue } from '../ui';
import { CameraScanCard, ReactionCard } from '../sensors';
import '../checkin.css';

/** 7.3333 h -> [7, 20]; rounds to 5 minutes so the display never shows 7 h 60 min. */
const hmParts = (h: number): [number, number] => {
  const m = Math.round((h * 60) / 5) * 5;
  return [Math.floor(m / 60), m % 60];
};
const hm = (h: number) => {
  const [a, b] = hmParts(h);
  return b ? `${a} h ${String(b).padStart(2, '0')} min` : `${a} h`;
};

const Backdrop = lazy(() => import('../Backdrop'));

type Step =
  | { id: string; title: string; ask: string; kind: 'number'; k: MetricKey; step: number; min: number; max: number }
  | { id: string; title: string; ask: string; kind: 'scale'; k?: MetricKey; ex?: 'sleepQuality' | 'energy'; words: string[] }
  | { id: string; title: string; ask: string; kind: 'pvt' | 'bp' | 'text' };

const ALL: Step[] = [
  { id: 'sleep', title: 'Sleep', ask: 'How many hours did you sleep?', kind: 'number', k: 'sleep_h', step: 1 / 6, min: 2, max: 11 },
  { id: 'sq', title: 'Sleep quality', ask: 'How well did you sleep?', kind: 'scale', ex: 'sleepQuality', words: ['', 'Very poor', 'Poor', 'Fair', 'Good', 'Great'] },
  { id: 'mood', title: 'Mood', ask: 'How do you feel right now?', kind: 'scale', k: 'mood', words: MOOD_WORD },
  { id: 'energy', title: 'Energy', ask: 'How much energy do you have?', kind: 'scale', ex: 'energy', words: ['', 'Drained', 'Low', 'Okay', 'Good', 'Full'] },
  { id: 'pvt', title: 'Reaction test', ask: '30 seconds. Tired shows here before you feel it.', kind: 'pvt' },
  { id: 'hr', title: 'Heart rate', ask: 'Resting, seated. Watch reading or a camera estimate.', kind: 'number', k: 'hr', step: 1, min: 35, max: 140 },
  { id: 'ex', title: 'Exercise', ask: 'Minutes on the treadmill, bike and resistance device today.', kind: 'number', k: 'exercise_min', step: 5, min: 0, max: 240 },
  { id: 'bp', title: 'Blood pressure', ask: 'Seated, cuff at heart level.', kind: 'bp' },
  { id: 'sym', title: 'Symptoms', ask: 'Anything today? Tap all that apply, or none.', kind: 'text' },
];
/** Symptom tap-list (no free text): the common in-flight complaints. */
const SYMPTOMS = ['Headache', 'Congestion', 'Rash', 'Back pain', 'Eyes or vision', 'Stomach', 'Other'];
const BP = { sys: { k: 'bp_sys' as MetricKey, step: 1, min: 80, max: 180 }, dia: { k: 'bp_dia' as MetricKey, step: 1, min: 40, max: 120 } };

export default function Checkin() {
  const { data, views, env, day } = useStationData();
  const { id } = useParams();
  const nav = useNavigate();
  const save = useStation((s) => s.saveCheckin);
  const toast = useStation((s) => s.toast);
  const sound = useStation((s) => s.sound);
  const settle = useStation((s) => s.settlePlan);
  const plans = useStation((s) => s.plans);
  const me = useStation((s) => s.me);
  const v = views.find((x) => x.m.id === (me && me !== 'medic' ? me : id));
  const [i, setI] = useState(0);
  const [draft, setDraft] = useState<Partial<Record<MetricKey, number>>>({});
  const [ex, setEx] = useState<Extras>({});
  const [seen, setSeen] = useState<Set<number>>(new Set());
  const [dir, setDir] = useState<1 | -1>(1);
  const advance = useRef<number>();

  useEffect(() => {
    setDraft({});
    setEx({});
    setI(0);
    setSeen(new Set());
  }, [v?.m.id]);
  useEffect(() => () => window.clearTimeout(advance.current), []);
  const keys = useRef<(e: KeyboardEvent) => void>();
  useEffect(() => {
    const on = (e: KeyboardEvent) => keys.current?.(e);
    // capture phase: on a 1-5 question the digits answer it instead of switching pages
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  }, []);

  const preview = useMemo(() => (v && data ? buildView(data.crew, data.crew.crew.find((m) => m.id === v.m.id)!, draft, env, true) : null), [v, data, draft, env]);
  if (!data) return null;
  if (!v || !preview) return <PickCrew />;

  // blood pressure: every third mission day or when flagged; reaction test: every fourth day (as NASA's test schedule)
  const steps = ALL.filter((s) => (s.id !== 'bp' || day % 3 === 0 || v.rows.bp_sys.cw !== 'nominal') && (s.id !== 'pvt' || day % 4 === 0));
  const last = i === steps.length;
  const cur = steps[i];
  const raw = data.crew.crew.find((m) => m.id === v.m.id)!;
  const before = buildView(data.crew, raw, undefined, env, false);

  const answered = (s: Step) =>
    s.kind === 'number' ? draft[s.k] != null : s.kind === 'scale' ? (s.k ? draft[s.k] != null : ex[s.ex!] != null) : s.kind === 'pvt' ? ex.pvtMs != null : s.kind === 'bp' ? draft.bp_sys != null : !!ex.symptoms;
  const go = (n: number) => {
    window.clearTimeout(advance.current);
    cue('tick', sound);
    setSeen((x) => new Set(x).add(i));
    setDir(n < i ? -1 : 1);
    setI(n);
  };
  // a tap only picks the answer; the crew moves on with Next (Emile, 15 Nov: no auto-advance)
  const pickThenNext = (apply: () => void) => {
    apply();
  };
  const set = (k: MetricKey, val: number) => setDraft((d) => ({ ...d, [k]: Math.round(val * 100) / 100 }));
  const start = (k: MetricKey) => draft[k] ?? Math.round(preview.rows[k].mean ?? preview.rows[k].value ?? 0);

  const finish = () => {
    save(v.m.id, { at: Date.now(), values: draft, before: before.overall, after: preview.overall, xp: 0 }, ex);
    cue('chime', sound);
    for (const [key, plan] of Object.entries(plans)) {
      const [cid, metric] = key.split(':');
      if (cid !== v.m.id || plan.stage !== 'started') continue;
      const r = preview.rows[metric as MetricKey];
      if (!r || !(metric in draft)) continue;
      const ok = r.status === 'green';
      settle(cid, metric, ok ? 'resolved' : 'escalated');
      window.setTimeout(() => toast(ok ? { tone: 'green', title: `${r.label} back in range`, body: 'The countermeasure worked.' } : { tone: 'red', title: `${r.label} still flagged`, body: 'Queued for the flight surgeon.' }), 900);
    }
    toast({ tone: preview.overall === 'green' ? 'green' : preview.overall, title: `${roleOf(v.m)} checked in`, body: `${CW_LABEL[preview.cw]}. Saved for the flight surgeon.` });
    const worst = SYSTEMS.map((s) => s.id).sort((a, b) => RANK[preview.status[b]] - RANK[preview.status[a]])[0];
    nav(`/body/${v.m.id}${preview.overall !== 'green' ? `?s=${worst}` : ''}`);
  };

  const stepper = (k: MetricKey, st: number, min: number, max: number, label: string) => {
    const r = preview.rows[k];
    const val = draft[k];
    const d = st < 1 ? 1 : 0;
    // sleep is read as hours and minutes (7 h 20 min), not a decimal (7.3)
    const isHM = k === 'sleep_h';
    const range = r.mean != null ? (isHM ? `Your usual ${hm(r.lo!)} – ${hm(r.hi!)}` : `Your usual ${r.lo!.toFixed(d)}–${r.hi!.toFixed(d)} ${r.unit}`) : '';
    return (
      <div key={k} className="ds-field" data-s={val == null ? undefined : r.status}>
        <div className="ds-field-h">
          {label && <b>{label}</b>}
          <span>{range}</span>
        </div>
        <div className="ds-field-v">
          <button type="button" className="ds-step" onClick={() => (cue('tick', sound), set(k, Math.max(min, start(k) - (draft[k] == null ? 0 : st))))} aria-label={`Less ${label}`}>
            −
          </button>
          {isHM ? (
            <output aria-label={hm(val ?? start(k))}>
              <span className={val == null ? 'ck-ghost' : undefined}>{hmParts(val ?? start(k))[0]}</span>
              <small>h</small>
              <span className={val == null ? 'ck-ghost' : undefined}>{String(hmParts(val ?? start(k))[1]).padStart(2, '0')}</span>
              <small>min</small>
            </output>
          ) : (
            <output>
              <span className={val == null ? 'ck-ghost' : undefined}>{fmtV(k, val ?? start(k))}</span>
              <small>{r.unit}</small>
            </output>
          )}
          <button type="button" className="ds-step" onClick={() => (cue('tick', sound), set(k, Math.min(max, start(k) + (draft[k] == null ? 0 : st))))} aria-label={`More ${label}`}>
            +
          </button>
        </div>
        <input className="ds-range" type="range" min={min} max={max} step={isHM ? 5 / 60 : st} value={val ?? start(k)} onChange={(e) => set(k, Number(e.target.value))} aria-label={label} />
        {val != null && r.status !== 'green' && r.action && (
          <p className="ds-hint">
            <em>{r.action}</em>
          </p>
        )}
      </div>
    );
  };

  let body: React.ReactNode = null;
  if (cur?.kind === 'number') {
    body = (
      <>
        {cur.k === 'hr' && (
          <CameraScanCard
            onResult={(bpm, br, conf) => {
              set('hr', bpm);
              setEx((e) => ({ ...e, scanBpm: bpm, scanBreathing: br, scanConf: conf }));
            }}
          />
        )}
        {stepper(cur.k, cur.step, cur.min, cur.max, cur.k === 'hr' && ex.scanBpm ? 'Camera estimate' : '')}
      </>
    );
  } else if (cur?.kind === 'scale') {
    const val = cur.k ? draft[cur.k] : ex[cur.ex!];
    body = (
      <div className="ds-field">
        <div className="ds-scale">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" className={val === n ? 'is-on' : ''} aria-pressed={val === n} onClick={() => pickThenNext(() => (cue('tick', sound), cur.k ? set(cur.k, n) : setEx((e) => ({ ...e, [cur.ex!]: n }))))}>
              <b>{n}</b>
              {cur.words[n]}
            </button>
          ))}
        </div>
      </div>
    );
  } else if (cur?.kind === 'pvt') {
    body = <ReactionCard subject={v.m.id} onResult={(ms, lapses, st, usual) => setEx((e) => ({ ...e, pvtMs: ms, pvtLapses: lapses, pvtStatus: st, pvtUsual: usual }))} />;
  } else if (cur?.kind === 'bp') {
    body = (
      <>
        {stepper(BP.sys.k, BP.sys.step, BP.sys.min, BP.sys.max, 'Upper number')}
        {stepper(BP.dia.k, BP.dia.step, BP.dia.min, BP.dia.max, 'Lower number')}
      </>
    );
  } else if (cur?.kind === 'text') {
    const picked = (ex.symptoms ?? '').split(', ').filter(Boolean);
    const toggle = (x: string) => {
      cue('tick', sound);
      const next = x === 'None' ? ['None'] : picked.includes(x) ? picked.filter((y) => y !== x) : [...picked.filter((y) => y !== 'None'), x];
      setEx((e) => ({ ...e, symptoms: next.join(', ') }));
    };
    body = (
      <div className="ds-field">
        <div className="ds-chips">
          {['None', ...SYMPTOMS].map((x) => (
            <button key={x} type="button" className={picked.includes(x) ? 'is-on' : ''} aria-pressed={picked.includes(x)} onClick={() => toggle(x)}>
              {x}
            </button>
          ))}
        </div>
      </div>
    );
  } else if (last) {
    const done = steps.filter(answered);
    body = (
      <>
        <p className="ds-note">
          {done.length} of {steps.length} answered{done.length < steps.length ? `. Skipped: ${steps.filter((s) => !answered(s)).map((s) => s.title.toLowerCase()).join(', ')}` : ''}.
          {ex.symptoms ? ` Symptoms: ${ex.symptoms.toLowerCase()}.` : ''}
        </p>
      </>
    );
  }

  // keyboard: Enter continues (unless a button has focus, which Enter already presses), 1-5 answers a scale
  keys.current = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target instanceof HTMLButtonElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (last) finish();
      else if (confirm) confirm();
      else go(i + 1);
    } else if (cur?.kind === 'scale' && /^[1-5]$/.test(e.key)) {
      e.stopPropagation();
      document.querySelectorAll<HTMLButtonElement>('.ck .ds-scale button')[Number(e.key) - 1]?.click();
    }
  };

  // a number step shows the usual value already: one tap takes it and moves on
  const confirm =
    cur && !answered(cur) && (cur.kind === 'number' || cur.kind === 'bp')
      ? () => {
          if (cur.kind === 'number') set(cur.k, start(cur.k));
          else (set(BP.sys.k, start(BP.sys.k)), set(BP.dia.k, start(BP.dia.k)));
          go(i + 1);
        }
      : null;

  const metric = cur?.kind === 'number' ? cur.k : cur?.kind === 'scale' && cur.k ? cur.k : cur?.kind === 'bp' ? 'bp_sys' : null;

  return (
    <Page
      className="is-check"
      title={`Daily check · ${roleOf(v.m)}`}
      left={[...steps, { id: 'review', title: 'Review', ask: '', kind: 'text' as const }].map((s, n) => (
        <Check key={s.id} s="green" mark={n === i || !seen.has(n) || n === steps.length ? n + 1 : undefined} title={s.title} word={n === i ? '' : seen.has(n) ? (answered(s) ? 'Done' : 'Skipped') : ''} on={n === i} onClick={() => go(n)} />
      ))}
      object={
        <div className="fr-panel ck">
          <div key={i} className="ck-step" data-dir={dir}>
            <p className="ck-count">{last ? 'Review' : `${i + 1} of ${steps.length}`}</p>
            <h2 className="ck-q">{last ? `With these values: ${CW_LABEL[preview.cw]}` : cur.ask}</h2>
            {body}
          </div>
        </div>
      }
      right={
        last ? (
          <>
            <SideCap>Body systems with these values</SideCap>
            {SYSTEMS.map((x) => (
              <Bar key={x.id} label={x.name} value={CW_LABEL[preview.sys[x.id]]} frac={(CW_RANK[preview.sys[x.id]] + 1) / 5} s={CW_STATUS[preview.sys[x.id]]} note={before.sys[x.id] !== preview.sys[x.id] ? `Was ${CW_LABEL[before.sys[x.id]]}` : undefined} />
            ))}
          </>
        ) : metric ? (
          <>
            <SideCap>Last 28 days</SideCap>
            <RowVital v={preview} r={preview.rows[metric]} />
          </>
        ) : undefined
      }
      footLeft={
        <Btn kind="secondary" onClick={() => (i ? go(i - 1) : nav(-1))}>
          {i ? 'Back' : 'Cancel'}
        </Btn>
      }
      footRight={
        last ? (
          <Btn onClick={finish}>Save</Btn>
        ) : confirm ? (
          <Btn onClick={confirm}>Confirm</Btn>
        ) : (
          <Btn onClick={() => go(i + 1)}>{answered(cur) ? 'Next' : 'Skip'}</Btn>
        )
      }
    />
  );
}

function PickCrew() {
  const { views } = useStationData();
  const nav = useNavigate();
  const due = views.filter((v) => !v.checkedIn);
  return (
    <Page
      title="Daily check"
      sub="About a minute, one question at a time"
      left={views.map((v) => (
        <Check key={v.m.id} s={v.checkedIn ? 'green' : 'amber'} title={roleOf(v.m)} word={v.checkedIn ? 'Done today' : 'Due today'} onClick={() => nav(`/check/${v.m.id}`)} />
      ))}
      object={
        <Suspense fallback={null}>
          <Backdrop side="center" />
        </Suspense>
      }
      right={
        <>
          <SideCap>Today</SideCap>
          <Bar label="Checks done" value={`${views.length - due.length} / ${views.length}`} frac={(views.length - due.length) / views.length} s={due.length ? 'amber' : 'green'} />
        </>
      }
      footRight={due[0] ? <Btn onClick={() => nav(`/check/${due[0].m.id}`)}>Start: {roleOf(due[0].m)}</Btn> : undefined}
    />
  );
}
