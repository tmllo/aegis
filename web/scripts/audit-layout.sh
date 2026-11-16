#!/usr/bin/env bash
# Layout audit with the stageshow skill's checker (github.com/benjitaylor/skills, copied in scripts/stageshow).
# Checks every page at iPhone and desktop widths for cut-off controls, boxes too small for their content and
# uneven insets. Usage: bash scripts/audit-layout.sh [base-url]   (default http://127.0.0.1:5660)
BASE="${1:-http://127.0.0.1:5660}"
cd "$(dirname "$0")/.."
fail=0
for w in 375 390 430 1440; do
  for r in "" check mind "mind?v=xai" care radiation cabin surgeon built; do
    out=$(node scripts/stageshow/layout.mjs "$BASE/$r" --width $w --delay 2500 2>&1 | grep -E "^layout:")
    if echo "$out" | grep -q "no-issues-detected"; then echo "ok    $w /$r"; else echo "CHECK $w /$r"; echo "$out" | grep -v "not visual approval" | sed 's/^/      /'; fail=1; fi
  done
done
exit $fail
