// Concept A, "Cupola": cinematic realism. Ana floats in front of the Earth as in the
// Cupola renders; the UI is thin glass laid over the scene. One accent: atmosphere blue.
import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { AnimatePresence, motion } from 'framer-motion';
import type { ConceptMeta } from '../../registry';
import { SuitFigure } from '../suit-shared/SuitFigure';
import { Earth } from '../suit-shared/Earth';
import { Flow } from '../suit-shared/Flow';
import { BaselineBar, Credits, deltaText, Spark, StatusMark, STATUS_VAR, statusRGB, statusWord } from '../suit-shared/bits';
import { fmt, SENSORS, SENSOR_NAME, SENSOR_READS, useSuitData } from '../suit-shared/suitData';
import { useSuitView } from '../suit-shared/useSuitView';
import './suit-a.css';

export const meta: ConceptMeta = {
  title: 'Suit: Cupola',
  direction: 'Cinematic realism: Ana over the Earth, thin glass UI, atmosphere blue',
  surface: 'Crew Console',
};

const EASE = [0.16, 1, 0.3, 1] as const;

export default function SuitCupola() {
  const s = useSuitData();
  const { sensor, view, select, close, setView } = useSuitView();
  const [done, setDone] = useState<Record<string, boolean>>({});
  const st = sensor && s ? s.sensors[sensor] : null;

  return (
    <div className="sa-root">
      <div className="sa-stage" data-dim={view === 'systems' || undefined}>
        <Canvas camera={{ position: [0, 1.0, 4.2], fov: 30 }} dpr={[1, 2]} gl={{ antialias: true }}>
          <color attach="background" args={['#03050a']} />
          <Stars radius={60} depth={30} count={2500} factor={2.2} fade speed={0} />
          <hemisphereLight args={['#dfe9f5', '#2a1c10', 0.35]} />
          <directionalLight position={[2.5, 2.2, 2.5]} intensity={1.6} color="#ffe8d2" />
          <directionalLight position={[-2.5, 1.6, -2.2]} intensity={2.6} color="#8cc8ff" />
          <pointLight position={[0.4, -0.6, 1.6]} intensity={1.2} color="#6aa8ff" distance={5} />
          <Suspense fallback={null}>
            <Earth radius={30} position={[9, -34.5, -30]} tilt={0.42} />
            <SuitFigure
              selected={sensor}
              onSelect={select}
              glow={(id) => (s?.sensors[id].status ? statusRGB(s.sensors[id].status!) : '#8fd2ff')}
              traceColor="#8fd2ff"
              view={{ pos: [0, 1.0, 4.7], target: [0.05, 0.95, 0] }}
              focus={{ distance: 1.75, shiftX: 0.42 }}
              marker={(id, active) => (
                <span className="sa-pin" data-status={s?.sensors[id].status ?? 'none'} data-active={active || undefined}>
                  <span className="sa-pin-ring" />
                  <span className="sa-pin-label">{SENSOR_NAME[id]}</span>
                </span>
              )}
            />
          </Suspense>
        </Canvas>
      </div>

      {/* top: status in one second + view switch */}
      <header className="sa-top">
        {s && (
          <div className="sa-status" data-status={s.overall}>
            <StatusMark status={s.overall} size={26} />
            <span className="sa-status-word">{statusWord(s.overall)}</span>
            <span className="sa-status-who">
              {s.crew.name}
              <em>Day {s.day}</em>
            </span>
          </div>
        )}
        <nav className="sa-switch" aria-label="View">
          {(['suit', 'systems'] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {v === 'suit' ? 'Suit' : 'Systems'}
            </button>
          ))}
        </nav>
      </header>

      {/* bottom: the four sensors as big buttons (same as tapping her) */}
      {view === 'suit' && s && (
        <nav className="sa-dock" aria-label="Sensors">
          {SENSORS.map((id) => {
            const p = s.sensors[id].primary;
            return (
              <button key={id} type="button" className="sa-dock-btn" aria-pressed={sensor === id} onClick={() => select(id)}>
                <span className="sa-dock-head">
                  <StatusMark status={s.sensors[id].status} />
                  {SENSOR_NAME[id]}
                </span>
                <span className="sa-dock-val">
                  {p ? fmt(p.value, p.digits) : 'No feed'}
                  <small>{p && p.value != null ? p.unit : ''}</small>
                </span>
                <span className="sa-dock-sub">{p?.short ?? SENSOR_READS[id]}</span>
              </button>
            );
          })}
        </nav>
      )}

      {/* reading */}
      <AnimatePresence>
        {view === 'suit' && st && sensor && s && (
          <motion.aside
            key={sensor}
            className="sa-panel"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.32, ease: EASE }}
          >
            <div className="sa-panel-head">
              <span className="sa-eyebrow">{SENSOR_READS[sensor]}</span>
              <button type="button" className="sa-close" onClick={close} aria-label="Close">
                Close
              </button>
            </div>
            <h2 className="sa-panel-title">{SENSOR_NAME[sensor]}</h2>
            {st.primary && (
              <>
                <div className="sa-big" style={{ color: st.primary.status ? STATUS_VAR[st.primary.status] : undefined }}>
                  {fmt(st.primary.value, st.primary.digits)}
                  <small>{st.primary.value != null ? st.primary.unit : ''}</small>
                </div>
                <div className="sa-state">
                  <StatusMark status={st.primary.status} size={16} />
                  <b>{statusWord(st.primary.status)}</b>
                  <span>{st.primary.short}</span>
                </div>
                <BaselineBar r={st.primary} className="sa-bar" />
                <p className="sa-delta">{deltaText(st.primary)}</p>
                {st.primary.history.length > 1 && (
                  <div className="sa-spark">
                    <span className="sa-eyebrow">14 days</span>
                    <Spark r={st.primary} />
                  </div>
                )}
              </>
            )}
            <ul className="sa-rows">
              {st.readings
                .filter((r) => r !== st.primary)
                .map((r) => (
                  <li key={r.key}>
                    <StatusMark status={r.status} size={12} />
                    <span>{r.short}</span>
                    <b>
                      {fmt(r.value, r.digits)} <small>{r.value != null ? r.unit : ''}</small>
                    </b>
                  </li>
                ))}
            </ul>
            <p className="sa-action-text">{st.action.detail}</p>
            <button
              type="button"
              className="sa-action"
              data-done={done[sensor] || undefined}
              onClick={() => setDone((d) => ({ ...d, [sensor]: !d[sensor] }))}
            >
              {done[sensor] ? 'Logged' : st.action.label}
            </button>
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {view === 'systems' && s && (
          <motion.section
            className="sa-systems"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.32, ease: EASE }}
          >
            <div className="sa-sys-legend">
              <span>Sensors</span>
              <span>Core</span>
              <span>Out</span>
            </div>
            <Flow s={s} layout="lanes" onSensor={select} className="sa-flow" />
          </motion.section>
        )}
      </AnimatePresence>

      <Credits s={s} className="sa-credits" />
    </div>
  );
}
