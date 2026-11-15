// Test helper: reads the real data files from public/data (Node only).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { CrewData, RealCrew, StormForecast } from '../data/types';

const read = <T,>(name: string): T =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../public/data/${name}`, import.meta.url)), 'utf8')) as T;

export const crewData = (): CrewData => read<CrewData>('crew_data.json');
export const stormForecast = (): StormForecast => read<StormForecast>('storm_forecast.json');
export const realCrew = (): RealCrew => read<RealCrew>('real_crew.json');
