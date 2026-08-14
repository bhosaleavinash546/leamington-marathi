# CostVision — Bulk Agentic Costing Feasibility Report
Generated: 2026-08-14 | Commit: `143d025febde57248184edaace7c6322d7bb9a52`

Audit was read-only. No repository file was edited, created or deleted other than this one.
Throwaway test scripts were written under `/tmp` and deleted; `git status` is clean.

---

## 0. Verdict and blockers

**Rates are not versioned and costings are not persisted. You cannot reproduce a cost computed three
months ago, and there is no table that stores a cost result.** `rate_library` is a single-row
overwrite (`server/db.ts:15-20` — `id, data, updated_at, updated_by`, no version column, no history)
and there is no `costings` table anywhere in the schema. [Certain] For a bulk module this is the
material finding: a 500-part run produces numbers that cannot be reproduced later and have nowhere
to live. That is a schema problem, not an engine problem — but it must be solved before a bulk run
means anything.

**Verdict: FEASIBLE AS PURE ADD-ON.** The engine is callable standalone with zero modification, it
is deterministic, and an adapter with the exact required shape already exists at
`server/services/cost-executor.ts:131`. No existing code needs to change for the *costing* to work.
[Certain]

Three further findings that shape the work:

1. **The commodity list exists in four places and they disagree.** `gear` is in the type union and
   the UI but **absent from `COMMODITY_MAP`** — the headless path cannot cost a gear at all.
   `ai_agent` is in the UI and absent from the type union. [Certain] §7
2. **`executeCalculateCost` hardcodes `DEFAULT_RATE_LIBRARY` and never passes `annualVolume`.**
   Region is unreachable on the headless path even though `buildRegionalLibrary` exists and works.
   [Certain] §5, §6
3. **The regression baseline is weaker than it appears.** `tests/reference-part.test.ts` derives its
   expectation from the live rate library at runtime (`:125 handCalc(lib)`), so it proves the engine
   agrees with the hand formula but **cannot detect rate drift**. [Certain] §12

---

## 1. The five blocking answers

| # | Question | Answer |
|---|---|---|
| 1 | Stack | TypeScript 5.4 (ESM, strict) · Express 4.19 · better-sqlite3 12.10 · **no ORM, no migration tool** · vanilla-TS + Vite 5.2 frontend · Vitest 1.6 · npm [Certain] |
| 2 | Gate A — engine callable standalone? | **PASS, zero adjustments.** Pure function, no server, all 8 buckets, sum = total exactly [Certain] |
| 3 | Exact commodity keys | 18 in `COMMODITY_MAP`, 22 in `CommodityType`, 23 in `index.html`. Verbatim lists in §7 [Certain] |
| 4 | Engine input shape | `UniversalStackInput` — `src/engine/types.ts:187-209`. Full table in §5 [Certain] |
| 5 | Are rates versioned today? | **No.** Single-row overwrite, no history, no snapshot, no rate version stored on any result [Certain] |

---

## 2. Repository map

Single package; everything under `calculator/`. Repo root holds Docker/Make wrappers and standalone
deliverable generators (`build_*.py` / `build_*.js`) that are not part of the application.

```
.github/workflows      ci.yml, docker-cad.yml, fly-deploy.yml
cad-audit/             STEP fixtures + prior audit runs (not app code)
calculator/
  src/engine/          cost engine — 128 files, 38,224 LOC
    modules/           18 commodity driver modules
    cost-input-rules/  rules packs, 12 commodities
    dfm-geometry/
  src/ui/              22 files, 28,514 LOC (main.ts alone is 20,504)
  src/export/          6 files, 3,520 LOC (pdf, excel, pptx)
  server/              53 files, 17,130 LOC
    routes/            18 Express routers
    services/          cost-executor.ts  ← the existing seam
    utils/             cad-geometry-engine.py (2,039 LOC, OCCT/CadQuery)
  tests/               149 files, 23,141 LOC
  scripts/             42 files, 7,373 LOC
  data/should-cost.db  SQLite
```

