# CAD to COST — redesign proposal v2 (joint review, 28 Oct 2026)

**For:** Cost Engineering Director · **Status:** for decision · **Supersedes:** v1 of this file (same day)
**Reviewed by:** senior cost engineer (commodity costing) and chief UI/UX motion design engineer, working together
**Prototype:** the "CAD to COST redesign" canvas (v2 board) · **Evidence:** `docs/review/cad-to-cost-360-2026-10-28.md`

Every figure below is from today's live runs on the local install (UK rate book 2026-10-10, 100,000 parts a year), the
engine's own arithmetic on those runs, or the code. Nothing is estimated for this document. Accuracy against prices
actually paid is still **not measured** (0 actuals logged).

## 0. Verdict on v1

v1's direction is right: three steps, the part always on screen, questions answered in place, one primary button.
It is **not ready for a Director**. It cut the clicks but hid the basis of the number. A should-cost a director signs
must show *what was measured, what was assumed, what was asked, and what is left out*. v1 showed a headline, eight
bars and three links. Two v1 prototype details were also wrong against the engine:
- It said a blank programme life means "5 years (stated assumption)". The engine actually amortises tooling over
  **one** year's volume.
- It showed a 45 % progress bar, but the server reports no percentage.

v2 keeps v1's flow and adds what the review found missing: **6 cost-engineering changes, 6 UX/motion changes and
6 decisions for the Director**.

| # | Change | From |
|---|---|---|
| 1 | Costing context in step 1: country (with rate-book date), annual volume, programme life with its tooling effect shown live | Cost |
| 2 | Piece price **and** one-off tooling investment side by side, the amortisation basis in words | Cost |
| 3 | A **Basis** view: every input graded measured / answered / rule / default, the ones that move the £ most first | Cost |
| 4 | **Commercial basis** visible and editable: overhead %, margin %, packaging, logistics, batch size | Cost |
| 5 | **Not included** list: what this costing does not carry (coating, assembly, PPAP, freight beyond default …) | Cost |
| 6 | **Compare**: countries (exists), volume (exists), routes (new, Phase 2) | Cost |
| 7 | Honest progress: indeterminate bar + the server's stage + elapsed + Cancel | UX |
| 8 | No count-up on money: cost figures appear final (live runs read £16.42 / £49.96 mid-animation) | Motion |
| 9 | Stable in-place re-runs: answered questions collapse to chips, new ones enter tagged New, Get cost says "Updating…" and waits | Motion |
| 10 | One primary button per step, fixed at the card foot; focus and announcements on every step change | UX |
| 11 | Every edge state designed (no kernel, inch units, too large, timeout, STL, AI off, re-run failure) | UX |
| 12 | Reproducibility stamp on screen and in exports: rate book + date, rules v7, kernel revision, date | Cost + UX |

## 1. Senior cost engineer review

### 1.1 What v1 gets right
- Geometry is the ground truth and the engine is untouched: the redesign moves *how* the number is reached and shown,
  never *what* it is.
- The questions are the right ones to stop on: route, material family, tolerance class, safety-critical,
  pressure-tight and resin. The stub axle shows why. Its safety answer moves it from grey iron EN-GJL-250 (£41.46) to
  ductile EN-GJS-500-7 (£53.06), a 28 % swing on one question.
- Edit inputs keeps the full commodity form for the engineer who must override a rule value. A typed figure stays
  a quote.

### 1.2 Critical parameters — are they all accounted for?

Worked on the steering knuckle (forged 38MnVS6, UK, 100,000 / yr, £24.10). "Today" is the shipped screen; "v2" is this
proposal.

