// Crew: the medic's view (health data is private by NASA standard; each astronaut sees their own
// status on Body). For tonight it shows every member; after submission: only what each person shares.
// Left: one check per crew member and per hazard. Centre: the Earth seen from the base.
// Right: crew readiness and each person's sleep over 28 days. Cabin air is off the main screen
// (Emile, 15 Nov: health metrics only).
import { lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { alarmActive, alarmClass } from '../../core/alarm';
import type { Status } from '../../data/types';
import { CW_LABEL, LEVEL_STATUS, LEVEL_WORD, RANK, dutyOf, useStationData } from '../model';
import { Btn, CW_STATUS, lc, plainLine, roleOf } from '../ds';
import { Bar, Check, Page, SideCap } from '../frame';
import { RowVital } from '../vitals';
import { useStation } from '../state';

const Backdrop = lazy(() => import('../Backdrop'));


export default function Overview() {
  const { data, views, sw, queue } = useStationData();
  const alarm = useStation((s) => s.alarm);
  const alarmOn = alarmActive(alarm.phase);
  const nav = useNavigate();
  if (!data) return null;

  const swS: Status = alarmOn ? 'red' : sw ? LEVEL_STATUS[sw.level] : 'green';
  const shared = useStation((s) => s.shared);
  const open = (id: string) => shared[id] !== false;
  const worst = [...views].filter((v) => open(v.m.id)).sort((a, b) => RANK[b.overall] - RANK[a.overall])[0];
  const cleared = views.filter((v) => dutyOf(v.cw, alarmOn) === 'cleared').length;
  const done = views.filter((v) => v.checkedIn).length;
  const top = queue[0];

  const sub = alarmOn
    ? alarmClass(alarm.phase) === 'emergency'
      ? 'Storm in progress. All crew stay in the shelter.'
      : 'Storm forecast. All crew to the shelter as a precaution.'
    : worst?.issue && worst.overall !== 'green'
      ? `${roleOf(worst.m)}: ${lc(plainLine(worst.issue))}`
      : 'All crew inside their own usual range';

  return (
    <Page
      title="Crew · medic's view"
      sub={sub}
      left={
        <>
          {views.map((v) => (
            open(v.m.id) ? (
              <Check key={v.m.id} s={CW_STATUS[v.cw]} title={roleOf(v.m)} word={alarmOn ? CW_LABEL[alarmClass(alarm.phase) ?? v.cw] : v.issue ? `${CW_LABEL[v.cw]} · ${lc(plainLine(v.issue))}` : CW_LABEL[v.cw]} onClick={() => nav(`/body/${v.m.id}`)} />
            ) : (
              <Check key={v.m.id} s="green" mark="–" title={roleOf(v.m)} word={`Private · check-in ${v.checkedIn ? 'done' : 'due'}`} />
            )
          ))}
          <Check s={swS} title="Radiation storm" word={alarmOn ? 'Alarm' : sw ? `${LEVEL_WORD[sw.level]} · ${Math.round(sw.p * 100)}% in 72 h` : '—'} onClick={() => nav('/radiation')} />
          <Check s={done === views.length ? 'green' : 'amber'} title="Daily checks" word={`${done} of ${views.length} done`} onClick={() => nav('/check')} />
        </>
      }
      object={
        <Suspense fallback={null}>
          <Backdrop side="center" />
        </Suspense>
      }
      right={
        <>
          <SideCap>Readiness</SideCap>
          <Bar label="Cleared for EVA" value={`${cleared} / ${views.length}`} frac={cleared / views.length} s={cleared === views.length ? 'green' : cleared === 0 ? 'red' : 'amber'} />
          <Bar label="Checked in today" value={`${done} / ${views.length}`} frac={done / views.length} s={done === views.length ? 'green' : 'amber'} />
          <SideCap>Sleep, last 28 days · shared</SideCap>
          {views.filter((v) => open(v.m.id)).map((v) => (
            <RowVital key={v.m.id} v={v} r={v.rows.sleep_h} label={`${roleOf(v.m)} · sleep`} onClick={() => nav(`/body/${v.m.id}`)} />
          ))}
        </>
      }
      footRight={top && (top.id === 'alarm' || open(top.id.split('-')[0])) ? <Btn onClick={() => nav(top.to)}>{top.tone === 'red' && top.id !== 'alarm' ? 'Open and contact surgeon' : top.id.endsWith('-checkin') ? 'Start daily check' : 'Open'}</Btn> : <Btn onClick={() => nav('/check')}>Start daily check</Btn>}
    />
  );
}
