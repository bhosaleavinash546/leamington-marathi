# Arithmetic audit — PCB FAB and PCBA (`pcb`), 30 Oct 2026

## 1. Scope

**Path audited.** The photo → BOM → should-cost path that the screen, the PCBA PDF and the Excel workbook print
(`runStage4` in `server/routes/pcb.ts` → `computePCBCountryCost` in `server/data/pcb-country-rates.ts` →
`applyAutomotiveGrade`), the BOM pricing it relies on (`pcb-bom-grounding.ts`, `pcb-class-pricing.ts`,
`pcb-price-catalogue.ts`), the board-spec stabiliser (`pcb-boardspec-stabilise.ts`), and the two engine modules the PCB
forms use when no analysis exists (`src/engine/modules/pcb-fab.ts`, `pcba.ts`).

**Boards.** PCB has no CAD part. The real boards are the replayed model readings the PCB tests already carry:

| Board | Fixture | Case | Why |
|---|---|---|---|
| 77 GHz radar (NXP S32R294), 17 BOM lines, 8 L, 222 placements | `e2e/fixtures/pcb-radar-replies.json` | China, 250,000 | the headline traced in `tests/pcb-stage4-trace.test.ts` |
| 360° camera, 12 lines, 8 L, 20 × 20 mm, 80 placements | `e2e/fixtures/pcb-camera-replies.json` | China, 250,000 | `docs/pcb/camera-board-360-2026-10.md` |
| radar | same | UK, 1,000 | air freight, table ceilings, prototype volume factors, 7–10 % burden |
| radar | same | Poland, 25,000 | interpolated burden and table factor |
| radar at ASIL-C | `tests/pcb-headline-trace.test.ts` figures | China, 250,000 | burn-in (the guard costs the fixture at ASIL-B) |
| PCB fab form board | 8 L 200 × 150, China, auto grade 1 | module | `computePCBFabDrivers` |
| PCBA form board | 3 lines, 2 lines × 2 sides, 2 BGA, ICT | module | `computePCBADrivers` |

**Reproduce.**

```bash
cd calculator
npx tsx scripts/arith-audit/pcb.ts --verbose        # independent re-add, 350 checks, exit 1 on any FAIL
npx vitest run tests/arith-audit-pcb.test.ts        # the fixes (10 tests, each failed before)
npx vitest run tests/pcb tests/pcba                 # the PCB suites (1 expected failure — see P1)
python3 -I scripts/arith-audit/constants.py src/engine/modules/pcb-fab.ts src/engine/modules/pcba.ts server/data/pcb-country-rates.ts
```

## 2. Sequence (as costed v as made)

A populated automotive board is made: bare board at the fab (image, etch, laminate, drill, plate, mask, finish, rout,
electrical test) → EMS: kitting → solder-paste print → placement → reflow (→ second side: print, place, reflow) → AOI →
X-ray of BGA/CSP → THT / selective solder → ICT / functional → (coat) → serialise → (burn-in for ASIL-C/D) → pack → ship.

| Step as made | As costed (radar, CN, 250k) | Verdict |
|---|---|---|
| Bare board | country £/dm² base + per-layer adder × panel waste; finish ×; vias per 100 / 10; impedance +18 %; set-up ÷ order | in order, once. Fab price is a fabricator's price — no second overhead/margin (correct) |
| Automotive fab | IATF +18 %, laminate 40 % × 50 %, class-3 microsection + coupons per panel | once (`applyAutomotiveGrade`) |
| Kitting / buying | EMS material burden 5 % (log-linear 10 % → 5 %) | once |
| Print + place + reflow | placements ÷ 3,600 /h × line £/h + batch set-up ÷ order | one line pass. **Second side NOT costed** — said on screen (`SECOND_SIDE_NOT_COSTED`, recorded open item) |
| AOI, X-ray, ICT | station time × 2 × labour + programme / fixture ÷ order, table price as ceiling | once each, in order |
| THT | joints × £/joint | once |
| Coating | only when the spec says coated; country £/cm² | the side model `computeConformalCoatingCost` (£0.12–0.20/cm², ~50–80× the table) is only a gate; the printed figure is the table's (verified) |
| Serialise, burn-in | automotive assembly premium (burn-in at ASIL-C/D only) | once |
| Pack, ship, duty | packaging per board; sea ≥ 2,500 boards; duty on the customs value | duty now on CIF (P3) |
| Cost of quality | λ = placements × dppm, 95 % rework / 5 % scrap | once; does not include the automotive premiums (P10, proposed) |