| Parameter | What it does to this part | Today | v1 | v2 |
|---|---|---|---|---|
| Process route | Re-prices every bucket | Asked | Asked | Asked, plus Compare routes (Phase 2) |
| Material family / grade | Stub axle: grey £41.46 v ductile £53.06 | Asked; grade advisory | Asked | Asked; grade's £/kg and date in Basis |
| Safety-critical | Ductile iron, NDT (£2.50/part on the knuckle) | Asked | Asked | Asked; **pre-tick rule needs a decision (D1)** |
| Tolerance class | Finishing passes and inspection | Asked | Asked | Asked |
| Annual volume | Batch, change-over, cavitation, tooling spread | CAD screen | Step 1 | Step 1 |
| Programme life | Tooling £93,556: £0.94/part over 1 year; £0.19 over 5 → £23.19 total (engine arithmetic) | CAD screen, blank = **1 year** | Step 1, mislabelled "5" | Step 1, effect shown live; **default policy D3** |
| Country / rate book | Every rate | Header only | Header only | Step 1, with book date |
| Overhead 12 % / margin 8 % | £2.33 + £1.78 on £24.10 | Commodity form | Hidden | Commercial basis, editable, basis printed |
| Packaging £0.19 / logistics £0.34 | From part size, UK delivery | Commodity form | Hidden | Commercial basis |
| Batch size 5,000 | Spreads the 45 min change-over | Rule, form | Hidden | Basis (rule) |
| Gross 4.918 kg v 3.321 kg as forged (3.255 kg finished + stock; 67.5 %) | Raw material £5.66 before scrap credit | Excel only | Hidden | Breakdown drivers |
| Consumables and services | Descale £0.58, NDT £2.50, tool wear £1.50 | Excel only | Hidden | Breakdown drivers |
| Cycle time × machine rate | Forge 0.255 min on 1600 t press £91.69/h; CNC 20 features | Excel only | Hidden | Breakdown drivers |
| Surface treatment / coating | **Not asked** for forgings, castings, machined parts | — | — | **Not included** list; **D4** |
| PPAP, assembly, inbound freight, duty | Not costed | — | — | **Not included** list |
| Uncertainty band | ±8.8 % (P10 £22.03 – P90 £26.25) | Shown | Shown | Shown with what it covers (D6) |
| Confidence | "Low" beside ±8.8 % reads as a contradiction | Shown | Shown | Explained: why Low, what would raise it |
| Reproducibility | Rate book, rule and kernel versions | Partly in Excel | — | Stamp on screen and every export |

**Conclusion.** v1 asked the right questions but hid 9 of the 18 parameters a director checks. v2 shows all 18:
each one is asked, shown in Basis or Breakdown, or listed under Not included. None is silent.

### 1.3 Findings that need an engine or policy decision (not UI)

- **D1 — Safety-critical pre-tick from the file name only.** "knuckle" in the name pre-ticks *Yes*; "PRCR002" (a
  stub axle) pre-ticks *No*. Today's New tag forces a look, but the default still leans the cheap way.
  *Recommendation:* with no evidence, tick nothing and require a choice on screen. The unattended AI path keeps its
  stated leaning.
- **D2 — Question wording.** "Yes — adds X-ray/CT NDT and heat treat" is shown for a forging, which the rule
  correctly charges as MPI. *Recommendation:* wording per commodity (MPI / UT on forgings, X-ray / CT on castings).
- **D3 — Programme-life default.** Blank = one year's volume is conservative and stated, but it puts £0.75/part more
  tooling on the knuckle than a 5-year life. *Options:* keep blank = 1 year, require the field, or a company default.
- **D4 — Coating / surface treatment** is not asked on forgings, castings or machined parts. *Options:* list it under
  Not included (v2 does this now), or add an advisory finish question priced through the painting module (engine
  work).
- **D5 — Route comparison.** A cost engineer's first challenge is "what if it were cast?". The headless chain
  (`costMeasuredPart`, used by bulk runs and the baseline) can cost every route the geometry admits with the same
  answers. *Recommendation:* Phase 2.
- **D6 — What the band means.** The band is a Monte Carlo over the modelled input ranges. It is not model error, and
  accuracy against paid prices is unmeasured. *Recommendation:* say exactly that beside the band, and invite
  "Log actual £" to calibrate.

