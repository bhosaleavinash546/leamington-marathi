# Analyze — end-to-end review, 29 September 2026

Scope: the deterministic half of `/api/analyze`. That covers:
- the process resolver the engine check depends on (`material-process-resolve.mjs`, `material-aliases.mjs`);
- the engine check (`engine-idea-check.mjs`);
- the arithmetic re-check (`idea-arith.mjs`);
- intra-batch dedupe, the depth rubric, prior-art labelling and ranking (`idea-quality.mjs`, `idea-depth.mjs`, `server.mjs`);
- the value reader shared with exports (`src/services/report-core.mjs`);
- the Analyze and Results pages.

The model proposes; these stages decide what the reader is told is verified and in what order the ideas appear.

Method: **measure, then read, then change**, on real model output rather than
fixtures. The repository holds 127 distinct ideas from four live Prism runs
(`benchmark/prism-runs*`). Every stage was re-run over them with the current
code, and each verdict was hand-checked against the idea's own words. No
threshold was tuned to the corpus.

## 1. What was tested

| Check | How |
|---|---|
| Arithmetic verdicts | All 127 ideas. Every `mismatch` (12) and the full `consistent` list (82) re-multiplied by hand. |
| Engine verdicts | Every stamped contradiction judged against its own reference case. The resolver was probed with 90 process phrasings, including every catalogue name. |
| Value reader | Every annual-value string, compared with the arithmetic module's independent money reader. |
| Ranking | Each run re-ranked with fresh arithmetic stamps: where do ideas whose sums fail land? |
| Prior art | The real 1,600-idea marketplace index. Each label produced by the live query (title + system name) compared with title alone, counting labels the system words alone carried. |
| Dedupe | All 18 merges on the four runs read pairwise. |
| Live | Real server and a new **replay stub** (`FAKE_LLM_IDEAS_FILE`, below) serving the saved live ideas with their stamps removed, so `/api/analyze` re-derives every verdict from real model text. Then the browser: configure → generate → Results → open an idea, in both themes, with axe and the console checked. |

## 2. Defects found and fixed

| # | Defect | Evidence | Fix |
|---|---|---|---|
| A1 | **The engine check compared stand-ins as if they were the proposal.** The resolver maps "clinching", "self-piercing rivet", "adhesive bonding", "laser welding" and "FSW" to *MIG Welding Assembly*; "anodising" and "Geomet" to *Zinc Plating*; "shot peening" to *Grinding*; "trickle impregnation" and "potting" to *VPI*. For pricing one part that is a fair nearest model. In a comparison whose subject *is* that difference, it is not: "SPR replaces spot welds" was priced as MIG vs spot welding, and "bonding replaces MIG" as MIG vs MIG. | Resolver probe | `PROCESS_STAND_INS` lists, per catalogue key, the aliases that name a *different* process. The resolver flags them, and keyword-regex guesses are flagged the same way. The engine comparison **declines** with the reason when the step that changed is a stand-in. A stand-in present unchanged on both sides does not block. Single-part pricing is untouched. |
| A2 | **Two catalogue processes could not be named.** "Laser Cutting + Bending" and "Glass Forming (Bend + Temper)" were split on "+" before lookup. | 2 of 53 catalogue names did not resolve to themselves | The resolver tries the whole string (exact key or exact alias) before splitting. A real chain ("HPDC + CNC + e-coat") still splits. Also fixed: "Croning", which *is* shell moulding, now resolves to Shell Mould Casting instead of Sand Casting. |
| A3 | **Ranking used the claim, not the arithmetic.** An idea whose own basis multiplies out to a fraction of its claim kept the claim as its ranking base, with a ×0.7 discount. | Lamination run: **#1 and #2** were ideas whose bases came to **1/7 and 1/20** of their claims (M350-50A: €146K vs €0.7–1.5M; Backlack: €115K vs €1.7–2.9M) | On a shortfall mismatch the rank uses the basis figure and says so ("ranked on its own basis €115K, not the claimed €2.3M"). An overshoot keeps the lower claim. The inconsistency itself costs a single ×0.85. Those two ideas now sit at #10 and #15. |
| A4 | **The value reader split on every hyphen.** "€0.4M ex-works at 10,000,000 units/yr" read as **€5.2M** (averaged with the volume). "Net **−**€0.6M–€1.2M part cost", a cost *increase*, read as a €0.9M saving. A cost-neutral claim read as NaN. The same reader orders the exports. | 3 of 127 live claims | Reads the first money figure, its range and its sign. The server and export copies are replaced together, and a test asserts they agree. A stated cost increase ranks below every saving, and the rank basis says why. |
| A5 | **One in four prior-art labels was carried by the system name.** The query appended "Powertrain — BEV / MHEV" to the idea's title, so "wave-wound hairpins" matched a *hydroformed A-pillar node* and "shift stamping footprint" matched a *commonised bodyside*. Each wrong label shows a badge and costs up to 30% of rank. | **29 of 115** labels scored below the threshold on the title alone | `priorArtFor(idea)` queries the idea's own title, and the deep pass re-checks repairs with the same function. After: "wave-wound hairpins" → *NIO ET9 W-Pin continuous-wave winding*. |
| A6 | **Arithmetic: an unpriced deduction was called an error.** "…× 15% × 200,000, **net of end-plate tooling**" multiplies to the figure *before* a cost the idea names but does not price. The parser called the lower stated range a mismatch. It already handled the mirror case (an unpriced saving makes the figure a floor). | 2 of the 12 mismatches | An overshoot with a named, unpriced deduction is `partial` with `bound: 'ceiling'`, and the badge reads "Sums are a ceiling". A deduction cannot explain a *shortfall*, which stays a mismatch. |
| A7 | **Arithmetic: a share read as the whole bucket.** "avoids **share of** tooling €0.66/part" was multiplied out as the full €0.66 → "consistent at €39,600". | 1 false pass | A figure led by "share / portion / part of" is the bucket. With no percentage applied to it, the share is an unpriced term. A stated percentage elsewhere ("24% … applied to the portion of €0.29") still prices it. |
| A8 | **Arithmetic: any "/kg" in a clause refused it.** "€214.68 × 10% × 200,000 (NdFeB at 92 €/kg)" was refused for want of a mass. | 1 false refusal | A €/kg price is a money figure *immediately* followed by /kg. A €/kg price with genuinely no mass is still refused. |
| A9 | **"Inside the stated range"** was said of €12,600 against a stated €6K–€11K. The figure was inside the ±15% band, not the range. | Hand check | The note says "within 15% of the stated …" when that is what is true. |
| A10 | **`/api/analyze` answered 500 to a body without `config`.** One line guarded it; the next dereferenced it. | Live | 400 with the reason. |
| A11 | **Seven selects on the configure step had no accessible name.** Labels were visible but not bound, so a screen reader announced seven unnamed pickers. | axe, serious, both themes | Labels bound with `htmlFor`/`id` (nine controls). |

