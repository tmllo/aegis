"""The Cabin screen's catalog (Emile's 02 Cabin): labels, units, ISS Live! items, digits and bands for every
metric with a `display` block, built purely from server/catalog (no store, no network). Same shape as
web/public/samples/cabin_catalog.json.

    python -m server.views.cabin_catalog     # writes server/out/cabin_catalog.json, compares with Emile's sample
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from ..build import OUT, ROOT, diff
from ..core.catalog import Catalog

APP_SAMPLE = ROOT / "web" / "public" / "samples" / "cabin_catalog.json"
SCREEN_KEYS = ("about", "stale_after_h", "signal_item", "signal_ok_class")


def _entry(m: dict) -> dict:
    d, rule = m["display"], m["rule"]
    e = {
        "key": m["key"],
        "label": d["label"],
        "short": d["short"],
        "unit": d.get("unit", m["unit"]),
        "item": m.get("source_item"),
        "digits": d["digits"],
        "bands": rule.get("bands") or {},
        "source": rule["source"],
    }
    for k in ("ref", "emergency_below"):
        if k in rule:
            e[k] = rule[k]
    if "tank" in d:
        e["tank"] = d["tank"]
    return e


def cabin_catalog(cat: Catalog) -> dict:
    screen = cat.extra["cabin_screen"]
    out = {k: screen[k] for k in SCREEN_KEYS}
    shown = sorted((m for m in cat.metrics.values() if "display" in m), key=lambda m: m["display"]["order"])
    out["metrics"] = [_entry(m) for m in shown]
    return out


def write(cat: Catalog, out_dir: Path = OUT) -> Path:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "cabin_catalog.json"
    path.write_text(json.dumps(cabin_catalog(cat), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def main() -> int:
    cat = Catalog.load()
    path = write(cat)
    current = json.loads(APP_SAMPLE.read_text(encoding="utf-8"))
    d = diff(cabin_catalog(cat), current)
    print(f"{path}: {'identical to the app file' if not d else f'{len(d)} differences'}")
    for line in d[:15]:
        print("   ", line)
    return 0 if not d else 1


if __name__ == "__main__":
    sys.exit(main())
