# Automotive Software Costing — 360° review (October 2026)

Scope: the CostVision module that costs automotive software for ICE, MHEV, PHEV and BEV vehicles.
Every finding is tagged **Verified** (reproduced by running the code or reading the exact line),
**Likely** (strong evidence, not fully proven) or **Unverified** (could not be confirmed).
File references are `calculator/<path>:<line>`. No fixes have been made — section 6 is the proposal.

---

## 1. Workflow map

### Files and what they do

| File | Role | Key functions / data |
|---|---|---|
| `src/engine/sw-should-cost.ts` (1,291 lines) | The costing engine — all arithmetic | `SW_MODULES` :288 (49 modules, 43 on by default), `computeModuleCost` :875, `computeSWProgram` :1113, `runMonteCarlo` :1025, `buildPhases` :1096, `_recomputeTotal` :1241 (sensitivity), `defaultSWProgramInputs` :1267, `swRegionFor` :40 (country → engineering hub), benchmark table :1221 |
| `src/engine/sw-rate-library.ts` (135) | The rate book — every rate carries a text source, date and confidence | `DEFAULT_SW_RATE_LIBRARY` :49 (base £28,000/person-month, region, dev-source, ASIL, complexity, reuse multipliers), `resolveRateLibrary` :121 (merges a company override) |
| `src/engine/sw-validation.ts` (147) | Back-test against 7 published programmes | `SW_VALIDATION_CASES` :65, `runValidation` :113 (±35 % band on the total only) |
| `src/ui/panels/sw-should-cost-ui.ts` (2,572) | The whole screen: guided wizard, advanced form, vehicle demos, results, Excel/PDF export, saved configs, AI narrative | `readConfig` :1194, `readWizStep` :480, `buildVehicleInputs` :1404, `SW_VEHICLE_DEMOS` :1271 (+ 12 powertrain study variants :1375–1401), `renderResults` :1467, `generateAIInsights` :1858, `exportSWExcel` :1947, `exportSWPDF` :2071 |
| `server/routes/rate-library.ts` :124–166 | Company rate book: download template, upload, switch, reset (admin) | `/api/rate-library/sw/*` |
| `server/utils/sw-rate-library-xlsx.ts` | Builds / parses the company rate workbook | `buildSWRateWorkbook` :42, `parseSWRateWorkbook` :77 |
| `server/data/rate-library-store.ts` :137–165 | Stores the company book in SQLite | one row, overwritten, no history |
| `server/routes/aichat.ts` :46 | The one AI call (narrative only) | model `claude-haiku-4-5` |
| `src/ui/main.ts` :12055, :14357, :19758, :20117 | Opens the panel; country picker → engineering hub | |
| `scripts/gen-sw-report.ts`, `gen-l460-deepdive.ts`, `gen-allmodels-deepdive.ts` | Pre-generate the static HTML reports the "View full report" buttons open | built-in rates only |

### Data sources

| Data | Where | Units | Has a source? |
|---|---|---|---|
| Base labour rate £28,000 / person-month | `sw-rate-library.ts:53` | £/PM, before overhead | Text only ("Hays 2025 + IR35 norms"), no link — **Unverified** |
| Region, dev-source, ASIL, complexity, reuse multipliers | `sw-rate-library.ts:60–108` | ratios | Text descriptions ("industry effort studies"), no document or link — **Unverified** |
| 49 module definitions: base person-months, test / integration / calibration fractions, maintenance %/yr, tool / IP / cloud £/yr | `sw-should-cost.ts:288–854` | PM, ratios, £/yr | None per figure — **Unverified** |
| Model constants (team-seniority 1.20 / 0.75, effort split, test split, cyber %, homologation £, phase split, Monte Carlo ranges) | `sw-should-cost.ts:861–873, 881, 908–912, 924–928, 947–948, 1047–1058, 1098–1102, 1131` | ratios, £ | None — **Verified** (no source in code) |
| 7 benchmark programmes (£M, £/vehicle) | `sw-should-cost.ts:1222–1228`, duplicated in `sw-validation.ts:65–108` | £, £/vehicle | Names only (e.g. "Berylls 2023", "Morgan Stanley"), no links; two entries carry different source names in the two files. Two spot-checked by web search — **not found** |
| Powertrain presets (which modules are off for ICE / MHEV; PHEV/BEV complexity) | UI only: `sw-should-cost-ui.ts:1269, 1375–1390` | — | None |

