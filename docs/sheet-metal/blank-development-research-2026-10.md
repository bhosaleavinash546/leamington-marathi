# Developing the flat blank inside CostVision — research, 1 October 2026

How to bring what FASTBLANK does into the sheet-metal and BIW should-cost, so
that a formed part costed from its STEP file is costed on its real blank and not
on a guess. This updates the September research (`research/fastblank/README.md`)
with what has been built since, a fresh look at the methods and the market, and
one new finding that changes the first step.

## 1. Where we are today

| Piece | State | Where |
|---|---|---|
| Read the FASTBLANK DXF when CAPPe has one | **Built.** Gross and net area, outer and hole perimeter, bounding rectangle, units check, 11 tests | `server/utils/dxf-blank.ts`, `routes/cad.ts`, `tests/dxf-blank.test.ts` |
| Use the DXF blank for the strip rectangle, pitch, strip width, die footprint | **Built.** The rules prefer a developed blank and say so on the basis line | `cost-input-rules/commodities/sheet-metal.ts::blankDims` |
| Use the DXF **cut length** for blanking force and the press pick | **Built 1 Oct** (`sheetMetal.perimeterMm` rule: DXF outline + holes → B-rep identity → 2(L+W) last) | `cost-input-rules/commodities/sheet-metal.ts`, `to-cost-params.ts` |
| Blank when there is no DXF | **Estimated**: formed-part bounding box × 1.05, labelled as such. **Since 1 Oct** the basis adds a CHECK when the rectangle is more than 15% away from the metal the part needs (V/t + holes) | `blankDims` fallback |
| Net blank area and cut length from the solid | **Built 1 Oct**: net = V/t, gross = net + holes, cut = (S − 2V/t)/t, trusted only on a bend-measured gauge | `cost-input-rules/derive/blank.ts` |
| Gauge from the STEP | **Since 1 Oct** the radius step between a bend's inner and outer face (`thicknessSource: 'bend-pairs'`), 2·V/S as the fallback. Seat bracket: 1.60 mm from 15 pairs; 2·V/S gave 1.55; the old ray-cast gave 0.53 | `cad-geometry-engine.py::_gauge_from_bend_pairs` |
| Bend count and bend length from the STEP | Built (cylinder faces spanning the width) | same |
| Develop the blank ourselves | **Built 1 Oct (phase 1)**: the kernel exports the two skins (`--skin-mesh`, pure OCP), TypeScript flattens them (Tutte start, ARAP, envelope Cholesky, no numpy) and writes the outline, holes, minimum rectangle and a DXF. Runs on every sheet STEP with no DXF attached; the rules cost on it. Seat bracket: 486 cm² gross, 279 × 210 mm, 21 holes, 946 + 983 mm of cut, skins agree within 0.05%, ~5 s a skin. Stretch-formed regions are detected by strain and flagged | `server/utils/blank-unfold.ts`, `services/blank-development.ts`, `tests/blank-unfold*.test.ts` |
| Nesting | Research prototype only (`nest.py`) | — |
| Forming properties (n, r, yield, FLC) in the material library | **None.** The library holds prices and density only | `rate-library.ts` |
| BIW stamping process (draw addendum, blanking line, tailor-welded blanks) | Not modelled; BIW module costs assembly stations and joints only | `modules/biw-assembly.ts` |

Phase 0 ("fix now") was done on 1 October: on the seat bracket the cut length
the press is sized on went from 1,012 mm (the rectangle) to 1,940 mm, the
blanking force from 45 t to 89 t and the press from the 100 t to the 200 t tier.
The part's cost moved by less than a penny, because the press rate is a small
share of a stamping; the material and tooling buckets wait on the outline (Phase 1).

## 2. What FASTBLANK and CostOptimizer actually do

From Hexagon/FTI's own material (sources at the end). This is the feature map we
are matching against, not a wish list.

