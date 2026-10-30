# Arithmetic audit — spec-driven commodities (30 Oct 2026)

Group `spec-commodities`: wiring harness, painting, surface finishing, BIW assembly, battery pack, e-motor (incl.
laminations). These have no CAD route — each is costed from its form — so the audit costs every form's **default
inputs** and every **demo preset** the screen offers through the screen's own path (`compute<X>Drivers` →
`computeUniversalStack`), plus surface finishing on **real parts** (measured surface, costed mass) through the CAD
finish question's path (`finishLoading` → `finishSpec` → `computeSurfaceFinishing`).

## 1. Scope

| | |
|---|---|
| Files audited (owned) | `src/engine/modules/{wiring-harness,painting,surface-finishing,biw-assembly,battery-pack,e-motor,ev-advisor,lamination-advisor}.ts`, `src/engine/ev-data.ts`, `src/engine/surface-finish-routes.ts` |
| Read, not owned | `src/ui/main.ts` (forms, collectors, demo presets), `src/ui/ev-forms.ts`, `src/engine/surface-treatment-{rate,data}.ts`, `src/engine/core.ts`, `src/export/{pdf,excel}.ts` |
| Cases | harness: form default + demos 1–3; painting: form default + demos 1–3 + masked route + zinc 12 µm + legacy line rate; BIW: form default + demos 1–3; battery: form default + LFP 4680 cell-to-pack; e-motor: form default + induction / round wire + EESM; finishing: 7 CAD-path cases on Seat_Locking_Bracket, BIW_Reinf_Channel, Casting_Braket, FORGE_Hub_Flange + 3 hand-form multi-machine routes |
| Shadow | `scripts/arith-audit/spec-commodities.ts` — recomputes from the rate book and the data tables only; never calls the modules or `computeSurfaceTreatment` |
| Test | `tests/arith-audit-spec-commodities.test.ts` (18 tests, each failed before its fix) |

Reproduce:

```bash
cd calculator
npx tsx scripts/arith-audit/spec-commodities.ts            # 1033 PASS, 0 FAIL, 13 OPEN (proposed, other owners)
npx tsx scripts/arith-audit/spec-commodities.ts --verbose  # every check
npx vitest run tests/arith-audit-spec-commodities.test.ts tests/ev-propulsion.test.ts tests/lamination-audit.test.ts \
  tests/surface-finishing.test.ts tests/surface-treatment.test.ts tests/phase3-commodities.test.ts
```

Screen shop tail used for form defaults: packaging £0.15, logistics £0.25, overhead 12 %, margin 8 % (index.html;
`regionalShopDefaults('UK')`). Demos use the tail they type. Labour selects the form leaves alone fall on the first
role (`lab-uk-skilled`); the harness assembly select is set to semi-skilled.

## 2. Sequence — as costed v as made

