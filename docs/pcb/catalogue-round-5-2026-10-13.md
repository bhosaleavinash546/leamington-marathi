# PCB component catalogue — round 5: verify and extend (13 Oct 2026)

**Request.** Leadership asked for more: add the missing parts, verify what is already there by deep research with
multiple agents, and make the PCB Image → BOM cost tool best in class, with accuracy and no hallucination.

**Result:**
- The catalogue has 1,432 → **1,443 parts**, 1,106 → **1,118 distributor-priced**.
- Parts priced by **2+ distributors: 382 → 415**. Single-distributor parts: 724 → 703. Entries labelled "distributor"
  but carrying no stored listing: 41 → 36.
- **6 entries removed:** their only stored listing was for another code, or came from a page that cannot price that
  code.
- **31 entries marked DISPUTED** (19 before). Each keeps its price, and its source states the conflict until a quote
  settles it.
- **The class table** got new rows from sourced prices; a BOM line the catalogue does not match is priced from it.
- **11 family keys** are now priced from a reviewed member.
- Two merge defects fixed.
- Audit 0 errors; all tests pass.

## 1. What was done

**Ten agents in parallel** (rules: `scripts/pcb-research/2026-10-13-r5/RULES-R5.md` + `../RULES.md` + R4b):
- **Five verifiers** took the 189 most exposed entries: the 148 single-distributor parts priced at £5+ at 1k, and the 41
  "distributor" entries with no stored URL. Each looked for a second franchised distributor for the exact code, and
  judged the stored price CONFIRMED (±40%), DISPUTED (> 2.5×), WRONG-CODE or UNVERIFIED.
- **Five researchers** took the highest-value gaps from the research queue:
  - automotive compute and wireless;
  - power and analog;
  - networking and memory;
  - interconnect and discretes;
  - passive cells.

**The search budget ran out.** The ten agents used the whole web-search budget of the turn (200 searches, shared). So no
independent re-search of round 5 could run, and the round was split:
- **Merged:**
  - second-distributor observations added to existing entries (cross-checks);
  - new parts priced by **2+ distributors** that agree;
  - the verifiers' wrong-code findings (stored listings removed) and price conflicts (marked DISPUTED).
- **Held:** 32 new parts priced by a single distributor. They are not in the catalogue; they are in
  `held-for-review.json` and the research queue as `pendingReview`, with their observations kept in `raw/`. An independent
  review in the next turn will re-check them before they enter.
- **Rejected as sources:**
  - an observation read on a Mouser category page, a Digi-Key family (base-product) page, or an aggregator search that
    does not name the exact code (7 readings, `decide-r5.py` rule 1);
  - a figure the search summary gave only as "about";
  - VAT-inclusive China storefronts;
  - the Digi-Key test storefront;
  - a 15-month-old Farnell Japan snapshot.

## 2. What the verification found

Of the 189 entries:
- **20 CONFIRMED** by a second franchised distributor.
- **5 WRONG-CODE.** The stored listing was another orderable code:
  - ADBMS2950WFSCCSZ (the ASIL-D grade) was priced on the non-functional-safety ADBMS2950WCCSZ;
  - AD2S1205WYSTZ was priced on the industrial AD2S1205YSTZ;
  - LT8638SJV#WPBF was priced on #PBF from the Digi-Key test storefront;
  - MVR5510AMBA6ES was priced on MVR5510AMBANES;
  - MT29F4G08ABAFAWP-AAT was priced on the industrial IT:F.
- **Most of the rest UNVERIFIED.** For high-value automotive ICs (S32G, RH850/U2A, TDA2/4, AM62A, radar), the second
  distributor showed only 1–50-unit prices, rounded figures, or excluded hosts. About half were not reached within budget.

**Actions:**
- **Removed** (no valid listing left; back in the queue as `codeMayNotExist`): AD2S1205WYSTZ, ADBMS2950WFSCCSZ,
  LT8638SJV#WPBF, MVR5510AMBA6ES, RGS80TSX2DHRC11 (an aggregator search that did not name the code) and
  R7F7015873AFP-C#AA3 (a Mouser category page — round 4 had accepted it).
  - The merge now removes an entry the audit leaves with no observation (rule 7). Before, it would have stayed
    "distributor"-priced on nothing.
- **Marked DISPUTED** (price kept, conflict stated in the source):
  - IS46LQ32512A-046BLA1: Farnell lists the exact code at €20.31 @136, v the stored Mouser price — catalogue ≈ 2.9× higher;
  - NEO-M9V-20B: two distributors ~1.6× the stored price;
  - S32K344EHT1VMMST: the stored price came from a search page that did not name the code; Farnell JP lists the code at
    ~2.2×;
  - SCT060HU75G3AG: Digi-Key ~0.48× the stored price;
  - FS32R294KCMJD: not an orderable code;
  - MPC5744PK1AMLQ9: priced on a sibling that likely differs in frequency grade;
  - LMR33630AQDDARQ1: code not found;
  - MTFC128GBCAUTC-AAT: azcus-only sibling;
  - LTC2949HLXE#3ZZTRPBF: single LCSC listing, another source ~2.2–2.6×;
  - NVHL020N120SC1: the "Avnet" figure equals a Richardson relay;
  - MC33771CTA1AE: possibly under-priced;
  - WSBE8518L1000JKA2: stored price far below every other listing;
  - S32G399AAAK1VUCR: a family page.
