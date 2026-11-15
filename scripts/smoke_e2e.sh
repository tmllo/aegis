#!/usr/bin/env bash
# Start the API on a free port and check every frontend read. See scripts/smoke_e2e.py.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
exec python scripts/smoke_e2e.py "$@"
