// Body: one astronaut. Left: the five body systems (tap to open). Centre: the 3D body.
// Right: vital cards (value, 28 days of bars, flagged days in colour, usual range as a band);
// with a system open, its readings plus why it matters, what to do and how to measure.
import { lazy, Suspense, useEffect, useState } from 'react';
import type { BodyView } from '../BodyCanvas';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { alarmActive } from '../../core/alarm';
import type { MetricKey } from '../../data/types';
import { CW_LABEL, CW_RANK, RANK, SYSTEMS, SYSTEM_BY_ID, dutyOf, fmtV, metricSystem, useStationData, type CrewView } from '../model';
import { Btn, CW_STATUS, lc, plainLine, roleOf, unitOf, valOf } from '../ds';
import { Check, Page, SideCap } from '../frame';
import { RowVital } from '../vitals';
import { Devices } from '../devices';
import { useStation, type SystemId } from '../state';
import { SYSTEM_VIEWS } from '../bodyViews';
import { cue } from '../ui';
import '../suit.css';

const BodyCanvas = lazy(() => import('../BodyCanvas'));
// kept here (not imported from BodyCanvas) so the 3D code stays in its own lazy chunk
const VIEWS: [BodyView, string][] = [
  ['suit', 'Suit'],
  ['skeleton', 'Skeleton'],
  ['vessels', 'Vessels'],
  ['organs', 'Organs'],
];

const DUTY = { cleared: 'Cleared for EVA', restricted: 'Re-check before EVA', hold: 'Hold: no EVA', shelter: 'In the storm shelter' } as const;
/** Main vitals in priority order (sleep, mood, heart rate, exercise, blood pressure); temperature and blood sugar only when flagged. */
const MAIN: MetricKey[] = ['sleep_h', 'mood', 'hr', 'exercise_min', 'bp_sys'];
const ON_FLAG: MetricKey[] = ['temp', 'glucose'];

