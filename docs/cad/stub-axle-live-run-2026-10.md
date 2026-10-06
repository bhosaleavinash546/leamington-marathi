# Stub axle — CAD to cost, casting + machining, live run (6 Oct 2026)

**Part:** `Stub_Axle.stp` (the user's upload). It is byte-identical (SHA-256 `e18406b3…`) to
`cad-audit/parts/PRCR002.stp` (Creo, product "PRCR002"). It is a steering stub axle: a tapered spindle with
bearing journals and a threaded end, a flange with a bolt circle, and two kingpin bosses.

**Run:** a real server, the real geometry kernel (OCP 7.9.3.1.1, pinned) and a real browser
(`e2e/country-live.ts`). Questions were answered as an engineer would:
- route: cast + machine;
- material: cast iron;
- safety-critical: yes;
- not pressure-tight;
- standard tolerance.

The run used no AI. This environment has no API key, and every £ is deterministic anyway; the AI only
classifies and is overruled by these rules.

## Geometry (kernel), checked against the recorded truth

| | Kernel | Truth (`cad-audit/truth`) |
|---|---|---|
| Volume | 1,037.11 cm³ | 1,037.113 cm³ |
| Surface | 1,370.06 cm² | 1,370.06 cm² |
| Faces | 364 (132 cylinder, 55 cone, 34 torus, 67 plane, 76 B-spline) | — |
| Turned axis (X) | 35% of the surface on one axis; outside 225.8 cm², max Ø114 (new) | — |
| Machining features | 8 flat faces (279 cm²), 21 holes / lands | — |

## What was wrong, and what changed

| # | Found | Effect | Fix |
|---|---|---|---|
| 1 | The grade question came before "safety-critical?" and preselected **EN-GJL-250 grey iron**. That grade stayed costed after the part was answered safety-critical. Grey (flake) iron is brittle and is never used for a steering part. The library itself names EN-GJS-500-7 for knuckles and hubs. | Wrong material for the part. Wrong yield band (grey 0.73 against ductile 0.63). | For cast iron, the safety question is asked first. A safety-critical part defaults to **EN-GJS-500-7**. Grey, malleable and white iron options say "brittle — not for a safety-critical part". An engineer who still picks grey iron is costed as chosen, with a CHECK note at lower confidence. The advisor's alloy now follows the grade being costed. |
| 2 | The **spindle was not costed**. The near-net path machines measured flats and holes only, so the 226 cm² of journals, taper and fillets carried no turning. Their 3 mm of cast-on stock was also missing from the casting. | Machining understated. Casting 0.48 kg light. | The kernel now reports the turned axis's **outside** area: FORWARD cylinders, cones and tori; its bores stay holes. A near-net part whose outside turned area is ≥ 20 cm² **and** ≥ 8% of its surface gets **"Turning — spindle on the CNC lathe"** (rough the stock at the metal's turning rate, finish at the finishing-insert rate, plus loading). It also gets a lathe fixturing (fixture, programming, set-up) and the turning stock in the cast weight. A lone cast boss is not a spindle: the Casting Bracket's Ø40 boss, 4.8% of its surface, is unaffected. Ground bearing seats are **not** included; the basis says so. |
| 3 | The cast weight used the family's mid density (7,150 kg/m³) while the finished weight used the grade's (7,100). | Weights 0.7% inconsistent. | Both read the graded facts. The default cast-iron grade's density sets the mass. |
| 4 | The costing and its Excel report were titled **"cv-cad-7f1b2d1f3d7a7e74"**, the server's temp file name. | Report named after a temp file. | The part takes the uploaded file's name (`partNameFor`). |
| 5 | £14.73 of "consumables" was traced as "core/wax/shell". | Opaque: it was mostly X-ray, stress relief and tool wear. | The trace itemises it: cores £3.09 · green-sand additions £0.15 · heat treatment £3.16 · shot blast £0.56 · NDT £5.00 · cutting-tool wear £2.74. |
| 6 | Near-net operations were named "Finish machining — +Y (140 faces)". | Read as 140 machined faces; only the 8 flats and the holes are cut. | Now "Finish machining — +Y side". The face share stays in the basis. |
| 7 | **Without the geometry kernel** (e.g. a native start without cadquery), the 3D view shows the part, then "Analysis Error — OCP not available … Check the API server is running". The error sat below the viewer, and the advice was wrong: the server was running. | Looks like "it doesn't work", with no way out. | A specific hint names the kernel (`cadquery-ocp-novtk`), the fix (`pip install -r requirements.txt`, `PYTHON_BIN`, or the CAD Docker image) and what an STL can and cannot cost. The error scrolls into view. |
| 8 | On an **STL**, the deburr allowance read 208,858 **triangles** as faces. | **£302 a part** deburr; any STL machining was affected. | `bRepFaceCount` is null on a mesh. The deburr uses a stated 250-face allowance, and the forging complexity score ignores triangles too. |

## Result: UK, 100,000 a year

| Bucket | £/part |
|---|---|
| Material: EN-GJS-500-7 metal 9.04 kg cast, melt energy 9.2 kWh, consumables & services £14.71 | 25.06 |
| Process (machines) | 27.99 |
| Labour | 15.09 |
| Tooling: pattern sets, fixtures incl. the lathe, programming | 1.05 |
| Packaging + logistics | 1.07 |
| Overhead 12% of base | 8.30 |
| Margin 8% | 6.28 |
| **Total** | **84.84** |

Other countries, same answers: **China ¥372.72 (£41.97)**, **India ₹4,968.59 (£39.06)**. Each priced in that
country's own book; every CAD call reported its `ratesRegion`.

**Hand-checked (independent arithmetic):**
- Every operation line: rate × time ÷ OEE + labour rate × time × crew ÷ efficiency.
- Hole time: the 10 drilled holes plus 11 cored bores and lands come to 7.93 aluminium-baseline min × 1.6 = 12.69 min.
- Turning: 67.7 cm³ ÷ 100 + 225.8 cm² ÷ 75 + 0.30 = 3.99 min, plus 1.2 min loading.
- Material and consumables.
- Melt energy: 0.64 kWh per kg poured.
- Tooling: £104,623 ÷ 100,000.

All matched the tool to the penny.

## What is stated, not measured (for the review)

- **Material price.** Ductile iron £0.86/kg (June 2026, *not re-sourced* in the September refresh: low confidence).
- **Per-part services (advisor rates).** 100% X-ray £5.00, stress relief £0.35/kg, shot blast £0.56.
- **Patterns.** Life 8,000 moulds (a metal pattern plate on a production line typically lasts longer, so tooling per part may be overstated; its total is £1.05).
- **Machining routing.** Split 3-axis plus a drilling centre (4 fixturings) plus the lathe, cost-ranked by the tool. A dedicated HMC line would be cheaper at 100k/yr.
- **No grinding.** Ground bearing seats, if the drawing calls them, are extra.
- **Route.** Casting is one of two common routes for a stub axle. A **forged-steel** stub axle is the other, and the tool costs it on the forging route.
- **Not an accuracy claim.** Nothing here has been compared with a price paid. These are the tool's numbers, checked for consistency, not for truth.

## Tests

- `tests/stub-axle-live.test.ts` (14 tests).
- `tests/cad-error-hint.test.ts`.
- The real-parts baseline, re-recorded with PRCR002's corrected answers: cast iron, safety-critical. It had been recorded as an aluminium housing. Only that part moved.
- `CAD_PROMPT_VERSION` 50, so a stub axle analysed before this change is not replayed from the cache.
