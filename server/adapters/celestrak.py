"""CelesTrak GP orbital elements for every satellite group in server/catalog/orbit.yaml.

Two modes, chosen at load time:
  recorded (default)  data/orbits/celestrak/<group>.tle (all 8 groups, epoch about 9 Nov 2026, fetch times in
                      index.json) plus docs/research/samples/celestrak_iss_gp.json (ISS, epoch 14 Nov, newer, so it
                      wins). Quality "recorded". Tests and the offline build use this.
  live (opt-in)       set AEGIS_CELESTRAK=live. Each group is downloaded from
                      https://celestrak.org/NORAD/elements/gp.php?GROUP=<id>&FORMAT=tle at most once every
                      `min_fetch_interval_h` (6 h, as CelesTrak asks) and kept in server/data/celestrak/<id>.tle.
                      Fresh download: quality "live". Inside the 6 h window, or if the download fails: the kept copy,
                      quality "cached". No kept copy: the recorded file, quality "recorded".

Elements do not fit the core records (they are not metric values), so load() returns an empty core Batch (one run
row for the bookkeeping) and leaves the parsed element sets in `self.pending`; server/orbit/plugin.py stores them
in the orbit tables after the build. A satellite in several groups is one element set (dedupe by NORAD id).
This adapter never propagates.
"""
from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

from ..core.catalog import Catalog
from ..core.records import Batch
from ..orbit.records import ElementSet, OrbitBatch, intl_designator, parse_tle, tle_epoch
from .base import ROOT

SOURCE = "celestrak"
RECORDED_DIR = ROOT / "data" / "orbits" / "celestrak"
ISS_GP_SAMPLE = ROOT / "docs" / "research" / "samples" / "celestrak_iss_gp.json"
CACHE_DIR = ROOT / "server" / "data" / "celestrak"          # gitignored (server/.gitignore: data/)
URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP={group}&FORMAT=tle"
ENV = "AEGIS_CELESTRAK"
QUALITY_ORDER = ("recorded", "cached", "live")


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _http_get(url: str, timeout: float) -> str:
    import httpx                                               # only the live path needs it
    r = httpx.get(url, timeout=timeout, follow_redirects=True, headers={"User-Agent": "aegis-orbit/1"})
    r.raise_for_status()
    return r.text


