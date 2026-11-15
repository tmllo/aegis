// CREW: the body is the hero; text sits on the image (no filled cards) with 1 px corner brackets.
// One very large light status word, small mono captions, one solid white action (amber case:
// Re-measure; red: Call surgeon, which then sends the handoff report) and a secondary Scan.
// Idle after 20 s: a slow orbit with gentle breathing, only the key readout stays.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TARGETS, type TargetId } from '../components/body3d/targets';
import { postMeasure } from '../data/live';
import type { MetricKey, Status } from '../data/types';
import { useWristband } from '../wearable';
import { AlarmStrip, type Alarm } from './Monitor';
import { fmt, METRIC_TARGET, RANK, rowOf, SHORT, STATUS_WORD, TARGET_METRICS, toSteps } from './model';
import { VITAL } from './entries';
import { VitalsPanel } from './vitals';
import { Confirm } from './ui';
import { CheckinPanel } from './CheckinPanel';
import { HandoffPanel } from './HandoffPanel';
import { useConsole } from './useConsole';
import { useHud } from './hud';
import { InfoSheet } from './InfoSheet';
import { LINK_DELAY } from './model';

const ALL: MetricKey[] = ['hr', 'bp_sys', 'bp_dia', 'glucose', 'temp', 'sleep_h', 'mood', 'exercise_min', 'bone_loss_pct', 'dose_mSv_day'];
const IDLE_MS = 20000;

