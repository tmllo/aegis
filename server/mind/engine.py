"""Mind engine: self-report scoring, system tasks, streaks/XP/badges, the wellbeing summary, the check-in form.

Spec: docs/backend/MIND-DESIGN.md. Reads via repo + store, writes via repo + store.write. Returns plain dicts, never
an HTTP response. Journal text is never read here: only repo.note_days (counts per day). No generative AI.
"""
from __future__ import annotations

import datetime as _dt
import math

from ..core.catalog import Catalog
from ..core.records import Assessment
from ..core.store import Store
from . import repo
from .records import CHECKIN_SOURCE, SIM_SOURCE, WEEKDAYS, Task, TaskEvent, checkin_metrics, day_of, scale_of

RULE = "baseline_z@3d"
ORIGIN_ORDER = {"system": 0, "routine": 1, "self": 2}
DONE = ("done", "closed")


# ---- small date helpers --------------------------------------------------------
def _d(day: str) -> _dt.date:
    return _dt.date.fromisoformat(day[:10])


def _shift(day: str, n: int) -> str:
    return (_d(day) + _dt.timedelta(days=n)).isoformat()


def _weekday(day: str) -> str:
    return WEEKDAYS[_d(day).weekday()]


def today(cat: Catalog) -> str:
    return cat.mission["today"]


def _crew(cat: Catalog, subject: str | None = None) -> list[str]:
    ids = [s["id"] for s in cat.subjects_of("crew_sim")]
    return [subject] if subject is not None else ids


# ---- check-in days -------------------------------------------------------------
def checkin_days(cat: Catalog, store: Store, subject: str) -> set[str]:
    keys = set(checkin_metrics(cat))
    days: set[str] = set()
    for src in (CHECKIN_SOURCE, SIM_SOURCE):
        days |= {day_of(o.t) for o in store.observations(subject=subject, source=src) if o.metric in keys}
    return days


def _streak_days(days: set[str], date: str) -> int:
    """Consecutive days in `days` ending at date, or at date-1 when date is not (yet) in it."""
    d = date if date in days else _shift(date, -1)
    n = 0
    while d in days:
        n, d = n + 1, _shift(d, -1)
    return n


# ---- self-report scoring -------------------------------------------------------
def _daily_means(store: Store, subject: str, metric: str) -> dict[str, float]:
    """Value per day: the latest live check-in that day if any (it replaces the simulated value), else the mean."""
    vals: dict[str, list[float]] = {}
    live: dict[str, tuple[str, float]] = {}
    for o in store.observations(subject=subject, metric=metric):
        if o.value is None:
            continue
        d = day_of(o.t)
        if o.source == CHECKIN_SOURCE:
            if d not in live or o.t >= live[d][0]:
                live[d] = (o.t, float(o.value))         # a re-rating the same day replaces the earlier one
        else:
            vals.setdefault(d, []).append(float(o.value))
    out = {d: sum(v) / len(v) for d, v in vals.items()}
    out.update({d: v for d, (_, v) in live.items()})
    return out


def _self_report_metrics(cat: Catalog) -> list[dict]:
    """The scores the Mind engine scores live: every self_report metric plus the check-in metrics (self.mood).
    At build, engine/scoring.py scores self.mood too; sync replaces those rows with the same rule so a live mood
    check-in is scored at once."""
    keys = set(checkin_metrics(cat)) | {k for k, m in cat.metrics.items() if m["kind"] == "self_report"}
    return [m for k, m in cat.metrics.items() if k in keys]


