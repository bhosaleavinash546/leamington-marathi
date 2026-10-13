# PCB component catalogue — round 4 gap fill (13 Oct 2026)

**Request.** Leadership challenged the PCB Image → BOM → Cost catalogue as too thin: it was missing the latest automotive ICs,
the rest of the industry's common ICs, and everyday SMT / SMD parts. This round adds them with real distributor prices,
researched by parallel agents and checked by independent reviewers. Automotive came first, passives were built as a
matrix, and 10 research agents ran.

**Result:** 1,217 → **1,425 parts**; distributor-priced 880 → **1,099**; **219 parts** priced from distributor listings that
had no sourced price before. Catalogue audit: 0 errors. Tests: all pass.

## 1. How it was done

1. **Research, wave 1.** Ten agents ran in parallel, one per domain: automotive compute, memory, power semiconductors, power
   management, in-vehicle networking, sensors / analog, connectivity and general ICs, the MLCC matrix, the R / L / C matrix,
   and interconnect / discretes. Each worked to the round's rules (`scripts/pcb-research/2026-10-13-gap/RULES-R4.md` +
   `../RULES.md`):
   - franchised distributors only;
   - quantity ≥ 100;
   - URL and date on every price;
   - no invented code or price;
   - OEM-direct parts (Orin / Thor, EyeQ, Snapdragon Ride, R-Car V4H…) listed, not priced;
   - a check against the catalogue first (`has.py`).
2. **Validation** (`validate.mts`) of every file against the merge's own rules: host, distributor, quantity, currency,
   category, duplicates, prices that rise with quantity, observations > 2.5× apart, and prices far outside the class range.
3. **Independent review, wave 1.** Three reviewer agents searched again for themselves:
   - the 16 IC prices the researchers marked as approximate, single-source or uncertain;
   - 12 passives / discretes with conflicting snapshots;
   - a **random sample** of 26 unflagged prices.
4. **Research, wave 2.** Eight agents retried the most valuable gaps, under rules updated with what the review found
   (`RULES-R4b.md`).
5. **Independent review, wave 2:** 18 flagged prices and a random sample of 22.
6. **Decisions.** Every correction is recorded in `review-decisions.json` (36 decisions) and applied by `apply-review.py`
   to the raw agent output (kept unchanged in `raw/`). Each decision is written into the part's notes.
7. **Merge** through `scripts/pcb-catalogue-research-merge.ts` (never by hand), then the catalogue audit, the board
   baselines, the full test suite and this report.

## 2. What was added

| Category | Parts before | Parts after | Distributor-priced before → after | AEC-Q after | 2+ distributors after |
|---|---|---|---|---|---|
| ic_soic | 352 | 421 | 265 → 336 | 383 | 126 |
| ic_qfn | 280 | 333 | 206 → 265 | 279 | 89 |
| ic_tqfp | 119 | 141 | 94 → 118 | 120 | 42 |
| ic_bga | 103 | 111 | 82 → 90 | 95 | 32 |
| fuse_tvs | 85 | 87 | 51 → 54 | 74 | 16 |
| passive_1206 | 49 | 67 | 39 → 57 | 62 | 22 |
| through_hole | 55 | 62 | 33 → 40 | 47 | 8 |
| crystal_osc | 38 | 43 | 24 → 29 | 28 | 2 |
| passive_0805 | 30 | 37 | 19 → 26 | 33 | 11 |
| passive_0603 | 26 | 31 | 20 → 25 | 26 | 9 |
| passive_0402 | 22 | 30 | 17 → 25 | 27 | 14 |
| connector_smt | 16 | 18 | 5 → 7 | 13 | 1 |
| led / transformer / mechanical / relay / power module | 42 | 44 | 25 → 27 | 34 | 8 |
| **Total** | **1,217** | **1,425** | **880 → 1,099** | **1,221** | **380** |

The merge added 208 new parts, replaced 11 estimates with distributor prices, and cross-checked 15 entries already priced
(observations added).

**Highlights by domain:**
- **Automotive compute:** Infineon AURIX TC4D7 (the newest family), RH850/F1KM and F1K, NXP S32K342, i.MX 93 automotive,
  RL78/F24, TLE9853 motor MCU, PIC32CK; plus industrial i.MX 8M Nano / Mini, PIC32CM, STM32G4, AVR-DA, PIC18-Q84.