/** Idle after 20 s without input; any input ends it. Drives a slow orbit through the shared yaw. */
function useIdle() {
  const { setIdle, setYaw } = useHud();
  const idle = useHud((s) => s.idle);
  useEffect(() => {
    let timer = window.setTimeout(() => setIdle(true), IDLE_MS);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), IDLE_MS);
    };
    const evs = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'];
    evs.forEach((e) => addEventListener(e, wake, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      evs.forEach((e) => removeEventListener(e, wake));
      setIdle(false);
    };
  }, [setIdle]);
  useEffect(() => {
    if (!idle || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    let raf = 0;
    let last = performance.now();
    const step = (t: number) => {
      const h = useHud.getState();
      h.setYaw(h.yaw + ((t - last) / 1000) * 0.12);
      last = t;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [idle, setYaw]);
  return idle;
}

export default function CrewPage() {
  const { cd, cv, seat } = useConsole();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { setFocus, setTint, heartBpm } = useHud();
  const [acked, setAcked] = useState<Record<string, boolean>>({});
  // the simulated wrist band streams HR, SpO2 and skin temperature at 1 Hz (demo: connects on load)
  const band = useWristband({ subject: cv?.m.id, hrMean: cv?.m.baseline.hr?.mean, hrSd: cv?.m.baseline.hr?.sd, day: cd?.mission.today });
  const bandOff = band.status === 'off';
  useEffect(() => {
    if (bandOff && cv?.m.id) band.connect('sim');
  }, [bandOff, cv?.m.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const idle = useIdle();
  const [ask, setAsk] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [handoff, setHandoff] = useState(false);
  const [how, setHow] = useState(false);
  const setBodyTips = useHud((s) => s.setBodyTips);
  const panel = params.get('p');
  const rawT = params.get('t');
  const target = rawT && rawT in TARGETS ? (rawT as TargetId) : null;

  const all = useMemo(() => (cd && cv ? ALL.map((k) => rowOf(cd, cv.m, cv.scores, k)) : []), [cd, cv]);
  useEffect(() => setFocus(target), [target, setFocus]);
  useEffect(() => () => setFocus(null), [setFocus]);
  useEffect(() => {
    const tint: Partial<Record<TargetId, Status>> = {};
    for (const [t, ks] of Object.entries(TARGET_METRICS) as [TargetId, MetricKey[]][]) {
      const s = ks.map((k) => all.find((r) => r.k === k)?.status ?? 'green').reduce<Status>((w, x) => (RANK[x] > RANK[w] ? x : w), 'green');
      if (s !== 'green') tint[t] = s;
    }
    setTint(tint);
  }, [all, setTint]);
  // callouts: each flagged organ gets a leader line to a small label on the body
  useEffect(() => {
    if (target) return setBodyTips([]);
    const byT = new Map<TargetId, (typeof all)[number]>();
    for (const r of all) {
      const tg = METRIC_TARGET[r.k];
      if (!tg || r.status === 'green') continue;
      const cur = byT.get(tg);
      if (!cur || RANK[r.status] > RANK[cur.status]) byT.set(tg, r);
    }
    setBodyTips(
      [...byT].map(([tg, r]) => ({
        id: tg,
        pos: TARGETS[tg].spot as [number, number, number],
        title: `${tg === 'dna' ? 'Whole body' : TARGETS[tg].label} · ${SHORT[r.k].toLowerCase()} ${fmt(r.value, r.digits)}\u00a0${r.unit}`,
        line: '',
        status: r.status,
      })),
    );
  }, [all, target, setBodyTips]);
  useEffect(() => () => setBodyTips([]), [setBodyTips]);
  useEffect(() => {
    setResult(null);
    setHandoff(false);
    setHow(false);
  }, [cv?.m.id]);

  if (!cd || !cv) return <p className="cx-error cx-wait">Loading</p>;

  const flagged = all.filter((r) => r.status !== 'green').sort((a, b) => RANK[b.status] - RANK[a.status] || Math.abs(b.z ?? 0) - Math.abs(a.z ?? 0));
  const organRow = target ? all.find((r) => r.k === TARGET_METRICS[target][0]) : null;
  const one = flagged[0] ?? organRow ?? null;
  const red = one?.status === 'red';
  const top = flagged[0] ?? null;

  const live = band.status === 'connected' && band.reading;
  const iToday = cv.m.series.findIndex((x) => x.date === cd.mission.today);
  let streak = 0;
  for (let j = iToday; j >= 0 && cv.m.series[j].hr != null; j--) streak++;
  const measuredToday = iToday >= 0 && cv.m.series[iToday].hr != null;
  const delay = LINK_DELAY[cd.mission.environment] ?? 'unknown';
  const escalation = cv.overall === 'red' ? `Report goes to the flight surgeon · arrives in about ${delay}` : cv.overall === 'amber' ? 'Report goes to the crew medical officer' : 'Self-care · nothing to report';
  const sheetK = (params.get('k') as MetricKey | null) ?? (target ? TARGET_METRICS[target][0] : null);
  const sheetRow = sheetK ? all.find((r) => r.k === sheetK) : undefined;
  const alarms: Alarm[] = flagged.map((r) => ({ id: `${cv.m.id}-${r.k}`, status: r.status, text: `${SHORT[r.k]} ${fmt(r.value, r.digits)} ${r.unit}${r.mean != null ? ` · your usual ${fmt(r.mean, r.digits)}` : ''} · ${r.value != null && r.mean != null && r.value < r.mean ? 'low' : 'high'} for ${Math.max(1, r.running)} day${Math.max(1, r.running) === 1 ? '' : 's'}`, since: '' }));

  const act = async () => {
    setAsk(false);
    if (!one) return;
    if (red) return setHandoff(true);
    const metric = VITAL[one.k];
    if (!metric || one.value == null) return setResult('Logged');
    const reply = await postMeasure(cv.m.id, metric, `${cd.mission.today}T${new Date().toISOString().slice(11, 19)}Z`, one.value);
    setResult(reply == null ? 'Logged on this device' : reply.closed_tasks.length ? 'Measured · task closed' : reply.assessment ? `Measured · ${STATUS_WORD[reply.assessment.severity]}` : 'Measured · in range');
  };

  const details = panel === 'details';
  const facts = (flagged.length ? flagged : all.filter((r) => r.k === 'hr' || r.k === 'bp_sys' || r.k === 'sleep_h')).slice(0, 3);
  const days = top ? Math.max(1, top.running) : 0;
  const sentence = top ? `${SHORT[top.k]} is ${top.value != null && top.mean != null && top.value < top.mean ? 'low' : 'high'} for ${days} day${days === 1 ? '' : 's'}` : 'All readings are in your usual range';
  const close = () => setParams({}, { replace: true });

  return (
    <div className="crew" data-idle={idle || undefined} data-status={cv.overall}>
      <i className="safe safe-left" aria-hidden />
      {/* one look: status word, one sentence, at most three numbers, one white button, Details */}
      <section className="one" aria-live="polite">
        <span className="cap">
          {seat[cv.m.id]} · {cv.m.role}
        </span>
        <b className="one-word">{STATUS_WORD[cv.overall]}</b>
        <span className="one-do">{sentence}</span>
        <dl className="one-facts">
          {facts.map((r) => (
            <div key={r.k} data-status={r.status !== 'green' ? r.status : undefined}>
              <dd>
                {fmt(r.value, r.digits)}
                <small>{r.unit}</small>
              </dd>
              <dt>
                {SHORT[r.k]}
                {r.mean != null ? ` · your usual ${fmt(r.mean, r.digits)}` : ''}
              </dt>
            </div>
          ))}
        </dl>
        {red ? (
          <button type="button" className="solid one-btn" onClick={() => setAsk(true)}>
            {result ?? 'Call surgeon'}
          </button>
        ) : (
          /* the full check (feelings, camera, wrist band, reaction test) runs at /checkup; saved values return through the entries store */
          <button type="button" className="solid one-btn" onClick={() => navigate('/checkup')}>
            Start daily check
          </button>
        )}
        <button type="button" className="one-more" aria-expanded={details} onClick={() => setParams(details ? {} : { p: 'details' }, { replace: true })}>
          {details ? 'Hide details' : 'Details'}
        </button>
      </section>

      {panel === 'checkin' ? (
        <CheckinPanel className="crew-right" />
      ) : panel === 'handoff' || handoff ? (
        <HandoffPanel className="crew-right" />
      ) : sheetRow ? (
        <InfoSheet r={sheetRow} target={target} cd={cd} m={cv.m} onClose={close} />
      ) : details ? (
        <aside className="crew-details" aria-label="Details">
          <button type="button" className="one-more crew-details-close" onClick={close}>
            Close
          </button>
          <p className="crew-esc">{escalation}</p>
          <p className="cap">
            {measuredToday ? 'Next check tomorrow morning' : 'Check due now'} · {streak} days in a row
          </p>
          {live && (
            <p className="cap">
              {`Live now · heart ${Math.round(band.reading!.hr)} bpm · blood oxygen ${Math.round(band.reading!.spo2)} % (demo)`}
              {heartBpm != null ? ` · camera ${Math.round(heartBpm)} bpm` : ''}
            </p>
          )}
          <p className="cap crew-band">
            {band.deviceName ?? 'Wrist band (simulated)'} · {band.status === 'connected' ? `connected${band.reading ? ` · battery ${Math.round(band.reading.battery)} %` : ''}` : band.status}
            {band.status !== 'connected' && band.status !== 'pairing' && (
              <button type="button" className="ghost crew-connect" onClick={() => band.connect('sim')}>
                Connect
              </button>
            )}
          </p>
          <AlarmStrip alarms={alarms} acked={acked} onAck={(id) => setAcked((a) => ({ ...a, [id]: true }))} />
          {top && (
            <div className="crew-do">
              <h3 className="cap">What to do now</h3>
              <ol className="crew-steps">
                {toSteps(top.action).map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              <button type="button" className="one-more" aria-expanded={how} onClick={() => setHow((h) => !h)}>
                How to measure
              </button>
              {how && (
                <ol className="crew-steps">
                  {toSteps(cd.metrics[top.k].how_to_measure).map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              )}
            </div>
          )}
          <VitalsPanel memberId={cv.m.id} />
          {red && (
            <button type="button" className="ghost" onClick={() => navigate('/checkup')}>
              Start daily check
            </button>
          )}
        </aside>
      ) : null}

      {/* keyboard: Tab reaches each body region, Enter focuses it, Esc returns */}
      <nav className="hot-keys" aria-label="Body regions">
        {(Object.keys(TARGETS) as TargetId[]).map((id) => (
          <button key={id} type="button" onClick={() => setParams({ t: id }, { replace: true })}>
            {TARGETS[id].label}
          </button>
        ))}
      </nav>

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
    </div>
  );
}
