// State the HUD pages share with the one persistent 3D scene behind them.
import { create } from 'zustand';
import type { TargetId } from '../components/body3d/targets';
import type { Status } from '../data/types';
import type { Tip } from './Globe';

export type Layer = 'skin' | 'muscle' | 'organs' | 'skeleton';

interface Hud {
  /** Turn of the hero (radians), set by the rotate dial. */
  yaw: number;
  /** Organ the camera is on (Vitals level 2 and 3). */
  focus: TargetId | null;
  /** Organ -> status tint for the body. */
  tint: Partial<Record<TargetId, Status>>;
  /** Tooltips pinned to the body (body-local positions). */
  bodyTips: Tip[];
  setBodyTips: (t: Tip[]) => void;
  /** Zoom factor from the +/- buttons and keys (1 = the view's own distance). */
  zoom: number;
  setZoom: (z: number) => void;
  /** Body layers shown (peel). */
  layers: Record<Layer, boolean>;
  toggleLayer: (l: Layer) => void;
  /** Structure under the pointer on the body, with screen position. */
  hover: { node: string; x: number; y: number } | null;
  setHover: (h: Hud['hover']) => void;
  /** Bumped by reset (0 key, N on the dial): the camera returns to the view. */
  reset: number;
  doReset: () => void;
  /** Body model ready. */
  bodyReady: boolean;
  setYaw: (y: number) => void;
  setFocus: (t: TargetId | null) => void;
  setTint: (t: Partial<Record<TargetId, Status>>) => void;
  setBodyReady: () => void;
}

export const useHud = create<Hud>((set) => ({
  yaw: 0,
  focus: null,
  tint: {},
  bodyReady: false,
  zoom: 1,
  setZoom: (zoom) => set({ zoom: Math.max(0.5, Math.min(2.2, zoom)) }),
  layers: { skin: true, muscle: true, organs: true, skeleton: true },
  toggleLayer: (l) => set((s) => ({ layers: { ...s.layers, [l]: !s.layers[l] } })),
  hover: null,
  setHover: (hover) => set({ hover }),
  reset: 0,
  doReset: () => set((s) => ({ reset: s.reset + 1, yaw: 0, zoom: 1 })),
  bodyTips: [],
  setBodyTips: (bodyTips) => set({ bodyTips }),
  setYaw: (yaw) => set({ yaw }),
  setFocus: (focus) => set({ focus }),
  setTint: (tint) => set({ tint }),
  setBodyReady: () => set((s) => (s.bodyReady ? s : { bodyReady: true })),
}));
