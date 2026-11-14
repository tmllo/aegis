"""Development flares only.

Peak times in 2024 or later are the test set. This loader drops them before
returning, and nothing here prints or saves those rows.
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
MODEL_CSV = ROOT / "data" / "processed" / "flares_model.csv"


def load_development_set() -> pd.DataFrame:
    raw = pd.read_csv(MODEL_CSV)
    peak = pd.to_datetime(raw["peak_time"], utc=True)
    dev = raw.loc[peak.dt.year <= 2023].copy()
    dev["peak_time"] = peak.loc[dev.index]
    del raw, peak
    if dev["peak_time"].dt.year.max() > 2023:
        raise RuntimeError("test year remained in the development set")
    dev["split"] = "val"
    dev.loc[dev["peak_time"].dt.year <= 2021, "split"] = "train"
    dev["y"] = dev["sep_linked_goes10"].astype(bool)
    dev["has_linked_cme"] = dev["has_linked_cme"].astype(bool)
    dev["cme_speed_kms"] = pd.to_numeric(dev["cme_speed_kms"], errors="coerce")
    return dev.reset_index(drop=True)
