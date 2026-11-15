"""An adapter turns one source into canonical records. It never scores, never formats output.

To add a source:
  1. add it to catalog/sources.yaml (and its metrics to catalog/metrics.yaml)
  2. write adapters/<id>.py with a class that has `source` and `load() -> Batch`
  3. register it in ADAPTERS in server/build.py
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Protocol

from ..core.catalog import Catalog
from ..core.records import Batch

ROOT = Path(__file__).resolve().parents[2]


class Adapter(Protocol):
    source: str

    def load(self, cat: Catalog) -> Batch: ...


def read_json(rel: str):
    return json.loads((ROOT / rel).read_text(encoding="utf-8"))
