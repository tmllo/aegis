# Prompt: build the AEGIS AI health advisor

Paste everything below into a new chat with a coding agent. Attach `aegis-starter-kit.zip` (or the repo) and `aegis-body3d-kit.zip`.

---

You're building the **AI health advisor** for AEGIS, our NASA Space Apps 2026 entry (challenge: "Create Health Monitoring Software for Astronauts on Space Missions"). **Submission closes Sunday 15 Nov 23:59 local**, so every decision below favours something that works reliably in a live demo over something clever.

## Context: read these first
- `PROJECT_CONTEXT.md`: the product, the demo moment and the ground rules (synthetic crew data, not medical advice, honest metrics).
- `contracts/DATA_CONTRACT.md`: the shape of `crew_data.json`, which holds per-astronaut daily series, personal baselines (mean/sd), flags and per-region status.
- `docs/body3d/src/body/derive.ts`: turns metrics into `Finding[]` (region, status green/amber/red, title, numbers, what's happening inside, action). Your input is built on top of this.
- The app is a static Vite + React + TypeScript build that **must run offline** at the venue. Venue Wi-Fi will fail.

## What to build
An advisor that looks at one astronaut's current metrics and answers three questions in plain language:
1. **What's going on?** Which readings are off and how far from *their own* normal.
2. **Why might it be happening?** Likely contributors given spaceflight context: fluid shift, sleep disruption, radiation, deconditioning, isolation, diet.
3. **What should I do?** Precautions now, what to monitor, and when to call the flight surgeon.

It shows up in two places in the UI: an advice card in the body screen's side panel (one per active finding, plus an overall summary), and an "Ask AEGIS" box for follow-up questions ("Can I still do my EVA tomorrow?").

## Architecture: rules decide, the LLM explains
Don't let a language model decide severity. Use a two-layer design and say so in the pitch; judges will ask.

1. **Deterministic triage (exists already, extend it):** personal-baseline z-scores, absolute red limits, trends (3-day direction), and combinations, e.g. high HR + fever, or low BP + high HR + chest region issue → escalate. This produces `severity` and `escalate` and is the only thing allowed to set them. Put it in `advisor/rules.ts`, as pure functions with unit tests.
2. **Language layer (LLM):** receives the rule output plus a small curated knowledge pack and writes the explanation, likely contributors and precautions. It may **never** lower a severity or remove an escalation. If its output fails validation or times out, fall back to a template built from the rules and the `actions` text already in `crew_data.json`.

## Local or cloud? Decide like this
- **Default: local, through Ollama.** It's the better story ("works with no link to Earth": Mars comms delay is up to about 20 minutes each way, plus blackouts), it's private, and it's free. Check what the demo laptop can run. Pick the best current small open-weight instruct model in the Ollama library that fits in RAM with headroom (typically a 3–8B model, 4-bit quantised) and generates at least about 15 tokens/s on that machine. Measure it; don't assume. Use Ollama's structured output (`format` with a JSON schema) so replies are valid JSON.
- **Optional: cloud fallback** behind a single flag (`ADVISOR_PROVIDER=ollama|api`), only if local quality is clearly weak. Never make the demo depend on the network.
- **Demo insurance:** pre-generate advice for every demo scenario (live crew ×3, plus hypertension, blocked coronary artery, solar storm, bone & muscle loss, sleep deprivation, fever, high blood sugar) into `public/data/advice_cache.json`. If Ollama isn't running, the app reads the cache. Label cached answers honestly as "generated earlier by the on-board model".

Browser → Ollama: call `http://localhost:11434/api/chat` and set `OLLAMA_ORIGINS` so the browser is allowed in, or add a 20-line Vite dev proxy. Document both in the README.

## Contract: write it to `contracts/advisor.md` before coding
Input (`AdvisorInput`):
```ts
{ astronaut: { id, name, role, age }, environment: "iss"|"moon"|"transit"|"mars", mission_day: number,
  findings: Finding[],                     // from derive.ts / rules.ts, severity already decided
  latest: Record<MetricKey, number|null>, baseline: Record<MetricKey, {mean, sd}>,
  trend_7d: Record<MetricKey, (number|null)[]>, question?: string }
```
Output (`AdvisorOutput`), validated with zod:
```ts
{ summary: string,                          // 1–2 sentences, plain language
  severity: "green"|"amber"|"red",          // COPIED from rules, never generated
  escalate: boolean, escalate_reason: string|null,   // COPIED from rules
  items: [{ finding_id, what_is_happening, likely_contributors: string[], do_now: string[], precautions: string[],
            monitor: { metric, when, threshold }[], call_flight_surgeon_if: string }],
  answer?: string,                          // only when a question was asked
  sources: string[],                        // which knowledge-pack entries were used
  generated_by: "rules"|"local-llm"|"cache"|"api" }
```

## Knowledge pack: no RAG infrastructure, just files
Put `advisor/knowledge/*.md` in the repo: one short file per metric and per hazard (radiation, isolation/confinement, distance from Earth, altered gravity, closed environment), written from NASA HRP "5 Hazards", "Risks of Human Spaceflight" and the CSA radiation page, plus each metric's `explain`/`actions` from `crew_data.json`. Inject only the files relevant to the active findings. Keep each under about 250 words so the prompt fits a small model's context.

## Guardrails: enforce them in code as well as in the system prompt
- No diagnoses stated as fact ("possible contributors", not "you have X"). No medication names or doses. Nothing that contradicts the rule severity.
- Any red finding: the output must tell them to contact the flight surgeon and must keep `escalate: true`.
- Post-check every output: regex/blocklist for dosing patterns and drug names, check severity/escalate match the rules, check length limits. If any check fails, use the template fallback.
- Every screen shows "Not medical advice. Synthetic crew data."

## Evaluation: run it, show the numbers
Use `advisor/eval/cases.json` with at least the 11 scenarios above plus 4 edge cases (all metrics missing, conflicting signals, all normal, a question unrelated to health). For each case report: valid JSON (y/n), severity and escalation match the rules (must be 100%), guardrail violations (must be 0), median latency on the demo laptop, and a 1–5 helpfulness score that I fill in. Put the table in `advisor/eval/RESULTS.md`; it goes on a slide.

## Build order (timebox about 3 hours, stop and tell me if you're slipping)
1. `contracts/advisor.md` and the zod schema.
2. `rules.ts` with tests, plus the template fallback. This alone is already a demoable advisor.
3. Knowledge pack.
4. Ollama provider, structured output and the post-check. Measure speed and pick the model.
5. Advice cache generator script and cache-first loading.
6. UI: advice cards in the body side panel and the "Ask AEGIS" box (match the existing dark mission-control style: green/amber/red always with an icon and label).
7. Eval table and README (setup, model choice with measured tokens/s, how to run offline).

## Ask me before you decide
- Which model to ship, once you've measured 2–3 candidates on the actual laptop.
- Any change to `crew_data.json` or `derive.ts` shapes (log it in `contracts/CHANGELOG.md`).
- Escalation combinations beyond the obvious ones (I want to sign off on what triggers "call the flight surgeon").

Pitch line it has to support: *"Rules decide when it's serious; an on-board model explains why and what to do, with no link to Earth needed."*
