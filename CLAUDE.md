# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

CostVision — an AI-assisted **should-cost** platform. Given an engineering input
(a 3D CAD model, a PCB photo, a plain description, or an RFQ), it produces a
defensible per-part cost broken into 8 buckets, priced across ~20 manufacturing
regions, plus negotiation, agentic-learning, and CAD/PCB feature analysis.

The application lives entirely under **`calculator/`**. The repo root holds the
Docker launch wrappers and a set of one-off deliverable generators
(`build_*.py` / `build_*.js` produce the .pptx/.xlsx decks and reports — they
are standalone scripts, not part of the app).

## Commands (run inside `calculator/`)

```bash
npm run dev:full        # Vite UI (:5174) + Express/tsx API (:3002) together — normal dev loop
npm run dev             # UI only     npm run server   # API only (tsx server/index.ts)
npm test                # vitest run — full suite (~930 tests)
npm test -- <substr>    # single file/suite, e.g. npm test -- cad-machining-guard
npm run test:watch      # vitest watch
npm run typecheck       # tsc --noEmit  (CI uses: tsc -p tsconfig.build.json --noEmit)
npm run build           # tsc -p tsconfig.build.json && vite build  → writes calculator/dist
npm run accuracy        # scripts/accuracy-report.ts — grade estimate-vs-actual (MAPE/bias)
npm run test:e2e        # e2e/smoke.ts — headless browser boot + drive (needs a build first)
```

From the repo root, `make start|stop|restart|logs` drives the single Docker
container (see README). CI (`.github/workflows/ci.yml`) runs typecheck → `npm test`
→ `npm run build` → headless smoke-launch, all in `calculator/`.

`calculator/dist/` **is committed** (git-tracked) despite being in `.gitignore` for
fresh clones — after any UI/engine change that ships, rebuild and
`git add -f calculator/dist` so the deployed bundle matches source. `.env` (holds
`ANTHROPIC_API_KEY` + JWT secret) is created on first run and never committed.

## Architecture — the big picture

**The golden rule: AI never sets a price.** The LLM only *reads/classifies* the
input (material family, process route, feature interpretation) and every AI
number is bounded by a deterministic sanity layer. All money is deterministic
arithmetic in `src/engine/` — this is what makes outputs defensible and
reproducible, and it is the invariant to preserve in any change.

### Deterministic cost engine — `src/engine/`
- `core.ts::computeUniversalStack(drivers, rateLibrary)` is the heart: it turns
  commodity "drivers" into the **8-bucket `Breakdown8Bucket`** (material,
  process, labour, tooling, packaging, logistics, overhead, margin). Overhead is
  a % of the factory base; margin is a % of the subtotal — applied once.
- `modules/*.ts` — one module per commodity (casting, machining, forging,
  sheet-metal, moulding family, extrusion, rubber, composites, wiring-harness,
  PCB fab/PCBA, painting, BIW, cast-and-machine). Each `compute<X>Drivers(inputs)`
  returns `CommodityDrivers`; the matching `*-advisor.ts` produces DFM guidance.
  Common bug classes here: sec/hr and mm/cm/kg conversions, and `partsPerCycle`
  must divide BOTH machine and labour time.
- `rate-library.ts` (`DEFAULT_RATE_LIBRARY`) + `regional-rates.ts`
  (`REGIONAL_DATA`, `computeRegionalComparison`, `buildRegionalLibrary`) hold the
  real 2026-Q2 rates. Two regionalisation paths exist and must stay consistent:
  `computeRegionalComparison` linearly rescales a UK breakdown for the country
  table; `buildRegionalLibrary` rebuilds the whole library. `feature-machining.ts`
  / `feature-costing.ts` add per-feature secondary machining.
- Intelligence layers (headline stays deterministic): `uncertainty.ts`
  (Monte-Carlo band), `calibration.ts` (learn-from-actuals + conformal band),
  `quote-teardown*.ts` (negotiation), `causal-model.ts`, `scenario.ts`,
  `sensitivity.ts`, `part-similarity.ts` + `drift-monitor.ts` (agentic), `carbon.ts`.
  `index.ts` is the public engine barrel.

### CAD-to-Cost pipeline (the demo-critical path)
Upload → **`server/utils/cad-geometry-engine.py`** (Python + OCCT/CadQuery)
measures STEP/IGES geometry (volume, bbox, B-rep faces, hole/boss/pocket feature
table, bottom-up CNC cycle estimate). STL files take the pure-TS fast path in
`server/services/stl-parser.ts`. `server/utils/geometry-bridge.ts` spawns the
Python process (semaphore-capped). `server/routes/cad.ts` builds the
commodity-specialist AI prompt from the measured geometry, then
`normalizeCADAnalysis` + `cad-sanity.ts` (cross-checks AI numbers vs measured
volume/weight) + `cad-machining-guard.ts` (caps near-net cast/forged machining
time to a finish envelope) run before the cost. **Geometry is the ground truth;
the AI only interprets — treat any AI number that contradicts the measured
geometry as a bug.**

⚠️ **Deployment gap:** the root `Dockerfile` (Alpine) installs `python3` but NOT
cadquery/OCP (musl-incompatible), so the STEP/IGES path does not work inside the
shipped container — only the STL fast path. Run/test the STEP path from a
glibc env with `pip install cadquery`.

### PCB Image→BOM — `server/routes/pcb.ts` (+ `server/utils/pcb-*.ts`, `server/data/pcb-country-rates.ts`)
Vision pipeline: photo → BOM + fab spec → should-cost. Read ALL model text blocks
(a leading thinking block once caused empty BOMs); board spec is stabilised
(`pcb-boardspec-stabilise.ts`) and BOM prices grounded/capped
(`pcb-bom-grounding.ts`, `pcb-price-catalogue.ts`).

### Frontend & server shell
- `src/ui/main.ts` is a ~17.8k-line monolith holding the whole SPA (forms per
  commodity, results, CAD viewer wiring, exports). Cost inputs are collected by
  `collect<Commodity>Input()` functions that read DOM fields and call the engine;
  the engine is the single source of truth — the UI must not re-implement cost
  math (drift bugs). Exports (`src/export/*.ts`) reuse engine results, never recompute.
- `server/` — Express + `better-sqlite3`; routes in `server/routes/*.ts`, JWT auth.
  **Every LLM call MUST go through `server/utils/ai-client.ts::createAnthropic()`**
  — never `new Anthropic()`. It enforces `AIR_GAPPED=1` (throws, deterministic core
  still works) and `ANTHROPIC_BASE_URL` private routing.

## Working notes
- Default dev branch is `claude/new-session-ts4byp`.
- Before shipping a cost-logic change, prove it: unit test + `npm run accuracy`
  or a hand-calc reproduction. `tests/reference-part.test.ts` pins a hand-computed
  £23.27 machined bracket to <0.01% — keep engine changes reconciling to it.
- Live commodity prices in `server/routes/commodities.ts` are a **seeded random
  walk** (labelled "indicative"), not a real feed; the live-metal `price-fetcher.ts`
  writes a display-only override table read by no costing path.
