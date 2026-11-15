// Types for the three files in public/data, written from contracts/DATA_CONTRACT.md
// and checked against the real files (see data/types.test.ts).
// Rules from the contract: times are ISO 8601 UTC strings, dates are YYYY-MM-DD,
// missing values are null. Never hardcode a value that lives in these files.

export type Status = 'green' | 'amber' | 'red';
export type Severity = 'amber' | 'red';
export type Region = 'brain' | 'heart' | 'blood' | 'bones' | 'whole_body';
export const REGIONS: readonly Region[] = ['brain', 'heart', 'blood', 'bones', 'whole_body'];

export type EnvironmentId = 'iss' | 'moon' | 'transit' | 'mars';

export type MetricKey =
  | 'hr'
  | 'bp_sys'
  | 'bp_dia'
  | 'glucose'
  | 'temp'
  | 'sleep_h'
  | 'mood'
  | 'exercise_min'
  | 'bone_loss_pct'
  | 'dose_mSv_day'
  | 'dose_mSv_cum';

/* ---------------------------------------------------------------- crew_data.json */

export interface CrewMeta {
  generated_at: string;
  simulated: boolean;
  note: string;
}

export interface Mission {
  name: string;
  environment: EnvironmentId;
  start_date: string;
  today: string;
}

export interface EnvironmentInfo {
  label: string;
  dose_mSv_day: number;
}

export interface Limits {
  min: number;
  max: number;
}

export interface MetricMeta {
  label: string;
  unit: string;
  body_region: Region;
  explain: string;
  how_to_measure: string;
  actions: Record<Severity, string>;
  /** Raw value outside this range is red at once, regardless of baseline. */
  absolute_red: Limits;
  /** true = only low values are bad (sleep, mood, exercise). */
  low_side_only: boolean;
}

export interface Baseline {
  mean: number;
  /** Already includes the sd floor. Do not recompute. */
  sd: number;
}

/** One row per mission day. Any metric can be null (missed measurement). */
export type SeriesRow = { date: string } & { [K in MetricKey]: number | null };

export interface Flag {
  date: string;
  metric: MetricKey;
  severity: Severity;
  /** The 3-day-mean z. null for metrics judged on absolute bands (dose, bone loss). */
  z: number | null;
  message: string;
  action: string;
}

export type RegionStatus = Record<Region, Status> & { overall: Status };

export interface CrewMember {
  id: string;
  name: string;
  role: string;
  age: number;
  /** Personal mean/sd from the first 14 mission days. Dose and bone loss have none. */
  baseline: Partial<Record<MetricKey, Baseline>>;
  series: SeriesRow[];
  flags: Flag[];
  status: RegionStatus;
}

export interface CrewData {
  meta: CrewMeta;
  mission: Mission;
  environments: Record<EnvironmentId, EnvironmentInfo>;
  career_limit_mSv: number;
  metrics: Record<MetricKey, MetricMeta>;
  crew: CrewMember[];
}

/* ------------------------------------------------------------ storm_forecast.json */

export type AlertLevel = 'none' | 'watch' | 'warning';
export type Split = 'train' | 'test';

export interface StormMetricsTest {
  n_flares: number;
  n_storms: number;
  hit_rate: number;
  false_alarms_per_month: number;
  median_lead_time_h: number;
  brier_skill_vs_climatology: number;
}

export interface StormMeta {
  generated_at: string;
  model: string;
  horizon_hours: number;
  train_period: [string, string];
  test_period: [string, string];
  thresholds: { watch: number; warning: number };
  /** Quote headline numbers from here only; never recompute them. */
  metrics_test: StormMetricsTest;
  feature_importance: { feature: string; importance: number }[];
  data_credit: string;
}

export interface FlareEvent {
  flare_id: string;
  peak_time: string;
  flare_class: string;
  class_flux: number;
  source_location: string | null;
  latitude_deg: number | null;
  /** Solar longitude, west positive (W80 = 80, E30 = -30). */
  longitude_deg: number | null;
  has_linked_cme: boolean;
  cme_speed_kms: number | null;
  /** Model probability of a solar radiation storm within meta.horizon_hours of peak_time. */
  p_storm: number;
  alert_level: AlertLevel;
  actual_storm: boolean;
  storm_onset_time: string | null;
  lead_time_h: number | null;
  /** The replay must only use 'test' events. */
  split: Split;
}