| Commodity | As costed (order, machine, time, crew) | As a production engineer writes it | Verdict |
|---|---|---|---|
| Wiring harness | material (wire by gauge, connectors, splices, conduit, tape) × 1/(1−reject) → **Harness Assembly** bench, typed 0.45 h ×1/(1−r), crew 1 → **Electrical Test** harness-test-sys 0.05 h, crew 1 | cut-strip-crimp (automatic) → sub-assembly / splice → board lay-up, tape, clip → electrical test → visual / pack | Order right. Cut-strip-crimp has no machine of its own: it is inside the typed bench time (A3, stated). The per-terminal crimp time on the form never moved cost (A2). |
| Painting (standard route) | paint film per coat + bath chemistry/effluent → **Paint Line** paint-line-std, 1/(6 × 20) h × 1.03, crew 4 → (masked route) **Masking / de-masking** bench | load / mask → degrease → rinse → phosphate → rinse → DI → dry-off → e-coat dip → cure → basecoat → flash → cure → unload / de-mask | One line op carries every stage at the line's rate — right (the rate is the whole line). The route lists no e-coat stage while the coat list has an e-coat (P6). |
| Surface finishing (CAD) | stages grouped by machine; the coating / plating line one takt a part, a batch cell in front of it one load for its dwell (after F1); masking bench | e.g. cast_ecoat: blast → impregnate → (pre-treat → e-coat → cure on the line) | Before F1 the line's takt was split across machines by dwell; F2 put a galvaniser's pickle on a paint line. Masking is inserted after the coating stage (F3, proposed). |
| BIW assembly | sub-parts bought in (handling 3 %) + joining consumables per joint → typed stations (framing robot 60 s, crew 1) | load fixture → geo / tack weld → re-spot → adhesive / sealer → hem → inspect | Station times are typed; joint counts move only consumables. Demos keep the form's 120 welds while their station names say 28 (B2, proposed). |
| Battery pack | cell OCV/IR 192 × 2 s → stacking 192 × 6 s → laser weld 384 × 2.5 s → module EOL 8 × 60 s → dispense 2.8 m² × 90 s → pack assembly 2,400 + 8 × 45 s, crew 2 → leak 300 s → EOL 1,200 s | incoming cell test → stack / compress → busbar weld → module EOL → gap filler into tray → modules in, BMS, HV box, harness, lid → leak → EOL | Order right; cells bought in ONCE (`boughtIn`, not in `directCost`) — checked. |
| E-motor | lamination stamping 534 / 300 spm → hairpin forming 90 s → twist + weld 144 × 0.6 + 30 s → impregnation 120 s → rotor 60 s → balance 90 s → final assembly 360 s × 2 → EOL 300 s | stamp + interlock → slot liners → hairpin insert → twist / weld → terminate → impregnate / cure; rotor in parallel → balance → assemble → EOL | Order right. Housing / shaft are conversion estimates (stated). |

## 3. One case worked by hand — wiring harness, form default (UK), to the penny

| Line | Arithmetic | £ |
|---|---|---|
| Wire 0.5 mm² | 3.20 m × £0.10 | 0.3200 |
| Wire 1.5 mm² | 1.40 m × £0.18 | 0.2520 |
| Wire 4.0 mm² | 0.60 m × £0.40 | 0.2400 |
| Connectors 6-way | 4 × £1.20 | 4.8000 |
| Connectors 12-way | 2 × £2.80 | 5.6000 |
| Splices | 6 × £0.08 | 0.4800 |
| Conduit | 2.0 m × £0.35 | 0.7000 |
| Tape | 5.0 m × £0.12 | 0.6000 |
| Schedule | | 12.9920 |
| Reject allowance 2 % | 12.992 × (1/0.98 − 1) | 0.2651 |
| **Material** | 12.992 ÷ 0.98 | **13.2571** |
| Assembly time | 0.45 h ÷ 0.98 = 0.459184 h | |
| Assembly process | £0.678824/h (bench-assembly) × 0.459184 ÷ 0.85 OEE | 0.3667 |
| Assembly labour | £24.65/h (semi-skilled) × 1 × 0.459184 ÷ 0.90 | 12.5765 |
| Test time | 0.05 h ÷ 0.98 = 0.051020 h | |
| Test process | £11.550625/h (harness-test-sys) × 0.051020 ÷ 0.85 | 0.6933 |
| Test labour | £27.95/h (skilled — first role, the form sets none) × 1 × 0.051020 ÷ 0.90 | 1.5845 |
| **Process** | 0.3667 + 0.6933 | **1.0600** |
| **Labour** | 12.5765 + 1.5845 | **14.1610** |
| **Tooling** | ⌈10,000 ÷ 20,000⌉ = 1 board × £800 ÷ 10,000 | **0.0800** |
| Factory base | 13.2571 + 1.0600 + 14.1610 + 0.0800 | 28.5582 |
| Packaging + logistics | 0.15 + 0.25 | 0.4000 |
| **Overhead** | 12 % × 28.5582 | **3.4270** |
| Subtotal | 28.5582 + 0.40 + 3.4270 | 32.3851 |
| **Margin** | 8 % × 32.3851 | **2.5908** |
| **Total** | | **34.9760** |

