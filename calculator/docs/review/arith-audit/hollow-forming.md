# Arithmetic audit — blow moulding, rotational moulding, thermoforming (`hollow-forming`, 30 Oct 2026)

## 1. Scope

**Files (owned):** `src/engine/cost-input-rules/commodities/{blow-moulding,rotational-moulding,thermoforming}.ts`,
`src/engine/modules/{blow-moulding,blow-advisor,rotational-moulding,roto-advisor,thermoforming,thermoforming-advisor}.ts`,
`src/engine/cost-input-rules/derive/{shell-wall,hollow}.ts`, and the three cases in `to-cost-params.ts` (read, not edited:
they pass every rule value through, see §7).

**Parts (all MODELLED in OCP, not customer parts):** BM_Air_Duct, BM_Washer_Reservoir, ROTO_Header_Tank,
ROTO_Coolant_Tank, TF_Trim_Cover, TF_Battery_Box_Lid — UK book, 50,000 a year, 5-year programme, the baseline's answers.

**Reproduce**

```bash
cd calculator
npx tsx scripts/arith-audit/dump.ts <dir>                 # the product's own headless chain
npx tsx scripts/arith-audit/hollow-forming.ts <dir>       # independent shadow model, PASS / FAIL, exit 1 on FAIL
npx vitest run tests/arith-audit-hollow-forming.test.ts   # 15 tests, one per fixed finding + the six totals
```

The prior review documents named in the brief (`docs/cad/{blow,rotational,thermoforming}-review-2026-10.md`) are
**not in the tree**; only their tests exist (`tests/{blow-moulding,rotational-moulding,thermoforming}-review.test.ts`).

## 2. Sequence — as costed v as made

| Part | As costed (machine · time · parts/cycle · crew) | As a production engineer would route it | Verdict |
|---|---|---|---|
| BM_Air_Duct (PP, 2.5 L, 1.99 mm) | 1. EBM `blow-ebm-100l`: parison 0 s in series (continuous head extrudes 0.32 kg in 10 s while the 22 s mould sequence runs) + blow 5.0 + cool 12.5 + open/close 4.3 = 21.8 s ÷ 0.975, 1 cav, crew 0.5 · 2. in-line deflash `blow-deflash-trimmer` at the takt 21.8 s ÷ 0.975, OEE 0.8, no crew of its own · flash reground in line | extrude parison → close / blow / cool → open → in-line trim / deflash → (no leak test: open both ends) → granulate flash back | Matches. Deflash was charged at OEE 1 and without the reject uplift (fixed, H10). |
| BM_Washer_Reservoir (HDPE, band 2–20 L capped at 5.43 L envelope, 2.50 mm) | as above, 7.3 + 21.9 + 4.5 = 33.7 s | as above **+ 100 % leak test** (a closed reservoir) | Leak test station not costed — the reject basis claimed "after leak checks" (text fixed; station PROPOSED P4). |
| ROTO_Header_Tank (LLDPE, 3.99 mm, 6.5 L envelope) | 4-arm carousel `rotomould-carousel-4arm`: index 1078 s (oven paces: oven 1078 / two cooling bays 1455 ÷ 2 / load 360) ÷ 0.97, 4 a arm, crew 2 · 24 moulds | weigh + charge powder → oven (biaxial rotation) → 2 cooling bays → demould at the load station → **cut / drill neck and vent, deflash** → inspect | Station pacing correct. Neck / vent machining not costed (PROPOSED P5). |
| ROTO_Coolant_Tank (LLDPE, 5.00 mm, 43.2 L envelope) | same machine, index 1290 s (oven), 2 a arm, crew 2 · 28 moulds | as header tank | as above; mould count missed the scrap (fixed, M7). |
| TF_Trim_Cover (ABS, 4.08 mm sheet → 2.43 mm wall) | 1. single-station `thermoform-small`: heat 101 + form 6 + cool 41 + load 15 = 163 s ÷ 0.97, 4 up, crew 1 · 2. 5-axis router off the former 32 s / part ÷ 0.97, crew 1 | load sheet → heat → vacuum form → cool on the water-cooled tool → unload → router trim → web to regrind (credited) | Matches. Router load (20 s) is charged per part, not per 4-up sheet — a stated assumption (§5). |
| TF_Battery_Box_Lid (HDPE, 9.41 mm sheet → 3.90 mm wall) | 1. rotary `thermoform-large`: max(oven 433, form + cool 265, load 20) + 5 s index = 438 s ÷ 0.97, 1 up, crew 1 · 2. router 56 s | as above, rotary | Matches. Gauge by mass balance is physically right (§4 note). |

