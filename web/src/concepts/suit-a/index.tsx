// Concept A, "Cupola": cinematic realism. Ana floats over the Earth as in the Cupola
// renders; a few quiet glass pieces sit over the scene. Colour only for status.
import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { AnimatePresence, motion } from 'framer-motion';
import type { ConceptMeta } from '../../registry';
import { SuitFigure } from '../suit-shared/SuitFigure';
import { Earth } from '../suit-shared/Earth';
import { FlowLine } from '../suit-shared/FlowLine';
import { Reading } from '../suit-shared/Reading';
import { Credits, StatusMark, statusRGB, statusWord } from '../suit-shared/bits';
import { fmt, SENSORS, SENSOR_NAME, useSuitData } from '../suit-shared/suitData';
import { useSuitView } from '../suit-shared/useSuitView';
import './suit-a.css';

export const meta: ConceptMeta = {
  title: 'Suit: Cupola',
  direction: 'Cinematic realism: Ana over the Earth, quiet glass, colour only for status',
  surface: 'Crew Console',
};

const EASE = [0.16, 1, 0.3, 1] as const;
const NEUTRAL = '#dfe8f4';

export default function SuitCupola() {
  const s = useSuitData();
  const { sensor, view, select, close, setView } = useSuitView();

  return (
    <div className="sa-root">
      <div className="sa-stage" data-dim={view === 'systems' || undefined}>
        <Canvas camera={{ position: [0, 1.0, 4.7], fov: 30 }} dpr={[1, 2]}>
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
              glow={(id) => (s?.sensors[id].status ? statusRGB(s.sensors[id].status!) : NEUTRAL)}
              traceColor={NEUTRAL}
              view={{ pos: [0, 1.0, 4.7], target: [0.05, 0.95, 0] }}
              focus={{ distance: 1.9, shiftX: 0.42 }}
              marker={(id) => (
                <span className="sa-pin" data-status={s?.sensors[id].status ?? 'none'}>
                  <span className="sa-pin-ring" />
                  <span className="sa-pin-label suit-label">{SENSOR_NAME[id]}</span>
                </span>
              )}
            />
          </Suspense>
        </Canvas>
      </div>

      <header className="sa-top">
        {s && (
          <div className="sa-status" data-status={s.overall}>
            <StatusMark status={s.overall} size={26} />
            <span className="sa-status-word">{statusWord(s.overall)}</span>
            <span className="sa-status-who">{s.crew.name}</span>
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

      {/* four numbers, one per sensor; hidden while one is open */}
      <AnimatePresence>
        {view === 'suit' && !sensor && s && (
          <motion.nav
            className="sa-dock"
            aria-label="Sensors"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            {SENSORS.map((id) => {
              const p = s.sensors[id].primary;
              return (
                <button key={id} type="button" className="sa-dock-btn" data-status={s.sensors[id].status ?? 'none'} onClick={() => select(id)}>
                  <span className="sa-dock-head">
                    <StatusMark status={s.sensors[id].status} />
                    {SENSOR_NAME[id]}
                  </span>
                  <span className="sa-dock-val">
                    {p ? fmt(p.value, p.digits) : 'No feed'}
                    <small>{p && p.value != null ? p.unit : ''}</small>
                  </span>
                </button>
              );
            })}
          </motion.nav>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {view === 'suit' && sensor && s && (
          <motion.aside
            key={sensor}
            className="sa-panel"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.32, ease: EASE }}
          >
            <Reading s={s} id={sensor} onClose={close} />
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
            <FlowLine s={s} />
          </motion.section>
        )}
      </AnimatePresence>

      <Credits s={s} className="sa-credits" />
    </div>
  );
}
