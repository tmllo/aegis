// A cabin reading as a widget (value, unit, status, limit band, source).
import type { CabinReading } from '../core/cabin';
import type { WidgetData } from './Widget';

export const cabinWidget = (r: CabinReading): WidgetData => ({
  id: r.metric.key,
  label: r.metric.short,
  value: r.value,
  digits: r.metric.digits,
  unit: r.metric.unit,
  status: r.status,
  lo: r.metric.bands.amber_low ?? r.metric.bands.red_low ?? null,
  hi: r.metric.bands.amber_high ?? r.metric.bands.red_high ?? null,
  meta: r.value == null ? 'Not connected' : `${r.metric.source} limit`,
});