export interface StormForecast {
  meta: StormMeta;
  events: FlareEvent[];
}

/* ---------------------------------------------------------------- real_crew.json */
// Published Inspiration4 lab draws (NASA OSDR OSD-575). Not the simulated crew.
// Do not merge into crew_data.json and do not run the live check-in rule on it.

export type AnalyteKey =
  | 'lymphocytes'
  | 'neutrophils'
  | 'wbc'
  | 'glucose'
  | 'potassium'
  | 'platelets'
  | 'hemoglobin'
  | 'calcium';

export type DrawPhase = 'pre' | 'post';
export type RealFlagKind = 'inside_lab_far_from_baseline' | 'outside_lab_range' | 'sample_handling_artefact';

export interface RealTimepoint {
  /** 'L-92', 'L-44', 'L-3', 'R+1', 'R+45', 'R+82', 'R+194'. */
  id: string;
  phase: DrawPhase;
  /** Days before launch (negative) or after return (positive). Not one continuous clock. */
  day: number;
}

export interface RealCrewMeta {
  generated_at: string;
  schema_version: number;
  source: string;
  mission: string;
  simulated: boolean;
  note?: string;
  timepoints?: RealTimepoint[];
  day_meaning?: string;
  baseline_rule: string;
  far_rule: string;
  artefact_rule: string;
  exclusions: {
    crew: string;
    timepoint: string;
    panel: string;
    reason: string;
    evidence?: Record<string, number>;
  }[];
  counts: Record<RealFlagKind, number>;
}

export interface Analyte {
  key: AnalyteKey;
  label: string;
  unit: string;
  panel: string;
  column?: string;
  unit_note?: string;
}

export interface RealFlag {
  crew: string;
  timepoint: string;
  phase: DrawPhase;
  analyte: AnalyteKey;
  kind: RealFlagKind;
  value: number;
  unit: string;
  pct_change: number;
  z: number;
  lab_min: number;
  lab_max: number;
}

export interface RealVariation {
  unit: string;
  pooled_within_person_sd: number;
  df: number;
  per_crew: Record<string, { n: number; mean: number; sd: number; cv_pct: number }>;
  /** Only on glucose. */
  synthetic_day_to_day_sd?: {
    stated_mg_dl: number;
    realized_mg_dl: { crew: string; sd: number }[];
    note?: string;
  };
}

export interface RealBaseline {
  n: number;
  timepoints: string[];
  mean: number;
  sd: number;
  unit: string;
}

export interface RealDraw {
  /** null when excluded is true. */
  value: number | null;
  unit: string;
  lab_min: number | null;
  lab_max: number | null;
  outside_lab_range: boolean | null;
  pct_change: number | null;
  pct_of_baseline: number | null;
  z: number | null;
  /** null for pre-flight draws, excluded rows and artefacts. */
  far_from_baseline: boolean | null;
  artefact: boolean;
  excluded: boolean;
  baseline_n: number;
}

export type RealSeriesRow = { timepoint: string; phase: DrawPhase; day: number } & {
  [K in AnalyteKey]?: RealDraw;
};

export interface RealCrewMember {
  id: string;
  baseline: Partial<Record<AnalyteKey, RealBaseline>>;
  series: RealSeriesRow[];
}

export interface RealCrew {
  meta: RealCrewMeta;
  analytes: Analyte[];
  flags: RealFlag[];
  variation: Partial<Record<AnalyteKey, RealVariation>>;
  crew: RealCrewMember[];
}

/* ------------------------------------------------------------------------ bundle */

export interface MissionData {
  crew: CrewData;
  storm: StormForecast;
  /** Inspiration4 baselines. null if the file is absent (it is optional for the demo crew). */
  real: RealCrew | null;
}