| Item | Value | Evidence |
|---|---|---|
| Language | TypeScript 5.4, target ES2020, ESM, `strict: true` | `calculator/tsconfig.json:3-7`, `package.json:4` [Certain] |
| Web framework | Express 4.19 | `package.json:39` [Certain] |
| DB / access | better-sqlite3 12.10, **raw SQL, no ORM** | `package.json:35`, `server/db.ts` [Certain] |
| Migrations | **None.** `CREATE TABLE IF NOT EXISTS` executed at boot | `server/db.ts:15+` [Certain] |
| Frontend | **No framework.** Vanilla TS + Vite 5.2 | `package.json`, `src/ui/main.ts` [Certain] |
| Tests | Vitest 1.6 — **148 files, 2,011 tests, all passing** | verified by running `npm test` [Certain] |
| Package manager | npm, `package-lock.json` (222 KB) | [Certain] |

**Commands** (read from `calculator/package.json:5-23`): `npm ci` · `npm run dev` (:5174) ·
`npm run server` (:3002) · `npm run dev:full` · `npm test` · `npm run typecheck` · `npm run build`.
**No migration command exists** — there is nothing to run. [Certain]

---

## 3. Gate A — seam test result

### **GATE A — PASS.** Zero import or config adjustments.

Script imported `computeUniversalStack` from `src/engine/core.ts` directly and costed one part with
no server, no DB and no UI. Inputs taken verbatim from the hand-calculated reference part at
`tests/reference-part.test.ts:71-110` (Al 6061-T6 CNC bracket).

```
validation.valid = true | errors = 0

rawMaterial     2.6365384615384615
process        11.176470588235293
labour          5.6521739130434785
tooling         0.3
packaging       0.15
logistics       0.25
overhead        2.3718219555380675
margin          1.8029603934684237
TOTAL          24.339965311823722

bucket sum   =  24.339965311823722   (exact)
traceability =  8 records
operations   =  3
```

All eight buckets returned separately. Sum equals total to the last bit. [Certain]

### 3.1 Classification of every cost-arithmetic site

| Class | Where | Evidence |
|---|---|---|
| `PURE` | `computeUniversalStack` — `src/engine/core.ts:100`. Imports **only types** plus `computeLearningCurveAdjustment`, which itself has **no imports at all** | swept for `fs`/`node:`/`express`/`better-sqlite3`/`process.env`/`Date.now`/`Math.random`/`fetch`/`localStorage` — none present [Certain] |
| `PURE` | 18 commodity driver modules, `src/engine/modules/*.ts` | [Certain] |
| `SERVICE` (but pure) | `executeCalculateCost` — `server/services/cost-executor.ts:131`. Registry dispatch. **No I/O of any kind** | grep for db/env/clock/random returned nothing [Certain] |
| `ROUTE` | **None** | [Certain] |
| `UI` | **None.** The 8 apparent hits in `src/ui/main.ts:16095`, `src/export/pdf.ts:687` etc. are display-only `× 100` percentage formatting | [Certain] |
| `SQL` | **None found** | searched; absence of evidence [Likely] |

**An adapter already exists.** `executeCalculateCost(input: CostToolInput): CostToolResult` takes
`{commodity, params}`, dispatches through `COMMODITY_MAP`, and returns the eight buckets, total,
factory cost, top drivers and DFM opportunities. It was built for the agentic `calculate_cost` tool
(`server/routes/agent.ts`) and is the seam a bulk module would call. [Certain]

---

## 4. Determinism check

### **PASS.** 5 identical runs, byte-identical every time.

| Path | md5 of 8 buckets + total, 5 runs |
|---|---|
| `DEFAULT_RATE_LIBRARY` | `514d153b1c896e35bf94833e381ec535` × 5 [Certain] |
| `buildRegionalLibrary(…, 'CN')` | `a61f0e55ff30051bc5f1960b066f8661` × 5 [Certain] |

**One caveat, metadata only.** `buildRegionalLibrary` stamps `new Date()` into `lastModified`
(`src/engine/regional-rates.ts:568`) and `effectiveDate` (`:652`) — observed as `"2026-08-14"`. It
does **not** reach any of the eight buckets, but it would break a naive byte-comparison of a
serialised rate library or of a report that prints those fields. [Certain]