The screen path gives £34.975959; the shadow £34.975959.

## 4. Shadow result per case

Every op (machine, cycle h, labour h, crew, parts/cycle, process £, labour £), tooling £, each of the 8 buckets and the
total; for battery and motor every material line by ref; for finishing the parts a load and loads an hour against the
published capacities. 1033 checks PASS, 0 FAIL (after the fixes below), 13 OPEN — the open ones are the proposed
main.ts / test fixes (P2 coat prices, F3 stage order).

| Case | Total (screen = shadow) | Checks |
|---|---|---|
| harness / form default · demo 1 · demo 2 · demo 3 | £34.9760 · £37.0125 · £76.4151 · £54.3920 | 112 PASS |
| painting / default · demo 1 · demo 2 · demo 3 · masked · zinc 12 µm · legacy | £5.2454 · £31.9734 · £5.5080 · £13.6749 · £6.0447 · £5.1666 · £6.4285 | 140 PASS, 12 OPEN (P2) |
| BIW / default · demo 1 · demo 2 · demo 3 | £61.2934 · £113.3264 · £190.2457 · £87.8479 | 132 PASS |
| battery / default · LFP 4680 CTP | £9,581.6403 · £18,204.9441 | 174 PASS |
| e-motor / default · induction RW · EESM | £692.7453 · £607.9322 · £685.9551 | 237 PASS (≤ 0.06 p rounding of 4-dp lines) |
| finishing (increment only) — Seat bracket e-coat · zinc · powder · galvanise; Reinf channel zinc flake; Casting_Braket e-coat 2 masked; Hub flange zinc; form cast_ecoat · e_coat · blast_zinc | £0.1750 · £0.4240 · £0.1917 · £0.4215 · £0.1722 · £1.4251 · £1.2404 · £7.1568 · £1.4829 · £6.8392 | 229 PASS, 1 OPEN (F3) |

## 5. Constant register (owned files)

Class: SRC sourced · LIB rate book · MEAS measured · EST labelled estimate (visible) · UNL unlabelled (before → now).

