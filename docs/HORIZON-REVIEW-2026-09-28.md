# Horizon — end-to-end review, 28 September 2026

Scope: the deterministic core (`foresight.mjs`: Bass diffusion, Wright learning,
horizon lanes, momentum, currency), query resolution, the prediction ledger,
the research and panel routes, the page and the PDF report. Every number in
Horizon comes from that core; the model only narrates, critiques and
researches. Method: **measure, then read, then change**, with checks computed
independently of the code under test.

## 1. What was tested

| Check | How |
|---|---|
| Existing tests | 158 Horizon tests — all passing at the start |
| Register self-audit | `npm run horizon:audit`: 180 entries, 115 flagged (64 stale evidence, 49 single-region, 20 no evidence) — a curation backlog, unchanged by this review |
| Model invariants | Every register entry: projections never below today or above the ceiling, never falling with time, milestone order, uncertainty bands bracketing the point, field validity, cost direction |
| Hand-derived maths | Bass inverse re-derived; the new cumulative integral checked against numerical integration to 1e-6 |
| Query precision | All 291 BOM parts: do the technologies returned as exact answers belong to the part? |
| Live | Real server + stubbed model: predict, BOM pick, pre-launch cards, ledger save/read, panel critique, deep-dive and research, PDF export — both themes, axe, console |

## 2. Defects found and fixed

| # | Defect | Evidence | Fix |
|---|---|---|---|
| H1 | **Part names matched technology terms by substring.** "turbo*charger*" returned EV charging, "crank*shaft*" half-shafts, "muffler and *sil*encer" software-in-the-loop, "catalytic *converter*" a GaN inverter, "varia*b*le *valve*" the 48 V LV network — all as exact answers. | 184 of 291 BOM parts had another commodity's technology as an exact answer | Whole-word matching with plurals. Then: when the part's commodity is known (from the text, or from the BOM the user picked it in), a technology from another commodity is an exact answer only on a multi-word term or two distinct hits; on one generic word it is labelled context (`demoted`). **184 → 15**, and the 15 are genuine (onboard charger → bidirectional OBC, heater core → heat pump). |
| H2 | **A query that matched nothing returned its guessed commodity as answers.** "lambda sensors" returned the whole Electrical register as exact matches. | Found by the precision probe | The fallback commodity net is labelled context; the BOM hint beats the text classifier. |
| H3 | **Coverage passed on a false match.** "DC link capacitor" was answered only by the 800 V e-compressor, via the letters "ac" inside "cap**ac**itor". | Word-boundary fix exposed it | The classifier now places capacitors and DC links in EDU; the part gets a labelled EDU landscape. The register has no DC-link technology, and none was invented. |
| H4 | **Wright's law fed with the wrong quantity.** It used the ratio of future to current adoption *share*; Wright's law is defined on *cumulative production*. A 55% heat pump showed 8% cost decline in eight years at a 12% learning rate against the ~23% two cumulative doublings give. | Invariant sweep + hand calculation | Cumulative volume from the closed-form Bass integral, floored at one year of today's output so an early-life ratio cannot explode. |
| H5 | **Technologies with no production anywhere were launched "today".** A TRL-6 cathode chemistry at 0% was projected to 14.8% in three years because the model seeds 0.5% share now. | 30 entries failed "+0 years is today" | 24 entries (0%, TRL ≤ 7, no named programme) are **pre-launch**: no adoption, cost or milestone figures; the lane follows maturity; page, PDF and prompt say "not in production — no curve projected". TRL 8–9 entries without a named programme are treated as a curation gap, not as pre-launch. |
| H6 | **A saturated technology was projected to decline.** Diesel after-treatment at its 90% ceiling read 89.9% a year later (the inverse caps at 0.999). | Invariant sweep | At or above the ceiling, the share holds. `+0 years` returns today's share. |
| H7 | **The prediction ledger scored a curve nobody was shown.** Scoring recomputed "what the snapshot predicted" with the default 90% ceiling, not the technology's own; snapshots did not store the ceiling. | Code reading | Snapshots store the ceiling and pre-launch state; scoring uses them; older snapshots fall back to the current ceiling and say so; pre-launch entries are not scored. Scoring is now a pure, tested function. Lane rule version bumped so moved lanes read as a rule change. |
| H8 | **"Check your API key" on a working key.** The panel critique said its calls failed when they succeeded and returned nothing usable. | Stubbed run | Failed, partly failed and "answered with nothing" are three different messages. |
| H9 | **Light-theme contrast.** Teal-200 section heads, the Run-deep-research button, gold badges at an opacity modifier and the pulsing "committed" badge measured 4.36–4.44:1. | axe on the live page | Remapped with margin (5.5–6.3:1); both themes axe-clean. |

