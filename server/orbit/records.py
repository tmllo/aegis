"""Orbit records: what the celestrak adapter emits and server/orbit/repo.py stores.

One ElementSet per satellite (dedupe by norad, newest epoch wins), plus the groups it belongs to.
Times are ISO 8601 UTC strings ("2026-11-09T11:10:18Z").
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone


@dataclass
class ElementSet:
    norad: int
    name: str
    intl_designator: str | None
    line1: str
    line2: str
    epoch: str
    source: str
    quality: str                       # live | cached | recorded
    fetched_at: str
    groups: set[str] = field(default_factory=set)


@dataclass
class OrbitBatch:
    """One celestrak load: element sets keyed by norad, and which groups came from where."""
    quality: str
    sets: dict[int, ElementSet] = field(default_factory=dict)
    group_quality: dict[str, str] = field(default_factory=dict)
    note: str = ""

    def add(self, e: ElementSet, group: str) -> None:
        """Store a satellite once: merge group membership, keep the newest epoch's lines."""
        old = self.sets.get(e.norad)
        if old is None:
            e.groups.add(group)
            self.sets[e.norad] = e
            return
        old.groups.add(group)
        if e.epoch > old.epoch:
            e.groups = old.groups
            self.sets[e.norad] = e


def tle_epoch(line1: str) -> str:
    """TLE epoch field (cols 19-32, YYDDD.dddddddd) as ISO UTC."""
    yy, doy = int(line1[18:20]), float(line1[20:32])
    year = 2000 + yy if yy < 57 else 1900 + yy
    t = datetime(year, 1, 1, tzinfo=timezone.utc) + timedelta(days=doy - 1)
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def intl_designator(line1: str) -> str | None:
    """Cols 10-17 ("98067A  ") as "1998-067A"."""
    raw = line1[9:17].strip()
    if len(raw) < 5 or not raw[:2].isdigit():
        return None
    yy = int(raw[:2])
    return f"{2000 + yy if yy < 57 else 1900 + yy}-{raw[2:]}"


def parse_tle(text: str) -> list[tuple[str, str, str]]:
    """3-line TLE text -> [(name, line1, line2)]. Tolerates 2-line sets (name = NORAD id) and blank lines."""
    lines = [l.rstrip() for l in text.splitlines() if l.strip()]
    out, i = [], 0
    while i < len(lines):
        if lines[i].startswith("1 ") and i + 1 < len(lines) and lines[i + 1].startswith("2 "):
            out.append((lines[i][2:7].strip(), lines[i], lines[i + 1]))
            i += 2
        elif i + 2 < len(lines) and lines[i + 1].startswith("1 ") and lines[i + 2].startswith("2 "):
            out.append((lines[i].strip(), lines[i + 1], lines[i + 2]))
            i += 3
        else:
            i += 1
    return out
