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
import { fmt, METRIC_TARGET, RANK, rowOf, SHORT, STATUS_WORD, TARGET_METRICS, toSteps, type Row } from './model';
import { useEntries } from './entries';
import { Confirm } from './ui';
import { CheckinPanel } from './CheckinPanel';
import { HandoffPanel } from './HandoffPanel';
import { useConsole } from './useConsole';
import { useHud } from './hud';
import { InfoSheet } from './InfoSheet';
import { Mark } from './ui';
import { fmtDate, LINK_DELAY } from './model';

const ALL: MetricKey[] = ['hr', 'bp_sys', 'bp_dia', 'glucose', 'temp', 'sleep_h', 'mood', 'exercise_min', 'bone_loss_pct', 'dose_mSv_day'];
const VITAL: Partial<Record<MetricKey, string>> = { bp_sys: 'vital.bp_sys', bp_dia: 'vital.bp_dia', hr: 'vital.hr', temp: 'vital.temp', glucose: 'vital.glucose' };
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

/** 14 days of one reading, the person's usual band shaded, today as a dot. */
function Spark({ r }: { r: Row }) {
  const v = r.history.slice(-14);
  const nums = v.filter((x): x is number => x != null);
  if (nums.length < 2) return <i className="vspark" aria-hidden />;
  const lo0 = Math.min(...nums, r.lo ?? Infinity);
  const hi0 = Math.max(...nums, r.hi ?? -Infinity);
  const pad = (hi0 - lo0 || 1) * 0.08;
  const lo = lo0 - pad;
  const hi = hi0 + pad;
  const W = 72;
  const H = 24;
  const y = (x: number) => H - ((x - lo) / (hi - lo)) * H;
  const x = (i: number) => (i / (v.length - 1)) * W;
  const pts = v.map((val, i) => (val == null ? null : `${x(i).toFixed(1)},${y(val).toFixed(1)}`)).filter(Boolean).join(' ');
  const last = v.length - 1;
  return (
    <svg className="vspark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      {r.lo != null && r.hi != null && <rect x="0" width={W} y={y(r.hi)} height={Math.max(1, y(r.lo) - y(r.hi))} fill="rgb(255 255 255 / 0.1)" />}
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      {v[last] != null && <circle cx={x(last)} cy={y(v[last]!)} r="2" fill="currentColor" />}
    </svg>
  );
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
  const [edit, setEdit] = useState<MetricKey | null>(null);
  const [draft, setDraft] = useState('');
  const entries = useEntries((s) => s.byMember);
  const put = useEntries((s) => s.put);
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
    setEdit(null);
    setHow(false);
  }, [cv?.m.id]);

  if (!cd || !cv) return <p className="cx-error cx-wait">Loading</p>;

  const flagged = all.filter((r) => r.status !== 'green').sort((a, b) => RANK[b.status] - RANK[a.status] || Math.abs(b.z ?? 0) - Math.abs(a.z ?? 0));
  const organRow = target ? all.find((r) => r.k === TARGET_METRICS[target][0]) : null;
  const one = organRow ?? flagged[0] ?? null;
  const red = one?.status === 'red';
  const caption = one ? `${SHORT[one.k]} ${fmt(one.value, one.digits)} ${one.unit}${one.mean != null ? ` · your usual ${fmt(one.mean, one.digits)}` : ''}` : 'All readings in range';
  const top = flagged[0] ?? null;
  const typed = entries[cv.m.id]?.[cd.mission.today] ?? {};
  const save = (k: MetricKey) => {
    const v = Number(draft.replace(',', '.'));
    if (!draft.trim() || !Number.isFinite(v)) return;
    put(cv.m.id, cd.mission.today, k, v);
    setEdit(null);
    const metric = VITAL[k];
    if (metric) void postMeasure(cv.m.id, metric, `${cd.mission.today}T${new Date().toISOString().slice(11, 19)}Z`, v);
  };

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

  return (
    <div className="crew" data-idle={idle || undefined} data-status={cv.overall}>
      {panel === 'checkin' ? (
        <CheckinPanel className="crew-right" />
      ) : panel === 'handoff' || handoff ? (
        <HandoffPanel className="crew-right" />
      ) : sheetRow ? (
        <InfoSheet r={sheetRow} target={target} cd={cd} m={cv.m} onClose={() => setParams({}, { replace: true })} />
      ) : (
        <div className="vlist" aria-label="Vitals">
          <span className="cap">
            Vitals · {seat[cv.m.id]} · {fmtDate(cd.mission.today)}
          </span>
          {live && (
            <span className="cap vlist-live">
              {`Live now · heart ${Math.round(band.reading!.hr)}\u00a0bpm · blood oxygen ${Math.round(band.reading!.spo2)}\u00a0% (demo)`}
              {heartBpm != null ? ` · camera ${Math.round(heartBpm)}\u00a0bpm` : ''}
            </span>
          )}
          {all.map((r) => (
            <div key={r.k} className="vrow" data-status={r.status !== 'green' ? r.status : undefined} data-editing={edit === r.k || undefined}>
              <button type="button" className="vrow-main" aria-pressed={sheetK === r.k} onClick={() => METRIC_TARGET[r.k] && setParams({ t: METRIC_TARGET[r.k]!, k: r.k }, { replace: true })}>
                <Mark s={r.status} size={9} />
                <span className="vrow-l">
                  {SHORT[r.k]}
                  <small>
                    {r.k in typed ? 'entered by crew · ' : ''}
                    {r.lo != null && r.hi != null ? `your usual ${fmt(r.lo, r.digits)}-${fmt(r.hi, r.digits)}` : r.status === 'green' ? 'in range' : STATUS_WORD[r.status]}
                  </small>
                </span>
                <Spark r={r} />
              </button>
              {edit === r.k ? (
                <form
                  className="vrow-edit"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save(r.k);
                  }}
                >
                  <input type="number" inputMode="decimal" step="any" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setEdit(null)} aria-label={`${SHORT[r.k]} in ${r.unit}`} />
                  <small>{r.unit}</small>
                  <button type="submit" className="solid">
                    Save
                  </button>
                  <button type="button" className="ghost" onClick={() => setEdit(null)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  className="vrow-v"
                  aria-label={`Enter a new ${SHORT[r.k].toLowerCase()} value`}
                  onClick={() => {
                    setEdit(r.k);
                    setDraft(r.value != null ? String(r.value) : '');
                  }}
                >
                  {fmt(r.value, r.digits)}
                  <small>{r.unit}</small>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <section className="crew-read brk" aria-live="polite">
        <span className="cap cap-u">
          {seat[cv.m.id]} · {cv.m.role}
        </span>
        <b className="crew-word">{STATUS_WORD[cv.overall]}</b>
        {!flagged.length && <span className="cap crew-line">{caption}</span>}
        {heartBpm != null && <span className="cap">Heart {Math.round(heartBpm)} bpm · camera estimate</span>}
        <span className="cap crew-esc">{escalation}</span>
        <span className="cap">
          {measuredToday ? 'Next check tomorrow morning' : 'Check due now'} · {streak} days in a row
        </span>
        {(band.status !== 'connected' || (band.reading && band.reading.battery < 20)) && (
          <span className="cap crew-band">
            {band.deviceName ?? 'Wrist band (simulated)'} · {band.status === 'connected' ? `battery low · ${Math.round(band.reading!.battery)}\u00a0%` : band.status}
            {band.status !== 'connected' && band.status !== 'pairing' && (
              <button type="button" className="ghost crew-connect" onClick={() => band.connect('sim')}>
                Connect
              </button>
            )}
          </span>
        )}
        <AlarmStrip alarms={alarms} acked={acked} onAck={(id) => setAcked((a) => ({ ...a, [id]: true }))} />
        {top && (
          <div className="crew-do">
            <span className="cap">What to do now</span>
            <ol className="crew-steps">
              {toSteps(top.action).map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <button type="button" className="ghost crew-how" aria-expanded={how} onClick={() => setHow((h) => !h)}>
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
      </section>

      <div className="crew-actions">
        {red && (
          <button type="button" className="solid" onClick={() => setAsk(true)}>
            {result ?? 'Call surgeon'}
          </button>
        )}
        {/* the full check (feelings, camera, wrist band, reaction test) runs at /checkup; saved values come back through the entries store */}
        <button type="button" className={red ? 'ghost' : 'solid'} onClick={() => navigate('/checkup')}>
          Start daily check
        </button>
        {target && (
          <button type="button" className="ghost" onClick={() => setParams({}, { replace: true })}>
            Whole body
          </button>
        )}
      </div>

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
