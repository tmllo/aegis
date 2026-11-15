"""Simulated habitat life-support stream with planted faults (seeded, deterministic). SIMULATED, not real.

    python -m ml.anomaly.habitat_sim        # prints a summary

Hourly from mission.start_date 00:00Z to mission.today 23:00Z (read from crew_data.json).
Nominal: diurnal hump over the crew's waking day + AR(1) sensor noise + ~0.5% null dropouts.
Faults come from config.FAULTS and were fixed before the detector was run on this stream.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from . import config as C


def mission_dates(crew: dict | None = None) -> tuple[str, str]:
    crew = crew or json.loads(C.CREW_JSON.read_text(encoding="utf-8"))
    return crew["mission"]["start_date"], crew["mission"]["today"]


def diurnal(hours: np.ndarray) -> np.ndarray:
    """0 while the crew sleeps, a smooth hump (peak 1) over the waking day."""
    h = hours.astype(float)
    awake = (h >= C.WAKE_HOUR) & (h < C.SLEEP_HOUR)
    return np.where(awake, np.sin(np.pi * (h - C.WAKE_HOUR) / (C.SLEEP_HOUR - C.WAKE_HOUR)), 0.0)


def _ar1(n, phi, sd, rng):
    e = rng.normal(0, sd, n)
    x = np.zeros(n)
    x[0] = e[0] / np.sqrt(1 - phi ** 2)
    for i in range(1, n):
        x[i] = phi * x[i - 1] + e[i]
    return x


def fault_mask(times: pd.DatetimeIndex, f: dict) -> np.ndarray:
    start = pd.Timestamp(f["start"])
    end = pd.Timestamp(f["end"]) if f["end"] else times[-1]
    return (times >= start) & (times <= end)


def _fault_delta(times: pd.DatetimeIndex, base: np.ndarray, f: dict) -> np.ndarray:
    m = fault_mask(times, f)
    d = np.zeros(len(times))
    t_h = (times[m] - times[m][0]).total_seconds().to_numpy() / 3600.0
    dur = t_h[-1] if len(t_h) > 1 else 1.0
    if f["shape"] == "oscillation":
        d[m] = f["amp"] * np.sin(2 * np.pi * t_h / f["period_h"])
    elif f["shape"] == "leak":  # linear loss, then repaired and repressurised over repair_h
        fall = max(dur - f["repair_h"], 1.0)
        d[m] = np.where(t_h <= fall, -f["drop"] * t_h / fall, -f["drop"] * (1 - (t_h - fall) / f["repair_h"]))
    elif f["shape"] == "ramp":  # accelerating rise: reaches `target` (on top of the nominal level) at the last hour
        nominal = C.NOMINAL[f["channel"]]["level"]
        d[m] = (f["target"] - nominal) * (t_h / dur) ** f["power"]
    return d


def simulate(crew: dict | None = None, seed: int = C.SEED) -> tuple[pd.DataFrame, list[dict]]:
    """Returns (df indexed by UTC time with the five channels, NaN = dropout; faults with index windows)."""
    start, today = mission_dates(crew)
    times = pd.date_range(f"{start}T00:00:00Z", f"{today}T23:00:00Z", freq="h")
    rng = np.random.default_rng(seed)
    hump = diurnal(times.hour.to_numpy())
    df = pd.DataFrame(index=times)
    for k in C.CHANNEL_KEYS:
        p = C.NOMINAL[k]
        sign = -1.0 if k == "ppo2_kpa" else 1.0   # O2 dips slightly while the crew is awake and breathing more
        df[k] = p["level"] + sign * p["diurnal"] * hump + _ar1(len(times), p["phi"], p["sd"], rng)
    faults = []
    for f in C.FAULTS:
        df[f["channel"]] += _fault_delta(times, df[f["channel"]].to_numpy(), f)
        idx = np.flatnonzero(fault_mask(times, f))
        faults.append({**f, "i0": int(idx[0]), "i1": int(idx[-1])})
    for k in C.CHANNEL_KEYS:  # dropouts last, so they can hide any value including fault hours
        df.loc[rng.random(len(times)) < C.DROPOUT_RATE, k] = np.nan
    return df, faults


if __name__ == "__main__":
    df, faults = simulate()
    print(df.describe().round(2).to_string())
    print("rows", len(df), "nulls", int(df.isna().sum().sum()))
    for f in faults:
        print(f["id"], f["channel"], df.index[f["i0"]], "->", df.index[f["i1"]])
