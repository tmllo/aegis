// Concept C, "Editorial": Flight Record warm black, huge serif, orbital rings round Ana
// (Fuselab), NASA case-study index and a vertical edge caption. One accent: haze violet.
import { Suspense, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { AnimatePresence, motion } from 'framer-motion';
import * as THREE from 'three';
import type { ConceptMeta } from '../../registry';
import { SuitFigure } from '../suit-shared/SuitFigure';
import { Flow } from '../suit-shared/Flow';
import { BaselineBar, Credits, deltaText, Spark, StatusMark, STATUS_VAR, statusRGB, statusWord } from '../suit-shared/bits';
import { DISCLAIMERS } from '../../components/Footer';
import { fmt, SENSORS, SENSOR_NAME, SENSOR_READS, useSuitData } from '../suit-shared/suitData';
import { useSuitView } from '../suit-shared/useSuitView';
import './suit-c.css';

export const meta: ConceptMeta = {
  title: 'Suit: Editorial',
  direction: 'Flight Record warm black, huge serif, orbital rings round Ana, haze violet',
  surface: 'Crew Console',
};

const ACCENT = '#b49cff';
const EASE = [0.16, 1, 0.3, 1] as const;
const idx = (i: number) => String(i + 1).padStart(2, '0');

/** Hairline orbits with ticks round the figure; they turn slowly. */
function Orbits() {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (g.current) g.current.rotation.y -= dt * 0.05;
  });
  const ticks = Array.from({ length: 72 }, (_, i) => (i / 72) * Math.PI * 2);
  return (
    <group ref={g}>
      {[
        { y: 0.92, r: 0.78, o: 0.55 },
        { y: 1.3, r: 0.62, o: 0.3 },
        { y: 0.35, r: 0.7, o: 0.22 },
      ].map((o) => (
        <group key={o.y} position={[0, o.y, 0]} rotation={[-Math.PI / 2 + 0.06, 0, 0]}>
          <mesh>
            <ringGeometry args={[o.r, o.r + 0.0035, 160]} />
            <meshBasicMaterial color="#efe6d6" transparent opacity={o.o} side={THREE.DoubleSide} toneMapped={false} />
          </mesh>
        </group>
      ))}
      {ticks.map((a, i) => (
        <mesh key={a} position={[Math.cos(a) * 0.78, 0.92, Math.sin(a) * 0.78]} rotation={[0, -a, 0]}>
          <boxGeometry args={[0.002, i % 6 === 0 ? 0.05 : 0.02, 0.002]} />
          <meshBasicMaterial color={i % 18 === 0 ? ACCENT : '#efe6d6'} transparent opacity={i % 6 === 0 ? 0.8 : 0.35} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

export default function SuitEditorial() {
  const s = useSuitData();
  const { sensor, view, select, close, setView } = useSuitView();
  const [done, setDone] = useState<Record<string, boolean>>({});
  const st = sensor && s ? s.sensors[sensor] : null;
  const flagged = s ? SENSORS.filter((id) => s.sensors[id].status && s.sensors[id].status !== 'green').length : 0;

  return (
    <div className="sc-root">
      <div className="sc-haze" aria-hidden />

      <header className="sc-top">
        <span className="sc-brand">e^x</span>
        <nav className="sc-tabs" aria-label="View">
          {(['suit', 'systems'] as const).map((v, i) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              <span>{idx(i)}</span>
              {v === 'suit' ? 'Suit' : 'Systems'}
            </button>
          ))}
        </nav>
        {s && (
          <span className="sc-meta">
            {s.data.mission.name} <i>/</i> Day {s.day}
          </span>
        )}
      </header>

      <div className="sc-stage" data-hidden={view === 'systems' || undefined}>
        <Canvas camera={{ position: [0, 1, 4.3], fov: 30 }} dpr={[1, 2]}>
          <hemisphereLight args={['#f3e3cf', '#1c120c', 0.45]} />
          <directionalLight position={[-3, 2.2, 2]} intensity={2.2} color="#ffb27a" />
          <directionalLight position={[3, 1.5, -1.5]} intensity={2.4} color="#a78bff" />
          <directionalLight position={[0.5, 2, 3]} intensity={0.7} color="#fff4e8" />
          <Suspense fallback={null}>
            <Orbits />
            <SuitFigure
              selected={sensor}
              onSelect={select}
              glow={(id) => (s?.sensors[id].status ? statusRGB(s.sensors[id].status!) : ACCENT)}
              traceColor={ACCENT}
              view={{ pos: [-0.55, 1.02, 4.5], target: [-0.55, 0.9, 0] }}
              focus={{ distance: 2.5, shiftX: -0.62 }}
              spin={0.1}
              marker={(id, active) => (
                <span className="sc-pin" data-status={s?.sensors[id].status ?? 'none'} data-active={active || undefined}>
                  <span className="sc-pin-dot" />
                  <span className="sc-pin-label suit-label">
                    <em>{idx(SENSORS.indexOf(id))}</em> {SENSOR_NAME[id]}
                  </span>
                </span>
              )}
            />
          </Suspense>
        </Canvas>
      </div>

      {view === 'systems' && s && (
        <motion.div className="sc-systems" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, ease: EASE }}>
          <Flow s={s} layout="rings" onSensor={select} className="sc-flow" />
        </motion.div>
      )}

      <main className="sc-col">
        <AnimatePresence mode="wait">
          {!st || !sensor ? (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              {s && (
                <>
                  <p className="sc-eyebrow">{s.crew.role}</p>
                  <h1 className="sc-name">{s.crew.name.replace(/^\S+\.\s/, '')}</h1>
                  <div className="sc-overall" data-status={s.overall}>
                    <StatusMark status={s.overall} size={30} />
                    <span className="sc-overall-word">{statusWord(s.overall)}</span>
                    <span className="sc-overall-sub">
                      {flagged} of {SENSORS.length} flagged
                    </span>
                  </div>
                  <ol className="sc-index">
                    {SENSORS.map((id, i) => {
                      const p = s.sensors[id].primary;
                      return (
                        <li key={id}>
                          <button type="button" onClick={() => select(id)}>
                            <span className="sc-i">{idx(i)}</span>
                            <span className="sc-n">{SENSOR_NAME[id]}</span>
                            <StatusMark status={s.sensors[id].status} size={13} />
                            <span className="sc-v">
                              {p ? fmt(p.value, p.digits) : 'No feed'}
                              <small>{p && p.value != null ? p.unit : ''}</small>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </>
              )}
            </motion.div>
          ) : (
            <motion.div
              key={sensor}
              className="sc-reading"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              <button type="button" className="sc-back" onClick={close}>
                <span>{idx(SENSORS.indexOf(sensor))}</span> All sensors
              </button>
              <p className="sc-eyebrow">{SENSOR_READS[sensor]}</p>
              <h2 className="sc-title">{SENSOR_NAME[sensor]}</h2>
              {st.primary && (
                <>
                  <div className="sc-num">
                    <span style={{ color: st.primary.status && st.primary.status !== 'green' ? STATUS_VAR[st.primary.status] : undefined }}>
                      {fmt(st.primary.value, st.primary.digits)}
                    </span>
                    <small>{st.primary.value != null ? st.primary.unit : ''}</small>
                  </div>
                  <div className="sc-state">
                    <StatusMark status={st.primary.status} size={15} />
                    <b>{statusWord(st.primary.status)}</b>
                    <span>{st.primary.short}</span>
                    <span className="sc-delta">{deltaText(st.primary)}</span>
                  </div>
                  <BaselineBar r={st.primary} className="sc-bar" />
                  {st.primary.history.length > 1 && <Spark r={st.primary} className="sc-spark" />}
                </>
              )}
              <dl className="sc-others">
                {st.readings
                  .filter((r) => r !== st.primary)
                  .map((r) => (
                    <div key={r.key}>
                      <dt>{r.short}</dt>
                      <dd>
                        {fmt(r.value, r.digits)}
                        <small>{r.value != null ? r.unit : ''}</small>
                      </dd>
                    </div>
                  ))}
              </dl>
              <p className="sc-note">{st.action.detail}</p>
              <button
                type="button"
                className="sc-action"
                data-done={done[sensor] || undefined}
                onClick={() => setDone((d) => ({ ...d, [sensor]: !d[sensor] }))}
              >
                {done[sensor] ? 'Logged' : st.action.label}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <p className="sc-edge">{DISCLAIMERS[0]}</p>
      <Credits s={s} className="sc-credits" />
    </div>
  );
}
