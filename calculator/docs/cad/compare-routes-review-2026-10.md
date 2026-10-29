# Compare routes — review and rebuild (29 Oct 2026)

**Asked:** the President and the Cost Engineering Director want Compare routes to be accurate and detailed, with
authentic arithmetic, and to offer only alternative processes that are feasible.

**What was there (D5, 28 Oct 2026):** the measured part costed on the costing's own route plus a static list
(forging / casting / cast + machine / machining, or stamping / laser + brake) and the process question's options, through
`costMeasuredPart`. Each row: total and tooling a part.

## 1. Deep dive — the comparison on all 41 real parts

`npx tsx scripts/route-compare-review/survey.ts` ran the shipped comparison on every part in the real-parts baseline
(UK, 100,000 a year, 5 years). What it offered:

| # | Finding | Parts | Why |
|---|---|---|---|
| F1 | **Routes in another material.** The aluminium battery rail, bumper beam, busbar and crash box were offered polymer extrusion and rubber; the aluminium battery can blow and rotational moulding; the PA12 fuel line rubber (£0.22 in NBR); the EPDM door seal a uPVC window profile; the CFRP roof panel an ABS thermoforming at £11.09 against £432; the PA66 cable clip casting and forging. | 17 of 41 | The family filter read `material.family` only. Aluminium extrusion answers `material.alAlloy`, mouldings `material.resin`, rubber `material.elastomer`, composites `material.laminate` — none set the family, so nothing was filtered. |
| F2 | **Not like for like.** "Casting" (as cast, no machining) was listed against the finished part: the stub axle at £46.15 against its own cast + machine £52.85; the hub flange casting £16.81 "cheaper" than the forging £17.32 that includes its machining. | 8 | A raw casting with 22 machined bores is not the part. |
| F3 | **No feasibility screen.** A forging die for a 1.8 m rail (10,776 t against the largest 8,000 t press in the book), a thermoforming carrying the ECU cover's four bosses, laser + brake on a drawn can — all costed, or refused only by the costing chain's sanity text ("unusual for machining"). Anything beyond the press ladder was costed on the largest press as if it fitted (`pickTier` returns the last tier). | — | No envelope was checked before costing. |
| F4 | **Leanings assumed on questions a material gate should have removed:** "which polymer grade → TPE-S" on an aluminium seal carrier. | 4 | Follows F1. |
| F5 | **Arithmetic not checkable.** A row was a total and tooling a part: no buckets, no kg bought against net, no tooling investment, no operations, no volume. The knuckle's machining row (£208.96) hid that it buys 50.9 kg of plate for a 2.85 kg part. | all | — |
| F6 | **No break-even.** The first question a cost engineer asks of two routes — at what volume does the die pay back — was not answered. | all | — |
| F7 | A resin carried to another plastics route stopped it at "which resin?" (the ABS trim cover compared as a moulding). | 5 | The resin ids are per route. |

## 2. What was built

### Feasibility screen — `src/engine/route-feasibility.ts`

Every route with a rule pack is screened against the measured part BEFORE costing. Each check records what was
measured, the limit, pass / fail and the source of the limit. The costing's own route is never refused (the engineer
chose it); its failing checks become caveats on its row.

| Check | Routes | Limit | Source |
|---|---|---|---|
| Material family | all | the family the part is costed in, read off whichever material answer the route took (`materialFamilyOf`: family / alloy / resin / compound / laminate / grade) | `COMMODITY_FAMILIES`, material scope |
| Finished scope — gear | all but gear | a part with measured teeth is the gear route only | like-for-like rule |
| Finished scope — as cast | casting | no holes or bores measured; else cast + machine is the comparison | like-for-like rule |
| Closed container | one-piece-tool routes | no sealed void, no faces into an enclosed cavity, no closed shell with cavity faces; a drawn cup passes pressed sheet metal | Boothroyd, Dewhurst & Knight shape-capability tables; CostVision route table |
| Hollow body | blow, roto | an enclosed shell | hollow by construction |
| Constant section | dies and moulds | a long constant section is extruded or cut from bar | CostVision constant-section test (`derive/profile.ts`) |
| Constant section (required) | extrusion, Al extrusion | volume = section × length (or an impact cup ≤ Ø200) | the same test |
| Thin shell / near-solid | bulk-metal routes / sheet and moulded routes | wall ≤ 4 mm at < 25 % fill, ≥ 200 mm across; > 60 % fill | CostVision sanity checks 7 and 9 |
| Sheet gauge, one wall | sheet metal, fab | 0.4–6 mm; mean wall ≤ 2× the gauge | CostVision routing rule, 6 mm engineering-typical |
| Drawn form | fab | laser + brake has no draw | route table |
| Forging web | forging | 2·V/S ≥ 3 mm | Roymech process comparison (engineering-typical) |
| Forge press | forging | die-fill force × 1.2 ≤ the largest press in the book (8,000 t) | `estimateForgingTonnage`, `FORGE_PRESS_TIERS` |
| Castable wall | casting, cast + machine | ≥ 1.5 mm light alloys (HPDC), ≥ 3 mm ferrous / copper / nickel | die-casting design guides; investment / shell floors (engineering-typical) |
| Stock utilisation | machining | ≥ 5 % of the stocked plate or bar; a buy-to-fly caveat below 15 % | `MIN_UTILISATION`, `stockSize` |
| Mould wall | injection moulding | 0.5–6 mm | design guides (engineering-typical) |
| Sheet, bosses, draw | thermoforming | 0.25–12 mm; no bosses; depth ≤ 1× the smaller plan dimension | engineering-typical |
| Wall | blow / roto | 0.3–6 mm / 2–20 mm | engineering-typical |

