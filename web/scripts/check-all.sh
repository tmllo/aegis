#!/usr/bin/env bash
# Web guardrails for AEGIS. Run before every commit and push:
#   bash web/scripts/check-all.sh          (full, includes the offline build)
#   bash web/scripts/check-all.sh --quick  (skips the build)
# Rules behind each check: docs/ARCHITECTURE.md
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
step() { printf '\n== %s\n' "$1"; }
bad() { echo "FAIL: $1"; fail=1; }

step "Typecheck"
npm run -s typecheck || bad "typecheck"

step "Unit tests (scoring golden test, alarm safety rule)"
npx vitest run --reporter=dot || bad "unit tests"

step "Network calls only in src/data"
if grep -rnE "fetch\(|axios|XMLHttpRequest|new WebSocket|EventSource\(" src/station src/core; then
  bad "network call outside src/data (move it into src/data)"
else echo ok; fi

step "src/core stays pure (no React, no store, no screens)"
if grep -rnE "from ['\"](react|react-dom|zustand|framer-motion|@react-three)" src/core \
  || grep -rnE "from ['\"]\.\./(station|console|features|components|data/(store|load|http))" src/core; then
  bad "src/core imports UI or I/O code"
else echo ok; fi

step "public/data is read-only"
if [ -n "$(git status --porcelain -- public/data)" ]; then
  git status --porcelain -- public/data
  bad "public/data changed (only Tomas's export writes it)"
else echo ok; fi

step "Emergency only from a measured event (use alarmClass from src/core/alarm)"
if grep -rnE "cw: *['\"]emergency['\"]" src/station; then
  bad "screens write 'emergency' themselves; take the class from alarmClass()"
else echo ok; fi

if [ "${1:-}" != "--quick" ]; then
  step "Offline build"
  npm run -s build >/tmp/aegis-build.log 2>&1 && echo ok || { tail -20 /tmp/aegis-build.log; bad "build"; }
fi

echo
if [ "$fail" -ne 0 ]; then echo "check-all: FAILED"; exit 1; fi
echo "check-all: all green"