## 3. Measured effect

| Measure | Before | After |
|---|---|---|
| BOM parts with a cross-commodity exact answer | 184 / 291 | 15 / 291, all genuine |
| BOM parts answered only by labelled landscape (no technology matches the part) | 10 | 31 — the honest count, listed below |
| Coverage gate (every part gets a landscape with a future) | 291 / 291 | 291 / 291 |
| Entries projected from a "launch today" assumption | 30 | 0 (24 pre-launch, 6 at 0% with a named programme keep a fractional seed) |
| Mean 8-year cost index, falling-cost entries, by adoption share of ceiling | 0.52 / 0.64 / 0.79 / 0.91 | 0.40 / 0.48 / 0.61 / 0.73 (bands 0–5, 5–20, 20–50, 50–100%) |
| Horizon tests | 158 | 174; full suite 1,345 |

**Lane moves from the pre-launch rule: 6**, all TRL-5 entries from H2 to H3
(solid-state, corner modules, chiplet HPC, RISC-V, Li-metal/Li-S, adaptive body
surface). Their H2 placement came entirely from assuming a 2026 launch. Whether
H3 is right depends on a start-of-production year the register does not hold
in structured form — see §5.

## 4. Parts with no matching technology (curation worklist)

Previously hidden by false or generic matches, now shown as landscape only:

- **BIW (8):** dash panel structure, rear quarter panel, bumper beam, door intrusion beam, door structure, hood panel, tailgate structure, fender
- **Interior (6):** centre console, air vents, sun visor, occupant sensing, blower motor, evaporator
- **Powertrain (4):** valve train, throttle body, carbon canister, lambda sensors
- **Chassis (4):** front / rear subframe, control arm, wishbone
- **Exterior (4):** matrix LED module, wiper, washer, sealing systems
- **Electrical (2):** infotainment head unit, speakers
- **EDU, Battery, Driveline (1 each):** DC-link capacitor, pressure relief vent, torque converter

These need register entries with sourced TRL, adoption and named programmes.
None was added here: an entry without evidence would be the fabrication the
register exists to prevent.

## 5. What remains, in order of value

1. **Calibrate the learning rates.** `TREND_LEARNING` maps four trend words to
   22 / 12 / 3 / −5% per doubling. They drive every cost index on the page and
   are not fitted to anything. Back-testing against published cost histories
   (battery packs, SiC wafers, LED lamps) would turn them into measured rates.
2. **A structured start-of-production field** (`expectedSop`, with its
   source) so pre-launch technologies get a real curve from a real launch year
   instead of none.
3. **Calibrate Bass p and q per commodity.** One p = 0.03, q = 0.38 for every
   technology is a textbook default; the ledger now scores on the right curve,
   so a few years of snapshots can fit them.
4. **The 31-part curation worklist** above, and the 115 flagged register
   entries (`npm run horizon:audit`), worst first.
5. **Evals for the language-model layers.** Narrative, panel, deep-dive and
   research still have no eval harness (`npm run eval:status`); they need a
   key to measure.
