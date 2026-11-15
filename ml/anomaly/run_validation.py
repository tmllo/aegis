"""Rigorous validation on NASA SMAP/MSL: 4 detectors, tuned on MSL only, tested once on SMAP.

    python -m ml.anomaly.run_validation

Writes:
    ml/results/anomaly_thresholds.json   frozen winner + thresholds (read by export_habitat)
    ml/results/anomaly_validation.json   all numbers (meta.validation is copied from here)
    ml/results/anomaly_metrics.md        the write-up
    ml/results/anomaly_pr_vs_baseline.png

Protocol (DA2/DA3): event-wise, no point-adjust, early margin 0, F0.5. Every hyperparameter and
threshold is chosen on MSL. SMAP is scored exactly once per detector with the frozen config.
"""
from __future__ import annotations

import itertools
import json
import time
from datetime import datetime, timezone

import numpy as np

from . import config as C
from .detector import (ForecastResidualDetector, HGBForecastDetector, IsolationForestDetector,
                       StaticThreshold, to_events, _robust_center_scale)
from .evaluate import event_metrics, f_beta
from .nasa_data import download, load


# ---------------------------------------------------------------- scoring
def _fit_score(kind: str, params: dict, ch, spans=None) -> dict:
    """Fit on the channel's TRAIN split, score its TEST split. Returns {span_or_None: scores}."""
    if kind == "static":
        return {None: StaticThreshold().fit(ch.x_train).score(ch.x_test)}
    if kind == "iforest":
        det = IsolationForestDetector(W=params["W"], seed=C.SEED).fit(ch.x_train)
        return {None: det.score(ch.x_test)}
    cls = ForecastResidualDetector if kind == "ridge" else HGBForecastDetector
    kw = {} if kind == "ridge" else {"seed": C.SEED}
    det = cls(L=params["L"], span=spans[0], **kw).fit(ch.x_train, ch.exog_train)
    out = {}
    for s in spans:  # the forecaster depends on L only; re-derive the error stats per span
        det.span = s
        det.err_median_, det.err_mad_ = _robust_center_scale(det._smoothed_error(ch.x_train, ch.exog_train))
        out[s] = det.score(ch.x_test, ch.exog_test)
    return out


def score_all(kind: str, model_grid: list[dict], channels) -> dict:
    """{json(params): [scores per channel]} for every model config."""
    res = {}
    if kind in ("ridge", "hgb"):
        by_L = {}
        for p in model_grid:
            by_L.setdefault(p["L"], []).append(p["span"])
        for L, spans in by_L.items():
            per_ch = [_fit_score(kind, {"L": L}, ch, spans) for ch in channels]
            for s in spans:
                res[json.dumps({"L": L, "span": s})] = [d[s] for d in per_ch]
    else:
        for p in model_grid:
            res[json.dumps(p)] = [_fit_score(kind, p, ch)[None] for ch in channels]
    return res


# ---------------------------------------------------------------- metrics
def per_channel_counts(scores_list, channels, thr, min_dur, gap):
    rows = []
    for s, ch in zip(scores_list, channels):
        pred = to_events(s, thr, min_dur, gap)
        m = event_metrics(pred, ch.events, early_margin=C.EARLY_MARGIN, beta=C.BETA)
        peaks = [float(np.nanmax(s[a:b + 1])) for a, b in pred]
        tp_flags = [any(a <= te and ts - C.EARLY_MARGIN <= b for ts, te in ch.events) for a, b in pred]
        rows.append({"chan": ch.chan_id, "tp_pred": m["tp_pred"], "fp": m["fp"], "tp_true": m["tp_true"],
                     "fn": m["fn"], "n": len(s), "delays": m["delays"], "peaks": peaks, "tp_flags": tp_flags})
    return rows


def pool(rows) -> dict:
    tp_pred = sum(r["tp_pred"] for r in rows); fp = sum(r["fp"] for r in rows)
    tp_true = sum(r["tp_true"] for r in rows); fn = sum(r["fn"] for r in rows)
    n = sum(r["n"] for r in rows); delays = [d for r in rows for d in r["delays"]]
    p = tp_pred / (tp_pred + fp) if tp_pred + fp else 0.0
    rc = tp_true / (tp_true + fn) if tp_true + fn else 0.0
    return {"precision": p, "recall": rc, "f0_5": f_beta(p, rc, C.BETA),
            "false_alarms_per_10k_steps": 1e4 * fp / n if n else 0.0,
            "median_delay_steps": float(np.median(delays)) if delays else None,
            "hits": tp_true, "missed": fn, "true_alarms": tp_pred, "false_alarms": fp,
            "pred_events": tp_pred + fp, "true_events": tp_true + fn, "steps": n}


