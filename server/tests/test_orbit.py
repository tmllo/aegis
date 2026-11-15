"""Orbit lane: storage (one row per satellite), SGP4 track physics, the four endpoints, offline fallback,
and Emile's exact request style (src/data/http.ts getJson: relative path, needs a JSON content-type)."""
import gzip
import json
from datetime import date, datetime, timezone

import pytest
from fastapi.testclient import TestClient

from server.adapters.celestrak import CelesTrak
from server.api.app import create_app
from server.core.catalog import Catalog
from server.core.store import Store
from server.orbit import engine, plugin, repo
from server.orbit.records import ElementSet, OrbitBatch

client = TestClient(create_app())
AT = "2026-11-15T04:00:00Z"
GROUPS = {"stations", "visual", "gps-ops", "galileo", "glo-ops", "geo", "starlink", "active"}


@pytest.fixture(scope="module")
def stored():
    cat = Catalog.load()
    store = Store(":memory:", cat)
    plugin.after_build(cat, store)            # nothing pending: reads the recorded files
    return cat, store


# ---- storage -----------------------------------------------------------------------------------
def test_satellite_in_starlink_and_active_is_stored_once(stored):
    _, store = stored
    db = store.db
    both = db.execute("SELECT norad FROM orbit_membership WHERE group_id='starlink' "
                      "INTERSECT SELECT norad FROM orbit_membership WHERE group_id='active' LIMIT 1").fetchone()
    assert both is not None
    norad = both[0]
    assert db.execute("SELECT COUNT(*) FROM orbit_object WHERE norad=?", (norad,)).fetchone()[0] == 1
    assert db.execute("SELECT COUNT(*) FROM orbit_elements WHERE norad=?", (norad,)).fetchone()[0] == 1
    n_obj = db.execute("SELECT COUNT(*) FROM orbit_object").fetchone()[0]
    n_mem = db.execute("SELECT COUNT(*) FROM orbit_membership").fetchone()[0]
    assert n_obj < n_mem                       # overlap stored as memberships, not copies


def test_newest_iss_elements_win(stored):
    _, store = stored
    iss = repo.element(store, 25544)
    assert iss["epoch"].startswith("2026-11-14") and iss["quality"] == "recorded"


def test_after_build_is_idempotent(stored):
    cat, store = stored
    before = store.db.execute("SELECT COUNT(*) FROM orbit_membership").fetchone()[0]
    repo.write_batch(cat, store, CelesTrak(mode="recorded").load_recorded(cat))
    assert store.db.execute("SELECT COUNT(*) FROM orbit_membership").fetchone()[0] == before


def _one(norad: int, name: str, epoch: str, designator: str = "1998-067A") -> OrbitBatch:
    e = ElementSet(
        norad=norad, name=name, intl_designator=designator,
        line1="1 25544U 98067A   26318.17500000  .00000000  00000-0  00000-0 0  9992",
        line2="2 25544  51.6400  12.3456 0001000  10.0000  20.0000 15.50000000000000",
        epoch=epoch, source="celestrak", quality="recorded", fetched_at=epoch, groups={"stations"},
    )
    return OrbitBatch("recorded", sets={norad: e}, group_quality={"stations": "recorded"})


def test_empty_group_quality_is_recorded():
    cat = Catalog.load()
    store = Store(":memory:", cat)
    repo.write_groups(cat, store)
    row = next(g for g in repo.groups(store) if g["id"] == "starlink")
    assert row["objects"] == 0 and row["epochs"] == [] and row["quality"] == "recorded"


def test_older_load_does_not_overwrite_a_newer_name():
    cat = Catalog.load()
    store = Store(":memory:", cat)
    repo.write_batch(cat, store, _one(25544, "ISS (ZARYA)", "2026-11-14T04:00:00Z", "1998-067A"))
    repo.write_batch(cat, store, _one(25544, "OLD NAME", "2020-01-01T00:00:00Z", "1998-067B"))
    kept = repo.element(store, 25544)
    assert kept["name"] == "ISS (ZARYA)" and kept["intl_designator"] == "1998-067A"
    assert kept["epoch"] == "2026-11-14T04:00:00Z"
    repo.write_batch(cat, store, _one(25544, "ISS (ZARYA) NEW", "2026-11-15T04:00:00Z", "1998-067C"))
    newer = repo.element(store, 25544)
    assert newer["name"] == "ISS (ZARYA) NEW" and newer["intl_designator"] == "1998-067C"
    assert newer["epoch"] == "2026-11-15T04:00:00Z"


