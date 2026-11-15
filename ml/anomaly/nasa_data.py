"""Download + load NASA JPL SMAP/MSL labeled telemetry (Hundman et al., KDD 2018).

    python -m ml.anomaly.nasa_data          # download if missing, then print the sanity summary

Layout under ml/data/nasa_smap_msl/ (git-ignored):
    labeled_anomalies.csv, train/<chan>.npy, test/<chan>.npy
Column 0 of each array is the telemetry value; the other columns are one-hot command flags.
"""
from __future__ import annotations

import ast
import json
import subprocess
import urllib.request
from dataclasses import dataclass

import numpy as np
import pandas as pd

from . import config as C


@dataclass
class Channel:
    chan_id: str
    spacecraft: str
    train: np.ndarray        # (n_train, n_features)
    test: np.ndarray         # (n_test, n_features)
    events: list             # [(start, end)] inclusive, indices into test

    @property
    def x_train(self): return self.train[:, 0].astype(float)
    @property
    def x_test(self): return self.test[:, 0].astype(float)
    @property
    def exog_train(self): return self.train[:, 1:].astype(float) if self.train.shape[1] > 1 else None
    @property
    def exog_test(self): return self.test[:, 1:].astype(float) if self.test.shape[1] > 1 else None


def _fetch(url: str, dest) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "aegis-anomaly/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        dest.write_bytes(r.read())


def download() -> str:
    """Try the sources in config order. Returns the source that worked."""
    d = C.NASA_DIR
    (d / "train").mkdir(parents=True, exist_ok=True)
    (d / "test").mkdir(parents=True, exist_ok=True)
    if not (d / "labeled_anomalies.csv").exists():
        _fetch(C.LABELS_URL, d / "labeled_anomalies.csv")
    labels = pd.read_csv(d / "labeled_anomalies.csv")
    if all((d / s / f"{c}.npy").exists() for c in labels.chan_id for s in ("train", "test")):
        return "cached"
    errors = []
    # (1) original zip
    try:
        import io, zipfile
        req = urllib.request.Request(C.DATA_URLS[0], headers={"User-Agent": "aegis-anomaly/1.0"})
        with urllib.request.urlopen(req, timeout=120) as r:
            zipfile.ZipFile(io.BytesIO(r.read())).extractall(d.parent)
        return C.DATA_URLS[0]
    except Exception as e:  # noqa: BLE001
        errors.append(f"s3: {e}")
    # (2) kaggle
    try:
        subprocess.run(["kaggle", "datasets", "download", "-d", C.DATA_URLS[1].split(":", 1)[1],
                        "-p", str(d), "--unzip"], check=True, timeout=600)
        return C.DATA_URLS[1]
    except Exception as e:  # noqa: BLE001
        errors.append(f"kaggle: {e}")
    # (3) public GitHub mirror of the same arrays
    base = C.DATA_URLS[2]
    for c in labels.chan_id.unique():
        for s in ("train", "test"):
            p = d / s / f"{c}.npy"
            if not p.exists():
                _fetch(f"{base}/{s}/{c}.npy", p)
    print("download fallbacks used:", errors)
    return base


def load(spacecraft: str | None = None) -> list[Channel]:
    d = C.NASA_DIR
    labels = pd.read_csv(d / "labeled_anomalies.csv")
    n0 = len(labels)
    labels = labels.drop_duplicates("chan_id")
    if len(labels) != n0:
        print(f"deduped {n0 - len(labels)} duplicate chan_id rows")
    if spacecraft:
        labels = labels[labels.spacecraft == spacecraft]
    out = []
    for r in labels.itertuples():
        test = np.load(d / "test" / f"{r.chan_id}.npy")
        if len(test) != r.num_values:
            raise ValueError(f"{r.chan_id}: test length {len(test)} != num_values {r.num_values}")
        events = [(int(a), int(b)) for a, b in ast.literal_eval(r.anomaly_sequences)]
        out.append(Channel(r.chan_id, r.spacecraft, np.load(d / "train" / f"{r.chan_id}.npy"), test, events))
    return out


def summary() -> dict:
    s = {}
    for sc in ("SMAP", "MSL"):
        ch = load(sc)
        s[sc] = {"channels": len(ch), "events": sum(len(c.events) for c in ch),
                 "train_steps": int(sum(len(c.train) for c in ch)),
                 "test_steps": int(sum(len(c.test) for c in ch)),
                 "n_features": sorted({c.train.shape[1] for c in ch})}
        exp = C.EXPECTED[sc]
        s[sc]["matches_paper"] = s[sc]["channels"] == exp["channels"] and s[sc]["events"] == exp["events"]
    return s


if __name__ == "__main__":
    print("source:", download())
    print(json.dumps(summary(), indent=1))
