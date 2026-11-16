// The suit, photoreal: 48 Cycles frames of the Apollo 11 A7L scan (Smithsonian 3D, CC0; patches and flag
// painted out) rendered in Blender (blender-assets/_scripts/suit-render/turntable.py), shown as a
// turntable. Drag to turn it; it turns slowly on its own when nobody touches it; arrow keys step it.
// No WebGL: plain images, so it looks the same on every machine and works offline.
import { useEffect, useRef, useState } from 'react';
import { spin, SPIN_SPEED } from './spin';
import './suit.css';

const N = 48;
const SRC = (i: number) => `${import.meta.env.BASE_URL}suit/f${String(i).padStart(3, '0')}.webp`;
const REDUCE = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** frame for the shared angle: frame 0 faces the viewer; the camera circling one way = the suit turning
 *  the other way in the render */
/** decoded frames, kept for the life of the page */
const KEEP: HTMLImageElement[] = [];
const frameOf = (a: number) => ((Math.round((-a / (2 * Math.PI)) * N) % N) + N) % N;

export default function SuitTurntable() {
  const [i, setI] = useState(() => frameOf(spin.a));
  const [loaded, setLoaded] = useState(0);
  const idle = useRef(true);
  const drag = useRef<{ x: number; a: number } | null>(null);
  const resume = useRef(0);
  const shown = useRef(-1);

  // preload every frame once, so turning never flashes
  // decode every frame up front and keep the decoded images alive, so turning never stalls on a decode
  useEffect(() => {
    let alive = true;
    for (let k = 0; k < N; k++) {
      const im = new Image();
      im.decoding = 'async';
      im.src = SRC(k);
      KEEP[k] = im;
      im.decode()
        .catch(() => undefined)
        .then(() => alive && setLoaded((n) => n + 1));
    }
    return () => void (alive = false);
  }, []);

  const ready = loaded >= N;
  useEffect(() => {
    if (!ready || REDUCE) return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      if (!idle.current) return;
      spin.a += dt * SPIN_SPEED;
      const f = frameOf(spin.a);
      if (f !== shown.current) setI((shown.current = f)); // re-render only when the frame changes
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
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
        drag.current = { x: e.clientX, a: spin.a };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        spin.a = d.a - (e.clientX - d.x) * 0.012;
        setI(frameOf(spin.a));
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
        spin.a += ((e.key === 'ArrowLeft' ? -1 : 1) * 2 * Math.PI) / N;
        setI(frameOf(spin.a));
        later();
      }}
    >
      <img src={SRC(i)} alt="" draggable={false} />
      {!ready && <p className="suit-tt-wait">Loading suit · {Math.round((loaded / N) * 100)}%</p>}
    </div>
  );
}
