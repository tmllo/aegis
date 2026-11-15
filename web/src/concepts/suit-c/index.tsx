// Concept C, "Editorial": Flight Record warm black, Instrument Serif, a hairline orbit
// round Ana (Fuselab), NASA case-study index numbers. Colour only for status.
import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { AnimatePresence, motion } from 'framer-motion';
import * as THREE from 'three';
import type { ConceptMeta } from '../../registry';
import { SuitFigure } from '../suit-shared/SuitFigure';
import { FlowLine } from '../suit-shared/FlowLine';
import { Reading } from '../suit-shared/Reading';
import { Credits, StatusMark, statusRGB, statusWord } from '../suit-shared/bits';
import { fmt, SENSORS, SENSOR_NAME, useSuitData } from '../suit-shared/suitData';
import { useSuitView } from '../suit-shared/useSuitView';
import './suit-c.css';

export const meta: ConceptMeta = {
  title: 'Suit: Editorial',
  direction: 'Flight Record warm black, serif, one hairline orbit round Ana',
  surface: 'Crew Console',
};

const IVORY = '#efe6d6';
const EASE = [0.16, 1, 0.3, 1] as const;
const idx = (i: number) => String(i + 1).padStart(2, '0');

/** One hairline orbit with ticks at the waist; it turns slowly. */
function Orbit() {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (g.current) g.current.rotation.y -= dt * 0.05;
  });
  const ticks = Array.from({ length: 72 }, (_, i) => (i / 72) * Math.PI * 2);
  return (
    <group ref={g} position={[0, 0.92, 0]}>
      <mesh rotation={[-Math.PI / 2 + 0.06, 0, 0]}>
        <ringGeometry args={[0.8, 0.8035, 160]} />
        <meshBasicMaterial color={IVORY} transparent opacity={0.5} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      {ticks.map((a, i) => (
        <mesh key={a} position={[Math.cos(a) * 0.8, 0, Math.sin(a) * 0.8]} rotation={[0, -a, 0]}>
          <boxGeometry args={[0.002, i % 6 === 0 ? 0.045 : 0.018, 0.002]} />
          <meshBasicMaterial color={IVORY} transparent opacity={i % 6 === 0 ? 0.7 : 0.3} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

export default function SuitEditorial() {
  const s = useSuitData();
  const { sensor, view, select, close, setView } = useSuitView();

  return (
    <div className="sc-root">
      <div className="sc-haze" aria-hidden />

      <header className="sc-top">
        {s && (
          <div className="sc-who" data-status={s.overall}>
            <span className="sc-name">{s.crew.name.replace(/^\S+\.\s/, '')}</span>
            <StatusMark status={s.overall} size={22} />
            <span className="sc-word">{statusWord(s.overall)}</span>
          </div>
        )}
        <nav className="sc-tabs" aria-label="View">
          {(['suit', 'systems'] as const).map((v, i) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              <span>{idx(i)}</span>
              {v === 'suit' ? 'Suit' : 'Systems'}
            </button>
          ))}
        </nav>
      </header>

      <div className="sc-stage" data-hidden={view === 'systems' || undefined}>
        <Canvas camera={{ position: [0, 1, 4.3], fov: 30 }} dpr={[1, 2]}>
          <hemisphereLight args={['#f3e3cf', '#1c120c', 0.45]} />
          <directionalLight position={[-3, 2.2, 2]} intensity={2.2} color="#ffb27a" />
          <directionalLight position={[3, 1.5, -1.5]} intensity={2.2} color="#a78bff" />
          <directionalLight position={[0.5, 2, 3]} intensity={0.7} color="#fff4e8" />
          <Suspense fallback={null}>
            <Orbit />
            <SuitFigure
              selected={sensor}
              onSelect={select}
              glow={(id) => (s?.sensors[id].status ? statusRGB(s.sensors[id].status!) : IVORY)}
              traceColor={IVORY}
              view={{ pos: [0, 1.02, 4.6], target: [0.05, 0.92, 0] }}
              focus={{ distance: 2.5, shiftX: -0.62 }}
              spin={0.1}
              marker={(id) => (
                <span className="sc-pin" data-status={s?.sensors[id].status ?? 'none'}>
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

      {/* four numbers, an index line at the foot; hidden while one is open */}
      <AnimatePresence>
        {view === 'suit' && !sensor && s && (
          <motion.ol className="sc-index" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: 0.3, ease: EASE }}>
            {SENSORS.map((id, i) => {
              const p = s.sensors[id].primary;
              return (
                <li key={id}>
                  <button type="button" data-status={s.sensors[id].status ?? 'none'} onClick={() => select(id)}>
                    <span className="sc-i">{idx(i)}</span>
                    <span className="sc-n">
                      <StatusMark status={s.sensors[id].status} size={11} />
                      {SENSOR_NAME[id]}
                    </span>
                    <span className="sc-v">
                      {p ? fmt(p.value, p.digits) : 'No feed'}
                      <small>{p && p.value != null ? p.unit : ''}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </motion.ol>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {view === 'suit' && sensor && s && (
          <motion.aside
            key={sensor}
            className="sc-col"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <Reading s={s} id={sensor} onClose={close} />
          </motion.aside>
        )}
      </AnimatePresence>

      {view === 'systems' && s && (
        <motion.div className="sc-systems" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, ease: EASE }}>
          <FlowLine s={s} />
        </motion.div>
      )}

      <Credits s={s} className="sc-credits" />
    </div>
  );
}
