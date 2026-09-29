# TRIZ Studio — end-to-end review, 29 September 2026

Scope: the principle recommender and separation strategies (`triz.mjs`),
trimming (`triz-trimming.mjs`), the three generating routes
(`routes/triz.mjs`: resolve, separate, trim), the studio page
(`TrizStudioPage.tsx`) and the shared engine check it uses.

Method: **measure, then read, then change**. The recommender was run over
all 1,482 improving × worsening pairs. The routes were run live against the
model stub, including a client hanging up mid-call. The page was walked in both
themes, and the light theme was also checked from a settled screenshot.

## 1. What was tested

| Check | How |
|---|---|
| Existing tests | 44 TRIZ tests, all passing at the start |
| Recommender coverage | Every (improving, worsening) pair: which basis, how many distinct answers per improving parameter, which principles are ever reachable, same-parameter behaviour |
| Curated pairs | Attempted verification against a published copy of Altshuller's matrix. **Not possible from this environment**: every public source tried was blocked by the network proxy. See §4. |
| Live routes | resolve (normal and physical), separate (analysis-only and full), trim, recommend, every error path, and an abort mid-call |
| Page | Contradiction → result, separation and trimming forms, in both themes, with axe and the console |

## 2. Defects found and fixed

| # | Defect | Evidence | Fix |
|---|---|---|---|
| Z1 | **The worsening parameter could not nominate a principle.** In the affinity model (98.7% of pairs), candidates came only from the *improving* parameter's six principles; the worsening side could only reorder them. Across its 38 possible partners, an improving parameter got as few as **3** distinct answers, and a principle that addresses the worsening side could never appear. | 1,482-pair sweep: 3–9 distinct answers per improving parameter | Both sides nominate, with no weights to tune: principles on both lists first (by combined position), then the remaining slots alternate between the improving list and the worsening list, improving first. The affinity tables are unchanged. **After: 26–34 distinct answers**, all with 4 distinct principles. A weighted-score alternative was tried and rejected, because it trades spread against reach and its weight could only be tuned to a target. |
| Z2 | **One parameter against itself was scored as a pair.** "Strength vs strength" returned technical-contradiction principles. A parameter that must take two opposite values *is* a physical contradiction, which TRIZ resolves by separation. | Sweep | `recommendPrinciples` returns `physical: true` with the property. `/api/triz/resolve` switches to the four separation strategies, and the page explains why. |
| Z3 | **"Curated classical pair" claimed a provenance nobody can check.** No source is cited for any of the 20 cells, and three are identical in both directions (14↔32, 27↔32, 29↔39), which Altshuller's matrix is not. The file's own header already said "not a verbatim reproduction". | Code reading | The basis now reads "curated pair (automotive-tuned; not verified against the published Altshuller matrix)". The cells are **not** changed: correcting them from memory would be the same fault in the other direction. |
| Z4 | **The TRIZ routes kept the model running after the reader left.** They were the last generating routes without the abort pattern (DECISIONS 83). | Code reading; live: an abort mid-call now leaves the model call `aborted: 1, completed: 0` | resolve, separate and trim take `runAbort`; an aborted run stops silently. |
| Z5 | **"Every £ figure is engine-checked or labelled"** appeared in three places (two API notes and the page). The model's own cost text is neither. | Code reading | One accurate note: the engine checks the *direction* of material/process/mass moves on a reference part, and figures in an idea's text are the AI's. The cost angle is labelled "AI-stated", and an empty one reads "not stated". |
| Z6 | **The engine percentage read as this idea's saving.** "Engine confirmed (−12%)" gave no reference-part qualifier, and an unchecked idea's reason was only in a hover title, which a touch screen never shows. | Screenshot | Each verdict reads "ref. part" and shows the reference case. Each unchecked idea shows its reason in the text. |
| Z7 | **The trimming figure is gross, and wasn't labelled so.** "Releases £1.32/part" is the component's whole cost, before whatever it costs to move its functions to the new carrier. | Code reading | "Releases up to … (gross)", with the reason in the note and on hover. |
| Z8 | **Engine-check reasons were cut mid-sentence** at 80 characters ("…not compatible with Die Casting (Aluminium), which is."). This is shared by every studio. | Screenshot | Cut at a sentence's length (240), and a cut is marked with "…". |
| Z9 | **An unsourced figure in the code** ("component-count reductions around 83% and cost reductions around 95%"). | Code reading | Removed: the comment now says published cases report large reductions, and quotes no figure without a source. |

## 3. Live results (stub model, real server)

| Request | Result |
|---|---|
| Lighter vs strength (1 × 14) | 200, principles 1, 8, 40, 15 on the honest curated label; 6 ideas, 3 engine-checked |
| Speed vs ease of manufacture (9 × 32) | Principles 13, 35, 28, **1** — the last is nominated by the worsening side, which was impossible before |
| Strength vs strength (14 × 14) | 200, `physical: true`, four separation strategies, 6 ideas; the page explains the switch |
| Separate / trim | 200; trimming ranks bracket 1.32, spacer 0.05, rail uncosted last; the note says gross |
| Malformed inputs | Each returns a specific 400 |
| Client aborts mid-call | Stub reports 1 request, 0 completed, 1 aborted |

The page is axe-clean in both themes on the start page, the result and both
forms, with no console errors. The light result page was checked from a
settled screenshot, not by axe alone.

## 4. What remains — not fixed, stated

1. **The 20 curated cells are unverified.** They should be checked cell by
   cell against a published matrix (Altshuller 1969, or an equivalent
   reproduction) and either confirmed with the citation or replaced. That could
   not be done here because the sources were not reachable. The label now says
   so.
2. **Principles 21 (Skipping) and 31 (Porous materials) are effectively
   unreachable** from the parameter route. 21 is in no affinity list, and 31 is
   in one, 4th of 6. Only a sourced affinity table can fix this. Both remain
   available through the separation route's principle lists where they appear.
3. **The parameter mapping is the method's weak step.** The file already says
   so and offers the physical-contradiction route to avoid it. The mapping is
   one LLM call with no second opinion; a disagreement check (map twice,
   compare) would show when it is unreliable.
4. **The TRIZ ideas schema has no engine-check `kind`**, so assembly, footprint
   and tolerance moves come back unchecked. Same gap as Innovation Studio.
