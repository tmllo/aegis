"""Fit v1 on the development set. Does not load flares from 2024 onward.

    python ml/train_v1.py fit
    python ml/train_v1.py thresholds
    python ml/train_v1.py save

Climatology uses the storm rate on train and validation together.
Logistic regression and gradient boosting are fit on train only.
The grid, the model choice, and the thresholds use validation only.
"""
from __future__ import annotations

import json
import pickle
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from devset import ROOT, load_development_set

RESULTS = ROOT / "ml" / "results"
MODELS = ROOT / "ml" / "models"
FEATURES = ["log10_class_flux", "longitude_deg", "has_linked_cme", "log10_cme_speed"]
NUMERIC = ["log10_class_flux", "longitude_deg", "log10_cme_speed"]
CLOSE_BSS = 0.02
VAL_MONTHS = 24
WATCH_HIT = 0.95
WARNING_HIT = 0.80
RANDOM_STATE = 7


def design_matrix(df: pd.DataFrame) -> pd.DataFrame:
    speed = df["cme_speed_kms"].astype(float)
    x = pd.DataFrame({
        "log10_class_flux": np.log10(df["class_flux"].astype(float)),
        "longitude_deg": df["longitude_deg"].astype(float),
        "has_linked_cme": df["has_linked_cme"].astype(float),
        "log10_cme_speed": np.where(speed > 0, np.log10(speed), np.nan),
    })
    return x[FEATURES]


def brier(y, p) -> float:
    return float(brier_score_loss(y, p))


def skill(y, p, p_ref: float) -> float:
    base = brier(y, np.full(len(y), p_ref))
    if base == 0:
        raise RuntimeError("climatology Brier score is zero")
    return 1.0 - brier(y, p) / base


def logistic(C: float) -> Pipeline:
    pre = ColumnTransformer([
        ("num", Pipeline([
            ("impute", SimpleImputer(strategy="median")),
            ("scale", StandardScaler()),
        ]), NUMERIC),
        ("flag", "passthrough", ["has_linked_cme"]),
    ])
    clf = LogisticRegression(C=C, class_weight=None, solver="lbfgs", max_iter=1000)
    return Pipeline([("pre", pre), ("clf", clf)])


def boosting(learning_rate: float, max_depth: int, min_samples_leaf: int) -> HistGradientBoostingClassifier:
    return HistGradientBoostingClassifier(
        learning_rate=learning_rate,
        max_depth=max_depth,
        max_iter=200,
        min_samples_leaf=min_samples_leaf,
        early_stopping=False,
        class_weight=None,
        random_state=RANDOM_STATE,
    )


def predict(model, x: pd.DataFrame) -> np.ndarray:
    return model.predict_proba(x)[:, 1]


def simpler_key(kind: str) -> int:
    return {"climatology": 0, "logistic": 1, "boosting": 2}[kind]


def choose(rows: list[dict]) -> dict:
    best = max(rows, key=lambda r: r["brier_skill"])
    near = [r for r in rows if r["brier_skill"] >= best["brier_skill"] - CLOSE_BSS]
    return sorted(near, key=lambda r: (simpler_key(r["kind"]), -r["brier_skill"]))[0]


def split_frames():
    dev = load_development_set()
    if set(dev["split"]) != {"train", "val"}:
        raise RuntimeError(f"unexpected splits: {set(dev['split'])}")
    train = dev[dev["split"] == "train"].reset_index(drop=True)
    val = dev[dev["split"] == "val"].reset_index(drop=True)
    if train["peak_time"].dt.year.max() > 2021 or val["peak_time"].dt.year.min() < 2022:
        raise RuntimeError("train/validation boundary is wrong")
    if val["peak_time"].dt.year.max() > 2023:
        raise RuntimeError("validation contains a test year")
    return train, val