**FASTBLANK** (the estimator's module)
- Imports the formed part (IGES/STEP/CATIA/NX/Creo; a Lite version is embedded
  in ZW3D and Creo).
- Fills holes and trims so the skin is one surface, picks the forming
  direction, lets the user set pressure pads, blank-holder force, pilot holes and
  pilot slots.
- Solves with a one-step inverse method ("Coupled Hybrid Inverse"): the formed
  shape is pushed back to the flat using the material's stress-strain curve, so
  stretch and thinning are respected. Most parts solve in 30 seconds to 5 minutes.
- Outputs: the developed blank outline (smoothed, DXF/IGES), a thinning and
  thickening map, major and minor strain, a formability check, and an HTML or
  Excel report.

**CostOptimizer** (on top of FASTBLANK)
- Blank nesting on the coil: 1-up, 2-up, two blanks, mirrored; constraints on
  pitch, coil width and rotation angle; progressive, transfer and tandem layouts;
  seven standard cut-off outlines for cut-off dies.
- Reports blank size, material yield, gross weight; costs the material.
- Advanced: tailor-welded blanks with a different material per zone.

Everything in that list that touches money is **arithmetic on a blank outline**:
area, perimeter, rectangle, pitch, strip width, yield. The only genuinely hard
part is producing the outline for a drawn panel. That split drives the plan below.

## 3. Methods, re-checked

### 3.1 Bent parts (brackets, reinforcements, press-brake work): no solver needed

A bent part is developable: the sheet is only folded, never stretched. Its blank
follows from the B-rep directly.

- **Bend allowance per bend**: BA = θ · (R + K·t), with K from the r/t ratio
  (DIN 6935 tables; K ≈ 0.33 below r/t = 1, 0.38–0.40 for ordinary air bending,
  0.45–0.50 above r/t = 3). This is what FreeCAD's SheetMetal unfolder and every
  CAD unfold command do: build the face graph, unroll each cylindrical bend face
  at the neutral radius, lay the flats out. FreeCAD's unfolder is open source
  (LGPL) and is a worked reference for the face-walk, the K-factor sheet by r/t,
  and the failure cases (non-cylindrical bends, hems, counter-bends).
- **New finding (1 Oct 2026)**: for the blank *quantities* the cost needs,
  the unfold is not even required. On the real Seat Locking Bracket STEP, three
  numbers the kernel already measures reproduce the ARAP prototype's answer:

  | Quantity | From the B-rep | Unfold prototype (Sep) |
  |---|---|---|
  | Gauge (radius difference of coaxial bend cylinders; 23 pairs agree) | **1.60 mm** | 1.6 mm |
  | Net blank area = volume ÷ gauge | **444.2 cm²** | 444 cm² |
  | Cut length = (surface area − 2 × net area) ÷ gauge | **1,940 mm** | 1,939 mm (954 outline + 985 holes) |

  The identities hold because a sheet solid's surface is two skins plus the edge
  band, and the edge band's area is cut length × gauge. They are exact for any
  developable part and a close upper bound on cut length for a drawn one.
  Gross area (the metal bought) is net area plus the hole areas, and the kernel
  already lists the holes with their diameters.

  This gives a **net blank, cut length and a trustworthy gauge from every STEP,
  with no new solver**, in TypeScript, from fields the geometry JSON already
  carries. It also replaces the ray-cast gauge that misreads the bracket at
  0.53 mm, which matters because every blank number divides by t.

What it does not give: the blank *outline* and rectangle. For those, Phase 1
below unfolds the faces (bent parts) and Phase 3 solves (drawn parts).

### 3.2 Drawn parts (body panels, cups, deep reinforcements): physics is required

- Geometry-only flattening of a drawn cup came out **13% short** in September.
  Metal is incompressible, so the blank must carry the stretched area back.
- The standard answer is the one-step inverse method (FASTBLANK, AutoForm-OneStep,
  NX One-Step): a membrane finite-element solve from the formed mesh back to the
  flat, with a plastic constitutive law. Published work uses an ARAP
  parameterisation as the starting point and then minimises plastic work, which
  is exactly what the September prototype did; it was within 0.62% of the
  textbook cup blank at three mesh sizes.
- What stopped the prototype was speed on real meshes (60k triangles, minutes in
  L-BFGS) and zero-area triangles from refinement corrupting the strain map. The
  fix is known: a sparse Cholesky factorised once and reused across ARAP
  iterations (the system matrix does not change), a Newton step for the plastic
  pass, and mesh cleanup before the solve. `geometry-processing-js` ships a
  sparse Cholesky in plain JavaScript, so the solver can be TypeScript without
  numpy, which the Windows package deliberately does not carry.
- Formability needs material data we do not hold: n-value, r-value, yield and
  thickness per grade. The Keeler–Brazier formula gives the plane-strain forming
  limit from n and t alone, FLC₀ = ln(1 + (23.3 + 14.13·t)·n/21) (valid for
  n ≥ 0.21, t ≤ 3.1 mm); the rest of the curve follows standard slopes. That is
  enough for a pass/fail on thinning, which is what an estimator uses it for.

### 3.3 Nesting and yield: arithmetic, already prototyped

`nest.py` reproduced CostOptimizer's core: strip width = blank height across the
coil + edge margins; pitch = the smallest advance at which the next blank clears
by the web, measured exactly along scanlines so non-convex blanks interlock;
tried 1-up and 2-up turned 180°. On the L-blank: 94.6% utilisation 2-up against
71.7% 1-up rectangle. Industry figures put typical utilisation at 60–85% and
layout decisions at up to 5–7% of material cost, so this is a real lever, and a
2-up layout has to be shown as a trade-off against a dearer two-blank die, not
applied silently.

### 3.4 BIW stamping process facts that the cost model should carry

- A drawn panel's blank includes the **draw addendum and binder** that the trim
  die cuts off; the trimmed flange is typically under 15% of the blank, and
  door rings and inner panels add engineered scrap from the cut-outs.
- Tailor-welded blanks cost up to ~30% more than the plain coil for a door inner,
  but save 5–20% on the finished door (roughly 1–4 € a vehicle); a cost model
  must carry both sides.
- Laser blanking lines run up to ~45 blanks a minute and claim up to 10% better
  utilisation than a blanking die, at no die cost; a blanking operation is a
  real line step for tandem and transfer parts and is missing from the module.

## 4. Build or buy

| Route | What it is | Verdict |
|---|---|---|
| Keep reading the FASTBLANK DXF | Already built; JLR's validated number wins whenever it exists | Keep, always first |
| Analytic blank from the B-rep (§3.1) | Net area, gross area, cut length, gauge from volume, surface, bends and holes | **Do first**; days, no new dependency, fixes two live errors |
| Our own unfolder for bent parts | Face-graph unroll with DIN 6935 K-factors, in TypeScript over the kernel's face table, outline + DXF out | Build; ~2 weeks |
| Our own one-step solver for drawn parts | ARAP start + plastic-work pass, sparse Cholesky, in TypeScript | Build after the above; 4–6 weeks; the risky item |
| Licence FASTBLANK Lite the way ZW3D and Creo did | FTI OEM-licenses an embedded one-step unfolder to CAD vendors; price not public | Ask Hexagon for a quote in parallel; it would replace the drawn-part solver, not the rest |
| Replicate full FASTBLANK (friction, blank-holder force, springback) | — | No. FASTBLANK stays the reference for final decisions |

Pricing for FASTBLANK, CostOptimizer or an OEM licence is not published; the
only way to know is a quote.

## 5. Plan, revised

| Phase | What it delivers | Depends on | Effort |
|---|---|---|---|
| **0 · Fix now** | (a) Pass the DXF's outline + hole perimeter into tonnage and the press pick. (b) Gauge from coaxial bend cylinders, falling back to the ray-cast. (c) Net blank area = V/t, gross = net + holes, cut length = (S − 2A)/t from the geometry JSON, with the basis stated on each field. (d) Flag when the bounding-box estimate differs from the analytic blank by more than 15% | nothing new | 3–4 days |
| **1 · Bent-part unfold** — **done 1 Oct** | Outline and rectangle by flattening the skin mesh (ARAP), not a face-graph walk, so B-spline flanges unfold too; K = 0.5 mid-surface (mean of the two skins); DXF out; holes carried; a stretch-formed or drawn skin is flagged by its strain, never silently costed as bent | kernel skin export (built) | done |
| **2 · Nesting** | 1-up / 2-up / mirrored on the coil, pitch and width constraints, grain rule; utilisation and gross weight into material; 2-up shown as a die trade-off | Phase 1 outline or DXF | ~1 week |
| **3 · Drawn-part solve** | ARAP start + plastic-work pass in TypeScript; thinning map; Keeler–Brazier pass/fail; forming properties added to the material library as data (n, r, yield, FLC₀) | mesh export from the kernel (exists) | 4–6 weeks |
| **4 · BIW process** | Draw addendum and binder allowance on drawn panels; blanking-line operation (die or laser); tandem/transfer sequence (draw, trim, pierce, flange, restrike); planned scrap; tailor-welded blanks with per-zone material | Phases 0–2 | 2–3 weeks |

Phase 0 is new in this form: the September plan put the analytic blank inside
Phase 1 and did not know the identities would hold this closely on a real part.

### 5.1 What phase 1 found on the seat bracket

The flattening converges to a stable outline (486.2 cm² from 800 iterations on,
486.3 at the 400 the tool runs) but not to zero strain: 2.2% on average and 8%
at the 95th percentile, area-weighted. On the synthetic bent L-bracket the same
code gives 0.00% strain and the developed length to the mesh's chord error, so
the strain on the bracket is the part, not the solver: its B-spline flanges are
stretch-formed, which is why the net flat area (441 cm²) sits 0.7% under V/t
(444 cm²) — the metal thinned there. The tool now says so on the blank and
drops the confidence from 0.85 to 0.75; a drawn panel (over 15% strain) goes to
0.6 and asks for the FASTBLANK profile. Phase 3 (the physics pass) is what
would put the stretched area back.

## 6. How it is proved

- **Regression against FASTBLANK.** Every part CAPPe has flattened is a test
  case. Ask for 10–15 STEP files with their FASTBLANK DXF and report, across
  brackets, reinforcements and two or three drawn panels. Targets: ±2% blank area
  on bent parts, ±5% on drawn parts, ±3% on cut length.
- **Hand-checkable cases stay in the suite**: the L-bracket and the drawn cup
  from `validate.py` (0.001% and 0.62%).
- **The real-parts baseline** (`tests/real-parts-baseline.test.ts`) pins the
  seat bracket; Phase 0 will move its blank from 637 cm² bought to about 490 cm²
  gross and its cut from 1,012 to 1,940 mm, so the baseline is updated with that
  reason in the commit.
- Nothing here has yet been compared with a price JLR paid; the blank is an
  input, and the proof of the cost is still logged actuals.

## 7. What is needed from JLR

1. The 10–15 parts with FASTBLANK outputs (above).
2. The forming properties JLR already uses for its grades (n, r, yield, FLC₀ or
   a FLC file) so the material library can carry them as data.
3. Coil constraints per press line: widths available, max pitch, edge margin and
   web rules, so the nesting constraints are real.
4. A FASTBLANK Lite / OEM licence quote from Hexagon, to compare against the
   Phase 3 build.

## Sources

- FASTBLANK product description, DirectIndustry: <https://www.directindustry.com/prod/fti-forming-technologies-incorporated/product-112599-1772505.html>
- FASTBLANK brochure (FormingSuite module): <https://www.itscz.eu/doc/brozury_file/fastblank-46.pdf>
- FASTBLANK on SoftwareOne (Hexagon): <https://platform.softwareone.com/product/fastblank/PCP-2276-8302>
- CostOptimizer Advanced, DirectIndustry: <https://www.directindustry.com/prod/fti-forming-technologies-incorporated/product-112599-1772480.html>
- BlankNest catalogue (FTI): <https://pdf.directindustry.com/pdf/fti-forming-technologies-incorporated/blanknest/112599-397715.html>
- FTI CostOptimizer overview: <https://www.paralogix.co.id/portfolios/fti-forming-costoptimizer/>
- ZW3D FastBlank Lite release: <https://www.zwsoft.com/news/products/920>
- FASTBLANK for PTC Creo: <https://www.digitalengineering247.com/article/forming-technologies-announces-fastblank-for-ptc-creo-parametric>
- FreeCAD SheetMetal workbench (unfolder, K-factor sheets): <https://github.com/shaise/FreeCAD_SheetMetal>
- DIN 6935 bend allowance and K-factor: <https://www.mechanixcalc.com/standards/din-6935>
- One-step inverse forming with an ARAP start (mesh parameterisation based on one-step inverse forming): <https://www.researchgate.net/publication/220583374_Mesh_parameterization_based_on_one-step_inverse_forming>
- One-step inverse isogeometric analysis: <https://www.sciencedirect.com/science/article/abs/pii/S0045782519301306>
- ARAP parameterisation (Liu et al.): <https://igl.ethz.ch/projects/ARAP/arap_web.pdf>
- Sparse Cholesky updates for interactive parameterisation: <https://igl.ethz.ch/projects/sparse-cholesky-update/sparse-cholesky-update-paper.pdf>
- geometry-processing-js sparse Cholesky: <https://geometrycollective.github.io/geometry-processing-js/docs/module-LinearAlgebra.Cholesky.html>
- Keeler–Brazier forming limit prediction: <https://www.sciencedirect.com/science/article/abs/pii/S1526612516300615>
- Nesting and material utilisation in stamping: <https://ifactoryapp.com/article/ai-coil-yield-optimization-blank-nesting-stamping>
- ArcelorMittal tailored blanks, nesting optimisation: <https://automotive.arcelormittal.com/tailored_blanks_home/LWB_innovation/LWB_Nesting_Optimization>
- Tailor-welded aluminium doors, cost: <https://www.lightmetalage.com/news/industry-news/automotive/reducing-the-cost-of-aluminum-car-doors-with-tailor-welded-blanks/>
- Laser blanking (AHSS Guidelines): <https://ahssinsights.org/forming/cutting-blanking-shearing-trimming/laser-blanking/>
- Draw addendum and trim dies for body panels: <https://alsettevs.com/what-kinds-of-dies-are-used-for-car-body-panels/>
