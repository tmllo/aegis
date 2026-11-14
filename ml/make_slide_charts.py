"""Three slide charts. Does not fit or score a model.

The Parker spiral uses the development set only (peaks through 2023).
The operating curve and the May timeline read the already scored test export.

    python ml/make_slide_charts.py
"""
from __future__ import annotations

import json

import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import pandas as pd

from devset import ROOT, load_development_set

OUT = ROOT / "ml" / "results"
FORECAST = ROOT / "web" / "public" / "data" / "storm_forecast.json"
MAY = OUT / "may2024_flares.csv"
MONTHS = 35

NAVY = "#1f4e79"
NAVY_SOFT = "#8fb4d9"
INK = "#1d2939"
MUTED = "#667085"
GRID = "#eaecf0"
AMBER = "#b54708"
RED = "#b42318"
GREEN = "#067647"

EDGES = [-120, -90, -60, -30, 0, 30, 60, 90, 120]
LON_LABELS = [
    "120–90°E", "90–60°E", "60–30°E", "30–0°E",
    "0–30°W", "30–60°W", "60–90°W", "90–120°W",
]


def _slide(ax):
    ax.set_facecolor("white")
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color("#d0d5dd")
    ax.spines["bottom"].set_color("#d0d5dd")
    ax.tick_params(colors=INK, labelsize=13, length=0)
    ax.yaxis.grid(True, color=GRID, linewidth=1)
    ax.set_axisbelow(True)


def _figure(title: str, subtitle: str):
    fig, ax = plt.subplots(figsize=(13.33, 7.5), dpi=160)
    fig.patch.set_facecolor("white")
    fig.suptitle(title, x=0.06, ha="left", fontsize=22, color=INK, fontweight="medium")
    fig.text(0.06, 0.90, subtitle, ha="left", va="top", fontsize=13, color=MUTED)
    fig.subplots_adjust(left=0.08, right=0.96, top=0.82, bottom=0.18)
    return fig, ax


def parker_spiral() -> list[dict]:
    dev = load_development_set()
    binned = pd.cut(dev.longitude_deg, bins=EDGES, labels=LON_LABELS, include_lowest=True)
    if int(binned.isna().sum()):
        raise RuntimeError("a development flare sits outside −120° to 120°")
    rows = []
    for label, part in dev.groupby(binned, observed=True):
        n, k = int(len(part)), int(part.y.sum())
        rows.append({"bin": str(label), "flares": n, "storms": k, "rate": k / n if n else 0.0})
    order = {label: i for i, label in enumerate(LON_LABELS)}
    rows.sort(key=lambda r: order[r["bin"]])

    fig, ax = _figure(
        "Storms are more common on the Sun’s western hemisphere",
        "Development set, 2010–2023. M and X flares only. 42 storms in 1,024 flares. Test years are not in this chart.",
    )
    _slide(ax)
    rates = [100 * r["rate"] for r in rows]
    colors = [NAVY_SOFT if i < 4 else NAVY for i in range(len(rows))]
    ax.bar(range(len(rows)), rates, color=colors, width=0.72)
    ax.set_xticks(range(len(rows)), LON_LABELS)
    ax.set_ylabel("Storms per 100 flares", color=INK, fontsize=14)
    ax.set_xlabel("East   →   west", color=INK, fontsize=14, labelpad=8)
    top = max(rates)
    ax.set_ylim(0, top * 1.42)
    for i, row in enumerate(rows):
        ax.text(
            i, rates[i] + top * 0.04,
            f"{rates[i]:.1f}%\n{row['storms']} / {row['flares']}",
            ha="center", va="bottom", fontsize=12, color=INK,
        )
    fig.text(
        0.06, 0.035,
        "Light bars are east of the central meridian. The bin past 90°W is 1 storm in 29 flares. NASA DONKI.",
        ha="left", fontsize=12, color=MUTED,
    )
    fig.savefig(OUT / "slide_parker_spiral.png")
    plt.close(fig)
    return rows


def _split_scores(events: list[dict]) -> tuple[list[float], list[float]]:
    storms: dict[str, float] = {}
    quiet: list[float] = []
    for event in events:
        p = float(event["p_storm"])
        if event["actual_storm"]:
            onset = event["storm_onset_time"]
            storms[onset] = max(p, storms.get(onset, 0.0))
        else:
            quiet.append(p)
    return list(storms.values()), quiet


def _curve_row(storm_max: list[float], quiet: list[float], threshold: float) -> dict:
    caught = sum(p >= threshold for p in storm_max)
    false_alarms = sum(p >= threshold for p in quiet)
    return {
        "threshold": threshold,
        "hit_rate": caught / len(storm_max),
        "storms_caught": caught,
        "false_alarms": false_alarms,
        "false_alarms_per_month": false_alarms / MONTHS,
    }


def _operating_curve(storm_max: list[float], quiet: list[float], extra: list[float]) -> pd.DataFrame:
    thresholds = sorted(set(storm_max + quiet + extra), reverse=True)
    return pd.DataFrame([_curve_row(storm_max, quiet, t) for t in thresholds])


