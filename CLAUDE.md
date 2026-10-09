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
same ref-des). The BOM may also be a PICTURE of the BOM table (PNG/JPEG/WebP under the same
`bomFile` field): `pcb-bom-image.ts` transcribes it in one structured-output call whose schema
has NO price field, cleans it deterministically (header/total rows dropped, qty from the
designators when missing) and returns the same `ParsedBOMLine`s a .csv gives, marked `fromImage`
(`bomSource: 'image'`, IMG badge, lineConf −0.1) — one helper `bomFromImageUpload` in both routes; and drill/Gerber `fabFiles` are measured for size, layer count and via
count (`pcb-fab-data.ts`, no AI) and override the guess (`dimensionsSource` /
`layersSource` / `viasSource: 'measured'` switch off the stabiliser's clamps).
**The model never sets a price**: its `unitPriceGBP` is an estimate that only picks a
point inside the line's class range (`pcb-class-pricing.ts` — the price table as data;
precedence catalogue → OCR-named part range → function range → class range, each
line carrying `priceSource` / `priceBasis` / `priceNote`, `pcb-bom-grounding.ts`).
Chip markings OCR read are attached to the BOM line of the same function
(`pcb-ocr-reconcile.ts`). The offline catalogue is **data**:
`server/data/pcb-component-catalogue.json` (1,018 parts, 1k–300k GBP breaks, a
source and date on every entry — 679 from distributor listings, the rest labelled
engineering estimates; see `docs/pcb/component-database-2026-10.md` and the ADAS round
`docs/pcb/adas-component-research-2026-10.md`), loaded
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

