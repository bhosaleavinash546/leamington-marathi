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
npm test                # vitest run — full suite (~2,430 tests)
npm test -- <substr>    # single file/suite, e.g. npm test -- cad-machining-guard
npm run test:watch      # vitest watch
npm run typecheck       # tsc --noEmit  (CI uses: tsc -p tsconfig.build.json --noEmit)
npm run build           # tsc -p tsconfig.build.json && vite build  → writes calculator/dist
npm run accuracy        # scripts/accuracy-report.ts — grade estimate-vs-actual (MAPE/bias)
npm run test:e2e        # e2e/smoke.ts — headless browser boot + drive (needs a build first)
npm run test:e2e:full   # e2e/full.ts — real server, every commodity, exports, STL upload, axe WCAG 2.1 AA
npm run test:e2e:pcb    # e2e/pcb-live.ts — photo→cost in a browser against e2e/pcb-stand-in.mjs (a fixed model reply)
npm run test:e2e:sheet  # e2e/sheet-metal-live.ts — the seat bracket STEP through a real server + browser (needs OCP); writes live-<label>.json
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
- Sheet metal from CAD (`cost-input-rules/commodities/sheet-metal.ts` + `derive/blank.ts`):
  the FASTBLANK DXF is the blank when supplied (`dxf-blank.ts`); otherwise the gauge is
  the radius step between a bend's inner and outer face (`thicknessSource: 'bend-pairs'`,
  kernel `_gauge_from_bend_pairs`), net blank = V/t, cut length = (S − 2V/t)/t — exact on
  a bent part, and trusted only on a bend-measured gauge because with t = 2·V/S it is
  zero by construction. `sheetMetal.perimeterMm` (DXF → identity → 2(L+W)) sizes the
  press. With no DXF the tool unfolds the part itself: the kernel exports the two skins
  (`--skin-mesh`, pure OCP), `server/utils/blank-unfold.ts` flattens them (Tutte → ARAP,
  envelope Cholesky, no numpy) into the outline, holes, minimum rectangle and a DXF
  (`/api/cad/blank/:hash/blank.dxf`), via `services/blank-development.ts` — the one
  entry point the route and the real-parts baseline share. Exact on a bent part; a
  stretch-formed or drawn skin is flagged by its strain (`developable: false`) and the
  rules lower the blank's confidence. The blank carries its `outline`, which
  `src/engine/nesting.ts` nests on the coil (`stripLayout` in the rules: 1-up pitch and
  strip width applied, a 2-up interlock stated as a die trade-off), and with a developed
  blank the cost parameters pass the material density so the module buys the strip cell
  × gauge × density rather than a rectangle ratio. A skin the unfold finds non-developable
  goes through `server/utils/forming-inverse.ts` (one-step inverse: plastic work of a
  rigid-plastic power-law material minimised by L-BFGS from the unfold's flat) and the
  blank carries `forming` (thinning map, worst strain pairs); `src/engine/
  forming-properties.ts` holds n/r/K per sheet grade as labelled typical values plus the
  Keeler–Brazier check the rules print on the blank's basis. `pressProcess` in the rules
  reads the BIW process off the blank — bent / stretch-formed / drawn → coil-fed die,
  or blanked first (press or laser) then a transfer press or a tandem line (`pressLine`,
  `pressesInLine`, `blanking`, `drawAddendumMm` on `SheetMetalInputs`; the addendum grows
  the outline before nesting). See `docs/sheet-metal/`.
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
time to a finish envelope) run before the cost. **Process and material
identification**: `server/utils/cad-metadata.ts` reads what the file says about
itself (STEP product names, header path, authoring system, declared material) and
`analyzeGeometry` attaches it as `geo.cadMetadata`; `derive/part-evidence.ts` turns
names and the face mix (free-form + toroidal share: ≥15% net-shape, ~0% machined) into
a stated, pre-selected leaning on the process question and a material when the file
declares or names one. With a key, Stage 1 is `server/utils/cad-identify.ts`: one
vision call (Sonnet 5.5; Opus 5.5 under Deep analysis; structured output) over the
photo, drawing, CAD renders, measured geometry and names — renders are shape only,
never material; an unsourced material is forced to "unknown"; the geometry guard
still overrules its process and its material stays a blocking confirm. The specialist
runs on Sonnet 5.5 / Opus 5.5. Measure with `npx tsx scripts/process-material-eval.ts
[--ai]`; see `docs/cad/process-material-identification-2026-10.md`. **Geometry is the ground truth;
the AI only interprets — treat any AI number that contradicts the measured
geometry as a bug.**

