// A label that scrambles briefly (250 ms) when hovered or focused, then settles.
import { useRef, useState } from 'react';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';

export function Scramble({ text }: { text: string }) {
  const [shown, setShown] = useState(text);
  const raf = useRef(0);
  const run = () => {
    if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    cancelAnimationFrame(raf.current);
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 250);
      const fixed = Math.floor(k * text.length);
      setShown(text.slice(0, fixed) + [...text.slice(fixed)].map((c) => (c === ' ' ? ' ' : CHARS[(Math.random() * CHARS.length) | 0])).join(''));
      if (k < 1) raf.current = requestAnimationFrame(step);
      else setShown(text);
    };
    raf.current = requestAnimationFrame(step);
  };
  return (
    <span onPointerEnter={run} onFocus={run} aria-label={text}>
      <span aria-hidden>{shown}</span>
    </span>
  );
}
