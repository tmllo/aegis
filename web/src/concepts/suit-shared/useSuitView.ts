// View state kept in the URL (?view=systems&sensor=heart) so every state can be linked and screenshotted.
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SENSORS, type SensorId } from './suitData';

export type SuitView = 'suit' | 'systems';

export function useSuitView() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('sensor');
  const sensor = SENSORS.includes(raw as SensorId) ? (raw as SensorId) : null;
  const view: SuitView = params.get('view') === 'systems' ? 'systems' : 'suit';

  const update = useCallback(
    (next: { sensor?: SensorId | null; view?: SuitView }) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next.sensor !== undefined) {
            if (next.sensor) p.set('sensor', next.sensor);
            else p.delete('sensor');
          }
          if (next.view !== undefined) {
            if (next.view === 'systems') p.set('view', 'systems');
            else p.delete('view');
          }
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return {
    sensor,
    view,
    /** Tap a sensor: open it (tap again to close). Always returns to the suit view. */
    select: (id: SensorId) => update({ sensor: id === sensor ? null : id, view: 'suit' }),
    close: () => update({ sensor: null }),
    setView: (v: SuitView) => update({ view: v, sensor: v === 'systems' ? null : sensor }),
  };
}
