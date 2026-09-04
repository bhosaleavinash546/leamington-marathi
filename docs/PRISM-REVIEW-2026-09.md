# Prism — feature review, September 2026

Method: every number below was produced by running something. The scorecard
re-scores BOTH saved corpora with TODAY's deterministic checkers, so the
before/after is apples-to-apples rather than a comparison against stamps written
weeks ago under different rules. Code findings are line-anchored. Nothing here
is asserted from memory.

Corpora: `benchmark/prism-runs` (4 real parts, 63 ideas, pre-depth-pass) and
`benchmark/prism-runs-after-repaired` (same 4 parts, 62 ideas, current
pipeline). Both committed 2026-09-02, both scored against the same marketplace
index.

**Basis legend.** MEASURED = ran it. CODE = read and verified at the line.
OPINION = judgement.

## 1. Scorecard — before vs after (MEASURED)

### Idea quality

| Axis | Before | After | Δ |
|---|---|---|---|
| Depth median (rubric /100) | 68 | **94** | +26 |
| Depth spread (max−min) | 44 | **30** | −14, tighter |
| All five engineering sections present | 0% | **85.5%** | +85.5 |
| Names a specific material/process grade | 52.4% | **69.4%** | +17.0 |
| Carries an engine verdict | 25.4% | **43.5%** | +18.1 |
| Un-checked ideas stating WHY | 0% | **100%** | +100 |
| Engine-contradicted (of those checked) | 56.3% | **22.2%** | −34.1 |
| Reviewed by a critique panel | 0% | **51.6%** | +51.6 |
| Ranking discriminates (qualityScore spread) | 0 | **35** | ranking was flat |
| Depth distribution: ideas at 80–99 / ≥96 | 26 / 0 | 22 / **34** | the rubric now saturates — see P-12 |

### Arithmetic (both corpora re-scored with today's fixed parser)

| Axis | Before | After |
|---|---|---|
| Stated saving matches its own basis | 58.7% | **74.2%** |
| Contradicts its own basis | 15.9% | **3.2%** |
| Priced part is a floor (unpriced term named) | 9.5% | 6.5% |
| Basis unreadable — nothing checked it | 15.9% | 16.1% |

### The engine the waterfall rests on

| Gate | Before | After |
|---|---|---|
| Held-out hit-rate (14 parts) | 78.6% | **92.9%** |
| Held-out MAPE | 20.9% | **15.2%** |
| Divergence held-out ÷ calibrated | 2.51× | **1.37×** |
| Feature machining MAPE | 34.5% | 34.3% |
| Feature stamping MAPE | 38.9% | **39.5% — worse** |

### The axis that moved the WRONG way

| Axis | Before | After |
|---|---|---|
| Ideas restating a known marketplace lever | 65.1% | **75.8%** |
| Median match strength of those (BM25) | 16.5 | **21** |
| Mean title length | 8.3 words | 8.1 words |
| Near-duplicate pairs within the batch | 17 | 21 |

Titles did not get longer, so this is not a density artefact of the scorer, and
both runs faced the same index. Ideas became better specified AND closer to
levers the corpus already holds. Mean depth of an idea that restates a known
lever is 79.6; of one with no prior art, 72.8 (r = +0.168 on n = 125 — weak, and
stated as weak).

**Overall: 12 of 13 quality axes improved, several transformationally. Novelty
is the one that regressed, and nothing in the pipeline optimises against it.**

## 2. Where a number reaches the user, and what checks it (MEASURED)

Every field on a shipped idea that carries a figure, classified by what verifies
it. This is the hallucination surface, counted rather than estimated.

| Verified by the deterministic engine | Coverage |
|---|---|
| `engineCheck.*` — baseline/proposed/savingPct on a reference part | 27/62 = 44% |
| `depth.score`, `qualityScore`, `rank.*`, `priorArt.score` | 100% |

| Verified by the arithmetic re-check | Coverage |
|---|---|
| `costSavingPotential.annualValue` against its own basis | 83.9% read; 74.2% consistent |

| **Model-asserted — NOTHING checks it** | Present on |
|---|---|
| `engineering.costBridge` — a per-part cost walk in prose | 53/62 |
| `engineering.mechanism` — physics claims with numbers | 54/62 |
| `engineering.specDeltas` — grades, gauges, tolerances | 54/62 |
| `engineering.validationPlan` — test counts, sample sizes, durations | 54/62 |
| `engineering.dfmImplications` | 54/62 |
| `costSavingPotential.paybackMonths` — a bare integer | 62/62 |
| `costSavingPotential.percentage` | 62/62 |
| `benchmarkReference` — named companies, years, model programmes | 62/62 |
| `technicalDescription`, `manufacturingImpact`, `riskNotes` | 62/62 |
| `regulatoryContext`, `timeToImplement` | 62/62 |

