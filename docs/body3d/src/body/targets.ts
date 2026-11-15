// Lenses (what kind of data you're looking at) and targets (things you can click to open in the inspector).
import A from "./anchors.json";
import type { Vis } from "./derive";

export type Lens = "all" | "cardio" | "neuro" | "msk" | "metabolic" | "radiation";
export type TargetId = "heart" | "vessels" | "brain" | "bone" | "muscle" | "metabolic" | "dna";
export type MicroKind = "artery" | "neurons" | "trabecular" | "fibers" | "dna";
export type Box = { c: number[]; h: number[] };
const B = A.boxes as Record<string, Box>;
const f = (v: number, d = 0) => v.toFixed(d);

export interface Target {
  id: TargetId;
  label: string;
  lens: Lens;
  box: Box;                 // region shown (and clipped to) in the organ view
  nodes: string[];          // model layers drawn in the organ view
  spin: boolean;
  view?: number[];          // camera direction for the organ view
  micro: MicroKind;
  microTitle: string;
  microNote?: [string, string]; // left / right captions for before-after views
  spot: number[];           // where the label sits on the body
  findingIds: string[];
  see: string;              // what the visuals show when everything is normal
  space: string;            // why this matters in spaceflight
  hot: (v: Vis) => string[];
  readings: (v: Vis, limit: number) => { label: string; value: string }[];
}


