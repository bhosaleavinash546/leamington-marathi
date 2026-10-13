# Automotive software should-cost — costing-manager review (14 Oct 2026)

**Reviewer stance.** Senior Manager, Automotive Software Costing: 15 years in OEM purchasing and cost engineering of ECU
and vehicle software, supplier-quote negotiation, make-v-buy and SDV programmes.

**Scope.** The engine and its outputs:
- `src/engine/sw-should-cost.ts`, `sw-rate-library.ts`, `sw-schedule.ts`, `sw-validation.ts`, `sw-benchmarks.ts`;
- the default programme: UK hub, 80k vehicles a year × 10 years, OEM in-house, 43 modules.

**Data.** Sourced figures are in `costing-data.json`, next to this file. Line numbers are as read on 13 Oct 2026, 22:30.
`sw-should-cost.ts` was being edited by another session at the time, so allow a few lines of drift.

## 0. Where the money is (default programme, as run)

| Bucket | £M | Share |
|---|---|---|
| Development | 17.6 | 8 % |
| Testing + integration + cyber + calibration | 12.8 | 6 % |
| Toolchain (tool licences) | 13.6 | 6 % |
| **NRE total** | **44.0** | **21 %** |
| Licences and royalties | 93.7 | 44 % |
| — navigation map data (£11.50 / vehicle in service / yr) | 50.6 | 24 % |
| — IVI "AAOS licence" ($25 / vehicle built) | 15.1 | 7 % |
| — voice ASR (£15 / vehicle built) | 12.0 | 6 % |
| Cloud | 51.8 | 24 % |
| Maintenance (13.3 % a year of development, weighted) | 23.3 | 11 % |
| **Programme** | **212.8** | 100 % (per vehicle: £266) |

**Correction to the brief.** Cloud is **£51.8M**, not ≈ £100M. It reaches £98.9M only at a 14-year life. The ~79 %
lifecycle share is right, but **licences and royalties are the largest lifecycle item, not cloud**. A single
unsourced map-data figure is a quarter of the programme.

Development effort is 2,391 PM (4,135 PM all-in). That is an **average team of 45.9 FTE** over 90 months, for the full
software stack of a premium SUV, including L2+ ADAS and the IVI.

## 1. Top 15 methodology errors, gaps and credibility risks

Severity scale:
- **C** — critical: it changes the decision or the headline by more than 30 %;
- **H** — high;
- **M** — medium.

### 1. The loaded engineer rate is an employment cost, not a cost to the business (C)
**Where.**
- `sw-should-cost.ts:1115`: `regionRate = engineerRate × devSource × overhead`.
- `SW_DEFAULT_OVERHEAD = 1.15` at `:1800`.
- The hub rate is salary plus *statutory* on-cost only (rates doc).

**Input → output.** The UK default gives £6,384 / PM × 1.15 = **£7,342 / PM, which is £48 an hour**. That is
1.31 × salary, and it includes overhead.

**Evidence.**
- MIT (Hadzima) puts employment cost alone at 1.25–1.4 × salary.
- NN/g puts the fully loaded cost at "at least 2 ×".
- The UK embedded-software contract median is **£600 / day ≈ £75 / h** (IT Jobs Watch, Jan 2026).
- A G-Cloud engineer grade is £110 / h.

So both the in-house and the bought rate are about 40–60 % low. This is the main reason NRE is only 21 % of the
programme.

**Fix.**
- Split the rate into three layers: employment cost (the book), **company engineering burden** (pension top-up,
  benefits, bonus, site, IT, management, training and non-billable time) and capital charge.
- Show £ / h and £ / day beside £ / PM.
- Default the burden from a sourced range (1.25–1.4 employment, plus overhead), and label it as an assumption.
- Never let 1.15 sit unlabelled as "facilities".

### 2. The Tier-1 factor ×0.88 prices a supplier below its own wage bill (C)
**Where.** `sw-rate-library.ts:82`, `Tier1_Supplier: 0.88` ("typical 10–15 % delta", 2025-01, no source). It is applied
to the same hub cost rate at `sw-should-cost.ts:1115`.

**Input → output.** Tier-1 in the UK = £6,384 × 0.88 × 1.15 = **£6,461 / PM (£42.5 / h)**. The devSource table shows
Tier-1 at £206.4M, *cheaper* than in-house (£212.8M).

**Why it is wrong.** A supplier quote is a **sell rate**:

> cost × (1 + SG&A) ÷ (1 − EBIT margin)

and it usually comes from a blended onsite / offshore pyramid. Sourced margins for the mark-up:

| Supplier | Margin |
|---|---|
| KPIT | EBITDA 21.0 % (FY25) |
| Tata Elxsi | PBT 26.3 % |
| LTTS | EBIT 14.9 % |
| ALTEN | operating margin on activity 8.5 % (2025) |
| Bertrandt | adjusted EBIT ≈ €-2M on €978M |

