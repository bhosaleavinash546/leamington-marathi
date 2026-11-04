# Review-round research: foundry burden, pattern layout, HMC / lathe capex, margins, 6082 bar (4 Nov 2026)

This round is research only. It answers the weak inputs in the independent "fresh numbers" review (rpt3, 200k/yr, 5 yr,
EXW). It does not touch the engine or the rate book. Every proposal in §2 is a proposal: rates move only through
`scripts/rate-refresh.ts` / `scripts/uk-book.ts` with a dated config.

- **Data.** `data.json` holds 38 rows. Each row has:
  - the value, currency, year and unit;
  - what the figure includes;
  - the URL read, the date and an exact quote;
  - `evidence_grade`, `readMethod` and, where it is money, `gbp_at_book_fx`.
- **Grades.**
  - A = a published price, award or official statistic.
  - B = trade press, a government study or an analyst.
  - C = a vendor claim or a dealer asking price.
  - D = our inference.

  Where a figure is A but our *reading* of it is D (for example a mixed product class read as one machine), the row
  says so.
- **FX.** `gbp_at_book_fx` uses the library's 2026-10 display FX: EUR 1.1965, USD 1.3317, CNY 8.88, INR 127.2. Nothing
  is escalated, so read it as an order of magnitude, not a price.
- **How pages were read.**
  - Plain `curl` with no user-agent change, or the publishers' own public APIs with no key: Eurostat dissemination and
    Comext, HMRC uktradeinfo OData, USAspending, UK Contracts Finder REST and the TED Search API v3.
  - Quotes were text-searched in what came back. For API rows the "quote" is the returned values.
  - Blocked pages are listed in §4. None was bypassed.

## 1. Findings

### 1.1 Foundry burden and the market price of a casting (review issue 1, the largest £)

**Market price per kg: official unit values (A).** These are PRODCOM sold-production value ÷ quantity, 2024.

| Row | Product | Value | £/kg at book FX |
|---|---|---|---|
| P1 | Nodular-iron castings for land vehicles, EU-27 | €1.958/kg (2021–23: 1.71 / 2.02 / 2.02) | **£1.64** |
| P1 | Same, Germany / Czechia / Poland / Spain / Italy | €2.08 / 1.81 / 1.87 / 1.54 / 2.39 | £1.74 / 1.51 / 1.56 / 1.29 / 2.00 |
| P4 | Same, UK (2018, last year reported) | €2.755/kg | £2.30 (2018 money) |
| P2 | Ductile castings for machinery, EU-27 | €2.844/kg | £2.38 |
| P3 | Steel castings for land vehicles: CZ / FR / EU-27 | €3.34 / 2.30 / 7.48 | £2.79 / 1.92 / 6.25 |
| F1 | Castings plc (UK ductile, heavy truck): revenue ÷ t despatched, FY2026 | £4,140/t | £4.14, but **2/3 of the weight is sold machined** |

How to read these figures:

- They are averages over every size and complexity, and buyers' prices sit around them.
- A cored, MPI'd, safety-critical 9 kg ductile part should sit at or above the vehicle-castings average, not below it.
- The EU steel average is pulled up by German investment castings (€19/kg). Czechia is the best volume sand-cast anchor
  (€3.34/kg).

**Cost structure of the trade (A, Eurostat SBS 2023, % of turnover, row M1):**

| | Purchases | of which energy | Staff | Gross operating rate |
|---|---|---|---|---|
| Casting of iron (C24.51), EU-27 | 70.5 % | 8.4 % | 21.7 % | **7.8 %** (DE 7.6) |
| Casting of steel (C24.52), EU-27 | 69.5 % | 5.1 % | 23.5 % | **8.4 %** (DE 6.0) |
| Forging (C25.5), EU-27 | 73.0 % | 2.1 % | 18.8 % | **8.2 %** (DE 7.6) |
| Machining (C25.62), EU-27 | 60.0 % | 2.1 % | 27.3 % | **14.5 %** (DE 14.7) |