**Thirteen of roughly twenty number-carrying fields on every idea are asserted
by the model and verified by nothing.** The engine check covers one claim (the
direction of a substitution) and the arithmetic check covers one field.

## 3. Findings

| ID | Sev | Finding | Where | Basis |
|---|---|---|---|---|
| P-1 | S1 | The named-benchmark gate is an ALLOW-LIST of ~55 company names. 26 benchmark references naming real companies escaped it and are presented without the `unverified:` tag — Vitesco, BorgWarner, Voestalpine, Sadef, Georg Fischer, Gienanth, Altair, Schuler, Nemak, Trumpf, Fraunhofer ILT, Nidec. An allow-list of company names can never be complete. | `idea-validation.mjs:226` | MEASURED |
| P-2 | S1 | Novelty regressed while depth rose: 65.1% → 75.8% of ideas restate a known lever, median match strength 16.5 → 21, titles the same length. Prior art is stamped AFTER generation and never fed back INTO it, and the ranker's novelty penalty is the only thing that reads it. | `server.mjs:3320` | MEASURED |
| P-3 | S1 | An idea states its saving arithmetic TWICE — `calculationBasis` and `engineering.costBridge` — and nothing reconciles them. Where both parse (34/62) they agree on 18%, with divergences from ×0.02 to ×38. Some of that spread is the parser (tuned on the basis, not on prose bridges), but ×38 is not parser noise. | `idea-arith.mjs` reads only `costSavingPotential` | MEASURED |
| P-4 | S2 | 16.1% of ideas have an unreadable basis, so their headline annual value is checked by nothing — and `unparsed` is neutral in the ranker, so an uncheckable claim ranks exactly like a verified one. | `idea-quality.mjs:255` | MEASURED |
| P-5 | S2 | `paybackMonths` is generated by the model on 100% of ideas, exported to the pipeline view, and never recomputed — even though `BusinessCaseCalculator` already computes payback deterministically from investment and saving. | `PipelinePage.tsx:807` | CODE |
| P-6 | S2 | Three user-facing accuracy claims are hardcoded strings that have drifted from the recorded benchmarks. The waterfall caution still tells every user "the engine's held-out accuracy (~21% MAPE, reading low)" when the measured figure is 15.2%. The repo already has the right pattern — `tests/accuracy-claim.test.mjs` pins the homepage figure — and it was not applied here. | `part360.mjs:25,440` · `server.mjs:970` | MEASURED |
| P-7 | S2 | Generation blocks for 2–6 minutes behind one `await`, showing a text log; no idea appears until all six lenses, the critique panel and the repairs finish. The result then crosses to the Results page through `sessionStorage`, so a refresh mid-flight loses the run and a large batch can hit the quota. | `PrismPage.tsx:517-566` | CODE |
| P-8 | S2 | Citation-enforced generation is the feature's most distinctive claim — 97% of ideas cite evidence, 5.7 refs each — but a citation renders as a badge of bare ids (`E7 E12 W3 +2`) with a tooltip. The reader cannot see the line it points at, because the dossier crosses to Results as one text blob rather than an addressable structure. | `IdeaProvenanceBadges.tsx:153` | CODE |
| P-9 | S2 | The entitlement waterfall carries ONE band for the whole part (`MODEL_DISPERSION`), and its W3 process step is priced by feature engines measuring 34–40% MAPE. The step that inherits the widest error is presented with the same confidence as the others. | `part360.mjs:132` | CODE |
| P-10 | S3 | Engine-check coverage cannot be re-measured on saved history: the check request was deleted before the response was stored. Fixed going forward (`engineCheckInput`), but the existing corpus stays blind, so the three new check kinds cannot be scored until a fresh live run. | `engine-idea-check.mjs` | CODE |
| P-12 | S2 | The depth rubric has SATURATED. 55% of ideas now score ≥96/100 and 34 of 62 sit at the ceiling; before the pass, nothing scored ≥96. It drove exactly the behaviour it measures and has stopped being able to separate a good idea from an excellent one — Goodhart, on a metric the ranker consumes. | `idea-depth.mjs` | MEASURED |
| P-13 | S2 | The four critique personas all run on ONE model (`ctx.smallModel`). Correlated-error work on judge panels finds nine same-family judges buy roughly two independent votes, so a four-persona single-model panel reduces variance but shares bias, at 4× the cost. The one genuinely independent verifier in the system — the cost engine — is not on the panel. | `idea-deep.mjs:240` | CODE |
| P-14 | S2 | The depth rubric is IN the generator's prompt: the five engineering sections are specified with word counts in the emit schema, and the rubric scores exactly those sections. That is the setup the rubric-reward-hacking literature warns about, and the predicted outcome is what P-12 measured — the metric saturated as soon as the generator could see it. | `server.mjs:2297` · `idea-depth.mjs` | MEASURED |
| P-11 | S3 | No run-to-run compare and no steer-and-regenerate loop. Rejecting an idea feeds the taste profile for NEXT time; there is no way to say "more like this, fewer like that" and re-run against the same dossier without paying for the whole pipeline again. | `PrismPage.tsx` · `ResultsPage.tsx` | CODE |