def tune(kind: str, msl, thresholds=None) -> dict:
    """Grid search on MSL. Tie-break: higher F0.5, then fewer false alarms, then grid order (simpler)."""
    thresholds = thresholds or C.THRESHOLD_GRID
    scored = score_all(kind, C.GRID["static" if kind == "static_tuned" else kind]["model"], msl)
    best, table = None, []
    for key, sl in scored.items():
        for thr, md, gap in itertools.product(thresholds, C.MIN_DURATION_GRID, C.GAP_GRID):
            m = pool(per_channel_counts(sl, msl, thr, md, gap))
            cand = {"model": json.loads(key), "amber": thr, "min_duration_steps": md, "gap": gap, "msl": m}
            table.append(cand)
            if best is None or (m["f0_5"], -m["false_alarms_per_10k_steps"]) > \
                    (best["msl"]["f0_5"], -best["msl"]["false_alarms_per_10k_steps"]):
                best = cand
    best["_scores"] = scored[json.dumps(best["model"])]
    best["n_configs"] = len(table)
    # PR sweep over thresholds at the chosen model/duration/gap (for the chart)
    best["msl_sweep"] = [{"thr": c["amber"], "precision": c["msl"]["precision"], "recall": c["msl"]["recall"]}
                         for c in table if c["model"] == best["model"] and c["min_duration_steps"] ==
                         best["min_duration_steps"] and c["gap"] == best["gap"]]
    return best


def pick_red(best, msl) -> tuple[float, str]:
    """Lowest peak-score cutoff (grid values above amber) whose MSL events are >= 80% true alarms."""
    rows = per_channel_counts(best["_scores"], msl, best["amber"], best["min_duration_steps"], best["gap"])
    peaks = np.array([p for r in rows for p in r["peaks"]]); tps = np.array([t for r in rows for t in r["tp_flags"]])
    for c in sorted(t for t in C.THRESHOLD_GRID if t > best["amber"]):
        sel = peaks >= c
        if sel.sum() >= 3 and tps[sel].mean() >= C.RED_PRECISION_TARGET:
            return float(c), f"lowest grid cutoff with >= {C.RED_PRECISION_TARGET:.0%} true alarms on MSL ({int(sel.sum())} events)"
    return float(2 * best["amber"]), f"no grid cutoff reached {C.RED_PRECISION_TARGET:.0%} precision on MSL; fell back to 2 x amber"


def bootstrap(rows_a, rows_b, n=C.N_BOOT, seed=C.SEED):
    """Channel bootstrap: 95% CI of pooled F0.5 for A, and of F0.5(A) - F0.5(B) (paired)."""
    rng = np.random.default_rng(seed)
    def arr(rows): return np.array([[r["tp_pred"], r["fp"], r["tp_true"], r["fn"]] for r in rows], float)
    A, B = arr(rows_a), arr(rows_b)
    def f(M):
        tp, fp, tt, fn = M.sum(1).T
        p = np.divide(tp, tp + fp, out=np.zeros_like(tp), where=tp + fp > 0)
        r = np.divide(tt, tt + fn, out=np.zeros_like(tt), where=tt + fn > 0)
        b2 = C.BETA ** 2
        return np.divide((1 + b2) * p * r, b2 * p + r, out=np.zeros_like(p), where=b2 * p + r > 0)
    idx = rng.integers(0, len(A), size=(n, len(A)))
    fa, fb = f(A[idx]), f(B[idx])
    q = lambda v: [float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))]
    return {"f0_5_ci95": q(fa), "diff_vs_baseline_ci95": q(fa - fb), "p_diff_le_0": float(np.mean(fa - fb <= 0))}