The gross operating rate is before depreciation, interest and tax.

**Consumption figures (B):**

- **Sand.**
  - New sand is 10–20 % of poured metal weight, or about 5 % of sand throughput (S2).
  - Regeneration is 98 % in a monosystem and 90–94 % with many cores (S2).
  - New sand €45/t, disposal €43/t, bentonite €228/t (S3, DE 2014).
- **Melting and ladle energy (BAT levels, E1).**
  - Iron induction melt + hold: 600–1,200 kWh/t liquid. Iron ladle preheat: 50–150 kWh/t.
  - Steel melting: 600–1,200 kWh/t liquid. Steel ladle preheat: **100–300 kWh/t**.
- **Plant electricity beyond melt.**
  - Dust extraction alone is about 20 kWh/t good casting (E2).
  - A US cupola ductile automotive plant used 720 kWh/t of electricity in all (E3, 2003). With the channel holding
    furnaces taken out, that leaves **about 0.45–0.5 kWh/kg** for sand plant, moulding, cleaning, air and services (our
    arithmetic, D).
  - Man-hours run from 3 to 200 per ton sold (E3).
- **Refractory.**
  - Induction melting: 8–9 kg/t molten (R1, 1994 data).
  - Cupola cost tables: refractory at €765/t (1994), worth €1–11/t of iron (R2).
  - **No current refractory price was found** (gap).

**Margins (A/B, rows F2, F3, M2–M5):**

| Company | Trade | Margin | SG&A |
|---|---|---|---|
| Castings plc (UK ductile) | Iron foundry + machining | Group operating margin 5.8 % (2.7 % FY25); foundry segment 3.3 % | Admin 11.5 % + distribution 1.5 % of revenue; gross margin 18.0 % |
| Nemak | Al casting | Operating margin 2.0 % (FY25); EBITDA 12.0 %; D&A 10.0 % | S&A 6.8 % |
| GF Casting Solutions | Light-alloy casting | Comparable EBIT 6.7 % (2024) | — |
| Bharat Forge, standalone (India) | Forging | EBITDA 27.5 % | — |
| Craftsman (India) | Machining | Segment EBIT: powertrain machining 16.6 %, aluminium 10.3 % | — |

Linamar was not readable (M6).

### 1.2 Pattern layout and sand-to-metal ratio (review issue on impressions)

- **DISA application manual (S4).** "Plate area covered by the pattern and the gating system should not exceed **60 %**
  of the total plate area."
  - The minimum sand between back-to-back cavities in the stack is **70 mm** (60 mm on the 2110) (S5).
  - Edge safety distances are machine-specific.
  - Grade: maker's manual, read from a third-party upload.
- **DISA MATCH article (S6).** Sand:iron **≥ 5:1** in iron foundries. Edge distances are about 61 / 80 mm for a 200 mm
  pattern height (supplier-proposed).
- **BREF (S1).** Sand:metal of 1:1–20:1 across all sand moulding.
- **What it says about the model.**
  - The stub axle's 9 impressions cover 84 % of the plate; the bracket's 20 cover 93 %. **Both exceed the 60 % rule,
    which already includes the gating.**
  - The reviewer's own 400 kg mould gives a sand:iron of about 3:1 at 9 impressions.

### 1.3 New HMC, 400–500 mm twin pallet (review issue 2)

**No new list price or award for a named 400 mm twin-pallet HMC was found.** The Haas EC-400 price page returned 403;
see §4. What the record gives:

| Row | What | Value | £ at book FX | Grade |
|---|---|---|---|---|
| H1 | Okuma MB-4000H, **2021, used**, dealer asking (sold) | US$249,990 | £187.7k | C, lower bound for new |
| H2 | Okuma MB-4000H, 2017, used | US$149,900 | £112.6k | C |
| H3 | US DLA award "Horizontal machining center" (size not stated), 2023 | US$467,682 | £351.2k | A value, D size |
| H4 | US DLA award Haas EC-1600 (large single-table HMC), 2024 | US$376,295 | £282.6k | A, wrong class |
| H6 | Neway CNC (CN) average selling price of its "horizontal CNC machines" class, 2023 | ¥440,900 | £49.7k | A average; mixes HMCs and horizontal lathes |

