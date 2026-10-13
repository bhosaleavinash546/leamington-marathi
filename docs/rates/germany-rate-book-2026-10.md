# Germany rate book — October 2026

Until now every Germany rate was the UK book × a few factors from one table (`REGIONAL_DATA.DE`): labour from an
unresearched regional table, machines × 1.05, materials × 1.03. This book rebuilds Germany from sourced research, the same
way as the India, China and Poland books.

**Basis:**
- **Clusters:** an average of the four automotive supplier clusters — Baden-Württemberg (Stuttgart / Heilbronn /
  Neckar-Alb), Bavaria (Munich / Ingolstadt / Regensburg / Nuremberg), Lower Saxony (Wolfsburg / Braunschweig / Salzgitter /
  Hanover) and North Rhine-Westphalia (Cologne / Ruhr / Siegen / Sauerland).
- **Shifts:** two 8-hour shifts, Monday–Friday (the common German supplier pattern; a third shift and weekends carry
  collective-agreement premiums). Continuous lines run three shifts — see §3.
- **Prices:** October 2026, EUR, ex-VAT (19%).
- **FX:** the book's own rates — £1 = €1.165, $1 = €0.880.

```
python3 scripts/rate-refresh/germany-2026-10/build-config.py                    # research → 2026-10-germany.json
npx tsx scripts/country-book.ts scripts/rate-refresh/2026-10-germany.json       # dry run: the register
npx tsx scripts/country-book.ts scripts/rate-refresh/2026-10-germany.json --write
npx tsx scripts/region-expand.ts                                               # Austria is generated from Germany
```

**What the generator writes:**
- `src/engine/country-books/de.ts` (generated, `GERMANY_BOOK`);
- `REGIONAL_DATA.DE` (labour, energy, machine multiplier);
- `lab-de-*` and `energy-de`;
- `BILLET_PREMIUM_USD_PER_T.DE`;
- `germany-2026-10/register.csv`, every rate with current → new, decision and basis (667 rows).

The research files (`germany-2026-10/research/*.json`) carry a URL and a date on every figure. The rules are in
`germany-2026-10/RULES.md`. The pre-book Germany book is frozen in `current-germany-book.json` (`snapshot.ts`).

**Caveat:** as in the China and Poland rounds, the researchers' page fetches were blocked by the network proxy. Every
figure was read from search-result extracts of the cited page. Spot-check the headline figures before quoting them
outside. **Accuracy against real German quotes is unmeasured** (0 actuals).

## 1. What changed

| Area | Book (UK × factor) | Germany book | Basis |
|---|---|---|---|
| Skilled machinist | €47.50/h | **€52.45/h** | IG Metall ERA pay + late-shift premium + special payments + T-ZUG B + 2026 employer contributions ÷ 1,466.78 productive h |
| Semi-skilled operator | €37.52/h | **€43.76/h** | as above, lower ERA grade |
| Foundry | €32.84/h | **€49.07/h** | a Gießereimechaniker is a skilled ERA grade — the table had it below semi-skilled |
| Forge operative | €33.58/h | **€46.17/h** | as above |
| Engineer | €76.23/h | **€71.90/h** | salaried, loaded the same way |
| Electricity | €0.232/kWh | **€0.172/kWh** | BDEW Strompreisanalyse 2026, small–medium industry, ex-VAT |
| Gas | €0.08/kWh | **€0.0629/kWh** | Destatis non-household, H1 2026, ex-VAT |
| 3-axis VMC (machine only) | €13.70/h | **€12.22/h** | Haas VF-2SSYT-EU list €64,995 over 4,044 h |
| Haas VF-2 | €11.16/h | **€10.53/h** | the same list price — the group's anchor |
| 5-axis VMC | €24.15/h | **€18.18/h** | Haas UMC-500 (US list converted; no EU price — Low) |
| Al extrusion line 1,800 t | €294.55/h | **€424.50/h** | complete 7-inch line ~€10 M (Vimetco / Presezzi; Hydro Rackwitz €11 M second-hand press — a floor that agrees), 6,066 h — Low |
| 500 t forge press | €63.13/h | **€54.25/h** | capital HELD (UK × 1.049), German operating model |
| CR sheet DC01 | €0.91/kg | **€0.865/kg** | NW Europe CRC ex-works (Fastmarkets via Tacto, Sep 2026) |
| Grey iron GJL-250 (charge) | €0.20/kg | **€0.349/kg** | the charge was below the scrap it is melted from |
| Ductile iron GJS-500-7 (charge) | €0.34/kg | **€0.39/kg** | pig + scrap + treatment |
| 6063 extrusion billet premium | — | **$1,102/t** | DDP North Germany $1,070–1,135 (Fastmarkets, Aug 2026) |

