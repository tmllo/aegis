// CREW: the body is the hero. One card: seat and status, the one flagged thing in plain words,
// and one button (amber: Re-measure, red: Call surgeon, which then sends the handoff report).
// Top right: Check-in. Only the flagged region glows. Drag to rotate.
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TARGETS, type TargetId } from '../components/body3d/targets';
import { postMeasure } from '../data/live';
import type { MetricKey, Status } from '../data/types';
import { fmt, RANK, rowOf, SHORT, STATUS_WORD, TARGET_METRICS } from './model';
import { Confirm, Icon, Mark } from './ui';
import { CheckinPanel } from './CheckinPanel';
import { HandoffPanel } from './HandoffPanel';
import { useConsole } from './useConsole';
import { useHud } from './hud';

const ALL: MetricKey[] = ['hr', 'bp_sys', 'bp_dia', 'glucose', 'temp', 'sleep_h', 'mood', 'exercise_min', 'bone_loss_pct', 'dose_mSv_day'];
const VITAL: Partial<Record<MetricKey, string>> = { bp_sys: 'vital.bp_sys', bp_dia: 'vital.bp_dia', hr: 'vital.hr', temp: 'vital.temp', glucose: 'vital.glucose' };

export default function CrewPage() {
  const { cd, cv, seat } = useConsole();
  const [params, setParams] = useSearchParams();
  const { setFocus, setTint } = useHud();
  const [ask, setAsk] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [handoff, setHandoff] = useState(false);
  const panel = params.get('p');
  const rawT = params.get('t');
  const target = rawT && rawT in TARGETS ? (rawT as TargetId) : null;

  const all = useMemo(() => (cd && cv ? ALL.map((k) => rowOf(cd, cv.m, cv.scores, k)) : []), [cd, cv]);
  useEffect(() => setFocus(target), [target, setFocus]);
  useEffect(() => () => setFocus(null), [setFocus]);
  useEffect(() => {
    // only the flagged region glows
    const tint: Partial<Record<TargetId, Status>> = {};
    for (const [t, ks] of Object.entries(TARGET_METRICS) as [TargetId, MetricKey[]][]) {
      const s = ks.map((k) => all.find((r) => r.k === k)?.status ?? 'green').reduce<Status>((w, x) => (RANK[x] > RANK[w] ? x : w), 'green');
      if (s !== 'green') tint[t] = s;
    }
    setTint(tint);
  }, [all, setTint]);
  useEffect(() => {
    setResult(null);
    setHandoff(false);
  }, [cv?.m.id]);

  if (!cd || !cv) return <p className="cx-error cx-wait">Loading</p>;

  const flagged = all.filter((r) => r.status !== 'green').sort((a, b) => RANK[b.status] - RANK[a.status] || Math.abs(b.z ?? 0) - Math.abs(a.z ?? 0));
  const organRow = target ? all.find((r) => r.k === TARGET_METRICS[target][0]) : null;
  const one = organRow ?? flagged[0] ?? null;
  const red = one?.status === 'red';
  const plain = one ? `${SHORT[one.k]} ${fmt(one.value, one.digits)} ${one.unit}${one.mean != null ? `, usual ${fmt(one.mean, one.digits)}` : ''}` : 'All readings in range';

  const act = async () => {
    setAsk(false);
    if (!one) return;
    if (red) {
      setHandoff(true);
      return;
    }
    // Re-measure: a reading from the simulated Bio-Monitor, checked by the server when it runs
    const metric = VITAL[one.k];
    if (!metric || one.value == null) return setResult('Logged');
    const reply = await postMeasure(cv.m.id, metric, `${cd.mission.today}T${new Date().toISOString().slice(11, 19)}Z`, one.value);
    setResult(reply == null ? 'Logged on this device' : reply.closed_tasks.length ? 'Measured · task closed' : reply.assessment ? `Measured · ${STATUS_WORD[reply.assessment.severity]}` : 'Measured · in range');
  };

  return (
    <>
      <div className="one-card" data-status={cv.overall}>
        <span className="one-seat">
          {seat[cv.m.id]} · <b>{STATUS_WORD[cv.overall]}</b>
        </span>
        <span className="one-line">
          {one && one.status !== 'green' && <Mark s={one.status} size={11} />}
          {plain}
        </span>
        {target && (
          <button type="button" className="cx-back" onClick={() => setParams({}, { replace: true })}>
            <Icon name="back" size={16} />
            Whole body
          </button>
        )}
        {one && one.status !== 'green' && (
          <button type="button" className={`btn ${red ? 'btn-red' : 'btn-amber'}`} onClick={() => setAsk(true)}>
            {result ?? (red ? 'Call surgeon' : 'Re-measure')}
          </button>
        )}
      </div>

      <button type="button" className="sq one-checkin" aria-pressed={panel === 'checkin'} onClick={() => setParams(panel === 'checkin' ? {} : { p: 'checkin' }, { replace: true })}>
        <Icon name="mind" size={18} />
        <span>Check-in</span>
      </button>
      {panel === 'checkin' && <CheckinPanel className="crew-right" />}
      {handoff && <HandoffPanel className="crew-right" />}

      {one && (
        <Confirm
          open={ask}
          code={red ? '1.001' : `2.${String(ALL.indexOf(one.k) + 1).padStart(3, '0')}`}
          title={red ? 'Call surgeon' : `Re-measure ${SHORT[one.k].toLowerCase()}`}
          tag={red ? 'Handoff' : 'Crew'}
          status={`${seat[cv.m.id]} ${STATUS_WORD[one.status]}`}
          body={one.action}
          go={red ? 'Call' : 'Measure'}
          danger={red}
          onDone={() => void act()}
          onCancel={() => setAsk(false)}
        />
      )}
    </>
  );
}