class CelesTrak:
    source = SOURCE

    def __init__(self, mode: str | None = None, recorded_dir: Path = RECORDED_DIR, cache_dir: Path = CACHE_DIR,
                 fetch=_http_get, timeout: float = 30.0, clock=time.time):
        self.mode = mode                                       # None = read AEGIS_CELESTRAK at load time
        self.recorded_dir, self.cache_dir = Path(recorded_dir), Path(cache_dir)
        self.fetch, self.timeout, self.clock = fetch, timeout, clock
        self.pending: OrbitBatch | None = None                 # drained by server/orbit/plugin.py

    def load(self, cat: Catalog) -> Batch:
        mode = (self.mode or os.environ.get(ENV, "recorded")).strip().lower()
        ob = self.load_live(cat) if mode == "live" else self.load_recorded(cat)
        self.pending = ob
        return Batch(SOURCE, ob.quality, note=ob.note)

    # ---- helpers ----------------------------------------------------------------------------
    @staticmethod
    def _groups(cat: Catalog) -> list[str]:
        return [g["id"] for g in (cat.extra.get("orbit") or {}).get("groups", [])]

    def _recorded_fetched_at(self) -> dict[str, str]:
        try:
            idx = json.loads((self.recorded_dir / "index.json").read_text(encoding="utf-8"))
            return {g["group"]: _iso(g["fetched_at_ms"] / 1000) for g in idx["groups"]}
        except (OSError, ValueError, KeyError):
            return {}

    @staticmethod
    def _add_text(ob: OrbitBatch, group: str, text: str, quality: str, fetched_at: str) -> int:
        n = 0
        for name, l1, l2 in parse_tle(text):
            try:
                norad = int(l1[2:7])
                epoch = tle_epoch(l1)
            except ValueError:
                continue
            ob.add(ElementSet(norad, name, intl_designator(l1), l1, l2, epoch, SOURCE, quality, fetched_at), group)
            n += 1
        return n

    @staticmethod
    def _add_iss_sample(ob: OrbitBatch) -> None:
        """The newer ISS GP JSON (OMM) as TLE lines, so the app and the engine see one format."""
        try:
            from sgp4 import exporter, omm
            from sgp4.api import Satrec
            fields = json.loads(ISS_GP_SAMPLE.read_text(encoding="utf-8"))[0]
            sat = Satrec()
            omm.initialize(sat, {k: str(v) for k, v in fields.items()})
            l1, l2 = exporter.export_tle(sat)
        except Exception:                                      # sample missing or unreadable: the TLE files suffice
            return
        fetched = _iso(ISS_GP_SAMPLE.stat().st_mtime)
        ob.add(ElementSet(int(fields["NORAD_CAT_ID"]), fields["OBJECT_NAME"], fields.get("OBJECT_ID"), l1, l2,
                          tle_epoch(l1), SOURCE, "recorded", fetched), "stations")

    # ---- recorded -----------------------------------------------------------------------------
    def load_recorded(self, cat: Catalog, groups: list[str] | None = None, why: str = "") -> OrbitBatch:
        ob = OrbitBatch("recorded")
        fetched = self._recorded_fetched_at()
        counts = []
        for g in groups if groups is not None else self._groups(cat):
            path = self.recorded_dir / f"{g}.tle"
            if not path.exists():
                continue
            n = self._add_text(ob, g, path.read_text(encoding="utf-8"), "recorded",
                               fetched.get(g, _iso(path.stat().st_mtime)))
            ob.group_quality[g] = "recorded"
            counts.append(f"{g}={n}")
        if groups is None or "stations" in groups:
            self._add_iss_sample(ob)
        ob.note = (f"live fell back to recorded: {why}; " if why else "") + \
            f"data/orbits/celestrak ({', '.join(counts)}), {len(ob.sets)} satellites"
        return ob

    # ---- live ---------------------------------------------------------------------------------
    def load_live(self, cat: Catalog) -> OrbitBatch:
        min_age_s = float((cat.extra.get("orbit") or {}).get("min_fetch_interval_h", 6)) * 3600
        ob = OrbitBatch("recorded")
        fallback, failed = [], []
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        for g in self._groups(cat):
            kept = self.cache_dir / f"{g}.tle"
            age = self.clock() - kept.stat().st_mtime if kept.exists() else None
            if age is not None and age < min_age_s:            # fetched less than 6 h ago: do not ask again
                self._add_text(ob, g, kept.read_text(encoding="utf-8"), "cached", _iso(kept.stat().st_mtime))
                ob.group_quality[g] = "cached"
                continue
            try:
                text = self.fetch(URL.format(group=g), self.timeout)
                if not parse_tle(text):
                    raise ValueError("no element sets in reply")
                kept.write_text(text, encoding="utf-8")
                self._add_text(ob, g, text, "live", _iso(self.clock()))
                ob.group_quality[g] = "live"
            except Exception as e:                              # network, HTTP error or junk: kept copy, else recorded
                failed.append(f"{g}: {type(e).__name__}")
                if kept.exists():
                    self._add_text(ob, g, kept.read_text(encoding="utf-8"), "cached", _iso(kept.stat().st_mtime))
                    ob.group_quality[g] = "cached"
                else:
                    fallback.append(g)
        if fallback:
            rec = self.load_recorded(cat, fallback)
            for e in rec.sets.values():
                for g in sorted(e.groups):
                    ob.add(ElementSet(**{**e.__dict__, "groups": set()}), g)
            ob.group_quality.update(rec.group_quality)
        ob.quality = max(set(ob.group_quality.values()) or {"recorded"}, key=QUALITY_ORDER.index)
        ob.note = f"celestrak live: {dict(sorted(ob.group_quality.items()))}" + \
            (f"; failed {', '.join(failed)}" if failed else "")
        return ob


ADAPTER = CelesTrak()
ORDER = 60