def score_self_report(cat: Catalog, store: Store, subject: str) -> list[Assessment]:
    s = cat.mission["scoring"]
    base_n, window, report = s["baseline_days"], s["rolling_days"], s["report_last_days"]
    amber_z, red_z = s["amber_z"], s["red_z"]
    out: list[Assessment] = []
    for m in _self_report_metrics(cat):
        rule = m.get("rule") or {}
        if rule.get("type", "baseline_z") != "baseline_z":
            continue
        daily = _daily_means(store, subject, m["key"])
        days = sorted(daily)
        base_vals = [daily[d] for d in days[:base_n]]
        if len(base_vals) < 3:
            continue
        mu = sum(base_vals) / len(base_vals)
        sd = math.sqrt(sum((v - mu) ** 2 for v in base_vals) / (len(base_vals) - 1))
        sd = max(rule.get("sd_floor", 1e-6), sd)
        first_reported = _shift(days[-1], -(report - 1))
        for d in days:
            if d < first_reported:
                continue
            w = [daily[x] for x in (_shift(d, -k) for k in range(window)) if x in daily]
            z = (sum(w) / len(w) - mu) / sd
            score = -z if rule.get("low_side_only") else z if rule.get("high_side_only") else abs(z)
            severity = "red" if score >= red_z else "amber" if score >= amber_z else None
            hard = m.get("absolute_red")
            outside = bool(hard) and not (hard["min"] <= daily[d] <= hard["max"])
            if outside:
                severity = "red"
            if severity is None:
                continue
            if score >= amber_z:
                msg = f"{m['label']} 3-day average {abs(z):.1f}σ {'above' if z > 0 else 'below'} your own baseline"
                if outside:
                    msg += ", and outside the hard safety limit"
            else:
                msg = f"{m['label']} outside the hard safety limit"          # same words as engine/scoring.py
            out.append(Assessment(subject, m["key"], d, RULE, severity, round(z, 2), msg, m["actions"][severity]))
    return out


# ---- sync: assessments -> system tasks -> closing ------------------------------
def sync(cat: Catalog, store: Store, subject: str | None = None) -> dict:
    opened: list[str] = []
    closed: list[str] = []
    keys = [m["key"] for m in _self_report_metrics(cat)]
    live_keys = set(keys)
    for s in _crew(cat, subject):
        repo.replace_assessments_for(store, s, keys, score_self_report(cat, store, s))

        latest: dict[str, Assessment] = {}
        for a in store.assessments(s):
            if a.metric not in latest or a.t >= latest[a.metric].t:
                latest[a.metric] = a
        for metric, a in latest.items():
            day = day_of(a.t)
            # evidence_t: the newest reading already stored when the task opens. Only a reading after it closes the
            # task, so the check-in that raised the alert never closes its own task (same-day re-measure still does).
            seen = [o.t for o in store.observations(subject=s, metric=metric)]
            if seen and day_of(max(seen)) > day:
                continue                        # not current: a newer day's reading is no longer flagged
            task = Task(id=f"sys-{s}-{metric}-{day}", subject=s, kind="todo", label=a.action, origin="system",
                        created=day, due=_shift(day, 1), metric=metric,
                        attrs={"severity": a.severity, "z": a.z, "message": a.message, "assessment_t": a.t,
                               "evidence_t": max(seen + [a.t]), "rule": a.rule,
                               "activities": activity_ids_for(cat, metric)})
            if repo.put_task(store, task, replace=False):
                opened.append(task.id)

        with_events = {e.task_id for e in repo.events(store, subject=s)}
        for task in repo.tasks(store, s, origin="system"):
            if task.id in with_events or not task.metric:
                continue
            at = task.attrs.get("evidence_t") or task.attrs.get("assessment_t")
            if at is None:
                continue
            newer = [o.t for o in store.observations(subject=s, metric=task.metric) if o.t > at]
            if newer and task.metric in live_keys:
                # Verify: a score the engine re-scores live closes only when the newest reading is no longer flagged.
                if any(a.metric == task.metric and a.t == day_of(max(newer)) for a in store.assessments(s)):
                    continue
            if newer:
                repo.add_event(store, TaskEvent(task.id, min(newer), "closed"))
                closed.append(task.id)
    return {"opened": opened, "closed": closed}


# ---- routines ------------------------------------------------------------------
def ensure_routines(cat: Catalog, store: Store) -> int:
    routines = (cat.extra.get("routines") or {}).get("routines") or []
    created = 0
    for s in _crew(cat):
        for r in routines:
            attrs = {"routine": r["id"], "basis": r.get("basis")}
            if r["id"] == "checkin":
                attrs["auto"] = "checkin"
            elif r["id"] == "journal":
                attrs["auto"] = "journal"
            task = Task(id=f"routine-{s}-{r['id']}", subject=s, kind="habit", label=r["label"], origin="routine",
                        created=cat.mission["start_date"], schedule=r["schedule"], metric=r.get("metric"), attrs=attrs)
            created += int(repo.put_task(store, task, replace=False))
    return created


# ---- one task on one day -------------------------------------------------------
def _scheduled(task: Task, d: str) -> bool:
    if day_of(task.created) > d:
        return False
    sch = task.schedule or "daily"
    if sch == "daily":
        return True
    if sch.startswith("days:"):
        return _weekday(d) in sch[5:].split(",")
    return False


