# Prism — 360° review before the Director demo (9 October 2026)

**Scope:** the whole Prism flow, traced end to end and run live on real STEP
files:
- inputs: CAD, drawing, quote;
- measurement and engines;
- the dossier;
- the lenses;
- idea generation;
- the checks on each idea;
- the results.

**Three methods:**
1. **Live runs.** Nine STEP parts were driven through the same HTTP calls the
   page makes, against a real server and OpenCascade. The model was a stub,
   so no tokens were spent. Every request to the model was captured.
2. **Adversarial code review.** It covered the Prism routes, engines,
   evidence builders, page and panels, with proof scripts for each
   arithmetic claim.
3. **Competitive benchmarking.** It covered 16 vendors and the current
   technique literature (`docs/PRISM-BENCHMARK-2026-10.md`).

## 1. Short answer

Prism's numbers do come from deterministic engines, and the waterfall chains
exactly (every run: Σ steps = quote − entitlement, to the cent). The review
nevertheless found places where a number the Director would see was wrong,
inflated, or presented as more verified than it was. They are fixed in two
commits:
- `ae0a202`: fixes from the live runs;
- `09d39d7`: fixes from the code review.

The most serious problems were these:
- **Calibration.** The supplier quote calibrated the engine that then judged
  it. Each "Build dossier" click shrank the commercial gap toward zero.
- **Quote forensics.** Lines were judged one by one against a whole cost
  bucket. A one-off €45,000 die cheque was compared with a per-part
  amortisation.
- **Wrong materials.** The material resolver priced *copper* as brass and
  *alumina* (a ceramic) as aluminium 6061. Engine checks then stamped those
  ideas "confirmed".
- **Mass claims.** Engine checks "confirmed" whatever mass change the AI
  stated: "25 → 5 kg" on a 1.2 kg part showed *Engine ✓ −78%*.
- **Unconfirmed reads.** AI vision, photo and function reads started
  pre-ticked, while the dossier called them "engineer-confirmed".
- **Lost cautions.** CAD warnings were dropped before the dossier: a
  metre-scaled file, and an assembly fed to the single-part flow.

**What remains unproven** is the quality of ideas from the real model on
today's pipeline. The four saved real-model runs date from 2 September, before
saving models, vision, the function stage and DFA existed. **Rehearse the demo
with a real key on the demo part** (§7).

## 2. The workflow, traced

| Stage | What runs | Deterministic? |
|---|---|---|
| 1. Inputs | Part name, material, process, mass, volume, region; STEP; optional drawing, quote, photos | — |
| 2. Should-cost | `computeShouldCost` (EUR), Monte-Carlo P10–P90 | **Yes** |
| 3. 3D measurement | OpenCascade: wall by ray casting, draft and undercut per face, features (AAG), set-ups, bends, revolution; DFM rules pass, fail or **not evaluated** | **Yes** |
| 4. Drawing (optional) | AI vision extracts dimensions, GD&T, Ra, title block | AI read, labelled "verify" |
| 5. Quote (optional) | AI reads the PDF; the user confirms every line | AI read, user-confirmed |
| 6. Vision / photos / function (optional) | AI reads rendered views and photos and drafts a function model; the engineer ticks what they agree with | AI judgement; **now off until confirmed** |
| 7. Dossier | Waterfall (W1 commercial, W2 spec, W3 process, W4 footprint), forensics, counter-offer, routes, region sweep, volume curve, spec relaxation, FAST matrix, DFA time model, catalogue grades, input cautions | **Yes**, all engine math |
| 8. Lenses | 6–7 lenses, each a slice of the dossier with its own directive | Text only |
| 9. Generation | `/api/analyze`: one generation pass per lens; ideas must cite `[E#]/[W#]` | AI |
| 10. Checks | Validation (refs must resolve), saving model, arithmetic check, engine check (substitution / mass / tolerance / assembly / footprint / commonisation / cycle), critique, rank | **Yes** |
| 11. Results | Badges for every stamp; PDF with the dossier appendix; chat grounded in the dossier | — |

**Where an AI number can still appear, by design:**
- **Idea savings without a saving model.** These are the model's own
  estimate. The arithmetic check verifies only that they are internally
  consistent; the engine check prices the *direction* on a reference case.
- **Saving-model terms.** The total is computed, but the per-part terms are
  the model's. The badge now says *"Total computed from AI terms"* in a
  neutral colour; teal is reserved for engine measurement.
- **Numbers read by AI.** Drawing dimensions and quote amounts are read by AI
  and confirmed by the user; their labels say so.

## 3. Live runs (stub model, real engines)

