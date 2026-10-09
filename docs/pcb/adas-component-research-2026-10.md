# ADAS PCB components — research round (9 October 2026)

**Result.** The component catalogue now holds **1,018 parts, 679 of them priced from franchised-distributor listings**
(before: 843 / 497). Of a 480-part ADAS reference list, **271 parts now resolve to a distributor price** (before: 94).
The vehicle-electronics library now describes **9 ADAS ECU types** (before: 2), each board fact either linked to a
source or labelled engineering judgement.

**Round 2 (same day, §8).** The catalogue now holds **1,106 parts, 764 distributor-priced**. Of round 1's 399
researched parts, **219 now resolve to a distributor price** (was 196). Four new gap lists add **73 parts** that
resolve to a distributor price. **Four OEM-direct chips** (EyeQ4, EyeQ6L, EyeQ6H, CV2AQ) carry labelled estimates
from the makers' own disclosed selling prices.

**What this is not.** These are distributor list prices at 100–5,000 units, not OEM or Tier-1 contract prices.
For high-volume programmes the catalogue extends them with a stated volume slope; those extended prices are
derived, not quoted. Accuracy against real purchase prices is still unmeasured: there are no ADAS actuals in
`scripts/actuals/`.

## 1. How it was done

- **Part list.** 480 ADAS candidates were drawn up in 8 domains: compute, radar, camera, data links, power,
  memory and timing, sensors (park / LiDAR / DMS), and passives / discretes / connectors.
  - 81 were already distributor-priced with listings and were left out.
  - That left **399 parts to research**, 45 of them catalogue estimates to replace.
- **Sources.** Web search of franchised distributors only (Digi-Key, Mouser, Arrow, Avnet, Farnell / Newark,
  RS, TME, Rutronik, Future, TTI, LCSC, Master), or aggregators that name the distributor (Findchips,
  TrustedParts, Octopart, Digipart).
  - Brokers, marketplaces, datasheet sites and manufacturer list prices were not used as prices.
  - Manufacturer list prices are kept in the notes where found.
  - Every price records distributor, quantity break (100 units or more), price, currency, link and date.
- **Two passes.**
  - First pass: ten agents searched at once and shared one search budget, which ran out after about 36 parts.
  - Second pass: one domain at a time, which completed every list.
- **Merge.** Results went through the catalogue's existing merge script with its rules unchanged, then the
  catalogue audit (0 errors required). The rules:
  - median across distributors at 1k;
  - volume slope from one distributor's own breaks;
  - outliers dropped;
  - prices above the largest published break labelled "derived".
- **Raw research.** All of it is in `calculator/scripts/pcb-research/2026-10-09-adas/` (one file per domain,
  plus `merge-report.json` and `audit-exclusions.json`).

## 2. Results by domain

| Domain | Researched | Priced | 2+ distributors | Priced on a non-AEC code | Not distributor-sold |
|---|---|---|---|---|---|
| Compute (SoCs, safety MCUs, FPGAs) | 50 | 17 | 8 | 0 | 14 |
| Radar | 41 | 15 | 5 | 3 | 11 |
| Camera | 51 | 11 | 3 | 1 | 14 |
| Data links (SerDes, Ethernet, CAN) | 42 | 32 | 6 | 3 | 1 |
| Power A (PMICs, SBCs) | 30 | 17 | 2 | 1 | 0 |
| Power B (point-of-load, LDOs, protection) | 29 | 15 | 4 | 4 | 4 |
| Memory and timing | 56 | 30 | 7 | 13 | 4 |
| Sensors / park / LiDAR / DMS | 40 | 13 | 1 | 4 | 2 |
| Passives, discretes, connectors | 60 | 46 | 16 | 5 | 0 |
| **Total** | **399** | **196** | **52** | **34** | **50** |

"Priced" counts the research after the exclusions in §4.

