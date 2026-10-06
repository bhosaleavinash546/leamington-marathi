# Automotive component price database — research of 6 October 2026

**Goal:** a sourced component-price database for the PCBs in ICE, MHEV, HEV, PHEV and BEV vehicles, with prices at the annual volumes a Tier-1 buys at: 100k, 200k and 300k parts a year.

**Rule:** accuracy before size. A price enters the catalogue only when a franchised distributor's listing states it, with its quantity break, URL and date. Nothing in this round was estimated to fill a gap.

## 1. Result

| | Before (1 Oct) | Round 1 | Round 2 | Round 3 | Round 4 | **Round 5** |
|---|---|---|---|---|---|---|
| Parts in the catalogue | 458 | 549 | 653 | 687 | 796 | **823** |
| Priced from distributors | 77 | 183 | 303 | 340 | 450 | **477** |
| Engineering estimates | 381 | 366 | 350 | 347 | 346 | 346, of which **60 priced as a reviewed family member** |
| Entries carrying raw observations and URLs | 0 | 107 | 228 | 265 | 398 | **425** |
| Of those, priced by 2+ distributors | — | 24 | 88 | 118 | 160 | **168** |
| Distributor prices with no URL (1 Oct pass) | 77 | 75 | 75 | 75 | 52 | **52** |
| Listed parts still without a distributor price | — | 254 | 129 | 92 | 132 | **105** |
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

### Round 5: the remaining unpriced parts

Six searchers worked through the 132 unpriced parts. Each had the part's last result, and each tried different routes:
- the full orderable code with its packing suffix;
- reel and tray variants;
- LCSC, Farnell, TME, RS and Findchips.

They priced 27. These include:
- **Processors:** AURIX TC233LP, the i.MX 6Quad.
- **Power and drivers:** the FS84 safety PMIC, DRV8714, NCV7471, VN7140AS, VN9D30Q100F (from Arrow, a different source from the RS figures rejected in round 3), TPS25762, TPS389033.
- **Power semiconductors:** the NVHL020N120SC1 SiC MOSFET, the AIKW40N65DH5 IGBT, the IAUC120N04S6L008 and NVMFS5C628NL MOSFETs.
- **Sensors:** TLE5014SP16, A1220, TLE4946, TLE4964.
- **Passives, LEDs and relays:** XAL6060, DLW43SH510, UCZ capacitor, 0466 fuse, OSRAM LT QH9G LED, TLD1114, ACJ1112 relay.
- **Memory:** three memory parts.

Four new prices are marked **DISPUTED** (`2026-10-06-r5/audit-exclusions.json`):
- **MT53E1G32 LPDDR4X:** priced on its 105 °C sibling at $105 @2,000, while other listings ran $26–176.
- **MT25QU01G NOR:** a list price on an out-of-stock reel.
- **MT41K256M16 DDR3L:** LCSC is about 40% below Mouser.
- **TC233LP:** from a single search summary.

Together with MT25QL256/512 and MT29F4G08, the catalogue's automotive memory prices are its weakest. Confirm them with a quote before relying on them.

**What remains (105).** `queue.json` now groups the parts:

| Group | Parts | What closes it |
|---|---|---|
| NDA or direct only | 19 | A supplier quote: these have no public price |
| Listed only below 100 units | 13 | Traction modules, contactors, film capacitors, AWR2944: a quote, or a distributor's volume quote |
| Code as listed is probably not orderable | 14 | Find the real automotive code. For example, TI's automotive LM393B is LM2903B-Q1, and the B32776 / B32922 series need a value. |
| Searched, no usable price | 50 | Brokers only, quantities not stated, or contradictory figures. Needs a BOM-tool export. |
| Not re-searched (budget) | 9 | One more round |

### Round 4: the gap analysis, and a review of the existing prices

**Gap analysis.** A list of 198 parts that automotive ECUs commonly use was checked against the catalogue, and 162 were missing. Six search groups covered them and priced 121. Some of these already had an entry that carried a 1 October price with no URL.

