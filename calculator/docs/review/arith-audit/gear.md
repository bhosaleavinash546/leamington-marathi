# Arithmetic audit — GEARS (group `gear`, 30 Oct 2026)

## 1. Scope

**Files owned and audited**
- `src/engine/cost-input-rules/commodities/gear.ts` — the rules
- `src/engine/modules/gear.ts` — the module
- `src/engine/modules/gear-advisor.ts` — the route
- the `gear` case of `src/engine/cost-input-rules/to-cost-params.ts` (no change needed)

**Read and recomputed, not owned (proposals only)**
- `gear-cycle.ts`, `gear-shop-data.ts`, `gear-heat-treat-rate.ts`, `gear-heat-treat-data.ts`
- the gear tiers in `machine-sizing.ts`
- `CUTTING_DATA` / `stockSize` in `machining-time.ts`
- `core.ts` (the stack)
- the gear panel in `main.ts`

**Real part.** `cad-audit/parts/test-gear-m3-z38.step`:
- spur gear, m 3, z 38, Ø120 tip, 30 mm face, Ø40 bore
- 20MnCr5, carburised
- UK, 50,000 a year, 5-year programme (amortised over 250,000)

The baseline answers ISO 1328 class 8. It was also re-costed at class 6 and class 7 (both ground; class 7 is what the drawing `gear-drawing-m3-z38.pdf` governs) and at class 9 (as-hobbed).

**Reproduce**
```
cd calculator
npx tsx scripts/arith-audit/gear.ts             # independent shadow, 4 classes, 180 checks, exit 1 on FAIL
npx vitest run tests/arith-audit-gear.test.ts   # 18 tests; all fail on the pre-audit code, pass after
npx vitest run tests/gear-*.test.ts tests/cost-input-rules-gear.test.ts   # existing gear suites: all pass
```

## 2. Sequence: as costed v as made

### As costed

The table below is for class 8, after the fixes. Every operation runs at OEE 0.80, labour efficiency 0.92 and 1 part a cycle. Set-up is 0.75 h ÷ a batch of 4,170, and each cycle is ÷ 0.98 for the reject.

| # | Operation | Machine (£/h) | Seconds | Crew | Labour |
|---|---|---|---|---|---|
| — | Saw the bar slice | **not costed** (kerf in the stock length only) | — | — | — |
| 1 | Blank turning (face, OD, bore) | mach-lathe-cnc (7.79) | 190 | 0.5 | skilled 27.95 |
| 2 | Gear hobbing | gear-hob-small (55.61) | 55.5 | 0.5 | skilled |
| 3 | Chamfer and deburr | gear-deburr (25.96) | 25 | 1 | semi-skilled 24.65 |
| 4–7 | Wash → carburise and quench → wash → temper | sub-contract furnace, by weight (£/kg) | 0 | — | — |
| 8 | Gear grinding (generating) | gear-grind-generating (126.53) | 45.7 | 0.5 | skilled |
| 9 | Gear inspection (100 %) | gear-checker (56.21) | 20 | 1 | inspector 28.03 |

By class:
- **Class 6 and class 7:** the same route, with 1 spark-out pass, so grinding takes 51.7 s.
- **Class 9:** grinding is dropped (hobbed class 7 + 2 classes of carburising distortion = 9).

### As a production engineer would write it

For a 20MnCr5 m3 spur gear, class 7/8, H7 bore, at 50k/yr:

1. Saw, or a forged ring blank at this volume.
2. Soft-turn the bore, faces and OD, leaving grinding stock.
3. Hob.
4. Chamfer and deburr.
5. **Shave** (for class 8).
6. Wash → carburise and quench → wash → temper.
7. Shot-blast.
8. **Hard-turn or grind the bore and faces** (the datum).
9. Gear-grind (class 7), or nothing (class 8, shaved).
10. Wash.
11. Inspect.

### Verdict

The order is right: cut → deburr → furnace → hard finish → inspect. No step is charged twice in time.

The heat-treat freight WAS charged four times (fixed, G6). The gaps are listed below. The two that are not costed are now stated in the printed bases:
- The **saw cut-off** is not costed. The machining route does not cost it either; there is no saw in the rate book. Stated.
- **Bore and face hard-finishing after heat treat** is not costed. Stated; proposed P5.
- **Class 8 carburised is ground**, where hob → shave → harden would hold it on the model's own figures (shaving class 6 + 2 = 8). Proposed P2.
- **Shot-blast after the furnace** is not costed. Proposed P5.
- **The blank is bar at every volume.** This was open since the gear review.

