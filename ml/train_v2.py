"""v2 candidate, evaluated on validation only. Does not load flares from 2024 onward.

    python ml/train_v2.py

Two changes to v1, fixed before scoring (v2 = both together, nothing tuned):
1. GOES flux harmonisation. GOES-8..15 X-ray fluxes carry a 0.7 scaling that
   GOES-16+ drop, so the same flare reads ~1.43x larger from 2020 on. Training
   (mostly <=2017) and validation (2022-23) sit on different scales. Pre-2018
   fluxes are divided by 0.7. 2018-2019 have no M/X flares, so the exact switch
   date does not matter.
2. Magnetic connectivity. Linear longitude keeps rising past the limb; the EDA
   rate peaks at 30-90W and falls over the limb. Replace it with cos(lon - 60 deg),
   centred on the nominal Parker-spiral footpoint (W60, physics, not fitted).

Everything else matches v1: logistic regression, C=10, no class weights, same
CME features, train-only fit, train+val climatology, same threshold rules.

Acceptance rule set before running: v2 replaces v1 only if validation Brier
skill improves by more than 0.02 AND the warning hit rate does not drop.
"""
from __future__ import annotations

import json
import pickle

import numpy as np
import pandas as pd

from train_v1 import (MODELS, RESULTS, WARNING_HIT, WATCH_HIT, design_matrix as v1_design,
                      highest_threshold, lead_times, logistic, predict, reliability,
                      skill, brier, split_frames)
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

GOES_SCALE = 0.7
GOES16_FROM_YEAR = 2018
FOOTPOINT_DEG = 60.0
C = 10.0
MIN_GAIN = 0.02
FEATURES = ["log10_class_flux", "connectivity", "has_linked_cme", "log10_cme_speed"]
NUMERIC = ["log10_class_flux", "connectivity", "log10_cme_speed"]


def design_matrix(df: pd.DataFrame, harmonise=True, connect=True) -> pd.DataFrame:
    x = v1_design(df)
    if harmonise:
        old = (df["peak_time"].dt.year < GOES16_FROM_YEAR).to_numpy()
        x.loc[old, "log10_class_flux"] -= np.log10(GOES_SCALE)
    if connect:
        x["connectivity"] = np.cos(np.radians(df["longitude_deg"].astype(float) - FOOTPOINT_DEG))
        return x[FEATURES]
    return x


def model(numeric: list[str]) -> Pipeline:
    pre = ColumnTransformer([
        ("num", Pipeline([("impute", SimpleImputer(strategy="median")),
                          ("scale", StandardScaler())]), numeric),
        ("flag", "passthrough", ["has_linked_cme"]),
    ])
    return Pipeline([("pre", pre), ("clf", LogisticRegression(C=C, max_iter=1000))])


def run(train, val, p_clim, harmonise, connect, numeric):
    m = model(numeric)
    m.fit(design_matrix(train, harmonise, connect), train["y"].astype(int))
    p = predict(m, design_matrix(val, harmonise, connect))
    return m, p, skill(val["y"].astype(int).to_numpy(), p, p_clim)


def main() -> None:
    train, val = split_frames()
    y_tr, y_val = train["y"].astype(int).to_numpy(), val["y"].astype(int).to_numpy()
    p_clim = float(np.concatenate([y_tr, y_val]).mean())
    v1_num = ["log10_class_flux", "longitude_deg", "log10_cme_speed"]

    _, p_v1, bss_v1 = run(train, val, p_clim, False, False, v1_num)
    m_v2, p_v2, bss_v2 = run(train, val, p_clim, True, True, NUMERIC)
    # Ablations, information only (not candidates).
    _, _, bss_h = run(train, val, p_clim, True, False, v1_num)
    _, _, bss_c = run(train, val, p_clim, False, True, NUMERIC)

    def cuts(p):
        pred = val[["flare_id", "linked_goes10_ids", "linked_goes10_onset"]].copy()
        pred["peak_time"] = val["peak_time"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        pred["issue_time"] = val["issue_time"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        pred["y"], pred["p"] = y_val, p
        out = {}
        for name, target in (("watch", WATCH_HIT), ("warning", WARNING_HIT)):
            row = highest_threshold(y_val, p, target)
            row["lead_time"] = lead_times(pred, row["threshold"])
            out[name] = row
        return out

    c_v1, c_v2 = cuts(p_v1), cuts(p_v2)
    gain = bss_v2 - bss_v1
    accept = gain > MIN_GAIN and c_v2["warning"]["hit_rate"] >= c_v1["warning"]["hit_rate"]
    result = {
        "rule": f"accept if BSS gain > {MIN_GAIN} and warning hit rate does not drop",
        "climatology_rate_train_val": p_clim,
        "brier_v1": brier(y_val, p_v1), "brier_v2": brier(y_val, p_v2),
        "bss_v1": bss_v1, "bss_v2": bss_v2, "bss_gain": gain,
        "ablation_bss": {"harmonise_only": bss_h, "connectivity_only": bss_c},
        "cuts_v1": c_v1, "cuts_v2": c_v2,
        "reliability_v2": reliability(y_val, p_v2),
        "accepted": bool(accept),
    }
    (RESULTS / "v2_evaluation.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({k: result[k] for k in ("bss_v1", "bss_v2", "bss_gain", "ablation_bss", "accepted")}, indent=2))
    for v, c in (("v1", c_v1), ("v2", c_v2)):
        for k in ("watch", "warning"):
            r = c[k]
            print(v, k, round(r["threshold"], 4), r["storms_caught"], round(r["false_alarms_per_month"], 3),
                  round(r["precision"], 3), r["lead_time"]["median_lead_time_h"], r["lead_time"]["events_caught"],
                  r["lead_time"]["median_event_lead_time_h"])

    if not accept:
        print("v2 rejected: v1 stays final. Nothing saved to ml/models.")
        return
    with (MODELS / "v2.pkl").open("wb") as fh:
        pickle.dump({"label": "sep_linked_goes10", "estimator": m_v2, "features": FEATURES,
                     "goes_scale": GOES_SCALE, "goes16_from_year": GOES16_FROM_YEAR,
                     "footpoint_deg": FOOTPOINT_DEG, "params": {"C": C},
                     "climatology_rate_train_val": p_clim, "brier_skill_validation": bss_v2,
                     "thresholds": {k: c_v2[k]["threshold"] for k in c_v2}, "test_scored": False}, fh)
    print("Saved v2.pkl")


if __name__ == "__main__":
    main()
