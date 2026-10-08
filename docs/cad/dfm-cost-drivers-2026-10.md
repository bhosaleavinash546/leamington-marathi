# DFM cost drivers and Design to Cost (Oct 2026)

What the geometric DFM now finds, what it was getting wrong, and the live
Design-to-Cost tab built on it. Tests: `tests/dfm-cost-drivers.test.ts`,
`tests/design-to-cost.test.ts`, `tests/sprint6-honest-uncertainty.test.ts` (restack).
Live: `npx tsx e2e/dtc-live.ts` (real STEP → server → DFM job → the tab).

The golden rule holds: no figure here is set by a model. Every DFM £ is priced by
the costing's own constants (`cost-impact.ts`), and every Design-to-Cost figure is
the costed input re-run through `computeUniversalStack`.

## 1. Kernel feature recognition (`server/utils/cad-geometry-engine.py`)

**One cylinder pass** (`_cylinder_features`) serves the costing's feature table and
the DFM extraction (cached per shape — both read it in one DFM run).

- A cylinder is its axis LINE (foot point + sign-normalised direction) + radius +
  concavity. Grouping by direction alone merged parallel holes (the manifold's four
  Ø11 bolt holes read as one 229 mm hole).
- Concavity = face orientation XOR parametrisation handedness (orientation alone
  mislabelled holes).
- Full (arc-sum coverage ≥ 0.83 of a turn) = hole / boss; partial = a fillet with a
  sweep. Corner rules ask `isBlend` (sweep ≤ 120°) — a slot end is not a corner.
- Two end tests: **breakout** (point samples from 0.5 mm to 0.6R + 0.5 mm past the end,
  blind if any is in material — through / blind) and **access** (a ray to the part's
  extent — `openDirs`, tool reach). One classifier, re-pointed per sample, and the
  first sample in material settles it (the per-point classifier rebuilt the solid
  explorer each time and ran the 3,444-face fuel tank past its budget).
- Collinear full-hole segments with air between them are one hole in the costing
  table (a cross hole through both walls), depth = the sum of the spans.

**Draft and undercut — a two-half tool** (`_release_table`, `_release_blocked`,
`_faces_cavity`). Three defects, all in the costing path too
(`draftAnalysis.undercutFaceCount` drives slides, cores and the moulding / roto /
forging complexity):

| Defect | Was | Now |
|---|---|---|
| One-way draw | a face whose normal points against +draw was an "undercut" — every wall and floor of the lower half | a face comes out of the half it faces (sign of n·d); it is an undercut only when the part BLOCKS its line of release (`blockedAtMm`) |
| Fixed +Z in the DFM pass | the per-face findings ignored the pull-direction search | the extraction uses the chosen draw (`drawDirectionXYZ`) |
| Geometric normal | the aggregate count took the surface normal without flipping REVERSED faces | material-outward normal at a point INSIDE the trimmed face (`_face_point`) |

End faces (normal along the draw) are tested too: the top of a snap window through
a side wall has no draft but is blocked by the window's bottom — that is the side
action. A blocked face that looks into an ENCLOSED cavity (≥ 85 % of rays into its
half-space hit the part) is the inside skin of a hollow body — formed by air
(blow), gravity (roto) or a core (casting), never by a slide — so it is
`facesCavity` / `cavityFaceCount`, not an undercut. Cavity is probed per connected
group of blocked faces (three spread probes; all faces if they disagree).

**Undercut regions.** Blocked faces that touch, or share a blend or a side wall
(a plane parallel to the draw — the face a slide pulls out through), are one
`undercutRegion` = one slide / lifter / core. The moulding pricer charges one slide
per region (`costGroup`, counted once by `totalCostGBP`) — it charged one per face.

Checked on the modelled parts:

| Part | One-way kernel | Now |
|---|---|---|
| IM ECU cover (4 snap windows, 2 per long wall) | 4 "undercuts" = its drafted outer walls; windows missed | 8 window faces, 2 regions → 2 slides |
| IM cable clip (latch window through both walls) | 0 | 2 faces, 1 region |
| IM storage tray | 4 (drafted walls) | 0 |
| BM washer reservoir / ROTO coolant tank | 8 each | 0 undercuts, 11 cavity faces |
| Casting bracket | 17 | 0 |
| Fuel tank (3,444 faces) | timed out | 54 undercut faces (agg.), 704 cavity faces; 178 s |

The screen now polls the DFM job for ~320 s (was ~170 s) — past the kernel's own
budget, so a large part's report still lands.

## 2. Rules added (each with a source; see the rule files)

- `machining.setup.access-directions` — fixturings beyond two, priced (handling by
  part weight, fixture at the toolroom factor, CAM programming, amortised).
- `machining.hole.compound-angle` — one finding per off-frame direction group.
- `machining.hole.intersecting` — cross holes (burr at the breakout).
- `machining.hole.many-sizes` — priced by tool changes.
- `machining.corner.long-reach-cutter` — corner L/D > 4 (standard) / 6 (long).
- `casting.hole.beyond-cored-depth` — HPDC blind hole past the NADCA cored depth.
- `moulding.hole.core-pin-slender` — blind > 3×D (2×D under Ø5), through > 6×D.
- Guards: `plausibleWall` (single-ray readings that are envelopes or slivers),
  `isBlend`, `undercutEvidence` (one wording for the four undercut rules).

## 3. Design to Cost tab (`src/engine/design-to-cost.ts`, `src/ui/design-to-cost-panel.ts`)

Modelled on Boothroyd Dewhurst Concurrent Costing / aPriori: the target next to the
should-cost, and the levers that close the gap, live.

- **Should-cost / Target / Gap / Projected** — the target is the form's target price
  (display currency → £); ±5 % is on target, as on the cost card.
- **Design levers** — each geometric DFM finding with a modelled £, as a switch, with
  "Show faces" (highlights them in the viewer). `findingVariant` takes EXACTLY the
  finding's £ off the factory base: the time off the operation is £ ÷ that op's cost
  per hour of cycle after parts per cycle, OEE and crew (the old restack divided by
  machine + labour rate and overstated a machining finding by ~1/OEE); tooling
  findings come off the tool NRE. The DFM panel's restack reads the same function.
- **Cost drivers** — material, each operation, tooling, packaging, logistics, each
  with its share of the piece price through the stack (they add up to the headline),
  and the value it would have to fall to for the part to hit the target ALONE,
  everything else held ("cannot close the gap alone" when it is too small).
- **What-if** — part mass, the three costliest operations' cycle, tool amortisation
  volume (commercial, labelled so). These are the stack's sensitivity: a module
  would move other inputs with them.

Every switch and slider re-costs the part; nothing is added up by hand.

## 4. Uploaded real parts — observations and the bugs they exposed

