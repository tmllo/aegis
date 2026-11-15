// Surgeon: when a result goes to the crew and when to the flight surgeon (a challenge question).
// Left: the NASA-STD-3001 caution & warning ladder: who acts at each class, with today's count.
// Centre: the note to the flight surgeon in SOAP form (subjective, objective, assessment, plan),
// filled from the readings, editable, sent with the data package. Right: each crew member's class.
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CW_LABEL, CW_RANK, LINK_DELAY, MOOD_WORD, RANK, dutyOf, issueLine, useStationData, type CW, type CrewView } from '../model';
import { Btn, CW_STATUS, roleOf } from '../ds';
import { Bar, Check, Page, SideCap } from '../frame';
import { useStation } from '../state';
import { cue } from '../ui';

/** Who acts at each class (docs/ARCHITECTURE.md section 3), highest first. A label only: no alarm is raised here. */
const WHO: Record<CW, string> = {
  emergency: 'All crew, now. Measured event only',
  warning: 'Flight surgeon now',
  caution: 'Crew re-checks; daily surgeon report',
  advisory: 'Crew self-care, keep logging',
  nominal: 'Nobody',
};
const LADDER = (Object.keys(CW_RANK) as CW[]).sort((a, b) => CW_RANK[b] - CW_RANK[a]).map((cw) => ({ cw, who: WHO[cw] }));
const DUTY = { cleared: 'cleared for EVA', restricted: 're-check before EVA', hold: 'hold: no EVA or safety-critical tasks', shelter: 'in the storm shelter' } as const;

function soap(v: CrewView) {
  const today = v.m.series[v.m.series.length - 1];
  return {
    s: `Mood ${today?.mood ?? '—'}/5 (${MOOD_WORD[today?.mood ?? 0] || '—'}). Sleep ${today?.sleep_h ?? '—'} h last night.`,
    o: v.issues.length ? v.issues.map((r) => issueLine(r)).join('\n') : 'All readings inside the personal baseline.',
    a: `${CW_LABEL[v.cw]}. Duty: ${DUTY[dutyOf(v.cw, false)]}.`,
    p: v.issue?.action ? `${v.issue.action} Requesting review and advice.` : 'No action needed. For the record.',
  };
}

export default function Surgeon() {
  const { data, views, env } = useStationData();
  const [qs, setQs] = useSearchParams();
  const nav = useNavigate();
  const call = useStation((s) => s.callSurgeon);
  const sent = useStation((s) => s.surgeon);
  const toast = useStation((s) => s.toast);
  const sound = useStation((s) => s.sound);
  const me = useStation((s) => s.me);
  const shared = useStation((s) => s.shared);
  const medic = me === 'medic';
  const visible = medic ? views.filter((x) => shared[x.m.id] !== false) : views.filter((x) => x.m.id === me);
  const v = visible.find((x) => x.m.id === qs.get('c')) ?? [...visible].sort((a, b) => RANK[b.overall] - RANK[a.overall])[0];
  const [note, setNote] = useState(() => (v ? soap(v) : { s: '', o: '', a: '', p: '' }));
  useEffect(() => {
    if (v) setNote(soap(v));
  }, [v?.m.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data) return null;
  if (!v) return <Page title="Flight surgeon" sub="Nobody has shared with the medic." />;

  const send = () => {
    call(v.m.id);
    cue('chime', sound);
    toast({ tone: 'info', title: 'Queued for the flight surgeon', body: `${roleOf(v.m)}: note and 28-day trends. Sends when the link is up (delay ${LINK_DELAY[env]}).` });
  };

  return (
    <Page
      title="Flight surgeon"
      sub={`Signal delay to Earth ~ ${LINK_DELAY[env]} · ${Object.keys(sent).length} queued this session`}
      left={
        <>
          <p className="fr-cap">Who acts, by class</p>
          {LADDER.map((l) => (
            <Check key={l.cw} s={CW_STATUS[l.cw]} title={CW_LABEL[l.cw]} word={l.who} on={l.cw === v.cw} />
          ))}
        </>
      }
      object={
        <div className="fr-panel">
          <p className="fr-cap">
            Note for {roleOf(v.m)} · {CW_LABEL[v.cw]}
            {sent[v.m.id] ? ' · queued' : ''}
          </p>
          <div className="fr-soap">
            {(
              [
                ['s', 'Subjective'],
                ['o', 'Objective'],
                ['a', 'Assessment'],
                ['p', 'Plan'],
              ] as const
            ).map(([k, label]) => (
              <label key={k}>
                <span>{label}</span>
                <textarea value={note[k]} rows={k === 'o' ? 3 : 2} onChange={(e) => setNote({ ...note, [k]: e.target.value })} />
              </label>
            ))}
          </div>
          <p className="ds-note">Attached: 28-day trends, personal baselines, today's check.</p>
        </div>
      }
      right={
        <>
          <SideCap>{medic ? 'Shared with the medic' : 'Private: only you and the flight surgeon see this'}</SideCap>
          {visible.map((x) => (
            <Bar key={x.m.id} label={roleOf(x.m)} value={CW_LABEL[x.cw]} frac={(CW_RANK[x.cw] + 1) / 5} s={CW_STATUS[x.cw]} note={sent[x.m.id] ? 'Queued for the surgeon' : x.issue ? issueLine(x.issue) : 'Nothing to report'} />
          ))}
        </>
      }
      footLeft={
        medic && visible.length > 1 ? (
          <div className="fr-seg" role="tablist" aria-label="Crew member">
            {visible.map((x) => (
              <button key={x.m.id} type="button" role="tab" aria-selected={x.m.id === v.m.id} className={x.m.id === v.m.id ? 'is-on' : ''} onClick={() => (cue('tick', sound), setQs({ c: x.m.id }, { replace: true }))}>
                {roleOf(x.m)}
              </button>
            ))}
          </div>
        ) : undefined
      }
      footRight={
        <>
          <Btn kind="secondary" onClick={() => nav(medic ? `/body/${v.m.id}` : '/')}>
            {medic ? 'Open' : 'My health'}
          </Btn>
          <Btn kind={v.cw === 'warning' ? 'danger' : 'primary'} onClick={send}>
            {sent[v.m.id] ? 'Queue again' : 'Queue for surgeon'}
          </Btn>
        </>
      }
    />
  );
}