| file:line (now) | Value | Meaning | Class | £ effect |
|---|---|---|---|---|
| ev-data.ts:37-42 | NMC $102.4, LFP $64.8/kWh; LMFP, NCA | bought-in cell price | SRC (BNEF25) / EST | 79 % of the pack |
| ev-data.ts:45 | 3.2–3.7 V | cell nominal V | EST (chemistry-typical; form field) | sets kWh |
| ev-data.ts:53-58 | busbar g, weld s, stack s per format | integration and line | EST (printed on line / op now) | busbar £5.6; stacking £72 |
| ev-data.ts:64-85 | PACK_PARTS £ | BMS, contactors, HV parts, TIM, mica, adhesive | EST (now a note on every line, E5) | ~£470 |
| ev-data.ts:93-101 | kg/m², conversion £/kg | enclosure, cold plate, busbars | EST (note) | enclosure £170 |
| ev-data.ts:109-121 | ¥295/kg blank, ¥6,675/kg Tb₄O₇, 0.4 %/0.7 % Tb, +30 % | magnet £/kg | SRC (SMM26, SUN26) + EST (note) | £71.68 on 1.5 kg |
| ev-data.ts:125-147 | MOTOR_PARTS, MOTOR_STRUCTURE | bearings…, resin, cage, housing / shaft conversion, wall 6 mm, yield 0.7, features ×1.6 | EST (note / description) | housing £50.48, shaft £45.79 |
| ev-data.ts:157-175 | 17 line capex | EV machine rates | EST (library build-up) | process bucket |
| ev-data.ts:178-182 | fixtures £600k; die £350k / 50 M strokes; hairpin £250k; fixtures £200k | tooling | EST (now itemised, E4) | pack £2.00, motor £5.24 |
| e-motor.ts:73-84 | 0.96 stacking, 3 mm carrier, rotor 0.92 / 0.80, 40 mm end bells, 200 mm overhang, 300 spm | geometry / press | UNL → EST (printed in LAM / HSG / SHAFT lines and op name) | LAM £136.56 |
| e-motor.ts:211-225 | 90, 0.6 + 30, 240, 120, 60, 90, 360, 300 s; crews 0.2–2 | line times | UNL → EST (op names) | process £37.62, labour £8.72 |
| e-motor.ts:260-263 (eMotorFacts) | 2,700 / 7,850 kg/m³ literals | housing / shaft density | UNL, contradicted A380's 2,680 → LIB (E2) | −£0.46 |
| battery-pack.ts:147-160 | 2 s, 60 s, 90 s/m², 2,400 + 45 s, 300 s, 1,200 s; crews | line times | UNL → EST (op names) | process £153.27, labour £59.56 |
| battery-pack.ts:160 | 0.03 | cell handling | form field; core trace prints it | £227.6 of overhead |
| biw-assembly.ts | 0.03 | sub-part handling | UNL → EST note "engineering-typical 2–5 %, not sourced" | £1.35 on default |
| wiring-harness.ts | ceil(volume ÷ life) | whole boarding boards | stated now (tooling item) | £0.08 |
| wiring-harness.ts | 0.97 utilisation | ignored in directCost mode | no cost effect | 0 |
| painting.ts | solids, TE, £/L, DFT | form inputs | typed (P2 on the defaults) | film £0.91 |
| surface-finishing.ts:154 | 4.5 × | plating reject multiple | SRC (workbook ST-58 note) — warning only | 0 |
| surface-finishing.ts:161 | OEE 0.85, LE 0.95 | finishing line defaults | UNL → EST on the basis (F4) | all finishing ops |
| surface-treatment-data DEFAULT_SURFACE_LINE.lineManning | 2 | finishing crew | labelled "representative" in data; now printed | finishing labour |
| surface-finish-routes.ts:63 | 6 a rack, 20 racks/h | hand-form default | labelled "NOT sourced" | hand form only |
| surface-finish-routes.ts:69-85 | 83.6 m², 20 loads/h, 113.4 kg; 90.7 kg, 10 barrels/h | line capacities | SRC (pfonline / Therma-Tron-X / SUR/FIN 2003); proxy now stated for non-conveyor routes (F6) | parts a load |
| lamination-advisor.ts:38-44 | join £ fixed + per lamination / mm | stack joining | UNL → EST (basis, L2) | when a method is chosen |
| lamination-advisor.ts | 0.45 kWh/kg, £0.30/kg | anneal, re-coat | UNL → EST (basis); re-coat now in country (L1) | when chosen |
| ev-advisor.ts | ±25 %, ±10 pts, 2 ×, 0.8–3 kg, ≥ 40 % | check tolerances | UNL → printed in the benchmark text (E6) | advisory only |

## 6. Findings register

H = wrong money or a false statement · M = unverifiable / unlabelled figure moving cost ≥ 1 % · L = presentation.