## 3. One part by hand: class 8, UK, to the penny

**Rules (measured geometry and answers)**
- **Module:** mn = 120.0 / (38 + 2) = 3.00 mm.
- **Net weight:** 265.959 cm³ × 7.85 g/cm³ = 2.088 kg.
- **Blank:** bar slice Ø(120 + 4) × (30 + 6) mm = 434.7 cm³ × 7.85 = 3.413 kg × £1.48/kg = £5.051.
  - Less chips: (3.413 − 2.088) = 1.325 kg × £0.22 = £0.291.
  - Result: **£4.76**.
- **Blank turning:**
  - Bar 434.7 − blank π/4·(120² − 40²)·30 = 301.6 cm³, so 133.2 cm³ is removed.
  - At 80 cm³/min that is 1.66 min, + 1.5 min load/datum = 3.16 min = **190 s**.
- **Batch:** 50,000 / 12 = 4,166.7, rounded to 10 = **4,170**.
- **Set-up a part:** 0.75 / 4,170 = 0.00017986 h.
- **Reject uplift:** U = 1 / 0.98.

**Cycles (each op: h = (s / 3600 + 0.00017986) × U; £ process = h × rate ÷ 0.8; £ labour = h × rate × crew ÷ 0.92)**

- **Hob:**
  - Tooth depth h = 2.25 × 3 = 6.75 mm; hob Ø = max(70, 36) = 70 mm.
  - Approach √(6.75 × 63.25) = 20.66 mm, so travel = 30 + 20.66 + 2 = 52.66 mm.
  - n_hob = 160,000 / (π·70) = 727.6 rpm; n_work = 727.6 × 2 / 38 = 38.29 rpm.
  - Cutting = 52.66 / (2.2 × 38.29) × 60 = 37.5 s, + 18 s handling = **55.5 s**.
- **Grind:**
  - Stock 2 × 38 × (6.75 × 30) × 0.08 = 1,231 mm³.
  - Removal at 2.5 × 25 = 62.5 mm³/s takes 19.7 s, + 0 spark-out + 8 s dressing + 18 s handling = **45.7 s**.

| Operation | h | Process £ | Labour £ |
|---|---|---|---|
| Blank turning 190 s | 0.054038 | 0.054038 × 7.7869 / 0.8 = **0.52599** | 0.054038 × 27.95 × 0.5 / 0.92 = **0.82086** |
| Hobbing 55.5 s | 0.015917 | × 55.6081 / 0.8 = **1.10638** | × 27.95 × 0.5 / 0.92 = **0.24178** |
| Deburr 25 s | 0.007270 | × 25.9598 / 0.8 = **0.23590** | × 24.65 × 1 / 0.92 = **0.19478** |
| Grinding 45.7 s | 0.013137 | × 126.5324 / 0.8 = **2.07779** | × 27.95 × 0.5 / 0.92 = **0.19955** |
| Inspection 20 s | 0.005852 | × 56.2115 / 0.8 = **0.41122** | × 28.03 × 1 / 0.92 = **0.17831** |
| **Σ** | | **4.35728** | **1.63528** |

**Heat-treat package, sub-contract, UK, ECD 0.70 mm (factor 1)**

The bottom-up rates follow `gear-heat-treat-rate.ts`. The freight (£0.02644/kg) is carried once, on the furnace step:

| Step | £/kg |
|---|---|
| Wash, less freight | 0.15267 |
| Gas carburise + oil quench (600 kg / 7 h × 7,000 h × 0.85 = 510,000 kg/yr; energy 0.1466 + labour 0.1007 + capital 0.1545 + maintenance 0.0389 + consumables 0.0567 + fixtures 0.0151 + overhead 0.1555 + QC 0.0227 = 0.6906; + scrap 0.0104; + SG&A 0.0841; + margin 0.1021; + freight 0.0264) | 0.91358 |
| Wash, less freight | 0.15267 |
| Temper, less freight | 0.19029 |
| **Package** | **1.40921** |

1.40921 £/kg × 2.088 kg = £2.94244 ÷ 0.98 = **£3.00249**.

**Raw material:** 4.76 / 0.98 = 4.85714, + heat treat 3.00249 = **£7.85964**.

**Tooling**
- **Hob:** (£1,400 + 12 × £180) / (1,200 × 13) = £0.228205 a part.
- **Wheel:** £1,100 / 3,000 = £0.366667 a part.
- Wear: (0.594872 / 0.98) × 250,000 = £151,753.01.
- NRE: + £8,000 + £6,500 + £4,000.
- Total £170,253.01 ÷ 250,000 = **£0.68101**.

