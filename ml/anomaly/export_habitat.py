"""Score the SIMULATED habitat stream with the frozen detector and write habitat_telemetry.json.

    python -m ml.anomaly.export_habitat

Thresholds and hyperparameters come from ml/results/anomaly_thresholds.json (tuned on NASA MSL),
never re-tuned on the habitat. The detector is fit per channel on the baseline period only.
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

from . import config as C
from .detector import (ForecastResidualDetector, HGBForecastDetector, IsolationForestDetector,
                       StaticThreshold, to_events)
from .habitat_sim import simulate

NOTE = ("Habitat telemetry is simulated with planted faults. The detector is validated on real NASA "
        "SMAP/MSL spacecraft telemetry.")
SEV_RANK = {"green": 0, "amber": 1, "red": 2}


def load_frozen() -> dict:
    if C.THRESHOLDS_JSON.exists():
        return json.loads(C.THRESHOLDS_JSON.read_text(encoding="utf-8"))
    # Fallback (only if validation could not run): the untuned defaults from the brief, validation null.
    return {"winner": "ridge", "model_name": "forecast_residual_ridge_v1_untuned", "params": {"L": 30, "span": 10},
            "thresholds": {"amber": 4.0, "red": 7.0}, "min_duration_steps": 3, "gap": 0, "validation": None}


def make_detector(fz: dict):
    p, w = fz["params"], fz["winner"]
    if w == "ridge":
        return ForecastResidualDetector(L=p["L"], span=p["span"])
    if w == "hgb":
        return HGBForecastDetector(L=p["L"], span=p["span"], seed=C.SEED)
    if w == "iforest":
        return IsolationForestDetector(W=p["W"], seed=C.SEED)
    return StaticThreshold()


def hour_exog(times: pd.DatetimeIndex) -> np.ndarray:
    """Clock features known at time t (the habitat's 'command flags': the crew's daily schedule)."""
    a = 2 * np.pi * times.hour.to_numpy() / 24
    return np.column_stack([np.sin(a), np.cos(a)])


def iso(t) -> str:
    return pd.Timestamp(t).strftime("%Y-%m-%dT%H:%M:%SZ")


def rnd(v, dp):
    return None if v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))) else round(float(v), dp)


def crosses(v: float, lim: dict) -> bool:
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return False
    return (lim["min"] is not None and v < lim["min"]) or (lim["max"] is not None and v > lim["max"])


def first_cross(vals: np.ndarray, times, i0: int, i1: int, lim: dict):
    for i in range(i0, i1 + 1):
        if crosses(vals[i], lim):
            return i
    return None


def link_flags(crew: dict, channel: str, start: str, end_or_today: str) -> list[dict]:
    lo = start[:10]
    hi = (datetime.fromisoformat(end_or_today[:10]) + timedelta(days=C.LINK_WINDOW_DAYS)).strftime("%Y-%m-%d")
    out = []
    for c in crew["crew"]:
        for metric in C.LINK_TABLE[channel]:
            dates = sorted(f["date"] for f in c["flags"] if f["metric"] == metric and lo <= f["date"] <= hi)
            if dates:
                d0 = (datetime.fromisoformat(dates[0]) - datetime.fromisoformat(lo)).days
                lbl = crew["metrics"].get(metric, {}).get("label", metric)
                out.append({"crew_id": c["id"], "metric": metric, "from": dates[0], "to": dates[-1],
                            "note": f"{lbl} flagged {d0} day{'s' if d0 != 1 else ''} after this habitat anomaly began. "
                                    "Possible environmental cause, not a diagnosis. Simulated link."})
    return out


def build(crew: dict | None = None) -> tuple[dict, dict]:
    crew = crew or json.loads(C.CREW_JSON.read_text(encoding="utf-8"))
    fz = load_frozen()
    amber, red = fz["thresholds"]["amber"], fz["thresholds"]["red"]
    md, gap = fz["min_duration_steps"], fz.get("gap", 0)
    df, faults = simulate(crew)
    times = df.index
    n = len(times)
    nb = C.BASELINE_DAYS * 24
    exog = hour_exog(times)
    scores, events = {}, {}
    for k in C.CHANNEL_KEYS:
        x = df[k].ffill().bfill().to_numpy()   # dropouts: hold last value for the model; output keeps null
        det = make_detector(fz).fit(x[:nb], exog[:nb])
        s = det.score(x, exog)
        scores[k] = s
        events[k] = to_events(s, amber, md, gap)

    today = crew["mission"]["today"]
    anomalies = []
    used = {k: set() for k in C.CHANNEL_KEYS}
    def window_stats(k, i0, i1):
        vals = df[k].to_numpy()
        lim, ab = C.CHANNELS[k]["limits"], C.CHANNELS[k]["absolute_red"]
        seg = scores[k][i0:i1 + 1]
        peak = float(np.nanmax(seg)) if np.isfinite(seg).any() else None
        lc = first_cross(vals, times, i0, i1, lim)
        abs_hit = first_cross(vals, times, i0, i1, ab) is not None
        sev = "red" if (peak is not None and peak >= red) or abs_hit else "amber"
        return peak, lc, sev

    for f in faults:
        k, i0, i1 = f["channel"], f["i0"], f["i1"]
        hits = [j for j, (a, b) in enumerate(events[k]) if a <= i1 and i0 <= b]
        used[k].update(hits)
        det_i = min(events[k][j][0] for j in hits) if hits else None
        w0 = min([i0] + [events[k][j][0] for j in hits]); w1 = max([i1] + [events[k][j][1] for j in hits])
        peak, lc, sev = window_stats(k, w0, w1)
        lead = (lc - det_i) * 1.0 if (lc is not None and det_i is not None) else None
        ch = C.CHANNELS[k]
        if det_i is None:
            msg = f"{ch['label']}: planted fault NOT detected by the model (missed)"
        elif lead is not None and lead > 0:
            lim = ch["limits"]["min"] if f["shape"] == "leak" else ch["limits"]["max"]
            since = f"{times[i0].day} {times[i0].strftime('%b')}"
            msg = f"{ch['label']} drifting since {since}, flagged {lead:.0f} h before it crossed the {lim:g} {ch['unit']} limit"
        elif lc is not None:
            msg = f"{ch['label']} crossed its limit {-lead:.0f} h before the model flagged it"
        else:
            msg = f"{ch['label']} outside its normal pattern, flagged {det_i - i0} h after the fault began; limit not crossed"
        end = iso(times[i1]) if f["end"] else None
        anomalies.append({
            "channel": k, "fault": f["fault"], "start": iso(times[i0]), "end": end,
            "detected_at": iso(times[det_i]) if det_i is not None else None,
            "limit_crossed_at": iso(times[lc]) if lc is not None else None,
            "lead_time_h": lead, "peak_score": rnd(peak, 1), "severity": sev,
            "status": "active" if end is None else "resolved", "planted": True, "detected": det_i is not None,
            "message": msg, "action": ch["actions"][sev],
            "linked_crew_flags": link_flags(crew, k, iso(times[i0]), end or today),
        })
    for k in C.CHANNEL_KEYS:  # false alarms: detected events that overlap no planted fault
        for j, (a, b) in enumerate(events[k]):
            if j in used[k]:
                continue
            peak, lc, sev = window_stats(k, a, b)
            end = None if b == n - 1 else iso(times[b])
            ch = C.CHANNELS[k]
            anomalies.append({
                "channel": k, "fault": None, "start": iso(times[a]), "end": end, "detected_at": iso(times[a]),
                "limit_crossed_at": iso(times[lc]) if lc is not None else None,
                "lead_time_h": None if lc is None else float(lc - a), "peak_score": rnd(peak, 1), "severity": sev,
                "status": "active" if end is None else "resolved", "planted": False, "detected": True,
                "message": f"{ch['label']} flagged for {b - a + 1} h with no planted fault: false alarm",
                "action": ch["actions"][sev],
                "linked_crew_flags": link_flags(crew, k, iso(times[a]), end or today),
            })
    anomalies.sort(key=lambda a: a["start"])
    for i, a in enumerate(anomalies, 1):
        a["id"] = f"HAB-{i:03d}"
    anomalies = [{"id": a.pop("id"), **a} for a in anomalies]

    by_channel = {}
    for k in C.CHANNEL_KEYS:
        vals = df[k].dropna()
        last = float(vals.iloc[-1])
        st = "red" if crosses(last, C.CHANNELS[k]["absolute_red"]) else "amber" if crosses(last, C.CHANNELS[k]["limits"]) else "green"
        for a in anomalies:
            if a["channel"] == k and a["status"] == "active" and SEV_RANK[a["severity"]] > SEV_RANK[st]:
                st = a["severity"]
        by_channel[k] = st

    series = []
    for i, t in enumerate(times):
        row = {"time": iso(t)}
        for k in C.CHANNEL_KEYS:
            row[k] = rnd(df[k].iat[i], C.NOMINAL[k]["dp"])
        row["score"] = {k: rnd(scores[k][i], 2) for k in C.CHANNEL_KEYS}
        series.append(row)

    start = crew["mission"]["start_date"]
    meta = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "model": fz["model_name"], "simulated_habitat": True, "note": NOTE, "sample_interval_min": 60,
        "baseline_period": [start, (datetime.fromisoformat(start) + timedelta(days=C.BASELINE_DAYS - 1)).strftime("%Y-%m-%d")],
        "thresholds": {"amber": float(amber), "red": float(red)}, "min_duration_steps": int(md),
        "validation": fz.get("validation"),
        "data_credit": "Detector validation: NASA JPL SMAP & MSL telemetry anomaly dataset",
    }
    out = {"meta": meta, "channels": C.CHANNELS, "series": series, "anomalies": anomalies,
           "status": {"overall": max(by_channel.values(), key=SEV_RANK.get), "by_channel": by_channel}}
    debug = {"df": df, "scores": scores, "events": events, "faults": faults, "frozen": fz, "crew": crew}
    return out, debug


def story_chart(out: dict, dbg: dict, path) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.dates as mdates
    import matplotlib.pyplot as plt
    df, s, fz, crew = dbg["df"], dbg["scores"]["ppco2_mmhg"], dbg["frozen"], dbg["crew"]
    an = next(a for a in out["anomalies"] if a["channel"] == "ppco2_mmhg" and a["planted"])
    t0 = pd.Timestamp("2026-10-25T00:00:00Z")
    m = df.index >= t0
    ink, ink2, grid, surf = "#0b0b0b", "#52514e", "#e8e7e2", "#fcfcfb"
    blue, amber_c, red_c = "#2a78d6", "#fab219", "#d03b3b"
    fig, axes = plt.subplots(3, 1, figsize=(12, 7.6), sharex=True, facecolor=surf,
                             gridspec_kw={"height_ratios": [3, 1.4, 1.6]})
    ax = axes[0]
    ax.plot(df.index[m], df["ppco2_mmhg"][m], color=blue, lw=1.6)
    ax.axhline(3.0, color=red_c, lw=1.2, ls="--")
    ax.text(df.index[m][2], 3.03, "3.0 mmHg operational limit (NASA-STD-3001, 1-h avg)", color=ink2, fontsize=9)
    ax.set_ylabel("Cabin ppCO₂ (mmHg)", color=ink)
    ax2 = axes[1]
    ax2.fill_between(df.index[m], 0, np.nan_to_num(s[m]), color=blue, alpha=0.25, lw=0)
    ax2.plot(df.index[m], s[m], color=blue, lw=1)
    ax2.axhline(fz["thresholds"]["amber"], color=amber_c, lw=1.2, ls="--")
    ax2.axhline(fz["thresholds"]["red"], color=red_c, lw=1.2, ls="--")
    ax2.set_ylabel("Anomaly score\n(robust z)", color=ink)
    ax2.text(df.index[m][2], fz["thresholds"]["amber"] * 1.08, f"amber {fz['thresholds']['amber']:g}", fontsize=8, color=ink2)
    ax2.text(df.index[m][2], fz["thresholds"]["red"] * 1.04, f"red {fz['thresholds']['red']:g}", fontsize=8, color=ink2)
    for a_ in axes[:2]:
        for key, lbl, col in (("start", "fault starts", ink2), ("detected_at", "model flags", amber_c), ("limit_crossed_at", "crosses 3.0", red_c)):
            if an.get(key):
                tt = pd.Timestamp(an[key])
                a_.axvline(tt, color=col, lw=1.4)
                if a_ is axes[0]:
                    a_.annotate(f"{lbl}\n{tt.strftime('%d %b %H:%M')}Z", (tt, a_.get_ylim()[1]), xytext=(4, -26),
                                textcoords="offset points", fontsize=8.5, color=ink)
    c2 = next(c for c in crew["crew"] if c["id"] == "c2")
    sd = pd.DataFrame(c2["series"])
    sd["t"] = pd.to_datetime(sd["date"]).dt.tz_localize("UTC") + pd.Timedelta(hours=12)
    sd = sd[sd.t >= t0]
    flagged = {f["date"] for f in c2["flags"] if f["metric"] == "sleep_h"}
    ax3 = axes[2]
    cols = [red_c if d in flagged else "#9a9890" for d in sd["date"]]
    ax3.bar(sd.t, sd.sleep_h, width=0.7, color=cols)
    ax3.axhline(c2["baseline"]["sleep_h"]["mean"], color=ink2, lw=1, ls=":")
    ax3.set_ylabel(f"{c2['name']}\nsleep (h)", color=ink)
    ax3.set_ylim(0, max(sd.sleep_h) * 1.15)
    ax3.text(sd.t.iloc[0], c2["baseline"]["sleep_h"]["mean"] + 0.15, "personal baseline", fontsize=8, color=ink2)
    for a_ in axes:
        a_.set_facecolor(surf); a_.grid(color=grid, lw=0.8)
        for sp in ("top", "right"): a_.spines[sp].set_visible(False)
        a_.tick_params(colors=ink2)
    axes[2].xaxis.set_major_formatter(mdates.DateFormatter("%d %b"))
    lead = an["lead_time_h"]
    head = (f"Flagged {lead:.0f} h before cabin CO₂ crossed the limit" if lead and lead > 0
            else "CO₂ scrubber fault: detection vs limit crossing")
    fig.suptitle(f"{head} · SIMULATED habitat, frozen detector tuned on NASA MSL", x=0.01, ha="left",
                 fontsize=12.5, fontweight="bold")
    fig.text(0.01, 0.005, "Simulated scenario: planted CO₂ scrubber degradation from 8 Nov; red bars = days the crew model flagged low sleep "
             "(simulated). Illustrates a documented NASA concern, not evidence of a causal link.", fontsize=8, color=ink2)
    fig.tight_layout(rect=(0, 0.03, 1, 0.96))
    fig.savefig(path, dpi=150, facecolor=surf)
    plt.close(fig)


def main():
    out, dbg = build()
    C.HABITAT_JSON.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    story_chart(out, dbg, C.RESULTS / "habitat_co2_story.png")
    print(f"wrote {C.HABITAT_JSON} ({len(out['series'])} rows, {len(out['anomalies'])} anomalies), status {out['status']}")
    for a in out["anomalies"]:
        print(f"  {a['id']} {a['channel']:19s} planted={a['planted']!s:5} detected={a['detected']!s:5} "
              f"start={a['start']} det={a['detected_at']} limit={a['limit_crossed_at']} lead={a['lead_time_h']} "
              f"peak={a['peak_score']} {a['severity']} flags={[(f['crew_id'], f['metric']) for f in a['linked_crew_flags']]}")


if __name__ == "__main__":
    main()
