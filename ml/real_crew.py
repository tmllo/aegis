"""Inspiration4 CBC and chemistry, scored against each person's pre-flight mean.

Reads data/real/cbc.csv and data/real/cmp.csv (NASA OSDR OSD-575, crew C001–C004).
Writes the slide, the findings note, and web/public/data/real_crew.json.
Appends a glucose calibration section to ml/results/synthetic_crew.md.

Does not change the synthetic crew generator or crew_data.json.

    python ml/real_crew.py
"""
from __future__ import annotations

import csv
import json
import math
import statistics
from datetime import datetime, timezone
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
CBC_PATH = ROOT / "data" / "real" / "cbc.csv"
CMP_PATH = ROOT / "data" / "real" / "cmp.csv"
RESULTS = ROOT / "ml" / "results"
JSON_PATH = ROOT / "web" / "public" / "data" / "real_crew.json"
SYNTHETIC_MD = RESULTS / "synthetic_crew.md"

CREW_IDS = ["C001", "C002", "C003", "C004"]
TIMEPOINTS = [
    ("L-92", "pre", -92),
    ("L-44", "pre", -44),
    ("L-3", "pre", -3),
    ("R+1", "post", 1),
    ("R+45", "post", 45),
    ("R+82", "post", 82),
    ("R+194", "post", 194),
]
PRE = [tp for tp, phase, _ in TIMEPOINTS if phase == "pre"]
POST = [tp for tp, phase, _ in TIMEPOINTS if phase == "post"]
TP_INDEX = {tp: i for i, (tp, _, _) in enumerate(TIMEPOINTS)}

# Absolute counts, not percentages. A percent moves when the other lineage moves.
ANALYTES = [
    {
        "key": "lymphocytes",
        "panel": "cbc",
        "label": "Absolute lymphocytes",
        "short": "Lymphocytes",
        "unit": "cells/µL",
        "value": "absolute_lymphocytes_value_cells_per_microliter",
        "lo": "absolute_lymphocytes_range_min_cells_per_microliter",
        "hi": "absolute_lymphocytes_range_max_cells_per_microliter",
    },
    {
        "key": "neutrophils",
        "panel": "cbc",
        "label": "Absolute neutrophils",
        "short": "Neutrophils",
        "unit": "cells/µL",
        "value": "absolute_neutrophils_value_cells_per_microliter",
        "lo": "absolute_neutrophils_range_min_cells_per_microliter",
        "hi": "absolute_neutrophils_range_max_cells_per_microliter",
    },
    {
        "key": "wbc",
        "panel": "cbc",
        "label": "White blood cells",
        "short": "WBC",
        "unit": "10³/µL",
        "value": "white_blood_cell_count_value_thousand_per_microliter",
        "lo": "white_blood_cell_count_range_min_thousand_per_microliter",
        "hi": "white_blood_cell_count_range_max_thousand_per_microliter",
    },
    {
        "key": "glucose",
        "panel": "cmp",
        "label": "Glucose",
        "short": "Glucose",
        "unit": "mg/dL",
        "value": "glucose_value_milligram_per_deciliter",
        "lo": "glucose_range_min_milligram_per_deciliter",
        "hi": "glucose_range_max_milligram_per_deciliter",
    },
    {
        "key": "potassium",
        "panel": "cmp",
        "label": "Potassium",
        "short": "Potassium",
        "unit": "mmol/L",
        "value": "potassium_value_millimol_per_liter",
        "lo": "potassium_range_min_millimol_per_liter",
        "hi": "potassium_range_max_millimol_per_liter",
    },
    {
        "key": "platelets",
        "panel": "cbc",
        "label": "Platelets",
        "short": "Platelets",
        "unit": "10³/µL",
        "value": "platelet_count_value_thousand_per_microliter",
        "lo": "platelet_count_range_min_thousand_per_microliter",
        "hi": "platelet_count_range_max_thousand_per_microliter",
    },
    {
        "key": "hemoglobin",
        "panel": "cbc",
        "label": "Hemoglobin",
        "short": "Hemoglobin",
        "unit": "g/dL",
        "value": "hemoglobin_value_percent",
        "lo": "hemoglobin_range_min_percent",
        "hi": "hemoglobin_range_max_percent",
        "unit_note": (
            "The source column is named hemoglobin_value_percent. "
            "The numbers and the printed interval match g/dL, not percent. "
            "Hematocrit is the percent column and is not used here."
        ),
    },
    {
        "key": "calcium",
        "panel": "cmp",
        "label": "Calcium",
        "short": "Calcium",
        "unit": "mg/dL",
        "value": "calcium_value_milligram_per_deciliter",
        "lo": "calcium_range_min_milligram_per_deciliter",
        "hi": "calcium_range_max_milligram_per_deciliter",
    },
]
BY_KEY = {a["key"]: a for a in ANALYTES}

# Same cutoff as the app's amber flag. No sd floor: with 2–3 draws a floor would be a second model.
Z_FAR = 2.0
CAL_START = "<!-- real-crew-calibration:start -->"
CAL_END = "<!-- real-crew-calibration:end -->"

NAVY = "#1f4e79"
INK = "#1d2939"
MUTED = "#667085"
GRID = "#eaecf0"
AMBER = "#b54708"
RED = "#b42318"
GREY = "#98a2b3"
LAB_FILL = "#d1e9ff"
BAND_FILL = "#fef0c7"


def num(raw):
    text = (raw or "").strip()
    if text in ("", "NA", "N/A", "NaN", "nan"):
        return None
    return float(text)


def as_json_number(value):
    if value is None:
        return None
    rounded = round(float(value), 4)
    if math.isfinite(rounded) and abs(rounded - round(rounded)) < 1e-9:
        return int(round(rounded))
    return rounded


def load_rows(path):
    with path.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        raise RuntimeError(f"{path} has no data rows")
    return rows


def parse_sample(name, panel):
    parts = name.split("_")
    if panel == "cbc":
        if len(parts) != 4 or parts[1] != "whole-blood" or parts[3] != "cbc":
            raise RuntimeError(f"unexpected CBC sample name: {name}")
    elif len(parts) != 3 or parts[1] != "serum":
        raise RuntimeError(f"unexpected CMP sample name: {name}")
    crew, timepoint = parts[0], parts[2]
    if crew not in CREW_IDS or timepoint not in TP_INDEX:
        raise RuntimeError(f"unexpected crew or timepoint in {name}")
    return crew, timepoint


