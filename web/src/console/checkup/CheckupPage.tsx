// Daily check: the astronaut's own guided flow, like a health app. Six steps on one strip:
// 01 Feel (check-in) -> 02 Camera (heart, breathing) -> 03 Band (wrist band) -> 04 Reaction (PVT)
// -> 05 Summary (against her own baseline, 14-day trends) -> 06 Send (save to the log, report to Earth).
// Every step can be skipped; nothing is stored that was not measured; demo values are labelled.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMind } from '../../data/mind';
import { hasServer, postJson } from '../../data/http';
import { useReactionTest } from '../../inputs/useReactionTest';
import { useCameraScan } from '../../scan';
import { CHANNEL_SOURCE, useWristband } from '../../wearable';
import { useEntries } from '../entries';
import { useHud } from '../hud';
import { LINK_DELAY, STATUS_WORD } from '../model';
import { Mark } from '../ui';
import { useConsole } from '../useConsole';
import { CheckinScales } from '../mind/CheckinScales';
import { useCheckSession } from './session';
import { buildSummary, overall } from './summary';
import '../mind/mind.css';
import './checkup.css';

const STEPS = ['Feel', 'Camera', 'Band', 'Reaction', 'Summary', 'Send'] as const;
/** One-way light time, seconds, for the report animation. */
const DELAY_S: Record<string, number> = { iss: 0.5, moon: 1.3, transit: 300, mars: 750 };

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="ck-spark" />;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${hi === lo ? 10 : 18 - ((v - lo) / (hi - lo)) * 16}`).join(' ');
  return (
    <svg className="ck-spark" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} />
    </svg>
  );
}

export default function CheckupPage() {
  const { cd, cv, seat } = useConsole();
  const m = cv?.m;
  const today = cd?.mission.today;
  const nav = useNavigate();
  const session = useCheckSession();
  const reports = useMind((s) => s.reports);
  const setHeartBpm = useHud((s) => s.setHeartBpm);
  const setBreath = useHud((s) => s.setBreath);
  const [step, setStep] = useState(0);

  const scan = useCameraScan({ durationS: 25 });
  const band = useWristband({ subject: m?.id, hrMean: m?.baseline.hr?.mean, hrSd: m?.baseline.hr?.sd, day: today, upload: false });
  const pvt = useReactionTest({ subject: m?.id, durationS: 60 });
  const [sending, setSending] = useState<{ start: number; total: number } | null>(null);
  const [, force] = useState(0);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const tapRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (m && today) session.begin(m.id, today);
  }, [m, today, session]);

  // results flow into the shared session (and the Crew page's live heart and breathing)
  useEffect(() => {
    if (scan.status === 'done') {
      session.set({ scan: { bpm: scan.bpm, breathing: scan.breathing, confidence: scan.confidence } });
      setHeartBpm(scan.bpm);
      setBreath(scan.breathing);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan.status]);
  useEffect(() => {
    if (pvt.phase === 'done' && pvt.result?.meanMs != null)
      session.set({ pvt: { meanMs: pvt.result.meanMs, lapses: pvt.result.lapses, status: pvt.baseline?.status ?? 'green', usual: pvt.baseline?.usual ?? null } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pvt.phase]);
  // camera off when leaving the camera step; band off when leaving the band step
  useEffect(() => {
    if (step !== 1 && (scan.status === 'scanning' || scan.status === 'starting')) scan.cancel();
    if (step !== 2 && band.status !== 'off') band.disconnect();
    if (step !== 3 && (pvt.phase === 'wait' || pvt.phase === 'go')) pvt.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  // Space bar for the reaction test
  useEffect(() => {
    if (step !== 3) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && (pvt.phase === 'wait' || pvt.phase === 'go')) {
        e.preventDefault();
        pvt.tap();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, pvt]);
  // report travelling to Earth
  useEffect(() => {
    if (!sending) return;
    const id = window.setInterval(() => {
      force((n) => n + 1);
      if (performance.now() - sending.start >= sending.total) {
        window.clearInterval(id);
        session.set({ sentAt: new Date().toISOString() });
        setSending(null);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [sending, session]);

  const report = (m && today ? reports[m.id]?.[today] : undefined) ?? {};
  const rows = useMemo(() => (m && today ? buildSummary(m, today, session, report) : []), [m, today, session, report]);
  if (!cd || !cv || !m || !today) return <p className="cx-error cx-wait">Loading</p>;

  const env = cd.mission.environment;
  const level = overall(rows);
  const answered = Object.keys(report).length;
  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));

  const save = async () => {
    const toStore = rows.filter((r) => r.store && r.value != null);
    // Crew re-scores from the shared entries store, so the body and vitals update on return
    const hrRow = rows.find((r) => r.key === 'hr');
    if (hrRow?.value != null) useEntries.getState().put(m.id, today, 'hr', hrRow.value);
    if (!(await hasServer())) {
      session.set({ savedAt: new Date().toISOString() });
      setSaveNote(`Saved on this device · ${toStore.length} readings wait for the station server`);
      return;
    }
    const t = `${today}T${new Date().toISOString().slice(11, 19)}Z`;
    let ok = 0;
    for (const r of toStore) {
      try {
        await postJson('api/observations', { subject: m.id, metric: r.store, t, value: r.value });
        ok++;
      } catch {
        /* keep going; the count shows what was stored */
      }
    }
    session.set({ savedAt: new Date().toISOString() });
    setSaveNote(`${ok} of ${toStore.length} readings saved to her log${answered ? ` · check-in saved (${answered} of 5)` : ''}`);
  };
  const send = () => setSending({ start: performance.now(), total: Math.min(12, DELAY_S[env] ?? 1) * 1000 });

  const word =
    step === 0 ? `${answered} of 5`
    : step === 1 ? (scan.status === 'done' && scan.bpm != null ? `${scan.bpm}` : scan.status === 'scanning' && scan.bpm != null ? `${scan.bpm}` : 'Scan')
    : step === 2 ? (band.reading ? `${band.reading.hr}` : 'Band')
    : step === 3 ? (pvt.result?.meanMs != null ? `${pvt.result.meanMs}` : pvt.phase === 'go' ? 'Tap' : pvt.phase === 'wait' ? 'Wait' : 'Ready')
    : step === 4 ? STATUS_WORD[level]
    : session.sentAt ? 'Sent' : sending ? 'Sending' : session.savedAt ? 'Saved' : 'Send';
  const unit = step === 1 && scan.bpm != null ? 'bpm' : step === 2 && band.reading ? 'bpm' : step === 3 && pvt.result?.meanMs != null ? 'ms' : '';

  return (
    <div className="ck" data-status={step === 4 ? level : undefined}>
      <i className="safe safe-left" aria-hidden />
      <i className="safe safe-right" aria-hidden />

      <nav className="ck-strip" aria-label="Daily check steps">
        {STEPS.map((s, i) => (
          <button key={s} type="button" aria-current={i === step ? 'step' : undefined} data-done={i < step || undefined} onClick={() => setStep(i)}>
            <span>{String(i + 1).padStart(2, '0')}</span>
            {s}
          </button>
        ))}
      </nav>

      <section className="pat ck-read brk" aria-live="polite">
        <span className="cap">Daily check · {seat[m.id]} · {today}</span>
        <b className="pat-word ck-word">
          {word}
          {unit && <small>{unit}</small>}
        </b>

        {step === 0 && <span className="cap pat-line">How do you feel today? One tap per row.</span>}
        {step === 1 && <span className="cap pat-line">{scan.message}</span>}
        {step === 2 && <span className="cap pat-line">{band.status === 'connected' ? `${band.deviceName} · live` : band.status === 'pairing' ? 'Pairing the wrist band' : 'Pair the wrist band'}</span>}
        {step === 3 && <span className="cap pat-line">{pvt.phase === 'idle' ? 'Tap the box or press Space when the dot appears · 1 min' : pvt.phase === 'done' ? `${pvt.result?.lapses ?? 0} lapses · ${pvt.result?.falseStarts ?? 0} early taps${pvt.baseline?.usual ? ` · usual ${pvt.baseline.usual} ms` : ' · first tests set her usual'}` : `Last ${pvt.last ?? '--'} ms`}</span>}
        {step === 4 && <span className="cap pat-line">Against her own usual · {rows.filter((r) => r.value != null).length} readings today</span>}
        {step === 5 && <span className="cap pat-line">{saveNote ?? 'Save to her log, then send the report to Earth'}</span>}
      </section>

      <section className="pat ck-body">
        {step === 0 && <CheckinScales subject={m.id} date={today} />}

        {step === 1 && (
          <div className="ck-cam brk">
            <video ref={scan.videoRef} className="ck-video" autoPlay muted playsInline />
            {scan.status !== 'scanning' && scan.status !== 'starting' && <div className="ck-cam-empty cap">{scan.status === 'done' ? 'Scan done' : 'Camera off until you start'}</div>}
            {scan.status === 'scanning' && scan.box && scan.videoRef.current?.videoWidth ? (
              <i
                className="ck-box"
                style={{
                  left: `${(1 - (scan.box.x + scan.box.w) / scan.videoRef.current.videoWidth) * 100}%`,
                  top: `${(scan.box.y / scan.videoRef.current.videoHeight) * 100}%`,
                  width: `${(scan.box.w / scan.videoRef.current.videoWidth) * 100}%`,
                  height: `${(scan.box.h / scan.videoRef.current.videoHeight) * 100}%`,
                }}
              />
            ) : null}
            <span className="ck-bar"><i style={{ width: `${Math.round(scan.progress * 100)}%` }} /></span>
            <span className="cap">{scan.label} · on this device only, nothing is recorded</span>
          </div>
        )}

        {step === 2 && (
          <div className="ck-rows">
            {band.reading ? (
              <>
                <div className="vrow"><Mark s="green" /><span className="vrow-l">Heart rate<small>{CHANNEL_SOURCE.hr}</small></span><span className="vrow-v">{band.reading.hr}<small>bpm</small></span></div>
                <div className="vrow"><Mark s={null} /><span className="vrow-l">Blood oxygen<small>{CHANNEL_SOURCE.spo2} · not stored</small></span><span className="vrow-v">{band.reading.spo2}<small>%</small></span></div>
                <div className="vrow"><Mark s={null} /><span className="vrow-l">Skin temperature<small>{CHANNEL_SOURCE.skinTemp} · not stored</small></span><span className="vrow-v">{band.reading.skinTemp}<small>°C</small></span></div>
                <span className="cap">Battery {band.reading.battery} % · {band.hrHistory.length} s streamed</span>
              </>
            ) : (
              <span className="cap">The band streams once a second after pairing.</span>
            )}
          </div>
        )}

        {step === 3 && (
          <button
            ref={tapRef}
            type="button"
            className="ck-pvt brk"
            data-phase={pvt.phase}
            onPointerDown={(e) => {
              e.preventDefault();
              if (pvt.phase === 'idle' || pvt.phase === 'done') pvt.start();
              else pvt.tap();
            }}
            aria-label={pvt.phase === 'go' ? 'Tap now' : 'Reaction test area'}
          >
            {pvt.phase === 'go' && <i className="ck-dot" />}
            <span className="ck-bar"><i style={{ width: `${Math.round(pvt.progress * 100)}%` }} /></span>
          </button>
        )}

        {(step === 4 || step === 5) && (
          <div className="ck-rows">
            {rows.map((r) => (
              <div key={r.key} className="vrow ck-row" data-status={r.status ?? undefined}>
                <Mark s={r.status} />
                <span className="vrow-l">
                  {r.label}
                  <small>{r.source}{r.usual ? ` · ${r.usual}` : ''}</small>
                </span>
                <Spark values={r.trend} />
                <span className="vrow-v">
                  {r.value ?? '--'}
                  <small>{r.unit}</small>
                </span>
              </div>
            ))}
            {step === 5 && sending && (
              <div className="ck-send">
                <span className="cap">Report to Earth · one-way delay {LINK_DELAY[env] ?? 'seconds'}</span>
                <span className="ck-bar"><i style={{ width: `${Math.min(100, ((performance.now() - sending.start) / sending.total) * 100)}%` }} /></span>
              </div>
            )}
            {step === 5 && session.sentAt && <span className="cap">Report received by the ground · {rows.filter((r) => r.value != null).length} readings · journal not included</span>}
          </div>
        )}
      </section>

      <div className="pat-actions ck-actions">
        {step === 0 && <button type="button" className="solid" onClick={next}>{answered === 5 ? 'Next: camera' : 'Next'}</button>}
        {step === 1 && (scan.status === 'scanning' || scan.status === 'starting'
          ? <button type="button" className="ghost" onClick={scan.cancel}>Stop scan</button>
          : <button type="button" className="solid" onClick={scan.status === 'done' ? next : scan.start}>{scan.status === 'done' ? 'Next: band' : scan.status === 'idle' ? 'Start scan' : 'Scan again'}</button>)}
        {step === 2 && (band.status === 'connected'
          ? <button type="button" className="solid" onClick={() => { session.set({ band: { hr: band.reading?.hr ?? 0 } }); next(); }} disabled={!band.reading}>Use this reading</button>
          : <button type="button" className="solid" onClick={() => band.connect('sim')} disabled={band.status === 'pairing'}>{band.status === 'pairing' ? 'Pairing' : 'Pair band'}</button>)}
        {step === 3 && (pvt.phase === 'done'
          ? <button type="button" className="solid" onClick={next}>Next: summary</button>
          : <button type="button" className="solid" onClick={() => (pvt.phase === 'idle' ? pvt.start() : pvt.cancel())}>{pvt.phase === 'idle' ? 'Start test' : 'Stop test'}</button>)}
        {step === 4 && <button type="button" className="solid" onClick={next}>Next: send</button>}
        {step === 5 && (!session.savedAt
          ? <button type="button" className="solid" onClick={() => void save()}>Save to log</button>
          : !session.sentAt
            ? <button type="button" className="solid" onClick={send} disabled={!!sending}>{sending ? 'Sending' : 'Send to Earth'}</button>
            : <button type="button" className="solid" onClick={() => nav('/')}>Done</button>)}
        {step < 4 && step !== 0 && <button type="button" className="ghost" onClick={next}>Skip</button>}
        {step > 0 && <button type="button" className="ghost" onClick={() => setStep((s) => s - 1)}>Back</button>}
      </div>
    </div>
  );
}