| Group | Priced | Examples |
|---|---|---|
| Smart switches, SBCs, MOSFETs | 18 / 25 | TLE9461/94613, TLE9278, BTS70012, BTT6100, VNQ9080, TPS1H100/2H160/1HTC30/2HCS10, TPS4810, BTS3125, NCV8402; IPD50N04S4, IAUC60N04S6L, BUK7S1R0, SQJ844AEP |
| Protection, discretes | 26 / 26 | NUP2105L, ESD2CAN24, TPD2E007, SM8S33A, SMBJ24CA, SMCJ36A, SM6T39A; BZX84, BAS21, BAV99, BAT46, PMEG6030, RB160M, STPS2H100, NRVBA/NRVBS340, S1M/ES1D/US1M (HE3); BSS84AKW, BSS138BKW, 2N7002BKW, NX3008NBK, PMV50ENEA |
| Analog, logic, sensors | 18 / 28 | LM2904B, LMV358A, TLV3201, TLV7031, INA181/186, TL431, OPA2376/2333, TMP112/235, ADS7038, SN74LVC1G08, 74HC595-Q100, TXU0104, SN74LV4T125, TCA9539 |
| Regulators, supervisors, drivers | 19 / 26 | TPS3702/3840/3430, TPS7B4250, TPS7A16, TLV767, TPS62A01, TPS629210, LMQ61460, LM5157, UCC27517A/27211A, SN6501, TPS61194, LP8864, TLC6C598 |
| Magnetics, resistors | 23 / 27 | ACT45B/ACT1210 CAN chokes, WE-CNSW, BLM15/18 beads, XAL4020/5030, CLF7045, SRP7028A, IHLP-2525, VLS4012; CRCW/ERJ/AC/RK73 0402–0603, PAT0603, ERJ-PB3, CSS2H shunt |
| Capacitors, crystals, relays, audio | 17 / 30 | EEE-FK, EEH-ZA/ZC hybrid polymer, GCM155/CL10B/CGA3E 100 nF; CSTNE resonators, ABM8AIG, ECS-160; CB1A relay; 0451 fuse; TAS6424, FDA803D, TDA7802; DS90UB927 |

**Review of existing prices:**
1. **Family keys.**
   - **The problem:** 51 estimates named only by a family ("TC387", "LM74700", "BQ79616", "BTS7040") had a distributor-priced member in the catalogue and were far off it. For example:
     - TPS65381: estimate £9.41 against £2.56 (3.7×);
     - BTS7040: £1.53 against £0.59;
     - LTC6813: £12.94 against £6.95;
     - TC277: £21.18 against £12.56;
     - DP83TC811: £2.00 against £3.90.
   - **The fix:** `scripts/pcb-research/family-links.json` is now the reviewed list. It has 60 links, including 10 generic keys priced as a representative part:
     - 0402 100 nF MLCC, 0402/0603 resistors, 0603 bead;
     - automotive CMC, 33 µF hybrid polymer, 2512 shunt;
     - LM2904, both relays.
   - **How the linked keys behave:** they take the member's breaks and stay estimates. A BOM line that names only a family does not say which variant it is.
   - **Left out on purpose:**
     - CAT24C: the only member is 512 Kb, which is not representative.
     - MT53E: the density is unknown.
     - STM32H7: there are two different members.
     - S32G274: its only member was broker-sourced.
     - The 4×4 power inductor: the only member priced is Coilcraft's premium XAL4020, about 3.5× a typical part.
   - **L9963** links to L9963E, the monitor, not L9963T, the transceiver.
2. **Prices with no URL (from 1 October).** 24 were re-checked, and a URL-backed listing now replaces the old figure. Most moved by under 20%. The larger moves:
   - G6K-2F-Y relay: £1.17 → £2.26. The old figure had leaned on LCSC.
   - AWR1843ABGABLRQ1: £19.43 → £23.18.
   - TLF35584: £2.49 → £3.01.
   - UCC27211A: £1.29 → £0.87.
   - W25Q128JV: £1.28 → £1.56.

   MT25QL256 is marked DISPUTED: one reading was 2.6× below the catalogue.
3. **Where a price may be read** (`PRICE_HOSTS`, rule 1).
   - **The rule:** an observation counts only when its URL is the distributor's own site, or an aggregator that names the distributor and break (Findchips, Octopart, Digipart, TrustedParts). Broker storefronts that relist a Mouser row (OEMsTrade, omo-ic), datasheet sites and maker pages no longer count.
   - **What it removed:** observations on AM2634, UCC5870, MC33771C and BQ79656.
   - **Entries that left the catalogue:** three entries priced only that way (S32G274A, TLF35585, LM5122). None had replaced an estimate. The S32G274 family key went back to its original estimate.

The round-4 audit file is `2026-10-06-r4/audit-exclusions.json`. It removes DLW43SH510XK2L, whose Mouser URL was a search link built by the researcher. Parts priced on a non-automotive code are marked `aecq: false` or say "sibling" in their source:
- TPS2116, TPS2663, LM5069 and IPB015N04L;
- MPZ1608 (commercial grade);
- BLM15PX, priced on its SN1D sibling;
- TPD2E007, SM6T39A, PESD5V0S1BL and NRVBS340, priced on their standard codes.

### Round 3: the remaining parts, and cross-checks

Round 3 (raw files: `calculator/scripts/pcb-research/2026-10-06-r3/`) had four jobs:
- **Search the 45 parts never searched.** 24 were priced. BQ79731's only price was in Norwegian kroner, a currency not in the FX table.
- **Re-search the 55 with no usable price, using different search forms.** 13 were priced, after 2 were rejected by the audit.
- **Try 12 of the parts set aside earlier.** 1 was priced.
- **Look for a second distributor on the 44 most valuable single-source parts.** 26 were cross-checked.

