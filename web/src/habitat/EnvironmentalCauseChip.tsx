import type { HabitatData } from "./types";
import { STATUS_COLOR, fmtDay, linkedAnomalies } from "./logic";

/** In the astronaut panel: "Possible environmental cause" (never a diagnosis). Renders nothing if there's no link.
 *  Short on purpose: the full honest message (lead time, limit rule) lives on the Habitat card. */
export function EnvironmentalCauseChip({ data, crewId, metric, onOpen }: {
  data: HabitatData; crewId: string; metric?: string; onOpen: (anomalyId: string) => void;
}) {
  const links = linkedAnomalies(data, crewId, metric);
  if (links.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {links.map((a) => (
        <button key={a.id} onClick={() => onOpen(a.id)}
                className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-left text-sm text-slate-200 hover:border-sky-400">
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_COLOR[a.severity] }} />
          <span><span className="text-slate-400">Possible environmental cause: </span>{data.channels[a.channel].label} rising since {fmtDay(a.start)}</span>
        </button>
      ))}
    </div>
  );
}