## 2. Chief UI/UX motion design review

| # | Finding on v1 | Evidence | v2 |
|---|---|---|---|
| M1 | Measuring screen showed a 45 % bar | The server reports stages, not percentages (house rule, `long-task-progress.ts`) | Indeterminate bar, the server's stage text, elapsed seconds, the size-based allowance, Cancel |
| M2 | The headline counts up | Live runs read £16.42, £18.10, £38.72 and £49.96 before the true £24.09 / £41.46 / £53.06 — the £38.72 was quoted in the review until the export was checked | Money never animates its value: a 160 ms opacity fade only. Applies to the CAD cost step and its exports' screen twin |
| M3 | An in-place re-run redraws the whole panel | The panel moved under the cursor and a driver clicked a control that had just gone | Answered questions collapse to a one-line chip ("Route: Forged · change"); a new question enters below with 200 ms opacity and 8 px rise, tagged New; Get cost reads "Updating…" and is disabled until the re-run lands; scroll anchored |
| M4 | No focus or announcements on step change | — | Focus moves to the step heading; the notice line is `role="status"`; the step indicator is a labelled `<nav>` |
| M5 | Viewer might re-mount between steps | Each mount re-meshes | One viewer instance across all steps (mesh cached per file); on Cost the "cost on model" toggle is offered |
| M6 | Buttons move with content | — | One primary action per step, pinned to the card foot; secondary actions are text buttons |
| M7 | Motion spec missing | — | Table below; follows `animations.ts` (≤ 8 px, 150–260 ms, power2, no scale or bounce, reduced-motion = none) |
| M8 | Edge states not drawn | — | State table below |
| M9 | Money typography | — | Tabular numerals, right-aligned, currency from the header (`_currFmt`); never a literal £ |
| M10 | Density for a director | — | Cost step leads with four numbers: piece price, band, tooling investment, confidence; detail one click away |
| M11 | Colour carries meaning alone | — | Basis grades are a word badge plus colour (measured / answered / rule / default) |
| M12 | Light theme | — | Both themes from tokens; `e2e/theme-shots.ts --diff` must show no light-theme change outside CAD to COST |

### Motion spec

| Moment | Motion | Duration / easing | Reduced motion |
|---|---|---|---|
| Step change | Outgoing card content fades; incoming fades and rises 8 px | 200 ms out (power2.in), 240 ms in (power2.out) | Instant |
| New question appears | Opacity 0→1, 8 px rise; "New" badge | 200 ms power2.out | Instant, badge stays |
| Answered question collapses | Height is not animated (layout); content swaps to the chip with a 150 ms fade | 150 ms | Instant |
| Get cost busy | Label swaps to "Updating…"; button disabled | Immediate | Same |
| Cost appears | Whole result fades in; numbers are final from the first frame | 160 ms | Instant |
| Hover on choice cards | Border to accent, 2 px lift | 150 ms | Colour only |
| Measuring | Indeterminate bar sweep | 1.4 s linear loop | Static bar + text |

### Edge states

| State | What the user sees | Primary action |
|---|---|---|
| CAD kernel not installed | "STEP and IGES cannot be read on this computer — STL still works. Fix: …" (shipped today) | Choose STL / how to fix |
| Inch model suspected | "This part measures 25.4× too small — is it in inches?" with both sizes | Yes, inches / No |
| File too large | Size and limit stated before upload | Choose another file |
| Measuring timeout | Elapsed, allowance, what was measured | Retry / cancel |
| STL mesh | "Mesh: features (holes, draft) are not measured; volume and envelope are" | Continue |
| AI off | Nothing missing: deterministic path is the default | — |
| Re-run failed | The answers kept, the error in words | Try again |

## 3. Final proposal v2

