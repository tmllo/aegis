"""GET /api/space-weather/now from the recorded SWPC samples. No network, and no write to storm_forecast.json.

The numbers are the files in docs/research/samples captured on 14 Nov 2026. quality is recorded.
A live pull is not wired: the demo has to work with no venue Wi-Fi, and the forecast headline must not change.
"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter

router = APIRouter()
SAMPLES = Path(__file__).resolve().parents[3] / "docs" / "research" / "samples"


def _load(name: str):
    path = SAMPLES / name
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _scale(row: dict, key: str):
    raw = (row.get(key) or {}).get("Scale")
    if raw is None:
        return None
    return int(raw) if str(raw).lstrip("-").isdigit() else raw


@router.get("/api/space-weather/now")
def space_weather_now() -> dict:
    protons = _load("swpc_goes_integral_protons_6hour.json") or []
    flares = _load("swpc_goes_xray_flares_latest.json") or []
    kp_rows = _load("swpc_planetary_k_index.json") or []
    scales = _load("swpc_noaa_scales.json") or {}
    current = scales.get("0") or {}
    fetched = None
    if current.get("DateStamp") and current.get("TimeStamp"):
        fetched = f"{current['DateStamp']}T{current['TimeStamp']}Z"
    kp = []
    for row in kp_rows:
        stamp = row["time_tag"]
        if not str(stamp).endswith("Z"):
            stamp = f"{stamp}Z"
        kp.append({"time": stamp, "value": row["Kp"]})
    return {
        "fetched_at": fetched,
        "cached": True,
        "quality": "recorded",
        "goes_p10_pfu": [
            {"time": row["time_tag"], "value": round(float(row["flux"]), 3)}
            for row in protons if row.get("energy") == ">=10 MeV"
        ],
        "xray_flares": [
            {"class": row["max_class"], "peak_time": row["max_time"]}
            for row in flares if row.get("max_class") and row.get("max_time")
        ],
        "kp": kp,
        "noaa_scales": {"R": _scale(current, "R"), "S": _scale(current, "S"), "G": _scale(current, "G")},
    }
