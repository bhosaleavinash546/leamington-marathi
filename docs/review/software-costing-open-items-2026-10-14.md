# Software costing: open items, research and decisions (14 Oct 2026)

This document records what was researched for the gaps the independent re-score left open, what was changed, and what
is still unsourced.

**Method.**
- Five research agents worked under `calculator/scripts/sw-research/2026-10-14-open/RULES.md`: one record per figure,
  with the exact words, URL, date and confidence. "Not found" was allowed; nothing was estimated in a source's name.
- About 160 web searches were used. Every page fetch failed (DNS), so the figures were read from search results, not
  from the opened pages.
- A sixth agent independently re-searched every figure that became a default, before it was used.
- Raw records are in `raw/*.json` / `raw/*.md`; the verification is in `raw/verify.md`.
- A figure enters the model only if it was re-checked. Everything else keeps its unsourced label.

## What changed

| Item | Before | After | Source (re-checked) |
|---|---|---|---|
| Connected service per vehicle | 10 yr (Berg Insight terms, 2015–16) | **8 yr** — the median of current OEM terms | GM OnStar Basics 8 yr on MY2025+ (onstar.com, GM release Feb 2024); Tesla Standard Connectivity 8 yr for cars ordered after 20 Jul 2022 (tesla.com); Toyota up to 10 yr (2022); Mercedes-Benz mbrace Connect 5 yr (US) |
| Development window | 90 months (the tool's own timeline) | **54 months** | Volkswagen's stated cycle, 54 months, target 36 (Kai Grünitz, IAA 2023 — automobile-propre, Motor1, Autocar). GM "around four years" (CNBC 2022). Chinese OEMs ~18–24 months (Reuters, Bloomberg). Undiscounted cost does not depend on it. |
| Security support after the last build | none | **10 yr × 25 % of the tail team**, a new line graded **unsourced** | The duty is regulatory: UN R155 defines the post-production phase as running "until the end-of-life of all vehicles under the vehicle type", and para 7.2.2.1 makes the CSMS cover it (EUR-Lex 2025/5). UN R156 requires updates over the vehicles' lifetime. The 10 years is CARIAD's stated software support after end of production (t3n, 2023). **The 25 % is a CostVision assumption: no VSOC price or post-production cost study was found.** |
| Supplier margin (make or buy) | 18 % (median of 4 firms, 3 of them Indian) | **11.7 %** (median of 6) | Bertrandt −3.7 % (EBIT FY24/25); EDAG −1.8 % (adjusted EBIT 2025); ALTEN 8.5 % (operating margin on activity, 2025); LTTS 14.9 % (EBIT FY25); KPIT 21.0 % (EBITDA FY25); Tata Elxsi 26.3 % (PBT FY25). Graded Low because the measures are mixed and the German years are a downturn (Bertrandt's medium-term target is 6–9 %). |
| Cellular patent licence | none | **US$20 per vehicle** on the TCU module (Avanci 4G, paid once by the car maker; 5G US$32) | avanci.com published rate. Set it to 0 if your TCU price already carries it. |
| Cerence price per unit | US$5.05 (TTM Q4 FY25) | **US$5.09** (TTM to Q2 FY26) | Cerence earnings decks filed with the SEC |
| UK contractor reference (Rates check) | £600 / day (6 rates, Jan 2026) | **£525 / day** (35 rates, 6 months to 3 Oct 2026) | IT Jobs Watch, "Embedded Systems". The old figure had too few rates; the "£500" claim could not be confirmed for Oct 2026. |
| Cloud rate | unsourced, unexplained | still unsourced; its basis now gives the only priced anchor | AWS IoT FleetWise lists US$0.60 per vehicle-month for the first 10,000 vehicles and US$0.45 for the next 40,000, with messages and storage extra. That is US$5.4–7.2 per vehicle-year for data collection alone. The service closed to new customers on 30 Apr 2026. No OEM publishes a back-end cost per vehicle. |

**Labels corrected to what is published:**
- **GAS / QNX:** Google publishes no GAS fee. BlackBerry licenses QNX per unit but gives no per-vehicle royalty (FY26 QNX revenue US$268M; royalty backlog about US$950M).
- **Map data:** HERE and TomTom publish no per-car price (TomTom FY25 automotive revenue €322M, with no vehicle count).
- **Qt:** there is no public automotive price (Qt Group 2025 distribution licences €56.8M across all industries).
- **Bluetooth:** the patent licence is royalty-free. The SIG qualification fee is US$12,000 per product design, from 1 Mar 2026.

## Default programme, before → after (UK hub, 80,000 vehicles / yr × 10 yr)

| | Gaps round | Open-items round |
|---|---|---|
| Programme total | £241.6M | **£243.0M** |
| Per vehicle, all-in | £302 | **£304** |
| Cloud | £86.0M | £68.8M (8-year service) |
| Licences & royalties | £61.8M | £73.9M (+ Avanci £15.11 / vehicle) |
| Maintenance | £34.0M | £40.6M (+ £6.6M security support after the last build) |
| NRE | £59.8M | £59.8M |
| Royalty per vehicle built | £22.70 | £37.84 |
| Band P10 / P50 / P90 | £234M / £276M / £329M | £234M / £276M / £326M (headline ≈ P16) |
| Tier-1 v in-house, same hub | × 1.073 | × 0.997 — about break-even. The efficiency (× 0.88) is unsourced, so make or buy now turns on it. |

## UX items closed

- **Charts:** each chart is redrawn at its card's width (`setChartWidth` and a ResizeObserver). Below 520 px, labels sit
  on their own line above the bars, the tick count drops and the P50 label moves up a line. Nothing scrolls sideways
  or shrinks its text.
- **Engineer rate:** the field is blank, with the hub's book rate as its greyed placeholder. Typing a value overrides
  it; clearing the field returns to the book rate.
- **Pinned baseline:** saved as a project of kind `sw_baseline`, on the server for a signed-in user, so it follows
  them to another device. The old browser-only key is migrated once.
- **Truncation:**
  - Rail sub-lines wrap instead of being cut off.
  - The desktop waterfall's label column fits "Testing (SIL / MIL / HIL)".
  - Treemap group headers put the £ first.
  - Gantt names carry their full name as a tooltip.

## Still open (unsourced, labelled)

- **Module effort catalogue (person-months):** no automotive productivity source was found.
  - The usable public dataset is the defence data in Clark & Madachy, *Software Cost Estimation Metrics Manual for
    Defense Systems* (2015), which has "Vehicle Control" and "Real Time Embedded" tables. Its host (softwarecost.org,
    DTIC) could not be reached from here.
  - COCOMO II's A = 2.94 is confirmed.
  - The most effective step for a user is to calibrate on their own actuals or size modules in KSLOC.
- **Cloud £ per connected vehicle-year:** no OEM figure exists; FleetWise is the only priced lower anchor.
- **Map data, GAS / QNX and IP licences:** no public prices. Use supplier quotes.
- **Tier-1 efficiency × 0.88 and start-up × 0.72:** no source. No published in-house v supplier effort ratio was found.
- **Post-production share (25 %):** an assumption. The years and the obligation are sourced; the cost is not.
- **Accuracy:** unmeasured. No real programme actuals are logged.