export const TARGETS: Record<TargetId, Target> = {
  heart: {
    id: "heart", label: "Heart", lens: "cardio", box: { c: B.heart.c, h: [0.07, 0.076, 0.072] }, nodes: ["heart", "artery_lad", "arteries"], spin: false, view: [0.35, 0.12, 1],
    micro: "artery", microTitle: "Blood leaving the heart", spot: [A.heart[0] + 0.07, A.heart[1] + 0.03, A.heart[2] + 0.09],
    findingIds: ["hr", "bp"],
    see: "The heart is beating at the measured heart rate. The close-up shows red blood cells pushed through an artery with each beat: faster and harder as heart rate and pressure rise.",
    space: "In weightlessness the heart doesn't have to pump against gravity, so it slowly loses muscle and changes shape.",
    hot: (v) => [`${f(v.hr)} bpm`, `BP ${f(v.bpSys)}/${f(v.bpDia)}`],
    readings: (v) => [{ label: "Heart rate", value: `${f(v.hr)} bpm` }, { label: "Blood pressure", value: `${f(v.bpSys)}/${f(v.bpDia)} mmHg` }],
  },
  vessels: {
    id: "vessels", label: "Arteries & veins", lens: "cardio", box: { c: [0, 1.2, 0.01], h: [0.2, 0.3, 0.13] }, nodes: ["arteries", "artery_lad", "veins", "heart"], spin: true,
    micro: "artery", microTitle: "Inside an artery", spot: [-0.07, 1.14, 0.07],
    findingIds: ["bp", "glu"],
    see: "Red vessels carry oxygen-rich blood away from the heart, blue ones bring it back. The pulses move at the measured heart rate. In the close-up, the artery wall stretches with every beat; the harder it stretches, the higher the pressure.",
    space: "Body fluids move toward the head in microgravity, which changes blood pressure and how the vessels behave.",
    hot: (v) => [`BP ${f(v.bpSys)}/${f(v.bpDia)}`, "mmHg"],
    readings: (v) => [{ label: "Systolic", value: `${f(v.bpSys)} mmHg` }, { label: "Diastolic", value: `${f(v.bpDia)} mmHg` }, { label: "Heart rate", value: `${f(v.hr)} bpm` }],
  },
  brain: {
    id: "brain", label: "Brain", lens: "neuro", box: B.brain, nodes: ["brain", "arteries"], spin: true,
    micro: "neurons", microTitle: "Nerve cells signalling", spot: [A.brain[0] + 0.1, A.brain[1] + 0.06, A.brain[2]],
    findingIds: ["brain"],
    see: "Blue sparks are nerve activity. The close-up shows signals travelling between nerve cells; a rested brain fires fast and evenly.",
    space: "Station crews average about 6 hours of sleep. Noise, workload and a 90-minute day-night cycle all disturb it, and isolation wears on mood.",
    hot: (v) => [`Sleep ${f(v.sleep, 1)} h`, `Mood ${f(v.mood)}/5`],
    readings: (v) => [{ label: "Sleep last night", value: `${f(v.sleep, 1)} h` }, { label: "Mood", value: `${f(v.mood)}/5` }],
  },
  bone: {
    id: "bone", label: "Hips & spine", lens: "msk", box: B.pelvis, nodes: ["bones_loadbearing", "bones"], spin: true,
    micro: "trabecular", microTitle: "Inside the bone", microNote: ["Launch day", "Today"], spot: [A.femur_left[0] + 0.1, 0.9, 0.05],
    findingIds: ["bone"],
    see: "The hips, lower spine and thigh bones carry your weight on Earth. The close-up shows the spongy lattice inside them: left at launch, right today. Lost struts don't all grow back.",
    space: "Without load, these bones lose around 1–1.5% of their mineral per month. Studies of returned crew found the shin bone often hadn't fully recovered a year later.",
    hot: (v) => [`Bone loss ${f(v.boneLoss, 1)}%`, "hips & spine"],
    readings: (v) => [{ label: "Estimated bone loss", value: `${f(v.boneLoss, 2)}%` }, { label: "Exercise today", value: `${f(v.exercise)} min` }],
  },
  muscle: {
    id: "muscle", label: "Leg & back muscles", lens: "msk", box: B.thigh, nodes: ["muscle_antigravity", "bones_loadbearing"], spin: true,
    micro: "fibers", microTitle: "Muscle fibres, cut across", microNote: ["Launch day", "Today"], spot: [-0.16, 0.62, 0.07],
    findingIds: ["bone"],
    see: "These are the muscles that hold you up against gravity. The close-up shows a bundle of muscle fibres: left at launch, right today. Thinner fibres mean a weaker muscle.",
    space: "With nothing to push against, these muscles shrink within weeks. About two hours of daily exercise is the countermeasure.",
    hot: (v) => [`Exercise ${f(v.exercise)} min`, "legs & back"],
    readings: (v) => [{ label: "Exercise today", value: `${f(v.exercise)} min` }, { label: "Estimated bone loss", value: `${f(v.boneLoss, 2)}%` }],
  },
  metabolic: {
    id: "metabolic", label: "Stomach & pancreas", lens: "metabolic", box: B.metabolic, nodes: ["organs", "arteries", "veins"], spin: true,
    micro: "artery", microTitle: "Sugar in the blood", spot: [0.1, 1.17, 0.09],
    findingIds: ["glu"],
    see: "The pancreas, tucked behind the stomach, releases insulin so cells can take sugar out of the blood. In the close-up, the amber dots are glucose travelling with the blood cells.",
    space: "Spaceflight makes the body respond less well to insulin, so blood sugar tends to run higher.",
    hot: (v) => [`Glucose ${f(v.glucose)}`, "mg/dL"],
    readings: (v) => [{ label: "Fasting glucose", value: `${f(v.glucose)} mg/dL` }],
  },
  dna: {
    id: "dna", label: "Radiation & temperature", lens: "radiation", box: { c: [0, 0.87, 0], h: [0.45, 0.9, 0.2] }, nodes: ["skin", "bones", "bones_loadbearing"], spin: true,
    micro: "dna", microTitle: "DNA inside a cell", spot: [-0.24, 1.47, 0.04],
    findingIds: ["rad", "temp"],
    see: "Space radiation passes through the whole body. Bone marrow, where blood cells are made, is among the most sensitive tissue. The close-up shows a strand of DNA; a red gap is a break caused by a particle strike.",
    space: "Outside Earth's magnetic field there is no shelter from solar storms except shielding. Dose adds up over a career.",
    hot: (v) => [`Dose ${f(v.doseDay, 2)} mSv/d`, `Temp ${f(v.temp, 1)}°C`],
    readings: (v, limit) => [{ label: "Dose today", value: `${f(v.doseDay, 2)} mSv` }, { label: "Mission total", value: `${f(v.doseCum)} of ${limit} mSv` }, { label: "Body temperature", value: `${f(v.temp, 1)}°C` }],
  },
};