**What it says about the book.**

- `mach-hmc-400` is built on £185k "new", but a *four-year-old used* MB-4000H was asked at £188k.
- The book's capex is therefore at or below the used price of the machine whose timings (7.1 s pallet change, 2.2 s
  tool change) the cycle model uses.

### 1.4 New CNC turning centre (review issue 8)

| Row | What | Value | £ at book FX | Grade |
|---|---|---|---|---|
| T4 | UK awards: Mazak, UKRI 2024 / NPL 2020 / Aston "Quickturn" 2020 | £135,041 / £147,330 / £113,000 | same | A (UK £) |
| T4 | UK awards: Doosan via Mills CNC, Sheffield AMRC 2023 / 2018; Haas ST-15 2019 | £92,901 / £89,711 / £57,091 | same | A |
| T1 | US DLA: **3 × Okuma LB3000**, 2019 | US$950,000 → US$316,667 each | £237.8k each | A (not competed, options unknown) |
| T2 | US DLA: turning centre **with bar feeder**, 2023, 2 offers | US$219,379 | £164.7k | A, model unknown |
| T3 | US: Haas ST-30 2018 / ST-35 2023 / ST-35L 2021; Mazak QT350 2021 | US$101k / 130k / 193k / 250k | £75.9k / 97.6k / 145.3k / 187.6k | A |

- The book's `mach-lathe-cnc` capex (£56,004) is the Haas VF-2 mill scaled. It is below every production-lathe award
  found and close only to a Haas ST-15 toolroom lathe.
- **No price for a gantry loader was found** (gap).

### 1.5 6082-T6 bar (review issue 7)

**UK (A, HMRC, row A1).** Imports of CN 7604 29 10 (bars and rods of Al alloys) in 2025:

- from the EU: **£5.05/kg** (14,158 t);
- from outside the EU: £5.98/kg.

**EU (A, Comext, row A2).** 2025 trade values:

- intra-EU **€4.01/kg = £3.35/kg**;
- EU exports to GB €5.91/kg = £4.94/kg;
- EU imports from China **€4.01/kg CIF = ¥29.8/kg** at book FX, before EU anti-dumping duty.

**Caveats.**

- Every figure covers all alloys and sizes in the heading, including the dearer 2xxx and 7xxx.
- No 6082-specific contract price was found in the UK or China. A Chinese domestic ¥/kg was not found either.

## 2. Proposals: how each item enters the model, and the £ effect

The effects use the review's own figures:

- **Stub axle (PRCR002):** casting £12.92 at 9.084 kg, effective HMC 0.234 h a part.
- **Casting bracket:** casting £4.20 at £1.38/kg, so about 3.04 kg; HMC 0.113 h.
- O&M multiplier 1.21 (12 % overhead, 8 % margin).

A lathe rate change is applied through the reviewer's implied lathe sensitivity: £0.9 for +£12.21/h, so about £0.074
per £/h.