| ID | Sev | Where | Evidence | Status | Before → after |
|---|---|---|---|---|---|
| F1 | H | surface-finishing.ts (op build) | The line's takt was split across machines by dwell share: adding blast + impregnation in front of the e-coat line cut the paint line to 69 % of its takt for the same parts an hour, and put a blast cell at 1.6 s a casting (a load of 6 for 4 min is 40 s). | FIXED — the line is charged one takt a part; a batch cell in front of it one load of the line's parts for its own dwell; basis says which. Test F1. | form cast_ecoat £1.5219 → £7.1568; form blast_zinc £5.8180 → £6.8392 (hand-form 6-a-rack defaults; CAD loading is far denser). Single-machine routes unchanged. |
| F2 | H | surface-finishing.ts | A galvanise route charged degrease / pickle on `paint-line-std`; the galvanising plant's rate already carries "flux and pickle tanks". | FIXED — bath pre-treatment of a hot-dip route runs in the galvanising plant. Test F2. | Seat_Locking_Bracket galvanise £0.4114 → £0.4215 |
| E5 | H | battery-pack.ts, e-motor.ts | The form banner says "part prices marked ESTIMATE in the material lines"; no line was marked. | FIXED — every line carries its provenance note (PDF prints it under §3B). | text |
| A2 | H | wiring-harness.ts schema; form "Term.Time(s)" | Schema said circuits "drive crimping labour" and offered a per-terminal crimp time; neither moves cost (assembly time is typed). | FIXED text; `harnessCrimpCheck()` added. PROPOSED main.ts prints it (below). | text |
| P1 | H | main.ts demo loader (painting) | Demos set "Line Rate" 15 / 60 / 18 parts/h, but the route stays on the stage model at 6 × 20 = 120 parts/h — the demo is costed at a rate it never states. | PROPOSED | demo 1 £31.97 → £52.82; demo 2 £5.51 → £7.76; demo 3 £13.67 → £28.97 |
| P2 | H | main.ts painting init `addCoatRow` | Coat rows name `mat-paint-ecoat` / `mat-paint-basecoat` but are priced £4.55 / £10.25 a litre; the library gives £3.68 × 1.3 = £4.784 and £8.62 × 1.25 = £10.775 (old book). | PROPOSED | form default £5.2454 → £5.3020 |
| E2 | H | e-motor.ts eMotorFacts | Housing mass at a 2,700 kg/m³ literal while priced as A380 (library 2,680); shaft at a 7,850 literal. | FIXED — the library density of the priced alloy / steel. Test E2. | motor default £693.2058 → £692.7453; induction £608.4835 → £607.9322; EESM £686.4156 → £685.9551 |
| L1 | H | lamination-advisor.ts | Insulation re-coat £0.30/kg was a bare UK £ (CLAUDE.md: never a bare UK £ in an advisor). | FIXED — `inCountry(…, 'process')`. Test L1. | UK unchanged; India × process factor |
| E4 | M | e-motor.ts, battery-pack.ts | Stacking factor 0.96 (not on the form), carrier, rotor share, end bells, shaft overhang, 300 spm, every line time and crew: unlabelled. | FIXED — printed in the line / op it moves, "ESTIMATE"; dies, hairpin tools, fixtures itemised. Test E4. | text |
| F4 | M | surface-finishing.ts | Finishing OEE 0.85 / labour efficiency 0.95 / crew 2 were literals nobody could see (data marks `oee` reference-only). | FIXED — `FINISH_LINE_DEFAULTS`, printed on the basis. Test F4. | text |
| F5 | M | surface-finishing.ts | A typed plating reject is warned "nearer an X % cost adder" but never costed, and the warning did not say so. | FIXED text ("NOT in the cost above"). | text |
| L2 | M | lamination-advisor.ts | Join £ per stack, anneal kWh/kg unlabelled; the screen printed only totals. | FIXED — `basis` on the result. PROPOSED main.ts prints it. | text |
| B2 | M | main.ts demo loader (BIW) | Demos clear the stations but keep the form's 120 spot welds; demo 3's station says "28 welds". | PROPOSED | demo 3 £87.85 → £82.43 at 28 welds |
| P6 | M | main.ts PAINT_STAGE_ROUTES / surface-treatment-data | Standard route has no e-coat stage while the coat list has an e-coat: SF-22 bath upkeep (chemistry + effluent beyond the film) is not charged; whether SF-22's $0.55/m² includes the solids is not stated in the data, so adding it could double count. | OPEN — data owner to say what SF-22 chemistry contains | ≤ £0.51 on default |
| F7 | M | main.ts `renderSurfaceFinishingSection` | The hand form offers blast_only / blast_zinc / cast_ecoat on casting and forging forms whose rules already charge shot blast (casting) — the CAD question filters them out (`finishOptionsFor`), the form does not. | PROPOSED | double blast when chosen |
| A3 | M | wiring-harness.ts (model scope) | No cut-strip-crimp machine: automated crimping capital is inside a £0.68/h bench rate. | NOTED (stated in sequence); a crimp-machine op would need a library machine | — |
| A1 / B1 / P3 | L | harness, BIW, painting | `directCost` was one opaque figure. | FIXED — `lines` itemise it and add up to the material bucket. | text |
| E1 | L | battery-pack.ts, e-motor.ts | With the form's 1 % reject the PDF §3B BOM total was 1 % short of the material bucket. | FIXED — reject allowance line. | text |
| E3 | L | battery-pack.ts | CELLS line unit rounded to 4 dp: printed line ≠ bought-in cost by up to 1 p. | FIXED — unit unrounded on the line. | text |
| E6 | L | ev-advisor.ts | Check tolerances unstated (magnet "1–2 kg" flagged OK up to 3 kg). | FIXED — tolerance in the benchmark text. | text |
| P4 | L | painting.ts | Legacy-path warning stated "halving it moves the part 55 %" as this part's own. | FIXED — "on the reference part it was measured on". | text |
| F6 | L | surface-finishing.ts, surface-finish-routes.ts | Powder and zinc flake ran as "Paint Line"; galvanise / zinc flake / bowl / blast loading cited an e-coat line's capacity without saying it is a proxy. | FIXED — names and basis say "proxy". | text |
| F3 | L | surface-finish-routes.ts `finishSpec` | Masking is inserted before the LAST stage — after the e-coat / powder / plating, before cure. No £ effect (masking is a bench op, dwell 0). | PROPOSED (pinned by tests/cad-phase2.test.ts:79) | — |
| F8 | L | surface-treatment-rate.ts basis | "+ masking £x … = £y/part" prices masking at the regional semi-skilled rate; the cost charges it at the costing's grade ÷ efficiency. | Stated on the finishing basis (F4 text); PROPOSED in the owner's file | text |
| P5 | L | main.ts demo names | "Toyota Land Cruiser 300 Tailgate (OEM 4-Coat Paint System)" costs 2 coats. | PROPOSED | — |
| P7 | L | main.ts collectPaintingInput warning | "masking £x/part … neither was costed at all before" — £x is the regional rate, not the costed op; "before" is history. | PROPOSED | text |
| X1 | L | export/excel.ts 2-Material | `lines` are indented under "Direct material cost" though they include bought-in and consumable lines (battery CELLS shows under it and again as "Bought-in content"). | PROPOSED | text |
| X2 | L | export/pdf.ts §3B | "(N lines · Q pieces)" sums kg, m, m² and pieces. | PROPOSED | text |

