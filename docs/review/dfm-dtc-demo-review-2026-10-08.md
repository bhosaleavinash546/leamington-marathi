# DFM & Design-to-Cost — end-to-end review before the demo (8 Oct 2026)

Three independent audits ran on the shipped code — arithmetic traceability, citations, recognition accuracy against
ground truth — and every uploaded part was re-run through the app's own pipeline (kernel → bridge corrections →
developed blank → `costMeasuredPart` → DFM job context → Design-to-Cost). This file is what they found, what was fixed,
and what is still true. Nothing below is estimated: each number was produced by a command, listed at the end.

## 1. Bottom line

| Area | Confidence | Why |
|---|---|---|
| Design-to-Cost arithmetic (levers, drivers, "to hit target alone", projection) | **High** | Every figure is `computeUniversalStack` on a varied input. Audited: lever saving = its minutes at the costed op's own rates × (1+OH)(1+M), drivers sum to the headline within £0.0001, target re-costs to within 1e-14. Hand-checked on the stub axle (§5). |
| Hole / boss / corner recognition | **High** | Against the build scripts of 31 modelled parts + 11 stress solids: holes 103/103 diameter & count, 102/103 depth, through/blind now right on counterbores and thin drill-point skins; bosses 25/25; corner radii 100 %; volume 34/34. |
| DFM £ figures | **Medium → fixed to reconcile** | Before today they were priced at reference rates and several did not reconcile with the costing (see §3). Now only four rules carry a £, all in the costing's own time model; the rest state why they are unpriced. |
| Undercut / draw recognition | **Medium** | 50 % of undercut regions on the stress set before fixes; the cylinder and counterbore fixes are in, but internal snap beads in an open shell are still filed as "cavity" (E3, §6). |
| Rule thresholds and citations | **Medium** | No cited page could be opened from this environment (egress policy); quotes are from search-engine extracts and say so. Five numeric mismatches and five invented / wrong attributions were corrected (§3.3); tool heuristics now say "CostVision engineering heuristic". |
| The old DFM/DFA and Insights tabs | **Fixed — were the biggest hallucination risk** | They printed rule-of-thumb percentages as "£ per part" and a "Combined Saving Potential ~X %". Now only re-costed levers carry money (§3.1). |
| Absolute accuracy of any should-cost | **Unmeasured** | 0 real purchase prices in `npm run accuracy`. Say so. |

## 2. What is arithmetic on screen, and what is not

- **Arithmetic (reproducible):** headline and 8 buckets; Design-to-Cost drivers, levers, projection, "to hit target
  alone"; DFM £ on the four priced rules; re-costed levers on the DFM/DFA tab.
- **Measurement statements (no £):** every DFM finding's measured value against its threshold; setups / access
  directions; cored-depth (both times stated); tooth forms; compound angles; cross holes.
- **Heuristic observations (no £, labelled):** the DFM/DFA tab's unpriced rows ("not priced — check"); Insights
  ("reference bands: engineering estimates, not a sourced industry survey").
- **AI:** the DFM commentary may only use numbers it is given (hard rule in the prompt); no rule-of-thumb % is sent.

## 3. Fixed today

### 3.1 Invented money removed
- `opportunity-ranking.ts`: £ only for levers re-costed through the stack (`savingBasis: 'recosted'`); headline = the
  largest single re-costed lever (was the root-sum-square of rule-of-thumb %, capped at 40 %).
- Insights tab and PDF §11: "% saving potential", "Combined Saving Potential" and "~X % combined saving" removed;
  "industry-calibrated benchmarks" → "reference bands: engineering estimates" (no source exists for them).
- PDF §12/§13: "not priced" rows; no category totals (overlapping levers were summed).
- AI DFM commentary (`server/routes/dfm.ts`): only re-costed £ sent; hard rule against new numbers.