def is_shifted_cbc(row):
    """Column shift: a percent, an MPV, or a platelet count landed in the wrong field."""
    neutrophils = num(row["absolute_neutrophils_value_cells_per_microliter"])
    neutrophil_pct = num(row["neutrophils_value_percent"])
    mpv = num(row["mpv_value_femtoliter"])
    platelets = num(row["platelet_count_value_thousand_per_microliter"])
    percent_in_count = neutrophils is not None and neutrophils < 100 and neutrophil_pct is not None and neutrophil_pct > 50
    mpv_impossible = mpv is not None and mpv > 30
    platelets_impossible = platelets is not None and platelets < 50
    return percent_in_count or mpv_impossible or platelets_impossible


def index_panel(rows, panel):
    found = {}
    shifted = []
    for row in rows:
        crew, timepoint = parse_sample(row["Sample Name"], panel)
        if panel == "cbc" and is_shifted_cbc(row):
            shifted.append((crew, timepoint, row))
            continue
        found[(crew, timepoint)] = row
    return found, shifted


def artefact_reason(analyte, timepoint, value):
    if timepoint != "R+45" or value is None:
        return None
    if analyte == "glucose" and value < 50:
        return "R+45 glucose under 50 mg/dL"
    if analyte == "potassium" and value > 5.5:
        return "R+45 potassium over 5.5 mmol/L"
    return None


def outside_range(value, low, high):
    if value is None or low is None or high is None:
        return None
    return bool(value < low or value > high)


def build():
    cbc_rows = load_rows(CBC_PATH)
    cmp_rows = load_rows(CMP_PATH)
    if len(cbc_rows) != 28 or len(cmp_rows) != 28:
        raise RuntimeError(f"expected 28 CBC and 28 CMP rows, got {len(cbc_rows)} and {len(cmp_rows)}")

    cbc, shifted = index_panel(cbc_rows, "cbc")
    cmp_idx, cmp_shifted = index_panel(cmp_rows, "cmp")
    if cmp_shifted:
        raise RuntimeError("a CMP row looks column-shifted; this script only drops the known CBC row")
    if len(shifted) != 1 or shifted[0][0] != "C003" or shifted[0][1] != "L-92":
        described = [(c, t) for c, t, _ in shifted]
        raise RuntimeError(f"expected only C003 L-92 CBC to be shifted, found {described}")

    bad = shifted[0][2]
    exclusion = {
        "crew": "C003",
        "timepoint": "L-92",
        "panel": "cbc",
        "reason": "shifted columns",
        "evidence": {
            "absolute_neutrophils_cells_per_uL": num(bad["absolute_neutrophils_value_cells_per_microliter"]),
            "neutrophils_percent": num(bad["neutrophils_value_percent"]),
            "mpv_fL": num(bad["mpv_value_femtoliter"]),
            "platelets_thousand_per_uL": num(bad["platelet_count_value_thousand_per_microliter"]),
            "rdw_percent": num(bad["rdw_value_percent"]),
        },
    }

    # Chemistry at C003 L-92 is a normal row and stays in that baseline.
    for crew in CREW_IDS:
        for timepoint, _, _ in TIMEPOINTS:
            if (crew, timepoint) not in cmp_idx:
                raise RuntimeError(f"missing CMP {crew} {timepoint}")
            if (crew, timepoint) not in cbc and not (crew == "C003" and timepoint == "L-92"):
                raise RuntimeError(f"missing CBC {crew} {timepoint}")

    raw = []
    for spec in ANALYTES:
        panel = cbc if spec["panel"] == "cbc" else cmp_idx
        for crew in CREW_IDS:
            for timepoint, phase, day in TIMEPOINTS:
                excluded = spec["panel"] == "cbc" and crew == "C003" and timepoint == "L-92"
                if excluded:
                    raw.append({
                        "crew": crew,
                        "analyte": spec["key"],
                        "timepoint": timepoint,
                        "phase": phase,
                        "day": day,
                        "value": None,
                        "lab_min": None,
                        "lab_max": None,
                        "excluded": True,
                    })
                    continue
                row = panel[(crew, timepoint)]
                value = num(row[spec["value"]])
                low = num(row[spec["lo"]])
                high = num(row[spec["hi"]])
                if value is None or low is None or high is None:
                    raise RuntimeError(f"missing {spec['key']} value or range for {crew} {timepoint}")
                raw.append({
                    "crew": crew,
                    "analyte": spec["key"],
                    "timepoint": timepoint,
                    "phase": phase,
                    "day": day,
                    "value": value,
                    "lab_min": low,
                    "lab_max": high,
                    "excluded": False,
                })

    baselines = {}
    for crew in CREW_IDS:
        baselines[crew] = {}
        for spec in ANALYTES:
            points = [
                r for r in raw
                if r["crew"] == crew and r["analyte"] == spec["key"] and r["phase"] == "pre" and not r["excluded"]
            ]
            if len(points) < 2:
                raise RuntimeError(f"{crew} {spec['key']} has {len(points)} pre-flight values")
            values = [p["value"] for p in points]
            mean = statistics.fmean(values)
            sd = statistics.stdev(values)
            if sd <= 0:
                raise RuntimeError(f"{crew} {spec['key']} pre-flight sd is {sd}")
            baselines[crew][spec["key"]] = {
                "n": len(points),
                "timepoints": [p["timepoint"] for p in points],
                "mean": mean,
                "sd": sd,
                "values": values,
            }

    observations = []
    for record in raw:
        base = baselines[record["crew"]][record["analyte"]]
        obs = dict(record)
        obs["unit"] = BY_KEY[record["analyte"]]["unit"]
        if record["excluded"]:
            obs.update(artefact=False, artefact_reason=None, outside_lab_range=None,
                       pct_change=None, pct_of_baseline=None, z=None, far_from_baseline=None)
            observations.append(obs)
            continue
        mean, sd = base["mean"], base["sd"]
        z = (record["value"] - mean) / sd
        reason = artefact_reason(record["analyte"], record["timepoint"], record["value"])
        outside = outside_range(record["value"], record["lab_min"], record["lab_max"])
        # Round z the same way it is stored, then apply the cutoff, so the file agrees with itself.
        z_stored = round(z, 2)
        far = None
        if record["phase"] == "post" and reason is None:
            far = bool(outside is False and abs(z_stored) >= Z_FAR)
        obs.update(
            artefact=reason is not None,
            artefact_reason=reason,
            outside_lab_range=outside,
            pct_change=100.0 * (record["value"] - mean) / mean,
            pct_of_baseline=100.0 * record["value"] / mean,
            z=z_stored,
            far_from_baseline=far,
        )
        observations.append(obs)

    variation = {}
    for spec in ANALYTES:
        pieces = []
        per_crew = {}
        for crew in CREW_IDS:
            base = baselines[crew][spec["key"]]
            per_crew[crew] = {
                "n": base["n"],
                "mean": base["mean"],
                "sd": base["sd"],
                "cv_pct": 100.0 * base["sd"] / base["mean"],
            }
            pieces.append((base["n"] - 1, base["sd"]))
        df = sum(d for d, _ in pieces)
        pooled = math.sqrt(sum(d * sd ** 2 for d, sd in pieces) / df)
        variation[spec["key"]] = {"per_crew": per_crew, "df": df, "pooled_sd": pooled}

    return {
        "exclusion": exclusion,
        "baselines": baselines,
        "observations": observations,
        "variation": variation,
    }


