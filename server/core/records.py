"""The canonical records. Every adapter emits these and nothing else.

Facts (written by adapters):   Observation, Event, EventLink
Derived (written by engine):   Forecast, Assessment
Bookkeeping:                   Run (one per adapter load)

Times are ISO 8601 UTC strings ("2026-11-14" for daily series, "2024-05-08T21:40:00Z" for instants).
A study that only has relative timepoints (Inspiration4 "L-92", "R+1") stores the label in `t`
and the day offset in attrs["day"].
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

Quality = Literal["live", "cached", "recorded", "simulated", "exported"]
EventType = Literal["flare", "cme", "sep", "gst"]


@dataclass(frozen=True)
class Observation:
    subject: str            # subjects.yaml id
    metric: str             # metrics.yaml key
    t: str                  # ISO 8601 UTC, or a study timepoint label
    value: float | None     # None = measured as missing
    unit: str               # must equal the metric's unit
    source: str             # sources.yaml id
    quality: Quality
    attrs: dict[str, Any] = field(default_factory=dict, compare=False)  # source-specific extras (lab range, raw item id)


@dataclass(frozen=True)
class Event:
    id: str
    type: EventType
    t_start: str | None
    t_peak: str | None
    source: str
    attrs: dict[str, Any] = field(default_factory=dict, compare=False)  # class, flux, location, speed...


@dataclass(frozen=True)
class EventLink:
    from_id: str
    to_id: str
    relation: Literal["linked_cme", "caused_sep"]
    source: str


@dataclass(frozen=True)
class Forecast:
    event_id: str
    model_id: str           # models.yaml id
    p: float
    level: Literal["none", "watch", "warning"]
    split: Literal["train", "val", "test", "live"]


@dataclass(frozen=True)
class Assessment:
    subject: str
    metric: str
    t: str
    rule: str               # e.g. "baseline_z@3d" or "absolute"
    severity: Literal["amber", "red"]
    z: float | None
    message: str
    action: str


@dataclass
class Batch:
    """What one adapter load returns."""
    source: str
    quality: Quality
    observations: list[Observation] = field(default_factory=list)
    events: list[Event] = field(default_factory=list)
    links: list[EventLink] = field(default_factory=list)
    forecasts: list[Forecast] = field(default_factory=list)
    note: str = ""
