"""Radiation organ endpoints (docs/backend/RADIATION-ORGANS-API.md).

    GET /api/radiation/organs
    GET /api/radiation/organs/compare
    GET /api/radiation/path
    GET /api/forecast/explain

The forecast document is the one the build already holds. This file does not read storm_forecast.json off disk.
"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException

from ..api import deps
from . import engine

router = APIRouter()
ENVS = ("iss", "moon", "transit", "mars")


def _call(fn):
    try:
        return fn()
    except engine.RadError as e:
        raise HTTPException(e.status, e.detail)


def _context(subject: str, env: str | None, days: int | None) -> tuple[str, int, float]:
    """Resolve env, mission days and cumulative dose. Crew from crew_data; a bare env has no dose."""
    cat = deps.cat()
    crew = deps.files()["crew_data.json"]
    members = {c["id"]: c for c in crew["crew"]}
    if subject in members:
        if env is None:
            loc = cat.subjects[subject].get("located_in")
            env = cat.subjects[loc]["environment"] if loc else crew["mission"]["environment"]
        series = members[subject]["series"]
        used = float(series[-1].get("dose_mSv_cum") or 0) if series else 0.0
        if days is None:
            start = date.fromisoformat(crew["mission"]["start_date"])
            today = date.fromisoformat(crew["mission"]["today"])
            days = (today - start).days + 1
        return env, days, used
    if subject in ENVS:
        return env or subject, days if days is not None else 30, 0.0
    known = sorted(members) + list(ENVS)
    raise HTTPException(404, f"unknown subject {subject!r}; known: {known}")


def _flare() -> dict | None:
    doc = deps.files().get("storm_forecast.json") or {}
    events = doc.get("events") or []
    if not events:
        return None
    return max(events, key=lambda e: e["peak_time"])


@router.get("/api/radiation/organs")
def organs(subject: str = "c1", env: str | None = None, scenario: str = "gcr",
           event: str = "oct1989", shield: str = "hull", days: int | None = None,
           sex: str = "f", p: float | None = None):
    env, days, used = _context(subject, env, days)
    flare = _flare() if scenario == "storm" else None
    return _call(lambda: engine.organs_report(
        deps.cat(), subject=subject, env=env, scenario=scenario, event=event, shield=shield,
        days=days, sex=sex, p=p, career_used_mSv=used, flare=flare))


@router.get("/api/radiation/organs/compare")
def compare(subject: str = "c1", env: str | None = None, event: str = "oct1989",
            sex: str = "f", days: int | None = None):
    env, days, used = _context(subject, env, days)
    return _call(lambda: engine.compare_report(
        deps.cat(), subject=subject, env=env, event=event, days=days, sex=sex, career_used_mSv=used))


@router.get("/api/radiation/path")
def path(scenario: str = "gcr", event: str = "aug1972", shield: str = "hull"):
    return _call(lambda: engine.path_report(deps.cat(), scenario=scenario, event=event, shield=shield))


@router.get("/api/forecast/explain")
def explain(env: str | None = None):
    """env is accepted so the UI can pass it. The headline does not depend on it."""
    del env
    doc = deps.files().get("storm_forecast.json")
    return _call(lambda: engine.explain_report(deps.cat(), doc))