Kernel with `CV_EXTRACT_FEATURES=1`, then `analyseGeometricDFM` at UK rates, 50,000 / yr. Commodity as the part
would be costed (the harness's choice, stated). Times on the 4-core session container.

| Part | Commodity | Kernel | What the DFM says now |
|---|---|---|---|
| Fuel tank (3,444 faces) | blow | 178 s alone (timed out before) | 110 corners R1.5 vs 8.4 mm (2× wall); 10 outside undercut faces in 10 regions; ~700 inside-skin faces are cavity, not undercuts |
| Brembo caliper | cast + machine (gravity) | 28 s | draft 0° ×93, section steps to 16:1, hot spots, 10 undercut faces; 6 bore sizes. **The file declares mm and measures 777 × 340 × 470 mm, 30 L — about 3× a real caliper: check the model's scale before trusting its cost.** |
| Gearbox housing | cast + machine (HPDC) | ~100 s | 11 blind Ø6.6 × 27 holes past the NADCA cored depth (£3.31 — drilled, the sheet assumes cored); 14 hole sizes; 5 fixturings on a 3-axis machine (£2.64); 2 compound-angle bores; 5 cross holes |
| Hollow driveshaft | machining | 32 s | Ø35.5 / Ø29.9 non-standard sizes (a tool change each, £0.19); 2 fixturings (bore + one rotary index) — was 21 |
| Eingangswelle (input shaft) | machining | ~65 s | Ø9 × 271 mm gun-drilled bore (30:1); two tooth rings (78 + 48 roots) — gear / spline cutting, not corners. Was 126 "R0.1 corners" priced £52.47 |
| Steering knuckle | cast + machine (sand) | 8 s | 4 fixturings; 9 bore sizes; draft, section and hot-spot findings; 1 undercut face (was 4 incl. 0.3 mm² slivers) |
| PRCR002 / stub axle | cast + machine (sand) | 10 s | 3 fixturings; 14 hole sizes; spindle bores 9° off-axis (one compound-angle group); 8 undercut faces (cores) |
| Part1 | machining | 8 s | 7 sizes; Ø43 non-standard; compound-angle Ø14 / Ø8 bores at 43.6°; cross holes |
| Model Mania 2017 | machining | 2 s | angled features round one axis — 2 fixturings, no finding (was 7 setups); its 6 × R2 hexagon corners stay corners |
| Servo horn | machining | 3 s | Ø5.1 / Ø4.9 non-standard sizes |
| Bumper / close volume | moulding / panel | 55 s / 23 s | 99 % / 97 % free-form: the report now LEADS with "only N of M faces could be judged" |
| Hood / seat brackets | sheet metal | ~28 s | nothing fired; the sheet rules are few (limitations say so) |

Bugs found and fixed from these runs:

1. **Tooth roots read as end-milled corners** (input shaft): `toothedSets` — ≥ 12 concave blend roots of one radius on a
   ring round one axis, root ≤ 5 % of the ring radius — are set aside from every corner rule and reported as a tooth
   form (`machining.feature.toothed-form`, costed on the gear route). A hexagon pocket (6 × R2 on 13 mm) and flange
   scallops (half-cylinders) are not tooth forms.
2. **Radial directions counted as separate setups** (driveshaft 21, Model Mania 7): directions perpendicular to one axis
   (≥ 3) are one rotary-indexed fixturing (`indexedGroup`); the detail says what a plain 3-axis machine needs.
3. **A non-standard size priced as the whole hole** (driveshaft £18.35): it is now one tool change per distinct size
   (`costGroup`) — moving to a standard size does not delete the hole, and the DtC tab offered it as if it did.
4. **Grazing and sliver "undercuts"** (gearbox 9 faces at 0.33 mm, knuckle 0.3 mm² slivers): the release probe starts
   0.1 mm off the face, an obstruction nearer than 0.5 mm is ignored (below casting / moulding tolerance), faces under
   1 mm² are not judged alone, and a blocked face is confirmed at two more spread points.
5. **Free-form silence read as a pass** (bumper, close volume): the limitation above.
6. **Fuel tank timed out**: one classifier per run, breakout only on full cylinders, a shared release table, face
   geometry and adjacency cached across the draw candidates, cavity probed per connected group, undercuts confirmed only
   after the cavity vote — 178 s alone; the screen's DFM poll lengthened past the kernel budget.
7. **DtC drivers missed the rest of the material line** (live manifold: drivers £40.01 v headline £40.99): consumables /
   services and bought-in content are drivers now — the drivers add up to the headline, pinned by test and by
   `e2e/dtc-live.ts`.

### Real-parts baseline moves (re-measured, `--update`)

All from the two-half undercut test and the draw it now chooses:

| Part | Before | After | Why |
|---|---|---|---|
| Casting bracket | £41.38 | £39.46 | 17 one-way "undercuts" → 0: no cores / complexity on a part that has none |
| IM cable clip | £0.39 | £0.47 | its latch window is now found (0 → 2 faces): a slide in the tool |
| IM ECU cover | £1.92 | £2.00 | 4 drafted walls (not undercuts) → the 8 snap-window faces (side actions) |
| IM storage tray | £8.21 | £8.10 | 4 drafted walls were not undercuts |
| PRCR002 (stub axle) | £86.92 | £84.09 → £84.25 | draw Z → Y (fewest blocked faces): 2 impressions fit the flask, sand time per casting halves; pattern £7,037 → £9,305 over twice the life. After the review fix (#1) its cross passages count again (25 → 32 undercut faces, draw X): pattern +£0.14 a part |
| ROTO coolant / header tank | £55.89 / £21.49 | £51.84 / £20.49 | inside skins are cavity faces, not undercuts: the tool is no longer scored "complex" |
| RUB AV mount / grommet | £2.28 / £0.68 | £2.19 / £0.65 | 4 one-way undercuts → 0 (mount); the grommet's draw moves to Y |

Undercut counts also moved, with no cost change, on the BIW panels, composites, thermoforming covers, Part1, the seat
bracket and the knuckle (their routes do not price undercuts).

## 4b. Independent review (Oct 2026) — fixed

| # | Defect | Fix |
|---|---|---|
| 1 | The cavity probe (≥ 85 % of rays into the face's half-space hit) called a long cross bore in a SOLID part "the inside of a hollow body" — the manifold, Part1 and the stub axle lost cross passages from the undercut count, and the casting rules their cores | Cavity = every direction of the FULL sphere (26 + ±axis for a cylinder) hits the part: a bore always opens along its axis. A group's three probes decide by majority. Fixture `cross-bore-features.json` |
| 2 | ±X / ±Y of every prismatic block are perpendicular to Z, so `indexedGroup` collapsed them into one "rotary index" and the setups finding went silent | A rotary index needs ≥ 2 of its directions OFF the part frame (a radial pattern), else the sides stay separate 3-axis fixturings |
| 3 | DtC took out cost the sheet does not carry (a hole it assumes is cored), offered whole-feature prices as redesign savings, and removed one hole twice when two rules priced it | `NOT_IN_STACK_RULES` are listed as costs to ADD, never levers; whole-feature prices are tagged "upper bound"; levers applied together share a `removed` ledger keyed like `totalCostGBP` (feature once, cost group once) |
| 4 | A slide lever multiplied the per-part figure back by the stack's amortisation volume (a £3,000 slide read £15,000 when the stack amortised over 250k) | The pricer carries `nreGBP`; the lever takes that off the tool |
| 5 | Undercut regions joined across ANY non-planar neighbour — a round cup's wall made its 4 windows one slide | Only across a blend (a torus, or a cylinder ≤ R10) or a side-wall plane |
| 6 | A ring of milled pockets read as gear teeth and lost its corner checks | A tooth ring needs ≥ 24 roots (12 teeth); smaller splines are judged as corners, stated |
| 7 | DtC applied the last upload's DFM levers to any later costing | Only when the costing on screen is the applied CAD part (commodity and part name); clear / new file drop the old report |
| 8 | `_face_points` could raise on a face with one or two inside points (the uv-mid was listed twice) | De-duplicated grid; confirms from the points there are |
| 9 | "Exactly the finding's £" failed when labour time was shorter than the cycle | The time is solved with labour falling hour for hour until it runs out, then machine alone |
| 10 | The release-table cache key ignored a missing intersector; the per-face pass built an intersector even on a hit | Key carries it; the intersector is built only on a miss |

## 5. What it still cannot see

- One ray per face for release: a face partly shadowed reads by its sample point.
- Draw candidates are the three principal axes; a part whose parting is off-axis
  reads its undercuts against the best principal axis (and the >50 % guard withdraws
  them when none fits).
- Cylinders and planes only in the draft count; free-form undercuts are not counted.
- DtC drivers and what-ifs hold everything else equal — a lighter casting also cools
  faster; the module would move its cycle. They set targets; they are not a redesign.
