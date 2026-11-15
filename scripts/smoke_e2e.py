"""End-to-end smoke against a real uvicorn process. Stdlib only.

Copies the store to a temp file (AEGIS_DB) so server/data/aegis.db is never written.
Prints one row per call. Exits 1 on any failure. Always stops the server.

    python scripts/smoke_e2e.py
    python scripts/smoke_e2e.py --lanes
    python scripts/smoke_e2e.py --web DIST --lanes
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.frontend_contract import check_body, fill, load_fixture, missing_fields, remember  # noqa: E402

LANES = [
    ("GET", "/api/eva/sites", None, ["sites[].gravity_g", "quality"]),
    ("GET", "/api/eva/sim?subject=c1&site=mars&profile=traverse&minutes=10&step_s=5&storm=1", None,
     ["quality", "frames[].t_s", "frames[].bio.hr_bpm", "frames[].metrics.<eva.hr>"]),
    ("GET", "/api/eva/sim?subject=c1&site=mars&profile=traverse&minutes=60&step_s=5&storm=0", None,
     ["frames[].metrics.<eva.hr>", "frames[].metrics.<eva.ppco2>", "frames[].metrics.<eva.o2>", "frames[].metrics.<eva.dose_rate>"]),
    ("POST", "/api/eva/assess", {"subject": "c1", "site": "mars"}, ["status", "alerts", "quality"]),
    ("GET", "/api/radiation/organs?subject=c1&env=moon&scenario=storm&event=oct1989&shield=hull", None,
     ["quality", "organs[].id", "organs[].dose_mSv", "organs[].target"]),
    ("GET", "/api/radiation/organs/compare?subject=c1&event=oct1989", None, ["quality", "organs[].id"]),
    ("GET", "/api/radiation/path?scenario=spe&event=aug1972&shield=hull", None,
     ["quality", "stages[].id", "stages[].rel_flux"]),
    ("GET", "/api/forecast/explain", None, ["quality", "headline.n_storms", "headline.caught", "headline.median_lead_time_h"]),
]
WEB_PAGES = ("/", "/environment", "/systems", "/mind", "/checkup", "/?demo=1")
WEB_FILES = ("/models/body.glb", "/samples/cabin_catalog.json")


def _port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _request(base: str, method: str, path: str, body, headers, timeout: float):
    data = None
    hdrs = {"Accept": "application/json"}
    if headers:
        hdrs.update(headers)
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        hdrs["Content-Type"] = "application/json"
    req = urllib.request.Request(base + path, data=data, headers=hdrs, method=method)
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read()
            status = res.status
            ctype = res.headers.get("content-type", "")
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        status = exc.code
        ctype = exc.headers.get("content-type", "")
    ms = (time.perf_counter() - started) * 1000
    text = raw.decode("utf-8", "replace")
    payload = json.loads(text) if "json" in ctype and text else None
    return status, payload, text, ms, ctype


def _row(ok: bool, ms: float, label: str, detail: str = "") -> str:
    mark = "✓" if ok else "✗"
    extra = f"  {detail}" if detail else ""
    return f"{mark}  {ms:7.0f} ms  {label}{extra}"


def _copy_db() -> str:
    src = os.environ.get("AEGIS_DB") or str(ROOT / "server" / "data" / "aegis.db")
    dst = os.path.join(tempfile.mkdtemp(prefix="aegis-smoke-"), "aegis.db")
    if src != ":memory:" and os.path.isfile(src):
        shutil.copy2(src, dst)
    return dst


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--web", metavar="DIST", help="also check deep links against this build")
    parser.add_argument("--lanes", action="store_true", help="also check EVA and organ endpoints when mounted")
    args = parser.parse_args()

    env = os.environ.copy()
    env["AEGIS_DB"] = _copy_db()
    env["AEGIS_REFRESH"] = "0"
    env["PYTHONIOENCODING"] = "utf-8"
    if args.web:
        env["AEGIS_WEB_DIST"] = args.web
    port = _port()
    base = f"http://127.0.0.1:{port}"
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "server.api.app:app", "--host", "127.0.0.1", "--port", str(port)],
        cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    )
    log: list[bytes] = []

    def drain() -> None:
        assert proc.stdout is not None
        for line in proc.stdout:
            log.append(line)

    threading.Thread(target=drain, daemon=True).start()
    failed = False
    try:
        deadline = time.time() + 90
        while time.time() < deadline:
            if proc.poll() is not None:
                break
            try:
                status, _, _, _, _ = _request(base, "GET", "/api/health", None, None, 5)
                if status == 200:
                    break
            except (urllib.error.URLError, TimeoutError, ConnectionError):
                time.sleep(0.4)
        else:
            print("server did not answer /api/health")
            sys.stdout.buffer.write(b"".join(log[-40:]))
            return 1
        if proc.poll() is not None:
            print("server exited before /api/health")
            sys.stdout.buffer.write(b"".join(log[-40:]))
            return 1

        saved: dict = {}
        for call in load_fixture()["calls"]:
            if not call.get("live", True):
                continue
            path = fill(call["path"], saved)
            status, payload, text, ms, _ctype = _request(
                base, call["method"], path, call.get("body"), call.get("headers"), 60)
            problems = check_body(call, status, payload, text, saved)
            label = f"{call['method']} {path}"
            print(_row(not problems, ms, label, ", ".join(problems)))
            if problems:
                failed = True
            else:
                remember(call, payload, saved)

        if args.web:
            index = Path(args.web) / "index.html"
            shell = index.read_text(encoding="utf-8") if index.is_file() else ""
            for path in WEB_PAGES:
                status, _payload, text, ms, ctype = _request(base, "GET", path, None, None, 20)
                problems = []
                if status != 200:
                    problems.append(f"status {status}")
                elif "html" not in ctype:
                    problems.append(ctype or "not html")
                elif shell and shell not in text and text.strip() != shell.strip():
                    problems.append("not index.html")
                print(_row(not problems, ms, f"GET {path}", ", ".join(problems)))
                failed = failed or bool(problems)
            for path in WEB_FILES:
                status, _payload, _text, ms, _ctype = _request(base, "GET", path, None, None, 20)
                problems = [] if status == 200 else [f"status {status}"]
                print(_row(not problems, ms, f"GET {path}", ", ".join(problems)))
                failed = failed or bool(problems)

        if args.lanes:
            for method, path, body, fields in LANES:
                status, payload, _text, ms, _ctype = _request(base, method, path, body, None, 30)
                if status == 404:
                    print(f"–  {ms:7.0f} ms  {method} {path}  not built yet")
                    continue
                problems = [] if status == 200 else [f"status {status}"]
                if status == 200:
                    problems += missing_fields(payload, fields)
                if status == 200 and "minutes=60" in path and ms >= 1000:
                    problems.append("slower than 1 s")
                print(_row(not problems, ms, f"{method} {path}", ", ".join(problems)))
                failed = failed or bool(problems)
    finally:
        proc.kill()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            pass
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