### Proposed code (files not owned by this audit)

```ts
// P1 — main.ts demo loader, case 'painting', after the paint-line-rate line in each branch:
(el<HTMLInputElement>('paint-parts-per-rack')).value = '1';
(el<HTMLInputElement>('paint-racks-per-hr')).value = slot === 3 ? '18' : slot === 1 ? '15' : '60';

// P2 — main.ts case 'painting' init: price the default coats from the library grade they name.
const perL = (id: string, kgPerL: number, fallback: number) => {
  const m = library.materials.find(x => x.id === id); return m ? Math.round(m.pricePerKg * kgPerL * 1000) / 1000 : fallback; };
addCoatRow({ coatType: 'e_coat', materialId: 'mat-paint-ecoat', dftMicrons: 20, solidsPct: 0.20, transferEfficiency: 0.95, paintDensityKgPerL: 1.3, pricePerL: perL('mat-paint-ecoat', 1.3, 4.55) });
addCoatRow({ coatType: 'basecoat', materialId: 'mat-paint-basecoat', dftMicrons: 15, solidsPct: 0.35, transferEfficiency: 0.70, paintDensityKgPerL: 1.25, pricePerL: perL('mat-paint-basecoat', 1.25, 10.25) });

// A2 — main.ts collectWiringHarnessInput, before computeWiringHarnessDrivers (import harnessCrimpCheck):
const crimp = harnessCrimpCheck({ connectors, assemblyTimeHr: num('harn-asm-time') || 0.45 });
if (crimp) _smExtraWarnings.push(crimp);

// B2 — main.ts demo loader, case 'biw_assembly', after clearing the stations:
el('join-body').innerHTML = ''; joinCount = 0;
addJoinRow({ type: 'spot_weld', count: slot === 3 ? 28 : slot === 1 ? 60 : 120, costPerJoint: 0.05 });
addJoinRow({ type: 'adhesive_m', count: 0.8, costPerJoint: 1.20 });

// L2 — main.ts collectSheetMetalInput, the lamination warning:
_smExtraWarnings.push(`Lamination finishing: £${fin.totalPerPart.toFixed(3)}/part — ${fin.basis}. Add the anneal/weld/bond machine time as a secondary op if in-house.`);

// F7 — main.ts renderSurfaceFinishingSection: a route that starts with a step the commodity already charges is not offered.
const DROP = family === 'sheet' ? new Set<string>() : new Set(['blast_only', 'blast_zinc', 'cast_ecoat']);
const routes = Object.entries(SURFACE_ROUTE_LABELS).filter(([v]) => !DROP.has(v)).map(/* as now */);

// F3 — surface-finish-routes.ts finishSpec, and tests/cad-phase2.test.ts:79:
const withMasking = masked > 0 ? ['masking', ...stages, 'demask'] : stages;
expect(masked.stages[0]).toBe('masking'); expect(masked.stages.at(-1)).toBe('demask');

// X2 — export/pdf.ts §3B title: count lines, not a sum of mixed units.
doc.text(`3B  Bill of Materials  (${matLines.length} lines)`, MG, y);
```

