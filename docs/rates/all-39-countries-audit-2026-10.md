# All 39 countries — country rates audit, October 2026

**Question.** When the user selects any of the 39 manufacturing countries, are all the rates in the costing that country's, with no silent fallback to the UK or another country? This covers every commodity, on the form path and the CAD path.

This extends `all-commodity-country-audit-2026-10.md`, which proved it for India and the UK, to every country.

## 1. Method

| Step | What | Scale | Result |
|---|---|---|---|
| A | **Every per-country table** checked for all 39 countries, and every code path that falls back to the UK when a country is missing searched out. | All tables | 4 problems, fixed (§2); a 5th (page-load race) found live |
| B | **Every real part in every country.** The 40 real parts in `cad-audit/` were costed in all 39 countries through the product's own chain (`costMeasuredPart`). Every charged machine, labour, material and energy rate was checked against that country's book. Each total vs the UK was checked against the country's own factor envelope, so a wrong formula lands outside it. | 1,560 costings, 14,313 rate lines | **0 mismatches, 0 outside the envelope** |
| C | **Every commodity form, live in a browser**, on its defaults, in all 39 countries. The tool's own Excel trace for each costing was checked against all 39 country books. | 741 form costings | **0 problems** (§5) |
| D | **Live CAD.** 14 real parts (one per commodity) through a real server and browser, from upload to Calculate, in 10 representative countries plus India and the UK. | 168 live runs | **0 rate lines from another country** (§5) |
| E | **Formula review** of every country's derived factors (§4). | 39 countries | 1 formula error found (heat treatment), fixed |

Step B is now a permanent test (`tests/country-rates.test.ts` §13) and runs on every build in about 20 seconds.

## 2. What was wrong, and is fixed

| # | Found | Affected | Fix |
|---|---|---|---|
| 1 | **Heat treatment counted the country twice.** China, India and Germany have their own heat-treat shop economics (local furnace overhead, e.g. India $30k a furnace a year). The model then multiplied that local figure by the country's overhead factor again, cutting India's overhead by a further 28%. | CN, IN, DE (every commodity with heat treatment) | A country's own shop figure is used as is. The default (UK) shop is moved to the country once, and its subcontract freight likewise. |
| 2 | **The sourcing advice ignored the country.** The "regional sourcing opportunity" insight quoted a fixed 8-country index against the UK. For a part costed in Egypt it still said "China ~62% lower". | All 39 (advice text only, not a price) | Compared against the country the part is costed in, from the country table (½ labour + ½ machine-hour). |
| 3 | **Software should-cost stayed on the UK.** It has 9 engineering hubs, and selecting a country did not move it. | Software commodity | Follows the country to its nearest hub, with the reason stated on screen (e.g. Vietnam → India hub). |
| 4 | **The AI agent quoted UK £/hr.** Its costing tool already priced in the country's book, but its instructions listed UK machine and labour rates, so its explanation could quote them. | AI agent, all countries | The instructions carry the selected country's rates. |

### Checked and found complete for all 39

- the country table (labour, energy, multipliers);
- surface-finishing factors;
- aluminium billet premiums;
- landed-cost duty and shipping;
- inland freight and carbon price;
- grid carbon and logistics carbon;
- currency and FX (all 39 agree both ways);
- the PCB market for each country (own market, or nearest with the reason shown);
- the screen's country, currency and filter pickers.

### Partial tables that are not a leak

