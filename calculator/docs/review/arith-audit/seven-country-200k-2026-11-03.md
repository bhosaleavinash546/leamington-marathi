# Shadow models in seven countries at 200,000 a year (3 Nov 2026)

Four of the arithmetic-audit shadow models (`scripts/arith-audit/{forging,hollow-forming,injection-moulding,machining}.ts`)
were written for the UK at 50,000 a year over 5 years, delivered (DAP), and had those conditions hard-coded. They now
take the costing conditions from the dump and price everything in that region's own book. They still do all of their
own arithmetic: no product costing function is called.

Dumps: `CV_DUMP_REGION=<CC> CV_DUMP_ANNUAL=200000 CV_DUMP_TERMS=EXW npx tsx scripts/arith-audit/dump.ts <dir>` for UK, CN, IN, PL,
HU, DE and SK, plus a UK 50,000/yr DAP control (`CV_DUMP_REGION=UK CV_DUMP_ANNUAL=50000`).

## What changed in the models

**New shared reader: `scripts/arith-audit/dump-context.ts`.** It reads `region`, `annual`, `terms` and `programmeYears`
(5 when the dump does not state it) from every part dump in the directory, and fails if the dumps disagree. It then
builds the region's book the way `server/services/bulk-run.ts::regionalBook` does: `recomputeMachineRates` of the base
book, then `buildRegionalLibrary` for any region except the UK. From that book it exposes:
- £/h, £/kg and the tariff (`energy[0]`).
- The book's own `regional.toolroomFactor`, and the UK toolroom £/h times that factor, rounded to the penny.
- `factor(basis)`: the country factor for a UK-basis £ constant. Material bases are computed as book £/kg ÷ UK £/kg. The
  other bases call `regional-services.ts::countryFactor`, which is a lookup over `REGIONAL_DATA` and the country books'
  sourced services, not a costing function.
- The shop defaults, restated from `REGIONAL_DATA`: overhead is 12 % × the country's overhead multiplier, and margin is 8 %.

**All four models** now:
- Take ANNUAL, YEARS and the amortisation volume (annual × years) from the dump.
- Use the region's book for every £/h, £/kg and the tariff.
- Check that the stack's overhead % and margin % are the country's defaults.
- Check that logistics is £0 when the dump is ex-works (EXW).
- Print the costing conditions on their first line.

No check was removed and no tolerance was widened.

| Model | What else changed |
|---|---|
| machining | Fixtures are UK £ × the book's toolroom factor, rounded once per fixture set (`machining-time.ts::fixtureCostGBP`). Programming uses the book's engineer rate. The cast + machine half (PRCR002) was hard-coded to the HMC volume cell. It now ranks split-3axis, consolidated-5axis and volume-cell on machine + operator £ using near-net conventions (one fixturing per direction, one 5-axis clamping, bores counted as machining-centre time) and checks each printed routing £. It then builds the chosen routing's operations, fixtures (hydraulic for the cell, dedicated otherwise, plus the lathe fixture), programming hours (setups + lathe) and setup hours. |
| forging | MPI is the book's inspector £/h plus the £4/h bench × the inspection factor. Descale is £0.12/kg × the process-service factor. The die build-up uses the toolroom £/h × factor, and its heat-treat line (£2,500 + £2.20/kg) × the heat-treat factor. Die steel is traded, so it stays in UK £. |
| injection-moulding | The mould's toolroom hours use the toolroom £/h × factor. The high-volume wear coating is × the heat-treat factor. Tool steel, the mould base and bought-out parts are traded, so they stay in UK £. Cavitation, press, steel class, life, batch and mould count now follow the dump's volume. |
| hollow-forming | Roto and thermoforming tools are × the toolroom factor. The roto grinding adder is × the process factor. The thermoforming tool material follows the volume: epoxy below 2,000/yr, CNC aluminium at 200,000/yr or more (£6,000 + £2.2/cm², life 1,000,000), cast aluminium otherwise. The roto carousel's hours a year are now the costed machine's `annualAvailableHours` in this book (3,500 in the UK). Blow, roto and thermoforming tool sets now follow the dump's amortisation volume. |

## Results (PASS / FAIL)

| Model | UK 50k DAP | UK 200k | CN | IN | PL | HU | DE | SK |
|---|---|---|---|---|---|---|---|---|
| forging | 120 / 0 | 123 / 0 | 123 / 0 | 123 / 0 | 123 / 0 | 123 / 0 | 123 / 0 | 123 / 0 |
| hollow-forming | 202 / 0 | 208 / 0 | 203 / **5** | 203 / **5** | 202 / **6** | 202 / **6** | 201 / **7** | 202 / **6** |
| injection-moulding | 139 / 0 | 142 / 0 | 142 / 0 | 142 / 0 | 142 / 0 | 142 / 0 | 142 / 0 | 142 / 0 |
| machining | 188 / 0 | 191 / 0 | 191 / 0 | 191 / 0 | 191 / 0 | 191 / 0 | 191 / 0 | 191 / 0 |

