"""
Habitat / spacecraft telemetry anomaly detector.

Idea in one line: learn to predict each sensor's next value from its recent past;
when the prediction error becomes unusually large for a sustained time, something changed.

Pipeline:  series -> lag features -> Ridge forecast -> |error| -> EWMA smoothing -> robust z score -> events

Conventions (the tests rely on them):
- A "series" is a 1-D numpy array of floats (one sensor channel).
- `exog` is an optional 2-D array (n_steps, n_features) of extra inputs known at time t
  (SMAP/MSL command flags, or other habitat channels). Same length as the series.
- score(...) returns an array THE SAME LENGTH as the input series. The first L values
  (no full history yet) are np.nan.
- Events are (start, end) index pairs, end INCLUSIVE.

Written by Claude at Tomas's request (tutor mode switched off for the unattended build).

Run the tests:  python -m pytest ml/anomaly/tests -q
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler

MAD_TO_SD = 1.4826  # makes MAD comparable to a standard deviation for normal data
EPS = 1e-9          # zero-MAD guard


def _robust_center_scale(v: np.ndarray) -> tuple[float, float]:
    v = v[np.isfinite(v)]
    med = float(np.median(v))
    mad = float(np.median(np.abs(v - med)))
    if mad == 0:  # step-like / mostly-constant channels: fall back to sd (expressed in MAD units)
        mad = float(np.std(v)) / MAD_TO_SD
    return med, max(mad, EPS)


def make_lag_features(x: np.ndarray, L: int, exog: np.ndarray | None = None):
    """Row i predicts y = x[i+L] from x[i..i+L-1] (+ exog[i+L] appended)."""
    x = np.asarray(x, dtype=float)
    X = np.lib.stride_tricks.sliding_window_view(x, L)[:-1].copy()
    y = x[L:].copy()
    if exog is not None:
        exog = np.asarray(exog, dtype=float)
        if exog.ndim == 1:
            exog = exog.reshape(-1, 1)
        X = np.hstack([X, exog[L:]])
    return X, y


class _ForecastResidualBase:
    """Forecast -> smoothed absolute error -> robust z. Subclasses provide _make_model()."""

    def __init__(self, L: int = 30, span: int = 10):
        self.L = L
        self.span = span

    def _make_model(self):  # pragma: no cover - overridden
        raise NotImplementedError

    def fit(self, x_train: np.ndarray, exog_train: np.ndarray | None = None):
        X, y = make_lag_features(x_train, self.L, exog_train)
        self.scaler_ = StandardScaler().fit(X)
        self.model_ = self._make_model().fit(self.scaler_.transform(X), y)
        e = self._smoothed_error(x_train, exog_train)
        self.err_median_, self.err_mad_ = _robust_center_scale(e)
        return self

    def _smoothed_error(self, x: np.ndarray, exog: np.ndarray | None = None) -> np.ndarray:
        X, y = make_lag_features(x, self.L, exog)
        err = np.abs(y - self.model_.predict(self.scaler_.transform(X)))
        return pd.Series(err).ewm(span=self.span).mean().to_numpy()

    def score(self, x: np.ndarray, exog: np.ndarray | None = None) -> np.ndarray:
        z = (self._smoothed_error(x, exog) - self.err_median_) / (MAD_TO_SD * self.err_mad_)
        return np.concatenate([np.full(self.L, np.nan), z])


class ForecastResidualDetector(_ForecastResidualBase):
    """Ridge forecast -> smoothed absolute error -> robust z-score."""

    def __init__(self, L: int = 30, span: int = 10, alpha: float = 1.0):
        super().__init__(L, span)
        self.alpha = alpha  # Ridge regularisation strength

    def _make_model(self):
        return Ridge(alpha=self.alpha)


class HGBForecastDetector(_ForecastResidualBase):
    """Same pipeline, HistGradientBoosting forecaster (challenger (c) in run_validation)."""

    def __init__(self, L: int = 30, span: int = 10, max_iter: int = 100, max_leaf_nodes: int = 15,
                 seed: int = 0):
        super().__init__(L, span)
        self.max_iter, self.max_leaf_nodes, self.seed = max_iter, max_leaf_nodes, seed

    def _make_model(self):
        from sklearn.ensemble import HistGradientBoostingRegressor
        return HistGradientBoostingRegressor(max_iter=self.max_iter, max_leaf_nodes=self.max_leaf_nodes,
                                             random_state=self.seed)


class IsolationForestDetector:
    """Challenger (d): IsolationForest on rolling-window features of the raw value (no forecast).

    Features at t over the window [t-W+1, t]: last value, mean, std, min, max, slope (last - first).
    Score = robust z of the IF anomaly score vs the fit period, so thresholds are on the same scale
    as the other detectors. First W-1 values are nan.
    """

    def __init__(self, W: int = 30, n_estimators: int = 100, seed: int = 0, max_samples: int = 2048):
        self.W, self.n_estimators, self.seed, self.max_samples = W, n_estimators, seed, max_samples

    def _features(self, x: np.ndarray) -> np.ndarray:
        win = np.lib.stride_tricks.sliding_window_view(np.asarray(x, float), self.W)
        return np.column_stack([win[:, -1], win.mean(1), win.std(1), win.min(1), win.max(1),
                                win[:, -1] - win[:, 0]])

    def fit(self, x_train: np.ndarray, exog_train=None) -> "IsolationForestDetector":
        from sklearn.ensemble import IsolationForest
        F = self._features(x_train)
        self.model_ = IsolationForest(n_estimators=self.n_estimators, random_state=self.seed,
                                      max_samples=min(self.max_samples, len(F))).fit(F)
        raw = -self.model_.score_samples(F)
        self.med_, self.mad_ = _robust_center_scale(raw)
        return self

    def score(self, x: np.ndarray, exog=None) -> np.ndarray:
        raw = -self.model_.score_samples(self._features(x))
        z = (raw - self.med_) / (MAD_TO_SD * self.mad_)
        return np.concatenate([np.full(self.W - 1, np.nan), z])


class StaticThreshold:
    """Baseline to beat: how far is the RAW value from its training median, in robust sd units?"""

    def fit(self, x_train: np.ndarray, exog_train=None) -> "StaticThreshold":
        self.median_, self.mad_ = _robust_center_scale(np.asarray(x_train, float))
        return self

    def score(self, x: np.ndarray, exog=None) -> np.ndarray:
        return np.abs(np.asarray(x, float) - self.median_) / (MAD_TO_SD * self.mad_)


def to_events(scores: np.ndarray, threshold: float, min_duration: int = 3, gap: int = 0) -> list[tuple[int, int]]:
    """Runs of scores >= threshold (nan = False) lasting >= min_duration; merge if <= gap steps apart."""
    s = np.asarray(scores, dtype=float)
    above = np.where(np.isnan(s), False, s >= threshold).astype(np.int8)
    d = np.diff(np.concatenate([[0], above, [0]]))
    starts, ends = np.flatnonzero(d == 1), np.flatnonzero(d == -1) - 1
    runs = [(int(a), int(b)) for a, b in zip(starts, ends) if b - a + 1 >= min_duration]
    merged: list[tuple[int, int]] = []
    for a, b in runs:
        if merged and a - merged[-1][1] - 1 <= gap:
            merged[-1] = (merged[-1][0], b)
        else:
            merged.append((a, b))
    return merged