| Part | Result | What it showed |
|---|---|---|
| HPDC housing (A380, 0.185 kg) | Engine €3.79 vs quote €3.20; HPDC DFM 57 on 13/17 rules, 6 findings | Quote **below** the model; the waterfall says so. Before the fix the P10–P90 band reached the AI as "—–—". |
| Gear blank (42CrMo4, hot forging) | Engine €3.52 → entitlement €0.74 | W3 hot → cold forging releases €2.71 (77%), of which **51% is tooling amortisation**: an €85k die with a 60k life against a €30k die with a 2,000k life. Now shown in the step's own text, with a "challenge before negotiating" flag. The engine constants were **not** tuned (benchmark-gate rule). |
| Bent bracket, drawn cup, forged lever, extruded profile | Clean | Waterfall chains; forensics, counter-offer and gap arithmetic all hold. |
| Seat-bracket **assembly** in single-part mode | Merged solid, p95 wall 35 mm | The CAD engine warned "assembly"; the dossier dropped it. Now an input caution and an evidence caution. |
| **Metre-scaled** STEP | DFM withheld its dimensional rules; the dossier still showed "0.06 × 0.04 × 0.01 mm" | Now a `cad-units` caution, an evidence caution and a gate on generation; W3 skipped with its reason. |
| **Corrupt** STEP | Clear DFM error | The dossier said "no 3D model supplied". It now says one was supplied and could not be measured. |
| No CAD | Honest "not available" sections | — |
| Unknown material | 400 with suggestions | — |
| Region "Western Europe" | should-cost 400, but the dossier silently used **Germany** | Now 400. |

**Typed mass far from CAD mass:** a 10× gap flagged
`mass-impossible-high` and `mass-vs-cad`, but generation still ran on the
wrong mass. Generation now **waits for an explicit acknowledgement**.

## 4. Fixed (commits `ae0a202`, `09d39d7`)

### Numbers
| # | Defect | Fix |
|---|---|---|
| PR-01 (critical) | The quote calibrated the engine judging it; repeated saves compounded the effect (gap €2.23 → €0.22 after four saves) | The dossier calibration excludes the quote under judgement; the save happens after the build; a duplicate save is refused. **Verified live:** the gap is unchanged after a save. |
| PR-02 (critical) | Each quote line was judged against the whole bucket | The lines of a kind are summed and judged together; the counter-offer target is shared across them. |
| PR-03 | A one-off tooling cheque was compared per part (+6,249,900%) | Amortised over the engine's tool volume and said so; any other ratio outside 0.05–20× is reported as *units-suspect* and is not an ask. |
| Live | Copper priced as brass; alumina, Si₃N₄ and AlN as aluminium | Ceramics resolve to nothing (honest null); copper and zinc map to their own grades. |
| PR-05 | Engine checks for UK, Spain, Korea and Czech parts ran at German rates | Prism sends the engine region; the server maps every slug. |
| PR-19 | Mass, cycle and commonisation checks confirmed any AI-stated change | The reference mass is re-anchored to the part's own mass; the stamp says the change is the idea's claim; a cut above 50% is marked on the badge. |
| PR-11 | Waterfall steps mixed calibration cells | One anchor factor for the whole chain. |
| Live | P10–P90 hard-coded null in the dossier | The Monte-Carlo band is computed with the same seed and calibration as the page. |
| Live | Unknown region → Germany; unknown currency → EUR | Both refused with a reason. |
| PR-30 | CAD mass rounded to whole grams | Rounded to 0.1 g. |

### Honesty of labels
| # | Defect | Fix |
|---|---|---|
| PR-06/07 | AI vision and photo observations and the AI function model started pre-confirmed | All start unconfirmed ("Tick all" is one click); a function model whose rows or shares do not sum to 100% is refused. |
| PR-18 | A teal "Computed, not claimed" badge appeared on AI-stated terms | Renamed *Total computed from AI terms*, neutral colour, with a tooltip on what is and is not engine-priced. |
| PR-08 | Fastener counts summed across overlapping photos | The highest count per type is a floor that holds. |
| PR-09/10 | Drawing tolerances, GD&T values and the units caution never reached the dossier; ±0.01° angles counted as mm tolerances | The normalised fields are read; units are carried; angles are excluded. |
| PR-12 | The process lens was offered routes the waterfall refuses | Only defensible routes (DFM ≥ 50 on ≥ 40% of rules) are offered; the rest are counted. |
| Live | Fleet memory matched a steel assembly to an aluminium extrusion at 83% | It now requires the same material or process family, and says which. |
| Live | The W3 step did not say where its money came from | Bucket-by-bucket bridge; flags a step > 40% or one dominated by tooling. |
| PR-31 | A near-zero engine delta read "contradicted 0%" | The badge says "no difference (±0.5%)". |