| # | Proposal | Replaces | Stub axle | Bracket | Basis |
|---|---|---|---|---|---|
| 1a | **Market £/kg reference beside the ex-foundry £/kg** on the report (review §3). Use PRODCOM 24511210 (EU / DE) for ductile and 24521010 (CZ, EU ceiling) for steel, labelled "official unit value, average of all castings in the class". | nothing (new reference line) | reference £14.9 (EU) – £15.8 (DE) against £12.92, so the model is **13–18 % below the class average** | reference £5.8 (FR) – £8.5 (CZ) against £4.20 | P1, P3 (A) |
| 1b | **Foundry burden lines as rules**, each sourced:<br>• new sand + disposal at 10–20 % of poured weight × (€45 + €43)/t;<br>• plant electricity beyond melt 0.45–0.5 kWh/kg good;<br>• ladle preheat 50–150 kWh/t iron (100–300 for steel);<br>• refractory 8–9 kg/t molten (price open). | the missing burden in `casting.ts` rules / `casting-melt.ts` | sand £0.11–0.22; electricity 0.45–0.5 kWh/kg × 9.08 kg × £0.182 = £0.74–0.83; ladle preheat (if electric) £0.14–0.41; refractory ≈ £0.09 at 1994 price. **Total ≈ +£1.1–1.5 before O&M, +£1.3–1.8 after.** | sand £0.04–0.09 (steel poured ≈ 5.95 kg); electricity £0.25–0.28; ladle £0.11–0.33; refractory £0.04. **≈ +£0.5–0.8 after O&M.** | S2, S3, E1, E2, E3, R1 (B; E3 split is D) |
| 1c | **Overhead / margin by trade.** Keep the foundry margin at or below 8 %: published foundry EBIT is 2–7 % and the EU iron GOR 7.8 % is before depreciation. **Do not raise the margin.** Indirect works cost (lab, maintenance, sand-plant crew, quality) belongs in the conversion as named rules, not in a bigger %. SG&A of 7–13 % of sales (Castings plc 13.0 %, Nemak 6.8 %) supports the 12 % overhead. | `regionalShopDefaults` overhead / margin, unchanged | 0 from margin. The reviewer's 1.21 → 1.35 (+£1.5 on the casting, about +£2.7 on the part) is **not supported by the published margins**. | 0 (reviewer +£0.8 not supported) | F2, F3, M1–M3 (A) |
| 2 | **Impressions = min(60 % plate rule incl. gating, sand:iron ≥ 5:1, 70 mm between cavities in the stack)**, replacing the free-fit count | the moulding-line impressions rule (casting rules) | 9 → about 5 (the 5:1 rule with a 400 kg mould binds before the 6 that area allows). Moulding £0.10 → £0.18: **+£0.08, +£0.10 after O&M**, plus a defensible method card. | 20 → 12 (area rule): moulding £0.04 → £0.07, **+£0.03** | S4, S5, S6 (B/C) |
| 3 | **`mach-hmc-400` capex: £185k → £300k ESTIMATE** (floor = H1 used 2021 at £188k; H3 award £351k). Life, %s and hours unchanged. Rate £10.87 → **£15.11/h** (£350k → £16.95; £400k → £18.79). | `mach-hmc-400` capex | +£4.24/h × 0.234 h × 1.21 = **+£1.20** (£350k: +£1.72; £400k: +£2.24) | +£4.24 × 0.113 × 1.21 = **+£0.58** (£350k: +£0.83) | H1, H3 (C / A-value); the central value is D |
| 4 | **`mach-lathe-cnc` capex: £56k → £135k** (UKRI Mazak award 2024, UK £, A). Rate £7.79 → **£12.15/h** at the book's 4,000 h × 0.8. A production lathe with a loader at 200k/yr runs three shifts: at 6,000 × 0.8 the same capex gives £8.10/h. Choose hours and capex together. With a bar feeder or loader: £165k (T2) → £13.81/h. | `mach-lathe-cnc` capex (and hours) | +£4.36/h × 0.074 = **+£0.32** at 4,000 h; **+£0.02** at 6,000 h; +£0.44 with a loader at 4,000 h | 0 (no lathe op) | T4 (A), T2 (A) |
| 5 | **Margin and SG&A by trade, as data.** Foundry 3–7 % EBIT; forging about 8 % GOR in the EU; machining 14.5 % GOR in the EU. Indian EBITDA (Bharat Forge 27.5 %, Craftsman 16.6 %) is not transferable to a UK book. | `regionalShopDefaults` margin per commodity (future) | 0 now; the data does not support a higher foundry margin | 0 | M1–M5 |
| 6 | **6082 bar UK £3.49 → about £4.0–5.0/kg**, labelled "UK import unit value, all Al-alloy bar, 2025". China ¥30.99 stays: the CIF China→EU value is ¥29.8 and **does not support ¥25–27**. | library 6082 bar entries (UK, CN) | 0 (not in these parts) | 0 | A1, A2 (A) |

