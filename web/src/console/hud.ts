// State the HUD pages share with the one persistent 3D scene behind them.
import { create } from 'zustand';
import type { TargetId } from '../components/body3d/targets';
import type { Status } from '../data/types';
import type { Tip } from './Globe';

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
  bodyTips: [],
  setBodyTips: (bodyTips) => set({ bodyTips }),
  setYaw: (yaw) => set({ yaw }),
  setFocus: (focus) => set({ focus }),
  setTint: (tint) => set({ tint }),
  setBodyReady: () => set({ bodyReady: true }),
}));
