// CREW: the body is the hero; text sits on the image (no filled cards) with 1 px corner brackets.
// One very large light status word, small mono captions, one solid white action (amber case:
// Re-measure; red: Call surgeon, which then sends the handoff report) and a secondary Scan.
// Idle after 20 s: a slow orbit with gentle breathing, only the key readout stays.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TARGETS, type TargetId } from '../components/body3d/targets';
import { postMeasure } from '../data/live';
import type { MetricKey, Status } from '../data/types';
import { useCameraScan } from '../scan';
import { fmt, RANK, rowOf, SHORT, STATUS_WORD, TARGET_METRICS } from './model';
import { Confirm } from './ui';
import { CheckinPanel } from './CheckinPanel';
import { HandoffPanel } from './HandoffPanel';
import { useConsole } from './useConsole';
import { useHud } from './hud';

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

function ScanOverlay({ onClose }: { onClose: () => void }) {
  const scan = useCameraScan({ durationS: 25 });
  const setHeartBpm = useHud((s) => s.setHeartBpm);
  const started = useRef(false);
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      scan.start();
    }
  }, [scan]);
  useEffect(() => setHeartBpm(scan.bpm), [scan.bpm, setHeartBpm]);
  return (
    <div className="scan brk" role="dialog" aria-label="Scan">
      <div className="scan-frame">
        <video ref={scan.videoRef} className="scan-video" autoPlay muted playsInline />
        {scan.box && scan.videoRef.current?.videoWidth ? (
          <i
            className="scan-box"
            style={{
              // the video is mirrored, so is the box
              left: `${(1 - (scan.box.x + scan.box.w) / scan.videoRef.current.videoWidth) * 100}%`,
              top: `${(scan.box.y / scan.videoRef.current.videoHeight) * 100}%`,
              width: `${(scan.box.w / scan.videoRef.current.videoWidth) * 100}%`,
              height: `${(scan.box.h / scan.videoRef.current.videoHeight) * 100}%`,
            }}
          />
        ) : null}
      </div>
      <span className="cap">{scan.status === 'done' ? 'Scan done' : scan.hint ?? (scan.status === 'scanning' ? 'Hold still' : scan.status)}</span>
      <span className="scan-bpm">
        {scan.bpm != null ? Math.round(scan.bpm) : '--'}
        <small>bpm</small>
      </span>
      <span className="scan-bar">
        <i style={{ width: `${Math.round(scan.progress * 100)}%` }} />
      </span>
      <span className="cap">{scan.error ?? scan.label}</span>
      <button
        type="button"
        className="ghost"
        onClick={() => {
          scan.cancel();
          onClose();
        }}
      >
        {scan.status === 'done' ? 'Close' : 'Cancel'}
      </button>
    </div>
  );
}

export default function CrewPage() {
  const { cd, cv, seat } = useConsole();
  const [params, setParams] = useSearchParams();
  const { setFocus, setTint, heartBpm } = useHud();
  const idle = useIdle();
  const [ask, setAsk] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [handoff, setHandoff] = useState(false);
  const [scanning, setScanning] = useState(false);
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
  useEffect(() => {
    setResult(null);
    setHandoff(false);
  }, [cv?.m.id]);

  if (!cd || !cv) return <p className="cx-error cx-wait">Loading</p>;

  const flagged = all.filter((r) => r.status !== 'green').sort((a, b) => RANK[b.status] - RANK[a.status] || Math.abs(b.z ?? 0) - Math.abs(a.z ?? 0));
  const organRow = target ? all.find((r) => r.k === TARGET_METRICS[target][0]) : null;
  const one = organRow ?? flagged[0] ?? null;
  const red = one?.status === 'red';
  const caption = one ? `${SHORT[one.k]} ${fmt(one.value, one.digits)} ${one.unit}${one.mean != null ? ` · usual ${fmt(one.mean, one.digits)}` : ''}` : 'All readings in range';

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
      <section className="crew-read brk" aria-live="polite">
        <span className="cap">
          {seat[cv.m.id]} · {cv.m.role}
        </span>
        <b className="crew-word">{STATUS_WORD[cv.overall]}</b>
        <span className="cap crew-line">{caption}</span>
        {heartBpm != null && <span className="cap">Heart {Math.round(heartBpm)} bpm · camera estimate</span>}
      </section>

      <div className="crew-actions">
        {one && one.status !== 'green' && (
          <button type="button" className="solid" onClick={() => setAsk(true)}>
            {result ?? (red ? 'Call surgeon' : 'Re-measure')}
          </button>
        )}
        <button type="button" className="ghost" onClick={() => setScanning(true)}>
          Scan
        </button>
        {target && (
          <button type="button" className="ghost" onClick={() => setParams({}, { replace: true })}>
            Whole body
          </button>
        )}
      </div>

      <button type="button" className="ghost crew-checkin" aria-pressed={panel === 'checkin'} onClick={() => setParams(panel === 'checkin' ? {} : { p: 'checkin' }, { replace: true })}>
        Check-in
      </button>

      {/* keyboard: Tab reaches each body region, Enter focuses it, Esc returns */}
      <nav className="hot-keys" aria-label="Body regions">
        {(Object.keys(TARGETS) as TargetId[]).map((id) => (
          <button key={id} type="button" onClick={() => setParams({ t: id }, { replace: true })}>
            {TARGETS[id].label}
          </button>
        ))}
      </nav>

      {panel === 'checkin' && <CheckinPanel className="crew-right" />}
      {handoff && <HandoffPanel className="crew-right" />}
      {scanning && <ScanOverlay onClose={() => setScanning(false)} />}

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