PCBA module (form path): SMT op, THT/hand op (bench), X-ray, ICT — each once. **Defect:** the SMT time a board was
divided by the number of parallel lines (P1, fixed).

## 3. One board by hand — radar, China, 250,000 boards a year (headline £60.62)

Rates: `PCB_COUNTRY_RATES.cn` (29 Sep 2026); labour £3.7523/h and power £0.071/kWh from `REGIONAL_DATA.CN`; country
factors CN inspection 0.2319, process 0.2423. Board as costed: 88 × 49 mm (the model's "measured" had no OCR evidence, so
the stabiliser rounded it as an estimate), 8 L, ImAg, 220 through vias, impedance, 222 SMT placements, 4 THT joints,
1 BGA, AOI, ICT 90 s. ASIL-B (the guard: no safety PMIC named).

**Components** (each at its parts bought = qty × 250,000; table factor k = (min(q, 300k)/10k)^log10 0.85 → 0.79677 at
250k parts, 0.78658 flat above 300k; class point = lo + ¼(hi − lo), × k, capped):

| Line | Arithmetic | £ |
|---|---|---|
| U1 FS32R294KCMJD | catalogue 200k £15.5088 → 300k £15.0713, log-interp at 250k: t = log(1.25)/log(1.5) = 0.55034 → 15.5088 − 0.4375 × 0.55034 | 15.2680 |
| U2 TEF8105 (estimate) | 9.713 → 9.439 at t 0.55034 | 9.5622 |
| U3 W25Q32JWSSIQ | 0.5439 → 0.5286 | 0.5355 |
| U4,U5 LDO SOIC AEC | (0.3 + ¼ × 2.7) × 0.78658 = 0.76692 × 2 | 1.5338 |
| U6,U7 MAX20431 (family price) | at 500k parts: q300k flat 2.8317 × 2 | 5.6634 |
| U8 TCAN1044AVDRQ1 | 0.2385 → 0.2318 | 0.2348 |
| U9 QFN unidentified AEC | (2 + ¼ × 13) × 0.79677 = 4.1830, ceiling median £4 × 0.79677 = 3.18708 | 3.1871 |
| U10 SOIC unidentified AEC | (0.25 + ¼ × 4.75) × 0.79677 = 1.14536 (under the £3.50 median ceiling) | 1.1454 |
| D1–D6, Q1–Q4 SOT-23 AEC | (0.03 + ¼ × 0.09) × 0.78658 = 0.04130 × 10 | 0.4130 |
| C_bulk1,2 electrolytic | (0.4 + ¼ × 3.1) × 0.78658 = 0.9242, capped at £0.90 × 0.78658 = 0.70792 × 2 | 1.4158 |
| Y1 TCXO AEC | (1.8 + ¼ × 6.2) × 0.79677 = 2.66918 | 2.6692 |
| R1–R70 0402 AEC | (0.003 + ¼ × 0.009) × 0.78658 = 0.0041295 × 70 | 0.2891 |
| C1–C90 0402 AEC | (0.005 + ¼ × 0.02) × 0.78658 = 0.0078658 × 90 | 0.7079 |
| C91–C120 0603 AEC | (0.012 + ¼ × 0.048) × 0.78658 = 0.018878 × 30 | 0.5663 |
| L1–L10 0805 inductor AEC | (0.06 + ¼ × 1.74) × 0.78658 = 0.38936 × 10 | 3.8936 |
| J1 sealed connector | (3 + ¼ × 15) × 0.79677 = 5.3782 | 5.3782 |
| J2,J3 header pads | not fitted | 0 |
| **Σ** | | **52.46** |

