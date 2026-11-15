"""Deep links on a built app return index.html. API and /data stay on the server."""
import json

from fastapi.testclient import TestClient

from server.api.app import create_app


def test_spa_fallback_serves_the_shell_and_leaves_the_api(tmp_path, monkeypatch):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><title>aegis</title>", encoding="utf-8")
    (dist / "assets" / "x.js").write_text("console.log(1)\n", encoding="utf-8")
    monkeypatch.setenv("AEGIS_WEB_DIST", str(dist))

    client = TestClient(create_app())

    for path in ("/environment", "/checkup", "/mind?x=1"):
        page = client.get(path)
        assert page.status_code == 200, page.text
        assert page.headers["content-type"].startswith("text/html")
        assert "aegis" in page.text

    script = client.get("/assets/x.js")
    assert script.status_code == 200
    assert "console.log(1)" in script.text

    missing = client.get("/api/nope")
    assert missing.status_code == 404
    assert "json" in missing.headers["content-type"]
    assert missing.json()["detail"] == "Not Found"

    data = client.get("/data/crew_data.json")
    assert data.status_code == 200
    body = data.json()
    assert "crew" in body and "mission" in body
    json.dumps(body)

    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["ok"] is True
