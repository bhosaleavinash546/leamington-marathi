# CAD-to-Cost live audit — findings

**Run basis:** 9 real/synthetic STEP parts · annual volume 200,000 · region China · 5-year
programme · three arms per part (A: real browser UI via Playwright; B: `/api/cad/analyze`
`mode=both` — deterministic rules AND AI, diffed; C: headless `cost-from-cad.ts`).
Independent ground truth measured with a standalone OCCT script (`cad-audit-truth.py`),
deliberately not the pipeline's own measurement layer. Verifier (`cad-audit-verify.ts`)
validated against a seeded fault before any pass was believed.

**Headline:** geometry measurement is exact (0.00% volume error on all 9 parts, STEP path,
`geometrySource=occt` everywhere). The defects are all in the hand-offs between layers —
each one is a place where a number's *source* changes silently.

---

## CRITICAL

### F1 — Browser costs the wrong material: rules write a family token into `materialId`, the form silently keeps its default
**Repro:** flange-6holes-boss, machining, browser run. **Evidence:** the product's own PDF says
"mass for the selected material family **0.173 kg**" (aluminium) in the Geometry Provenance
section and "Alloy: 6061-T6 · Net weight: **0.502 kg (measured)**" (steel mass) in Key
Assumptions — Δ190%, self-contradicting, and the costed material bucket is aluminium rate ×
steel mass.

**Chain:** the AI answered `mat-dc01` (a real steel id) → the machining rules overrode
`materialId` with the **family token** `'steel'` (`apply.ts:114`, comment says the costing
layer resolves it — but only the *headless* mapper does) → the browser's
`setMaterial('steel')` (`main.ts:10721`) finds no option with that value and **silently keeps
the DOM default `mat-al6061`** → aluminium price, steel weight, "(measured)" label.
All 12 `setMaterial` call sites are exposed; every metal commodity emits family tokens.
Verifier: `G5-material-token` CRITICAL on flange, block-2holes, PRCR002 (all metal-part runs
with rule specs).