**Net, stub axle UK.**

- Items 1b + 2 + 3 (£300k) + 4 (4,000 h): about **+£2.6 to +£3.5**, which takes £23.51 to about £26.1–27.0. The low end uses the 6,000 h lathe.
- That is inside the reviewer's £24–29 and near the class-average casting price (1a).
- At HMC £350k it is about +£3.1 to +£4.0.
- These are before the machining-cycle corrections (review issue 5), which pull the other way by up to about −£2.5.

**Net, bracket UK.**

- Items 1b + 2 + 3 (£300k): about **+£1.1 to +£1.4**, from £8.74 to about £9.9–10.2.
- That is the bottom of the reviewer's £10–12.5.
- The steel-specific items the review lists are still uncosted, because none was sourced this round: riser cut-off,
  weld repair, steel refractory, and the charge price (£0.148/kg).

## 3. Gaps, and what only a supplier quote settles

1. **Ex-foundry £/kg for these two parts.** The PRODCOM averages bound the price, but only a quote prices a 9 kg cored
   EN-GJS-500-7 at 200k/yr or a 3 kg GS-C25 bracket.
2. **New price of a 400 mm twin-pallet HMC** (Okuma, DMG MORI, Mazak, Makino or Haas EC-400). Nothing was found:
   - Haas's price page is 403.
   - TED full-text found only an RWTH Aachen 2021 "horizontal-spindle machining centre" (€233,290, size unread) and
     Romanian defence buys.
   - Japanese press releases carry no price.
   - A dealer quote is needed. Until then, £300k is an estimate between the used floor (£188k) and the unsized award
     (£351k).
3. **The gantry loader's or bar feeder's own price.** It is only bundled in T2.
4. **Chinese domestic HMC-400 and lathe prices.** Neway's class average (¥441k) mixes lathes and HMCs, so read its
   annual report's segment notes or get a quote. The China book keeps the HMC at UK par (£185k), which is the routing
   artefact the review flags.
5. **Current refractory prices** (silica ramming mass, ladle castables), the **metallurgical lab** cost per melt and the
   **pouring / sand-plant crew** per line. None was published. These need the foundry's cost centre or method card.
6. **Steel-foundry extras:** riser cut-off time, weld-repair rate and steel refractory wear. Unsourced; ask the steel
   foundry.
7. **A 6082 contract price** (billet + conversion) in the UK and China, and the swarf price. The trade averages mix
   alloys.
8. **UK cost structure by SIC (ONS ABS).** Not read this round. Eurostat SBS stops at the EU; the UK left after 2019.
9. **Linamar Mobility margin.** Its PDFs returned 404.
10. **The delivered foundry charge** (pig iron, prepared scrap) was not researched in this round.

## 4. Search record (blocked or empty)

- **Blocked (HTTP 403) to plain requests, not bypassed:**
  - haascnc.com (EC-400 and ST-30 price pages; WebFetch too);
  - marketscreener (DMG MORI NHX release);
  - machinio;
  - cromwell.co.uk (row A3 is kept as "blocked, do not use").
- **Linamar PDFs:** HTTP 404.
- **Eurostat PRODCOM** is served only through the Comext API (DS-059358). The main API's DS-056120 / DS-059358 return 404.
- **USAspending** keyword search for MB-4000H, NHX 4000, HCN-4000, a51nx and MA-4000H returned 0. The HMC rows came
  from PSC 3408 / 3416 and the plain keyword "horizontal machining center".
- **UK Contracts Finder** had no HMC award in the 400 mm class. Its lathe awards are T4.
- **TED full text** ("horizontal machining centre", "Horizontal-Bearbeitungszentrum", "poziome centrum obróbcze",
  "centro di lavoro orizzontale") gave no 400 mm twin-pallet award with a readable scope.
- **Chinese public-procurement searches** (卧式加工中心 中标 单价; 数控车床 中标) returned only resale and patent pages.
