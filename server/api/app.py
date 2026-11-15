"""The HTTP face of the data core.

    uvicorn server.api.app:app --port 8000          (from the repo root)

Routers are discovered:
  server/api/routes/<name>.py   with `router = APIRouter()`   (core endpoints)
  server/<feature>/api.py       with `router = APIRouter()`   (feature packages, e.g. server/mind/api.py)
Each handler gets the shared catalog and store from `deps.cat()` / `deps.store()`.

The built app is served at /. `AEGIS_WEB_DIST` chooses the folder (default `web/dist`).
A path with no file, other than /api, /data, /orbits, /docs and /openapi.json, returns index.html
so a deep link such as /environment reloads. API routes stay ahead of that mount, so /data
from this server wins over a copy inside the build.
"""
from __future__ import annotations

import importlib
import os
import pkgutil
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import deps, routes

PKG = Path(__file__).resolve().parents[1]
_NO_SPA = ("/api", "/data", "/orbits")


def dist_dir() -> Path:
    raw = os.environ.get("AEGIS_WEB_DIST")
    return Path(raw) if raw else PKG.parent / "web" / "dist"


def _spa_fallback(path: str) -> bool:
    """True when a missing file should be the app shell, not a JSON 404."""
    if path in ("/docs", "/openapi.json", "/redoc") or path.startswith("/docs/"):
        return False
    return not any(path == prefix or path.startswith(prefix + "/") for prefix in _NO_SPA)


class SpaFiles(StaticFiles):
    """Static files, plus index.html for client routes. /api, /data and /orbits stay JSON."""

    async def get_response(self, path: str, scope):
        full = scope.get("path", "")
        if not _spa_fallback(full):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code != 404:
                raise
            return await super().get_response("index.html", scope)


def create_app() -> FastAPI:
    app = FastAPI(title="e^x data core", version="1")
    deps.init()
    for info in pkgutil.iter_modules(routes.__path__):
        app.include_router(importlib.import_module(f"{routes.__name__}.{info.name}").router)
    for api in sorted(PKG.glob("*/api.py")):
        app.include_router(importlib.import_module(f"server.{api.parent.name}.api").router)
    dist = dist_dir()
    if dist.is_dir():
        app.mount("/", SpaFiles(directory=dist, html=True), name="app")
    return app


app = create_app()
