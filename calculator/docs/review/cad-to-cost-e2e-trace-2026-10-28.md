# CAD to COST — end-to-end trace against the plan (28 Oct 2026)

**Question asked:** is everything in the CAD to COST plan built, and does the feature work end to end? Prove it with a
live run on two parts, traced step by step.

**How:** `e2e/cad-to-cost-trace.ts` drives a real server (the built bundle, the OCP kernel, no AI key) and a real browser
through the three steps on two of the plan's own parts. At every step it records:
- the screen (a screenshot and every element the plan names);
- every `/api` call;
- the costing.

It then checks each plan item:
- the 12 changes (#1–#12), M1–M12, D1–D6 and the acceptance criteria A1–A6
  (`docs/ui/cad-to-cost-redesign-2026-10.md`);
- the exports, which it opens;
- the cost, re-added from the exported workbook independently of the engine.

Re-run: `npm run build && npx tsx e2e/cad-to-cost-trace.ts` (`CV_TRACE_OUT=<dir>` for the screenshots, `trace.json`,
`trace.log`, `server.log`).

## 1. Result

| Run | Checks | What changed between runs |
|---|---|---|
| 1 | 94 pass · 8 fail · 8 plan items not built | — |
| 2 | 93 pass · 3 fail · 0 not built | the defects and missing items below fixed; three harness checks corrected |
| 3 | **116 pass · 0 fail · 0 not built** | the card keeps its open sections across a redraw |
| 4 (final, the committed code) | see §5 | labels on the card made readable |

**Costs, to the penny of the plan's acceptance figures (§5 of the plan):**
- **Knuckle:** £24.0215.
- **ECU cover:** £0.8858.

The screen equals the headless chain on both: the route comparison's reference row is `costMeasuredPart`.

## 2. Step-by-step trace (run 3)

### Part 1 — steering knuckle, forged (`steering_knuckle_RH.stp`, UK, 100,000 a year, 5-year programme)

| Step | What happened | Calls | Checked |
|---|---|---|---|
| 1 Part & context | Step indicator "Part & context" current; country line "Costed with the United Kingdom rate book"; programme life "Required…", then "Tooling is spread over 5 years × 100,000 = 500,000 parts" once typed; Measure part disabled until a file was chosen; the model drawn on the left before measuring | `GET /api/cad/limits`, `POST /api/cad/tessellate` | M4, #1, D3, M6, M5, axe 0 |
| Measure | 11.1 s. Progress showed the server's stages ("Measuring the geometry (OCCT kernel)…" → "OCCT complete") and elapsed time, never a percentage, with Cancel | `POST /api/cad/analyze` → 2 blocking questions (route, material family), 3 rule fields, rules v8, kernel 374f8cebdccb, `occt` | M1, #7 |
| 2 Confirm | "Confirm" current, focus on the step heading. Four facts: 114 × 236 × 210 mm, silhouette 129.6 cm², 310 B-rep faces, 356.1 cm³. Each question with its reason; "1 of 2 answered"; "Not listed?" on route and material | — | M4, §3, axe 0 |
| Round 0 | Route: the shape leaned cast + machine; answered **Forged**. Get cost read "Updating…" and was disabled during the re-run; the answer became a chip | `POST /api/cad/reanalyze` → forging, material family open | M3, #9 |
| Round 1 | Material **Steel** → a new question, tolerance class, tagged New | `reanalyze` → tolerance (blocking), grade + finish (advisory) | M3 |
| Round 2 | Tolerance **Standard** → safety-critical added, tagged New, pre-ticked Yes from the file name "knuckle" (D1: name evidence only). Its consequence reads "adds crack testing (MPI on a closed-die forging…)" (D2: no X-ray on a forging) | `reanalyze` → safety-critical (blocking) | D1, D2 |
| Get cost ×2 | The first press stopped on the New question (it cannot be accepted unseen); the second costed. The headline was £24.02 from its first frame (40 samples, one value) | `reanalyze` → 28 rule fields, grade and finish advisory | M2, #8, A3, A4 |
| 3 Cost | Indicator "Cost" current. Tooling £436,549.69 = £0.87 a part over 5 × 100,000. Band ±8.8 % (P10 £21.95 – P90 £26.17) with what it is and is not; confidence Low **with its reason** (12 data points: 0 High, 10 Medium, 2 Low). Chips: country, volume, **grade 38MnVS6 (default)**, **weight 3.321 kg costed**, the four answers. Basis leads with **what moves the cost most** (CNC cycle time ±£0.73, material price ±£0.68, costed weight ±£0.65, utilisation ±£0.57, labour rate ±£0.49), then the **commercial basis as fields**, then 38 inputs by grade. **Packaging £0.19 graded Rule** (from the part's size). Not included: coating (costed bare), assembly, PPAP, freight, packaging beyond default, engineering changes. Stamp "United Kingdom rate book v2.2.0 · rules v8 · kernel 374f8cebdccb · 28 Oct 2026". DFM findings (6), Design to Cost tab, the full Forgings form beside the model (Edit inputs), Share / Excel / PDF / Save / Log actual £ on the result. **The model in view on the left.** | — | #2, #3, #4, #5, #12, D6, M4, M5, axe 0 |
| Compare routes | Forging (this costing) £24.02 = headline; casting £31.50; cast + machine £35.38; machining £208.96 | `POST /api/cad/compare-routes` | A1, #6 |
| Commercial basis | Margin 8 % → 10 % on the card: £24.02 → £24.47 (= £24.0215 ÷ 1.08 × 1.10 = £24.4664); Basis now "Typed · Supplier margin 10 %". Back to 8 %: £24.02 | form re-cost | #4 |
| Exports | Excel and PDF opened: the stamp word for word in both, £24.02 in the PDF | — | A6, #12 |

**The cost, re-added from the exported workbook:**

| Bucket | Re-added | How |
|---|---|---|
| Material | £10.2175 | 4.918 kg bought × £1.15/kg − £0.3193 scrap credit + £0.3070 energy |
| Process + labour | £3.8660 + £4.4293 | each operation re-priced from its own rate × time ÷ OEE ÷ parts a cycle: forging £0.4873 + £0.2325; flash trim £0.0808 + £0.1162; CNC 20 features £2.8762 + £3.1555; machining load / unload + change-over £0.4216 + £0.9251 |
| Tooling | £0.8731 | £436,549.69 ÷ 500,000 |
| Packaging, logistics | £0.19 + £0.34 | from the part's size and mass |
| Overhead | £2.3263 | 12 % × £19.3859 (material + process + labour + tooling) |
| Margin | £1.7794 | 8 % × £22.2422 (the subtotal) |
| **Total** | **£24.0215** | = the headline £24.02 |

### Part 2 — ECU cover, injection moulded (`IM_ECU_Cover.stp`, PC/ABS)

| Step | What happened | Calls |
|---|---|---|
| 1 | As the knuckle | `limits`, `tessellate` |
| Measure | 2.7 s; four facts: 180 × 120 × 40 mm, 216.2 cm², 96 faces, 122.3 cm³ | `analyze` → route + material family |
| Round 0 | Route pre-ticked Injection moulded (12 bend-like radius pairs at a 2.5 mm wall — the reason says pressing or moulded shell); material **Plastic** → resin added, tagged New; "Updating…" during the re-run | `reanalyze` → resin (blocking) |
| Round 1 | Resin **PC/ABS** → nothing left; "Updating…" again | `reanalyze` → 25 rule fields |
| Get cost | One press; £0.89 from the first frame | — |
| 3 Cost | Tooling £61,203.00 = £0.12 a part over 5 × 100,000; band ±8 %, confidence Medium with its reason; chips incl. grade PC/ABS and weight; movers (resin price ±£0.03, weight ±£0.03, utilisation ±£0.02, cycle ±£0.02, machine rate ±£0.02); commercial basis incl. **batch 5,000** (moulding carries a batch-spread mould change; forging has no batch input, so the knuckle shows none) | — |
| Compare | Injection moulding £0.89 = headline; thermoforming "—" (stops on its own question) | `compare-routes` |
| Commercial | Margin 10 % and back — re-costed, then the original | — |
| Exports | Stamp in both, headline in the PDF | — |

Re-added: material 0.1489 kg × £1.92/kg − £0.0004 + £0.0045 = £0.2900; moulding £0.1442 + £0.0400; mould change
£0.0199 + £0.0176; tooling £61,203 ÷ 500,000 = £0.1224; packaging £0.06 + logistics £0.05; overhead 12 % = £0.0761;
margin 8 % = £0.0656; **total £0.8858** = £0.89.

## 3. What the trace found, and what was done

| # | Finding | Kind | Fix |
|---|---|---|---|
| T1 | The step indicator disappeared at step 3 (the CAD screen is swapped for the commodity form) | defect | The cost card carries the indicator, step 3 current |
| T2 | The model was off screen at step 3: its host sat in the results column under the cost card | defect | The host heads the left pane, outside the swapped form (`index.html`); test F7 updated |
| T3 | Packaging and logistics were graded **Typed** in the Basis though nobody typed them (they sit outside the form the fill snapshot records) | defect | Each figure carries its source — country default, size estimate, typed (`country-fields.ts::shopFigureSource`); typed only on a real keystroke (`isTrusted`). A size estimate is graded Rule |
| T4 | The moulding cooling basis printed "cool ≈ 10.6 s at 2.3 mm" (2·V/S) while the cycle cooled the costed 2.5 mm wall: 12.5 s | defect (text; the cost was right) | The basis states the costed wall (`mouldWallMm`); test in `moulding-review.test.ts` |
| T5 | Plan #3: the Basis did not lead with what moves the £ most | not built | Engine sensitivity (`runSensitivity`, each input ±10 % re-costed) — top five first |
| T6 | Plan #4: the commercial basis was not editable on the cost step | not built | Overhead %, margin %, packaging, logistics and the rules' batch are fields on the card; a change is typed into the form and re-costs |
| T7 | Plan §3: "confidence and why" — the card showed the grade only | not built | `confidenceWhy` (engine) — the traceability mix the grade is computed from, the Low items by name, what moves it |
| T8 | Plan §3: grade and weight chips missing | not built | Grade (with "default" when not answered) and costed weight chips |
| T9 | The card closed every section and lost the field being edited whenever the result redrew (the DFM report landing, a re-cost) | defect | Open sections and focus kept across a redraw |
| T10 | The card printed raw traceability keys ("… [geometry-measured].labourRatePerHr") | defect | `traceFieldLabel`: "CNC Machining — 20 features: labour rate" |
| — | "Updating…" not seen; D2 failed; Edit inputs not found (run 1) | harness | The re-run starts 350 ms after an answer — the check now watches; D2 checks MPI (it is forging-specific); the form is found by its fields |

## 4. Plan items — status

| Plan item | Status | Evidence |
|---|---|---|
| #1 context in step 1 (country + rate book, volume, programme life live) | Built | run 3, step 1 |
| #2 piece price and tooling investment, amortisation in words | Built | step 3 |
| #3 Basis graded, top movers first | Built (T5) | step 3 |
| #4 commercial basis editable | Built (T6) | margin round trip |
| #5 Not included | Built | step 3 |
| #6 Compare: countries, volume (results tabs), routes | Built | compare-routes |
| #7 honest progress | Built | measure |
| #8 no count-up | Built | 40 samples, one value |
| #9 stable re-runs, Updating… | Built | every answer round |
| #10 one primary button, focus and announcements | Built | focus on the step heading, `role="status"` |
| #11 edge states | Built in code; **not exercised in this run** (kernel present, mm parts, files in limit, no timeout, STEP not STL, AI off is the run's mode) | kernel notice / `units.confirm` question / size limit / timeout allowance / STL badge / re-run failure restore |
| #12 stamp on screen, PDF, Excel | Built | exports opened |
| D1–D6 | Built (D4 finish question and D5 route comparison in phase 2) | rounds 2–3, step 3 |
| A1 moves no cost | Holds — £24.0215 / £0.8858 as recorded | §2 |
| A2 no hidden fields | Holds — the 18 parameters are on the card (chips, Basis, commercial, Not included) | step 3 |
| A3 fewest presses | Holds — Measure + one Get cost per round (+ one stop on a New question) | rounds |
| A4 no unseen answers | Holds — the New safety question stopped the first Get cost | round 3 |
| A5 axe | 0 violations on every step (dark theme). The light-theme shots were not re-taken in this round | each step |
| A6 live proof with exports | Holds | exports |

**Still open (not plan items of CAD to COST, stated so the picture is complete):**
- Accuracy against prices actually paid is unmeasured: `scripts/actuals/cad-actuals-input.csv` is empty.
- STL routing differs from STEP on thin parts (`docs/cad/stl-dfm-2026-10.md`).

## 5. Final run (the committed code)

**116 pass · 0 fail · 0 plan items not built.**

Both parts behave as in run 3, with readable labels:
- **Knuckle movers:** "CNC Machining — 20 features ± £0.73 · Material: 38MnVS6 ± £0.68 · Costed weight ± £0.65 · Material
  utilisation ± £0.57 · Labour Rate — shared by 2 ops ± £0.49".
- **Knuckle confidence:** "Low: of 12 data points behind this cost, 0 are High, 10 Medium and 2 Low … Low: CNC Machining — 20
  features: labour rate, Machining load / unload + change-over: labour rate".
- **Margin round trip:**
  - knuckle: £24.0215 → £24.4664 (shown £24.47) → £24.02;
  - ECU cover: £0.8858 → £0.9022 (£0.90) → £0.89.
- **Costs re-added from the workbooks:** £24.0215 and £0.8858, every operation, the material, the tooling, the overhead and
  the margin to 0.0001.

Full suite 4,048 tests passed before the label change, and again with it (see the commit).
