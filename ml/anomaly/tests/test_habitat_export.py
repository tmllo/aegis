"""Plumbing tests for the habitat export (Claude's code; test_anomaly.py stays untouched)."""
import json

import numpy as np

from ml.anomaly import config as C
from ml.anomaly.export_habitat import build
from ml.anomaly.habitat_sim import simulate


def test_sim_is_deterministic_and_hourly():
    a, _ = simulate()
    b, _ = simulate()
    assert a.equals(b)
    assert (a.index.to_series().diff().dropna() == np.timedelta64(1, "h")).all()


def test_every_planted_fault_is_reported_and_labelled_simulated():
    out, _ = build()
    planted = [a for a in out["anomalies"] if a["planted"]]
    assert {a["fault"] for a in planted} == {f["fault"] for f in C.FAULTS}
    assert out["meta"]["simulated_habitat"] is True
    assert all("simulated" in a["fault"].lower() for a in planted)
    json.dumps(out, allow_nan=False)  # no NaN anywhere


def test_export_passes_check_habitat():
    import importlib.util
    spec = importlib.util.spec_from_file_location("vc", C.ML / "validate_contracts.py")
    vc = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(vc)
    out, dbg = build()
    vc.errors.clear()
    vc.check_habitat(out, dbg["crew"])
    assert vc.errors == []
