# CAD to COST — redesign proposal (28 Oct 2026, for approval)

Clickable prototype: the "CAD to COST redesign" design canvas (link in the review message). Figures on it are the
steering knuckle's live run of 28 Oct 2026 (`docs/review/cad-to-cost-360-2026-10-28.md` §3).

The functional fixes (one gated path to the cost, questions asked in place, the model beside the result, kernel status
before the upload) are already in. This proposal is about the senior users' third complaint: the screen is too complex.

## What makes it complex today (measured on the live run)

| | Today | Count |
|---|---|---|
| Screen width spent on navigation | The 270 px commodity picker stays open beside CAD to COST, plus the 200 px app rail | 470 px of 1,440 |
| Buttons that start or continue a costing | Analyze Only, Analyze & Calculate, Calculate, Apply answers, Get cost, "→ Apply: <route>", Apply & Calculate, Pin & Recalculate | 8 |
| Inputs above the Analyze buttons | Part name, upload, process override, material override, annual volume, analysis mode, deep analysis, geometry overrides (6), photo, drawing, DXF | ~16 |
| Kernel figures shown before a cost | Envelope, volume, area, fill ratio, mean wall, wall range, undercuts, draft range, CNC setups, CNC cycle, Al weight, steel weight, face mix, feature table | 14 + table |
| After the cost | A 60-field commodity form with provenance banners; the result in the right pane | — |

## The proposal — three steps, one card, the part always on screen

1. **Upload.** One drop zone, annual volume and programme life. Everything else (drawing, photo, blank DXF, process or
   material you already know, analysis mode) behind "More options". The kernel status is stated before the upload.
   One button: **Measure part**.
2. **Confirm.** Only the questions the geometry cannot settle, as large choices with the suggestion ticked and the
   reason beside it. A question an answer opens appears in place, tagged **New**. A long list (a steel grade) is a
   drop-down. One button: **Get cost**, with "2 of 4 answered" beside it.
3. **Cost.** The headline with its band and confidence, the answers as chips with "Change answers", where the money
   goes (eight buckets as bars), and three doors: DFM findings (on the model), Design to cost, **Edit inputs** (the full
   commodity form — still there for the cost engineer, no longer the default view). Export PDF / Excel / Save.

Layout: the 3D model on the left at full height through all three steps (it is the user's part — it should not move
or disappear); the step card on the right; a three-step indicator above. The commodity picker closes on CAD to COST
(the header's commodity switcher still reaches every form). The measured geometry is one row of four facts under the
model, with "Full measurements" for the rest; machining estimates appear only on machined routes.

## What does not change

The engine, the rules, the questions and their answers, the exports, the commodity forms, every element id the e2e
harnesses use. The golden rule stands: the screen re-arranges how the engine's numbers are reached and shown, never
what they are. Phone width: the two columns stack, model first.

## Build plan once approved

1. `src/ui/cad-workspace.ts` (new module, not main.ts): the three-step card and the step indicator, driven by
   `cad-flow.ts::nextCostStep`; main.ts keeps the state and calls in.
2. Close the commodity picker on CAD to COST; geometry card collapsed to the four-fact row.
3. Cost step: reuse the result hero and breakdown already drawn for the commodity form (no second cost path).
4. Verify: unit tests for the step card, the live driver on the three parts (Calculate → answers → Get cost → exports),
   axe WCAG 2.1 AA on each step, light and dark screenshots (`e2e/theme-shots.ts --diff`: light must not move outside
   CAD to COST), then rebuild `dist`.