**Merge outcome:**
- **Added:** 175 parts.
- **Estimates replaced by real prices:** 7 (TDA4VE, TJA1100, W25Q256JW, SiT2024, SCL3300, TMP117, TMP451).
- **Existing prices cross-checked or given their missing links:** 11 (S32K344, TC397, SPC584B, PESD1CAN, TJA1462 and others).
- **New reviewed family links:** 6 (CX3225, LM5145, TPD4E05U06, TC499, S32G274, S32G399). A BOM line that names
  only the family now takes the researched automotive part's price and stays labelled an estimate.

**Examples now priced from distributors:**
- **Compute:** TI TDA4VH / TDA4VE / AM62A, NXP S32G399 / S32G274 / S32K396 / S32V234, Infineon AURIX TC397 / TC387 / TC377 / TC4D9 / TC499, ST SPC58NH92.
- **Radar:** TI AWR1243, Infineon BGT60ATR24C / BGT24ATR22, radar PMICs LP87745 / LP87702.
- **Camera:** onsemi AR0147AT / AP0101AT, serializers DS90UB933 / 913A / 971 and MAX9295D.
- **Data links:** FPD-Link III / IV deserializers, GMSL2 hubs (MAX96714 / 716A / 724 / 722), Ethernet PHYs and switches (DP83TC812, TJA1100, Infineon / Marvell 88Q2220 / 88Q5072, SJA1110B, LAN937x), CAN-SIC (TJA1462, TCAN1462).
- **Power:** TPS6594, FS8530 / FS8430, PF8100 / PF7100 / PF5020, TLF35585, LM61460, LM74720.
- **Memory:** automotive eMMC 32–128 GB, octal / HyperFlash NOR, 25 MHz automotive oscillators.
- **Sensors:** LiDAR parts (LMG1025, OPA855 / 858, EPC GaN), park assist (PGA460), IMUs (ASM330LHB / LHHX).
- **Passives, discretes, connectors:** AEC-Q200 MLCCs, power-over-coax inductors, FAKRA / HSD / HFM board connectors.

## 3. What is not priced, and why

- **Sold only to carmakers / under NDA (50 parts).** Confirmed absent from franchised distributors:
  - Mobileye EyeQ4 / 5 / 6L, Ambarella CV2AQ / CV3, NVIDIA DRIVE Orin (bare SoC), Qualcomm SA8650P / SA8540P;
  - Renesas R-Car V3H / V3M / V4H / V4M / H3;
  - NXP TEF810x / TEF82xx, S32R41 / S32R45, SAF85xx; Infineon RXS / CTRX radar;
  - Sony IMX / ISX and most OmniVision automotive imagers;
  - Broadcom BCM89881, Elmos ultrasonic ICs, Bosch SMI240 / SMI330.

  These need supplier quotes. The catalogue keeps its estimates (or class ranges) for them.
- **No listing at 100+ units:**
  - TDA4VL / AL / VEN / AEN;
  - AMD automotive FPGAs (single-unit prices only);
  - TMS570LC4357 (90-piece tray);
  - most automotive LPDDR4 / LPDDR5 codes;
  - several TI PMIC variants (LP8764, TPS6593, TPS65219).
- **No automotive variant exists (left out or priced on the standard part with `aecq: false`):** LSM6DSOX,
  VL53L5CX, TMP116-Q1, TDC7200-Q1, TPS7A94-Q1, TPS7A91-Q1, CDCLVC1102-Q1, TLV760-Q1, TPS25985-Q1, TPS548A28-Q1.
- **Part numbers on the list that may be wrong — check the source BOMs:** TPS2HB08-Q1, MAX20025, TPS62440-Q1,
  TEF8105, TEF8233, FS6531.

## 4. Decisions and quality flags

**Not used** (`audit-exclusions.json`):
- **AWR1443:** one Digi-Key Germany price, not confirmed as excluding VAT. The estimate stayed in round 1; round 2
  priced the tray code on a normal Digi-Key listing (§8).
- **Three OmniVision sensors:** prices only on an LCSC staging host (`fat.lcsc.com`) with 0 stock.
- **An X5R capacitor:** used as a stand-in for an X7R automotive part (lower temperature class).
- **A Molex Mini50 wire-side housing:** not a board connector.

