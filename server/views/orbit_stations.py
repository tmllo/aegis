"""Station orbits for the app's no-server fallback: server/out/orbits/stations.json.

Emile copies it to web/public/samples/orbits/stations.json. Each station carries its element set (so the app can
propagate with satellite.js at any time), a 3 h track from build time and today's day summary, both computed
by server/orbit/engine.py, plus the SAA polygon and the model notes. Written after every build by
server/orbit/plugin.py. Reads the store, never fetches.

    python -m server.views.orbit_stations
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from ..build import OUT
from ..core.catalog import Catalog
from ..core.store import Store
from ..orbit import engine, repo

PATH = OUT / "orbits" / "stations.json"
TRACK_MIN, TRACK_STEP_S = 180, 30


def stations(cat: Catalog, store: Store, now: datetime | None = None) -> dict:
    now = (now or datetime.now(timezone.utc)).replace(microsecond=0)
    conf = cat.extra.get("orbit") or {}
    saa = conf.get("saa")
    out = []
    for subject, norad in (conf.get("stations") or {}).items():
        el = repo.element(store, int(norad))
        if el is None:
            continue
        l1, l2 = el["line1"], el["line2"]
        out.append({
            "subject": subject, "norad": el["norad"], "name": el["name"], "line1": l1, "line2": l2,
            "epoch": el["epoch"], "quality": el["quality"],
            "elements_age_h": engine.elements_age_h(engine.epoch_of(l1, l2), now),
            "track": {"start": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "step_s": TRACK_STEP_S,
                      "points": engine.track(l1, l2, now, TRACK_MIN, TRACK_STEP_S, saa)},
            "day": engine.day_summary(l1, l2, now.date(), saa),
        })
    return {
        "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "credit": conf.get("credit", ""),
        "model": {**engine.MODEL, "saa": (saa or {}).get("basis", "")},
        "saa": {"label": (saa or {}).get("label"), "polygon": (saa or {}).get("polygon", [])},
        "stations": out,
    }


def write(cat: Catalog, store: Store) -> str:
    PATH.parent.mkdir(parents=True, exist_ok=True)
    PATH.write_text(json.dumps(stations(cat, store), indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return str(PATH)


if __name__ == "__main__":
    from ..build import build
    c, s, _ = build()
    print(write(c, s))
