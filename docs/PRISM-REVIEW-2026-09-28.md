# Prism — end-to-end review, 28 September 2026

Scope: the deterministic core (`part360.mjs`: quote forensics, the entitlement
waterfall W1–W4, counter-offer, input anomalies, the dossier), the route
comparison it borrows from DFM (`dfm-routing.mjs`, `dfm-process-registry.mjs`),
the Prism routes (single part, batch triage, assembly), the page and its
exports. Every figure in Prism comes from that core; the model only drafts
functions, reads a quote PDF and generates ideas that must cite the evidence.
Method: **measure, then read, then change**. Checks were computed separately
from the code under test, and no threshold was tuned to make a check pass.

## 1. What was tested

| Check | How |
|---|---|
| Existing tests | 64 Prism tests, all passing at the start |
| Waterfall invariants | 252 runs (7 measured parts × 3 specs × 3 volumes × 4 quote levels): the steps chain exactly; W2 never adds cost; entitlement ≤ as-specified; no negative asks; the total ask equals the sum of the lines; lines the model prices exactly stay within their band. **All held, before and after.** |
| Quote currency | Non-EUR quotes are converted to EUR before any comparison. The display converts back at the boundary. Correct. |
| Bucket mapping | Every engine bucket maps to a quote kind. Bucket sums differ from the total by ≤ €0.02, which is per-bucket rounding. |
| Process picks | For each measured part, which route W3 put forward and why. |
| Corpus sweep | All 93 parts in the commodity corpus: when the route table recommends a switch, can that route form the part? |
| Live | Real server with real STEP files: DFM analyse → dossier; batch triage as a background job; the page walked through all four steps in both themes, with axe and the console checked. |

## 2. Defects found and fixed

| # | Defect | Evidence | Fix |
|---|---|---|---|
| P1 | **W3 argued process switches no tool can make.** Cold Heading (a wire-fed header) was put forward as the cheaper route for a die-cast housing (€3.06/part), a stamped bracket, a machined ribbed plate and a turned bushing. Extrusion was offered for an open box, and Deep Drawing and Hydroforming for a ribbed plate. | Live runs on the held-out parts. Across the 93-part corpus, **65 of the 78** "switch to a cheaper route" recommendations went to a route from a different shape class. Cold Heading alone was 34 of them. | Only 6 of the 248 rules are blocking, and only two of those ask whether a process can form the shape at all. So "no blocking rule fired" was being read as "feasible". Each route now carries a **shape class** based on how its tool makes the shape: a filled cavity, sheet in press tools, a slug upset along the wire axis, a section pushed through a die, and so on. A switch counts only when one of three things holds: the route shares the class of the route the part is already made by; the route is shape-universal (machining, LPBF); or the class matches the one the geometry itself measures (`inferProcessFamily`). Anything else is excluded and the exclusion is stated. **After: 14 recommended switches, all same-class or universal.** The same gate now drives the W3 step, the DFM report's "switch" sentence, the DFM Studio route table and the DFM batch "best route". |
| P2 | **The W3 evidence floor had been loosened by the DFM coverage change.** After DECISIONS 89 made coverage "evaluated ÷ *applicable*", a route checked on 1 of its 6 rules read 100% and cleared the 40% floor. | Found by reading the code after the DFM review. | The floor now reads **rule depth** (evaluated ÷ all rules) through `ruleDepthPct`. The DFM route "narrow check" caveat and the DFM PDF coverage line were corrected the same way. The PDF line now states evaluated, waiting on an input, could not be checked, and not applicable as four separate counts. |
| P3 | **The CAD-derived mass used a stock density and called it the catalogue's.** 25 of the 69 catalogue materials got no CAD mass at all. Every plastic was massed at 1.05 g/cm³, so POM read 26% light, PEEK 19% light and PP 16% heavy. The page labelled this "measured volume × catalogue density". The batch path had the same fault. | Checked all 69 materials against their catalogue density. | `cadMass` uses the active library's density and returns the basis it actually used. Where no catalogue density exists it falls back to the stock figure, and says so. `/api/should-cost/catalogue` now publishes the densities for the page. The live UI run then caught a second bug: the page dropped them on load, and that is fixed too. |
| P4 | **The DFM batch "best route" was the cheapest priced route, whatever its state.** A blocked route, a secondary operation or an unjudged route could head a portfolio row. | Code reading while tracing P1. | It uses the shared `recommendableRoutes` gate. The current route is a candidate too, and is marked "(your route)" when staying put is best. |
| P5 | **When a DFM family was named without a costed process, no route was ever "same class".** | Live: 26 of 28 routes were unestablished on a die-cast housing when only `hpdc` was named. | `compareRoutes` accepts the chosen DFM family as well as the process name. |
| P6 | **The Prism title was invisible in the light theme.** `.dfm-display` is a white gradient clipped to the text, and it could not follow the theme. It also affected the part name in DFM Studio. | Screenshot, light theme. | A light-theme ink gradient, restored inside dark islands. |
| P7 | **"−£0.00 vs dossier baseline".** A signed zero reads as a saving that isn't there. | Screenshot. | Now reads "same as dossier baseline", in neutral colour. |

