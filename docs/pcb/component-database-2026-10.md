# Automotive component price database — research of 6 October 2026

**Goal:** a sourced component-price database for the PCBs in ICE, MHEV, HEV, PHEV and BEV vehicles, with prices at the annual volumes a Tier-1 buys at: 100k, 200k and 300k parts a year.

**Rule:** accuracy before size. A price enters the catalogue only when a franchised distributor's listing states it, with its quantity break, URL and date. Nothing in this round was estimated to fill a gap.

## 1. Result

| | Before (1 Oct) | Round 1 (6 Oct) | **Round 2 (6 Oct)** |
|---|---|---|---|
| Parts in the catalogue | 458 | 549 | **653** |
| Priced from distributors | 77 | 183 | **303** |
| Engineering estimates | 381 | 366 | 350 (16 more replaced by distributor prices) |
| Researched entries carrying their raw observations and URLs | 0 | 107 | **228** |
| Of those, priced by 2+ distributors | — | 24 | **88** |
| Listed parts still without a distributor price | — | 254 | **129** |
| Volume breaks per part | 1k / 10k / 100k | 1k / 10k / 100k / **200k / 300k** |
| ECU map by powertrain | none | **38 ECUs × 6 powertrains**, 52 sources |

New researched parts by area:

| Area | Priced | Examples |
|---|---|---|
| Body / chassis drivers | 18 | PROFET BTS7002/7004/7006/50015, BTT6030; VNQ7040, VN7016, VND7020; TPS1HB08, TPS2HB16, TPS4H160; DRV8873, DRV3245 |
| Communication interfaces | 15 | TJA1042/1043/1051/1057/1145/1153/1463; TCAN1042/1043/1051/1057/4550; MCP2518FD; TLE9251/9255 |
| Battery management | 15 | BQ79616/79656/79612/79718/79600; MC33771C/72C/75A/664; ADBMS6815/1818/2950; LTC6811/6813; L9963E |
| Power management | 14 | TLF35584/85, TLE9263, TLE9471, TLS850, TLS205, TLE42754; FS6500, FS26, VR5510, PF8200, UJA1169/1167; TPS65381A |
| EV high voltage | 14 | Gate drivers: UCC21750, UCC5870, UCC5880, UCC21520A, UCC5350; 1EDI2002/2010, 1ED3890, 2ED2410; STGAP2SiC/4S; NCV57000/51705; ADuM4135 |
| MCUs | 12 | AURIX TC234/264/275/277/297/364/377/387; S32K142/146/148, S32K311 |
| Passives (AEC-Q200) | 12 | Murata GCM 0402–1210 MLCCs, TDK CGA, KEMET AUTO, Samsung CL…W |
| ADAS / radar / camera | 7 | AWR1642/1843/2243/6843, IWR6843, TEF8232, AR0233AT |

Round 2 priced 122 of the 222 queued parts searched (raw files: `calculator/scripts/pcb-research/2026-10-06-r2/`):

| Area | Priced / listed | Examples |
|---|---|---|
| Communication interfaces | 25 / 29 | LIN TJA1021/1027, TLIN1029, MCP2003B, TLE7259; CAN NCV7344, ATA6563; Ethernet PHYs TJA1101B/1102/1103/1120, DP83TC811/813, DP83TG720; switches SJA1110, KSZ9563, LAN9372; FPD-Link DS90UB953/954/960/941/948; GMSL MAX9295A/9296A/96717 |
| Power management | 19 / 30 | TPS7B69/7B81 LDOs, LMR33630, TPS62810, LM74700/74800, LM5146, LM5170, LM5122, TPS3703; NCV8730/4275C/890100; A6986, LDO40L, L5965, SPSB081, L99PM62; MAX20087 |
| EV high voltage | 19 / 40 | AMC1301/1302/1311/3301, ISO7741/7721/1042, Si8641, ADuM1401; TMCS1123, ACS37002/724, MLX91220, TLE4972; AD2S1210; Wolfspeed C3M0032/0075, SCTW35N65G2V, IKW40N120H3 |
| Body / engine / lighting | 19 / 40 | TLE9180D/9183/9201, L99H92, A4910; L9779WD, TLE8110, TLE6240, MC33816; TPS92662A/92830/92520, TLD5542/1114/2331, NCV7685; TLE5012B, AS5047P, ASM330LHH |
| Battery management / charging | 15 / 26 | INA228/229, SN6505B, UCC28740/28951/256404, UCD3138, UCC14240, AMC3330; TLE9012/9015, MAX17841, LTC6820, MC33665, L9963T |
| Memory | 14 / 29 | EEPROM M24C64, AT24C256C, M95256, 25LC256, CAT24C512; NOR S25FL128L/512S, IS25LP128, MX25L256, MT25QL512; NAND MT29F4G08; LPDDR4 MT53E256M32, IS46LQ32256; eMMC MTFC16G |
| MCUs | 11 / 28 | S32K312/314/358, S32G274A, SPC584B, SPC5777C, TMS320F28377D, AM2634, STM32G474/H743 (S32K344 kept its earlier price) |

