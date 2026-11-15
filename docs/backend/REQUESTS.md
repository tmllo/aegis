# Requests for changes to shared files (see docs/backend/AGENT-RULES.md section 2)

| When | Lane | File | What and why |
|---|---|---|---|
| 2026-11-15 | mind | `server/catalog/metrics.yaml` | Add `scale: {min: 1, max: 5, words: [Very low, Low, Okay, Good, Great]}` to `self.mood`, so `GET /api/catalog?kind=self_report` carries words for all five check-in scores. Until then the words live in `server/catalog/routines.yaml` `checkin.scales` and `GET /api/checkin` serves them. When done, delete that fallback entry. |
