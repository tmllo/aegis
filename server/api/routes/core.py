"""Core endpoints. Shapes agreed in contracts/CHANGELOG.md (Emile's cabin entry)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from .. import deps

router = APIRouter()
KIND_PREFIX = {"cabin": "cabin.", "self_report": "self.", "space_weather": "sw."}


@router.get("/api/health")
def health() -> dict:
    runs = deps.store().runs()
    return {"ok": True, "sources": {r["source"]: {"quality": r["quality"], "rows": r["n_rows"], "at": r["finished"]} for r in runs}}


@router.get("/api/observations")
def observations(subject: str | None = None, metric: str | None = None, kind: str | None = None,
                 since: str | None = None) -> list[dict]:
    """[{metric, t, value, quality}] — kind=cabin means metric keys starting with 'cabin.'."""
    prefix = KIND_PREFIX.get(kind, f"{kind}.") if kind else None
    rows = deps.store().observations(subject=subject, metric=metric, since=since, prefix=prefix)
    return [{"metric": o.metric, "t": o.t, "value": o.value, "quality": o.quality} for o in rows]


@router.get("/api/catalog")
def catalog(kind: str | None = None) -> dict:
    cat = deps.cat()
    ms = [m for m in cat.metrics.values() if kind is None or m["kind"] == kind or m["key"].startswith(KIND_PREFIX.get(kind, "\0"))]
    return {"metrics": ms, "subjects": list(cat.subjects.values()), "sources": list(cat.sources.values())}


@router.get("/data/{name}")
def data_file(name: str) -> dict:
    files = deps.files()
    if name not in files:
        raise HTTPException(404, f"{name}: not a contract file")
    return files[name]
