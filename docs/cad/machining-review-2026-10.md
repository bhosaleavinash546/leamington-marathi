# Machining & cast + machine cost model — end-to-end review, 2 October 2026

A cost engineering director found the machining model wrong. This note traces
machining and the machining half of cast + machine from the uploaded CAD to
the pound. It lists what was wrong, what changed, and what is still open.
Every finding has a test in `calculator/tests/machining-review.test.ts`.

**Summary.** The arithmetic engine adds up correctly; the reference bracket
still reconciles to £0.01. What fed it did not hold up.

The cutting time was the kernel's planar face area ÷ a flat 5,000 mm²/min plus
half a minute a bore. That figure:
- was the same for steel and aluminium;
- never looked at the metal removed;
- gave a 274 mm bracket hollowed out of a 2 dm³ block 2.7 minutes of milling;
- gave a steel shaft 1.1 minutes, cut from a square block on a 5-axis mill.

The cast + machine machining was a weight ceiling (0.10 h + 0.07 h/kg) that
became the value. It disagreed with the casting route's own machining for the
same part: PRCR002 cost £50.10 one way and £80.84 the other. A guard then
re-applied the same ceiling on top.

Fixtures, programming and cutting tools were £0. The screen ran its own model
with its own defaults:
- £15,000 tooling
- 0% scrap
- batches of 50
- stock at net × 1.4
- a keyword-triggered grind pass

The kernel's bounding box was read from free-form control points, so the seat
bracket was 31.0 mm tall instead of 19.4 mm.

## 0. Test parts

| Part | Route | Geometry |
|---|---|---|
| Part1 (real) | machining | 270 × 110 × 58 mm, 19% of its plate, 62 free-form faces. Its STEP header calls it CASTING-01. |
| Casting Bracket (real) | cast + machine, sand steel | 132 × 120 × 125 mm, 8 machined faces, 10 holes |
| PRCR002 (real) | cast + machine, gravity aluminium | 275 × 222 × 177 mm, 8 machined faces, 22 holes and bores |
| Hydraulic manifold (**modelled**) | machining, 6082 | 120 × 80 × 60 mm, R5 pocket, 4 × Ø11 through, 3 × Ø18 ports, 2 cross galleries, 4 × M6 |
| Stepped shaft (**modelled**) | machining, steel | Ø40 × 190 mm, Ø25 journals, 8 mm keyway, Ø6 cross hole |

The two modelled parts come from `cad-audit/parts/MACH_modelled_parts.py`.
Nothing in the audit set was unambiguously cut from bar or plate, and no part
was turned. **They are not customer parts.** All five are in the real-parts
baseline.

## 1. Findings

