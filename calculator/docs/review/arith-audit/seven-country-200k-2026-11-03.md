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
