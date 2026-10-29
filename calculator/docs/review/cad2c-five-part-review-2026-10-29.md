# CAD to COST — five-part live review and report audit (29 Oct 2026)

**Asked:** review the CAD to COST workflow on four to five live CAD parts — UI / UX, motion, the whole experience — and
audit every line of the exported reports for gaps, errors and noise, to a professional cost-reporting standard.

**How:** `e2e/cad-to-cost-trace.ts` with a five-part manifest (`CV_TRACE_PARTS`), a real server (OCP kernel, no AI
key) and a real browser at 1440 × 1000: the three steps on each part, screenshots in both themes, axe WCAG 2.1 AA on
every step, the PDF and Excel opened and re-added. Then every page of every PDF and every sheet of every workbook read
(`scripts/cad2c-review/dump-reports.py` renders the pages and dumps the text).

| Part | Route | Headline (UK, 100k / yr, 5 yr) |
|---|---|---|
| FORGE_Hub_Flange.stp | forging (closed-die) | £17.32 |
| PRCR002.stp (stub axle) | cast and machine (sand) | £52.85 |
| IM_ECU_Cover.stp | injection moulding | £0.89 |
| Seat_Locking_Bracket.stp | pressed sheet metal | £1.25 |
| AL_Battery_Rail.stp | aluminium extrusion | £33.91 (blocked before P-A) |

## 1. Live run, before the fixes

275 pass · 20 fail · 2 info. Of the 20: 17 on the battery rail (it never reached the cost — P-A), 2 harness tolerance
(the operation re-add compared 6-dp sheet values at 5 dp), 1 on the seat bracket's margin round trip (P-B).

## 2. Findings and what was done

### Defects in the product

| # | Finding | Where | Fix |
|---|---|---|---|
| P-A | **A blocking plausibility check fired before any process was chosen.** The rail opened step 2 on a red "process_geometry_implausible — unusual for 'machining'" block with a box to acknowledge, for a route nobody had picked: the sanity check read the server's placeholder commodity while the process question was still open. Get cost was blocked by it. | `server/routes/cad.ts` `runAllGuards` | `{ routeOpen }` passed at every call: the process-plausibility codes are dropped while the route question is open and run again once it is answered. Test. |
| P-B | **A margin of 810 % was accepted and marked Typed.** A keystroke that landed on a redrawing card left the field reading "810"; the handler re-costed nothing and left the badge. | `main.ts` commercial fields | Each field has a stated range (overhead 0–100 %, margin 0–60 %, £ figures ≥ 0); an out-of-range figure is refused with a toast, `aria-invalid`, and the costed value restored. |
| P-C | **One costing, two bands.** The cost card said ± 8.8 %; §9b's reference row said ± 9.1 % — the comparison ran its own Monte-Carlo with a different provenance mapping and seed. | `route-compare.ts`, `main.ts` | The screen's band travels with the request (`referenceBand`) and is printed on the reference row and its ladder point. |
| P-D | **The same caveat printed four times** on the knuckle's reference and precision rows. | `route-compare.ts` | The feasibility screen's arrays were shared between rows of a route; copied per row. |
| P-E | **A material id in prose**: "mat-pa66gf30 is not bought on this route". | `route-compare.ts` | The grade name. |

### The reports, line by line

