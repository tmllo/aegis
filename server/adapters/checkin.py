"""Astronaut check-in: self-report scores typed into the app, one POST /api/observations at a time.

Same path as every other source: request -> Batch of Observations -> store.write (catalog validation).
This adapter only adds the checks a typed value needs before the store sees it (who, which metric, a
real number, a real time) and fills unit, source and quality from the catalog. It never scores.

    POST /api/observations  {"subject": "c1", "metric": "self.mood", "t": "2026-11-15", "value": 4}

At build time there is nothing to load: load() returns an empty "live" batch, so health shows the source.
"""
from __future__ import annotations

import math
from datetime import date, datetime, timedelta, timezone
from typing import Any

from ..core.catalog import Catalog
from ..core.records import Batch, Observation

SOURCE = "checkin"


class CheckInError(ValueError):
    """A check-in the adapter refuses before it reaches the store (HTTP 422)."""


def _time(t: Any, cat: Catalog) -> str:
    """ISO date ("2026-11-15", the daily series) or instant ("2026-11-15T08:30:00Z"), returned in UTC.
    Must fall between the mission start and tomorrow (UTC), so a typo cannot skew a baseline."""
    now = datetime.now(timezone.utc)
    if t is None:
        return now.strftime("%Y-%m-%dT%H:%M:%SZ")
    if not isinstance(t, str):
        raise CheckInError("t must be an ISO 8601 string")
    try:
        if len(t) == 10:
            day, out = datetime.strptime(t, "%Y-%m-%d").date(), t
        else:
            dt = datetime.fromisoformat(t.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                raise CheckInError(f"t {t!r} has no timezone; send UTC with a Z")
            dt = dt.astimezone(timezone.utc)
            day, out = dt.date(), dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    except CheckInError:
        raise
    except ValueError:
        raise CheckInError(f"t {t!r} is not an ISO 8601 date or time") from None
    start = date.fromisoformat(str(cat.mission.get("start_date", "1970-01-01")))
    if not (start <= day <= (now + timedelta(days=1)).date()):
        raise CheckInError(f"t {t!r} is outside the mission ({start} to tomorrow)")
    return out


def _value(metric: str, m: dict, value: Any) -> float:
    """A finite number inside the metric's range: catalog `valid` if set, else 0 .. absolute_red.max."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise CheckInError(f"{metric}: value must be a finite number")
    try:
        v = float(value)
    except OverflowError:
        raise CheckInError(f"{metric}: value must be a finite number") from None
    if not math.isfinite(v):
        raise CheckInError(f"{metric}: value must be a finite number")
    rng = m.get("valid") or {"min": 0, "max": m.get("absolute_red", {}).get("max", math.inf)}
    if not (rng["min"] <= v <= rng["max"]):
        raise CheckInError(f"{metric}: value {value} outside {rng['min']}..{rng['max']}")
    return v


def checkable(cat: Catalog, key: str) -> bool:
    """Metrics a crew member reports themselves: the self.* keys and any kind 'self_report' (Mind lane)."""
    m = cat.metrics.get(key)
    return m is not None and (key.startswith("self.") or m.get("kind") == "self_report")


class CheckIn:
    source = SOURCE

    def load(self, cat: Catalog, items: list[dict] | None = None) -> Batch:
        batch = Batch(self.source, "live", note="app check-in")
        for item in items or []:
            batch.observations.append(self.observation(cat, item))
        return batch

    def observation(self, cat: Catalog, item: dict) -> Observation:
        subject, metric, value = item.get("subject"), item.get("metric"), item.get("value")
        s = cat.subjects.get(subject)
        if s is None or s.get("kind") != "crew_sim":
            raise CheckInError(f"subject {subject!r} is not a crew member")
        if not checkable(cat, metric):
            raise CheckInError(f"metric {metric!r} is not a self-report metric")
        m = cat.metrics[metric]
        if "unit" in item and item["unit"] != m["unit"]:
            raise CheckInError(f"{metric}: unit {item['unit']!r} != catalog {m['unit']!r}")
        v = _value(metric, m, value)
        return Observation(subject, metric, _time(item.get("t"), cat), v, m["unit"], self.source, "live",
                           {"via": "app"})


ORDER = 90
ADAPTER = CheckIn()