### Flow from input to cost

```
User (wizard or advanced form)
  └─ readWizStep :480 / readConfig :1194   → SWProgramInputs (region, dev source, life, volume,
                                              senior share, overhead, base rate, per-module ASIL /
                                              complexity / reuse / custom PM, include maint / cloud)
     + company rate book (if uploaded)  ← syncSWRateLibrary :40 ← /api/rate-library/sw/active
  └─ computeSWProgram :1113
       ├─ resolveRates :271              → base rate × multipliers from the rate book
       ├─ for each enabled module: computeModuleCost :875
       │     rate/PM → effort (PM) → dev £ → test, integration, cyber, calibration, ML-data £
       │     → tool + IP licences, cloud, maintenance × years → NRE, lifecycle, total, £/vehicle
       ├─ homologation (opt-in, fixed £) :1130
       ├─ summary totals, £/vehicle :1134–1162
       ├─ sensitivity (6 re-runs) :1176, benchmarks :1221, phases :1233, Monte Carlo :1236
  └─ renderResults :1467 → cards, tables, insights (rule text), benchmarks
  └─ optional: Excel :1947 / PDF :2071 / AI narrative :1858 (text only)
```

**Powertrain is not an engine input.** ICE / MHEV / PHEV / BEV exist only as UI presets that switch the nine
"EV powertrain" modules off or change their complexity (`sw-should-cost-ui.ts:1269, 1375–1390`). — **Verified**

**AI never sets a number in the cost.** The only AI call (`generateAIInsights` :1858) writes a narrative that
is shown, not parsed, not exported. — **Verified.** But see bug B13: it asks the model to invent savings figures.

---

## 2. Step-by-step trace (one sample input)

**Sample:** the default programme — UK, OEM in-house, 10-year life, 80,000 vehicles/yr, 50 % senior team,
overhead 1.15, maintenance and cloud included, all 43 default modules at their default ASIL / complexity,
reuse "Medium". Traced module: **BMS Core Software** (ASIL-D, Very High complexity). All money in **GBP**.
The hand calculation below reproduces the engine to the penny. — **Verified**