| # | Finding | Fix |
|---|---|---|
| R1 | **The full feature list rode in every operation name**: "CNC Machining — 20 features (1×Ø10.0×12, 1×Ø11.0×21, … 1× face 956mm²) [geometry-measured]" ran to four lines in §4A, §4B, twice in §6, three times in §8, in §12, §13 and §14 of the knuckle's PDF, and in the Excel. | `src/engine/operation-names.ts::shortOperationName` — the name prints as "CNC Machining — 20 features"; the feature list prints once, in §4C (and a "Measured features" column on the Excel operations sheet). Applied in the PDF, Excel, sensitivity drivers, levers and inputs to confirm. The engine keeps the full name (the prompt and the fixtures read it). |
| R2 | **Raw trace keys as field names** in §6: "Forging.machineRatePerHr", "CNC Machining … [geometry-m easured].labourRatePerHr". | `traceFieldLabel` + the short name: "Forging: machine rate". PDF and Excel. |
| R3 | **Rate-book bookkeeping in a client report**: "Was £56.85/h (a build-up tuned to a shop rate)", "| Refresh 2026-09: -£0.026/kg from 0.6kg pc …", "(see RESIN PRICING BASIS)", "coolFactor ~2.2 s/mm²" in §3, §5 and §6. | `money-text.ts::reportNoteText` strips the refresh log, the previous figure, the cross-reference and the module parameter; the rate database export keeps the note as written. |
| R4 | **Raw ids as answers** in §2 Checks: "injection_moulding", "mat-pc-abs", "forging", "yes". | `decisionAnswerLabel`: route names, grade names, Yes / No, Standard. |
| R5 | **"Engine Warnings" on the cover for things that are not warnings**: "price confidence Medium" (the library's ordinary grade) and "2 parts a cycle — each part carries 1/2 of the cycle time" (visible in §4A). | A Medium price grade no longer warns (Low still does); the multi-cavity note prints under "Notes on this costing", warnings keep their box. |
| R6 | **Greek letters dropped by the PDF font**: "Σ over 4 operations" printed " over 4 operations"; the cooling basis lost π and α. | `winAnsiSafe` names them (Sum, pi, alpha, delta, sigma, mu …). |
| R7 | **Short tab labels in a report**: "Injection", "SM Fab", "Al Extrusion", "Cast+Machine", "gear". | `COMMODITY_REPORT_LABELS` (full names) on the comparison, screen and reports; a fallback is capitalised. |
| R8 | **Library ids in §5 headings**: "CNC VMC 3-axis [mach-vmc3]". | The id moves to the end as "(rate id mach-vmc3)" — still the audit key, no longer the heading. |
| R9 | **§14 printed a 170-character labour-rate derivation cut with "…"** as "what the costing assumed". | One line: the role, its rate and "Low confidence", with the derivation left to §6. |
| R10 | **§1's eight-bucket table split across pages 1 and 2 after row 4.** | A page check before the table. |
| R11 | **§4C headed "Machined Features" on a moulding** where nothing is machined. | "Measured Features — audit only" when the lines are not priced. |
| R12 | "not answered - costed as …" with a hyphen where every other line uses an em dash. | Em dash. |

Second pass (the re-run's reports read again):

| # | Finding | Fix |
|---|---|---|
| R13 | "Was £41.32/h (a build-up tuned to a shop rate)." still printed mid-note on §5 machine rates and "Was £0.86/kg." on material notes — the first rule only struck a "Was £…/h" at the END of a note. | `reportNoteText` strikes the previous figure wherever it sits, in any unit, with its bracket. |
| R14 | §6's Source column was the raw rate source: "| Refresh 2026-09: INDEX …", "(see CASTING PRICING BASIS)". | §6 goes through `reportNoteText` like §5 and the Excel sheet. |
| R15 | The DFM "In this costing: 2.22 min off Drilling — 12 holes (1×Ø3.1×3, … ) [geometry-measured] at that operation's own rates" carried the feature list. | `design-to-cost.ts` builds the basis on the short name. |
| R16 | The route comparison's operation rows (screen, §9b, Excel 8-Routes) printed the full names with the feature list. | The comparison names its operations with `shortOperationName` at source. |
| R17 | The battery rail's cover note printed the raw field path: "operations[0] (Direct extrusion — press, quench, stretch, saw).partsPerCycle: …" — the em dash and commas in the operation's name fell outside the character class that turned a field into its label. | `decision-text.ts::coverWarningText` matches to the first ": " whatever the name holds; test. |
| R18 | Excel 5-LabourRates printed the labour source as the book wrote it ("Was £19.94/h"). | Through `reportNoteText` like the other rate sheets. |
| R19 | A priced lever's "Re-costed on:" line (§13) carried the full operation name. | The lever transform names the operation short. |

### The screen

| # | Finding | Fix |
|---|---|---|
| U1 | Programme-life help read "left blank it used to be loaded onto one year's volume" — changelog prose in the UI. | "Required: tooling is spread over annual volume × programme life." |
| U2 | Emoji markers (🎯, 📷) in the "Improve this analysis" panel. | Removed. |
| U3 | The CAD auto-fill banner read "review before calculating" after the cost was on screen. | "each graded in the Basis". |
| U4 | **The route comparison scrolled sideways inside the card** (seven columns; the Basis column clipped at the edge). | Two rows a route: the figures on one line, the basis under them full width. |
| U5 | Measure part stayed the primary button at step 2 (two primary actions on screen). | Secondary once the part is measured; primary again when a new file is chosen. |

### Harness

- Operation re-add tolerance 0.00002 → 0.0006 (the sheet holds 6-dp figures).
- A typed commercial value is verified before the change event (a redraw mid-keystroke produced "810").
- Light-theme screenshot and axe at step 3 on every part (`CV_TRACE_PARTS` manifest).

## 3. Live run, after the fixes

Re-run of all five parts: 278 pass · 16 fail · 3 info — every failure on the battery rail, and this time the harness,
not the product: the rail reached its questions (P-A fixed) and the manifest had no answer for the material family,
so the family question stayed open and Get cost — correctly — never applied the form. The seat bracket's margin round
trip passed (P-B). Headlines unchanged: £17.32 · £52.85 · £0.89 · £1.25.

Rail + stub axle re-run with the family answer and the second-pass report fixes: 125 pass · 0 fail · 1 info. The rail
costs £33.91 (UK, 100k / yr, 5 yr; EN AW-6063, direct press, T6, mill finish): two answer rounds (family, then alloy),
"Updating…" on Get cost during each re-run, the comparison's reference row equal to the headline, axe clean in both
themes, the PDF and Excel opened and re-added. The dumped reports of both parts carry none of the audited patterns
(previous figures, refresh logs, cross-references, raw field names, feature lists in names, short tab labels).

All five parts on the final build (`scratchpad/five5`): 311 pass · 0 fail · 3 info; the reports delivered to the President carry none of the audited patterns (one lever line, R19, fixed and the hub flange re-run in `five6`). The final rail run after R17 / R18 is recorded in `scratchpad/five4` (same checks; cover note reads "Direct extrusion —
press, quench, stretch, saw (operation 1) — parts per cycle: … 15 parts a cycle").

## 4. Motion and experience

- Motion: one system (`animations.ts`), fades only; the money never animates; "Updating…" on the Get cost button and the
  answer chips behave as designed on every part. Nothing new to report.
- Experience: step 1 → 2 → 3 reads as a sequence; the questions carry their reasons; the Basis, the comparison and the
  Not-included list are the three doors a reviewer opens. Two things remain worth doing (not done here): a one-line
  "what changed" after a commercial edit (the delta chip persists after a round trip), and the viewer status bar
  truncating the file name and hint at the card's width.

## 5. Still open

- Accuracy against prices paid is unmeasured (no actuals logged).
- The §9b excluded-routes table repeats a source line per check; it is complete rather than compact.
- The reports carry §11–§15 (insights, levers, roadmap) that are prompts, not costings; they are labelled so.