### Robustness
| # | Defect | Fix |
|---|---|---|
| PR-13 | A newline plus `[W9]` in PDF or AI text could plant a fake engine line | Every evidence line is flattened; embedded tags are neutralised. |
| PR-14 | Lens evidence was cut silently at 20,000 characters | Cut on a line boundary at 40,000, with the number of omitted lines stated. |
| PR-15/16/17 | BOM over 120 rows cut silently; a cleared price read as €0; a stale suggested mass was sent as "stated" | The BOM is refused with its count; a price must be > 0; only a typed mass is sent. |
| PR-20/21/22 | What-if started off-spec; stale results survived input changes; the PDF and chat read the last-built dossier | Fixed: the what-if starts from the dossier spec, results clear when inputs change, and the dossier is keyed by result id. |
| PR-23 | A metre-scaled model claimed "already the best-fit process" | W3 is skipped with its reason. |

**Tests:** 1,528 unit tests pass, including 19 new regression tests in
`tests/prism-review-2026-10.test.mjs`, plus 25 integration tests; `tsc` is
clean.

## 5. Open — not fixed in this pass

| # | Item | Why not now / what it needs |
|---|---|---|
| R7 | **No real-model evidence on today's pipeline** | Needs an API key (paid). Run `benchmark/ideation-eval.mjs` on the four saved parts plus the demo part. |
| Engine | Hot vs cold forging tooling assumptions dominate the W3 step on small forgings | A modelling change must pass `benchmark:cost`; it is surfaced honestly in the step text instead. Ask the toolmaker for die cost and life before the demo, if a forging is shown. |
| PR-04 | Notes the AI read beside quote amounts ("per 100", "amortised") are not shown beside the amount | UI change in the quote step. The units-suspect verdict now catches the worst cases. |
| PR-24/25 | The Measure step shows € while the rest of the page uses the display currency; the quote currency list offers 4 of the supported currencies; the FX rate used is not stated | Display only; engines are correct in EUR. |
| PR-26 | Route prices in the routes section are uncalibrated while the dossier is calibrated | Apply the anchor factor as in PR-11. |
| PR-27 | The arithmetic check ignores the currency symbol in the basis | Low impact: Prism runs in EUR. |
| PR-32 | `/api/analyze` accepts unsigned lens blocks | Only a user's own run is affected; sign blocks server-side. |
| PR-33/34/35 | Multi-step routes in the dossier (API only); Back wipes paid AI reads; drawing tolerance is not sent to the DFM tolerance rules | Small, separate changes. |

## 6. Competitive position and roadmap

The full sourced report is in `docs/PRISM-BENCHMARK-2026-10.md`.

**Where Prism already leads.** No vendor found combines all of these:
- measured DFM with three outcomes (pass, fail, not evaluated);
- a deterministic entitlement waterfall;
- line-level quote forensics;
- LLM ideas that each carry an engine check and an arithmetic check;
- AI reads that need confirmation.

**Where Prism is behind, and what competitors have:**
- aPriori aiSource (GA 19 Aug 2026) competes directly with the forensics and
  counter-offer.
- Siemens's Feature2Cost prices tooling from recognised undercuts and bends.
- Tset shows CO₂e beside € on every line.
- CADDi searches similar parts across a whole corpus.
- Xometry learns price and lead time from transactions.

**Next, ranked by credibility per effort:**
1. ~~P10–P90 band in Prism~~: **done in this review**.
2. CO₂e per part on every route and idea (`carbon.mjs` exists).
3. Constrain evidence refs, rule ids and feature ids to enums in the
   generation schema. Today unresolvable refs are dropped and flagged after
   the fact.
4. Feature-driven tooling cost: mould slides from measured undercut
   directions, die stations from bends. This is the biggest accuracy gap
   against Siemens and aPriori, and would also settle the forging-die
   question.
5. Per-callout tolerance cost, so "relax this tolerance" ideas become
   engine-checked.
6. Split-conformal intervals on the user's own quote corpus. No competitor
   claims coverage guarantees.
7. Cost by analogy across the quote corpus, adjusted by the engine's ratio
   between the two parts.
8. Roadmap R6: a TRIZ lens built from measured DFM conflicts. It is ahead of
   the published LLM-TRIZ work, which uses free text only.

## 7. Demo checklist

- [ ] **Real-key rehearsal on the exact demo part.** Check that ideas cite
  real `[E#]` lines, how many are engine-checked, and that no saving is
  shown without its badge.
- [ ] **Mass.** Use a part whose typed mass matches the CAD mass. Otherwise
  the mass gate will (correctly) stop generation on stage.
- [ ] **Quote.** Use a quote with a realistic line split. Expect W1 to be
  positive; if the quote is below the model, the waterfall says so.
- [ ] **Calibration.** Do not save the demo quote to calibration before the
  demo. It no longer distorts the dossier, but a fresh corpus says
  "uncalibrated" honestly.
- [ ] **Forging.** If showing a forging, read the W3 bridge first. A large
  tooling-driven step is flagged to challenge, and the Director will ask.
- [ ] **Themes.** Open the result page in both themes once.