**Read these with care:**
- **Sibling codes.** 25 parts are priced on a sibling orderable code. The entry's source opens "Priced on the sibling orderable code …", and the code is an alias. Most are a packing or revision variant. Four are an industrial-temperature version of an automotive part, and the AEC-Q grade usually costs more: KSZ9563 (-VAO), Si8641 (-AS), MT29F4G08 (-AAT) and LAN9372.
- **Spreads between distributors.** Some parts show a wide gap between distributors, for example CAT24C512 at Digi-Key $0.63 against LCSC and Newark $0.25. The 1k price is the median; the observations are on the entry.
- **Aggregator summaries.** Some prices were read from aggregator summaries (Findchips, Octopart, Digipart) that named the franchised distributor and its break. The URL is the aggregator page.
- **SiC MOSFETs.** The Wolfspeed SiC MOSFETs (C3M0032120K $7.37 @120, $6.65 @510 at Digi-Key; Mouser agrees) are well below older SiC prices. They are kept as listed.

Every new entry carries its `observations` (distributor, quantity, price, currency, URL, date) and its `volumeModel`. The raw research files are in `calculator/scripts/pcb-research/2026-10-06/`.

## 2. How a price is built (`scripts/pcb-catalogue-research-merge.ts`)

1. **Sources.** Only franchised and authorised distributors count: Digi-Key, Mouser, Arrow, Avnet, Farnell/Newark/element14, RS, TME, Rutronik, Future, TTI and LCSC. Brokers and marketplaces are dropped (Win Source, eBay, AliExpress, Kynix and similar), and so are manufacturer web stores. Breaks below 100 units are dropped, because one-off prices run 2–3× the volume price.
2. **Currency.** Prices convert to GBP with the engine's FX table (`src/engine/insights.ts`; USD 0.7553). A currency not in that table (e.g. NOK) is dropped.
3. **Outliers.** With 3+ observations, one more than 2.5× from the median of the others is dropped.
4. **The 1k price** is the median of the observations at 500–2,500 units. A single other break is moved to 1k along the slope.
5. **The slope** is the part's own where possible:
   - from two breaks of ONE distributor: `b = ln(Pa/Pb) / ln(qb/qa)`;
   - else the catalogue's franchise curve (10k = 1k × 0.85, b = 0.0706).

   Two different distributors' breaks are never turned into a slope. The gap between them is the distributors' price spread, not a volume discount. Round 1 allowed it, and round 2 showed why that was wrong: DS90UB954 at Mouser $14.78 @1k against Digi-Key $10.79 @2.5k read as b = 0.34, which put the 300k price at a third of the 1k price. The rule was removed and every earlier researched entry was re-priced from its stored observations. Two changed: BTT6030-2ERA (slope only) and TLE9255W (1k £1.218 → £1.183).

   It is clamped to 0.02–0.18. Measured slopes came out at 0.02–0.16. Passives run steepest: Murata 0402 MLCCs at 0.12–0.14 from Digi-Key's 1k → 10k → 50k reels.
6. **Volume breaks.** 10k / 100k / 200k / 300k = `P1k × (Q / 1000)^−b`. **Above the largest published break these are derived, not quoted.** Distributors publish nothing at 100k–300k a year; contract prices at that volume are negotiated, and are typically lower again.
7. **Lookup.** A BOM line is priced at the parts it buys: quantity per board × boards per year. The lookup interpolates between breaks and stays flat above 300k (`cataloguePriceAt`).

## 3. What is not finished — and why

Web search was the only route. Direct fetches of every distributor and manufacturer site (Digi-Key, Mouser, Octopart, LCSC, ti.com, st.com, nxp.com, infineon.com) are blocked by this environment's network policy. Web search allows 200 searches per turn, shared by all research agents. Both rounds ran out of searches.

**129 listed parts have no distributor price** (`calculator/scripts/pcb-research/queue.json`, in three lists):
- **`notSearched` (45): the search budget ran out.** These include:
  - the six traction power modules (HybridPACK Drive, XM3, VE-Trac, ACEPACK);
  - film capacitors and HV contactors;
  - several sensors (MLX9036x, TLE4999/4966, KP236, SMI230, IAM-20685);
  - the MAX / LT regulators;
  - DRA821, AP0202, AR0820/AR0147, TC397, TDA4VM, i.MX 8M Plus;
  - the three 1206 MLCCs and FlexRay.
- **`searchedNoPrice` (55): searched, but no franchised break of 100 units or more.** The reasons were:
  - only one-off prices;
  - prices with no quantity attached;
  - figures that contradicted each other and were discarded;
  - brokers only;
  - parts discontinued at distributors.

  The reason is in each part's notes.
