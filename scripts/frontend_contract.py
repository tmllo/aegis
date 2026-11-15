"""Shared checks for the calls Emile's app makes. Used by the pytest and by scripts/smoke_e2e.py."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "contracts" / "frontend_reads.json"


def load_fixture() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def split_path(path: str) -> list[str]:
    """Split on dots, but keep a token such as <self.*> in one piece."""
    parts: list[str] = []
    buf = ""
    depth = 0
    for ch in path:
        if ch == "<":
            depth += 1
        elif ch == ">":
            depth = max(0, depth - 1)
        if ch == "." and depth == 0:
            parts.append(buf)
            buf = ""
        else:
            buf += ch
    if buf:
        parts.append(buf)
    return parts


def missing_fields(body, paths: list[str]) -> list[str]:
    """A path is missing when a named key is absent. Null is present. [] and * walk every item."""
    missing = []
    for path in paths:
        if not _has(body, split_path(path)):
            missing.append(path)
    return missing


def _has(node, parts: list[str]) -> bool:
    if not parts:
        return True
    part, rest = parts[0], parts[1:]
    if part == "[]":
        return isinstance(node, list) and all(_has(item, rest) for item in node)
    if part.endswith("[]"):
        key = part[:-2]
        if not isinstance(node, dict) or key not in node or not isinstance(node[key], list):
            return False
        return all(_has(item, rest) for item in node[key])
    if part in ("*", "<self.*>"):
        if not isinstance(node, dict) or not node:
            return False
        values = [v for k, v in node.items() if part == "*" or str(k).startswith("self.")]
        return bool(values) and all(_has(v, rest) for v in values)
    if not isinstance(node, dict) or part not in node:
        return False
    return _has(node[part], rest)


def object_or_null(body, spec: dict) -> list[str]:
    """assessment: null is fine. An object must carry the named keys."""
    missing = []
    for key, fields in spec.items():
        if key not in body:
            missing.append(key)
            continue
        value = body[key]
        if value is None:
            continue
        if not isinstance(value, dict):
            missing.append(key)
            continue
        for field in fields:
            if field not in value:
                missing.append(f"{key}.{field}")
    return missing


def words_len(body, path: str, n: int) -> list[str]:
    """Every list at `path` has length n. An empty parent list is fine."""
    bad = []

    def walk(node, parts):
        if not parts:
            if not isinstance(node, list) or len(node) != n:
                bad.append(path)
            return
        part, rest = parts[0], parts[1:]
        if part.endswith("[]"):
            key = part[:-2]
            items = node.get(key, []) if isinstance(node, dict) else []
            for item in items:
                walk(item, rest)
            return
        if isinstance(node, dict) and part in node:
            walk(node[part], rest)

    walk(body, split_path(path))
    return bad


def fill(path: str, saved: dict) -> str:
    out = path
    for key, value in saved.items():
        out = out.replace("{" + key + "}", str(value))
    return out


def check_body(call: dict, status: int, payload, text: str, saved: dict) -> list[str]:
    problems = []
    expect = call.get("status", 200)
    if status != expect:
        return [f"status {status}, expected {expect}"]
    if call.get("shape") == "tle":
        lines = [ln for ln in text.splitlines() if ln.strip()]
        if len(lines) != 3 or not lines[1].startswith("1 ") or not lines[2].startswith("2 "):
            problems.append("not a 3-line TLE")
        return problems
    if call.get("shape") == "json":
        if not isinstance(payload, (dict, list)):
            problems.append("not JSON")
        return problems
    if not call.get("live", True):
        return problems
    if payload is None and call.get("fields"):
        problems.append("no JSON body")
        return problems
    problems += missing_fields(payload, call.get("fields") or [])
    problems += object_or_null(payload if isinstance(payload, dict) else {}, call.get("object_or_null") or {})
    for path, n in (call.get("words_len") or {}).items():
        problems += words_len(payload, path, int(n))
    secret = saved.get(call.get("absent"))
    if secret and secret in text:
        problems.append("response contains private note text")
    return problems


def remember(call: dict, payload, saved: dict) -> None:
    for name, field in (call.get("save") or {}).items():
        if isinstance(payload, dict) and field in payload:
            saved[name] = payload[field]
    if call.get("remember_text"):
        saved[call["remember_text"]] = (call.get("body") or {}).get("text", "")