No step charged twice, none out of order. Flash is reground (no material £) and only sizes the shot; the roto oven
energy lives in the machine rate (no separate energy line); the thermoforming sheet-heating energy is a material line
AND the former's machine rate carries an energy line — possible double count (P2).

## 3. One part by hand — ROTO_Header_Tank, to the penny (after the fixes)

Measured: V = 683,543.1 mm³, S = 342,240.7 mm², bbox 240 × 160 × 170 mm, silhouette along draw 38,244 mm², 1 boss,
0 free-form faces, 0 undercuts. Rate book: LLDPE roto £1.47/kg, scrap £0.11/kg, ρ 940 kg/m³; carousel £58.3114/h;
`lab-uk-roto` £23.07/h. Shop: packaging £0.08, logistics £0.10, overhead 12 %, margin 8 %.

| Line | Arithmetic | Value |
|---|---|---|
| wall | 2 × 683.543 cm³ ÷ 3422.41 cm² × 10 | 3.99 mm |
| part | 683.543 cm³ × 940 ÷ 10⁶ | 0.6425 kg |
| oven | 240 + 3.99 × 210 | 1078 s |
| cool (forced air) | 1078 × 1.35 | 1455 s |
| per arm | envelope 240 × 160 × 170 = 6.5 L → tier ≤ 12 L | 4 |
| load | 120 + 60 × 4 | 360 s |
| index (4 arms) | max(1078, 1455 ÷ 2, 360) | 1078 s |
| reject uplift | 1 ÷ (1 − 0.03) | 1.030928 |
| moulds | 50,000 ÷ 0.97 = 51,546 × 4 × 1078 s ÷ (3500 × 3600 × 0.8) = 22.05 → whole arm-loads of 4 | 24 |
| mould £ | 6000 + 382.4 × 18 × 0.75 (simple) + 2 vents × 250 + 500 = 12,162.4 | £12,162 |
| tool sets | 250,000 ÷ 0.97 ÷ (10,000 × 24) = 1.07388 | 1.0739 |
| tooling | 12,162 × 24 × 1.07388 = £313,453.61 ÷ 250,000 | **£1.2538** |
| material | net 0.6425 × 1.030928 = 0.662371; gross ÷ 0.99 = 0.669062; × 1.47 = 0.983521; − (0.669062 − 0.662371) × 0.11 = 0.000736; + grinding 0.25 × 0.669062 = 0.167265 | **£1.1501** |
| cycle | 1078 ÷ 3600 × 1.030928 | 0.308706 h |
| process | 58.311355 × 0.308706 ÷ 4 ÷ 0.8 | **£5.6253** |
| labour | 23.07 × 2 × 0.308706 ÷ 4 ÷ 0.92 | **£3.8706** |
| overhead base | 1.1501 + 5.6253 + 3.8706 + 1.2538 | £11.8998 |
| overhead | 12 % × 11.8998 | **£1.4280** |
| subtotal | 11.8998 + 0.08 + 0.10 + 1.4280 | £13.5077 |
| margin | 8 % × 13.5077 | **£1.0806** |
| **total** | | **£14.5883** (was £14.5348) |

The lead's "£608,100 for a 0.66 kg tank": that is this structure at 100,000/yr × 5 years (500,000 parts on 10,000-cycle
moulds = 50 mould-lives × £12,162). At 50,000 × 5 the figure is £313,454: 24 moulds are physically needed
(each makes one part per 71.9-minute revolution, ~2,150 a year), plus 7.4 % of a second set as they wear out. "Moulds in
service" is the right count for the INVESTMENT; the tooling £ also carries the wear-out sets — see P1. The dominant,
unsourced driver of this part's £14.59 is the per-arm tier (4 a arm): at 8 a arm process + labour halve (−£4.75).

## 4. Shadow model

`scripts/arith-audit/hollow-forming.ts` recomputes every rule input (wall, mass, capacity, flash, cavities, machine,
cool factor, blow / open-close / parison, deflash takt, heat, cool, per-arm, arms, load, index, moulds, mould £ incl. the
blow toolmaker build-up line by line, plan, gauge, nest, sheet kg, heat / cool / form / load / trim, tool £, oven kWh),
each operation (machine, hours, parts/cycle, OEE, crew × labour h, process £, labour £), tooling and the 8 buckets.

