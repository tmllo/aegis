"""GET /api/cabin/catalog: the cabin limits in exactly the shape of web/public/samples/cabin_catalog.json,
built from server/catalog (one source of truth). The app can read it whenever /api/health answers."""
from __future__ import annotations

from fastapi import APIRouter

from ...views.cabin_catalog import cabin_catalog
from .. import deps

router = APIRouter()


@router.get("/api/cabin/catalog")
def get_cabin_catalog() -> dict:
    return cabin_catalog(deps.cat())