Non-determinism exists elsewhere in `src/engine/` but **not in the cost path**: `assembly.ts:74`
(`Date.now`, `Math.random`, localStorage), `sw-should-cost.ts:997,1025` (`Math.random`, Monte Carlo
for the software commodity), `uncertainty.ts` (Monte Carlo band, an intelligence layer not the
headline). `drift-monitor.ts:45`, `landed-cost.ts:302` and `rate-freshness.ts:55,111,138` take the
clock as an **injectable parameter with a default**, so they are controllable. [Certain]

---

## 5. Engine contract

**Entry point** — `src/engine/core.ts:100`:
```ts
export function computeUniversalStack(
  input: UniversalStackInput,
  library: RateLibrary
): PartCostResult
```
Validation is a separate pure call: `validateStackInput(input, library): ValidationResult`
(`core.ts:14`). [Certain]

### Input — `UniversalStackInput`, `src/engine/types.ts:187-209`

| Field | Type | Req? | Units | Notes |
|---|---|---|---|---|
| `partName` | `string` | yes | — | label only |
| `rawMaterial` | `RawMaterialInput` | yes | — | `types.ts:115-135` |
| `operations` | `OperationInput[]` | yes | — | `types.ts:151-173` |
| `tooling` | `ToolingInput` | yes | — | `{totalToolingCost, amortizationVolume, mode}` |
| `packagingPerPart` | `number` | yes | GBP/part | |
| `logisticsPerPart` | `number` | yes | GBP/part | |
| `overheadPct` | `number` | yes | fraction | % of factory base |
| `marginPct` | `number` | yes | fraction | % of subtotal |
| `learningCurve` | `LearningCurveConfig` | no | — | no default applied |
| `annualVolume` | `number` | no | pieces/yr | **only used when `learningCurve.enabled`** — `core.ts:220` |
| `programmeYears` | `number` | no | years | documented as moving **no** number — `types.ts:200-208` |

`RawMaterialInput`: `materialId` (string), `netWeightKg` (kg), `materialUtilization` (fraction),
optional `directCost` (GBP, bypasses weight path), `consumablesCostPerPart` (GBP).
`OperationInput`: `operationName`, `machineId`, `labourId`, `cycleTimeHr` (**hours**),
`partsPerCycle`, `oee` (fraction), `manning`, `labourTimeHr` (**hours**), `labourEfficiency`,
optional `benchOperation` (boolean). Units are stated in the type comments, not enforced. [Certain]

### Output — `PartCostResult`, `types.ts:258-269`

Eight buckets returned **separately** as `Breakdown8Bucket` (`:230-239`), plus `factoryCost`,
`subtotal`, `total`, `toolingNRE?`, `operationDetails[]` (per-op process cost, labour cost, machine
rate used, labour rate used, cycle time, OEE, manning), `traceability[]` (every rate used with its
id, source note and confidence), `learningCurveApplied?`, `warnings?`. [Certain]

**Intermediate values are exposed** — `operationDetails` gives cycle time and rate per operation;
gross mass is not returned directly but is derivable from `netWeightKg / materialUtilization`.
[Certain]

### Commodity dispatch

Plain object registry: `COMMODITY_MAP` in `server/services/cost-executor.ts`, `commodity: string` →
`(params) => CommodityDrivers`. A new commodity is registered by adding one key. Unknown keys are
rejected with a message listing valid values (`cost-executor.ts:154`). [Certain]

### Rate lookup

**Injected argument.** `computeUniversalStack(input, library)` — the library is a parameter, never
imported inside the engine. `executeCalculateCost` supplies `DEFAULT_RATE_LIBRARY` (imported module
constant, `src/engine/rate-library.ts:29`). `buildRegionalLibrary(base, region)` returns a rebuilt
library for any of 20 regions. This is the cleanest possible arrangement for bulk: a caller can pass
a pinned library per run. [Certain]

---

## 6. Hidden defaults audit

**`core.ts` applies NO defaults.** A grep for `??`, `||` and numeric fallbacks across the cost path
returns nothing. Every field is mandatory and used exactly as given. [Certain] The defaults live one
layer up, in the two callers, and they differ.