**Two images, and the STEP path works in the shipped one.** `calculator/Dockerfile.cad`
(`node:22-bookworm-slim` + `cadquery==2.8.0` in a venv prepended to `PATH`, so the bare
`python3` that `geometry-bridge.ts` spawns is the one with OCP) is what
`docker-compose.yml` and `calculator/fly.toml` build — ~1.5 GB, 2 GB VM.
`calculator/Dockerfile` is Alpine and **cannot** run cadquery/OCP (the OpenCASCADE wheels
are manylinux/glibc, not musl); it survives as an opt-in STL-only variant selected by
`docker compose -f docker-compose.yml -f docker-compose.stl-only.yml`.
`.github/workflows/docker-cad.yml` builds the CAD image in CI and measures a committed
STEP fixture inside it, so a broken OCP packaging fails CI rather than the next deploy.
Note `make start` runs natively via Node when npm is present and only falls back to
Docker — a local STEP run needs cadquery on your own `python3` (`make dev` warns you).

### PCB Image→BOM — `server/routes/pcb.ts` (+ `server/utils/pcb-*.ts`, `server/data/pcb-country-rates.ts`)
Vision pipeline: photo → BOM + fab spec → should-cost. **Ground truth first, the
photo second**: a supplied BOM file IS the BOM (`pcb-bom-truth.ts` — identity and
quantity from the file, the photo only fills a package or estimates a price for the
same ref-des), and drill/Gerber `fabFiles` are measured for size, layer count and via
count (`pcb-fab-data.ts`, no AI) and override the guess (`dimensionsSource` /
`layersSource` / `viasSource: 'measured'` switch off the stabiliser's clamps).
**The model never sets a price**: its `unitPriceGBP` is an estimate that only picks a
point inside the line's class range (`pcb-class-pricing.ts` — the price table as data;
precedence catalogue → OCR-named part range → function range → class range, each
line carrying `priceSource` / `priceBasis` / `priceNote`, `pcb-bom-grounding.ts`).
Chip markings OCR read are attached to the BOM line of the same function
(`pcb-ocr-reconcile.ts`). The offline catalogue is **data**:
`server/data/pcb-component-catalogue.json` (458 parts, 1k/10k/100k GBP breaks, a
source and date on every entry — 77 read from distributor pages on 2026-10-01, the
rest labelled engineering estimates; see `docs/pcb/component-catalogue.md`), loaded
by `pcb-price-catalogue.ts` (`catalogueEntry` / `cataloguePriceAt`, aliases for chip
top marks) and refreshed with `scripts/pcb-catalogue-import.ts` from a distributor
CSV export or Nexar — never by editing prices in TypeScript. Models: Haiku 4.5 classifies, **Sonnet 5.5** reads chips
and writes the parts list, **Opus 5.5** under "Deep analysis" — none takes
`temperature` (only the Haiku calls send it). Stage 3 is streamed (32K output) with
structured output (`pcb-analysis-schema.ts`, `output_config.format`, no cost fields
in the schema) and falls back to free text + salvage if the model rejects it.
After Stage 4 the response is fully deterministic: `costEstimates` is rewritten from
the selected country (`setDeterministicCostEstimates`, model first pass kept under
`aiFirstPass`), placements are counted from the priced lines
(`derivePlacementsFromBOM`), and on an automotive board the IATF / class 3 /
burn-in / laminate premiums are folded into the headline and every country row
(`applyAutomotiveGrade`; `breakdown.automotiveFab/automotiveAssembly`) — they used
to sit only in side panels. `docs/pcb/traced-example-radar.md` walks the radar
board from photo to pound; `tests/pcb-headline-trace.test.ts` pins it. Read ALL model text blocks (a leading
thinking block once caused empty BOMs); the board spec is stabilised
(`pcb-boardspec-stabilise.ts`). What a photo cannot show — via count, layer count,
parts under shields — stays an estimate until the files are attached; the screen's
"to verify" bucket is the £1+ lines with no quote behind them.

### Frontend & server shell
- `src/ui/main.ts` is a ~20.3k-line monolith holding most of the SPA (forms per
  commodity, results, CAD viewer wiring, exports). Cost inputs are collected by
  `collect<Commodity>Input()` functions that read DOM fields and call the engine;
  the engine is the single source of truth — the UI must not re-implement cost
  math (drift bugs). Exports (`src/export/*.ts`) reuse engine results, never recompute.
  It is being split (review L12). Put new UI code in a module, not in main.ts.
  What moves out first is what reads no main.ts state: types and pure
  `(data) → HTML` builders (`src/ui/pcb/types.ts`, `src/ui/pcb/panels.ts`); a
  builder that needs a piece of state takes it as a parameter. Page-level glue
  also lives in modules: `ai-mode.ts` (no-AI build), `a11y.ts` (field names,
  Escape), `auth-fetch.ts`, `field-labels.ts`.
