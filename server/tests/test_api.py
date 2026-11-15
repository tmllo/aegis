from fastapi.testclient import TestClient

from server.api.app import create_app

client = TestClient(create_app())


def test_health_is_json():
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["ok"] is True


def test_emiles_cabin_request_exact_shape():
    r = client.get("/api/observations", params={"subject": "iss", "kind": "cabin"})
    rows = r.json()
    assert r.status_code == 200 and rows
    assert all(set(x) == {"metric", "t", "value", "quality"} for x in rows)
    keys = {x["metric"] for x in rows}
    assert {"cabin.pressure", "cabin.ppo2", "cabin.ppco2", "cabin.temp", "cabin.water_clean", "cabin.water_waste", "cabin.urine_tank"} <= keys


def test_contract_files_served():
    for name in ("crew_data.json", "storm_forecast.json", "real_crew.json"):
        assert client.get(f"/data/{name}").status_code == 200
