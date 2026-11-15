// Caution & warning class raised by the radiation alarm.
//
// Safety rule (docs/ARCHITECTURE.md, section 3): a model forecast can raise Warning, never
// Emergency. Emergency needs a measured event: the storm particles have arrived.
// Screens take the class from here; they never write 'emergency' themselves.

/** Same phases as `AlarmPhase` in src/station/state.ts. */
export type AlarmPhase = 'off' | 'warning' | 'sheltered' | 'arrived';

export type AlarmClass = 'warning' | 'emergency';

/** Phases driven by the storm model's forecast (p_storm at or above the warning cut). */
export const FORECAST_PHASES: readonly AlarmPhase[] = ['warning', 'sheltered'];

/** Phases driven by a measurement (GOES >10 MeV storm onset). */
export const MEASURED_PHASES: readonly AlarmPhase[] = ['arrived'];

export function alarmClass(phase: AlarmPhase): AlarmClass | null {
  if (MEASURED_PHASES.includes(phase)) return 'emergency';
  if (FORECAST_PHASES.includes(phase)) return 'warning';
  return null;
}

/** True while the crew should be in (or moving to) the storm shelter. */
export const alarmActive = (phase: AlarmPhase): boolean => alarmClass(phase) !== null;
