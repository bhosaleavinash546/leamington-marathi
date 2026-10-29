# Pilot rule pack — machining at volume and casting safety rules (30 Oct 2026)

The readiness assessment (`docs/review/cad2c-readiness-2026-10-29.md` §5) named two rule-pack gaps to close before
CAD to COST goes to a wider team: the machining model was a job shop, and two casting safety rules were conservative
beyond practice. This pack closes both. Every constant is engineering-typical and labelled; the engine is unchanged.

## 1. The volume machining cell

**What was wrong.** At 100,000 a year the stub axle was costed on a Haas VF-2 and a drill centre across five fixturings
(28 min, 4.8 min of handling); the routing optimiser only knew job-shop routings (3-axis split, 5-axis consolidation,
turned from bar) and ranked them on machine cost alone, so it could never prefer a cell whose whole point is less
labour. A supplier quoting that part runs a horizontal machining centre with a twin pallet and a dedicated hydraulic
fixture on a 4th-axis tombstone.

**What is built.**

| Piece | Where | What |
|---|---|---|
| The machine | `rate-library.ts` `mach-hmc-400` | 400 mm twin-pallet HMC, 4th axis. Capex £185,000 **ESTIMATE** (no new list price is published; a 2023 EC-400 listed used at US$195,900 and a 2019 one with a pallet pool at US$199,900; new = 2023 used + 25 %; Low confidence, replace with a dealer quote). UK-book method: 13-yr life, 3 % maintenance, 5 % indirect, 4 % finance on half, 13 kW, £0.182/kWh, 6,000 h × 0.80 (three shifts — the economics of the cell). £10.87/h machine only. Research filed in `scripts/rate-refresh/uk-2026-10/research/machines-a.json` and a `cnc-hmc` group in the UK config; the generator skips it because it is not in the frozen snapshot, so the literal is hand-written with the same arithmetic. Country books: no group → capital HELD (UK × the book's factor), as every other ungrouped machine. |
| The candidate | `routing-optimiser.ts` `volume-cell` | Offered at `VOLUME_CELL_MIN_ANNUAL` = 25,000 a year and above, for a prismatic part (never a turned one). Up to `HMC_SIDES_PER_CLAMPING` = 4 approach directions in one clamping, a fifth or sixth in a second; from solid the clamped face is a further one. Drilling in the same clamping. The machine pays `PALLET_CHANGE_SEC` = 10 s a part per fixturing; the load / unload is masked by the cut (labour only). |
| The ranking | `routing-optimiser.ts` | Every candidate now carries `labourPerPart` (cutting at `CUTTING_MANNING` 0.5 + handling at a whole operator, at the book's skilled rate) and the routings are ranked on machine + operator. `costPerPart` stays machine-only, so the earlier pins hold. |
| The operations | `machining.ts::buildOperationPlan`, `feature-machining.ts` | `Pallet change — N fixturing(s)` (machine, 10 s each) and `Load / unload on the pallet while the spindle cuts — N fixturing(s)` (bench, labour only) replace `Load / clamp / unload`. The feature path (forgings, extrusions, the screen's panel) gets the same two operations through `secondaryMachiningCell({ milled })`, which returns the cell's machine so screen and headless agree. |
| The screen | `main.ts` machined-features panel | The panel's machine select is filled by the rule and marked auto; it follows the rule (drill for a turned part, the cell's HMC at Calculate) until the engineer changes it — a changed select is the typed machine. Found on the first live run: the hub flange's holes were costed on the pre-filled VMC on screen and on the drill headless (£17.81 v £17.21). |
| The fixture | `machining-time.ts` `FIXTURE_GBP.hydraulic` | £12,000 a dedicated hydraulic tombstone fixture (engineering-typical toolroom build, × the country's toolroom factor). A near-net spindle's lathe fixture stays a dedicated £2,500 one. |

**What it does to the real parts (50,000 a year, UK).**

| Part | Before | After | Why |
|---|---|---|---|
| PRCR002 stub axle (cast + machine) | £53.39 | £42.81 | one clamping on the cell + the lathe (was 5 fixturings), load masked; and the casting rules below |
| Casting bracket (cast + machine) | £21.01 | £20.34 | one clamping (was 4) |
| Control-arm yoke (forging) | £24.39 | £23.18 | one clamping (was 3), load masked |
| Steering knuckle (forging) | £24.22 | £23.03 | same |
| Hydraulic manifold (machined from solid) | £22.49 | £22.99 | two clampings on the cell; the cell's £10.87/h against the VF-2's £9.05/h costs more than the two saved fixturings save — the optimiser chose it on machine + operator by a small margin |
| Part1 (machined) | £50.86 | £51.28 | same |

Below 25,000 a year nothing changes (the tests pin the stub axle at 10,000 on its five-fixturing split routing).

## 2. A turned near-net part is turned

**What was wrong.** The hub flange forging (91 % of its surface one coaxial family, Ø140 filling the section) was
face-milled on a VMC for 10.5 min because the feature table has no lathe: `face` rows were milled, `boss` rows ignored.

**What is built.** `machining-time.ts::turnedPartFacts` reads the kernel's turning signature the way the from-solid
route does (`turnedFacts`): fraction ≥ 0.6 AND the family's outside diameter ≥ 0.9 × the two dimensions across the
axis AND ≥ 20 cm² outside. Such a part is turned, faces included, on the CNC lathe (`nearNetTurnedPlan`: outside + the
measured faces through `nearNetTurningTime`, 2 mm a side where the route does not say), with only its holes on the
drill centre, in two chuckings + one drill fixturing. Applied on the feature path (forgings, screen and headless), and
in `nearNetCut` for a cast turned part. The stub axle (fraction 0.35) keeps its spindle-only turning; the control-arm
yoke (a Ø50 boss on a 250 mm part) is not turned.

Hub flange: `Turning — outside and faces on the CNC lathe, op 10 / op 20` 7.8 min + `CNC Machining — 7 features`
3.5 min on the drill centre. £17.45 → £17.40: the route is right now; the time is not much shorter because the
turning finish rate (`FINISH_RATE_CM2_PER_MIN.turning` 120 cm²/min in aluminium, ÷ 2 for steel) is conservative
against a facing pass at 250 m/min × 0.3 mm/rev. That constant is shared by every turned part and was left alone in
this pack — it is the next thing to source.

## 3. Casting safety rules

| Rule | Before | After |
|---|---|---|
| Heat treatment on iron | a safety-critical grey or ductile iron casting was stress-relieved at £0.35/kg | none: EN 1561 / EN 1563 grades are specified as-cast; a safety-critical part changes the grade (ductile) and the NDT, not the heat treatment; an ADI grade carries its austempering in its £/kg (the book says so). Cast steel is still normalised. |
| NDT, ferrous, safety-critical | 2D X-ray at £5 on every part | **100 % MPI with a sample radiograph**, as a station (`casting-advisor.ts` `NDT_STATION.mpi`): 75 s a part × (inspector at the book's rate × 1 + a bench at £4/h) + 1 in 50 radiographed at £5. £0.77 a part in the UK. |
| NDT, light alloy, safety-critical | the same £5 | **100 % in-line real-time X-ray** (`NDT_STATION.rtr`): 30 s a part × (inspector × 0.5 + a cabinet at £20/h). £0.28 a part. |
| NDT, superalloy | CT at £32 | unchanged |

The station's £/h figures are UK basis (inspection) and follow the country by `countryFactor('inspection')`; the
inspector is the costed country's. The advisor's secondary-step list (`ndtStepFor`) and the safety question's stated
consequence (`safetyConsequence`) say the same thing the rule charges.

## 4. Proof

- `tests/pilot-rule-pack.test.ts` — the machine and its rate, the candidate's eligibility and arithmetic, the clamping
  count, the stub axle at 100,000 and at 10,000, the manifold from solid, the feature path and the knuckle headless, the
  hydraulic fixture; the hub flange turned and the two parts that are not; as-cast iron, normalised steel, the MPI
  station's arithmetic, in-line X-ray, CT, none when not safety-critical, the labelled constants.
- Pins the rules change on purpose were moved with the reason beside them: `forging-review`, `machining-review`,
  `casting-review`, `casting-360-review`, `cost-input-rules-machining`, `stub-axle-live`, `cad-workspace`.
- `tests/fixtures/real-parts-baseline.json` re-recorded (`npx tsx scripts/real-parts-baseline.ts --update`); the seven
  parts above moved, every other part is unchanged to the penny.
- Live: `e2e/cad-to-cost-trace.ts` on the stub axle and the hub flange — screen = headless, the comparison's reference row
  = the headline, reports re-added (`scratchpad/pilot1`).

## 4b. Registers and baselines moved by the pack

- The new machine is filed in every register (`uk-2026-10/register.csv` by hand — the UK generator rebuilds only the
  machines in its frozen snapshot; `india / china / poland / germany` by their generators, after the machine was added
  to each frozen snapshot with the pre-book figure those books would have had: the UK rate × the snapshot's own VF-2
  ratio, each build-up line alike, and a note saying so). The four country books hold its capital (no group).
- `tests/fixtures/commodity-rules-prompt/*.txt` re-captured (`npx tsx scripts/snapshot-commodity-rules.ts`): the
  machining and cast + machine rule blocks now print the cell routing.
- Pins moved with their reason beside them: the hub flange £17.45 → £17.40, the knuckle comparison row £24.02 →
  £22.76 (investment £436,550 → £440,950, one hydraulic fixture), the stub axle floor £45 → £40, no heat-treatment
  line on iron, the cores lever now offered on the stub axle (its consumables are led by cores once the stress relief
  and the X-ray are gone).

## 5. Still open after this pack

- The turning finish rate (above).
- A gantry-loaded lathe cell for turned parts at volume (the load / unload is still charged at a whole operator).
- The HMC's capex is an estimate until a dealer quote replaces it; the country books hold its capital at UK × factor.
- Accuracy against prices paid is still unmeasured — log actuals in the pilot.
