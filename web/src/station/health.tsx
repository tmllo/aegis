// Health building blocks: caution & warning chip, the countermeasure loop, linked causes, the live wrist
// band, the 28-day system record and the real-data evidence (Inspiration4 labs). All read the same model.
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCabin } from '../data/cabin';
import type { RealCrew, Status } from '../data/types';
import { useWristband } from '../wearable/useWristband';
import { CW_LABEL, CW_OWNER, LEVEL_STATUS, LEVEL_WORD, SYSTEMS, fmtV, useStationData, type CW, type CrewView, type MetricRow } from './model';
import { useStation, type SystemId } from './state';
import { Dot, Spark } from './ui';

export function CWChip({ cw, owner = false, size = 'md' }: { cw: CW; owner?: boolean; size?: 'md' | 'lg' }) {
  return (
    <span className={`st-cw is-${cw} is-${size}`}>
      <i />
      <b>{CW_LABEL[cw]}</b>
      {owner && <em>{CW_OWNER[cw]}</em>}
    </span>
  );
}

const SEV_CLASS: Record<Status, string> = { green: 'n', amber: 'c', red: 'w' };

/** 28 days × 5 systems: the worst flag each day. Patterns across systems show at a glance. */
export function SystemRecord({ v, onPick, sel }: { v: CrewView; onPick?: (s: SystemId) => void; sel?: SystemId | null }) {
  const days = v.rows.hr.history.map((h) => h.date);
  return (
    <div className="st-record">
      <div className="st-record-h">
        <span className="st-cap">28-day health record</span>
        <span className="st-record-key">
          <i className="c" /> caution <i className="w" /> warning
        </span>
      </div>
      {SYSTEMS.map((s) => (
        <div key={s.id} className={`st-record-row${sel === s.id ? ' is-on' : ''}`} onClick={() => onPick?.(s.id)}>
          <span>{s.short}</span>
          <div>
            {days.map((d, i) => {
              let worst: Status = 'green';
              let miss = true;
              for (const k of s.metrics) {
                const h = v.rows[k].history[i];
                if (h?.v != null) miss = false;
                if (h?.flag === 'red' || (h?.flag === 'amber' && worst === 'green')) worst = h.flag;
              }
              return <i key={d} className={miss ? 'm' : SEV_CLASS[worst]} title={`${d}: ${worst === 'green' ? 'nominal' : worst === 'amber' ? 'caution' : 'warning'}`} />;
            })}
          </div>
        </div>
      ))}
      <div className="st-record-axis">
        <span>{days[0]?.slice(5)}</span>
        <span>today</span>
      </div>
    </div>
  );
}

/** Detected -> countermeasure -> re-measure -> outcome. Closing the loop is what makes it a health system. */
export function Loop({ v, r }: { v: CrewView; r: MetricRow }) {
  const plan = useStation((s) => s.plans[`${v.m.id}:${r.k}`]);
  const start = useStation((s) => s.startPlan);
  const toast = useStation((s) => s.toast);
  const nav = useNavigate();
  const firstDay = r.history[r.history.length - r.running]?.date;
  const stage = !plan ? 1 : plan.stage === 'started' ? 2 : 3;
  const steps = [
    { t: 'Detected', d: firstDay ? `${r.running} day${r.running > 1 ? 's' : ''} · since ${firstDay.slice(5)}` : 'today' },
    { t: 'Countermeasure', d: plan ? 'started' : 'not started' },
    { t: 'Re-measure', d: plan?.stage === 'started' ? 'due at next check-in' : plan ? 'done' : '—' },
    { t: 'Outcome', d: plan?.stage === 'resolved' ? 'back in range' : plan?.stage === 'escalated' ? 'escalated to surgeon' : '—' },
  ];
  return (
    <div className={`st-loop is-${r.cw}`}>
      <p className="st-cap">Countermeasure loop · {r.label}</p>
      <ol>
        {steps.map((s, i) => (
          <li key={s.t} className={i < stage ? 'is-done' : i === stage ? 'is-on' : ''}>
            <i>{i < stage ? '✓' : i + 1}</i>
            <b>{s.t}</b>
            <span>{s.d}</span>
          </li>
        ))}
      </ol>
      <p className="st-loop-act">{r.action}</p>
      <div className="st-loop-btns">
        {!plan && (
          <button
            className="st-btn is-primary is-small"
            onClick={() => {
              start(v.m.id, r.k, r.status);
              toast({ tone: 'info', title: 'Countermeasure started', body: `${r.label}: re-measure due at ${v.m.name.split(' ').slice(-1)[0]}'s next check-in.` });
            }}
          >
            Start countermeasure
          </button>
        )}
        {plan?.stage === 'started' && (
          <button className="st-btn is-small" onClick={() => nav(`/checkin/${v.m.id}`)}>
            Re-measure now →
          </button>
        )}
      </div>
    </div>
  );
}