- **Re-priced from a sourced listing.** Five entries that had a price but no stored URL (MCP2562FD, SM06B-GHS-TB,
  IRLML6344, TCAN1044AVDRQ1, SI2301CDS) are now backed by a distributor listing.
  - On the radar board this moves one line: TCAN1044A-Q1 from £0.3033 to £0.2505 at 100k, headline −£0.05 (0.08%).

## 3. What was added

| | Parts |
|---|---|
| New parts, 2+ distributors that agree | 17 (TPD1E10B06-Q1, ESD2CANFD24-Q1, PESD2CANFD27V, DMN3404LQ / DMN6075SQ AEC-Q101, PMEG3010, CRCW0805 1 k automotive, Murata DLW32MH101 Ethernet CMC, TDK CGA6M3 4.7 µF 100 V, i.MX RT1176, AVR128DA64, LT8636, OPA388-Q1, SN6507-Q1, BMI270, USB7206C, Panasonic ACT512) |
| Estimate replaced by a distributor price | 1 (SMBJ24A) |
| Existing entries cross-checked / URL-backed | 19 |
| Held for review (single distributor) | 32 |

## 4. Class rows from sourced prices (`server/utils/pcb-class-pricing.ts`)

Round 4 measured that 52% of newly sourced parts had been priced more than 2× wrong by their class range. Most of the
largest misses were kinds the table had no row for. Each new row is the catalogue's own distributor prices at 10k
(p10–p90; the table's basis):

| Row | Evidence | Range (general / AEC-Q) |
|---|---|---|
| SiC / GaN power semiconductor | 24 parts (17 AEC-Q) | £1.60–18 / £4.30–19 |
| Discrete IGBT | 16 parts | £0.95–4.50 |
| DC-link film capacitor | 4 parts | £0.70–6.80 |
| X / Y safety film capacitor | 2 parts | £0.08–0.30 / £0.10–0.35 |
| Tantalum / polymer tantalum (and a 7343 case is no longer an 0603 MLCC) | 6 parts | £0.36–1.42 / £0.55–1.50 |
| IMU / inertial sensor | 14 parts (10 AEC-Q) | £1.40–15.6 / £1.30–5.10 |
| MCU in BGA (was priced as an application SoC) | 12 parts | £3.30–32 / £15.5–32.5 |
| CAN / LIN transceiver in QFN (matched "transceiver" in the RF row) | 7 parts | £0.37–1.75 |

LFPAK56 / TOLL MOSFETs now reach the power-MOSFET row; before, `\blfpak\b` did not match "LFPAK56".
`tests/pcb-class-rows-r5.test.ts` pins every row, and checks that an MCU or SBC mentioning CAN, a radar transceiver, a gate
driver for SiC, a pin header and an MLCC each keep their own range. The radar / camera baseline is unchanged by these rows.

## 5. Reviewed family links

A BOM line that names only a family ("TCAN1462", "LM5060") is priced from a reviewed catalogued member, and stays labelled
an estimate. 11 links were added where the family key names one device and the member is its orderable code:
TCAN1462, LM5060, TPS65313, TAS6424, 74HC595, W25N01, MT41K256M16, AT24C02, ESD9B5, BAS16 and BC857. For example, TPS65313
moves from an estimated £7.06 to the member's sourced £4.52.

## 6. Merge fixes (tests added)

- `applyAuditToCatalogue`: an audit exclusion now also removes a wrong STORED observation and re-prices the part; an entry
  left with none leaves the catalogue. Before, an exclusion filtered only new research, so a proven-wrong listing stayed.

## 7. Still open

- **32 parts held for review** (single distributor). Send a follow-up message and the review can run — the web-search
  budget is per turn.
- **593 parts in the queue:**
  - 251 have no usable price;
  - 201 were not reached;
  - 47 codes may not exist as written;
  - 35 are OEM-direct;
  - 28 are pending review;
  - 23 have quantity-1 prices only;
  - 8 have not been re-searched.
- **What web research cannot price:**
  - automotive memory (eMMC / UFS / DDR — distributors show end-of-life allocation prices with 280–372-week lead
    times);
  - the newest automotive SoCs and safety PMICs (TPS65224-Q1, PF09, MAX20478);
  - coax connectors (FAKRA, H-MTD, HFM).

  **Supplier quotes are needed.**
- **703 parts still rest on one distributor.** The verifiers reached the most expensive ones first; about half of the 189
  were not reached.
- **Accuracy against real purchase prices is unmeasured.**

## Files
`scripts/pcb-research/2026-10-13-r5/`:
- `RULES-R5.md`, `tasks/` — rules and verify / extend task lists;
- `raw/` — agent output, unchanged;
- `decide-r5.py` → `review-decisions.json` + `audit-exclusions.json` + `held-for-review.json`;
- `apply-review.py`, `validate.mts`;
- `merge-report.json`.