149 material prices updated and 287 held (no German evidence this round — each held note says so, country first, Low).
The extrusion billets show as "held" in the register because `buildRegionalLibrary` rebuilds them from LME + the German
premium + the alloy adder, not from the material table.

**Engineering bar is held:** C45, 38MnVS6 and 6082 bar have no German base price in the research. They stay at UK × the
factor and are labelled "Germany: no Germany price for this grade … Low".

## 2. Labour

Pay is the IG Metall ERA tables valid in 2026 (average of the four regional agreements). Each grade adds:
- the late-shift premium (two shifts, so half the hours are late);
- special payments (holiday pay, Christmas pay, T-ZUG B);
- employer social contributions: pension / unemployment / insolvency 10.75% to €101,400; health + supplement / care
  10.55% to €69,750; accident 1.08%; U2 0.44%.

The total is divided by 1,466.78 productive hours. Austria is regenerated from Germany by the Eurostat labour-cost ratio.

## 3. Machines — two shifts for the plant, three for continuous lines

Every machine is rebuilt on the German operating model:
- 4,044 h a year (2 × 8 h × 252.75 working days, the four states' holidays averaged);
- 14-year life (AfA);
- finance 3.73% (euro-area MFI > €1 M, > 10 years, Bundesbank release July 2026 — the German-only series was not reached);
- rent €8.54/m²/month (prime logistics rents — no production-space figure was found);
- maintenance 3.5% of capex;
- support staff at German wages.

Capex was sourced for three groups (15 machines): the Haas EU VMC group, the 5-axis (Low) and the extrusion line (Low).
Every other machine keeps its UK capital × 1.049 (the Haas EU / UK price ratio), labelled "capital HELD … Low".

**Continuous lines** (new: `continuousHoursPerYear` in `country-books.ts`). A machine the UK book itself runs ≥ 6,000 h
(`CONTINUOUS_UK_HOURS`) — extrusion presses, furnaces, ageing ovens, compounding lines — is not a two-shift machine. On the
plant's 4,044 h its rate rose ~50% for no physical reason. Such machines get 6,066 h (3 × 8 h). The note states it.

Marketplace listings (a TruBend 3100 on a used-machine site, a SPINNER VMC) were NOT used as prices.

## 4. Tests

`tests/germany-rate-book.test.ts` pins the labour, the energy, the 4,044 h and 6,066 h models, the held labels, the
sourced extrusion line, CR at €0.865, charges ≥ scrap, metal floors and the billet premium. It also pins the report text:
a continuous line's note gives one hour figure; a book labour rate carries the book's date; and the overhead / packaging /
logistics defaults state their UK basis × the German multipliers.

## 5. Open — next research round

- C45 / 38MnVS6 / engineering bar and 6082 bar: no German price found (held).
- 199 machines on held capital (UK × 1.049).
- Overhead (12% × 1.10 = 13.2%), packaging (× 1.05) and logistics (× 1.15, delivery to the UK): UK basis × multipliers, held (the reports now say so).
- Production-space rent: prime logistics rents were used.
- The finance rate is euro-area, not Germany-only.
