# ADAS PCB components — research round (9 October 2026)

**Result.** The component catalogue now holds **1,018 parts, 679 of them priced from franchised-distributor listings**
(before: 843 / 497). Of a 480-part ADAS reference list, **271 parts now resolve to a distributor price** (before: 94).
The vehicle-electronics library now describes **9 ADAS ECU types** (before: 2), each board fact either linked to a
source or labelled engineering judgement.

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
- **AWR1443:** one Digi-Key Germany price, not confirmed as excluding VAT. The estimate stays.
- **Three OmniVision sensors:** prices only on an LCSC staging host (`fat.lcsc.com`) with 0 stock.
- **An X5R capacitor:** used as a stand-in for an X7R automotive part (lower temperature class).
- **A Molex Mini50 wire-side housing:** not a board connector.

**Labelled on the entry:**
- **Digi-Key "punchouttest" pages (14 parts):** priced only from these regional storefronts, which no earlier
  round used. Each says so and should be checked against the live Digi-Key page before quoting.
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

## 6. Decisions for you

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