# ---- physics ------------------------------------------------------------------------------------
def test_iss_track_max_latitude_about_51_6(stored):
    _, store = stored
    iss = repo.element(store, 25544)
    pts = engine.track(iss["line1"], iss["line2"], datetime(2026, 11, 15, tzinfo=timezone.utc), 1440, 60, None)
    top = max(abs(p["lat"]) for p in pts)
    assert 51.3 < top < 52.0                   # inclination 51.6; geodetic latitude runs ~0.2 deg higher


def test_iss_about_15_5_orbits_a_day_and_sunrises(stored):
    cat, store = stored
    iss = repo.element(store, 25544)
    d = engine.day_summary(iss["line1"], iss["line2"], date(2026, 11, 15), cat.extra["orbit"]["saa"])
    assert 15.3 < d["orbits"] < 15.7
    assert 14 <= d["sunrises"] <= 17
    assert d["saa_passes"] > 0 and 0 < d["saa_minutes"] < 300


def test_saa_polygon_is_south_atlantic(stored):
    cat, _ = stored
    saa = cat.extra["orbit"]["saa"]
    assert engine.in_saa(-25, -45, saa) and not engine.in_saa(45, 10, saa)


# ---- endpoints ----------------------------------------------------------------------------------
def test_groups_endpoint_lists_all_8():
    r = client.get("/api/orbit/groups")
    rows = r.json()
    assert r.status_code == 200 and {g["id"] for g in rows} == GROUPS
    for g in rows:
        assert {"id", "label", "kind", "objects", "default_on", "elements_age_h", "quality", "credit"} <= set(g)
        assert g["objects"] > 0 and g["quality"] == "recorded"
    assert [g["id"] for g in rows if g["default_on"]] == ["stations"]


def test_elements_endpoint_is_gzip():
    r = client.get("/api/orbit/elements", params={"group": "starlink"}, headers={"Accept-Encoding": "gzip"})
    assert r.status_code == 200
    assert r.headers["content-encoding"] == "gzip"
    assert "application/json" in r.headers["content-type"]   # Emile's getJson rejects non-JSON content types
    doc = r.json()                                           # httpx decompresses, as a browser does
    assert doc["group"] == "starlink" and doc["objects"] == len(doc["sats"]) > 10000
    assert {"elements_age_h", "quality"} <= set(doc)
    assert set(doc["sats"][0]) == {"norad", "name", "line1", "line2"}


def test_elements_raw_bytes_are_gzip():
    with client.stream("GET", "/api/orbit/elements", params={"subject": "iss"},
                       headers={"Accept-Encoding": "gzip"}) as r:
        raw = b"".join(r.iter_raw())
    doc = json.loads(gzip.decompress(raw))
    assert doc["norad"] == 25544 and doc["line1"].startswith("1 25544") and "elements_age_h" in doc


def test_orbit_track_endpoint():
    r = client.get("/api/orbit", params={"subject": "iss", "minutes": 180, "step_s": 30, "at": AT})
    doc = r.json()
    assert r.status_code == 200 and len(doc["points"]) == 361
    assert set(doc["points"][0]) == {"t", "lat", "lon", "alt_km", "sunlit", "in_saa"}
    assert {"elements_age_h", "quality", "now", "next", "epoch"} <= set(doc)
    assert any(p["in_saa"] for p in doc["points"]) and any(not p["sunlit"] for p in doc["points"])
    assert client.get("/api/orbit", params={"subject": "tiangong", "at": AT}).json()["norad"] == 48274
    assert client.get("/api/orbit", params={"subject": "nope"}).status_code == 404


def test_day_endpoint():
    doc = client.get("/api/orbit/day", params={"subject": "iss", "date": "2026-11-15"}).json()
    assert {"sunrises", "sunsets", "saa_passes", "saa_minutes", "eclipse_minutes", "elements_age_h", "quality"} <= set(doc)


