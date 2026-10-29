# CAD to COST — readiness assessment (29 Oct 2026)

Written after the compare-routes build (rounds 1 and 2) and the five-part live review. It answers three questions:
what changed, measured before and after; whether the arithmetic and the industrial realism improved; and whether the
tool should go to a wider team.

## 1. What was built in this round

| Area | Before (28 Oct) | After (29 Oct) |
|---|---|---|
| Compare routes | One table of every candidate route, costed whether or not the part could be made that way (a steel knuckle offered injection moulding); four columns; no basis; the reference row's band differed from the cost card's. | Feasibility screen before costing (`route-feasibility.ts`, 15 checks each with a source); only feasible routes in the part's own material family are costed; every casting / forging PROCESS is its own row; each row carries 8 buckets, net / bought mass, tooling investment + amortisation, operations by machine class, an independent re-add of the row from its trace (closes to ½ p), the spec it was costed to (answered / assumed / comparison / not asked), a Monte-Carlo band, a volume ladder 5k–500k re-costed at every point, crossovers interpolated between two real re-costs, tooling payback and programme spend. Screen, PDF §9b and Excel 8-Routes print what the screen drew. |
| Guards | A process-plausibility check fired against the placeholder commodity while the route question was open and blocked Get cost (battery rail). | Dropped while the route is open, run once it is answered. |
| Commercial fields | Any figure accepted (810 % margin marked Typed). | Stated ranges; out-of-range refused and restored. |
| Reports | Feature lists in every operation name; raw trace keys, raw answer ids, library ids as headings; rate-book bookkeeping ("Was £…", refresh logs, cross-references) in client text; Greek letters lost; a Medium price grade as an Engine Warning; short tab labels as commodity names. | 18 report findings fixed at source (`operation-names.ts`, `money-text.ts::reportNoteText`, `decision-text.ts::decisionAnswerLabel / coverWarningText`, `COMMODITY_REPORT_LABELS`, `winAnsiSafe`). |
| Screen | Comparison scrolled sideways; changelog prose in help; emoji; two primary buttons at step 2. | Two rows a route; wording; one primary action. |

## 2. Measured before and after

| Measure | Before | After |
|---|---|---|
| Harness checks, five parts | 275 pass / 20 fail (rail blocked at step 2, margin accepted, 2 tolerance) | 278 pass / 0 fail on the product (rail reaches £33.91) |
| Parts that reach the cost step | 4 of 5 | 5 of 5 |
| Audited patterns in the dumped PDFs + workbooks (feature lists, raw ids, "Was £", refresh logs, cross-references, Greek loss) | 60+ matches across 5 reports | 0 |
| Screen = headless (reference row v headline) | equal | equal, and now the same band |
| Route rows re-added independently from the trace | not done | every costed row closes to ½ p |
| Infeasible routes offered | yes (moulding on a steel part; sheet metal on a 15 mm wall) | none; each refusal stated with its limit and source |
| axe WCAG 2.1 AA, both themes, every step | 0 | 0 |
| Unit tests | 4,076 of 4,079 (3 pins of the old wording) | 4,080 green |
| Accuracy against prices paid | unmeasured (0 actuals) | unmeasured (0 actuals) |

The last row is the honest one. Every figure above measures internal consistency, completeness and presentation. None
measures whether £17.32 is what a hub flange costs.

## 3. Arithmetic — where it stands

What is now proven, by test and by live run:

- One engine (`computeUniversalStack`) prices every row; the screen, the headless chain and the comparison agree to the penny.
- Each comparison row is re-added from its own trace with independent arithmetic (ops = rate × time ÷ OEE ÷ parts per cycle; material = gross × price − scrap + energy + consumables; tooling ÷ amortisation; overhead and margin as the core) and closes to ½ p. A row that does not close says so.
- Crossovers come from two real re-costs either side of the crossing, never a formula; where the bands overlap the row says "indistinguishable" rather than naming a winner.
- Tool decisions (cavitation, stamping v laser + brake) rank on the amortisation the costing carries; tool wear sizing keeps a stated 5-year default.

What the arithmetic cannot do: it reproduces the rules exactly. If a rule is wrong for the industry, the arithmetic is exactly wrong.

## 4. Industrial realism — part by part

This is the section the Director should read. Each judgement is mine as a cost engineer reading the costing; none is
measured against a paid price.

**Hub flange, forging, £17.32.** Closed die on a 1,600 t mechanical press at 11 s a hit, flash trimmed in line, 38MnVS6
controlled-cooled from forge heat with no separate Q&T, 67 % material yield — all consistent with how a European forge
runs this part. The machining is not: 10.5 min on a 3-axis VMC for a round flange. A forge's machine shop turns the
faces and bore on a CNC lathe and drills the bolt circle on a drill centre, 3–5 min total. The kernel's turning
signature did not fire on this flange (its revolved area is below the 20 cm² / 8 % threshold used for spindles), so
the flange went to the milling model. Effect: process + labour on this part are high by perhaps £2–3.

**Stub axle, cast and machine, £52.85.** Ductile iron EN-GJS-500-7 in green sand with cores, 98 % metal yield with
gating remelted, shot blast, fettling, melt shop labour — right. Three figures are rules that do not match volume
practice:
- *Heat treatment £3.18 a part* ("safety-critical iron is stress-relieved"). GJS-500-7 is supplied as-cast; stress
  relief is not a standard step for it. Only ADI grades are heat treated.