| Part | Checks | Before fixes (lead's dump) | After |
|---|---|---|---|
| BM_Air_Duct | 32 | 5 FAIL (deflash h, OEE, £; process; total) | PASS |
| BM_Washer_Reservoir | 32 | 5 FAIL (same) | PASS |
| ROTO_Header_Tank | 27 | 5 FAIL (material, tooling, overhead, total, investment) | PASS |
| ROTO_Coolant_Tank | 27 | 7 FAIL (+ moulds 26 v 28, margin) | PASS |
| TF_Trim_Cover | 39 | PASS | PASS |
| TF_Battery_Box_Lid | 39 | PASS | PASS |
| **total** | **196** | **174 PASS / 22 FAIL** | **196 PASS / 0 FAIL** |

**Battery box lid gauge (lead's question).** 5,083 cm³ ÷ 5,401 cm² plan × 10 = 9.41 mm sheet; formed wall 2·V/S =
3.90 mm; areal stretch 9.41 ÷ 3.90 = 2.41 = S ÷ (2 × plan) by construction. The measured one-side area (13,044 cm²) agrees
with a 900 × 600 × 271 lid (5,400 + 2 × 1,500 × 271 = 13,530 cm²), so the plastic in the part must come from a sheet over
its plan at 9.4 mm — physically sensible (heavy-gauge HDPE runs to 12.7 mm) and correctly priced: the buy is the
1,000 × 700 mm blank × 9.41 mm × 950 = 6.258 kg ÷ 0.97, credited 23 % web at £0.35/kg. Caveats: the bbox draw formula
(1 + 2 × 271/600 = 1.90) under-states this lid's stretch (2.41) and is used only for the method / DFM; real corners thin
to ~0.55 × the average. The HDPE sheet price £1.24/kg is £0.19 over the LLDPE/HDPE resin index — a rate-book question
(Low confidence in the book), not checked here.

## 5. Constant register (cost-moving constants in owned files)

Class: SRC sourced · LIB rate book · MEAS measured · LBL labelled estimate, now visible on the basis line · UNL unlabelled.
"Was" = class before this audit.

| file:line | value | meaning | class (was → now) | £ effect on a real part |
|---|---|---|---|---|
| roto-advisor.ts:23 | pe 210, xlpe/pp 230, pa12 300 s/mm | oven bake per mm wall | UNL → LBL (printed on `rm-heat`) | header: index = oven; ±10 % → ±£0.74 |
| roto-advisor.ts:29 | 240 s | mould soak | LBL (printed) | in the oven time |
| roto-advisor.ts:35 | forced air 1.35 (ambient 1.9, water 0.85) | cooling ÷ bake | UNL → LBL | coolant: cool ÷ 2 < oven, not pacing |
| roto-advisor.ts:81 | cnc-al £6000 + £18/cm²; cast £3000 + £9; fab £4000 + £6 | mould build | UNL → LBL (full arithmetic on `rm-mould-cost`) | header tooling £1.25 |
| roto-advisor.ts:91–94 | £250 a vent, £500 insulation; simple 0.75 / moderate 1 / complex 1.5 | mould details / complexity | UNL → LBL | £1,000 of £12,162 |
| rotational-moulding.ts (rules):59 | ≤ 3 L 8, ≤ 12 L 4, ≤ 50 L 2, else 1 a arm | parts per arm | UNL → LBL | **dominant**: header 8 a arm −£4.75 |
| rules:244 | ≤ 50 L 4 arms, ≤ 200 L 3, else 2 | arms | UNL → LBL | machine + pacing |
| rules:151 | OEE 0.80; hours 3500 | moulds sizing | LBL ("shop OEE") / LIB (machine hours) | mould count |
| rules:153 | £0.25/kg (0.15–0.40) | powder grinding | LBL (now "not sourced") | header £0.17 |
| rules:156–157 | 120 s + 60 s a mould | load station | UNL → LBL | not pacing on either tank |
| rules:159 | cnc-al 10,000; cast 5,000; fab 20,000 cycles | mould life | UNL, mis-sourced "library" → LBL, source `rule` | header ±: life 20,000 → −£0.09 |
| rules:155 (ROTO_REJECT) | 3 % | scrap | UNL → LBL | ~3 % of process + labour |
| rules crew | 2 at ≥ 3 arms | crew | UNL → LBL | header labour £3.87 |
| modules/rotational-moulding.ts:78 | 0.99 | powder yield | UNL → LBL (on `rm-powder-adder`) | 1 % of material |
| blow-moulding.ts (rules):191 | Al 500k, P20 1M, H13 2M cycles | mould life | "documented", source `library` → LBL, `rule` | none at 250k parts |
| rules:207 | 90 / 120 / 300 kg/h continuous; accumulators 250–500 kg/h, push 1.5–2.5 kg/s | heads | LBL (comment) → printed on `bm-parison-t` | parison 0 s on both parts |
| blow-moulding.ts (module):75 | 0.3 / 1.5 / 6 kg shot | machine bands | UNL → LBL (on `bm-mach`) | air duct: the 12 % flash lifts 0.286 → 0.320 kg, over 0.3 → `blow-ebm-100l` |
| rules:344 | 12 % (22 % > 3 kg) | flash share | UNL → LBL | machine choice only (flash reground) |
| rules:348 | < 0.25 L 4, ≤ 2 L 2, else 1 | cavities | UNL → LBL | 1 cav on both |
| rules:364–365 | 3 + 0.8 s/L (3–20); 4 + 0.1 s/L (4–8) | blow, open/close | UNL → LBL | air duct 9.3 of 21.8 s |
| cool factor | PP 3.16, HDPE 3.5 s/mm² | curated (injection-moulding table, another group) | presented as physics → LBL "curated" | air duct cool 12.5 s; see P3 |
| rules:234–236 | crew 0.5 / 1 / 0.5; reject 2.5 / 3 / 1.5 % | crew, scrap | UNL → LBL | air duct labour £0.08 |
| blow-advisor.ts:62 ff. | (30 + 9.5 L) h, 14 L^0.75 kg, frame £2500 + 80 L^0.8, inserts £925 + 25 L, tryout 12/32 h | mould build-up | UNL → LBL (line by line on `bm-mould-cost`) | £0.047 / part |
| thermoforming-advisor.ts:53 | heatCoef, coolCoef, cp, formTemp per family | heat / cool / energy | UNL → LBL (printed on `tf-heat`, `tf-cool`, energy line) | lid: heat paces 433 of 438 s — process + labour £8.43 |
| advisor:69 | 0.40 | oven coupling | UNL → LBL | lid energy £0.27 |
| advisor:74, 76 | water 0.65; vacuum air 0.02 kWh/kg | tool cooling, forming air | UNL → LBL | trim cover cool 41 s |
| advisor:194 | cast-Al £3500 + £1.2/cm², 250k life; cnc £6000 + £2.2, 1M | tool build / life | UNL → LBL; life now applied (M25) | £0.05 / part |
| advisor:212, 215 | +70 % a cavity; £0.25/cm² vac holes | tool | UNL → LBL | trim cover £13,683 tool |
| thermoforming.ts (rules):103–114 | 50 mm clamp margin; 5 s rotary index; 10k multi-up; 6/12/18 s form; 20 s + 12 s/m router; 3 % scrap; load 15 / 20 s | sheet, cycle, trim | UNL → LBL | lid sheet 6.26 kg (margin = 23 % web); trim £0.72 |
| rules nest | web max(25 mm, depth), ≤ 8 up | nest | UNL → LBL | trim cover 4 up |
| derive/hollow.ts | fill 0.08, wall 12 mm, hit share 0.9, cavity 20 faces / 25 % | routing gates | routing only, no £ | — |

## 6. Findings register

| ID | Sev | file:line | Evidence | Status | £ before → after |
|---|---|---|---|---|---|
| H1 | L | rules/rotational-moulding.ts `rotoMoulds` | Coolant basis "86 min revolution (4 arms × 22 min index)" — 4 × 22 = 88; minutes rounded on the page | FIXED: printed in seconds (4 × 1290 s = 5160 s) — test H1 | £0 |
| M2 | M | rules `roto.heatTimeSec` | "at its per-mm bake rate" — rate never printed (210 s/mm), unsourced | FIXED: "240 s + 5.00 mm × 210 s/mm = 1290 s … not sourced" — test M2 | £0 |
| M3 | M | rules `roto.coolTimeSec` | 1.35 printed as a ratio, unlabelled | FIXED: "1290 s × 1.35 = 1742 s … not sourced" | £0 |
| M4 | M | rules `roto.mouldLife` | 10,000 cycles stamped source `library`; no rate-book entry | FIXED: source `rule`, "engineering-typical, not sourced" (a quick search found only supplier listings, 5,000 – 1,000,000 shots) | £0 |
| M5 | M | rules `roto.mouldCost` | "£6000 base + £5162 size + £1000 vents" — £18/cm², × 0.75, £250 a vent, £500 not on the page | FIXED: full arithmetic | £0 |
| M6 | M | rules `partsPerArm`, arms, load, crew, reject | tiers / thresholds unlabelled; per-arm moves header ~33 % | FIXED: thresholds printed, labelled | £0 |
| M7 | H | rules `rotoMoulds` | Moulds sized for 50,000 good parts while the module charges machine time for 51,546 moulded: coolant needs 26.39 → 28 moulds, not 26 | FIXED — test M7 | coolant tooling £684,008 → £736,624 |
| H8 | H | modules/rotational-moulding.ts | Grinding £0.25/kg on the good part only; the material line buys part ÷ 0.97 ÷ 0.99. And mould wear counted on good parts | FIXED — test H8 | header +£0.0067 mat, +£0.0376 tooling; coolant +£0.030 mat |
| M9 | M | modules/rotational-moulding.ts:78 | 0.99 powder yield unlabelled | FIXED: named constant, printed on `rm-powder-adder` | £0 |
| H10 | H | modules/blow-moulding.ts deflash op | In-line trimmer (no crew, at the blow takt) charged at OEE 1 and without the reject uplift — 22 % under the hours it is tied to the line | FIXED: in-line → line OEE; reject uplift on every deflash — test H10 | air duct £0.9941 → £1.0175; washer £1.3133 → £1.3495 |
| H11 | H | rules/blow-moulding.ts `mouldLife` | "documented cycle life", source `library` — no document | FIXED — test H11 | £0 |
| H12 | H | rules/blow-moulding.ts cool basis | "transient conduction … α_eff 0.0539 → 3.16 s/mm²" read as a derivation; `thermodynamicCoolFactor` back-calculates α from the curated 3.16, so the figure is the curated constant | FIXED: "3.16 s/mm², the curated cooling factor … implies α_eff …", source `rule` — test H12 | £0 |
| M13 | M | rules/blow-moulding.ts flash, blow, open/close, cavities, machine bands, crew, reject, extruder | unlabelled; flash band picks the air duct's machine | FIXED: labelled, arithmetic printed | £0 |
| M14 | M | rules/blow-moulding.ts `mouldCostGBP` | "1-cavity EBM aluminium tool at 2.5 L" — no arithmetic | FIXED: build-up line by line, re-adds (test) | £0 |
| H15 | H | rules/blow-moulding.ts reject basis | "2.5% after leak and wall checks" — implies a leak test that is not costed | FIXED (text): "…the leak-test station itself is not costed"; station PROPOSED (P4) | £0 |
| M21 | M | rules/thermoforming.ts heat / cool | "radiant soak goes as gauge^1.6" — coefficient not printed | FIXED: "12 × 9.41^1.6 = 433 s", "4.5 × 9.41² × 0.65 = 259 s" — test M21 | £0 |
| M22 | M | rules/thermoforming.ts trim, form, load, rotary, margin, nest, crew, reject | unlabelled | FIXED: labelled | £0 |
| M25 | H | rules/thermoforming.ts `toolCost` | basis printed "250,000 cycle life" but the module bought one tool whatever the programme | FIXED: sets = max(1, amortised parts ÷ parts a sheet ÷ life) folded into the tool £ (screen = headless); real parts unchanged (lid exactly 250,000 cycles) — test M25 | £0 here; 100k/yr lid £11,331 → £22,662 |
| M26 | M | rules/thermoforming.ts `toolCost` | £13,083 mould with no arithmetic | FIXED: "(£3,500 + 600.2 cm² × £1.2) × 1 × 3.1 for 4 up …" | £0 |
| M27 | M | modules/thermoforming.ts energy | "sheet heating and forming energy" — kWh/kg, cp, ΔT, 40 % unprinted | FIXED: full arithmetic on the trace line — test M27 | £0 |
| L28 | L | derive/shell-wall.ts, tf-thk | "cm³ ÷ cm² = mm" — unit step implicit (the checker read it as wrong) | FIXED: "× 10 mm/cm" | £0 |
| P1 | L | cost card (main.ts / cad-workspace, not owned) | "Tooling investment" prints `totalToolingCost`, which includes wear-out sets (header 1.0739 sets) — lifetime spend, not the up-front buy | PROPOSED: print `moulds × price` as investment and the remainder as "replacement over the programme" (needs the module to expose `mouldsInService × perMouldCost`, e.g. `tooling.initialInvestment`) | £0 |
| P2 | M | rate-library.ts `thermoform-*` (not owned) | Formers carry an energy line (lid: £22,156/yr ≈ 37 kW) AND the module adds sheet heating (1.51 kWh/part) — possible double count; the book does not say what its energy line covers | PROPOSED: state in the book note that the line is drives / vacuum only, or drop the module's term — needs the rate owner | ≤ £0.27/part lid |
| P3 | M | injection-moulding.ts cool table (not owned) / blow rules | Blow walls cool from the mould side only; the slab formula assumes both sides (one-sided ⇒ 4×). The curated 3.16 / 3.5 s/mm² are injection factors. Not changed: no source either way, and internal blow air cools the inside | PROPOSED: a blow-specific factor from a sourced cycle, or label "injection factor applied to blow" | could move cycles 2–3× |
| P4 | M | blow route | closed EBM containers (washer reservoir) get a 100 % leak test; no op, no machine (`extrusion-leak-test` is a pipe rig) | PROPOSED: a `blow-leak-tester` library machine + an in-line op at the takt for `enclosedShell` parts | + ~£0.05–0.10 |
| P5 | M | roto route | neck / vent cutting and deflash after demould not costed | PROPOSED: a bench op (labour only) per opening, from the feature table | + ~£0.10–0.30 |

Severity counts: **H 7** (M7, H8, H10, H11, H12, H15, M25) · **M 16** (M2–M6, M9, M13, M14, M21, M22, M26, M27, P2–P5) ·
**L 3** (H1, L28, P1). **Fixed 21, proposed 5.**

**Real parts that move (50,000/yr × 5 years):** BM_Air_Duct £0.9941 → £1.0175 (+2.4 %), BM_Washer_Reservoir £1.3133 →
£1.3495 (+2.8 %), ROTO_Header_Tank £14.5348 → £14.5883 (+0.4 %), ROTO_Coolant_Tank £37.7301 → £38.0213 (+0.8 %); both TF
parts unchanged.

**Pinned tests the lead will see move (not edited, per the brief):**
- `tests/real-parts-baseline.test.ts` (1-year amortisation): BM_Air_Duct £1.22 → £1.25, BM_Washer_Reservoir £1.60 → £1.64,
  ROTO_Coolant_Tank £50.97 → £52.28 (28 moulds over 50,000 parts), ROTO_Header_Tank buckets (material £1.14 → £1.15,
  tooling), total unchanged at 2 dp.
- `tests/rotational-moulding-review.test.ts` §8: header £19.43 → £19.44, coolant £47.63 → £47.67 at 5,000/yr.
- `tests/blow-moulding-review.test.ts` §9: real fuel tank £28.69 → £28.80 (in-line deflash at line OEE + reject).
- `tests/commodity-rules-prompt.test.ts` snapshot: basis text of all three packs.
- `tests/thermoforming-advisor.test.ts` "every listed country price…" timed out at 5 s under the shared machine load; it
  does not touch the edited code.

## 7. Not checked, and why

- `to-cost-params.ts` cases: read only — they pass every rule value through; the fallbacks (load 60 s, index 6 s, mould
  life 10,000 / 1,000,000, cool 3.5) apply only to a pack without rule values (AI / old cache) and say so in `assumed`.
- Rate-book figures (machine £/h, HDPE sheet £1.24/kg, labour) — another owner; only P2 raised.
- Packaging, logistics, overhead and margin % — the shop defaults (`regionalShopDefaults`), read from the dump.
- IBM / SBM / co-ex / accumulator paths, pressure and twin-sheet forming, 1–3-arm roto machines: no real part takes them;
  their constants are in the register and labelled on the same basis lines.
- DFM advisors (`analyseRotoDFM`, `analyseThermoformingDFM`, blow DFM): advisory text, no £; their thresholds are in the
  source with their reasoning but were not re-sourced.
- Other countries: arithmetic was checked in the UK book only; the toolroom factor is now printed when ≠ 1.
