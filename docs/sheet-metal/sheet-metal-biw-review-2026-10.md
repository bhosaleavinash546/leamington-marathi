# Sheet-metal & BIW cost model — end-to-end review, 2 October 2026

A cost engineering director found the sheet-metal and BIW model wrong. This note
traces it from the uploaded CAD to the pound, lists what was wrong, what was
changed, and what is still open. Every finding has a test in
`calculator/tests/sheet-metal-review.test.ts`.

**Summary.** The arithmetic engine adds up correctly; the decisions feeding it
did not agree with each other. Four rules decided the die type, the press line,
the die cost and the press independently. The results were contradictory:
- a "transfer" die fed from coil
- a "single-stage" die with 12 stations
- a tandem line priced as a progressive die
- a 2.8 m die on a 200 t press

The advisor named "Laser Cutting" at low volume and the cost charged a stamping
die. A BIW panel with real radii was never unfolded. The screen ran its own
parallel model.

## 0. Test parts

The audit set held one pressing, the real **seat locking bracket** (1.6 mm,
15 bends, 8% stretch-formed). Three BIW pressings were modelled in OCP by
`cad-audit/parts/BIW_modelled_parts.py`. **They are not customer parts.**

| Part | Geometry |
|---|---|
| Floor reinforcement | 450 × 300 × 70 mm drawn pan, 1.2 mm, flange |
| Inner panel | 1,100 × 700 × 120 mm drawn panel, 0.9 mm, R40/R15 radii, flange |
| Reinforcement channel | 240 mm U-section, 2.0 mm |

All four are in the real-parts baseline.

## 1. Findings

| # | What was wrong | Effect | Fix |
|---|---|---|---|
| 1 | Die type (advisor), press line (blank), die cost (advisor again) and press (blanking force) decided **separately** | Seat bracket: a "transfer" die fed from coil; at < 50k/yr a "single-stage die, 12 stations"; the die cost **doubled at exactly 50,000/yr** when the label flipped. Floor reinforcement: a tandem line priced as a 6-station progressive die. | One `stampingPlan`: press line → die type → stations → force → bolster → press → SPM → die cost, used by every rule |
| 2 | **Stations** = one per measured bend face + blank + pierce, capped at 12 | 15 bend faces → a 12-station die | Pierce + one forming station per ~3 bends + cut-off (+ restrike if stretch-formed): 7 |
| 3 | **Press on blanking force only** — no forming force, no bed size | A 12-station die 2.8 m long on a 200 t press | Force = cut + bending (0.166·L·t·UTS) + 10% stripper; draw = punch perimeter × t × UTS + blank holder (2.5 MPa × binder area); the press must take the die on its bolster (library press table: tonnes, bolster, max SPM). Seat bracket → 400 t |
| 4 | **Stroke rate**: "feed-limited from coil" for every line, then a module floor of 3 s (progressive) / 4.5 s (transfer) | Tandem line at 28 SPM; every progressive die capped at 20 SPM | Coil-fed: min(feed ÷ pitch, press max) de-rated by bends; transfer ≤ 20; tandem 10. Floors cut to the fastest such a line strokes (0.75 / 1.5 / 3 s); losses stay in OEE |
| 5 | **Laser route announced, never costed.** The advisor said "Laser Cutting" under 50,000/yr; the cost charged a die | Seat bracket at 2,000/yr: **£57.95** (£47 of tooling); channel at 2,000/yr: **£19.32** | Stamping vs laser + press brake **priced** (`routeChoice`): press + crew + die amortised, against laser (cut ÷ feed + pierces) + gas + brake (bends + handling + tool changes) + £1,500 programming. Laser + brake is offered only for a brake-formable part (not stretch-formed or drawn). The fab route is costed by the fabrication module headless, and the screen opens the fabrication form. |
| 6 | **No headless costing for `sheet_metal_fab`** at all | Refused in bulk runs | Costed |
| 7 | **BIW panels never unfolded.** The unfold needed bend-measured gauge; the bend detector stops at max(8 mm, 6t) radius, so a panel with R15–R40 radii registered no bends | 1.1 m inner panel costed as a **flat** part from bbox × 1.05, on a 2-station progressive die | The unfold also runs on a thin shell (2·V/S ≤ 4 mm, fill < 0.1). Inner panel: developed **1,430 × 1,047 mm** blank, drawn (28% stretch) → tandem line |
| 8 | Production dies for any volume | Floor reinforcement at 2,000/yr: **£145.92** (£117 tooling) | **Soft tooling** (zinc-alloy / soft-steel, 0.35 × the production die, 25k-hit life) when the 5-year programme is ≤ 25,000 parts |
| 9 | No die change, no die maintenance | — | Die change 1 / 1.5 / 0.5 h-per-press over the batch; maintenance 5% of the die a year (0 for soft tools) |
| 10 | Crew and scrap: screen 0.25 / 0%, headless 1.0 / 3% | Labour 4× apart | Rules: 0.5 on a coil-fed press ≤ 400 t, 1 otherwise; 1.5% scrap |
| 11 | **Screen stamping fill ran its own model.** Blank = bbox × 1.05; strip / pitch = +6% / +4%; a shear map keyed on ids the rules never pick (DC04 fell to default); the kernel's £25k face-count die; its own press and SPM | Silent wherever a rule did not overwrite | Form takes the analysis values |
| 12 | **Screen fab fill ran its own model.** Cut length from the bbox + 30 mm a hole; **tolerance = 5% of the wall** (a ×1.0–1.6 cycle multiplier with no physical basis); fab **tooling = the stamping die cost** (£181k on a laser part); nitrogen on mild steel; a different brake and labour | Screen £5.11 v headless £4.28 on the channel | Rules for every fab input (laser, brake, labour, gas, tolerance 0.5 → ×1.0, cycle, bends, batch, programming, utilisation). Screen = headless **£4.28** |
| 13 | Detected weld nuts / studs applied on screen only; screen subtracted their weight, headless did not | — | Net-weight rule subtracts the hardware; headless passes the same three hardware rows |
| 14 | **BIW assembly**: the sub-parts' should-cost (which already carries their makers' overhead and margin) went into material and got the assembler's **12% + 8% again** | Margin stacked on margin on most of an assembly's value | Core `rawMaterial.boughtIn`: in the material line, outside the overhead and margin base, with a handling charge (3%). Unused elsewhere — no other cost moves |