## 3. Why the shape classes are not invented thresholds

The classes contain no numbers. They sort routes by what their tooling can
physically form. That is the same argument the two existing body-of-revolution
rules make ("derived from the process kinematics"). The table is **conservative
by construction**: it can only remove a switch from the entitlement, never add
one. A legitimate cross-class lever is therefore lost rather than an
illegitimate one gained. Two such losses are known and stated below.

A measurement was tried first and rejected. A 90% axisymmetry gate on Cold
Heading, matching the spinning and centrifugal rules, looked obvious. Five
headed fasteners were modelled in OpenCascade: hex bolts measured **73.7–85.0%**
axisymmetric, a flange bolt 81.3%, a socket cap screw 94.2% and a carriage bolt
93.6%. That gate would have rejected the canonical cold-headed part. A short hex
bolt (73.7%) and the ribbed plate (73.7%) cannot be told apart on that measure,
so the gate was not added.

## 4. Measured effect

| Measure | Before | After |
|---|---|---|
| Corpus parts where the table recommends a switch | 78 / 93 | 14 / 93 |
| …of which the top pick cannot form the shape | 65 | 0 |
| Held-out parts where W3 took Cold Heading | 4 / 7 | 0 / 7 |
| Catalogue materials with a CAD-derived mass | 44 / 69 | 69 / 69 |
| Worst CAD-mass error vs catalogue density | −26% (POM) | 0 |
| DFM geometry gate | 217 / 217 | 217 / 217 |
| Tests passing | 1,341 | 1,352 (+11 in `tests/prism-review.test.mjs`) |

Live, on the held-out die-cast housing (A380, 80k/yr), W3 now picks a
same-class casting route that saves €0.03/part. On the machined block, ribbed
plate and turned bushing, W3 reports no switch and states why: *"19 routes not
shown able to form this shape — the part would need redesigning first, which is
not a process saving on this drawing"*. Both themes are axe-clean at every step,
with no console errors.

## 5. What remains — not fixed, stated

1. **Cross-class levers are now absent from W3, including real ones.** Two
   examples are a turned shaft that could be cold forged and a machined block
   that could be cast near-net and then machined. Admitting them needs a
   *measured* test of each class (e.g. "would release from a two-part die once
   draft is added"). Until then they belong in W2/ideation as redesigns.
2. **Held-out castings carry no draft**, so the geometry does not measure them
   as tooled. With nothing named, only universal routes qualify. That is honest,
   but a drafted fixture set would exercise the third path (measured class).
3. **Volume sanity bands cover 10 of 53 processes** (`PROCESS_VOLUME_BANDS`).
   The other 43 raise no "implausible volume" warning. Each band needs a source
   before it is added.
4. **Per-bucket rounding**: engine breakdowns can differ from the total by up to
   €0.02. This is cosmetic, but a forensic line priced exactly at the bucket can
   read one cent off.
5. The entitlement remains a **direction indicator**: 15.2% MAPE on 14 held-out
   reference parts, reading 13.2% low. The page already says so.
