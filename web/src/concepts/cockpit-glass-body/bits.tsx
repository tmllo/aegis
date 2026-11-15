// Small shared pieces: status shapes, line icons, hooks.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { Status } from '../../data/types';

/** Status is always shape plus colour: dot, triangle, square. */
export function Shape({ status, size = 14, className = '' }: { status: Status; size?: number; className?: string }) {
  return (
    <svg className={`cg-shape ${className}`} data-status={status} width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      {status === 'green' && <circle cx="8" cy="8" r="6" />}
      {status === 'amber' && <path d="M8 1.5 15 14.5H1Z" />}
      {status === 'red' && <rect x="1.5" y="1.5" width="13" height="13" />}
    </svg>
  );
}

const PATHS = {
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  level: 'M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  source: 'M4 6h5v5H4zM15 13h5v5h-5zM9 8.5h3.5v7H15',
  body: 'M12 3.2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM6 9.5h12M12 9.5v5M12 14.5l-3 6.3M12 14.5l3 6.3',
  redo: 'M19 12a7 7 0 1 1-2.1-5M19 4v4h-4',
} as const;

export function Icon({ name, size = 24 }: { name: keyof typeof PATHS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}

export function useSize(ref: RefObject<HTMLElement>): { w: number; h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** Numeral roll: eases from the previous value to the new one over 350 ms. */
export function useRoll(value: number | null, reduced: boolean): number | null {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (value == null || from.current == null || reduced) {
      from.current = value;
      setShown(value);
      return;
    }
    const a = from.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 350);
      const v = a + (value - a) * (1 - Math.pow(1 - p, 3));
      from.current = v;
      setShown(p >= 1 ? value : v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);
  return shown;
}