### What moves

- **Real parts:** none. No part in `cad-audit/parts/` answers the finish question in `ANSWERS`, and the other five
  commodities have no CAD route — `tests/real-parts-baseline.test.ts` and the rules-prompt snapshot do not move from
  this audit.
- **Spec forms:** e-motor −£0.46 (E2); finishing on hand-form multi-machine routes and galvanise (F1, F2); everything
  else is text or itemisation. `docs/ev/battery-emotor-build-2026-10.md` §3 quotes the motor at £697 (10 % / 7 %): it
  is now ≈ £696.5 — the doc's owner should refresh it.
- `tests/cad-phase2.test.ts` "an answered finish adds its cost" still passes (Seat bracket zinc, knuckle and PRCR002
  e-coat are single-machine routes). Failures seen in `cad-phase2` (bare-part baseline, compare routes),
  `composites-harness` (composites module) and `country-rates` §5 / §13 come from other auditors' edits to
  casting / composites / extrusion — not from these files (no finish, no spec commodity in them).

## 7. Not checked, and why

- **Prices themselves.** Every ESTIMATE in `ev-data.ts` and every representative surface-treatment value stays as it
  is: the audit checks that each is labelled and that the arithmetic on it is what is printed, not that it is right.
  No supplier quote or purchase price exists for any of these commodities.
- **Countries other than the UK** for the spec forms (the country audit owns them); only L1 was checked in India.
- **The PCB / PCBA commodities** — another group.
- **The screen's DOM path end to end** (`e2e`): the collectors were read and their defaults transcribed; no browser
  was driven. The demo loaders were transcribed by hand from main.ts.
- **The surface-treatment data model** (`surface-treatment-rate.ts`, `surface-treatment-data.ts`): re-implemented in
  the shadow and matched, but not owned — F8 and P6 are left to its owner.
- **Battery advisor benchmarks** (BNEF figures) were read from `ev-data.ts`; the publishers' pages were not re-read.