| # | What was wrong | Effect | Fix |
|---|---|---|---|
| 1 | **Cutting time** = planar area ÷ 5,000 mm²/min + 0.5 min a bore (kernel). Metal-blind; the metal removed was only a ceiling. | Part1: 2.7 min milling for 1,773 cm³ of aluminium removed. Steel = aluminium. | `machining-time.ts`, a measured build-up (§2). The kernel figure is printed "(not used)". |
| 2 | **Drilling** at 50 mm/min (L × 0.020). | 10–20× slower than a drill in aluminium. Applied to every commodity's holes. | 400 mm/min drilling, 250 mm/min below Ø6, ×1.5 pecking past 5 Ø. ×2 for steel. |
| 3 | **Stock = the bounding box.** | Nobody buys a block the exact size of the finished part. | Plate: 2.5 mm a side to square the sawn edges, a 3 mm saw cut, a 1 mm skim a face, then the next stocked thickness. Bar: Ø + 3 mm to the next stocked size, + facing + parting. |
| 4 | **Turned parts never detected.** The box test only caught discs. | Shaft: a 40 × 40 × 190 square billet on a 5-axis mill, 1.1 min. | Kernel `turning`: the largest coaxial family of revolved faces + its square shoulders (shaft 95%). Turned routing on lathe hours from bar; keyway and cross hole on a mill. |
| 5 | **5-axis "single setup"** machined the face it was clamped on. | From-solid 5-axis under-counted. | From solid: op 10 five sides, op 20 the clamped face. A casting held on cast datums: one. |
| 6 | **Handling** (0.8 min a fixturing a part) was used to rank the routings but **never charged**. | — | A load / clamp / unload operation. Minutes by the weight handled: 0.3 / 0.6 / 1.2 / 2.5 min. |
| 7 | **Crew** = 1 operator per machine for the whole cut. | — | 0.5 while cutting (one operator tends two machines); 1 for load / unload and bench work. |
| 8 | **Change-over** = the kernel's 15 min per direction, which is a per-part allowance. | — | 45 min a fixturing a batch: fixture swap, tool offsets, first-off inspection. |
| 9 | **Fixtures and CAM programming**: £0 headless. Screen defaults £15,000 (machining) and £5,000 + £2,000 (cast + machine). | Screen and headless apart by the whole tooling line. | Rules on both paths. Fixtures: modular £500 a fixturing up to 10k parts over 5 years, dedicated £2,500 above; soft jaws £300 a lathe chucking. Programming: 1.5 h a fixturing + 0.25 h a feature group (+2 h surfacing) × engineer rate. |
| 10 | **Cutting tools** not costed. Not in the machine rate. | — | Tool wear £/cutting-min by metal (Al 0.04, steel 0.12, Ti 0.35), in the material line as a consumable. |
| 11 | **Deburr / gauge check** absent. | — | A bench operation (labour only): 0.5 min + 0.004 min a B-rep face + 0.5 min check. |
| 12 | **Scrap**: headless 3%, screen 0%. **Batch**: screen 50, headless annual ÷ 20. | — | Rules: 2% machining scrap; annual ÷ 20, 50–5,000. |
| 13 | **Bar grade**: the rule decided "steel"; the drop-down kept its first steel. | Screen 1045 (£2.89 material on the shaft) v headless EN8 (£2.96). | The rule decides the grade (EN8, 6082 bar). |
| 14 | **Cast + machine: setups counted twice.** The setup time is setups × minutes; the module multiplied it by 0.5–1.8 by setup count. | — | Factor removed. The screen field is relabelled "machine hint, not a cost input". |
| 15 | **Cast + machine machining** = a weight ceiling, not the faces and holes it machines. | PRCR002 £50.10 as cast + machine v £80.84 as a casting with secondary machining. | The machining half is the **same rule set** as `machining` (`machiningRuleDefs`) on a near-net cut: measured machined faces faced once, holes ≤ Ø20 drilled from solid, larger cored and finish-bored. Now £51.79 v £53.80. |
| 16 | **The near-net guard re-capped the measured plan** on both paths. It scaled every op, handling and deburr included, to 0.10 h + 0.07 h/kg. | Casting Bracket machining cut 10%. | Ops the rules build are marked `measured`; the guard bounds AI times only. |
| 17 | **Face machining stock** stated "not measured". | As-cast weight light. | Measured machined-face area and cored-bore walls × per-side stock: sand ferrous 3, sand 2, gravity 1.5, investment 1, HPDC 0.5 mm (ISO 8062-3 RMA typical). Casting Bracket +54.5 cm³ (0.43 kg). |
| 18 | **Secondary machining on steel castings and forgings** timed as aluminium; cored bores helical-milled as if from solid. | Steel knuckle machining at aluminium speed. | ×2.0 for steel (both paths, `materialFactor`); cored bores finish-bored (`coredAboveMm`). |
| 19 | **Kernel bounding box** from `BRepBndLib.Add`. It reads B-spline control points and, in the warm pool, a mesh. | Seat bracket 31.0 mm tall (true 19.4); Part1 274 × 115 (true 270 × 110); shaft 40.11 in the server v 40.00 in a fresh process. | `AddOptimal` (exact geometry). Checked against a 0.02 mm mesh on four parts. |
| 20 | **Tapping** never charged. The kernel's thread flag counts free-form edges and says the flat seat bracket is threaded. | — | A hole at a distinctive metric tapping-drill size (M3–M12) ≥ 1.5 Ø deep gets a tap pass: 0.10 + 2L ÷ 500 mm/min. Labelled "Drill + tap M6". |
| 21 | **Screen ran its own model**: stock net × 1.4; ops rescaled to the kernel total (with its setup allowance); a second drill op at 0.5 min a hole; OEE 0.85; as-cast net × 1.15; a 0.06 h grind pass when an AI op said "journal". | Silent wherever a rule did not overwrite. | The form takes the analysis. Every op carries its own crew, OEE and labour; bench ops are flagged. |