**Stack**
- Overhead base = 7.85964 + 4.35728 + 1.63528 + 0.68101 = 14.53321.
- **Overhead** = 12 % × 14.53321 = **1.74399**.
- Factory = 14.53321 + packaging 0.13 + logistics 0.23 = 14.89321.
- Subtotal = 14.89321 + 1.74399 = 16.63720.
- **Margin** = 8 % × 16.63720 = **1.33098**.
- **Total £17.9682.** The live headless result is £17.9682.

## 4. Shadow model

`scripts/arith-audit/gear.ts` re-costs the part live, then recomputes everything without the gear rules, module, advisor, cycle model or heat-treat engine. It reads only:
- the geometry, the rate book and REGIONAL_DATA;
- the shop / heat-treat data tables;
- `CUTTING_DATA`.

The recomputation covers:
- every rule input;
- the route and its order;
- each operation's machine, labour, crew, hours and £;
- the heat-treat package, tooling and its items;
- all 8 buckets.

| Case | Live total | Checks | Result |
|---|---|---|---|
| Class 8 (baseline answers) | £17.9682 | 45 | PASS |
| Class 6 (ground, 1 spark-out) | £18.3248 | 45 | PASS |
| Class 7 (drawing; ground, 1 spark-out) | £18.3248 | 45 | PASS |
| Class 9 (as-hobbed, no grind, no wheel) | £14.7609 | 45 | PASS |
| **Total** | | **180** | **180 PASS, 0 FAIL** |

Before the fixes, the same shadow (with the old freight and wear rules) reproduced the HEAD dump to the penny: class 8 £18.1579. Every arithmetic line the module and core do is what the shadow does. The defects are in what is charged and what is said, not in the multiplication.

`basis-check.py` flagged 3 printed equations on the dump (module, blank, prep). All 3 were parser misreads. However, the blank basis did NOT re-add: "3.41 kg × £1.48/kg − chips × £0.22/kg" over £4.76 had no chip weight. It is now printed in full (G4).

## 5. Constant register (files owned)

**Classes used below**
- **LIB** — from the rate library.
- **MEAS** — measured from the part.
- **LAB-EST** — labelled estimate, now printed.
- **UNLAB** — not labelled.

**£ effect** is on the class-8 real part, after overhead and margin.

