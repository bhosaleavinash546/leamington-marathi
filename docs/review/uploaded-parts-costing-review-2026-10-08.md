# Uploaded CAD parts — live should-costing, PDF and Excel audit (8 Oct 2026)

Every CAD file uploaded on 6–8 Oct was costed **live** — a real server and browser, the way an engineer uses the tool:
upload → answer the route / material / service questions → Apply → Calculate → **Export Excel** → **PDF Report**. Each
part's screen, PDF and workbook were then checked against each other and against an independent recomputation of the
arithmetic. Every defect found was fixed in the code, pinned by a test, and the run repeated on the fixed build.

Reproduce: `npm run build && CV_PARTS=parts.json CV_LIVE_OUT=out npx tsx e2e/cad-parts-live.ts` (manifest: file +
answers per part), then the two checks described in §6.

## 1. Bottom line

| Area | Status |
|---|---|
| Every part routes to its real process with the tool's own options | **Fixed** — 4 parts were mis-routed or not offered their process (§3) |
| Process choice inside a commodity (HPDC / gravity / sand / megacasting) | **Fixed** — two section-blind rules (§3) |
| Screen = PDF = Excel, every part | **Yes** — 18 of 18 runs (16 files, the sprocket two ways) agree to the penny (§5) |
| Screen = headless (the bulk / baseline path) | **Yes** — every STEP part to the penny, after two parity fixes (§3) |
| Arithmetic, recomputed independently from the workbook's own inputs | **Yes** — every operation and every total, 18 of 18 runs (§6) |
| PDF / Excel statements that contradicted the costing | **Removed** — 30+ instances (§4) |
| Absolute accuracy against a price actually paid | **Unmeasured** — no purchase prices exist for these parts. Say so. |

## 2. How each part was costed (the code path)

