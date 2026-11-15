import { useEffect, useState } from "react";
import type { HabitatData } from "./types";

function dataUrl(): string {
  // Vite base-path aware, works in the offline build and on the deployed link.
  const base = (typeof import.meta !== "undefined" && (import.meta as any).env?.BASE_URL) || "/";
  return `${base}data/habitat_telemetry.json`;
}

export function useHabitat(): { data: HabitatData | null; error: string | null } {
  const [data, setData] = useState<HabitatData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(dataUrl())
      .then((r) => { if (!r.ok) throw new Error(`habitat_telemetry.json: HTTP ${r.status}`); return r.json(); })
      .then((j) => { if (alive) setData(j as HabitatData); })
      .catch((e) => { if (alive) setError(String(e)); });
    return () => { alive = false; };
  }, []);
  return { data, error };
}
