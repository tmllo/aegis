// One astronaut: five body systems on the left, the 3D body in the middle, the selected system on the
// right with each reading against their own baseline, the trend, what it means and what to do.
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { MetricKey, Status } from '../../data/types';
import { MOOD_WORD, SYSTEMS, SYSTEM_BY_ID, WORD, firstName, fmtV, issueLine, seatOf, useStationData, type CrewView, type MetricRow } from '../model';
import { useStation, type SystemId } from '../state';
import { Chip, cue, Dot, Icon, TrendChart } from '../ui';

const BodyCanvas = lazy(() => import('../BodyCanvas'));

const unitText = (r: MetricRow) => (r.unit === '1-5' ? '/5' : r.unit);
const valueText = (r: MetricRow) => (r.k === 'mood' && r.value != null ? `${r.value} · ${MOOD_WORD[r.value] ?? ''}` : fmtV(r.k, r.value));

export default function CrewHealth() {
  const { data, views, env } = useStationData();
  const { id } = useParams();
  const [qs, setQs] = useSearchParams();
  const nav = useNavigate();
  const alarm = useStation((s) => s.alarm);
  const sound = useStation((s) => s.sound);
  const v = views.find((x) => x.m.id === id) ?? [...views].sort((a, b) => rank(b.overall) - rank(a.overall))[0];
  const worstSys = v ? (SYSTEMS.map((s) => s.id).sort((a, b) => rank(v.status[b]) - rank(v.status[a]))[0] as SystemId) : 'heart';
  const sel = (qs.get('s') as SystemId | null) ?? (v && v.overall !== 'green' ? worstSys : null);
  const [surgeon, setSurgeon] = useState(false);

  useEffect(() => setSurgeon(false), [id]);

  const values = useMemo(() => {
    const out = {} as Record<SystemId, { name: string; line: string }>;
    if (!v) return out;
    for (const s of SYSTEMS) {
      const k = s.metrics[0];
      const r = v.rows[k];
      out[s.id] = {
        name: s.name,
        line: s.id === 'heart' ? `${fmtV('bp_sys', v.rows.bp_sys.value)}/${fmtV('bp_dia', v.rows.bp_dia.value)} · ${fmtV('hr', v.rows.hr.value)} bpm` : `${valueText(r)} ${r.k === 'mood' ? '' : unitText(r)}`,
      };
    }
    return out;
  }, [v]);

  if (!data || !v) return null;
  const pick = (s: SystemId | null) => {
    cue('tick', sound);
    const n = new URLSearchParams(qs);
    if (s) n.set('s', s);
    else n.delete('s');
    setQs(n, { replace: true });
  };

  return (
    <div className="st-page st-crewpage">
      <div className="st-crewtabs">
        {views.map((x) => (
          <button key={x.m.id} className={`st-crewtab is-${x.overall}${x.m.id === v.m.id ? ' is-on' : ''}`} onClick={() => nav(`/crew/${x.m.id}`)}>
            <Dot s={x.overall} pulse />
            <b>{seatOf(x.m)}</b>
            <span>{x.m.name}</span>
            <em>{WORD[x.overall]}</em>
          </button>
        ))}
        <div className="st-grow" />
        <button className="st-btn is-primary" onClick={() => nav(`/checkin/${v.m.id}`)}>
          {v.checkedIn ? 'Update check-in' : `Start ${firstName(v.m)}'s check-in`} <Icon.arrow />
        </button>
      </div>

      <div className="st-crew-grid">
        <aside className="st-systems">
          <div className="st-who">
            <p className="st-cap">
              {v.m.role} · age {v.m.age}
            </p>
            <h2 className={`st-word is-${v.overall}`}>{WORD[v.overall]}</h2>
            <p className="st-who-line">{v.issue ? issueLine(v.issue) : 'Every reading is inside their own usual range.'}</p>
          </div>
          <ul>
            {SYSTEMS.map((s) => {
              const st = v.status[s.id];
              const r = v.rows[s.metrics[0]];
              return (
                <li key={s.id}>
                  <button className={`st-sysbtn is-${st}${sel === s.id ? ' is-on' : ''}`} onClick={() => pick(sel === s.id ? null : s.id)}>
                    <Dot s={st} pulse size={10} />
                    <span className="st-sysbtn-name">
                      <b>{s.name}</b>
                      <em>{s.sub}</em>
                    </span>
                    <span className="st-sysbtn-val">{values[s.id]?.line.split(' · ')[0] ?? valueText(r)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="st-muted st-small">Status compares each reading with this astronaut's own first 14 mission days, not population norms. Amber at 2σ, red at 3σ or outside safe limits.</p>
        </aside>

        <div className="st-bodystage">
          <Suspense fallback={<div className="st-wait" />}>
            <BodyCanvas tint={v.status} focus={sel} values={values} onPick={(s) => pick(s === sel ? null : s)} storm={alarm.phase === 'warning' || alarm.phase === 'sheltered'} />
          </Suspense>
          <div className="st-bodyhint">
            {sel ? (
              <button className="st-btn is-ghost is-small" onClick={() => pick(null)}>
                ← Whole body
              </button>
            ) : (
              <span>Click an organ or a label · drag to rotate</span>
            )}
          </div>
        </div>

        <aside className="st-detail">
          {sel ? <SystemPanel v={v} sys={sel} onSurgeon={() => setSurgeon(true)} /> : <Summary v={v} onPick={pick} />}
        </aside>
      </div>
      {surgeon && <SurgeonModal v={v} sys={sel} onClose={() => setSurgeon(false)} delay={env === 'moon' ? '1.3 s' : env === 'iss' ? 'under 1 s' : 'several minutes'} />}
    </div>
  );
}

const rank = (s: Status) => ({ green: 0, amber: 1, red: 2 })[s];

function Summary({ v, onPick }: { v: CrewView; onPick: (s: SystemId) => void }) {
  return (
    <div className="st-panel">
      <p className="st-cap">Today's readings</p>
      <h3>{v.m.name}</h3>
      <div className="st-readgrid">
        {(['hr', 'bp_sys', 'sleep_h', 'mood', 'glucose', 'temp', 'exercise_min', 'dose_mSv_day'] as MetricKey[]).map((k) => {
          const r = v.rows[k];
          return (
            <button key={k} className={`st-read is-${r.status}`} onClick={() => onPick(SYSTEMS.find((s) => s.metrics.includes(k))!.id)}>
              <span>{r.label}</span>
              <b>
                {k === 'bp_sys' ? `${fmtV('bp_sys', r.value)}/${fmtV('bp_dia', v.rows.bp_dia.value)}` : fmtV(k, r.value)}
                <small>{unitText(r)}</small>
              </b>
              {r.mean != null && (
                <em>
                  usual {r.mean.toFixed(k === 'sleep_h' || k === 'temp' ? 1 : 0)}
                  {r.entered ? ' · entered today' : ''}
                </em>
              )}
            </button>
          );
        })}
      </div>
      {v.issues.length ? (
        <div className="st-callout is-amber">
          <b>{v.issues.length} reading{v.issues.length > 1 ? 's' : ''} need attention</b>
          <span>Pick a system to see the trend and what to do.</span>
        </div>
      ) : (
        <div className="st-callout is-green">
          <b>All systems nominal</b>
          <span>Keep the daily check-in going: the baseline only works with regular readings.</span>
        </div>
      )}
    </div>
  );
}

function SystemPanel({ v, sys, onSurgeon }: { v: CrewView; sys: SystemId; onSurgeon: () => void }) {
  const { data } = useStationData();
  const def = SYSTEM_BY_ID[sys];
  const st = v.status[sys];
  const called = useStation((s) => s.surgeon[v.m.id]);
  if (!data) return null;
  const rows = def.metrics.map((k) => v.rows[k]);
  const lead = [...rows].sort((a, b) => rank(b.status) - rank(a.status))[0];
  const meta = data.crew.metrics[lead.k];
  return (
    <div className="st-panel">
      <div className="st-panel-h">
        <div>
          <p className="st-cap">{v.m.name}</p>
          <h3>{def.name}</h3>
        </div>
        <Chip s={st} solid={st !== 'green'} />
      </div>
      {rows
        .filter((r) => r.value != null || r.history.some((h) => h.v != null))
        .map((r) => (
          <div key={r.k} className={`st-metric is-${r.status}`}>
            <div className="st-metric-h">
              <span>{data.crew.metrics[r.k].label}</span>
              <b>
                {valueText(r)}
                {r.k !== 'mood' && <small>{unitText(r)}</small>}
              </b>
            </div>
            <div className="st-metric-sub">
              {r.mean != null ? (
                <span>
                  Your usual {r.lo!.toFixed(r.k === 'sleep_h' || r.k === 'temp' ? 1 : 0)}–{r.hi!.toFixed(r.k === 'sleep_h' || r.k === 'temp' ? 1 : 0)}
                  {r.z != null && ` · ${r.z >= 0 ? '+' : '−'}${Math.abs(r.z).toFixed(1)}σ (3-day avg)`}
                </span>
              ) : (
                <span>Safe range {data.crew.metrics[r.k].absolute_red.min}–{data.crew.metrics[r.k].absolute_red.max} {r.unit}</span>
              )}
              {r.entered && <em>entered today</em>}
              {r.running > 1 && <em className={`is-${r.status}`}>{r.running} days flagged</em>}
            </div>
            {r.k !== 'dose_mSv_cum' && <TrendChart points={r.history} lo={r.lo} hi={r.hi} mean={r.mean} unit={r.unit} digits={r.k === 'temp' || r.k === 'sleep_h' ? 1 : 0} height={r.status === 'green' ? 86 : 118} />}
          </div>
        ))}

      {st !== 'green' && lead.action && (
        <div className={`st-todo is-${st}`}>
          <p className="st-cap">What to do now</p>
          <p className="st-todo-main">{lead.action}</p>
          {st === 'red' && (
            <button className={`st-btn ${called ? 'is-ghost' : 'is-red'}`} onClick={onSurgeon}>
              <Icon.phone /> {called ? 'Flight surgeon notified · open message' : 'Contact flight surgeon'}
            </button>
          )}
        </div>
      )}
      <div className="st-explain">
        <p className="st-cap">Why it matters in space</p>
        <p>{meta.explain}</p>
        <p className="st-cap">How to measure</p>
        <p>{meta.how_to_measure}</p>
      </div>
    </div>
  );
}

function SurgeonModal({ v, sys, onClose, delay }: { v: CrewView; sys: SystemId | null; onClose: () => void; delay: string }) {
  const call = useStation((s) => s.callSurgeon);
  const toast = useStation((s) => s.toast);
  const sound = useStation((s) => s.sound);
  const issues = v.issues.filter((r) => !sys || SYSTEM_BY_ID[sys].metrics.includes(r.k));
  const body = [
    `Crew member: ${v.m.name} (${v.m.role}), age ${v.m.age}`,
    `Status: ${WORD[v.overall]}`,
    ...issues.map((r) => `• ${issueLine(r)}`),
    '',
    'Attached: 28-day trend, personal baseline, today\'s check-in.',
    'Request: review and advise on next steps.',
  ].join('\n');
  const [text, setText] = useState(body);
  return (
    <div className="st-modal" onClick={onClose}>
      <div className="st-modal-box" onClick={(e) => e.stopPropagation()}>
        <p className="st-cap">Message to flight surgeon · signal delay {delay}</p>
        <h3>Private medical conference request</h3>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} />
        <div className="st-modal-actions">
          <button className="st-btn is-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="st-btn is-red"
            onClick={() => {
              call(v.m.id);
              cue('chime', sound);
              toast({ tone: 'info', title: 'Sent to flight surgeon', body: `Medical conference requested for ${v.m.name}. Data package attached.` });
              onClose();
            }}
          >
            Send with data package
          </button>
        </div>
      </div>
    </div>
  );
}