**PCB review (Oct 2026, `docs/pcb/pcb-review-2026-10.md`):** Stage 4 is ONE function, `runStage4` in
`server/routes/pcb.ts`, used by `/analyze-image`, `/analyze-image-stream` (the screen's route), `/reanalyze` and
`/reprice` (Stage 4 only, no AI — "Fetch Live Prices", a new country/qty) — never add a step to one route. Every
line without a catalogue/distributor hit is priced from the class/named range (no `ai-estimate` survives;
`capUnconfirmedPrices`); `livePriced` means a distributor was called THIS run (offline catalogue = CAT / CAT est.);
ranges and catalogue breaks follow parts bought (qty × boards, `line.volumeMultiplier`). `consolidateBom` dedups
designators across the 8 photos; `verifyOcrClaims` keeps "read off the chip" only when an OCR marking agrees; Stage 3b
never asks for a price. The response carries `stage1Classification` / `ocrExtraction` / `orderQty` from the server
(the client's `attachPcbPayload`), `analysis.rawBom` (so a re-price never applies volume or grading twice). Catalogue
family matches need an ordering suffix (`orderingSuffix`). `tests/pcb-stage4-trace.test.ts` reconciles every figure on
the radar board to the headline. Photo-reading accuracy is NOT measured: no labelled board in `tests/fixtures/pcb-boards/`.
The ASIL is checked against the parts list in `runStage4` (`pcb-asil-guard.ts`): ASIL-C/D only with a safety PMIC/SBC or
lockstep MCU in the BOM (else costed ASIL-B, claim kept as `asilClaimed`); a rationale contradicting the BOM's function is
withheld. The should-cost PDF of an analysis-linked costing is a PCBA report (`src/export/pcba-report-data.ts` +
`renderPcbaSections` in pdf.ts) — never the machined-part body; `docs/pcb/camera-board-360-2026-10.md` §8.
The PCB results export an **Excel report** (`src/export/pcb-workbook.ts`, six tabs from the same `buildPcbaReport`
model; totals are live formulas; native charts via `src/export/xlsx-charts.ts`, logo `src/brand/logo-png.ts`) and the
matching **PDF report**. Check a change with `npx tsx scripts/pcb-workbook-sample.ts out.xlsx` + LibreOffice recalc
(0 formula errors) and a render; see `docs/pcb/pcb-excel-report-2026-10.md`.
**Calculate after Analyze = the analysis** (`src/ui/pcb/analysis-link.ts`, camera-board trial Oct 2026): the
analysis fills the PCB fab form; Calculate with nothing edited reports the analysis (components itemised, board and
assembly bought-in, no second overhead / margin); an edited field is written into the analysis's board spec and
re-priced via `/reprice` first (a quality grade sets automotive / general). The form's own bare-board model is used only
with no analysis. Board size is kept unless its placement density is unbuildable (> 30/cm² a side) or not credible
(< 0.4/cm²); ICT and X-ray are station time + fixture / programme over the order, capped at the table's small-batch
price; BOM rows named by kind ("Ferrite", "Common Mode Choke", "Image sensor") take bead / choke / imager ranges, "≤ 1206"
is a size limit; TI "XXXX-Q1" finds the catalogued …Q1 orderable; ≥ 2 named AEC-Q100 ICs (≥ half of them) make the board
automotive (`AUTOMOTIVE_FROM_BOM`); a BOM without designators is checked by count and is never "missing passives".
AOI, ICT and X-ray are all station time + programme / fixture over the order (table price = small-batch ceiling); the
components carry an EMS material burden (`materialBurdenFor`: 5% ≥ 100k, 7% ≥ 10k, 10% below — inside `bomCostPerBoard`,
shown as `breakdown.materialBurden`); imagers are priced at automotive volume ASPs (£3–15), not distributor listings — a NAMED imager too: a catalogue / live hit matching `IMAGER_RE` (pcb-bom-grounding.ts) is kept as `distributorListingGBP` (reference) and the line takes the imager class rule (decision 9 Oct 2026; LCSC stays in the catalogue median).
Real purchase prices go in `scripts/actuals/pcb-actuals.csv` (`npx tsx scripts/accuracy-report.ts <csv>`) — never tune to one.
`npm run test:e2e:pcb-camera` drives that board end to end; see `docs/pcb/camera-board-360-2026-10.md`.
`expandRefDes` counts only real designators (U1, R12A, C_BULK1) — a placeholder ("—", "N/A", "U?") is
not one (it once made 13 unlabelled lines read as duplicate views). File inputs are never written back
(`country-recost.ts` — restoring a chosen photo's path threw and failed Calculate on the PCB form).

**Component database (Oct 2026, `docs/pcb/component-database-2026-10.md`):** the catalogue is 1,018 parts, 679 distributor-priced (ADAS round 9 Oct 2026: +175 parts, `docs/pcb/adas-component-research-2026-10.md` — one domain at a time, the web-search budget is shared by parallel agents; Digi-Key 'punchouttest' prices are labelled on the entry; `scripts/pcb-ecu-library-merge.ts` merges ECU board research, every claim a URL or "engineering judgement"), 185 by 2+ distributors before that round (six research rounds incl. a gap analysis of common automotive parts; unpriced parts with their last result in `queue.json`); run `npx tsx scripts/pcb-catalogue-audit.ts` after every merge (0 errors required; warnings are for a person); the literal orderable code is looked up before its normalised key; family-key estimates ("TC387") take a REVIEWED member's price from `scripts/pcb-research/family-links.json` and stay estimates;
researched entries carry `observations` (distributor, qty ≥ 100, price, URL, date) and `volumeModel` (slope b). Breaks are
1k/10k/100k/200k/300k — above the largest published break they are DERIVED (`P1k × (Q/1000)^−b`), not quotes; lookups
follow parts bought (qty × boards) and stay flat above 300k. Add prices only through `scripts/pcb-catalogue-research-merge.ts`
(rules in its header — a slope comes from ONE distributor's breaks, never across distributors; a sibling-code price says so in its source; a cross-check ADDS to stored observations; Rochester (aftermarket) is not a source; a price is read only on a distributor's site or a naming aggregator (`PRICE_HOSTS` — not OEMsTrade, omo-ic or datasheet sites); audit rejections live in `<dir>/audit-exclusions.json`; raw research in `scripts/pcb-research/<date>/`, queue in `scripts/pcb-research/queue.json`) or
`pcb-catalogue-import.ts` — never by hand. `server/data/pcb-ecu-library.json` maps 38 ECUs to 6 powertrains with sourced key
ICs (`pcb-ecu-library.ts`, `GET /api/pcb/ecu-library`, the "Vehicle electronics library" panel); every claim carries a URL or
"engineering judgement".

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

## 360 review (Oct 2026) — read `docs/review-360-2026-10.md` before a demo
- Accuracy is UNMEASURED: 0 real actuals in `npm run accuracy`. Say so.
- Security invariants:
  - the OTP is returned only to a same-machine request (`devOtpAllowed`) or with `CV_SHOW_DEV_OTP=1`;
  - admin is promoted only when verified;
  - `/api/sync/library` PUT and `/api/prices` override/refresh are admin-only;
  - `/api/cad/tessellate` needs a session;
  - DFM jobs read only `cv-dfm-<uuid>` temp files.
- Escape every model / OCR / BOM / user string you put in `innerHTML` (`escHtml`).
- The simulated commodity ticker / dashboard / price alerts were REMOVED (Oct 2026): no `/api/commodities`, no ticker. The causal
  model names the index category only (`COMMODITY_INDEX_CATEGORIES`) — never reintroduce a price that is not from a real source.
- CAD demos are recordings (banner, not `occt`).
- Casting melt loss is not credited as scrap (`rawMaterial.lossIsNotScrap`).
- The uncertainty band keeps the bought-in carve-out.
- Conformal scores are relative to the calibrated estimate.

## Working notes
- Default dev branch is `claude/new-session-ts4byp`.
- Programme life (`#programme-years`) is a costing input: CAD Apply writes `*-amort` = annual × years, and every CAD
  request sends `programmeYears` so the rules size tools that wear out (moulding cavitation / steel) over the same
  programme (`RuleContext.programmeYears`; blank → a stated 5-year assumption). `tests/programme-life.test.ts`.
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
  Near-net spindles (stub axle live run, Oct 2026): the kernel's `turning.externalAreaMm2` (FORWARD revolved faces —
  bores stay holes) ≥ 20 cm² and ≥ 8% of the surface is turned on the CNC lathe in its own fixturing, its stock cast
  (`nearNetTurningTime`); a mesh's triangles are never faces (`bRepFaceCount`). Safety-critical cast iron is ductile
  EN-GJS-500-7 (safety asked before the grade; `castIronDefaultGrade`); the mass follows the costed grade. See
  `docs/cad/stub-axle-live-run-2026-10.md`, `tests/stub-axle-live.test.ts`.
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
- Polymer extrusion (`cost-input-rules/commodities/extrusion.ts`, built Oct 2026): a constant-section part
  (`derive/profile.ts::extrusionProfile`, shared with rubber) is asked extrusion / rubber / machining BEFORE the
  hollow and bend tests (a tube reads as a closed tank to the enclosure probe). Section = V/L, kg/m by density,
  wall 2·V/S; round hollow → tube (≤ Ø16, micro line) or pipe, else profile; line, screw and cooling by process
  (`EXTRUSION_LINES`), the line rate is the advisor's screw-vs-cooling minimum; start-up scrap = 0.25 h of rated
  output over a run of at least a shift. Polymer only — a metal grade is refused here; aluminium
  goes to the `aluminium_extrusion` route (below). Headless via `toCostParams` 'extrusion'. See `docs/cad/extrusion-build-2026-10.md`,
  `tests/extrusion-build.test.ts`; parts in `cad-audit/parts/EXT_*`.
- Aluminium extrusion (`al-extrusion-data.ts`, `modules/aluminium-extrusion{,-advisor}.ts`,
  `cost-input-rules/commodities/aluminium-extrusion.ts`, `src/ui/al-extrusion-form.ts`): billet = LME + the region's
  all-in premium (`BILLET_PREMIUM_USD_PER_T`, sourced or labelled estimate) + alloy adder — both regional paths read it
  (`buildRegionalLibrary`, `alBilletMaterialFactors`). The kernel's `profileSection` (cut on a COPY — a section on the
  original turned through holes blind) gives area, outline, voids, circumscribing circle, wall and constant / machined;
  `planAlExtrusion` picks die type, press (circle, ratio, 90% force), holes, Johnson force, exit speed, billet for whole
  parts a strand, recovery. Routes direct / indirect / hydrostatic / Conform / impact; alloy is blocking, route / temper /
  finish / bends advisory. Fabrication takes HOLES from the feature table (chamber walls read as pockets) plus the measured
  machined volume. Screen and headless share `buildAlExtrusionInputs`. Review (Oct 2026): 30 alloys with tempers per alloy;
  breakthrough = Johnson × weld + sticking container friction 4(σ/√3)L/D on a DIRECT press, so force caps the billet
  length; strand → mill lengths (2.5–7 m, optimised) → cold cut-to-length (`al-ctl-saw`); scrap at LME + Fastmarkets
  differential; process energy is `rawMaterial.energyKwh`, priced by the CORE at the library's tariff (regional); tongue
  ratio ≥ 3 → semi-hollow; powder on the outside area only; the section chaining tolerance follows the SECTION, not the
  part. Re-route questions must use id `commodity.route` — nothing else re-routes. See `docs/cad/aluminium-extrusion-build-2026-10.md`,
  `docs/cad/extrusion-review-2026-10.md`, `tests/aluminium-extrusion-build.test.ts`, `tests/extrusion-review.test.ts`;
  parts in `cad-audit/parts/AL_*`.
- Casting grade gap (Oct 2026, `docs/cad/casting-grade-gap-2026-10.md`, `tests/casting-grade-gap.test.ts`): 11 grades
  added (`CASTING_GAP_GRADES`: EN AC-46200 / 45300, LM13, GJL-150, GJS-350-22-LT, GJS-500-14, GJV-500, Ni-Resist D-5S,
  A216 WCB, 1.4848, CuSn12), sibling + alloy content, every country by `buildRegionalLibrary`. A new casting grade =
  library entry + `GRADES` in casting-material-taxonomy.ts; family, advisor alloy and melt follow its category. CGI
  (EN-GJV) melts as ductile iron (`castingAlloyOf` returned null for it). Designation keys run to 4 tokens (EN-GJS-500-7
  v 500-14). Review-added grades are HELD by the refresh's catch-all — give them alloy drivers in the next config.
- EV propulsion (Oct 2026, `docs/ev/battery-emotor-build-2026-10.md`, `tests/ev-propulsion.test.ts`): `battery_pack` and
  `e_motor` commodities, spec-driven (no CAD route). Data and sources in `src/engine/ev-data.ts`: BNEF 2025 cell price,
  SMM / SunSirs 2026 magnets; parts, conversions and line capex are labelled ESTIMATE.
  - Modules: `modules/battery-pack.ts`, `modules/e-motor.ts`; checks in `modules/ev-advisor.ts`; forms in `src/ui/ev-forms.ts`.
  - Cells are BOUGHT IN (`rawMaterial.boughtIn`): `directCost` holds the integration ONLY, because the core adds `boughtIn`
    itself (putting both in counted the cells twice).
  - Library metals are read from the ACTIVE book. The 17 line machines are library rates (`EV_LINE_MACHINES`).
  - Lamination dies wear out fractionally.
- Casting & forging materials (review, Oct 2026): the GRADE is an advisory question `material.grade`
  (`derive/grade.ts`) — the representative grade is costed until it is answered; an answered, pinned (CAD panel →
  `answersFromContext`) or DECLARED (STEP material designation) grade sets the £/kg, the mass (its density) and the
  advisor alloy (`castingAlloyForGrade` / `forgingAlloyForGrade`); drawing-read and name grades only lean. Families
  include `zinc` and `nickel alloy`. New grades are priced as their library SIBLING + alloy content at the refresh's
  metal prices, arithmetic in the note. `GRADE_SCOPE` must equal the forms' scopes (forge excludes extrusion logs).
  4340 is under 4130 in the library — fix in the next rate refresh. See `docs/cad/casting-forging-materials-review-2026-10.md`,
  `tests/casting-forging-materials.test.ts`.
- Material picker (Oct 2026): the casting, cast + machine, forging and sheet-metal (stamping + fab) forms pick Family →
  Standard → Grade (`src/ui/material-picker.ts`; data in `src/engine/{casting,forging,sheet}-material-taxonomy.ts` on
  `material-taxonomy.ts`). The grade `<select>` (`cast-mat` / `cam-mat` / `forge-mat` / `sm-mat` / `smf-mat`) stays the ONE value holder — family / standard only hide
  `<optgroup>`s, and setting its value (by code or hand) moves both to the grade's own. A new library casting, forging or sheet
  grade must be filed in its `GRADES` (`tests/{casting,forging,sheet}-material-taxonomy.test.ts`); an unknown company grade
  lands under "Other / company grades". The CAD panel's material pin is grouped the same way.
  Plastics — injection moulding, blow moulding, thermoforming, extrusion (`imm-mat`, `bm-mat`, `tf-mat`, `ext-mat`) —
  are Family → POLYMER → Grade (`polymer-material-taxonomy.ts`: ONE polymer list + family list, one grade table per
  form because each buys a different form — pellets, blow grades, sheet, pipe / profile compounds). Plastics have no
  grade standard: a resin is its ISO 1043 polymer + filler; the info line gives morphology, drying and the ISO 11469
  marking (written only where unambiguous). See `docs/cad/moulding-material-picker-plan-2026-10.md`.
- Material scope (review, Oct 2026): `src/engine/material-scope.ts` is the ONE table of which library categories each
  commodity buys (exact category match). The forms' drop-downs (`src/ui/material-scope.ts` → `SELECT_COMMODITY`), the
  CAD panel lists (`cad-options.ts`), the grade / resin / compound questions and `toCostParams::resolveMaterialId` all
  read it — an out-of-scope id is re-asked, or replaced by the commodity's own grade with an `assumed` note. Never
  re-filter a material drop-down by hand in main.ts. A new category must be added to a scope
  (`tests/material-scope-review.test.ts` lists the only orphans). See `docs/cad/material-scope-review-2026-10.md`.
- Screen and headless must cost alike. A rule reaches the form by its `fieldId`, but
  reaches headless (`costMeasuredPart`) only through `RULE_PATH_MAP` in
  `cost-input-rules/apply.ts`. A new rule must be mapped there or excused in
  `RULE_PATHS_NOT_COSTED_HEADLESS` (`tests/rule-path-coverage.test.ts`). A grade a rule
  picks must be one its form's drop-down offers (`src/ui/material-scope.ts`,
  `tests/material-scope-parity.test.ts`).
