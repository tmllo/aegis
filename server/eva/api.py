"""EVA endpoints (docs/backend/EVA-API.md). Thin: check the crew member, call the engine.

    GET  /api/eva/sites
    GET  /api/eva/sim?subject=c1&site=moon|mars&profile=walk|traverse|sample|emergency&minutes=60&step_s=5&storm=0|1
    POST /api/eva/assess    {subject, site, bio, suit, env}  any subset of a frame
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ..api import deps
from . import engine

router = APIRouter()


class AssessIn(BaseModel):
    subject: str
    site: str
    bio: dict | None = None
    suit: dict | None = None
    env: dict | None = None


def _hr(subject: str) -> float:
    """Resting heart rate from the built crew_data.json baseline. Simulated crew only."""
    crew = {c["id"]: c for c in deps.files()["crew_data.json"]["crew"]}
    member = crew.get(subject)
    if member is None:
        raise HTTPException(404, f"unknown crew subject {subject!r}; known: {sorted(crew)}")
    base = (member.get("baseline") or {}).get("hr")
    if not base or "mean" not in base:
        raise HTTPException(404, f"no heart-rate baseline for {subject}")
    return float(base["mean"])


def _call(fn):
    try:
        return fn()
    except engine.EvaError as e:
        raise HTTPException(e.status, e.detail)


@router.get("/api/eva/sites")
def sites():
    return _call(lambda: engine.sites_document(deps.cat()))


@router.get("/api/eva/sim")
def sim(subject: str = "c1", site: str = "moon", profile: str = "traverse",
        minutes: int = Query(60, ge=1, le=240), step_s: int = Query(5, ge=1, le=60),
        storm: int = Query(0, ge=0, le=1)):
    hr = _hr(subject)
    return _call(lambda: engine.simulate(
        deps.cat(), subject=subject, site=site, profile=profile,
        minutes=minutes, step_s=step_s, storm=storm, hr_rest=hr))


@router.post("/api/eva/assess")
def assess(body: AssessIn):
    hr = _hr(body.subject)
    return _call(lambda: engine.assess(
        deps.cat(), subject=body.subject, site=body.site, hr_rest=hr,
        bio=body.bio, suit=body.suit, env=body.env))