def hit_rate_chart(doc: dict) -> None:
    storm_max, quiet = _split_scores(doc["events"])
    if len(storm_max) != 17:
        raise RuntimeError(f"expected 17 storms, found {len(storm_max)}")
    watch = float(doc["meta"]["thresholds"]["watch"])
    warning = float(doc["meta"]["thresholds"]["warning"])
    curve = _operating_curve(storm_max, quiet, [watch, warning])
    watch_pt = curve.loc[curve.threshold == watch].iloc[0]
    warning_pt = curve.loc[curve.threshold == warning].iloc[0]
    if int(warning_pt.storms_caught) != 16 or int(warning_pt.false_alarms) != 35:
        raise RuntimeError(f"warning point drifted: {warning_pt.to_dict()}")
    if int(watch_pt.storms_caught) != 17 or int(watch_pt.false_alarms) != 213:
        raise RuntimeError(f"watch point drifted: {watch_pt.to_dict()}")

    shown = curve.loc[curve.false_alarms_per_month <= 8].sort_values("false_alarms_per_month")
    fig, ax = _figure(
        "Warning catches 16 of 17 storms, at one false alarm a month",
        "Test set, January 2024–November 2026. A storm counts once. Thresholds were frozen on 2022–2023.",
    )
    _slide(ax)
    ax.plot(
        shown.false_alarms_per_month, shown.hit_rate,
        color=NAVY, linewidth=2.4, solid_capstyle="round",
    )
    ax.scatter(
        [warning_pt.false_alarms_per_month, watch_pt.false_alarms_per_month],
        [warning_pt.hit_rate, watch_pt.hit_rate],
        s=90, color=[RED, AMBER], zorder=3,
    )
    ax.annotate(
        "Warning\n16 / 17 storms\n1.0 false alarm / month",
        xy=(warning_pt.false_alarms_per_month, warning_pt.hit_rate),
        xytext=(2.35, 0.58),
        fontsize=13, color=RED, ha="left", va="top",
        arrowprops={"arrowstyle": "-", "color": RED, "lw": 1},
    )
    ax.annotate(
        "Watch\n17 / 17 storms\n6.1 false alarms / month",
        xy=(watch_pt.false_alarms_per_month, watch_pt.hit_rate),
        xytext=(4.15, 0.62),
        fontsize=13, color=AMBER, ha="left",
        arrowprops={"arrowstyle": "-", "color": AMBER, "lw": 1},
    )
    ax.set_xlim(0, 8)
    ax.set_ylim(0, 1.08)
    ax.set_yticks([0, 0.25, 0.5, 0.75, 1.0])
    ax.set_yticklabels(["0%", "25%", "50%", "75%", "100%"])
    ax.set_xlabel("False alarms per month", fontsize=14, color=INK, labelpad=8)
    ax.set_ylabel("Storms caught", fontsize=14, color=INK)
    fig.text(
        0.06, 0.035,
        "A false alarm is a quiet flare, counted over 35 months. Watch already catches every storm.",
        ha="left", fontsize=12, color=MUTED,
    )
    fig.savefig(OUT / "slide_hit_vs_false_alarms.png")
    plt.close(fig)


def may_timeline() -> None:
    may = pd.read_csv(MAY)
    may["peak"] = pd.to_datetime(may["peak_time"], utc=True)
    onsets = [
        pd.Timestamp("2024-05-10T13:35:00Z"),
        pd.Timestamp("2024-05-13T14:00:00Z"),
    ]
    watch, warning = 0.030784668546445, 0.1588648007726645
    fig, ax = _figure(
        "May 2024: both proton storms were warned",
        "112 M and X flares, 1–20 May. Lines are the thresholds frozen before this month was scored.",
    )
    _slide(ax)
    ax.axhline(watch, color=AMBER, lw=1.2, ls=(0, (4, 3)))
    ax.axhline(warning, color=RED, lw=1.4)
    ax.text(pd.Timestamp("2024-05-01T06:00:00Z"), watch + 0.012, "Watch  0.031", color=AMBER, fontsize=12)
    ax.text(pd.Timestamp("2024-05-01T06:00:00Z"), warning + 0.012, "Warning  0.159", color=RED, fontsize=12)
    for onset, name in zip(onsets, ("10 May onset", "13 May onset")):
        ax.axvline(onset, color=GREEN, lw=1.3, ls=(0, (3, 3)))
        ax.text(onset, 0.68, name, color=GREEN, fontsize=12, ha="left", rotation=90, va="top")

    quiet = may.loc[~may.actual_storm.astype(bool)]
    storms = may.loc[may.actual_storm.astype(bool)]
    ax.scatter(quiet.peak, quiet.p_storm, s=28, color="#d0d5dd", zorder=2, label="No storm")
    ax.scatter(storms.peak, storms.p_storm, s=46, color=NAVY, zorder=3, label="Linked to a storm")
    ax.legend(frameon=False, fontsize=12, loc="upper right")
    ax.set_ylim(-0.02, 0.72)
    ax.set_xlim(pd.Timestamp("2024-05-01"), pd.Timestamp("2024-05-20T23:59:00Z"))
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%d %b"))
    ax.xaxis.set_major_locator(mdates.DayLocator(interval=2))
    ax.set_ylabel("Probability of a linked storm", fontsize=14, color=INK)
    ax.set_xlabel("Flare peak, May 2024", fontsize=14, color=INK, labelpad=8)
    fig.text(
        0.06, 0.035,
        "10 May storm: first warning about 39 hours ahead. 13 May storm: about 4.5 hours. The 15 May X2.9 reached warning and had no storm.",
        ha="left", fontsize=12, color=MUTED,
    )
    fig.savefig(OUT / "slide_may2024_timeline.png")
    plt.close(fig)


def main() -> None:
    rows = parker_spiral()
    print("parker")
    for row in rows:
        print(f"  {row['bin']}: {row['storms']}/{row['flares']} = {100 * row['rate']:.1f}%")
    with FORECAST.open(encoding="utf-8") as fh:
        doc = json.load(fh)
    hit_rate_chart(doc)
    may_timeline()
    print("wrote", OUT / "slide_parker_spiral.png")
    print("wrote", OUT / "slide_hit_vs_false_alarms.png")
    print("wrote", OUT / "slide_may2024_timeline.png")


if __name__ == "__main__":
    main()