def stage_fit() -> None:
    RESULTS.mkdir(parents=True, exist_ok=True)
    train, val = split_frames()
    x_train, y_train = design_matrix(train), train["y"].astype(int).to_numpy()
    x_val, y_val = design_matrix(val), val["y"].astype(int).to_numpy()
    # Train + validation rate, as specified. Not the training rate alone.
    p_clim = float(np.concatenate([y_train, y_val]).mean())
    rows = [{
        "name": "climatology",
        "kind": "climatology",
        "params": {"rate": p_clim},
        "brier": brier(y_val, np.full(len(y_val), p_clim)),
        "brier_skill": 0.0,
    }]
    fitted = {}

    for C in (0.01, 0.1, 1.0, 10.0):
        model = logistic(C)
        model.fit(x_train, y_train)
        p = predict(model, x_val)
        name = f"logistic_C{C:g}"
        rows.append({
            "name": name,
            "kind": "logistic",
            "params": {"C": C, "class_weight": None},
            "brier": brier(y_val, p),
            "brier_skill": skill(y_val, p, p_clim),
        })
        fitted[name] = model

    for lr in (0.05, 0.1):
        for depth in (2, 3):
            for leaf in (20, 40):
                model = boosting(lr, depth, leaf)
                model.fit(x_train, y_train)
                p = predict(model, x_val)
                name = f"hgb_lr{lr:g}_depth{depth}_leaf{leaf}"
                rows.append({
                    "name": name,
                    "kind": "boosting",
                    "params": {
                        "learning_rate": lr,
                        "max_depth": depth,
                        "min_samples_leaf": leaf,
                        "max_iter": 200,
                        "class_weight": None,
                    },
                    "brier": brier(y_val, p),
                    "brier_skill": skill(y_val, p, p_clim),
                })
                fitted[name] = model

    winner = choose(rows)
    if winner["kind"] == "climatology":
        model = {"kind": "climatology", "rate": p_clim}
        p_val = np.full(len(y_val), p_clim)
    else:
        model = fitted[winner["name"]]
        p_val = predict(model, x_val)

    importance = []
    coefficients = []
    if winner["kind"] != "climatology":
        perm = permutation_importance(
            model, x_val, y_val, scoring="neg_brier_score",
            n_repeats=20, random_state=RANDOM_STATE,
        )
        for feature, mean, std in zip(FEATURES, perm.importances_mean, perm.importances_std):
            importance.append({
                "feature": feature,
                "val_brier_increase": round(float(mean), 6),
                "std": round(float(std), 6),
            })
        importance.sort(key=lambda r: -r["val_brier_increase"])
        if winner["kind"] == "logistic":
            coefs = model.named_steps["clf"].coef_.ravel()
            names = NUMERIC + ["has_linked_cme"]
            coefficients = [{"feature": n, "standardized_coefficient": round(float(c), 4)} for n, c in zip(names, coefs)]

    west = val["longitude_deg"] > 0
    direction = {
        "val_mean_p_east": round(float(p_val[~west.to_numpy()].mean()), 4),
        "val_mean_p_west": round(float(p_val[west.to_numpy()].mean()), 4),
        "val_storm_rate_east": round(float(y_val[~west.to_numpy()].mean()), 4),
        "val_storm_rate_west": round(float(y_val[west.to_numpy()].mean()), 4),
    }

    payload = {
        "label": "sep_linked_goes10",
        "fit_on": "train peak years <= 2021",
        "climatology_rate_train_val": p_clim,
        "close_brier_skill": CLOSE_BSS,
        "features": FEATURES,
        "n_train": int(len(train)),
        "n_train_storms": int(y_train.sum()),
        "n_val": int(len(val)),
        "n_val_storms": int(y_val.sum()),
        "grid": rows,
        "winner": winner,
        "coefficients": coefficients,
        "direction_check": direction,
    }
    (RESULTS / "model_selection.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    pd.DataFrame(importance).to_csv(RESULTS / "feature_importance_v1.csv", index=False)
    pred = pd.DataFrame({
        "flare_id": val["flare_id"],
        "peak_time": val["peak_time"].dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "y": y_val,
        "p": p_val,
        "linked_goes10_onset": val["linked_goes10_onset"],
    })
    pred.to_csv(RESULTS / "val_predictions.csv", index=False)
    with (RESULTS / "fitted_candidate.pkl").open("wb") as fh:
        pickle.dump({"estimator": model, "features": FEATURES, "winner": winner, "p_clim": p_clim}, fh)
    print(json.dumps({"winner": winner, "grid": rows, "importance": importance, "coefficients": coefficients, "direction": direction}, indent=2))


def rates(y: np.ndarray, p: np.ndarray, threshold: float) -> dict:
    pred = p >= threshold
    storm = y == 1
    tp = int((pred & storm).sum())
    fp = int((pred & ~storm).sum())
    fn = int((~pred & storm).sum())
    n_storm = int(storm.sum())
    hit = tp / n_storm if n_storm else None
    return {
        "threshold": float(threshold),
        "hit_rate": hit,
        "storms_caught": tp,
        "storms_missed": fn,
        "false_alarms": fp,
        "false_alarms_per_month": fp / VAL_MONTHS,
        "precision": (tp / (tp + fp)) if (tp + fp) else None,
    }


def highest_threshold(y: np.ndarray, p: np.ndarray, target: float) -> dict:
    for threshold in np.sort(np.unique(p))[::-1]:
        row = rates(y, p, float(threshold))
        if row["hit_rate"] is not None and row["hit_rate"] >= target:
            row["target"] = target
            return row
    raise RuntimeError(f"no threshold reaches hit rate {target}")


def lead_times(pred: pd.DataFrame, threshold: float) -> dict:
    hit = pred[(pred["y"] == 1) & (pred["p"] >= threshold)].copy()
    onset = pd.to_datetime(hit["linked_goes10_onset"], utc=True, errors="coerce")
    peak = pd.to_datetime(hit["peak_time"], utc=True)
    hours = (onset - peak).dt.total_seconds() / 3600
    known = hours.dropna()
    return {
        "hits": int(len(hit)),
        "hits_with_onset": int(len(known)),
        "median_lead_time_h": None if known.empty else round(float(known.median()), 2),
        "negative_lead_times": int((known < 0).sum()),
    }


def reliability(y: np.ndarray, p: np.ndarray, bins: int = 5) -> list[dict]:
    frame = pd.DataFrame({"y": y, "p": p})
    frame["bin"] = pd.qcut(frame["p"], q=bins, duplicates="drop")
    rows = []
    for interval, part in frame.groupby("bin", observed=True):
        rows.append({
            "bin": str(interval),
            "n": int(len(part)),
            "mean_p": round(float(part["p"].mean()), 4),
            "observed_rate": round(float(part["y"].mean()), 4),
        })
    return rows


def stage_thresholds() -> None:
    pred = pd.read_csv(RESULTS / "val_predictions.csv")
    y = pred["y"].to_numpy().astype(int)
    p = pred["p"].to_numpy().astype(float)
    if len(pred) == 0:
        raise RuntimeError("validation predictions are empty")
    watch = highest_threshold(y, p, WATCH_HIT)
    warning = highest_threshold(y, p, WARNING_HIT)
    watch["lead_time"] = lead_times(pred, watch["threshold"])
    warning["lead_time"] = lead_times(pred, warning["threshold"])
    curve = [rates(y, p, float(t)) for t in np.sort(np.unique(p))]
    out = {
        "validation_months": VAL_MONTHS,
        "month_window": ["2022-01", "2023-12"],
        "false_alarm_definition": "a non-storm flare with probability at or above the threshold, divided by 24 calendar months",
        "watch": watch,
        "warning": warning,
        "reliability": reliability(y, p),
        "curve": curve,
    }
    (RESULTS / "thresholds_v1.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    brief = {k: out[k] for k in ("watch", "warning", "reliability")}
    print(json.dumps(brief, indent=2))


def stage_save() -> None:
    MODELS.mkdir(parents=True, exist_ok=True)
    with (RESULTS / "fitted_candidate.pkl").open("rb") as fh:
        fitted = pickle.load(fh)
    selection = json.loads((RESULTS / "model_selection.json").read_text(encoding="utf-8"))
    thresholds = json.loads((RESULTS / "thresholds_v1.json").read_text(encoding="utf-8"))
    artifact = {
        "label": "sep_linked_goes10",
        "model_name": selection["winner"]["name"],
        "kind": selection["winner"]["kind"],
        "params": selection["winner"]["params"],
        "estimator": fitted["estimator"],
        "features": FEATURES,
        "fit_on": "train",
        "train_period": ["2010-01-01", "2021-12-31"],
        "validation_period": ["2022-01-01", "2023-12-31"],
        "climatology_rate_train_val": selection["climatology_rate_train_val"],
        "brier_skill_validation": selection["winner"]["brier_skill"],
        "thresholds": {
            "watch": thresholds["watch"]["threshold"],
            "warning": thresholds["warning"]["threshold"],
        },
        "test_scored": False,
    }
    with (MODELS / "v1.pkl").open("wb") as fh:
        pickle.dump(artifact, fh)
    w, a = thresholds["warning"], thresholds["watch"]
    score = f"""# Scorecard v1 (validation only)

Model: `{selection["winner"]["name"]}` ({selection["winner"]["kind"]}).
Fit on train flares with peak year ≤ 2021. Validation is 2022–2023 ({selection["n_val"]} flares, {selection["n_val_storms"]} storms). The test years were not scored.

Climatology rate, train and validation combined: {selection["climatology_rate_train_val"]:.4f}.
Brier skill versus that climatology, on validation: {selection["winner"]["brier_skill"]:.4f}.

A false alarm is a non-storm flare at or above the threshold. The month count is the 24 calendar months from January 2022 through December 2023.

| Cut | Rule | Threshold | Hit rate | Storms caught | False alarms / month | Precision | Median lead time (h) |
|---|---|---:|---:|---:|---:|---:|---:|
| Watch | highest threshold with hit rate ≥ 95% | {a["threshold"]:.4f} | {a["hit_rate"]:.3f} | {a["storms_caught"]}/{a["storms_caught"] + a["storms_missed"]} | {a["false_alarms_per_month"]:.3f} | {a["precision"]:.3f} | {a["lead_time"]["median_lead_time_h"]} |
| Warning | highest threshold with hit rate ≥ 80% | {w["threshold"]:.4f} | {w["hit_rate"]:.3f} | {w["storms_caught"]}/{w["storms_caught"] + w["storms_missed"]} | {w["false_alarms_per_month"]:.3f} | {w["precision"]:.3f} | {w["lead_time"]["median_lead_time_h"]} |

Watch lead times: {a["lead_time"]["hits_with_onset"]} of {a["lead_time"]["hits"]} hits have an onset, {a["lead_time"]["negative_lead_times"]} of those are negative.
Warning lead times: {w["lead_time"]["hits_with_onset"]} of {w["lead_time"]["hits"]} hits have an onset, {w["lead_time"]["negative_lead_times"]} of those are negative.

Negative lead time means the linked GOES >10 MeV onset is before the flare peak. The main label is an analyst link, not a guarantee that the flare came first.

Validation was used to pick the grid point, to pick the model family, and to set these two thresholds. These validation numbers are therefore a bit optimistic. The held-out test score is not in this file.
"""
    (RESULTS / "scorecard_v1.md").write_text(score, encoding="utf-8")
    print(f"Wrote {MODELS / 'v1.pkl'}")
    print(score)


def main():
    stage = sys.argv[1] if len(sys.argv) > 1 else "fit"
    {"fit": stage_fit, "thresholds": stage_thresholds, "save": stage_save}[stage]()


if __name__ == "__main__":
    main()
