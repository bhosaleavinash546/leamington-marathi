# Per-vehicle software royalties and IP licences — research 14 Oct 2026

23 records in `royalties.json`. I used 32 web searches and tried WebFetch twice; both fetches failed with DNS errors
(avanci.com, sec.gov). So every record is `access: "search-snippet"`: the quotes are the search engine's rendering of
the named page, and nothing here comes from an opened page. Re-open the primary URLs before a figure is relied on.

## Found (primary sources, High)
- **Avanci (cellular SEPs; this is a patent licence, not software):** 5G US$32/vehicle (US$29 early adopter);
  4G US$20/vehicle (US$15 for licences signed before 1 Sep 2022); 3G US$9; eCall only US$3. Each is paid once for the
  life of the vehicle.
- **Cerence PPU:** FY2025 (to 30 Sep 2025) TTM US$5.05, up from US$4.50. This confirms the tool's figure. The latest
  figure is Q2 FY2026 TTM US$5.09. Q3 FY2026's PPU did not come back in the snippets, and FY2026 has not been reported
  yet. PPU includes the connected-services subscription and is not revenue at the time of shipment.
- **QNX (BlackBerry FY2026, to 28 Feb 2026):** revenue US$268.0M (+14%). Royalty backlog about US$950M (FY2025: about
  US$865M). The licence is per-unit royalty, and QNX is in 275M+ vehicles (cumulative). There is **no per-vehicle QNX
  royalty in dollars.**
- **TomTom FY2025:** Automotive operational revenue €322M; backlog €2.4bn. TomTom discloses no vehicle count.
- **Qt Group 2025:** distribution licence sales €56.8M (+26.4%) across all industries. Device counts are not disclosed.
- **Bluetooth SIG:** the patent licence is royalty-free, so there is **no per-unit fee**. The product qualification fee
  is US$12,000 per design (Adopter, from 1 Mar 2026).
- **Toyota US (CONSUMER retail):** Drive Connect is part of the Go Anywhere plan at US$15/month.

## Found (secondary or dated: Medium or Low)
- HERE: €4.4bn backlog going into CES 2025; 53M+ vehicles use its ADAS maps. Revenue is not disclosed.
- Which? (2018, UK consumer): map updates run from free to £164 per upgrade.
- BMW UK (consumer): £79 map update package (2023 press); £69 per year (forum).
- Mercedes US: three years of updates "valued at nearly $750". This is a marketing valuation.
- Via LA AVC: US$0.20 per unit (US$0.10 above 5M units), cap US$9.75M a year for 2017–2025. The 2026 device terms are
  not confirmed.
- HEVC Advance: the programme states that a vehicle is not itself an "individual item". The royalty attaches to the
  device. No vehicle rate was found.

## NOT FOUND
- Google Automotive Services / Android Automotive fee. Reported only as "a licensing fee on top of Android Automotive"
  (Counterpoint). One unsourced blog gives "$10–$20". **The tool's "~$25 per vehicle" for GAS or QNX has no source.**
- AUTOSAR BSW (Vector, EB, ETAS) per-ECU royalty. Elektrobit sells "upfront" or "volume-based" pricing and publishes
  no figure. Elektrobit's own revenue is not broken out by Continental or Aumovio.
- Qt enterprise per-developer and per-device prices. Only the small-business price (€1,090/yr, which does not apply
  here) and a tier structure are published. **The tool's "Qt ~£90k/yr" has no source.**
- A per-vehicle map data price from HERE or TomTom. **The tool's "£8–15 per vehicle per year" has no source.** The
  consumer retail prices above are what drivers pay. They are not the OEM's cost.
- Dolby or DTS per-vehicle royalty. Dolby uses a per-unit model and does not break out automotive.
- A current Mercedes or BMW map subscription price from the official stores.

## Conflicts
- Avanci 4G: US$15 (2017 launch, and still paid by licensees signed before Sep 2022) vs US$20 (current).
- Avanci 5G early-rate cutoff: 2023 press said early 2024; the current page ties it to the first 5G vehicle sale.
- Cerence PPU: US$5.05 (FY2025) vs US$5.09 (Q2 FY2026 TTM). Both are correct for their own periods.

## Derivations
None were made. Dividing QNX's revenue by its installed base would NOT give a per-vehicle royalty, because one is a
year's revenue and the other is a cumulative fleet. TomTom and Qt disclose no unit counts, so nothing per-unit can be
derived from their figures.
