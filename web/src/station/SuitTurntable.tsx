// The suit, photoreal: Cycles frames of the Apollo 11 A7L scan (Smithsonian 3D, CC0; patches and flag
// painted out) rendered in Blender (blender-assets/_scripts/suit-render/turntable_space.py), shown as a
// turntable that shares one angle with the 3D body views (spin.ts).
// Smooth and jank-free: the compressed frames are fetched once; frames near the current angle are decoded
// off the main thread (createImageBitmap) and kept in a small window; a canvas draws the two frames around
// the angle and cross-fades them, so the turn is continuous. Drag to turn; it turns on its own when idle.
import { useEffect, useRef, useState } from 'react';
import { spin, SPIN_SPEED } from './spin';
import { loadSuitFrames } from '../data/suitFrames';
import './suit.css';

export const SUIT_FRAMES = 48;
const N = SUIT_FRAMES;
const REDUCE = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const WINDOW = 6; // decoded frames kept on each side of the current one
const posOf = (a: number) => ((((-a / (2 * Math.PI)) * N) % N) + N) % N;
const wrap = (i: number) => ((i % N) + N) % N;

export default function SuitTurntable() {
  const [ready, setReady] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const blobs = useRef<(Blob | null)[]>(Array(N).fill(null));
  const bitmaps = useRef(new Map<number, ImageBitmap>());
  const pending = useRef(new Set<number>());
  const idle = useRef(true);
  const drag = useRef<{ x: number; a: number } | null>(null);
  const resume = useRef(0);
  const lastDrawn = useRef('');

  // fetch every compressed frame once (about 2 MB in total)
  useEffect(() => {
    let alive = true;
    loadSuitFrames(N).then((bs) => {
      blobs.current = bs;
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
      bitmaps.current.forEach((b) => b.close());
      bitmaps.current.clear();
    };
  }, []);

  /** keep the frames around index c decoded; free the rest */
  const keepAround = (c: number) => {
    const want = new Set<number>();
    for (let d = -WINDOW; d <= WINDOW; d++) want.add(wrap(c + d));
    for (const [k, b] of bitmaps.current) if (!want.has(k)) (b.close(), bitmaps.current.delete(k));
    for (const k of want) {
      if (bitmaps.current.has(k) || pending.current.has(k) || !blobs.current[k]) continue;
      pending.current.add(k);
      createImageBitmap(blobs.current[k]!)
        .then((bm) => {
          pending.current.delete(k);
          bitmaps.current.set(k, bm);
          lastDrawn.current = ''; // a frame arrived: redraw
        })
        .catch(() => pending.current.delete(k));
    }
  };

  const draw = () => {
    const cv = canvas.current;
    if (!cv) return;
    const p = posOf(spin.a);
    const i0 = Math.floor(p) % N;
    const i1 = wrap(i0 + 1);
    const f = p - Math.floor(p);
    keepAround(i0);
    const key = `${i0}:${f.toFixed(3)}:${cv.width}`;
    if (key === lastDrawn.current) return;
    const b0 = bitmaps.current.get(i0);
    const b1 = bitmaps.current.get(i1);
    if (!b0) return; // keep the last picture until this frame is decoded
    // size the canvas to its box at device resolution
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(cv.clientWidth * dpr);
    const h = Math.round(cv.clientHeight * dpr);
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
    }
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const s = Math.min(w / b0.width, h / b0.height);
    const dw = b0.width * s;
    const dh = b0.height * s;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.drawImage(b0, dx, dy, dw, dh);
    if (b1 && f > 0.003) {
      ctx.globalAlpha = f;
      ctx.drawImage(b1, dx, dy, dw, dh);
      ctx.globalAlpha = 1;
    }
    lastDrawn.current = key;
  };

  useEffect(() => {
    if (!ready) return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      if (idle.current && !REDUCE) spin.a += dt * SPIN_SPEED;
      draw();
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
        if (d) spin.a = d.a - (e.clientX - d.x) * 0.012;
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
        later();
      }}
    >
      <canvas ref={canvas} className="suit-tt-canvas" />
      {!ready && <p className="suit-tt-wait">Loading suit</p>}
    </div>
  );
}
