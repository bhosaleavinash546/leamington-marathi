# Rotational-moulding cost model — end-to-end review, 3 October 2026

The rotational-moulding model was traced from the uploaded CAD to the pound, as
the previous commodities were. Every finding has a test in
`calculator/tests/rotational-moulding-review.test.ts`.

**Summary.**

- **No tank could reach the roto route from its geometry.** A tank's rounded
  corners read as bend pairs. The first routing step then asked "pressing or
  moulded shell?" and offered injection moulding, sheet metal and thermoforming.
  This happened on both modelled tanks and on the real fuel tank. Nothing in
  the kernel's output could tell a closed tank from an open tray, so a new
  measurement was added.
- **The carousel was timed as if its stations ran one after another.** The
  module added oven, cooling and load times, then spread the total over every
  arm.
- **A mould was bought for every position on every arm, whatever the
  volume.** The coolant tank was charged 8 moulds (£135k) for 5,000 tanks a
  year.
- **The material was wrong.** The resin menu offered pellet grades while the
  library holds roto powders.
- **Screen and headless disagreed:**

  | Item | Screen | Headless |
  |---|---|---|
  | Grinding adder | £0.25/kg | £0 |
  | Crew | 2 | 1 |
  | Load / unload | 180 s | 60 s |
  | OEE | 0.75 | 0.80 |
  | Machine | always the 3-arm machine | from the arm count |

- **No scrap on either path.**

## 0. Test parts

| Part | Source | Geometry |
|---|---|---|
| Coolant / AdBlue tank (**modelled**) | `cad-audit/parts/ROTO_modelled_parts.py` | 450 × 320 × 260 mm, R30 edges, 5 mm wall, Ø60 neck, ~30 L, LLDPE |
| Header tank (**modelled**) | same | 240 × 160 × 140 mm, R15 edges, 4 mm wall, Ø40 neck, ~4 L, LLDPE |
| Fuel tank (**real**) | geometry in `cad-audit/final/runs/FINAL-Fuel_tank-api.json` | 1528 × 658 × 594 mm; costed here as a low-volume rotomoulding |

The modelled parts are not customer parts. Both are in the real-parts baseline,
which records every part at 50,000/yr. The review test pins them at 5,000/yr,
where roto is chosen.

## 1. Findings

| # | What was wrong | Effect | Fix |
|---|---|---|---|
| 1 | **Nothing measured whether a shell is closed.** The hollow check was fill < 8% plus a thin wall. That passes pressings and open trays, and fails a small tank. On every fill test the open storage tray and the real fuel tank overlap. | The 4 L header tank (10.5% fill) read as a solid. Pressings read "near-enclosed". | **Kernel enclosure probe:** 96 rays from the envelope centre, counting the share that meet the part. Tanks read 1.00; the open tray 0.56; pressings 0.53–0.68; the knuckle 0.44. A thin, sparse shell whose centre is in the void with ≥ 90% hits is closed. |
| 2 | **Tanks met the bend test first**, which offered IM / sheet / thermoform. | No tank could be routed to roto (or blow) from its geometry. | A closed shell gets the hollow-route question first: blow / roto / sheet, leaning roto below 10,000 a year. Geometry measured before the probe (the fuel tank) has blow and roto added to its bend question, never leaned on. No other baseline part routes differently. |
| 3 | **Carousel stations summed.** Heat + cool + load ÷ (arms × parts per arm). | A 4-arm carousel was charged 6.4 min per coolant tank; its oven passes an arm-load of 2 every 21.5 min. | Index = the slowest station: 3 arms max(oven, cool, load); 4 arms two cooling bays; shuttle max(oven, cool + unload); single arm in series. One arm-load per index. |
| 4 | **One mould per arm position**, rounded up to whole sets. | Coolant tank 8 moulds, £27.00 a part; header tank 16, £23.81. | Moulds = volume × (arms × index) ÷ (3,500 h × OEE), in whole arm-loads; fractional replacement sets. Coolant 4, header 4. |
| 5 | **Pellet resin.** The menu offered HDPE / PP pellets at £1.05 / £0.99. The form lists only roto powders. | Headless priced HDPE pellet with no grinding. | Menu = the library's roto powders (LLDPE leading); grinding £0.25/kg on both paths (the library grades say "add grinding premium"). |
| 6 | **Wall = ray mean.** | Fuel tank 5.04 mm against a 4.45 mm area-mean wall. | 2·V/S, shared with the blow review. |
| 7 | **Machine, crew, OEE, load, labour, scrap** differed or were missing. | — | Rules on both paths: <ul><li>machine from the arm count;</li><li>crew 2 at a carousel load station, 1 on a shuttle;</li><li>OEE 0.80; labour efficiency 0.92;</li><li>load 120 s + 60 s per mould;</li><li>roto operator;</li><li>3% scrap (new module input).</li></ul> |
| 8 | **Projected-area basis** said "two largest bounding-box dimensions". | — | It is the measured silhouette, and says so. |

