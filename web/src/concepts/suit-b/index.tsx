// Concept B, "Cockpit": instrument realism after the cockpit touchscreen reference.
// Three glass displays (crew, Ana on a lit floor ring, reading) above a hardware key row
// with status lamps and a red-framed press-and-hold "Call ground". One accent: cobalt.
import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { AnimatePresence, motion } from 'framer-motion';
import * as THREE from 'three';
import type { ConceptMeta } from '../../registry';
import { SuitFigure } from '../suit-shared/SuitFigure';
import { Flow } from '../suit-shared/Flow';
import { BaselineBar, Credits, deltaText, Spark, StatusMark, STATUS_VAR, statusRGB, statusWord } from '../suit-shared/bits';
import { fmt, SENSORS, SENSOR_NAME, SENSOR_READS, useSuitData, type SensorId, type SuitData } from '../suit-shared/suitData';
import { useSuitView } from '../suit-shared/useSuitView';
import './suit-b.css';

export const meta: ConceptMeta = {
  title: 'Suit: Cockpit',
  direction: 'Instrument realism: navy glass displays, hardware keys, red-framed hold button',
  surface: 'Crew Console',
};

const ACCENT = '#5c9cff';
const RANK = { green: 0, amber: 1, red: 2 } as const;

function FloorRing() {
  const tex = useRef<THREE.CanvasTexture | null>(null);
  if (!tex.current) {
    const s = 256;
    const cv = document.createElement('canvas');
    cv.width = cv.height = s;
    const g = cv.getContext('2d')!;
    const grad = g.createRadialGradient(s / 2, s / 2, s * 0.05, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(92,156,255,0.55)');
    grad.addColorStop(0.6, 'rgba(92,156,255,0.12)');
    grad.addColorStop(1, 'rgba(92,156,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    tex.current = new THREE.CanvasTexture(cv);
  }
  return (
    <group position={[0, -0.02, 0.12]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <circleGeometry args={[0.9, 64]} />
        <meshBasicMaterial map={tex.current} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      {[0.52, 0.62, 0.78].map((r, i) => (
        <mesh key={r}>
          <ringGeometry args={[r, r + (i === 1 ? 0.012 : 0.004), 128]} />
          <meshBasicMaterial color={ACCENT} transparent opacity={i === 1 ? 0.9 : 0.35} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function worstSensor(s: SuitData): SensorId {
  return [...SENSORS].sort((a, b) => (s.sensors[b].status ? RANK[s.sensors[b].status!] : -1) - (s.sensors[a].status ? RANK[s.sensors[a].status!] : -1))[0];
}

function HoldButton({ label, doneLabel }: { label: string; doneLabel: string }) {
  const [p, setP] = useState(0);
  const [done, setDone] = useState(false);
  const raf = useRef(0);
  const start = useRef(0);
  const stop = () => {
    cancelAnimationFrame(raf.current);
    if (!done) setP(0);
  };
  const tick = (t: number) => {
    const k = Math.min(1, (t - start.current) / 1200);
    setP(k);
    if (k >= 1) setDone(true);
    else raf.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return (
    <button
      type="button"
      className="sb-hold"
      data-done={done || undefined}
      onPointerDown={() => {
        if (done) {
          setDone(false);
          setP(0);
          return;
        }
        start.current = performance.now();
        raf.current = requestAnimationFrame(tick);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
    >
      <span className="sb-hold-fill" style={{ transform: `scaleX(${p})` }} />
      <span className="sb-lamps">
        <i />
        <i />
      </span>
      <b>{done ? doneLabel : label}</b>
      <small>{done ? 'Tap to reset' : 'Press and hold'}</small>
    </button>
  );
}

export default function SuitCockpit() {
  const s = useSuitData();
  const { sensor, view, select, close, setView } = useSuitView();
  const [done, setDone] = useState<Record<string, boolean>>({});
  const shown = s ? sensor ?? worstSensor(s) : null;
  const st = shown && s ? s.sensors[shown] : null;

  return (
    <div className="sb-root">
      <header className="sb-strip">
        <span className="sb-strip-id">e^x Crew Station</span>
        {s && (
          <>
            <span>{s.data.mission.name}</span>
            <span>Day {s.day}</span>
            <span>{s.today}</span>
          </>
        )}
        <span className="sb-strip-end">{s?.cabin ? (s.cabin.signal ? 'Ground link' : 'No link') : 'No feed'}</span>
      </header>

      <main className="sb-main">
        {/* left display: crew status + sensors */}
        <section className="sb-panel sb-left">
          <p className="sb-label">Crew status</p>
          {s && (
            <div className="sb-overall" data-status={s.overall}>
              <StatusMark status={s.overall} size={34} />
              <div>
                <b>{statusWord(s.overall)}</b>
                <span>{s.crew.name}</span>
              </div>
            </div>
          )}
          <p className="sb-label sb-mt">Sensors</p>
          <div className="sb-list">
            {s &&
              SENSORS.map((id) => {
                const p = s.sensors[id].primary;
                return (
                  <button key={id} type="button" className="sb-row" aria-pressed={sensor === id} onClick={() => select(id)}>
                    <StatusMark status={s.sensors[id].status} size={16} />
                    <span className="sb-row-name">
                      {SENSOR_NAME[id]}
                      <small>{p?.short ?? SENSOR_READS[id]}</small>
                    </span>
                    <span className="sb-row-val">
                      {p ? fmt(p.value, p.digits) : 'No feed'}
                      <small>{p && p.value != null ? p.unit : ''}</small>
                    </span>
                  </button>
                );
              })}
          </div>
        </section>

        {/* centre display: Ana or the systems flow */}
        <section className="sb-panel sb-centre">
          <div className="sb-centre-head">
            <p className="sb-label">{view === 'systems' ? 'Systems' : 'Suit'}</p>
            {view === 'suit' && sensor && (
              <button type="button" className="sb-chip" onClick={close}>
                Show all
              </button>
            )}
          </div>
          <div className="sb-canvas" data-hidden={view === 'systems' || undefined}>
            <Canvas camera={{ position: [0, 0.95, 4.4], fov: 30 }} dpr={[1, 2]}>
              <color attach="background" args={['#060b18']} />
              <fog attach="fog" args={['#060b18', 5, 11]} />
              <hemisphereLight args={['#cfe0ff', '#0b1020', 0.5]} />
              <directionalLight position={[2, 3, 3]} intensity={1.7} color="#ffffff" />
              <directionalLight position={[-3, 1.5, -2]} intensity={2.4} color={ACCENT} />
              <pointLight position={[0, 0.1, 0.8]} intensity={1.4} color={ACCENT} distance={3} />
              <Suspense fallback={null}>
                <FloorRing />
                <SuitFigure
                  selected={sensor}
                  onSelect={select}
                  glow={(id) => (s?.sensors[id].status ? statusRGB(s.sensors[id].status!) : ACCENT)}
                  traceColor={ACCENT}
                  view={{ pos: [0, 0.98, 3.85], target: [0.1, 0.88, 0] }}
                  focus={{ distance: 1.6, shiftX: 0 }}
                  spin={0.16}
                  marker={(id, active) => (
                    <span className="sb-pin" data-status={s?.sensors[id].status ?? 'none'} data-active={active || undefined}>
                      <span className="sb-pin-box" />
                      <span className="sb-pin-label suit-label">{SENSOR_NAME[id]}</span>
                    </span>
                  )}
                />
              </Suspense>
            </Canvas>
          </div>
          {view === 'systems' && s && <Flow s={s} layout="lanes" onSensor={select} className="sb-flow" />}
        </section>

        {/* right display: the reading */}
        <section className="sb-panel sb-right">
          <AnimatePresence mode="wait">
            {st && shown && s && (
              <motion.div
                key={shown}
                className="sb-reading"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              >
                <p className="sb-label">{sensor ? SENSOR_READS[shown] : 'Needs a look'}</p>
                <h2>{SENSOR_NAME[shown]}</h2>
                {st.primary && (
                  <>
                    <div className="sb-big">
                      <span style={{ color: st.primary.status && st.primary.status !== 'green' ? STATUS_VAR[st.primary.status] : undefined }}>
                        {fmt(st.primary.value, st.primary.digits)}
                      </span>
                      <small>{st.primary.value != null ? st.primary.unit : ''}</small>
                    </div>
                    <div className="sb-state" data-status={st.primary.status ?? 'none'}>
                      <StatusMark status={st.primary.status} size={16} />
                      <b>{statusWord(st.primary.status)}</b>
                      <span>{st.primary.short}</span>
                    </div>
                    <div className="sb-gauge">
                      <BaselineBar r={st.primary} />
                      <p>{deltaText(st.primary)}</p>
                    </div>
                    {st.primary.history.length > 1 && <Spark r={st.primary} className="sb-spark" />}
                  </>
                )}
                <dl className="sb-others">
                  {st.readings
                    .filter((r) => r !== st.primary)
                    .map((r) => (
                      <div key={r.key}>
                        <dt>
                          <StatusMark status={r.status} size={11} />
                          {r.short}
                        </dt>
                        <dd>
                          {fmt(r.value, r.digits)} <small>{r.value != null ? r.unit : ''}</small>
                        </dd>
                      </div>
                    ))}
                </dl>
                <p className="sb-note">{st.action.detail}</p>
                <button
                  type="button"
                  className="sb-action"
                  data-done={done[shown] || undefined}
                  onClick={() => setDone((d) => ({ ...d, [shown]: !d[shown] }))}
                >
                  {done[shown] ? 'Logged' : st.action.label}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>

      {/* hardware key row */}
      <nav className="sb-console" aria-label="Console">
        <div className="sb-block">
          <span className="sb-block-label">Mode</span>
          {(['suit', 'systems'] as const).map((v) => (
            <button key={v} type="button" className="sb-key" aria-pressed={view === v} onClick={() => setView(v)}>
              <i className="sb-lamp" />
              {v === 'suit' ? 'Suit' : 'Systems'}
            </button>
          ))}
        </div>
        <div className="sb-block">
          <span className="sb-block-label">Sensors</span>
          {s &&
            SENSORS.map((id) => (
              <button key={id} type="button" className="sb-key" aria-pressed={sensor === id} data-status={s.sensors[id].status ?? 'none'} onClick={() => select(id)}>
                <i className="sb-lamp sb-lamp-status" />
                {SENSOR_NAME[id]}
              </button>
            ))}
        </div>
        <div className="sb-block sb-block-crit">
          <span className="sb-block-label">Ground</span>
          <HoldButton label="Call ground" doneLabel="Ground called" />
        </div>
      </nav>

      <Credits s={s} className="sb-credits" />
    </div>
  );
}