- **Country-specific polymer and sheet prices** exist for 8 countries (US, DE, PL, CN, IN, MX, TH, VN) and replace the family factor there. Every other country uses the UK library price × that country's polymer-family factor, so it still follows the country.
- **Heat-treat shop economics** exist for 3 countries. The rest use the default shop moved to the country (fix #1).

## 3. How a country reaches the cost (all 39 the same)

1. The user selects a country (header or Country bar). One function, `_applyCountry`, handles both.
2. **Rate book.** `buildRegionalLibrary(base, country)` rebuilds the whole book: labour by role, every machine-hour rate (capital and overhead × the country's machine multiplier, energy at its tariff), every material (× its family factor), and the energy tariff. It becomes the active book (`setActiveRates`).
3. **Shop fields.** Overhead %, packaging and logistics come from `regionalShopDefaults(country)`.
4. **£ constants.** Every £ constant (tools, NRE, services, cores) is the UK basis × `countryFactor(basis, country)` (`regional-services.ts`). The forms' £ defaults follow the same table, and a typed figure is a quote.
5. **Other paths.**
   - CAD: the request carries the country, the server prices its rules in that book, and the response states it (`ratesRegion`).
   - Headless and bulk: `costMeasuredPart` runs in that book.
   - PCB: priced in the country's own or nearest market.
   - Software: the nearest hub.
   - The rest: scenarios, the comparison table, the AI agent and the exports each carry the country.

## 4. Every country's factors (the review table)

Labour and energy are the country's own (sourced: `regional-rates.ts`, `scripts/rate-refresh/2026-10-countries.json`). The derived factors that move UK-basis £ constants are:

| Factor | Formula |
|---|---|
| Toolroom | ½ skilled-pay ratio + ½ machine multiplier |
| Process service | ½ semi-skilled ratio + ½ machine multiplier |
| Inspection | ½ inspector ratio + ½ machine multiplier |
| Heat treat | The heat-treat model's country ratio |

The last column is the measured outcome: the 40 real parts costed in the country ÷ the same parts in the UK.

| Country | Currency | Skilled £/h | Semi-skilled £/h | Engineer £/h | Electricity £/kWh | Machine-rate mult. | Steel mult. | Overhead % | Toolroom | Process svc | Inspection | Heat treat | 40 real parts vs UK (median, range) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| United Kingdom (UK) | GBP | 26.19 | 19.94 | 42.80 | 0.268 | 1.00 | 1.00 | 12% | 1.00 | 1.00 | 1.00 | 1.00 | basis |
| Germany (DE) | EUR | 40.77 | 32.21 | 65.43 | 0.199 | 1.05 | 1.03 | 13% | 1.30 | 1.33 | 1.16 | 1.01 | ×1.14 (1.03–1.27) |
| France (FR) | EUR | 30.07 | 23.05 | 48.11 | 0.159 | 0.92 | 1.02 | 13% | 1.03 | 1.04 | 0.97 | 1.03 | ×0.99 (0.94–1.04) |
| Italy (IT) | EUR | 24.08 | 18.06 | 42.14 | 0.259 | 0.97 | 1.02 | 12% | 0.94 | 0.94 | 0.92 | 1.10 | ×0.98 (0.95–1.01) |
| Spain (ES) | EUR | 19.08 | 14.56 | 34.13 | 0.189 | 0.88 | 1.00 | 11% | 0.80 | 0.81 | 0.80 | 0.95 | ×0.87 (0.80–0.98) |
| Poland (PL) | PLN | 11.90 | 8.92 | 19.83 | 0.137 | 0.72 | 0.97 | 10% | 0.59 | 0.58 | 0.57 | 0.80 | ×0.73 (0.59–0.94) |
| Czech Republic (CZ) | CZK | 13.08 | 10.06 | 22.13 | 0.129 | 0.74 | 0.97 | 10% | 0.62 | 0.62 | 0.62 | 0.78 | ×0.75 (0.62–0.94) |
| Romania (RO) | RON | 7.45 | 5.76 | 12.92 | 0.109 | 0.65 | 0.96 | 10% | 0.47 | 0.47 | 0.48 | 0.71 | ×0.66 (0.49–0.93) |
| Hungary (HU) | HUF | 9.30 | 7.34 | 16.63 | 0.115 | 0.70 | 0.97 | 10% | 0.53 | 0.53 | 0.54 | 0.74 | ×0.69 (0.54–0.94) |
| Sweden (SE) | SEK | 39.31 | 31.45 | 60.93 | 0.088 | 0.87 | 1.04 | 13% | 1.19 | 1.22 | 1.11 | 0.97 | ×1.03 (0.95–1.16) |
| Netherlands (NL) | EUR | 34.13 | 27.10 | 52.19 | 0.219 | 1.00 | 1.02 | 13% | 1.15 | 1.18 | 1.08 | 1.13 | ×1.07 (1.03–1.14) |
| Turkey (TR) | TRY | 6.62 | 5.09 | 12.22 | 0.086 | 0.60 | 0.90 | 9% | 0.43 | 0.43 | 0.43 | 0.58 | ×0.60 (0.44–0.83) |
| China (CN) | CNY | 8.08 | 5.62 | 18.40 | 0.071 | 0.55 | 0.83 | 9% | 0.43 | 0.42 | 0.42 | 0.41 | ×0.57 (0.42–0.73) |
| India (IN) | INR | 5.14 | 3.52 | 12.08 | 0.069 | 0.52 | 0.89 | 9% | 0.36 | 0.35 | 0.36 | 0.42 | ×0.56 (0.37–0.80) |
| Mexico (MX) | MXN | 7.39 | 5.71 | 11.82 | 0.078 | 0.60 | 0.95 | 9% | 0.44 | 0.44 | 0.43 | 0.59 | ×0.62 (0.45–0.78) |
| United States (US) | USD | 34.25 | 26.19 | 58.43 | 0.100 | 0.85 | 1.00 | 11% | 1.08 | 1.08 | 1.01 | 0.84 | ×0.97 (0.87–1.37) |
| Thailand (TH) | THB | 5.74 | 4.15 | 9.89 | 0.079 | 0.58 | 0.93 | 9% | 0.40 | 0.39 | 0.40 | 0.57 | ×0.60 (0.41–0.78) |
| Vietnam (VN) | VND | 3.92 | 2.89 | 7.73 | 0.061 | 0.52 | 0.94 | 8% | 0.33 | 0.33 | 0.34 | 0.50 | ×0.57 (0.35–0.78) |
| Brazil (BR) | BRL | 8.44 | 6.45 | 15.88 | 0.109 | 0.70 | 1.02 | 10% | 0.51 | 0.51 | 0.52 | 0.69 | ×0.70 (0.53–0.87) |
| South Korea (KR) | KRW | 25.44 | 19.66 | 43.94 | 0.148 | 0.80 | 1.00 | 11% | 0.89 | 0.89 | 0.90 | 0.88 | ×0.87 (0.81–0.97) |
| Austria (AT) | EUR | 41.80 | 33.03 | 67.09 | 0.151 | 1.05 | 1.03 | 13% | 1.32 | 1.35 | 1.18 | 1.03 | ×1.12 (1.03–1.27) |
| Belgium (BE) | EUR | 36.40 | 28.90 | 55.65 | 0.131 | 1.00 | 1.02 | 13% | 1.19 | 1.22 | 1.12 | 0.94 | ×1.05 (1.00–1.16) |
| Portugal (PT) | EUR | 13.62 | 10.39 | 24.36 | 0.097 | 0.88 | 1.00 | 11% | 0.70 | 0.70 | 0.70 | 0.75 | ×0.80 (0.67–0.96) |
| Slovakia (SK) | EUR | 13.30 | 10.23 | 22.49 | 0.151 | 0.74 | 0.97 | 10% | 0.62 | 0.63 | 0.63 | 0.75 | ×0.75 (0.63–0.94) |
| Slovenia (SI) | EUR | 19.48 | 14.98 | 32.95 | 0.118 | 0.74 | 0.97 | 10% | 0.74 | 0.75 | 0.75 | 0.76 | ×0.80 (0.70–0.95) |
| Lithuania (LT) | EUR | 11.21 | 8.40 | 18.68 | 0.136 | 0.72 | 0.97 | 10% | 0.57 | 0.57 | 0.56 | 0.72 | ×0.72 (0.58–0.94) |
| Bulgaria (BG) | EUR | 6.57 | 5.08 | 11.40 | 0.120 | 0.65 | 0.96 | 10% | 0.45 | 0.45 | 0.46 | 0.61 | ×0.65 (0.48–0.92) |
| Serbia (RS) | RSD | 5.66 | 4.37 | 9.81 | 0.109 | 0.65 | 0.96 | 10% | 0.43 | 0.43 | 0.44 | 0.70 | ×0.64 (0.46–0.93) |
| Morocco (MA) | MAD | 4.10 | 3.16 | 7.58 | 0.083 | 0.60 | 0.90 | 9% | 0.38 | 0.38 | 0.38 | 0.57 | ×0.58 (0.40–0.83) |
| Tunisia (TN) | TND | 2.02 | 1.55 | 3.73 | 0.087 | 0.60 | 0.90 | 9% | 0.34 | 0.34 | 0.34 | 0.56 | ×0.57 (0.37–0.83) |
| Egypt (EG) | EGP | 1.43 | 1.10 | 2.64 | 0.028 | 0.60 | 0.90 | 9% | 0.33 | 0.33 | 0.33 | 0.47 | ×0.55 (0.33–0.81) |
| South Africa (ZA) | ZAR | 11.00 | 8.41 | 20.70 | 0.078 | 0.70 | 1.02 | 10% | 0.56 | 0.56 | 0.57 | 0.69 | ×0.72 (0.55–0.84) |
| Japan (JP) | JPY | 19.40 | 14.99 | 33.51 | 0.123 | 0.80 | 1.00 | 11% | 0.77 | 0.78 | 0.78 | 0.83 | ×0.81 (0.74–0.91) |
| Taiwan (TW) | TWD | 12.96 | 10.02 | 22.39 | 0.101 | 0.80 | 1.00 | 11% | 0.65 | 0.65 | 0.66 | 0.79 | ×0.76 (0.63–0.87) |
| Malaysia (MY) | MYR | 6.44 | 4.65 | 11.09 | 0.084 | 0.58 | 0.93 | 9% | 0.41 | 0.41 | 0.41 | 0.58 | ×0.61 (0.42–0.78) |
| Indonesia (ID) | IDR | 5.04 | 3.65 | 8.69 | 0.047 | 0.58 | 0.93 | 9% | 0.39 | 0.38 | 0.38 | 0.55 | ×0.58 (0.39–0.79) |
| Philippines (PH) | PHP | 3.54 | 2.61 | 6.99 | 0.118 | 0.52 | 0.94 | 8% | 0.33 | 0.33 | 0.34 | 0.53 | ×0.57 (0.37–0.78) |
| Singapore (SG) | SGD | 28.83 | 20.84 | 49.68 | 0.159 | 0.80 | 1.00 | 11% | 0.95 | 0.92 | 0.94 | 0.81 | ×0.89 (0.82–0.99) |
| Canada (CA) | CAD | 25.81 | 19.74 | 44.03 | 0.082 | 0.85 | 1.00 | 11% | 0.92 | 0.92 | 0.86 | 0.79 | ×0.89 (0.82–0.97) |

### Review notes

- **High-wage countries** (DE, AT, NL, BE, SE, US, SG) come out above 1 on labour and toolroom. Their parts cost more than in the UK where labour dominates, and less where cheap energy or materials dominate (US electricity is 37% of the UK's).
- **Tunisia (0.08) and Egypt (0.06) skilled-labour ratios** look extreme but are the sourced 2026 minimum wages (TND 2.713/h ≈ £0.69, EGP 33.65/h ≈ £0.49) scaled from Turkey by the same ratio as Morocco. They are correct to the method; the method (minimum-wage ratio × analogue skill mix) is the stated estimate.
- **Machine-rate multipliers** for the 19 countries added in October are held from an analogue country. This is stated in the config and on each country's source line.

## 5. Live results

### CAD path: 14 real parts × 12 countries, real server and browser

Each costing was taken from upload through the engineering questions to Calculate, in the country selected first. Every charged rate in the tool's own Excel trace was checked against all 39 country books. The exported Rate Database was compared with an independently built book for that country: **0 differences in every run**.

| Part (commodity) | UK | IN | CN | DE | US | MX | JP | VN | PL | TR | BR | ZA |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `AL_Heat_Sink` (aluminium extrusion) | £4.29 | ₹365.78 | ¥21.80 | €5.26 | $6.98 | $M68.75 | JP¥703.58 | ₫94,998.08 | zł18.41 | ₺198.89 | R$22.71 | R69.49 |
| `BIW_Reinf_Channel` (sheet metal) | £1.18 | ₹108.43 | ¥7.57 | €1.58 | $1.63 | $M21.69 | JP¥229.99 | ₫29,652.27 | zł5.02 | ₺56.95 | R$6.90 | R22.18 |
| `BM_Washer_Reservoir` (blow moulding) | £1.45 | ₹118.48 | ¥8.30 | €1.86 | $1.82 | $M24.19 | JP¥263.66 | ₫32,429.44 | zł5.81 | ₺63.40 | R$7.94 | R25.07 |
| `COMP_Hat_Stiffener` (composites) | £99.63 | ₹5,186.34 | ¥402.79 | €137.45 | $128.39 | $M1,145.54 | JP¥16,071.89 | ₫1,350,403.60 | zł313.86 | ₺3,048.33 | R$390.19 | R1,291.37 |
| `EXT_Vent_Pipe` (extrusion) | £0.94 | ₹81.46 | ¥5.52 | €1.22 | $1.10 | $M15.57 | JP¥174.61 | ₫22,108.04 | zł3.83 | ₺43.49 | R$5.33 | R16.82 |
| `FORGE_Hub_Flange` (forging) | £27.07 | ₹1,716.80 | ¥126.27 | €34.62 | $31.79 | $M365.66 | JP¥4,425.15 | ₫457,139.10 | zł95.54 | ₺983.55 | R$122.41 | R386.41 |
| `IM_ECU_Cover` (injection moulding) | £1.47 | ₹123.59 | ¥8.84 | €1.92 | $1.90 | $M24.98 | JP¥270.50 | ₫33,550.52 | zł5.96 | ₺65.71 | R$8.04 | R25.56 |
| `MACH_Hydraulic_Manifold` (machining) | £40.99 | ₹2,732.05 | ¥203.48 | €53.55 | $50.02 | $M570.75 | JP¥6,816.75 | ₫718,607.22 | zł146.24 | ₺1,538.29 | R$187.05 | R596.11 |
| `PRCR002` (cast and machine) | £48.72 | ₹3,201.17 | ¥237.02 | €63.64 | $59.84 | $M676.57 | JP¥8,155.92 | ₫854,486.33 | zł174.90 | ₺1,826.95 | R$221.54 | R706.60 |
| `ROTO_Header_Tank` (rotational moulding) | £20.82 | ₹982.29 | ¥77.79 | €29.59 | $26.42 | $M222.09 | JP¥3,207.21 | ₫252,151.21 | zł63.05 | ₺589.39 | R$76.15 | R248.76 |
| `RUB_AV_Mount` (rubber) | £2.10 | ₹121.33 | ¥9.30 | €2.90 | $2.65 | $M26.15 | JP¥340.18 | ₫31,634.42 | zł6.96 | ₺70.16 | R$8.70 | R28.12 |
| `Seat_Locking_Bracket` (sheet metal) | £2.18 | ₹173.39 | ¥12.40 | €3.00 | $2.99 | $M35.53 | JP¥402.00 | ₫46,911.17 | zł8.54 | ₺93.27 | R$11.41 | R37.03 |
| `TF_Trim_Cover` (thermoforming) | £2.27 | ₹170.02 | ¥11.89 | €3.23 | $2.89 | $M33.83 | JP¥404.07 | ₫45,403.57 | zł8.58 | ₺90.71 | R$11.28 | R36.42 |
| `test-gear-m3-z38` (gear) | £21.46 | ₹1,532.62 | ¥107.18 | €26.61 | $25.45 | $M327.71 | JP¥3,710.51 | ₫425,264.63 | zł82.58 | ₺870.82 | R$108.10 | R339.91 |

Live runs: 168. Charged rate lines checked: 1332, from another country: 0. Server calls: 516/516 priced in the selected country.

India was re-run after the heat-treat fix. Only its heat-treated parts moved, slightly upwards (housing ₹3,192.65 → ₹3,201.17), because India's furnace overhead is no longer cut twice.

### Forms: every commodity on its defaults, all 39 countries

| Countries | Forms each | Charged rate lines each | £ defaults checked each | Result |
|---|---|---|---|---|
| All 39: UK, DE, FR, IT, ES, PL, CZ, AT, BE, BG, BR, CA, CN, EG, HU, ID, IN, JP, KR, LT, MA, MX, MY, NL, PH, PT, RO, RS, SE, SG, SI, SK, TH, TN, TR, TW, US, VN, ZA | 19 | 83 | 48 | Every charged rate is that country's book; every £ default = UK default × that country's factor; traded and quote fields unchanged |

Total: 39 countries, 3,237 charged rate lines, 1,872 £ defaults — **0 problems**. (Assembly rolls up parts already costed and has no rates of its own.)

### What the live runs caught that the code review did not

A country picked while the page is still loading changed the picker but not the rates: the header said Vietnam while the costing ran in the UK. After the listeners are wired, the shown country is now applied, and a test guards it (§14).

## 6. Stated assumptions the director should know

1. **Derived factors, not quotes.** The country factors for toolroom, process, inspection and heat treat come from the country table, not local quotes. A quote typed into the form replaces any of them.
2. **Traded goods stay at one £ price everywhere.** These are cutting inserts, catalogue hardware, electronic components, wire and connectors, die sets, tool steel and hot-runner systems. Exchange metals follow the country's metal factor (LME-based).
3. **Logistics is delivery to the UK**, × the country's logistics multiplier.
4. **Nearest market or hub.** PCB pricing and software engineering use the nearest assessed market or hub where a country has none of its own, and the screen says which.
5. **Analogue multipliers.** The 19 countries added in October take their machine and material multipliers from an analogue country.

## 7. Reproduce

```
npx vitest run tests/country-rates.test.ts           # §13: 40 parts × 39 countries, every rate line
CV_FORMS_REGIONS=DE,CN,US npx tsx e2e/country-forms.ts
CV_LIVE_REGION=DE CV_LIVE_PART=../cad-audit/parts/<part> CV_LIVE_ANSWERS='{...}' npm run test:e2e:country
```

## 8. Follow-up: the country comparison table (fixed)

**What was wrong.** The headline costing was right in every country, but the comparison table's other rows were not. Each row re-priced only the rate lines (labour, machine-hours, materials, energy) in that country's book and moved tooling by the toolroom factor. Everything else the costed country had decided rode into every other row unchanged:
- heat treatment, cores, NDT and other services;
- a composite's fibre and resin price;
- a CAD rule's die or mould cost;
- the forms' £ defaults;
- the PCB market;
- the country that the gear heat treat and the paint line read off the page.

A whole die was also scaled as if it were all toolroom labour. Against the true per-country costing of the 40 real parts the rows were up to 68% off (median 0.8%, worst decile 16%).

**What a row is now.** Each row is the part costed with that country selected:
- **Server (rules-only mode).** Every CAD response carries the part's analysis in each comparison country (`analysisByRegion`), built with the same rules and guards as the costed country.
- **Screen.** CAD apply draws and fills the form once per comparison country and records the result. Each row then re-collects the form in that country, where:
  - CAD fills, £ defaults and shop fields follow that country;
  - both country pickers and the PCB market pickers are set to that country;
  - a figure the engineer typed stays.

  The row is costed in that country's book (`src/ui/country-recost.ts`), and the form and active book are restored exactly afterwards.
- **PDF.** The report prints the same rows.

**Proof (live, India selected, each row compared with that country costed live):**

| Path | Rows checked | Median error | Worst |
|---|---|---|---|
| CAD, 14 real parts | 98 | 0.007% | 0.38% — the reference is rounded to the penny on a £0.94 part |
| Commodity forms on defaults | 171 | 0.005% | £0.03 on a £750 composite (rounding of the exported total and FX) |

Before the fix: PCB fab rows were 57–63% off, gear and paint rows 4–12% off, and die-heavy pressings up to 68% off.

**AI-led and Compare modes** do not carry per-country analyses. Their other rows fall back to the stack re-price; Rules-only is the default and the mode the screen sends.
