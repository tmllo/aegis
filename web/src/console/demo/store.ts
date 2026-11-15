// Guided demo state: on/off, the current beat and whether it is auto-playing.
import { create } from 'zustand';

interface DemoState {
  on: boolean;
  i: number;
  playing: boolean;
  start: () => void;
  exit: () => void;
  go: (i: number) => void;
  setPlaying: (p: boolean) => void;
}

export const useDemo = create<DemoState>((set) => ({
  on: false,
  i: 0,
  playing: false,
  start: () => set({ on: true, i: 0, playing: true }),
  exit: () => set({ on: false, playing: false }),
  go: (i) => set({ i }),
  setPlaying: (playing) => set({ playing }),
}));
