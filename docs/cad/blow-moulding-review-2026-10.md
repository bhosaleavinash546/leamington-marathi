# Blow-moulding cost model — end-to-end review, 3 October 2026

The blow-moulding model was traced from the uploaded CAD to the pound, as the
casting, moulding, sheet-metal, machining, forging, gear and rubber models were.
Every finding has a test in `calculator/tests/blow-moulding-review.test.ts`.

**Summary.** Two of the three test parts could not be costed:

- **Washer reservoir.** The route question did not offer blow moulding at all.
  A hollow part was only offered the hollow routes if it was at least 250 mm
  long and under 3% fill.
- **Air duct.** It had no wall reading (its rays leave through the open ends).
  The rules asked for the wall and then ignored the typed answer, so the
  question could not be answered.

The one real part, a fuel tank, had these faults:

- its 2.24 kg of pinch-off flash was bought as virgin co-ex resin;
- it was cooled on a 5.0 mm ray-cast wall, not its 4.45 mm area-mean wall;
- the rule chose a mono-layer accumulator press, while headless chose the
  co-ex head.

Faults common to every blow-moulded part:

- **Screen and headless disagreed** on:
  - cooling (headless fixed 2.5 s/mm²; the rule calculated 3.5);
  - the machine;
  - parison time (6 s headless; 6–20 s on screen);
  - crew, OEE, labour efficiency and scrap.
- **Parison time:** a parison time was added in series even on continuous
  extrusion heads, where the next parison forms while the mould runs.
- **No flash trimming** on either path.
- **Moulds rounded up** to whole sets.
- **Mould size:** a 2 – 20 L capacity was always tooled at 10 L.

## 0. Test parts

| Part | Source | Geometry |
|---|---|---|
| Fuel tank (**real**) | measured in the August audit; geometry in `cad-audit/final/runs/FINAL-Fuel_tank-api.json` (the STEP is not in the repo) | 1528 × 658 × 594 mm, 10.6 L of plastic, 4.45 mm mean wall, 3 solids, filler-neck openings |
| Washer reservoir (**modelled**) | `cad-audit/parts/BM_modelled_parts.py` | 220 × 160 × 130 mm, R20 edges, 2.5 mm wall, Ø40 filler neck, ~3.8 L, HDPE |
| Air duct (**modelled**) | same | Ø70 × 2 mm tube, 90° R120 elbow, open both ends, 2.5 L inside, PP |

The modelled parts are not customer parts. Both are in the real-parts baseline.
The tank is pinned in the review test from its recorded geometry.

## 1. Findings

| # | What was wrong | Effect | Fix |
|---|---|---|---|
| 1 | **Hollow routes only for large shells** (≥ 250 mm, < 3% fill). | The 220 mm reservoir at 6.5% fill was offered sheet metal, injection moulding and machining. Blow moulding was not an option. | Any hollow thin shell (2·V/S ≤ 10 mm, fill < 20%) gets the hollow-route question. Every other baseline part routes as before; the knuckle keeps its forging question. |
| 2 | **No wall on an open tube.** The ray-cast found nothing. The boundary correction only rewrote a reading that existed. The rule asked for the wall but never read the typed answer. | The duct could not be costed, even after answering. | The measurement boundary fills a missing wall from 2·V/S on a sparse shell (fill < 10%). The reading has every field, because a partial one crashed `/analyze` live. The rule also reads a typed wall. |
| 3 | **Wall = ray-cast mean**, corrected upstream only when it overshoots 3×. | Tank cooled at 5.04 mm, not 4.45 mm (wall² is 28% higher). | The rule reads 2·V/S, the area-mean wall of a shell. It is measured, not sampled, and the ray mean is printed beside it. |
| 4 | **A band was costed at one figure.** "2 – 20 L" always tooled a 10 L mould. | The 3.8 L reservoir carried a £19,311 tool. | The band's figure is capped at what the measured envelope can hold, never below the band floor. A new option, "I know the exact capacity", asks for the litres. Reservoir tool: £14,790. |
| 5 | **Machine** by shot weight on screen, by subtype headless. The barrier tank went to the mono-layer accumulator on one path and the co-ex head on the other. | — | One rule: preform process → its machine; barrier wall → the 5-layer co-ex head; otherwise sized on part + flash × cavities. |
| 6 | **Parison in series on every head.** Headless 6 s; screen 6–20 s by process. A screen value of 0 was replaced by the module's 6 s default. | Reservoir cycle +6 s. | Continuous head: nothing in series, unless the extruder cannot make the next parison in the mould time. Accumulator: the push-out is in series (tank 12.41 kg at 2 kg/s = 6.2 s). A 0 now stays 0. |
| 7 | **Flash bought as virgin resin**, credited at scrap price. | Tank: £3.20 of co-ex resin per part. | EBM flash is reground in line (12–22% of the shot, within the ~30% a blown wall takes; into the regrind layer on a co-ex tank). The module takes `flashRegrindFraction`. |
| 8 | **No trimming on either path.** Every EBM part leaves the mould with its pinch-off, neck and tail flash. | — | In-line trim station, charged at the blow takt ÷ cavities. It has no crew of its own (the blow crew tends it), via a new `untended` operation flag the validator accepts. |
| 9 | **Crew, OEE, labour efficiency, scrap, labour, cooling** differed by path. Screen: crew 1, efficiency 0.95, scrap 2.5%, factor 3.5. Headless: crew 1, 0.92, 3%, factor 2.5. | — | Rules on both paths: <ul><li>crew 0.5 on continuous machines (one operator, two machines), 1 on a large-part line, 0.5 on preform machines;</li><li>OEE 0.80; labour efficiency 0.92;</li><li>scrap 2.5% EBM, 3% co-ex barrier, 1.5% preform;</li><li>blow-machine operator;</li><li>the conduction cooling factor.</li></ul> |
| 10 | **Moulds rounded up** inside the amortisation. | — | Fractional above one mould, as forging die sets. |