## 3. Measured effect

| Measure | Before | After |
|---|---|---|
| Arithmetic mismatches that are genuine (hand check) | 10 of 12 | 10 of 10 |
| "Consistent" verdicts that are wrong (hand check) | 1 of 82 | 0 of 82 |
| Catalogue process names that resolve to themselves | 51 / 53 | 53 / 53 |
| Engine comparisons that can rest on a stand-in | not detected | declined with the reason |
| Live claims the value reader misreads | 3 / 127 | 0 / 127 |
| Prior-art labels carried by the system name | 29 / 115 | 0 |
| Top-2 ranked ideas whose sums fail (lamination run) | 2 | 0 |
| Configure-step accessibility (serious) | 7 violations | clean |
| Tests passing | 1,352 | 1,364 (+8 in `tests/analyze-review.test.mjs`, +4 in `tests/idea-arith.test.mjs`) |

Live: the replayed lamination run returns 11 ideas after dedupe in under
3 seconds, and every stage stamps. In both themes, the configure, Results and
idea-detail steps are axe-clean with no console errors.

## 4. Replay mode — a new review instrument

`FAKE_LLM_IDEAS_FILE=benchmark/prism-runs-after/lamination.json node
scripts/fake-llm.mjs` serves a saved **live** run's ideas with every pipeline
stamp removed. A real server pointed at it re-derives each verdict from what
the model actually wrote. That is how this review exercised the whole endpoint
on real text for free. It is documented in `docs/OPERATIONS.md`.

## 5. What remains — not fixed, stated

1. **The depth rubric has hit its ceiling.** On the post-upgrade runs, 35 of
   62 ideas score 100, because the prompt now demands every ingredient the
   rubric checks. It still separates shallow from deep on older output (32–80),
   but no longer ranks among good ideas. That job falls to the engine,
   arithmetic and critique stages. A finer rubric needs criteria that check
   *correctness*, not presence.
2. **Engine coverage on the saved runs is unknown.** Those runs predate saving
   `engineCheckInput`, so the model's requests cannot be replayed and every
   replayed idea reads "no engine-check request". New runs keep the request,
   so the next saved run can be replayed in full.
3. **An assembly-kind check prices assembly only.** "Resolver → inductive
   sensor" was contradicted on assembly time (+1 part). The idea's saving is in
   the bought-part price, which that kind never sees. The stamp names its
   reference case, so this is visible, but the verdict answers a narrower
   question than the idea asks.
4. **Cross-lens dedupe (0.45) folded 2 of 18 pairs that are arguably distinct
   levers**: an insert-moulded terminal block absorbing a flat-copper busbar,
   and adhesive bonding absorbing thin-gauge steel. The dropped titles remain
   visible as `mergedTitles`. The threshold was not retuned to four runs.
5. **The arithmetic check compares the midpoint of the basis with the stated
   range.** A stated upper bound inflated beyond anything the basis supports
   (e.g. €10–30K where the basis tops out at €10.8K) passes when the midpoint
   agrees. Comparing range to range would catch it.
6. **Prior-art precision on titles alone is better, not perfect.** At the
   unchanged threshold some weak matches remain (e.g. a symmetric L/R bracket →
   "commonise spindle variants"). The novelty penalty is gentle (≥ ×0.70) for
   that reason.
