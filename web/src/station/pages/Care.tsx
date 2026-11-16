// Care: guidance on treatment and improvement (the challenge's second half).
// Left: every open item (cautions, warnings, drifts). Centre: what to do, in one sentence, and the countermeasure loop (detected, countermeasure,
// re-measure, outcome). Right: that body system's readings and the habits that move most flags
// (sleep, exercise, mood), each as a vital card.
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { MetricKey } from '../../data/types';
import { CW_LABEL, CW_RANK, SYSTEM_BY_ID, metricSystem, useStationData, type CrewView, type MetricRow } from '../model';
import { Btn, CW_STATUS, plainLine, roleOf } from '../ds';
import { Check, Page, SideCap } from '../frame';
import { RowVital } from '../vitals';
import { useStation } from '../state';
import { cue } from '../ui';


export default function Care() {
  const { data, views } = useStationData();
  const [qs, setQs] = useSearchParams();
  const nav = useNavigate();
  const plans = useStation((s) => s.plans);
  const start = useStation((s) => s.startPlan);
  const toast = useStation((s) => s.toast);
  const sound = useStation((s) => s.sound);
  if (!data) return null;

  // open items: flagged readings first, then drifts, worst first
  const me = useStation((s) => s.me);
  const shared = useStation((s) => s.shared);
  const visible = me === 'medic' ? views.filter((x) => shared[x.m.id] !== false) : views.filter((x) => x.m.id === me);
  const items: { v: CrewView; r: MetricRow }[] = visible
    .flatMap((v) => [...v.issues, ...v.drifts].map((r) => ({ v, r })))
    .sort((a, b) => CW_RANK[b.r.cw] - CW_RANK[a.r.cw]);
  const c = qs.get('c');
  const pre = c ? items.find((x) => x.v.m.id === c) : undefined;
  const key = qs.get('i') ?? (pre ? `${pre.v.m.id}:${pre.r.k}` : null);
  const cur = items.find((x) => `${x.v.m.id}:${x.r.k}` === key) ?? items[0];
  const open = (k: string) => {
    cue('tick', sound);
    setQs({ i: k }, { replace: true });
  };

  if (!cur)
    return (
      <Page
        title="Care"
        sub="Nothing open. Every reading is inside its usual range."
        footRight={<Btn onClick={() => nav('/check')}>Daily check</Btn>}
      />
    );

  const { v, r } = cur;
  const plan = plans[`${v.m.id}:${r.k}`];
  const sys = SYSTEM_BY_ID[metricSystem(r.k)];
  const warn = r.cw === 'warning' || r.cw === 'emergency';
  const action = r.action ?? 'Keep logging every day. The trend is being watched; no action needed yet.';
  // one plain step list: noticed, do this, re-measure, result. The current step is the one to act on.
  const stage = !plan ? 1 : plan.stage === 'started' ? 2 : 3;
  const steps = [
    { t: 'Noticed', d: `${plainLine(r)}.` },
    { t: warn ? 'Tell Earth support' : 'Do this', d: action },
    { t: 'Re-measure', d: plan?.stage === 'started' ? "At tomorrow's check-in." : "At the next check-in, to see if it helped." },
    {
      t: 'Result',
      d: plan?.stage === 'resolved' ? 'Back in your usual range.' : plan?.stage === 'escalated' ? 'Sent to the Earth support team.' : 'Back in range, or it goes to the Earth support team.',
    },
  ];
  const habits: MetricKey[] = ['sleep_h', 'exercise_min', 'mood'];

  return (
    <Page
      title="Care"
      sub={items.length === 1 ? 'One thing to look after' : `${items.length} things to look after, worst first`}
      left={items.map((x) => {
        const k = `${x.v.m.id}:${x.r.k}`;
        return <Check key={k} s={CW_STATUS[x.r.cw]} title={me === 'medic' ? `${roleOf(x.v.m)} · ${x.r.label}` : x.r.label} word={`${CW_LABEL[x.r.cw]} · ${plainLine(x.r).replace(`${x.r.label} is `, '')}`} on={k === `${v.m.id}:${r.k}`} onClick={() => open(k)} />;
      })}
      object={
        <section className="cp" aria-label={`${r.label}: what to do`}>
          <header className="cp-head">
            <span className={`cp-mark is-${CW_STATUS[r.cw]}`} aria-hidden />
            <div>
              <b>{me === 'medic' ? `${roleOf(v.m)} · ${r.label}` : r.label}</b>
              <span>{sys.name}</span>
            </div>
            <em className={`is-${CW_STATUS[r.cw]}`}>{CW_LABEL[r.cw]}</em>
          </header>
          <ol className="cp-steps">
            {steps.map((s, i) => (
              <li key={s.t} className={i < stage ? 'is-done' : i === stage ? 'is-now' : ''} aria-current={i === stage ? 'step' : undefined}>
                <i aria-hidden>{i < stage ? '✓' : i + 1}</i>
                <div>
                  <b>{s.t}</b>
                  <p>{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="cp-why">{sys.why}</p>
        </section>
      }
      right={
        <>
          <SideCap>Last 28 days</SideCap>
          {[...new Set<MetricKey>([...sys.metrics.filter((k) => k !== 'bp_dia' && k !== 'dose_mSv_cum' && v.rows[k].value != null), ...habits])].map((k) => (
            <RowVital key={k} v={v} r={v.rows[k]} />
          ))}
        </>
      }
      footLeft={
        <Btn kind="secondary" onClick={() => nav(`/body/${v.m.id}?s=${sys.id}`)}>
          Open in body
        </Btn>
      }
      footRight={
        r.cw === 'warning' ? (
          <Btn kind="danger" onClick={() => nav(`/surgeon?c=${v.m.id}`)}>
            Contact Earth support
          </Btn>
        ) : !plan && r.cw !== 'advisory' ? (
          <Btn
            onClick={() => {
              start(v.m.id, r.k, r.status);
              cue('chime', sound);
              toast({ tone: 'info', title: 'Action started', body: `${r.label}: re-measure at the next daily check.` });
            }}
          >
            Start countermeasure
          </Btn>
        ) : (
          <Btn onClick={() => nav('/check')}>Re-measure now</Btn>
        )
      }
    />
  );
}
