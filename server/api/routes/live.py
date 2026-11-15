"""Live endpoints: check-ins in, refresh status out.

POST /api/observations   one self-report score, through adapters/checkin.py (same validation as any adapter)
GET  /api/refresh        what the background refresher polls, how often, last run and last error
POST /api/refresh        re-run live adapters now (?source=isslive for one), then re-derive
"""
from __future__ import annotations

from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import deps
from ..refresh import run_info
from ...adapters.checkin import ADAPTER as CHECKIN, CheckInError

router = APIRouter()


class CheckInBody(BaseModel):
    subject: str
    metric: str
    value: Any = None
    t: str | None = None                       # ISO date or UTC instant; default now
    unit: str | None = None                    # optional; must equal the catalog unit if sent


@router.post("/api/observations")
def post_observation(body: CheckInBody) -> dict:
    """Store one check-in. Returns the stored row plus any assessment the engine now makes for that day."""
    cat, store = deps.cat(), deps.raw_store()
    try:
        batch = CHECKIN.load(cat, [body.model_dump(exclude_none=True)])
    except CheckInError as e:
        raise HTTPException(422, str(e)) from None
    o = batch.observations[0]
    with store.lock:                           # write, re-derive and read back as one step
        run_id = store.write(batch)
        run = run_info(store, run_id)
        if run["rejected"]:
            raise HTTPException(422, run["errors"])
        deps.rederive(cat, store)
        row = next(x for x in store.observations(subject=o.subject, metric=o.metric, source=o.source) if x.t == o.t)
        day = o.t[:10]
        found = [asdict(a) for a in store.assessments(o.subject) if a.metric == o.metric and a.t[:10] == day]
    return {"subject": row.subject, "metric": row.metric, "t": row.t, "value": row.value, "unit": row.unit,
            "source": row.source, "quality": row.quality, "run_id": run_id, "assessments": found}


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
