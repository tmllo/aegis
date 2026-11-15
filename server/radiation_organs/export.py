"""Offline snapshot for the organ screen. Run: python -m server.radiation_organs.export

Writes server/out/radiation/organs_demo.json. Copy that file to
web/public/samples/radiation/organs_demo.json when the app should play with no server.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "out" / "radiation" / "organs_demo.json"


def build_snapshot(cat, files: dict) -> dict:
    from . import engine

    crew = files["crew_data.json"]
    member = next(c for c in crew["crew"] if c["id"] == "c1")
    start = date.fromisoformat(crew["mission"]["start_date"])
    today = date.fromisoformat(crew["mission"]["today"])
    days = (today - start).days + 1
    used = float(member["series"][-1].get("dose_mSv_cum") or 0)
    loc = cat.subjects["c1"].get("located_in")
    env = cat.subjects[loc]["environment"] if loc else crew["mission"]["environment"]
    forecast = files.get("storm_forecast.json")
    events = (forecast or {}).get("events") or []
    flare = max(events, key=lambda e: e["peak_time"]) if events else None
    return {
        "organs": engine.organs_report(
            cat, subject="c1", env=env, scenario="storm", event="oct1989", shield="hull",
            days=days, sex="f", p=None, career_used_mSv=used, flare=flare),
        "compare": engine.compare_report(
            cat, subject="c1", env=env, event="oct1989", days=days, sex="f", career_used_mSv=used),
        "path": {
            "gcr": engine.path_report(cat, scenario="gcr", event="aug1972", shield="hull"),
            "spe": engine.path_report(cat, scenario="spe", event="aug1972", shield="hull"),
        },
        "forecast": engine.explain_report(cat, forecast),
    }


def main() -> None:
    from server.build import build

    cat, _store, files = build(":memory:")
    doc = build_snapshot(cat, files)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
