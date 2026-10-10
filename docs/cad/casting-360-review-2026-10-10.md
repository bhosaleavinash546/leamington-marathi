# Casting 360° review: live in the tool, traced to code, hand-costed, reports read (10 October 2026)

**Asked:** cost a complex casting live in the tool. Trace every step to the code: how it reads the 3D CAD, the route,
the material, and each calculation against foundry practice. Check whether a 2D drawing feeds the costing. Do a manual
costing and compare it with the tool. Export the PDF and Excel and read them line by line. Fix the errors and garbage,
list what to improve, and report the status of each request, before and after. "No hallucinations: a pure arithmetic
cost calculator."

**Set-up:**
- Country: India. Annual volume: 100,000 parts. Display currency: INR, £1 = ₹127.1941.
- Parts, all real STEP files from the earlier uploads in `cad-audit/parts/`:
  - steering knuckle RH (primary part);
  - stub axle PRCR002 (cast + machine);
  - casting bracket.
- Material is the tool's own choice: EN-GJS-500-7 for safety-critical cast iron, GS-C25 for the steel bracket.

**Branch:** `claude/new-session-ts4byp`.

**Tags:**
- **Verified** = reproduced by a run or a test.
- **Likely** = strong evidence, not reproduced.
- **Unverified** = not checked.

**Files:**
- `calculator/scripts/casting-review-2026-10-10/`: the trace and hand-calc scripts, the before and after traces, the hand calcs, and the line-by-line export review.
- `calculator/tests/casting-360-review.test.ts`: one test per fix.

---

## 0. Status of every request

| # | You asked | Status | What was done | Before → after |
|---|---|---|---|---|
| 1 | Load a complex casting 3D CAD and cost it live | **Done** (Verified) | Three real parts were costed through a real server, browser and OCP kernel, twice (before and after the fixes). Each went upload → questions → Apply → Calculate → Excel → PDF | Knuckle ₹2,445.66 → **₹2,519.13**. Stub axle ₹5,024.68 → **₹5,184.39**. Bracket ₹2,549.45 → **₹2,544.96** (§4 says why each moved) |
| 2 | Trace every step into the code | **Done** (Verified) | §1 maps the chain from CAD read to the 8 buckets. Each step names its file and function | — |
| 3 | Is it the correct path, code and calculation against standard practice? | **Done** | The arithmetic is right to the paisa (§3). Ten method points are open (§5): they need a sourced rate or your decision, so they were **not** changed silently | — |
| 4 | Does the tool read the 2D drawing and feed the costing? | **Done: answered "mostly no"** (Verified in code) | §2. Without an AI key the drawing is not read at all. With a key it only *leans* the material and process. Tolerances, RMA, heat treatment and the NDT level never reach the cost; they are asked as questions or set by rules | One false claim removed: "the drawing's RMA replaces it" |
| 5 | Do a manual costing and compare it with the tool | **Done** (Verified) | An independent Python recompute of all 50+ lines from the trace inputs (`handcalc.py`) | Before: hand ₹2,445.7423 v tool ₹2,445.7390 (Δ ₹0.003). After: hand ₹2,519.1347 v tool ₹2,519.1300 (Δ ₹0.005) |
| 6 | Export the PDF and Excel and read them line by line | **Done** (Verified) | 16–17-page PDF and 7-sheet workbook per part, before and after (§6) | 41 findings from reading + 2 from the live re-run: 36 fixed, 2 partly fixed, 5 open with reasons (§6) |
| 7 | Find and fix gaps, errors, garbage | **Done**, one commit per fix, each with a test | 1 cost-logic error fixed (cored bores were "drilled"), 1 country error fixed (the shot-blast minimum), 4 DFM-plumbing faults fixed (2 found only by the live re-run); the rest are report and screen faults (§6) | Full suite **3,687 passed, 0 failed** (§7) |
| 8 | Improvement areas | **Done** | §5, ten method points, each quantified on the knuckle and each needing a decision or a source | — |
| 9 | No hallucinations; pure arithmetic | **Holds** (Verified) | No AI key was used. Every £ is deterministic: the trace reproduces to ₹0.005, and the same inputs give the same result. Every rule-set value now prints its basis in both reports (X12) | Reports used to show NDT, heat treatment and stock with **no** basis. They now show every rule value and why |

---

## 1. How the tool costs a casting: the chain, step by step (Verified by `trace.mts`)

