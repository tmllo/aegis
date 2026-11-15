// Shapes from contracts/HABITAT_CONTRACT.md (+ CHANGELOG v2.2). Don't hardcode anything that lives in the JSON.
export type Status = "green" | "amber" | "red";
export type ChannelKey = "ppco2_mmhg" | "ppo2_kpa" | "cabin_pressure_kpa" | "temp_c" | "rh_pct";
export type Range = { min: number | null; max: number | null };

export interface Channel {
  label: string; unit: string; subsystem: string; body_region: string;
  limits: Range; absolute_red: Range;
  explain: string; health_link: string;
  actions: { amber: string; red: string };
}

export interface SeriesRow {
  time: string;
  ppco2_mmhg: number | null; ppo2_kpa: number | null; cabin_pressure_kpa: number | null;
  temp_c: number | null; rh_pct: number | null;
  score: Record<ChannelKey, number | null>;
}

export interface CrewLink { crew_id: string; metric: string; from: string; to: string; note: string }

export interface Anomaly {
  id: string; channel: ChannelKey; fault: string | null;
  start: string; end: string | null; detected_at: string | null; limit_crossed_at: string | null;
  lead_time_h: number | null; peak_score: number | null;
  severity: "amber" | "red"; status: "active" | "resolved";
  planted: boolean; detected: boolean;
  source?: "level" | "residual" | "both" | null;
  message: string; action: string; linked_crew_flags: CrewLink[];
}

export interface Metrics { precision: number | null; recall: number | null; f0_5: number | null; false_alarms_per_10k_steps: number | null }

export interface HabitatData {
  meta: {
    generated_at: string; model: string; simulated_habitat: boolean; note: string;
    sample_interval_min: number; baseline_period: [string, string];
    thresholds: { amber: number; red: number }; min_duration_steps: number;
    validation: null | {
      dataset?: string; tuned_on?: string; tested_on?: string; protocol?: string;
      model?: Metrics | null; baseline_static_3sigma?: Metrics | null;
    };
    data_credit?: string;
  };
  channels: Record<ChannelKey, Channel>;
  series: SeriesRow[];
  anomalies: Anomaly[];
  status: { overall: Status; by_channel: Record<ChannelKey, Status> };
}