- **Memory:** Micron LPDDR5 automotive, ISSI automotive serial NOR, ST / onsemi automotive EEPROM, Infineon automotive
  F-RAM; industrial staples (Winbond, Macronix, GigaDevice, SPI NAND, SRAM).
- **Power:**
  - SiC MOSFETs (onsemi EliteSiC, Infineon CoolSiC, Rohm, ST), GaN (EPC, Infineon CoolGaN), IGBTs;
  - NXP gate drivers, LFPAK / TOLL MOSFETs;
  - smart switches (ST VNF1048F eFuse, NXP MC33XS2410, TI TPS1HC100-Q1 / TPS48111-Q1);
  - automotive bucks (ST A6983, MPS MPQ4430 / MPQ8875, TI LM25149-Q1), SBC TLE9263, LDOs, LED driver TLD5099.
- **Networking:** 10BASE-T1S (Microchip LAN8650 / LAN8670 / LAN8671, onsemi NCN26010), Ethernet switch KSZ9567, CAN FD
  (TJA1465, MCP2562FD, TLE9351, NCV7357), LIN (TLIN2029-Q1, TJA1029 / 1028 / 1124, ATA6561 / 6570), CAN FD controller
  MCP251863, USB redriver TUSB1146-Q1.
- **Sensors / analog:**
  - current (Allegro ACS71240 / 72981 / 37612, Melexis MLX91221 / 91230, TI INA241-Q1 / INA296-Q1);
  - position (TLE5501, AS5047U / AS5147P, TMAG5170-Q1 / 5273-Q1, MLX90377 / 90395 / 90427, A33002);
  - inertial (BMI088, ST AIS2IH / AIS2DW12 / IIS3DWB, TDK IAM-20380HT, Murata SCH16T);
  - pressure / temperature / humidity (KP254, FXPS7115, BMP390, TMP126-Q1, LMT01-Q1, SHT45);
  - isolators (ISO6741-Q1, ADuM1250 / 141E), ADC (ADS131M04-Q1), Class-D audio (TAS6584-Q1 / 6684-Q1).
- **Connectivity / general:**
  - automotive GNSS (u-blox NEO-M9V), UWB (Qorvo DW3300Q automotive, NXP NCJ29D5), NFC (ST25R3916 / 3920 automotive,
    PN7462);
  - Wi-Fi / BT (CYW43439, nRF5340, nRF52840, nRF54L15, ESP32-S3 / C6 modules);
  - MCUs (STM32H563 / G070 / G071 / F030 / U575, i.MX RT1062, RP2350, ATmega328P, SAMD21);
  - USB-UART (CP2102N, FT232RL), Ethernet PHYs (KSZ8081, LAN8720A), Lattice MachXO3D.
- **Passives matrix:**
  - MLCC (0201–1210, X7R / X7S / C0G, automotive GCM / GCJ / CGA and their commercial GRM / CL / CC equivalents);
  - resistors (0402 0 Ω to 2512 power, anti-sulfur ERJ-UP / ERJ-S / ERJ-U, thin film ERA / TNPW);
  - shunts (WSL2512 1 / 2 mΩ, Bourns CSS2H);
  - ferrite (BLM21PG), power inductors (Vishay IHLP automotive), CAN / IVN chokes (TDK ACT1210);
  - automotive aluminium / hybrid polymer (Panasonic EEE-FK / EEH-ZA, Nichicon UCZ, Chemi-Con HXC), KEMET T598 / T495
    tantalum, DC-link film (TDK B32776, Vishay MKP1848C).
- **Interconnect / discretes:**
  - AEC-Q101 small-signal (BSS138BK, 2N7002BK, BC847B / 857B, BAS16, MMBT3904, BZX84, BZT52-Q, DMP3098LQ);
  - CAN / IVN ESD (PESD2IVN24, CDSOT23-T24CAN-Q, AQ24CANFD), load-dump TVS SM8S36A;
  - Molex MX150 / Mini50 headers, Hirose DF40C;
  - crystals (Epson FA-128, Kyocera CX2016 automotive, Murata XRCGB), OSRAM G6SP LEDs, Panasonic CB1 automotive relay,
    Littelfuse 885 fuse, C&K KMR switches.

