# Arithmetic audit — machining (from solid, and the secondary-machining cell on castings and forgings), 30 Oct 2026

Brief: `docs/review/arith-audit/BRIEF.md`. Group `machining`.

## 1. Scope

**Files owned:** `src/engine/cost-input-rules/commodities/machining.ts` (rules, plan, routing call, NRE),
`src/engine/machining-time.ts` (stock, cutting time, cell), `src/engine/routing-optimiser.ts`,
`src/engine/modules/machining.ts`, `src/engine/feature-machining.ts`, `src/engine/feature-costing.ts`, the `machining` case
and the `secondaryMachining` helper in `cost-input-rules/to-cost-params.ts` (read, not edited — every fix landed in the
functions it calls).

**Parts:** from solid — `Part1.stp` (6082, prismatic, 248 faces), `MACH_Hydraulic_Manifold.stp` (6082 block, 13
holes), `MACH_Stepped_Shaft.stp` (EN8 shaft, turned). Secondary machining — `PRCR002.stp` (cast + machine near-net cut:
faces, holes, cored bores, spindle), `FORGE_Hub_Flange.stp` (feature path, turned near-net part), `steering_knuckle_RH.stp`
(feature path, twin-pallet cell).

**Reproduce:**

```bash
cd calculator
npx tsx scripts/arith-audit/dump.ts <dir>                 # the product's headless chain, UK, 50,000/yr, 5 years
npx tsx scripts/arith-audit/machining.ts <dir>            # shadow model, PASS / FAIL per check, exit 1 on FAIL
ARITH_VERBOSE=1 npx tsx scripts/arith-audit/machining.ts <dir>   # + the shadow's intermediate figures
npx vitest run tests/arith-audit-machining.test.ts
```

## 2. Sequence — as costed v as made

| Part | As costed (after the fixes) | A production engineer's route | Verdict |
|---|---|---|---|
| Part1 (6082, 270 × 110 × 58) | saw 278 × 115 off 65 mm plate (material line) → HMC twin-pallet cell, 2 hydraulic fixturings (3 directions in one clamping + the clamped face): mill +X 17.1, +Z 7.2, +Y 5.5 min, drill / bore 13 holes 9.7 min in the same clamping; pallet change 2 × 10 s; load / unload masked 2 × 1.2 min (labour); deburr + gauge 1.99 min (bench) | saw → HMC op 10 / op 20 on a tombstone (rough, finish, surface the free-form, drill / bore / helical the Ø50s) → deburr → inspect | Right order and machines. Roughing removed the holes' metal twice (**M1**, fixed). |
| Hydraulic manifold (6082, 120 × 80 × 60) | 125 × 85 off 65 plate → HMC cell, 2 fixturings: mill 13.2 min by direction, drill 13 holes 6.0 min (incl. 4 × M6 tapping, inferred), pallet change, masked load 2 × 0.6 min, deburr 1.15 min | saw → mill six faces → gun / peck-drill the galleries, tap → deburr (cross-hole deburr is the critical step on a manifold) → wash → pressure test | Right. Not modelled: cross-hole deburr beyond the face-count allowance, wash, pressure test — a hydraulic manifold is leak-tested (stated, not charged; §7). Tapping was charged but not stated (**T2**, fixed). |
| Stepped shaft (EN8, Ø40 × 190) | Ø45 × 198 bar → CNC lathe op 10 / op 20 6.0 min → VF-2 mill / drill 0.78 min (5.9 cm² flats + Ø6 cross hole) → load / clamp / unload 3 × 0.6 min → deburr 1.09 min | bar-fed lathe (part-off) op 10 / op 20 → cross-drill / flat on a mill → deburr → inspect | Right. The third fixturing's handling is charged at the lathe's rate, not the VF-2's (**L6**, £0.003, noted). |
| PRCR002 (GJS-500 sand, cast + machine) | HMC cell 1 clamping: face 3 sides 9.7 min, drill 12 holes 8.0, finish-bore 10 cored bores 6.4; CNC lathe: spindle 4.0 min + load 1.2 min (now its own op, whole operator); pallet change; masked load; deburr 2.46 min | fettle → blast → (datum) mill / bore on HMC → turn spindle → deburr → MPI → inspect | Right. The lathe load rode in the turning op at crew 0.5 and paid tool wear (**M3**, fixed). Deburr counts all 364 B-rep faces, as-cast ones included (**L7**, proposed). |
| Hub flange (38MnVS6 forging) | forge → trim → CNC lathe outside + 3 faces 7.8 min → drill centre 6 × Ø14 + Ø60 bore 3.5 min → load / change-over 3 fixturings | forge → trim → turn op 10 / op 20 (faces, OD **and the Ø60 bore**) → drill PCD → deburr → inspect | The coaxial Ø60 bore is costed on the drill centre, not in the lathe chucking (**L8**, proposed). The two chuckings were priced as two £2,500 mill fixtures (**L3**, fixed). No deburr / gauge step on the feature path (**M5**, proposed). |
| Steering knuckle (forging) | forge → trim → HMC cell 1 clamping: 20 features 12.5 min → pallet change → masked load 0.6 min → change-over (now machine time) | forge → trim → (heat treat) → HMC → deburr → MPI → inspect | Change-over was labour-only (**L4**, fixed). No deburr / gauge step (**M5**, proposed). |

