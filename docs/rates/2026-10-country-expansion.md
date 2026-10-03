# Country expansion — October 2026 (20 → 39 countries)

**Request.** Option 3 of the TSET follow-up: build the rate library out from public statistics. It grows from 20 to about 40 manufacturing countries, using published labour, energy and market data, with a source on every number.

**Result.** 19 countries were added, so there are now **39**. Every figure is in one config file, `scripts/rate-refresh/2026-10-countries.json`, with its source. The arithmetic is done in one script, `scripts/region-expand.ts`. Running it with `--check` proves the tables still match the config. `tests/region-expansion.test.ts` pins the results.

| Region | Added |
|---|---|
| Europe | Austria, Belgium, Bulgaria, Lithuania, Portugal, Serbia, Slovakia, Slovenia |
| Americas | Canada |
| Asia-Pacific | Indonesia, Japan, Malaysia, Philippines, Singapore, Taiwan |
| Africa | Egypt, Morocco, South Africa, Tunisia |

Argentina was considered and left out. Its wage series in sterling moved by more than half within a year, and the peso has no stable reference rate, so a rate would be wrong before it was used.

## 1. Method

**Labour.** Each new country gets its eight labour categories by scaling an **analogue** country. The analogue is one of the 20 already in the library, with a similar industry and skill mix. The analogue's September 2026 rates are multiplied by the ratio of one published wage measure: the new country's figure ÷ the analogue's figure.

Both sides of that ratio come from **the same source and the same measure**, converted at the same exchange rate. So the ratio never mixes bases, such as an hourly figure against a monthly one, or wages against total labour cost. What the method assumes is the analogue's **skill mix**: how far a machinist, a press operator and an engineer sit above one another. That is stated, not measured.

| Measure | Used for | Source |
|---|---|---|
| Hourly labour cost, whole economy, 2024, € | AT, BE, PT, SK, SI, LT | Eurostat, 28 Mar 2025. This is the latest year with every member state in one release; Belgium's 2025 estimate was not published. |
| The same, 2025 | BG | Eurostat, 31 Mar 2026 (Bulgaria €12.0, Romania €13.6) |
| Manufacturing worker monthly base salary, USD | MY, ID, PH, SG | JETRO FY2024 survey of Japanese companies in Asia and Oceania |
| Average monthly manufacturing wage, bonuses included | JP, TW against KR | MHLW, DGBAS and MOEL figures as compiled by tradingeconomics. Japan and Taiwan use the mean of the four 2026 quarters. Korea uses the mean of 2025 Q1–Q3, because Korea's 2026 quarters carry record semiconductor bonuses. Whole years are averaged so bonus months count on both sides. |
| Average gross monthly earnings | RS against RO | RZS Serbia (July 2026); INS Romania (March 2026) |
| Statutory minimum wage per hour, 2026 | MA, TN, EG against TR; ZA against BR | National decrees. Turkey TRY 33,030 a month ÷ 225 h; Morocco SMIG 17.92 MAD/h; Tunisia 2.713 TND/h (40-hour regime); Egypt EGP 7,000 a month ÷ 208 h; South Africa R30.23/h; Brazil R$7.37/h. |
| Average hourly earnings in manufacturing | CA against US | Statistics Canada SEPH, hourly-paid employees (CAD 32.47, Jan 2026); BLS, production and non-supervisory employees (USD 30.37, Aug 2026) |

**Electricity.**
- EU members use Eurostat non-household prices for the second half of 2025, in the 500–2,000 MWh band.
- Malaysia uses the TNB tariff from 1 July 2025 (average base tariff 45.40 sen/kWh). GlobalPetrolPrices' figure for Malaysia predates that reform.
- The other countries use the GlobalPetrolPrices business tariff. That is a commercial tariff, so a large plant on an industrial contract may pay less.

**Gas.**
- Eurostat non-household gas for the second half of 2025: Bulgaria €4.14, Portugal and Belgium €4.81 per 100 kWh.
- Austria, Slovakia, Slovenia and Lithuania use the EU average, €6.05.
- Outside the EU, gas is the analogue's figure, held. It is not sourced, and it is marked so in the code.

**FX.** fawazahmed0/currency-api snapshot of 29 Sep 2026, the same snapshot the September refresh used. Bulgaria has been in the euro since 1 January 2026.

**Multipliers.** Five multipliers are the analogue's, held: material factors, machine rate, overhead, packaging and logistics. These are estimates, not measurements.

