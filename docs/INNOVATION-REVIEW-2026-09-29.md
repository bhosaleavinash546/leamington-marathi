# Innovation Studio — end-to-end review, 29 September 2026

Scope: the eleven methods' deterministic cores (`innovation.mjs`), the routes
that feed them to the model and engine-check the output (`routes/innovation.mjs`),
the studio page (`InnovationStudioPage.tsx`, `innovation.css`), its PDF/Excel
exports (`src/services/innovation-report*`) and the help and nav copy.

Method: **measure, then read, then change**. Each core was run on cases whose
answer was worked out by hand before looking at the code's output. The FAST
matrix got a 2,000-case property check. The endpoint ran live for every method
against the model stub, and the page was walked in both themes. No thresholds
were changed.

## 1. What was tested

| Check | How |
|---|---|
| Existing tests | 41 Innovation tests, all passing at the start |
| DFA, design-to-cost, teardown, morphology, value index | Hand-worked cases: base parts, a gap larger than the buckets can give, units, zero baselines, falling metrics, repeating samples |
| FAST function-cost matrix | 2,000 random valid matrices: function costs sum to total component cost within €0.02 (rounding). **Held.** |
| Spec & tolerance deltas | Engine re-cost at each relaxation step, live |
| Live endpoint | All ten methods via `/api/innovate/resolve` with structured inputs; every error path |
| Page | Picker → FAST → teardown → DFA, in both themes, with axe, the console, and settled screenshots |

## 2. Defects found and fixed

| # | Defect | Evidence | Fix |
|---|---|---|---|
| I1 | **DFA recommended deleting everything.** With no part flagged necessary, the minimum became 1 but *every* part was listed as deletable ("bracket, screw, screw → delete all 3"). The base part could also be offered for deletion. | Hand case | Boothroyd–Dewhurst: the first part (the base) is necessary by definition, since nothing is there to assemble it to. The first line is the base, marked as such, and the page asks for it first. Candidates + minimum now always equal the part count. |
| I2 | **Design-to-cost asked buckets for more than they can give.** Gap €8, material €6 at 20%, labour €4 at 50% gave targets of €3 and €5: labour asked for more than its whole cost. A non-numeric reducibility produced a `null` target. | Hand case | Targets are proportional to each bucket's *reducible* amount (cost × reducibility) and never exceed it. Anything left over is reported as `shortfall` ("£4.80 of the gap cannot be closed by trimming these buckets — needs an architecture or spec change"). The default 50% is marked as assumed. The prompt tells the model not to stretch a bucket past its limit. |
| I3 | **Teardown compared "2.4 kg" with "2.0 kg" as text.** Any value with a unit, or a thousands separator ("1,200"), became "differs" with no size. That is exactly what the verbatim notes extraction produces. | Hand case | A leading number is read along with its unit. Matching units (or one side bare) are compared numerically; different units stay categorical and say so ("units differ (mm vs cm)"). |
| I4 | **Teardown flagged gaps only when the subject was higher.** Stiffness 33% below the benchmark, or 4 fasteners against 0 (a zero base, so no percentage), were never significant. | Hand case | Significance is the size of the gap in either direction, and a zero base counts by its absolute gap. Whether a gap is *adverse* comes from polarity: a lexicon of more-is-worse attributes (mass, cost, parts, fasteners, time…), or `better` stated per attribute. Anything else is `adverse: null`, shown amber and not assumed. The prompt no longer prints "(+null%)". |
| I5 | **Morphology listed the same concept twice.** The diagonal walk repeated whenever option counts shared a factor: 3×3×3 gave six concepts but only three distinct ones, and 2×2 gave two of four. | Hand case | A greedy max-min spread: each pick is the combination furthest from every earlier pick, ties broken toward the least-used options. Deterministic, never a repeat, and in a 3×3×3 space the first three picks share no option. |
| I6 | **DFA flags ignored negation.** "clip \| same material as housing" set *different material*, and "doesn't move" set *moves*, so a deletable part became necessary. | Code reading | `parseDfaLine` (pure, tested): each flag is read on its own, a negated flag says nothing, and positional `y/n` answers are accepted. |
| I7 | **The engine's reference-part percentage was presented as the idea's saving.** A large "−88%" sat on each idea, and "−97.5% best confirmed" in the KPIs, with nothing saying it is a *direction* check on a reference part (1 kg when the idea gives no mass). The PDF/Excel exported it as "engine-modelled saving". | Screenshot, export code | The card shows the reference case and "Not this part's exact saving". The KPI reads "best confirmed · reference part". Exports say "engine direction check on a reference part … not this part's exact saving", and the column is "Reference-part saving %". |
| I8 | **"Every £ figure is engine-checked or labelled" was not true.** The model's cost text carries its own figures, which are neither. | Code reading | The API note, page footer and exports say what is checked (the direction of material/process/mass moves) and that figures in an idea's text are the AI's. "Cost angle" is labelled AI-stated, and an empty one reads "not stated". |
| I9 | **Unchecked ideas gave no reason**, and a blanket line claimed "no modelled cost driver connects them to a price". The real reasons are a material not in the catalogue, an incompatible process, or no request. | Screenshot | Each unchecked idea shows its `engineCheckReason`, in the page and the exports. The blanket line now points to them. |
| I10 | **A pre-step that failed vanished silently.** The AI's FAST decomposition failing validation twice, bad design-to-cost numbers, or unreadable teardown notes all fell into empty `catch {}` blocks: no analysis panel, no reason. | Live (stub) | `analysisNotes` travels with the response and the page shows it: "No deterministic analysis: the AI's function-cost decomposition failed validation twice (…) — ideas were generated without a matrix." |
| I11 | **A malformed user FAST matrix returned 500** ("Idea generation failed"), although the comment said 400. | Live | 400 with the validation reason. |
| I12 | **Spec-relaxation deltas ignored the active rate library.** | Code reading | Both the method and the `/spec-deltas` endpoint price on `getActiveLibrary()`, like every other engine call. |
| I13 | **The light theme was unreadable.** `innovation.css` had no light rules: panels and the sticky bar were fixed dark navy under dark text, and the title was a white gradient clipped to the text. Axe passed it because it cannot see contrast through a translucent layer or a gradient. | Settled screenshot + computed styles | Surfaces use the flipping tokens (`--navy-900/950`, `--hairline`, `--tint`). Fixed text colours and the title get light values (slate-600 7.6:1, amber-800 7.0:1 on white), restored inside dark islands. |
| I14 | **"Eight structured methods."** The nav and Help said eight and omitted FAST, Spec & Tolerance Challenge and Teardown Delta. There are eleven. | Code reading | Corrected in the nav registry and both Help entries. |

