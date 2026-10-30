# Four countries, ex-works, live — China, India, Poland, Hungary (30 Oct 2026)

**Asked:**
- Cost all 15 real parts live in China, India, Poland and Hungary, ex-works.
- Find and fix gaps, errors and hallucinations.
- Trace every stage to prove each country's costing uses THAT country's rates, not a UK multiplier, and where a
  multiplier remains, check it against the market.
- Build Hungary's actual rates with no multiplier.

**Delivered:**

| Item | Detail |
|---|---|
| Hungary rate book | `docs/rates/hungary-rate-book-2026-10.md` |
| Ex-works delivery terms | screen, headless, route comparison, PDF and Excel |
| Per-£ provenance trace | 40 real parts × 4 countries |
| Live run | 15 parts × 4 countries, every report opened |
| Hungary market check | the scaled figures against Hungarian prices |

## 1. Does a country's costing use that country's rates?

`scripts/country-trace/provenance.ts` costs every real part headless at 50,000 a year over 5 years, ex-works. It runs
the product's own chain and recomputes nothing. It then classes every £ of each costing by where its rate comes from
(`provenance-2026-10-30.json`).

The basket shares are dominated by one composite roof panel (~45% of the £), so the median part is the fairer figure.

| Country | Median part on the country's OWN rates | Basket: own | Machine capital without country capex | Material without a country price | Derived service factor (tooling, consumables) | Held overhead / packaging multiplier | Margin |
|---|---|---|---|---|---|---|---|
| China | 47.9 % | 24.0 % | 9.8 % (UK × 0.55) | 41.2 % (UK × factor) | 9.3 % | 8.3 % | 7.4 % |
| India | 50.3 % | 23.4 % | 10.6 % (UK × 0.52) | 42.2 % (UK × factor) | 8.2 % | 8.3 % | 7.4 % |
| Poland | 52.9 % | 29.4 % | 11.0 % (UK × 0.72) | 32.6 % (UK × factor) | 10.6 % | 9.0 % | 7.4 % |
| Hungary | 48.6 % | 28.6 % | 12.0 % (**at par, ×1**) | 32.0 % (**at par, ×1**) | 11.0 % | 8.9 % | 7.4 % |

**The honest answer is no — not yet for everything.**

