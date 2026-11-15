import type { CrewData, MissionData, RealCrew, StormForecast } from './types';

const base = (): string => import.meta.env.BASE_URL ?? '/';

async function getJson<T>(file: string): Promise<T> {
  const res = await fetch(`${base()}data/${file}`);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

let cache: Promise<MissionData> | null = null;

/** Fetches the three data files once per page load. Later calls share the same promise. */
export function loadMissionData(): Promise<MissionData> {
  if (!cache) {
    cache = Promise.all([
      getJson<CrewData>('crew_data.json'),
      getJson<StormForecast>('storm_forecast.json'),
      getJson<RealCrew>('real_crew.json').catch(() => null),
    ]).then(([crew, storm, real]) => ({ crew, storm, real }));
    cache.catch(() => {
      cache = null; // allow a retry after a failed load
    });
  }
  return cache;
}
