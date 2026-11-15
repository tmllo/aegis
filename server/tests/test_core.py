"""Run: python -m pytest server/tests -q"""
import json

import pytest

from server.build import APP_DATA, build, diff, strip_generated
from server.core.catalog import Catalog
from server.core.records import Batch, Observation
from server.core.store import Store


@pytest.fixture(scope="module")
def built():
    return build()


@pytest.mark.parametrize("name", ["crew_data.json", "storm_forecast.json", "real_crew.json"])
def test_rebuilt_contract_files_equal_the_app_files(built, name):
    _, _, files = built
    current = json.loads((APP_DATA / name).read_text(encoding="utf-8"))
    assert diff(strip_generated(files[name]), strip_generated(current)) == []


def test_no_adapter_row_rejected(built):
    _, store, _ = built
    assert all(r["rejected"] == 0 for r in store.runs())


def test_store_rejects_bad_rows():
    cat = Catalog.load()
    store = Store(":memory:", cat)
    bad = Batch("sim_crew", "simulated", observations=[
        Observation("c1", "vital.hr", "2026-11-14", 60, "mmHg", "sim_crew", "simulated"),       # wrong unit
        Observation("nobody", "vital.hr", "2026-11-14", 60, "bpm", "sim_crew", "simulated"),    # unknown subject
        Observation("c1", "vital.nope", "2026-11-14", 60, "bpm", "sim_crew", "simulated"),      # unknown metric
        Observation("c1", "vital.hr", "2026-11-14", 60, "bpm", "sim_crew", "simulated"),        # good
    ])
    store.write(bad)
    run = store.runs()[-1]
    assert run["n_rows"] == 1 and run["rejected"] == 3
    assert len(store.observations(subject="c1")) == 1


def test_habitat_data_reaches_crew_through_located_in(built):
    cat, store, _ = built
    hab = cat.habitat_of("c1")
    assert hab["id"] == "moon_base"
    iss_co2 = store.observations(subject="iss", metric="cabin.ppco2")
    assert iss_co2 and iss_co2[0].unit == "mmHg" and iss_co2[0].quality == "recorded"


def test_every_metric_has_a_hazard_from_nasas_list():
    cat = Catalog.load()
    assert {m["hazard"] for m in cat.metrics.values()} <= {"radiation", "isolation", "distance", "gravity",
                                                            "closed_environment", "multiple"}
