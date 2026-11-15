import type { HabitatData } from "./types";
import { STATUS_COLOR } from "./logic";

/** Mission header pill → opens the Habitat tab. */
export function HabitatStatusPill({ data, onClick }: { data: HabitatData; onClick: () => void }) {
  const c = STATUS_COLOR[data.status.overall];
  return (
    <button onClick={onClick} className="flex items-center gap-2 rounded-full border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-500">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c, boxShadow: `0 0 10px ${c}` }} />
      Habitat
    </button>
  );
}
