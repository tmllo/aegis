import { useMissionData } from '../data/store';

/** Required credit for the body model (CC BY 4.0). Keep the wording. */
export const ANATOMY_CREDIT =
  'Anatomy: BodyParts3D 4.0, © The Database Center for Life Science, licensed CC BY 4.0. Packaged via human-atlas (github.com/ashemag/human-atlas, MIT). Suit: Apollo 11 A7L 3D scan, Smithsonian National Air and Space Museum (3d.si.edu), CC0; patches removed for e^x.';

/** Disclaimers every surface must show. */
export const DISCLAIMERS = [
  'Simulated crew data, not real astronaut records',
  'Not medical advice',
  'NASA does not publish crew self-check thresholds',
] as const;

/**
 * Footer with the fixed disclaimers, the data and model credit read from
 * storm_forecast.json, and the anatomy licence credit.
 * Unstyled beyond tokens: concepts may restyle it with className or rebuild it
 * from the exported constants, but all lines must stay visible somewhere.
 */
export function Footer({ className = '' }: { className?: string }) {
  const storm = useMissionData().data?.storm.meta;
  const lines: string[] = [...DISCLAIMERS];
  if (storm) {
    lines.push(`Space weather data: ${storm.data_credit}`);
    lines.push(`Model: ${storm.model}`);
  }
  return (
    <footer className={`border-t border-line px-8 py-4 text-xs leading-relaxed text-faint ${className}`}>
      <p>{lines.join('  ·  ')}</p>
      <p className="mt-1">{ANATOMY_CREDIT}</p>
    </footer>
  );
}