| Value | Collected or defaulted | Where |
|---|---|---|
| annual volume | **Collected** in UI (`main.ts:12481`); **never passed** by the headless executor | `cost-executor.ts:160-178` — absent from the `UniversalStackInput` it builds [Certain] |
| programme life | Collected, UI only (`main.ts:12484`). Moves no number by design | `types.ts:200-208` [Certain] |
| region / country | Collected in UI via `#mfg-region-selector`. **Unreachable headlessly** — executor hardcodes `DEFAULT_RATE_LIBRARY` | `cost-executor.ts:140` [Certain] |
| currency / FX | Not a cost input. Library is GBP-base; `fxToGBP` per region is display-side | `regional-rates.ts:37` [Likely] |
| overhead % | **Defaulted 0.12** headlessly; collected in UI | `cost-executor.ts:136`; `main.ts:12469` [Certain] |
| SG&A % | **Not modelled separately** — folded into overhead | [Certain] |
| profit / margin % | **Defaulted 0.08** headlessly; collected in UI | `cost-executor.ts:137`; `main.ts:12470` [Certain] |
| packaging | **Defaulted 0.15** headlessly | `cost-executor.ts:138` [Certain] |
| logistics | **Defaulted 0.25** headlessly | `cost-executor.ts:139` [Certain] |
| scrap credit rate | From the material record (`scrapRecoveryPricePerKg`), not defaulted in the engine | `rate-library.ts` material entries [Certain] |
| material utilisation | **Mandatory input**, no default | `types.ts:118` [Certain] |
| machine rate | **Built up from components** via `computeMachineRateFromBuildup` — depreciation, maintenance, energy, floor, indirect, finance ÷ (hours × utilisation) | `rate-library.ts:9-26` [Certain] |
| OEE | **Mandatory per operation**, no default | `types.ts:157` [Certain] |
| labour allocation | **Mandatory** `manning` + `labourEfficiency` per operation | `types.ts:158-160` [Certain] |

**Commodity modules do apply silent defaults, heavily.** Count of `inputs.x ?? default` per module:
`pcba.ts` 16 · `extrusion.ts` 15 · `sheet-metal-fab.ts` 12 · `injection-moulding.ts` 10 ·
`gear.ts` 10 · `sheet-metal.ts` 9 · `thermoforming.ts` 8 · `surface-finishing.ts` 7 ·
`cast-and-machine.ts` 6 · `forging.ts` 5. [Certain] These are the values a 500-part run would
silently substitute. Enumerating all ~100 with `file:line` was not attempted in this pass —
**UNKNOWN, would require a per-module sweep**, which is mechanical but not yet done.

One module throws rather than defaulting: `computeMachiningDrivers` raises `TypeError` on a missing
`setup` object (`src/engine/modules/machining.ts:95`) — mandatory nested field, no default. Recorded,
not fixed. [Certain]

---

## 7. Vocabulary inventory (verbatim keys)

### 7.1 Commodity keys — **four copies, three of them disagreeing**

`CommodityType`, `src/engine/types.ts:4-26` — **22**, verbatim and in source order:
```
machining sheet_metal sheet_metal_fab injection_moulding blow_moulding extrusion
thermoforming rotational_moulding casting forging gear painting biw_assembly
pcb_fab pcba cast_and_machine rubber composites wiring_harness cad_analysis
assembly automotive_software
```

`COMMODITY_MAP`, `server/services/cost-executor.ts` — **18**, verbatim and in source order:
```
machining sheet_metal sheet_metal_fab injection_moulding blow_moulding extrusion
thermoforming rotational_moulding casting forging painting biw_assembly pcb_fab
pcba cast_and_machine rubber composites wiring_harness
```

`index.html` picker tiles — **23** unique `data-commodity` values:
```
ai_agent assembly automotive_software biw_assembly blow_moulding cad_analysis
cast_and_machine casting composites extrusion forging gear injection_moulding
machining painting pcb_fab pcba rotational_moulding rubber sheet_metal
sheet_metal_fab thermoforming wiring_harness
```

`src/engine/cost-input-rules/commodities/` — **12** rules packs:
```
blow-moulding cast-and-machine casting composites forging gear injection-moulding
machining rotational-moulding rubber sheet-metal thermoforming
```
(note: hyphenated filenames, underscored keys elsewhere)

