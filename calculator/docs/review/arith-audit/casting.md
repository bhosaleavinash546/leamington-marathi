# Arithmetic audit — casting and cast + machine (30 Oct 2026)

Group `casting`. Brief: `BRIEF.md`. Bar: every figure is measured, from the rate book, answered, a stated assumption,
or arithmetic on those, and the arithmetic printed is the arithmetic done.

## 1. Scope

**Files owned (edited):** `src/engine/cost-input-rules/commodities/casting.ts`, `…/commodities/cast-and-machine.ts`,
`src/engine/modules/casting.ts`, `src/engine/modules/casting-advisor.ts` (comments only), `src/engine/casting-tooling.ts`
(one basis string). Not edited: `modules/cast-and-machine.ts`, `casting-melt.ts`, the casting cases of `to-cost-params.ts`
(read and traced; nothing wrong enough to change). Read and traced, not edited (machining auditor's):
`machining-time.ts`, `cost-input-rules/commodities/machining.ts`.

**Parts:** `Casting_Braket.stp` (steel, cast + machine — and the same part forced to commodity `casting`, as cast),
`PRCR002.stp` (ductile-iron stub axle, safety-critical, cast + machine). UK book, 50,000 a year, 5-year programme, the
baseline's answers (`scripts/real-parts-baseline.ts::ANSWERS`).

**Reproduce:**

```bash
cd calculator
npx tsx scripts/arith-audit/casting.ts --verbose        # shadow model: 110 checks, PASS / FAIL, exit 1 on FAIL
npx vitest run tests/arith-audit-casting.test.ts         # 11 tests pinning the fixes
npx tsx scripts/arith-audit/dump.ts <dir>                # the product's own dump, for the hand calculation
```

## 2. Sequence — as costed v as made

### Casting_Braket (steel, sand, cast + machine), after the fixes

| # | As costed | Machine / crew | Time a part | As made (production engineer's route) |
|---|---|---|---|---|
| — | Cores: none (0 undercut faces along the pull) | — | — | No core: the pattern draws cleanly |
| 1 | Sand Casting — Moulding (mould, pour and knock-out on the line) | `sand-cast-line`, crew 4, OEE 0.8 | 0.0083 h ÷ 0.97 = 0.00856 h (4 impressions, 30 moulds/h) | Mould → pour → cool on the conveyor → shake-out |
| 2 | Melt shop (charge, melt, treat, ladle) | furnace operator, bench | 5.97 kg poured × 1.5 h/t = 0.00895 h | Induction melt, ladle — runs beside the line |
| 3 | Fettling (gate / riser removal, grind) | foundry operative, bench | 6 min ÷ 0.97 = 0.1031 h | Cut risers, grind gates |
| 4 | Heat treatment (consumable) | £0.35/kg × 3.039 kg as cast | — | Normalise (steel) |
| 5 | Shot blast (consumable) | 3.039 kg ÷ 600 kg/h × (blast + operator) | — | Blast off scale after normalising |
| — | NDT: none (not safety-critical) | — | — | — |
| 6 | Machining setup, +Z / +X / +Y faces, drilling 10 holes, pallet change | `mach-hmc-400`, manning 0.5 | 0.0003 + 0.0661 + 0.0428 + 0.0318 + 0.078 + 0.0028 h | Twin-pallet HMC, 4th-axis tombstone |
| 7 | Load / unload (masked by the cut), deburr and gauge check | bench | 0.01 h, 0.032 h | Bench deburr, gauge |

Verdict: complete and charged once. Two defects fixed: the melt shop was listed **after** fettling (now before it), and
the blast was sized on the **finished** mass, though the casting is blasted before it is machined (now the as-cast mass).
Blast is a consumable only — no blast operation and no finish route (`cam-sf-route` empty), so it is not charged twice.

### PRCR002 (ductile iron, sand, safety-critical, cast + machine), after the fixes

| # | As costed | Machine / crew | Time a part | As made |
|---|---|---|---|---|
| 0 | Cores £3 × 1/0.97 (consumable) | — | — | Complex core set (32 undercut faces) |
| 1 | Sand Casting — Moulding | `sand-cast-line`, crew 4 | 1/30/2 → 0.0167 h ÷ 0.97 = 0.01722 h | Mould + core setting → pour → shake-out |
| 2 | Melt shop | furnace operator | 14.98 kg poured × 1.5 h/t = 0.02248 h | Induction melt, Mg treatment, inoculation (alloy in the £/kg charge) |
| 3 | Fettling | foundry operative | 0.1031 h | Fettle |
| — | Heat treatment: none — EN-GJS-500-7 supplied as-cast (pilot rule pack decision) | — | — | As-cast |
| 4 | Shot blast (consumable) | 9.084 kg ÷ 600 kg/h × (blast + operator) = £0.75 | — | Blast |
| 5 | NDT station (consumable) | MPI 75 s × (inspector £28.03 + bench £4)/h + 1-in-50 × £5 X-ray = £0.77 | — | 100 % MPI + sample radiography |
| 6 | HMC: setup, +Y / +X / +Z faces, drilling 12 holes, finish-boring 10 cored bores, pallet change | `mach-hmc-400`, 0.5 | per machining auditor | HMC |
| 7 | Turning the spindle | `mach-lathe-cnc`, 0.5 | per machining auditor | Lathe (in practice turned FIRST, to give the HMC its datum — order only, no £) |
| 8 | Load / unload, deburr and gauge | bench | | |

Verdict: complete; the same two defects as the bracket (melt order, blast mass). Note for the machining auditor: the
lathe operation is listed after the HMC operations; a spindle is usually turned first (no £ effect).

### Casting_Braket as cast (commodity `casting`)

Moulding → melt shop → fettling, then the **feature** secondary machining (`computeFeatureMachining`: one "CNC Machining
— 18 features" op, pallet change, load / unload — no setup op, no deburr). The casting weight is the finished weight
(2.512 kg), although this route drills the holes ≤ Ø20 and faces the flats that the cast + machine route adds 0.527 kg of
stock for. Finding C9 (proposed — §6).

## 3. Casting_Braket (cast + machine) worked by hand, to the penny (after the fixes)

Rates (UK book 2026-10-10): `sand-cast-line` £29.8952/h, `mach-hmc-400` £10.8677/h, `blast-machine` £25.07/h,
foundry and furnace operator £24.60/h, skilled £27.95/h, semi-skilled £24.65/h, mat-gs-c25 £0.142/kg (7,850 kg/m³),
electricity £0.182/kWh. Shop: reject 3 %, OEE 0.80, labour efficiency 0.92, overhead 12 %, margin 8 %.

**Mass.** Finished 320.015 cm³ × 0.00785 = **2.5121 kg**. Stock: holes ≤ Ø20 drilled from solid
π/4·(4²·6.5 + 4.92²·14.5 + 13²·8 + 2·13²·19 + 13²·41 + 3·14²·1 + 20²·1) = 12,681 mm³ = 12.68 cm³; machined faces
18,166 mm² × 3 mm = 54.50 cm³; turned axis 30.0 cm² = 4.8 % of the surface < 8 % → 0. 67.18 cm³ × 0.00785 = 0.5274 kg →
as cast **3.039 kg**.

**Melt.** Yield 0.45–0.60 midpoint **0.525**. Poured = 3.039 ÷ 0.97 ÷ 0.525 = **5.9676 kg**. Lost = (5.9676 − 3.039) × 3 %
= 0.08786 kg. Metal = (3.039 + 0.08786) × £0.142 = **£0.44401** (no scrap credit: the loss is gone).
Melt energy 5.9676 × 0.70 = 4.17732 kWh × £0.182 = **£0.76027**. Green sand 5.9676 × £0.01 = **£0.05968**.
Heat treatment £0.35 × 3.039 = **£1.06365**. Blast 3.039 ÷ 600 × (25.07 + 24.60) = £0.2516 → **£0.25**.
Tool wear (0.0661 + 0.0428 + 0.0318 + 0.078) h × 60 = 13.12 min × £0.12 = **£1.5746**.
Material bucket = 0.44401 + 0.76027 + 0.05968 + 1.06365 + 0.25 + 1.5746 = **£4.15221** (product £4.15221).

**Operations** (machine £ = h × rate ÷ OEE; labour £ = h × crew × rate ÷ efficiency):

| Operation | h | Process £ | Labour £ |
|---|---|---|---|
| Moulding: 1 ÷ 30 ÷ 4 = 0.00833 → 0.0083 (4 dp) ÷ 0.97 | 0.008557 | 0.008557 × 29.8952 ÷ 0.8 = 0.31976 | × 4 × 24.60 ÷ 0.92 = 0.91519 |
| Melt shop 5.9676 ÷ 1000 × 1.5 | 0.008951 | — | × 24.60 ÷ 0.92 = 0.23935 |
| Fettling 6 ÷ 60 ÷ 0.97 | 0.103093 | — | 2.75661 |
| Machining setup 0.75 ÷ 2,500 (OEE 1, eff. 1) | 0.0003 | 0.00326 | 0.00838 |
| +Z face | 0.0661 | 0.89794 | × 0.5 × 27.95 ÷ 0.92 = 1.00407 |
| +X face | 0.0428 | 0.58142 | 0.65014 |
| +Y face | 0.0318 | 0.43199 | 0.48305 |
| Drilling 10 holes | 0.078 | 1.05960 | 1.18484 |
| Pallet change | 0.0028 | 0.03804 | 0.04253 |
| Load / unload (bench) | 0.01 | — | 0.30380 |
| Deburr and gauge (bench, semi-skilled) | 0.032 | — | 0.85739 |
| **Total** | | **£3.33201** | **£8.44535** |

Product: process £3.33201, labour £8.44537 (rounding of the printed h).

**Tooling.** Pattern: plate 104.5 cm² × 4 impressions = 418 cm²; H = (12 + 3.4 × 418^0.72) × 0.30 = 82.28 h; design
(12 + 8.23) h × £58.42 = £1,182; aluminium plate 418 × (8.18 + 10) × 2 × 1.25 × 0.00785 × 0.35 = 52.19 kg × £7.50 = £391;
machining 82.28 h × £52.37 = £4,309; try-out 8 h × £85.61 = £685; subtotal £6,567 + 22 % £1,445 = **£8,012**. Life 8,000
moulds × 4 = 32,000 castings. Castings poured 250,000 ÷ 0.97 = 257,732 → ⌈8.05⌉ = **9 sets = £72,108**. + fixture £12,000 +
programming 6.25 h × £33.27 = £208 → £84,316 ÷ 250,000 = **£0.33726**.

**Stack.** Factory base 4.15221 + 3.33201 + 8.44537 + 0.33726 = 16.26686. Overhead 12 % = **1.95202**. + packaging 0.15 +
logistics 0.27 = 18.63888. Margin 8 % = **1.49111**. **Total £20.12999 → £20.13** (product £20.1300).

## 4. Shadow model (`scripts/arith-audit/casting.ts`)

Recomputes from the recorded geometry, the rate book and the answers — without calling the casting module, the casting /
cast + machine rules or the casting tooling estimator — the finished and as-cast mass, yield, impressions and line time,
pour / melt loss / utilisation / metal / melt energy, cores, green sand, heat treatment, blast, NDT, the moulding, fettling and
melt-shop £, every machining op's £ from its costed time, setup per part, tool wear, the pattern build-up line by line,
pattern life and sets, tooling per part, the eight buckets and the total. Tolerance ½ p, or 0.5 % on an input.

| Case | Checks | Before the fixes | After |
|---|---|---|---|
| Casting_Braket, cast + machine | 38 | 31 PASS, 7 FAIL (yield, blast, order, pattern sets, tooling ×2, total) | 38 PASS |
| Casting_Braket, as cast (`casting`) | 31 | 25 PASS, 6 FAIL (yield, order, sets, tooling ×2, total) | 31 PASS |
| PRCR002, cast + machine | 39 at the audit dump (41 now: the machining auditor added a lathe load / clamp op) | 30 PASS, 9 FAIL (yield, blast, order, sets, tooling ×2, overhead, total; one shadow-side rounding slip, corrected) | 41 PASS |
| **All** | **108 → 110** | **86 PASS, 22 FAIL** | **110 PASS, 0 FAIL** |

`basis-check.py` on a fresh dump of both parts: 15 flags, all false positives — the rate book's HMC capex note
("$245,000 / 1.3344 = 183,603, printed £183,600" is a stated rounding) and the NDT basis, whose two printed equations hold
(75 s × (28.03 + 4.00) £/h = £0.667; 1/50 × £5.00 = £0.100) but which the parser reads across the "×".

## 5. Constant register (files owned)

Class: SOURCED / LIBRARY / MEASURED / LABELLED (visible to the reader as an estimate) / UNLABELLED. "Now" = after this audit.
£ effect is on the part named, UK, 50k / yr.

| file:line | Value | Meaning | Class (now) | £ effect on a real part |
|---|---|---|---|---|
| casting-melt.ts:38–46 | loss 0.02–0.04, kWh/kg 0.25–0.90 | Melt loss on remelted returns; melt + hold energy | **LABELLED** (was in code comments only; now in the energy line's basis on the trace and both reports) | Braket melt energy £0.76 (3.8 %); PRCR002 £1.68 |
| casting-melt.ts:90 | 1.5 h/t | Melt-shop labour per tonne poured | **LABELLED** (op name) | Braket £0.24, PRCR002 £0.60 |
| casting-melt.ts:92 | £0.01/kg | Green-sand additions per kg poured | **LABELLED** (item label) | £0.06 / £0.15 |
| casting-advisor.ts:103–111 | yield bands by alloy | Sand / gravity method yield | **LABELLED** ("engineering-typical band, not sourced") | Drives pour: all melt lines |
| casting-advisor.ts:37–93 | process yield bands, ranges | Reference table | LABELLED (file header "engineering-typical") | HPDC / investment only |
| casting-advisor.ts:451–455 | T5 0.55, T6 1.10, stress-relieve 0.35 £/kg | Heat treatment | **LABELLED** (basis now says "engineering-typical, not sourced" and that steel's normalise is charged at the stress-relieve / normalise rate) | Braket £1.06 (5.3 %) |
| casting-advisor.ts:457–460 | X-ray £5, CT £32 | NDT per part | **LABELLED** | PRCR002 £0.10 (sample X-ray) |
| casting-advisor.ts:468–476 | MPI 75 s, bench £4/h, 1-in-50; RTR 30 s, £20/h | NDT station | LABELLED ("engineering-typical … CostVision heuristic") | PRCR002 £0.77 |
| casting-advisor.ts:514 | 2 / 6 / 15 min | Fettling minutes | LABELLED ("engineering-typical minutes") | £2.76 on both parts (14 % of the bracket) |
| casting.ts:195 | 600 kg/h | Blast throughput | **LABELLED** (basis: low end of 0.5–2 t/h, not sourced) | £0.25 / £0.75 |
| casting.ts:197 | £0.10 | Blast minimum | LABELLED ("CostVision engineering heuristic") | binds on small parts only |
| casting.ts:235 | 30 moulds/h, 500 × 400 flask, 50 mm margin | Sand line | LABELLED (code + basis prints each) — the basis does not say "engineering-typical" in words; it prints every figure | Moulding £1.23 / £2.48 |
| casting.ts:~380–405 | £0 / 0.75 / 1.5 / 3 / 6 | Core £ by undercut band | **LABELLED** ("default band, engineering-typical, not sourced") | PRCR002 £3.09 (7.3 %) |
| casting.ts:~525 | sand 8,000 moulds; HPDC 150k; gravity 50k; investment 5k | Tool life | **LABELLED** — sand basis now says it is the wood-pattern band while the pattern priced is aluminium (C6) | Braket £0.29 of pattern a part, PRCR002 £0.75 (1.7 %) |
| casting.ts:~420 | 45 s + 3 s/mm | HPDC cycle | **LABELLED** (heuristic) | none on these parts |
| casting.ts:~545 | ≤ 1 kg → 2 cavities | HPDC cavities | LABELLED by its basis arithmetic only | none on these parts |
| casting.ts:~625 | 0.8 t/cm², × 1.25, × 1.2 | HPDC locking force | LABELLED (basis prints each; the × 1.2 is applied in `pickHPDCMachineId`) | none on these parts |
| casting.ts:~812 | crew 4 | Sand line crew | LABELLED ("engineering-typical, not sourced") | Moulding labour £0.92 / £1.84 |
| casting.ts:~845 | 45 s | Leak test | LABELLED | none |
| casting.ts:~735 | £0.90 | Impregnation | **LABELLED** | none |
| cast-and-machine.ts:113 | Ø20 | Drilled-from-solid limit | LABELLED (basis) | stock 12.7 / 38.9 cm³ |
| machining-time.ts:308 | 3 mm (sand ferrous) | Machining stock a side (ISO 8062-3 RMA typical, stated as an assumption) | LABELLED — machining auditor's file | +0.53 kg / +1.72 kg as cast |
| casting-tooling.ts:99–110 | 0.30 × cavity law, 0.35 plate factor, 8 h try-out, £1,500–50,000 band | Sand pattern | LABELLED — the 0.35 basis text was wrong (C8) | pattern £8,012 / £11,025 |
| casting-tooling.ts:59–96, 119–139 | H13 × 1.15, cooling 10 %, gravity 0.2 fitting, 16 h try-out, £1,200 core box, bands | HPDC / gravity / investment tools | UNLABELLED in the printed basis (each line prints its own figure in the tool detail) | none on these parts |
| to-cost-params.ts (SHOP_DEFAULTS) | reject 3 %, OEE 0.8, eff. 0.92, oh 12 %, margin 8 % | Shop | LABELLED in `assumed` — not mine | all |

## 6. Findings register

| ID | Sev | file:line | Evidence | Status | £ before → after |
|---|---|---|---|---|---|
| C1 | L | casting.ts `bandMid` | Basis prints "yield band 0.45–0.6, midpoint"; the costing used 0.53 (rounded to 2 dp), 0.95 % off the midpoint 0.525 (ductile 0.63 v 0.625). | **FIXED** — 3 dp; `bandMid` exported; test A1 | Braket +£0.012, PRCR002 +£0.024 (inside the totals below) |
| C2 | H | casting.ts shot-blast rule (used by cast + machine) | Cast + machine blasted the FINISHED mass (2.51 / 7.36 kg); the casting is blasted before machining at its as-cast mass (3.04 / 9.08 kg), the mass the same route charges heat treatment on. | **FIXED** — `shotBlastOutcome` + cast + machine overrides the rule with `asCastWeightKg`; test A2 | Braket blast £0.21 → £0.25; PRCR002 £0.61 → £0.75 |
| C3 | L | modules/casting.ts sets | Pattern / die / mould sets = ⌈good parts ÷ life⌉, though a pattern wears per mould rammed and 3 % of castings are rejected: 257,732 poured ÷ 32,000 = 8.05 → 9 sets, not 8. | **FIXED** — sets on castings poured, label states it; test A3 | Braket tooling £0.3052 → £0.3373; PRCR002 £0.7651 → £0.8092 |
| C4 | L | modules/casting.ts op order | "Melt shop" was listed after "Fettling" (melt precedes pour, fettle follows knock-out). | **FIXED** — before fettling, moulding stays operation 0; test A4 | none |
| C5 | M | casting-melt.ts constants via modules/casting.ts | Melt kWh/kg, melt loss 3 %, melt labour 1.5 h/t and green sand £0.01/kg moved ~£1.1 on the bracket (5 %) and were stated only in code comments. The trace printed "4.1379 kWh × £0.182 — melt energy on every kg poured", with no kg poured and no kWh/kg. | **FIXED** — the energy basis prints poured kg = part ÷ (1 − reject) ÷ yield × kWh/kg, the loss and its kg, and the alloy band "engineering-typical — replace with plant data"; melt-shop op name and green-sand label print kg × constant; test A4 | none |
| C6 | M | casting.ts die-life rule | Sand pattern life 8,000 moulds is the wood-pattern band (casting 360 review M3, open), while `estimateSandPatternCost` prices an **aluminium** match plate, which typically lasts much longer. Unlabelled. PRCR002 buys 17 plates (£187k) over 250k parts. | **LABELLED** (basis says not sourced, wood band, may overstate tooling). Value **PROPOSED** for change once a pattern-life band per material is sourced (my quick search found no primary figure; not invented) | none now; with ~1 set instead of 17 PRCR002 tooling would fall ~£0.76 (1.8 %) |
| C7 | M | casting.ts heat-treat rule; casting-advisor.ts:451 | Basis said "normalised … £0.35/kg (advisor rate, UK)": £0.35 is the advisor's `stress-relieve` key and has no source. | **LABELLED** — "the advisor's stress-relieve / normalise rate … engineering-typical, not sourced"; T6 the same; test A5 | none |
| C8 | L | casting-tooling.ts:105; casting.ts tooling basis | (a) Plate material basis "one-sided plate, half the block" while the factor is 0.35 (≈ aluminium/steel density 0.34, not "half"). (b) The sand pattern basis printed "complex (32 undercut face(s) ≈ 6 slide(s), 2 core box(es))" — a sand pattern has no slides and the sand model takes no complexity. (c) It said "+ steel" for an aluminium plate. | **FIXED** (text) — test A5 | none |
| C9 | M | rules/commodities/casting.ts `casting.netWeightKg` + to-cost-params `casting` | As cast (commodity `casting`), the route charges secondary machining of the holes ≤ Ø20 and the faces (headless always; screen when the feature lines are in cost) but buys no metal for them: the bracket is 2.512 kg, cast + machine buys 3.039 kg for the same machining. Holes ≤ Ø20 are drilled from solid in a sand casting (the module comment "holes are cored-in" is not true for them). | **PROPOSED** — see below. Not fixed: the same field feeds the screen, which charges the feature lines only when the engineer keeps them in cost, so the weight rule needs the same condition | ≈ +£0.45 on the as-cast bracket (2.5 %) |
| C10 | L | modules/casting.ts / cast-and-machine.ts | Fettling and line time carry the 3 % rejects (÷ 0.97); heat treatment, blast, NDT and impregnation do not, though rejects found at NDT or later were heat-treated, blasted and inspected. Where rejects are found is not stated. | **PROPOSED** (judgement; ≤ £0.05 a part) | — |
| C11 | L | casting.ts sand-line rule | Line time rounded to 4 dp (1/120 h = 0.008333 → 0.0083, −0.4 %): moulding £1.2350 v £1.2399 unrounded — under the ½ p / 0.5 % bar. | Not changed | −£0.005 |
| C12 | L | casting.ts manning text | Crew text named a "core setter" on a coreless part. | **FIXED** (text: "core setter / mould closer") | none |
| C13 | L | casting-advisor.ts `estimateCastingSecondaryAdders` | Dead code (no caller in src / server) with a flat £0.35 blast and £5 X-ray that the rules no longer charge. | PROPOSED: delete, or reuse the rules' figures | none |
| C14 | L | `src/ui/main.ts:4610, 5419` (not mine) | Yield field tooltip "Sand: 0.70–0.85 … Investment: 0.85–0.95" contradicts the rules' bands (steel sand 0.45–0.60, investment 0.35–0.55). | PROPOSED: tooltip text = `CASTING_PROCESS_REFERENCE` / `SAND_GRAVITY_YIELD_BY_ALLOY` | none |
| M1 | L | machining (for that auditor) | Volume cell: operator charged at manning 0.5 for the whole cut AND 0.6–1.2 min load / unload at manning 1 "masked by the cut" — check whether the masked loading is inside the 0.5. Lathe op listed after the HMC ops. The as-cast route's feature machining has no setup op and no deburr while cast + machine has both, on the same holes and faces. | For the machining auditor | — |

**C9 proposed code** (`cost-input-rules/commodities/casting.ts`, rule `casting.netWeightKg`): when a sand / gravity /
investment casting is costed WITH its feature machining, weigh it as cast:

```ts
evaluate: (ctx) => {
  const mat = materialFacts(ctx);
  if (mat.decision) return ask(mat.decision);
  // The casting route machines the holes ≤ Ø20 from solid and faces the flats (secondary machining): the metal is poured.
  const sub = castingSubtypeFor(ctx);
  const rows = (ctx.geo.featureTable ?? []) as FeatureRow[];
  if (!rows.length || sub === null || sub === 'hpdc') return decided('casting.netWeightKg', mat.massKg!, 'geometry', mat.basis, 1);
  const density = mat.massKg! / Math.max(1e-9, ctx.geo.volume?.cm3 ?? 0);
  const stock = drilledStockCm3(ctx).cm3 + nearNetStockCm3(rows, castMachiningStockMm(sub, mat.family ?? null), DRILLED_FROM_SOLID_MM);
  return decided('casting.netWeightKg', Math.round((mat.massKg! + stock * density) * 1000) / 1000, 'geometry',
    `${mat.basis} + ${stock.toFixed(1)} cm³ the secondary machining removes (as cast + machine)`, 0.7);
},
```

…with the screen's feature-lines toggle deciding whether the rule's value or the finished mass is used (main.ts owner), or
— simpler — route any casting with a feature table to `cast_and_machine`.

### Real parts that move (my changes only; UK, 50k / yr, 5 years)

| Part | Before | After | Δ | Made of |
|---|---|---|---|---|
| Casting_Braket (cast + machine) | £20.0305 | **£20.1300** | +£0.0995 (+0.50 %) | blast +£0.04, pattern sets 8 → 9 +£0.032, yield 0.525 +£0.010 (melt energy, sand, melt labour), × overhead and margin |
| Casting_Braket (as cast, `casting`) | £17.8980 | **£17.9470** | +£0.0490 | sets 8 → 9, yield |
| PRCR002 (cast + machine) | £42.3137 | **£42.5611** | +£0.2474 (+0.58 %) | blast +£0.14, sets 16 → 17 +£0.044, yield 0.625 +£0.020 |

The live tree also carries the machining auditor's concurrent changes: a fresh dump gives PRCR002 £42.7834 (a new lathe
load / clamp operation, tool wear); the bracket is unaffected by them (£20.1300).

### Tests that pin the old behaviour (not my files — for the lead to update)

- `tests/real-parts-baseline.test.ts`: Casting_Braket and PRCR002 move (above); re-record.
- `tests/commodity-rules-prompt.test.ts`: casting basis texts changed; re-record.
- `tests/casting-review.test.ts:116` — `expect(c.shotBlastCostPerPart).toBe(0.21)` → `0.25` (the bracket blasted as cast, 3.039 kg).
- `tests/casting-review.test.ts:171–173` — "yields 0.53" → `0.525`.
- `tests/cast-machine.test.ts:129` — `Math.ceil(SAND_INPUTS.amortizationVolume / SAND_INPUTS.sand!.patternLife)` →
  `Math.ceil(SAND_INPUTS.amortizationVolume / (1 - SAND_INPUTS.rejectRate) / SAND_INPUTS.sand!.patternLife - 1e-9)`.
- `tests/phase2-commodities.test.ts:303` — the same: `Math.ceil(sandInputs.amortizationVolume / (1 - sandInputs.rejectRate) / sandInputs.sand!.patternLife - 1e-9)`
  (10,000 good at 3 % = 10,310 poured → 2 sets).
- `tests/casting-360-review.test.ts:295` — regex → `/Pattern equipment: \d+ set\(s\) \(life 8,000 castings each; [\d,]+ poured incl\. \d+% rejects\) \| Machining fixtures \| CNC programming/`.

## 7. Not checked, and why

- The machining half's operation **times** (face / hole / bore / turning minutes, routing, fixtures, programming hours,
  deburr minutes) — the machining auditor's (`machining-time.ts`, `rules/machining.ts`); here they are inputs and only
  their £, the setup per part and the tool-wear multiplication are recomputed.
- The **values** of the rate book (metal charge £/kg, machine and labour rates) — they move only through rate-refresh
  configs; the shadow reads them from the book.
- The toolroom primitives (`cavityCncHours`, `toolmaking.ts` rates and 22 % overhead) are re-applied in the shadow from their
  formulas, not re-derived; their constants belong to the tooling owner.
- HPDC, gravity and investment paths: no real part takes them. Their arithmetic shares the module code checked here (sets
  fix applied to all three); their constants are registered above.
- Country books other than the UK; surface finishing (no finish answered on either part).
- The screen path: the rules feed the form by `fieldId`, unchanged; `tests/cad-workspace.test.ts` (screen = headless) passed
  after the changes.
