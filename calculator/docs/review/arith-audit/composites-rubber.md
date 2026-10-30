# Arithmetic audit — composites and rubber (30 Oct 2026)

Group `composites-rubber`. Brief: `BRIEF.md` in this folder.

## 1. Scope

**Files owned and edited**
- `src/engine/cost-input-rules/commodities/composites.ts`: NDI is now a station; tool £, tool life, reject, trim, load cap and cure attendance are labelled; text fixes
- `src/engine/modules/composites.ts`: prepreg is bought as fibre + resin; `CURE_ATTENDANCE` is now a named constant; the tooling total is split into items
- `src/engine/cost-input-rules/commodities/rubber.ts`: printed arithmetic and labels; extrusion-die texts
- `src/engine/modules/rubber.ts`: the in-line cure tunnel is untended; die change on extrusion; tooling items
- `src/engine/modules/rubber-advisor.ts`: exports `rubberHandlingSec`, `rubberCureBreakdown`, `defaultCureTempC`, `RUBBER_CAVITY_GBP`, `rubberComplexityFactor`, `rubberMouldBase` so the bases print what the cycle and tool carry. No values changed.

**Read but not changed:** `derive/laminate.ts`, `derive/elastomer.ts`, `derive/profile.ts` (shared — proposals only), and the composites / rubber cases of `to-cost-params.ts`.

