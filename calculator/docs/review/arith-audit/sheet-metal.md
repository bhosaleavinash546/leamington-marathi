# Arithmetic audit — SHEET METAL (stamping, laser + press brake, BIW pressings, sheet hardware)

30 Oct 2026. Group id `sheet-metal`. Brief: `BRIEF.md` in this folder.

## 1. Scope

**Files audited (owned):** `src/engine/cost-input-rules/commodities/sheet-metal.ts` (rules), `src/engine/modules/sheet-metal.ts`
(stamping module), `sheet-metal-fab.ts`, `sheet-metal-hardware.ts`, `sheet-metal-advisor.ts` (die cost / life, process advisor),
`src/engine/machine-sizing.ts` (press ladder), `src/engine/nesting.ts`, `src/engine/cost-input-rules/derive/blank.ts`,
`src/engine/forming-properties.ts`, and the `sheet_metal` / `sheet_metal_fab` case of `to-cost-params.ts` (read; not edited).

**Real parts** (UK book, 5-year programme, the baseline's answers, `costMeasuredPart`):

| Case | Route costed |
|---|---|
| Seat_Locking_Bracket @ 50,000/yr | coil-fed progressive die (stretch-formed, 8 % stretch at p95) |
| BIW_Floor_Reinforcement @ 50,000/yr | drawn (43 %): blanking press → 5-press tandem line |
| BIW_Inner_Panel @ 50,000/yr | drawn (28 %): blanking press → 5-press tandem line |
| BIW_Reinf_Channel @ 50,000/yr | bent: coil-fed progressive die |
| Seat_Locking_Bracket @ 5,000/yr | progressive, soft tooling. **The laser + brake route is refused** — the unfold finds the bracket stretch-formed, and a press brake cannot stretch metal. So this case does not exercise fab. |
| BIW_Reinf_Channel @ 5,000/yr, chosen as `sheet_metal_fab` | laser → press brake. This is the case that exercises the fab route. |

**Reproduce**

```bash
cd calculator
npx tsx scripts/arith-audit/sheet-metal.ts [--verbose]     # shadow model, 328 checks, exit 1 on FAIL
npx vitest run tests/arith-audit-sheet-metal.test.ts         # one test per fix + the shadow model
python3 -I scripts/arith-audit/basis-check.py <dumpDir>      # printed "a × b = c" (see §4 note)
```

The `docs/sheet-metal/` folder the brief names as "prior reviews" is not in this checkout. I read the claims those reviews made through
their code comments and through `tests/sheet-metal-review.test.ts` and `tests/biw-stamping-process.test.ts`.

## 2. Sequence: as costed v as made

**Seat bracket @ 50k.** As costed:
1. Coil → *Press (progressive)* on press-400t. 20 SPM → 3.000 s, × 1/(1−0.015) = 3.046 s. 1 part a stroke, crew 0.5, OEE 0.85, LE 0.95.
2. *Die change*: 1 h ÷ 2,500 batch on press-400t, technician at OEE 1.

The die has 8 stations: pierce, 5 forming stations (15 bends at ~3 each), cut-off, restrike.

As made: coil → straightener / feeder → progressive die (pierce, carrier notch, form ×5, restrike, cut-off) → parts out.

**Verdict: matches** after SM-1. Before SM-1 there was no pierce station, although the unfold measures 21 cut-outs. The 10 mm trim allowance is cut by the cut-off / trim station. The die counts that station once and does not charge a separate trim station (stated).

**Floor reinforcement / inner panel @ 50k.** As costed:
1. *Blanking press (coil → blanks)*: 45 blanks/min → 1.354 s with the reject uplift. Press-100t on the floor, press-400t on the inner panel; both are sized since SM-3.
2. *Tandem press line (5 presses)*: draw, trim, pierce, flange, restrike. 10 SPM × 5 presses → 30.46 s of press time per part. Every press is charged at the draw press's rate (press-200t on the floor, press-400t on the panel). Crew 1 per press.
3. *Die change*: 0.5 h × 5 presses ÷ 2,500.
4. *Blanking die change*: 0.5 h ÷ 2,500. This step is added by SM-3.

As made: coil → blanking line → OP10 draw → OP20 trim → OP30 pierce → OP40 flange → OP50 restrike.

**Verdict: matches.** Before SM-2 the blanking die was not in the tool set.

Note that the floor reinforcement's 644 × 497 mm blank goes to a tandem line only because of the 1,500 cm² threshold. Many shops would run it on a transfer press. The threshold is now printed as engineering-typical (SM-11).

**Channel @ 50k.** As costed:
1. *Press (progressive)* on press-100t: 3 stations (pierce, form 2 bends, cut-off). 80 SPM (the press maximum; the feed limit is 128.6) → 0.75 s × uplift. Crew 0.5.
2. *Die change*: 1 h ÷ 2,500.

**Verdict: matches.**

**Channel @ 5k, fab.** As costed:
1. *Laser Cutting* on laser-trumpf-3030: 22.5 s × uplift. Oxygen assist gas at £1.80/h of cycle.
2. *Press Brake Bending* on TruBend 3100: 2 × 17 s × uplift. 17 s = 12 s a bend + 10 s handling spread over 2 bends. Skilled operator.
3. *Press brake set-up*: 2 × 900 s ÷ 250 batch at OEE 1. This step is split out by SM-5.

As made: laser → deburr → brake.

**Verdict: one step not costed.** No deburr / edge-finish step is charged. The advisor's route lists "Deburring", but nothing on screen claims it is included or excluded (SM-18, proposed).

## 3. One part by hand — Seat_Locking_Bracket @ 50,000/yr, UK, after the fixes

All £ figures are per part unless stated. Rates are from the UK book:
- press-400t: £38.1879/h
- semi-skilled labour: £24.65/h
- technician: £35.17/h
- DC04: £0.756/kg, scrap £0.20/kg, 7,850 kg/m³

| Line | Arithmetic | Value |
|---|---|---|
| Gauge | measured between 15 bend pairs | 1.60 mm |
| Net weight | 71.066 cm³ × 0.00785 kg/cm³ | 0.558 kg |
| Blank | 279 × 210 mm unfold rectangle + 2 × 10 mm trim allowance | 299 × 230 mm |
| Strip cell | nest of the outline grown by 10 mm, 1-up at 97° | pitch 233 × strip 292 mm |
| Metal per stroke | 233 × 292 × 1.6 mm³ × 7,850 kg/m³ ÷ 10⁹ | 0.854532 kg |
| Utilisation | 0.558 ÷ 0.854532 | 0.652989 |
| Reject uplift | 1 ÷ (1 − 0.015) | 1.015228 |
| Costed net | 0.558 × 1.015228 | 0.566497 kg |
| Gross bought | 0.566497 ÷ 0.652989 | 0.867545 kg |
| **Raw material** | 0.867545 × 0.756 − (0.867545 − 0.566497) × 0.20 = 0.655864 − 0.060210 | **£0.5957** |
| Cut force | (947 + 982) mm × 1.6 × 280 ÷ 9,807 | 88.12 t |
| Bend force | 0.166 × 634.8 mm × 1.6 × 350 (= 280 ÷ 0.8) ÷ 9,807 | 6.02 t |
| Press force | (88.12 + 6.02) × 1.1 stripper = 103.6 t; × 1.25 | 129.4 t |
| Stations | pierce 1 + ⌈15 ÷ 3⌉ = 5 + cut-off 1 + restrike 1 | 8 |
| Die length | 8 × 233 + 400 | 2,264 mm |
| Press | press-200t passes on force but its 1,800 mm bolster is too short | press-400t (2,500 mm bolster, 40 SPM max) |
| SPM | min(18,000 ÷ 233 = 77.3, 40) × 0.8³ (15 bends: steps at ≥ 4, ≥ 8, ≥ 14) = 20.48 → | 20 |
| Press cycle | 60 ÷ 20 = 3 s × 1.015228 | 3.045685 s = 0.000846024 h |
| Press machine | 38.1879 × 0.000846024 ÷ 0.85 | £0.038009 |
| Press labour | 24.65 × 0.5 × 0.000846024 ÷ 0.95 | £0.010976 |
| Die change | 1 h ÷ 2,500 = 0.0004 h: machine 38.1879 × 0.0004 = £0.015275; labour 35.17 × 0.0004 = £0.014068 | |
| **Process** | 0.038009 + 0.015275 | **£0.0533** |
| **Labour** | 0.010976 + 0.014068 | **£0.0250** |
| Die build-up | progressive, 8 stations, 687.7 cm², station hours 70 + 0.11 × 687.7 = 145.65 h. Lines: design 3,200 + 800 × 8 = £9,600; die set 2,900 + 3.2 × 687.7 = £5,101; die-set machining (25 + 0.02 × 687.7) h × 52.37 = £2,030; H13 687.7 × 0.85 × 5 × 2 × 1.2 × 0.00785 × 8 = 440.5 kg × 9.5 = £4,185; EDM 0.35 × 145.65 × 8 h × 58.42 = £23,824; CNC 0.45 × … × 52.37 = £27,459; fitting 0.20 × … × 48.35 = £11,267; tryout 32 h × 85.61 = £2,740. Subtotal £86,206 + 22 % toolmaker O+P £18,965 | £105,171 |
| Die life | 1,000,000 × (300 ÷ 280)^1.3 × 1.5 ÷ 1.6 = 1,025,437, rounded to the nearest 10k | 1,030,000 → 1 set |
| Tooling total | 105,171 × 1 × (1 + 0.05 × 5 years) | £131,463.75 |
| **Tooling** | 131,463.75 ÷ (50,000 × 5) | **£0.5259** |
| Packaging / logistics | geometry-sanity.ts estimators (not sheet-metal) | £0.07 / £0.09 |
| **Overhead** | 12 % × (0.595654 + 0.053284 + 0.025044 + 0.525855 = 1.199837) | **£0.1440** |
| **Margin** | 8 % × (1.199837 + 0.07 + 0.09 + 0.143980 = 1.503817) | **£0.1203** |
| **Total** | 1.503817 + 0.120305 | **£1.6241** |

Before the fixes the total was £1.5567. The die was 7 stations at £94,019 because no pierce station was counted (SM-1).

## 4. Shadow model — `scripts/arith-audit/sheet-metal.ts`

The shadow model recomputes every rule input, operation (machine, cycle, crew × labour time, OEE, £), material line, tool, amortisation, bucket and total. It works from the measured geometry, the rate book and constants restated as data. It does not call the rules, the modules, the die estimator or the press ladder.

It also checks four things:
- the nest's printed utilisation, recomputed from the grown outline's area ÷ the cell;
- the strip width, recomputed from the outline extent at the printed angle + 2 edges;
- that pitch × strip is at least the blank's area;
- that each £/part printed in the route basis is what that route's costing carries.

| Case | Checks | Result |
|---|---|---|
| Seat_Locking_Bracket @50k | 52 | 52 PASS |
| BIW_Floor_Reinforcement @50k | 64 | 64 PASS |
| BIW_Inner_Panel @50k | 64 | 64 PASS |
| BIW_Reinf_Channel @50k | 52 | 52 PASS |
| Seat_Locking_Bracket @5k | 52 | 52 PASS |
| BIW_Reinf_Channel @5k fab | 44 | 44 PASS |
| **Total** | **328** | **0 FAIL** |

On the code before the fixes these checks would have failed:
- the seat bracket's numOperations (7 v 8) and die cost;
- the floor and inner panel's die cost (blanking die missing) and their blanking machine;
- the blanking die change, missing from the operation sequence;
- the route-basis checks on every case.

The stamping figure in the route basis was £0.427 against £0.548 costed on the seat bracket, and £0.161 against £0.219 on the channel. The fab bending op also failed: its set-up was inside the bend cycle.

`basis-check.py` flagged 26 "equations" in the old dumps. All of them were parse artefacts of an unstated ÷ 9,807 and of "pitch × strip = 86 %" (the blank area was never printed). The force bases now print "÷ 9,807 N/t" (SM-9). I did not edit the utilisation text: the strip-width check in the shadow and the area check cover it.

## 5. Constant register

Classes: SOURCED, LIBRARY, MEASURED, LABELLED-EST. (visible to the reader, now including the labels added here), UNLABELLED.

| file:line | value | meaning | class | £ effect on a real part |
|---|---|---|---|---|
| rules :53 `SHEAR_MPA.steel` | 280 MPa | shear strength, drives force and die hardness | LABELLED-EST. (SM-10, EN 10130 DC04 UTS range) | press choice; hardness factor 1.0 (≤ 300) |
| rules :519 `UTS_PER_SHEAR` | 1/0.8 | UTS from shear | LABELLED-EST. (SM-9) | bend / draw force |
| rules :561 | 0.166 | V-bend 1.33 ÷ 8t die opening | LABELLED-EST. (formula printed) | 6 t of 104 t |
| rules :608 | 1.1 | +10 % stripper | LABELLED-EST. (SM-9) | press tonnage |
| machine-sizing `STAMPING_PRESS_SAFETY` | 1.25 | press margin | LABELLED-EST. (printed) | press tier |
| machine-sizing `DIE_END_ALLOWANCE_MM` / `SINGLE_DIE_ALLOWANCE_MM` | 400 / 600 mm | die length over the stations / blank | LABELLED-EST. (SM-9) | **picks press-400t on the seat bracket and the inner panel** |
| machine-sizing `STAMPING_PRESSES` | t, bolster, max SPM | press envelopes | LABELLED-EST. ("typical" printed) | press and SPM |
| rules :516 `BENDS_PER_STATION` | 3 | bends a station | LABELLED-EST. (printed "~3") | seat die 8 stations |
| rules :664 / :666 | 18,000 mm/min, 0.8 a step | coil feed, de-rate | LABELLED-EST. (SM-8) | seat SPM 40 → 20; £0.019 machine + labour |
| rules :662 / :855 | 10 / 20 SPM | tandem / transfer rate | LABELLED-EST. (printed) | BIW press time |
| rules :319 `TANDEM_BLANK_CM2` | 1,500 cm² | tandem v transfer | LABELLED-EST. (SM-11) | floor + inner: tandem (5 dies) |
| rules :321–324 | 30k/yr, 20 / 45 blanks/min | laser v die blanking, rates | LABELLED-EST. (SM-11) | blanking op; blanking die |
| rules :273 | ½ draw depth, 20–80 mm | binder + addendum | LABELLED-EST. (SM-11) | floor 34 mm, inner 60 mm: blank +16 % / +18 % |
| rules :668 `BINDER_PRESSURE_MPA` | 2.5 MPa | blank holder | LABELLED-EST. (printed 2–3) | inner draw force 156 of 279 t |
| rules :291 | 10 mm | stretch-formed trim allowance | LABELLED-EST. (printed) | seat blank 279 → 299 mm |
| rules :358–359 | max(3, 2t) | web / edge margin | LABELLED-EST. (printed) | strip cell |
| rules :828 `PRESS_REJECT` | 1.5 % | press-shop scrap | LABELLED-EST. ("engineering-typical 1–2 %") | ×1.0152 on material and cycles |
| rules :818 `DIE_MAINTENANCE_FRACTION` | 5 %/yr | die upkeep | LABELLED-EST. (printed) | +25 % on the die over 5 years: seat £0.105 |
| rules `setupHoursFor` | 0.5 / 1 / 1.5 h | die change | LABELLED-EST. (printed) | seat £0.029 |
| `standardBatchSize` | annual ÷ 20, 50–5,000 | batch | LABELLED-EST. (printed) | die change |
| rules :824 `pressManning` | 0.5 (coil ≤ 400 t) / 1 | crew | LABELLED-EST. (printed) | labour |
| rules :676 `SOFT_TOOL` | ×0.35, 25k hits, ≤ 25k parts | soft dies | LABELLED-EST. (SM-12) | seat @5k die £36,810 |
| advisor :287–301 | typeF 0.6 / 1 / 1.25; NRE; 70 + 0.11·A h; 0.35 / 0.45 / 0.20 split; 5 cm × 2 × 1.2 steel; £2,900 + £3.20/cm²; 25 + 0.02·A h; 32 h tryout | die build-up | LABELLED-EST. (SM-6 / SM-7: every line prints its arithmetic and "CostVision engineering heuristic") | the whole die: seat £105k, floor £279k, inner £1.01M |
| toolmaking `SHOP_OVERHEAD_PROFIT` | 22 % | toolmaker O+P | LABELLED-EST. (line prints "22 % on …"; not my file) | 18 % of each die |
| toolmaking `TOOLROOM_RATES_UK`, H13 £9.50/kg | £/h, £/kg | toolroom | LIBRARY-like (dated, held; not my file) | die |
| advisor :362 | 1e6 × (300 / τ)^1.3 × gauge factor | die life | LABELLED-EST. (SM-14) | none at 250k parts (1 set) |
| advisor :273 | hardness factor | — | LABELLED-EST. via build-up | 1.0 on every part |
| module :268 | 0.75 / 1.5 / 3.0 s | line floor | UNLABELLED to the reader (code comment only) | none: binds no real part; the channel's 80 SPM = 0.75 s exactly |
| module :218, :233 | 0.30 kWh/kg, £0.006/mm | hot stamping, TWB | UNLABELLED (code comment) | not exercised |
| fab :21–33 | O₂ £1.80/h, N₂ £9.00/h, abrasive £18/h | assist gas | LABELLED in code (sourced ranges in the comment), not printed | channel fab £0.011 |
| fab :62, :73, :98 | 8,500 / t^1.05; 0.3 + 0.15t s; 8 s | laser feed, pierce, handling | LABELLED-EST. (SM-15 prints them) | channel fab laser 22.5 s |
| rules `FAB` :697 | 12 s / bend, 10 s handling, 2 × 900 s set-ups, £1,500 | brake + programming | LABELLED-EST. (printed) | channel fab |
| rules :1363 | 0.95 cap | fab utilisation | UNLABELLED (cap only) | none (0.91) |
| hardware :44–82 | £/piece, s, consumables | weld nuts etc. | UNLABELLED to the reader ("indicative UK distributor pricing 2026-07" in code) | none: no hardware detected on the real parts |
| forming-properties | n, r, K | formability | LABELLED (typical published, printed) | none (advisory) |
| nesting.ts | scanline / tolerance numerics | algorithm | n/a | geometry |
| to-cost-params sheet case | fallbacks: shear 250, strip W × 1.1, pitch L × 1.05, SPM 45, 3 ops, life 1M | used only when a rule did not run | UNLABELLED | none: no real part reaches them (SM-19) |

## 6. Findings register

| ID | Sev | file | Evidence | Status | £ before → after |
|---|---|---|---|---|---|
| SM-1 | H | rules `holeCount` | The seat bracket's unfold has 21 interior loops (982 mm of edge), but the feature table lists no round holes. The die got no pierce station and the laser one pierce. | FIXED: max(table, blank.holeCount). Test SM-1. | Seat @50k £1.5567 → £1.6241; @5k £2.8997 → £3.0885 |
| SM-2 | H | rules `stampingPlan` | Press-blanked lines (tandem / transfer, ≥ 30k/yr) were announced as "blanked first (blanking press …)" but the blanking die was never in the tool set. | FIXED: + one single-stage blanking die, itemised in the basis. Test SM-2. | Floor £5.2652 → £5.5540; Inner £17.0250 → £18.0711 (with SM-3) |
| SM-3 | H | module blanking op | The blanking press was a fixed press-200t. The inner panel's 1,428 mm blank + 600 mm die exceeds its 1,800 mm bolster (the tool's own table). The blanking die change was not charged. | FIXED: `blankingPressFor` (force on the blank rectangle, bolster on the die) + a blanking die-change op. Same in screen and headless (module). Test SM-3. | inner → press-400t; floor → press-100t (in the totals above) |
| SM-4 | H | rules `stampingPerPartGBP`, `fabPlan` | The route basis printed a "machine + labour + tooling" £/part the costing does not carry: OEE 0.80 / LE 0.92 instead of the form's 0.85 / 0.95; no reject uplift, die change or die maintenance; fab set-up inside the bend cycle and no reject uplift. Seat printed £0.427, costing £0.548; channel £0.161 v £0.219. | FIXED: both prices replay the module arithmetic; the shadow checks each one to £0.0006. No real part's route changes. Test SM-4. | — |
| SM-5 | M | fab module | The press-brake set-up was inside the bend cycle, so it was ÷ OEE (which already holds change-over losses), × the tolerance factor and × the reject uplift. | FIXED: own op at OEE 1 / LE 1, like the stamping die change. Test SM-5. | Channel fab @5k £2.5622 → £2.5221 |
| SM-6 | H (text) | advisor die build-up | The bases said "(45 + 0.075 × blank cm²) h" and "× 4 cm × 2"; the code ran 0.45 × (70 + 0.11·A) h and 5 cm × 2 × 1.2. | FIXED: the bases print the arithmetic done. Test SM-6. | — |
| SM-7 | M | rules die-cost basis | "toolmaker build-up" printed no figures. | FIXED: every line's h × £/h and £, O+P, = the die. | — |
| SM-8 | M | rules SPM | 18 m/min and 0.8 a step were unlabelled ("de-rated for 15 bends"). | FIXED: the arithmetic and the label are printed. | — |
| SM-9 | M | rules force / bolster | ÷ 9,807, UTS = shear ÷ 0.8, +10 % stripper and the 400 / 600 mm allowances were unstated. | FIXED | — |
| SM-10 | M | rules shear | 280 MPa was labelled "library / reference" but is not in the library. | FIXED: source `rule`, engineering-typical with the EN 10130 DC04 basis. | — |
| SM-11 | M | rules `pressProcess` | The 1,500 cm² tandem threshold, the 30k laser threshold and the 20 / 45 blanks/min rates were unlabelled. | FIXED | — |
| SM-12 | M | rules soft die | The 0.35 factor was not labelled. | FIXED | — |
| SM-13 | H (text) | rules `sheetMetal.process` | The advisor's prose was printed over a different costing: "Progressive / Transfer Stamping" over a progressive die, "Turret Punching" and "Laser Cutting" over laser + brake. | FIXED: states the costed plan + the route basis. Test SM-7. | — |
| SM-14 | L | rules die life | The model was not stated. | FIXED | — |
| SM-15 | L | rules fab laser basis | The cycle arithmetic was not printed. | FIXED | — |
| SM-16 | L | module rawMaterial | A rejected pressing's metal earns no scrap credit: the reject allowance rides in `netWeightKg` (the PDF prints it as "Costed Net Weight … reject allowance"). | PROPOSED (needs a cross-commodity decision): `netWeightKg: inputs.netWeightKg, materialUtilization: materialUtilization / rejectUplift` in `computeSheetMetalDrivers` (and `materialUtilization: inputs.materialUtilization / rejectUplift` in fab) | +£0.0017 credit on the seat, +£0.027 on the inner panel |
| SM-17 | L | fab module finishing | The coated area ignores the gauge: `thicknessMm` is not a fab input. The stamping module passes it. | PROPOSED: add `thicknessMm?: number` to `SheetMetalFabInputs`, pass it to `finishingForCommodity`, send `thicknessMm: num(s.thicknessMm)` from the fab case of to-cost-params, and the gauge from main.ts's fab collector (parity). | only when a finish is answered |
| SM-18 | L | fab route | Laser → brake has no deburr / edge-finish op; the advisor's route lists "Deburring". Nothing printed claims it either way. | PROPOSED: add a sourced deburr time, or print "deburr not included" in the fab route basis. | — |
| SM-19 | L | to-cost-params sheet case | Unlabelled fallbacks (shear 250 against the rules' 280, strip W × 1.1, pitch L × 1.05, SPM 45, 3 ops, life 1M). | NOTE: no real part reaches them | — |
| SM-20 | L | rules force | On a stretch-formed part the cut force uses the part outline, not the outline grown by the 10 mm allowance (~+6 % of the outline force). | NOTE: the bolster, not the force, picks the seat's press | — |
| SM-21 | L | hardware catalogue | The prices and times are not printed with a basis. | NOTE: not exercised (no hardware detected) | — |

**Real parts that move** (UK, 50k, 5 yr): Seat_Locking_Bracket £1.5567 → £1.6241; BIW_Floor_Reinforcement £5.2652 → £5.5540; BIW_Inner_Panel £17.0250 → £18.0711; BIW_Reinf_Channel £0.9322 (unchanged).
- `tests/real-parts-baseline.test.ts` moves for those three, at the baseline's own volume and programme: Seat £3.38 → £3.66, Floor £9.76 → £10.95, Inner panel £33.35 → £37.67. The channel holds.
- `tests/cad-phase2.test.ts` D4 pins the seat bracket's baseline total. It was already failing here on the knuckle, which another auditor moved.
- The rules-prompt snapshot moves for `sheet_metal` / `sheet_metal_fab`, because the basis text changed.
- Tests I updated to the corrected behaviour, each with a comment: `tests/sheet-metal-review.test.ts` (numOps 7 → 8; soft-die ratio now excludes the 50k blanking die), `tests/biw-stamping-process.test.ts` (blanking press sized), `tests/sheet-metal-fab.test.ts` (set-up op), `tests/cost-input-rules-sheet-metal.test.ts` (process prose).

## 7. Not checked, and why

- **The nesting algorithm itself.** The shadow checks the nest's outputs (strip width at the printed angle, utilisation = area ÷ cell, no overlap) but does not re-derive the minimum pitch. The scanline solver is geometry and was validated against `research/fastblank/nest.py` in its own tests.
- **The unfold / forming solve (kernel and `server/utils/blank-unfold.ts`).** These are measured inputs here.
- **Hot stamping, tailor-welded blanks, lamination finishing, hardware install, surface finishing.** No real sheet part exercises them; their constants are listed in §5.
- **The screen.** Parity is by construction: every fix is in the module or reaches the form through `sm-die-cost` / `smf-*`. `tests/cad-workspace.test.ts` passes.
- **Other countries.** `tests/country-rates.test.ts` failures in this run are on Casting_Braket and AL_Battery_Rail (other groups).
- **Packaging / logistics estimators** (geometry-sanity.ts) are not a sheet-metal file; the shadow takes them from the stack input.
- **Accuracy against a price paid.** Not measured; there are no sheet-metal actuals.
