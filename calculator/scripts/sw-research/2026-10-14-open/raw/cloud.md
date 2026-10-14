# Connected-vehicle cloud cost & connected-service life — research 14 Oct 2026

32 records in `cloud.json`. 32 WebSearch calls + 1 Microsoft Learn docs search. WebFetch tried once (aws.amazon.com → DNS
failure). Almost everything was read from search-result snippets (`access: search-snippet`). Only the Azure capacity table
was read from an opened page.

## Found (sourced figures)

**Public cloud list prices**
- **AWS IoT FleetWise** (official page, US East worked example): USD 0.60 per active vehicle per month for the first 10,000
  vehicles, USD 0.45 for the next 40,000. Messages cost USD 1.75 per million (first 1 bn) and USD 1.60 per million (next
  125 m). The example assumes 22,500 messages per car per month. Storage (S3 / Timestream) is billed separately.
  **FleetWise closed to new customers on 30 Apr 2026** (AWS developer guide). Treat it as a reference price only; a new
  programme cannot buy it.
- **AWS IoT Core** (AWS News Blog, dated): USD 0.08 per million connection-minutes; messaging from USD 1.00 down to USD 0.70
  per million (5 KB metering); rules USD 0.15 + 0.15 per million; shadow / registry USD 1.25 per million. I did not read
  the live price page. AWS China: CNY 0.72 / M connection-minutes, CNY 8.97 / M messages.
- **Azure IoT Hub**: capacity only (Microsoft Learn): S1 400k msgs/day/unit, S2 6 M, S3 300 M, 4 KB meter. **USD price per
  unit: NOT FOUND** from an official source. The page rendered "$-". Azure China: S1 CNY 254.40 per unit-month, S2 2,544,
  S3 25,440 (tax incl.).
- **Google**: Cloud IoT Core was retired on 16 Aug 2023. Google has no first-party equivalent price.

**OEM / analyst cost per vehicle**
- The only backend statement found: WirelessCar on AWS (>10 M vehicles) has a "single digit and lower cost per car per
  year". No currency or exact figure is given, and the source is vendor-published.
- **NOT FOUND:** any OEM disclosure (GM, Stellantis, VW/CARIAD, Ford, Toyota, BMW) of cloud cost per vehicle. **NOT FOUND:**
  wholesale OEM cellular / eSIM cost per vehicle.
- Adjacent figures, none of which is the OEM's cost:
  - GM CFO: about 70% gross margin on OnStar / Super Cruise (secondary report).
  - OEM-bundled connectivity sold to fleets: about EUR 2–20 per month (flespi, vendor blog).
  - Consumer retail data plans: BMW EUR 10 per month unlimited; Tesla Premium USD 9.99 per month / USD 99 per year;
    Chevrolet 2016 USD 10 per GB.
  - McKinsey 2030 revenue potential: USD 130–210 per vehicle per year. This is value, not cost.

**Data volumes (CONFLICT)**
- Berg Insight (via trade press, Jul 2026): average connected car about 6.2 GB in 2025, rising to 10.1 GB in 2030. A second
  write-up says 6.5 GB. The snippet does not state the period; "consumed … in 2025" reads as per year.
- IoT For All (vendor): European vehicles 4–5 GB **per month**, Chinese EVs more than 30 GB per month. This conflicts with
  Berg by about 10×.
- Cisco: one Japanese OEM's telemetry is about 10–15 MB per report, uploaded monthly. This is telemetry only.
- McKinsey's "25 GB per hour" is data generated on board, not transmitted. Do not use it.

**Connected-service duration**
| OEM | Basic / safety service term | Source confidence |
|---|---|---|
| GM (2025 MY+) | OnStar Basics 8 years (incl. Automatic Crash Response) | High |
| Tesla (bought ≥ 20 Jul 2022) | Standard Connectivity 8 years | High |
| Toyota (select 2023 MY+) | Safety / Service Connect trial "up to 10 years", 4G-dependent | High |
| VW Canada | Safe & Secure 8 years (most 2022+); Remote Access 4 years (3 years from 2026 MY) | Medium (table hard to read) |
| Mercedes US | mbrace Connect 5 years | High |
| Mercedes EU | emergency call free for the vehicle's entire life cycle | High |
| Hyundai | Bluelink 3 years (≤ 2023); Bluelink+ "non-trial" from 2024 | Medium |
| Kia 2025 K5 | 1 year | Medium |
| BMW (AU, 2014) | eCall / teleservices lifetime; ConnectedDrive 3 years | Low (dated) |
| Ford | varies by VIN; no term found | — |

**Regulation and network sunsets**
- Reg. (EU) 2015/758 recital 14: 112-eCall is to be "accessible free of charge to all consumers", and all vehicles are to
  be fitted with it.
- **An explicit "vehicle lifetime" operating obligation in the regulation text: NOT FOUND.**
- Del. Reg. (EU) 2024/1180: operators plan a 2G/3G phase-out "between 2025 and 2030 in all Member States".
- NG-eCall (4G/5G) dates: mandatory for new types from 1 Jan 2026 and for all new M1/N1 vehicles from 1 Jan 2027 (Council
  doc ST-7055-2024). One secondary source says 2026 for all vehicles; that conflicts with the Council document.
- US: AT&T 3G off on 22 Feb 2022 (about 100 models from 12 OEMs lost features, incl. crash notification). Verizon 3G off
  by 31 Dec 2022.
- UK: no 2G / 3G after 2033.

## Suggested default — DERIVATION, not a sourced figure
1. **Service life.** The most common current commitment for basic connected / safety services is **8 years** (GM, Tesla,
   VW Canada Safe & Secure). Toyota offers up to 10 years but conditions it on the 4G network. Mercedes EU keeps eCall for
   life, but eCall is a 112 call to the PSAP and costs the OEM cellular registration, not backend cloud. Today's tool uses
   10 years past the last build year. That sits at the top of the evidence, so 8 years has the stronger support. Any term
   beyond the sunset of the TCU's radio generation is at risk (US 3G 2022, EU 2G/3G 2025–2030).
2. **Cloud £ per vehicle-year.** No OEM figure exists. A list-price floor for the device-ingest layer can be derived from
   FleetWise:
   - Vehicle fee: 12 × USD 0.45–0.60 = USD 5.40–7.20 per vehicle-year.
   - Messages: 22,500 × 12 = 270,000 per year; × USD 1.60–1.75 per million = USD 0.43–0.47 per year.
   - Total: about **USD 5.8–7.7 per vehicle-year**.
   - This excludes storage, analytics, OEM application back-ends, operations staff and cellular data.
   - WirelessCar's "single digit and lower" per car-year (currency unstated) is the same order.
   - Converting to £ needs the tool's own FX.

   Cellular data is a separate stream. Its wholesale cost was **not found**, and its volume is in conflict (about 6 GB per
   year vs 4–5 GB per month). The current £10.8 per vehicle-year is therefore neither confirmed nor contradicted. It should
   stay labelled as an unsourced estimate (Low grade), with the FleetWise-derived ingest floor shown as the only priced
   anchor.