### 3.2 DFM £ reconciled with the costing (arithmetic audit)
| Defect | Fix |
|---|---|
| Priced at a reference VMC + semi-skilled, no OEE / crew — manifold deep-hole lever −£3.60 vs £2.76 in the costing | Time pricers carry **minutes in the costing's model**; Design to Cost removes them from the costed op at its own rates (now £2.71 live) |
| HPDC cored-depth "+£" had the **wrong sign** (the sheet already charges more for a cored + bored hole) | Unpriced; the finding states both times (cored + bored v drilled) |
| Corner pricer charged a per-pocket constant per corner — not in the cost model | Unpriced (`NOT_MODELLED`) |
| Setups counted 3 where the costing charges 4 | Stated, not priced; the costing's own fixturing line is the £ |
| Non-stock hole size priced a tool change the costing never removes | Unpriced; consolidation is the hole-size finding |
| Hole time ignored through/blind, metal (steel ×2) and claimed "no peck penalty" (false) | Through flag + `timeFactor`; wording corrected |
| Casting holes priced as drilled where the costing cores + bores them | Cast routes use the costing's cored-hole time |
| Drill-reach rule on a Ø29.9 bore (the costing helical-mills / bores above Ø26) | Drill rules stop at Ø26 |
| Mixed-country pricing (UK toolroom inside a regional job) | DFM job runs in the requested country's book (`withRates`) |
| Slide priced on the bbox, not the costing's silhouette | Kernel silhouette along the draw |
| DFM restack and DtC levers applied to an unrelated later costing | Only for the CAD part they measured (`dfmBelongsToCosting`) |

