// One astronaut: five body systems on the left, the 3D body in the middle, the selected system on the
// right with each reading against their own baseline, the trend, what it means and what to do.
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { MetricKey, Status } from '../../data/types';
import { CW_LABEL, CW_RANK, DUTY_LABEL, HAZARD_LABEL, MOOD_WORD, SYSTEMS, SYSTEM_BY_ID, WORD, dutyOf, firstName, fmtV, issueLine, seatOf, useStationData, type CrewView, type MetricRow } from '../model';
import { Causes, CWChip, LabEvidence, Loop, SystemRecord, WristTile } from '../health';
import { useStation, type SystemId } from '../state';
import { cue, Dot, Icon, TrendChart } from '../ui';
import { EnvironmentalCauseChip } from '../../habitat';
import { useHabitatData } from '../habitat';

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
  const worstSys = v ? (SYSTEMS.map((s) => s.id).sort((a, b) => CW_RANK[v.sys[b]] - CW_RANK[v.sys[a]])[0] as SystemId) : 'heart';
  const sel = (qs.get('s') as SystemId | null) ?? (v && v.overall !== 'green' ? worstSys : null);
  const alarmOn = alarm.phase === 'warning' || alarm.phase === 'sheltered';
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
          <button key={x.m.id} className={`st-crewtab is-${x.cw}${x.m.id === v.m.id ? ' is-on' : ''}`} onClick={() => nav(`/crew/${x.m.id}`)}>
            <Dot s={x.overall} pulse />
            <b>{seatOf(x.m)}</b>
            <span>{x.m.name}</span>
            <em className={`is-${x.cw}`}>{CW_LABEL[x.cw]}</em>
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
            <h2>{v.m.name}</h2>
            <CWChip cw={alarmOn ? 'emergency' : v.cw} owner size="lg" />
            <p className={`st-duty is-${dutyOf(v.cw, alarmOn)}`}>{DUTY_LABEL[dutyOf(v.cw, alarmOn)]}</p>
            <p className="st-who-line">{v.issue ? issueLine(v.issue) : v.drifts[0] ? `${v.drifts[0].label} drifting ${v.drifts[0].z! >= 0 ? 'up' : 'down'} ${Math.abs(v.drifts[0].z!).toFixed(1)}σ, still within limits.` : 'Every reading is inside their own usual range.'}</p>
          </div>
          <ul>
            {SYSTEMS.map((s) => {
              const c = v.sys[s.id];
              const r = v.rows[s.metrics[0]];
              return (
                <li key={s.id}>
                  <button className={`st-sysbtn is-${c}${sel === s.id ? ' is-on' : ''}`} onClick={() => pick(sel === s.id ? null : s.id)}>
                    <i className={`st-cwbar is-${c}`} />
                    <span className="st-sysbtn-name">
                      <b>{s.name}</b>
                      <em>{values[s.id]?.line.split(' · ')[0] ?? valueText(r)}</em>
                    </span>
                    <span className={`st-sysbtn-cw is-${c}`}>{CW_LABEL[c]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <SystemRecord v={v} sel={sel} onPick={(s) => pick(s)} />
        </aside>

        <div className="st-bodystage">
          <Suspense fallback={<div className="st-wait" />}>
            <BodyCanvas tint={v.status} focus={sel} values={values} onPick={(s) => pick(s === sel ? null : s)} storm={alarmOn} />
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
  const nav = useNavigate();
  return (
    <div className="st-panel">
      <div className="st-panel-h">
        <div>
          <p className="st-cap">Today · all systems</p>
          <h3>Health snapshot</h3>
        </div>
        <button className="st-btn is-small" onClick={() => nav(`/checkin/${v.m.id}`)}>
          Health check →
        </button>
      </div>
      <WristTile v={v} />
      <div className="st-readgrid">
        {(['bp_sys', 'hr', 'sleep_h', 'mood', 'glucose', 'temp', 'exercise_min', 'dose_mSv_day'] as MetricKey[]).map((k) => {
          const r = v.rows[k];
          return (
            <button key={k} className={`st-read is-${r.cw}`} onClick={() => onPick(SYSTEMS.find((s) => s.metrics.includes(k))!.id)}>
              <span>{r.label}</span>
              <b>
                {k === 'bp_sys' ? `${fmtV('bp_sys', r.value)}/${fmtV('bp_dia', v.rows.bp_dia.value)}` : fmtV(k, r.value)}
                <small>{unitText(r)}</small>
              </b>
              {r.mean != null ? (
                <em>
                  usual {r.mean.toFixed(k === 'sleep_h' || k === 'temp' ? 1 : 0)}
                  {r.z != null && Math.abs(r.z) >= 0.5 ? ` · ${r.z > 0 ? '+' : '−'}${Math.abs(r.z).toFixed(1)}σ` : ''}
                  {r.entered ? ' · entered today' : ''}
                </em>
              ) : (
                <em>absolute limits</em>
              )}
            </button>
          );
        })}
      </div>
      <p className="st-muted st-small">Every reading is scored against this astronaut's own first 14 mission days: advisory at 1.5σ drift, caution at 2σ, warning at 3σ or past a hard limit.</p>
    </div>
  );
}

function SystemPanel({ v, sys, onSurgeon }: { v: CrewView; sys: SystemId; onSurgeon: () => void }) {
  const { data } = useStationData();
  const def = SYSTEM_BY_ID[sys];
  const c = v.sys[sys];
  const called = useStation((s) => s.surgeon[v.m.id]);
  const ex = useStation((s) => s.extras[v.m.id]);
  const habitat = useHabitatData().data;
  const nav = useNavigate();
  if (!data) return null;
  // the reading in trouble first; calm ones get a short chart
  const rows = def.metrics.map((k) => v.rows[k]).sort((a, b) => CW_RANK[b.cw] - CW_RANK[a.cw]);
  const lead = rows[0];
  const meta = data.crew.metrics[lead.k];
  return (
    <div className="st-panel">
      <div className="st-panel-h">
        <div>
          <p className="st-cap">{v.m.name}</p>
          <h3>{def.name}</h3>
        </div>
        <CWChip cw={c} />
      </div>
      <p className="st-why">{def.why}</p>
      <div className="st-hazards">
        {def.hazards.map((h) => (
          <span key={h}>{HAZARD_LABEL[h]}</span>
        ))}
        <em>NASA HRP hazards</em>
      </div>

      {(lead.cw === 'caution' || lead.cw === 'warning') && lead.action && <Loop v={v} r={lead} />}
      {lead.cw === 'warning' && (
        <button className={`st-btn ${called ? 'is-ghost' : 'is-red'}`} onClick={onSurgeon}>
          <Icon.phone /> {called ? 'Flight surgeon notified · open message' : 'Contact flight surgeon'}
        </button>
      )}

      {rows
        .filter((r) => r.value != null || r.history.some((h) => h.v != null))
        .map((r) => (
          <div key={r.k} className={`st-metric is-${r.cw}`}>
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
                  Usual {r.lo!.toFixed(r.k === 'sleep_h' || r.k === 'temp' ? 1 : 0)}–{r.hi!.toFixed(r.k === 'sleep_h' || r.k === 'temp' ? 1 : 0)}
                  {r.z != null && ` · ${r.z >= 0 ? '+' : '−'}${Math.abs(r.z).toFixed(1)}σ (3-day avg)`}
                </span>
              ) : (
                <span>
                  Hard limit {data.crew.metrics[r.k].absolute_red.min}–{data.crew.metrics[r.k].absolute_red.max} {r.unit}
                </span>
              )}
              {r.cw !== 'nominal' && <em className={`is-${r.cw}`}>{CW_LABEL[r.cw]}</em>}
              {r.entered && <em>entered today</em>}
              {r.running > 1 && <em className={`is-${r.cw}`}>{r.running} days</em>}
            </div>
            {r.k !== 'dose_mSv_cum' && <TrendChart points={r.history} lo={r.lo} hi={r.hi} mean={r.mean} unit={r.unit} digits={r.k === 'temp' || r.k === 'sleep_h' ? 1 : r.k === 'dose_mSv_day' ? 2 : 0} height={r.cw === 'nominal' ? (c === 'nominal' ? 80 : 60) : 112} />}
            {habitat && <EnvironmentalCauseChip data={habitat} crewId={v.m.id} metric={r.k} onOpen={(id) => nav(`/habitat?focus=${encodeURIComponent(id)}`)} />}
          </div>
        ))}

      {sys === 'heart' && <WristTile v={v} />}
      {sys === 'brain' && ex?.pvtMs != null && (
        <div className="st-metric">
          <div className="st-metric-h">
            <span>Reaction time (PVT)</span>
            <b>
              {ex.pvtMs}
              <small>ms</small>
            </b>
          </div>
          <div className="st-metric-sub">
            <span>{ex.pvtUsual ? `Usual ${ex.pvtUsual} ms` : 'First result: becomes the baseline'} · {ex.pvtLapses ?? 0} lapses</span>
          </div>
        </div>
      )}
      <Causes v={v} sys={sys} />
      {sys === 'blood' && <LabEvidence real={data.real} />}
      <div className="st-explain">
        <p className="st-cap">About {meta.label.toLowerCase()}</p>
        <p>{meta.explain}</p>
        <p className="st-cap">How to measure on board</p>
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