- Countries (Oct 2026): 39 manufacturing regions. The 19 added from public statistics live in
  `scripts/rate-refresh/2026-10-countries.json` (each figure with its source) and are written into
  `regional-rates.ts` / `al-extrusion-data.ts` between `⟪region-expand⟫` markers by `scripts/region-expand.ts`
  (`--check` in review): labour = analogue country × a same-source wage ratio, energy = published tariff,
  multipliers held from the analogue. Edit the config, never the generated lines. The country, currency and
  region-filter pickers are filled from `REGIONAL_DATA` / `CURRENCY_SYMBOL` by `src/ui/region-options.ts` —
  never hand-list countries in index.html. A new region needs an origin entry (`ORIGIN_PREFERENCES`), a freight
  lane, carbon factors and a `ccyOf` currency in rate-refresh.ts (`tests/region-expansion.test.ts`). See
  `docs/rates/2026-10-country-expansion.md`.
- Country rates (review, Oct 2026): a costing in a country uses that country's rates for EVERYTHING. Rates used
  before the stack (toolroom £/hr behind every tool build-up and parametric tool, rule-priced items, module energy
  fallbacks) read the ACTIVE book via `src/engine/rate-context.ts` (`withRates` / `setActiveRates`) — never
  `DEFAULT_RATE_LIBRARY` for a rate. Rules run in `ctx.rates` (the CAD route builds it from the request's region and
  the deployment's active book; the region is in the cache key); headless runs toCostParams and the module in the
  region's book; the screen keeps a BASE book (company or local) and rebuilds the active one per country
  (`_rebuildActiveLibrary`). Both country pickers share one `_applyCountry`; overhead / packaging / logistics come from
  `regionalShopDefaults` on screen and headless. The comparison table re-costs the part per country
  (`computeRegionalComparisonExact`). A £ figure typed into a form is a quote and is not rescaled. See
  `docs/rates/2026-10-country-rates-review.md`, `tests/country-rates.test.ts`.
  ONE country source: labour on screens is ROLES only (`labour-roles.ts`; `lab-<cc>-*` pinned grades resolve to
  their role); the PCB table takes power / FX / operator labour from `REGIONAL_DATA` and every region maps to a PCB
  market (`pcb-market.ts`, own or nearest with the reason shown); PCB pickers follow the country (`pcb-country-sync.ts`).
  Money rule: a form input holds £ and says £ (the target price is the one display-currency input, converted by
  `_targetPriceGbp`); rate tables and drop-downs show the display currency (`_currFmt`, `_inCur`) — never a literal "£"
  on a rate or result.
  Workflow (fourth pass): module energy is handed to the core as kWh (`module-energy.ts`, `rawMaterial.energyKwh`) —
  never £ at a passed tariff — so any re-costing prices it in its own country; a typed tariff stays a £ override.
  Scenarios carry `region` and are compared each in its own book; the country persists (`cv-region`) and a draft
  applies its country before its fields (`DRAFT_SKIP`); a rate book's own `lab-<cc>-*` / `energy-<cc>` entries win
  over `REGIONAL_DATA` in `buildRegionalLibrary`; agent requests send `region`.
  Live check (`npm run test:e2e:country`, `e2e/country-live.ts`): a real STEP in a chosen country through a real
  server + browser, capturing each call's `ratesRegion` (CAD responses state the country book their rules priced in),
  the Excel trace and the Rate Database export. UK £ service prices (heat treat, HIP, NDT, impregnation, blast, descale,
  coining) move by `regional-services.ts`; tool £ bands (`casting-tooling.ts` clampTotal) by the toolroom factor; the
  routing and cavitation optimisers default to `activeRates()`. See `docs/rates/live-run-india-aluminium-casting-2026-10.md`.
  All-commodity audit (Oct 2026): every £ CONSTANT states its COUNTRY BASIS (`regional-services.ts`: toolroom, engineer,
  heatTreat, inspection, process, chemical, a library material, a `globalShare` mix, or 'global' for traded goods) and is
  multiplied by `countryFactor(basis)` — never a bare UK £ in a module, rule or advisor. The forms' £ defaults follow the
  country by the same table (`src/ui/country-money-defaults.ts`; a typed / restored / CAD value is a quote and stays).
  `tests/country-rates.test.ts` §11 replays every real part in a "twice the UK" country: labour and process must double
  exactly, and no material, consumable or tool £ may stay at ×1 unless listed as traded. §12 fails on a new £ form field
  with no basis. Cost traces carry `drivers`. Live: `e2e/country-forms.ts` (every form, defaults, per country). See
  `docs/rates/all-commodity-country-audit-2026-10.md`.
  All 39 countries (Oct 2026): §13 costs every real part in every country (rates must be that country's book; totals
  inside its factor envelope). A per-country table must cover all 39 or state its fallback (own-shop heat-treat economics
  are NOT moved again by the overhead factor). The page applies whatever country its picker shows once wired
  (`data-country-ready`); the software hub (`swRegionFor`) and the agent prompt (`systemPromptFor(region)`) follow the
  country. See `docs/rates/all-39-countries-audit-2026-10.md`.
  Comparison table rows are the part costed with that country SELECTED: the CAD response carries `analysisByRegion`
  (rules-only), CAD apply fills the form once per comparison country (`captureCountryFills`), and each row re-collects
  the form in that country's book (`src/ui/country-recost.ts`: CAD fills, £ defaults, shop fields, country + PCB
  pickers follow; typed figures stay). Never re-price a stack input for another country — tools, services and
  consumables would ride along. The PDF prints the screen's rows. Tests §15.