- `server/` — Express + `better-sqlite3`; routes in `server/routes/*.ts`, JWT auth.
  **Every LLM call MUST go through `server/utils/ai-client.ts::createAnthropic()`**
  — never `new Anthropic()`. It enforces `AIR_GAPPED=1` (throws, deterministic core
  still works) and `ANTHROPIC_BASE_URL` private routing.

### Windows package — `scripts/package-windows.mjs` + `Start-CostVision.bat`
A folder you copy to a locked-down laptop and double-click: portable Node,
embedded Python with OCP, the app prebuilt, no installer and no admin rights.
**Must be built on Windows x64** — `better-sqlite3`/`bcrypt` resolve win32-x64
prebuilds and OCP is a `win_amd64` wheel with no sdist; the script refuses other
platforms rather than produce a folder that fails on someone's desk. It ends by
measuring a STEP fixture with the bundled interpreter against the committed
truth value. Kernel pinned in root `requirements.txt` (`cadquery-ocp-novtk`,
never `cadquery` — the engine imports OCP only). AI is **not air-gapped** by default:
with no `ANTHROPIC_API_KEY` the AI entry points are hidden (`/api/health`
`aiAvailable:false` → `ai-mode.ts`) and every costing path works; add a key and
restart to switch AI on. `AIR_GAPPED=1` still switches it off deliberately. The
launcher writes both, commented, into the settings file. It sets
`CV_DATA_DIR` (the install folder is not user-writable on Windows) and
`PYTHON_BIN` (there is no `python3` on Windows). Anything POSIX-only in the
Python engine must stay behind a `hasattr` guard — see `_set_alarm`; `SIGALRM`
does not exist on Windows and referencing it kills the import. See
`docs/WINDOWS-INSTALL.md` and `tests/windows-package.test.ts`.

### Real-parts baseline — `scripts/real-parts-baseline.ts` + `tests/real-parts-baseline.test.ts`
The regression net for real CAD. 2,185 tests passed while a steering knuckle
costed at £5.43: every costing test used a *synthetic* fixture (clean prismatic
blocks, no fillets), and the bug only fired on real geometry. The baseline
records route, questions, guards and cost for each part in `cad-audit/parts/`,
plus its measured geometry. Two tiers: **replay** the recorded geometry through
`costMeasuredPart` (the product's own chain — never re-implement it) runs
everywhere including kernel-less CI; **re-measure** runs only where OCP is
installed, and in `docker-cad.yml` inside the image with `cad-audit/` mounted at
`/cad-audit`. A failure means a real part moved — read the diff, and if it is
intended, `npx tsx scripts/real-parts-baseline.ts --update` with the reason in
the commit message. The answers in `ANSWERS` are stated engineering judgements,
not derivations, so they can be argued with. **It pins what the tool says, not
what is true** — nothing here has been compared with a price JLR paid.

## Working notes
- Default dev branch is `claude/new-session-ts4byp`.
- Before shipping a cost-logic change, prove it: unit test + `npm run accuracy`
  or a hand-calc reproduction. `tests/reference-part.test.ts` pins a hand-computed
  £24.79 machined bracket (2026-09 rates; it follows the library) to <0.01% — keep
  engine changes reconciling to it. Rates move only through `scripts/rate-refresh.ts`
  and a dated config in `scripts/rate-refresh/`; see `docs/rates/`.
- Casting (`modules/casting.ts`, `cost-input-rules/commodities/casting.ts`, `casting-melt.ts`):
  gating is remelted (only dross lost) and every kg poured is charged melt energy; the sand
  line is timed per mould ÷ impressions; process choice and HPDC shot time read the section
  2·V/S, never the ray-cast min/mean wall; tooling is the toolmaker build-up, not the
  kernel's face-count figure; fettling / heat treat / blast / NDT are rules. See
  `docs/cad/casting-review-2026-10.md` and `tests/casting-review.test.ts`.
- Injection moulding (`modules/injection-moulding.ts`, `cost-input-rules/commodities/injection-moulding.ts`,
  `cavitation-optimiser.ts`): the shell wall correction fires below fill 0.5; projected area is
  the kernel's measured silhouette (`projectedArea.alongDrawMm2`, shared by every press/die
  commodity); dry cycle and fill rate follow the press; runner, regrind, manning and scrap are
  rules; the tool is the toolmaker build-up only. A shell with bosses or a moulding name is
  asked, not routed to sheet metal. See `docs/cad/injection-moulding-review-2026-10.md` and
  `tests/moulding-review.test.ts`; the modelled mouldings are in `cad-audit/parts/IM_*`.
