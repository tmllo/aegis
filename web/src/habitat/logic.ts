import type { Anomaly, HabitatData, Status } from "./types";

export const STATUS_COLOR: Record<Status, string> = { green: "#22c55e", amber: "#f59e0b", red: "#ef4444" };
export const HONEST_FOOTER = "Habitat telemetry simulated. Detector validated on NASA SMAP/MSL telemetry.";

/** caught / missed / false alarm. Every planted fault is shown honestly. */
export function anomalyTag(a: Anomaly): { label: string; color: string } {
  if (!a.planted) return { label: "False alarm", color: "#8a93ad" };
  if (!a.detected) return { label: "Missed", color: "#94a3b8" };
  return { label: "Caught", color: "#f4f6fb" };
}

/** Never claim "before the limit" unless lead_time_h is positive. */
export function leadTimeText(a: Anomaly): string | null {
  if (!a.detected) return "Not detected by the model";
  if (a.lead_time_h == null) return a.limit_crossed_at == null ? "Limit never crossed" : null;
  if (a.lead_time_h > 0) return `Flagged ${Math.round(a.lead_time_h)} h before the limit`;
  return "Limit rule fired first";
}

/** Score colour from meta.thresholds (never assume fixed numbers). */
export function scoreStatus(score: number | null, t: HabitatData["meta"]["thresholds"]): Status | null {
  if (score == null || Number.isNaN(score)) return null;
  if (score >= t.red) return "red";
  if (score >= t.amber) return "amber";
  return "green";
}

/** Anomalies that may explain a crew member's flags (optionally for one metric). */
export function linkedAnomalies(d: HabitatData, crewId: string, metric?: string): Anomaly[] {
  return d.anomalies.filter((a) =>
    a.linked_crew_flags.some((l) => l.crew_id === crewId && (metric == null || l.metric === metric)));
}

export function latestValue(d: HabitatData, key: keyof HabitatData["channels"]): number | null {
  for (let i = d.series.length - 1; i >= 0; i--) {
    const v = d.series[i][key];
    if (v != null) return v;
  }
  return null;
}

/** "8 Nov" (UTC). Accepts an ISO timestamp or a YYYY-MM-DD date. */
export const fmtDay = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** "11 → 14 Nov" (same month) or "30 Oct → 2 Nov". */
export const fmtDayRange = (from: string, to: string) => {
  const [a, b] = [fmtDay(from), fmtDay(to)];
  if (a === b) return a;
  const [da, ma] = a.split(" "), [db, mb] = b.split(" ");
  return ma === mb ? `${da} → ${db} ${mb}` : `${a} → ${b}`;
};

/** Turns crew_id + metric key into display labels; supplied by the host app from crew_data.json. */
export type CrewResolver = (crewId: string, metric: string) => { name: string; metric: string };

export const fmtDate = (iso: string | null) =>
  iso == null ? "—" : new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