def observation_payload(obs, baseline):
    payload = {
        "value": as_json_number(obs["value"]),
        "unit": obs["unit"],
        "lab_min": as_json_number(obs["lab_min"]),
        "lab_max": as_json_number(obs["lab_max"]),
        "outside_lab_range": obs["outside_lab_range"],
        "pct_change": None if obs["pct_change"] is None else round(obs["pct_change"], 1),
        "pct_of_baseline": None if obs["pct_of_baseline"] is None else round(obs["pct_of_baseline"], 1),
        "z": obs["z"],
        "far_from_baseline": obs["far_from_baseline"],
        "artefact": obs["artefact"],
        "excluded": obs["excluded"],
    }
    if obs["artefact"]:
        payload["artefact_reason"] = obs["artefact_reason"]
    if obs["excluded"]:
        payload["exclude_reason"] = "shifted columns"
    if baseline is not None and not obs["excluded"]:
        payload["baseline_n"] = baseline["n"]
    return payload


def flags_from(observations):
    flags = []
    for obs in observations:
        if obs["excluded"]:
            continue
        if obs["artefact"]:
            kind = "sample_handling_artefact"
        elif obs["far_from_baseline"]:
            kind = "inside_lab_far_from_baseline"
        elif obs["outside_lab_range"]:
            kind = "outside_lab_range"
        else:
            continue
        flags.append({
            "crew": obs["crew"],
            "timepoint": obs["timepoint"],
            "phase": obs["phase"],
            "analyte": obs["analyte"],
            "kind": kind,
            "value": as_json_number(obs["value"]),
            "unit": obs["unit"],
            "pct_change": None if obs["pct_change"] is None else round(obs["pct_change"], 1),
            "z": obs["z"],
            "lab_min": as_json_number(obs["lab_min"]),
            "lab_max": as_json_number(obs["lab_max"]),
        })
    order = {a["key"]: i for i, a in enumerate(ANALYTES)}
    flags.sort(key=lambda f: (order[f["analyte"]], f["crew"], TP_INDEX[f["timepoint"]]))
    return flags


def export_json(result, synthetic):
    flags = flags_from(result["observations"])
    crew = []
    for crew_id in CREW_IDS:
        baseline = {}
        for spec in ANALYTES:
            base = result["baselines"][crew_id][spec["key"]]
            baseline[spec["key"]] = {
                "n": base["n"],
                "timepoints": base["timepoints"],
                "mean": round(base["mean"], 4),
                "sd": round(base["sd"], 4),
                "unit": spec["unit"],
            }
        series = []
        for timepoint, phase, day in TIMEPOINTS:
            entry = {"timepoint": timepoint, "phase": phase, "day": day}
            for spec in ANALYTES:
                obs = next(
                    o for o in result["observations"]
                    if o["crew"] == crew_id and o["analyte"] == spec["key"] and o["timepoint"] == timepoint
                )
                entry[spec["key"]] = observation_payload(obs, result["baselines"][crew_id][spec["key"]])
            series.append(entry)
        crew.append({"id": crew_id, "baseline": baseline, "series": series})

    variation = {}
    for spec in ANALYTES:
        block = result["variation"][spec["key"]]
        variation[spec["key"]] = {
            "unit": spec["unit"],
            "pooled_within_person_sd": round(block["pooled_sd"], 4),
            "df": block["df"],
            "per_crew": {
                crew_id: {
                    "n": row["n"],
                    "mean": round(row["mean"], 4),
                    "sd": round(row["sd"], 4),
                    "cv_pct": round(row["cv_pct"], 1),
                }
                for crew_id, row in block["per_crew"].items()
            },
        }
    glucose = variation["glucose"]
    glucose["synthetic_day_to_day_sd"] = synthetic

    payload = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "schema_version": 1,
            "source": "NASA OSDR OSD-575",
            "mission": "Inspiration4",
            "simulated": False,
            "note": (
                "De-identified published CBC and chemistry for Inspiration4 crew C001–C004. "
                "Not the simulated AEGIS crew, and not an input to the live check-in scorer. "
                "Not medical advice. n = 4. Pre-flight and post-flight draws only; no in-flight sample. "
                "Baselines use 2 or 3 pre-flight draws."
            ),
            "timepoints": [
                {"id": tp, "phase": phase, "day": day} for tp, phase, day in TIMEPOINTS
            ],
            "day_meaning": (
                "L timepoints are days before launch and are stored negative. "
                "R timepoints are days after return and are stored positive. "
                "The mission sits between L-3 and R+1. This file has no in-flight sample, "
                "so day is not one continuous mission clock."
            ),
            "baseline_rule": "Mean of the available L timepoints for that person and analyte. C003 CBC uses L-44 and L-3 only.",
            "far_rule": (
                "far_from_baseline is true only for a post-flight value that is inside the lab range "
                "printed on that draw, is not an R+45 sample-handling artefact, and has "
                "|z| >= 2 with z = (value - pre-flight mean) / pre-flight sample sd. "
                "The sd uses n - 1 and has no floor. "
                "far_from_baseline is null for pre-flight draws, excluded rows, and artefacts."
            ),
            "artefact_rule": (
                "At R+45 only: glucose under 50 mg/dL, or potassium over 5.5 mmol/L. "
                "Treated as sample handling, not biology. Percent change is still reported."
            ),
            "exclusions": [result["exclusion"]],
            "counts": {
                "inside_lab_far_from_baseline": sum(f["kind"] == "inside_lab_far_from_baseline" for f in flags),
                "outside_lab_range": sum(f["kind"] == "outside_lab_range" for f in flags),
                "sample_handling_artefact": sum(f["kind"] == "sample_handling_artefact" for f in flags),
            },
        },
        "analytes": [
            {
                "key": spec["key"],
                "label": spec["label"],
                "unit": spec["unit"],
                "panel": spec["panel"],
                "column": spec["value"],
                **({"unit_note": spec["unit_note"]} if "unit_note" in spec else {}),
            }
            for spec in ANALYTES
        ],
        "flags": flags,
        "variation": variation,
        "crew": crew,
    }
    JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    JSON_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    json.loads(JSON_PATH.read_text(encoding="utf-8"))
    return payload