The trace runs the **same** functions the server's deterministic path runs, in the India book, and dumps every
intermediate value: `npx tsx scripts/casting-review-2026-10-10/trace.mts <stp> IN 100000 '<answers>'`.

| Step | Code | What it does on the knuckle |
|---|---|---|
| 1. Read the CAD | `server/utils/cad-geometry-engine.py` via `geometry-bridge.ts::analyzeGeometry` (OpenCASCADE) | Measures the B-rep: volume **356.101 cm³** and area **789.253 cm²**, matching the truth file `cad-audit/truth/steering_knuckle_RH.json`. Bounding box 114 × 236 × 210 mm. 310 faces (99 planes, 124 cylinders, 40 tori, 24 B-splines …), a feature table (12 holes, Ø10–Ø75) and the turned axis |
| 2. Read what the file says | `cad-metadata.ts`, `derive/part-evidence.ts` | Product name and face mix give a leaning only; no material is declared in the file |
| 3. Route | `derive/commodity.ts::inferCommodity` → question `commodity.route` | Free-form + toroidal share → net-shape. **Asked**, answered "cast + machine" |
| 4. Material | `derive/material.ts` → questions `material.family`, `material.grade` | Family **asked** (cast iron). Safety-critical **asked** (yes) → ductile EN-GJS-500-7 (`castIronDefaultGrade`). Density 7,100 kg/m³ → **2.528 kg** finished |
| 5. Process | `casting-advisor.ts` (sand / HPDC / gravity / investment by alloy, size and section 2·V/S) | Ductile iron → **sand** |
| 6. As-cast weight | `cast-and-machine.ts::CAST_WEIGHT_RULE` | 2.528 kg + 17.9 cm³ of 8 holes ≤ Ø20 drilled from solid + 61.0 cm³ stock (3 mm a side on machined faces and bores, ISO 8062-3 typical) = **3.238 kg** |
| 7. Metal | `modules/casting.ts` | Poured = 3.238 ÷ (1 − 0.03 reject) ÷ 0.63 yield = 5.30 kg. Returns are remelted; only 3 % melt loss of the returns is lost (0.062 kg). Metal = 3.300 kg × £0.7654/kg (India book) |
| 8. Melt energy | `casting-melt.ts` → `rawMaterial.energyKwh` | 0.62 kWh/kg poured, priced by the core at the India tariff £0.069/kWh |
| 9. Consumables and services | casting rules (`cost-input-rules/commodities/casting.ts`) | Cores, green-sand additions, stress relief (safety-critical), shot blast, **2D X-ray on every part** (safety-critical), cutting-tool wear |
| 10. Foundry operations | casting rules | Sand line: 1 impression in a 500 × 400 flask at 30 moulds/h, crew 4. Fettling 6 min (bench). Melt-shop labour |
| 11. Machining | `machining-time.ts::nearNetMachiningTime`, `machining.ts::machiningRuleDefs(nearNetCut)` | Measured finish area per face side, holes by drilling feed, **cored bores finish-bored** (new, X16), spindle turned on the lathe, handling per fixturing, deburr. Routing optimiser: split-3axis (VF-2 + drilling centre) |
| 12. Tooling | casting rules + machining rules | 13 pattern sets (life 8,000 moulds) + 5 machining fixtures + CAM programming. Amortised over 100,000 parts |
| 13. Guards | `cad-sanity.ts`, `cad-machining-guard.ts` (`runAllGuards`) | None fired (geometry measured, AI not used) |
| 14. Cost | `to-cost-params.ts` → `cost-executor.ts` → `core.ts::computeUniversalStack` | 8 buckets. Overhead 9 % (India shop default) of material + process + labour + tooling. Margin 8 % of the subtotal |

**Where AI is in this chain: nowhere.** No key was set. With a key, only Stage 1 (identification) and the specialist's
reading are added, and every AI number goes through the guards (§2).

## 2. The 2D drawing: does it feed the costing? (Verified in code)

- **Upload.** `/api/cad/analyze` accepts `drawingPdf` (`server/routes/cad.ts`, `upload.fields`).
- **Without an AI key** (this environment, and the Windows package by default) the drawing is **not read at all**.
- **With a key**, the drawing goes to one vision call (`server/utils/cad-identify.ts`) together with the renders and the geometry. What it can do:
  - **Material:** a grade read off the drawing is a **leaning** — pre-selected, but the engineer confirms it (`derive/grade.ts`: "drawing-read and name grades only lean"). An unsourced material is forced to "unknown".
  - **Process:** a leaning. The geometry guard still overrules it.
  - **Coating** thickness and masks: bounded by `boundDrawingCoating`.
  - **Gear only:** the heat-treat route, read by the specialist.
