"""Adapters are discovered: any module here that defines ADAPTER (and ORDER) is loaded by the build.
A new source is one new file in this folder. No list to edit."""
from __future__ import annotations

import importlib
import pkgutil


def discover() -> list:
    found = []
    for info in pkgutil.iter_modules(__path__):
        if info.name.startswith("_") or info.name == "base":
            continue
        mod = importlib.import_module(f"{__name__}.{info.name}")
        if hasattr(mod, "ADAPTER"):
            found.append((getattr(mod, "ORDER", 100), info.name, mod.ADAPTER))
    return [a for _, _, a in sorted(found)]