**Layout (≥ 1280 px):**
- The model sits on the left, full height through all three steps.
- The step card sits on the right with its primary action pinned at the foot.
- A three-step indicator sits above the card.
- The commodity picker closes on this screen; the header switcher still reaches every form.
- Below 1280 px the columns stack, model first.

**Step 1 — Part & context.**
- Drop zone.
- Costing context:
  - Country (rate-book date beside it, synced with the header).
  - Annual volume.
  - Programme life, with a live line: "Tooling over 1 year's volume — enter a life to spread it".
- More options (drawing PDF, photo, blank DXF, process or material you already know, analysis mode).
- Kernel status line.
- Action: **Measure part**.

**Step 2 — Confirm.**
- Four measured facts under the model.
- Only the questions the geometry cannot settle:
  - suggestion and reason beside each;
  - answered ones collapse to chips;
  - follow-ups enter in place, tagged New;
  - "Not listed?" links to the full lists;
  - optional defaults in a quieter block.
- Action: **Get cost** ("Updating…" while a re-run lands), with "x of y answered".

**Step 3 — Cost.**
- Header:
  - piece price (final, no count-up);
  - band and what it covers;
  - confidence and why;
  - **tooling investment** (one-off) with its amortisation basis.
- Chips: route · grade · weight · country · volume · **Change answers**.
- Four tabs:
  1. **Breakdown** — the 8 buckets as bars, each expandable to its drivers (weights, £/kg, utilisation, cycle × rate, consumables, energy).
  2. **Basis** — every input graded measured / answered / rule / default; the five that move the £ most first; commercial basis editable (overhead %, margin %, packaging, logistics, batch size).
  3. **Compare** — countries (exists), volume (exists), routes (Phase 2).
  4. **Not included** — coating, assembly, PPAP, freight beyond default, duty.
- Doors: DFM findings on the model, Design to cost, Edit inputs (the full form).
- Actions: Export PDF · Excel · Save · Log actual £.
- Stamp: "UK rate book 2026-10-10 · rules v7 · kernel ⟨revision⟩ · 28 Oct 2026".

### Acceptance criteria (measured, not judged)
1. **The redesign moves no cost:** the three live parts give today's figures to the penny (knuckle £24.10, stub axle £53.06, ECU cover £1.22 PC/ABS and £1.65 PBT GF30); the real-parts baseline is unchanged.
2. **No hidden fields:** every parameter in §1.2 is visible on the cost step or listed under Not included.
3. **Fewest presses:** from upload to cost, Measure part (or Calculate) plus one Get cost per answer round; no other button needed.
4. **No unseen answers:** a question never takes an answer the user has not seen (today's tests extended to the new card).
5. **Quality gates:** axe WCAG 2.1 AA 0 violations on every step and state; light theme unchanged elsewhere; reduced motion honoured.
6. **Live proof:** the live driver passes on the three parts, with PDF and Excel opened and the stamp present in both.

### Build plan
- **Phase 1, no engine change:**
  - `src/ui/cad-workspace.ts` (step card, indicator, Basis / Compare / Not included views) on `cad-flow.ts`;
  - money without count-up;
  - stable re-runs;
  - the stamp;
  - tests, live driver, axe, theme shots, then rebuild `dist`.
- **Phase 2, after the Director's decisions:** D1 safety pre-tick, D2 wording, D3 programme-life default, D4 finish question, D5 route comparison, each with tests and the baseline re-recorded only where intended.

## 4. Decisions for the Director

| | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Safety-critical pre-tick with no evidence | Lean from name (today) · tick nothing, require a choice | Require a choice |
| D2 | NDT wording | Generic (today) · per commodity | Per commodity |
| D3 | Programme life when blank | 1 year (today) · required · company default (e.g. 5) | Required on CAD to COST, with the 1-year line shown until filled |
| D4 | Coating / surface treatment | Not included list · advisory question priced via painting | List now, question in Phase 2 |
| D5 | Route comparison | Not offered · Phase 2 | Phase 2 |
| D6 | Band wording | Today · state scope and calibration | State scope |
