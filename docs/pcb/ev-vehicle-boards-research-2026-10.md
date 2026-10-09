# MHEV / PHEV / BEV vehicle boards: research round 3 (9 October 2026)

**Request (director).** Add the ICs, SMT components and board cost details of every automotive PCB on MHEV, PHEV and BEV
cars, from authentic web sources, at 100k / 200k / 300k a year, with no invented numbers. Then review and fix how the
photo → BOM → cost feature identifies and prices parts. The fixes are reported separately in
`docs/pcb/pcb-pipeline-fixes-2026-10-09.md`.

## Result

| | Before | After |
|---|---|---|
| Catalogue parts | 1,106 | **1,217** |
| Distributor-priced entries (URL + date on every price) | 764 | **880** |
| Key-IC rows on the 35 non-ADAS boards (each with a URL or "engineering judgement") | 85 | **361** |
| Teardown / reference-design entries on those boards | 0 | **130** |
| Public board-cost evidence (library-wide) | 22 | **46** |
| Named key parts on those boards that resolve to a distributor price | 118 of 782 (15 %) | **216 of 782 (28 %)** |

The catalogue audit shows 0 errors. The coverage count is `npx tsx scripts/pcb-research/2026-10-09-ev/coverage.mts`.

## 1. How

- **Boards.** All 35 non-ADAS ECUs in the vehicle-electronics library are covered: battery, charging, drives, chassis,
  body, cockpit and engine. The ADAS boards were rounds 1–2.
- **Domains.** Seven board domains and one list of board-level power / HV components were researched. Each was done by
  one agent at a time, because the web-search budget is shared.
- **Rules.** `scripts/pcb-research/2026-10-09-ev/RULES-R3.md` applies, together with the earlier `RULES.md` and
  `RULES-R2.md`:
  - franchised distributors only, breaks of 100 or more, a URL and a date on every price;
  - test storefronts and staging hosts are not used (merge rule 1a);
  - every board fact either links its source or says "engineering judgement" or "not published in any source found".
- **Merge.** Prices go in through `scripts/pcb-catalogue-research-merge.ts`, boards through
  `scripts/pcb-ecu-library-merge.ts`. The library merge now ADDS teardowns and board-cost evidence instead of
  replacing them; it used to wipe earlier rounds.

## 2. Results by domain

| Domain | Boards | Key-IC rows | Parts researched | Priced | 2+ distributors |
|---|---|---|---|---|---|
| Battery (BMS slave / master, 48 V BMS, 12 V sensor) | 4 | 43 | 20 | 18 | 3 |
| Charging (OBC, HV and 48 V DC-DC, charge controller) | 4 | 34 | 31 | 15 | 5 |
| Drives (traction inverter, PCU, BSG, e-booster, e-compressor, PTC, thermal) | 7 | 40 | 33 | 16 | 3 |
| Chassis and safety (VCU, EPS, ESC, airbag) | 4 | 36 | 33 | 18 | 5 |
| Body (BCM, gateway, seat, door, HVAC, headlamp) | 6 | 38 | 29 | 17 | 5 |
| Cockpit (cluster, infotainment, telematics) | 3 | 35 | 39 | 7 | 1 |
| Engine on hybrids (ECM, TCM, ignition, fuel pump, glow plug, NOx, dosing) | 7 | 49 | 18 | 15 | 7 |
| Board-level power / HV components (film caps, shunts, sensors, SiC, relays, connectors) | — | — | 20 | 16 | 2 |

**What the sources establish:**
- **Production chips are named in public for very few boards.** Examples:
  - BYD Blade BMS (MAX17853 cell monitor, TC234L master MCU);
  - Tesla Model 3 inverter and body controllers;
  - 2017 Prius PCU and brake / airbag ECUs;
  - VW ID.3 ICAS1;
  - the Bosch DCU17 (TC1766 + CIC751).
- **Everywhere else** the key ICs come from maker reference designs (TI TIDA / TIDM, NXP RD, Infineon REF / EVAL,
  ST AEK / STDES, onsemi, Wolfspeed). They are labelled as reference designs, not production boards.