The 200k columns are all ex-works (EXW). The UK 50,000/yr DAP control still has 0 FAIL in every model, as on 30 Oct.
Logs are in the session scratchpad as `shadow2-<CC>-<group>.log`.

Before this change, the 200k runs had these FAIL counts (UK, CN, IN, PL, HU, DE, SK). Every one of those failures was
the models' fault:

| Model | UK | CN | IN | PL | HU | DE | SK |
|---|---|---|---|---|---|---|---|
| forging | 6 | 44 | 44 | 44 | 44 | 44 | 44 |
| hollow-forming | 22 | 72 | 74 | 73 | 72 | 64 | 72 |
| injection-moulding | 63 | 53 | 66 | 66 | 66 | 64 | 70 |
| machining | 24 | 80 | 80 | 70 | 69 | 45 | 57 |

## The one remaining disagreement: rotomoulding, moulds in service in every country except the UK

Both checks below use the forced-air carousel, `rotomould-carousel-4arm`.

| Part | Country | Check | Model v product |
|---|---|---|---|
| ROTO_Coolant_Tank | CN | moulds in service | 60 v 106 |
| ROTO_Coolant_Tank | CN | tooling investment | £926,495 v £952,622 |
| ROTO_Coolant_Tank | CN | tooling £/part | £0.9265 v £0.9526 |
| ROTO_Coolant_Tank | CN | total | £15.6621 v £15.6937 |
| ROTO_Coolant_Tank | IN | moulds in service | 52 v 106 |
| ROTO_Coolant_Tank | IN | tooling £/part | £0.9026 v £0.9280 |
| ROTO_Coolant_Tank | IN | total | £15.4851 v £15.5159 |
| ROTO_Coolant_Tank | PL | moulds in service | 62 v 106 |
| ROTO_Coolant_Tank | PL | tooling £/part | £1.6080 v £1.6534 |
| ROTO_Coolant_Tank | PL | total | £23.7746 v £23.8295 |
| ROTO_Coolant_Tank | HU | moulds in service | 62 v 106 |
| ROTO_Coolant_Tank | HU | tooling £/part | £1.6151 v £1.6606 |
| ROTO_Coolant_Tank | HU | total | £23.8349 v £23.8900 |
| ROTO_Coolant_Tank | DE | moulds in service | 92 v 106 |
| ROTO_Coolant_Tank | DE | tooling £/part | £3.4829 v £3.5811 |
| ROTO_Coolant_Tank | DE | total | £43.9325 v £44.0513 |
| ROTO_Coolant_Tank | SK | moulds in service | 62 v 106 |
| ROTO_Coolant_Tank | SK | tooling £/part | £1.6799 v £1.7273 |
| ROTO_Coolant_Tank | SK | total | £25.5248 v £25.5821 |
| ROTO_Header_Tank | CN / IN / PL / HU / DE / SK | moulds in service | 52 / 44 / 52 / 52 / 80 / 52 v 92 everywhere |

On the header tank the £ still agree. The moulds wear out inside the programme (sets > 1), so the mould-cycles bought are
the same whichever count is used.

**Verdict: the product is wrong. The UK's hours leak into every other country.** The hours a carousel is available
each year are set in the book: 3,500 h in the UK, 6,336 h in CN, 7,200 h in IN, 6,024 h in PL, 6,072 h in HU, 4,044 h
in DE and 6,000 h in SK. The country's machine £/h spreads the carousel's cost over those hours. But the number of moulds
needed (`rotoMoulds`) divides the moulded volume by **the UK library's 3,500 h**, whatever the country. In China, for
example, the costing pays for a machine that runs 6,336 h a year but buys moulds as if it ran 3,500 h. That is 106 moulds
instead of 60, about 1.8×. Every country except the UK prints 106 / 92, the UK figures.

**Where it is:** `src/engine/cost-input-rules/commodities/rotational-moulding.ts:150`
(`ROTO_HOURS = DEFAULT_RATE_LIBRARY.machines.find(m => m.id === 'rotomould-biaxial')…annualAvailableHours`), used at
`:176`: `need = moulded * revSec / (ROTO_HOURS * 3600 * ROTO_OEE)`.

**Proposed fix (not applied; product code was out of scope):** read the costed machine's hours from the active book,
`activeRates().machines.find(m => m.id === machineId)?.buildup.annualAvailableHours`. If the machine is missing, fall back
to `ROTO_HOURS`. The same hours should be printed in the basis line at `:183`. The UK does not move. The coolant tank
moves by 2.6 p (CN) to 11.9 p (DE) a part, and its tooling investment by £26k (CN) to £98k (DE).

