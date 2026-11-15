"""
Habitat / spacecraft telemetry anomaly detector.   >>> TOMAS WRITES THE TODOs <<<

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

Run the tests:  python -m pytest ml/anomaly/tests -q
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler

MAD_TO_SD = 1.4826  # makes MAD comparable to a standard deviation for normal data


def make_lag_features(x: np.ndarray, L: int, exog: np.ndarray | None = None):
    """Turn a series into a supervised-learning table.

    Row i (for i = 0 .. n-L-1) predicts y = x[i+L] from the L previous values
    x[i], ..., x[i+L-1]  (+ exog[i+L] if exog is given, appended as extra columns).

    Returns:
        X: shape (n - L, L + n_exog)
        y: shape (n - L,)

    Example: x = [0, 1, 2, 3, 4], L = 2  ->  X = [[0,1],[1,2],[2,3]], y = [2, 3, 4]
    """
    # TODO(Tomas): build X and y. Hint: np.lib.stride_tricks.sliding_window_view, or a simple loop.
    raise NotImplementedError


class ForecastResidualDetector:
    """Ridge forecast -> smoothed absolute error -> robust z-score."""

    def __init__(self, L: int = 30, span: int = 10, alpha: float = 1.0):
        self.L = L          # how many past steps the model sees
        self.span = span    # EWMA span used to smooth the error
        self.alpha = alpha  # Ridge regularisation strength

    def fit(self, x_train: np.ndarray, exog_train: np.ndarray | None = None) -> "ForecastResidualDetector":
        """Learn 'normal' from training data ONLY.

        1. Build lag features, scale them (StandardScaler), fit Ridge.
        2. Compute the smoothed error on the training data itself (self._smoothed_error).
        3. Store its median and MAD as self.err_median_ and self.err_mad_ (these define "normal").
           Guard: if MAD is 0, use a tiny positive number instead.
        """
        # TODO(Tomas)
        raise NotImplementedError

    def _smoothed_error(self, x: np.ndarray, exog: np.ndarray | None = None) -> np.ndarray:
        """Absolute one-step forecast error, EWMA-smoothed. Length n - L (no nan padding here).

        Hint: pd.Series(err).ewm(span=self.span).mean().to_numpy()
        """
        # TODO(Tomas)
        raise NotImplementedError

    def score(self, x: np.ndarray, exog: np.ndarray | None = None) -> np.ndarray:
        """Robust z of the smoothed error vs the training period.

        z = (smoothed_error - err_median_) / (MAD_TO_SD * err_mad_)
        Return length n: L leading np.nan, then the z values.
        """
        # TODO(Tomas)
        raise NotImplementedError


class StaticThreshold:
    """Baseline to beat: how far is the RAW value from its training median, in robust sd units?"""

    def fit(self, x_train: np.ndarray, exog_train=None) -> "StaticThreshold":
        # TODO(Tomas): store median and MAD of x_train (same zero-MAD guard).
        raise NotImplementedError

    def score(self, x: np.ndarray, exog=None) -> np.ndarray:
        # TODO(Tomas): |x - median| / (MAD_TO_SD * mad). Same length as x, no nan padding needed.
        raise NotImplementedError


def to_events(scores: np.ndarray, threshold: float, min_duration: int = 3, gap: int = 0) -> list[tuple[int, int]]:
    """Turn a score array into anomaly events.

    1. above = scores >= threshold   (nan counts as False)
    2. find runs of consecutive True; keep runs at least `min_duration` long
    3. merge two kept runs if the number of steps BETWEEN them is <= gap
    Return a list of (start, end) pairs, end inclusive, sorted.

    Example: scores = [0,5,5,5,0,5,5,5], threshold=4, min_duration=3, gap=1  ->  [(1, 7)]
             same with gap=0                                                ->  [(1, 3), (5, 7)]
    """
    # TODO(Tomas)
    raise NotImplementedError
