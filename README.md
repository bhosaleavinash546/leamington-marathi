# BrainSpark — AI Cost-Reduction & Should-Cost Platform

AI-powered cost engineering for automotive: idea generation with OEM benchmarks, a
deterministic should-cost engine, CAD/PCB/BOM cost analysis, and a 1,600-idea
marketplace — built on one principle:

> **Math for numbers, LLM for judgment.**
> Every cost figure is computed by a deterministic engine (rate × time + mass ×
> price). The AI proposes, explains and explores — it never invents a number.

## Architecture

```
React 18 + Vite + TS (code-split, PWA, Capacitor mobile)
        │  /api/*
Express (server.mjs + routes/*) ── better-sqlite3 (data/brainspark.db)
        │
        ├─ costing-engine.mjs     deterministic should-cost: single-op + multi-op
        │                         routing (cast→machine→heat-treat→coat), Monte-
        │                         Carlo P10-P90, volume curves, tolerance/tonnage
        │                         drivers — pure, dependency-free, benchmarked
        ├─ pcb-cost.mjs           parametric PCBA cost model (26 component classes)
        ├─ calibration.mjs        learned per-user calibration from real quotes
        │                         (robust log-space fit, LOO-validated, clamped)
        ├─ material-commodity.mjs live commodity prices → engine material €/kg
        ├─ carbon.mjs             CO2e/part + indicative CBAM € (same drivers)
        ├─ cost-tools.mjs         engine-as-LLM-tools + bounded tool loop
        ├─ idea-index.mjs         BM25 retrieval over the idea corpus
        ├─ dfm-rules.mjs          DFM rule evaluator over a catalogue held as
        │  + dfm-rule-catalogue    DATA (26 rules, 4 process families, each with
        │  + dfm-cost-impact       its threshold, unit and cited source); findings
        │                          re-costed through the engines above, or marked
        │                          "not priced" WITH the reason
        ├─ dfa-engine.mjs         assembly DFA: instance grouping, handling and
        │  + dfa-time-model        insertion times from our own MTM-structured,
        │                          calibratable model (NOT Boothroyd's tables)
        ├─ cad-engine/*.py        OpenCascade: tessellation draft/undercut/wall
        │                         measurement, AAG feature recognition, assembly
        │                         decomposition with MEASURED alpha/beta symmetry
        └─ workers/cad-worker.mjs STEP parsing off the event loop
```

## Getting started

```bash
npm install
npm run dev            # Vite frontend :5173 + proxy to API :3001
node server.mjs        # API server (JWT_SECRET required in production)
```

Environment variables:

| Var | Purpose |
|---|---|
| `JWT_SECRET` | **required in production** — token signing |
| `CREDENTIALS_SECRET` | encrypts stored user API keys (falls back to JWT_SECRET) |
| `ANTHROPIC_API_KEY` | optional server-wide LLM key (users can store their own) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | seed the admin account |
| `ADMIN_EMAILS` | comma-separated admin allowlist |
| `EMAIL_USER` / `EMAIL_PASS` / `SMTP_HOST` | OTP email (console fallback in dev) |
| `BRAVE_API_KEY` | live commodity-price refresh + idea web search |

## Tests & accuracy benchmark

```bash
npm test                          # 139 unit/integration tests (node --test)
node benchmark/cost-run.mjs       # should-cost accuracy vs reference prices
node benchmark/run.mjs            # CAD process-inference benchmark
node benchmark/dfm-run.mjs --min 1.0   # DFM geometry gate — 86 checks, 100% required
```

The DFM fixtures are **analytic**: a truncated pyramid built with a 3.000 deg
taper must measure 3.000 deg, a shell built with a 2.50 mm wall must measure
2.50 mm, a rib built 5.0 x 24 mm must measure 5.0 x 24. None of the truth is
copied back from engine output, which is the only thing that makes it a gate
rather than a change detector. It skips cleanly (exit 0) where `cadquery-ocp`
is unavailable, and says it skipped rather than reporting a pass.

Accuracy is a **measured number**, not a claim: the cost benchmark scores the
production engine against 16 reference parts (castings, forgings, machining,
moulding, PCB-adjacent, multi-op machined castings). Current: **hit-rate 100%,
MAPE 8.3%, P10–P90 band coverage 87.5%.** CI fails if it regresses.

## Key concepts

- **Deterministic engine** — `computeShouldCost` (single op) and
  `computeRouteCost` (multi-op routing with rolled-throughput yield). Family
  guards refuse physically impossible material/process pairs.
- **Live pricing** — material €/kg is indexed to the commodity feed with a
  disclosed basis date; cast irons ride a flagged proxy; unmapped grades stay
  on the static baseline and say so.
- **Calibration** — teach the engine a real supplier quote and every estimate
  refits to your price reality (index-rebased so old quotes don't bias).
- **Engine-verified AI** — chat and cost-down call the engine via tool-use;
  marketplace ideas carry `engineCheck` where the move is engine-expressible.
- **DFM / DFA from geometry** — upload a STEP file and an OpenCascade kernel
  measures it: draft and wall thickness on the tessellation (so freeform
  castings are analysed, not skipped), holes/counterbores/pockets/slots/ribs/
  bends from the topology. No LLM is on the path that produces any of it.
- **Three-state rules** — a DFM rule passes, fails, or is **NOT EVALUATED** with
  the reason its measurement was unavailable. Coverage is printed beside every
  score and the score is `null`, not 100, when nothing could be checked. The
  DFA design-efficiency index is withheld until a human answers the three
  minimum-part questions, which are about intent and not derivable from a solid.
- **Honest provenance** — every number is labelled: engine-computed vs
  un-grounded estimate, live vs static price, verified vs unverified benchmark.

## Docs

- [docs/api.md](docs/api.md) — API surface
- [SECURITY.md](SECURITY.md) — security posture & reporting