Upload → `POST /api/cad/analyze` (server/routes/cad.ts) → OCCT kernel (`cad-geometry-engine.py`, STEP) or
`stl-parser.ts` (STL) → `inferCommodity` (derive/commodity.ts) asks the route → the commodity's rule set
(cost-input-rules/commodities/*.ts) asks what geometry cannot say (material, service, grade) → `POST /api/cad/reanalyze`
per answer → **Apply** fills the commodity form (main.ts) → **Calculate**: `collect<Commodity>Input()` → module
`compute<X>Drivers` → `computeUniversalStack` (core.ts, the 8 buckets) → exports read the same result
(src/export/pdf.ts, excel.ts). The questions asked and the answers given are printed on PDF "Checks applied" and Excel
sheet 7.

## 3. Route, process and material — what the tool chose, and what was wrong

Annual volume 100,000 (the form's default), UK.

| Part | Chosen route / process / material (tool option) | Why | What was wrong before the fix |
|---|---|---|---|
| Fuel tank | Blow moulding, HDPE fuel-grade coex, barrier wall | plastic fuel tank | **Blow moulding not offered**; leaned injection moulding. Also **timed out** on screen (31 MB; 150 s limit) |
| Bumper | Injection moulding, PP-B | bumper fascia | Read as a sealed tank on fill ratio alone: offered only blow / roto / sheet, **leaning rotomoulding** |
| CLOSE_VOLUME | Injection moulding, PP-B | "automotive plastic design" close volume, 2.5 mm open shell | Same as the bumper (no lean now — nothing in the file says which) |
| Gearbox housing | Cast + machine, **HPDC**, ADC12 | Al housing, 5.9 mm section, 50k+ / yr | Filename "…_gearbox_…" matched the **gear** test (asked for a tooth count); then offered only moulding / sheet; HPDC refused above a 4 mm 2·V/S → gravity |
| Brembo caliper | Cast + machine, **sand**, LM25 / A356 | the file models an 80 kg part | **Megacasting on a 6,100 t press in ADC12** (no section limit); then **ADC12 pinned** by the Apply bug while the process moved to sand |
| Input shaft (Eingangswelle) | Gear, case-hardening 20MnCr5, spur-equivalent, Q7 | 20 measured teeth on a 274 mm shaft | Costed as a 15.6 mm **disc** (£11.27): Ø54 × 22 mm slice, 1.8 min turning, Ø9 × 271 bore free |
| Hollow driveshaft | Gear, through-hardening 42CrMo4, Q8 | 36-tooth spline on a 266 mm shaft | Same disc defect (£17.82) |
| Steering knuckle | Cast + machine, sand, EN-GJS-500-7 | named "…KNUCKLE_PATTERN" (a casting pattern), safety-critical | — |
| PRCR002 / Stub axle | Cast + machine, sand, EN-GJS-500-7 | the stub axle, safety-critical | — (the two files are the same part: same cost) |
| Part1 | Cast + machine, gravity, LM25 | path "CASTING-01" | — |
| Model Mania 2017 | Machining, 6082-T6 | prismatic test part | — |
| Servo horn | Machining, 6082-T6 | named aluminium horn | Headless capped its handling by a removal ceiling (£3.14 v screen £5.34) |
| Hood bracket / Seat bracket | Sheet metal (stamping), DC04 | pressings | — |
| Chain sprocket (STL) | Sheet metal (blanked plate), HRPO hot-rolled | 5 mm × Ø271 plate, 13 through-holes (mesh genus) | Plate route **not offered** (only cast / machine → turned from Ø275 bar, £82.96); the entered holes were costed nowhere, silently; 5 mm steel defaulted to DC04 cold-rolled coil |
| Input_Shaft_machined (no extension) | as the input shaft | same file | **Refused** as "unsupported format": now read as STEP from its header |

## 4. PDF and Excel — what they said that the costing did not

PDF: tooling "not in this unit cost" (it is bucket 4); heat treat / NDT "NOT in this cost" beside £3.18 + £5.00 of
them; a ±16.6 % band beside a ±6.3 % screen; ductile iron's carbon labelled "Steel"; a machined-feature table printed
"Costed? Yes" with a £ total for a calculation the costing never used (and painted on the 3D model); DFM raw keys,
reference-rate £ and a total of overlapping upper bounds; "35 % floor for castings", "benchmark 8–18 %" applied to a
machined casting, "industry benchmark", rule-of-thumb "saves ~£x" in observations; multi-machine manning proposed for a
4-person moulding-line crew; "healthy OEE (87 %)" from bench steps; "consumables 59 %" made of heat treat and NDT;
"evaluate a near-net blank (casting or forging)" on a casting; a 65–85 % yield band beside a 98 % melt-loss figure; two
finished masses, one labelled "measured"; "Tooling held fixed" (it is not) and a local-currency tag over £ figures in
the country table; traceability in GBP under a display-currency report; the last PCB board's photos on a machined part.

Excel: every £ was text; the Checks sheet listed no questions; material rows did not reconcile on the supplied-price
path; "Benchmark: 75-85 %" on every part; overhead / margin labels wrong with bought-in content; no learning-curve row;
bench steps showed the moulding line's rate; "[object Object]" overrides; machine build-up headed as annual £.

All corrected — each figure now comes from the costing, and every threshold without a read source says "engineering
estimate".

## 5. Results — screen, PDF and Excel (final run)

| Part | Commodity | Material (form) | Screen | PDF | Excel | ± band | Excel checks | Independent recompute |
|---|---|---|---|---|---|---|---|---|
| Brembo_Brake_Caliper_Z1240sx | cast_and_machine | LM25 / A356 · sand / gravity | £628.22 | £628.22 | £628.2168 | ±9.6% | 5/5 OK | total £628.2168 = £628.2168 |
| CLOSE_VOLUME | injection_moulding | PP Impact Copolymer (PP-B) | £2.75 | £2.75 | £2.7510 | ±7.2% | 5/5 OK | total £2.7510 = £2.7510 |
| BUMPER | injection_moulding | PP Impact Copolymer (PP-B) | £12.99 | £12.99 | £12.9859 | ±8% | 5/5 OK | total £12.9859 = £12.9859 |
| offroad_vehicle_gearbox_housing | cast_and_machine | ADC12 / A383 · die-cast | £62.32 | £62.32 | £62.3160 | ±6.7% | 5/5 OK | total £62.3160 = £62.3160 |
| Model_Mania_2017_Phase_2 | machining | 6082-T6 Aluminium Bar (UK) | £8.18 | £8.18 | £8.1787 | ±7.5% | 5/5 OK | total £8.1787 = £8.1787 |
| Hollow_Driveshaft | gear | 4140 / 42CrMo4 / EN19 (Chromoly Alloy Steel) (UK) | £116.26 | £116.26 | £116.2579 | ±10.6% | 5/5 OK | total £116.2579 = £116.2579 |
| Aluminium_25T_Servo_Horn | machining | 6082-T6 Aluminium Bar (UK) | £5.34 | £5.34 | £5.3394 | ±8.1% | 5/5 OK | total £5.3394 = £5.3394 |
| Hood_Bracket | sheet_metal | DC04 (CR4 Deep-Drawing) | £2.33 | £2.33 | £2.3321 | ±9% | 5/5 OK | total £2.3321 = £2.3321 |
| Eingangswelle | gear | 20MnCr5 (Gear Steel) (UK) | £41.25 | £41.25 | £41.2475 | ±8.7% | 5/5 OK | total £41.2475 = £41.2475 |
| steering_knuckle_RH | cast_and_machine | EN-GJS-500-7 (Ductile Iron) | £45.94 | £45.94 | £45.9448 | ±5.9% | 5/5 OK | total £45.9448 = £45.9448 |
| Part1 | cast_and_machine | LM25 / A356 · sand / gravity | £36.76 | £36.76 | £36.7643 | ±6.4% | 5/5 OK | total £36.7643 = £36.7643 |
| PRCR002 | cast_and_machine | EN-GJS-500-7 (Ductile Iron) | £84.58 | £84.58 | £84.5763 | ±6.3% | 5/5 OK | total £84.5763 = £84.5763 |
| Seat_Locking_Bracket | sheet_metal | DC04 (CR4 Deep-Drawing) | £2.18 | £2.18 | £2.1772 | ±8.9% | 5/5 OK | total £2.1772 = £2.1772 |
| Stub_Axle | cast_and_machine | EN-GJS-500-7 (Ductile Iron) | £84.58 | £84.58 | £84.5763 | ±6.3% | 5/5 OK | total £84.5763 = £84.5763 |
| Input_Shaft_machined | gear | 20MnCr5 (Gear Steel) (UK) | £41.25 | £41.25 | £41.2475 | ±8.7% | 5/5 OK | total £41.2475 = £41.2475 |
| Chain_Sprocket_STL | sheet_metal | HRPO (Hot Rolled Pickled & Oiled) | £2.96 | £2.96 | £2.9618 | ±14.8% | 5/5 OK | total £2.9618 = £2.9618 |
| Chain_Sprocket_STL_machined | machining | EN8 / 080M40 (Medium Carbon) (UK) | £82.96 | £82.96 | £82.9594 | ±11.4% | 5/5 OK | total £82.9594 = £82.9594 |
| Fuel_tank | blow_moulding | HDPE Coex Fuel-Tank Grade (6-layer/EVOH) | £28.03 | £28.03 | £28.0338 | ±20% | 5/5 OK | total £28.0338 = £28.0338 |

## 6. Independent arithmetic

1. **Reconciliation** (`reconcile.py`): screen headline, PDF "TOTAL SHOULD-COST" and Excel total per part; both
   exports scanned for NaN / undefined / [object Object] / "saves ~" / "industry benchmark" / stale model names / the
   withdrawn statements above.
2. **Recomputation** (`recompute.py`, not the tool's code): every operation re-derived from the workbook's own inputs
   (rate × cycle ÷ parts per cycle ÷ OEE; rate × manning × labour time ÷ parts per cycle ÷ efficiency), then tooling,
   overhead (rate × base), margin (rate × subtotal) and total.

Hand checks (from the workbooks):
- **Gearbox housing material**: 3.0662 kg poured × £2.75 = £8.432 + shot blast £0.22 + impregnation £0.90 + tool wear
  £1.170 + melt energy £0.828 = **£11.550** = bucket 1.
- **Model Mania**: 0.2434 kg bar × £3.49 = £0.8495 − 0.1852 kg swarf × £0.54 = £0.1000 + tool wear £0.1401 = £0.8894;
  overhead 12 % × £6.7347 = £0.8082; margin 8 % × £7.5729 = £0.6058; total **£8.1787** = the screen.

## 7. Known limits — say them in the demo

- **Accuracy is unmeasured**: no purchase price exists for any of these parts.
- **Brembo caliper**: the file is ~3× a real caliper (777 mm, 80 kg of aluminium). £628 is the arithmetic on that
  file, not a caliper price. Do not present it as one.
- **Hollow driveshaft / input shaft** are costed from solid bar (the tool has no tube or forged-blank stock on the gear
  route); the driveshaft removes 84 % of its bar. The form takes a forged-blank quote (and a zero turning cycle) when
  one exists. A helical input gear is costed spur-equivalent until the helix angle is entered.
- **Fuel tank**: the 31 MB file now costs live in ~3 minutes (it timed out at 150 s, and then spent 296 s unfolding
  the tank as a pressing). Start it before you need it. Its ±20 % band is the widest here: resin, capacity band and
  barrier were the tool's leanings, confirmed rather than read off a drawing.
- **CLOSE_VOLUME** route is the engineer's choice — the file does not say what the part is.
- **STL (sprocket)**: no B-rep, so the tooth outline, holes and any hardening cannot be measured — the £2.96 blanked plate
  is the blank and the press only, and the report now says so (warning `mesh_features_not_costed`). Ask for the STEP.
- Leak test on a casting borrows the library's tube leak-test rig as a proxy machine; gear workbooks carry the gear
  module's derivation notes with literal £ (correct in GBP, not converted in another currency).