- Sheet metal & BIW (`cost-input-rules/commodities/sheet-metal.ts`): one `stampingPlan` decides
  press line, die type, stations (~3 bends a station), force (cut + bend + draw + binder), the
  press on force AND bolster (`STAMPING_PRESSES` in machine-sizing.ts), SPM and die cost — never
  decide one of them elsewhere. `routeChoice` prices stamping against laser + press brake; the
  fab route re-routes headless (`toCostParams` returns `sheet_metal_fab`) and the screen
  (`recommendedCommodity`). Soft tooling ≤ 25k programme parts. The unfold also runs on thin
  shells (BIW radii are beyond the bend detector). Bought-in parts use `rawMaterial.boughtIn`
  (no second overhead/margin). See `docs/sheet-metal/sheet-metal-biw-review-2026-10.md`,
  `tests/sheet-metal-review.test.ts`; modelled pressings in `cad-audit/parts/BIW_*`.
- Machining & cast + machine (`src/engine/machining-time.ts`, `cost-input-rules/commodities/machining.ts`):
  cutting time is a measured build-up — stock in stocked plate/bar sizes, roughing = removed
  volume ÷ the metal's removal rate, finishing by measured area per face type (`faces.areaByTypeMm2`),
  holes by drilling feed (+ inferred tapping), tool changes, handling per fixturing — never the
  kernel's `cncCycleTimeEstimate` (printed "not used"). Turned parts come from the kernel's
  `turning` signature. `machiningRuleDefs(cutFor)` is ONE rule set: from-solid for `machining`,
  `nearNetCut` (machined faces + holes, cored bores finish-bored) for the cast + machine half —
  crew, OEE, batch, fixtures, programming, tool wear and deburr come from it on both paths.
  Rule-built ops carry `measured: true`; the near-net guard caps AI times only. Bench ops are
  labour only (`cycleTimeHr` 0). See `docs/cad/machining-review-2026-10.md`,
  `tests/machining-review.test.ts`; modelled parts in `cad-audit/parts/MACH_*`.
- Forging (`cost-input-rules/commodities/forging.ts`, `modules/forging.ts`): the cycle is the forge-line
  takt (`forgeLine`: load + hits × hit time), never the kernel's `forgeStrokes`; flash-making routes
  trim in line (`trimPress`, stamping ladder); crew, labour, scrap and furnace are rules; die sets are
  fractional; `partWeightKg` is the AS-FORGED weight (finished + drilled + measured machining stock);
  the press closes across the largest silhouette (`forgingPlanAreaCm2`) + flash land. Secondary
  machining on castings and forgings carries `secondaryMachiningCell` (handling, change-over,
  fixtures, programming, tool wear) on both paths. Kernel: "through" = open at both ends (probed),
  draw-axis ties go to the largest silhouette. See `docs/cad/forging-review-2026-10.md`,
  `tests/forging-review.test.ts`; modelled parts in `cad-audit/parts/FORGE_*`.
- Gear (`modules/gear.ts`, `cost-input-rules/commodities/gear.ts`): set-up per operation and scrap are
  rules; headless must NOT pass `labourId` (it pins every op and overrides per-process labour); gear
  machines are crewed `GEAR_MACHINE_CREW` 0.5, deburr / checker 1; blank turning reads the shared
  `CUTTING_DATA`. `/reanalyze` chooses the commodity exactly as `/analyze` (forced/answered route →
  gear metrology → `inferCommodity`) — it used to fall to 'machining' in deterministic mode. See
  `docs/cad/gear-review-2026-10.md`, `tests/gear-review.test.ts` (includes a live HTTP routing test).
- Rubber (`cost-input-rules/commodities/rubber.ts`, `modules/rubber.ts`): LSR injection is for liquid
  silicone ONLY (HCR at volume → transfer, stated proxy — no rubber injection press in the library);
  a constant-section profile (`extrusionProfile`) is extruded with an in-line cure tunnel; the cure
  section is `cureSectionMm` (p95 capped 2×2·V/S), the heat term t²/(4α); cavities are cost-chosen
  (`cavitiesFor`); press, crew, OEE, scrap, deflash (bench), post-cure, mould change are rules;
  `rubber` is a commodity route. `_setSelectOpts` keeps an optional select's "— None —". See
  `docs/cad/rubber-review-2026-10.md`, `tests/rubber-review.test.ts`; parts in `cad-audit/parts/RUB_*`.
