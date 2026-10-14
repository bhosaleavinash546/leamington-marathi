# Duration & effort research (14 Oct 2026)

Records: `duration-effort.json` (32 records). 27 web searches were used. All 3 WebFetch attempts failed with DNS
errors (mckinsey.com, apps.dtic.mil, softwarecost.org), so every record is `access: "search-snippet"`. The `quote` in each
record is what the search tool returned for that result, not text read on the page. Nothing below is High confidence.

## A. Vehicle and software development duration

**Found**
- **Legacy / Western OEMs:** about 4–5 years (48–60 months).
  - VW took 54 months. It targeted 36 months (Grünitz, IAA 2023), then 30–36 months (Automobilwoche via Motor1). The
    "previously usually five years" figure comes from dpa.
  - GM's Hummer EV chief engineer said a vehicle programme "normally takes around four years".
  - Bloomberg (via Carscoops, Sep 2026) gives 3–5 years for Western automakers.
  - A Longbridge summary of McKinsey (Aug 2025) gives "four to five years traditionally".
- **Chinese OEMs:**
  - About 24 months (McKinsey 2025 via Longbridge; Bloomberg 2026).
  - Reuters gives about 18 months for an all-new or redesigned model. That is a leading-programme figure.
  - IAT and CAAM say AI could bring the benchmark to about 18 months.
  - AlixPartners: the average model on sale is 1.6 years old for Chinese brands and 5.4 years for foreign brands.
- **Fast US programmes:** the GMC Hummer EV took 26 months (CNBC 2022), or 20 months (GM Authority citing Business
  Insider, Jun 2026). These two figures CONFLICT.
- **Software's effect on the timeline:**
  - The decoupling lever saves 3–10 months. This comes from a blog citing McKinsey (Low) and is not confirmed in
    McKinsey's own text.
  - KPIT (vendor, in an S&P Global interview) says a "typical 30-month SOP cycle" could become 18–20 months.
  - McKinsey's E/E architecture article says software releases should be decoupled from SOP dates. It gives no number.
  - Software sat on the critical path for the Porsche Macan EV: its SOP moved to 2024 because of CARIAD E3 1.2, according
    to the Porsche prospectus. The further slip is reported as 16–18 months (TechCrunch, InsideEVs) or 16–18 weeks
    (Electrek). This CONFLICT is unresolved.

**NOT FOUND**
- A primary OEM statement (investor day or annual report) giving concept-to-SOP in months.
- A 2020–2026 Toyota figure. Only the 2001 Crown figure (24 → 13 months) was found; it is out of the window.
- Months for VW SSP and GM Ultium.
- The software share of the vehicle timeline.
- How many months before SOP software development starts.
- The full McKinsey text: the 45 / 53-month figures are not verified.

**Derivation (not a sourced figure).** The tool assumes 90 months from feasibility to SOP. The longest sourced
concept-to-SOP figure is 60 months ("five years", VW). 90 ÷ 60 = 1.5×, and 90 ÷ 48 = 1.875×. No source supports 90
months as a vehicle programme. A 90-month window could only be defended as a software-platform lifetime spanning more
than one vehicle, and no source here states that either.

## B. Effort and size benchmarks

**Found**
- **Lines of code:**
  - About 100 M LOC in a premium car on 70–100 ECUs. This is Broy's expert estimate in IEEE Spectrum (Charette, 2009),
    not a measurement.
  - Ford says the F-150 has about 150 M LOC (CES 2016 claim, via a blog, Low).
  - The Ford 10-speed transmission has "just over a million lines of code" (Eureka). This is the only per-ECU figure
    found.
  - IHS (2016) puts simple controllers in the thousands of LOC and ADAS / head units in the millions.
- **Productivity:** every figure found is Low confidence.
  - Real-time embedded: 40–60 LOC per month (unsourced slide).
  - Systems programs: 150–400 LOC/PM (lecture).
  - Capers Jones: below 25 FP per staff-month (unclear context).
  - COCOMO 81 embedded mode: a = 3.6, b = 1.20.
  - COCOMO II is calibrated on 161 projects with A = 2.94 (Medium). This confirms the constant the tool already uses.
  - QSM: the Real Time group has the LOWEST productivity of its groups (qualitative only; 1,115 projects, 2008–2012).
- **Headcounts:**
  - CARIAD has 5,900 staff, with about 1,600 cuts (Handelsblatt via AllThingsTalent, Mar 2025). This CONFLICTS with
    Revelio's estimate of 7,788 for 2024.
  - RV Tech has more than 1,500 people (Nov 2025).
  - Mercedes targeted 10,000 software engineers and was 600 short (Apr 2022).
  - GM planned about 3,000 hires (CNBC), or 3,300 (Wards).
  - Xiaomi's smart-driving team is above 1,000, heading for 1,500 (Mar 2024).

**NOT FOUND**
- SRDR / AFCAA ESLOC-per-PM figures for Vehicle Control or Real Time Embedded. The tables exist in Clark & Madachy
  (2015), *Software Cost Estimation Metrics Manual for Defense Systems* (softwarecost.org; DTIC ADA608488), but the PDF
  could not be opened.
- An ISBSG embedded or automotive median PDR.
- QSM Real Time SLOC/PM values.
- Reifer's figures by domain.
- LOC for an ADAS, infotainment or BMS ECU.
- Person-years for a named automotive software module.
- CARIAD's segment headcount in the VW Annual Report 2024.

**Use in the model:** none of the headcounts converts to person-months per module without assumptions, so none is
derived here. The catalogue's person-months per module remain unsourced. The best next step is to read the Clark &
Madachy manual's Vehicle Control and RTE tables from a network that resolves softwarecost.org or apps.dtic.mil.