# ---------------------------------------------------------------- outputs
def chart(results, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    colors = {"ridge": "#2a78d6", "hgb": "#eb6834", "iforest": "#1baf7a", "static": "#52514e", "static_tuned": "#9a9890"}
    plt.rcParams.update({"font.size": 11, "axes.edgecolor": "#c3c2b7", "axes.labelcolor": "#0b0b0b",
                         "xtick.color": "#52514e", "ytick.color": "#52514e"})
    fig, axes = plt.subplots(1, 2, figsize=(12, 5.2), facecolor="#fcfcfb", sharey=True)
    ax = axes[0]
    for k in ("ridge", "hgb", "iforest", "static_tuned"):
        sw = sorted(results[k]["msl_sweep"], key=lambda d: d["thr"])
        ax.plot([d["recall"] for d in sw], [d["precision"] for d in sw], "-o", ms=4, lw=2, color=colors[k],
                label=C.DETECTOR_LABELS[k])
    m = results["static"]["msl"]
    ax.plot(m["recall"], m["precision"], "s", ms=9, color=colors["static"], label=C.DETECTOR_LABELS["static"])
    ax.set_title("MSL (tuning set): precision vs recall as the threshold moves", loc="left", fontsize=11)
    ax.set_xlabel("Event recall"); ax.set_ylabel("Event precision")
    ax = axes[1]
    for k in ("ridge", "hgb", "iforest", "static_tuned", "static"):
        s = results[k]["smap"]
        ax.plot(s["recall"], s["precision"], "s" if k.startswith("static") else "o", ms=10, color=colors[k],
                label=C.DETECTOR_LABELS[k])
        ax.annotate(f"F0.5 {s['f0_5']:.2f}", (s["recall"], s["precision"]), xytext=(7, 4),
                    textcoords="offset points", fontsize=9, color="#52514e")
    ax.set_title("SMAP (held out, scored once with the frozen MSL config)", loc="left", fontsize=11)
    ax.set_xlabel("Event recall")
    for ax in axes:
        ax.set_facecolor("#fcfcfb"); ax.grid(color="#e8e7e2", lw=0.8); ax.set_xlim(0, 1.02); ax.set_ylim(0, 1.02)
        for sp in ("top", "right"): ax.spines[sp].set_visible(False)
    axes[0].legend(loc="upper right", fontsize=8.5, frameon=False)
    fig.suptitle("Habitat anomaly detector vs static baseline · NASA SMAP/MSL, event-wise, no point-adjust",
                 x=0.01, ha="left", fontsize=12.5, fontweight="bold")
    fig.tight_layout()
    fig.savefig(path, dpi=150, facecolor=fig.get_facecolor())
    plt.close(fig)


def fmt(v, d=2):
    return "n/a" if v is None else f"{v:.{d}f}"


def write_md(out, path):
    r, w = out["detectors"], out["winner"]
    lines = [
        "# Habitat anomaly detector: validation on NASA SMAP/MSL",
        "",
        f"Generated {out['generated_at']} by `python -m ml.anomaly.run_validation`. Runtime {out['runtime_s']:.0f} s.",
        "",
        "## Protocol",
        "- Data: NASA JPL SMAP + MSL labeled telemetry anomalies (Hundman et al., KDD 2018). "
        f"MSL {out['data']['MSL']['channels']} channels / {out['data']['MSL']['events']} labeled anomalies; "
        f"SMAP {out['data']['SMAP']['channels']} channels / {out['data']['SMAP']['events']} labeled anomalies "
        "(the labels file lists SMAP channel P-2 twice with slightly different windows; we keep the first row, so 54/68, not 55/69).",
        "- Every detector is fit on each channel's **train** split and scores the **test** split. Column 0 is the value; "
        "the forecasters also see the command flags at time t.",
        "- **All hyperparameters and thresholds are tuned on MSL only** (grid below). The winner is the detector with the best "
        "event-wise F0.5 on MSL. Then **all detectors are scored once on SMAP** with their frozen MSL configs. No SMAP number was used to choose anything.",
        "- Scoring is **event-wise, no point-adjust, early margin 0**: a labeled anomaly is caught if any predicted event overlaps it; "
        "each predicted event that overlaps no label is one false alarm. Counts are pooled over channels.",
        f"- Delay = steps from labeled start to the start of the first overlapping alarm (hits only). Bootstrap: {C.N_BOOT} resamples of SMAP channels.",
        "",
        "## Results on SMAP (held out)",
        "",
        "| detector | frozen config (from MSL) | precision | recall | F0.5 | false alarms / 10k steps | median delay (steps) | hits / labeled | false alarms |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for k in ("static", "static_tuned", "ridge", "hgb", "iforest"):
        d, s = r[k], r[k]["smap"]
        cfg = ", ".join(f"{a}={b}" for a, b in d["model"].items())
        cfg = (cfg + ", " if cfg else "") + f"thr={d['amber']}, min_dur={d['min_duration_steps']}, gap={d['gap']}"
        star = " **(winner)**" if k == w else ""
        lines.append(f"| {C.DETECTOR_LABELS[k]}{star} | {cfg} | {fmt(s['precision'])} | {fmt(s['recall'])} | **{fmt(s['f0_5'])}** | "
                     f"{fmt(s['false_alarms_per_10k_steps'])} | {fmt(s['median_delay_steps'], 0)} | {s['hits']} / {s['true_events']} | {s['false_alarms']} |")
    lines += ["", "## Same configs on MSL (tuning set; optimistic by construction, shown for transparency)", "",
              "| detector | precision | recall | F0.5 | false alarms / 10k | configs searched |", "|---|---|---|---|---|---|"]
    for k in ("static", "static_tuned", "ridge", "hgb", "iforest"):
        m = r[k]["msl"]
        lines.append(f"| {C.DETECTOR_LABELS[k]} | {fmt(m['precision'])} | {fmt(m['recall'])} | {fmt(m['f0_5'])} | "
                     f"{fmt(m['false_alarms_per_10k_steps'])} | {r[k]['n_configs']} |")
    b = out["bootstrap"]
    ws, bs = r[w]["smap"], r["static"]["smap"]
    lines += ["", "## Verdict", "",
              f"- **Winner on MSL: {C.DETECTOR_LABELS[w]}.** On SMAP it scores F0.5 = {fmt(ws['f0_5'])} "
              f"(95% channel-bootstrap CI {fmt(b['f0_5_ci95'][0])}–{fmt(b['f0_5_ci95'][1])}) vs {fmt(bs['f0_5'])} for the static 3σ baseline.",
              f"- Paired difference winner − static 3σ: 95% CI {fmt(b['diff_vs_baseline_ci95'][0])} to {fmt(b['diff_vs_baseline_ci95'][1])} "
              f"(share of resamples where the winner is not better: {b['p_diff_le_0']:.3f}).",
              f"- {out['verdict']}",
              f"- Red threshold: {out['red']} ({out['red_rule']}).",
              "",
              "## Caveats (say these out loud)",
              "- Wu & Keogh (2021) showed SMAP/MSL contains anomalies a one-line rule can find, and some doubtful labels. That is why "
              "we report against a trivial static baseline and use event-wise scoring without point-adjust. We do not claim state of the art.",
              "- Pooled event counts weight long, alarm-heavy channels more. The bootstrap over channels shows how much the headline moves with the channel mix.",
              "- These numbers are about the detector, not the habitat: the habitat stream in the app is simulated.",
              "- Several MSL optima sit on the edge of the grid (threshold 30, merge gap 50, L 60, span 30). A wider grid might do better "
              "on MSL. We did **not** widen it and re-score SMAP afterwards, because that would turn the held-out set into a second tuning set. "
              "The grid was fixed before the first run.",
              "- Precision counts predicted events, so a detector that fragments one anomaly into many short alarms gets many 'true alarms'. "
              "This is why IsolationForest shows high precision with low recall (many alarms on a few anomalies). Recall and false alarms "
              "per 10k steps are not affected by this.",
              "",
              "## Grid (MSL only)",
              f"- Ridge: L ∈ {{10, 30, 60}}, EWMA span ∈ {{5, 10, 30}}, alpha = 1. HGB: L ∈ {{10, 30}}, span ∈ {{5, 30}}, 100 iterations, 15 leaves. "
              f"IsolationForest: window ∈ {{10, 30, 60}}, 100 trees.",
              f"- Shared: threshold ∈ {C.THRESHOLD_GRID}, min duration ∈ {C.MIN_DURATION_GRID}, merge gap ∈ {C.GAP_GRID}. "
              f"Static 3σ keeps threshold {C.STATIC_FIXED_THRESHOLD}; its duration and gap are tuned. The tuned static row searches the threshold too.",
              "", "![PR vs baseline](anomaly_pr_vs_baseline.png)", ""]
    path.write_text("\n".join(lines), encoding="utf-8")


def main():
    t0 = time.time()
    print("data source:", download())
    msl, smap = load(C.TUNE_ON), load(C.TEST_ON)
    data = {sc: {"channels": len(ch), "events": sum(len(c.events) for c in ch)} for sc, ch in (("MSL", msl), ("SMAP", smap))}
    print(data)
    results = {}
    for kind in ("static", "static_tuned", "ridge", "hgb", "iforest"):
        t = time.time()
        thr = [C.STATIC_FIXED_THRESHOLD] if kind == "static" else None
        best = tune("static" if kind == "static_tuned" else kind, msl, thr)
        results[kind] = best
        print(f"{kind:13s} MSL best {best['model']} thr={best['amber']} md={best['min_duration_steps']} gap={best['gap']} "
              f"F0.5={best['msl']['f0_5']:.3f}  ({time.time() - t:.0f}s)")
    # winner among the four required detectors, chosen on MSL only
    w = max(("static", "ridge", "hgb", "iforest"), key=lambda k: (results[k]["msl"]["f0_5"], -results[k]["msl"]["false_alarms_per_10k_steps"]))
    red, red_rule = pick_red(results[w], msl)
    # ---- the single SMAP evaluation, all detectors, frozen configs ----
    smap_rows = {}
    for kind, best in results.items():
        base = "static" if kind == "static_tuned" else kind
        sl = score_all(base, [best["model"]], smap)[json.dumps(best["model"])]
        smap_rows[kind] = per_channel_counts(sl, smap, best["amber"], best["min_duration_steps"], best["gap"])
        best["smap"] = pool(smap_rows[kind])
        print(f"{kind:13s} SMAP {best['smap']}")
    boot = bootstrap(smap_rows[w], smap_rows["static"])
    ws, bs, ts = results[w]["smap"], results["static"]["smap"], results["static_tuned"]["smap"]
    if w == "static":
        verdict = "The static 3σ baseline itself won on MSL, so there is no model to beat it with. We report that plainly."
    elif ws["f0_5"] > bs["f0_5"] and boot["diff_vs_baseline_ci95"][0] > 0:
        verdict = (f"The winner beats the static 3σ baseline on SMAP, and the paired bootstrap CI of the difference excludes 0.")
    elif ws["f0_5"] > bs["f0_5"]:
        verdict = ("The winner scores higher than the static 3σ baseline on SMAP, but the paired bootstrap CI of the difference "
                   "includes 0: the gain is not statistically clear on this data.")
    else:
        verdict = "**The winner does NOT beat the static 3σ baseline on SMAP.** That is the honest result."
    verdict += (f" Against the stronger tuned static baseline (F0.5 {ts['f0_5']:.2f}) the winner is "
                f"{'better' if ws['f0_5'] > ts['f0_5'] else 'not better'}.")
    for k in results:
        results[k].pop("_scores", None)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    out = {"generated_at": now, "runtime_s": time.time() - t0, "data": data, "winner": w, "red": red, "red_rule": red_rule,
           "detectors": results, "bootstrap": boot, "verdict": verdict}
    C.RESULTS.mkdir(parents=True, exist_ok=True)
    C.VALIDATION_JSON.write_text(json.dumps(out, indent=1), encoding="utf-8")
    frozen = {"generated_at": now, "winner": w, "model_name": {"ridge": "forecast_residual_ridge_v1", "hgb": "forecast_residual_hgb_v1",
              "iforest": "isolation_forest_windows_v1", "static": "static_3sigma_v1"}[w],
              "params": results[w]["model"], "thresholds": {"amber": float(results[w]["amber"]), "red": red},
              "min_duration_steps": results[w]["min_duration_steps"], "gap": results[w]["gap"],
              "tuned_on": "MSL", "red_rule": red_rule,
              "validation": {
                  "dataset": "NASA SMAP + MSL labeled telemetry anomalies (Hundman et al., KDD 2018)",
                  "tuned_on": f"MSL ({data['MSL']['channels']} channels, {data['MSL']['events']} labeled anomalies)",
                  "tested_on": f"SMAP ({data['SMAP']['channels']} channels, {data['SMAP']['events']} labeled anomalies)",
                  "protocol": "event-wise, no point-adjust",
                  "model": {k: round(ws[k], 3) for k in ("precision", "recall", "f0_5", "false_alarms_per_10k_steps")},
                  "baseline_static_3sigma": {k: round(bs[k], 3) for k in ("precision", "recall", "f0_5", "false_alarms_per_10k_steps")},
              }}
    C.THRESHOLDS_JSON.write_text(json.dumps(frozen, indent=1), encoding="utf-8")
    chart(results, C.RESULTS / "anomaly_pr_vs_baseline.png")
    write_md(out, C.RESULTS / "anomaly_metrics.md")
    print("winner:", w, "| verdict:", verdict, "| boot:", boot, f"| {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
