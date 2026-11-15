// Turns crew metrics (or a simulated scenario) into what the 3D body should show.
import type { Baseline, CrewData, CrewMember, MetricKey, MetricMeta, Region, Status } from "./types";

export type Focus = Region | "overview";

export interface Vis {
  hr: number; bpSys: number; bpDia: number; glucose: number; temp: number; sleep: number; mood: number;
  exercise: number; boneLoss: number; doseDay: number; doseCum: number;
  status: Record<Region, Status>;
  pressure: number;      // 0..1 arterial pressure above normal
  ladBlock: number;      // 0..1 coronary blockage (scenario only)
  brainFatigue: number;  // 0..1 sleep/mood deficit
  porosity: number;      // 0..1 bone density loss, exaggerated so it's visible
  atrophy: number;       // 0..1 antigravity muscle wasting
  radiation: number;     // 0..1 dose rate vs normal
  fever: number;         // 0..1
  sugar: number;         // 0..1 glucose high
  stasis: number;        // 0..1 neck-vein blood pooling from headward fluid shift (scenario only)
}

export interface Finding {
  id: string;
  region: Region;
  status: Status;
  title: string;
  numbers: { label: string; value: string }[];
  inside: string;   // what is physically happening inside the body
  action: string;
  simulated?: boolean;
}

export const RANK: Record<Status, number> = { green: 0, amber: 1, red: 2 };
export const worst = (...s: Status[]): Status => s.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), "green");
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));

function score(meta: MetricMeta, base: Baseline | undefined, x: number | null | undefined): { s: Status; z: number | null } {
  if (x == null) return { s: "green", z: null };
  const lim = meta.absolute_red;
  let z = base && base.sd ? (x - base.mean) / base.sd : null;
  if (z != null && meta.low_side_only) z = Math.min(z, 0);
  if (lim && (x < lim.min || x > lim.max)) return { s: "red", z };
  if (z == null) return { s: "green", z };
  const a = Math.abs(z);
  return { s: a >= 3 ? "red" : a >= 2 ? "amber" : "green", z };
}

function latest(m: CrewMember, k: MetricKey): number | null {
  for (let i = m.series.length - 1; i >= 0; i--) { const v = m.series[i][k]; if (v != null) return v; }
  return null;
}

const f = (v: number, d = 0) => v.toFixed(d);
const zs = (z: number | null) => (z == null ? "" : ` (${z >= 0 ? "+" : "−"}${Math.abs(z).toFixed(1)}σ vs normal)`);

export const SCENARIOS = {
  live: { label: "Live crew data" },
  hypertension: { label: "High blood pressure" },
  storm: { label: "Solar radiation storm" },
  boneloss: { label: "Bone & muscle loss" },
  sleep: { label: "Sleep deprivation" },
  fever: { label: "Fever / infection" },
  sugar: { label: "High blood sugar" },

} as const;
export type ScenarioKey = keyof typeof SCENARIOS;

type Overrides = Partial<Pick<Vis, "hr" | "bpSys" | "bpDia" | "glucose" | "temp" | "sleep" | "mood" | "exercise" | "boneLoss" | "doseDay" | "ladBlock" | "stasis">>;
const SCENARIO_VALUES: Record<ScenarioKey, Overrides> = {
  live: {},
  hypertension: { bpSys: 162, bpDia: 101, hr: 86 },
  storm: { doseDay: 9.5 },
  boneloss: { boneLoss: 6.5, exercise: 20 },
  sleep: { sleep: 3.6, mood: 2 },
  fever: { temp: 39.1, hr: 98 },
  sugar: { glucose: 214 },
};