type Opacity = Record<string, number>;
export interface LensDef { label: string; sub: string; targets: TargetId[]; opacity: Opacity; cam: { target: number[]; offset: number[] } }

export const LENSES: Record<Lens, LensDef> = {
  all:       { label: "Whole body", sub: "everything", targets: ["heart", "brain", "bone", "metabolic", "dna"],
               opacity: { skin: 1, muscles: 0.2, mag: 0.35, bones: 1, vessels: 1, organs: 1, lungs: 0.22, brain: 1, heart: 1, eyes: 1 }, cam: { target: [0, 0.95, 0], offset: [0, 0.15, 3.3] } },
  cardio:    { label: "Heart & blood", sub: "heart rate · pressure", targets: ["heart", "vessels"],
               opacity: { skin: 0.4, muscles: 0, mag: 0, bones: 0.1, vessels: 1, organs: 0.12, lungs: 0.08, brain: 0.5, heart: 1, eyes: 0.3 }, cam: { target: [0, 1.08, 0], offset: [0, 0.1, 2.3] } },
  neuro:     { label: "Brain & sleep", sub: "sleep · mood", targets: ["brain"],
               opacity: { skin: 0.4, muscles: 0, mag: 0, bones: 0.1, vessels: 0.45, organs: 0.15, lungs: 0.08, brain: 1, heart: 0.6, eyes: 1 }, cam: { target: [0, 1.5, 0], offset: [0.3, 0.08, 1.1] } },
  msk:       { label: "Bones & muscle", sub: "bone loss · exercise", targets: ["bone", "muscle"],
               opacity: { skin: 0.4, muscles: 0.1, mag: 0.45, bones: 1, vessels: 0.12, organs: 0.5, lungs: 0.06, brain: 0.3, heart: 0.3, eyes: 0.3 }, cam: { target: [0, 0.8, 0], offset: [0.5, 0.05, 2.3] } },
  metabolic: { label: "Blood sugar", sub: "glucose", targets: ["metabolic"],
               opacity: { skin: 0.4, muscles: 0, mag: 0, bones: 0.08, vessels: 0.5, organs: 1, lungs: 0.08, brain: 0.3, heart: 0.5, eyes: 0.3 }, cam: { target: [0, 1.13, 0], offset: [0.15, 0.05, 1.25] } },
  radiation: { label: "Radiation & temp", sub: "dose · temperature", targets: ["dna"],
               opacity: { skin: 1, muscles: 0.1, mag: 0.15, bones: 1, vessels: 0.5, organs: 0.8, lungs: 0.15, brain: 1, heart: 1, eyes: 1 }, cam: { target: [0, 0.95, 0], offset: [0.9, 0.2, 3.0] } },
};

/** Which target a click on the body means, from the layer hit and the 3D point. */
export function pickTarget(node: string, p: { x: number; y: number; z: number }, lens: Lens): TargetId | null {
  const inBox = (b: Box, pad = 0.02) => Math.abs(p.x - b.c[0]) < b.h[0] + pad && Math.abs(p.y - b.c[1]) < b.h[1] + pad && Math.abs(p.z - b.c[2]) < b.h[2] + pad;
  switch (node) {
    case "heart": case "artery_lad": return "heart";
    case "brain": return "brain";
    case "bones_loadbearing": return "bone";
    case "muscle_antigravity": return "muscle";
    case "veins": return "vessels";
    case "arteries": return inBox(TARGETS.heart.box, -0.02) ? "heart" : "vessels";
    case "organs": return inBox(TARGETS.metabolic.box) ? "metabolic" : null;
    case "bones": return lens === "msk" ? "bone" : null;
    default: return null;
  }
}

export const FINDING_TARGET: Record<string, TargetId | null> = { bp: "vessels", hr: "heart", glu: "metabolic", brain: "brain", bone: "bone", rad: "dna", temp: "dna" };
