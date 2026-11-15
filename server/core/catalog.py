"""Loads and checks server/catalog/*.yaml: the single source of truth for what exists."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

CATALOG_DIR = Path(__file__).resolve().parents[1] / "catalog"
HAZARDS = {"radiation", "isolation", "distance", "gravity", "closed_environment", "multiple"}
REGIONS = {"brain", "heart", "blood", "bones", "whole_body", None}
RULES = {"baseline_z", "absolute", "pre_flight_baseline", "display_only"}
SUBJECT_KINDS = {"crew_sim", "crew_real", "habitat", "star"}


class CatalogError(ValueError):
    pass


def _load(path: Path, key: str) -> list[dict[str, Any]] | dict[str, Any]:
    with path.open(encoding="utf-8") as f:
        return yaml.safe_load(f)[key]


@dataclass
class Catalog:
    metrics: dict[str, dict]
    subjects: dict[str, dict]
    sources: dict[str, dict]
    models: dict[str, dict]
    mission: dict

    @classmethod
    def load(cls, root: Path = CATALOG_DIR) -> "Catalog":
        cat = cls(
            metrics={m["key"]: m for m in _load(root / "metrics.yaml", "metrics")},
            subjects={s["id"]: s for s in _load(root / "subjects.yaml", "subjects")},
            sources={s["id"]: s for s in _load(root / "sources.yaml", "sources")},
            models={m["id"]: m for m in _load(root / "models.yaml", "models")},
            mission=_load(root / "mission.yaml", "mission"),
        )
        cat.check()
        return cat

    # ---- lookups -------------------------------------------------------------
    def by_contract_key(self, kind: str) -> dict[str, dict]:
        """Old v1 JSON name -> metric, for one metric kind (e.g. 'crew_daily')."""
        return {m["contract_key"]: m for m in self.metrics.values() if m["kind"] == kind and "contract_key" in m}

    def subjects_of(self, kind: str) -> list[dict]:
        return [s for s in self.subjects.values() if s["kind"] == kind]

    def habitat_of(self, subject_id: str) -> dict | None:
        loc = self.subjects[subject_id].get("located_in")
        return self.subjects.get(loc) if loc else None

    def habitat_for_environment(self, env: str) -> dict:
        return next(s for s in self.subjects_of("habitat") if s["environment"] == env)

    # ---- integrity -----------------------------------------------------------
    def check(self) -> None:
        errors: list[str] = []
        for key, m in self.metrics.items():
            for req in ("label", "unit", "kind", "hazard", "rule"):
                if req not in m:
                    errors.append(f"metric {key}: missing {req}")
            if m.get("hazard") not in HAZARDS:
                errors.append(f"metric {key}: hazard {m.get('hazard')!r} not in {sorted(HAZARDS)}")
            if m.get("body_region") not in REGIONS:
                errors.append(f"metric {key}: body_region {m.get('body_region')!r}")
            if m.get("rule", {}).get("type") not in RULES:
                errors.append(f"metric {key}: rule type {m.get('rule', {}).get('type')!r}")
        seen: dict[tuple, str] = {}
        for key, m in self.metrics.items():
            if "contract_key" in m:
                k = (m["kind"], m["contract_key"])
                if k in seen:
                    errors.append(f"metric {key}: contract_key {k} also used by {seen[k]}")
                seen[k] = key
        for sid, s in self.subjects.items():
            if s.get("kind") not in SUBJECT_KINDS:
                errors.append(f"subject {sid}: kind {s.get('kind')!r}")
            loc = s.get("located_in")
            if loc and loc not in self.subjects:
                errors.append(f"subject {sid}: located_in {loc!r} is not a subject")
        if errors:
            raise CatalogError("catalog check failed:\n  " + "\n  ".join(errors))
