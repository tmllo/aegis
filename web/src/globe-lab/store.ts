// Globe lab shared state: simulation clock, layer toggles, camera readout and fly-to requests.
import { create } from 'zustand';
import { useFrame } from '@react-three/fiber';

export type LayerKey = 'atmosphere' | 'clouds' | 'stars' | 'milkyway' | 'grid' | 'night';
export interface Readout { lat: number; lon: number; altKm: number; heading: number; tilt: number }
export interface FlyTarget { lat: number; lon: number; altKm?: number; heading?: number; tilt?: number; follow?: 'iss' }

interface LabState {
  date: Date;
  rate: number;
  paused: boolean;
  setDate: (d: Date) => void;
  setRate: (r: number) => void;
  togglePause: () => void;
  layers: Record<LayerKey, boolean>;
  toggleLayer: (k: LayerKey) => void;
  readout: Readout;
  setReadout: (r: Readout) => void;
  flyTo: (FlyTarget & { id: number }) | null;
  requestFly: (t: FlyTarget) => void;
  /** Bumped by the HUD: north up (heading 0) or tilt 0. */
  orient: { kind: 'north' | 'top'; id: number } | null;
  requestOrient: (kind: 'north' | 'top') => void;
}

export const useLab = create<LabState>((set) => ({
  date: new Date(),
  rate: 1,
  paused: false,
  setDate: (date) => set({ date }),
  setRate: (rate) => set({ rate, paused: false }),
  togglePause: () => set((s) => ({ paused: !s.paused })),
  layers: { atmosphere: true, clouds: true, stars: true, milkyway: true, grid: false, night: true },
  toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
  readout: { lat: 0, lon: 0, altKm: 0, heading: 0, tilt: 0 },
  setReadout: (readout) => set({ readout }),
  flyTo: null,
  requestFly: (t) => set((s) => ({ flyTo: { ...t, id: (s.flyTo?.id ?? 0) + 1 } })),
  orient: null,
  requestOrient: (kind) => set((s) => ({ orient: { kind, id: (s.orient?.id ?? 0) + 1 } })),
}));

/** Advances the simulation clock. Call once inside the Canvas. Store updates are throttled to 20 Hz
 *  of real time so React subscribers do not re-render every frame; shaders read `labTime` directly. */
export const labTime = { ms: Date.now() };
export function useLabClock() {
  const acc = { t: 0 };
  useFrame((_, dt) => {
    const s = useLab.getState();
    if (s.paused) return;
    labTime.ms = Math.max(labTime.ms, 0) + Math.min(dt, 0.1) * 1000 * s.rate;
    acc.t += dt;
    if (acc.t > 0.05) {
      acc.t = 0;
      s.setDate(new Date(labTime.ms));
    }
  });
}

// keep labTime in sync when something sets the date directly (Now button, URL ?t=)
useLab.subscribe((s, prev) => {
  if (s.date !== prev.date && Math.abs(s.date.getTime() - labTime.ms) > 1000) labTime.ms = s.date.getTime();
});