- **`ndaOrNoPublicPrice` (29): no public distributor price.** These are:
  - SoCs sold under NDA (Qualcomm SA8155P/8295P, R-Car, Mobileye, Marvell / Broadcom PHYs, HomePlug GreenPHY modems);
  - radar and imaging chips priced only by the maker (AWR2944, S32R45/41, OX08B40/OX03C10, IMX490);
  - parts where round 1 found only brokers or the maker's store.

**Other limits:**
- 215 of the 303 distributor-priced parts have one distributor behind them. They are real listings, not cross-checked.
- Prices at 100k–300k a year are derived along the part's slope, not quoted. Contract prices at that volume are negotiated, and are usually lower again.

**To finish (no code changes):**
1. Start a new turn, or raise `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION`. Research `queue.json` (`notSearched` first) with the same rules (`scripts/pcb-research/RULES.md`), then run `npx tsx scripts/pcb-catalogue-research-merge.ts <dir> --write`.
2. **More authoritative:** Purchasing's distributor quote or BOM-tool exports (Digi-Key, Mouser, Arrow), imported with `scripts/pcb-catalogue-import.ts`. Or a Nexar/Octopart key, which returns full break tables with stock.
3. Allowing the distributor domains in the environment's network settings would let the research read the pages themselves rather than search summaries.

## 4. Vehicle-electronics map (`server/data/pcb-ecu-library.json`)

**6 powertrains:** ICE, MHEV, HEV, PHEV, BEV 400 V and BEV 800 V. **38 ECUs:**

| Group | ECUs |
|---|---|
| Common (14) | BCM, gateway, airbag, EPS, ABS/ESC, cluster, infotainment, radar, front camera, telematics, seat, door, HVAC, headlamp |
| ICE (9) | ECM, TCM, glow-plug, ignition, fuel pump, NOx, DCU, IBS, alternator regulator |
| MHEV (4) | 48 V BSG inverter, 48–12 V DC-DC, 48 V BMS, e-booster |
| Electrified (11) | power control unit, traction inverter, cell monitoring boards, BMU, HV DC-DC, VCU, OBC, charging communication, e-compressor, PTC heater, thermal management |

**How each claim is sourced:**
- **Key ICs by role:** sourced where possible to vendor reference designs and application pages. Examples: TI BQ79616-Q1 and NXP MC33771C/MC33664 for cell monitoring; TIDA-01168/LM5170-Q1 for the 48–12 V DC-DC; TIDA-020031 for the HV DC-DC; TIDM-02012 for the e-compressor; 1EDI303x with AURIX TC3x7 for the inverter; TLE8888 with AURIX for the ECM; QCA7005 for CCS charging. 58 of the 92 roles cite a URL; the rest say "engineering judgement".
- **Semiconductor content per vehicle:**
  - **Sourced:** ICE about $750 and BEV about $1,300 (2024), rising to about $1,650 by 2030 and up to $2,500 high-end (Infineon, December 2024 investor roadshow).
  - **Interpolated and labelled:** MHEV, HEV and PHEV.
- **Board figures** (layers, size, placements) are almost all engineering judgement and are marked so. The one sourced figure is about 412 parts on a Bosch DCU17 engine ECU board.

In the app, the PCB forms have a **Vehicle electronics library** panel with:
- powertrain tabs;
- an annual-volume selector (100k / 200k / 300k);
- each ECU's board and key ICs.

A named chip that is in the catalogue shows its price at that volume. It is green when distributor-priced and teal when it is an estimate. Chip families ("AURIX TC3xx") are never priced by guesswork. The endpoint is `GET /api/pcb/ecu-library?volume=300000`.

## 5. Effect on the radar board (China, 250,000 boards/yr, ASIL-C)

The new 200k/300k breaks apply to every catalogue line bought at 250k: the radar MCU, transceiver, flash, PMIC and CAN chips. The BOM moves from **£52.64 → £50.47** (distributor level) and the headline from **£57.82 → £55.82**. `tests/pcb-stage4-trace.test.ts` still reconciles every figure.

## 6. Tests

- `tests/pcb-component-catalogue.test.ts`:
  - every researched entry has observations with URLs, breaks ≥ 100 units, a franchised distributor and a slope inside the clamp;
  - every entry has 1k ≥ 10k ≥ 100k ≥ 200k ≥ 300k;
  - the merge rules (own slope, franchise fallback, dropped brokers / one-offs / currencies, outlier removal);
  - interpolation to 300k.
- `tests/pcb-ecu-library.test.ts`:
  - powertrain coverage (no engine ECU on a BEV);
  - every claim carries a URL or "engineering judgement";
  - named-chip links equal the catalogue price at the requested volume.