export default function Body() {
  const { data, views } = useStationData();
  const { id } = useParams();
  const [qs, setQs] = useSearchParams();
  const nav = useNavigate();
  const alarm = useStation((s) => s.alarm);
  const sound = useStation((s) => s.sound);
  const me = useStation((s) => s.me);
  const shared = useStation((s) => s.shared);
  const setShared = useStation((s) => s.setShared);
  const medic = me === 'medic';
  // privacy: an astronaut only ever sees their own data; the medic sees a person only if they share
  const wanted = medic ? id : (me ?? id);
  const v = views.find((x) => x.m.id === wanted) ?? [...views].sort((a, b) => RANK[b.overall] - RANK[a.overall])[0];
  const isShared = shared[v?.m.id ?? ''] !== false;
  const sel = qs.get('s') as SystemId | null;
  const [view, setView] = useState<BodyView>('suit'); // Emile: the page opens on the suit
  // with a system open the switch offers that system's own views (bodyViews.ts); the first one opens by default
  const [sub, setSub] = useState<{ s: SystemId; id: string } | null>(null);
  const subViews = sel ? SYSTEM_VIEWS[sel] : null;
  const current = subViews ? (subViews.find((x) => sub?.s === sel && x.id === sub.id) ?? subViews[0]) : null;
  const shown: BodyView = current ? current.layer : view;
  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const n = new URLSearchParams(window.location.search);
      n.delete('s');
      setQs(n, { replace: true });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel, setQs]);
  if (!data || !v) return null;
  if (medic && !isShared)
    return <Page title={roleOf(v.m)} sub="Not shared with the medic. Only check-in done or not is visible." footRight={<Btn onClick={() => nav('/')}>Back to crew</Btn>} />;

  const alarmOn = alarmActive(alarm.phase);
  const pick = (s: SystemId | null) => {
    cue('tick', sound);
    const n = new URLSearchParams(qs);
    if (s && s !== sel) n.set('s', s);
    else n.delete('s');
    setQs(n, { replace: true });
  };
  const values = Object.fromEntries(
    SYSTEMS.map((s) => {
      const r = v.rows[s.metrics[0]];
      return [s.id, { name: s.name, line: s.id === 'heart' ? `${fmtV('bp_sys', v.rows.bp_sys.value)}/${fmtV('bp_dia', v.rows.bp_dia.value)}` : `${valOf(r)} ${unitOf(r)}` }];
    }),
  ) as Record<SystemId, { name: string; line: string }>;

  return (
    <Page
      title={medic ? roleOf(v.m) : `My health · ${roleOf(v.m)}`}
      sub={`${DUTY[dutyOf(v.cw, alarmOn)]} · ${v.issue ? lc(plainLine(v.issue)) : 'every reading in the usual range'}`}
      left={
        <>
          {SYSTEMS.filter((s) => s.id !== 'blood' || v.sys.blood !== 'nominal').map((s) => (
            <Check key={s.id} s={CW_STATUS[v.sys[s.id]]} title={s.name} word={`${CW_LABEL[v.sys[s.id]]} · ${values[s.id].line}`} on={sel === s.id} onClick={() => pick(s.id)} />
          ))}
          {!medic && <Devices />}
        </>
      }
      object={
        <div className="ds-body">
          {/* the suit is a live 3D EMU in the same scene, camera and spin as the skeleton, so size and turn always match */}
          <div className="ds-3d">
            <Suspense fallback={null}>
              <BodyCanvas tint={v.status} focus={sel} values={Object.fromEntries(Object.entries(values).filter(([k]) => k !== 'blood' || v.sys.blood !== 'nominal')) as typeof values} onPick={(s) => pick(s)} storm={alarmOn} view={shown} cam={current?.cam ?? null} />
            </Suspense>
          </div>
          <div className={`fr-seg is-sm ds-views${subViews ? ' is-deep' : ''}`} role="tablist" aria-label="Body view">
            {subViews && current ? (
              <>
                <button type="button" className="ds-views-back" onClick={() => pick(null)} aria-label="Back to the whole body (Esc)">
                  <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden>
                    <path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Body
                </button>
                {subViews.map((x) => (
                  <button key={x.id} type="button" role="tab" className={current.id === x.id ? 'is-on' : ''} aria-selected={current.id === x.id} onClick={() => (cue('tick', sound), setSub({ s: sel!, id: x.id }))}>
                    {x.name}
                  </button>
                ))}
              </>
            ) : (
              VIEWS.map(([k, name]) => (
                <button key={k} type="button" role="tab" className={view === k ? 'is-on' : ''} aria-selected={view === k} onClick={() => (cue('tick', sound), setView(k))}>
                  {name}
                </button>
              ))
            )}
          </div>
        </div>
      }
      right={
        <>
          {sel ? (
            <div className="ds-deep-head">
              <h2>{SYSTEM_BY_ID[sel].name}</h2>
            </div>
          ) : (
            <SideCap>Last 28 days</SideCap>
          )}
          {(sel ? SYSTEM_BY_ID[sel].metrics.filter((k) => k !== 'bp_dia' && k !== 'dose_mSv_cum' && k !== 'bone_loss_pct' && v.rows[k].value != null) : [...MAIN, ...ON_FLAG.filter((k) => v.rows[k].cw !== 'nominal')]).map((k) => (
            <RowVital key={k} v={v} r={v.rows[k]} on={!!sel} onClick={() => pick(metricSystem(k))} />
          ))}
          {sel && <SystemDetail v={v} sys={sel} />}
        </>
      }
      footLeft={
        medic ? (
          <Btn kind="secondary" onClick={() => nav('/')}>
            Back to crew
          </Btn>
        ) : (
          <Btn kind="secondary" onClick={() => (cue('tick', sound), setShared(v.m.id, !isShared))} label={isShared ? 'Stop sharing with the medic' : 'Share with the medic'}>
            {isShared ? 'Shared with medic' : 'Private'}
          </Btn>
        )
      }
      footRight={
        v.overall === 'red' ? (
          <Btn kind="danger" onClick={() => nav(`/surgeon?c=${v.m.id}`)}>
            Contact Earth support
          </Btn>
        ) : v.issues.length ? (
          <Btn onClick={() => nav(`/care?c=${v.m.id}`)}>Open care plan</Btn>
        ) : (
          <Btn onClick={() => nav('/check')}>Daily check</Btn>
        )
      }
    />
  );
}

function SystemDetail({ v, sys }: { v: CrewView; sys: SystemId }) {
  const { data } = useStationData();
  if (!data) return null;
  const def = SYSTEM_BY_ID[sys];
  const rows = def.metrics
    .map((k) => v.rows[k])
    .filter((r) => r.value != null)
    .sort((a, b) => CW_RANK[b.cw] - CW_RANK[a.cw]);
  const lead = rows[0];
  if (!lead) return null;
  return (
    <div className="fr-detail">
      <p>{def.why}</p>
      {lead.action && lead.cw !== 'nominal' && (
        <p>
          <b>What to do.</b> {lead.action}
        </p>
      )}
      <p>
        <b>How to measure.</b> {data.crew.metrics[lead.k].how_to_measure}
      </p>
    </div>
  );
}