| File:line | Value | Meaning | Class | £ effect |
|---|---|---|---|---|
| rules gear.ts:67 | 0.75 h | set-up per operation a batch (on all 5 machine ops) | LAB-EST (basis now lists the ops it is charged on) | ±£0.10 (0.5 %) |
| rules gear.ts:69 | 0.02 | reject after HT / inspection | LAB-EST (stale "screen said 2 %, headless 3 %" removed) | ≈ £0.33 (1.8 %) |
| rules gear.ts:75 | +4 mm OD, +6 mm length | bar-slice allowances | LAB-EST (was a bare literal) | ≈ £1.8 v a zero-allowance slice (10 %) |
| rules gear.ts:75 | 1.5 min | load / datum on the blank lathe | LAB-EST (was a bare literal) | £0.77 (4.3 %) |
| rules gear.ts (moduleOf) | da / (z / cos β + 2), 2 dp | module (standard addendum) | MEAS + arithmetic | — |
| rules gear.ts (gearGeo) | z ≥ 7 | below this not a gear (undercut) | sourced in module text (20° involute) | routing only |
| rules gear.ts (shaftBlank) | length > 2·face + 10; turned ≥ 0.4; fallback 0.6 | gear-on-shaft test | UNLAB (heuristic, stated in the function doc; not on the real part) | 0 on this part |
| rules gear.ts (shaft) | root Ø = tip − 4.5 m; × 0.5 | tooth-gap volume left to the hob | arithmetic (2 × 2.25 m) + UNLAB 0.5 fill | 0 on this part |
| rules gear.ts (ECD rule) | 0.70 mm | case depth default | LIB (REFERENCE_CASE_DEPTH_MM; within the drawing's 0.6–0.9) | 0 at 0.70 |
| rules gear.ts (batch) | annual / 12, ≥ 50, to 10 | monthly batch | LAB-EST ("monthly delivery batches") | set-up only |
| rules gear.ts (GRADE_BY_CLASS) | mat-steel-20mncr5 etc. | grade per class | LIB | — |
| module gear.ts:208 | 0.5 / 1 | crew: gear machines / deburr + checker | LAB-EST (now printed in the set-up basis) | ±£1.5 at crew 1 (8.5 %) |
| module gear.ts:210 | 0.92 | labour efficiency (= SHOP_DEFAULTS) | LAB-EST (printed) | £0.16 (0.9 %) |
| module gear.ts:218 | 0.80 | OEE on every op (= SHOP_DEFAULTS, now one constant, tested) | LAB-EST (printed) | £1.05 v OEE 1 (5.9 %) |
| module gear.ts:220 | Ø max(70, 12 m), 2 starts | default hob | UNLAB in reports (constant now named; screen route note prints "hob 2-start Ø70mm") — P1 | 1 start: +£1.07 (6 %) |
| module gear.ts (skiving) | 25 teeth, Ø max(60, 25 m) | default skiving cutter | UNLAB (internal gears only) | 0 on this part |
| module gear.ts (blank op) | mach-lathe-cnc, skilled | blank-turning machine | LIB | — |
| module gear.ts (LABOUR_BY_PROCESS) | semi-skilled deburr, inspector checker | labour grades | LIB | — |
| module gear.ts (validity) | 0.30 reject, MRR bands 1–30 / 0.05–3 | warnings only | n/a (no cost) | 0 |
| advisor (HARDENING_DISTORTION_CLASSES) | carburise 2, Q&T 1, nitride 0 … | classes lost in the furnace | sourced (plant workbook grades), stated | grind or not: ±£3.2 (class 8 v 9) |
| advisor (bestQualityClass) | hob 7, shave 6, grind 4 … | achievable class | sourced (industry practice, AGMA → ISO stated approximate) | route |
| advisor (thresholds) | 250 / 250,000 a year | prototype milling / broaching | LAB-EST ("Empirical, stated") | 0 on this part |
| advisor (HARDENING_ROUTE_SPEC) | washes 2, temper yes (carburise) | furnace package | sourced (workbook) | in the package |

**Shop data** (`gear-shop-data.ts`, not owned) covers:
- speeds and feeds: 160 m/min, 2.2 mm/rev, 1 cut;
- handling 18 s, deburr 25 s, inspection 20 s;
- grinding 2.5 mm³/mm·s × 25 mm, 0.08 mm stock, 8 s dressing, spark-out table;
- tool prices and lives;
- NRE of £8,000 / £6,500 / £4,000.

All are labelled "Representative value — NOT from a standard, catalogue or plant", but that reached only the screen's route note. **It is now printed on the quality-class basis**, so headless and both reports carry it (G7).

The heat-treat data (`gear-heat-treat-data.ts`) is labelled as a plant workbook engineering estimate. Each step now prints £/kg × kg in the cost trace (G2).

## 6. Findings register

| ID | Sev | Where | Evidence | Status | £ class 8 (before → after) |
|---|---|---|---|---|---|
| G1 | H | module gear.ts computeGearDrivers (tooling) | Blank, heat treat and every op were ÷ (1 − reject); hob and wheel wear were not. A gear scrapped at final inspection was hobbed and ground. | **FIXED** (`arith-audit-gear` G1) | 18.1579 → 18.1726 (+£0.0147) |
| G6 | H | module gear.ts byWeight | Sub-contract heat-treat freight (round trip, £0.0264/kg) was charged on each of the 4 by-weight steps (wash, carburise, wash, temper): one package, one round trip, paid 4 ×. Now charged on the furnace step only, and the other steps say so. | **FIXED** (G6; captive unaffected) | 18.1726 → **17.9682** (−£0.2044) |
| G3a | H | rules gear.ts qualityDecision | The printed question said:<br>• class 7 = "hard-finish (skive/shave) after heat treat" — shaving cannot follow hardening, and the cost grinds;<br>• class 8 = "cut-and-harden, light finish" — the cost grinds a carburised class 8;<br>• why = "a ground class-6 flank costs roughly twice a hobbed-and-shaved class-8". Actual: class 6 £18.32 v class 8 £17.97 (+2 %), and nothing is ever shaved on a hardened gear.<br>Rewritten per class to the route the module costs. | **FIXED** (G3) | text |
| G3b | H | rules gear.ts materialClassDecision | Case-hardening said "hard finishing needed above class 8"; the cost grinds AT class 8.<br>Pre-hardened "slower cutting feeds", stainless "slower feeds", bronze "free cutting", plastic "cut soft": the shop data has no band for any of them and the module BLOCKS.<br>Cast iron "cast blank": the cost buys an ADI bar slice. | **FIXED** (G3) | text |
| G3c | M | rules gear.ts hardeningDecision | Martemper "small premium over plain Q&T": the package is about 1.5 × in the UK. LPC "no post-wash": it has no wash at all. 'None' "met by shaving": only class 6 is; tighter than 6 is ground. | **FIXED** | text |
| G4 | M | rules gear.ts blank / prep / setup / reject bases | The blank basis did not re-add (no chip kg). The prep basis hid bar − blank. The +4 / +6 mm, 1.5 min, OEE 0.80, eff 0.92 and crew 0.5 / 1 were bare literals. The set-up basis said "per cutting / finishing operation" but is charged on blank turning, deburr and the checker too. The reject basis carried a stale screen-v-headless note. Each value now prints its arithmetic and "engineering-typical, not sourced". | **FIXED** (G4) | text |
| G2 | M | module gear.ts rawMaterial | The £3.00 heat-treat package printed in the trace / PDF / Excel as "Per-part consumables (the commodity does not itemise them)". The module itemises it; `consumablesItems` now carries each step (rate × kg ÷ (1 − reject)). Tooling `items` now itemise wear + NRE (sum = total). | **FIXED** (G1, G2) | text |
| G7 | M | rules gear.ts quality basis | The representative-shop-data warning (88 of 88 parameters unverified) reached only the screen route note, not headless or the reports. The quality basis now prints the costed route and the warning. | **FIXED** (G7) | text |
| G5a | L | advisor GEAR_PROCESS_REFERENCE.case_hardening | Labelled "Carburise, quench and temper", followed by a separate "Temper" step. It read as tempering twice; the furnace line is HT-01 carburise + quench only. Now "Carburise and quench". | **FIXED** (G5) | text |
| G5b | L | advisor inspection source | "Sampling rate rises as the class tightens": the cost is a flat 20 s at every class (100 %). | **FIXED** (G5) | text |
| G5c | L | rules gear.ts gear.cycleTimeHr | The basis listed the route for `caseHardened` off the class, so an answered hardening route (none, nitride) printed a different operation list. "Same arithmetic as the costing" omitted blank turning. | **FIXED** (G5) | 0 |
| G5d | L | rules gear.ts netWeightKg | Density was read from DEFAULT_RATE_LIBRARY while the blank read the active (country) book. | **FIXED** (one book) | 0 |
| P1 | M | types.ts / core.ts / exports (not owned) | An operation has no note, so the hob kinematics (Ø70, 2 starts, 160 m/min, 2.2 mm/rev), the grind build-up and the flat deburr / inspection seconds reach the screen route note only. Reports print hours and £ without the derivation. | PROPOSED: `OperationInput.note?: string`, printed beside the op in the trace, PDF §4 and Excel ops sheet; gear sets `note: o.basis` | text |
| P2 | M | advisor adviseGearRoute (owned; not changed — a pinned plant-head decision in `gear-routing.test.ts` "class 8 no longer ships as-quenched") | Class 8 carburised is ground. On the model's own figures, hob → **shave → harden** holds it: shaving class 6 + 2 classes of distortion = 8. The advisor's own header cites hob → shave → harden → grind. | PROPOSED, in the hardened, non-nitride branch: `const shaved = GEAR_PROCESS_REFERENCE.shaving.bestQualityClass + distortion; if (needsHardFinish && cutting === 'hobbing' && fits('shaving') && i.qualityClass >= shaved) { insert shaving before furnacePackage(); skip grinding }`, plus a shaving-cutter life in the shop data | class 8 ≈ −£1.9 (−10 %) before shaving-cutter wear |
| P3 | M | rules gear.ts deriveBlank (owned; not changed — modelling alignment) | The disc blank is Ø(tip + 4) × (face + 6) — Ø124 is not a stocked bar. The shaft branch in the same file uses the shared `stockSize` (Ø130 × 38 mm here). Blank-turning insert wear (`CUTTING_DATA.toolCostPerCutMin`, £0.12/min steel), which the machining route charges, is not charged. | PROPOSED: disc branch → `stockSize(sorted, { maxDiaMm: od.od, lengthMm: face })`; add `gear.blankToolWearPerPart` (needs a `RULE_PATH_MAP` entry in apply.ts) | ≈ +£1.1 (+6 %) |
| P4 | H-risk | rate-library.ts (not owned) | gear-hob-small £55.61, gear-grind-generating £126.53, gear-deburr £25.96, gear-checker £56.21 say "tuned to a target shop rate; it may include operator / overhead the costing also adds". mach-lathe-cnc is machine-only £7.79. If the gear rates carry an operator, labour is counted twice on 4 of 5 ops. | PROPOSED: next UK rate round rebuilds the gear machines machine-only on sourced capex, as the CNC lathe was | up to ~£0.9 |
| P5 | M | advisor (owned; stated, not costed) | No post-heat-treat hard turning / grinding of the H7 bore and faces (the grinding datum), no shot-blast, no saw cut-off. These are now stated in the prep and blank bases. | PROPOSED: add `hard_turn_bore` (CNC lathe, hard-turning data) after temper when a ground route or an H-tolerance bore; saw op when a saw is in the book | not costed |
| P6 | M | scripts/real-parts-baseline.ts ANSWERS (lead) | The baseline answers class 8; the drawing (`gear-drawing-m3-z38.pdf`, "ALL DATA THIS SHEET GOVERNS") says ISO 1328 **class 7** and case 0.6–0.9 mm. | PROPOSED: `'gear.qualityClass': '7'` (+£0.36 on the dump; same route, 1 spark-out pass) | +£0.36 |
| P7 | L | main.ts collectGearInput (not owned) | The screen note "Raw Material bucket = blank £4.76 + heat-treat £x" omits the ÷ (1 − reject) the bucket carries (£4.86 + £3.00). | PROPOSED: `const U = 1 / (1 - (inputs.rejectRate ?? 0));` and print `(inputs.blankCostPerPart * U)`, `(a.heatTreatCostPerPart * U)` with "each ÷ (1 − reject)" | text |
| P8 | L | gear-shop-data.ts resolveCutting (not owned) | Bands 0–3 and 3–6 both include m = 3.0; the first wins (160 m/min, 2.2 mm/rev). The 3–6 band would give 36.3 s, not 37.5 s. | PROPOSED: make the upper bound exclusive (`normalModuleMm < r.moduleToMm`, the last band inclusive) | ±£0.03 |
| P9 | L | gear-heat-treat-data.ts (not owned) | Carbonitride scales its 6 h cycle by (ECD / 0.70)², but carbonitriding is specified below 0.4 mm. The reference depth is carburising's. | PROPOSED: a per-process `referenceCaseDepthMm` (carbonitride 0.3) | 0 at default |

**Counts:** H 4 (G1, G6, G3a, G3b), all FIXED. M 9: G2, G3c, G4, G7 FIXED; P1, P2, P3, P5, P6 PROPOSED. L 7: G5a–d FIXED; P7, P8, P9 PROPOSED. P4 is a rate-book risk for the lead.

**Real-part moves after the fixes**

| Case | Before | After |
|---|---|---|
| Dump (UK, 50k, 5 yr), class 8 | £18.1579 | £17.9682 |
| Class 6 / 7 | £18.5145 | £18.3248 |
| Class 9 | £14.9597 | £14.7609 |

`tests/real-parts-baseline.test.ts` (its own recorded conditions): test-gear-m3-z38 £18.52 → **£18.33**. Other parts in that test fail too; they are other groups' changes. The rules-prompt snapshot does not move for the gear.

## 7. Not checked, and why

- **Rate-book values:** machine £/h, labour £/h and 20MnCr5 £1.48 / £0.22 were taken as given (lead's remit). See P4 for the gear machines' possible operator content.
- **Packaging (£0.13) and logistics (£0.23):** the shared estimators in to-cost-params.ts, used as given.
- **Heat-treat process data** (cycle times, loads, SEC, capital): the workbook's labelled estimates. The arithmetic on them was re-derived and matched, but the values were not.
- **Stack conventions that are core-wide, not gear's:**
  - Set-up hours are ÷ OEE, although OEE availability normally already includes change-over.
  - Set-up is crewed at 0.5, as the run.
  - A sub-contracted service (with its own SG&A and margin) sits inside the 12 % / 8 % overhead and margin base.
- **Untested paths:**
  - Helical, internal (skive / shape / broach), induction, nitriding, LPC and the gear-on-shaft blank: no real part in the baseline takes them. The arithmetic is covered by the existing `gear-routing` / `gear-audit-fixes` suites.
  - Non-UK countries: covered by `country-rates.test.ts`.
- **Screen = headless:** not re-proved live in a browser. `tests/cad-workspace.test.ts` and `gear-routing-parity.test.ts` pass.
