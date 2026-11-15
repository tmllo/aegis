"""Your feedback loop. Run:  python -m pytest ml/anomaly/tests -q
Go test by test: make the first one pass, then the next. Don't edit the tests to make them pass."""
import numpy as np
import pytest

from ml.anomaly.detector import ForecastResidualDetector, StaticThreshold, make_lag_features, to_events
from ml.anomaly.evaluate import event_metrics, false_alarms_per_10k, overlaps


def ar1(n, phi=0.8, sd=1.0, seed=0):
    rng = np.random.default_rng(seed)
    x = np.zeros(n)
    for i in range(1, n):
        x[i] = phi * x[i - 1] + rng.normal(0, sd)
    return x


# ---------- step 1: lag features ----------
def test_lag_features_example():
    X, y = make_lag_features(np.array([0, 1, 2, 3, 4], float), L=2)
    assert np.array_equal(X, [[0, 1], [1, 2], [2, 3]])
    assert np.array_equal(y, [2, 3, 4])


def test_lag_features_with_exog():
    x = np.arange(6, dtype=float)
    exog = np.arange(6, dtype=float).reshape(-1, 1) * 10
    X, y = make_lag_features(x, L=3, exog=exog)
    assert X.shape == (3, 4)
    assert np.array_equal(X[0], [0, 1, 2, 30])  # exog at the time being predicted (t = 3)
    assert np.array_equal(y, [3, 4, 5])


# ---------- step 2: detector ----------
def test_score_shape_and_nan_padding():
    x = ar1(600)
    det = ForecastResidualDetector(L=20).fit(x[:400])
    s = det.score(x)
    assert s.shape == x.shape
    assert np.isnan(s[:20]).all() and not np.isnan(s[20:]).any()


def test_training_scores_are_centered():
    x = ar1(2000)
    det = ForecastResidualDetector(L=20).fit(x)
    s = det.score(x)
    assert abs(np.nanmedian(s)) < 0.1  # median of robust z on the fit data is ~0 by construction


def test_detects_spike_and_drift_not_noise():
    train, test = ar1(1500, seed=1), ar1(1500, seed=2)
    test_anom = test.copy()
    test_anom[500:520] += 8                          # level shift / spike
    test_anom[1000:1200] += np.linspace(0, 10, 200)  # slow drift
    det = ForecastResidualDetector(L=20, span=5).fit(train)
    clean_events = to_events(det.score(test), threshold=4, min_duration=3)
    anom_events = to_events(det.score(test_anom), threshold=4, min_duration=3)
    assert len(clean_events) <= 1
    assert any(overlaps(e, (500, 520)) for e in anom_events)


def test_static_threshold():
    x = np.array([10, 10, 11, 9, 10, 10, 30], float)
    st = StaticThreshold().fit(x[:6])
    s = st.score(x)
    assert s.shape == x.shape and s[-1] > 5 and s[0] < 1


# ---------- step 3: events ----------
def test_to_events_examples():
    s = np.array([0, 5, 5, 5, 0, 5, 5, 5], float)
    assert to_events(s, 4, min_duration=3, gap=1) == [(1, 7)]
    assert to_events(s, 4, min_duration=3, gap=0) == [(1, 3), (5, 7)]
    assert to_events(np.array([np.nan, 5, 5, 0, 5, 5, 5, 5]), 4, min_duration=3) == [(4, 7)]
    assert to_events(np.zeros(10), 4) == []


# ---------- step 4: evaluation ----------
def test_event_metrics_hand_example():
    true = [(10, 20), (50, 60), (90, 95)]
    pred = [(15, 18), (55, 70), (30, 35)]  # hit, hit, false alarm; (90,95) missed
    m = event_metrics(pred, true)
    assert m["tp_true"] == 2 and m["fn"] == 1 and m["fp"] == 1 and m["tp_pred"] == 2
    assert m["precision"] == pytest.approx(2 / 3) and m["recall"] == pytest.approx(2 / 3)
    assert m["f_beta"] == pytest.approx(2 / 3)
    assert m["delays"] == [5, 5] and m["median_delay"] == 5


def test_early_margin():
    m = event_metrics([(5, 8)], [(10, 20)], early_margin=3)
    assert m["tp_true"] == 1 and m["delays"] == [-5]
    assert event_metrics([(5, 8)], [(10, 20)], early_margin=0)["fp"] == 1


def test_edge_cases_and_rate():
    m = event_metrics([], [(1, 2)])
    assert m["precision"] == 0.0 and m["recall"] == 0.0 and m["f_beta"] == 0.0 and np.isnan(m["median_delay"])
    assert false_alarms_per_10k(3, 30000) == pytest.approx(1.0)
