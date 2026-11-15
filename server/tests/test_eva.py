"""EVA suit lane: contract shape, a deterministic sim, the emergency and storm ladders, assess."""
import json

from fastapi.testclient import TestClient

from server.api.app import create_app
from server.core.catalog import Catalog
from server.eva import engine

client = TestClient(create_app())

FRAME = {"t_s", "activity", "distance_m", "waypoint_id", "nav", "bio", "suit", "env", "alerts", "status", "metrics"}
NAV = {"target", "distance_m", "bearing_deg"}
BIO = {"hr_bpm", "spo2_pct", "resp_rate_bpm", "core_temp_c", "metabolic_w"}
SUIT = {"o2_pct", "o2_time_left_min", "ppco2_mmHg", "pressure_psi", "coolant_c",
        "battery_v", "battery_pct", "scrubber"}
ENV = {"dose_uSv_h", "dose_cum_uSv", "ext_temp_c", "gravity_g", "sunlit"}
ALERT = {"level", "code", "text", "action"}
SUMMARY = {"duration_min", "max_hr", "o2_used_pct", "dose_total_uSv", "alerts_by_level", "verdict"}
LEVELS = {"advisory", "caution", "warning", "emergency"}
STATUS = {"nominal", "caution", "warning", "abort"}


def _sim(**params):
    r = client.get("/api/eva/sim", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def test_sites_match_the_contract_and_the_habitat_dose():
    cat = Catalog.load()
    body = client.get("/api/eva/sites").json()
    assert body["quality"] == "simulated"
    assert {s["id"] for s in body["sources"]} >= {"eva_sim", "habitat_dose", "crew_baseline"}
    assert [s["id"] for s in body["sites"]] == ["moon", "mars"]
    by_id = {s["id"]: s for s in body["sites"]}
    assert by_id["moon"]["gravity_g"] == 0.166
    assert by_id["mars"]["gravity_g"] == 0.38
    for sid, hab in (("moon", "moon_base"), ("mars", "mars_surface")):
        mSv = cat.subjects[hab]["assumed_dose_mSv_day"]
        assert by_id[sid]["dose_uSv_h"] == round(mSv / 24 * 1000, 2)
        assert set(by_id[sid]["ext_temp_c"]) == {"min", "max"}
        assert set(by_id[sid]["light_delay_s"]) == {"min", "max"}
        assert set(by_id[sid]["habitat"]) == {"name", "lat", "lon"}
        assert len(by_id[sid]["waypoints"]) == 3
        for w in by_id[sid]["waypoints"]:
            assert set(w) == {"id", "name", "distance_m", "bearing_deg", "task"}


def test_sim_shape_matches_the_contract():
    body = _sim(subject="c1", site="moon", profile="walk", minutes=2, step_s=30, storm=0)
    assert set(body) == {"subject", "site", "profile", "storm", "start", "step_s", "quality",
                         "sources", "frames", "summary"}
    assert body["quality"] == "simulated"
    assert body["subject"] == "c1" and body["site"] == "moon" and body["profile"] == "walk"
    assert body["storm"] == 0 and body["step_s"] == 30
    assert body["start"].endswith("T12:00:00Z")
    assert [f["t_s"] for f in body["frames"]] == [0, 30, 60, 90, 120]
    frame = body["frames"][0]
    assert set(frame) == FRAME
    assert set(frame["nav"]) == NAV
    assert set(frame["bio"]) == BIO
    assert set(frame["suit"]) == SUIT
    assert set(frame["env"]) == ENV
    assert frame["suit"]["scrubber"] in {"NOMINAL", "DEGRADED", "FAULT"}
    assert frame["suit"]["pressure_psi"] == 4.3
    assert frame["status"] in STATUS
    assert 0 <= frame["activity"] <= 1
    assert frame["env"]["sunlit"] is True
    assert set(body["summary"]) == SUMMARY
    assert set(body["summary"]["alerts_by_level"]) == LEVELS
    for f in body["frames"]:
        for a in f["alerts"]:
            assert set(a) == ALERT
            assert a["level"] in LEVELS
            assert a["text"] and a["action"]


def test_same_seed_is_deterministic_and_storm_does_not_change_the_walk():
    a = _sim(subject="c1", site="mars", profile="traverse", minutes=10, step_s=10, storm=0)
    b = _sim(subject="c1", site="mars", profile="traverse", minutes=10, step_s=10, storm=0)
    assert a == b
    storm = _sim(subject="c1", site="mars", profile="traverse", minutes=10, step_s=10, storm=1)
    assert [f["activity"] for f in a["frames"]] == [f["activity"] for f in storm["frames"]]
    assert [f["suit"]["o2_pct"] for f in a["frames"]] == [f["suit"]["o2_pct"] for f in storm["frames"]]
    assert storm["summary"]["dose_total_uSv"] > a["summary"]["dose_total_uSv"]
    other = _sim(subject="c2", site="mars", profile="traverse", minutes=10, step_s=10, storm=0)
    assert [f["activity"] for f in other["frames"]] != [f["activity"] for f in a["frames"]]


def test_lower_gravity_is_less_effort():
    moon = _sim(subject="c1", site="moon", profile="walk", minutes=20, step_s=10, storm=0)
    mars = _sim(subject="c1", site="mars", profile="walk", minutes=20, step_s=10, storm=0)
    assert moon["summary"]["max_hr"] < mars["summary"]["max_hr"]
    assert moon["frames"][0]["env"]["gravity_g"] == 0.166
    assert mars["frames"][0]["env"]["gravity_g"] == 0.38


def test_emergency_profile_reaches_warning_and_not_abort():
    body = _sim(subject="c1", site="moon", profile="emergency", minutes=60, step_s=30, storm=0)
    statuses = {f["status"] for f in body["frames"]}
    levels = {a["level"] for f in body["frames"] for a in f["alerts"]}
    scrubbers = {f["suit"]["scrubber"] for f in body["frames"]}
    assert "warning" in statuses
    assert "warning" in levels
    assert "abort" not in statuses
    assert scrubbers == {"NOMINAL", "DEGRADED", "FAULT"}
    assert body["frames"][-1]["suit"]["o2_pct"] < body["frames"][0]["suit"]["o2_pct"]
    assert body["frames"][-1]["suit"]["coolant_c"] > body["frames"][0]["suit"]["coolant_c"]
    assert all(a["action"] for f in body["frames"] for a in f["alerts"])


def test_storm_reaches_abort_to_habitat():
    quiet = _sim(subject="c1", site="moon", profile="traverse", minutes=30, step_s=30, storm=0)
    body = _sim(subject="c1", site="moon", profile="traverse", minutes=30, step_s=30, storm=1)
    assert "abort" not in {f["status"] for f in quiet["frames"]}
    abort = [f for f in body["frames"] if f["status"] == "abort"]
    assert abort
    assert any(a["level"] == "emergency" and a["action"] == "ABORT TO HABITAT" and a["code"] == "ABORT_TO_HABITAT"
               for f in abort for a in f["alerts"])
    assert abort[0]["env"]["dose_uSv_h"] > quiet["frames"][-1]["env"]["dose_uSv_h"]
    assert body["summary"]["verdict"].startswith("Abort.")


def test_assess_flags_high_ppco2_and_low_o2():
    r = client.post("/api/eva/assess", json={
        "subject": "c1", "site": "mars",
        "suit": {"ppco2_mmHg": 18, "o2_pct": 8},
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body) == {"status", "alerts", "quality", "sources"}
    assert body["quality"] == "simulated"
    by_code = {a["code"]: a for a in body["alerts"]}
    assert by_code["PPCO2_HIGH"]["level"] == "warning"
    assert by_code["O2_LOW"]["level"] == "emergency"
    assert by_code["PPCO2_HIGH"]["action"] and by_code["O2_LOW"]["action"]
    assert body["status"] == "abort"
    rested = client.post("/api/eva/assess", json={"subject": "c1", "site": "moon"}).json()
    assert rested["status"] == "nominal" and rested["alerts"] == []


def test_frames_use_catalog_keys_and_a_hour_answers_quickly():
    import time
    started = time.perf_counter()
    body = _sim(subject="c1", site="mars", profile="traverse", minutes=60, step_s=5, storm=1)
    assert time.perf_counter() - started < 1
    frame = body["frames"][0]
    assert frame["metrics"]["eva.hr"] == frame["bio"]["hr_bpm"]
    assert frame["metrics"]["eva.ppco2"] == frame["suit"]["ppco2_mmHg"]
    assert frame["metrics"]["eva.o2"] == frame["suit"]["o2_pct"]
    assert frame["metrics"]["eva.dose_rate"] == frame["env"]["dose_uSv_h"]


def test_unknown_subject_site_and_bad_field():
    assert client.get("/api/eva/sim", params={"subject": "nope"}).status_code == 404
    assert client.get("/api/eva/sim", params={"site": "iss"}).status_code == 422
    assert client.get("/api/eva/sim", params={"profile": "sprint"}).status_code == 422
    assert client.get("/api/eva/sim", params={"storm": 2}).status_code == 422
    assert client.get("/api/eva/sim", params={"minutes": 240, "step_s": 1}).status_code == 422
    bad = client.post("/api/eva/assess", json={"subject": "c1", "site": "moon", "suit": {"gloves": 1}})
    assert bad.status_code == 422


def test_build_writes_offline_copies_that_match_the_endpoint():
    cat = Catalog.load()
    root = engine.OUT
    for site in ("moon", "mars"):
        path = root / f"{site}_traverse_storm.json"
        assert path.is_file()
        doc = json.loads(path.read_text(encoding="utf-8"))
        live = _sim(subject="c1", site=site, profile="traverse", minutes=60, step_s=5, storm=1)
        assert doc == live
        assert doc["quality"] == "simulated"
        assert any(f["status"] == "abort" for f in doc["frames"])
        assert doc["summary"]["dose_total_uSv"] > 0
    assert cat.extra["eva"]["quality"] == "simulated"