interface CauseItem {
  label: string;
  value: string;
  s: Status;
  note: string;
}

/** Linked factors: what else is moving that could explain this system, and what it affects. */
export function Causes({ v, sys }: { v: CrewView; sys: SystemId }) {
  const { data, sw, env } = useStationData();
  const { cabin } = useCabin();
  const ex = useStation((s) => s.extras[v.m.id]);
  if (!data) return null;
  const co2 = cabin?.readings.find((r) => r.metric.key === 'cabin.ppco2');
  const ctemp = cabin?.readings.find((r) => r.metric.key === 'cabin.temp');
  const R = v.rows;
  const row = (k: keyof typeof R, note: string): CauseItem => ({ label: R[k].label, value: `${fmtV(k, R[k].value)} ${R[k].unit === '1-5' ? '/5' : R[k].unit}`, s: R[k].status, note });
  const co2Item: CauseItem | null = co2?.value != null ? { label: 'Cabin CO₂', value: `${co2.value.toFixed(2)} mmHg`, s: co2.status ?? 'green', note: 'High CO₂ brings headaches and poor sleep; ISS keeps it low for this reason' } : null;
  const items: (CauseItem | null)[] =
    sys === 'heart'
      ? [row('exercise_min', 'Exercise keeps the heart loaded without gravity'), row('sleep_h', 'Short sleep raises blood pressure'), co2Item, { label: 'Fluid shift', value: data.crew.environments[env].label, s: 'green', note: 'Lower gravity moves fluid headward and changes pressure' }]
      : sys === 'brain'
        ? [co2Item, row('mood', 'Mood and sleep move together'), row('exercise_min', 'Exercise improves sleep quality'), ex?.pvtMs ? { label: 'Reaction time', value: `${ex.pvtMs} ms`, s: ex.pvtStatus ?? 'green', note: 'PVT, the fatigue test ISS crews use' } : null, ex?.stress ? { label: 'Stress (self-report)', value: `${ex.stress}/5`, s: ex.stress >= 4 ? 'amber' : 'green', note: 'Logged in today’s health check' } : null]
        : sys === 'bones'
          ? [row('exercise_min', 'Resistance exercise is the only bone countermeasure'), row('bone_loss_pct', `About ${((R.bone_loss_pct.value ?? 0) / Math.max(1, v.m.series.length / 30)).toFixed(2)}% a month on this mission`), { label: 'Gravity', value: data.crew.environments[env].label, s: 'green', note: env === 'iss' || env === 'transit' ? 'Weightless: no load on the skeleton' : 'Partial gravity: some load, not enough' }]
          : sys === 'blood'
            ? [row('sleep_h', 'Sleep loss raises fasting glucose'), ex?.stress ? { label: 'Stress (self-report)', value: `${ex.stress}/5`, s: ex.stress >= 4 ? 'amber' : 'green', note: 'Stress hormones raise blood sugar' } : null, row('dose_mSv_day', 'Radiation lowers lymphocyte counts')]
            : [sw ? { label: 'Space weather', value: `${LEVEL_WORD[sw.level]} · ${Math.round(sw.p * 100)}%`, s: LEVEL_STATUS[sw.level], note: `Solar storm chance in the next ${data.storm.meta.horizon_hours} h` } : null, { label: 'Habitat dose rate', value: `${data.crew.environments[env].dose_mSv_day} mSv/day`, s: 'green', note: data.crew.environments[env].label }, ctemp?.value != null ? { label: 'Cabin temperature', value: `${ctemp.value.toFixed(1)} °C`, s: ctemp.status ?? 'green', note: 'A hot cabin raises body temperature' } : null];
  return (
    <div className="st-causes">
      <p className="st-cap">Linked factors</p>
      {items
        .filter((x): x is CauseItem => !!x)
        .map((c) => (
          <div key={c.label} className={`st-cause is-${c.s}`}>
            <Dot s={c.s} size={8} />
            <div>
              <b>{c.label}</b>
              <span>{c.note}</span>
            </div>
            <em>{c.value}</em>
          </div>
        ))}
    </div>
  );
}