- **What never reaches a casting's cost from a drawing:**
  - tolerances and GD&T (asked instead: `service.toleranceClass`);
  - pressure-tightness (asked);
  - safety-critical (asked);
  - the machining allowance (RMA: the 3 mm a side is a rule);
  - the heat-treatment callout (a rule: stress relief because safety-critical);
  - the NDT level (a rule: 2D X-ray because safety-critical);
  - surface finish;
  - critical bores.
- **Fixed:** the as-cast weight basis said "ISO 8062-3 RMA typical; the drawing's RMA replaces it". Nothing replaces
  it. It now says "an assumption: no drawing is read for it; type the as-cast weight from the drawing or the foundry
  to override" (`a6cfd5b`).
- **Improvement (needs a decision):** read the drawing's RMA, heat-treatment and NDT callouts into those three rule fields
  as **evidence** (shown, engineer confirms), the way the grade is handled. Today an engineer must type them.

## 3. Manual costing v the tool (Verified)

`handcalc.py` reads only the trace's **inputs**: measured volume and area, the rule values, the country's rates and the
cost parameters. It recomputes every line with the standard formulas written out:
- metal = (cast + melt loss) × £/kg;
- machine £ = h × rate ÷ OEE ÷ parts per cycle;
- labour £ = h × rate × manning ÷ efficiency;
- patterns = ⌈moulds ÷ life⌉;
- overhead on material + process + labour + tooling;
- margin on the subtotal.

Knuckle, India, 100k, **after** the fixes (`after/handcalc-after.txt`):

| Line | Hand ₹ | Tool ₹ | Δ |
|---|---|---|---|
| Material bucket (metal ₹321.25 + consumables ₹525.88 + melt energy ₹28.83) | 875.96 | 875.96 | +0.001 |
| Process (machines) | 936.91 | 936.91 | −0.002 |
| Labour | 229.13 | 229.14 | −0.006 |
| Tooling (₹38,53,600 ÷ 100,000) | 38.54 | 38.54 | −0.004 |
| Overhead 9 % | 187.25 | 187.24 | +0.006 |
| Margin 8 % | 186.60 | 186.61 | −0.004 |
| **Total** | **2,519.1347** | **2,519.1300** | **+0.005** |

Every one of the 13 operations agrees to within ₹0.0002 (machine and labour separately). Before the fixes the same
script gave hand ₹2,445.7423 v tool ₹2,445.7390. **The arithmetic is exact. What can be argued with is the method and
the inputs (§5), not the sums.**

## 4. Live results, before → after (Verified, `e2e/cad-parts-live.ts`, same manifest)

| Part | Before | After | Change | Why |
|---|---|---|---|---|
| Steering knuckle | ₹2,445.66 ±9.8 % | **₹2,519.13 ±10.7 %** | +₹73.47 (+3.0 %) | X16: the four cored bores (Ø63–75) are finish-bored on the machining centre (₹2,854/h), not drilled on the drilling centre (₹1,840/h). The time is unchanged (0.0932 h = 0.041 h drilling + 0.0522 h boring); only the machine rate differs. Partly offset by X40: shot blast ₹12.72 → ₹8.90 |
| Stub axle PRCR002 | ₹5,024.68 ±10.3 % | **₹5,184.39 ±10.9 %** | +₹159.71 (+3.2 %) | Same cause: its Ø24–46 bores are now bored (the UK baseline moved by the same reason, £84.93 → £87.38) |
| Casting bracket | ₹2,549.45 ±13.7 % | **₹2,544.96 ±13.7 %** | −₹4.49 (−0.2 %) | X40: the UK £0.10 shot-blast floor no longer binds in India (£0.10 → £0.07) |

- The knuckle's live figure equals the trace and the hand calc (₹2,519.13). Screen, PDF and Excel agree (§6).
- The band widened slightly (knuckle ±9.8 % → ±10.7 %). The costed operations changed (X16); the band's own driver breakdown was not re-examined (Unverified).

## 5. Method: what is right, and what needs your decision (NOT changed — each needs a source or your call)