## 3. Quality — what the review found and what was done

**Error rate (random samples, the honest measure).**
- **Wave 1:** of the 14 sampled prices the reviewer could check, 3 were wrong.
  - Two came from sources the merge already rejects: a Source ESB price and an AUD price.
  - One would have entered the catalogue: a Newark **Canada** price recorded as USD (37% high).
- **Wave 2:** 13 of the 14 checkable prices were within ±25%. The 14th was a source fix, not a wrong price.

So about **1 in 28** checked prices that would have reached the catalogue was wrong. The sample is small; treat it as an
order of magnitude, not a guarantee. Every price in the samples was corrected or confirmed.

**Corrections (36 decisions, `review-decisions.json`):**
- **Removed:**
  - VAT-inclusive China prices (Digi-Key China, element14 China: ADIN1110, LM25149, SQM120N04, BUK7J1R0);
  - figures the search summary only rounded ("about R155");
  - a stale reel price dearer than the cut-tape break;
  - a reel price derived from a reel total on a zero-stock listing.
- **Corrected by a reviewer with a verified listing:**
  - NVBG020N120SC1: RS Malaysia MYR price ≈ 3× the market → Future $30.43 @800;
  - TLE5501 (ciiva → Digi-Key via Findchips);
  - Yageo CC0603 1 µF ($0.0629 → $0.0161);
  - GCM188R71E105KA64D;
  - BAS16;
  - TJA1124 (CAD read as USD);
  - VNF1048F;
  - AIS2IH (Source ESB → Farnell);
  - IHLP4040 automotive (Future $1.33–1.43 → Digi-Key $0.6265);
  - ATA6570.
