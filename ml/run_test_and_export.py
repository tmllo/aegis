"""Score v1 and write storm_forecast.json.

    python ml/run_test_and_export.py
        scores 2024 through today and writes web/public/data/storm_forecast.json

Hits and the reported median lead time are per distinct GOES >10 MeV storm.
A storm is caught when any of its flares is at or above the threshold.
Lead time for that storm runs from the earliest issue time among those flares
to the storm onset. Issue time is the later of the flare peak and the latest
linked CME start (flare peak when there is no CME). Per-flare hit rate and
lead time are reported beside that, as the secondary count.

Each event's lead_time_h stays hours from flare peak to onset, as the contract
defines that field.

The flare-time ablation refits v1's logistic regression on train only, with
flare size and longitude and without the CME link or CME speed. Only its
Brier skill on the scored period is reported. It is not a candidate model.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import pickle
from datetime import date, datetime, timezone
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from issue_time import add_issue_time, event_lead_times, lead_hours
from train_v1 import design_matrix, skill

ROOT = Path(__file__).resolve().parents[1]
FLARE_CSV = ROOT / "data" / "processed" / "flares_model.csv"
IMPORTANCE = ROOT / "ml" / "results" / "feature_importance_v1.csv"
DEFAULT_MODEL = ROOT / "ml" / "models" / "v1.pkl"
DEFAULT_OUT = ROOT / "web" / "public" / "data" / "storm_forecast.json"
MAY_START, MAY_END = date(2024, 5, 1), date(2024, 5, 20)


def calendar_months(start: date, end: date) -> int:
    return (end.year - start.year) * 12 + (end.month - start.month) + 1


def period_bounds(period: str) -> tuple[date, date]:
    if period == "validation":
        return date(2022, 1, 1), date(2023, 12, 31)
    if period == "test":
        return date(2024, 1, 1), date.today()
    raise ValueError(period)


def _truthy(value) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes"}


def load_years(keep) -> pd.DataFrame:
    """Keep rows whose peak year passes `keep`. Other rows are not stored."""
    kept = []
    with FLARE_CSV.open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            if keep(int(row["peak_time"][:4])):
                kept.append(row)
    if not kept:
        raise RuntimeError("no flares matched the requested years")
    return _prepare(pd.DataFrame(kept))


def load_period(period: str) -> pd.DataFrame:
    if period == "validation":
        df = load_years(lambda year: 2022 <= year <= 2023)
        if int(df["peak_time"].dt.year.max()) > 2023:
            raise RuntimeError("validation load kept a test year")
        return df
    if period == "test":
        df = load_years(lambda year: year >= 2024)
        if int(df["peak_time"].dt.year.min()) < 2024:
            raise RuntimeError("test load kept a development year")
        return df
    raise ValueError(period)


def _prepare(df: pd.DataFrame) -> pd.DataFrame:
    df["peak_time"] = pd.to_datetime(df["peak_time"], utc=True)
    df["class_flux"] = pd.to_numeric(df["class_flux"])
    df["longitude_deg"] = pd.to_numeric(df["longitude_deg"])
    df["latitude_deg"] = pd.to_numeric(df["latitude_deg"])
    df["cme_speed_kms"] = pd.to_numeric(df["cme_speed_kms"], errors="coerce")
    df["has_linked_cme"] = df["has_linked_cme"].map(_truthy)
    df["y"] = df["sep_linked_goes10"].map(_truthy).astype(int)
    df["peak_date"] = df["peak_time"].dt.date
    return add_issue_time(df.reset_index(drop=True))


def in_may_window(days: pd.Series) -> pd.Series:
    return days.map(lambda d: MAY_START <= d <= MAY_END)


def score(artifact: dict, df: pd.DataFrame) -> np.ndarray:
    estimator = artifact["estimator"]
    if isinstance(estimator, dict) and estimator.get("kind") == "climatology":
        return np.full(len(df), float(estimator["rate"]))
    return estimator.predict_proba(design_matrix(df))[:, 1]


def storm_counts(df: pd.DataFrame, threshold: float) -> dict:
    """Primary count: one hit per distinct linked GOES >10 MeV SEP."""
    if int((df["y"] == 1).sum()) == 0:
        return {
            "events": 0, "events_caught": 0, "event_hit_rate": None,
            "median_event_lead_time_h": None, "negative_event_lead_times": 0,
        }
    return event_lead_times(df, threshold)


def operating_point(df: pd.DataFrame, threshold: float, months: int) -> dict:
    y = df["y"].to_numpy().astype(int)
    p = df["p"].to_numpy().astype(float)
    pred = p >= threshold
    storm = y == 1
    tp = int((pred & storm).sum())
    fp = int((pred & ~storm).sum())
    n_flare_storms = int(storm.sum())
    flare_hit = tp / n_flare_storms if n_flare_storms else None
    from_issue = lead_hours(df["issue_time"], df["linked_goes10_onset"])
    known = from_issue[pred & storm].dropna()
    per_event = storm_counts(df, threshold)
    event_hit = per_event["event_hit_rate"]
    return {
        "threshold": threshold,
        "n_flares": int(len(df)),
        "n_flare_storms": n_flare_storms,
        "flares_caught": tp,
        "flare_hit_rate": None if flare_hit is None else round(flare_hit, 6),
        "false_alarms": fp,
        "false_alarms_per_month": round(fp / months, 6),
        "precision": round(tp / (tp + fp), 6) if (tp + fp) else None,
        "median_flare_lead_time_h": None if known.empty else round(float(known.median()), 2),
        "flare_hits_with_onset": int(len(known)),
        "negative_flare_lead_times": int((known < 0).sum()),
        "n_storms": int(per_event["events"]),
        "storms_caught": int(per_event["events_caught"]),
        "storm_hit_rate": None if event_hit is None else round(float(event_hit), 6),
        "median_storm_lead_time_h": per_event["median_event_lead_time_h"],
        "negative_storm_lead_times": int(per_event["negative_event_lead_times"]),
        "months": months,
        "lead_clock": "issue",
    }


def brier_skill(df: pd.DataFrame, p_clim: float) -> float:
    return round(skill(df["y"].to_numpy().astype(int), df["p"].to_numpy().astype(float), p_clim), 6)


def reliability_rows(df: pd.DataFrame, bins: int = 5) -> list[dict]:
    frame = pd.DataFrame({"y": df["y"].to_numpy(), "p": df["p"].to_numpy()})
    if frame.empty:
        return []
    frame["bin"] = pd.qcut(frame["p"], q=min(bins, len(frame)), duplicates="drop")
    rows = []
    for interval, part in frame.groupby("bin", observed=True):
        rows.append({
            "bin": str(interval),
            "n": int(len(part)),
            "mean_p": round(float(part["p"].mean()), 4),
            "observed_rate": round(float(part["y"].mean()), 4),
        })
    return rows


def plot_reliability(full: pd.DataFrame, held_out_may: pd.DataFrame, path: Path, period: str) -> None:
    fig, axes = plt.subplots(1, 2, figsize=(9.6, 4.4), sharex=True, sharey=True)
    panels = (
        (axes[0], f"{period}: all flares", full),
        (axes[1], f"{period}: without 1–20 May 2024", held_out_may),
    )
    for ax, title, frame in panels:
        rows = reliability_rows(frame)
        ax.plot([0, 1], [0, 1], color="#98a2b3", lw=1)
        if rows:
            ax.scatter(
                [r["mean_p"] for r in rows],
                [r["observed_rate"] for r in rows],
                s=[max(28, r["n"] / 3) for r in rows],
                color="#1f4e79",
                zorder=3,
            )
        ax.set_title(title, fontsize=11)
        ax.set_xlabel("Mean predicted probability")
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
    axes[0].set_ylabel("Observed storm rate")
    fig.tight_layout()
    fig.savefig(path, dpi=140)
    plt.close(fig)


def iso_z(value) -> str | None:
    if value is None or value == "" or pd.isna(value):
        return None
    ts = pd.to_datetime(value, utc=True, errors="coerce")
    if pd.isna(ts):
        return None
    return pd.Timestamp(ts).strftime("%Y-%m-%dT%H:%M:%SZ")


def json_num(value):
    if value is None or pd.isna(value):
        return None
    number = float(value)
    if not math.isfinite(number):
        return None
    return number


def alert_level(p: float, watch: float, warning: float) -> str:
    if p >= warning:
        return "warning"
    if p >= watch:
        return "watch"
    return "none"


def feature_importance() -> list[dict]:
    if not IMPORTANCE.is_file():
        return []
    table = pd.read_csv(IMPORTANCE)
    return [
        {"feature": str(row.feature), "importance": float(row.val_brier_increase)}
        for row in table.itertuples(index=False)
    ]


def may_table(df: pd.DataFrame, watch: float, warning: float) -> pd.DataFrame:
    may = df.loc[in_may_window(df["peak_date"])].sort_values("peak_time")
    from_peak = lead_hours(may["peak_time"], may["linked_goes10_onset"])
    from_issue = lead_hours(may["issue_time"], may["linked_goes10_onset"])
    rows = pd.DataFrame({
        "peak_time": may["peak_time"].map(iso_z),
        "flare_class": may["flare_class"],
        "source_location": may["source_location"],
        "longitude_deg": may["longitude_deg"],
        "has_linked_cme": may["has_linked_cme"],
        "cme_speed_kms": may["cme_speed_kms"],
        "p_storm": may["p"].map(lambda v: round(float(v), 6)),
        "alert_level": [alert_level(float(p), watch, warning) for p in may["p"]],
        "actual_storm": may["y"].astype(bool),
        "linked_goes10_ids": may["linked_goes10_ids"],
        "storm_onset_time": may["linked_goes10_onset"].map(iso_z),
        "issue_time": may["issue_time"].map(iso_z),
        "lead_time_from_issue_h": from_issue.round(2),
        "lead_time_h": from_peak.round(2),
    })
    return rows


def forecast_document(df: pd.DataFrame, artifact: dict, watch: float, warning: float,
                      headline: dict, p_clim: float, period: str) -> dict:
    events = []
    for row in df.sort_values("peak_time").itertuples(index=False):
        p = round(float(row.p), 6)
        storm = bool(row.y)
        onset = iso_z(row.linked_goes10_onset) if storm else None
        hours = lead_hours(pd.Series([row.peak_time]), pd.Series([row.linked_goes10_onset]))
        lead = None if not storm or pd.isna(hours.iloc[0]) else round(float(hours.iloc[0]), 2)
        events.append({
            "flare_id": row.flare_id,
            "peak_time": iso_z(row.peak_time),
            "flare_class": row.flare_class,
            "class_flux": json_num(row.class_flux),
            "source_location": row.source_location,
            "latitude_deg": json_num(row.latitude_deg),
            "longitude_deg": json_num(row.longitude_deg),
            "has_linked_cme": bool(row.has_linked_cme),
            "cme_speed_kms": json_num(row.cme_speed_kms),
            "p_storm": p,
            "alert_level": alert_level(p, watch, warning),
            "actual_storm": storm,
            "storm_onset_time": onset,
            "lead_time_h": lead,
            "split": "test",
        })
    start, end = period_bounds(period)
    return {
        "meta": {
            "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "model": str(artifact.get("model_name", "v1")),
            "horizon_hours": 72,
            "train_period": ["2010-01-01", "2023-12-31"],
            "test_period": [start.isoformat(), end.isoformat()],
            "thresholds": {"watch": watch, "warning": warning},
            "metrics_test": {
                "n_flares": headline["n_flares"],
                "n_storms": headline["n_storms"],
                "hit_rate": headline["storm_hit_rate"],
                "false_alarms_per_month": headline["false_alarms_per_month"],
                "median_lead_time_h": headline["median_storm_lead_time_h"],
                "brier_skill_vs_climatology": brier_skill(df, p_clim),
            },
            "feature_importance": feature_importance(),
            "data_credit": "NASA CCMC DONKI",
        },
        "events": events,
    }


def flare_only_matrix(df: pd.DataFrame) -> pd.DataFrame:
    """Features known from the flare itself: size and longitude. No CME link or speed."""
    return pd.DataFrame({
        "log10_class_flux": np.log10(df["class_flux"].astype(float)),
        "longitude_deg": df["longitude_deg"].astype(float),
    })


def fit_flare_time_ablation(penalty_C: float):
    """Refit v1's logistic regression on train only, without CME features."""
    train = load_years(lambda year: year <= 2021)
    if int(train["peak_time"].dt.year.max()) > 2021:
        raise RuntimeError("ablation training load included a post-2021 flare")
    model = Pipeline([
        ("scale", StandardScaler()),
        ("clf", LogisticRegression(C=penalty_C, class_weight=None, solver="lbfgs", max_iter=1000)),
    ])
    model.fit(flare_only_matrix(train), train["y"].astype(int).to_numpy())
    return model


