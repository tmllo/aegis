// Sensor steps for the health check: camera pulse scan (rPPG, on-device) and the reaction-time test (PVT).
// Both reuse the existing hooks in scan/ and inputs/; nothing leaves the device.
import { useEffect } from 'react';
import { useCameraScan } from '../scan';
import { useReactionTest } from '../inputs/useReactionTest';
import { cue } from './ui';
import { useStation } from './state';

export function CameraScanCard({ onResult }: { onResult: (bpm: number, breathing: number | null, conf: number) => void }) {
  const scan = useCameraScan({ durationS: 20 });
  const sound = useStation((s) => s.sound);
  useEffect(() => {
    if (scan.status === 'done' && scan.bpm != null) {
      cue('chime', sound);
      onResult(Math.round(scan.bpm), scan.breathing, scan.confidence);
    }
  }, [scan.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const live = scan.status === 'starting' || scan.status === 'scanning';
  return (
    <div className="st-scan">
      <div className="st-scan-v">
        <video ref={scan.videoRef} autoPlay muted playsInline />
        {!live && scan.status !== 'done' && <div className="st-scan-ph">Camera off</div>}
        {scan.status === 'scanning' && <div className="st-scan-face" />}
        {live && (
          <div className="st-scan-prog">
            <i style={{ width: `${scan.progress * 100}%` }} />
          </div>
        )}
      </div>
      <div className="st-scan-r">
        <p className="st-cap">Camera pulse scan · rPPG</p>
        <p className="st-scan-msg">{scan.message}</p>
        {scan.bpm != null && (
          <p className="st-scan-out">
            <b>{Math.round(scan.bpm)}</b> bpm{scan.breathing ? ` · ${Math.round(scan.breathing)} breaths/min` : ''}
          </p>
        )}
        <p className="st-muted st-small">Reads the tiny colour change of your skin with each heartbeat. {scan.label}.</p>
        {live ? (
          <button className="st-btn is-small is-ghost" onClick={scan.cancel}>
            Stop
          </button>
        ) : (
          <button className="st-btn is-small is-primary" onClick={scan.start}>
            {scan.status === 'done' ? 'Scan again' : 'Start 20 s scan'}
          </button>
        )}
      </div>
    </div>
  );
}

export function ReactionCard({ subject, onResult }: { subject: string; onResult: (ms: number, lapses: number, status: 'green' | 'amber' | 'red', usual: number | null) => void }) {
  const rt = useReactionTest({ subject, durationS: 30 });
  useEffect(() => {
    if (rt.phase === 'done' && rt.result?.meanMs != null) onResult(rt.result.meanMs, rt.result.lapses, rt.baseline?.status ?? 'green', rt.baseline?.usual ?? null);
  }, [rt.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.code === 'Space' && (rt.phase === 'wait' || rt.phase === 'go')) {
        e.preventDefault();
        rt.tap();
      }
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [rt]);
  return (
    <div className="st-pvt">
      <button className={`st-pvt-pad is-${rt.phase}`} onPointerDown={() => (rt.phase === 'idle' || rt.phase === 'done' ? rt.start() : rt.tap())}>
        {rt.phase === 'idle' && <span>Tap to start · 30 s</span>}
        {rt.phase === 'wait' && <span>Wait for the dot…</span>}
        {rt.phase === 'go' && <i />}
        {rt.phase === 'done' && (
          <span>
            <b>{rt.result?.meanMs ?? '—'} ms</b> average · tap to retry
          </span>
        )}
        {(rt.phase === 'wait' || rt.phase === 'go') && (
          <em className="st-pvt-prog">
            <i style={{ width: `${rt.progress * 100}%` }} />
          </em>
        )}
      </button>
      <div className="st-pvt-side">
        <p className="st-cap">Reaction time · PVT</p>
        <p>The psychomotor vigilance test ISS crews use to track fatigue. Tap (or press Space) the moment the dot appears.</p>
        {rt.last != null && <p className="st-pvt-last">Last: {rt.last} ms</p>}
        {rt.result && (
          <p className="st-muted st-small">
            {rt.result.trials} taps · {rt.result.lapses} lapses (&gt; 500 ms) · {rt.result.falseStarts} false starts
            {rt.baseline?.usual ? ` · your usual ${rt.baseline.usual} ms` : ' · first result becomes your baseline'}
          </p>
        )}
      </div>
    </div>
  );
}
