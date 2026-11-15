"""All reads and writes of the orbit tables, on store.db under store.lock. No propagation, no formatting."""
from __future__ import annotations

from ..core.catalog import Catalog
from ..core.store import Store
from .records import OrbitBatch

QUALITY_RANK = {"recorded": 0, "cached": 1, "live": 2}


def write_groups(cat: Catalog, store: Store) -> None:
    """orbit_group rows from server/catalog/orbit.yaml (labels can change: always upserted)."""
    conf = cat.extra.get("orbit") or {}
    credit = conf.get("credit", "")
    with store.lock:
        store.db.executemany(
            "INSERT OR REPLACE INTO orbit_group (id, label, kind, default_on, credit) VALUES (?,?,?,?,?)",
            [(g["id"], g["label"], g["kind"], int(bool(g.get("default_on"))), g.get("credit", credit))
             for g in conf.get("groups", [])])
        store.db.commit()


def write_batch(cat: Catalog, store: Store, batch: OrbitBatch) -> int:
    """Store one celestrak load. Idempotent. An element set never replaces a newer epoch already stored.
    Membership of every group in the batch is replaced whole (a satellite that left a group leaves it here too)."""
    write_groups(cat, store)
    known = {g["id"] for g in (cat.extra.get("orbit") or {}).get("groups", [])}
    sets = list(batch.sets.values())
    with store.lock:
        for gid in batch.group_quality:
            store.db.execute("DELETE FROM orbit_membership WHERE group_id=?", (gid,))
        store.db.executemany(
            "INSERT INTO orbit_object (norad, name, intl_designator) VALUES (?,?,?) "
            "ON CONFLICT(norad) DO UPDATE SET name=excluded.name, intl_designator=excluded.intl_designator "
            "WHERE (SELECT epoch FROM orbit_elements WHERE norad=excluded.norad) IS NULL "
            "OR (SELECT epoch FROM orbit_elements WHERE norad=excluded.norad) <= ?",
            [(e.norad, e.name, e.intl_designator, e.epoch) for e in sets])
        store.db.executemany(
            "INSERT OR IGNORE INTO orbit_membership (norad, group_id) VALUES (?,?)",
            [(e.norad, g) for e in sets for g in sorted(e.groups) if g in known])
        store.db.executemany(
            "INSERT INTO orbit_elements (norad, epoch, line1, line2, source, quality, fetched_at) VALUES (?,?,?,?,?,?,?) "
            "ON CONFLICT(norad) DO UPDATE SET epoch=excluded.epoch, line1=excluded.line1, line2=excluded.line2, "
            "source=excluded.source, quality=excluded.quality, fetched_at=excluded.fetched_at "
            "WHERE excluded.epoch >= orbit_elements.epoch",
            [(e.norad, e.epoch, e.line1, e.line2, e.source, e.quality, e.fetched_at) for e in sets])
        store.db.commit()
    return len(sets)


def is_empty(store: Store) -> bool:
    with store.lock:
        return store.db.execute("SELECT COUNT(*) FROM orbit_elements").fetchone()[0] == 0


def groups(store: Store) -> list[dict]:
    """Every group with its object count and the epochs and qualities of its members (catalog order is the caller's)."""
    with store.lock:
        rows = store.db.execute(
            "SELECT g.id, g.label, g.kind, g.default_on, g.credit, COUNT(e.norad) AS objects, "
            "GROUP_CONCAT(e.epoch) AS epochs, "
            "MIN(CASE e.quality WHEN 'recorded' THEN 0 WHEN 'cached' THEN 1 WHEN 'live' THEN 2 END) AS q "
            "FROM orbit_group g LEFT JOIN orbit_membership m ON m.group_id=g.id "
            "LEFT JOIN orbit_elements e ON e.norad=m.norad GROUP BY g.id").fetchall()
    rank = {v: k for k, v in QUALITY_RANK.items()}
    return [{"id": r["id"], "label": r["label"], "kind": r["kind"], "default_on": bool(r["default_on"]),
             "credit": r["credit"], "objects": r["objects"],
             "epochs": sorted((r["epochs"] or "").split(",")) if r["epochs"] else [],
             "quality": rank.get(r["q"], "recorded")} for r in rows]


def group_elements(store: Store, group_id: str) -> list[dict]:
    """[{norad, name, line1, line2, epoch, quality}] for one group, by norad."""
    with store.lock:
        rows = store.db.execute(
            "SELECT o.norad, o.name, e.line1, e.line2, e.epoch, e.quality FROM orbit_membership m "
            "JOIN orbit_object o ON o.norad=m.norad JOIN orbit_elements e ON e.norad=m.norad "
            "WHERE m.group_id=? ORDER BY o.norad", (group_id,)).fetchall()
    return [dict(r) for r in rows]


def element(store: Store, norad: int) -> dict | None:
    """{norad, name, intl_designator, line1, line2, epoch, source, quality, fetched_at} or None."""
    with store.lock:
        r = store.db.execute(
            "SELECT o.norad, o.name, o.intl_designator, e.line1, e.line2, e.epoch, e.source, e.quality, e.fetched_at "
            "FROM orbit_elements e JOIN orbit_object o ON o.norad=e.norad WHERE e.norad=?", (norad,)).fetchone()
    return dict(r) if r else None
