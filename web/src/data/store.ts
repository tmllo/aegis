import { useEffect } from 'react';
import { create } from 'zustand';
import { loadMissionData } from './load';
import type { CrewMember, EnvironmentId, MissionData, Region } from './types';

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export interface MissionStore {
  data: MissionData | null;
  loadState: LoadState;
  error: string | null;

  selectedCrewId: string | null;
  selectedRegion: Region | null;
  /** Starts as the file's mission.environment; the environment switch changes it. */
  environment: EnvironmentId | null;

  load: () => Promise<void>;
  setSelectedCrewId: (id: string | null) => void;
  setSelectedRegion: (region: Region | null) => void;
  setEnvironment: (env: EnvironmentId) => void;
}

export const useMissionStore = create<MissionStore>((set, get) => ({
  data: null,
  loadState: 'idle',
  error: null,
  selectedCrewId: null,
  selectedRegion: null,
  environment: null,

  load: async () => {
    if (get().loadState === 'loading' || get().loadState === 'ready') return;
    set({ loadState: 'loading', error: null });
    try {
      const data = await loadMissionData();
      set((s) => ({
        data,
        loadState: 'ready',
        environment: s.environment ?? data.crew.mission.environment,
        selectedCrewId: s.selectedCrewId ?? data.crew.crew[0]?.id ?? null,
      }));
    } catch (e) {
      set({ loadState: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },
  setSelectedCrewId: (id) => set({ selectedCrewId: id, selectedRegion: null }),
  setSelectedRegion: (region) => set({ selectedRegion: region }),
  setEnvironment: (environment) => set({ environment }),
}));

/** Loads the data files on first use and returns them with the load state. */
export function useMissionData(): Pick<MissionStore, 'data' | 'loadState' | 'error'> {
  const data = useMissionStore((s) => s.data);
  const loadState = useMissionStore((s) => s.loadState);
  const error = useMissionStore((s) => s.error);
  const load = useMissionStore((s) => s.load);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, loadState, error };
}

/** The crew member picked in the store, or null before data is loaded. */
export function useSelectedCrew(): CrewMember | null {
  return useMissionStore((s) => s.data?.crew.crew.find((c) => c.id === s.selectedCrewId) ?? null);
}
