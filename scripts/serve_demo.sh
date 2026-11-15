#!/usr/bin/env bash
# One origin for the demo: crew-station's build, this repo's API.
# Never writes into this repo's web/. Run from anywhere; the server starts at the repo root.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
git fetch origin crew-station
WT="/tmp/aegis-web"
if git worktree list --porcelain | grep -qx "worktree ${WT}"; then
  git -C "$WT" fetch origin crew-station
  git -C "$WT" checkout --force origin/crew-station
else
  git worktree add -f "$WT" origin/crew-station
fi
cd "$WT/web"
npm ci
npm run build
cd "$ROOT"
export AEGIS_WEB_DIST="$WT/web/dist"
echo "open http://127.0.0.1:8000/"
exec uvicorn server.api.app:app --port 8000
