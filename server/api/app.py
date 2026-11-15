"""The HTTP face of the data core.

    uvicorn server.api.app:app --port 8000          (from the repo root)

Routers are discovered, so lanes never edit this file:
  server/api/routes/<name>.py   with `router = APIRouter()`   (core endpoints)
  server/<feature>/api.py       with `router = APIRouter()`   (feature packages, e.g. server/mind/api.py)
Each handler gets the shared catalog and store from `deps.cat()` / `deps.store()`.
The built app (web/dist) is served at / when it exists, so the same build reads live data.
"""
from __future__ import annotations

import importlib
import pkgutil
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from . import deps, routes

PKG = Path(__file__).resolve().parents[1]
DIST = PKG.parent / "web" / "dist"


def create_app() -> FastAPI:
    app = FastAPI(title="e^x data core", version="1")
    deps.init()
    for info in pkgutil.iter_modules(routes.__path__):
        app.include_router(importlib.import_module(f"{routes.__name__}.{info.name}").router)
    for api in sorted(PKG.glob("*/api.py")):
        app.include_router(importlib.import_module(f"server.{api.parent.name}.api").router)
    if DIST.is_dir():
        app.mount("/", StaticFiles(directory=DIST, html=True), name="app")
    return app


app = create_app()