A Tier-1 is cheaper only through a cheaper **hub mix** or **reuse**, never through a factor below 1 on the same hub.

**Fix.**
- Replace `devSourceMultipliers` with a supplier model: hub mix (onsite % / offshore hub), sell-rate mark-up chosen
  from a sourced margin range, and OEM retained effort (supplier management, integration, homologation, typically
  stated as a %).
- Keep "efficiency" as a separate, labelled reuse lever.

### 3. The effort catalogue is unsourced and an order of magnitude light for an in-house full stack (C)
**Where.**
- `basePersonMonths` on all 54 modules (e.g. `camera_perception: 130` at `:553`).
- The schedule's average team (`sw-schedule.ts`).

**Input → output.**
- **Camera perception: 304 PM all-in, about 13 FTE for 22.6 months, £3.0M NRE.**
- **Whole vehicle: 46 FTE average.**
- The seven (unverified) published programme totals sit 61–78 % above the model.

**Why it matters.** A stack of that size is credible only if most of it is **bought**. But the model has no per-unit
price for bought software. The Mobileye average system price is **$49–52 per system** (2025), and the camera module
carries only £160k a year of IP. So make and buy are mixed and neither is complete.

**Fix.**
- Tag every module as Make, Buy (per-unit price + integration PM) or Buy-NRE (supplier quote).
- Source the effort from size (COCOMO KSLOC / COSMIC) or from logged actuals.
- Print "effort basis: unsourced catalogue" on the headline until calibrated.

### 4. Map data — the single largest line, unsourced and on a doubtful basis (H)
**Where.** `navigation.perVehiclePerYearGBP = 11.5` (`:661`), charged on the fleet in service (`unitRoyaltyGBP`, `:1392`).

**Input → output.** £11.50 × 4.4M vehicle-years = **£50.6M, 24 % of the programme**. It rises to £85M+ at 14 years.

**Evidence.**
- Neither HERE nor TomTom publishes a per-car price.
- TomTom's automotive revenue (€322M, FY25) moves with **car-line production volumes**, which reads as per-car-built
  licensing plus update packages, not a per-car-in-service annuity.
- The only per-car-per-year figure found is AutoNavi's **HD** map at RMB 100 / car / yr (China, ADAS, "breakeven").

**Fix.**
- Default to a **per-vehicle-built licence plus an optional N-year update subscription** (years as input).
- Leave the £ value as a required, labelled engineering estimate until a supplier quote is entered.
- Never let a per-year-in-service royalty run without a stated update period.

### 5. Voice assistant — royalty about 3× the market and double counted with cloud (H)
**Where.** `voice_assistant.perVehicleRoyaltyGBP = 15` (`:674`) plus `annualCloudCostGBP 450_000` (`:672`).

**Input → output.** £12.0M royalty + £4.5M cloud = **£16.5M**.

**Evidence.** Cerence's own average PPU is **$5.05** (TTM, Q4 FY25), and it *includes* the connected-services
subscription.

**Fix.**
- Royalty = sourced PPU (≈ $5) at the app FX, with connected NLU inside it.
- Cloud only for an in-house assistant (a make / buy switch).

### 6. "AAOS licence $25 / vehicle" names the wrong thing (M–H)
**Where.** `ivi_os.perVehicleRoyaltyGBP = 25 / USD_PER_GBP` (`:648`).

**Input → output.** £15.1M.

**Evidence.**
- AAOS is open source (Apache).
- GAS (Maps, Play, Assistant) is an optional, separately negotiated licence. No published fee was found; the "$10–20"
  in circulation is an unsourced blog estimate.
- QNX is a per-unit royalty, undisclosed. Its backlog is $950M.

**Fix.**
- Make the IVI OS a choice: AAOS (no licence) + GAS (negotiated, entered), or QNX (per-ECU royalty, entered), or Linux.
- Show "no public price — enter quote" rather than a typed default.

### 7. Cloud is fully variable, wrongly scoped and cut off at the end of the programme (H)
**Where.**
- `unitCloudGBP` (`:1291–1300`);
- `SW_CLOUD_REFERENCE_FLEET = 440_000` (`:1287`);
- module `annualCloudCostGBP`, e.g. camera perception £850k (`:556`) and cloud backend £1.2M (`:913`).

**Problems.**
- (a) Every £ is per connected vehicle-year, so a 10k-vehicle programme pays £6.5M and a 300k one £194M. There is no
  fixed platform term (the base backend, PKI, environments).
- (b) **DNN training compute** (camera perception £8.5M) and ML retraining scale with *data and features*, not with
  the fleet. They are development cost.