**Labelled on the entry:**
- **Digi-Key "punchouttest" pages (14 parts in round 1; 4 after round 2):** priced only from these regional
  storefronts, which no earlier round used. Each says so and should be checked against the live Digi-Key page
  before quoting. Round 2 made this a merge rule (§8).
- **BGT60ATR24C:** carries Digi-Key's last-time-buy date (31 Oct 2026).

**Correction:** the MAX20019 description now reads dual 500 mA camera buck (it said dual 3 A).

**Read with care:**
- **Non-automotive codes:** 34 parts are priced on industrial or commercial codes, marked `aecq: false`. These
  are mostly oscillators and crystals, some flash, LMK6C, TPS7A9x and standard-grade discretes.
- **Small breaks:** 34 parts have no break of 500 or more, so their 1k price is moved along the default slope
  from a 100–490 break. Examples: TDA4VH at 200, eMMC at 100–250, GMSL hubs at 100.
- **Disagreeing distributors:** 3 parts have distributors more than 2× apart (S25HL512, MX25U25645, BAT54-Q).
  The median is used and every listing is on the entry.
- **GMSL reel prices:** Digi-Key lists MAX96714 / 96792A / 96752 reels above their small-break price. Both
  breaks are kept; the merge clamps the slope.
- **Lookup gap:** the catalogue's prefix lookup prices "TDA4VEN" as TDA4VE. They are different TI variants. This
  is a lookup limitation, not a price; until it is fixed, a TDA4VEN line should be checked by hand.

**Spot check (independent searches, 9 Oct):**

| Part | Result |
|---|---|
| DS90UB934 | Matches exactly: $9.98 at 1k, $9.20 at 2.5k |
| LM74720-Q1 | Matches exactly: Digi-Key $1.32 / $1.16, LCSC $1.59 |
| TC397 | Consistent with Mouser UK's break range |
| GCM31CR (Avnet) | Matches ($0.193). The Digi-Key break could not be re-found |
| TDA4VH | **Not confirmed.** Mouser India lists it as a new product with stock due August 2026 |

**Effect on existing costings:** none on the traced reference boards. All 375 PCB tests pass, including the
radar and camera board traces. The full suite passes: 3,571 tests.

## 5. Boards — the vehicle-electronics library

**New ECU types.** Seven are added, each under every powertrain: surround / rear camera, driver monitoring,
corner radar, 4D imaging radar, ADAS domain controller, park assist and LiDAR. Front camera and front radar are
updated.

**Sourcing.** Of 63 key-IC rows, 62 carry a link. Of about 45 board facts, about 18 carry a link, about 10 are
engineering judgement and the rest are "not published". 38 teardown references are attached.

**What the sources establish:**
- **Radar boards:** an asymmetric hybrid stack. A PTFE RF layer with planar antennas is bonded to FR4 (Bosch
  LRR4 / MRR, Continental ARS4, Autoliv), on two boards (RF / antenna + digital / power). The RF laminate is
  mostly Rogers RO3003 / RO3003G2; Japanese makers use Panasonic R-5515.
- **Corner radar:** moving to cheaper hydrocarbon laminates (Aptiv R3TR) and waveguide antennas (Gapwaves).
- **4D radar:** the Continental ARS540 uses a moulded waveguide antenna instead of an RF substrate.
- **Front camera:** a tri-camera (ZF S-Cam4) is three imager boards plus a main board.
- **Satellite cameras:** usually two or three stacked boards.
- **LiDAR:** multi-board. The Hesai AT128 has power, processing, emission and reception boards.

**Cost evidence found:**
- Tesla HW4: priced 3× HW3, but its manufacturing cost is only about 32 % higher (TechInsights).
- TI radar boards: through vias instead of microvias saved about 40 % of PCB cost.

**Not public.** No source gives a production ADAS board's layer count, HDI build, size, placement count or
£ / m² laminate premium. Those sit in paywalled Yole / TechInsights reports, so those fields stay engineering
judgement.

## 6. Decisions