class _Ctx:
    """Per-subject lookups computed once (events, check-in days, journal days)."""

    def __init__(self, cat: Catalog, store: Store, subject: str):
        self.events: dict[str, list[TaskEvent]] = {}
        for e in repo.events(store, subject=subject):
            self.events.setdefault(e.task_id, []).append(e)
        for evs in self.events.values():
            evs.sort(key=lambda e: e.t)
        self._checkin: set[str] | None = None
        self._notes: dict[str, int] | None = None
        self.cat, self.store, self.subject = cat, store, subject

    @property
    def checkin(self) -> set[str]:
        if self._checkin is None:
            self._checkin = checkin_days(self.cat, self.store, self.subject)
        return self._checkin

    @property
    def notes(self) -> dict[str, int]:
        if self._notes is None:
            self._notes = repo.note_days(self.store, self.subject)
        return self._notes


def _habit_status(task: Task, d: str, ctx: _Ctx) -> str | None:
    status = None
    for e in ctx.events.get(task.id, []):
        if day_of(e.t) == d:
            status = e.status
    auto = task.attrs.get("auto")
    if (auto == "checkin" and d in ctx.checkin) or (auto == "journal" and d in ctx.notes):
        status = "done"
    return status


def _habit_streak(task: Task, d: str, ctx: _Ctx) -> int:
    start = day_of(task.created)
    cur = d
    if not (_scheduled(task, cur) and _habit_status(task, cur, ctx) in DONE):
        cur = _shift(cur, -1)
    n = 0
    while cur >= start:
        if _scheduled(task, cur):
            if _habit_status(task, cur, ctx) not in DONE:
                break
            n += 1
        cur = _shift(cur, -1)
    return n


def _view(task: Task, d: str, ctx: _Ctx) -> dict:
    if task.kind == "habit":
        status = _habit_status(task, d, ctx)
        streak = _habit_streak(task, d, ctx)
    else:
        status = None
        for e in ctx.events.get(task.id, []):
            if day_of(e.t) <= d:
                status = e.status
        streak = 0
    return {"id": task.id, "kind": task.kind, "label": task.label, "origin": task.origin, "metric": task.metric,
            "schedule": task.schedule, "due": task.due, "created": task.created, "done": status in DONE,
            "status": status, "streak": streak, "attrs": dict(task.attrs)}


def task_view(cat: Catalog, store: Store, task: Task, date: str) -> dict:
    return _view(task, day_of(date), _Ctx(cat, store, task.subject))


def tasks_for_day(cat: Catalog, store: Store, subject: str, date: str) -> list[dict]:
    d = day_of(date or today(cat))
    ctx = _Ctx(cat, store, subject)
    picked: list[Task] = []
    for task in repo.tasks(store, subject):
        if task.kind == "habit":
            if _scheduled(task, d):
                picked.append(task)
            continue
        if day_of(task.created) > d:
            continue
        evs = ctx.events.get(task.id, [])
        unfinished = not any(day_of(e.t) < d for e in evs)
        finished_today = any(day_of(e.t) == d and e.status in DONE for e in evs)
        if unfinished or finished_today:
            picked.append(task)
    picked.sort(key=lambda t: (ORIGIN_ORDER.get(t.origin, 9), t.label, t.id))
    return [_view(t, d, ctx) for t in picked]


