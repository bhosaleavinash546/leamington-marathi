# Arithmetic audit — FORGING (30 Oct 2026)

## 1. Scope

| | |
|---|---|
| Files owned (edited) | `src/engine/cost-input-rules/commodities/forging.ts`, `src/engine/modules/forging.ts`, `src/engine/modules/forging-advisor.ts` (the `forging` case of `to-cost-params.ts` was read; nothing in it needed changing) |
| Read only | `machine-sizing.ts` (press ladders, the sheet-metal auditor's file), `machining-time.ts` / `feature-machining.ts` (secondary machining, the machining auditor's file), `toolmaking.ts`, `module-energy.ts`, `core.ts`, `casting-advisor.ts` (NDT station) |
| Real parts | `steering_knuckle_RH.stp` (real), `FORGE_Hub_Flange.stp`, `FORGE_Control_Arm_Yoke.stp` (modelled — not customer parts) |
| Conditions | UK book, 50,000 a year, 5-year programme (amortisation 250,000), baseline answers (steel, route forging, standard tolerance; knuckle and yoke safety-critical, hub not) |
| Shadow model | `scripts/arith-audit/forging.ts` |
| Test | `tests/arith-audit-forging.test.ts` (12 tests, each failed before its fix) |

How to reproduce:

```bash
cd calculator
npx tsx scripts/arith-audit/dump.ts <dir>                # re-dump every part through the headless chain
npx tsx scripts/arith-audit/forging.ts <dir>             # 120 checks; exit 1 on any FAIL
python3 -I scripts/arith-audit/basis-check.py <dir>      # every printed "a × b = c" holds
npx vitest run tests/arith-audit-forging.test.ts tests/cost-input-rules-forging.test.ts tests/forging-*.test.ts
```

## 2. Sequence: as costed v as made

How a production engineer would route a closed-die steel forging:

> saw / shear the billet → induction heat → (bust) → blocker → finisher → trim (+ pierce) → controlled cool (38MnVS6)
> or heat treat → shot blast → MPI (safety-critical) → machine

| Step | Knuckle (costed) | Hub flange (costed) | Yoke (costed) | Verdict |
|---|---|---|---|---|
| Billet cut-off (saw / shear) | — | — | — | **Missing.** There is no saw or shear in the rate book. It is now stated on the cycle basis (F10). |
| Induction heat | 0.35 kWh/kg × 4.820 kg billet ÷ 0.98 | × 4.207 kg ÷ 0.98 | × 3.144 kg ÷ 0.98 | OK. The heater's capital is not in any machine rate, which is now stated (F10). |
| Blocker + finisher hits | 1,600 t, 3 hits (2 impressions + 1 finisher, moderate), 15 s, crew 2 | 1,600 t, 2 hits, 11 s, crew 2 | 500 t, 2 hits, 11 s, crew 2 | Order OK. The press for the hub was chosen with Kt = 3 (see F13). |
| Trim (+ pierce) | 100 t, in line at 15 s, crew 1 | 100 t, 11 s, crew 1 (the Ø60 bore is pierced in the same stroke) | 100 t, 11 s, crew 1 | OK. The pierce force is not added to the trim force; that is stated, and the press does not change. |
| Controlled cool / heat treat | none (38MnVS6 is controlled-cooled) | none | none | OK. The advisor route used to print "Heat treat" (F12). |
| Descale / shot blast | £0.12/kg × **billet** | same | same | **Wrong weight** (F2): it should be × forging. Fixed. |
| MPI | £2.50 | — (not safety-critical) | £2.50 | Order OK. The figure was unlabelled (F9). F14 proposes costing it as a station. |
| Secondary machining | HMC: cut 748 s, pallet change, masked load | lathe op 10 / 20, drill, load + change-over | HMC: cut 1,071 s, pallet change, masked load | Machining auditor's operations. Here they were only re-priced. |

No step is charged twice: the descale adder and the shot-blast adder are the same step, and only the descale adder is charged. Every operation has parts per cycle = 1. The scrap uplift multiplies the machine time and the labour time alike.

## 3. Hub flange, by hand, to the penny (after the fixes)

**Rates (UK book):**

| Rate | Value |
|---|---|
| 38MnVS6 | £1.15/kg, scrap £0.20/kg |
| 1,600 t forge press | £91.6905/h |
| 100 t press | £15.2089/h |
| CNC lathe | £7.786875/h |
| Drill | £6.6415625/h |
| Forge labour | £25.15/h |
| Skilled labour | £27.95/h |
| Electricity | £0.182/kWh |

