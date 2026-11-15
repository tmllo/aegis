"""Mind layer build step: simulated check-in history, routine habits and their history, then engine.sync.

Called by server/build.py after the core adapters and scoring (after_build(cat, store)). Deterministic: one
random.Random(f"mind-{subject}") per crew member, so every build writes the same rows.
"""
from __future__ import annotations

import random
from datetime import date, timedelta

from ..core.catalog import Catalog
from ..core.records import Batch, Observation
from ..core.store import Store
from . import engine, repo
from .records import SIM_SOURCE, WEEKDAYS, TaskEvent

QUALITY = "simulated"
# Personal usual level per score (1-5). Stress is "low is good"; the others "high is good".
BASE_LEVEL = {"self.stress": 2, "self.energy": 4, "self.social": 4, "self.sleep_quality": 4}
VARIED = ("self.energy", "self.sleep_quality")         # a per-person offset of -1 or 0 on these, for variety
NOISE = (-1, 0, 0, 0, 0, 0, 0, 1)                       # small day-to-day noise
# Scripted demo drift (MIND-DESIGN.md): c3's last three days. No other hard-coded alert.
DRIFT = {("c3", "self.social"): (2, 2, 2), ("c3", "self.stress"): (4, 4, 5)}
SIM_HABITS = ("exercise", "hydration", "sleep_window", "call_home")
HIT_RATE = 0.85
HABIT_HISTORY_DAYS = 21                                # habit history only for the last 3 weeks (demo XP stays readable)


def _days(start: str, end: str) -> list[str]:
    d0, d1 = date.fromisoformat(start), date.fromisoformat(end)
    return [(d0 + timedelta(days=i)).isoformat() for i in range((d1 - d0).days + 1)]


def _scheduled(schedule: str | None, day: str) -> bool:
    if schedule == "daily":
        return True
    if schedule and schedule.startswith("days:"):
        return WEEKDAYS[date.fromisoformat(day).weekday()] in schedule[5:].split(",")
    return False


def after_build(cat: Catalog, store: Store) -> None:
    start, today = cat.mission["start_date"], cat.mission["today"]
    days = _days(start, today)
    crew = [s for s, v in cat.subjects.items() if v.get("kind") == "crew_sim"]
    routines = {r["id"]: r for r in cat.extra.get("routines", {}).get("routines", [])}
    rngs = {s: random.Random(f"mind-{s}") for s in crew}

    # 1. Simulated check-in history: one batch for the whole crew.
    obs = []
    for s in crew:
        rng = rngs[s]
        level = {m: v + (rng.choice((-1, 0)) if m in VARIED else 0) for m, v in BASE_LEVEL.items()}
        for i, d in enumerate(days):
            for m, lv in level.items():
                drift = DRIFT.get((s, m))
                back = len(days) - 1 - i                 # 0 = today
                if drift and back < len(drift):
                    v = drift[len(drift) - 1 - back]
                else:
                    v = min(5, max(1, lv + rng.choice(NOISE)))
                obs.append(Observation(s, m, d, float(v), cat.metrics[m]["unit"], SIM_SOURCE, QUALITY))
    store.write(Batch(SIM_SOURCE, QUALITY, observations=obs, note="simulated check-in history (mind plugin)"))

    # 2. Routine habits for every crew member.
    engine.ensure_routines(cat, store)

    # 3. Simulated habit history: the 21 days before today only, so the demo can tick today live.
    for s in crew:
        rng = rngs[s]
        for d in days[-1 - HABIT_HISTORY_DAYS:-1]:
            for rid in SIM_HABITS:
                r = routines.get(rid)
                if r and _scheduled(r.get("schedule"), d) and rng.random() < HIT_RATE:
                    repo.add_event(store, TaskEvent(f"routine-{s}-{rid}", d, "done"))

    # 4. Self-report assessments and system tasks.
    engine.sync(cat, store)
