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
  const stage = !plan ? 1 : plan.stage === 'started' ? 2 : 3;
  const steps = [
    { t: 'Detected', d: r.running > 1 ? `For ${r.running} days` : 'Today' },
    { t: 'Action', d: plan ? 'Started' : 'Not started' },
    { t: 'Re-measure', d: plan?.stage === 'started' ? 'At the next check' : plan ? 'Done' : '—' },
    { t: 'Outcome', d: plan?.stage === 'resolved' ? 'Back in range' : plan?.stage === 'escalated' ? 'To the surgeon' : '—' },
  ];
  const action = r.action ?? 'Keep logging every day. The trend is being watched; no action needed yet.';
  const habits: MetricKey[] = ['sleep_h', 'exercise_min', 'mood'];

  return (
    <Page
      title="Care"
      sub={`${items.length} open · act before anything turns critical`}
      left={items.map((x) => {
        const k = `${x.v.m.id}:${x.r.k}`;
        return <Check key={k} s={CW_STATUS[x.r.cw]} title={me === 'medic' ? `${roleOf(x.v.m)} · ${x.r.label}` : x.r.label} word={`${CW_LABEL[x.r.cw]} · ${plainLine(x.r).replace(`${x.r.label} is `, '')}`} on={k === `${v.m.id}:${r.k}`} onClick={() => open(k)} />;
      })}
      object={
        <div className="fr-panel">
          <p className="fr-cap">
            {roleOf(v.m)} · {sys.name} · {CW_LABEL[r.cw]}
          </p>
          <p className="fr-big">{action}</p>
          <ol className="fr-loop">
            {steps.map((s, i) => (
              <li key={s.t} className={i < stage ? 'is-done' : i === stage ? 'is-now' : ''}>
                <b>
                  {i + 1}. {s.t}
                </b>
                {s.d}
              </li>
            ))}
          </ol>
          <p className="ds-note">{sys.why}</p>
        </div>
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
            Contact surgeon
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