**Parts** (UK book, 50,000 a year, 5-year programme, the baseline's `ANSWERS`):
- `COMP_Hat_Stiffener.stp` (carbon prepreg)
- `COMP_Battery_Lid.stp` (glass RTM)
- `COMP_Roof_Panel.stp` (carbon prepreg)
- `RUB_Grommet.stp` (EPDM)
- `RUB_AV_Mount.stp` (NR)
- `RUB_Door_Seal.stp` (EPDM extrusion)

**Reproduce**
```
cd calculator
npx tsx scripts/arith-audit/composites-rubber.ts [--verbose]      # shadow model, 258 checks, exit 1 on FAIL
npx vitest run tests/arith-audit-composites-rubber.test.ts       # 13 tests, one per defect
python3 -I scripts/arith-audit/basis-check.py <dump dir>         # printed equations
```

**"Before" evidence.** Each test below failed on the pre-audit code. The evidence is the shared pre-audit dump (`…/scratchpad/arith-dump/`, produced before any edit), which shows each old value:
- the hat stiffener's NDI is £25, and its prepreg line is 0.2412 kg = fibre only;
- the door seal's "Vulcanisation Cure" carries £0.0767 of labour;
- the grommet's cycle basis has no handling term;
- no composites or rubber tooling has `items`;
- the extrusion-die bases say "flash-land wear … injection pressure".

## 2. Sequence: as costed v as made

**COMP_Hat_Stiffener and COMP_Roof_Panel (carbon prepreg, autoclave)**

| # | As costed | Machine | Time a part | p/c | Crew | As made |
|---|---|---|---|---|---|---|
| – | (not costed) | – | – | – | – | 1 Ply cutting (CNC ply cutter, nested). Its waste is charged (15 %); its time is not |
| 1 | Prepreg hand layup | bench-assembly | 0.049 h (roof 0.698) × reject | 1 | 1 skilled | 2 Layup with debulks |
| – | (not costed) | – | – | – | – | 3 Vacuum bag: film, breather, peel ply, sealant. Neither the consumables nor the labour are costed |
| 2 | Autoclave cure | autoclave-1200mm | 3 h ÷ 20 a load (roof ÷ 2) | 1 | 1 semi-skilled at 25 % of the cure | 4 Autoclave cure |
| – | (in tool sizing only) | – | 0.5 h turnaround | – | – | 5 Debag, demould, clean, release-coat. This sizes the tools in service but is NOT costed as labour |
| 3 | Trim, drill & finish | 5-axis waterjet | 0.112 h (roof 0.147) | 1 | 1 | 6 Trim / drill |
| 4 | NDI (per-part service, material bucket) | – | station, £0.86 (roof £3.22) | – | – | 7 Ultrasonic C-scan |
| – | (not costed) | – | – | – | – | 8 Dimensional inspection |

Verdict: the order is right and nothing is charged twice. Three steps are missing: ply-cutting time, bagging (consumables + labour), and debag/demould labour. They are left as proposals (P5) because no sourced time or library ply cutter exists, and an invented time would be worse than a stated gap.

**COMP_Battery_Lid (glass RTM)**
1. "RTM layup" (preform load, bench, 0.075 h)
2. Cure in the die on rtm-press-std (0.8 h, 1 a cycle)
3. Waterjet trim (0.127 h)

As made: preform cutting and forming (on a preforming press) → load the die → inject and cure → demould and clean → trim → inspect. Missing: the preforming press and demould/clean labour (P5). There is no NDI on glass, and the text now says so.

**RUB_Grommet (EPDM) and RUB_AV_Mount (NR), transfer moulding**
1. Transfer mould: 307 s / 32-up (mount 1688 s / 17-up), crew 0.5
2. Bench deflash and visual check, 5 s
3. Mould change, 1.5 h ÷ 2,500

As made: compound bought mixed (inside the £/kg) → pot charge cut → transfer mould → deflash → inspect and pack.

Verdict: the order is right; there are no doubles. The pot pad and cull of transfer moulding is not modelled; 3 % flash is assumed and is now labelled (P8). The AV mount is costed as rubber only (the answer is 0 inserts), so insert blast and primer are correctly absent.

**RUB_Door_Seal (EPDM extrusion)**
1. Cold-feed extruder, 5 s a metre-part, crew 2
2. In-line cure tunnel, 5 s
3. Die change, 1 h ÷ 2,500

As made: extrude → microwave / hot-air tunnel → cool → cut to length → pack.

**Defect R1:** the tunnel charged the line's crew of 2 a second time (fixed).

## 3. COMP_Hat_Stiffener worked by hand (after the fixes) — £73.5538

**Geometry (recorded)**
- V = 195,358.2 mm³; S = 161,489.9 mm²
- bbox 398.29 × 120 × 45.14 mm
- largest silhouette 47,962 mm²

**Rule inputs**

| Input | Arithmetic | Value |
|---|---|---|
| Wall | 2V/S = 2.4194 | 2.42 mm |
| Plies | 2.42 ÷ 0.25 = 9.68, rounded up | 10 |
| Area | 1,614.899 cm² ÷ 2 | 0.081 m² |
| Layup | 0.081 × 10 × 0.06 = 0.0486 | 0.049 h |
| Mass | 195.358 cm³ × 1,550 kg/m³ | 0.3028 kg |
| Tool | £12,000 + 0.04796 m² × £14,000 = £12,671.44 | £12,671 |
| Parts per cure | the tool, with a 0.05 m flange each side, is 0.498 × 0.22 m on a 2.8 × 1.0 m bed. One orientation fits 5 × 4 = 20, the other 12 × 2 = 24; capped at 20 | 20 |
| Tools in service | 50,000 × (0.049 + 3 + 0.5) ÷ (4,000 × 0.8) = 55.45 | 56 |
| Trim | 0.1 + 2 × (0.39829 + 0.12) ÷ 1.5 ÷ 60 = 0.11152 | 0.112 h |
| NDI | (60/3,600 + 0.081/25) h = 0.019907 h × (£28.03 inspector + £15.00 cell) = £0.8566 | £0.86 |

**Material** (U = 1/0.96 = 1.0416667)
- Prepreg net: 0.3028 × £33.60 = £10.17408
- Gross for waste: ÷ 0.85 = £11.96951
- Plus NDI: + £0.86 = £12.82951
- Reject uplift: × U = **£13.36407**

**Operations** (machine £ = rate × ct / OEE 0.8; labour £ = rate × crew × lt / 0.92)

| Op | Rate £/h | ct h | lt h | Process £ | Labour £ |
|---|---|---|---|---|---|
| Layup | bench 0.678824 / skilled 27.95 | 0.0510417 | 0.0510417 | 0.043310 | 1.550668 |
| Cure | autoclave 60.116071 / semi 24.65 | 3/20 × U = 0.15625 | 0.15 × 0.25 × U = 0.0390625 | 11.741420 | 1.046620 |
| Trim | waterjet 30.647333 / semi 24.65 | 0.112 × U = 0.1166667 | 0.1166667 | 4.469403 | 3.125906 |
| **Sum** | | | | **16.254133** | **5.723194** |

Checking the machine rates against the book's build-up:
- Autoclave: (60,720 + 25,240 + 39,565 + 20,192 + 15,108 + 7,500) ÷ (4,000 × 0.70) = £60.1161/h
- Waterjet: 91,942 ÷ (4,000 × 0.75) = £30.6473/h

**Tooling**
- Tools bought = max(56 in service, 250,000 ÷ 500 = 500) = 500
- 500 × £12,671 = £6,335,500. That is 56 × £12,671 = £709,576 in service, plus 444 replacements at £5,625,924
- Per part: £6,335,500 ÷ 250,000 = **£25.3420**

**Stack**
- Factory base = 13.36407 + 16.25413 + 5.72319 + 25.34200 = £60.68340
- Overhead 12 % = £7.28201
- Packaging £0.07 + logistics £0.07
- Subtotal = £68.10540
- Margin 8 % = £5.44843
- **Total £73.55384** (product £73.5538)

Before the audit it was £98.6917, and the material bucket was £34.146:
- the fibre-only prepreg line was £8.105, now £12.469 at full laminate mass (+£4.36);
- NDI was £25 × U = £26.04, now £0.86 × U = £0.90 (−£25.14).

## 4. Shadow model result

`scripts/arith-audit/composites-rubber.ts` recomputes each part independently and compares it with the product:
- the rule inputs (plies, area, mass, prices, layup, cure, parts a cure, tools, trim, tool £ / life, NDI; for rubber: mass, section, process, cycle, cavities including the cost-optimal search, projected area, flash, mould £ / life, crew);
- every operation's machine, cycle, labour time, parts per cycle, crew, process £ and labour £;
- the tooling total, and that its items add up to it;
- the 8 buckets and the total.

| Part | Checks | Result | Product = shadow |
|---|---|---|---|
| COMP_Battery_Lid | 45 | PASS | £73.7101 |
| COMP_Hat_Stiffener | 45 | PASS | £73.5538 |
| COMP_Roof_Panel | 45 | PASS | £479.8325 |
| RUB_AV_Mount | 41 | PASS | £1.8507 |
| RUB_Door_Seal | 41 | PASS | £0.6486 |
| RUB_Grommet | 41 | PASS | £0.3486 |
| **All** | **258** | **258 PASS, 0 FAIL** | |

`basis-check.py` on the post-fix costings flags 7 equations. All 7 are parse artefacts of nested brackets:
- "÷ (4000 h × 0.8 OEE)";
- "(25.0 mm)² ÷ (4 × 0.1 mm²/s)";
- the inspector + cell £/h inside a bracket.

Each was checked by hand and in the shadow model. Before the fixes, three texts were genuinely ambiguous ("÷ 4000 h × 0.8", s and h mixed in one bracket, "12 / 8 / 4 m/min at ≤ 2 / ≤ 6"). They were re-worded.

## 5. Constant register

"Moves" is the £ effect on a real part where it matters (50k/yr). Unless a class names a source, a "labelled" constant now prints "engineering-typical, not sourced" in its basis.

### Composites — `cost-input-rules/commodities/composites.ts`

| file:line | Value | Meaning | Class | Moves |
|---|---|---|---|---|
| :39-45 | prepreg £12,000 + £14,000/m², life 500; RTM £25,000 + £30,000/m², life 5,000 (also vartm / hand / FW / pultrusion) | Tool £ and life | LABELLED-ESTIMATE (was unlabelled; life was mis-sourced as 'library') | Hat £25.34 of £73.55; roof £54.20 |
| :70 | ÷ 2 | Laminated area = half the closed surface | MEASURED + stated | layup, NDI |
| :79-83 | bed 2.8 × 1.0 m (autoclave), 3.0 × 2.0 (oven) | Cure bed | LIBRARY-consistent: book note "1200 mm × 3000 mm" | parts a cure |
| :86 | 0.05 m | Tool flange | LABELLED via the printed tool size | parts a cure |
| :88 / :89 | 4,000 h / 0.80 | Tool hours a year / OEE | LABELLED (printed in the tools basis) | tools in service |
| :92 | 0.5 h | Tool turnaround | LABELLED. It sizes tools only; its labour is not costed (P5) | tools in service |
| :94 / :95 | 0.1 h / 1.5 m/min | Waterjet load / speed | LABELLED-ESTIMATE (now) | Hat trim £7.60 |
| :97 | 20 | Most parts on a cure load | LABELLED-ESTIMATE (now; it binds on the hat: 24 fit) | Hat cure £12.79 |
| :108 | 25 m²/h, 60 s, 1 inspector, £15/h | NDI station | LABELLED-ESTIMATE (new). Inspector from the LIBRARY | Hat £0.86, roof £3.22 |
| :452 / :454 | 0.92 / 4 % | Labour efficiency / reject | Shop convention / LABELLED-ESTIMATE (now) | all ops ×1.042 |

### Composites — `derive/laminate.ts` and `modules/composites.ts`

| file:line | Value | Meaning | Class | Moves |
|---|---|---|---|---|
| `laminate.ts`:69-97 | ply 0.25 / 0.30 / 0.55 / 0.50 mm; fibre fraction 0.65 / 0.60 / 0.55 / 0.50; waste 0.15 / 0.15 / 0.22 / 0.12; density 1,550 / 1,900 / 1,850 / 1,800; cure 3 / 2 / 1.5 / 0.8 h; layup 0.06 / 0.05 / 0.035 / 0.025 h/m²/ply | Laminate systems | Ply / fibre fraction / waste / density: "published characteristics" with no named source → UNLABELLED in the rule. Cure and layup are LABELLED-ESTIMATE (now, in the bases). The layup basis also prints the implied kg/h | Prepreg layup; cure £ |
| `composites.ts`:93 | 0.25 | Cure attendance | LABELLED-ESTIMATE (named constant, printed in the cure basis) | Hat £1.05 |
| `composites.ts`:112 | 0.60 | Waste cap | Guard | none on real parts |

### Rubber — `cost-input-rules/commodities/rubber.ts`

| file:line | Value | Meaning | Class | Moves |
|---|---|---|---|---|
| :59 | 1.5 × 2V/S | Section with no ray reading | LABELLED-ESTIMATE (now) | Grommet section 6.4 mm |
| :90 | 50,000 | Compression → transfer threshold | Stated in the basis, unsourced | process |
| :100 | 12 / 8 / 4 m/min | Extrusion line speed | LABELLED-ESTIMATE (now) | Door seal cycle 5 s |
| :113-119 | crew 0.5 / 0.5 / 0.25 / 2; deflash 10 / 5 / 2 s | Crew, deflash | LABELLED-ESTIMATE (now) | Grommet labour |
| :123-127 | post-cure 4 / 24 h, 100 kg a load, reject 3 % | Post-cure, reject | LABELLED-ESTIMATE (now) | all ops ×1.031 |
| :130 | 1.5 / 1 h | Set-up | LABELLED-ESTIMATE (now) | small |
| :136-141 | platen 1,800 / 1,500 / 1,000 cm²; 4,000 h; 0.8; cap 32; × 2.5 runner | Cavitation | LABELLED-ESTIMATE (now; the 32 cap binds on the grommet) | Grommet process £0.07 |
| :427 | 8 % / 3 % / 0 | Flash share | LABELLED-ESTIMATE (now; transfer pad not modelled) | material |
| :494 | 1M / 500k / 200k | Mould life | LABELLED-ESTIMATE (now; was mis-sourced as 'library') | numMoulds |
| :542 / :618 | 0.92 / 0.80 | Efficiency / OEE | Shop convention, stated | all ops |

### Rubber — `modules/rubber-advisor.ts` and `modules/rubber.ts`

| file:line | Value | Meaning | Class | Moves |
|---|---|---|---|---|
| `rubber-advisor.ts`:70-80 | 25 – 720 s | t90 at 170 °C by family | LABELLED-ESTIMATE (now, in the cycle basis) | Grommet 180 s of 307 |
| `rubber-advisor.ts`:103 | 0.1 mm²/s | Thermal diffusivity | Physics, stated (filled elastomer 0.08–0.12); Fo ≈ 1.03 for the centre at 90 % checks | Mount 1,563 s of 1,688 |
| `rubber-advisor.ts`:109 | ×2 per 10 °C | Temperature factor | LABELLED (rule of thumb, now printed when ≠ 1) | silicone / FKM |
| `rubber-advisor.ts`:124 | 12 / 25 / 4 / 0 / 30 s | Handling | LABELLED-ESTIMATE (now printed; it was silent) | Grommet 25 s |
| `rubber-advisor.ts`:198, :206-212 | £900 + £35/cm², k^0.9, £1,200 an insert; steel 1.3 / 1.0 / 0.7; complexity 1.5 / 1.0 / 0.8; base £12k / 6k / 3k / 2.5k / 2k / 1.2k | Mould £ | LABELLED-ESTIMATE (now; full arithmetic printed) | Grommet tooling £0.073 |
| `rubber.ts`:191 | 0.1 | Post-cure oven crew | LABELLED (in the post-cure basis) | none on real parts |

## 6. Findings register

| ID | Sev | Where | Evidence | Status | Before → after |
|---|---|---|---|---|---|
| C1 | H | `modules/composites.ts` material | Prepreg's £/kg is a kg of prepreg (fibre + resin; book note "T700/250F prepreg"). The module bought only the fibre's 65 % (resin £0), while the line was labelled "Prepreg (fibre + resin)" | FIXED (test C1) | Hat material line £8.105 → £12.469; roof £115.55 → £177.76 |
| C2 | H | `composites.ts` NDI | A flat "£25 a part (UK)", unsourced, was 76 % of the hat's material bucket on a 0.08 m² part | FIXED: station, time × (inspector + cell), arithmetic printed (test C2) | Hat £26.04 → £0.90 a part; roof £26.04 → £3.35 |
| C3 | M | `modules/composites.ts`, `modules/rubber.ts` tooling | The card prints `totalToolingCost` as "Tooling investment (one-off)". On the hat that is £6.34M = 500 tools, of which only 56 (£709,576) are a one-off set; the rest are wear replacements. The brief's £12.67M / 1,000 tools does not reproduce: it is 500 tools at 50k × 5 yr | FIXED in my files: `tooling.items` splits set v replacements, and both reports print items (test C3). Card text PROPOSED (P3) | £ unchanged |
| C4 | M | Bases in both rule files | Unsourced constants that move cost printed with no label; tool life and mould life claimed source 'library' | FIXED: labelled, source → 'rule' (test C4) | £ unchanged |
| C5 | M | `composites.ts` layup basis | Prepreg layup at 0.06 h/m²/ply = 6.5 kg of laminate an hour (glass prepreg 11.4 kg/h). A search summary of trade press gives 0.5–1 kg/h for hand layup (not verified: the host was not reachable) | LABELLED (the implied kg/h is printed). Value PROPOSED for research (P4) | If 1 kg/h: hat +£8.5, roof +~£125 |
| C6 | L | `composites.ts` trim and NDI text | "m of edge" was the bounding-box perimeter. Glass "visual and tap test" was claimed but not costed. "bags" the cure on RTM | FIXED (tests C2, C4) | — |
| C7 | M | Composites sequence | Ply cutting, vacuum bagging (consumables + labour) and debag/demould labour are not costed | PROPOSED (P5) | understates |
| R1 | H | `modules/rubber.ts` cure op | The in-line tunnel charged the extrusion line's crew (2) a second time; the rule's own basis says it is the tunnel behind the extruder | FIXED: `untended`, labour 0 on extrusion only (test R1) | Door seal labour £0.1675 → £0.0908; total £0.7414 → £0.6486 |
| R2 | M | `rubber.ts` cycle basis | "180 s + 102 s … = 307" omitted the 25 s handling; a non-170 °C compound printed the 170 °C base as if used | FIXED: full arithmetic (test R2) | — |
| R3 | L | `rubber.ts` / `modules/rubber.ts` extrusion | The die was described as a mould ("flash-land wear … injection pressure", "rubber sees low mould pressure"); the op was "Mould change" | FIXED (test R3) | — |
| R4 | L | `rubber.ts` cavities / mould £ | Platen fit, × 2.5 and the 32 cap (binding on the grommet) were unprinted; mould £ printed two totals with no arithmetic | FIXED (test C4) | — |
| R5 | L | `rubber.ts` mouldSteel | An extrusion die is costed at the aluminium factor 0.7 (steel is chosen by volume, not route). A rubber extrusion die plate is tool steel | Text now states it; value PROPOSED (P10) | Door seal +£0.005 |
| R6 | M | `rubber.ts` flash | 3 % on transfer omits the pot pad / cull, which is vulcanised and unrecoverable | LABELLED; PROPOSED (P8) | understates material |
| R7 | L | Shared (kernel) | Grommet draw direction takes the 567 mm² silhouette, not 1,139 mm² (40 × 40 face); the cavity block uses 5.7 cm² | PROPOSED to the kernel / shared owner (P9) | Tool +~£2.6k if 11.4 cm² |

Totals: **3 H, 6 M, 4 L.** FIXED: C1, C2, C3 (engine part), C4, C6, R1, R2, R3, R4. Labelled with the value proposed: C5, R5, R6. PROPOSED only: C7, R7.

### Proposed changes (not in my files)

**P1 — `tests/composites-harness.test.ts:50-57`.** This test pins defect C1. Change it to:
```ts
const netMat = 1.80 * 32.00;            // prepreg: the whole laminate at the prepreg price
const grossMat = netMat / (1 - 0.20);
```

**P2 — `tests/composites-review.test.ts:110`.** Replace `expect(comp(HAT, 'prepreg-cf').ndiCostPerPart).toBe(25);` with `expect(comp(HAT, 'prepreg-cf').ndiCostPerPart).toBeCloseTo(0.86, 2);`.

**P3 — `src/ui/cad-workspace.ts:247` (cost card).** When `tooling.items` has more than one line, the total is not a one-off. Print the first item as the investment, and the rest as wear:
```ts
<span class="cad-cost-k">${m.toolingItems && m.toolingItems.length > 1 ? 'Tooling over the programme (set + wear)' : 'Tooling investment (one-off)'}</span>
…${m.toolingItems && m.toolingItems.length > 1 ? `<span class="cad-cost-sub">${esc(m.toolingItems[0].label)} ${esc(m.fmt(m.toolingItems[0].gbp))} one-off</span>` : ''}
```
This needs `toolingItems: trace.drivers.tooling.items` on the card model in `main.ts::renderCADCostCard`. The same applies to `route-compare.ts` `investment`, which today reports the whole total as "one-off".

**P4 — research round on the layup rate (`derive/laminate.ts:70, 79`).** Source hand-layup deposition rates (kg/h by part complexity) and set `layupHrPerM2PerPly` = ply kg/m² ÷ the sourced kg/h. The current values imply 6.5–11.4 kg/h for prepreg.

**P5 — missing composites steps.** These need a library ply cutter (CNC oscillating-knife cutter) and sourced bagging consumables (£/m²) and debag/demould minutes. Then:
- add a "Ply cutting" op of ply area × plies ÷ cut rate;
- add a "Bag / debag / demould" bench op;
- add bagging consumables to the material lines.

None is sourced yet, so none is costed.

**P6 — rate library.** Add a UT C-scan cell (robot PAUT) machine through a rate-refresh config. NDI then becomes an operation (inspector → labour, cell → process) instead of a per-part service in the material bucket. Today it sits with the material, as casting NDT does.

**P7 — route feasibility (`route-feasibility.ts`, not mine).** At 50k/yr a prepreg-autoclave part needs 500 layup tools and 1,000+ autoclave loads a year. Consider a volume caveat on prepreg-autoclave above about 10k/yr (HP-RTM or press-cured prepreg are the volume routes).

**P8 — transfer pad / cull (`rubber.ts:427`).** Model the pot pad as a separate scrap weight once a sourced pad-to-shot ratio exists.

**P9 — kernel draw direction (shared `projectedArea.alongDrawMm2`).** On an axisymmetric grommet it takes the side silhouette; review it with the moulding / kernel owner.

**P10 — `rubber.ts::mouldSteelFor`.** Return `'p20'` for `extrusion_vulcanise` (an extrusion die is a steel plate):
```ts
if (process === 'extrusion_vulcanise') return 'p20';
```

**P11 — `to-cost-params.ts:930` (rubber case).** `loadKg: 100` duplicates `POST_CURE_LOAD_KG`. Import the constant if the import graph allows it. There is no £ change.

### Tests and baselines that move (not updated, per the brief)

- **`tests/real-parts-baseline.test.ts`:**
  - COMP_Hat_Stiffener £98.6917 → £73.5538
  - COMP_Roof_Panel £432.0176 → £479.8325
  - RUB_Door_Seal £0.7414 → £0.6486
  - The other three parts are unchanged.
- **`tests/fixtures/commodity-rules-prompt/{composites,rubber}.txt`:** basis strings changed.
- **`tests/composites-harness.test.ts` and `tests/composites-review.test.ts:110`:** see P1 and P2.

## 7. What I did not check, and why

- **Shop defaults.** Packaging, logistics, overhead % and margin % are another owner's. The shadow model re-adds them but does not derive them.
- **Rate-book values.** Machine build-ups, labour, and material £/kg are taken as given (book audit). The composites prepreg and resin prices are "NOT SOURCED this period — held at June".
- **Country books.** The NDI cell follows `countryFactor('inspection')` and the inspector role; only the UK was run.
- **Off-part routes.** Infusion, glass prepreg, LSR, compression, die-cut and post-cure were exercised by tests only, not by a real part.
- **The screen path.** The module change is shared, so screen = headless holds by construction. I did not drive the browser.
- **Sources.** Web sources could not be opened from this session (hosts outside the allowed network). The scan rate and the hand-layup rate are therefore labelled engineering-typical, not cited.
