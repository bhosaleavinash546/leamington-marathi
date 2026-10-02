# Gear cost model — end-to-end review, 2 October 2026

The gear model was traced from the uploaded CAD to the pound, as the casting,
moulding, sheet-metal, machining and forging models were. Every finding has a
test in `calculator/tests/gear-review.test.ts`.

**Summary.** The gear engine itself (`modules/gear.ts`, `gear-cycle.ts`,
`gear-heat-treat-rate.ts`) had been audited before and held up. These all derive
from geometry and are printed:
- hobbing from generating kinematics;
- grinding from flank stock and specific removal rate;
- bottom-up heat treat (energy, labour, capital, maintenance, consumables,
  fixtures, overhead and QC per kg, at load density and case depth);
- tool life over regrinds.

It also blocks rather than extrapolates a feed.

**The worst fault was not in the gear model.** `/reanalyze`, the call the
screen makes after each answered question, chose the commodity by calling the AI
identifier even in deterministic mode. With no client it failed quietly and fell
to its "machining" default. So as soon as the engineer answered the gear
questions, the screen dropped the gear form and costed the gear as milled teeth
on a 3-axis mill: **£99.82**, against £26.19 headless. Any other part whose
commodity was inferred rather than asked was exposed to the same fault.

The rest was screen and headless disagreeing on:
- **set-up:** the screen had 0.75 h per operation; headless excluded set-up with
  a warning;
- **scrap:** the screen had 2%, headless 3%;
- **labour:** headless pinned every operation to a skilled machinist, overriding
  the module's semi-skilled deburr and inspector metrology.

Two figures were not shared with the rest of the tool:
- **crew:** one operator per gear machine for its whole cycle;
- **blank turning:** at half the machining model's steel turning rate.

## 0. Test part

The real m3 × z38 spur gear, `cad-audit/parts/test-gear-m3-z38.step`, with its
known-truth drawing:
- Ø120 tip, 30 mm face, Ø40 bore
- 20MnCr5, carburised, ISO class 8
- 50,000/yr

## 1. Findings

| # | What was wrong | Effect | Fix |
|---|---|---|---|
| 1 | **`/reanalyze` routed every deterministic part to "machining"** unless a route was forced or answered. It called the AI identifier with no client, and the failure fell to the default. | The gear was costed on screen as a milled block, **£99.82**. Any inferred commodity was exposed. | `/reanalyze` chooses as `/analyze` does: forced or answered route, then gear metrology, then the deterministic inference; if undecided, the route question is asked. A live HTTP test uploads the real gear and answers it. It fails on the old code ("expected 'machining' to be 'gear'"). |
| 2 | **Set-up excluded headless.** No rule passed `setupTimeHrPerOperation`. The screen defaulted to 0.75 h. | — | Rule: 0.75 h per cutting / finishing operation a batch (change hob or wheel and work-holding, tram, first-off). |
| 3 | **Scrap** 3% headless, 2% on screen. | — | Rule: 2% after heat treat and final inspection. |
| 4 | **Labour pinned headless.** `toCostParams` passed the commodity's default labour, which overrides the module's per-process labour. | Deburr and inspection charged at a machinist's rate headless only. | Not passed; the module's labour per process applies on both paths. |
| 5 | **Crew 1 on every gear machine, labour efficiency 0.90.** | Labour on hobbing, grinding and blank turning doubled against the machining routes' convention. | Gear machines on auto-loaders: 0.5 (one operator, two machines); deburr cell and gear checker: 1; the shop's 0.92 efficiency. |
| 6 | **Blank turning at 40 cm³/min** for steel; the machining model turns steel at 80. | Blank turning 4.8 min against 3.2 min. | The rule reads the shared `CUTTING_DATA`. |
| 7 | **Gear machine re-measure test** had vitest's 5 s default around a ~2 s kernel run. | Timed out under a loaded suite. | Given the kernel's 180 s allowance. |

## 2. Before and after (m3 × z38, 50,000/yr)

| Path | Before | After |
|---|---|---|
| Screen | **£99.82** (re-routed to machining: milled teeth) | **£21.74** |
| Headless | £26.19 (no set-up, 3% scrap, machinist on every op, crew 1) | **£21.74** |

## 3. Hand reconciliation, 50,000/yr

Route (advisor): blank turn → hob → chamfer / deburr → wash → carburise, quench
and temper → wash → temper → grind → inspect.

Grinding follows the furnace because carburising costs ISO classes in
distortion, and the hobbed gear would not hold class 8 after it.

Reject 2% (÷ 0.98). Batch 4,170: monthly, so set-up is 0.75 h ÷ 4,170 on each
operation.

| Line | Working | £ |
|---|---|---|
| Blank material | bar Ø124 × 36 mm = 3.41 kg 20MnCr5 × £1.48 − chips × £0.22 = 4.76 ÷ 0.98 | 4.857 |
| Heat treat | wash £0.207/kg + carburise / quench £0.976/kg + wash £0.207/kg + temper £0.252/kg = £1.642/kg × 2.088 kg = 3.427 ÷ 0.98 | 3.497 |
| Process | blank turning 3.2 min on the CNC lathe 2.791; hob 57 s 1.167; deburr 26 s 0.248; grind 47 s 2.186; inspect 21 s 0.422 | 6.814 |
| Labour | turning 0.769, hob 0.227, grind 0.187 (crew 0.5); deburr 0.158 (semi-skilled), inspect 0.176 (inspector) | 1.517 |
| Tooling | hob / wheel wear £0.595 a part × 50,000 + £18,500 NRE (fixture, programming and first article, inspection master), ÷ 50,000 | 0.965 |
| Packaging + logistics | | 0.36 |
| Overhead 12% of £17.649; margin 8% of £20.127 | | 2.118 + 1.610 |
| **Total** | | **21.74** |

## 4. Live in a browser

The real gear STEP, a real server and a browser: **£21.74 on screen = £21.74
headless**, every field identical. Before the review it was £99.82 against £26.19.

## 5. Still open, stated rather than hidden

- **Shop data is representative** (`gear-shop-data.ts`):
  - feeds, speeds, tool life and stock;
  - flat deburr and inspection times;
  - NRE lines.

  The module prints a data warning on every estimate. **None has been compared
  with a gear supplier's figures.**
- **The blank is bar stock at every volume.** At 50,000/yr a gear blank is
  usually a hot-forged ring or disc. The forged-blank quote goes in the material
  field, with the turning cycle set to 0. The tool does not yet choose a forged
  blank itself, which would mean pricing the forging route (forging review)
  inside the gear.
- **Set-up time is one figure for every operation** (0.75 h). A generating
  grinder's set-up is longer than a deburr cell's.
- **Inspection is 100% at 20 s on the gear checker.** Sampling plans vary by
  customer.
- **Helix, ISO class and material class come off the drawing**, by design: the
  solid cannot settle them.