## 2. Before and after (headless, 50,000/yr)

"Before" is the committed code, on geometry through the committed boundary
correction, with every question answered as an engineer would.

| Part | Before | After |
|---|---|---|
| Washer reservoir | **£2.10** (10 L tool, flash bought, 6 s parison, crew 1, no trim) | **£1.59** |
| Air duct | **blocked** (no wall; the typed answer was not read) | **£1.20** |
| Fuel tank (real) | **£32.41** (5.04 mm wall, flash bought as co-ex resin, no trim) | **£29.12** (4.45 mm wall, 103.5 s cycle on the co-ex head, flash reground, in-line trim) |

On the raw kernel output, without the boundary correction, the reservoir read a
25.3 mm wall: £41.75 once the engineer confirmed it was hollow. The rules now
read 2·V/S themselves, so no consumer depends on that correction having run.

## 3. Hand reconciliation: washer reservoir, 50,000/yr

Library rates:

| Item | Rate |
|---|---|
| HDPE | £1.05/kg |
| EBM up to 5 L | £22.69/h |
| Deflash trim station | £12.21/h |
| Blow operator | £20.65/h |

Scrap 2.5% (÷ 0.975); OEE 0.80; labour efficiency 0.92.

| Line | Working | £ |
|---|---|---|
| Wall, weight | 2·V/S = 2 × 377.6 cm³ ÷ 3,024 cm² = 2.50 mm; 377.6 cm³ × 0.96 = 0.3625 kg | |
| Cycle | blow 3 + 0.8 × 5.43 L = 7.3 s; cool 3.5 × 2.5² = 21.9 s; open / close 4.5 s; parison 0 (0.41 kg at 120 kg/h = 12 s, inside the 34 s mould time) = **33.7 s**, 1 cavity | |
| Material | 0.3625 ÷ 0.975 = 0.3718 kg × £1.05 (flash reground) | 0.390 |
| Process | blow 33.7 s ÷ 0.975 = 0.009594 h × £22.69 ÷ 0.8 = 0.272; trim 33.7 s = 0.009361 h × £12.21 = 0.114 | 0.386 |
| Labour | 0.009594 h × £20.65 × 0.5 ÷ 0.92 | 0.108 |
| Tooling | £14,790 (1-cavity aluminium, 5.43 L) × 1 mould ÷ 50,000 | 0.296 |
| Packaging + logistics | | 0.150 |
| Overhead 12% of £1.180; margin 8% of £1.472 | | 0.142 + 0.118 |
| **Total** | | **1.59** |

## 4. Live in a browser

The modelled STEP files, a real server and a browser, every field identical:

| Part | Screen | Headless |
|---|---|---|
| Washer reservoir | **£1.59** | **£1.59** |
| Air duct | **£1.20** | **£1.20** |

The duct is answered through the new exact-capacity entry.

The live runs found two faults the unit tests had not:
- blow moulding missing from the reservoir's route question (#1);
- a 500 from `/analyze` on the duct, from a partial wall reading (#2).

The live script now names an answer the screen does not offer, instead of timing
out. The fuel tank has no STEP in the repo, so it is checked headless only.

## 5. Second pass — a standard blow-moulding should-cost, line by line

| Element | Status |
|---|---|
| Resin weight from the measured part | Done (geometry × grade density) |
| Flash / pinch-off and its regrind | Done (#7); grinding energy not charged |
| Barrier / co-ex wall | Existing question; machine now follows it (#5) |
| Masterbatch / colour | On the form (£/kg), not chosen from CAD |
| Machine: head type and shot capacity | Done (#5, #6) |
| Cycle: parison, blow, cool, open / close | Done (#3, #6); blow and open / close are capacity rules |
| Cavitation | Capacity bands (4 / 2 / 1); not checked against annual capacity |
| Crew, OEE, scrap | Done (#9) |
| Trimming / deflash | Done (#8) |
| Leak test | **Open** — every fluid container is leak-tested; no blow leak tester in the library |
| Post-mould operations (fuel tank: component welding, valves, pump flange, fluorination; reservoir: pump boss, labels) | **Open** — not priced from CAD |
| Mould cost and life | Existing build-up kept; fractional moulds (#10) |
| Packaging / logistics | Envelope-scaled, as every commodity |

## 6. Still open, stated rather than hidden

- **Every constant is engineering-typical:**
  - extruder output and accumulator push rate per machine;
  - crew, scrap, flash fractions (12% / 22%);
  - blow and open / close time per litre;
  - the cavity bands.

  All are printed on the basis. None has been compared with a blow moulder's
  figures.
- **Cooling uses the injection two-sided conduction factor.** A blown wall cools
  mainly from the mould side; the inside is blow air. The real cycle lies between
  the two-sided figure used here and the one-sided one (4× longer). Internal air
  exchange and higher ejection temperatures pull it towards this figure. The
  tank's 103.5 s and the reservoir's 34 s look like production cycles, but that
  is judgement, not data.
- **The fuel-tank mould (£69k at 60 L) looks low** against typical tank tools.
  Those carry inserts for in-mould component placement, which the build-up does
  not model.
- **Capacity is still asked.** The kernel measures the plastic, not the void.
  The envelope cap only stops a band overstating the tool.
- **Roto and thermoforming** still read the kernel wall. That is safe only where
  the boundary correction fires (a 3× overshoot). They are the next reviews.
- **BIW inner panel** (two solids, 0.9 mm, 1% fill) is asked the hollow-route
  question, with sheet metal offered. This predates the review.
- **The modelled parts are not customer parts.**
