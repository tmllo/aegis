"""The Checkup page's two extra readings are stored and do not touch the contract files."""
import hashlib
from pathlib import Path

from fastapi.testclient import TestClient

from server.api.app import create_app

ROOT = Path(__file__).resolve().parents[2]
FILES = ("crew_data.json", "storm_forecast.json", "real_crew.json")
client = TestClient(create_app())


def _digest() -> dict[str, str]:
    out = {}
    for name in FILES:
        path = ROOT / "web" / "public" / "data" / name
        out[name] = hashlib.sha256(path.read_bytes()).hexdigest()
    return out


def test_checkup_posts_the_two_spot_readings_and_leaves_the_contract():
    before = _digest()
    bodies = (
        {"subject": "c1", "metric": "vital.resp_rate", "t": "2026-11-14T08:15:00Z", "value": 14},
        {"subject": "c1", "metric": "cog.pvt_rt", "t": "2026-11-14T08:15:00Z", "value": 248},
    )
    for body in bodies:
        res = client.post("/api/observations", json=body)
        assert res.status_code == 201, res.text
        got = res.json()
        assert got["assessment"] is None
        assert got["opened_tasks"] == []
        assert got["closed_tasks"] == []
        assert got["stored"]["quality"] == "estimated"
        assert got["stored"]["metric"] == body["metric"]

    rows = client.get("/api/observations", params={"subject": "c1"}).json()
    found = {(r["metric"], r["value"], r["quality"]) for r in rows}
    assert ("vital.resp_rate", 14.0, "estimated") in found
    assert ("cog.pvt_rt", 248.0, "estimated") in found
    assert _digest() == before
