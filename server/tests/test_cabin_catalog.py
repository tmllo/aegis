import json

from server.build import diff
from server.core.catalog import Catalog
from server.views.cabin_catalog import APP_SAMPLE, cabin_catalog, write


def test_matches_emile_sample():
    view = cabin_catalog(Catalog.load())
    sample = json.loads(APP_SAMPLE.read_text(encoding="utf-8"))
    d = diff(view, sample)
    assert not d, "\n".join(d)
    assert [m["key"] for m in view["metrics"]] == [m["key"] for m in sample["metrics"]]


def test_write_round_trips(tmp_path):
    cat = Catalog.load()
    path = write(cat, tmp_path)
    assert path == tmp_path / "cabin_catalog.json"
    assert json.loads(path.read_text(encoding="utf-8")) == cabin_catalog(cat)


def test_not_connected_and_band_rules():
    cat = Catalog.load()
    for key in ("cabin.co", "cabin.humidity"):
        assert cat.metrics[key]["connected"] is False
        assert cat.metrics[key]["rule"]["type"] == "display_only"
    for m in cabin_catalog(cat)["metrics"]:
        if m["bands"]:
            assert cat.metrics[m["key"]]["rule"]["type"] == "bands", m["key"]