- **Dropped:** parts the reviewer could not tie to their code or confirm:
  - an Omron relay (Source ESB only);
  - RH850 #BA1 (the price was the #AA1 sibling's);
  - W25Q64JV (rounded);
  - a Murata GCJ (a generic Findchips search);
  - two Lattice ECP5 (URL only a best match; a reseller showed ~3×);
  - a TE MATEnet header (the URL described a 28-way part);
  - ADBMS6832 (cell count and price inconsistent with ADI's list);
  - a duplicate NCJ29D5;
  - FXPS7115DS4;
  - a Littelfuse fuse;
  - TDK CGA3E2 C0G;
  - TLE4941 (a not-recommended bare code).
- **Merge-rule defect found and fixed** (`pcb-catalogue-research-merge.ts`, rule 3):
  - The outlier check worked per observation. On an MLCC whose distributors genuinely disagree, it removed 4 of 5
    readings and kept one RS price, and one distributor's two breaks counted as two votes.
  - It now judges per distributor, drops a distributor only when the others agree with each other, and never drops the
    majority.
  - No entry already in the catalogue changes (audit 0 errors). A test pins it.

**Known spreads (not errors, but read prices with them in mind):**
- **MLCC and resistor reel prices** differ **4–14×** between distributors for the same code (LCSC $0.0096 v RS £0.066 v
  Future $0.135 for one Murata 0603). The catalogue keeps every distributor that agrees with another and states the spread.
- **Future Electronics** listings sat about **2×** other franchised distributors on several parts (IHLP4040, MX25L12833).
- **Distributor prices are not contract prices.** An OEM / EMS buying at 100k+ typically pays less, especially for
  passives. The 100k–300k breaks are DERIVED from each part's own slope or the franchise curve, as before.

## 4. What changed for costing

**Measured on the 219 parts now distributor-priced.** Before this round, a BOM line naming one of these parts was priced
from its class range or an old estimate. For **53%** of them that figure was more than 2× away from the sourced price:
59 were too low and 56 too high. Examples:

| Part | Before (class or estimate) | Now (sourced) |
|---|---|---|
| 1200 V SiC MOSFET NVBG020N120SC1 | £1.01 ("power MOSFET DPAK-class") | £22.62 |
| Murata SCH16T 6-DOF IMU | £0.51 ("SOIC IC, unidentified") | £31.40 |
| KEMET T598 polymer tantalum | £0.09 ("MLCC 1206") | £1.18–2.15 |
| Vishay MKP1848C DC-link film | £0.49 ("through-hole, unidentified") | £7.20 |
| Infineon CYW43439 Wi-Fi / BT | £44.50 ("BGA IC, unidentified") | £2.25 |
| TI TLIN2029-Q1 LIN | £7.75 ("RF IC QFN") | £0.40–0.46 |
| NXP i.MX RT1062 | £53.50 ("SoC BGA") | £3.95 |

The worst misses are classes the class table does not have: SiC power devices, polymer tantalum, film capacitors, IMUs,
crossover MCUs. See §6.

**Radar and camera boards:** the Stage-4 baseline (`scripts/pcb-review-2026-10-09/stage4.mts`) is unchanged to the penny.
None of the new parts is on those two boards, so nothing already costed moved.

## 5. What is still missing (honest)

The research queue (`scripts/pcb-research/queue.json`) now lists 486 parts without a price, each with the reason:

| Group | Parts | Meaning |
|---|---|---|
| noUsablePrice | 243 | Searched; only excluded sources, VAT-inclusive, rounded or conflicting figures |
| notReached | 136 | The search budget ran out first |
| codeMayNotExist | 41 | The code as listed is not orderable — find the real automotive code |
| ndaOrDirect | 35 | OEM-direct / NDA: no public price exists |
| qty1Only | 23 | Listed only below 100 units |

**Biggest remaining gaps:**
- **Automotive storage:** eMMC, UFS, DDR3L / DDR4 and automotive LPDDR4. They are sold mostly to car makers under contract;
  two waves found no franchised price at ≥ 100. **Supplier quotes are needed.**
- **The newest automotive SoCs:** NVIDIA Orin / Thor, Mobileye EyeQ, Qualcomm SA8xxx, R-Car V4H, Ambarella CV3. OEM-direct,
  not priced; the catalogue keeps the labelled estimates from round 2.
- **Coax and data connectors:** Rosenberger H-MTD / FAKRA, TE HFM, Amphenol FAKRA.
- **Some passives cells:** 0603 2.2 / 4.7 µF, 1206 high-voltage MLCCs, KOA / Isabellenhütte shunts, Coilcraft XAL,
  Würth power inductors. The MLCC and resistor reel prices that were added carry wide distributor spreads.
- **Automotive Wi-Fi / BT combos, cellular modules, automotive FPGAs (Zynq XA).**

**Accuracy against real purchase prices is unmeasured.** There are no actuals in `scripts/actuals/pcb-actuals.csv`.

## 6. Recommendations

1. **Supplier quotes** for automotive eMMC / UFS / DDR / LPDDR4 and the coax connectors. Web research cannot price them.
2. **Add class rows** to `server/utils/pcb-class-pricing.ts`, from this round's sourced prices: SiC MOSFET / IGBT
   (TO-247 / D2PAK-7), polymer tantalum, film capacitor, 6-DOF IMU, crossover MCU. That way an unread line of these kinds
   stops falling to a generic range. Not done here: it changes how every unread line is priced and needs its own review.
3. **One vote per distributor in the 1k median (merge rule 4).** It would stop a distributor with several breaks
   dominating, but it re-prices 43 entries already in the catalogue. It needs a decision and a baseline review.
4. **Real purchase prices** in `scripts/actuals/pcb-actuals.csv`, to measure accuracy at all.

## Files
- `scripts/pcb-research/2026-10-13-gap/`:
  - `RULES-R4.md`, `RULES-R4b.md`, `tasks/` — rules and task lists;
  - `raw/` — the agents' output, unchanged;
  - the cleaned research files;
  - `review/` — reviewer lists, rules and verdicts;
  - `review-decisions.json` + `apply-review.py`;
  - `validate.mts`, `has.py`, `coverage.py`;
  - `merge-report.json`.
- `server/data/pcb-component-catalogue.json` (merged), `scripts/pcb-research/queue.json` (updated),
  `scripts/pcb-research/family-links.json` (the TLE9263 link removed: the family key is now carried by its priced member,
  TLE9263BQXV33XUMA1, as earlier rounds did for S25FL512S, TJA1042, TDA4VM and others).