export function derive(data: CrewData, m: CrewMember, scenario: ScenarioKey): { vis: Vis; findings: Finding[] } {
  const M = data.metrics, B = m.baseline;
  const o = SCENARIO_VALUES[scenario];
  const sim = scenario !== "live";
  const v = {
    hr: o.hr ?? latest(m, "hr") ?? 60,
    bpSys: o.bpSys ?? latest(m, "bp_sys") ?? 115,
    bpDia: o.bpDia ?? latest(m, "bp_dia") ?? 75,
    glucose: o.glucose ?? latest(m, "glucose") ?? 90,
    temp: o.temp ?? latest(m, "temp") ?? 36.8,
    sleep: o.sleep ?? latest(m, "sleep_h") ?? 7,
    mood: o.mood ?? latest(m, "mood") ?? 4,
    exercise: o.exercise ?? latest(m, "exercise_min") ?? 120,
    boneLoss: o.boneLoss ?? latest(m, "bone_loss_pct") ?? 0,
    doseDay: o.doseDay ?? latest(m, "dose_mSv_day") ?? 0.5,
    doseCum: latest(m, "dose_mSv_cum") ?? 0,
    ladBlock: o.ladBlock ?? 0,
    stasis: o.stasis ?? 0,
  };

  // Recent flags from the baseline model count too (live data only).
  const end = m.series[m.series.length - 1]?.date ?? "";
  const cutoff = new Date(Date.parse(end + "T00:00:00Z") - 2 * 864e5).toISOString().slice(0, 10);
  const flagged = (k: MetricKey): Status =>
    sim ? "green" : m.flags.filter((x) => x.metric === k && x.date >= cutoff).reduce<Status>((a, x) => worst(a, x.severity), "green");

  const S = (k: MetricKey, x: number) => { const r = score(M[k], B[k], x); return { s: worst(r.s, flagged(k)), z: r.z }; };
  const hr = S("hr", v.hr), sys = S("bp_sys", v.bpSys), dia = S("bp_dia", v.bpDia), glu = S("glucose", v.glucose),
    tmp = S("temp", v.temp), slp = S("sleep_h", v.sleep), mood = S("mood", v.mood), ex = S("exercise_min", v.exercise),
    bl = S("bone_loss_pct", v.boneLoss);
  // Dose has no personal baseline: compare with the normal daily dose for this environment.
  const envDose = data.environments[data.mission.environment]?.dose_mSv_day ?? 0.5;
  const dose = { s: worst(score(M.dose_mSv_day, undefined, v.doseDay).s, v.doseDay > 4 * envDose ? "red" : v.doseDay > 2 * envDose ? "amber" : "green", flagged("dose_mSv_day")), z: null as number | null };

  const findings: Finding[] = [];
  const add = (x: Finding) => findings.push({ ...x, simulated: sim });
  const act = (k: MetricKey, s: Status) => (s === "green" ? "" : M[k].actions[s]);

  // Heart
  const bpS = worst(sys.s, dia.s);
  if (bpS !== "green") {
    add({ id: "bp", region: "heart", status: bpS, title: v.bpSys > (B.bp_sys?.mean ?? 120) ? "Blood pressure above your normal" : "Blood pressure below your normal",
      numbers: [{ label: "Systolic", value: `${f(v.bpSys)} mmHg${zs(sys.z)}` }, { label: "Diastolic", value: `${f(v.bpDia)} mmHg${zs(dia.z)}` }],
      inside: v.bpSys > (B.bp_sys?.mean ?? 120)
        ? "Your arteries are carrying blood at higher pressure: the vessel walls stretch with every beat (see them throb) and the heart muscle works harder to push blood out. In microgravity, fluid shifting toward the head adds to this."
        : "Pressure in the arteries is lower than your normal, so less blood reaches the brain and limbs with each beat. Common after fluid loss or standing up quickly after returning to gravity.",
      action: act("bp_sys", sys.s) || act("bp_dia", dia.s) });
  }
  if (hr.s !== "green") {
    add({ id: "hr", region: "heart", status: hr.s, title: "Resting heart rate off your normal",
      numbers: [{ label: "Heart rate", value: `${f(v.hr)} bpm${zs(hr.z)}` }],
      inside: "The heart is beating at a rate it doesn't usually rest at. Watch the flow speed in the vessels: it follows the heart rate.",
      action: act("hr", hr.s) });
  }
  // Blood
  if (glu.s !== "green") {
    add({ id: "glu", region: "blood", status: glu.s, title: v.glucose > (B.glucose?.mean ?? 95) ? "Blood sugar high" : "Blood sugar low",
      numbers: [{ label: "Fasting glucose", value: `${f(v.glucose)} mg/dL${zs(glu.z)}` }],
      inside: v.glucose > (B.glucose?.mean ?? 95)
        ? "Excess glucose is circulating in the blood (amber particles in the flow) because muscles are taking it up less efficiently. Spaceflight lowers insulin sensitivity."
        : "Not enough glucose in the blood to fuel the brain and muscles.",
      action: act("glucose", glu.s) });
  }
  // Brain
  const brainS = worst(slp.s, mood.s);
  if (brainS !== "green") {
    add({ id: "brain", region: "brain", status: brainS, title: slp.s !== "green" ? "Sleep debt building" : "Mood dropping",
      numbers: [{ label: "Sleep last night", value: `${f(v.sleep, 1)} h${zs(slp.z)}` }, { label: "Mood", value: `${f(v.mood)}/5${zs(mood.z)}` }],
      inside: "With too little sleep the brain doesn't finish clearing the waste it builds up during the day. Neural activity (the sparks) becomes sluggish and patchy: slower reaction time, worse decisions and lower mood.",
      action: act("sleep_h", slp.s) || act("mood", mood.s) });
  }
  // Bones & muscle
  const boneS = worst(bl.s, ex.s);
  if (boneS !== "green" || v.boneLoss >= 2) {
    add({ id: "bone", region: "bones", status: worst(boneS, v.boneLoss >= 4 ? "red" : v.boneLoss >= 2 ? "amber" : "green"), title: "Bone and muscle loss",
      numbers: [{ label: "Estimated bone loss", value: `${f(v.boneLoss, 1)}%` }, { label: "Exercise today", value: `${f(v.exercise)} min${zs(ex.z)}` }],
      inside: "Without weight on them, the hips, spine and legs lose mineral (the glowing patches on the bone) and the antigravity muscles in the thighs, calves and back shrink. The patches are exaggerated so you can see them; the close-up shows the bone's inner lattice thinning.",
      action: act("exercise_min", ex.s) || act("bone_loss_pct", bl.s) || "Increase resistance exercise and keep calcium and vitamin D intake up." });
  }
  // Whole body
  if (dose.s !== "green") {
    add({ id: "rad", region: "whole_body", status: dose.s, title: v.doseDay > 5 ? "Solar radiation storm exposure" : "Radiation dose above your normal",
      numbers: [{ label: "Dose today", value: `${f(v.doseDay, 2)} mSv (${f(v.doseDay / envDose, 1)}× normal)` }, { label: "Mission total", value: `${f(v.doseCum)} of ${data.career_limit_mSv} mSv` }],
      inside: "High-energy particles are passing straight through the body (the streaks). Each one can break DNA strands in the cells it crosses; bone marrow and the gut lining are the most sensitive.",
      action: act("dose_mSv_day", dose.s) || "Move to the storm shelter and log your dosimeter reading." });
  }
  if (tmp.s !== "green") {
    add({ id: "temp", region: "whole_body", status: tmp.s, title: v.temp > 37.5 ? "Fever" : "Body temperature off your normal",
      numbers: [{ label: "Temperature", value: `${f(v.temp, 1)}°C${zs(tmp.z)}` }],
      inside: "The body is running hot: the immune system is fighting something, and the heart beats faster to move heat to the skin. The immune system is weaker in spaceflight, so infections deserve attention early.",
      action: act("temp", tmp.s) });
  }

  findings.sort((a, b) => RANK[b.status] - RANK[a.status]);
  const regionStatus = (r: Region) => findings.filter((x) => x.region === r).reduce<Status>((a, x) => worst(a, x.status), "green");
  const status: Record<Region, Status> = sim
    ? { heart: regionStatus("heart"), blood: regionStatus("blood"), brain: regionStatus("brain"), bones: regionStatus("bones"), whole_body: regionStatus("whole_body") }
    : { heart: worst(m.status.heart, regionStatus("heart")), blood: worst(m.status.blood, regionStatus("blood")), brain: worst(m.status.brain, regionStatus("brain")), bones: worst(m.status.bones, regionStatus("bones")), whole_body: worst(m.status.whole_body, regionStatus("whole_body")) };

  const sysHi = B.bp_sys ? (v.bpSys - B.bp_sys.mean) / B.bp_sys.sd : 0;
  const vis: Vis = {
    ...v, status,
    pressure: clamp((sysHi - 1) / 3),
    brainFatigue: clamp(Math.max(-(slp.z ?? 0) - 1, -(mood.z ?? 0) - 1) / 2.5),
    porosity: clamp(v.boneLoss / 6),
    atrophy: clamp(Math.max(v.boneLoss / 6, B.exercise_min ? (B.exercise_min.mean - v.exercise) / B.exercise_min.mean : 0)),
    radiation: clamp(v.doseDay / 8),
    fever: clamp((v.temp - 37.3) / 1.5),
    sugar: clamp((v.glucose - 120) / 80),
  };
  return { vis, findings };
}