**Disagreements** [Certain]:
- `gear` — in type, UI and rules packs; **missing from `COMMODITY_MAP`**. The headless path cannot
  cost a gear.
- `ai_agent` — in UI only; **not in the type union**.
- `cad_analysis`, `assembly`, `automotive_software` — in type and UI; not in `COMMODITY_MAP` (these
  three are arguably not costing commodities).

**Validation:** the only guard is `COMMODITY_MAP[commodity]` returning undefined →
structured error (`cost-executor.ts:150-156`). Arbitrary strings are rejected there but **nothing
validates the UI or type-level lists against each other.** [Certain]

### 7.2 Process keys

**Processes are not modelled separately from commodities.** There is no process registry; a
commodity module emits `OperationInput[]` whose `operationName` is a free string set by the module
(e.g. `'Paint Line'`, `'Shot Blast'`, `'Masking / de-masking'`). Arbitrary strings can enter —
`operationName` is never validated. [Certain]

### 7.3 Material keys

`DEFAULT_RATE_LIBRARY.materials` in `src/engine/rate-library.ts` (246 KB file). Record shape,
verbatim from `rate-library.ts:147`:
```ts
{ id: 'mat-dc01-gi', grade: 'DC01 GI (Hot-dip Galvanised)',
  category: 'Galvanised Steel Sheet', pricePerKg: 1.06,
  scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 7850, region: 'UK',
  effectiveDate: '2026-07', sourceNote: '…', confidence: 'Medium' }
```
Properties held: price, scrap recovery price, density, region, effective date, source note,
confidence. **No mechanical properties.** Full key list not enumerated in this pass —
**UNKNOWN, would require parsing the 246 KB library**; mechanical. [Certain on shape]

### 7.4 Secondary operation / surface / heat treatment keys

Surface treatment — `SURFACE_STAGES`, `src/engine/surface-treatment-data.ts`, **25** keys:
```
degrease rinse pickle phosphate iron_phosphate zirconium di_rinse shot_blast
mass_finish dry_off flash_off cure_oven masking demask zinc_plate zinc_nickel
anodise passivate strip_replate zinc_flake galvanise e_coat powder_coat
impregnation h2_bake
```
Heat treatment — `src/engine/gear-heat-treat-data.ts`, gear-specific routes:
`case_hardening lpc_carburising carbonitriding quench_temper martempering
austempering nitriding fnc induction_hardening none` [Certain]

### 7.5 Enums used in cost inputs

`ManufacturingRegion`, `src/engine/regional-rates.ts:6-8` — **20**, verbatim:
```
UK DE FR IT ES PL CZ RO HU SE NL TR CN IN MX US TH VN BR KR
```
`ToolingMode`, `types.ts:27`: `amortized | one_time_nre`
`DieType`, `modules/sheet-metal.ts:11`: `single_stage | progressive | transfer | fine_blanking`
`CastingSubtype`: `hpdc | sand | gravity | investment`
`SurfaceCostBasis`: `area | mass | piece`
`CoatType`: `e_coat | primer | basecoat | clearcoat | powder`
Currencies: per-region `currency` field in `REGIONAL_DATA`, not a standalone enum. [Certain]

All of these are TypeScript union types — **compile-time only**. At runtime, `zod` is imported in
`server/routes/agent.ts:5` but the commodity/region values reaching the engine are not schema-validated.
[Likely]

---

## 8. Rate library

**Rates are not versioned. You cannot reproduce a cost from three months ago.** [Certain]

1. **Where:** `src/engine/rate-library.ts` (246 KB, the `DEFAULT_RATE_LIBRARY` constant, `:29`),
   `src/engine/regional-rates.ts` (38 KB, `REGIONAL_DATA` + `buildRegionalLibrary`). Runtime
   overrides in SQLite tables `rate_library`, `rate_overrides`, `material_price_overrides`
   (`server/db.ts:15`, and `server/routes/rate-library.ts`). [Certain]
2. **Versioned?** **No.** `rate_library` is `(id, data, updated_at, updated_by)` — a single-row JSON
   blob, overwritten in place. No history table, no snapshot, no `rate_version` column anywhere in
   the schema. The library object carries `version: '2.1.0'` and `lastModified: '2026-06-16'`
   (`rate-library.ts:30-31`) but these are hand-edited strings, not a mechanism. [Certain]