## 3. Part1 worked by hand, to the penny (after the fixes)

Geometry (`real-parts-baseline.json`): V = 429.434 cm³, box 58.19 × 270 × 110 mm (sorted 270 × 110 × 58.19), 248 B-rep
faces, area by type PLANE 29,280 / CYLINDER 47,924 / TORUS 2,854 / CONE 404 / BSPLINE 2,515 mm², setup analysis 3 directions
(+X 142, +Z 60, +Y 46 faces), 18 feature rows. Answers: aluminium, machining. Book: UK (6082 bar £3.49/kg, scrap £0.54/kg;
HMC-400 £10.8677/h; VF-2 £9.0505/h; UMC-500 £17.07/h; drill £6.6416/h; skilled £27.95/h; semi-skilled £24.65/h; engineer
£33.27/h).

| Step | Arithmetic | Value |
|---|---|---|
| Net mass | 429.434 × 0.0027 = 1.15947 → 3 dp | 1.159 kg |
| Plate | 58.19 + 2 × 1 skim = 60.19 → next stocked | 65 mm |
| Blank | (270 + 2 × 2.5 + 3 kerf) × (110 + 2 × 2.5) × 65 = 278 × 115 × 65 | 2,078.1 cm³ = 5.611 kg |
| Utilisation | 1.159 ÷ 5.61087 = 0.20656 → **4 dp** (was 3 dp: 0.207 bought 5.599 kg) | 0.2066 |
| Metal in holes | Σ π/4 d² L n over the non-land holes (Ø43 × 8 is a land, skimmed) | 197.82 cm³ |
| Rough | (2,078.1 − 429.434 − 197.82) ÷ 120 cm³/min | 12.090 min |
| Finish walls | (804.62 cm² wall types − 236.52 cm² hole walls) ÷ 40 cm²/min | 14.203 min |
| Surface | 25.15 cm² B-spline ÷ 10 cm²/min | 2.515 min |
| Holes | 2 × Ø8 × 41 blind deep-peck 0.404 + 2 × Ø10.5 0.183 + 2 × Ø14 × 10 blind bore 0.55 + 2 × Ø22 × 39.6 blind bore 0.698 + Ø24 0.19 + Ø43 land 0.372 + Ø50 × 12.9 blind 1.245 + 2 × Ø50 × 32 2.10 | 9.677 min |
| Tool changes | (3 + 1 ball nose + 7 hole sizes) × 6 s | 1.10 min |
| Mill content | r2(39.584) − r2(9.677) = 39.58 − 9.68 | 29.90 min |
| Routing: volume cell | machine (29.90 + 9.68) / 60 × 10.8677 + 2 × 0.75 h × 10.8677 / 2,500 + 2 × 10 s × 10.8677/h = 7.2360; operator 27.95 × (0.6597 × 0.5 + 2 × 1.2 / 60) = 10.3368 | **£17.57** |
| Routing: split 3-axis | VF-2 0.4983 h × 9.0505 + drill 0.1613 × 6.6416 + 4 × 0.75 × 9.0505 / 2,500 + 4 × 0.02 × 9.0505 = 6.3166; operator 27.95 × (0.3298 + 0.08) = 11.4548 | £17.77 |
| Routing: 5-axis | UMC-500 0.6597 × 17.07 + 2 × 0.75 × 17.07 / 2,500 + 2 × 0.02 × 17.07 = 11.9536 + 10.3368 | £22.29 |
| Ops (hr, 4 dp) | +X 29.90 × 142/248 = 17.120 min → 0.2853; +Z 7.234 → 0.1206; +Y 5.546 → 0.0924; drill 9.68 → 0.1613; pallet 20 s → 0.0056; load 2.4 min → 0.0400 (bench); deburr 0.5 + 0.004 × 248 + 0.5 = 1.99 → 0.0332 (bench) | |
| Set-up | 2 fixturings × 45 min = 1.5 h ÷ batch 2,500 (50,000 ÷ 20) | 0.0006 h/part |
| Fixtures | 2 × £12,000 hydraulic | £24,000 |
| Programming | (1.5 × 2 + 0.25 × 18 + 2 surfacing) = 9.5 h × £33.27 | £316 |
| Tool wear | (0.2853 + 0.1206 + 0.0924 + 0.1613) × 60 = 39.576 min × £0.04 | £1.583 |
| Reject uplift | 1 ÷ (1 − 0.02) | 1.020408 |
| **Material** | 1.159 × 1.020408 = 1.182653 kg net; ÷ 0.2066 = 5.724361 kg × £3.49 = 19.978020 − (5.724361 − 1.182653) × £0.54 = 2.452522 → 17.525498; + tool wear 1.583 × 1.020408 = 1.615306 | **£19.1408** |
| **Process** | set-up 0.0006 × 10.8677 = 0.006521 + Σ (op hr × 1.020408 ÷ 0.8 × 10.8677): 3.954792 + 1.671742 + 1.280837 + 2.235920 + 0.077626 | **£9.2274** |
| **Labour** | set-up 0.0006 × 27.95 = 0.01677 + machine ops 0.6652 h × 1.020408 × 0.5 ÷ 0.92 × 27.95 = 10.310760 + load 0.0400 × 1.020408 ÷ 0.92 × 27.95 = 1.240018 + deburr 0.0332 × 1.020408 ÷ 0.92 × 24.65 = 0.907697 | **£12.4752** |
| **Tooling** | (24,000 + 316) ÷ (50,000 × 5) | **£0.0973** |
| Packaging / logistics | shop defaults by envelope (not machining's — taken from the stack input) | £0.10 / £0.15 |
| **Overhead** | 12 % × (19.1408 + 9.2274 + 12.4752 + 0.0973) = 12 % × 40.9407 | **£4.9129** |
| **Margin** | 8 % × (40.9407 + 0.25 + 4.9129) | **£3.6883** |
| **Total** | | **£49.79** (was £50.81) |

## 4. Shadow model

`scripts/arith-audit/machining.ts` restates every constant (file:line in its comments) and recomputes, without calling
the rules, optimiser, time model, feature path or module: net and stock weight, utilisation, every cutting element, each
routing candidate's machine + operator £ (checked against the figure printed in the routing basis), the chosen routing,
each operation's hours / machine / crew / OEE / bench flag, set-up, batch, fixtures, programming, tool wear, then the 8
buckets and the total; for PRCR002 every machining operation of the near-net cut, tool wear, fixtures, programming and
set-up; for the hub flange and the knuckle the feature path's lathe, cut, pallet, load and change-over operations, tool
wear, fixtures + programming.

| Dump | Checks | Result |
|---|---|---|
| shared dump (before the fixes), `ARITH_PRE_FIX=1` (the shadow with the five corrections switched off) | 189 | **189 PASS, 0 FAIL** — the shadow reproduces the old code to the penny |
| shared dump (before the fixes), corrected shadow | 190 | 148 PASS, 42 FAIL — every FAIL is a cascade of M1, L1, M3, L3 or L4 below |
| re-dumped after the fixes (`scratchpad/mach/dump-after`), corrected shadow | 193 | **193 PASS, 0 FAIL** |

Per part after the fixes: Part1 51, manifold 51, shaft 39, PRCR002 35, hub flange 8, knuckle 9 checks — all PASS (every
bucket and the total within ½p).

## 5. Constant register (cost-moving constants in the owned files)

Classes: SOURCED, LIBRARY, MEASURED, LABELLED-ESTIMATE (printed with its status where the reader sees it), UNLABELLED.
"→ LE" = was unlabelled, now printed with its status by this audit.

| file:line | Value | Meaning | Class | £ effect on a real part |
|---|---|---|---|---|
| machining-time.ts `CUTTING_DATA` | Al 120 / steel 35 / CI 50 cm³/min mill; 250 / 80 / 100 turn; timeFactor 1 / 2 / 1.6 | roughing removal rates, machinability factor | → LE (`CUTTING_DATA_STATUS` on every cutting basis) | Part1 rough 12.1 min = £3.4 |
| machining-time.ts `CUTTING_DATA.toolCostPerCutMin` | £0.04 Al / 0.12 steel / 0.10 CI | perishable tooling per cutting minute | → LE (tool-wear basis) | Part1 £1.58, PRCR002 £2.81 |
| machining-time.ts `FINISH_RATE_CM2_PER_MIN` | wall 40, surfacing 10 | finishing pass coverage, aluminium | → LE | Part1 finish 14.2 min = £4.0 |
| machining-time.ts `FINISH_RATE_CM2_PER_MIN.turning` | 120 cm²/min | finish-turning coverage, aluminium | → LE (`TURN_FINISH_STATUS`: fn 0.15 × vc 250 = 375 cm²/min at the insert, derated ~3×, **conservative, not sourced**). Arithmetic per Sandvik Coromant's turning formulas (Tc = lm ÷ fn·n); no catalogue vc / fn value was found to source the derate. **Open item.** | hub flange finish-turn 6.5 of 7.8 min; at the un-derated 375 it would be 2.1 min and the hub flange ~£2.9 (17 %) lower — the bound on this open item |
| machining-time.ts `HANDLING_BY_WEIGHT` | 0.3 / 0.6 / 1.2 / 2.5 min | load / clamp / unload per fixturing by weight | → LE (handling op basis prints the bands + status) | Part1 2.4 min = £1.24 |
| machining-time.ts `TOOL_CHANGE_SEC` | 6 s | chip-to-chip tool change | printed in basis → LE | 1.1 min on Part1 |
| machining-time.ts `SETUP_MIN_PER_FIXTURING` | 45 min | change-over per fixturing a batch | → LE (set-up basis) | < £0.03 at batch 2,500 |
| machining-time.ts `STOCK_ALLOWANCE`, `PLATE_MM`, `BAR_MM` | 2.5 / 1 / 3 mm; stocked sizes | facing, skim, kerf; UK stockist sizes | LABELLED (stock basis prints each) | material line |
| machining-time.ts `FIXTURE_GBP` | modular 500, dedicated 2,500, soft jaws 300, hydraulic 12,000 | work-holding | → LE (fixture basis) | Part1 £0.096 / part |
| machining-time.ts `PROGRAMMING_HR` | 1.5 h / fixturing, 0.25 h / feature row, 2 h surfacing | CAM + prove-out | → LE | £0.001 / part |
| machining-time.ts `deburrInspectMinutes` | 0.5 + 0.004 × faces + 0.5 min | bench deburr + gauge | → LE | Part1 £0.91, PRCR002 £1.10 |
| machining-time.ts `CAST_MACHINING_STOCK_MM` | sand-ferrous 3.0 … HPDC 0.5 | ISO 8062-3 RMA typical | SOURCED (standard named; grade an assumption, stated) | PRCR002 cast weight, spindle rough |
| machining-time.ts `CORED_ABOVE_MM` | sand 20, HPDC 6, forging 25 | cored / pierced above | LABELLED (bore basis) | PRCR002 bore v drill split |
| machining-time.ts `MIN_NEAR_NET_TURNED_*`, `TURNED_PART_FRACTION` | 20 cm², 8 %, 0.6 | route thresholds | LABELLED (comment cites the parts that set them; the turning basis states the fraction) | route choice |
| feature-machining.ts `DRILL_FEED 400`, `MICRO 250`, `PECK 1.5`, `TAP 500 / 0.10`, `BORE_FINISH 150`, 0.15 / 0.25 / 0.10 min adders, helical 0.5 + 0.05 L | hole time model | → LE (drilling / boring bases now itemise every row and print the feeds + status) | manifold 6.0 min drilling |
| feature-machining.ts `FACE_MILL_FEED 8000`, `POCKET_MRR 6000` | near-net facing / pocketing | → LE (near-net basis) | PRCR002 faces 9.7 min |
| routing-optimiser.ts `VOLUME_CELL_MIN_ANNUAL` 25,000, `PALLET_CHANGE_SEC` 10, `HMC_SIDES_PER_CLAMPING` 4, `CUTTING_MANNING` 0.5 | cell eligibility, crew | LABELLED (routing basis; pilot rule pack) | routing |
| routing-optimiser.ts `MACHINE_CATALOGUE` envelopes | catalogue-typical | LABELLED (comment) — feasibility only | — |
| machining.ts `MACHINING_REJECT` 0.02 | scrap | LABELLED ("engineering typical") | +2 % on material and time |
| machining.ts `MIN_UTILISATION` 0.05 | mis-route floor | LABELLED (basis says clamped) | none on the real parts |
| machining.ts `MACHINE_OEE` 0.80, labour efficiency 0.92 | shop defaults | stated assumption (`assumed` list, op table) | ÷ 0.8 on every machine £ |
| modules/machining.ts tolerance factors 1.15–2.0 | cycle multiplier by tolerance | not reached headless (no tolerance input); schema states them | — |
| feature-costing.ts `T` (0.30 drill, 0.60 tap, 0.85 planar face, 2.6 free-form face), `MRR 12`, `FINISH 20`, 30-min set-ups, threads = 30 % of holes (main.ts) | the "Feature-based cost breakdown" card | **UNLABELLED and not the costing** — see **H1** | card prints £45.60 for Part1 v £21.70 costed |

## 6. Findings register

| ID | Sev | Where | Evidence | Status | Before → after |
|---|---|---|---|---|---|
| **H1** | H | `src/ui/main.ts` `buildFeatureCostCard` (6571) + `feature-costing.ts` | On the machining / cast + machine route, "Full measurements, features and options" prints a **Feature-based cost breakdown** with £ and minutes from a separate heuristic (0.85 min a planar face, 2.6 min a free-form face, tapped threads guessed as 30 % of holes, **30 min of set-up per setup charged on every part**, a material factor guessed by regex from the AI's material id) at the VMC rate. Part1: **£45.60 · 247 min** (90 min of it "Setups"); the costing's machining is £21.70 (process + labour) and 39.6 min. Manifold £14.05 v £10.76; shaft £16.62 v £4.59; PRCR002 £65.60 v £15.84. A £ figure on screen that is neither measured, the rate book, an answer, nor arithmetic on them. | PROPOSED (main.ts not mine) — remove the card, or replace it with the costing's own operation lines: `function buildFeatureCostCard(): string { return ''; }` and drop the import; the per-feature £ the reader needs are already the DFM / viewer face costs (`dfmFindingAmounts`, `setFaceCosts`). If the card stays, at minimum stop printing £ / min and keep its DFM bullets. `feature-costing.ts`'s `physicalRemovalCeilingMin` is still used by the AI-op ceiling in `to-cost-params.ts` and `should-cost-audit.ts`; `computeFeatureCosting` would then be dead. | screen text only |
| **M1** | H | `machining-time.ts` `fromSolidMillingTime`, `fromBarTurningTime` | Roughing = (stock − part) ÷ removal rate; stock − part includes the metal inside every hole, which the hole time (drill / ream / helical mill) also removes. Charged twice: Part1 197.8 cm³ = 1.65 min; manifold 61 cm³ = 0.51 min. | FIXED — `holeVolumeCm3` (lands excluded: skimmed, roughed) subtracted; basis prints it. Test M1 ×4. | Part1 **£50.81 → £49.79** (−2.0 %, with L1); manifold **£22.52 → £22.19** (−1.5 %); shaft unchanged by M1 (0.6 cm³) |
| **L1** | L | `commodities/machining.ts` `stockFacts` | Utilisation rounded to 3 dp: the costing bought net ÷ 0.207 = 5.599 kg while the basis printed 5.611 kg stock (0.21 %; up to 1 % on a 5 % part). | FIXED — 4 dp. Test L1 ×3. | Part1 +£0.04 (inside the M1 figure); shaft **£9.3507 → £9.3532** |
| **M3** | M | `commodities/machining.ts` `buildOperationPlan` (near-net spindle) | The lathe op was `spindle + handling` at the cutting crew 0.5 (the stated convention: load / unload take a whole operator), and `cuttingMinutesOf` charged tool wear on the 1.2 handling minutes. | FIXED — the load is its own op "Load / clamp / unload — lathe fixture" at crew 1, excluded from tool wear. Test M3 ×3. | PRCR002 machining: labour +£0.304, tool wear −£0.120 → **+£0.22** on the part (casting auditor's baseline). Stub axle at other volumes alike. |
| **L3** | L | `machining-time.ts` `secondaryMachiningCell` | A turned near-net part's 2 lathe chuckings were priced as 2 dedicated £2,500 mill fixtures; basis said "3 dedicated fixture(s)". The from-solid route prices a chucking as £300 soft jaws. | FIXED — chuckings → soft jaws, basis says so. Test L3. (Screen passes `turned` too — parity kept.) | Hub flange tooling £7,691 → £3,291 → **−£0.021/part** |
| **L4** | L | `feature-machining.ts` (masked cell) | On the twin-pallet cell the batch change-over (45 min ÷ batch per fixturing) was folded into the labour-only "masked" load — the machine was never charged for standing during the fixture swap; the pallet masks the load only. | FIXED — its own "Machining change-over, amortised" op (machine + setter, OEE 1, as the from-solid set-up). Test L4 ×2. | Knuckle, yoke **+£0.004** each |
| **T1** | M | `machining-time.ts`, `commodities/machining.ts` bases | Cutting rates, handling bands, change-over, programming hours, tool £/min, fixture £, deburr allowance were printed as numbers with no status. | FIXED — each basis now says "engineering-typical, not sourced" (`CUTTING_DATA_STATUS`, `TURN_FINISH_STATUS`, `HOURS_STATUS`); the turning basis prints the 375 → 120 derate. Tests T ×4. | text |
| **T2** | M | `commodities/machining.ts` drilling / boring bases | The drilling op printed only "13 holes … 6.0 min": an inferred tapping (manifold 4 × M6, from the tapping-drill size, 0.15 min each) was charged but not stated, and per-hole times were not shown; the boring op called spot-faced lands "finish-bored". | FIXED — each row with its operation and minutes, the feeds and status; lands stated as spot-faced. The rows add to the op time (test). | text |
| **T3** | L | `machining-time.ts` `fixtureCostGBP` | A hydraulic tombstone fixture printed "(dedicated above 10,000 parts over 5 years)" — not why it was chosen. | FIXED — "the volume cell's dedicated fixture". | text |
| **M4** | M | `commodities/machining.ts` masked load; `feature-machining.ts`; `routing-optimiser.ts` `labourOf` | On the twin-pallet cell the operator is charged 0.5 × the machine time (one operator tends two machines) **and** the load / unload at a whole operator — but the load happens during that same machine time. Part1: 0.5 × 41.9 min = 21 min of operator a part already covers the 2.4 min load; charging both implies 1.11 operators on two machines. A step charged twice under the stated crew. | PROPOSED (reverses a pilot-rule-pack decision of the same week; pins in `pilot-rule-pack`, `machining-review`, `forging-review`). Code: in `buildOperationPlan` masked branch `cycleTimeHr: hr4(Math.max(0, chosen.setups * cut.handlingMin - CUTTING_MANNING * cuttingMinutesOf(ops)))` with the basis "covered by the operator's half of the N min cut" when 0; same in `computeFeatureMachining` (`labourTimeHr: Math.max(0, fixturings × handlingMin − manning × millMinutes) / 60`); and in `optimiseMachiningRouting` `labourOf(cut, masked ? Math.max(0, setups × handlingHrEach − cut × CUTTING_MANNING) : setups × handlingHrEach)`. | Part1 −£1.50 (−3.0 %), manifold −£0.75, PRCR002 −£0.73, knuckle / yoke −£0.37 |
| **M5** | M | `feature-machining.ts` (feature path) | Forgings and castings machined on the feature path have no deburr / gauge-check step; the from-solid and cast + machine routes charge one (PRCR002 2.46 min, £1.10). A machined forging is deburred and gauged. | PROPOSED (moves the forging / casting auditors' parts; needs a machined-face count): append a bench op `Deburr and gauge check (bench)`, `labourId: 'lab-uk-semiskilled'`, `labourTimeHr: deburrInspectMinutes(machinedFaceIds) / 60`, `benchOperation: true`, where machinedFaceIds = the included rows' `faceIds` count. | knuckle +£0.62 (34 machined faces), hub flange +£0.56 |
| **L7** | L | `commodities/machining.ts` deburr on a near-net cut | Deburr = 0.004 min × ALL B-rep faces (PRCR002 364) — as-cast edges are fettled, not deburred; "B-rep faces of edges" overstates it on a near-net part. | PROPOSED: for `cut.kind === 'near-net'` count the faces of the machined rows (`featureTable` face + hole `faceIds`) and say so. | PRCR002 −£0.67 (56 machined faces v 364) |
| **L8** | L | `to-cost-params.ts` `secondaryMachining` / `nearNetTurnedPlan` | Hub flange: the coaxial Ø60 × 50 through bore is finish-bored on the drill centre; a production engineer bores it in the lathe chucking (op 10). Feature rows carry no axis, so coaxiality cannot be read reliably today. | PROPOSED — kernel to tag rows coaxial with `turning.axis`; then put coaxial bores in `latheMin`. | ≈ £0.01 (rate difference); a sequence fault, not money |
| **L5** | L | `modules/machining.ts` | Reject uplift: rejected parts' metal is not credited at scrap (credit = gross − net × uplift). | NOTED — the same convention as the other modules; £0.01 on Part1. | — |
| **L6** | L | `commodities/machining.ts` turned plan | The shaft's third fixturing (on the VF-2) has its handling charged at the lathe's rate in one "Load / clamp / unload — 3 fixturing(s)" op. | NOTED — £0.003. | — |
| X1 | — | `modules/forging.ts:257` (forging auditor) | The consumables line reads "machining tool wear **and cell consumables**" — the figure is tool wear only (`secondaryMachiningCell.toolWearPerPart`). | PROPOSED to the forging auditor: label `'machining tool wear'`. | text |
| X2 | — | forging / casting modules (their auditors) | Secondary machining ops get no reject uplift (the from-solid route uplifts 2 %). | For their auditors. | — |

**Counts:** findings 17 — H 2 (H1 proposed, M1 fixed), M 6 (M3, T1, T2 fixed; M4, M5 proposed; X1 text), L 9.
Fixed 8 (M1, L1, M3, L3, L4, T1, T2, T3), proposed 6 (H1, M4, M5, L7, L8, X1), noted 3.

**Real parts that move (my fixes alone):** Part1 £50.81 → £49.79; MACH_Hydraulic_Manifold £22.52 → £22.19;
MACH_Stepped_Shaft £9.3507 → £9.3532; PRCR002 +£0.22; FORGE_Hub_Flange −£0.02; steering_knuckle_RH +£0.004;
FORGE_Control_Arm_Yoke +£0.004. Every other part's machining is unchanged (Casting_Braket and the AL extrusions moved in
the re-dump only by other auditors' edits). `tests/real-parts-baseline.test.ts` and the commodity-rules-prompt snapshot
will move for these parts (bases now carry status text); not re-recorded here.

## 6b. Existing tests whose pins my fixes move (not edited — not my files; exact new values)

| Test | Pin | New value | Finding |
|---|---|---|---|
| `tests/cost-input-rules-machining.test.ts:136` and `:250` | servo horn `utilisation` / `materialUtilization` `0.082` | `0.0817` (4 dp; stock 0.037 kg unchanged) | L1 |
| `tests/cost-input-rules-machining.test.ts:164` | basis `toContain('rough 13 cm³ ÷ 120 cm³/min')` | `toContain('= 12 cm³ ÷ 120 cm³/min')` (the basis now reads "rough 13 cm³ stock − part − 0 cm³ in the holes …") | M1 |
| `tests/cost-input-rules-machining.test.ts:172` | knuckle-as-machining `roughMin` `44.1` | `43.8` (10.5 cm³ of steel in its holes at 35 cm³/min) | M1 |
| `tests/stub-axle-live.test.ts:101` | spindle turning op `5.19` min | `3.99` min, and a new op `Load / clamp / unload — lathe fixture, 1 fixturing` of 1.2 min at crew 1 on `mach-lathe-cnc` | M3 |
| `tests/route-compare-review.test.ts:120`, `tests/cad-phase2.test.ts:132` | knuckle reference row £22.7563 / £23.03 | moved in the re-run mostly by the forging auditor's edits (descale); this audit's share is +£0.004 (L4) | L4 |
| `tests/real-parts-baseline.test.ts`, commodity-rules-prompt snapshots | — | Part1, manifold, shaft, PRCR002, hub flange, knuckle, yoke (§6 figures) and every machining / cast + machine basis text | all |

Failures seen in the same run that are NOT from these files (other auditors' concurrent edits): `cast-machine.test.ts:135`
(tooling 14,500 v 9,500), `casting-review.test.ts:116 / :173` (blast £0.25, yield 0.525), `stub-axle-live.test.ts:66` (yield 0.625).

## 7. Not checked, and why

- The rate book's machine and labour rates (owned by the rate refresh): HMC-400 £10.87/h and VF-2 £9.05/h are machine-only
  figures from `rate-library.ts`; EN8 bar at £0.98/kg and 6082 scrap at £0.54/kg look low, flagged for the rate owner.
  `basis-check.py` flags the HMC note "US$245,000 / 1.3344 = £183,600" — it is right (183,603 rounded); a false positive,
  as is the shaft's "190 + 5 + 3 = 198, printed 315" (315 is the cm³ that follows).
- `core.ts` conventions: labour is not divided by OEE (the operator during machine losses is in the 0.92 efficiency only).
- The routing optimiser's alternatives are machine + operator at the skilled rate; the deburr's semi-skilled grade is not
  in the ranking (same for every candidate, so it cannot change the order).
- The manifold's leak test and wash, and ground bearing seats on a spindle, are not modelled (stated in the turning basis).
- The AI operation ceiling in the `machining` case of `to-cost-params.ts` (`physicalRemovalCeilingMin`) — not reached
  by rule-built (`measured`) operations; the real parts never take it.
- Screen parity was not re-run live (no browser in this audit); the screen calls the same `secondaryMachiningCell` and
  rule plan, and `tests/cad-workspace.test.ts` is the guard.
