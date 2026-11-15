"""Organ dose map, shielding path and the forecast explainer. Contract in RADIATION-ORGANS-API.md."""
from fastapi.testclient import TestClient

from server.api.app import create_app
from server.core.catalog import Catalog
from server.radiation_organs.engine import val

client = TestClient(create_app())
IDS = ["skin", "eye_lens", "brain", "salivary", "thyroid", "oesophagus", "breast", "lung", "heart",
       "liver", "stomach", "colon", "bladder", "gonads", "red_marrow", "bone_surface", "kidney",
       "pancreas", "spleen", "remainder"]
SOURCES = {f"S{i}" for i in range(1, 13)} | {"HAND-SET", "DONKI"}


def _organs(**params):
    r = client.get("/api/radiation/organs", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def _walk_numbers(node, path=""):
    if isinstance(node, dict) and "value" in node and "source" in node:
        assert node["source"] in SOURCES, path
        if node.get("tag") == "HAND-SET" or node["source"] == "HAND-SET":
            assert node.get("tag") == "HAND-SET" or node["source"] == "HAND-SET"
        return
    if isinstance(node, dict):
        for k, v in node.items():
            _walk_numbers(v, f"{path}.{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            _walk_numbers(v, f"{path}[{i}]")


def test_catalog_organs_and_every_number_has_a_source():
    spec = Catalog.load().extra["radiation_organs"]
    ids = [o["id"] for o in spec["organs"]]
    assert ids == IDS[:-1]
    _walk_numbers(spec)
    assert val(spec["iss_trapped_share"]) == 0.4
    assert spec["iss_trapped_share"]["source"] == "HAND-SET"
    assert val(spec["reid_per_mSv_pct"]) == 0.005
    by_id = {o["id"]: o for o in spec["organs"]}
    for oid in IDS[:-1]:
        organ = by_id[oid]
        assert "pos" in organ and "r" in organ and "mesh" in organ
        assert isinstance(organ["remainder"], bool)
        assert organ["w_T"]["source"] and organ["trapped_ratio"]["source"]


def test_spe_table_and_shelter_and_vest():
    hull = _organs(subject="c1", env="moon", scenario="spe", event="oct1989", shield="hull", days=30)
    by = {o["id"]: o for o in hull["organs"]}
    assert by["lung"]["dose_mSv"] == 254.5
    assert by["red_marrow"]["dose_mSv"] == 154.6
    assert by["skin"]["dose_mSv"] == 494.4
    assert hull["totals"]["effective_mSv"] == 219.0
    assert hull["quality"] == "estimate"
    assert {s["id"] for s in hull["sources"]} >= {"S4", "S7", "S8", "S10"}
    vest = _organs(scenario="spe", event="oct1989", shield="vest", days=30, env="moon")
    assert vest["totals"]["effective_mSv"] == 138.2
    aug = _organs(scenario="spe", event="aug1972", shield="hull", days=30, env="moon")
    assert aug["totals"]["effective_mSv"] == 204.2
    for event in ("oct1989", "aug1972"):
        for shield in ("vest", "shelter"):
            body = _organs(scenario="spe", event=event, shield=shield, days=30, env="moon")
            base = _organs(scenario="spe", event=event, shield="hull", days=30, env="moon")
            b = {o["id"]: o["dose_mSv"] for o in body["organs"] if o["id"] != "remainder"}
            h = {o["id"]: o["dose_mSv"] for o in base["organs"] if o["id"] != "remainder"}
            assert all(b[i] < h[i] for i in b)
        skin = max(o["dose_mSv"] for o in _organs(scenario="spe", event=event, shield="hull", days=30, env="moon")["organs"])
        doses = {o["id"]: o["dose_mSv"] for o in _organs(scenario="spe", event=event, shield="hull", days=30, env="moon")["organs"]}
        assert doses["skin"] == skin


def test_gcr_is_uniform_and_effective_matches_the_daily_rate():
    body = _organs(subject="c1", env="moon", scenario="gcr", event="oct1989", shield="hull", days=10, sex="f")
    doses = [o["dose_mSv"] for o in body["organs"]]
    assert max(doses) <= min(doses) * 1.01
    assert abs(body["totals"]["effective_mSv"] - 1.4 * 10) / 14 < 0.02
    ranked = [o["id"] for o in sorted(body["organs"], key=lambda o: -o["share_of_risk"]) if o["id"] != "remainder"]
    assert ranked[:3] == ["lung", "breast", "stomach"]
    male = _organs(scenario="gcr", env="moon", days=10, sex="m")
    breast = next(o for o in male["organs"] if o["id"] == "breast")
    assert breast["share_of_risk"] == 0


def test_spe_risk_order_and_the_shelter_level():
    body = _organs(scenario="spe", event="oct1989", shield="hull", env="moon", days=30, sex="f")
    ranked = [o["id"] for o in sorted(body["organs"], key=lambda o: -o["share_of_risk"]) if o["id"] != "remainder"]
    assert ranked[0] == "breast" and ranked[1] == "lung"
    marrow = next(o for o in body["organs"] if o["id"] == "red_marrow")
    assert marrow["level"] == "amber"
    assert round(marrow["pct_of_limit"]) == 79
    shelter = _organs(scenario="spe", event="oct1989", shield="shelter", env="moon", days=30)
    sm = next(o for o in shelter["organs"] if o["id"] == "red_marrow")
    assert sm["dose_mSv"] == 75
    assert sm["level"] == "green"
    assert round(sm["pct_of_limit"]) == 47
    assert "mGy-Eq" in shelter["notes"][0] and "mSv" in shelter["notes"][0]


def test_path_flux_and_forecast_headline():
    spe = client.get("/api/radiation/path", params={"scenario": "spe", "event": "aug1972", "shield": "hull"}).json()
    flux = [next(s["rel_flux"] for s in spe["stages"] if s["id"] == i) for i in ("suit", "vessel", "room", "shelter")]
    assert flux[0] > flux[1] > flux[2] > flux[3]
    assert spe["body_gradient"]["skin_to_deep"] == 20
    assert spe["body_gradient"]["source_id"] == "S1"
    gcr = client.get("/api/radiation/path", params={"scenario": "gcr", "shield": "hull"}).json()
    assert all(abs(s["rel_flux"] - 1.0) < 0.02 for s in gcr["stages"])
    assert "v2" not in str(gcr).lower()
    explained = client.get("/api/forecast/explain").json()
    assert explained["quality"] == "model"
    assert explained["model"] == "logistic_C10"
    h = explained["headline"]
    assert h["n_storms"] == 17 and h["caught"] == 16 and h["median_lead_time_h"] == 3.83
    assert len(explained["held_out_storms"]) == 17
    missed = [s for s in explained["held_out_storms"] if not s["caught"]]
    assert len(missed) == 1 and missed[0]["onset"].startswith("2026-09-05T16:15")
    assert explained["now"]["action"] in ("No action needed", "Stay within reach of the shelter", "Go to the shelter")
    assert "v2" not in str(explained).lower()


def test_endpoints_are_mounted_and_reject_a_bad_subject():
    assert client.get("/api/radiation/organs/compare", params={"event": "oct1989"}).status_code == 200
    assert client.get("/api/radiation/organs", params={"subject": "nope"}).status_code == 404
    assert client.get("/api/radiation/path", params={"scenario": "spe", "event": "aug1972"}).status_code == 200