| # | Step | Formula | Value | Source of each number | Where |
|---|---|---|---|---|---|
| 1 | Base rate | library value | £28,000 / PM | Rate book text: "UK day-rate × 20 days; Hays 2025 + IR35" — no link (**Unverified**) | `sw-rate-library.ts:53` |
| 2 | Region × dev source | UK 1.00 × OEM 1.00 | 1.00 | Rate book text (**Unverified**) | `sw-rate-library.ts:61, 73` |
| 3 | Seniority factor | 0.5 × 1.20 + 0.5 × 0.75 | 0.975 | **Hard-coded, no source** (1.20 / 0.75) | `sw-should-cost.ts:881` |
| 4 | Overhead | input | 1.15 | Engine default; comment explains 1.15 = facilities only | `sw-should-cost.ts:1277` |
| 5 | Loaded rate | 28,000 × 1 × 1 × 0.975 × 1.15 | **£31,395 / PM** | — | `:882` |
| 6 | Base effort | module value | 90 PM | Module table, no source; comment says it is **already "at listed ASIL/complexity"** | `:69, :294` |
| 7 | Reuse | × 0.60 (Medium) | 54 PM | Rate book (**Unverified**) | `sw-rate-library.ts:105`, `:902` |
| 8 | ASIL-D development | × 3.20 | 172.8 PM | Rate book: "ISO 26262 ASIL-D process overhead — industry effort studies" (**Unverified**) | `sw-rate-library.ts:84`, `:906` |
| 9 | Effort split | reqs 12 %, arch 14 %, algorithm 22 % × complexity 2.80, implementation 37 % × 1.27, safety 15 % | 258.5 PM costed | Split and 0.15 implementation weight **hard-coded, no source**; complexity 2.80 from rate book | `:907–912`, `sw-rate-library.ts:99` |
| 10 | Development £ | 258.5 PM × £31,395 | **£8,115,341** | — | `:914–920` |
| 11 | Testing | dev × 0.40 × (1.80 ÷ 0.38) = dev × 1.895 | £15,376,436 | 0.40 module table; 1.80 rate book; 0.38 "calibrated" constant | `:890, :923`, `:861` |
| 12 | Integration | dev × 0.18 | £1,460,761 | Module table, no source | `:945` |
| 13 | Cybersecurity | dev × 14 % (because ASIL-D) | £1,136,148 | **Hard-coded 14 / 10 / 8 %, keyed on safety level, no source** | `:947–949` |
| 14 | Calibration | dev × 0.08 | £649,227 | Module table, no source | `:952` |
| 15 | Tool licences | £52,000 / yr × 10 yr | £520,000 | Module table, no source; counted as NRE | `:965, :972` |
| 16 | IP licences | £18,000 / yr × 10 yr | £180,000 | Module table, no source | `:966` |
| 17 | Maintenance | dev × 12 % / yr × 10 yr | £9,738,410 | Module table, no source | `:969–970` |
| 18 | **Module total** | NRE £27,257,914 + lifecycle £9,918,410 | **£37,176,323** (£46.47 / vehicle) | — | `:972–982` |
| 19 | Programme total | Σ 43 modules | **£494.2 M**, **£618 / vehicle** (NRE £285.1 M) | — | `:1134–1162` |
| 20 | Uncertainty | Monte Carlo, 1,000 runs, seeded | P10 £457.8 M · P50 £511.1 M · P90 £563.0 M | Ranges and 55 % correlation **hard-coded, no source** | `:1019, :1047–1058` |

**Units:** effort in person-months; money in GBP only (no currency conversion anywhere — **Verified**).
**AI:** no AI produces or changes any number in this trace — **Verified**.

### Hard-coded numbers with no source (all **Verified** as unsourced in code)
- Seniority factors 1.20 / 0.75 (`:881`); effort split 0.12 / 0.14 / 0.22 / 0.37 / 0.15 (`:908–912`); implementation complexity weight 0.15 (`:864`).
- Test sub-split 0.30 / 0.18 or 0.08 / 0.10 / 0.08 / 0.09 (`:924–928`).
- Cybersecurity 14 / 10 / 8 % keyed on **safety** level (`:947–948`).
- Safety reuse floors 0 / 0 / 0.40 / 0.50 / 0.60, test reference 0.38, ML data 15 %, schedule penalty 1.5 (`:861–873`) — described as "calibrated against the back-test", but the back-test figures are themselves unsourced (below).
- Homologation £1.5 M + £0.8 M + £0.6 M / £0.25 M (`:1131`); phase split 5 / 15 / 50 / 20 / 10 % (`:1098–1102`); Monte Carlo ranges and correlation (`:1019, :1047–1058`).
- Every per-module figure in the 49-module table (`:288–854`).
- UI: overhead fallback 1.60 (`sw-should-cost-ui.ts:1201`), dev-source table 1.00 / 0.88 / 0.72 (`:1720–1725`), demo overheads 1.55–1.62 (`:1380–1383`), insight savings "30–50 %" and "25–35 %" (`:1762, :1779`).

---

## 3. Bugs and errors

Reproduce everything below from `calculator/`: `npx tsx scripts/sw-review/trace.ts` (section 2),
`npx tsx scripts/sw-review/edge.ts` (edge cases, determinism), `npx tsx scripts/sw-review/powertrains.ts` (powertrain table).

