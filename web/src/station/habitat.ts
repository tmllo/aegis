// Habitat data, loaded once in the station Shell (useHabitat) and handed to the screens via the Outlet context.
import { useOutletContext } from 'react-router-dom';
import type { HabitatData } from '../habitat';

export type HabitatCtx = { data: HabitatData | null; error: string | null };
export const useHabitatData = () => useOutletContext<HabitatCtx | undefined>() ?? { data: null, error: null };
