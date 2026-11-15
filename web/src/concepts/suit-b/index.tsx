// Concept B, "Dragon": one navy instrument display after the Crew Dragon vehicle-status
// screen. Ana stands in the centre on a lit floor ring with her four vitals as arc gauges
// round her; a slim bottom bar switches views. Colour only for status.
import { Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { AnimatePresence, motion } from 'framer-motion';
import * as THREE from 'three';
import type { ConceptMeta } from '../../registry';
import { SuitFigure } from '../suit-shared/SuitFigure';
import { FlowLine } from '../suit-shared/FlowLine';
import { Reading } from '../suit-shared/Reading';
import { ArcGauge, Credits, StatusMark, statusRGB, statusWord } from '../suit-shared/bits';
import { SENSORS, SENSOR_NAME, useSuitData } from '../suit-shared/suitData';
import { useSuitView } from '../suit-shared/useSuitView';
import './suit-b.css';

export const meta: ConceptMeta = {
  title: 'Suit: Dragon',
  direction: 'Crew Dragon instrument display: Ana centred, vitals as arc gauges, slim bottom bar',
  surface: 'Crew Console',
};

const NEUTRAL = '#cfdaf0';
const EASE = [0.16, 1, 0.3, 1] as const;

function FloorRing() {
  const tex = useRef<THREE.CanvasTexture | null>(null);
  if (!tex.current) {
    const s = 256;
    const cv = document.createElement('canvas');
    cv.width = cv.height = s;
    const g = cv.getContext('2d')!;
    const grad = g.createRadialGradient(s / 2, s / 2, s * 0.05, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(190,210,255,0.4)');
    grad.addColorStop(0.6, 'rgba(160,185,255,0.08)');
    grad.addColorStop(1, 'rgba(160,185,255,0)');
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
      <mesh>
        <ringGeometry args={[0.6, 0.608, 128]} />
        <meshBasicMaterial color={NEUTRAL} transparent opacity={0.6} toneMapped={false} />
      </mesh>
    </group>
  );
}

export default function SuitDragon() {
  const s = useSuitData();
  const { sensor, view, select, close, setView } = useSuitView();

  return (
    <div className="sb-root">
      <main className="sb-display">
        {s && (
          <div className="sb-overall" data-status={s.overall}>
            <StatusMark status={s.overall} size={26} />
            <b>{statusWord(s.overall)}</b>
            <span>{s.crew.name}</span>
          </div>
        )}

        <div className="sb-canvas" data-hidden={view === 'systems' || undefined}>
          <Canvas camera={{ position: [0, 0.95, 4.4], fov: 30 }} dpr={[1, 2]}>
            <fog attach="fog" args={['#0b1430', 5, 11]} />
            <hemisphereLight args={['#dfe8ff', '#0b1020', 0.55]} />
            <directionalLight position={[2, 3, 3]} intensity={1.8} color="#ffffff" />
            <directionalLight position={[-3, 1.5, -2]} intensity={2.2} color="#9db8ff" />
            <Suspense fallback={null}>
              <FloorRing />
              <SuitFigure
                selected={sensor}
                onSelect={select}
                glow={(id) => (s?.sensors[id].status ? statusRGB(s.sensors[id].status!) : NEUTRAL)}
                traceColor={NEUTRAL}
                view={{ pos: [0, 0.98, 4.1], target: [0, 0.86, 0] }}
                focus={{ distance: 1.9, shiftX: 0.4 }}
                spin={0.14}
                marker={() => <span className="sb-pin" />}
              />
            </Suspense>
          </Canvas>
        </div>

        {/* vitals round her: four numbers; they step aside when one is open */}
        <AnimatePresence>
          {view === 'suit' && !sensor && s && (
            <motion.div className="sb-gauges" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: EASE }}>
              {SENSORS.map((id) => (
                <button key={id} type="button" className={`sb-gauge sb-gauge-${id}`} data-status={s.sensors[id].status ?? 'none'} onClick={() => select(id)}>
                  <ArcGauge r={s.sensors[id].primary} size={196} />
                  <span className="sb-gauge-name">
                    <StatusMark status={s.sensors[id].status} size={12} />
                    {SENSOR_NAME[id]}
                  </span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {view === 'suit' && sensor && s && (
            <motion.aside
              key={sensor}
              className="sb-panel"
              initial={{ opacity: 0, x: 32 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.28, ease: EASE }}
            >
              <Reading s={s} id={sensor} onClose={close} />
            </motion.aside>
          )}
        </AnimatePresence>

        {view === 'systems' && s && (
          <motion.section className="sb-systems" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: EASE }}>
            <FlowLine s={s} />
          </motion.section>
        )}

        {/* slim bottom bar */}
        <nav className="sb-bar" aria-label="View">
          {(['suit', 'systems'] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {v === 'suit' ? 'Suit' : 'Systems'}
            </button>
          ))}
        </nav>
      </main>

      <Credits s={s} className="sb-credits" />
    </div>
  );
}