The principle printed on the screen and in the reports: *routes are compared in the same material family and to the
same finished scope; a route that cannot make this shape, or that the rate book has no press for, is listed with its
reason and not costed. A change of material is a design change, not a route, and is not compared here.*

**Result on the 41 parts** (`scripts/route-compare-review/screen.mts`): no route in another family is offered on any
part; the knuckle compares forging / cast + machine / machining; the stub axle cast + machine / machining; the rail
aluminium extrusion / pressed sheet / laser + brake; the tanks roto / blow; the gear, the rubber parts and the CFRP
panels only their own route. The sheet-metal, moulding and thermoforming parts offer machining from solid where the
plate is a buyable size — it is feasible and the ladder shows what it costs.

### The arithmetic — `server/services/route-compare.ts`

Every costed row now carries:
- the 8 buckets and `reconciles` (they add to the total within half a penny — asserted on every row of the knuckle);
- the material: grade costed, net kg, kg bought, utilisation (knuckle: forging buys 4.918 kg for 3.321 kg as forged;
  machining buys 50.929 kg of 120 mm plate for 2.852 kg — 17.7 : 1 buy-to-fly, said on the row);
- the tooling: the one-off investment, what it is amortised over, its items, and the £ a part (investment ÷ parts
  = tooling a part, asserted);
- every operation: machine class (never a library id), cycle, £ process, £ labour, bench ops marked;
- the checks the route passed with their sources, and any caveat;
- the family carried to every route (the rail's pressed-sheet row used to ask "what is this part made of?"); a grade,
  resin, compound or laminate off a route's scope is dropped and the row says the representative grade is costed — a
  resin is mapped to the same POLYMER in the route's own grade list when there is one (`samePolymerGrade`: the ABS
  thermoforming sheet is costed as a moulding in ABS, stated as assumed).

### Break-even — real re-costs on a volume ladder

Each costed route is re-costed at 5,000 / 10,000 / 25,000 / 50,000 / 100,000 / 250,000 / 500,000 a year (and the
costing's own volume), with the engineer's and the row's assumed answers carried. The crossover with the costing's own
route is interpolated between the two re-costs either side of the sign change and the text says so; no crossing on
the ladder is reported as "cheaper / dearer at every volume from … to …", never extrapolated. Tooling, batch sizes
and cavitation follow the volume because the rules run again.

Examples (UK, 5-year programme): the ABS trim cover — injection moulding is cheaper than thermoforming above
~20,600 a year (£1.26 against £2.18 at 100k); the PP air duct — injection moulding beats blow moulding above
~180,000 a year; the knuckle — cast + machine and machining from solid are dearer at every volume on the ladder.

### Screen and reports

- The cost card's Compare routes section: the principle, the table (route, cost a part, difference, **tooling
  investment**, tooling a part, basis with the crossover), "How this row is built" (buckets with "adds up", material,
  tooling, by volume, operations, feasibility checks with sources), and "Not feasible for this part" with every refused
  route's checks. "Cost this route" is unchanged.
- PDF §9b and Excel sheet `8-Routes` print the comparison the screen drew (`cadMeta.routeComparison`), never a re-run:
  the table, the volume ladder, the refused routes with sources, the operations by route and every check.

## 3. Proof

- `tests/route-compare-review.test.ts`: the family read off every answer type; on all 41 parts no route in another
  family and every refusal with a measured value, a limit and a source; the knuckle's rows (buckets add up, tooling ÷
  parts, 50.9 kg plate, ladder monotone, crossovers); the rail (no forging: 10,776 t against 8,000 t); the tanks, gear,
  composites and rubber; the crossover interpolation on a synthetic ladder; the same-polymer mapping; the screen HTML.
- `tests/cad-phase2.test.ts` D5 updated to the new shape (the knuckle's as-cast row is refused with `as_cast_scope`).
- Live: `npx tsx e2e/cad-to-cost-trace.ts` (compare reference row = headline, the detail and the refused list present).

## 4. Still open

- The engineering-typical limits (mould wall 0.5–6 mm, thermoforming draw ≤ 1×, roto wall 2–20 mm, ferrous castable
  wall 3 mm, forging web 3 mm) are stated limits a cost engineer can argue with, not measurements of a supplier's
  capability. A supplier's own envelope would replace them.
- Machining from solid is offered on thin mouldings where a plate is buyable (the storage tray at 7 % utilisation); it
  is feasible and dear, and the ladder shows it. A commercial "nobody would" filter was not added — that is the
  comparison's job to show.
- A route change that changes the material (a CFRP roof as an aluminium pressing) is a design study, not offered.
- Accuracy against prices paid is still unmeasured; the comparison is as right as the rules behind each route.