**Decided 9 Oct 2026:**
- **Imagers: the automotive volume rule.** A named imager (catalogue or live hit) is priced by the imager class rule
  (£3–15 at volume, scaled to the order), exactly like an unnamed one. Its distributor listing is kept on the line
  as a reference (`distributorListingGBP`, printed in the price note). Implemented with `IMAGER_RE` in
  `server/utils/pcb-bom-grounding.ts` and pinned by `tests/pcb-imager-volume-rule.test.ts`. The PCB analysis cache
  version is now 11.
- **LCSC stays in the median.** The merge rules are unchanged.

The original questions, kept for the record:


1. **Named imagers.** A camera BOM line that names its imager is priced at the distributor listing (e.g.
   AR0233AT ≈ £24, AR0147AT). An unnamed imager gets the automotive volume rule (£3–15). Pick one basis.
   Recommendation: the volume rule for imagers, with the listing shown as a reference.
2. **LCSC in the median.** LCSC often lists 2–3× below Digi-Key / Mouser (e.g. TCAN1145 $0.70 v $1.70). Keep it
   in the median (current rule), or record it separately as a China-market price?
3. **OEM-direct parts.** EyeQ, R-Car V, TEF82xx, S32R4x, Sony / OmniVision imagers and Orin will only ever be
   priced from supplier quotes. Real quotes go in `scripts/actuals/` and are compared, never tuned in.
4. **Refresh.** Prices are dated 9 Oct 2026. A Nexar / Octopart key would allow a scheduled refresh (see the
   blueprint document) instead of web search.

## 7. Files

- `calculator/server/data/pcb-component-catalogue.json` — the catalogue (merged).
- `calculator/server/data/pcb-ecu-library.json` — the ECU library (merged by `scripts/pcb-ecu-library-merge.ts`).
- `calculator/scripts/pcb-research/2026-10-09-adas/` — raw research, task lists, merge report, exclusions; boards in `ecu-map-adas-boards.json`.
- `calculator/scripts/pcb-research/family-links.json` — 6 new reviewed links.
- `calculator/tests/pcb-adas-catalogue.test.ts` — pins the round (parts, exclusions, labels, audit, ECUs).

## 8. Round 2 (9 October 2026)

**What was asked.** Three steps:
- **A.** Retry the parts round 1 could not price.
- **B.** Fill gaps in what an ADAS board carries.
- **C.** Gather public cost evidence for OEM-direct chips, added only as labelled estimates.

**How.**
- One agent searched at a time, so the shared search budget was not split.
- The rules in `scripts/pcb-research/2026-10-09-adas-r2/RULES-R2.md` applied, at most 4 searches per part:
  - retry order: other orderable codes, then other franchised distributors, then USD / EUR / GBP sites, then
    aggregators that name the distributor;
  - Digi-Key "punchouttest" storefronts and LCSC's staging site (`fat.lcsc.com`) were forbidden.
- Everything went through the same merge script and audit (0 errors).

### 8.1 Retries — round 1's 399 parts

"Priced" means the part, or the corrected code round 2 found for it, resolves to a distributor price.

| Domain | Parts | Priced before | Priced after |
|---|---|---|---|
| Compute | 50 | 17 | 18 |
| Radar | 41 | 16 | 17 |
| Camera | 51 | 11 | 14 |
| Data links | 42 | 32 | 35 |
| Power A | 30 | 17 | 18 |
| Power B | 29 | 15 | 19 |
| Memory and timing | 56 | 32 | 34 |
| Sensors / park / LiDAR / DMS | 40 | 13 | 17 |
| Passives, discretes, connectors | 60 | 43 | 47 |
| **Total** | **399** | **196** | **219** |

The "before" column is the catalogue at the start of round 2. It differs slightly from §2 because
cross-checks moved a few parts between rows.

**What the retries found:**
- **Corrected codes.**
  - DRV5055A1QDBZRQ1 does not exist; the automotive part is DRV5055A1EDBZRQ1.
  - TPS74801-Q1 is TPS74801TDRCRQ1.