## 2. Before and after (headless, 5,000/yr)

"Before" is the committed code with every question answered, including
confirming that the header tank is hollow.

| Part | Before | After |
|---|---|---|
| Header tank | **£35.57** (16 moulds = £23.81 tooling, stations summed, pellet HDPE) | **£20.63** (4 moulds, 18 min index on a 4-arm carousel, roto powder + grinding) |
| Coolant tank | **£50.64** (8 moulds = £27.00) | **£51.62** (4 moulds = £13.50; machine and crew now charged at the oven's pace) |
| Fuel tank, as roto | £123.63 | £138.72 (shuttle paced by cool + unload, 29 min a tank) |

The coolant tank barely moves, but its make-up changes completely. Tooling
halves, because the volume needs 4 moulds, not 8. Machine and labour rise,
because the carousel passes two tanks every 21.5 minutes, not the 6.4 minutes
the summed stations implied.

## 3. Hand reconciliation: header tank, 5,000/yr

Library rates:

| Item | Rate |
|---|---|
| LLDPE roto powder | £1.47/kg |
| 4-arm carousel | £66.53/h |
| Roto operator | £20.14/h |

Scrap 3% (÷ 0.97); OEE 0.80; labour efficiency 0.92; 4 tanks an arm.

| Line | Working | £ |
|---|---|---|
| Wall, weight | 2·V/S = 2 × 683.5 cm³ ÷ 3,422 cm² = 3.99 mm; 683.5 cm³ × 0.94 = 0.6425 kg | |
| Cycle | oven 240 + 3.99 × 210 = 1,078 s; cool 1.35 × = 1,455 s; load 120 + 4 × 60 = 360 s; 4-arm index = max(1,078, 1,455 ÷ 2, 360) = **1,078 s** per arm-load of 4 | |
| Material | 0.6425 ÷ 0.97 ÷ 0.99 × £1.47 = 0.984; grinding 0.6425 × £0.25 = 0.161 | 1.144 |
| Process | 1,078 s ÷ 0.97 ÷ 4 = 0.07718 h × £66.53 ÷ 0.8 | 6.418 |
| Labour | 0.07718 h × £20.14 × 2 ÷ 0.92 | 3.379 |
| Tooling | 5,000 × 4 × 1,078 s ÷ (3,500 h × 0.8) = 2.14 → 4 moulds × £7,443 ÷ 5,000 | 5.954 |
| Packaging + logistics | | 0.18 |
| Overhead 12% of £16.895; margin 8% of £19.102 | | 2.027 + 1.528 |
| **Total** | | **20.63** |

## 4. Live in a browser

The modelled STEP files at 5,000/yr, a real server and a browser, every field
identical:

| Part | Screen | Headless |
|---|---|---|
| Header tank | **£20.63** | **£20.63** |
| Coolant tank | **£51.62** | **£51.62** |

Both are routed live through the new hollow-route question, leaning roto.

## 5. Second pass — a standard roto should-cost, line by line

| Element | Status |
|---|---|
| Powder charge from the measured part | Done |
| Grinding / powder premium | Done (#5) — a flat £/kg |
| Colour / UV masterbatch | On the form, not chosen from CAD |
| Oven time from wall and material | Existing advisor (240 s + 210 s/mm for PE) |
| Cooling time and method | Existing (forced air 1.35× the bake) |
| Carousel pacing, arms, parts per arm | Done (#3); arms and parts per arm from the envelope |
| Load / unload, crew | Done (#7) |
| Moulds by volume, mould life | Done (#4) |
| Scrap | Done (#7) |
| Venting, inserts (moulded-in brass) | Vents counted into the mould; insert piece price **open** |
| Post-mould: machine the openings, deburr, leak test, fit-up | **Open** — every tank has its neck and fittings cut after demould; not priced |
| Mould cost | Existing estimator. **Open:** £141k for the 1.5 m fuel tank (cast aluminium, complex, £13.5/cm²) looks high for a roto tool |

## 6. Still open, stated rather than hidden

- **Every roto constant is engineering-typical:**
  - bake 210 s/mm and cooling 1.35×;
  - load times, crew, scrap, grinding £0.25/kg;
  - the arm and parts-per-arm bands;
  - 3,500 h a year.

  All are printed on the basis. None has been compared with a rotomoulder's
  figures.
- **Each part is assumed to run alone on its carousel.** A real moulder mixes
  jobs across arms. The arm-load still owns the machine for one index, so the
  machine charge holds; the oven time is the same whatever the other arms carry.
- **Post-mould work is not priced:** cutting openings, fittings, inserts and the
  leak test.
- **The fuel-tank mould estimate is high**, as stated in the second pass.
- **The enclosure probe looks from one point.** A U-shaped or saddle tank whose
  centre lies outside the cavity will read open. It then falls back to today's
  route questions, which offer blow and roto only where the part is otherwise
  "near-enclosed".
- **The modelled parts are not customer parts.**