Newly priced parts include:
- **Processors:** TDA4VM, TC397, the RH850/U2A, i.MX 8M Plus, MPC5744P, MSPM0G3507-Q1, SAM C21 (automotive grade) and PIC18-Q83.
- **Communication chips:** SJA1105, 88Q2112, MAX96712, FlexRay TJA1081/1085.
- **Sensors:** MLX90363/90381, TLE4999, TLE4966, A1335, KP236, SMI230, the AR0820 image sensor and the AP0202 image processor.
- **Power and drivers:** the MAX20004/20098/16141/20096 regulators and LED driver, LT8645S, the L9907, DRV8705 and DRV3946 drivers, and the TPS92633 LED driver.
- **High voltage:** the AIMW120R045M1 SiC MOSFET, the ADBMS6830 cell monitor, a Panasonic AEV contactor and an X2 film capacitor.
- **Memory:** W25Q256 flash and LPDDR4X.

**Cross-checks.** A cross-check now adds to a part's stored observations; it never replaces them. The part is re-priced from all of its observations together. Most second sources agreed within 15%. Where they did not, the median of all the observations sets the 1k price:
- AWR1843 −14%;
- AM2634 −16%;
- MC33772C −26%;
- DRV3245A −31%;
- SPC584B +23%;
- AD2S1210 −39%. Mouser's 100/250 breaks give it a steep own slope, held at the 0.18 limit.

**Audit decisions** (`audit-exclusions.json`, each with its reason, applied by the merge):
- **Rejected:**
  - VN9D30Q100F: two RS regional sites contradict each other.
  - MPC5748G: the only price was for a different package, LQFP rather than BGA.
  - MT41K256M16 AAT:P: the reel price was 5× below the tray price of the same die.
  - 88Q2112: one Mouser figure read off a broker page.
- **Disputed but kept:** MT29F4G08 (Newark ≈ $4.36 @50 against Digi-Key $21.07 @960) and MT25QL512 (the catalogue's Mouser $9 @1k against Digi-Key's related codes at $31–47). Their sources say "DISPUTED" until a quote settles them.
- **Rochester Electronics** is no longer accepted. It is an authorised *aftermarket* house selling end-of-life stock at its own prices; LTC6813 was $15.93 @1k there against LCSC $10.82 @100. That re-priced TLE9183 from its LCSC price and removed TLD1114, whose only price was Rochester's.

**Sibling codes.** 34 entries are priced on a sibling orderable code, and their source says so. The ones to read with care, because the grade differs and the automotive part usually costs more:
- AD2S1205 (industrial);
- PIC18F26Q83 (industrial, SSOP);
- MPC5744P (another speed/temperature grade);
- i.MX 8M Plus (consumer code);
- B32922 (not AEC-Q200);
- LT8645S (E-grade).

Every new entry carries its `observations` (distributor, quantity, price, currency, URL, date) and its `volumeModel`. The raw research files are in `calculator/scripts/pcb-research/2026-10-06/`.

## 2. How a price is built (`scripts/pcb-catalogue-research-merge.ts`)

1. **Sources.** Only franchised and authorised distributors count: Digi-Key, Mouser, Arrow, Avnet, Farnell/Newark/element14, RS, TME, Rutronik, Future, TTI and LCSC. Brokers and marketplaces are dropped (Win Source, eBay, AliExpress, Kynix and similar), and so are manufacturer web stores and the aftermarket house Rochester Electronics. Breaks below 100 units are dropped, because one-off prices run 2–3× the volume price.
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

**92 listed parts from rounds 1–3, and 40 parts from the round-4 gap list (`round4GapNotPriced`), still have no distributor price** (`calculator/scripts/pcb-research/queue.json`, each with the last result). All have now been searched. They fall into four groups:
- **No public distributor price (about 25).** These include:
  - Qualcomm SA8155P/8295P, Renesas R-Car, Mobileye;
  - Marvell 88Q2220 and Broadcom PHYs;
  - HomePlug GreenPHY modems (QCA7005/7006, MSE1022);
  - Sony IMX490, Samsung LPDDR4 and the Calterah radar chip;
  - S32E2, Stellar SR6P3 and i.MX 8QuadMax.
- **Single-unit prices only (about 30).** The prices for one unit are kept in the notes:
  - the six traction power modules ($520–2,000 each at one unit);
  - the HV contactor and DC-link film capacitors, and the LEM transducer;
  - AWR2944, OX03C10/OX08B40, the i.MX 6Q, NVHL020 and S32G399;
  - large automotive DRAM and eMMC.
- **Exact automotive code not found (about 15).** Only commercial or other variants came back: TMS320F28003x/49 Q1, UCC28180/ISO224/ISO1044 Q1, AMC0330, DRV8343S, TPS7B8450, TLE5014SP16 and the three 1206 MLCCs.
- **Brokers, the maker's store or Rochester only (about 20).** These include TLE94112, TLE8888-1, TPS65313, TPS653850, ADuM4146, INA241A1, SI82390 and TLF4277.

More web search will not close these: they need a Purchasing quote or a BOM-tool export (Digi-Key, Mouser or Arrow), imported with `scripts/pcb-catalogue-import.ts`, or a Nexar key.

**Other limits:**
- 309 of the 477 distributor-priced parts have one distributor behind them, and 52 still carry the 1 October figure with no URL. They are real listings, not cross-checked.
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
