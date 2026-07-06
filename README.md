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
```

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
- **Honest provenance** — every number is labelled: engine-computed vs
  un-grounded estimate, live vs static price, verified vs unverified benchmark.

## Docs

- [docs/api.md](docs/api.md) — API surface
- [SECURITY.md](SECURITY.md) — security posture & reporting