def fmt_value(analyte, value):
    if value is None:
        return "—"
    if analyte in ("lymphocytes", "neutrophils", "platelets"):
        return f"{value:.0f}"
    if analyte == "wbc":
        return f"{value:.1f}"
    return f"{value:.1f}" if analyte == "glucose" else f"{value:.2f}"


def fmt_stat(analyte, value):
    if analyte in ("lymphocytes", "neutrophils"):
        return f"{value:.0f}"
    if analyte in ("platelets", "wbc"):
        return f"{value:.1f}"
    return f"{value:.2f}"


def signed(value, digits):
    return f"{value:+.{digits}f}"


def select(observations, **query):
    found = []
    for obs in observations:
        if all(obs[key] == value for key, value in query.items()):
            found.append(obs)
    return found


def one(observations, **query):
    found = select(observations, **query)
    if len(found) != 1:
        raise RuntimeError(f"expected one observation for {query}, found {len(found)}")
    return found[0]


def render_markdown(result, synthetic):
    obs = result["observations"]
    var = result["variation"]
    far = [o for o in obs if o["far_from_baseline"]]
    artefacts = [o for o in obs if o["artefact"]]
    outside = [o for o in obs if o["outside_lab_range"] and not o["artefact"]]

    lymph_r1 = []
    for crew in CREW_IDS:
        row = one(obs, crew=crew, analyte="lymphocytes", timepoint="R+1")
        lymph_r1.append(f"{crew} {signed(row['pct_change'], 1)}% (z {signed(row['z'], 2)})")

    neut = select(obs, crew="C003", analyte="neutrophils")
    neut_post = [o for o in neut if o["phase"] == "post"]
    neut_pct = ", ".join(f"{o['timepoint']} {signed(o['pct_change'], 1)}% (z {signed(o['z'], 2)})" for o in neut_post)
    c003_neut = result["baselines"]["C003"]["neutrophils"]

    g_far = [o for o in far if o["analyte"] == "glucose"]
    g_bits = ", ".join(
        f"{o['crew']} {o['timepoint']} {fmt_value('glucose', o['value'])} mg/dL "
        f"({signed(o['pct_change'], 1)}%, z {signed(o['z'], 2)})"
        for o in g_far
    )

    glucose_sds = [var["glucose"]["per_crew"][c]["sd"] for c in CREW_IDS]
    stated = synthetic["stated_sd"]
    realized = synthetic["realized_sd"]

    lines = [
        "# Inspiration4 labs against each person's own baseline",
        "",
        "Published CBC and chemistry for four Inspiration4 crew, coded C001–C004 in NASA OSDR OSD-575. "
        "This is not the simulated AEGIS crew, and it is not medical advice.",
        "",
        "Each baseline is the mean of that person's L-92, L-44 and L-3 draws, except C003's blood counts, which use L-44 and L-3 only. "
        "Percent change is the post-flight value against that mean. "
        "A value is outside the lab range when it is below the minimum or above the maximum printed on that same row. "
        "A post-flight value is called far from baseline only when it is still inside that range and "
        f"|z| is at least {Z_FAR:.0f}, with z = (value − mean) / pre-flight sample sd. "
        "That is the same 2 SD idea as the app's amber flag. There is no sd floor. "
        "With two or three draws, a very small sd inflates z, so a flag is a description of this file, not a clinical alert.",
        "",
        "## What stands out",
        "",
        f"C003's neutrophils stay inside 1,500–7,800 cells/µL at every post-flight draw, and every one of those draws "
        f"is well below that person's own pre-flight pair. The two usable pre-flight counts average "
        f"{c003_neut['mean']:.0f} (sd {c003_neut['sd']:.0f}, n = 2, because L-92 was dropped). "
        f"Post-flight: {neut_pct}. "
        f"White cells move with them (pre-flight 9.3 and 9.8 ×10³/µL, post-flight 7.0 to 8.8), so that is one finding, not two. "
        f"The baseline is two high draws. The four later draws agree with each other, which is more than a single noisy point, "
        f"and it is still a two-point baseline.",
        "",
        f"Glucose gives the same kind of result on a tighter baseline, and it is the analyte the chart shares with the synthetic crew. "
        f"Inside the lab range and past 2 personal SD: {g_bits}. "
        f"C002's pre-flight glucose mean is {result['baselines']['C002']['glucose']['mean']:.1f} mg/dL "
        f"(sd {result['baselines']['C002']['glucose']['sd']:.1f}). "
        f"83 and 84 mg/dL are ordinary lab values and are high for this person. "
        f"No other in-range glucose point clears 2 SD. C003 at R+1 is 103 mg/dL, just above the printed maximum of 99, "
        f"so it is outside the lab range rather than an in-range personal flag.",
        "",
        f"Lymphocytes at R+1: {'; '.join(lymph_r1)}. "
        f"Three of the four crew are down 20–34%, and every lymphocyte count we kept is inside 850–3,900. "
        f"None of those drops reach 2 personal SD. Pre-flight lymphocyte CVs are already "
        + ", ".join(
            f"{crew} {var['lymphocytes']['per_crew'][crew]['cv_pct']:.0f}%"
            for crew in CREW_IDS
        )
        + ". A large percent change is not a personal alert when the person already moves that much across three draws.",
        "",
        "The R+45 chemistry draw is not usable as biology for three glucoses and one potassium. "
        + "; ".join(
            f"{o['crew']} glucose {fmt_value('glucose', o['value'])} mg/dL"
            for o in artefacts if o["analyte"] == "glucose"
        )
        + ", all under 50. "
        + "; ".join(
            f"{o['crew']} potassium is {fmt_value('potassium', o['value'])} mmol/L on that same draw"
            for o in artefacts if o["analyte"] == "potassium"
        )
        + ", so C004 shows both signs. C001's glucose is 84 mg/dL and is kept, and the other potassiums on that draw are 4.0, 4.1 and 4.4. "
        "Three glucoses collapsing together, one of them with a high potassium, is what happens when cells sit in the tube: "
        "they consume glucose and can leak potassium. "
        "Those four values are flagged and are not read as hypoglycemia or hyperkalemia. Percent change is still in the JSON.",
        "",
        "## Inside the lab range, at least 2 personal SD away",
        "",
        "Sorted in analyte order. WBC is listed under neutrophils because it is the same C003 shift. "
        "Potassium, hemoglobin, calcium and some platelet flags sit on pre-flight sds of a few tenths, "
        "so |z| ≥ 2 can be a few tenths of a unit. Those are in the table so nothing is hidden. They are not the headline.",
        "",
        "| Crew | Analyte | Draw | Value | Mean | Change | z | Lab range |",
        "|---|---|---|---:|---:|---:|---:|---|",
    ]
    for row in far:
        base = result["baselines"][row["crew"]][row["analyte"]]
        lines.append(
            f"| {row['crew']} | {BY_KEY[row['analyte']]['label']} | {row['timepoint']} | "
            f"{fmt_value(row['analyte'], row['value'])} | {fmt_stat(row['analyte'], base['mean'])} | "
            f"{signed(row['pct_change'], 1)}% | {signed(row['z'], 2)} | "
            f"{fmt_value(row['analyte'], row['lab_min'])}–{fmt_value(row['analyte'], row['lab_max'])} |"
        )

    lines += [
        "",
        "C003 platelets at R+194 are 185 ×10³/µL against a pre-flight pair near 350, inside 140–400. "
        "R+1, R+45 and R+82 were 359, 396 and 345, so this is one late draw, not a change that starts at landing.",
        "",
        "## Outside the printed lab range, and not an R+45 handling flag",
        "",
        "| Crew | Analyte | Draw | Value | Lab range | Change vs own mean |",
        "|---|---|---|---:|---|---:|",
    ]
    for row in outside:
        lines.append(
            f"| {row['crew']} | {BY_KEY[row['analyte']]['label']} | {row['timepoint']} | "
            f"{fmt_value(row['analyte'], row['value'])} | "
            f"{fmt_value(row['analyte'], row['lab_min'])}–{fmt_value(row['analyte'], row['lab_max'])} | "
            f"{signed(row['pct_change'], 1)}% |"
        )
    lines += [
        "",
        "C002 hemoglobin at 11.5 g/dL is 0.2 below a minimum of 11.7, on L-3 and again at R+82. "
        "C004 glucose at L-92 is 100 against a maximum of 99. Those are at the edge of the printed interval. "
        "C004 at L-3 (56 mg/dL) and C003 at L-44 (62 mg/dL) are clearer pre-flight lows, and both stay in the baseline. "
        "C004's pre-flight glucose runs from 56 to 100, which is why that person's sd is 22 mg/dL and almost nothing post-flight looks extreme in z.",
        "",
        "## Sample-handling flags",
        "",
        "| Crew | Analyte | Draw | Value | Lab range | Change vs own mean | Rule |",
        "|---|---|---|---:|---|---:|---|",
    ]
    for row in artefacts:
        lines.append(
            f"| {row['crew']} | {BY_KEY[row['analyte']]['label']} | {row['timepoint']} | "
            f"{fmt_value(row['analyte'], row['value'])} | "
            f"{fmt_value(row['analyte'], row['lab_min'])}–{fmt_value(row['analyte'], row['lab_max'])} | "
            f"{signed(row['pct_change'], 1)}% | {row['artefact_reason']} |"
        )

    lines += [
        "",
        "## Pre-flight variation, and the synthetic glucose sd",
        "",
        "The sd is the sample standard deviation of the L draws (n − 1). "
        "The pooled sd is the square root of the average variance, weighted by n − 1. "
        "C003's CBC analytes have n = 2. Every chemistry analyte, and the other crew's CBC, has n = 3. "
        "L-92, L-44 and L-3 are 48 days and then 41 days apart, so this is visit-to-visit scatter, not day-to-day scatter.",
        "",
        "| Analyte | Unit | C001 | C002 | C003 | C004 | Pooled sd |",
        "|---|---|---:|---:|---:|---:|---:|",
    ]
    for spec in ANALYTES:
        block = var[spec["key"]]
        cells = []
        for crew in CREW_IDS:
            row = block["per_crew"][crew]
            cells.append(f"{fmt_stat(spec['key'], row['sd'])} ({row['cv_pct']:.0f}%, n={row['n']})")
        lines.append(
            f"| {spec['label']} | {spec['unit']} | " + " | ".join(cells) +
            f" | {fmt_stat(spec['key'], block['pooled_sd'])} |"
        )

    realized_txt = ", ".join(f"{crew} {sd:.2f}" for crew, sd in realized)
    lines += [
        "",
        f"Glucose is the only analyte in both this file and the synthetic daily model. "
        f"Pooled Inspiration4 pre-flight sd: {var['glucose']['pooled_sd']:.2f} mg/dL "
        f"({var['glucose']['df']} degrees of freedom). "
        f"The four person sds are {', '.join(f'{sd:.2f}' for sd in glucose_sds)} mg/dL. "
        f"The synthetic crew is built with a day-to-day sd of {stated:.2f} mg/dL for each astronaut. "
        f"On the continuous 75-day draws the realized sds are {realized_txt}.",
        "",
        "A daily sd should be smaller than a weeks-apart sd when glucose wanders. "
        f"{stated:.0f} mg/dL is a little higher than C002's weeks-apart sd ({glucose_sds[1]:.1f}) and lower than "
        f"C001 ({glucose_sds[0]:.1f}) and C003 ({glucose_sds[2]:.1f}). "
        f"It is far below C004 ({glucose_sds[3]:.1f}), whose baseline already includes 56 and 100 mg/dL. "
        "The awkward comparison is C002: a daily sd that already matches a six-week sd is, if anything, slightly wide. "
        "It is not wide enough, on four people and three draws with two of C004's points outside 65–99, to retune. "
        "The generator was not changed. The same comparison is appended to `synthetic_crew.md`.",
        "",
        "## The chart",
        "",
        "`ml/results/slide_real_crew.png` is lymphocytes and glucose, one panel per person, as a percent of that person's pre-flight mean. "
        "The blue band is the printed lab range on that scale. The amber band is ±2 pre-flight SD. "
        "Amber points are inside the lab range and outside the personal band. "
        "On this chart those points are C002 glucose at R+1 and R+194. No lymphocyte point leaves the amber band. "
        "Red crosses are outside the lab range. Grey crosses are the R+45 glucose flags and are not connected.",
        "",
        "## Caveats",
        "",
        "- n = 4. Four people cannot carry a population claim.",
        "- The file is pre-flight and post-flight only. There is no in-flight sample, so a landing-day value cannot be separated from what happened during the flight.",
        "- Baselines are three draws, or two for C003's blood counts. A 2 SD line from two or three points is wide and unstable.",
        "- The pre-flight draws are weeks apart (48 days, then 41). The sd mixes assay noise with real change over about three months. It is not the day-to-day sd the synthetic crew uses.",
        "- Lymphocytes and neutrophils are absolute counts. Percentages were not used, because a percent moves when the other lineage moves.",
        "- The printed reference interval is not the same for every crew member. For C003 it also changes at R+1 on several analytes (hemoglobin's interval goes from 13.2–17.1 to 11.7–15.5 g/dL). Glucose stays 65–99 and lymphocytes stay 850–3,900, so those two bands do not move. Out-of-range always uses the interval on that row.",
        "- Fasting status is not in the file. The glucose interval 65–99 mg/dL is a fasting interval.",
        "- The hemoglobin source column is named `hemoglobin_value_percent`. The values are g/dL. Hematocrit, which is the percent, is not in this analysis.",
        "- C003 L-92 CBC is dropped. The evidence it is shifted, not a real count: absolute neutrophils 10.1 cells/µL beside 71.1% neutrophils, MPV 330 fL, platelets 12.9 ×10³/µL, RDW 32.4%. The CMP row from that same draw is kept (glucose 77, potassium 3.7, calcium 9.3).",
        "- No sd floor. C002 potassium (sd 0.10 mmol/L), C004 hemoglobin (sd 0.20 g/dL) and C004 calcium (sd 0.10 mg/dL) produce |z| ≥ 2 from small absolute gaps. Those rows are in the table above and are easy to over-read.",
        "- Codes stay codes. This file does not attach names to C001–C004.",
        "",
    ]
    return "\n".join(lines)