**Right, and checked against foundry practice:**
- Returns are remelted: only the melt loss is lost, and every kg poured is charged melt energy.
- Yield 0.63 sits in the sand ductile band of 0.55–0.70.
- 3 % reject.
- Sand chosen for ductile iron.
- The sand line is timed per mould ÷ impressions.
- Fettling is bench labour only.
- Machining is a measured build-up (finish area by face type, holes by feed), not the kernel's estimate.
- Tooling is a toolmaker build-up.
- Every rate is the India book's.

| # | Point | Knuckle impact | Why it is open |
|---|---|---|---|
| M1 | **Metal price is not sourced.** `mat-gjs500` £0.86/kg UK (India £0.7654) carries "NOT SOURCED — held at the June 2026 price", confidence Low. The library comment says the £/kg includes melt and finish margin, while the costing also adds melt energy, labour and the line | Metal ₹321 = **12.7 %** of the part | Needs a dated pig-iron + scrap index (rates move only through `scripts/rate-refresh.ts`) and one definition of what £/kg covers |
| M2 | **The moulding line is not volume-aware.** It is a semi-automatic line at 30 moulds/h, crew 4, 1 impression, whatever the volume. At 100k/yr a foundry runs an automatic flaskless or high-pressure line (DISA / Künkel-Wagner class, 100–400 moulds/h, 1–2 operators) | Moulding ₹136 = 5.4 % (line machine ₹79 + crew ₹57). The size of the change is not estimated here: there is no sourced automatic-line rate | Needs a sourced automatic-line machine rate and capex in the library (none today). Choosing a line by volume would then be a rule |
| M3 | **Pattern life 8,000 moulds** is the wood-pattern band. Metal match plates last 50k–150k+ moulds | 13 pattern sets = ₹32.6 lakh = 85 % of the tooling (₹32.62 per part) | Needs a sourced life band per pattern material, plus a volume rule |
| M4 | **100 % 2D X-ray at £5/part (UK) × 0.36** — the advisor rate is unsourced. Safety-critical knuckles are usually X-rayed on a sampling plan (first-off + per-heat), not every part | NDT ₹229 = **9.1 %**: larger than the whole labour bucket | Needs the sampling plan you want (drawing or PPAP) and a sourced rate |
| M5 | **Stress relief on safety-critical ductile iron.** As-cast EN-GJS-500-7 is normally used without heat treatment; stress relief is a drawing call | ₹61 = 2.4 % | The drawing decides. Today it is a rule ("safety-critical → stress-relieve") |
| M6 | **VF-2 at 50 % utilisation** (₹2,854/h) against 80 % for the other machines, on a dedicated 100k programme | The VF-2 ops are ₹755 = **30 %** of the part; their machine rate carries the 50 % utilisation | A library assumption; changing it moves every machining part. Needs your call |
| M7 | **Programme life blank → 1-year amortisation.** The fixture rule itself says "dedicated above 10,000 parts **over 5 years**" | Tooling ₹38.54. Over 5 years it would be about ₹7.71 | Now **stated** in both reports (X13). Whether to default to 5 years is your call |
| M8 | **Cutting-tool wear £0.10/min** of cutting (cast iron) — an engineering figure | ₹167 = **6.6 %** | Needs a sourced tool-cost-per-minute (tooling supplier data) |
| M9 | **India labour** ₹654/h skilled, ₹384/h foundry (book rates). Screen v headless differ by ₹0.08 (a rounding of the shop defaults) | Labour 9.1 % | Within rounding; the rates follow the 2026-Q2 refresh |
| M10 | **The stub axle file holds 2 solids** (truth file) and is costed as one casting of 1,037 cm³ | Unknown | Needs the engineer to say whether the second body is part of the casting |

**Accuracy is unmeasured:** no purchase price for these parts is in `scripts/actuals/`. Every figure here is what the
tool computes, proven against its own inputs. None has been compared with a price paid.

## 6. The PDF and Excel, read line by line: findings and status

The full before-review with every cell reference is in `scripts/casting-review-2026-10-10/before/export-review.md`.
Severity: P1 = wrong number (none found), P2 = misleading, P3 = cosmetic.