## 2. The cutting-time build-up (`src/engine/machining-time.ts`)

All rates are engineering-typical for a 15–20 kW machining centre and a CNC
lathe with carbide tooling. They are printed on each operation's basis.

| Element | Aluminium | Other metals |
|---|---|---|
| Roughing, mill | removed cm³ ÷ 120 cm³/min | Mg 150, plastic 80, Cu 60, cast iron 50, steel 35, Ti 10 |
| Roughing, turn | removed cm³ ÷ 250 cm³/min | steel 80, Ti 20 |
| Wall finishing | flats, walls, fillets, chamfers ÷ 40 cm²/min, by measured area per face type | ÷ time factor |
| Free-form | ÷ 10 cm²/min (ball nose) | ÷ time factor |
| Finish turning | turned area ÷ 120 cm²/min | ÷ time factor |
| Holes | diameter × depth per hole (§1 #2, #20) | × time factor |
| Tool changes | 6 s a tool (roughing, finishing, chamfer, ball nose if surfaced, one a hole size) | — |

Time factor: Al 1.0, Mg 0.8, plastic 0.8, Cu 1.2, cast iron 1.6, steel 2.0,
Ti 4.0. The kernel now also writes `faces.areaByTypeMm2` and `turning`.

## 3. Before and after (headless)

| Part | Volume | Before | After |
|---|---|---|---|
| Stepped shaft | 10k/yr | **£5.91** (square block, 5-axis, 1.1 min) | **£17.46** (Ø45 bar, lathe 5.9 min + mill 1.0 min) |
| Stepped shaft | 50k/yr | £5.86 | £16.84 |
| Hydraulic manifold | 50k/yr | £29.78 | **£41.17** (65 mm plate, 19 min cutting) |
| Part1 | 50k/yr | £39.07 | **£91.94** (from 65 mm plate, 81% removed — see §6 on its label) |
| Casting Bracket (cast + machine) | 50k/yr | £33.26 | **£45.76** (steel machining at steel speed, face stock, tool wear) |
| PRCR002 (cast + machine) | 50k/yr | £50.10 (casting route £80.84) | **£51.79** (casting route £53.80) |
| Steering knuckle (forging) | 50k/yr | £42.76 | £57.08 (secondary machining in steel) |
| BIW floor / inner panel | 50k/yr | £9.88 / £33.63 | £9.79 / £33.53 (exact bounding box) |

## 4. Hand reconciliation: stepped shaft, 10,000/yr

Library rates:
- EN8 £0.98/kg, scrap £0.22/kg
- lathe £41.32/h, VF-2 £46.24/h
- skilled £26.19/h, semi-skilled £19.94/h

Reject 2% (÷ 0.98); OEE 0.80; labour efficiency 0.92.

| Line | Working | £ |
|---|---|---|
| Cutting time | Lathe: (315 − 117) cm³ ÷ 80 = 2.48 min + 188 cm² ÷ 60 = 3.13 min + 3 tools × 6 s = **5.9 min**. Mill: 6 cm² ÷ 20 = 0.3 min + Ø6 × 20 blind (0.06 + 20/250 + 0.10) × 2 = 0.48 min + 2 tools = **0.97 min** | |
| Material | Ø45 × 198 mm EN8, 315 cm³; net 0.916 ÷ 0.98 at utilisation 0.371 → gross 2.519 kg × £0.98 − 1.585 kg swarf × £0.22 = 2.120; + tool wear 6.9 min × £0.12 ÷ 0.98 = 0.841 | 2.962 |
| Process | Turn 0.0983 h ÷ 0.98 × 41.32 ÷ 0.8 = 5.181; mill 0.0162 h on the VF-2 = 0.956; load 3 × 0.6 min (2.47 kg bar) = 1.581; setup 3 × 45 min ÷ 500 × 41.32 = 0.186. Deburr is bench, no machine. | 7.904 |
| Labour | Turn × 0.5 crew = 1.428; mill 0.235; load × 1 = 0.872; deburr 1.07 min semi-skilled = 0.394; setup 0.118 | 3.046 |
| Tooling | (£3,100 fixtures + £289 programming) ÷ 10,000 | 0.339 |
| Packaging + logistics | geometry estimators | 0.21 |
| Overhead 12% of £14.250; margin 8% of £16.170 | | 1.710 + 1.294 |
| **Total** | | **17.46** |

## 5. Live in a browser

Real server and real browser, screen = headless, every field identical:

| Part | Volume | Screen | Headless |
|---|---|---|---|
| Stepped shaft | 10k/yr | **£17.46** | **£17.46** |
| Hydraulic manifold | 50k/yr | **£41.17** | **£41.17** |
| Casting Bracket (cast + machine) | 50k/yr | **£45.76** | **£45.76** |
| PRCR002 (cast + machine) | 50k/yr | **£51.79** | **£51.79** |

Getting there found #13 (grade), #16 (guard) and #19 (bounding box).

## 6. Second pass — a standard machining should-cost, line by line

| Element | Status |
|---|---|
| Stock form and size, saw cut, facing | Done (#3) |
| Utilisation and swarf credit | Done (core credits swarf at the scrap price) |
| Roughing by removal rate, by metal | Done (#1) |
| Finishing by surface type | Done (#1, measured area per type) |
| Drilling, reaming, boring, tapping | Done (#2, #20) |
| Tool changes, rapid / non-cut | Tool changes done; rapids sit inside the practical removal rates |
| Load / unload per fixturing | Done (#6) |
| Change-over and first-off inspection | Done (#8) |
| Crew ratio | Done (#7) |
| Machine selection by cost | Done (routing optimiser; turned, split 3-axis, 5-axis two-op) |
| Fixtures, CAM programming | Done (#9) |
| Perishable cutting tools | Done (#10) |
| Deburr, gauge check | Done (#11) |
| Scrap | Done (#12) |
| Near-net stock (castings) | Done (#17) |
| Heat treatment / surface finish (anodise, plate) | **Open** — a drawing callout; not on the machining form |
| Tolerance / surface finish time multiplier | **Open** — the module has `toleranceMm`; nothing in the CAD sets it (no PMI read) |
| CMM programme and sampling | Partly: first-off is in the change-over; no in-process CMM sampling |
| Multi-part fixturing of small parts | **Open** — one part per fixturing |

## 7. Still open, stated rather than hidden

- **Every rate in §2, and the fixture, programming, handling, crew, scrap and
  deburr figures, are engineering-typical constants.** They are printed on each
  basis. None has been compared with a price JLR paid. A supplier's cycle times
  or a quote should replace them.
- **Part1**: its STEP header says CASTING-01. Costed from plate it is £91.94;
  as a casting it would be much less. Confirm the route.
- **Plate is priced at the bar grade's £/kg** (6082 bar); plate often carries a
  premium.
- **Fixtures and programming are UK figures**; a regional run rescales the
  machine and labour rates, not these.
- **Tapping is inferred** from tapping-drill diameters; a Ø5 clearance hole
  would read as M6.
- **The feature-cost card on the screen** (`feature-costing.ts`) is a display
  with its own per-face heuristics. It is not the cost and does not match it.
- **The modelled parts are not customer parts.**