## 2. Before and after (headless)

| Part | Volume | Before | After |
|---|---|---|---|
| Seat bracket | 50k/yr | £5.39 ("transfer" 12-st, 200 t, £181k die) | **£3.39** (progressive 7-st, 400 t, £94k die) |
| Seat bracket | 2k/yr | **£57.95** ("laser" announced, £94k die) | **£21.70** (stretch-formed → stamping on soft tooling, £32.9k, die change over 100-part batches) |
| Channel | 2k/yr | **£19.32** (£31k die) | **£4.28** (laser + brake) |
| Channel | 50k/yr | £1.86 | **£1.68** (progressive 3-st, 80 SPM) |
| Floor reinforcement | 50k/yr | £8.87 | **£9.88** (tandem, 5 dies £235k, 10 SPM) |
| Floor reinforcement | 2k/yr | **£145.92** | **£55.29** (soft tooling) |
| Inner panel | 50k/yr | £16.03 (flat part, bbox blank) | **£33.63** (developed blank, tandem, 5 dies £846k) |

Hand reconciliation of the seat bracket at 50k/yr. Library rates: DC04
£0.77/kg (scrap £0.20), press-400t £39.66/h, semi-skilled £19.94/h,
technician £28.81/h.

| Line | Working | £ |
|---|---|---|
| Material | strip 292 × 233 × 1.6 mm × 7,850 kg/m³ = 0.855 kg a stroke; net 0.558 ÷ 0.985 = 0.5665 kg; utilisation 0.653 → gross 0.868 kg × £0.77 − 0.301 kg offal × £0.20 | 0.608 |
| Press | 60 ÷ 20 SPM = 3 s × 1.015 = 3.046 s × £39.66 ÷ 0.80 = 0.042; die change 1 h ÷ 2,500 × £39.66 = 0.016 | 0.058 |
| Labour | 3.046 s × £19.94 × 0.5 ÷ 0.92 = 0.009; setter 1 h ÷ 2,500 × £28.81 = 0.012 | 0.021 |
| Tooling | £94,019 × 1.05 (maintenance) ÷ 50,000 | 1.974 |
| Packaging + logistics | geometry estimators | 0.16 |
| Overhead 12% of £2.661; margin 8% of subtotal | | 0.319 + 0.251 |
| **Total** | | **3.39** |

Live in a browser:
- **Seat bracket at 50k/yr:** **£3.39** on screen = **£3.39** headless, with every field identical.
- **Channel at 2k/yr:** the screen opens the fabrication form and costs **£4.28** = **£4.28** headless.

## 3. Still open, stated rather than hidden

- **Engineering-typical constants**, printed on each rule's basis:
  - press table (bolster, max SPM)
  - 3 bends a station, 600 mm strip limit, 18 m/min feed
  - transfer 20 SPM, tandem 10 SPM
  - 2.5 MPa binder pressure
  - soft-tool factor and life
  - die change hours, 5% maintenance
  - manning, 1.5% scrap
  - laser / brake times and £1,500 programming
  - 3% handling on bought-in parts

  None has been compared with a price JLR paid.
- **Die cost** is the toolmaker build-up; no die quotation has been compared with
  it. A BIW panel's die set at £846k is the right order of magnitude, not a quote.
- **Draw force** uses the footprint perimeter as the punch line; a deep or
  complex panel's real draw force needs a forming simulation.
- **Hot stamping, tailor-welded blanks and fine blanking** are reachable from the
  form but not chosen from CAD.
- **Material**: the coil grade is DC04 uncoated; BIW panels are usually galvanised
  (DX54D+Z) — choose it on the form. Coil price is the library's.
- **BIW assembly** has no CAD path (it costs an assembly of costed sub-parts);
  joint counts and station times are entered by hand.
- **The BIW parts are modelled, not real.**