3. **Representative record:** see §7.3 for a material; a machine is built from a `MachineRateBuildup`
   `{annualDepreciation, maintenance, energy, floorSpace, indirectSupport, financeCost,
   annualAvailableHours, machineUtilization}` and `computedRatePerHr` is derived, not stored raw
   (`rate-library.ts:9-26`). [Certain]
4. **Coverage:** UK is the base library; 20 regions are derived by multiplier. Gaps not enumerated
   — **UNKNOWN, would require auditing which (commodity, region, material) triples resolve.**
5. **Hard-coded numbers in cost paths:** present and numerous. Representative, not exhaustive
   [Certain that these exist; **Guessing** that the list below is complete — it is not]:
   `cost-executor.ts:136-139` (0.12 / 0.08 / 0.15 / 0.25); `surface-finishing.ts` oee `0.85`,
   `PLATING_REWORK_MULTIPLE = 4.5`; `surface-geometry-bridge.ts` `SHAPE_FACTOR_TOLERANCE = 0.25`;
   `gear-heat-treat-rate.ts` `ENERGY_FLOOR_RATIO = 2.5`; plus ~100 `?? default` values across the
   commodity modules (§6). A full enumeration was **not** completed.
6. **Who can edit / audited?** `server/routes/rate-library.ts` behind JWT auth; `updated_by` is
   recorded on the row but **the previous value is not retained**, so a change is attributable but
   not reversible or diffable. [Certain]

---

## 9. Data model

1. **Tables** (`server/db.ts`): `users`, `otp_tokens`, `app_settings`, `rate_library`,
   `rate_overrides`, `material_price_overrides`, `price_fetch_log`, `projects`, `bom_items`,
   `scenarios`, `supplier_quotes`, `shared_costings`, `dfm_jobs`, `knowledge_cases`,
   `drift_dismissals`, `finding_outcomes`. [Certain]

   **There is no `costings` table.** A computed cost is not persisted as a first-class record.
   `shared_costings` (`:123-130`) stores `(id, part_name, payload TEXT, created_by, created_at,
   expires_at)` — an opaque blob **with an expiry**. `scenarios` (`:22-29`) likewise stores
   `data TEXT`. [Certain]

2. **Migrations:** none. `server/db.ts:15+` runs `CREATE TABLE IF NOT EXISTS` at boot. Adding
   columns to an existing table has no mechanism. [Certain]

3. **Immutable or overwritten?** Not applicable — results are not stored. Where blobs are stored
   (`scenarios`, `shared_costings`) they are keyed by id and replaced. [Certain]

4. **Engine/rate version stored with a result?** **No.** `RULE_ENGINE_VERSION` and
   `CAD_PROMPT_VERSION` are used as *cache keys* for CAD analysis
   (`server/routes/cad.ts:588`, `cost-input-rules/engine.ts:101`) but no cost result carries an
   engine or rate version. [Certain]

5. **Constraints a `bulk_*` table set must respect:** one index on `dfm_jobs(status, queued_at)`
   (`db.ts:121`). No foreign keys, triggers or cascades observed on the costing-adjacent tables.
   [Likely — read the schema block, did not exhaustively check pragmas]

---

## 10. Async capability

**A working precedent already exists.** `dfm_jobs` (`server/db.ts:107-121`) is a real job table:
`id, status (queued|running|done|error), commodity, part_name, file_path, request, result, error,
created_by, queued_at, started_at, finished_at`, indexed on `(status, queued_at)`. [Certain]

- **Technology:** none — no BullMQ, no Redis, no external queue. It is an **in-process drain loop**
  over SQLite: `server/utils/dfm-job-runner.ts:137 drain()` selects the oldest queued row, respects
  `MAX_CONCURRENT`, and is guarded by a single `drainPromise` so only one drain runs. [Certain]
- **Enqueue:** `INSERT INTO dfm_jobs (…) status='queued'` (`dfm-job-runner.ts:102`).
- **Failure handling:** status set to `'error'` with the message (`:199`). **No retry mechanism
  observed.** [Certain]
