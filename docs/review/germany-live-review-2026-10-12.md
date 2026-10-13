# Germany live review — three CAD parts, 12–13 October 2026

**Question asked:** after the Germany rate book (`docs/rates/germany-rate-book-2026-10.md`), does the tool really price
everything from Germany's rates — no hallucination, pure arithmetic from the 3D CAD data? Run three commodities live,
export PDF and Excel, read every line, fix what is wrong.

**Inputs:**
- Germany (DE);
- 100,000 parts a year over 5 years (500,000 amortised);
- reports in EUR;
- the plant pattern is 2 × 8 h (the default; continuous lines run 3 × 8 h).

**Parts** (real STEP files from `cad-audit/parts/`, measured by the OCP kernel, no AI key):

| Part | Commodity | Answers given |
|---|---|---|
| `FORGE_Hub_Flange.stp` | forging | steel, standard tolerance, not safety-critical; grade left at the costed default (38MnVS6) |
| `FORGE_Hub_Flange.stp` (second run) | forging | as above + grade **C45** (the STEP product name says "HUB FLANGE FORGING C45") |
| `MACH_Hydraulic_Manifold.stp` | machining | aluminium (6082-T6 bar) |
| `AL_Crash_Box.stp` | aluminium extrusion | 6082, direct, T6, mill finish, no bends |

**Harness:**
- `e2e/cad-parts-live.ts` drives a real server and browser through upload, questions, Apply, Calculate, PDF and Excel;
- `scripts/review-2026-10-10/rate-isolation.ts` checks that a German costing reads only German rates.

## 1. Does the tool fetch Germany's rates for everything?

Yes, with the held items stated below.
- **Every CAD call** in every run returned `ratesRegion: DE` (the country book the rules priced in).
- **Rate isolation** (the 6 review parts + these 3, DE, final code): 0 issues. No UK, India, China or Poland rate was read.
- **What each part read from the German book:**

| Rate | Value | Source in the book |
|---|---|---|
| Skilled machinist | €52.45/h | IG Metall ERA + 2026 employer contributions |
| Semi-skilled operator | €43.76/h | same model |
| Forge operator | €46.17/h | same model |
| Haas VF-2 (manifold) | €10.53/h | Haas EU list €64,995, 4,044 h, machine only |
| CNC drill (manifold) | €7.16/h | same group |
| CNC VMC 3-axis (hub machining) | €12.22/h | same group |
| 1,600 t forge press | €98.36/h | German operating model; capital HELD (UK × 1.049), Low |
| 100 t trim press | €16.77/h | as above, held |
| 2,500 t extrusion line | €618.11/h | sourced ~€10 M line, 6,066 h (continuous), Low |
| Ageing oven | €40.18/h | held capital, 6,066 h |
| Cut-to-length saw | €21.84/h | held capital, 4,044 h |
| 6082 billet | €3.939/kg | LME $3,240 + German premium $1,102 + alloy adder $150 (estimate) |
| 38MnVS6 / C45 / 6082 bar | €1.38 / €1.03 / €4.10 per kg | **held** — no German price found; the note says so, Low |
| Electricity | €0.172/kWh | BDEW 2026 |

**Held, not German research (stated in the reports):**
- capital on non-CNC machines;
- engineering bar prices;
- overhead (12% × 1.10), packaging (× 1.05) and logistics (× 1.15, delivery to the UK) — UK basis × multipliers.

## 2. Before / after (€ per part)

| Part | Book = UK × factors | Run 1 (German book) | Final |
|---|---|---|---|
| Hub flange (38MnVS6) | 20.10 | 20.06 | **23.77** |
| Hub flange (C45 answered) | — | — | **22.99** |
| Hydraulic manifold | 30.97 | 31.47 | **32.08** |
| Crash box | 12.51 | 13.00 | **13.05** |

**Why the final figures moved from run 1:**
- **Hub flange +€3.71:**
  - Run 1 costed it as a **cold-formed** part: one press, no flash. It is a 2.9 kg flange. A cold former takes a slug of
    at most about Ø50 mm (`COLD_FORMER_MAX_SLUG_MM`, CostVision engineering heuristic), and this part's slug is larger.
    It is now hot closed-die forged: 1,600 t press, 10% flash, in-line trim, descale.
  - The route also follows the **costed** grade now (38MnVS6 → microalloyed), not plain carbon steel.
  - 38MnVS6 is controlled-cooled from the forge heat, so the normalise charged in the intermediate run is gone.
  - With C45 answered, the steel is cheaper (€1.03 against €1.38/kg) but a normalise is charged: €22.99.
- **Manifold +€0.61:** run 1 priced the Haas VF-2 at €9.29/h. The VF-2 had been rated as a member of the VMC group,
  not as the €64,995 machine it is. It is now the group's anchor at €10.53/h.
- **Crash box +€0.05:** extrusion runs and die changes a year now follow the **annual** volume (100,000). Before, they
  were spread over the 500,000 the dies are amortised over.

