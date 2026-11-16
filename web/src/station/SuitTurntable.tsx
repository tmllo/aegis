// The suit, photoreal: 48 Cycles frames of the Apollo 11 A7L scan (Smithsonian 3D, CC0; patches and flag
// painted out) rendered in Blender (blender-assets/_scripts/suit-render/turntable.py), shown as a
// turntable. Drag to turn it; it turns slowly on its own when nobody touches it; arrow keys step it.
// No WebGL: plain images, so it looks the same on every machine and works offline.
import { useEffect, useRef, useState } from 'react';
import './suit.css';

const N = 48;
const SRC = (i: number) => `${import.meta.env.BASE_URL}suit/f${String(i).padStart(3, '0')}.webp`;
const REDUCE = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const FRONT = 0; // frame 0 faces the viewer
const STEP_MS = 140; // one 7.5 degree step: a full turn in about 7 s

export default function SuitTurntable() {
  const [i, setI] = useState(FRONT);
  const [loaded, setLoaded] = useState(0);
  const idle = useRef(true);
  const drag = useRef<{ x: number; i: number } | null>(null);
  const resume = useRef(0);

  // preload every frame once, so turning never flashes
  useEffect(() => {
    let alive = true;
    for (let k = 0; k < N; k++) {
      const im = new Image();
      im.onload = () => alive && setLoaded((n) => n + 1);
      im.src = SRC(k);
    }
    return () => void (alive = false);
  }, []);

  const ready = loaded >= N;
  useEffect(() => {
    if (!ready || REDUCE) return;
    const id = window.setInterval(() => idle.current && setI((v) => (v + 1) % N), STEP_MS);
    return () => window.clearInterval(id);
  }, [ready]);

  const pause = () => {
    idle.current = false;
    window.clearTimeout(resume.current);
  };
  const later = () => {
    window.clearTimeout(resume.current);
    resume.current = window.setTimeout(() => (idle.current = true), 4000);
  };
  useEffect(() => () => window.clearTimeout(resume.current), []);

  return (
    <div
      className={`suit-tt${ready ? ' is-ready' : ''}`}
      role="img"
      aria-label="Apollo 11 A7L spacesuit, turn it by dragging or with the arrow keys"
      tabIndex={0}
      onPointerDown={(e) => {
        pause();
        drag.current = { x: e.clientX, i };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const steps = Math.round((e.clientX - d.x) / 12);
        setI((((d.i - steps) % N) + N) % N);
      }}
      onPointerUp={() => {
        drag.current = null;
        later();
      }}
      onPointerCancel={() => {
        drag.current = null;
        later();
      }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        pause();
        setI((v) => (v + (e.key === 'ArrowLeft' ? 1 : N - 1)) % N);
        later();
      }}
    >
      <img src={SRC(i)} alt="" draggable={false} />
      {!ready && <p className="suit-tt-wait">Loading suit · {Math.round((loaded / N) * 100)}%</p>}
    </div>
  );
}