# ---- progress: XP, streaks, badges ---------------------------------------------
def progress(cat: Catalog, store: Store, subject: str, date: str | None = None) -> dict:
    d = day_of(date or today(cat))
    cfg = cat.extra.get("routines") or {}
    xp_cfg = cfg.get("xp") or {}
    ctx = _Ctx(cat, store, subject)
    all_tasks = repo.tasks(store, subject)

    tasks_done = 0
    system_closed = 0
    for task in all_tasks:
        evs = [e for e in ctx.events.get(task.id, []) if day_of(e.t) <= d]
        if task.origin == "system":
            system_closed += int(any(e.status in DONE for e in evs))
        elif not task.attrs.get("auto"):
            tasks_done += sum(1 for e in evs if e.status == "done")
    n_checkin = len({x for x in ctx.checkin if x <= d})
    n_journal = len({x for x in ctx.notes if x <= d})

    xp = (xp_cfg.get("task_done", 0) * tasks_done + xp_cfg.get("system_task_done", 0) * system_closed
          + xp_cfg.get("checkin_day", 0) * n_checkin + xp_cfg.get("journal_day", 0) * n_journal)
    every = xp_cfg.get("level_every", 100) or 100
    level = 1 + xp // every

    streaks = {t.id: _habit_streak(t, d, ctx) for t in all_tasks if t.kind == "habit"}
    task_by_id = {t.id: t for t in all_tasks}
    checkin_streak = _streak_days({x for x in ctx.checkin if x <= d}, d)
    values = {"checkin_days": n_checkin, "checkin_streak": checkin_streak, "system_tasks_closed": system_closed,
              # auto habits (check-in, journal) already count through checkin_streak / journal_days, as in XP
              "best_habit_streak": max((n for k, n in streaks.items() if not task_by_id[k].attrs.get("auto")),
                                       default=0)}
    badges = [{"id": b["id"], "label": b["label"],
               "earned": all(values.get(k, 0) >= v for k, v in (b.get("rule") or {}).items())}
              for b in cfg.get("badges") or []]
    return {"subject": subject, "date": d, "xp": xp, "level": level,
            "level_xp": (level - 1) * every, "next_level_xp": level * every,
            "checkin_streak": checkin_streak, "checkin_days": n_checkin,
            "best_habit_streak": values["best_habit_streak"], "streaks": streaks,
            "system_tasks_closed": system_closed, "journal_days": n_journal, "badges": badges}


# ---- wellbeing summary (never journal text) ------------------------------------
def wellbeing(cat: Catalog, store: Store, subject: str, days: int = 28, end: str | None = None) -> dict:
    end = day_of(end or today(cat))
    start = _shift(end, -(days - 1))
    metrics = checkin_metrics(cat) + (["self.sleep_h"] if "self.sleep_h" in cat.metrics else [])
    daily = {m: _daily_means(store, subject, m) for m in metrics}
    cdays = checkin_days(cat, store, subject)
    ndays = repo.note_days(store, subject)

    blocks: list[tuple[str, str]] = []
    b_end = end
    while b_end >= start:
        b_from = max(start, _shift(b_end, -6))
        blocks.append((b_from, b_end))
        b_end = _shift(b_from, -1)
    blocks.reverse()

    weeks = []
    for b_from, b_to in blocks:
        scores = {}
        for m in metrics:
            vals = [v for x, v in daily[m].items() if b_from <= x <= b_to]
            scores[m] = {"mean": round(sum(vals) / len(vals), 2) if vals else None, "n": len(vals)}
        weeks.append({"from": b_from, "to": b_to, "scores": scores,
                      "checkin_days": sum(1 for x in cdays if b_from <= x <= b_to),
                      "journal_entries": sum(n for x, n in ndays.items() if b_from <= x <= b_to)})

    trend = {}
    for m in metrics:
        first = weeks[0]["scores"][m]["mean"] if weeks else None
        last = weeks[-1]["scores"][m]["mean"] if weeks else None
        change = round(last - first, 2) if first is not None and last is not None else None
        trend[m] = {"first": first, "last": last, "change": change}

    alerts = [{"metric": a.metric, "t": a.t, "severity": a.severity, "message": a.message}
              for a in store.assessments(subject) if a.metric in metrics and start <= day_of(a.t) <= end]
    return {"subject": subject, "from": start, "to": end, "days": days, "weeks": weeks, "trend": trend,
            "checkin_streak": _streak_days({x for x in cdays if x <= end}, end),
            "journal_entries": sum(n for x, n in ndays.items() if start <= x <= end),
            "alerts": alerts, "journal_text_included": False}


# ---- the check-in form ---------------------------------------------------------
def checkin_form(cat: Catalog, store: Store, subject: str, date: str | None = None) -> dict:
    d = day_of(date or today(cat))
    out = []
    for key in checkin_metrics(cat):
        m = cat.metrics.get(key, {})
        sc = scale_of(cat, key) or {}
        latest = None
        for o in store.observations(subject=subject, metric=key):
            if day_of(o.t) == d and o.value is not None and (latest is None or o.t >= latest.t):
                latest = o
        out.append({"key": key, "label": m.get("label", key), "unit": m.get("unit"),
                    "scale": {"min": sc.get("min"), "max": sc.get("max"), "words": list(sc.get("words") or [])},
                    "value": latest.value if latest else None})
    return {"subject": subject, "date": d, "metrics": out}