- (c) The fleet stops paying at programme end, so the last cohort is served for one year. The OEM's service obligation
  (eCall, OTA, R156) runs ~10 years per vehicle. A vehicle averages 5.5 connected years here.
- (d) There is **no cellular data line**. The OEM pays telematics data; the only public price found is retail, AT&T
  $15 / month.

**Sourced unit prices.**
- AWS IoT FleetWise: $0.60 / $0.45 per vehicle per month.
- IoT Core: $1 per million messages.

The model's ≈ £11.8 per vehicle-year is plausible in order of magnitude but unsourced.

**Fix.** `cloud = fixed £/yr + £/vehicle-year × fleet` over a stated **service life per vehicle**.
- Move training compute to NRE / ML data.
- Add a telematics-data line (£ / vehicle / month × connected years).

### 8. Tool licences are per module per year, not per seat (H)
**Where.** `toolchain = annualToolLicenceGBP × devYears` (`:1205`). The sum is £1.815M a year over 7.5 years.

**Input → output.**
- UK: **£13.6M of tools = 78 % of development labour**.
- India: £13.6M of tools against about £3M of engineering labour, **4.4 × the engineers**.
- That is £39k per FTE-year at a 46-FTE average.

**Evidence.** Tools such as CANoe are sold per **seat** plus modules. Only anecdotes are published ("multiple k€",
"> $15k with interface").

**Fix.**
- `tools = seats (FTE by role from the schedule) × £ / seat-year by tool class`.
- Add the HIL / test-bench capex as a separate, amortised line.
- Make it follow the team, not the module count.

### 9. Variable per-unit costs are summed into the "programme" total with NRE (H — decision quality)
**Where.** `computeModuleCost` adds royalty and cloud to `grandTotal` (`:1260ff`). The summary adds licensing to
`grandTotal`.

**Input → output.** £212.8M "programme" is 21 % one-off and 79 % per-vehicle or annual opex.

**Why it matters.**
- Purchasing compares **piece price**, **NRE** and **opex** separately. Royalties sit in the ECU piece price or the
  vehicle variable cost.
- Adding them to NRE makes volume sensitivity misleading. At 300k a year the total is £569M, "mostly software", though
  NRE is unchanged at £44M.

**Fix.** Report three headline figures:
- NRE £;
- variable £ / vehicle built;
- recurring opex £ / vehicle-year (and fixed £ / yr).

Programme TCO is shown only as a derived fourth figure.

### 10. Maintenance — wrong base, flat for life, unsourced % (M)
**Where.** `maintenance = devTotal × maintenancePctPerYear × pvFactor` (`:1209`). The 6–20 % per module averages
13.3 %.

**Input → output.** **£23.3M = 133 % of development**.
- The base excludes test and integration (£10.5M), but every sustaining release is re-tested.
- It is level for 10 years: no ramp-down after SOP+3, no wage escalation, no post-EOP service period.

**Evidence.** The published figures are rules of thumb, not studies, and none is automotive:
- 15–25 % a year (Edana);
- a 21–26 % median in years 1–3 (24 DACH SaaS products);
- 35–60 % for regulated, integration-heavy products.

**Fix.**
- Base the % on development + verification + integration.
- Use a sustaining-team profile: years 1–3 high, then a declining tail, plus a post-EOP period.
- Escalate at a stated wage index.
- Label the % "rule-of-thumb range 15–25 %, not automotive-measured".

### 11. Homologation constants are unsourced, off by default, and charge organisation-level certificates to one programme (M–H)
**Where.** `1_500_000 R155 CSMS + 800_000 R156 SUMS + 600k / 250k ISO 26262` (`:1641`). `includeHomologation` defaults
to undefined, so the line is **£0**.

**Input → output.**
- The default programme carries no R155 / R156 / ISO 26262 compliance.
- Switched on, it adds a flat £2.9M whatever the volume or the number of types.

**Evidence.**
- CSMS / SUMS certificates are per **manufacturer** and are re-assessed at least every 3 years (TÜV SÜD).
- Vehicle-type approval is per type.
- S&P Global: R155 implementation on one *legacy* model "can easily exceed $1M".
- **VSOC operation** (an R155 monitoring duty) is a per-fleet recurring cost and is absent from the model.

**Fix.**
- Default it on.
- Split it into an organisational CSMS / SUMS cost apportioned across the OEM's types and over the 3-year cycle, plus
  per-type approval and technical-service fees, plus VSOC opex per vehicle-year.
- Leave the £ values as entered quotes, with no typed defaults.

### 12. No cash profile, no escalation, NPV off by default (M)
**Where.**
- `buildPhases` (`:1534`) splits **NRE only** 5 / 15 / 50 / 20 / 10.
- `discountRatePct` is 0 by default (`:1199`).
- There is no inflation input.