- **Sibling codes, each saying so on its entry.**
  - AWR1443: the tray code.
  - TPS650002-Q1, F28386 and MT35XU512: each priced on a sibling code.
- **Test-storefront prices replaced by normal listings** on 6 sensors parts: IAM-20680HT, OPA855 / OPA858-Q1,
  TMP117, TMP451-Q1 and ASM330LHB.
- **Codes on the round-1 list that appear not to exist — check the source BOMs:** GCM155R71E224KE02D,
  TPD1E04U04-Q1, BUK7M10-40H, 2387271-1, 1-2112996-1, SCHA634-D03 (Murata's current part is SCH1633-D05) and
  2337020-1.
- **Still sold by quote only:** Bosch SMI240 / SMI330, TDK IAM-20685, Elmos E524 / E521, Murata MA58MF14,
  LMH32401-Q1, ADPD2140, LP8764-Q1, TPS650320-Q1.

### 8.2 Gap lists — new parts

| List | Entries | Resolve to a distributor price | Of those, AEC-Q |
|---|---|---|---|
| Optics: LiDAR lasers, VCSELs, IR LEDs, DMS / ToF sensors, SiPM / APD, comparators, GaN, gate drivers | 32 | 17 | 9 |
| Coax / EMC / connectors: PoC inductors, beads, CMCs, Ethernet ESD, H-MTD, shields | 27 | 15 | 14 |
| SoC support: PMICs, LDOs, load switches, supervisors, monitors, redrivers, logic, I2C, high-side switches | 34 | 23 | 23 |
| Passives matrix: automotive MLCC / resistor / bead / inductor / tantalum / crystal / Schottky cells | 22 | 18 | 18 |
| **Total** | **115** | **73** | **64** |

The passives matrix also has 12 cells already covered by catalogued parts. They are recorded as `MATRIX-Lnn`
placeholders, which carry no price and so never enter the catalogue.

**Read with care:**
- **Not automotive.** The optics list prices 8 parts that are not automotive-grade, or whose grade is
  unconfirmed. Each is marked `aecq: false` with the reason; examples are LMH6401, TDC7201, MAX40026 and
  SiPM / APD parts.
- **Last-time buy or obsolete:** MLX75027 and EPC2219 (last-time buy), AR0144AT (last stock).
- **Close substitutes, each explained in its notes:** X5R / X6S / X7S dielectric where no automotive X7R part
  exists, and a higher-voltage tantalum.
- **Connectors.** The automotive camera / data connectors are still mostly unpriced: Amphenol HFM, Molex
  HSAutoLink, Rosenberger Mini-FAKRA, TE MATEnet / HSD, JAE MX34 / MX64. These makers sell by quote or list only
  single pieces. One H-MTD board plug (E6S20A-40MT5-Z) is priced.

### 8.3 Merge rule added (1a)

`scripts/pcb-catalogue-research-merge.ts`, tested in `tests/pcb-adas-catalogue.test.ts`:
- **Staging site.** A price from a distributor's staging copy (`fat.lcsc.com`) is never used.
  MTFC32GAZAQHD-AAT had only that price, so it leaves the catalogue.
- **Test storefront.** A Digi-Key "punchouttest" price is used only when no other listing passes, and the entry
  says so. 4 entries remain priced this way: DS90UB933, TPS65941213, LT8638S, TPS7A9401.
- **Same row on a normal listing.** It replaces the test-storefront read.
- **Re-pricing.** An entry whose stored prices the rules now read differently is re-priced.
- **Effect on round 1.** Six round-1 entries lost test-storefront rows and were re-priced, for example
  TJA1462AT £0.49 → £0.43 at 1k and TPS16632 £1.69 → £1.91.

**Audit decisions** (`2026-10-09-adas-r2/audit-exclusions.json`):
- **Excluded:** 1-1534229-1. Its TE connector type could not be identified.
- **Marked DISPUTED on the entry:**
  - PGA450-Q1: Digi-Key $5.49 at 2k against TI's own price of about $2.60 at 1k.
  - MFS2633AMDAKADR2: the stored price equals a sibling code's price exactly.
  - TXB0104-Q1: two Digi-Key listings disagree.
  - Two Murata beads (BLM15PX121SH1D, BLM15GG471SH1): they were priced on the SN1 code, which round 2 found is
    Murata's standard grade, not the automotive one.

**Family links added:** INA226, TMP102 and TXS0108E now take their AEC-Q100 member's price and stay estimates.

### 8.4 OEM-direct chips — public cost evidence

`scripts/pcb-research/2026-10-09-adas-r2/evidence/oem-evidence.json` has 28 groups and 22 claims: 10 company
disclosures, 6 teardowns, 4 analyst figures, 2 list prices. Each claim carries its publisher, context and URL.
Nine groups have at least one claim; 19 have none. The quotes are as web search showed them, not read from the
source page.

**Applied by `scripts/pcb-oem-evidence-merge.ts`:**
- **Catalogue estimates.** Only a per-chip figure the chip's maker states (an annual report or earnings call)
  prices an entry. The entry is a labelled estimate, flat across volumes (it already is a programme-volume
  average selling price), with every claim and link in its source.

  | Entry | Price | Basis |
  |---|---|---|
  | EyeQ4, EyeQ6L | $46 = £34.74 | Mobileye's base ADAS price per system, Aug 2026 |
  | EyeQ6H | $125 = £94.41 | Mobileye's Surround ADAS price. The company also gave $100–150 and an analyst $150–200 |
  | CV2AQ | $20 = £15.11 | Ambarella's CV2-family average, automotive and IoT together, Aug 2023. The automotive part may be higher |

  Mobileye's price includes its software. That is what a Tier 1 buys per camera, so it is the right cost for a
  BOM line; it is not silicon cost.
- **Unit-level figures** went to the ECU library's board-cost evidence, not the catalogue: Hesai's 2025 average
  LiDAR selling price (about $260) and ATX ($200), Valeo Scala electronics core ($70 / $110, Yole), Audi zFAS
  ($290 System Plus; $365.75 IHS at 125k / yr), and the LG front camera ($249, TechInsights, basis unclear).

**Not applied, and why:**

| Group | Why not |
|---|---|
| NVIDIA Orin | The figure is the Jetson module's list price ($1,599 in 2022, $2,999 in 2026): an upper bound, not the DRIVE chip |
| Ambarella CV3 | The stated range is $50 to more than $400 |
| Horizon Journey | A blended analyst figure, low confidence |
| LPDDR memory | A mobile contract price (about $10 / GB). The automotive distributor entries are 1.3–2.8× it, which is expected for automotive grade |
| EyeQ5, R-Car V3H / V4H / H3, TEF82xx, S32R4x, SAF85xx, RASIC, Sony / OmniVision imagers, OAX4010, Elmos, Bosch SMI, Broadcom Ethernet | No public figure; teardown costs are behind paywalls |
| TI AWR2944 / AWR2544 | ti.com's list price did not come through search. **Check it by hand** |

### 8.5 What this does not change

- These are distributor list prices at 100–5,000 units, or (§8.4) maker-stated average selling prices. None is
  a contract price for a programme.
- Accuracy against real purchase prices is still **unmeasured**: there are no ADAS actuals in `scripts/actuals/`.
- The prefix-lookup gap (TDA4VEN priced as TDA4VE, §4) is still open.

### 8.6 Files

- `calculator/scripts/pcb-research/2026-10-09-adas-r2/` holds:
  - one file per retry domain and per gap list;
  - `evidence/oem-evidence.json`;
  - `merge-report.json` and `audit-exclusions.json`;
  - `RULES-R2.md` and the task lists.
- `calculator/scripts/pcb-oem-evidence-merge.ts`: OEM evidence into catalogue estimates and board evidence.
- `calculator/scripts/pcb-catalogue-research-merge.ts`: rule 1a.
- `calculator/tests/pcb-adas-catalogue.test.ts`: round 2 rules, parts, decisions and OEM entries.
