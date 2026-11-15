"""Live endpoints: what the background refresher does, and a way to run it now.
(Check-ins are the Mind lane's POST /api/observations, server/mind/api.py.)

GET  /api/refresh        what the background refresher polls, how often, last run and last error
POST /api/refresh        re-run live adapters now (?source=isslive for one), then re-derive
"""
from __future__ import annotations


from fastapi import APIRouter, HTTPException

from .. import deps

router = APIRouter()


@router.get("/api/refresh")
def refresh_status() -> dict:
    r = deps.refresher()
    return {"running": r.running, "jobs": r.status()}


@router.post("/api/refresh")
def refresh_now(source: str | None = None) -> dict:
    r = deps.refresher()
    if source is not None and source not in {j["source"] for j in r.jobs}:
        raise HTTPException(404, f"{source!r} is not a polled live source")
    wrote = r.tick(force=True, only=source)
    return {"refreshed": wrote, "running": r.running, "jobs": r.status()}