**Hand-check (final run):** every bucket and operation was recomputed from the Excel inputs and agrees to the cent.
- **Hub flange:**
  - forge 0.003118 h ÷ 0.8 × €98.36 = €0.383;
  - forge crew 0.003118 h × 2 × €46.17 ÷ 0.92 = €0.313;
  - material 4.2931 kg × €1.380 − 1.3931 kg × €0.24 + consumables €2.479 = €8.069;
  - overhead 13% × €18.936 = €2.462; margin 8% × €22.007 = €1.761; total **€23.768**.
- **Crash box:**
  - billet 1.7443 kg × €3.939 = €6.871; scrap credit 0.2164 kg × €2.89 = €0.626;
  - press 0.031349 h ÷ 50 parts ÷ 0.78 × €618.11 = €0.497;
  - ageing 8.93 h ÷ 5,324 parts × €40.18 = €0.067;
  - total **€13.048**.

## 3. What the line-by-line review found, and the fix

**Costing logic:**
1. The forging route was chosen for carbon steel while 38MnVS6 was costed — the alloy (route, die life, heat treat) now
   follows the costed grade (`forging.ts`).
2. A 2.9 kg flange was sent to a cold former — slug limit Ø50 mm (`forging-advisor.ts`).
3. A normalise was charged on microalloyed 38MnVS6, against its own library note — `HEAT_TREAT` microalloyed = none.
4. The forge press note said "446 t (1.2 safety)", as if a 500 t press would do — it now reads "446 t × 1.2 = 535 t →
   the smallest forge press at or above it".
5. Extrusion die changes were spread over 5 years of parts — runs a year follow the annual volume.
6. Headless costing amortised tools over one year — it now uses annual × `programmeYears` (`to-cost-params.ts`,
   `bulk-run.ts`).
7. The VF-2 was rated as a group member — it is now the group anchor (Germany and Poland configs).
8. A continuous line was rated on the plant's 4,044 h — it now gets 6,066 h (`continuousHoursPerYear`).

**Levers and insights (no invented money):**
9. Lights-out applied ×0.6 manning to every operation, including set-up and bench — it now applies to cutting
   operations only. The "30–50% passed through" claim is gone.
10. The DFM routing and OEE levers ignored parts per cycle; the OEE text did not compute the stated saving. Both fixed.
11. Finishing, energy, Boothroyd and material-utilisation texts named other processes' causes ("gating" on a saw cut,
    "melt" on a forging, "nesting" on a machined block). They now name this process's causes.
12. A priced lever did not say what it was re-costed on — the PDF prints "Re-costed on: …".

**Report wording, labels and dates:**
13. Grade question:
    - the radio was pre-selected on the suggested grade, not the costed one;
    - the question's money was printed in £.
14. Consumables were one lump — they are itemised (forging, machining, extrusion).
15. Overhead / packaging / logistics printed no basis — a "Basis" row states UK basis × the German multipliers, held.
16. Book labour rows carried the UK entry's date — they now carry the book's date.
17. A continuous line's note stated 6,066 h and 4,044 h — it now states one figure.
18. The tool-wear rate printed €0.05 for €0.0466 — it now prints 4 decimals.
19. "Only 0% confident" printed after the grade or alloy was answered, or with the steel named in the file — fixed. The
    DFM job also gets the answered grade's family.
20. The §4C cost column read as a full feature cost — it is labelled machine-only; "as-forged" on a forging.
21. Text fixes:
    - the billet note;
    - the scrap label off castings;
    - the multi-part warning;
    - the Excel title;
    - the energy basis missing a separator.
22. Aluminium extrusion had no tab or picker tile (reachable only from CAD) — added; the sign-in page now says 24 cost
    models.

**Tests:**
- 3,805 pass (263 files).
- The real-parts baseline moved only where the costing changed:
  - three microalloyed forgings lost the normalise (hub flange £18.48 → £17.45; yoke £25.16 → £24.39; knuckle
    £25.40 → £24.22);
  - nine extrusion parts with an answered alloy lost the "0% confident" warning.
- The prompt version is 57.

## 4. Open — stated, not fixed

- **Accuracy is unmeasured:** 0 real German quotes in `npm run accuracy`. The figures are what the model says.
- **Research caveat:** the researchers' page fetches were blocked by the proxy. Figures were read from search-result
  extracts of the cited pages. Spot-check the headline rates before quoting them outside.
- **Held German inputs:**
  - engineering bar (C45, 38MnVS6, 6082 bar);
  - capital on 199 machines;
  - overhead / packaging / logistics multipliers;
  - production-space rent (prime logistics rents used);
  - a euro-area finance rate.
- **Model limits seen on these parts:**
  - rejects are not credited as scrap;
  - a forging's turned faces are milled, not turned;
  - the crash box's holes are a CNC fabrication step, not a punch;
  - the Excel holds values, not formulas;
  - 14-year life on all machines;
  - 110 m² default floor space on held machines.
- **Grade naming:** the file names C45, but names only lean. Until the grade is answered, the representative 38MnVS6 is
  costed (€23.77 v €22.99). The question pre-selects the costed grade and says why.