def synthetic_glucose():
    """Read the fidelity table. Do not import or rerun the generator."""
    if not SYNTHETIC_MD.exists():
        raise RuntimeError(f"missing {SYNTHETIC_MD}")
    text = SYNTHETIC_MD.read_text(encoding="utf-8")
    # Only the fidelity table uses simulated ids c1–c3. The calibration section must not.
    stated, realized = [], []
    for line in text.splitlines():
        if CAL_START in line:
            break
        parts = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(parts) == 6 and parts[0] in ("c1", "c2", "c3") and parts[1] == "glucose":
            stated.append(float(parts[4]))
            realized.append((parts[0], float(parts[5])))
    if len(realized) != 3:
        raise RuntimeError(f"expected 3 synthetic glucose rows, found {len(realized)}")
    if max(stated) - min(stated) > 1e-9:
        raise RuntimeError(f"synthetic stated glucose sds differ: {stated}")
    return {"stated_sd": stated[0], "realized_sd": realized}


def upsert_calibration(result, synthetic):
    glucose = result["variation"]["glucose"]
    rows = []
    for crew in CREW_IDS:
        row = glucose["per_crew"][crew]
        rows.append(
            f"| {crew} | {row['n']} | {row['mean']:.2f} | {row['sd']:.2f} |"
        )
    realized = ", ".join(f"{crew} {sd:.2f}" for crew, sd in synthetic["realized_sd"])
    section = "\n".join([
        "## Calibration against Inspiration4 pre-flight glucose",
        "",
        "Added by `ml/real_crew.py`. The generator was not changed. "
        "If this file is rewritten by the synthetic crew script, run `python ml/real_crew.py` to put this section back.",
        "",
        "The daily model and the Inspiration4 labs share one metric: glucose, mg/dL. "
        "Lymphocytes, neutrophils, white cells, platelets, hemoglobin, potassium and calcium are not in the synthetic daily draw.",
        "",
        "Inspiration4 within-person sd, from the pre-flight draws only (L-92, L-44, L-3). "
        "Those draws are 48 days and then 41 days apart, so this is not a day-to-day sd.",
        "",
        "| Crew | n | Pre-flight mean | Pre-flight sd |",
        "|---|---:|---:|---:|",
        *rows,
        "",
        f"Pooled within-person sd: {glucose['pooled_sd']:.2f} mg/dL on {glucose['df']} degrees of freedom. "
        f"C004 (56, 83 and 100 mg/dL, two of them outside 65–99) dominates the pool.",
        "",
        f"Synthetic day-to-day sd, from the table above: stated {synthetic['stated_sd']:.2f} mg/dL for each astronaut. "
        f"Realized on the continuous 75-day draws: {realized}.",
        "",
        "A daily sd should sit at or below a weeks-apart sd. "
        f"The stated {synthetic['stated_sd']:.0f} mg/dL is a little higher than C002 "
        f"({glucose['per_crew']['C002']['sd']:.2f}) and lower than C001 "
        f"({glucose['per_crew']['C001']['sd']:.2f}) and C003 "
        f"({glucose['per_crew']['C003']['sd']:.2f}). It is much tighter than C004 "
        f"({glucose['per_crew']['C004']['sd']:.2f}). "
        "The C002 comparison is the awkward one: a daily sd that already matches a six-week sd is, if anything, slightly wide. "
        "That is a calibration check on four people and three draws. It is not a refit.",
        "",
    ])
    text = SYNTHETIC_MD.read_text(encoding="utf-8")
    block = f"{CAL_START}\n\n{section}{CAL_END}\n"
    if CAL_START in text and CAL_END in text:
        pre = text.split(CAL_START)[0].rstrip()
        post = text.split(CAL_END, 1)[1]
        if post.startswith("\n"):
            post = post[1:]
        updated = pre + "\n\n" + block + post
    else:
        updated = text.rstrip() + "\n\n" + block
    SYNTHETIC_MD.write_text(updated, encoding="utf-8")


