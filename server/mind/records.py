"""Mind record types and the check-in adapter.

A check-in score is a core Observation (source "checkin"), so it is validated by the store like every other reading.
checkin_batch() is the adapter: it turns one POST body into a Batch, or raises ValueError with a readable reason.
"""
from __future__ import annotations

import math
import re
from datetime import date, datetime
from dataclasses import dataclass, field
from typing import Any, Literal

from ..core.catalog import Catalog
from ..core.records import Batch, Observation

TaskKind = Literal["habit", "todo"]
Origin = Literal["self", "routine", "system"]
Status = Literal["done", "skipped", "closed"]
USER_STATUSES = ("done", "skipped")          # what the app may post; "closed" is set by the engine only
CHECKIN_SOURCE = "checkin"
SIM_SOURCE = "mind_sim"
DAY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
INSTANT_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$")
WEEKDAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


@dataclass(frozen=True)
class Note:
    id: str
    subject: str
    t: str
    text: str
    kind: str = "journal"
    tags: list[str] = field(default_factory=list, compare=False)
    private: bool = True


@dataclass(frozen=True)
class Task:
    id: str
    subject: str
    kind: TaskKind
    label: str
    origin: Origin
    created: str
    schedule: str | None = None
    due: str | None = None
    metric: str | None = None
    attrs: dict[str, Any] = field(default_factory=dict, compare=False)


@dataclass(frozen=True)
class TaskEvent:
    task_id: str
    t: str
    status: Status


def day_of(t: str) -> str:
    return t[:10]


def valid_day(d: str) -> bool:
    """YYYY-MM-DD that is a real calendar day (2026-02-30 is not)."""
    if not isinstance(d, str) or not DAY_RE.match(d):
        return False
    try:
        date.fromisoformat(d)
    except ValueError:
        return False
    return True


def valid_time(t: str) -> bool:
    """A real day, or a real UTC instant YYYY-MM-DDTHH:MM[:SS[.f]]Z."""
    if not isinstance(t, str):
        return False
    if DAY_RE.match(t):
        return valid_day(t)
    if not INSTANT_RE.match(t):
        return False
    try:
        datetime.fromisoformat(t[:-1])
    except ValueError:
        return False
    return True


def valid_schedule(s: str) -> bool:
    if s == "daily":
        return True
    if s.startswith("days:"):
        days = s[5:].split(",")
        return bool(days) and all(d in WEEKDAYS for d in days)
    return False


def checkin_metrics(cat: Catalog) -> list[str]:
    return list(cat.extra.get("routines", {}).get("checkin", {}).get("metrics", []))


def scale_of(cat: Catalog, metric: str) -> dict | None:
    """The 1-5 scale with words: on the metric itself, or in routines.yaml checkin.scales (self.mood)."""
    m = cat.metrics.get(metric, {})
    return m.get("scale") or cat.extra.get("routines", {}).get("checkin", {}).get("scales", {}).get(metric)


def checkin_batch(cat: Catalog, subject: str, metric: str, t: str, value: float, source: str = CHECKIN_SOURCE,
                  quality: str = "live") -> Batch:
    """POST /api/observations body -> Batch. Accepts self-report and crew_daily metrics (a re-measure) for crew_sim subjects."""
    s = cat.subjects.get(subject)
    if s is None or s.get("kind") != "crew_sim":
        raise ValueError(f"unknown crew member {subject!r}")
    m = cat.metrics.get(metric)
    if m is None or m["kind"] not in ("self_report", "crew_daily"):
        raise ValueError(f"{metric!r} is not a check-in or crew metric")
    if not isinstance(t, str) or not valid_time(t):
        raise ValueError(f"t {t!r}: use YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ")
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("value must be a number")
    if not math.isfinite(value):
        raise ValueError("value must be a finite number")
    if m["kind"] == "crew_daily" and value < 0:
        raise ValueError(f"{metric}: value {value} cannot be negative")
    sc = scale_of(cat, metric)
    if sc and not (sc["min"] <= value <= sc["max"]):
        raise ValueError(f"{metric}: value {value} outside {sc['min']}-{sc['max']}")
    obs = Observation(subject, metric, t, float(value), m["unit"], source, quality)
    return Batch(source, quality, observations=[obs], note=f"check-in {subject} {metric}")
