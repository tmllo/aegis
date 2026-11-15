// Types for crew_data.json, mirroring contracts/DATA_CONTRACT.md. Don't add fields here without a CHANGELOG entry.
export type Status = "green" | "amber" | "red";
export type Region = "brain" | "heart" | "blood" | "bones" | "whole_body";
export type MetricKey =
  | "hr" | "bp_sys" | "bp_dia" | "glucose" | "temp" | "sleep_h" | "mood"
  | "exercise_min" | "bone_loss_pct" | "dose_mSv_day" | "dose_mSv_cum";

export interface MetricMeta {
  label: string;
  unit: string;
  body_region: Region;
  explain: string;
  how_to_measure: string;
  actions: { amber: string; red: string };
  absolute_red?: { min: number; max: number };
  low_side_only?: boolean;
}

export type Day = { date: string } & Partial<Record<MetricKey, number | null>>;
export interface Baseline { mean: number; sd: number }

export interface Flag {
  date: string;
  metric: MetricKey;
  severity: "amber" | "red";
  z: number | null;
  message: string;
  action: string;
}

export interface CrewMember {
  id: string;
  name: string;
  role: string;
  age: number;
  baseline: Partial<Record<MetricKey, Baseline>>;
  series: Day[];
  flags: Flag[];
  status: Record<Region | "overall", Status>;
}

export interface CrewData {
  meta: { generated_at: string; simulated: boolean; note: string };
  mission: { name: string; environment: string; start_date: string; today: string };
  environments: Record<string, { label: string; dose_mSv_day: number }>;
  career_limit_mSv: number;
  metrics: Record<MetricKey, MetricMeta>;
  crew: CrewMember[];
}