OEE is 0.80, labour efficiency 0.92 and scrap 2% (÷ 0.98).

| Line | Working | Result |
|---|---|---|
| Finished mass | 279.941 cm³ × 0.00785 | 2.198 kg |
| Drilled holes | 6 × π/4 × 14² × 18 mm | 16.6 cm³ |
| Machining stock | (11,643 + 9,444 + 2,199) mm² × 2 mm + π × 60 × 50 × 2 mm | 65.4 cm³ |
| As-forged weight | 2.198 + 82.0 × 0.00785 | 2.842 kg |
| Flash | 10% × 2.842 | 0.284 kg |
| Yield | 0.675 × 1.10 | 0.743 |
| Billet | 3.126 ÷ 0.743 | 4.2073 kg |
| Net weight | 2.842 ÷ 0.98 | 2.9000 kg |
| Utilisation | 2.842 ÷ 4.2073 | 0.675498 |
| Gross weight | 2.9000 ÷ 0.675498 | 4.29313 kg |
| Metal | 4.29313 × £1.15 − (4.29313 − 2.9) × £0.20 = 4.93710 − 0.27863 | **£4.65847** |
| Heating | 0.35 × 4.2073 ÷ 0.98 = 1.50260 kWh × £0.182 | £0.27347 |
| Descale | £0.12 × 2.842 ÷ 0.98 | £0.34800 |
| Machining tool wear | (machining auditor) | £1.35920 |
| **Raw material** | | **£6.63914** |
| Forge | 11 s = 0.003056 h ÷ 0.98 = 0.0031184 h; ÷ 0.8 × 91.6905 = 0.35741; labour × 2 × 25.15 ÷ 0.92 = 0.17049 | |
| Trim | 0.0031184 ÷ 0.8 × 15.2089 = 0.05928; labour × 1 × 25.15 ÷ 0.92 = 0.08525 | |
| Turning | 0.130333 ÷ 0.8 × 7.786875 = 1.26861; labour 0.130333 × 0.5 × 27.95 ÷ 0.92 = 1.97979 | |
| Drill | 0.05845 ÷ 0.8 × 6.6415625 = 0.48525; labour × 0.5 × 27.95 ÷ 0.92 = 0.88787 | |
| Load / change-over | 0.0309 ÷ 0.8 × 6.6415625 = 0.25653; labour × 1 × 27.95 ÷ 0.92 = 0.93876 | |
| **Process / labour** | | **£2.42708 / £4.06216** |
| Die cost | build-up below | £25,430 |
| Tooling | £25,430 × 250,000 ÷ 47,955 = £132,572 + £3,291 machining fixtures and programs = £135,863 ÷ 250,000 | **£0.54345** |
| Packaging + logistics | shop defaults | £0.17 + £0.30 |
| Factory | | £14.14183 |
| Overhead | 12% × (14.14183 − 0.47) | £1.64062 |
| Margin | 8% × 15.78246 | £1.26260 |
| **Total** | | **£17.04506 → £17.05** (dump: £17.0451) |

**Die build-up (toolroom book):**

| Line | Working | £ |
|---|---|---|
| Design & CAM | 41.9 h × £58.42 | 2,447 |
| H13 blocks | 159 kg × £9.50 | 1,514 |
| Block prep | 38.0 h × £52.37 | 1,988 |
| Sinking | 2 × 72.9 h × £52.37 | 7,639 |
| EDM | 29.2 h × £58.42 | 1,704 |
| Harden + temper | £2,500 + £2.20 × 159.3 kg | 2,851 |
| Polish | 25.6 h × £45.32 | 1,160 |
| Tryout | 18 h × £85.61 | 1,541 |
| Subtotal | | 20,844 |
| Toolmaker overhead + profit | 22% | 4,586 |
| **Die set** | | **25,430** |

**Die life:** 38,000 × 1.3 (simple) × (100 ÷ 116)^0.2 = 0.970752, so 47,955 forgings a die set.

**Press force:** Kt 3 × 105 MPa × (116 + 22.97 cm² flash land = 13,897 mm²) ÷ 9,806.65 N/t = 446 t. With the 1.2 safety factor that is 535 t, so the 1,600 t press is chosen; the ladder steps from 500 t to 1,600 t.

## 4. Shadow model result

