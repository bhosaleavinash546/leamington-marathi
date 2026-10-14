# Post-SOP / post-EOP software sustaining and cybersecurity: research notes (14 Oct 2026)

Records: `cyber-tail.json` (31 records). I used 34 web searches. WebFetch failed twice with DNS errors (unece.org,
eur-lex.europa.eu), so **every record comes from search snippets** (`access: search-snippet`). The search tool
returns summarised snippets. Where the regulation wording is the tool's paraphrase, the record says so.

## Found

### Regulation: what lasts after EOP (no fixed number of years anywhere)
- **UN R155 (CSMS)**:
  - Definition 2.7: the post-production phase runs "until the end-of-life of all vehicles under the vehicle type"
    (EUR-Lex OJ L 2025/5).
  - 7.2.2.1: the CSMS must cover the development, production and post-production phases.
  - 7.2.2.2(g) / 7.2.2.4: the manufacturer must monitor for, detect and respond to attacks. Monitoring is continual
    and includes vehicles after first registration. This is the tool's paraphrase of the EUR-Lex text.
  - Reporting to the approval authority is at least once a year. Only a secondary paraphrase of 7.4.1 was found.
  - **The obligation lasts as long as the vehicle type's fleet lasts.**
- **UN R156 (SUMS)**:
  - Updates must be possible "at any point of time during the lifetime of the vehicles" (UNECE presentation
    GRE-85-36).
  - Records must be kept per update, for type approval, CoP, market surveillance, recalls and PTI.
  - The SUMS certificate is valid for a maximum of 3 years.
  - A working-group proposal (GRVA) treats production as not "definitively discontinued" while update extensions are
    sought.
  - No retention period in years was found.
- **ISO/SAE 21434**: secondary summaries only, because the standard is paywalled.
  - Clause 8: vulnerability management runs "until end of cybersecurity support".
  - Clause 14: end of support and decommissioning. The organisation sets the date and communicates it.
- **EU CRA (Regulation (EU) 2024/2847)**:
  - Art 2(2)(c) excludes vehicles type-approved under 2019/2144. Aftermarket devices and chargers stay in scope.
  - Art 13(8): a support period of at least 5 years. This is recorded as an **adjacent** benchmark only. It does not
    apply to type-approved vehicles.
- **China GB 44495-2024**:
  - Applies from 1 Jan 2026.
  - The CSMS must cover the vehicle lifecycle (TÜV SÜD).
  - The standard's own post-production definition and any response deadline were **NOT FOUND**, because the text is
    paid.

### OEM support commitments
- **VW / CARIAD (Mar 2023, secondhand via PCWelt / Slashdot from Ars Technica)**:
  - Up to 15 years after EOP for hardware support.
  - Up to 10 years after EOP for software releases.
  - Cyber and safety patches "for as long as a function is available".
  - The CARIAD CEO defined "lifetime" as 15 years.
- **Rivian (The Drive)**: feature updates for about 7–10 years. Safety and security "would go beyond those 7 to 10
  years".
- **Tesla, GM, Volvo, Polestar, BMW, Mercedes, Stellantis**: NOT FOUND.

### Costs
- **R155 retrofit (S&P Global Mobility, 2024)**: "can easily exceed $1 million" per existing model, even for an
  A-segment car. This is a one-off engineering cost, not a running cost.
- **OTA and recalls (ABI Research, May 2023)**:
  - In-person software updates cost OEMs $500M a year (US).
  - OTA recall fixes will save $1.5B a year by 2028.
- **Connected-vehicle data (Guidehouse via the IIoT World blog, Low confidence)**:
  - More than $1B a year for a 10M-vehicle fleet.
  - About 500 MB per vehicle per IVI update.
- **Fleet VSOC data transmission (Automotive IQ, Low confidence)**: about US$2.1M a month. The fleet size is not given.
- **Enterprise IT SOC (adjacent, vendor marketing)**:
  - About $2.86M a year (Ponemon).
  - $2–7M a year (Arctic Wolf).
  - A 24/7 seat needs 4.2–5 FTE.
  - These figures are **not** for a vehicle SOC.

### Maintenance %
- No named automotive or embedded study gives an **annual** maintenance percentage of development cost.
- Lifecycle shares were found:
  - 60–90% of development cost (Tietoevry automotive whitepaper, citing other industries).
  - 65–80% of TCO for embedded software (Baytech blog).
  - 49% maintenance against 43% development effort (Boehm 1981, secondhand).
- A generic, unsourced "15–25% of initial development a year" (Edana) is recorded as Low confidence. It is not
  automotive.

## Not found
- VSOC price per vehicle (per month or per year) from any vendor (Upstream, VicOne, Argus, C2A, Cybellum, Karamba,
  ESCRYPT), filing or analyst.
  - Upstream: "close to four million connected vehicles from six OEMs" (2021) and $105M raised. Neither is a price.
- R155 compliance cost per vehicle from McKinsey, Deloitte, KPMG or Roland Berger.
- OTA campaign cost per vehicle from Excelfore, Harman, Sibros or Airbiquity.
- A statutory period for spare-parts or service support after EOP. The EU "10 years" and China "10 years" claims are
  unsourced forum or FAQ statements. One of them traces to ChatGPT output.
- Verbatim text of R155 7.2.2.2(h) ("reasonable timeframe") and 7.4.1.
- The ISO/SAE 21434 RQ-14-xx wording.
- The GB 44495 post-production clauses.

## Conflicts
- **OTA data cost**: Guidehouse implies about $100 per vehicle a year, but an executive's hypothetical "a dollar per
  year per car" is two orders of magnitude lower. The Guidehouse figure covers all data transmission, not OTA only.
- **Maintenance share**: generic lifecycle shares range from 49% to 90%. They are not comparable with an annual
  percentage.
- **Upstream total funding**: the company stated $105M in 2021. An aggregator states $139M (2025, unaudited).

## Suggested derivation (NOT sourced; for the modeller to judge)
- **Guidehouse**: $1,000,000,000 ÷ 10,000,000 vehicles = **≥ $100 per vehicle per year** for all connected-vehicle data.
  This is a lower bound from "over $1 Billion". It is not OTA alone and is not a published figure.
- **Post-EOP tail duration**: the regulation ties the R155/R156 duty to the end-of-life of the last vehicle of the
  type, with no fixed number of years. The only OEM figures are VW's (10 years software / 15 years hardware after EOP;
  security "as long as a function is available") and Rivian's (security beyond 7–10 years). A model input of
  "years of post-EOP security support" would be a stated assumption anchored on these, not a regulatory number.
- **VSOC running cost**: there is no sourced vehicle-specific figure. An enterprise SOC cost ($2–7M a year) could
  only be used as a labelled analogue, for example spread over a fleet size the user types. Label it ESTIMATE.