**Tests:** the module's own 49 tests pass (`sw-should-cost`, `sw-audit`, `sw-validation`, `sw-rate-library-xlsx`); the
full suite passes (3,455). **Determinism:** the same input run 3 times gives byte-identical results, including the
Monte Carlo (it is seeded) — **Verified**.

| ID | Bug | Severity | Where | How to reproduce | Tag |
|---|---|---|---|---|---|
| B1 | Base effort is defined "at listed ASIL / complexity", then multiplied by the ASIL and complexity factors again — at default settings an ASIL-D, Very-High module is inflated twice | **High** | `sw-should-cost.ts:69` vs `:902–912` | BMS: 90 PM "at ASIL-D / Very High" becomes 258.5 costed PM | Verified (code + comment) — whether the 90 PM really already includes them is Likely |
| B2 | Uploaded company base rate never applies in the advanced form: the field defaults to £28,000 and always overrides the company book | **High** | `sw-should-cost-ui.ts:1213` + engine `:274` | Upload a book with base £35,000 → advanced Calculate still uses £28,000 | Verified (code) |
| B3 | Loading a vehicle demo silently drops the company rate book | **High** | `sw-should-cost-ui.ts:1404–1437` | Upload company rates, click a demo → costed on built-in rates | Verified (code) |
| B4 | Overhead default contradicts itself: engine 1.15 (its comment says 1.6 double-counts benefits); UI fallback 1.60, wizard tooltip "1.6 typical", every demo 1.55–1.62 → +28 % on the total | **High** | engine `:1274–1277`; UI `:1201, :462, :1380–1383` | Empty the overhead field → 1.60; 1.15 → 1.55 raises the total 28.3 % | Verified |
| B5 | Reported person-months are not the person-months costed (complexity and safety scaling left out) — BMS shows 172.8 PM, 258.5 PM are paid for; programme shows 2,390 PM | Medium | `sw-should-cost.ts:992, 1148` | Default run, compare `personMonths` with Σ buckets ÷ rate | Verified |
| B6 | Monte Carlo leaves out ML-data and homologation costs: turning them on adds £8.4 M to the total and £0 to P10/P50/P90 | Medium | `sw-should-cost.ts:1047–1058` | `includeMLDataCost` + `includeHomologation` true | Verified |
| B7 | Monte Carlo £/vehicle and the sensitivity "Production volume" row ignore the cost-recovery window; with 2-year recovery the headline is £2,043/vehicle but P50 says £639 and the sensitivity bracket (£329–£988) does not contain the base | Medium (engine only — UI never sets it today) | `:1079–1080, :1213–1217` | `costRecoveryYears = 2` | Verified |
| B8 | No input validation in the engine: negative overhead gives a negative total; negative custom PM subtracts cost; senior share 5 accepted; blank life → NaN total; unknown region → NaN; unknown module id → crash; duplicate module counted twice; base rate typed as "28" (£k) accepted → total £92.8 M | Medium (UI clamps some) | `computeSWProgram :1113`, `computeModuleCost :875` | `npx tsx scripts/sw-review/edge.ts`; e.g. `overheadMultiplier = -1` → −£257 M | Verified |
| B9 | UI silently replaces 0 life or 0 volume with 10 / 80,000 | Low | `sw-should-cost-ui.ts:1199–1200` | Type 0 in volume → costed at 80,000 | Verified |
| B10 | Changing the country after opening the panel updates only the drop-down, not the inputs; the wizard ignores it | Medium | `main.ts:19760` | Open panel in UK, switch country to India, run wizard → still UK | Verified (code); live run not done |
| B11 | Rate-provenance panel and validation always show the BUILT-IN book, even when company rates are active | Medium | `sw-should-cost-ui.ts:210, 256` | Upload company rates, open "Rate library" | Verified (code) |
| B12 | Dev-source comparison table re-prices in the UI with hard-coded 0.88 / 0.72 (ignores company rates; drift risk) | Medium | `sw-should-cost-ui.ts:1719–1731` | Override dev-source multipliers → table unchanged | Verified (code) |
| B13 | AI narrative is asked for "cost reduction opportunities **with estimated savings**" — the model invents savings figures shown beside the costing; the server prompt says "always give concrete numbers" | Medium | `sw-should-cost-ui.ts:1896`; `server/routes/aichat.ts:16` | Click "Generate AI Narrative Insights" with a key | Verified (prompt text) |
| B14 | Rule insights print unsourced savings ("licensed IP could reduce this by 30–50 %", "hybrid cloud … 25–35 %") and always say "cloud is the main driver" — at defaults maintenance (£134.9 M) is 2.6× cloud (£51.8 M) | Medium | `sw-should-cost-ui.ts:1762, 1779` | Default run, set lifecycle > 45 % | Verified |
| B15 | Per-vehicle royalties booked as flat yearly sums: voice assistant note "~£15 / vehicle" vs £220 k/yr booked (≈ £2.75 / vehicle at 80 k/yr); map data "£8–15 / vehicle / yr" vs £200 k/yr | Medium | `sw-should-cost.ts:510–512, 499–501, 966` | Read module notes vs values | Verified (arithmetic from the code's own notes) |
| B16 | Validation: published £/vehicle is inconsistent with published total ÷ (volume × life) — e.g. BMW iX £620 M ÷ 630 k vehicles = £984, listed £4,800; the "within band" test checks totals only, so per-vehicle error (MAPE 75 %) is never flagged | Medium | `sw-validation.ts:65–108, 133` | `runValidation()` | Verified |
| B17 | Benchmarks and validation figures have no links; the same figure carries different source names in two files; web spot-checks of two (BMW iX "Berylls £620 M", Tesla "Morgan Stanley") found nothing | **High** (credibility) | `sw-should-cost.ts:1222–1228`, `sw-validation.ts:65–108` | Search the named sources | Unverified (figures); Verified (no links, conflicting names) |
| B18 | Company rate workbook: keys not checked (a misspelt region is stored and ignored), a multiplier of 0 accepted, uploads not versioned | Low | `server/utils/sw-rate-library-xlsx.ts:67–72`; `rate-library.ts:145–166` | Upload a book with key "Indai" | Verified (code) |
| B19 | AI "no key" message (HTTP 200) is cached as if it were a reply | Low | `sw-should-cost-ui.ts:1933`; `aichat.ts:41` | Click AI with no key, add key, click again | Likely |
| B20 | Excel "Configuration" omits the base rate and which rate book was used; "View full report" buttons open static pages built from defaults, not the user's costing | Medium | `sw-should-cost-ui.ts:2038–2056, 2449–2472` | Export after changing inputs | Verified (code) |
| B21 | The headline total sits at about the 30th percentile of its own uncertainty range (total £494 M; P50 £511 M) — the screen does not say so | Low | `:1047–1058` (skewed ranges) | Default run | Verified |

**Each powertrain (same car — Range Rover L460 settings, UI presets):**

| Powertrain | Modules | Total | Powertrain software | Shared software | £/vehicle |
|---|---|---|---|---|---|
| ICE | 40 | £410.9 M | **£0** | £410.9 M | £685 |
| MHEV | 42 | £419.6 M | £8.6 M (thermal + regen only) | £410.9 M | £699 |
| PHEV | 49 | £539.2 M | £128.3 M | £410.9 M | £899 |
| BEV | 49 | £558.8 M | £147.9 M | £410.9 M | £931 |

All four run without errors and in a sensible order, but see section 4 for what this hides.

---

## 4. Costing method review

| Area | What the tool does | What is missing / wrong | Tag |
|---|---|---|---|
| Software size | Person-months per module from a fixed table; user may type a custom PM | No size measure (lines of code, function points, signals, features); base PM per module is unsourced | Verified |
| Effort model | PM × reuse × ASIL × complexity split across 5 activities | Not a recognised parametric model (e.g. COCOMO-style size^exponent); no diseconomy of scale; ASIL and complexity probably double-counted (B1) | Verified / Likely |
| Labour rates | £28 k/PM UK base × 9 regional hubs × dev source × seniority × overhead | Rates unsourced (text only); GBP only; one rate for all roles (no tester / safety-engineer / architect rates); overhead default contradicts itself (B4) | Verified |
| Safety (ASIL) | Dev ×1.35–3.20, test fraction 0.35–1.80, safety reuse floor | Compounding: test = dev(×3.2) × fraction(×5.1) → an ASIL-D module's testing is ~16× a QM one; no source for any factor; homologation adds a separate ISO 26262 assessor | Likely (over-statement) |
| Cybersecurity | 8–14 % of dev **keyed on the ASIL**, pen-test slice, Category F modules, R155/R156 audit (opt-in) | Cyber effort follows ISO/SAE 21434 cybersecurity assurance level (CAL), not the safety level; a QM infotainment module (highest attack surface) gets the lowest uplift | Verified (keying) |
| Validation & testing | SIL / MIL / HIL / regression / pen-test / scenario split | Split unsourced; no vehicle-level / homologation testing effort beyond the opt-in audit | Verified |
| Calibration | Fraction of dev per module | ICE engine / transmission calibration (often the largest calibration programme) is absent because ICE modules are absent | Verified |
| Licences & royalties | Tool £/yr and IP £/yr per module × years | Per-unit royalties (voice, maps, codecs, RTOS) are flat per year, not × vehicles (B15); tool licences multiplied over the full production life and counted as NRE | Verified |
| Maintenance & OTA | Maintenance % of dev per year; OTA modules; cloud £/yr | Cloud and OTA data cost do not scale with fleet size; maintenance runs over production life from year 1 (no post-SOP start) | Verified / Likely |
| Risk | Seeded Monte Carlo, sensitivity, phases | Monte Carlo misses two buckets (B6); ranges unsourced; headline not labelled with its percentile (B21) | Verified |
| **ICE** | All EV modules switched off | **No engine control, transmission, emissions / after-treatment, OBD or start-stop software at all** — ICE powertrain software costs £0 | Verified |
| **MHEV** | EV modules off except thermal + regen | No 48 V battery management, belt-starter-generator control or hybrid energy management | Verified |
| **PHEV** | EV stack at reduced complexity | No engine control, no hybrid supervisory / torque-split / mode logic; so PHEV (two powertrains) costs only 3.5 % more than BEV | Verified (modules) / Likely (should cost more) |
| **Shared vs unique** | Each variant is a separate full programme | £410.9 M of shared software (ADAS, infotainment, body, middleware, cyber, cloud) is charged in full to every variant; summing variants counts it up to four times; per-vehicle uses only the variant's own volume. No way to model a platform shared across powertrains | Verified (structure) |

### Double counting

| What | Why | Tag |
|---|---|---|
| ASIL and complexity on base effort | Base PM defined "at listed ASIL/complexity" then multiplied again (B1) | Verified (definition) / Likely (effect) |
| Overhead 1.55–1.62 in demos and UI fallback | Engine's own comment: 1.6 = benefits counted twice on a rate that already includes them (B4) | Verified |
| ASIL on testing | Test fraction rises with ASIL **and** is applied to development cost that already rose with ASIL | Likely |
| Shared software across powertrain variants | Full shared stack in every variant (above) | Verified |
| Safety assessment | ASIL uplift in every module + a separate ISO 26262 assessor in homologation | Likely (small) |

---

## 5. Market research and competitor benchmark

COMPETITOR_SECTION

---

## 6. Improvement list

| # | Issue or missing feature | Where | Impact | Effort | Priority | Fix |
|---|---|---|---|---|---|---|
| 1 | Base effort double-counts ASIL / complexity | `sw-should-cost.ts:69, 902–912` | Overstates every high-ASIL / complex module | M | P1 | Decide the definition: either base PM = nominal (QM, Medium) and re-base the 49 values, or stop multiplying the defaults; pin with a test |
| 2 | Company base rate overridden by the form; demos drop company rates | `sw-should-cost-ui.ts:1213, 1404` | A customer's own rates silently ignored | S | P1 | Send `baseRateGBP` only when typed; carry `rateLibrary` into demos; test |
| 3 | Overhead 1.15 vs 1.60 contradiction | engine `:1277`, UI `:1201, :462, :1380–1383` | ±28 % on every total | S | P1 | One default (engine 1.15), UI fallback and demos read it; tooltip corrected |
| 4 | No ICE / hybrid software modules | `SW_MODULES :288` | ICE, MHEV and PHEV powertrain software under-costed (ICE = £0) | L | P1 | Add engine control, transmission, after-treatment / OBD, 48 V BMS / BSG, hybrid supervisory modules (values must be sourced or labelled estimates) |
| 5 | Powertrain not an engine input; shared software not apportioned across variants | UI presets `:1269, :1375`; engine | Variants double-count shared software | M | P1 | Add `powertrain` + `platformVolume` (shared modules amortised over all variants) to `SWProgramInputs` |
| 6 | Benchmarks / validation figures unsourced, inconsistent | `:1222–1228`, `sw-validation.ts` | Credibility of every "vs peers" claim | S | P1 | Remove or label "unverified"; add URL fields; fix per-vehicle consistency; until sourced, hide the peer-median insight |
| 7 | Unsourced savings % in insights; AI asked for savings | UI `:1762, :1779, :1896` | Invented money on screen | S | P1 | Remove the %; AI prompt: narrative only, no new numbers |
| 8 | Engine input validation | `computeSWProgram` | Negative / NaN totals, crash | S | P2 | Validate and reject with field messages (as the main engine's `validateStackInput`) |
| 9 | Reported person-months ≠ costed | `:992, :1148` | FTE and PM figures understated ~50 % | S | P2 | Report the costed PM |
| 10 | Monte Carlo misses buckets; per-vehicle ignores recovery; sensitivity volume row inconsistent | `:1047–1080, :1213` | Band and sensitivity wrong when options on | S | P2 | Include all buckets; use the same per-vehicle rule |
| 11 | Royalties flat per year | `:966`, module table | Per-unit royalties understated ~5× (voice) | M | P2 | Add `perVehicleRoyaltyGBP` × volume × life; move values from notes |
| 12 | Cyber uplift keyed on ASIL | `:947–948` | Infotainment / connectivity cyber under-costed | S | P2 | Key on a CAL (ISO/SAE 21434) input per module |
| 13 | Country change not applied to inputs; provenance panel / validation show built-in book; dev-source table in UI | UI `main.ts:19760`, `:210, :256, :1719` | Screen disagrees with what was costed | S | P2 | Apply region to `_swInputs`; show the active book; compute dev-source table via the engine |
| 14 | Exports omit rate basis; static reports | UI `:2038, :2449` | Report not reproducible | S | P2 | Add base rate, rate-book version / source; label static reports "reference example" |
| 15 | No currency conversion | whole module | Non-UK users read £ only | M | P3 | Use the app's display-currency formatter |
| 16 | No size-based model (SLOC / function points), no calibration to actuals | method | Not comparable with SEER / SLIM / COCOMO | L | P3 | Add an optional COCOMO II-style size → effort path calibrated to the user's own projects |
| 17 | Cloud / OTA not volume-scaled; tool licences × production life as NRE | `:965–968` | Lifecycle cost shape wrong at very high / low volume | M | P3 | Cloud per connected vehicle; tool licences over the development years |
| 18 | Rate workbook: keys not checked, 0 accepted, no version history | server | Silent bad uploads | S | P3 | Validate keys / > 0; snapshot like the main library |
| 19 | Headline percentile not stated | UI results | Reader assumes headline = P50 | S | P3 | State "headline ≈ P30; P50 = £x" |

**STOP — no fixes have been made.** Approve the list (or a subset) and I will work on a new branch, save the
current outputs as a baseline, make one fix per commit with a test, then re-run the baseline and show what moved and why.