### F2 — Forced plastic commodity still gets a metal weight: the plastic guard reads the AI's commodity, not the engineer's
**Repro:** BUMPER.stp, commodity forced to `injection_moulding`, `mode=both`.
**Evidence:** `netWeightKg = 5.5617` = the measured **aluminium** mass exactly
(2059.9 cm³ × 2.70); the plastic mass is 2.163 kg. The AI returned no material and no
`recommendedCommodity`; the guard at `cad.ts:979` tests `ci.recommendedCommodity` — the AI's
own field — so a **forced** commodity never trips it and the weight falls through to
`wts.aluminum` (`cad.ts:988`). This is a hole in the July fuel-tank fix ("an HDPE fuel tank
costed at aluminium density read 28 kg"): the guard exists but keys on the wrong commodity
source. The IMM rules could not correct it (blocked pending the resin decision).
Sanity did flag `process_geometry_implausible` — advisory only, nothing blocks.

### F3 — Auto-detect misclassifies 3 of 5 real parts, and each wrong class drags a wrong material family into money
**Evidence (all `mode=both`, auto):**
| Part (truth) | Stage-1 verdict | Consequence |
|---|---|---|
| steering_knuckle_RH (cast, ductile iron) | **machining** | netKg 2.795 = steel mass; costed as billet machining |
| PRCR002 stub axle (forging) | **sheet_metal** | netKg 8.141 treated as blank/steel; forging route lost |
| Casting_Braket (casting) | **machining** | netKg 0.864 = aluminium mass (family default), vs 2.288 kg ductile iron in the forced run |
| Part1 (casting) | casting ✓ | coherent (3.07 kg ductile) |
| Seat_Locking_Bracket (sheet metal) | sheet_metal ✓ | coherent (0.558 kg steel) — but grade `mat-hss` (high-speed steel) for a seat bracket is an odd pick |

`enforceGeometryCommodity` (`cad.ts:210`) has physics overrides only for sheet-metal bend
signal / open drape / sealed void — chunky cast/forged/machined solids have no override, so a
wrong Haiku pick stands unchallenged.

### F4 — Sheet-metal blank arithmetic is impossible: part weighs 210% of its own blank
**Repro:** Seat_Locking_Bracket.stp, forced sheet_metal, `mode=both`.
**Evidence:** rules derived gauge `sm-thick = 0.53 mm` (min-wall heuristic) with blank
269×237 mm → blank mass 0.265 kg, but `netWeightKg = 0.558` (correct steel mass for the
measured 71.07 cm³). Utilisation = **210%** — the blank is lighter than the part stamped from
it. True mean wall is 1.55 mm (2V/S). Material bucket understated ~2× wherever the engine
prices the blank. No check anywhere relates blank mass to net mass. Sanity flagged
`cycle_time_implausible` (a different symptom) — advisory only.

### F5 — The prompt teaches the model an invented material id; the browser silently drops it
`cad.ts:1035` lists `mat-hss` among example ids in the prompt. `to-cost-params.ts:70`'s own
comment records that `mat-hss` "is in no library" and made a part uncostable in A/B round 1 —
the headless mapper grew `resolveMaterialId` to survive it, the prompt was never corrected,
and the browser path has no resolver at all (F1's `setMaterial` silently keeps the default).
Live: Seat_Locking_Bracket auto run returned `materialId=mat-hss`.

### F7 — cast_and_machine cannot be costed in the browser: rules write prose into `estimatedOperations`
**Repro:** steering_knuckle_RH.stp, cast_and_machine, browser — the run dies with no result;
headless PDF render crashes `ci.estimatedOperations.map is not a function`.
**Chain:** `cast-and-machine.ts` `OPERATIONS_RULE` emits its operations as a **joined string**
(`ops.map(...).join('; ')`) where the machining spec emits `OperationPlan[]`; the
`apply.ts:77` transform's non-array fallback (`: v`) passes the string into a field typed as
an array; the UI's CAM loop `.map()`s it and throws. Same string also crashes
`printCADAnalysisPDF`. A whole commodity is un-costable from CAD in the product.

### F8 — Browser cost of Part1: every deterministic answer lost, form defaults costed as if analysed
**Repro:** Part1.stp forced casting, browser, China. The API's own analysis settled
**ductile iron, sand, 3.07 kg, £15k pattern**; the browser form captured
`cast-mat=mat-lm25` (aluminium!), `cast-part-wt=1.159` (aluminium mass), `cast-subtype=gravity`
(default), `cast-grav-mould-cost=80000` (default) — and costed ¥281.52 from those defaults,
under the same "measured" letterhead. No page errors; completely silent. (F1's mechanism plus
undecided-rule fall-through.)

## MAJOR

### F9 — Phantom £150,000 feature-machining tooling default enters real costs
`cast-mf-tooling` (and machining's `mach-mf-tooling`) default to £150,000 in the form; the
CAD apply path never sets or clears them. Reproducing the bracket's tooling bucket ¥23.19
requires exactly: £14.5k pattern/8k life + £15k NRE/200k + **£150k default/200k = £0.75/part
of tooling for a fixture nobody specified**. Every cast/machined part carries it silently.

### F6 — Injection/blow-moulding tooling passes straight from the AI, and the AI has a stock answer
Across ALL 16 runs the AI returned `injectionMoulding.mouldCostGBP = 200000, mouldLife =
500000` — byte-identical, even on runs where injection moulding was not the commodity. On
BUMPER-auto those numbers ARE the costed tooling (no IMM tooling rule exists to overwrite
them; casting/forging/sheet-metal tooling DO get rule-overwritten — verified: casting life
500000→8000, forging die 180000→36141). Blow moulding likewise: fuel-tank mould £180k/500k
is raw AI. An AI constant with no plausibility bound drives the tooling bucket for the two
biggest plastic commodities. (Also observed: junk tooling in irrelevant sections — e.g.
`casting.dieMouldLife = 1` — harmless today but only because nothing reads it.)

## Amplifier — sanity warnings never block
`cad-sanity.ts` correctly *saw* the bumper problem (`process_geometry_implausible`) but the
run continued to a costed result with the aluminium weight. Warnings ride in the payload;
nothing gates Calculate. (Design decision to revisit, not a one-line fix.)

## Also verified clean (checked, not assumed)
* **China PDF §3/§4 arithmetic is exact** (Casting_Braket, browser run): gross = net ÷ 0.65;
  ¥6.85/kg = £0.86 library × 0.880 millSteel regional × 9.0498 FX; gross×price − scrap credit +
  consumables = stated net material to the cent; machine cost = rate × cycle ÷ OEE exactly, both
  operations. The regional/FX chain reproduces by hand.
* Volume/bbox/surface measurement: exact match to independent OCCT on all 9 parts (G2 PASS ×9).
* Weight arithmetic per family is exact (volume × density to 4 decimals) wherever the right
  family is chosen (G3 PASS on every run).
* `Casting_Braket` forced-casting run end to end: ductile iron 2.288 kg, sand route, tooling
  £14,500/8,000-life, £29.87 total — every derivation line reproduces by hand arithmetic
  (see armc-Casting_Braket.txt for the full derivation chain).
* Near-net machining cap fired where expected (`near_net_machining_capped` on stub-axle
  forging + flange auto-cast runs).
* Repeatability: same part + same inputs → byte-identical analysis (cache keyed on content),
  `noCache=true` honoured for fresh sampling.

## MINOR

* **§9 footnote contradicts its own table** — "Tooling held fixed" while the tooling column
  varies by region (¥23.19 CN → ¥42.16 UK on the bracket). Either the note is stale or the
  multiplier is wrongly applied to tooling.
* **§10 carbon uses the Steel factor (2.10 kg/kg) for ductile iron** — cast iron is ~1.5;
  the carbon family mapping has no cast-iron entry.
* **AI mass inflation admitted by the ×1.05 clamp** — bracket costed at 2.359 kg (AI) vs
  2.272 kg measured-at-library-density; three cast-iron densities circulate (library 7.10,
  rules 7.15, AI-implied 7.37). Clamp to measured, one density source.

## Calibration questions (not arithmetic errors — flagged for engineering review)
* Sand-casting tooling: £14,500 pattern amortised over an 8,000-mould life → £1.81/part at
  any volume. Arithmetic is consistent, but pattern £14.5k + life 8k both look off-market
  (typical alloy match-plate £3–8k, life 50k+); tooling may be overstated several-fold.
* `mat-hss` as the representative pick for a stamped seat bracket (auto run).

---

## Parameter provenance map — every cost input, its source, its guard, live verdict

Sources: **GEO** = measured OCCT geometry · **AI** = model output · **RULE** = deterministic
rule · **LIB** = rate library · **USER** = form/answer · **DEF** = shop default.

| Parameter | Source chain | Guard | Live verdict |
|---|---|---|---|
| volume / bbox / surface | GEO | — | **exact** (0.00% vs independent OCCT, 9/9 parts) |
| netWeightKg | GEO × family density; AI clamped ≤1.05× | family picked from AI material / commodity | **broken 3 ways**: F2 (family default→aluminium on forced plastics), F1 (family≠selected grade in browser), clamp admits +5% AI inflation |
| materialId (grade) | AI → RULE (family) → form | headless resolves family→grade; **browser does not** | **F1 CRITICAL** — form silently keeps default grade |
| material £/kg | LIB × regional × FX | library id required | **exact** (¥6.85 = 0.86×0.880×9.0498 reproduced) |
| utilisation / yield | RULE (band midpoint) | band | consistent (0.65 sand) |
| blank dims (sheet) | GEO bbox ×1.05 | none vs mass | ok |
| gauge (sheet) | GEO bend-read, else min-wall | **none vs mass** | **F4 CRITICAL** — 0.53 mm gauge, part 210% of blank |
| cycle time (machining) | GEO CNC estimate preferred over AI | near-net cap; removal ceiling (browser) | cap observed firing (`near_net_machining_capped`) |
| cycle time (casting/sand) | RULE from mass, else AI | rule overwrites AI (0.241→0.1846 hr observed) | ok where rules exist |
| strokes/min (sheet) | GEO pitch-derived, clamp 10–120 | engine cycle floor | ok (34 SPM observed) |
| machine id | RULE pinned (foundry) / cost-ranked (machining) | resolveMachineIdForOp keyword map | ok on rule commodities |
| tooling cost/life (casting, forging, sheet) | RULE parametric (OCCT), overwrites AI | rule replaces AI (observed 500k→8k life, £180k→£36k die) | ok mechanically; calibration Q on sand pattern |
| tooling cost/life (IMM, blow) | **AI raw** | **none** | **F6 MAJOR** — stock £200k/500k constant in every run |
| cavities | AI | none (tonnage recomputed from area, count unchecked) | 1–4 observed, plausible so far; unguarded |
| commodity | AI stage-1 → physics override | bends/drape/sealed-void only | **F3 CRITICAL** — no override for chunky solids; 3/5 real parts misclassified on auto |
| packaging / logistics | GEO envelope + mass scaled | formulas | consistent |
| overhead % / margin % | USER/DEF (12% / 8%) | applied once, of the right base | **exact** in PDF recompute |
| region factors / FX | LIB (REGIONAL_DATA) | — | **exact** (China chain reproduced) |
| costRange low/mid/high | **AI raw** | ordering only | prints as headline money in the CAD-analysis PDF (architectural) |
| carbon factors | LIB family map | — | MINOR: cast iron missing → Steel factor used |

---

## Fixes applied — each with a unit test and a live before/after re-run

| # | Fix | Where | Live proof (before → after) |
|---|---|---|---|
| F1/F8 | Browser resolves family tokens & invented ids to a real grade of the SAME family before any field applies; `setMaterial` warns instead of silently keeping the default | `material-family.ts::resolveFormMaterialId` (new), `main.ts::applyCADToForm/setMaterial` | flange: costed `mat-al6061` @ 0.502 kg steel mass → `mat-steel1045` @ 0.502 kg (coherent); Part1: `mat-lm25`/1.16 kg → `mat-gjs500`/ductile |
| F2 | Weight-family guard now reads the engineer's FORCED commodity, not only the AI's field | `cad.ts::normalizeCADAnalysis(+selectedCommodity)` | BUMPER forced IMM: 5.5617 kg (aluminium) → 1.854 kg (`mat-pp`) |
| F3 | Bend-signal override requires mean wall ≤ 8 mm (a forging's fillets are not bends); reverse guard reclassifies thick "sheet metal" to machining | `cad.ts::enforceGeometryCommodity` | PRCR002 auto: casting→(bend misfire)→sheet_metal, 8.1 kg blank → stays casting |
| F4 | Sheet gauge floored to mass-consistency (fires only on egregious ≥1.35× shortfall — drape slack is legitimate) | `sheet-metal.ts::gaugeMm` | Seat bracket: 0.53 mm gauge, blank 0.265 kg < part 0.558 kg (util 210%) → 1.12 mm, blank 0.561 kg ≥ part |
| F5 | Prompt example ids are now all real library ids (6 invented ids removed); test asserts every quoted `mat-` id exists | `cad.ts` prompt + test | AI can no longer learn `mat-hss` from us |
| F7 | cast_and_machine operations emitted as data (`OperationPlan[]`), not prose; `apply.ts` fallback hardened to `[]` | `cast-and-machine.ts`, `apply.ts` | knuckle: browser crash/no result → 4 structured ops, costed |
| — | `printCADAnalysisPDF` renders missing fields as "—" instead of crashing (4/16 live captures crashed the export silently) | `src/export/pdf.ts` | all 18 captures now render to PDF |
| — | Material provenance label: AI-folded family reads "from the AI material suggestion — not engineer-confirmed" instead of "confirmed by engineer" | `cad.ts::withAIMaterial`, `derive/material.ts` | basis text now truthful |

`CAD_PROMPT_VERSION` bumped 13 → 14 so cached pre-fix analyses can never be served.
Verification: **1,790 tests pass** (1,777 + 13 new), typecheck clean, `npm run accuracy`
unchanged (MAPE 5%, all 5 reference actuals within ±10%), reference part still £23.27,
prompt baselines regenerated with every moved line named to a fix.

### Honest residual (verified still present after the fixes)
Part1 forced-casting in the browser still costs **form defaults** when the AI returns no
material and the rules stay undecided (`cast-mat=mat-lm25`, 1.159 kg aluminium, ¥281.52 —
unchanged). The resolver fix (F1) repairs *wrong* material tokens; it cannot invent an answer
where there is none. The deterministic CLI refuses to cost in exactly this state ("Not
costable until answered — by design"); the browser should gate the same way — that is
recommendation #1, a behavioural change not made silently. The auto run of the same part
(where the AI does supply a material) is coherent (`mat-gjs500`, 3.07 kg).

## Gap closures (second pass — all six recommendations implemented and live-verified)

| Gap | Closure | Live proof |
|---|---|---|
| 1. Undecided material costed defaults | An AI-sourced material keeps the question **open as a blocking confirm** with the model's pick as the leaning (`pendingDecisions`, cad.ts). The browser's existing Calculate gate then refuses until the engineer clicks. | Part1 forced-casting now returns `material.family / blocking` with leaning "cast iron" and the why-text naming the run-to-run flip — no silent cost |
| 2. Blocked rules let AI money stand | `suppressAIForUndecided` (apply.ts): fields owned by a rule that is ASKING are cleared, the clearing recorded in `aiSuppressed` with the model's claimed value. | Unit test replays the bumper's stock £200k/500k → suppressed while resin is open; nothing suppressed once answered (rules overwrite instead) |
| 3. §7 raw AI money | Retitled "§7 — AI Indicative Cost Range (model opinion — not engine-calculated)"; all-zero ranges no longer render. | test asserts the label |
| 4. Sanity never blocks | `blocking: true` on `process_geometry_implausible` and >50% weight contradictions; browser requires one explicit acknowledgement per code before a CAD-sourced Calculate. | unit test on the bumper geometry |
| 5. Phantom £150k NRE | CAD applies zero the untouched `*-mf-tooling` default with provenance + tooltip; manual form use keeps the default. | bracket tooling bucket now = pattern + stated NRE only |
| 6. Gear absorbed by machining | `gear` added to stage-1 vocabulary and the CAD dropdown; a gear-named or gear-classified part gets a **hand-off response** with the measured envelope (never costed as machining silently). Sharper finding en route: the gear ENGINE has **no UI form at all** — the browser hand-off says so honestly; the form is roadmap. | live: gear-named STEP → `handoff:'gear'`, prefill Ø80 × 20 mm face, 63.9 cm³ |

`CAD_PROMPT_VERSION` 15. Suite: **1,796 tests pass** (6 new), typecheck clean, prompt
baselines unchanged, dist rebuilt.

## Recommendations (architectural — reported, not silently changed)
1. **Sanity warnings should be able to block** (or at minimum force an explicit engineer
   acknowledgement): the bumper's aluminium-mass run carried `process_geometry_implausible`
   and still costed; Part1's undecided-material browser run costs the default grade with no
   flag at all.
2. **Retire the dual mapper** — browser `applyCADToForm` and headless `toCostParams` have
   diverged guards by design; F1 existed precisely in the gap. One mapper, two callers.
3. **Bound AI tooling for IMM/blow moulding** the way casting/forging/sheet already are
   (rule-parametric with OCCT inputs) — the AI's stock £200k/500k should never be the costed
   value unchallenged.
4. **`costRange` in the CAD-analysis PDF** is raw AI money under the product letterhead —
   either derive it from the engine spread (§7 uncertainty exists for exactly this) or label
   it "AI indicative, not engine-calculated" in the header, not the footnote.
5. **Phantom `*-mf-tooling` £150k default** should be zero when the CAD apply path doesn't
   set it (F9) — left unfixed pending a decision, since some users may rely on the default.
6. **Wire `gear` into the CAD flow** or remove it from the decks' CAD claims.

## Gaps stated plainly (not silently skipped)
* `gear` has no CAD path (classifier vocabulary, rules, dropdown) — a gear STEP costs as
  machining with none of the gear-audit guards. The decks advertise gear cutting from CAD.
* `cast_and_machine`, `sheet_metal_fab`, `thermoforming`, `rotational_moulding`, `rubber`,
  `composites`, `extrusion`: deterministic rules exist but no headless cost mapping
  (`COSTABLE_COMMODITIES` = 6); browser can cost them, so Arm C cross-checks are impossible —
  the dual-path divergence is structural.
* The six PCB/harness/BIW/painting/assembly commodities have no STEP semantics (correct).

*(Browser sweep completing; per-part PDF checks and the fix set follow.)*