| id | Finding (before) | Status | Commit |
|---|---|---|---|
| X1 | PDF deleted the ₹ sign: "Total Should-Cost 2445.66", 0 currency signs in 16 pages | **Fixed**: prints "INR 2,519.13" (₹, ฿, ₫, ₩, ₺, ₱ by ISO code) | `fd15fd6` |
| X2 | DFM finding mixed ₹ and £ ("INR 41.68/part … £20.88 per hour") | **Fixed**: the basis uses the page's currency | `6e10b51` |
| X3 | The "upper bound" wording was dropped; Ø63–75 bores were called drills | **Fixed**: "upper bound: every size merged onto one tool"; "a boring tool for a bored bore" | `6e10b51` |
| X4 | "No material family was confirmed" after "cast iron" was answered. True: the DFM ran at upload, before the answer | **Fixed**: the DFM is re-run with the answered family and route once the answers are complete | `9ce86c4`, `364b68b` |
| X5 | Compound-angle said its fixturing is priced in the setups finding, which is itself unpriced | **Fixed** | `363a1ca` |
| X6 | Bench ops printed a machine, a rate and OEE 100 % | **Fixed**: "bench (no machine time)" | `2ef2a80` |
| X7 | "Consumables (cores, patterns, shell, filters)" — the costing holds NDT, tool wear and heat treatment | **Fixed**: lists the actual lines and shares | `559863e` |
| X8 | "Machining is 35.6 %" was the whole process bucket, moulding included | **Fixed**: the machining ops' own share | `559863e` |
| X9 | "Material is 40 % … the metal itself" — the metal is 17.9 % | **Fixed**: the metal share excludes consumables and energy | `559863e` |
| X10 | "Grounded in the actual solid — not an estimate" | **Fixed**: says the stock and prices are estimates | `19feda9` |
| X11 | "Net weight (measured geometry) 3.24 kg" — 0.71 kg is rule stock | **Fixed**: "Costed weight (measured volume + stated stock)" | `19feda9` |
| X12 | No basis for NDT, heat treatment, stock, crew or fettling; the Excel "RULE-OWNED VALUES" table was empty | **Fixed**: both reports print every rule value, its source and its basis | `ad5714f` |
| X13 | ₹38.5 lakh tooling as one number; the 1-year amortisation was not stated | **Fixed**: pattern sets / fixtures / programming, plus the amortisation basis | `556fe52` |
| X14 | "lab-uk-foundry" on India rows; Excel listed every labour rate in the library | **Fixed**: "foundry (role)", only the roles used | `6381218` |
| X15 | £ basis text beside ₹ values, unlabelled | **Fixed**: "Source / Reference (as recorded, GBP)" | `6381218` |
| X16 | "Drilling — 12 holes" included the Ø63–75 bores, on the drilling centre | **Fixed (cost)**: "Finish boring — 4 cored bores" on the machining centre | `d7efefe` |
| X17 | The stub-axle PDF had no DFM section and no sentence saying why | **Fixed**: "Geometric DFM / DFA - not included … not a clean result" when unfinished. The live run waits for it | `16425c9` |
| X18 | Stub axle: 2 solids in the file, costed as one | **Open**: M10, needs the engineer | — |
| X19 | Setups finding "9 fixturings" v the costing's 4 | **Fixed at the cause** (Verified live): the upload's DFM had run as *machining*, so cast-in corners counted as machined. Run as cast + machine (X4), the knuckle counts 4 = the costing's 4 ("the two agree"), and the bracket no longer reaches the threshold. The PDF also states both counts when they differ | `363a1ca`, `9ce86c4`, `f95fba3` |
| X20 | "The corner's pocket pass is in the cost either way" (not on a cast part) | **Fixed** | `363a1ca` |
| X21 | "Scrap / Runner Weight 0.0618 kg" was melt loss | **Fixed**: "Melt Loss (metal lost)" | `19feda9` |
| X22 | "Diameter 4.9 mm, flagged above 4.9 mm" | **Fixed**: "4.92 mm" | `118c578` |
| X23 | Pointed to a hole-size finding the bracket does not have | **Fixed** | `118c578` |
| X24 | "+2.0999999999999996s" | **Fixed**: "+2.1s" | `0bb0f6c` |
| X25 | DFA "14 holes" v 12 in the costing | **Open** (P3): the DFA counts hole axes from the per-face pass, the costing from the feature table. Not reconciled | — |
| X26 | "6 issues from 4 rules" | **Fixed**: per-feature rules plus part-level checks | `0bb0f6c` |
| X27 | "Scrap Credit -0.00" | **Fixed** | `19feda9`, `0bb0f6c` |
| X28 | Library ids in the reports (mat-gjs500, mach-haas-vf2, field paths) | **Partly**: labour ids replaced by roles (X14). Material and machine ids remain, beside their names | — |
| X29 | "Which cast iron grade? — engine default" | **Fixed**: "not answered - costed as EN-GJS-500-7" | `7c532f2` |
| X30 | The ± band only on p13; no band or confidence in Excel | **Fixed**: on the PDF cover; Excel model confidence + band + P10/P90 | `2ebaff5` |
| X31 | "3846985.50" (no separators) | **Fixed**: "INR 3,853,599.65" | `0bb0f6c` |
| X32 | §14 missing (§13 → §15) | **Fixed**: §14 prints "None" | `0bb0f6c` |
| X33 | "1 observations" | **Fixed** | `0bb0f6c` |
| X34 | One price note carrying three dates | **Open** (P3): the date is in the rate library's source note; it needs the next rate refresh | — |
| X35 | Excel listed blow / roto / SMT operators on a casting | **Fixed** with X14 | `6381218` |
| X36 | The consumables row's Rate ID was "mat-gjs500" | **Fixed**: "rules (per-part services)" | `f64c5c3` |
| X37 | Excel text cells starting "=" | **Open** (P3): LibreOffice reads them correctly; Excel itself not tested | — |
| X38 | Carbon "5.61 /kg" | **Fixed**: kgCO2e/kg | `0bb0f6c` |
| X39 | DFA bounding box in another frame | **Open** (P3): cosmetic; the costing uses the kernel's | — |
| X40 | The UK £0.10 shot-blast floor bound in India | **Fixed (cost)**: × the process-service factor | `2dced22` |
| X41 | Bracket: 1 mm deep "holes" costed as drilled | **Partly** (Likely spot-faces): not changed without a drawing | — |
| X42 | *Found in the live re-run:* the re-queued DFM job failed "STEPControl_Reader failed". `getUploadFile` returned the mesh cache (`<hash>.1.mesh.json`) as the upload because it sorts first. The inch re-measure reads the same file | **Fixed**: only `<hash>.<ext>` is the upload; the test fails without the fix | `dba2bc5` |
| X43 | *Found in the live re-run:* one DFM job per answer round, run one at a time, outlasted the screen's 5.5-minute poll | **Fixed**: one job per completed answer set; the poll runs 15 min by the clock | `364b68b` |
| S1 | The screen's rate trace read "22.438727985074628£/hr" on an INR screen | **Fixed** | `51e918f` |

