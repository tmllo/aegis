"""Recorded near-Earth space weather. It must not touch the storm forecast."""
import hashlib
from pathlib import Path

from fastapi.testclient import TestClient

from server.api.app import create_app

ROOT = Path(__file__).resolve().parents[2]
FILES = ("crew_data.json", "storm_forecast.json", "real_crew.json")
client = TestClient(create_app())


def test_now_is_the_recorded_sample_and_the_forecast_is_untouched():
    before = {name: hashlib.sha256((ROOT / "web" / "public" / "data" / name).read_bytes()).hexdigest() for name in FILES}
    body = client.get("/api/space-weather/now").json()
    assert body["quality"] == "recorded"
    assert body["cached"] is True
    assert body["fetched_at"] == "2026-11-14T17:47:00Z"
    assert body["noaa_scales"] == {"R": 0, "S": 0, "G": 0}
    assert body["xray_flares"] == [{"class": "C4.4", "peak_time": "2026-11-14T06:06:00Z"}]
    assert body["goes_p10_pfu"][-1] == {"time": "2026-11-14T17:40:00Z", "value": 0.225}
    assert body["kp"][-1]["time"] == "2026-11-14T12:00:00Z"
    assert "metrics_test" not in body
    after = {name: hashlib.sha256((ROOT / "web" / "public" / "data" / name).read_bytes()).hexdigest() for name in FILES}
    assert after == before
