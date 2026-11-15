// Guided demo state: on/off, the current beat and whether it is auto-playing.
import { create } from 'zustand';

interface DemoState {
  on: boolean;
  i: number;
  playing: boolean;
  /** Recording run (?record=1): no controls, no pause on input; flags for a screen recorder. */
  record: boolean;
  start: (record?: boolean) => void;
  exit: () => void;
  go: (i: number) => void;
  setPlaying: (p: boolean) => void;
}

export const useDemo = create<DemoState>((set) => ({
  on: false,
  i: 0,
  playing: false,
  record: false,
  start: (record = false) => set({ on: true, i: 0, playing: true, record }),
  exit: () => set({ on: false, playing: false }),
  go: (i) => set({ i }),
  setPlaying: (playing) => set({ playing }),
}));