- **Board build.** Construction facts are sourced. Examples:
  - EPS control and power boards stacked around a heat sink;
  - TCM moving from LTCC ceramic to HDI, and overmolded;
  - the E-GMP ICCU on 4 PCBs;
  - inverter gate-driver boards split from the logic board;
  - IMS power stages;
  - the Audi cluster at 185 × 121 mm.

  **Production layer counts, laminate and placement counts are not published for any of the 35 boards.** They stay
  engineering judgement.
- **Public board / module cost evidence:**
  - Munro inverter costs: Model 3 $709, Leaf $636, I-PACE $754, Model Y ≈ $522;
  - DOE 2014: $273 for a 3.3 kW OBC;
  - IHS head-unit BOMs (2012–13), $64–244;
  - IHS Denso airbag sensing module, $38.46.

  All of these are listed in the library with links. They are evidence, not prices for the costing.

## 3. Volume: 100k, 200k and 300k a year

- Each line is priced at the parts bought: annual boards × quantity per board.
- Up to the largest published distributor break the price is the listing. Above it, the price is derived along the
  part's own slope, or the franchise curve (10k = 1k × 0.85), and labelled DERIVED. It stays flat above 300k parts.
- No public source gives automotive contract prices or a contract-versus-distributor discount. The cost-basis research
  (§4) found none, so no discount is applied. This is the standard learning-curve method, stated as such.

## 4. Cost-basis evidence (`2026-10-09-ev/evidence/cost-basis-evidence.json`, 48 claims)

| Topic | What was found | What the tool does |
|---|---|---|
| Laminate (Rogers / PTFE / high-Tg) | Fabricator blogs only, which disagree: laminate 3–12× FR4, board +20–50 %, high-Tg +5–20 % | Not priced. The result now says so (`LAMINATE_NOT_COSTED`) |
| Second reflow side | JLCPCB per-order prototype fees; DFMA $0.50–2.00 per reflow pass | Not priced. The result says so (`SECOND_SIDE_NOT_COSTED`) |
| Import duty | UK classifies ECUs as 8537 10 91 (official). Rates only from aggregators: UK/EU ≈ 2–2.1 %, US 2.7 % + possible Section 301 | Unchanged (CN 3.7 %, VN / IN / TH / MY 5.5 %, UK destination only). **Check against the official tariff pages** |
| EMS material burden | No published %. EMS whole-business gross margin ≈ 8–9 % (Jabil, Flex) is not the same thing | Unchanged (10 % → 7 % → 5 %, labelled an engineering figure) |
| Contract vs distributor | No published figure | No discount applied |
| Fab price per m² | Undated or old only. Dasenic (China) 4-layer 720 RMB/m²; an Evertiq list $178/m² at 20 m² | **Open question:** these figures are above the tool's China 4-layer base rate. They are not dated and not at stated volume, so nothing was changed. **Get a fab quote** |

## 5. Read with care

- **Disputed entries** (said on each entry): LTC2949, i.MX 8QM, ISL78206, TC1766, IAUS240N08S5, BQ79631.
- **Excluded:**
  - DHAB S/124: its only price includes US tariffs.
  - MLX91218: its price was matched by search order.
- **Stand-ins (said on each entry):**
  - the IHLP inductor in place of a PFC / LLC choke;
  - the 80 V common-mode choke in place of an HV one;
  - IAUT300N08S5N014 for N011;
  - SM91514AL for SM91574AL;
  - several sibling codes.
- **Quote only.** Most cockpit SoCs and modules (SA8155P / SA8295P, R-Car, cellular modules), power modules
  (HybridPACK, VE-Trac), and Bosch / Elmos / TDK ASICs are sold by quote only. They stay class ranges until real quotes
  arrive.
- **Accuracy is still unmeasured.** There is one real purchase price, the camera board: £16.37 estimated against £17.00
  paid. Real BOMs, board photos and quotes, when uploaded, go into `scripts/actuals/` and are compared, never tuned to.

## 6. Files

- `calculator/scripts/pcb-research/2026-10-09-ev/`:
  - `RULES-R3.md` and `tasks/`;
  - one parts file and one `ecu-map-*.json` per domain, plus `power-components.json`;
  - `audit-exclusions.json`, `coverage.mts` and `evidence/cost-basis-evidence.json`.
- `calculator/server/data/pcb-component-catalogue.json` and `pcb-ecu-library.json` (merged).
- `calculator/tests/pcb-ev-boards.test.ts`: the merge-append rule, round 3 parts, audit decisions and board sourcing.