**Aluminium billet premium.** Each premium is stated with its basis, and all are labelled estimates:
- EU members: EU duty-paid levels.
- Morocco and Tunisia: the Turkish CIF assessment, as the nearest Mediterranean one.
- Egypt and South Africa: domestic smelters (Egyptalum, Hillside).
- Asia: P1020 premium plus billet conversion.
- Canada: P1020 premium plus the US billet upcharge, without the Section 232 tariff.

## 2. The new countries

£/hr fully loaded; energy in £/kWh. "(XX)" after a gas price means the analogue's figure, held.

| Country | £1 = | Labour | Basis (new ÷ analogue) | Skilled | Semi-skilled | Engineer | Electricity | Gas | Billet $/t |
|---|---|---|---|---|---|---|---|---|---|
| Austria | EUR 1.165 | DE × 1.0253 | €44.5 ÷ €43.4 (Eurostat 2024) | 41.80 | 33.03 | 67.09 | 0.151 | 0.052 | 1100 |
| Belgium | EUR 1.165 | NL × 1.0664 | €48.2 ÷ €45.2 (Eurostat 2024) | 36.40 | 28.90 | 55.65 | 0.131 | 0.041 | 1100 |
| Portugal | EUR 1.165 | ES × 0.7137 | €18.2 ÷ €25.5 (Eurostat 2024) | 13.62 | 10.39 | 24.36 | 0.097 | 0.041 | 1100 |
| Slovakia | EUR 1.165 | CZ × 1.0165 | €18.5 ÷ €18.2 (Eurostat 2024) | 13.30 | 10.23 | 22.49 | 0.151 | 0.052 | 1080 |
| Slovenia | EUR 1.165 | CZ × 1.4890 | €27.1 ÷ €18.2 (Eurostat 2024) | 19.48 | 14.98 | 32.95 | 0.118 | 0.052 | 1080 |
| Lithuania | EUR 1.165 | PL × 0.9422 | €16.3 ÷ €17.3 (Eurostat 2024) | 11.21 | 8.40 | 18.68 | 0.136 | 0.052 | 1080 |
| Bulgaria | EUR 1.165 | RO × 0.8824 | €12.0 ÷ €13.6 (Eurostat 2025) | 6.57 | 5.08 | 11.40 | 0.120 | 0.036 | 1060 |
| Serbia | RSD 136.9 | RO × 0.7594 | RSD 167,402 ÷ RON 9,902 (avg gross) | 5.66 | 4.37 | 9.81 | 0.109 | 0.070 (RO) | 1080 |
| Morocco | MAD 12.77 | TR × 0.6199 | MAD 17.92 ÷ TRY 146.8 (min wage/h) | 4.10 | 3.16 | 7.58 | 0.083 | 0.038 (TR) | 675 |
| Tunisia | TND 3.931 | TR × 0.3049 | TND 2.713 ÷ TRY 146.8 (min wage/h) | 2.02 | 1.55 | 3.73 | 0.087 | 0.038 (TR) | 675 |
| Egypt | EGP 68.91 | TR × 0.2158 | EGP 33.65 ÷ TRY 146.8 (min wage/h) | 1.43 | 1.10 | 2.64 | 0.028 | 0.038 (TR) | 600 |
| South Africa | ZAR 21.76 | BR × 1.3034 | ZAR 30.23 ÷ BRL 7.37 (min wage/h) | 11.00 | 8.41 | 20.70 | 0.078 | 0.050 (BR) | 600 |
| Japan | JPY 208.5 | KR × 0.7625 | JPY 451,381 ÷ KRW 5,105,463 (mfg wage/month) | 19.40 | 14.99 | 33.51 | 0.137 | 0.068 (KR) | 430 |
| Taiwan | TWD 42.17 | KR × 0.5095 | TWD 61,000 ÷ KRW 5,105,463 (mfg wage/month) | 12.96 | 10.02 | 22.39 | 0.161 | 0.068 (KR) | 420 |
| Malaysia | MYR 5.405 | TH × 1.1213 | $490 ÷ $437 (JETRO) | 6.44 | 4.65 | 11.09 | 0.084 | 0.040 (TH) | 400 |
| Indonesia | IDR 23,850 | TH × 0.8787 | $384 ÷ $437 (JETRO) | 5.04 | 3.65 | 8.69 | 0.047 | 0.040 (TH) | 450 |
| Philippines | PHP 82.76 | VN × 0.9040 | $273 ÷ $302 (JETRO) | 3.54 | 2.61 | 6.99 | 0.118 | 0.030 (VN) | 450 |
| Singapore | SGD 1.693 | TH × 5.0229 | $2,195 ÷ $437 (JETRO) | 28.83 | 20.84 | 49.68 | 0.159 | 0.040 (TH) | 430 |
| Canada | CAD 1.878 | US × 0.7535 | CAD 32.47 ÷ USD 30.37 (mfg hourly) | 25.81 | 19.74 | 44.03 | 0.082 | 0.040 (US) | 1050 |