- UI/UX (review, Oct 2026): `src/ui/styles/saas-polish.css` is loaded LAST and holds the review's layout and polish
  (≥1280 px the costing workspace is two panes — inputs left, result right, each scrolling; note calculator.css
  sets `grid-template-columns: unset !important` on it). `src/ui/saas-shell.ts` MOVES the action bar's secondary
  buttons into a "More" menu by id (`ACTION_GROUPS`; ids and handlers unchanged — harnesses click them via the DOM)
  and replaces Sign Out with an account menu. The sign-in page's counts are tested against the code
  (`tests/ui-shell.test.ts`). Measure with `e2e/ui-audit.ts` (axe WCAG 2.1 AA on 65 screen states — 0 at review
  close). three.js is a lazy chunk (`vendor-three`): never import `cad-views` statically. See
  `docs/ui/ui-ux-review-2026-10.md`.
  Second pass: the sticky summary bar shows its £ only when the total card is out of view (`result-headline.ts`);
  the panel header's commodity name is a searchable switcher that clicks the hidden `.ctab` buttons
  (`commodity-switcher.ts`; `switchCommodity` sets the header title); numeric fields validate inline against their
  own min/max (`field-validation.ts`, advisory); CAD apply shows a busy strip and disables Calculate (`busy.ts`).
  Help sections and the demo gallery live in `<template data-cv-lazy>` and are built on first open
  (`lazy-blocks.ts`) — code that reaches inside them must run after the modal opens; demo cards use ONE delegated
  handler. No light colour literals in in-app panels (`tests/ui-polish.test.ts`); use theme tokens.
  Dark theme = black + green (Oct 2026): `src/ui/styles/dark-green.css`, loaded LAST, every selector scoped to
  `html:not([data-theme="light"])` (`tests/dark-theme-scope.test.ts`). One green accent (#22C55E, dark ink on
  green fills); success / saving is TEAL in dark (green is the accent). Prove a theme change with
  `e2e/theme-shots.ts` (shoot before/after, `--diff`: light must be 0 px).