def draw_slide(result):
    obs = result["observations"]
    fig, axes = plt.subplots(2, 4, figsize=(13.33, 7.5), dpi=160, sharex=True, sharey="row")
    fig.patch.set_facecolor("white")
    fig.suptitle(
        "Post-flight labs against each person's own pre-flight mean",
        x=0.05, ha="left", fontsize=18, color=INK, fontweight="medium",
    )
    fig.text(
        0.05, 0.925,
        "Inspiration4, NASA OSDR OSD-575. 100% is that person's pre-flight mean. Blue is the printed lab range. Amber is ±2 pre-flight SD.",
        ha="left", va="top", fontsize=11, color=MUTED,
    )

    chart_keys = ["lymphocytes", "glucose"]
    xs = list(range(len(TIMEPOINTS)))
    labels = [tp for tp, _, _ in TIMEPOINTS]

    for row_i, key in enumerate(chart_keys):
        for col_i, crew in enumerate(CREW_IDS):
            ax = axes[row_i, col_i]
            ax.set_facecolor("white")
            ax.spines["top"].set_visible(False)
            ax.spines["right"].set_visible(False)
            ax.spines["left"].set_color("#d0d5dd")
            ax.spines["bottom"].set_color("#d0d5dd")
            ax.tick_params(colors=INK, labelsize=8, length=0)
            ax.yaxis.grid(True, color=GRID, linewidth=1)
            ax.set_axisbelow(True)
            ax.axhline(100, color=INK, linewidth=0.8, zorder=2)
            ax.axvline(2.5, color="#d0d5dd", linewidth=1, zorder=1)

            base = result["baselines"][crew][key]
            mean, sd = base["mean"], base["sd"]
            series = [
                one(obs, crew=crew, analyte=key, timepoint=tp)
                for tp, _, _ in TIMEPOINTS
            ]
            usable = [o for o in series if not o["excluded"]]
            lab_lo = 100.0 * min(o["lab_min"] for o in usable) / mean
            lab_hi = 100.0 * max(o["lab_max"] for o in usable) / mean
            band_lo = 100.0 * (mean - Z_FAR * sd) / mean
            band_hi = 100.0 * (mean + Z_FAR * sd) / mean
            ax.fill_between(xs, lab_lo, lab_hi, color=LAB_FILL, zorder=0, linewidth=0)
            ax.fill_between(xs, band_lo, band_hi, color=BAND_FILL, zorder=1, linewidth=0)
            ax.plot(xs, [band_lo] * len(xs), color=AMBER, linewidth=0.7, alpha=0.9, zorder=2)
            ax.plot(xs, [band_hi] * len(xs), color=AMBER, linewidth=0.7, alpha=0.9, zorder=2)

            run = []

            def flush():
                if len(run) >= 2:
                    ax.plot([p[0] for p in run], [p[1] for p in run], color=NAVY, linewidth=1.5, zorder=3)
                run.clear()

            for x, item in zip(xs, series):
                if item["excluded"] or item["artefact"] or item["pct_of_baseline"] is None:
                    flush()
                    if item["artefact"]:
                        ax.scatter(
                            [x], [item["pct_of_baseline"]], marker="x", s=36, color=GREY,
                            linewidths=1.4, zorder=4,
                        )
                    continue
                y = item["pct_of_baseline"]
                run.append((x, y))
                if item["outside_lab_range"]:
                    ax.scatter([x], [y], marker="x", s=36, color=RED, linewidths=1.4, zorder=4)
                elif item["far_from_baseline"]:
                    ax.scatter(
                        [x], [y], marker="o", s=42, color=AMBER, edgecolors=INK,
                        linewidths=0.6, zorder=5,
                    )
                    ax.annotate(
                        f"{item['pct_change']:+.0f}%",
                        (x, y), textcoords="offset points", xytext=(0, 7),
                        ha="center", va="bottom", fontsize=7.5, color=AMBER,
                    )
                else:
                    ax.scatter([x], [y], marker="o", s=22, color=NAVY, zorder=4)
            flush()

            ax.set_xlim(-0.45, len(xs) - 0.55)
            if row_i == 0:
                ax.set_title(crew, fontsize=12, color=INK, pad=4)
            if col_i == 0:
                ax.set_ylabel(f"{BY_KEY[key]['short']}\n% of own baseline", fontsize=9, color=INK)
            if key == "lymphocytes" and crew == "C003":
                ax.text(
                    0, 0.04, "L-92 CBC\nexcluded", transform=ax.get_xaxis_transform(),
                    ha="center", va="bottom", fontsize=6.5, color=MUTED,
                )

    for ax in axes[1]:
        ax.set_xticks(xs, labels, rotation=40, ha="right", fontsize=7.5)
    for ax in axes[0]:
        ax.tick_params(labelbottom=False)

    # Shared row limits, after the artists exist, including bands and artefact crosses.
    for row_i in (0, 1):
        lows, highs = [], []
        for ax in axes[row_i]:
            for collection in ax.collections:
                # fill_between paths are not needed; use line and fill data via ylim candidates below.
                pass
            lows.append(ax.dataLim.y0)
            highs.append(ax.dataLim.y1)
        pad = 0.08 * (max(highs) - min(lows))
        axes[row_i, 0].set_ylim(min(lows) - pad, max(highs) + pad)

    handles = [
        plt.Line2D([0], [0], color=NAVY, marker="o", linewidth=1.5, markersize=5, label="Measured"),
        plt.matplotlib.patches.Patch(facecolor=LAB_FILL, edgecolor="none", label="Lab range"),
        plt.matplotlib.patches.Patch(facecolor=BAND_FILL, edgecolor=AMBER, linewidth=0.6, label="±2 pre-flight SD"),
        plt.Line2D([0], [0], color=AMBER, marker="o", linestyle="None", markeredgecolor=INK, markersize=6,
                   label="Inside lab range, ≥2 personal SD"),
        plt.Line2D([0], [0], color=RED, marker="x", linestyle="None", markersize=6, label="Outside lab range"),
        plt.Line2D([0], [0], color=GREY, marker="x", linestyle="None", markersize=6, label="R+45 handling flag"),
    ]
    fig.legend(
        handles=handles, loc="lower center", bbox_to_anchor=(0.5, 0.055),
        ncol=3, frameon=False, fontsize=8.5,
    )
    fig.text(
        0.05, 0.012,
        "Amber points: C002 glucose at R+1 and R+194. No lymphocyte point leaves the amber band. "
        "Grey crosses are R+45 glucose under 50 mg/dL and are not connected. The vertical line splits pre-flight from post-flight.",
        ha="left", va="bottom", fontsize=8.5, color=MUTED,
    )
    fig.subplots_adjust(left=0.07, right=0.985, top=0.86, bottom=0.20, hspace=0.28, wspace=0.28)
    RESULTS.mkdir(parents=True, exist_ok=True)
    fig.savefig(RESULTS / "slide_real_crew.png")
    plt.close(fig)