**Count:** 41 findings from the reading (X1–X41 + S1, with X35 folded into X14), plus 2 found in the live re-run (X42, X43). **36 fixed, 2 partly fixed (X28, X41), 5 open**:
X18 needs the engineer; X25, X34, X37, X39 are P3.

**Also noticed in the after-reports (open, P3):** on a sand casting, the pattern cost and pattern life sit in fields
labelled "Die Cost (£)" and "Die Life (shots)". The form shares those fields across HPDC and sand. The values and their
bases are right ("sand toolmaker shop model … 1 core box", "sand pattern life band 8,000 moulds"); only the label is
wrong.

## 7. Checks

- Typecheck (`tsc -p tsconfig.build.json`): clean.
- **Full suite: 254 files, 3,687 tests passed, 0 failed.** Three pinned texts were restated in `26003a7`: the rule-prompt
  snapshot (wording only), the sensitivity label (X11) and the labour role list (X14).
  `tests/casting-360-review.test.ts` holds 36 tests, one or more per fix. The mesh-file test fails without its fix.
- **Real-parts baseline:** one part moved, PRCR002 £84.93 → £87.38 (UK 50k), with the reason in `d7efefe`. X40 leaves the
  UK unchanged (factor 1).
- **Build:** passes. `dist` is rebuilt and committed.
- **Live, final run** (`after/live-summary.json`): all three parts with real server, browser and kernel.
  - The DFM landed on every part in about a minute, so the reports carry it.
  - Screen = PDF = Excel on every part (knuckle ₹2,519.13, stub axle ₹5,184.39, bracket ₹2,544.96), and Excel sheet 7's five
    arithmetic checks are OK on each.
  - `after/export-checks.txt` checks 28 fixed findings by their text in each export. All pass except X16 on the bracket,
    which is expected: its largest hole is Ø20, which is drilled, not bored.
- **Two faults only the live re-run could find**, now fixed (X42, X43). Before X4, the upload's DFM job ran for the
  initial recommendation ("machining"), not for the route the engineer chose. That also explains the bracket's
  "9 fixturings" (X19).