- *NDT £5 a part* (2D X-ray on every part). Industry practice on a safety-critical ductile iron part is 100 % magnetic
  particle or ultrasonic at well under £1 a part, with X-ray on samples.
- *Machining 28 min across five fixturings on a Haas VF-2 and a drill centre.* The routing optimiser chooses between a
  split 3-axis routing and a single-setup 5-axis one — both job-shop routings. At 100,000 a year a knuckle or stub
  axle is machined on a dedicated horizontal machining centre with a twin-pallet hydraulic fixture, two fixturings,
  6–9 min. The library has no volume-cell option, so the tool costs a job shop.
Together these are roughly £10–14 of the £52.85. The casting half is sound; the machining half is a job-shop quote.

**ECU cover, injection moulding, £0.89.** 2 cavities on a 400 t press at 21.8 s, cost-ranked against 1-up; projected
area measured; runner, regrind and scrap as rules. The method is right. Two rate-book figures look low for Europe:
PC/ABS automotive grade at £1.92/kg (2026 distributor quotes for FR-grade PC/ABS sit nearer £2.6–3.2/kg) and a
2-cavity production tool at £53k (a European toolmaker would quote £80–120k; £53k is a Chinese tool price). The cover
is probably 15–25 % under a UK quote; at a Chinese price it is close.

**Seat bracket, pressed sheet metal, £1.25.** Progressive die on a 400 t press at ~20 strokes a minute, 65 % coil
yield, die £117k, stamping priced against laser + press brake and chosen. This is how the part is made. One caveat:
the engineer answered "steel" and the tool costed DC04; a seat-locking bracket is normally HSLA (S420MC or similar)
at a higher £/kg, so a grade answer would add ~10 % to the material line.

**Battery rail, aluminium extrusion, £33.91.** Direct press sized by force and circumscribing circle, 15 parts a
billet strand, T6 by batch ageing, cold cut-to-length — the method matches an extruder's. The metal is 71 % of the
cost at LME + a sourced UK billet premium, which is right. The conversion (process + labour + tooling + overhead ≈
£0.60/kg) is below what extruders quote for a 6063 medium profile (£1.0–1.5/kg conversion); the press cycle (a
116 kg billet in 1.4 min) implies ~4 t/hr off a 9-inch press, which is optimistic (1.5–2.5 t/hr is typical). The
"tooling investment £873k" is the die wear-out across 500,000 parts, which an extruder would fold into the £/kg
rather than state as investment; the figure is right in substance but will surprise a reader who expects a £5–10k
die.

**Summary of realism.** The process selection, feasibility screening, material yields, tooling build-ups and
regional rate books are at the level a cost engineer would defend. The gaps are concentrated in one place: the
machining model is a job-shop model (3-axis VMC, drill centre, 45-min change-overs, several fixturings) that overstates
machining time and labour on high-volume parts, and two safety-critical casting rules (stress relief, 100 % X-ray) are
conservative beyond practice. Those are rule-pack changes, not engine changes, and they are the next piece of work.

## 5. Readiness

Ready for a controlled pilot with a named group of cost engineers, in "explore and compare" mode. Not ready as a
quoting or negotiation reference until actuals are logged and the machining rule pack is revised.

What the pilot needs on day one:

1. **Log a paid price for every part costed.** `scripts/actuals/cad-actuals-input.csv` and `npm run accuracy`. Until
   twenty or thirty real parts are in, nobody can say what the tool's error is, and a Director should not be shown a
   MAPE that does not exist.
2. **Read the machining line as a job-shop figure** on any part above ~20k a year. Say so in the pilot brief.
3. **Answer the grade question.** The representative grade is costed until it is answered; a wrong family is a 10–30 %
   material error.
4. **Run the CAD image** (`Dockerfile.cad`) — STEP needs the OCP kernel; the Alpine image is STL-only.
5. **No AI key is fine.** Every costing path here is deterministic; the AI only reads names and renders.

What should be fixed before the pilot widens beyond that group:

- ~~A volume machining cell in the routing library (HMC, twin-pallet, hydraulic fixture) with the turning signature
  lowered for flanges.~~ **Done 30 Oct 2026** — `docs/cad/pilot-rule-pack-2026-10-30.md` (stub axle £53.39 → £42.81,
  hub flange turned on the lathe). Still open from it: the turning finish rate is conservative; no gantry-loaded lathe
  cell yet; the HMC capex is an estimate.
- ~~Casting safety rules: stress relief only for grades that need it; NDT as MPI at 100 % with X-ray on samples.~~
  **Done 30 Oct 2026** — same pack (iron as-cast; MPI £0.77 a part, in-line X-ray £0.28 on light alloys).
- PC/ABS and tool prices re-sourced for Europe in the next rate refresh (the books are dated and sourced; this is a
  refresh, not a bug).
- The extrusion press throughput checked against a real extruder's cycle.

## 6. Where the evidence is

- Live runs: `scratchpad/five2` (all five, first-pass fixes), `five3` (rail + stub axle, second pass), `five4` (rail, final),
  `five5` (all five, final build) — screenshots, PDFs, workbooks, trace JSON.
- `docs/review/cad2c-five-part-review-2026-10-29.md` — the findings register.
- `docs/cad/compare-routes-review-2026-10.md` — the comparison's method, limits and survey on every real part.
- `tests/cad2c-report-audit.test.ts`, `tests/route-compare-review.test.ts`, `tests/cad-phase2.test.ts`.