- **UI observes progress:** by polling the job row (`:111 SELECT * FROM dfm_jobs WHERE id = ?`).
  [Likely — read the getter, did not trace the UI poll]

Other long-running work: `setInterval` tickers for commodity prices
(`server/routes/commodities.ts:184`) and drift scan (`server/routes/knowledge.ts:52`, `.unref()`d);
Python geometry via `child_process.spawn` behind a semaphore (`server/utils/geometry-bridge.ts:1`).
[Certain]

**Fit for a 20–60 min bulk run:** the `dfm_jobs` pattern is directly reusable and would need no new
infrastructure. Its limitation is that the drain is in-process — a server restart mid-run abandons
`running` rows with no recovery sweep observed. [Likely]

---

## 11. Extension points

1. **Registry pattern:** yes — `COMMODITY_MAP` (`cost-executor.ts`) for costing, and
   `src/engine/cost-input-rules/commodities/` for rules packs (12 files, registered centrally).
   Adding capability is a one-key change in both. [Certain]
2. **Feature flags:** **none found.** Searched `featureFlag`, `FEATURE_`, `isEnabled(` — only hits
   are unrelated (`feature_cost` is a DFM cost-impact kind, `FEATURE_KINDS` is hole/boss/pocket).
   [Certain]
3. **API namespace:** 18 routers mounted at `/api/*` (`server/index.ts:67-84`): `auth, cad, pcb,
   projects, rate-library, telemetry, aichat, sync, agent, dfm, news, commodities, prices, quotes,
   bom, rfq, knowledge, share`. **`/api/bulk/*` is free — no collision.** [Certain]
4. **UI navigation:** commodity tiles are hard-coded in `index.html` as
   `.cpicker-tile[data-commodity="…"]`, wired up in `src/ui/main.ts:19775`. One new nav item = one
   tile in `index.html` plus a handler branch. [Certain]
5. **Existing bulk/batch/import:** **none.** Searched routes for bulk/batch — the only hits are
   PCB panel batching and prompt text. `bom_items` exists (a BOM is a multi-part structure) but is
   not a bulk-costing path. [Certain]

---

## 12. Regression baseline readiness

**The existing reference test cannot detect rate drift.** `tests/reference-part.test.ts:125`
defines `handCalc(lib: RateLibrary)` and derives every expected figure from the library passed in
(`lathe.computedRatePerHr`, `labour.fullyLoadedRatePerHr`, …). It therefore proves the engine agrees
with the hand formula — a real and useful property — but **the expected numbers move with the rate
library**. The file's own header documents £22.00/hr skilled labour (`:19`) while the library now
holds £26.00/hr (`rate-library.ts:1429`), and the documented total of £23.269393 (`:54`) is
£24.339965 today. The test passes throughout. [Certain]

1. **Tests covering cost calculation:** 148 files / 2,011 tests, all passing. Coverage percentage
   not measured — **UNKNOWN, no coverage tool configured in `package.json`.** [Certain on counts]
2. **Saved example parts / fixtures:** `tests/fixtures/` holds `cad-parts/` (4 STEP files),
   `pcb-boards/`, `commodity-rules-prompt/`. `cad-audit/parts/` holds ~8 real STEP files.
   `scripts/worked-examples.ts` regenerates **2** end-to-end examples from the engine and pins ~40
   figures — the closest thing to a frozen baseline, and it is explicitly **not** a unit test
   (`worked-examples.ts:14-16`). [Certain]
3. **Could you capture 30–50 parts as frozen JSON without modifying application code?** **Yes.**
   `computeUniversalStack` and `executeCalculateCost` are both pure and importable; a script under
   `scripts/` or `/tmp` can drive them and serialise the result. The only obstacle is that **30–50
   realistic input sets do not exist today** — there are 2 worked examples and a handful of test
   fixtures, so the inputs would have to be authored. [Certain]
4. **CI:** `.github/workflows/ci.yml` — `npm ci` → `tsc -p tsconfig.build.json --noEmit` →
   `npm test` → `npm run build` → `playwright install chromium` → `npm run test:e2e` →
   `npm run test:visual`, uploading visual diffs. Also `docker-cad.yml` (builds the CAD image and
   measures a committed STEP fixture inside it) and `fly-deploy.yml`. [Certain]