What IS the country's own, in every country:
- labour, all categories and process grades (Hungary's engineer is the one held rate);
- the energy tariff;
- every machine's running costs — hours, energy, floor, finance, support staff at local wages;
- the sourced machine capex groups;
- every material a book prices.

The rest has no country evidence yet:

| What | China / India / Poland | Hungary | Rows | Biggest items |
|---|---|---|---|---|
| Machine capital | UK × an unsourced factor | the book's own capex, ×1 | `heldCap` | autoclave, RTM press, twin-pallet HMC, rotomoulding carousel |
| Materials | UK × the material / resin factor | ×1 | `matFactor` | CFRP prepreg (roof panel, battery lid, hat stiffener), 6082 bar, 38MnVS6 / 20MnCr5 / EN8 bar, PA66-GF30, EPDM compound |

Two further classes are not the country's own data either:
- **Tooling, consumables and bought-in services** are UK £ constants × a factor DERIVED from the country's own wage and
  machine ratios (`regional-services.ts`). The arithmetic is the country's; the structure is the UK's.
- **Overhead % and packaging** are UK basis × a held, unsourced multiplier. No country's overhead share has been found.

Hungary was 0 % own before this round: everything was UK × factor.

## 2. The multipliers that remain, against the market

| Check | Tool | Market | Verdict |
|---|---|---|---|
| Hungary CNC 3-axis job-shop hour (machine + operator + overhead + margin) | Ft10,915 | Ft6,875 (small-shop list) | Tool +59 % — market evidence weak; to verify |
| Hungary CNC 5-axis hour | Ft12,916 | Ft8,000 | +61 % — same |
| Hungary quench & temper | Ft190/kg (volume) | Ft750/kg (2018 small-batch list) | not comparable in batch size |
| Press brakes (old Hungary book: UK × 0.70) | old held build-up implied ~4× TRUMPF's price | TruBend 3100 new €136k | **Fixed** in the Hungary book (−67 %); the same held build-up sits under UK × 0.55 / 0.72 in CN / PL — **proposal** for those books |
| Al extrusion lines (old Hungary book) | UK × 0.70 | Hydro Székesfehérvár €35.7M; Germany's book €37.5M | **Fixed** (~3×) |
| Foundry charges (old Hungary book) | Ft59 (GS-C25) | Hungarian scrap Ft110/kg | **Fixed** (charge Ft117) |
| UK book: GS-C25 £0.14/kg | below UK heavy scrap | letsrecycle / E3 | **Proposal** — UK rates move only in the UK refresh |
| UK book: 4140 < 42CrMo4, 4130 > 4140 | inconsistent | Frankstahl surcharges | **Proposal** (noted in CLAUDE.md before) |

Rates in China, India and Poland were not changed in this round. Your standing rule is that rates move only through a
dated rate refresh, so these are proposals.

## 3. Ex-works

`UniversalStackInput.deliveryTerms` is 'DAP' (default) or 'EXW'. Ex-works means packaging is in and freight is out:
logistics is 0, and the field is locked on the screen.

It is set once, on the costing form or on the CAD screen's first step. It travels through:
- headless costing (`costMeasuredPart`);
- the route comparison, so the reference row stays equal to the headline;
- both reports, which print "Delivery terms: Ex-works (EXW) — packaging included, freight to your plant NOT included".

The cost card's Not-included list names freight. `tests/delivery-terms.test.ts`: on a real part, ex-works costs exactly
the freight and its margin less, and every other bucket is unchanged.

## 4. Live run — 15 parts × 4 countries, ex-works

A real server (OCP kernel, no AI key) and a real browser ran every part through Part & context → Confirm → Cost.
Settings: 100,000 a year over 5 years, ex-works, the country chosen in the header. Both reports were exported and
opened for every costing (`e2e/cad-to-cost-trace.ts` with `CV_TRACE_COUNTRY` / `CV_TRACE_TERMS=EXW`; summary in
`country-live/live-summary-2026-10-30.md`).

| Country | Checks passed | Product failures | Harness failures |
|---|---|---|---|
| China | 1,013 | 0 | 6 |
| India | 1,013 | 0 | 6 |
| Poland | 1,019 | 0 | 0 |
| Hungary | 1,019 | 0 | 0 |
| **All four** | **4,064** | **0** | 12 |

**The 12 harness failures.** The crossover check ("each alternative states its crossover") had compared a money string
with 0, so it never ran. Once the parser returned the bare amount, it counted the comparison's nested build-up rows as
alternatives, on the 6 parts where no alternative route is feasible. Fixed (it counts "Cost this route" rows) before
Poland and Hungary ran, and those passed it on all 30 parts.

On every one of the 60 costings:
- **Screen = headless** to the penny (the comparison's reference row is the headline). Compared in £, so forint and
  yuan rounding is not a difference.
- **The workbook re-adds to the headline**: every operation re-priced, the material line, tooling, overhead and margin.
- **The PDF and Excel** carry the headline, the stamp naming the country's rate book (`v2.2.0-CN / -IN / -PL / -HU`),
  and "Delivery terms: Ex-works (EXW)". The logistics bucket is 0.
- **The cost card's Not-included list** names freight to your plant.
- **axe WCAG 2.1 AA** passes at every step.

**INFO, not failures:**
- On 9 parts a country, the DFM panel was still waiting for its job when the step was read.
- The "Updating…" round did not occur where every question was pre-leaned.

**Reports scanned for leaks** (`leak-scan.py`, all 120 PDF + Excel files):
- 0 stray £ figures, 0 NaN / undefined.
- Every remaining UK-based figure is a stated disclosure: "capital HELD … the UK book's × 0.55" (CN), "Held, not
  researched for China" on the overhead / packaging basis. Hungary prints "at par (no country factor)" and "capital AT
  PAR" instead.

Headlines in each country's currency (100,000 a year, 5 years, ex-works):

| Part | CN | IN | PL | HU |
|---|---|---|---|---|
| hub-flange-forging | 52.78 | 853.16 | 53.32 | 5,348.85 |
| stub-axle-cast-machine | 132.39 | 1,685.38 | 132.88 | 11,973.74 |
| ecu-cover-moulding | 4.13 | 58.01 | 3.38 | 299.62 |
| seat-bracket-sheet | 4.53 | 86.85 | 4.98 | 432.63 |
| battery-rail-al-extrusion | 191.92 | 3,366.39 | 156.66 | 13,974.92 |
| blow-moulding-air-duct | 5.11 | 72.93 | 3.56 | 323.65 |
| roto-header-tank | 38.21 | 488.67 | 39.98 | 3,800.17 |
| thermoforming-trim-cover | 9.63 | 138.86 | 7.82 | 716.91 |
| composites-hat-stiffener | 239.35 | 3,333.25 | 226.36 | 21,165.26 |
| extrusion-vent-pipe | 4.10 | 61.60 | 3.16 | 289.37 |
| rubber-grommet | 0.82 | 10.20 | 0.84 | 78.59 |
| gear-m3-z38 | 50.58 | 992.62 | 66.15 | 6,197.16 |
| machining-manifold | 94.81 | 1,255.19 | 79.10 | 6,902.56 |
| casting-bracket | 54.26 | 696.86 | 54.83 | 4,973.26 |
| knuckle-forging | 65.24 | 1,068.74 | 64.66 | 6,651.59 |

## 5. What remains

1. **Machine capex.** 196 of 215 Hungarian machines (and most in CN / IN / PL) have no sourced capex. Hungary holds
   them at par; the others hold them at an unsourced factor. The next research round should cover the machines that
   carry the cost: autoclave, RTM press, HMC, rotomoulding, thermoformer, IMM by size, HPDC, presses, forging presses.
2. **Materials.** No country prices CFRP prepreg, alloy / stainless bar, filled compounds or rubber compounds yet.
3. **Overhead and packaging multipliers.** These are held in every country.
4. **Hungary's engineer rate** is held.
5. **Network.** This session could not open MNB, KSH, Eurostat or Hungarian supplier pages. Every Hungarian figure was
   read from search extracts and should be re-opened on its page.
6. **Accuracy against prices paid** is still unmeasured: 0 actuals.

## 6. Scorecard — before and after (this audit, 30 Oct 2026)

| Dimension | Before | After | State |
|---|---|---|---|
| Arithmetic, recomputed independently on every real part | not checked | 4,637 checks, 0 fail (13 shadow models) | green |
| Hallucination findings (figures with no source, no rule, not shown) | 236 found (52 high) | ~170 fixed; the rest labelled, or rate proposals | green / amber |
| Screen = headless, live | UK, 14 routes | UK 14 + CN / IN / PL / HU 15 parts each = 74 costings, 0 differences | green |
| Reports (stamp, headline, re-add, terms) | UK, 14 / 14 | + 60 / 60 country costings | green |
| Accessibility (axe WCAG 2.1 AA) | 56 / 56 | every step of 60 more costings, 0 violations | green |
| Ex-works pricing | not available (freight always in) | built: screen, headless, comparison, both reports; tested | green |
| Hungary on its own rates (median part) | 0 % — everything UK × factor | 48.6 %; no unsourced factor — unpriced items at par and labelled | amber |
| China / India / Poland on their own rates (median part) | not measured | 47.9 / 50.3 / 52.9 % — the rest UK × held factors, disclosed in the reports | amber |
| Accuracy against prices actually paid | 0 actuals | 0 actuals | **not measured** |

Of 9 dimensions: 6 green, 2 amber (country rate coverage), 1 not measured. The arithmetic is proven. Whether the rates
are the market's is proven only where a source exists. That is about half of a typical part's cost in each of the four
countries.