- 3D viewer (Oct 2026 redesign, `docs/ui/3d-viewer-plan-2026-10.md`): `src/ui/cad-viewer.ts` is ONE component for the
  standalone viewer and the inline CAD-to-Cost viewer — floating icon dock with fly-outs (every tool keeps its `data-act`
  id; `runAction` is the one switch), labelled view cube (`cad-viewcube.ts`, drawn in the canvas), inspector column,
  `colorMode` (one colour mode at a time). Pure helpers in `cad-viewer-model.ts` (robust 5–95 % ranges, mesh volume,
  geometry checks, `isRoundFeature` — a fillet is not a hole). Styles in `styles/cad-viewer.css` (`--v-*` tokens, both
  themes). The host pushes £ per face + the costed feature lines + its currency formatter (`setFaceCosts`) and the DFM
  findings (`setIssues`) via `pushViewerState` — the viewer never prints a bare £. Kernel edges must move with the
  re-centred mesh (the ghost outline). Prove a change with `npx tsx e2e/viewer-shots.ts <out>` (axe inside the viewer).
  Navigation is `cad-navigation.ts` (mouse / wheel: orbit about the point under the cursor, exact pan, eased
  zoom-to-cursor with limits); OrbitControls keeps touch only (`mouseButtons` all null). Picking uses a three-mesh-bvh
  index built in `cad-bvh-worker.ts` — `indirect: true` ALWAYS (direct mode reorders triangles and every face id goes
  wrong) and post the whole serialised object (its `version`). Prove navigation with `npx tsx e2e/viewer-nav.ts <out>`.
  Orthographic (O): the perspective camera stays the RIG; render / pick / project through `viewCam()` (an orthographic
  camera synced from the rig, frustum = the rig's view at the target plane) — never `camera` directly for those.
  Section measurement (S): `cad-section.ts` slices the mesh (oriented segments → loops, signed areas add, other planes
  clip) and the hatched cap is drawn from the SAME loops — never compute the area one way and draw the cap another.
  Positions are the file's own coordinates (`modelOrigin`). Proven against OCP's exact section: `npx tsx
  e2e/viewer-section.ts <out>` (within 0.1 % on real parts).
  Section wall thickness: `cad-section-thickness.ts` (rolling ball, shrinking-ball iteration on a segment tree, arc-
  length samples ≤ 3 000, run in `cad-section-worker.ts`); a reading is a WALL only when its contacts face each other
  (≥ 120°) — corners never set the minimum; a click reports the covering circle with the NEAREST centre.
- Geometric DFM & Design to Cost (Oct 2026, `docs/cad/dfm-cost-drivers-2026-10.md`): the kernel's ONE cylinder pass
  (`_cylinder_features`: axis LINE + radius + concavity XOR parametrisation; full ≥ 0.83 of a turn = hole/boss, partial =
  fillet with `sweepDeg`; breakout samples = through/blind, access ray = `openDirs`) feeds the costing table AND the DFM.
  Draft is for a TWO-HALF tool (`_release_table`, shared by `draftAnalysis` and the per-face pass, at the CHOSEN draw):
  a face comes out of the half it faces and is an undercut only when the part blocks that line (`blockedAtMm`); faces
  into an enclosed cavity are `facesCavity` / `cavityFaceCount`, never undercuts; touching blocked faces (or across a
  blend / side wall) are one `undercutRegion` = one slide (`costGroup`, counted once). New rules: setups, compound angle,
  cross holes, hole sizes, long-reach corner, NADCA cored depth, core-pin L/D — each sourced, `plausibleWall` / `isBlend`
  guards. The Design-to-Cost results tab (`src/engine/design-to-cost.ts` + `src/ui/design-to-cost-panel.ts`): target v
  should-cost, priced findings as switches, drivers with "to hit target alone", what-ifs — every figure is
  `computeUniversalStack` on a varied input; `findingVariant` (shared with the DFM restack) takes EXACTLY a finding's £
  off the factory base (÷ the op's £ per cycle-hour after parts/cycle, OEE and crew). Live: `npx tsx e2e/dtc-live.ts`.
- DFM / DtC "pure arithmetic" rules (demo review, Oct 2026, `docs/review/dfm-dtc-demo-review-2026-10-08.md`): a DFM £ must
  move the COSTING's numbers — time pricers carry `minutes` in the costing's model (cast routes: `nearNetHoleMinutes`),
  removed from the costed op at its own rates; tooling carries `nreGBP`. Anything the cost model does not carry is
  unpriced with a stated reason (corners, setups, cored-depth, non-stock size). The DFM/DFA and Insights tabs show £ ONLY
  for levers re-costed through the stack (`savingBasis: 'recosted'`); never print a rule-of-thumb % as money, never send
  one to the AI. A threshold with no source read is labelled "CostVision engineering heuristic". Drill rules stop at Ø26
  (bored above). Kernel: release tested at a cylinder's ±draw points; breakout on a 0.8 r ring; `orientationCheck` →
  `orientation_skew` warning.
  Screen (UI polish, Oct 2026): a DFM finding's £ in the findings panel AND the 3D viewer come from ONE helper,
  `dfmFindingAmounts` in main.ts (re-costed with this part's costing on screen, "(ref. rate)" before one). Measured
  fields print through `MEASURE_LABELS` (dfm-geometry-panel.ts — a new rule field needs a label, the test reads the
  rule files); severity is a word badge, never colour alone. A DtC lever shows `summary` (one line) with `steps` behind
  "How is this calculated?"; no library id (mach-…, lab-…) reaches the screen — the rate basis names machineClass +
  skillLevel. The costing workspace is `overflow: clip` (hidden let scrollIntoView slide it under the app header).
- Uploaded-parts review (Oct 2026, `docs/review/uploaded-parts-costing-review-2026-10-08.md`): every uploaded file costed
  live with both exports (`e2e/cad-parts-live.ts`, a manifest of file + answers). Rules it left behind:
  - Routing: gear / pinion is a whole word (not "_gearbox"); faces measured into a cavity (`cavityShell`) make a thin shell
    a hollow route; fill-only "hollow" offers the open routes too; a > 4 mm bossed shell is offered casting; the blank
    unfold never runs on a container (it took 296 s on the fuel tank). Kernel and page timeouts scale with file size
    (`geometry-timeout.ts`); a file with no extension is read by its header.
  - Casting: megacasting and HPDC both stop at `HPDC_SECTION_MAX_MM` (2·V/S). A gear on a SHAFT is costed as the shaft
    (`shaftBlank`: the machining route's bar, turning and holes). Applying blocking answers never pins an ADVISORY default.
  - Parity: the removal-ceiling cap is for unmeasured (model) operations only; headless OEE / labour efficiency follow the
    form where no rule sets them (`FORM_EFFICIENCY_DEFAULTS`, tested against the form HTML).
  - Reports: PDF / Excel print only what the costing holds — exclusions checked against operations AND consumable lines,
    the screen's band (`cadMeta.uncertainty`), the screen's DFM £ (`geometricDFMAmounts`), §4C only when its lines are
    the cost (`featureLinesInCost`), one confidence grade. Excel money is numeric (`money()` cells); sheet 7 checks the
    arithmetic and lists every question asked. No rule-of-thumb £ or % in observation text; reference bands say
    "engineering estimate".
  - Confidence grade (`overallConfidence`): ≥ 40 % Low → Low, ≥ 70 % High → High, else the mix's score (High 1, Medium ½)
    ≥ 0.45 → Medium. It graded on the High share alone and printed "Low" on costings with no Low data.
  - AI mode (closed Oct 2026, `docs/review/cad-costing-summary-2026-10-08.md` §3): the AI mass snaps to the measured
    mass beyond ±5 %; a no-rule-pack commodity takes no AI number; "Alternative processes" Apply re-analyses AS that
    commodity (`applyAlternativeProcess`); drawing-read coating thickness / masks pass `boundDrawingCoating`; the agent's
    `calculate_cost` and populate_form take only numbers the USER gave (`server/utils/agent-grounding.ts` — never let
    the model supply a number); RFQ should-cost is the engine's or "not costed" (no conversion-factor fallback).
  - Long server waits use `src/ui/long-task-progress.ts` (indeterminate bar + step + elapsed + allowance + Cancel) —
    never a percentage the server did not report.
- Motion (review, Oct 2026): ONE system — `src/ui/animations.ts` (GSAP: fades ≤ 8 px, 150–260 ms, power2 out / in,
  no scale, no back / elastic, one count-up) + CSS. The `motion` package is gone; never add a second animation library or
  a mousemove effect. Hover = colour / shadow (buttons) or a 2 px lift (cards); commodity picker tiles rise 4 px, take the accent border
  and FILL their icon tile with the accent (one look for every commodity) — the policy blocks at the end of
  `saas-polish.css`; overlays enter AND exit via `display … allow-discrete` + `@starting-style`; no `transition: all`.
  Toasts are `src/ui/toast.ts` only (main.ts's `showToast` delegates). `tests/motion-system.test.ts`, `e2e/motion-live.ts`.
- Automotive software costing (`src/engine/sw-should-cost.ts`, `sw-rate-library.ts`, `sw-benchmarks.ts`, panel
  `src/ui/panels/sw-should-cost-ui.ts`; review `docs/review/software-costing-360-2026-10.md`, P1 fixes
  `docs/review/software-costing-p1-fixes-2026-10.md`): base person-months are NOMINAL (QM, Medium, fresh); the ASIL uplift
  is ONE factor (asilDev, ×1.82 at D, Low confidence) — test / integration follow development, never a second ASIL
  multiplier; one overhead default `SW_DEFAULT_OVERHEAD` (1.15); powertrain scope is the engine's `SW_POWERTRAIN_SCOPE` /
  `applyPowertrainScope` (never a copy in the UI or scripts); `platformAnnualVolume` apportions shared software; the 5
  ICE / hybrid modules are `estimateBasis` copies of named analogues; published benchmarks are unverified (one list,
  `verified` flag) and no test may pin the model to them; a base-rate field overrides only when typed (`sw-rate-field.ts`).
  Snapshot outputs with `npx tsx scripts/sw-review/baseline.ts <out.json>`; live check `e2e/sw-live.ts`.
  P2 (`docs/review/software-costing-p2-fixes-2026-10.md`): `computeSWProgram` throws `SWInputError` on invalid input
  (`validateSWInputs`) — never patch a bad value in the UI; `personMonths` is the development effort COSTED and
  `effortPersonMonths` all costed effort; the Monte Carlo and the volume sensitivity use the headline's per-vehicle
  rule; per-unit royalties (`perVehicleRoyaltyGBP` / `perVehiclePerYearGBP`, unsourced, from the modules' notes) are
  charged per vehicle and never platform-apportioned; cyber follows the ISO/SAE 21434 CAL (`calFor`,
  `CYBER_UPLIFT_BY_CAL`), not the ASIL; the page country goes through `applySWCountry`; panels and validation read the
  ACTIVE book; the dev-source table is `devSourceComparison`; exports print `swRateBasis`; `effortCalibration` comes
  only from the user's logged actuals (`sw-calibration.ts`, ratio of sums) and scales the model's base PM, never a
  typed custom PM. The static report pages are reference examples (`scripts/sw-review/reference-banner.ts`).
  P3 (`docs/review/software-costing-p3-fixes-2026-10.md`): `monteCarlo.headlinePercentile` is printed beside P50 (the
  headline is ≈ P33, not the median); cloud is per connected vehicle-year (`unitCloudGBP`, module £/yr ÷
  `SW_CLOUD_REFERENCE_FLEET` 440k — reproduces the default programme) and never platform-apportioned; tool licences run
  over `developmentMonths` (default 90 = the phase timeline); the company SW workbook refuses unknown keys, 0, > 20 and
  duplicates, the base rate shares `SW_BASE_RATE_RANGE` (£1k–500k) with the engine, and every SW book is versioned
  ('sw-active', `/sw/versions`); results follow the page currency via `sw-currency.ts` (`applySWCurrency` from
  `_applyCurrency`) — inputs stay £; `sizeKSLOC` switches a module's nominal effort to COCOMO II.2000 (`cocomoNominalPM`,
  2.94 × KSLOC^1.0997); `result.inputs` is a COPY; only real AI replies are cached (`aiUnavailable`); the panel is
  axe-clean — link every `sw-label` with `for=`, name row controls, use `--sw-good` / `--sw-bad`.
- There is no commodity price feed: the simulated ticker (`server/routes/commodities.ts`, a random walk) was
  removed in Oct 2026. The live-metal `price-fetcher.ts` writes a display-only override table read by no costing
  path (its routes are admin-only).
