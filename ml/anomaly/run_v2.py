"""v2: level + residual ensemble, built from the two MSL-tuned v1 configs. NO new grid search.

    python -m ml.anomaly.run_validation     # v1 (pre-registered; must run first)
    python -m ml.anomaly.run_v2             # v2

Members (configs copied unchanged from ml/results/anomaly_validation.json):
    level    = (a') static rule on the raw value, threshold tuned on MSL (not 3σ)
    residual = (b) Ridge forecast-residual, the v1 winner
Event = union of both detectors' events, overlaps merged; source = level / residual / both.

SMAP IS A SECOND LOOK AT THE TEST SET: v1 already scored it. The v1 SMAP numbers stay the clean,
pre-registered result; v2's SMAP numbers are reported, labelled as such.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from . import config as C
from .detector import union_events, to_events
from .evaluate import event_metrics
from .nasa_data import load
from .run_validation import bootstrap, pool, score_all, write_md


def events_for(cfg_level, cfg_resid, channels):
    sl = score_all("static", [{}], channels)[json.dumps({})]
    sr = score_all("ridge", [cfg_resid["model"]], channels)[json.dumps(cfg_resid["model"])]
    out = []
    for a, b in zip(sl, sr):
        ev_l = to_events(a, cfg_level["amber"], cfg_level["min_duration_steps"], cfg_level["gap"])
        ev_r = to_events(b, cfg_resid["amber"], cfg_resid["min_duration_steps"], cfg_resid["gap"])
        out.append(union_events(ev_l, ev_r))
    return out


def rows_from_events(ev_lists, channels):
    rows = []
    for evs, ch in zip(ev_lists, channels):
        m = event_metrics([(a, b) for a, b, _ in evs], ch.events, early_margin=C.EARLY_MARGIN, beta=C.BETA)
        rows.append({"chan": ch.chan_id, "tp_pred": m["tp_pred"], "fp": m["fp"], "tp_true": m["tp_true"],
                     "fn": m["fn"], "n": len(ch.test), "delays": m["delays"]})
    return rows


def source_breakdown(ev_lists, channels):
    """Which member produced the alarms that caught each labeled anomaly, and the false alarms."""
    hit_src, fa_src = {"level": 0, "residual": 0, "both": 0}, {"level": 0, "residual": 0, "both": 0}
    for evs, ch in zip(ev_lists, channels):
        for ts, te in ch.events:
            srcs = {s for a, b, s in evs if a <= te and ts - C.EARLY_MARGIN <= b}
            if srcs:
                hit_src["both" if "both" in srcs or len(srcs) > 1 else srcs.pop()] += 1
        for a, b, s in evs:
            if not any(a <= te and ts - C.EARLY_MARGIN <= b for ts, te in ch.events):
                fa_src[s] += 1
    return {"hits_by_source": hit_src, "false_alarms_by_source": fa_src}


def chart(v1, v2, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    pts = [("v2 ensemble (level + residual)", v2["msl"], v2["smap"], "#6250d6", "D"),
           ("v1 Ridge residual", v1["detectors"]["ridge"]["msl"], v1["detectors"]["ridge"]["smap"], "#2a78d6", "o"),
           ("Static, tuned threshold", v1["detectors"]["static_tuned"]["msl"], v1["detectors"]["static_tuned"]["smap"], "#9a9890", "s"),
           ("Static 3σ", v1["detectors"]["static"]["msl"], v1["detectors"]["static"]["smap"], "#52514e", "s")]
    plt.rcParams.update({"font.size": 11, "axes.edgecolor": "#c3c2b7", "xtick.color": "#52514e", "ytick.color": "#52514e"})
    fig, axes = plt.subplots(1, 2, figsize=(12, 5.2), facecolor="#fcfcfb", sharey=True)
    titles = ["MSL (tuning set)", "SMAP (v1 = clean single look; v2 = second look at the test set)"]
    for ax, key, title in zip(axes, ("msl", "smap"), titles):
        for j, (lbl, m, s, col, mk) in enumerate(pts):
            d = m if key == "msl" else s
            ax.plot(d["recall"], d["precision"], mk, ms=11, color=col, label=lbl, mec="#fcfcfb", mew=2)
            ax.annotate(f"F0.5 {d['f0_5']:.2f}", (d["recall"], d["precision"]), xytext=(9, -4 + (j % 2) * 8),
                        textcoords="offset points", fontsize=9, color="#52514e")
        ax.set_title(title, loc="left", fontsize=11)
        ax.set_xlabel("Event recall"); ax.set_facecolor("#fcfcfb"); ax.grid(color="#e8e7e2", lw=0.8)
        ax.set_xlim(0, 1.02); ax.set_ylim(0, 1.02)
        for sp in ("top", "right"): ax.spines[sp].set_visible(False)
    axes[0].set_ylabel("Event precision")
    axes[0].legend(loc="lower left", fontsize=9, frameon=False)
    fig.suptitle("Habitat anomaly detector v1 / v2 vs static baselines · NASA SMAP/MSL, event-wise, no point-adjust",
                 x=0.01, ha="left", fontsize=12.5, fontweight="bold")
    fig.tight_layout()
    fig.savefig(path, dpi=150, facecolor=fig.get_facecolor())
    plt.close(fig)


def f(v, d=2):
    return "n/a" if v is None else f"{v:.{d}f}"


def v2_md(v1, v2) -> str:
    r = v1["detectors"]
    rows = [("**v2 ensemble**", v2["smap"]), ("v1 Ridge (pre-registered)", r["ridge"]["smap"]),
            ("static, tuned threshold", r["static_tuned"]["smap"]), ("static 3σ", r["static"]["smap"])]
    b, bv1, bt = v2["bootstrap_vs_static3"], v2["bootstrap_vs_v1"], v2["bootstrap_vs_static_tuned"]
    L = ["", "## v2: level + residual ensemble (second look at SMAP)", "",
         "**Why:** a one-step forecast-residual detector tracks slow drifts (the forecaster adapts, the residual stays small, "
         "and the EWMA span adds lag). It suits abrupt or contextual faults; a level rule suits slow drifts. v1 confirmed this on "
         "SMAP (a tuned static rule beat Ridge) and on the simulated habitat (the CO₂ ramp was flagged after the limit).",
         "",
         f"**What:** union of the two MSL-tuned v1 detectors with their existing configs (no new search): level = static rule, "
         f"threshold {v2['members']['level']['amber']}, min duration {v2['members']['level']['min_duration_steps']}, gap {v2['members']['level']['gap']}; "
         f"residual = Ridge L={v2['members']['residual']['model']['L']}, span={v2['members']['residual']['model']['span']}, "
         f"threshold {v2['members']['residual']['amber']}, min duration {v2['members']['residual']['min_duration_steps']}, gap {v2['members']['residual']['gap']}. "
         "Overlapping events are merged; each event carries source = level / residual / both.",
         "",
         "**Test-set reuse:** SMAP was already scored in v1, and v2 was designed after seeing those results. "
         "**The v2 SMAP row is a second look at the test set, not a clean held-out result.** The v1 numbers above remain the pre-registered result.",
         "",
         "| detector | MSL F0.5 | SMAP precision | SMAP recall | SMAP F0.5 | SMAP false alarms / 10k | SMAP median delay | hits / labeled |",
         "|---|---|---|---|---|---|---|---|"]
    msl = {"**v2 ensemble**": v2["msl"], "v1 Ridge (pre-registered)": r["ridge"]["msl"],
           "static, tuned threshold": r["static_tuned"]["msl"], "static 3σ": r["static"]["msl"]}
    for name, s in rows:
        L.append(f"| {name} | {f(msl[name]['f0_5'])} | {f(s['precision'])} | {f(s['recall'])} | {f(s['f0_5'])} | "
                 f"{f(s['false_alarms_per_10k_steps'])} | {f(s['median_delay_steps'], 0)} | {s['hits']} / {s['true_events']} |")
    sb = v2["smap_sources"]
    L += ["",
          f"- v2 SMAP F0.5 95% channel-bootstrap CI: {f(b['f0_5_ci95'][0])}–{f(b['f0_5_ci95'][1])}.",
          f"- Paired difference v2 − static 3σ: {f(b['diff_vs_baseline_ci95'][0])} to {f(b['diff_vs_baseline_ci95'][1])}; "
          f"v2 − v1 Ridge: {f(bv1['diff_vs_baseline_ci95'][0])} to {f(bv1['diff_vs_baseline_ci95'][1])}; "
          f"v2 − tuned static: {f(bt['diff_vs_baseline_ci95'][0])} to {f(bt['diff_vs_baseline_ci95'][1])}.",
          f"- SMAP hits by source: {sb['hits_by_source']}; false alarms by source: {sb['false_alarms_by_source']}.",
          f"- {v2['verdict']}", ""]
    return "\n".join(L)


def main():
    v1 = json.loads(C.VALIDATION_JSON.read_text(encoding="utf-8"))
    lvl, res = v1["detectors"]["static_tuned"], v1["detectors"]["ridge"]
    msl, smap = load(C.TUNE_ON), load(C.TEST_ON)
    ev_msl, ev_smap = events_for(lvl, res, msl), events_for(lvl, res, smap)
    rows_msl, rows_smap = rows_from_events(ev_msl, msl), rows_from_events(ev_smap, smap)
    # member rows on SMAP for the paired bootstraps (same frozen configs as v1, so identical to v1's numbers)
    def member_rows(kind, cfg):
        sl = score_all(kind, [cfg["model"]], smap)[json.dumps(cfg["model"])]
        return rows_from_events([[(a, b, kind) for a, b in to_events(s, cfg["amber"], cfg["min_duration_steps"], cfg["gap"])]
                                 for s in sl], smap)
    st3 = v1["detectors"]["static"]
    r_st3, r_v1, r_tuned = member_rows("static", st3), member_rows("ridge", res), member_rows("static", lvl)
    v2 = {"generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
          "model_name": "level_residual_ensemble_v2",
          "members": {"level": {k: lvl[k] for k in ("model", "amber", "min_duration_steps", "gap")},
                      "residual": {k: res[k] for k in ("model", "amber", "min_duration_steps", "gap")}},
          "red_over_amber": v1["red"] / res["amber"],
          "msl": pool(rows_msl), "smap": pool(rows_smap), "smap_is_second_look": True,
          "msl_sources": source_breakdown(ev_msl, msl), "smap_sources": source_breakdown(ev_smap, smap),
          "bootstrap_vs_static3": bootstrap(rows_smap, r_st3), "bootstrap_vs_v1": bootstrap(rows_smap, r_v1),
          "bootstrap_vs_static_tuned": bootstrap(rows_smap, r_tuned)}
    s2, s1, st = v2["smap"]["f0_5"], v1["detectors"]["ridge"]["smap"]["f0_5"], v1["detectors"]["static_tuned"]["smap"]["f0_5"]
    v2["verdict"] = (f"On this second look, v2 scores F0.5 {s2:.2f} on SMAP vs {s1:.2f} for v1 and {st:.2f} for the tuned static rule. "
                     + ("v2 is the best of the four, " if s2 > max(s1, st) else "v2 is NOT the best of the four, ")
                     + "but because SMAP was reused, treat this as indicative, not as a clean held-out result.")
    sm, bs = v2["smap"], v1["detectors"]["static"]["smap"]
    v2["validation"] = {
        "dataset": "NASA SMAP + MSL labeled telemetry anomalies (Hundman et al., KDD 2018)",
        "tuned_on": f"MSL ({v1['data']['MSL']['channels']} channels, {v1['data']['MSL']['events']} labeled anomalies)",
        "tested_on": f"SMAP ({v1['data']['SMAP']['channels']} channels, {v1['data']['SMAP']['events']} labeled anomalies)",
        "protocol": (f"event-wise, no point-adjust; v2 SMAP figures are a second look at the test set "
                     f"(v1 pre-registered single look: F0.5 {s1:.2f})"),
        "model": {k: round(sm[k], 3) for k in ("precision", "recall", "f0_5", "false_alarms_per_10k_steps")},
        "baseline_static_3sigma": {k: round(bs[k], 3) for k in ("precision", "recall", "f0_5", "false_alarms_per_10k_steps")},
    }
    C.ENSEMBLE_JSON.write_text(json.dumps(v2, indent=1), encoding="utf-8")
    md_path = C.RESULTS / "anomaly_metrics.md"
    write_md(v1, md_path)  # regenerate the v1 report (unchanged numbers), then append v2
    md_path.write_text(md_path.read_text(encoding="utf-8").replace("\n![PR vs baseline]", v2_md(v1, v2) + "\n![PR vs baseline]"),
                       encoding="utf-8")
    chart(v1, v2, C.RESULTS / "anomaly_pr_vs_baseline.png")
    print(json.dumps({k: v2[k] for k in ("msl", "smap", "smap_sources", "bootstrap_vs_static3", "bootstrap_vs_v1",
                                         "bootstrap_vs_static_tuned", "verdict")}, indent=1))


if __name__ == "__main__":
    main()