**Input → output.**
- Nominal £212.8M against £145.8M at 8 % NPV, and only one is shown by default.
- 79 % of the money (lifecycle) has no year-by-year profile.

**Fix.** Add a yearly cash table from M1 to end of service:
- NRE by phase;
- royalties by build year;
- cloud and maintenance by fleet year;
- escalation by stream (wages, cloud price-down).

Show nominal and NPV side by side, peak annual spend, and cumulative £ / vehicle against breakeven.

### 13. Monte Carlo band is far too narrow to be honest (M)
**Where.** Bucket ranges at `:1462–1472`, e.g. licensing 0.80–1.30 and development 0.70–1.40.

**Input → output.**
- P10–P90 is **£199–243M (±10 %)**, while the effort catalogue is unsourced and the published totals are 61–78 %
  higher.
- The single £50.6M map line is drawn from the same narrow licensing range.

**Fix.**
- Per-line ranges keyed to evidence quality: sourced ±15 %, labelled estimate ×0.5–2, unsourced catalogue ×0.5–3.
- Show the tornado on line items (map £ / yr, cloud £ / vehicle-year, rate, effort), not only global switches.

### 14. Default reuse "Medium" (×0.60) on every module (M)
**Where.** `defaultSWProgramInputs` sets `reuse: 'Medium'` for all modules (`:1820`). The factor is from 2024-01 with
no source (`sw-rate-library.ts:116–121`).

**Input → output.** It silently removes 40 % of all effort. A new E/E architecture or SDV programme does not reuse 40 %
of its perception, IVI or zonal software.

**Fix.**
- Default to Fresh.
- Make reuse a per-module, stated choice with an evidence note.
- Show "effort removed by reuse: £X" on the headline.

### 15. NRE recovery and the supplier-quote view are missing (M)
**Where.** `costRecoveryYears` divides NRE by vehicles (`:1218`) with no interest, risk or volume-shortfall clause. The
schedule-compression penalty (`:1132`) is linear with slope 1.5 and has no floor, so 0.1 gives ×2.35.

COCOMO SCED bottoms out at 75 % of nominal (×1.43).

**Fix.**
- Recovery as a supplier would price it: amortised in the piece price over N units at a stated cost of capital, with
  a lump-sum alternative and a shortfall true-up.
- Floor compression at 0.75.

## 2. What a senior costing manager expects on the screen — and is missing

1. **Supplier-quote check.**
   - Inputs: the quote's NRE, piece-price software share, royalties, hub mix and rate card.
   - Output: should-cost against the quote, line by line (rate gap, effort gap, margin, risk), and a negotiation
     target.
2. **Make-v-buy per module.**
   - In-house NRE + sustaining, against supplier NRE + per-unit licence × volume.
   - The break-even volume.
3. **Cost structure split.** NRE, £ / vehicle built (variable) and £ / vehicle-year (opex), each with its own
   sensitivity.
4. **Cash profile** by year: nominal, NPV, peak spend and cumulative per vehicle.
5. **Rate card** in £ / h and £ / day per hub:
   - in-house fully loaded;
   - supplier sell rate (cost + overhead + margin);
   - the blended pyramid.
6. **Evidence grade on every line.** Sourced, labelled estimate or unsourced, with a "£ resting on unsourced inputs"
   total on the headline. Today that total is almost all of the £213M. Every line multiplies at least one unsourced
   input: the effort catalogue, the royalties, the cloud £ / yr, the maintenance % or the tool £ / yr. Only the hub
   rates are sourced.
7. **Headcount curve** by role over time, not one 46-FTE average.
8. **Compliance and VSOC block**: CSMS / SUMS, type approval, VSOC opex.

## 3. Sourced figures that can replace unsourced inputs now

See `costing-data.json`: 32 items, 8 of them null with the searches tried.

**Usable now:**
- Cerence PPU $5.05 → voice royalty.
- AAOS licence 0 (GAS by quote).
- AWS FleetWise and IoT Core unit prices → cloud structure.
- Supplier margins (KPIT 21 % EBITDA, Tata Elxsi 26.3 % PBT, LTTS 14.9 % EBIT, ALTEN 8.5 %, Bertrandt ≈ 0) → sell-rate
  mark-up.
- IT Jobs Watch £600 / day → sell-rate cross-check.
- Hadzima 1.25–1.4 × → employment burden.
- Mobileye ASP ~$50 → make-v-buy reference.

**Still unsourced:**
- map data per vehicle;
- GAS fee;
- QNX royalty;
- AUTOSAR royalty;
- tool seat prices;
- OEM cloud cost per vehicle;
- VSOC per vehicle.

These need supplier quotes, not more web search.