# ---- Emile's exact request (web/src/data/http.ts on origin/crew-station) ------------------------
def test_replays_emiles_getjson_requests():
    """getJson(path) fetches `${BASE_URL}${path}` (BASE_URL '/') with the browser's default headers and throws unless
    the reply is 2xx with a content-type containing 'json'. Same rule for every orbit path he will call."""
    browser = {"Accept": "*/*", "Accept-Encoding": "gzip, deflate, br, zstd"}
    for path in ("api/orbit/groups", "api/orbit?subject=iss", "api/orbit/day?subject=iss",
                 "api/orbit/elements?subject=iss", "api/orbit/elements?group=stations"):
        r = client.get("/" + path, headers=browser)
        assert r.status_code == 200, path
        assert "json" in r.headers.get("content-type", ""), path
        r.json()


def _emiles_parse_tle(text: str):
    """Port of parseTle in web/src/console/Globe.tsx (origin/crew-station 761afc0, lines 226-237)."""
    lines = [l.rstrip() for l in text.strip().split("\n")]
    l1 = next((l for l in lines if l.startswith("1 ")), None)
    l2 = next((l for l in lines if l.startswith("2 ")), None)
    if not l1 or not l2:
        return None
    yy, doy = int(l1[18:20]), float(l1[20:32])
    return {"year": 2000 + yy if yy < 57 else 1900 + yy, "doy": doy, "i": float(l2[8:16]),
            "e": float(f"0.{l2[26:33].strip()}"), "n": float(l2[52:63])}


def test_replays_emiles_use_iss_track_fetch():
    """useIssTrack: fetch(`${BASE_URL}orbits/iss.tle`) -> r.ok ? r.text() : '' -> parseTle. With the server in front,
    that static path now returns the newest stored ISS elements (epoch 14 Nov), not the 9 Nov copy in web/dist."""
    r = client.get("/orbits/iss.tle")
    assert r.status_code == 200 and r.text.startswith("ISS (ZARYA)\n")
    k = _emiles_parse_tle(r.text)
    assert k and k["year"] == 2026 and k["doy"] > 318      # 26318.17 = 14 Nov; his file is 26313.47
    assert 51.5 < k["i"] < 51.7 and 15.4 < k["n"] < 15.6 and k["e"] < 0.01
    assert r.headers["x-elements-epoch"].startswith("2026-11-14")
    assert _emiles_parse_tle(client.get("/orbits/tiangong.tle").text)["i"] < 42
    assert client.get("/orbits/nope.tle").status_code == 404


# ---- offline / live fallback ---------------------------------------------------------------------
def test_live_mode_falls_back_to_recorded_without_network(tmp_path):
    def no_network(url, timeout):
        raise OSError("offline")
    cat = Catalog.load()
    a = CelesTrak(mode="live", cache_dir=tmp_path, fetch=no_network)
    b = a.load(cat)
    assert b.quality == "recorded" and set(a.pending.group_quality.values()) == {"recorded"}
    assert len(a.pending.sets) > 15000


def test_live_mode_fetches_at_most_every_6h(tmp_path):
    text = (CelesTrak().recorded_dir / "stations.tle").read_text(encoding="utf-8")
    calls = []

    def fake(url, timeout):
        calls.append(url)
        return text
    cat = Catalog.load()
    a = CelesTrak(mode="live", cache_dir=tmp_path, fetch=fake)
    a.load(cat)
    assert len(calls) == 8 and a.pending.quality == "live"
    a.load(cat)                                # inside the 6 h window: kept copies, no new download
    assert len(calls) == 8 and a.pending.quality == "cached"


def test_stations_view_written():
    from server.views.orbit_stations import PATH
    doc = json.loads(PATH.read_text(encoding="utf-8"))
    assert {s["subject"] for s in doc["stations"]} == {"iss", "tiangong"}
    assert doc["saa"]["polygon"] and doc["stations"][0]["track"]["points"]
    assert _emiles_parse_tle((PATH.parent / "iss.tle").read_text(encoding="utf-8"))["doy"] > 318