/** Live wrist band (simulated stream from the member's own baseline). */
export function WristTile({ v }: { v: CrewView }) {
  const { data } = useStationData();
  const b = v.m.baseline.hr;
  const band = useWristband({ subject: v.m.id, hrMean: b?.mean ?? 62, hrSd: b?.sd ?? 4, day: data?.crew.mission.today, upload: false });
  const { status, connect } = band;
  useEffect(() => {
    if (status === 'off') connect('sim');
  }, [status, connect, v.m.id]);
  const r = band.reading;
  return (
    <div className="st-wrist">
      <div className="st-wrist-h">
        <span className="st-cap">
          <i className={`st-live${status === 'connected' ? ' is-on' : ''}`} /> Live · wrist band
        </span>
        <span className="st-muted st-small">{status === 'connected' ? 'simulated stream, 1 Hz' : 'pairing…'}</span>
      </div>
      <div className="st-wrist-grid">
        <div>
          <b>{r ? Math.round(r.hr) : '—'}</b>
          <span>HR bpm</span>
        </div>
        <div>
          <b>{r ? r.spo2.toFixed(0) : '—'}</b>
          <span>SpO₂ % · demo</span>
        </div>
        <div>
          <b>{r ? r.skinTemp.toFixed(1) : '—'}</b>
          <span>Skin °C · demo</span>
        </div>
        <Spark values={band.hrHistory} s="green" w={150} h={40} />
      </div>
    </div>
  );
}

/** Real NASA data behind the personal-baseline idea: Inspiration4 blood panels (OSDR OSD-575). */
export function LabEvidence({ real }: { real: RealCrew | null }) {
  const stats = useMemo(() => {
    if (!real) return null;
    const far = real.flags.filter((f) => f.kind === 'inside_lab_far_from_baseline');
    const out = real.flags.filter((f) => f.kind === 'outside_lab_range');
    const label = Object.fromEntries(real.analytes.map((a) => [a.key, a.label]));
    return { far, out, label, top: [...far].sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 3) };
  }, [real]);
  if (!stats) return null;
  return (
    <div className="st-evidence">
      <p className="st-cap">Real data · Inspiration4 blood panels · NASA OSDR OSD-575</p>
      <div className="st-evidence-n">
        <div>
          <b>{stats.far.length}</b>
          <span>post-flight results inside the normal lab range but ≥2σ from that astronaut's own baseline</span>
        </div>
        <div>
          <b className="st-muted">{stats.out.length}</b>
          <span>outside the lab range: all a standard check would catch</span>
        </div>
      </div>
      <ul>
        {stats.top.map((f) => (
          <li key={`${f.crew}${f.timepoint}${f.analyte}`}>
            <span>
              {f.crew} · {f.timepoint}
            </span>
            <b>{stats.label[f.analyte]}</b>
            <em>
              {f.pct_change > 0 ? '+' : ''}
              {f.pct_change.toFixed(0)}% · {f.z.toFixed(1)}σ · lab range says normal
            </em>
          </li>
        ))}
      </ul>
    </div>
  );
}
