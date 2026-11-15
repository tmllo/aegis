"""EVA build step: write the two offline storm traverses.

Called by server/build.py after the adapters (after_build(cat, store)), and again on every derive.
Idempotent: it only rewrites server/out/eva/{moon,mars}_traverse_storm.json. It does not write
observations, so crew_data.json and storm_forecast.json stay as they are.
"""
from __future__ import annotations

from .engine import baseline_hr, write_offline


def after_build(cat, store) -> None:
    off = cat.extra["eva"]["offline"]
    write_offline(cat, baseline_hr(cat, store, off["subject"]))