## 3. Live results (stub model, real server)

All ten generating methods return 200 with their analysis. Live results for the cases from §2:

| Method | Live result |
|---|---|
| DFA | [bracket, bolt, nut] → minimum 1 (the base), candidates bolt and nut |
| Design-to-cost | Gap €8 → material 1.2 of at most 1.2, labour 2 of at most 2, shortfall 4.8 |
| Teardown | 0.21 kg vs 0.15 kg → +40%, adverse. 4 fasteners vs 0 → +4, adverse. |
| Morphology | 6 of 6 concepts distinct |
| Spec challenge | CTQ row locked. Engine deltas tight→standard €0.04, fine→standard €0.02, CCs halved €0.16, CCs zeroed €0.33. |

The no-key, empty-parts, zero-cost, unknown-material and bad-matrix requests
each return a specific 400.

The page is axe-clean in both themes with no console errors. The light theme
was verified by settled screenshot and computed styles, not by axe alone.

## 4. What remains — not fixed, stated

1. **The value-index bands (< 0.7 poor value, > 1.4 under-served) are this
   tool's own screening values.** Value engineering texts agree on
   worth ÷ cost but not on cut-offs. Say so wherever a verdict is shown, or
   let the user set them.
2. **The DFA "design efficiency" is minimum ÷ actual parts**, a part-count
   proxy. Boothroyd's index is (minimum × 3 s) ÷ total assembly time. The DFA
   engine in DFM Studio (`dfa-engine.mjs`) computes the timed version; the
   studio could call it when times are known.
3. **The page cannot enter design-to-cost buckets.** The ceilings and
   shortfall exist in the API and the result panel, but the form only takes
   current and target cost. Prefilling buckets from a should-cost breakdown
   would make I2 visible to most users.
4. **The engine check in this studio only understands substitutions.** The
   ideas schema offers no `kind`, so assembly, footprint and tolerance moves
   (which Analyze can price) come back unchecked. Adding `kind` to the schema
   is a small change with a measurable coverage gain.
5. **The teardown polarity lexicon is short on purpose.** An attribute it does
   not know is reported with unknown merit rather than guessed. Stating
   `better` per attribute is the precise route.
6. **Design-to-cost figures are in whatever currency the user typed** (the form
   says £). They are not converted, because nothing about them is engine-derived.
