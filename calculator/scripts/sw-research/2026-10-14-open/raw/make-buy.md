# Make-or-buy for automotive software: research summary (14 Oct 2026)

Records: `make-buy.json` (44 records, 9 of them NOT FOUND). 37 web searches. WebFetch failed with DNS errors on both
attempts (ltts.com, digitalmarketplace), so **every record is `access: "search-snippet"`**. Quotes are the words in the
search result or summary, not a page I opened. Treat each URL as the place to confirm the figure before it goes into the model.

## Found: audited or company-released figures (High)

| Company | Period | Revenue | Margin (as stated) | Headcount |
|---|---|---|---|---|
| KPIT | FY25 (to 31 Mar 2025) | USD 691 M | EBITDA ~21% | 12,795 at 31 Dec 2024 (year-end NOT FOUND) |
| Tata Elxsi | FY25 | Rs 3,729.0 Cr | PBT 26.3% (Q4 EBITDA 22.9%) | 12,414 at 31 Mar 2025 (BRSR) |
| LTTS | FY25 | ₹106,701 M / USD 1,259 M | EBIT 14.9% | 24,258 at 31 Mar 2025 |
| Tata Technologies | FY25 | ₹51,685 M | Operating EBITDA 18.1% | NOT FOUND (Q1 FY25: 12,505 incl. contractors) |
| HCLTech (consolidated) | FY25 | ₹117,055 Cr | EBIT 18.3% (ERS segment NOT FOUND) | — |
| Bertrandt | FY 2024/25 (to 30 Sep) | total output €978 M | EBIT ~-€36 M; adj. EBIT -€2 M; target 6–9% medium term | 12,185 (30 Sep 2025); 14,028 a year earlier |
| Bertrandt | FY 2022/23 | total output €1,157.4 M | EBIT €50.1 M | 14,276 (30 Sep 2023) |
| EDAG | 2024 | €822.0 M | adj. EBIT 3.8% (2023: 6.2%) | 9,051 (30 Jun 2024) |
| EDAG | 2025 | €714.0 M | adj. EBIT -1.8% | 8,698 (30 Jun 2025) |
| Alten | 2024 | €4,143.3 M | operating margin on activity 9.1% (2023: 9.4%) | 57,700 |
| Capgemini (Medium, secondary) | 2024 | €22,096 M | operating margin 13.3% | 341,100 (58% offshore) |

Margins are stated on different bases: EBITDA, PBT, EBIT, adjusted EBIT, "operating margin on activity". **They are not
comparable one to one.**

## Found: sell / billing rates (mostly Medium or Low)
- **UK contractors**: ITJobsWatch median for an Embedded Software Engineer is £500/day, with an interquartile range of
  £475–£626, from 11 rates in the 6 months to 1 May 2025. These are advertised contractor rates, not ESP invoices.
- **UK frameworks**: the CCS DOS 7 Lot 3 average day rates are dated 28 Jun 2022. They are ceiling bids and contain
  placeholder maxima, and the developer rows were not read. The G-Cloud 14 SFIA cards come from 8 suppliers: Level 4
  runs £719–£1,445/day and Level 5 £835–£1,811/day. These are ceilings, and which supplier sits at which URL was not
  verified.
- **US GSA**: only individual vendor ceiling price lists turned up. TechWizards prices Software Engineer I–III at
  $68–$96/h (Year 1, about 2021). TECH Soft is ~$145–$166/h for senior roles (a third-party summary). No CALC median was found.
- **Germany**: no Bertrandt, EDAG or FEV hourly rate was found. The only figure is Bayika 2019, €100–150/h for
  building-automation software engineers. It is NOT automotive.
- **India**: no published ESP billing rate was found. The only figures are vendor blogs: "Everest via Devico" gives
  $28/h including vendor margin, and Opsio gives $15–60+/h. Both are Low.

## Found: offshore overhead and make-vs-buy
- **Herbsleb & Mockus 2003 (IEEE TSE, High)**: distributed work items take about **2.5× the calendar time**. This
  measures speed, not effort or cost. A UVic dissertation conflicts with it.
- **Dibbern et al. 2008 (MISQ)**: names four client extra-cost categories. **No percentage** appears in the abstract.
- **Gartner 2024, cited by a vendor blog**: hidden costs add 18–27%. Two other vendor blogs give 20–30% and 20–40%. All three are Low.
- **McKinsey 2020**: should-costing cuts automotive software spend by up to 30%. This is a procurement saving, NOT a
  make-vs-buy ratio.
- **Roland Berger / SDVerse**: outsourcing could save USD 17 bn a year from 2030, an industry aggregate.
- **Cariad**: aims to cut development costs by 20%. VW will invest up to USD 5 bn in the Rivian JV.

## NOT FOUND
- KPIT year-end FY25 headcount.
- HCLTech ERS segment margin and Akkodis 2024 margin.
- Any published automotive ESP hourly rate (DE, IN).
- A GSA median.
- A start-up / small-vendor risk premium %.
- An OEM in-house vs Tier-1 cost ratio.
- **Any source for an 18% supplier margin.**

## Conflicts
- **KPIT revenue per employee**: DCF-analysis says ~USD 48k. The derivation below gives ~USD 54k.
- **KPIT headcount**: company 12,795 / "over 13,000" against Revelio 9,221 and PitchBook 9,149.
- **Tata Elxsi headcount**: BRSR 12,414 against aggregators' 8,878–16,117.
- **FEV revenue**: ">€900 M" against a modelled USD 449.9 M. Both are Low.

## Derivations (my arithmetic, NOT source figures)
Revenue per head at period-end headcount:
- Tata Elxsi: ₹37,290 M ÷ 12,414 = **₹3.00 M**.
- LTTS: $1,259 M ÷ 24,258 = **$51.9k**. Headcount includes an acquisition made late in the year.
- KPIT: $691 M ÷ 12,795 (Dec 2024) = **$54.0k**. The dates do not match.
- Alten: €4,143.3 M ÷ 57,700 = **€71.8k**.
- Capgemini: €22,096 M ÷ 341,100 = **€64.8k**.
- Bertrandt 24/25: €978 M ÷ 12,185 = **€80.3k**, or €74.6k on the average of the opening and closing headcount (13,106.5).
  Total output is not revenue.
- EDAG 2024: €822.0 M ÷ 9,051 (mid-year) = **€90.8k**.

Revenue per head is a blended **sell price per head**. It mixes onsite and offshore staff, includes non-billable staff
and non-software work, and is not an hourly rate.

Margins:
- Bertrandt EBIT ÷ total output: FY22/23 = 50.1 ÷ 1,157.4 = **4.3%**; FY23/24 = -98 ÷ 1,187 = -8.3%; FY24/25
  = -36 ÷ 978 = -3.7% (adjusted -0.2%).
- The stated margins of the profitable ESPs run from **3.8% (EDAG 2024, adjusted EBIT)** to **26.3% (Tata Elxsi, PBT)**.
  The German ESPs sit at the bottom and the Indian ESPs at the top. The tool's 18% sits inside the Indian range and well
  above the German and French ESPs (Alten 9.1%, EDAG ≤ 6.2%, Bertrandt target 6–9%).
- A margin m on price is a mark-up of 1/(1 − m) on cost. At m = 18% that is ×1.2195.
- EBIT margin is struck after the supplier's own SG&A. If the tool's in-house cost already carries company burden, an
  EBIT margin is the right comparator for the supplier's extra charge. If it does not, the supplier's SG&A is missing.
