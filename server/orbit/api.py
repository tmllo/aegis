"""Orbit endpoints (docs/backend/ORBIT-API.md). Reads the orbit tables, asks the engine, formats JSON.

    GET /api/orbit?subject=iss&minutes=180&step_s=30&at=     station track with sunlit and in_saa
    GET /api/orbit/elements?subject=iss | ?group=starlink | ?norad=25544   element sets (gzip when accepted)
    GET /api/orbit/day?subject=iss&date=YYYY-MM-DD           sunrises, SAA passes and minutes for one UTC day
    GET /api/orbit/groups                                    the toggle list (8 CelesTrak groups)

Every response carries elements_age_h and quality. Works offline (recorded elements).
"""
from __future__ import annotations

import gzip
import json
from datetime import date, datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response

from ..api import deps
from . import engine, repo

router = APIRouter()

MAX_POINTS = 5000


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(t: datetime) -> str:
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_time(s: str | None) -> datetime:
    if not s:
        return _now().replace(microsecond=0)
    try:
        t = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(422, f"at: not an ISO 8601 time: {s!r}")
    return (t if t.tzinfo else t.replace(tzinfo=timezone.utc)).astimezone(timezone.utc)


def _epoch_dt(epoch: str) -> datetime:
    return datetime.strptime(epoch, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def _age_h(epoch: str, now: datetime) -> float:
    return engine.elements_age_h(_epoch_dt(epoch), now)


def _conf() -> dict:
    return deps.cat().extra.get("orbit") or {}


def _saa() -> dict | None:
    return _conf().get("saa")


def _model() -> dict:
    saa = _saa() or {}
    return {**engine.MODEL, "saa": saa.get("basis", "no SAA boundary in server/catalog/orbit.yaml"),
            "saa_approximate": bool(saa.get("approximate", True))}


def _station(subject: str) -> dict:
    stations = _conf().get("stations") or {}
    if subject not in stations:
        raise HTTPException(404, f"unknown station subject {subject!r}; known: {sorted(stations)}")
    row = repo.element(deps.raw_store(), int(stations[subject]))
    if row is None:
        raise HTTPException(503, f"no orbital elements stored for {subject} (NORAD {stations[subject]})")
    return row


def _json(doc, request: Request | None = None, compress: bool = False) -> Response:
    """JSON response; gzip-compressed when asked and the client accepts it (browsers do, transparently).
    Content-Type stays application/json so the app's getJson() accepts it."""
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    headers = {"Vary": "Accept-Encoding"}
    if compress and request is not None and "gzip" in request.headers.get("accept-encoding", "").lower():
        body = gzip.compress(body, compresslevel=6)
        headers["Content-Encoding"] = "gzip"
    return Response(body, media_type="application/json", headers=headers)


# ---- routes -------------------------------------------------------------------------------------
@router.get("/api/orbit")
def orbit(subject: str = "iss", minutes: float = Query(180, gt=0, le=1440), step_s: float = Query(30, ge=5, le=600),
          at: str | None = None):
    if minutes * 60 / step_s + 1 > MAX_POINTS:
        raise HTTPException(422, f"too many points: minutes*60/step_s must stay under {MAX_POINTS}")
    el = _station(subject)
    start, now, saa = _parse_time(at), _now(), _saa()
    l1, l2 = el["line1"], el["line2"]
    return {
        "subject": subject, "name": el["name"], "norad": el["norad"], "epoch": el["epoch"],
        "elements_age_h": _age_h(el["epoch"], now), "quality": el["quality"], "source": el["source"],
        "credit": _conf().get("credit", ""), "start": _iso(start), "step_s": step_s,
        "points": engine.track(l1, l2, start, minutes, step_s, saa),
        "now": engine.state(engine.satrec(l1, l2), start, saa),
        "next": engine.next_events(l1, l2, start, saa),
        "model": _model(),
    }


@router.get("/api/orbit/elements")
def elements(request: Request, subject: str | None = None, group: str | None = None, norad: int | None = None):
    if sum(x is not None for x in (subject, group, norad)) != 1:
        raise HTTPException(422, "give exactly one of subject, group or norad")
    now = _now()
    if group is not None:
        conf = {g["id"]: g for g in _conf().get("groups", [])}
        if group not in conf:
            raise HTTPException(404, f"unknown group {group!r}; known: {sorted(conf)}")
        rows = repo.group_elements(deps.raw_store(), group)
        epochs = sorted(r["epoch"] for r in rows)
        qualities = {r["quality"] for r in rows} or {"recorded"}
        doc = {
            "group": group, "label": conf[group]["label"], "kind": conf[group]["kind"], "objects": len(rows),
            "elements_age_h": _age_h(epochs[len(epochs) // 2], now) if epochs else None,
            "quality": min(qualities, key=lambda q: repo.QUALITY_RANK.get(q, 0)),
            "credit": conf[group].get("credit", _conf().get("credit", "")),
            "sats": [{"norad": r["norad"], "name": r["name"], "line1": r["line1"], "line2": r["line2"]} for r in rows],
        }
        return _json(doc, request, compress=True)
    if subject is not None:
        el = _station(subject)
    else:
        el = repo.element(deps.raw_store(), norad)
        if el is None:
            raise HTTPException(404, f"no elements for NORAD {norad}")
    doc = {"subject": subject, "norad": el["norad"], "name": el["name"], "line1": el["line1"], "line2": el["line2"],
           "epoch": el["epoch"], "elements_age_h": _age_h(el["epoch"], now), "quality": el["quality"],
           "credit": _conf().get("credit", "")}
    return _json(doc, request, compress=True)


@router.get("/api/orbit/day")
def day(subject: str = "iss", date_: str | None = Query(None, alias="date")):
    el = _station(subject)
    now = _now()
    try:
        d = date.fromisoformat(date_) if date_ else now.date()
    except ValueError:
        raise HTTPException(422, f"date: expected YYYY-MM-DD, got {date_!r}")
    summary = engine.day_summary(el["line1"], el["line2"], d, _saa())
    return {"subject": subject, "name": el["name"], "norad": el["norad"], **summary, "epoch": el["epoch"],
            "elements_age_h": _age_h(el["epoch"], now), "quality": el["quality"], "model": _model()}


@router.get("/api/orbit/groups")
def groups():
    now = _now()
    stored = {g["id"]: g for g in repo.groups(deps.raw_store())}
    out = []
    for g in _conf().get("groups", []):                      # catalog order = toggle order
        s = stored.get(g["id"], {})
        epochs = s.get("epochs") or []
        out.append({
            "id": g["id"], "label": g["label"], "kind": g["kind"], "objects": s.get("objects", 0),
            "default_on": bool(g.get("default_on")),
            "elements_age_h": _age_h(epochs[len(epochs) // 2], now) if epochs else None,
            "quality": s.get("quality", "recorded"),
            "credit": g.get("credit", _conf().get("credit", "")), "about": g.get("about", ""),
        })
    return out