`scripts/arith-audit/forging.ts` runs 40 checks a part. Each part is recomputed from:
- the measured geometry: volume, feature table, silhouettes, face census and bounding box;
- the rate book: machine, labour and material rates and the tariff;
- the toolroom rates;
- the stated constants.

It covers the as-forged weight, plan area, shape, press, trim press, hits, takt, crew, yield, flash, utilisation, net weight, die £, die life, heating kWh, descale, NDT, heat treat, consumables, four forge / trim operation £, overhead and margin %, the 7 buckets and the total. Ten checks are basis-text checks: each printed figure must be the one the arithmetic gives.

| Dump | PASS | FAIL |
|---|---|---|
| Before the fixes (lead's dump) | 73 | 47: descale weight, the scrap uplift on heating and NDT, the buckets and totals that follow from them, and every basis-text check |
| After the fixes (re-dump) | **120** | **0** |

`basis-check.py` on the three forging parts after the fixes passes everything except two rate-book source notes ("$245,000 / 1.3344 = 183603, printed £183,600" on `mach-hmc-400`). That note is the machining auditor's and the rate book's.

## 5. Constant register (cost-moving constants in the owned files)

Abbreviations: **EST** = labelled estimate, printed on the basis ("CostVision engineering-typical, not sourced"). **LIB** = rate book. **MEAS** = measured. **Δ** = £ effect.

| file:line (after edits) | Value | Meaning | Class | £ effect on a real part |
|---|---|---|---|---|
| rules forging.ts `FLASH_FRACTION` | 0.10 closed-die, 0.04 precision | flash ÷ forging | EST (now printed) | Cost-neutral on billet: the yield is scaled by the same fraction |
| rules `IMPRESSIONS` | 2 (+1 complex) | blocker + finisher | EST | Die sinking hours scale with it |
| rules `HEAT_TREAT` | none for microalloyed, normalise / Q&T… | route by alloy | Stated rule | 0 on the three parts (38MnVS6) |
| rules `NDT_BY_PROCESS` | MPI on closed-die | | Stated rule | Knuckle and yoke £2.55 |
| rules `FORGE_LINE` | load 3 s, hit 4 s mech / 8 s hyd | takt | EST (now printed) | Forge + trim ≈ £0.67 on the hub per 11 s |
| rules `FORGE_CREW` / `TRIM_CREW` | 2 / 1 | crew | EST (printed) | Labour on press + trim |
| rules `FORGING_REJECT` | 0.02 | scrap | EST (printed) | ×1.0204 on metal, press time and services |
| rules `FORGING_MACHINING_STOCK_MM` | 2.0 closed-die | stock a side | EST (printed: "2 mm a side") | Hub +0.51 kg forging |
| rules `flashGeometry` | 4.4 √A outline, 0.015 √A thickness, land 3 t | flash land / trim | Rule of thumb said to follow ASM closed-die practice (printed). No source was read this round. | Press tonnage +20%; trim force |
| rules shape score | free-form ≥ 3 / ≥ 8, undercuts ≥ 4, faces ≥ 120; demotion at ≥ 55% revolved faces | complexity | EST (now printed with its score) | Knuckle: see F16 |
| rules `CORED_ABOVE_MM.forging` (machining-time.ts) | 25 mm | pierce above | EST (printed) | Hub Ø60 pierced |
| machine-sizing `pickForgePressId` safety | 1.2 | press margin | Stated on the basis | Press choice |
| machine-sizing `pickStampingPressId` safety | 1.25 | trim margin | Now printed | none (100 t floor) |
| advisor `FORGING_PROCESS_REFERENCE.yieldBand` | closed-die 0.55–0.80 | as-forged ÷ billet (as costed) | EST (now printed, definition corrected; see F7) | Billet, so ~£4.66 metal on the hub |
| advisor `FORGING_FLOW_STRESS_MPA` | 105 microalloyed, 90 carbon… | hot flow stress | EST (now printed) | Press tonnage, trim force |
| advisor `shapeConstraintFactor` | 3 / 5 / 8 | Kt | EST (now printed; compared with Kalpakjian & Schmid in F13) | Yoke press 500 t v 1,600 t |
| advisor `FORGING_DIE_LIFE_BASE` + factors | 38,000; ×1.3 / 1 / 0.6; (100/A)^0.2 | die life | EST (now printed) | Tooling £0.53 on the hub |
| advisor `estimateForgingDieCost` | 4× face, height ≥ 18 cm, ×1.15, +3 kg/kg holder, (40 + 0.9 A^0.85) h, 20 h + 15%, 30 h + 0.05 h/kg, 25% EDM, £2,500 + £2.20/kg, 16 h polish, 18 h tryout | toolroom build-up | EST (lines now printed with their £; the formulas stay in the toolmaker detail lines) | Die £25,430 on the hub |
| toolmaking `TOOLROOM_RATES_UK`, `TOOL_MATERIAL_GBP_PER_KG`, 22% | | | LIB (toolroom book, dated) | |
| advisor `FORGING_HEAT_KWH_PER_KG` | 0.35 steel | wall-plug induction kWh/kg | EST (now printed) | Hub £0.27 |
| module-energy `FURNACE_FUEL` | 1.0 / 1.35 / 2.4 | fuel factors | EST (stated in the heating basis for gas) | 0 on the three parts |
| advisor `FORGING_DESCALE_GBP_PER_KG_UK` | £0.12/kg of forging | descale | EST (now printed) | Hub £0.35 |
| advisor `HEAT_TREAT_COST_PER_KG` | 0.30 / 0.65 / 0.35 / 1.20 | bought-in heat treatment | EST (now printed when charged) | 0 on the three parts |
| advisor `NDT_COST_PER_PART` | MPI £2.50, UT £6, CT £32 | NDT | EST (now printed) | Knuckle and yoke £2.55 |
| advisor shot blast £0.35, coining £0.55 | | | EST, not charged by the rules | 0 |
| advisor `COLD_FORMER_MAX_SLUG_MM` | 50 | cold-former limit | Labelled heuristic | Routing only |
| to-cost-params forging fallbacks | yield 0.675, 10 s / blow, die life 30,000, 0.35 kWh/kg, `forge-press-…t` by weight | used only when a rule did not decide | Fallback (`assumed` list) | 0 on the three parts |

The remaining unlabelled numbers flagged by `constants.py` in the owned files are confidence scores (0.6–0.9) and DFM-score weights. Neither moves cost.

## 6. Findings register

H = wrong money or a false statement. M = an unverifiable or unlabelled figure that moves cost by 1% or more. L = presentation. The £ moves come from the shadow model on the lead's dump, so they isolate this group's fixes. They include overhead and margin.

| ID | Sev | Where | Evidence | Status | £ before → after |
|---|---|---|---|---|---|
| F1 | M | rules `forging.forgeId` basis | Printed "F = Kt × σflow × A … = 324 t" with no Kt or σflow. Now: "Kt 3 for a simple shape, σflow 105 MPa … ; A = 84.3 cm² silhouette + 16.69 cm² flash land = 100.99 cm²; F = 3 × 105 MPa × 10,099 mm² ÷ 9,806.65 N/t = 324 t × 1.2 safety = 389 t → … the 500 t press (library presses 500, 1,600, 2,500, 4,000, 8,000 t)". Verified: 3 × 105 × 10,099 ÷ 9,806.65 = 324.4 ✓. Knuckle 5 × 105 × 15,526 ÷ 9,806.65 = 831 t ✓. Hub 446 t ✓. | FIXED (test F1) | text only |
| F2 | **H** | module `forging.ts` descale | Descale was charged £/kg × **billet**. The adder states "per kg of forging", and the flash, crop and scale never reach the blast. Hub: 0.12 × 4.207 = £0.505 against 0.12 × 2.842 = £0.341 (48% over). | FIXED (test F2) | see F5 row |
| F3 | **H** | rules `forging.dieCost` basis | Printed "£6713 block + £13824 sinking…". The "block" was a residual holding design & CAM £2,447, tryout £1,541 and their share of overhead; the H13 itself was £1,514. The basis now lists every toolmaker line with hours or kg and £, the 22%, and re-adds to the value. The kernel's face-count die is marked "not used". | FIXED (test F3) | text only |
| F4 | M | rules `forging.dieLife` basis | Printed "microalloyed-steel at 116 cm², simple impression" with no figures. Now "38,000 … × 1.3 … × 0.970752 size = 47,955 forgings — engineering-typical". | FIXED (test F4) | text only |
| F5 | L | module `forging.ts` | Metal and press time carry ÷ (1 − scrap); heating, descale, heat treat, coining and NDT did not, though scrap is found at inspection after them. They now carry the same uplift. | FIXED (test F5) | F2 + F5 together: knuckle **£22.7913 → £22.6431**, hub **£17.2495 → £17.0663**, yoke **£22.9411 → £22.8660** |
| F6 | M | rules heating basis | "energy to bring … to forging temperature" without 0.35 kWh/kg or the billet. Now prints kWh/kg × billet ÷ 0.98 = kWh, labelled. | FIXED (test F6) | text only |
| F7 | M | advisor yield band / rules yield basis | The band was documented as "finished ÷ input stock" (advisor comment and rules header). The rules apply it to the **as-forged** weight, which already carries the machining stock: the hub costs at finished ÷ billet = 0.52, below the band's 0.55 floor. The cost is plausible as forging ÷ billet (flash plus scale plus crop is 20–40% of a closed-die billet), so the definition was corrected to what is costed, not the value. The basis now prints the band, the billet arithmetic, finished ÷ billet, and the un-itemised kg (scale, crop, wad). **Decision for the lead:** if the band is meant as finished ÷ billet, the billet should be finished ÷ 0.675. That gives the hub 3.256 kg, not 4.207, about −£1.2 a part. That needs a sourced band before a change. | FIXED (text) / value OPEN | text only |
| F8 | L | rules flash basis | "10% of part weight" did not say it is cost-neutral (the yield is scaled by the same 10%) or unsourced. Now it does. | FIXED | text only |
| F9 | M | rules descale / NDT / heat-treat bases | £0.12/kg, £2.50 MPI and £/kg heat treat were unlabelled. "Forge scale pickled off" named a process the route calls shot blast. Each now prints £ × weight and "engineering-typical, not sourced". | FIXED (test F6/F9) | text only |
| F10 | M | rules cycle basis | Billet cut-off and the heater's capital were not costed and not said on screen (only in the 2 Oct review doc). Now stated: "Not costed: billet cut-off (saw / shear) and the billet heater's capital…". The takt arithmetic is now checkable ("3 s + 2 × 4 s = 11 s"). | FIXED (test F10) | text only |
| F11 | L | rules trim basis | "→ the smallest mechanical press with 1.25× margin" without the margin result. Now "8.2 t × 1.25 margin = 10.25 t → the 100 t press". It also states that a pierce is not added to the force. | FIXED (test F1) | text only |
| F12 | L | advisor `adviseForgingProcess` route | The closed-die route printed "Heat treat" for microalloyed steel (the costing charges none), "Shot blast" while the costing named "pickle", and no MPI. Now "Controlled cool from the forge heat" for microalloyed, "Shot blast (descale)", and MPI when safety-critical. | FIXED (test F12) | text only |
| F13 | M | advisor `shapeConstraintFactor` | Kt 3 / 5 / 8 is applied to an area that **includes the flash land**. Kalpakjian & Schmid's k_p (F = k_p·Y_f·A, A incl. flash) is 3–5 for simple shapes without flash, 5–8 simple with flash and 8–12 complex with flash. The tool's figures sit at the bottom of those ranges or below them. There was no stated source in the code, so the value is not changed: it is now printed and labelled. | **PROPOSED** | Kt simple 3 → 5 moves the yoke to the 1,600 t press: (91.69 − 50.95) × 0.0031184 ÷ 0.8 = +£0.159, about **+£0.19** with overhead and margin. The hub stays on 1,600 t. |
| F14 | M | advisor `NDT_COST_PER_PART.mpi` | A flat £2.50 MPI on a forged knuckle. The cast knuckle's identical 100% MPI is a 75 s bench station (`casting-advisor.ts::NDT_STATION.mpi`, about £0.6). That is two figures for one step. | **PROPOSED** | knuckle and yoke about −£2.2 each. Proposed code below. |
| F15 | L | rules die-cost basis | The "OCCT parametric says £15000" figure was printed beside the costed die with nothing to say it is unused. Now "the kernel's face-count die £15000 is not used". | FIXED | text only |
| F16 | **H** (text) / M (value) | rules shape basis | The knuckle basis printed "24 free-form, 1 undercut, 310 faces" and the value said moderate. By the rule's own thresholds that score is 3, which is complex: the demotion (58% of faces cylinders / cones / tori) was not printed. Now "score 2 + 0 + 1 = 3 → complex …; 181 of 310 faces are cylinders, cones or tori (58%, ≥ 55%) — formed in round dies, so moderate". The **value** is a judgement. The knuckle's measured turning fraction is 0.38 (not a turned part), but the stub axle the demotion was written for measures 0.35, so no geometric test separates them. | FIXED (text) / value PROPOSED | If the knuckle is complex: Kt 8, 4 hits / 19 s, 3 impressions, die £40,680 / 21,648 life. Shadow total £22.64 → **£24.17** (+£1.53). |
| F17 | L | core (not owned) | The scrap credit is (gross − net) × £0.20. The rejected forgings (net × 2%) and the machining swarf (forging − finished, 0.64 kg on the hub) are not credited. About £0.01 and £0.13 on the hub. The 2 Oct review doc's "− swarf and flash × £0.20" overstates what is credited. | PROPOSED (core / module semantics) | hub about −£0.15 |
| F18 | L | main.ts:4793 (not owned) | The form label "Descale (£/kg, 0=none)" does not say per kg of what. | PROPOSED: `Descale (£/kg of forging, 0=none)` | — |

**Proposed code, F14** (`forging-advisor.ts`). `ndtStationCostPerPart` is in `casting-advisor.ts`, the casting auditor's file. Its MPI includes a 1-in-50 X-ray sample that a forging does not need, so either add a `{ sampleXray: false }` option there or compute the station here:

```ts
import { NDT_STATION } from './casting-advisor.js';
import { activeLabourRate } from '../rate-context.js';
// in estimateForgingSecondaryAdders, for inputs.ndt === 'mpi':
const st = NDT_STATION.mpi;
const unit = Math.round(st.secPerPart / 3600 * (activeLabourRate('lab-uk-inspector') * st.manning
  + st.equipmentGbpPerHrUk * countryFactor('inspection')) * 100) / 100;
```

**Proposed code, F13** (`forging-advisor.ts`, needs the lead's decision since it moves the yoke's press):

```ts
export function shapeConstraintFactor(shape: ShapeComplexity, withFlash = true): number {
  // Kalpakjian & Schmid k_p: simple w/o flash 3–5, simple with flash 5–8, complex with flash 8–12 (lower ends)
  return withFlash ? (shape === 'complex' ? 8 : 5) : (shape === 'simple' ? 3 : 5);
}
```

## 7. Real parts that move (for the lead's re-record)

| Part | Lead's dump | After (re-dump, every auditor's edits) | Of which this group (shadow on the lead's dump) |
|---|---|---|---|
| steering_knuckle_RH | £22.7913 | £22.6471 | −£0.1482 (descale on forging −£0.18, uplift on heating / NDT +£0.03) |
| FORGE_Hub_Flange | £17.2495 | £17.0451 | −£0.1832 |
| FORGE_Control_Arm_Yoke | £22.9411 | £22.8699 | −£0.0751 |

`tests/real-parts-baseline.test.ts` will move for these three parts. `tests/commodity-rules-prompt.test.ts` fails on the forging snapshot, because the basis wording changed. Neither was updated.

## 8. Not checked, and why

- **Secondary machining** (operation times, fixturing, tool wear, `secondaryMachiningToolingCost`) belongs to the machining auditor. Its £ was re-priced from the dumped times only.
- **Machine and labour rates** belong to the rate book. `basis-check` flags the `mach-hmc-400` capex note.
- **Packaging, logistics, overhead and margin %** are shop defaults (`regionalShopDefaults`). Only the % was confirmed.
- **The press ladder and its 500 → 1,600 t gap** are in `machine-sizing.ts`. The hub needs 535 t and pays the 1,600 t rate; that is a library-coverage question.
- **Other countries** were not run, and neither were the non-closed-die routes: ring rolling, open die, cold forming and precision. None of the three real parts takes them.
- **Surface finishing** was not run: the finish question is unanswered on all three parts, so they are costed bare.
- **The flash outline** (4.4 √A) and **the pierced wad** are estimates. The kernel measures area, not perimeter or web thickness.
- **No figure here has been compared with a forge quote.**

Sources consulted for F13: forging-force tables reproducing Kalpakjian & Schmid's k_p ranges:
- [uotechnology.edu.iq forging notes](https://pme.apps.uotechnology.edu.iq/wp-content/uploads/2024/12/FORGING.pdf)
- [Ch. 14 forging slides](https://www.slideshare.net/slideshow/ch14-forging/41022294)

These are secondary copies of the textbook table, so the code cites the textbook only as "for comparison" and does not claim it as the source of its values.