## Model errors found and corrected (no product fault)

- **Machining, PRCR002 in CN and IN.** The routing is split-3axis, not the HMC cell, and the product is right to choose
  it. In those books the VMC is £2.40/h (CN) and £2.15/h (IN), while `mach-hmc-400` is £6.27/h and £7.15/h. On the cost
  ranking, the split routing wins by £1.16 a part in CN. The model had hard-coded the HMC cell. In the other five
  countries the cell still wins.
- **Thermoforming at 200,000/yr.** The tool is CNC aluminium (`mouldMaterialFor`, `thermoforming.ts:89-92`). The model
  had hard-coded cast aluminium.
- **Everything else that failed before this change** was the hard-coded conditions:
  - batch 2,500 instead of 5,000;
  - amortisation 250,000 instead of 1,000,000;
  - cavitation, press, steel class and life at 50k;
  - UK toolroom, fixture and engineer £;
  - the UK inspector rate and an unscaled descale;
  - the `energy-uk` tariff.

## Notes (not disagreements)

- **The forging and moulding service adders call the derived factor directly.** Examples:
  `forging-advisor.ts:426` `heatTreatServiceFactor()` and `:443` `processServiceFactor()`, nine call sites in all. They do
  not go through `countryFactor`, so a sourced service price in a country book would be skipped. No country book has
  `services` today, so nothing moves now. It becomes a leak once a book sources a heat-treat or process price.
- **The machining fixture threshold uses a fixed 5 years.** It is "dedicated above 10,000 parts over 5 years"
  (`machining-time.ts:447`, `annualVolume * 5`), not the programme years. The rule labels it, and it does not change any
  part in these runs.
- **The cast + machine routing in CN and IN depends on how the HMC is priced.** It follows from the HMC's book rate
  against the locally priced VMCs. If the HMC is re-priced on local capex, PRCR002 may go back to the cell.

## Fifth model: features-reports (3 Nov 2026)

`scripts/arith-audit/features-reports.ts` (the cross-commodity checks: buckets, auditRow, country table, band,
sensitivity, carbon, Design-to-Cost, quote teardown, causal model, route comparison, PDF / Excel) had the same hard-coded
UK / 50,000 / 5 years / DAP. It now reads them through `dump-context.ts`, as the four models above do.

**What changed**
- The model's own stack, sensitivity re-costs, Design-to-Cost, causal £ per 1 % and the band run in the dump region's
  book (`C.book`), not the UK book.
- The country comparison is **sourced in the dump's region**. The rows are that region plus UK, IN and PL; `vs-base %` is
  against the source row. The model moves tools, packaging and logistics by the row country's factor **÷ the source's**,
  and moves the overhead default from the source's default (12 % × its multiplier) to the row's default.
- The chain re-costs (`costMeasuredPart`), `compareRoutes`, `printPDF`, the summary teardown's annual volume and carbon all
  take the dump's region, annual volume, programme years and terms. The product's chain still gets the UK base book, which
  it regionalises itself. The PDF and the comparison get `C.ukBook` as their base book.
- New checks on every part: overhead % = the country default, margin % = 8 %, and logistics = £0 on EXW.
- **Band ± %.** P10 and P90 come back rounded to the penny, and ± % is worked from the unrounded values. On a £1 part,
  the penny alone moves ± % by 0.48 points (UK seat bracket at 200k: 12.1 v 12.3). The model now runs the same seeded band
  on the stack with every £ × 1,000. The stack is linear in £, and the draws do not depend on the money, so this gives
  P10 and P90 to 1/1,000 p. The ± % check and its 0.11 tolerance are unchanged. New checks:
  - the × 1,000 stack ÷ 1,000 = the headline (to 1e-9);
  - the × 1,000 band ÷ 1,000 rounds to the printed P10 and P90.

  Verified by hand: the exact ± is 12.302 (UK seat), 21.456 (IN ECU cover, printed 21.5) and 19.915 (HU ECU cover,
  printed 19.9). Each one rounds to the product's figure.
- **auditRow overhead and margin are compared on auditRow's own basis.** auditRow works these from the reported 4-dp
  buckets (route-compare.ts: "the base from the buckets themselves"). The model used its unrounded stack. That put two
  margins on opposite sides of a 4th-dp boundary:
  - PL seat bracket: 0.068353 unrounded v 0.068344 on the reported buckets, so 0.0684 v 0.0683;
  - DE battery rail: 2.515748 v 2.515752, so 2.5157 v 2.5158.

  The tolerance is unchanged (0.0001).
- **One new OPEN item (P-TD1).** It is printed and counted apart, not as a FAIL. With an identical detailed quote, every
  line gap must be 0, not only the margin gap.

No check was removed and no tolerance was widened.

**Results (PASS / FAIL / OPEN)**