**Board, assembly, logistics** (each line is also printed in `breakdown.basis`):

| Item | Arithmetic | £ |
|---|---|---|
| Area, panel | 0.4312 dm²; 30-up on 480 × 350, util 0.770 → W = 1.2987 | — |
| Base 2L | 0.4312 × 0.1160 × 1.2987 | 0.0650 |
| Layers | 0.4312 × 0.07379 × 6 × 1.2987 | 0.2479 |
| ImAg | 0.3129 × 0.10 | 0.0313 |
| Vias | 2.20 × 0.1897 | 0.4173 |
| Impedance | 0.3129 × 18 % | 0.0563 |
| Set-up | 12.65 ÷ 250,000 | 0.0001 |
| **Fab (commercial)** | | **0.8179** |
| SMT | 222 ÷ 3,600 × 11.60 + 18.97 ÷ 250,000 | 0.7154 |
| THT | 4 × 0.009487 | 0.0379 |
| AOI | min(0.3689, 20/3600 × 2 × 3.7523 + 200/250,000) | 0.0425 |
| X-ray | min(1.265, 20/3600 × 2 × 3.7523 + 300/250,000) | 0.0429 |
| ICT | min(2.635, 90/3600 × 2 × 3.7523 + 5,000/250,000) | 0.2076 |
| **Assembly & test (commercial)** | | **1.0463** |
| Components + burden | 52.46 × 1.05 | 55.0830 |
| Freight (sea) | max(25/250,000, 0.0966 kg × 0.40) | 0.0386 |
| Duty (CIF) | (0.8179 + 1.0463 + 55.0830 + 0.0386) × 3.7 % | 2.1085 |
| Energy | (0.4312 × 1.8 + 0.06 + 0.0008 × 222) = 1.0138 kWh × 0.071 | 0.0720 |
| Packaging | country figure | 0.0630 |
| Cost of quality | λ = 0.1776; 0.1776 × (0.95 × 0.3131 + 0.05 × 56.9473) | 0.5585 |
| **Commercial total** | 0.8179 + 1.0463 + 0.0386 + 2.1085 + 55.0830 + 0.0720 + 0.0630 + 0.5585 = 59.7878 → | **59.79** |
| Automotive fab | on the breakdown's ROUNDED fab 0.82: × 18 % = 0.1476; × 40 % × 50 % = 0.1640; class-3 8 × 0.2319 ÷ 30 = 0.0618; coupons 20 × 0.2319 ÷ 30 = 0.1546 → graded r(1.3480) 1.35 − 0.82 | 0.53 |
| Automotive assembly | on the rounded assembly 1.05: × 20 % = 0.2100; × 5 % = 0.0525; serialisation 0.05 × 0.2423 = 0.0121 → graded r(1.3246) 1.32 − 1.05 | 0.27 |
| Duty on the grade | 0.80 × 3.7 % | 0.0296 |
| **Headline** | 59.79 + 0.53 + 0.27 + 0.0296 = 60.6196 → | **£60.62** |

Shadow (`scripts/arith-audit/pcb.ts`): £60.62, every item within ½ p.

## 4. Shadow-model result

`npx tsx scripts/arith-audit/pcb.ts` — **350 PASS · 0 FAIL** after the fixes (4 FAIL before tolerance was set to ½ p on
line totals: the printed 5-decimal unit × qty differs from the line total by ≤ 0.05 p — rounding, not a defect).