- Blow moulding (`cost-input-rules/commodities/blow-moulding.ts`, `modules/blow-moulding.ts`): the wall is
  2·V/S (`derive/shell-wall.ts`), never the ray mean; capacity is the engineer's band capped at the envelope,
  or typed (`blow.capacityExactL`); machine by head and shot (`blowMachineFor`), parison in series only on an
  accumulator push or a slow extruder (`EBM_HEADS`); crew, OEE, scrap, flash regrind and the in-line trim
  station (an `untended` op — no crew of its own) are rules on both paths; moulds are fractional. Any hollow
  thin shell gets the hollow-route question; `applyShellWallCorrection` fills a missing wall on a sparse
  shell (a complete reading — a partial one crashed `/analyze`). See `docs/cad/blow-moulding-review-2026-10.md`,
  `tests/blow-moulding-review.test.ts`; parts in `cad-audit/parts/BM_*`.
- Rotational moulding (`cost-input-rules/commodities/rotational-moulding.ts`, `modules/rotational-moulding.ts`):
  a carousel is paced by its SLOWEST station (`rotoIndexSec`; the module charges one arm-load per
  `indexTimeSec`), moulds are what the volume needs (`rotoMoulds` → `mouldsInService`), never one per arm
  position; the menu is the library's roto powders + a grinding adder; crew, OEE, load, scrap and machine are
  rules on both paths. Closed tanks are found by the kernel's `enclosure` probe (rays from the envelope
  centre; `enclosedShell` in derive/hollow.ts) and get the hollow-route question before the bend test. See
  `docs/cad/rotational-moulding-review-2026-10.md`, `tests/rotational-moulding-review.test.ts`; parts in
  `cad-audit/parts/ROTO_*`.
- Thermoforming (`cost-input-rules/commodities/thermoforming.ts`, `modules/thermoforming.ts`): the plan is the
  LARGEST measured silhouette (`planAreaCm2` — the "along draw" one can be a side view); the sheet gauge is mass
  balance (part volume ÷ plan), the formed wall 2·V/S; the blank is outline + clamp margin, nested on the former's
  window (`nestOnSheet`, `TF_MACHINES`); a rotary former is station-paced (`rotary`), heavy-gauge trim runs off the
  former on the router (`trimMachineId`); parts per sheet, machine, crew, OEE, scrap, index time and the electricity
  price are rules on both paths (a rule's `fieldId` must be the field that holds that quantity — the draw ratio was
  written into the index time). The name reader knows forming / blow / roto words and polymers as routing evidence.
  See `docs/cad/thermoforming-review-2026-10.md`, `tests/thermoforming-review.test.ts`; parts in `cad-audit/parts/TF_*`.
- Composites (`cost-input-rules/commodities/composites.ts`, `derive/laminate.ts`, `modules/composites.ts`): `composites`
  is a route and laminate words (CFRP, GFRP, prepreg, RTM, infusion, carbon fibre — not "carbon" alone) are routing
  evidence; headless costing is `compositesParams` in to-cost-params.ts, BEFORE the single-grade material check (fibre
  + resin are priced per kg). Laminate thickness 2·V/S → plies; the cure cell is by system (`CURE_CELLS`: autoclave /
  oven / RTM press) with parts per load = tools that fit the bed (`partsPerCure`); tools in service by volume ×
  (layup + cure + turnaround), worn out fractionally; waterjet trim, NDI on structural carbon, crew, OEE, scrap are rules.
  A measured enclosure (≥ 30% of rays hit) outranks the fill-based "sealed" verdict in routing. See
  `docs/cad/composites-review-2026-10.md`, `tests/composites-review.test.ts`; parts in `cad-audit/parts/COMP_*`.
- Screen and headless must cost alike. A rule reaches the form by its `fieldId`, but
  reaches headless (`costMeasuredPart`) only through `RULE_PATH_MAP` in
  `cost-input-rules/apply.ts`. A new rule must be mapped there or excused in
  `RULE_PATHS_NOT_COSTED_HEADLESS` (`tests/rule-path-coverage.test.ts`). A grade a rule
  picks must be one its form's drop-down offers (`src/ui/material-scope.ts`,
  `tests/material-scope-parity.test.ts`).
- Live commodity prices in `server/routes/commodities.ts` are a **seeded random
  walk** (labelled "indicative"), not a real feed; the live-metal `price-fetcher.ts`
  writes a display-only override table read by no costing path.
