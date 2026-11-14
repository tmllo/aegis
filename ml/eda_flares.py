"""Storm-rate charts on the development set (2010–2023). Does not load 2024+.

    python ml/eda_flares.py
"""
from __future__ import annotations

import json
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd

from devset import ROOT, load_development_set

OUT = ROOT / "ml" / "results"
EDGES = [-120, -90, -60, -30, 0, 30, 60, 90, 120]
LON_LABELS = [
    "120–90°E", "90–60°E", "60–30°E", "30–0°E",
    "0–30°W", "30–60°W", "60–90°W", "90–120°W",
]
COLOR = "#1f4e79"


def _rate_table(frame: pd.DataFrame, key: str) -> list[dict]:
    rows = []
    for name, part in frame.groupby(key, observed=True):
        n = int(len(part))
        k = int(part["y"].sum())
        rows.append({"bin": str(name), "flares": n, "storms": k, "rate": (k / n) if n else None})
    return rows


def _style(ax, title, ylabel):
    ax.set_title(title)
    ax.set_ylabel(ylabel)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.set_axisbelow(True)
    ax.yaxis.grid(True, color="#d0d5dd", linewidth=0.8)


def _bar_labels(ax, rates, ns):
    for i, (rate, n) in enumerate(zip(rates, ns)):
        if n == 0 or rate is None:
            continue
        ax.text(i, rate + 0.8, f"{rate:.1f}%\nn={n}", ha="center", va="bottom", fontsize=9, color="#243044")


def chart_class(dev: pd.DataFrame) -> list[dict]:
    order = ["M", "X"]
    rows = []
    for letter in order:
        part = dev[dev.class_letter == letter]
        n, k = int(len(part)), int(part.y.sum())
        rows.append({"bin": letter, "flares": n, "storms": k, "rate": k / n})
    fig, ax = plt.subplots(figsize=(6.2, 4.6))
    rates = [100 * r["rate"] for r in rows]
    ax.bar(order, rates, color=COLOR, width=0.62)
    _style(ax, "Storm rate by flare class", "GOES >10 MeV storms per 100 flares")
    ax.set_xlabel("Flare class")
    _bar_labels(ax, rates, [r["flares"] for r in rows])
    ax.set_ylim(0, max(rates) * 1.35)
    fig.tight_layout()
    fig.savefig(OUT / "storm_rate_by_class.png", dpi=140)
    plt.close(fig)
    return rows


def chart_longitude(dev: pd.DataFrame) -> tuple[list[dict], int]:
    binned = pd.cut(dev.longitude_deg, bins=EDGES, labels=LON_LABELS, include_lowest=True)
    outside = int(binned.isna().sum())
    frame = dev.assign(lon_bin=binned).dropna(subset=["lon_bin"])
    lookup = {r["bin"]: r for r in _rate_table(frame, "lon_bin")}
    rows = []
    for label in LON_LABELS:
        rows.append(lookup.get(label, {"bin": label, "flares": 0, "storms": 0, "rate": None}))
    fig, ax = plt.subplots(figsize=(11.2, 5.0))
    rates = [0 if r["rate"] is None else 100 * r["rate"] for r in rows]
    ax.bar(range(len(rows)), rates, color=COLOR, width=0.72)
    ax.set_xticks(range(len(rows)), [r["bin"] for r in rows], rotation=0)
    _style(ax, "Storm rate by solar longitude", "GOES >10 MeV storms per 100 flares")
    ax.set_xlabel("East  →  west")
    _bar_labels(ax, rates, [r["flares"] for r in rows])
    top = max(rates) if rates else 1
    ax.set_ylim(0, max(top * 1.38, 5))
    fig.tight_layout()
    fig.savefig(OUT / "parker_spiral_longitude.png", dpi=140)
    plt.close(fig)
    return rows, outside


def chart_cme(dev: pd.DataFrame) -> list[dict]:
    rows = []
    for linked, label in ((False, "No linked CME"), (True, "Linked CME")):
        part = dev[dev.has_linked_cme == linked]
        n, k = int(len(part)), int(part.y.sum())
        rows.append({"bin": label, "flares": n, "storms": k, "rate": k / n if n else None})
    fig, ax = plt.subplots(figsize=(6.4, 4.6))
    rates = [100 * r["rate"] for r in rows]
    ax.bar([r["bin"] for r in rows], rates, color=COLOR, width=0.62)
    _style(ax, "Storm rate with and without a linked CME", "GOES >10 MeV storms per 100 flares")
    _bar_labels(ax, rates, [r["flares"] for r in rows])
    ax.set_ylim(0, max(rates) * 1.35)
    fig.tight_layout()
    fig.savefig(OUT / "storm_rate_by_cme.png", dpi=140)
    plt.close(fig)
    return rows


def _speed_stats(series: pd.Series) -> dict:
    s = series.dropna()
    return {
        "n": int(len(s)),
        "median": None if s.empty else round(float(s.median()), 1),
        "q25": None if s.empty else round(float(s.quantile(0.25)), 1),
        "q75": None if s.empty else round(float(s.quantile(0.75)), 1),
    }


def chart_speed(dev: pd.DataFrame) -> dict:
    with_speed = dev[dev.cme_speed_kms.notna()]
    quiet = with_speed.loc[~with_speed.y, "cme_speed_kms"]
    storm = with_speed.loc[with_speed.y, "cme_speed_kms"]
    stats = {"no_storm": _speed_stats(quiet), "storm": _speed_stats(storm),
             "flares_missing_speed": int(dev.cme_speed_kms.isna().sum())}
    fig, ax = plt.subplots(figsize=(6.4, 4.8))
    ax.boxplot(
        [quiet.to_numpy(), storm.to_numpy()],
        tick_labels=[f"No storm\nn={stats['no_storm']['n']}", f"Storm\nn={stats['storm']['n']}"],
        patch_artist=True,
        medianprops={"color": "#9a3412", "linewidth": 2},
        boxprops={"facecolor": "#d6e2f0", "edgecolor": COLOR},
        whiskerprops={"color": COLOR},
        capprops={"color": COLOR},
    )
    _style(ax, "CME speed: storm vs no storm", "CME speed (km/s)")
    ax.set_xlabel("Flares that have a linked CME speed")
    fig.tight_layout()
    fig.savefig(OUT / "cme_speed_storm_vs_quiet.png", dpi=140)
    plt.close(fig)
    return stats


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    dev = load_development_set()
    summary = {
        "set": "development 2010-2023, test not included",
        "flares": int(len(dev)),
        "storms": int(dev.y.sum()),
        "by_class": chart_class(dev),
        "by_longitude": None,
        "longitude_outside_bins": None,
        "by_cme": chart_cme(dev),
        "cme_speed": chart_speed(dev),
    }
    lon_rows, outside = chart_longitude(dev)
    summary["by_longitude"] = lon_rows
    summary["longitude_outside_bins"] = outside
    (OUT / "eda_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
