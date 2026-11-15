// Status by shape + colour + word: circle green, triangle amber, square red.
import { animate, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import type { Status } from '../data/types';

export const STATUS_WORD: Record<Status, string> = { green: 'Nominal', amber: 'Caution', red: 'Alert' };

/** The status shape. A change of status scales the new shape in. */
export function Shape({ status, size = 16 }: { status: Status; size?: number }) {
  const still = useReducedMotion();
  return (
    <motion.svg
      key={status}
      className={`fr-shape fr-shape-${status}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      initial={still ? false : { scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
    >
      {status === 'green' && <circle cx="8" cy="8" r="5" />}
      {status === 'amber' && <path d="M8 1.5 15 14.5H1Z" />}
      {status === 'red' && <rect x="1.5" y="1.5" width="13" height="13" />}
    </motion.svg>
  );
}

/** Shape and word together. */
export function StatusTag({ status, size = 16, className = '' }: { status: Status; size?: number; className?: string }) {
  return (
    <span className={`fx-status fr-text-${status} ${className}`}>
      <Shape status={status} size={size} />
      {STATUS_WORD[status]}
    </span>
  );
}

/** A number that tweens to its new value (400 ms). Formatting is the caller's. */
export function Tween({ value, format }: { value: number; format: (v: number) => string }) {
  const el = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const still = useReducedMotion();
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    if (still || shown.current === value) {
      shown.current = value;
      node.textContent = format(value);
      return;
    }
    const c = animate(shown.current, value, {
      duration: 0.4,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        shown.current = v;
        node.textContent = format(v);
      },
    });
    return () => c.stop();
  }, [value, format, still]);
  return <span ref={el}>{format(shown.current)}</span>;
}
