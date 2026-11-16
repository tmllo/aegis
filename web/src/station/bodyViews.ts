// Views per body system (Emile, 16 Nov): with a system open, the view switch offers views made for it, each
// already framed on that part. Kept free of three.js so the page can import it without the 3D chunk.
import type { SystemId } from './state';
import type { BodyView } from './BodyCanvas';

export type Cam = { pos: [number, number, number]; target: [number, number, number] };
export type SystemView = { id: string; name: string; layer: BodyView; cam: Cam };

/** Camera in front of a point, at a distance, looking slightly down. */
const at = (t: [number, number, number], dist: number, dy = 0.03): Cam => ({ pos: [t[0], t[1] + dy, t[2] + dist], target: t });

const HEART: [number, number, number] = [0.02, 1.29, 0.02];
const HEAD: [number, number, number] = [0, 1.6, 0];
const GUT: [number, number, number] = [0, 1.14, 0];
const WHOLE: Cam = { pos: [0, 0.96, 4.3], target: [0, 0.92, 0] };

export const SYSTEM_VIEWS: Record<SystemId, SystemView[]> = {
  heart: [
    { id: 'vessels', name: 'Vessels', layer: 'vessels', cam: at(HEART, 1.5) },
    { id: 'heart', name: 'Heart', layer: 'vessels', cam: at(HEART, 0.95) },
    { id: 'close', name: 'Close-up', layer: 'vessels', cam: at(HEART, 0.6, 0.01) },
  ],
  brain: [
    { id: 'organs', name: 'Organs', layer: 'organs', cam: at(HEAD, 1.3, 0.04) },
    { id: 'brain', name: 'Brain', layer: 'organs', cam: at(HEAD, 0.85, 0.02) },
    { id: 'close', name: 'Close-up', layer: 'vessels', cam: at(HEAD, 0.55, 0.01) },
  ],
  blood: [
    { id: 'organs', name: 'Organs', layer: 'organs', cam: at(GUT, 1.75, 0.04) },
    { id: 'vessels', name: 'Vessels', layer: 'vessels', cam: at(GUT, 1.75, 0.04) },
    { id: 'close', name: 'Close-up', layer: 'organs', cam: at(GUT, 0.9, 0.02) },
  ],
  bones: [
    { id: 'skeleton', name: 'Skeleton', layer: 'skeleton', cam: at([0, 0.9, 0], 3.1, 0.05) },
    { id: 'spine', name: 'Spine & legs', layer: 'skeleton', cam: at([0, 0.6, 0], 2.1, 0.05) },
    { id: 'close', name: 'Close-up', layer: 'skeleton', cam: at([0.1, 0.5, 0.02], 0.9, 0.02) },
  ],
  whole_body: [
    { id: 'skeleton', name: 'Skeleton', layer: 'skeleton', cam: WHOLE },
    { id: 'vessels', name: 'Vessels', layer: 'vessels', cam: WHOLE },
    { id: 'organs', name: 'Organs', layer: 'organs', cam: WHOLE },
  ],
};