def check(result, synthetic):
    obs = result["observations"]
    far = [o for o in obs if o["far_from_baseline"]]
    artefacts = [o for o in obs if o["artefact"]]
    if sum(o["analyte"] == "lymphocytes" for o in far) != 0:
        raise RuntimeError("a lymphocyte point was marked far; the pre-flight scatter should contain those drops")
    glucose_far = {(o["crew"], o["timepoint"]) for o in far if o["analyte"] == "glucose"}
    if glucose_far != {("C002", "R+1"), ("C002", "R+194")}:
        raise RuntimeError(f"unexpected in-range glucose flags: {glucose_far}")
    neut_far = [o["timepoint"] for o in far if o["crew"] == "C003" and o["analyte"] == "neutrophils"]
    if neut_far != POST:
        raise RuntimeError(f"C003 neutrophil flags should be every post-flight draw, got {neut_far}")
    glucose_art = sorted(o["crew"] for o in artefacts if o["analyte"] == "glucose")
    potassium_art = [(o["crew"], o["timepoint"]) for o in artefacts if o["analyte"] == "potassium"]
    if glucose_art != ["C002", "C003", "C004"] or potassium_art != [("C004", "R+45")]:
        raise RuntimeError(f"artefacts glucose={glucose_art} potassium={potassium_art}")
    kept = one(obs, crew="C001", analyte="glucose", timepoint="R+45")
    if kept["artefact"] or kept["value"] != 84:
        raise RuntimeError("C001 R+45 glucose should be kept")
    pooled = result["variation"]["glucose"]["pooled_sd"]
    if not 12 < pooled < 13:
        raise RuntimeError(f"pooled glucose sd {pooled} is outside the expected band")
    if abs(synthetic["stated_sd"] - 5) > 1e-9:
        raise RuntimeError(f"synthetic stated glucose sd is {synthetic['stated_sd']}, expected 5")
    hemo = [o["value"] for o in obs if o["analyte"] == "hemoglobin" and o["value"] is not None]
    if min(hemo) < 10 or max(hemo) > 20:
        raise RuntimeError("hemoglobin values are not in the g/dL range; the column may no longer be mislabeled that way")
    # Other low glucoses and high potassiums must not be hiding outside the R+45 rule.
    for o in obs:
        if o["excluded"] or o["value"] is None:
            continue
        if o["analyte"] == "glucose" and o["value"] < 50 and o["timepoint"] != "R+45":
            raise RuntimeError(f"glucose under 50 outside R+45: {o['crew']} {o['timepoint']}")
        if o["analyte"] == "potassium" and o["value"] > 5.5 and not o["artefact"]:
            raise RuntimeError(f"potassium over 5.5 was not flagged: {o['crew']} {o['timepoint']}")