| Case | Checks | Headline (product = shadow) | Notes |
|---|---|---|---|
| radar CN 250k | 17 lines × (unit, line, note range) + 25 roll-up + 22 basis lines + NPI | £60.62 | |
| camera CN 250k | 12 lines + roll-up + basis + NPI | £11.89 | band was a point before P4 |
| radar UK 1k | lines (prototype factors), air freight, ceilings | £123.37 | |
| radar PL 25k | interpolated burden 6.2 %, table factor | £72.63 | |
| radar ASIL-C CN 250k (product functions) | burn-in 4 × £180 × 0.2319 ÷ 500 = £0.33, premiums | £76.75 | BOM £66.84 (old test figures) |
| pcb-fab module | cost a board, 6 build-up lines, monotonic in layers 1…24 | — | |
| pcba module | material, SMT (2 lines), THT, X-ray, ICT | — | |

What the shadow re-derives independently: table volume factor, catalogue log-interpolation, class point and ceilings,
panel fit, every fab / assembly / logistics / energy / quality term, burden, CIF duty, automotive premiums, the NPI
costing at 50 boards, the band anchoring, and every printed basis formula's £. It imports only data (country table,
REGIONAL_DATA, `countryFactor`, the catalogue JSON, the class table via `classRowByKey`, the class medians) and the
regex classifier `descriptionCap` (classification, not arithmetic).

## 5. Constant register (files owned)

Class: SOURCED (named source) · LIBRARY (rate table / REGIONAL_DATA) · LABELLED (stated engineering figure where the
reader sees it) · UNLABELLED. "Now" = after this audit (labels added in `breakdown.basis`, band / NRE / NPI `basis`,
pcb-fab `rawMaterial.lines`).

