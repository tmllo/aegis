"""Build the data core: load every adapter into the store, run the engine, write the views.

    python -m server.build                      # rebuild, compare with web/public/data, write to server/out/
    python -m server.build --write-app          # also overwrite web/public/data/*.json (after the check passes)
    python -m server.build --db server/data/excore.db   # keep the store on disk (default: in memory)
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import importlib

from .adapters import discover
from .core.catalog import Catalog
from .core.store import Store
from .engine.labs import score_labs
from .engine.scoring import score_all
from .views import contract_v1

ROOT = Path(__file__).resolve().parents[1]
APP_DATA = ROOT / "web" / "public" / "data"
OUT = Path(__file__).resolve().parent / "out"

PKG = Path(__file__).resolve().parent


def plugins() -> list:
    """Feature packages: any server/<name>/plugin.py. Each may define after_build(cat, store)."""
    return [importlib.import_module(f"server.{p.parent.name}.plugin") for p in sorted(PKG.glob("*/plugin.py"))]


def build(db: str = ":memory:") -> tuple[Catalog, Store, dict[str, dict]]:
    cat = Catalog.load()
    store = Store(db, cat)
    for adapter in discover():                 # every server/adapters/*.py with ADAPTER
        store.write(adapter.load(cat))
    crew_results = score_all(store, cat)
    labs = score_labs(store, cat)
    for plugin in plugins():                   # every server/<feature>/plugin.py
        if hasattr(plugin, "after_build"):
            plugin.after_build(cat, store)
    files = {
        "crew_data.json": contract_v1.crew_data(cat, store, crew_results),
        "storm_forecast.json": contract_v1.storm_forecast(cat, store),
        "real_crew.json": contract_v1.real_crew(cat, store, labs),
    }
    return cat, store, files


def strip_generated(doc: dict) -> dict:
    d = json.loads(json.dumps(doc))
    d.get("meta", {}).pop("generated_at", None)
    return d


def diff(a, b, path="") -> list[str]:
    """Readable differences between two JSON values (numbers compared exactly, 62 == 62.0)."""
    if isinstance(a, dict) and isinstance(b, dict):
        out = [f"{path}.{k}: only in rebuilt" for k in a.keys() - b.keys()]
        out += [f"{path}.{k}: missing in rebuilt" for k in b.keys() - a.keys()]
        for k in a.keys() & b.keys():
            out += diff(a[k], b[k], f"{path}.{k}")
        return out
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return [f"{path}: length {len(a)} vs {len(b)}"]
        return [d for i, (x, y) in enumerate(zip(a, b)) for d in diff(x, y, f"{path}[{i}]")]
    return [] if a == b else [f"{path}: rebuilt {a!r} vs current {b!r}"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=":memory:")
    ap.add_argument("--write-app", action="store_true")
    args = ap.parse_args()
    cat, store, files = build(args.db)
    OUT.mkdir(exist_ok=True)
    ok = True
    for name, doc in files.items():
        (OUT / name).write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        current = json.loads((APP_DATA / name).read_text(encoding="utf-8"))
        d = diff(strip_generated(doc), strip_generated(current))
        print(f"{name}: {'identical to the app file' if not d else f'{len(d)} differences'}")
        for line in d[:15]:
            print("   ", line)
        ok = ok and not d
    for r in store.runs():
        print(f"run {r['id']} {r['source']:<12} {r['quality']:<9} rows={r['n_rows']} rejected={r['rejected']}")
    if args.write_app:
        if not ok:
            print("Not writing web/public/data: rebuilt files differ. Fix the differences or update the golden first.")
            return 1
        for name, doc in files.items():
            (APP_DATA / name).write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print("Wrote web/public/data/*.json")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
