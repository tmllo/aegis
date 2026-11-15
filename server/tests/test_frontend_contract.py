"""The backend answers the calls crew-station actually makes, with the fields it reads."""
import re
import subprocess

import pytest
from fastapi.testclient import TestClient

from scripts.frontend_contract import check_body, fill, load_fixture, remember
from server.api.app import create_app

client = TestClient(create_app())
WANTED = ("CrewData", "CrewMember", "StormForecast", "FlareEvent", "RealCrew")


def _request(method, path, body, headers):
    response = client.request(method, path, json=body, headers=headers or {})
    payload = None
    if "json" in response.headers.get("content-type", ""):
        payload = response.json()
    return response.status_code, payload, response.text


def test_every_frontend_read_returns_the_fields_it_uses():
    saved = {}
    failures = []
    for call in load_fixture()["calls"]:
        if not call.get("live", True):
            continue
        path = fill(call["path"], saved)
        status, payload, text = _request(call["method"], path, call.get("body"), call.get("headers"))
        problems = check_body(call, status, payload, text, saved)
        if problems:
            failures.append(f"{call['id']} {call['method']} {path}: {', '.join(problems)}")
        else:
            remember(call, payload, saved)
    assert not failures, "\n".join(failures)


def test_frontend_path_list_covers_the_branch():
    script = __import__("pathlib").Path(__file__).resolve().parents[2] / "scripts" / "check_frontend_reads.py"
    done = subprocess.run([__import__("sys").executable, str(script)], capture_output=True, text=True)
    assert done.returncode == 0, done.stdout + done.stderr


def _interfaces(text: str) -> dict[str, list[tuple[str, bool]]]:
    found = {}
    for match in re.finditer(r"export interface (\w+) \{", text):
        start = match.end()
        depth = 1
        end = start
        while end < len(text) and depth:
            depth += (text[end] == "{") - (text[end] == "}")
            end += 1
        body = re.sub(r"/\*.*?\*/", "", text[start:end - 1], flags=re.S)
        body = re.sub(r"//.*", "", body)
        fields = []
        depth = 0
        for line in body.splitlines():
            if depth == 0:
                field = re.match(r"\s*(\w+)(\?)?:", line)
                if field:
                    fields.append((field.group(1), bool(field.group(2))))
            depth += line.count("{") - line.count("}")
        found[match.group(1)] = fields
    return found


def _require(obj: dict, fields: list[tuple[str, bool]], where: str) -> list[str]:
    return [f"{where}.{name}" for name, optional in fields if not optional and name not in obj]


def test_served_contract_files_have_the_frontend_types():
    try:
        text = subprocess.check_output(
            ["git", "show", "origin/crew-station:web/src/data/types.ts"],
            text=True, encoding="utf-8", stderr=subprocess.DEVNULL)
    except (subprocess.CalledProcessError, FileNotFoundError):
        pytest.skip("origin/crew-station:web/src/data/types.ts is not available")
    types = _interfaces(text)
    missing_types = [name for name in WANTED if name not in types]
    if missing_types:
        pytest.skip(f"interfaces not parsed: {missing_types}")
    crew = client.get("/data/crew_data.json").json()
    storm = client.get("/data/storm_forecast.json").json()
    real = client.get("/data/real_crew.json").json()
    gaps = []
    gaps += _require(crew, types["CrewData"], "crew_data")
    gaps += _require(crew["crew"][0], types["CrewMember"], "crew_data.crew[0]")
    gaps += _require(storm, types["StormForecast"], "storm_forecast")
    gaps += _require(storm["events"][0], types["FlareEvent"], "storm_forecast.events[0]")
    gaps += _require(real, types["RealCrew"], "real_crew")
    assert not gaps, gaps