| File:line | Value | Meaning | Before | Now | £ on radar CN 250k |
|---|---|---|---|---|---|
| pcb-country-rates.ts:174–805 | per-country fab £/dm², layer adder, finish ×, via adders, HDI / impedance %, set-up, line £/h, £/joint, AOI / X-ray / ICT ceilings, coat £/cm², batch set-up, dppm, duty, freight, transit | the PCB country table | LIBRARY, no per-figure citation (cross-check doc) | LIBRARY, named as such in every basis line | fab 0.82, SMT 0.72, duty 2.14 |
| pcb-country-rates.ts:205 etc | 3.7 % / 5.5 % / 0 % | UK duty | UNLABELLED (360 open item) | LABELLED "an assumption — HS line not confirmed" | 2.14 (3.5 %) |
| :825 NRE_DATA | £ per country | second automotive NRE model (country card) | UNLABELLED | unchanged — see P8 | one-time |
| :845 ENERGY_PACKAGING | pack £/board | ESD packaging | UNLABELLED | LABELLED (engineering, no citation) | 0.06 |
| :1017 | 25 CNY/m² per ½ oz | heavy copper | SOURCED (Queen EMS / AIVON) | SOURCED, printed | 0 |
| :1089–1107 | 3 panels, 10 mm border, 3 mm gap, util floor 0.4 | panelisation | UNLABELLED (comment said "5 mm") | LABELLED, comment corrected | waste ×1.30 on base + layers |
| :1141–1148 | £5,000 ICT fixture, 20 s X-ray, £300, 20 s AOI, £200 | test at volume | LABELLED in code only | LABELLED, printed | 0.29 |
| :1153 | 10 / 7 / 5 % | EMS material burden | LABELLED in code ("engineering figure"); report said "stated rate by volume" | LABELLED, printed with the band | **2.62 (4.3 %)** |
| :1207 | 3,600 placements/h | one placement a second per line-hour | UNLABELLED | LABELLED | 0.72 (1.2 %) |
| :1210–1230 | × 2 labour | station = operator + tester | LABELLED in code | LABELLED, printed | in AOI/X-ray/ICT |
| :1242 | 28 g/dm²/layer, min 20 g | freight weight | LABELLED in a warning; contradicts its own comment (~26 g v 96 g) | LABELLED, the over-statement said (P11, not changed) | 0.04 |
| :1243 | 2,500 boards | sea v air threshold | UNLABELLED | LABELLED | — |
| :1258–1259 | 0.9 / 0.15 kWh/dm², 0.06 + 0.0008 kWh | energy | LABELLED in code | LABELLED, printed | 0.07 |
| :1270–1271 | λ cap 0.30, 95 / 5 %, 20 % + ½ ICT | cost of quality | LABELLED in code | LABELLED, printed | 0.56 (0.9 %) |
| pcb.ts:57–66 | 10k basis, b = 0.0706, flat 300k, prototype steps | table volume factor | recorded decision (F6–F8) | unchanged | all class lines |
| pcb.ts:148–152 | ×0.80, ×1.15/1.30/1.50, ×0.70/×1.40 | confidence band | UNLABELLED (pipeline review list) | LABELLED (`confidenceBand.basis`) | band only |
| pcb.ts:682–683 | £120/160/220 stencil, £280 FAI | NPI tooling | UNLABELLED | LABELLED (`npiBreakdown.basis`) | NPI only |
| pcb.ts (removed) | ×1.38 | NPI "prototype surcharge" | UNLABELLED, contradicted the volume curve | **removed** (P2) | NPI £92.46 → £276.76 |
| pcb.ts:714 | ×3.5 / 2.5 / 3.0 / 2.0 | "consumer → automotive" uplift | UNLABELLED | unchanged: dead for cost (the class point replaces the model's price) — see P13 | 0 |
| pcb.ts:813–823 | PPAP/FMEA/DVP&R/audit tiers, +1 %/£8 BOM, cap 50 % | automotive NRE | UNLABELLED | LABELLED (`automotiveNRE.basis`) | one-time |
| pcb.ts:835–842 | 15–50 % | single-source "premium" | UNLABELLED, printed as applied | unchanged — P5 (text) | 0 (not in cost) |
| pcb.ts:889 | £0.12 / 0.20 /cm² | side coating model | only a yes/no gate now | — | 0 |
| pcb.ts:939–950 | IATF 20 %, class 3 5 %, serialisation £0.05 / £0.80, burn-in 4 / 6 × £180 ÷ 500 | automotive assembly | UNLABELLED on screen | LABELLED (basis) | 0.27 |
| pcb.ts:987–996 | IATF 18 %, laminate 40 % × 35/50 %, microsection 8–45, coupons 5–35 | automotive fab | UNLABELLED (screen printed "35–50 %" without the 40 % share) | LABELLED (basis) | 0.53 |
| pcb.ts:1033–1040 | 3.2 / 0.8 / 0.4 / 0.3 a IC, £0.012 | missing-passive estimate | LABELLED in code | unchanged (display only, not in the cost) | 0 |
| pcb-class-pricing.ts:31–185 | class ranges | component price table | LIBRARY (rows dated / sourced in comments) | unchanged | £13 of the BOM |
| pcb-price-catalogue.ts:206–212 | class medians | ceiling for an unidentified part | LIBRARY | exported (data) | U9, U10 |
| pcb-price-catalogue.ts:181–193 | volumeScaleFrom10k steps | catalogue below 1k | UNLABELLED, STEPPED (cliffs at each break) | unchanged — P14 | 0 at volume |
| pcb-boardspec-stabilise.ts:29–40, 171–184 | 1.6 /cm², 30 /cm²/side, 0.4 /cm², 0.9 vias/cm²/layer, ×0.3–4 | size / via bands | LABELLED in warnings | unchanged | size and vias |
| pcb-fab.ts:56–131, 170–186, 288–337 | layer, panel £, tech, Tg, copper, HDI, trace, impedance, mask, finish, test, silk, via £, grade ×, yield deductions | the form's fab model | UNLABELLED (72); "IPC-2221" mis-attributed | LABELLED in 6 `rawMaterial.lines` printed by the screen, PDF §3B and Excel | form path |
| pcba.ts:27–79 | CPH by package, complexity 1.0–2.0, grade 1.0–2.2 | placement and test time | UNLABELLED | unchanged — P9 (no note field on an operation) | form path |
| pcba.ts:101, 118, 464, 487, 496, 503 | 30 s second side, 45 s AXI, 2 + 0.8 min/BGA cap 20, OEE 0.90 / 0.95, ICT 120 s | form-path ops | LABELLED in code only | unchanged — P9 | form path |
| pcba.ts:141–168 | packaging / freight estimate functions | form defaults | LABELLED in code ("buildup …") | unchanged | form path |
| pcba.ts:182 | 0.775 / decade | component volume decay | SOURCED (fitted to onsemi NCV8461 ladder) | unchanged | form path |
| pcba.ts:195 | 500k | price saturation | UNLABELLED | unchanged | form path |

## 6. Findings

| ID | Sev | Where | Evidence | Status | £ before → after |
|---|---|---|---|---|---|
| P1 | H | `pcba.ts` SMT op | Per-board placement time ÷ `smtLines` ("parallel SMT lines"): two lines halved the SMT £ of every board, though each line costs its own rate. The PCBA demo slot 2 sets 2 lines. | **FIXED** (test P1). `tests/pcba-engine-defects.test.ts` "splits the second pass across parallel lines" pinned the defect and now fails — replace with `expect(twoLines).toBeCloseTo(oneLine, 10)` | form path: SMT op ×2 on a 2-line board |
| P2 | H | `pcb.ts` `computeNPIBreakdown` | NPI 50 units = 250k headline × 1.38 (unsourced) + tooling/50: radar £92.46 beside the screen's own curve £220.55 at 100 boards (360 review open item). | **FIXED**: the board costed at 50 boards (same country, BOM at 50 × qty, set-ups over 50, graded) + stencil + FAI ÷ 50; `basis` printed | radar NPI £92.46 → £276.76; camera £24.41 → £114.78 |
| P3 | M | `pcb-country-rates.ts` duty | Customs value left out freight (UK value is CIF; 360 review open item). | **FIXED** (test P3) | radar CN +£0.0014 (headline £60.62 unchanged); camera +£0.0003; UK 1k: none (0 % duty) |
| P4 | M | `runStage4` band | With no model fab figure (camera) the fab band mid was 0 → "fab + assembly £0.75–0.75". | **FIXED** (test P4) | camera band £9.77–17.19 → £9.54–17.49 |
| P5 | H | `src/ui/pcb/panels.ts:177–195` (not mine) | Single-source panel: "Supply risk premium applied to unit prices" with "+£ cost add" — nothing in the cost adds it; premiums 15–50 % unsourced. | **PROPOSED**: header `…limited qualified alternatives. The premium is a supply-risk indicator (CostVision engineering judgement, not sourced) — it is <strong>not</strong> in the unit cost or the headline.`; column `Cost add` → `If it applied` | 0 (text) |
| P6 | M | `pcb-boardspec-stabilise.ts` `deriveTechnology` | Impedance + ≥ 6 L on a non-automotive board → `RF_MICRO`: the camera board (plain FR4 per its data sheet) printed "RF MICRO" and raised "An RF laminate … is not costed — get a fab quote" for a laminate nobody read. | **FIXED** (test P5): RF only when Rogers / PTFE / RO4xxx / Megtron is named | 0 £; one false warning gone |
| P7 | M | all PCB £ | ~600 unlabelled constants behind the headline; the screen / reports print amounts with no basis (burden 4.3 %, duty 3.5 %, SMT 1.2 %, automotive 1.3 % of the radar). | **FIXED at source**: `breakdown.basis[]` (item, arithmetic as done, £, class of each figure) on the selected country; `basis` on the band, NPI and NRE; pcb-fab build-up in `rawMaterial.lines` (prints in PDF §3B / Excel). **PROPOSED** renderers below | 0 |
| P8 | M | `panels.ts:440, 518` (not mine) | Two automotive NRE models on one screen: the country card's `PCB_COUNTRY_META.nre` (CN £15,599) v the NRE section's `automotiveNRE` (radar £13,200). | **PROPOSED**: country card and footer read `r._automotiveNRE?.totalNRE` (one model) | one-time |
| P9 | M | `pcba.ts` | CPH table, complexity 1.0–2.0, grade 1.0–2.2 on test time, AXI 45 s, X-ray 2 + 0.8 min, OEE 0.90 / 0.95 — unlabelled on the form path; `OperationInput` has no note. | **PROPOSED**: an optional `note?: string` on `OperationInput` (types.ts, shared) printed beside the op; then `pcba.ts` fills it | form path |
| P10 | L | `applyAutomotiveGrade` | Cost of quality is computed on the commercial board; the premiums are not in its rework / scrap terms (radar ASIL-B ≈ £0.02). The fab premium is (rounded graded total − rounded standard): its items print 0.15 + 0.16 + 0.06 + 0.15 = 0.52 against 0.53. | **PROPOSED**: `yieldDelta = λ × (0.95 × 0.2 × asmP + 0.05 × (fabP + asmP))` added in `applyAutomotiveGrade` and `gradeVolumeCurve`; premium = Σ unrounded items, rounded once (moves `pcb-headline-trace` by ≤ 1 p). Basis text now says how the premium is rounded | ≈ +£0.02 |
| P11 | L | `pcb-country-rates.ts:1242` | Weight estimate area × layers × 28 g/dm² gives 96.6 g for the radar; the code's own comment says ~26 g (a 1.6 mm FR4 board is ~30 g/dm² whatever its layers). | Not changed (no sourced density; £0.03 of freight). Basis line now says it over-states | −£0.03 if fixed |
| P12 | L | `pcb-fab.ts` | `LAYER_FACTOR` fallback `layers × 0.65`: 3 L (1.95) > 4 L (1.85), 5 L (3.25) > 6 L (2.80). | **FIXED** (test P6): linear between listed counts | 3 L / 5 L boards on the form |
| P13 | L | `pcb.ts:714` | `enforceAutomotiveGrading` multiplies a consumer-priced line ×2–3.5, then the grounding replaces every unconfirmed price with the class point — the multiplier never reaches the cost, yet the NRE panel says "N components had pricing enforced". | **PROPOSED**: badge text `…priced from the AEC-Q class ranges` and drop the dead multiplier | 0 |
| P14 | L | `pcb-price-catalogue.ts:181` | Catalogue below 1k parts is STEPPED (`volumeScaleFrom10k`) while the table factor is interpolated (F7 removed the table's cliffs only). | **PROPOSED**: interpolate in log q as `getVolumeMultiplier` does | prototype only |
| P15 | L | comments | `labourRatePerHr` "INFORMATIONAL" (it is costed in AOI / X-ray / ICT); "5 mm edge clearance" (10 mm); pcb-fab "IPC-2221 complexity model" (IPC-2221 is a design standard, no cost model); "IPC Class 2 — £×1.25" (1.20). | **FIXED** | 0 |
| P16 | L | `setDeterministicCostEstimates` | "PCB fab est." printed fab × 0.8 – × 1.3 beside a band built on × 0.7 – × 1.4. | **FIXED** (test P4): one spread | display |
| P17 | M | `pcba.ts` form path | The bare board (`pcbCostPerBoard`, a fabricator price that `pcb-fab.ts` declares `market_price`) sits in `directCost` and takes the stack's overhead + margin again; the analysis path takes it bought-in. | **PROPOSED** (modelling decision): `boughtIn: { cost: inputs.pcbCostPerBoard, handlingPct: 0 }` and remove it from `directCost` | form default £2.50 board: −(overhead + margin) × £2.50 |
| P18 | L | `panels.ts:516` | Footer: "Country fab and assembly rates as of 29 Sep 2026 (each with its source in the rate table)" — the table has no per-figure source. | **PROPOSED**: `(the PCB country table — no per-figure citation; cross-checked in docs/pcb/rate-cross-check-2026-10.md)` | 0 |
| P19 | L | `panels.ts:203–245` automotive tables | "Burn-in / HALT — ASIL-mandated" (ISO 26262 mandates neither; HALT is not burn-in); "IPC-6012 Class 3 — coupons + full electrical test" (it charges one microsection a panel); "Base SMT assembly — IPC-A-610 Class 2 baseline" (it is the whole country assembly + test); laminate "35–50 %" without the 40 % share. | **PROPOSED**: print `bd.basis` lines for these two rows instead of the fixed rationale strings (`buildAutomotiveAssemblySection` / `buildAutomotiveFabSection`) | 0 |
| P20 | L | `src/export/pcba-report-data.ts` (exports auditor) | Stack bases: burden "stated rate by volume" (it is an engineering figure); duty "components + board + assembly" (now + freight); automotive rows with no %. | **PROPOSED**: `basis: bd.basis?.find(b => b.item === 'EMS material burden')?.source` etc.; duty basis `On components + board + assembly + freight (CIF); rate an assumption — HS line not confirmed`; add a §"Cost basis" table from `bd.basis` (item / arithmetic / source), and print `_confidenceBand.basis`, `_automotiveNRE.basis` | 0 |

Renderer proposal for P7 (panels.ts, under the breakdown line at :437):

```ts
${(sel.basis ?? []).length ? `<details style="margin-top:6px"><summary style="font-size:0.68rem">How each figure is made</summary>
  <table style="width:100%;font-size:0.64rem">${sel.basis!.map(b => `<tr><td>${escHtml(b.item)}</td><td>${escHtml(b.formula)}</td>
  <td style="color:var(--text-muted)">${escHtml(b.source)}</td></tr>`).join('')}</table></details>` : ''}
```

(`PCBCountryBreakdown` in `src/ui/pcb/types.ts` needs `basis?: Array<{ item: string; formula: string; gbp: number; source: string }>`.)

**Real boards whose cost moves.** Headlines: radar CN 250k £60.62 → £60.62 (+£0.0014 duty), camera CN 250k £11.89 →
£11.89 (+£0.0003); UK and Poland rows unchanged (0 % duty). NPI panel: radar £92.46 → £276.76, camera £24.41 → £114.78.
Camera band £9.77–17.19 → £9.54–17.49. PCBA form with 2 SMT lines: SMT op time and £ double (correctly). The CAD
real-parts baseline and the rules-prompt snapshot are not touched by these files.

**Tests that move.** `tests/pcba-engine-defects.test.ts` › "splits the second pass across parallel lines" (pins P1;
proposed replacement above). All other PCB suites pass (37 files, 510 tests). `docs/pcb/traced-example-radar.md` still
shows the 29 Sep figures (£72.33, country sourcing ×0.88) — superseded by §3 above.

## 7. Not checked, and why

- **Photo reading** (what the model reads, OCR, consolidation, identity gates): AI-leak auditor's scope; accuracy is
  unmeasured (no labelled board).
- **Country table values** themselves (fab £/dm², line £/h, test ceilings, duty rates): rates move only through
  `scripts/pcb-rate-refresh.ts`; the duty HS line could not be checked (the UK tariff host is outside this session's
  network allow-list).
- **Catalogue prices**: they move only through the merge scripts; the shadow checks the interpolation, not the prices.
- **Live distributor pricing** (`pcb-live-pricing.ts`) — needs a key; not exercised.
- **Volume curve for other countries / quantities** beyond the analysed quantity and the NPI point; **scenario /
  reprice routes** (they call the same functions — `tests/pcb-stage4-trace.test.ts` covers idempotence).
- **Known-range / function-range lines**: none on these boards (the shadow refuses them rather than guess).
- **Excel workbook formulas** (`src/export/pcb-workbook.ts`) and the PDF render: exports auditor; they draw
  `buildPcbaReport`, which the shadow's figures feed.
- **Second reflow side, laminate type, board thickness**: not costed, already stated on screen (recorded open items).