| | UK 50k DAP | UK 200k | CN | IN | PL | HU | DE | SK |
|---|---|---|---|---|---|---|---|---|
| before (unmodified model) | 760 / 0 / 0 | 755 / 1 / 0 | 608 / 148 | 611 / 147 | 612 / 144 | 614 / 142 | 621 / 135 | 614 / 142 |
| after | 793 / 0 / 3 | 795 / 0 / 3 | 821 / 0 / 3 | 797 / 0 / 3 | 794 / **1** / 3 | 821 / 0 / 3 | 821 / 0 / 3 | 821 / 0 / 3 |

The 3 OPEN items in every column are P-TD1 (below). They are product items, and they were already in the UK 50k data
before this change; the model just did not check them. Every "before" FAIL was the model's fault:
- UK rates in a foreign stack (every operation's process and labour £);
- a UK-sourced comparison;
- the routes and chain re-costed at 50k, DAP;
- the penny-rounded band.

Logs are in the scratchpad as `fr-<CC>.log`, `fr-UK50.log` and `fr-orig-<CC>.log`.

**Remaining disagreements**

1. **PL · PRCR002 · "detailed teardown our total = headline": £28.09 v £28.12 (tolerance £0.03). Verdict: the product
   is wrong, a small rounding fault.**
   - `src/engine/quote-teardown-detailed.ts:272`, `ourTotal = r2(lines.reduce((s, l) => s + l.our, 0) + shop)`, adds
     30 lines (material, 13 operations × 2, tooling, overhead, margin). Each line has already been rounded to the penny
     (`r2` at :176–259).
   - The unrounded sum is £28.1182, which is the headline. The rounded lines add to £28.09, 2.8 p (0.10 %) low.
   - The other countries pass only because their rounding happens to stay inside 3 p. CN seat bracket is 0.50 v 0.52,
     which is 3.8 % of a 52 p part.
   - Today nothing in `src/ui` reads `ourTotal`, so the screen does not show it. The fix is
     `r2(Σ unrounded lines + shop)`.
2. **P-TD1 (OPEN, every country, also the UK 50k control) · detailed teardown, identical quote, material gap ≠ 0.
   Verdict: the product is wrong.**
   - The supplier side's material comes from `matCost` (`quote-teardown-detailed.ts:135-138`, used at :163):
     gross × £/kg − scrap credit + consumables. That has no energy line, and it credits scrap even when the costing
     credits none (`lossIsNotScrap`).
   - Our side (`base = om.materialCost`, :164) is the costing's whole material bucket.
   - So a quote that is identical driver for driver shows a material "gap" equal to minus the energy line:

     | Part | Gap by country | Costing's energy line |
     |---|---|---|
     | PRCR002 | UK −£1.72, CN −0.69, IN −0.67, PL −1.33, HU −1.20, DE −1.42, SK −1.41 | e.g. UK £1.69; the extra ~3 p is the melt loss credited |
     | FORGE_Hub_Flange | −£0.10 to −0.27 | |
     | AL_Battery_Rail | −£0.09 to −0.20 | |

   - On the negotiation screen (`main.ts::applyDetailedTeardown`, `negotiation-model.ts::detailedToSupplierBuckets`),
     PL PRCR002 at 200k shows an identical detailed quote of £26.76 against a should-cost of £28.12. That is a price
     variance of −£1.36 a part, −£272,000 a year. The screen headline reads "within 4.8 % — competitive; hold". In the
     UK it is −£1.72 a part, −£344,000 a year.
   - Each unchanged material driver is listed with a −£1.33 delta.
   - Fix: add the energy line to `matCost` (or carry it as its own supplier line), and skip the credit when the costing
     sets `lossIsNotScrap`.

## Fixed in the product (3 Nov 2026)

- **Roto moulds in service** — `rotoMoulds` divides by the costed carousel's hours in the costing's own book
  (`rotoHoursIn`); hollow-forming 208 / 0 in every country (was 5–7 FAIL outside the UK).
- **Detailed quote teardown, material (P-TD1)** — the supplier's material is built on the same basis as ours: the
  material lines that do not depend on weight (process energy at the country tariff) carry over unchanged, and no scrap
  credit is taken where the costing says the loss is not scrap (`lossIsNotScrap`, passed by the screen's
  `buildPartDetail`). An identical quote now shows a £0 material gap and £0 driver deltas (stub axle UK was −£1.72 a
  part, −£344,000 a year at 200k).
- **Detailed quote teardown, our total** — the headline, rounded once (the sum of 30 penny-rounded lines missed it by
  2.8p on PL PRCR002).

features-reports on PL after the fixes: 798 PASS · 0 FAIL · 0 OPEN. Tests: `tests/quote-teardown-detailed.test.ts`,
`tests/rotational-moulding-review.test.ts`.