**Check, as a sanity test.** JETRO's Thailand/Vietnam worker ratio is $437 ÷ $302 = 1.447. The library's own Thailand/Vietnam semi-skilled ratio is £4.15 ÷ £2.89 = 1.436. So the survey and the existing rates agree to within 1 %.

## 3. What it does to a part

The reference machined bracket (£24.79 UK, pinned in `tests/reference-part.test.ts`), costed on each country's full regional library:

| | | | | | |
|---|---|---|---|---|---|
| UK £24.79 | Austria £28.39 | Belgium £26.20 | Canada £21.22 | Singapore £19.60 | Japan £19.48 |
| Slovenia £18.61 | Portugal £18.50 | Taiwan £18.01 | Slovakia £17.30 | Lithuania £16.38 | South Africa £15.58 |
| Bulgaria £14.20 | Serbia £13.86 | Malaysia £13.00 | Morocco £12.58 | Indonesia £12.28 | Tunisia £12.07 |
| Philippines £11.88 | Egypt £11.36 | | | | |

For comparison, Germany is £28.57, Poland £16.57, China £12.93 and India £11.81. No cost in the 20 existing countries moved. The new countries are additions, and the full suite of 2,976 tests passes unchanged.

## 4. Wired through, not just added

- **The screen.** The header's country picker, the "Country" bar and the dashboard's region filter are now filled from `REGIONAL_DATA` by `src/ui/region-options.ts`, grouped by region. Before, the bar offered only 8 of the 20 countries and the filter 6. The currency picker offers every currency in `CURRENCY_SYMBOL`; 12 new currencies were added, at the same FX snapshot. `index.html` no longer hand-lists either.
- **Landed cost.** Every country now has an origin entry. **France, Italy, Spain and the other EU members had none, so they were costed at MFN duty as if the TCA did not exist.** They are now under the TCA.

  The new partners carry their UK agreements, each with its rules of origin. The engine reports origin as *unknown*, not met, until a rule is recorded:

  | Partner | Agreement |
  |---|---|
  | Korea | FTA |
  | Japan | CEPA |
  | Singapore | FTA |
  | Canada | TCA |
  | Malaysia | CPTPP |
  | Serbia | PTCA |
  | Morocco, Tunisia, Egypt | Association Agreements |
  | South Africa | SACUM EPA |

  Taiwan, Thailand, Brazil, Indonesia and the Philippines are at MFN. The DCTS preference that Indonesia and the Philippines can claim is noted but not modelled.
- **The comparison table.** Its landed adder used to charge any unlisted country 5 % duty and 5 % shipping, which billed EU members a duty they do not pay. Every region now has its own indicative row.
- **Sea freight and carbon.** The freight default (£0.22/kg) is an Asia lane, and it was being applied to Austria and Belgium. Every country now has its own lane. Grid carbon intensity, inbound logistics carbon, origin carbon price and inland haulage now cover all 39 countries. These figures are approximate 2024 values, labelled as estimates.
- **The next refresh.** `scripts/rate-refresh.ts` knows each new country's currency. It throws for any country its config gives no wage growth or FX for, so none of the 19 can quietly stay at this quarter's rates.

## 5. Limits — say these out loud

- **Skill mix is borrowed.** The ratio scales all eight categories alike. Two cases stand out:
  - **Singapore** is high-skill and high-wage, but it inherits Thailand's wide gap between operator and engineer, so its engineer rate is probably overstated.
  - **Japan** inherits Korea's mix.
- **Multipliers are borrowed.** The machine-rate, material and overhead multipliers are the analogue's. A Japanese machine-hour is costed like a Korean one, apart from labour and electricity.
- **Gas outside the EU is the analogue's.** It matters only to furnace-heavy processes: casting, forging and heat treatment.
- **Business tariffs.** The GlobalPetrolPrices figures are commercial tariffs. Egypt's $0.037/kWh is a subsidised tariff that is being phased out.
- **Search summaries.** As in the September refresh, the statistics offices' pages could not be opened from the build environment. Figures were read from cited search results. Each one is named in the config so it can be checked against the source table.