---

## 13. Risk register

| # | Risk | Severity | Evidence |
|---|---|---|---|
| 1 | **No rate versioning and no stored costings.** A bulk run's numbers cannot be reproduced or explained later | **Critical** | `server/db.ts:15-20`; no `costings` table [Certain] |
| 2 | **Reference test cannot detect rate drift** — the byte-identical guarantee has no anchor today | **Critical** | `reference-part.test.ts:125`; total moved £23.27 → £24.34 unnoticed [Certain] |
| 3 | **~100 silent defaults in commodity modules.** Harmless under human review of one part; 500 quietly-wrong numbers in bulk | **High** | counts in §6 [Certain]; full enumeration not done |
| 4 | **`gear` missing from `COMMODITY_MAP`** — bulk cannot cost a commodity the UI offers | **High** | §7.1 [Certain] |
| 5 | **Region unreachable headlessly**; `annualVolume` never passed by the executor | **High** | `cost-executor.ts:140,160-178` [Certain] |
| 6 | **Four disagreeing commodity lists** — an alias table built from the wrong one silently drops commodities | **Medium** | §7.1 [Certain] |
| 7 | **No migration mechanism.** Adding `bulk_*` tables is fine; altering an existing one has no path | **Medium** | `server/db.ts` [Certain] |
| 8 | **`new Date()` in `buildRegionalLibrary`** breaks naive byte-comparison of a serialised library | **Low** | `regional-rates.ts:568,652` [Certain] |
| 9 | **In-process job drain**; a restart abandons `running` rows with no recovery sweep observed | **Low** | `dfm-job-runner.ts:137` [Likely] |
| 10 | `computeMachiningDrivers` throws on missing `setup` rather than defaulting — a malformed bulk row kills the item | **Low** | `modules/machining.ts:95` [Certain] |

---

## 14. Effort estimate

Assumptions: one developer familiar with this codebase; TypeScript throughout; the `dfm_jobs`
pattern reused rather than a new queue introduced; "done" means typechecked, tested and CI-green.

| Line | Days | Basis |
|---|---:|---|
| Extraction | **0** | Not required — Gate A passed with zero adjustments [Certain] |
| Adapter | **2–3** | `executeCalculateCost` already exists; work is injecting a rate library, passing `annualVolume`/region, and registering `gear` [Certain] |
| Validator + template | **4–6** | Must encode the ~100 module defaults as explicit, reportable choices — this is the real work, and its size depends on the unfinished sweep in §6 [Likely] |
| Worker + jobs | **3–4** | `dfm_jobs` + `drain()` pattern is directly reusable; add a `bulk_*` table set and a restart-recovery sweep [Likely] |
| Agent layer | **UNKNOWN** | Cannot estimate — depends entirely on what the agent is required to decide, which this audit was not given [Certain that I cannot estimate it] |
| Review UI | **4–6** | Vanilla TS, no component framework, and `main.ts` is already 20,504 lines — a new view is cheap to add and expensive to add *well* [Likely] |
| **Rate versioning + result persistence** | **5–8** | *Not in the original split, but risks 1 and 2 make it a prerequisite for a bulk run to be meaningful* [Likely] |

---

## 15. Unknowns

| What | Why it could not be determined | What would settle it |
|---|---|---|
| Complete list of module-level silent defaults | ~100 across 18 modules; a per-module sweep with `file:line` was not attempted in this pass | Mechanical sweep, ~half a day |
| Complete material key list | 246 KB library; enumerating every `id` was out of proportion to the question | Parse `rate-library.ts` materials array |
| Rate coverage gaps by (commodity, region, material) | Would require resolving every triple against the library | Scripted resolution sweep |
| Test coverage percentage | No coverage tool configured in `package.json` | Add `vitest --coverage` for one run |
| How the UI polls `dfm_jobs` | Read the server-side getter, did not trace the client | Follow `/api/dfm` consumers in `main.ts` |
| Whether `bom_items` could serve as a bulk input schema | Out of scope for the tasks given | Read `server/routes/bom.ts` and the table shape |
| Agent-layer effort | The agent's required decisions were not specified | A spec of what the agent must decide |
