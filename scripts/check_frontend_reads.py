"""Fail when origin/crew-station calls a path that contracts/frontend_reads.json does not list.

Skips with exit 0 when git or the branch is missing, so a checkout without that remote still passes.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.frontend_contract import load_fixture  # noqa: E402


def norm(path: str) -> str:
    path = path.split("${")[0]
    path = path.split("?")[0]
    path = path.strip().strip("`'\"")
    path = path.lstrip("/")
    path = re.sub(r"\{[^}]+\}", "", path)
    return path.rstrip("/")


def listed(fixture: dict) -> list[str]:
    paths = list(fixture.get("covers") or [])
    for call in fixture["calls"]:
        paths.append(call["path"])
    return paths


def covered(fragment: str, paths: list[str]) -> bool:
    frag = norm(fragment)
    if not frag or frag in ("http:", "https:"):
        return True
    for raw in paths:
        item = norm(raw)
        if not item:
            continue
        if frag == item or frag.startswith(item) or item.startswith(frag):
            return True
    return False


def frontend_fragments() -> list[str]:
    try:
        out = subprocess.check_output(
            ["git", "grep", "-h", "-E", r"getJson|postJson|fetch\(", "origin/crew-station", "--", "web/src"],
            cwd=ROOT, text=True, encoding="utf-8", stderr=subprocess.DEVNULL)
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        print(f"skip: git cannot read origin/crew-station ({exc})")
        return []
    found = []
    for match in re.finditer(r"[`'\"]([^`'\"]*(?:api/|data/|orbits/|samples/|models/|stars\.bin|body-glb)[^`'\"]*)[`'\"]", out):
        found.append(match.group(1))
    for match in re.finditer(r"`([^`]*)`", out):
        if "${" in match.group(1) and any(bit in match.group(1) for bit in ("api/", "data/", "orbits/", "samples/", "stars.bin")):
            found.append(match.group(1).split("${")[0])
    return found


def main() -> int:
    fragments = frontend_fragments()
    if not fragments:
        print("skip: no frontend paths read (branch missing or no calls)")
        return 0
    paths = listed(load_fixture())
    def interesting(frag: str) -> bool:
        item = norm(frag)
        return item.startswith(("api/", "data/", "orbits/", "samples/", "models/", "stars.bin", "body-glb", "http"))

    missing = sorted({frag for frag in fragments if interesting(frag) and not covered(frag, paths)})
    if missing:
        print("frontend paths not in contracts/frontend_reads.json:")
        for frag in missing:
            print(" ", frag)
        return 1
    print(f"frontend paths covered: {len(fragments)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