def write_report(report_dir: Path, period: str, full: dict, dropped: dict,
                 skill_full: float, skill_dropped: float, ablation: dict,
                 reliability: dict, may: pd.DataFrame) -> None:
    report_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "period": period,
        "lead_definition": (
            "Per storm (primary): earliest issue time among flares at or above the threshold, "
            "to the GOES >10 MeV onset. Issue time is the later of flare peak and the latest "
            "linked CME start. Per flare (secondary): that flare's own issue time to onset. "
            "event.lead_time_h remains peak to onset, per the data contract."
        ),
        "false_alarm_months": full["warning"]["months"],
        "with_may_window": {"brier_skill_vs_climatology": skill_full, **full, "reliability": reliability["full"]},
        "without_1_20_may_2024": {
            "brier_skill_vs_climatology": skill_dropped,
            **dropped,
            "reliability": reliability["without_may"],
        },
        "ablation_information_known_at_flare_time": ablation,
        "may_2024_flares": int(len(may)),
    }
    (report_dir / "score_report.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    may.to_csv(report_dir / "may2024_flares.csv", index=False)


def run(model_path: Path, out_path: Path, report_dir: Path, period: str,
        watch: float | None, warning: float | None) -> dict:
    df = load_period(period)
    with model_path.open("rb") as fh:
        artifact = pickle.load(fh)
    stored = artifact.get("thresholds") or {}
    watch = float(stored["watch"] if watch is None else watch)
    warning = float(stored["warning"] if warning is None else warning)
    penalty_C = float((artifact.get("params") or {}).get("C", 10.0))
    p_clim = float(artifact["climatology_rate_train_val"])
    df = df.copy()
    df["p"] = score(artifact, df)
    ablation = fit_flare_time_ablation(penalty_C)
    df["p_flare_time"] = ablation.predict_proba(flare_only_matrix(df))[:, 1]
    months = calendar_months(*period_bounds(period))
    may = in_may_window(df["peak_date"])
    held = df.loc[~may].copy()
    full = {
        "warning": operating_point(df, warning, months),
        "watch": operating_point(df, watch, months),
    }
    dropped = {
        "warning": operating_point(held, warning, months),
        "watch": operating_point(held, watch, months),
    }
    skill_full = brier_skill(df, p_clim)
    skill_dropped = brier_skill(held, p_clim)
    ablation_report = {
        "label": (
            "v1 logistic regression refit on train only, features log10 flare flux and "
            "longitude, no CME link and no CME speed. Information known at flare time. "
            "Not a candidate model. Brier skill only."
        ),
        "fit_on": "train peak years <= 2021",
        "C": penalty_C,
        "class_weight": None,
        "brier_skill_vs_climatology": round(skill(
            df["y"].to_numpy().astype(int), df["p_flare_time"].to_numpy().astype(float), p_clim,
        ), 6),
        "brier_skill_without_1_20_may_2024": round(skill(
            held["y"].to_numpy().astype(int), held["p_flare_time"].to_numpy().astype(float), p_clim,
        ), 6),
    }
    rel = {"full": reliability_rows(df), "without_may": reliability_rows(held)}
    report_dir.mkdir(parents=True, exist_ok=True)
    plot_reliability(df, held, report_dir / "reliability.png", period)
    table = may_table(df, watch, warning)
    headline = dict(full["warning"])
    document = forecast_document(df, artifact, watch, warning, headline, p_clim, period)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(document, indent=1, allow_nan=False), encoding="utf-8")
    write_report(report_dir, period, full, dropped, skill_full, skill_dropped, ablation_report, rel, table)
    print(json.dumps({
        "period": period,
        "n_flares": int(len(df)),
        "n_flare_storms": int(df["y"].sum()),
        "may_rows": int(len(table)),
        "warning_per_storm": {
            "caught": full["warning"]["storms_caught"],
            "storms": full["warning"]["n_storms"],
            "hit_rate": full["warning"]["storm_hit_rate"],
            "median_lead_time_h": full["warning"]["median_storm_lead_time_h"],
            "false_alarms_per_month": full["warning"]["false_alarms_per_month"],
            "precision": full["warning"]["precision"],
            "flare_hit_rate": full["warning"]["flare_hit_rate"],
            "median_flare_lead_time_h": full["warning"]["median_flare_lead_time_h"],
        },
        "watch_per_storm": {
            "caught": full["watch"]["storms_caught"],
            "storms": full["watch"]["n_storms"],
            "hit_rate": full["watch"]["storm_hit_rate"],
            "median_lead_time_h": full["watch"]["median_storm_lead_time_h"],
            "false_alarms_per_month": full["watch"]["false_alarms_per_month"],
            "precision": full["watch"]["precision"],
            "flare_hit_rate": full["watch"]["flare_hit_rate"],
            "median_flare_lead_time_h": full["watch"]["median_flare_lead_time_h"],
        },
        "brier_skill_v1": skill_full,
        "brier_skill_ablation_flare_time": ablation_report["brier_skill_vs_climatology"],
        "without_may_warning_per_storm": {
            "caught": dropped["warning"]["storms_caught"],
            "storms": dropped["warning"]["n_storms"],
            "hit_rate": dropped["warning"]["storm_hit_rate"],
            "median_lead_time_h": dropped["warning"]["median_storm_lead_time_h"],
            "false_alarms_per_month": dropped["warning"]["false_alarms_per_month"],
        },
        "without_may_watch_per_storm": {
            "caught": dropped["watch"]["storms_caught"],
            "storms": dropped["watch"]["n_storms"],
            "hit_rate": dropped["watch"]["storm_hit_rate"],
            "median_lead_time_h": dropped["watch"]["median_storm_lead_time_h"],
            "false_alarms_per_month": dropped["watch"]["false_alarms_per_month"],
        },
        "without_may_brier_skill_v1": skill_dropped,
        "without_may_brier_skill_ablation": ablation_report["brier_skill_without_1_20_may_2024"],
        "wrote": str(out_path),
    }, indent=2))
    return document


def main():
    parser = argparse.ArgumentParser(description="Score v1 and write storm_forecast.json")
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--period", choices=("test", "validation"), default="test")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--report-dir", type=Path, default=ROOT / "ml" / "results")
    parser.add_argument("--watch", type=float, default=None)
    parser.add_argument("--warning", type=float, default=None)
    args = parser.parse_args()
    run(args.model, args.out, args.report_dir, args.period, args.watch, args.warning)


if __name__ == "__main__":
    main()