### 3.3 Citations corrected (citation audit)
Boss rule now checks boss **wall** ≤ 60 % of the nominal wall (Protolabs) — it compared outer Ø with wall, which no
source does; stock drills in 0.1 mm steps to Ø13, 0.5 mm above (Hubs; the old list called stock drills "special");
deep-hole threshold 4×D (Hubs); DFA small-part test uses the LONGEST side (Boothroyd size), penalty seconds labelled
approximations; through-hole core pins 4×D under Ø5 (Envalior / Wevolver), DuPont quote dropped; NADCA draft
described as the √L/C formula (0.5° is the tool's floor); gravity / sand / investment draft re-attributed; forging
thresholds cited as the tool's own table (the "ASM 14A ≈ 3 mm" clause did not exist); blow-moulding "SPI/SPE guides"
withdrawn (tool heuristic; wall floor 0.5 → 0.25 mm); cross-hole quote re-attributed to LaRoux Gillespie (Bendix);
unfound Fictiv setup quote replaced; casting fillet / hot-spot / section and machining R1 labelled tool heuristics.

### 3.4 Recognition corrected (recognition audit)
- **E2** bores across the draw: release tested at the two cylinder points facing ±draw (a side-on uv-mid read "clear").
- **E5/E6** counterbore read through; thin drill-point skin read through: breakout tested on a ring at 0.8 r.
- **E1** part saved rotated: oriented-box check; warning `orientation_skew` above 1.15× (hood bracket 1.32×).
- Edge breaks: forging / casting fillets under R0.5 on a finished model are flagged as probable machined edge breaks.
- The cross-bore test that pinned a wrong answer (0 undercuts across the bore) was corrected: drawn along the bore 0,
  across it 1 (a side core).

## 4. Every uploaded part (UK, 50,000 / yr, re-run on the final code)

| Part | Route (answers) | Should-cost | DFM — what it says | DtC levers |
|---|---|---|---|---|
| Fuel tank | blow moulding (resin, capacity, barrier: tool leanings) | £28.87 | 110 corners R1.5 < 2× wall; 10 outside undercut faces; inside skin = cavity | none priced |
| Brembo caliper | cast + machine (Al, pressure-tight, safety) | **£624.67 — see note** | draft 0° ×93, section steps, 10 undercut faces, 6 bore sizes | hole sizes £0.54 (upper bound) |
| CLOSE_VOLUME | blow moulding — **the tool's own leaning, not confirmed** | £3.20 | 97 % free-form: "not checked" leads | none |
| Bumper | injection moulding (PP-B: leaning) | £17.25 | 99 % free-form: "not checked" leads | none |
| Gearbox housing | cast + machine (Al, oil-tight) | £64.98 | 11 Ø6.6×27 at 4.1×D; 14 sizes; 5 fixturings (3-axis); cored-depth routing note; 2 compound angles; 5 cross holes | deep holes, hole sizes (upper bounds) |
| Model Mania 2017 | machining (Al) | £8.26 | angled features on one index — 2 fixturings, no finding | none |
| Hollow driveshaft | machining (steel) | £185.25 — see note | Ø29.9 non-stock (bored, no £) | none |
| Servo horn | machining (Al) | £3.32 | Ø2.45 non-stock | none |
| Hood bracket | sheet metal (steel) | £3.85 | **orientation warning 1.32×** | none |
| Eingangswelle (input shaft) | machining (steel) | £40.07 | Ø9×271 gun drill (30:1); two tooth rings (gear route) | deep hole £3.39 (upper bound) |
| Steering knuckle | forging (baseline answers) | £41.79 | sub-R0.5 radii flagged as probable edge breaks; 1 undercut face | none |
| Part1 | machining (Al) | £90.56 | 7 sizes; compound-angle bores 43.6°; cross holes | hole sizes £0.64 |
| PRCR002 / stub axle | cast + machine (ductile iron) | £84.93 | 2 × Ø14×59; 14 sizes; 3 fixturings; draft, sections, 8 undercut faces (cores), 9° spindle bores | deep holes £2.38, hole sizes £1.39 |
| Seat bracket | sheet metal (steel) | £3.39 | none fired (sheet rules are few) | none |
| Chain sprocket (STL) | — | — | **not analysed: a mesh has no B-rep faces; STL DFM is in progress, not shipped** | — |

Notes for the demo:
- **Brembo caliper** — the file declares mm and measures 777 × 340 × 470 mm, 30 L: about 3× a real caliper. The cost
  is the arithmetic on that file (and the route picked HPDC on a giga-press for that size). Do not present £624 as a
  caliper cost.
- **Hollow driveshaft** — costed as turned from bar with its two axial bores helical-milled on a VMC (£42.93 of the
  £185). A lathe would bore them; this is a costing-route question to raise, not a DFM finding.
- **CLOSE_VOLUME / fuel tank / bumper** — route or resin came from the tool's leaning; confirm before quoting.
- Real-parts baseline moves today (re-measured): Part1 £88.57 → £90.56, PRCR002 £84.09 → £84.93, casting bracket
  £39.46 → £40.31 — counterbores / spot-face lands now read blind (a locating bore takes a bore pass), cross passages
  count as undercuts (cores).

## 5. Hand check (stub axle, deep-hole lever)
2 holes × 1.11 min (0.694 min aluminium × 1.6 ductile iron) = 2.22 min; ÷ 60 × £53.15/h (the costed drilling op:
`mach-drill` £31.13 + skilled £26.19 after OEE and crew) = £1.970; × 1.12 × 1.08 = **£2.383**. The tool shows
**£2.3829**. The DFM line beside it (£2.85) is the same minutes at the stated reference rate (£76.78/h).

## 6. Known gaps — say them, do not demo around them
- **E3** internal snap beads / collapsing-core lips in an open shell are filed as "cavity" (no undercut).
- **E4** undercuts on curved faces reach the costing's count but not the DFM list.
- **E1** a rotated part is warned about, not corrected; stock is read in the file's axes.
- **E7/E8** undercut regions on profiles, false pocket rows on hollow / finned parts (costing reads pockets only on
  billet stock), keyways and countersinks are not recognised.
- Citations: none of the cited pages could be opened from this environment; someone with normal web access should open
  the URLs in the rule sources before quoting them.
- Accuracy against purchase prices: unmeasured.
- STL (the sprocket): no DFM yet.

## 7. Screen polish (after the review)
The figures did not change; how they read did. Each DtC lever is one plain line ("2.52 min of drilling off each part,
at that operation's own rate") with the calculation behind "How is this calculated?" — it was ten lines, printed
twice. Internal library ids ("mach-vmc3 + lab-uk-semiskilled") are now names ("CNC VMC 3-axis + semi-skilled
operator"); measured fields read "Depth ÷ diameter 5.5–8.8 : 1, flagged above 4 : 1", not "ldRatio 5.455–8.75:1";
severity is a word badge (Critical / Major / Minor / Advisory) in the panel and the viewer; the viewer's
inspector leads with the findings and shows the same £ as the panel (one helper); the garbled "deleting it recovers
this, shortening it recovers part" is one sentence. The workspace no longer slides under the app header when
something is scrolled into view (`overflow: clip`). Checked live in `e2e/dtc-live.ts` (viewer £ = panel £) and axe
(0 violations on the DtC tab and the viewer).

## 8. How this was produced
`npx vitest run` (3,412 passed), `npx tsc -p tsconfig.build.json --noEmit`, `npx tsx scripts/real-parts-baseline.ts
--update`, `e2e/dtc-live.ts` (PASS, axe clean), the per-part harness (kernel → `analyzeGeometry` → `developBlankFromCad`
→ `costMeasuredPart` → DFM in the country book → `dfmLevers` / `costDrivers`), and the three audit reports.