def main():
    if not CBC_PATH.exists() or not CMP_PATH.exists():
        raise RuntimeError(f"expected {CBC_PATH} and {CMP_PATH}")
    synthetic = synthetic_glucose()
    result = build()
    check(result, synthetic)
    payload = export_json(result, {
        "stated_mg_dl": synthetic["stated_sd"],
        "realized_mg_dl": [{"crew": crew, "sd": sd} for crew, sd in synthetic["realized_sd"]],
        "note": (
            "Stated and realized day-to-day sds from ml/results/synthetic_crew.md. "
            "Inspiration4 sds are weeks-apart pre-flight draws, not day-to-day."
        ),
    })
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "real_crew.md").write_text(render_markdown(result, synthetic), encoding="utf-8")
    upsert_calibration(result, synthetic)
    draw_slide(result)
    counts = payload["meta"]["counts"]
    print(
        f"far={counts['inside_lab_far_from_baseline']} "
        f"outside={counts['outside_lab_range']} "
        f"artefacts={counts['sample_handling_artefact']}"
    )
    print(f"Wrote {RESULTS / 'real_crew.md'}")
    print(f"Wrote {RESULTS / 'slide_real_crew.png'}")
    print(f"Wrote {JSON_PATH}")
    print(f"Updated {SYNTHETIC_MD}")


if __name__ == "__main__":
    main()