## 4. Tier 0 — closed 4 Sept 2026

| ID | What changed | Verified by |
|---|---|---|
| P-1 | The benchmark gate is INVERTED. An unbacked claim is unverified, full stop — no allow-list, no gap to walk through. The one remaining list is of GENERIC words and it fails CLOSED: a word missing from it makes a soft claim read as attributable, which is more caution, not less. A new `benchmarkClaim` stamp separates `attributable-unverified` from `generic-unverified`, as a stamp rather than a penalty — ~98% of references are unbacked attributable claims, so a validator flag would have been a constant deduction that discriminates nothing. | `tests/benchmark-claim-gate.test.mjs` — 11 tests including the 12 real companies the allow-list missed and a company that does not exist yet |
| P-3 | The two arithmetics are compared, ASYMMETRICALLY. Measured first: across 69 ideas where both fields parse, the cost bridge reads a median 0.30× the basis, clustered 0.02–0.17× — one parser reading a field it was not built for, not 64% of ideas contradicting themselves. So agreement is evidence (9.7% of ideas earn a `corroborated` stamp) and disagreement is reported as "not corroborated" with the parser bias named, never as a contradiction. Flagging the divergence would have repeated the exact false-positive failure this module was just fixed for. | `tests/idea-arith.test.mjs` — 4 new tests |
| P-2 | Prior art now earns a REPAIR. The prompt already said "do not restate these" and the index already proved when that was ignored, but the two never met: the prompt shows six precedents from a part-level query while the check searches the whole corpus by idea title, so the entry an idea actually restated was usually never shown to it. A detected restatement now goes to the deep pass with the specific matched entry, and a repair that still matches the same entry is rejected — judged by the same threshold that condemned the original, hoisted to `PRIOR_ART_MIN_SCORE` so the two cannot drift apart. | `tests/idea-deep.test.mjs` — 3 new tests |
| P-6 | Every user-facing accuracy sentence is COMPOSED from the recorded benchmark JSON by `engine-accuracy.mjs`. The waterfall now says 15.2% because that is what `cost-results-holdout.json` records; improving the engine updates the caution, and there is no second place to remember. With no results file it says the accuracy is unmeasured rather than quoting a number nobody can produce. | `tests/accuracy-strings.test.mjs` — 9 tests, including one that fails on ANY percentage the results files do not contain. Verified by reintroducing "~21% MAPE" and watching it fail. |

**Not yet fixed, and named so:** P-4 (16.1% unparsed), P-5 (paybackMonths), P-7 (blocking generation), P-8 (unclickable citations), P-9 (one band for four steps), P-10 (blind corpus), P-11 (no steer loop), P-12/P-14 (rubric saturation), P-13 (single-model panel).

## 5. What is genuinely strong (MEASURED, stated so the gaps stay in proportion)

- **The dossier's honesty contract holds.** 16 evidence sections, and every one
  that cannot be built states its own absence with the reason. No section
  silently disappears.
- **Every un-checked idea says why** — 0% → 100%. This is the rule most tools
  in this category do not have at all.
- **Arithmetic false positives are down 87.5%**, and the two survivors on the
  corpus are genuine overstatements of 5–10× and 15–25× that a reader would
  otherwise have believed.
- **The engine improved where it matters**: held-out, not calibrated, with
  divergence falling from 2.51× to 1.37×.