def resolve_task_id(cat: Catalog, task_id: str) -> str:
    """routine-<subject>-<alias> -> routine-<subject>-<id>, using each routine's `aliases` in routines.yaml.
    Lets an app that names default habits its own way (Emile's 'routine-c1-check-in') tick the server's habit."""
    if not task_id.startswith("routine-"):
        return task_id
    for s in cat.subjects_of("crew_sim"):
        prefix = f"routine-{s['id']}-"
        if task_id.startswith(prefix):
            name = task_id[len(prefix):]
            for r in cat.extra.get("routines", {}).get("routines", []):
                if name == r["id"] or name in r.get("aliases", []):
                    return prefix + r["id"]
    return task_id


# ---- activities (catalog/activities.yaml), suggested by open alerts --------------
SEVERITY_RANK = {"red": 2, "amber": 1}


def _activity_catalog(cat: Catalog) -> list[dict]:
    return list((cat.extra.get("activities") or {}).get("activities") or [])


def activity(cat: Catalog, activity_id: str) -> dict | None:
    return next((a for a in _activity_catalog(cat) if a["id"] == activity_id), None)


def activity_ids_for(cat: Catalog, metric: str) -> list[str]:
    """Activities whose `helps` lists this metric, in catalog order (a fixed rule, no inference)."""
    return [a["id"] for a in _activity_catalog(cat) if metric in (a.get("helps") or [])]


def activity_task_id(subject: str, activity_id: str) -> str:
    return f"activity-{subject}-{activity_id}"


def open_alerts(cat: Catalog, store: Store, subject: str, date: str | None = None) -> list[dict]:
    """System tasks still open on `date`: the alerts the crew member has not yet closed with a new reading or done."""
    d = date or today(cat)
    ctx = _Ctx(cat, store, subject)
    out = []
    for task in repo.tasks(store, subject, origin="system"):
        if day_of(task.created) > d or not task.metric:
            continue
        if any(day_of(e.t) <= d and e.status in DONE for e in ctx.events.get(task.id, [])):
            continue
        out.append({"task_id": task.id, "metric": task.metric, "severity": task.attrs.get("severity"),
                    "t": task.attrs.get("assessment_t", task.created), "message": task.attrs.get("message")})
    out.sort(key=lambda a: (-SEVERITY_RANK.get(a["severity"], 0), a["metric"]))
    return out


def activities_for(cat: Catalog, store: Store, subject: str, date: str | None = None) -> dict:
    """The activity catalog for one crew member on one day. Activities that help a metric with an open alert are
    `suggested` and come first (red before amber, then catalog order)."""
    d = date or today(cat)
    alerts = open_alerts(cat, store, subject, d)
    ctx = _Ctx(cat, store, subject)
    rows = []
    for i, a in enumerate(_activity_catalog(cat)):
        because = [{"metric": x["metric"], "severity": x["severity"], "task_id": x["task_id"]}
                   for x in alerts if x["metric"] in (a.get("helps") or [])]
        done = [e for e in ctx.events.get(activity_task_id(subject, a["id"]), []) if e.status == "done" and day_of(e.t) <= d]
        rank = max((SEVERITY_RANK.get(b["severity"], 0) for b in because), default=0)
        rows.append((-rank, i, {**a, "suggested": bool(because), "because": because,
                                "done_today": any(day_of(e.t) == d for e in done), "times_done": len(done)}))
    rows.sort(key=lambda r: (r[0], r[1]))
    return {"subject": subject, "date": d, "open_alerts": alerts, "activities": [r[2] for r in rows]}


def log_activity(cat: Catalog, store: Store, subject: str, activity_id: str, t: str) -> dict:
    """Doing an activity = a done event on the crew member's activity task (a self to-do, created on first use).
    It earns task XP; it never closes an alert (only a new reading does: Verify)."""
    a = activity(cat, activity_id)
    if a is None:
        raise KeyError(activity_id)
    tid = activity_task_id(subject, activity_id)
    repo.put_task(store, Task(id=tid, subject=subject, kind="todo", label=f"Activity: {a['label']}", origin="self",
                              created=day_of(t), due=day_of(t), attrs={"activity": activity_id}), replace=False)
    repo.add_event(store, TaskEvent(tid, t, "done"))
    times = sum(1 for e in repo.events(store, task_id=tid) if e.status == "done")
    return {"activity_id": activity_id, "task_id": tid, "t": t, "status": "done", "times_done": times}
