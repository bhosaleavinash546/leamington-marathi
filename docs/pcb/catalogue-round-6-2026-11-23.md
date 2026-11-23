# PCB component catalogue — round 6: latest automotive ICs and SMT parts, priced for 200,000 boards a year (22–23 Nov 2026)

**Request.** The Director said the PCB component price database is not good enough for ICs and SMT components. Costings
are made at 200,000 boards a year, so the price that matters is the one at 200k parts and above. The round was run with
many agents, as rounds 4 and 5 were, with one new instruction: record the 1,000-unit price AND the same distributor's
largest published break, and never write a 200k price by hand.

**Result (merge 1, verified).**

| | Before | After |
|---|---|---|
| Parts | 1,443 | **1,869** |
| Distributor-priced | 1,118 | **1,546** |
| Priced by 2+ distributors | 415 | 474 |
| Own volume slope | 364 | **688** |
| Distributor-priced on the generic curve | 754 | 858 |
| SMT passives | 171 | **361** |
| Largest published break ≥ 10,000 | 90 | 250 |
| Largest published break ≥ 100,000 | 5 | 31 |
| Estimates | 325 | 323 |
| Read on the live distributor page | 0 | 442 |

426 parts added, 2 estimates replaced (`SPC58EC`, `SN74LVC1G`), 14 existing parts re-priced. Audit 0 errors; 502 PCB tests
pass; the camera-board workbook at 200,000 boards recalculates in LibreOffice with 0 formula errors (its headline, £16.37,
is unchanged — its 11 lines were already catalogued).

**Not finished.** Scope B was 717 parts. 442 are merged; 53 are priced and wait for their independent re-read; 28 have no
franchised listing; 7 are obsolete; about 200 are still to read, because Digi-Key began refusing page reads (§5). They are
in `scripts/pcb-research/queue.json`. 1,100 further discovered parts are outside scope B.

## 1. What was done

1. **Gap analysis** (no web): `2026-11-22-r6/build-tasks.py`, `gap-summary.json`. The thin areas: SMT passives (61 MLCCs,
   38 resistors, 12 beads), logic / op-amps / references, small-signal discretes, connectors, timing.
2. **Discovery — parts, not prices** (`DISCOVERY.md`): 13 agents (8 by domain, 5 by maker for the makers whose sites
   refused) and the full part lists of 26 reference-design BOMs. `consolidate-discovery.py` checks every candidate against
   the catalogue by EXACT code (`has.py` prefix-matches siblings; `seen.py` is the exact check), drops duplicates and the
   doubtful BOM rows. **1,861 candidates**: 977 ICs, 610 SMT passives, 181 discretes / protection / LEDs, 31 timing, 62
   other; 1,817 priceable from distributors, 44 supplier-quote items (pre-production or sold under contract).
3. **Scope B** (the user's choice): every candidate with an orderable code and a distributor listing seen, plus every
   priority-1 candidate — 717 parts in 22 batches (`build-price-batches.py`).
4. **Price research** (`RULES-R6.md` and its addenda): 19 batch runs, 603 lines worked.
5. **Decisions** (`decide-r6.py` → `merge/` + `decisions.json`), **validation** (`validate.mts`: 0 errors, 88 flags for a
   person), **blind verification** (§3), **merge**, **audit**, **queue** (`update-queue.py`).

## 2. What changed in how prices are read — the main findings

- **Digi-Key serves its product pages.** `../RULES.md` said it was blocked. A page gives the full table for every packing
  (cut tape; tape-and-reel to 100,000 on chip resistors), the Grade / Qualification field, part status and stock. One page
  read prices one part. Master Electronics and TME serve pages too; Mouser, Farnell, Arrow, RS, Rutronik, Future,
  TrustedParts and Findchips refuse.
- **Search summaries of distributor pages are stale.** On 10 of 17 parts where both were seen, the live Digi-Key reel
  price was 9–39 % above the summary (L9945TR $3.98 → $5.54). Every distributor price already in the catalogue (1,118)
  came from such summaries in October. Stored prices re-read in the slope pilot had moved by −18 % to +39 %.
  **From round 6 only a price read on the page is an observation**; a summary figure is not (22 dropped).
- **A cut-tape row is a sampling price, not a volume break** (§4).
- **Digi-Key is usually the dearer source.** Where a second distributor could be read it was 1.05–1.6× TME on most parts,
  2.7–2.8× on four Nichicon hybrid capacitors, and Master was 2.2× below it on one. 366 of the 442 merged parts rest on
  Digi-Key alone (379 on a single distributor), so their prices are likely above what a 200,000-a-year buyer pays — most of all capacitors.
- **Published ladders are short for ICs.** Chip resistors publish to 100,000; MLCCs to 3,000–30,000; reel ICs to
  2,500–30,000; tray MCUs and ADI parts stop at 300–640. For ICs the 200k figure remains a long derivation.
- **Master Electronics** prices some non-stocked parts as ¼ / ½ / ¾ / full reel with a surcharge on the part-reel rows:
  those are not volume breaks (only the full-reel row is recorded). Its pages also carry template banners ("no longer
  being manufactured") that are not about the part.
- **"Discontinued at DigiKey"** means Digi-Key stopped stocking the part, not that the maker withdrew it: filed as
  no-listing, not obsolete.

## 3. Verification

A seeded 20 % sample of every research file's merge-ready parts (`build-verify.py`, 94 parts) was re-read by three
independent agents that were **not given the researchers' prices** (`RULES-R6.md` Addendum 5). `compare-verify.py` set
each recorded Digi-Key row against the verifier's table: **94 parts, 237 price rows, every row identical.** Grade agreed
(10 passives print AEC-Q200 under Features rather than in a Grade field; two existing catalogue parts — an AURIX MCU and a
KEMET T598 — show no AEC text on the page and keep their existing label). A research file merges only after its sample has
been re-read (`decide-r6.py` rule 7): b17, b18 and b19 (53 parts) are held for that reason.

This replaces the round 5 rule "a new part priced by one distributor is held". That rule was written for search-summary
prices; a page read confirmed by an independent blind re-read is stronger evidence. The parts are still labelled by their
distributors, and the audit warns where distributors disagree.

## 4. Merge rules added (`scripts/pcb-catalogue-research-merge.ts`, `tests/pcb-catalogue-packing-ladder.test.ts`)

- **5b / 6a — packing.** Each round 6 observation says how the row is sold (`packing`) and how it was read (`evidence`),
  and the catalogue stores both. When a part has a full-packaging row (reel / tray / tube): the slope comes only from
  pairs of the SAME full packaging of one distributor (none → the franchise curve, stated in the basis); 10k–300k follow
  each distributor's published ladder (log-log between its rows, derived beyond its largest row), one value a
  distributor, the median taken; the 1k price stays rule 4; no break is dearer than a smaller one. Reason: read as a volume
  break, the cut-tape → reel step put the 200k figure 20–39 % too low on 15 of 444 parts (NVMFWS0D9N04XM: mixed pairs gave
  b = 0.13; reel to reel it is 0.02). Observations without `packing` — every entry before round 6 — are priced exactly as
  before; the audit recomputes every stored price and reports 0 errors.
- **8a — a row read on the page replaces an earlier stored reading of the same distributor and break** (4 replaced).
- `decide-r6.py` rule 8: a new part never takes over a family key that has a reviewed link in `family-links.json`.

## 5. What is not done, and why

- **Digi-Key refused page reads four times** (HTTP 403), sooner each time — first with six agents at once, then with two
  paced agents, last with one agent pausing 20 s between reads, after about 900 reads in a day. No agent retried or used
  another route. Page reads were stopped. What is left needs Digi-Key's official product API (a free developer key and
  an importer) or a slow continuation over days.
- **Still to read (scope B):** batches b20–b22 (74 parts), re-run lists `tasks/r01`–`r03` (105 lines, exact codes
  resolved), the rest of b19 (24 lines).
- **Slope tasks** `tasks/s02`–`s08` (273 reel-stocked existing parts on the generic curve) and `tasks/h1-held.json` (the
  32 parts round 5 held) have not run. The slope pilot showed that tray ICs publish no larger break: only reel-stocked
  small parts are listed.
- **Held for a person:** `SPC58NE84E7QMSAR` — Digi-Key $26.02 @500 (a factory-order row, not stocked) against TME $9.22
  @500, 2.8× apart; TME is below its own price for the smaller SPC58EC80.
- **No franchised listing (supplier quote), 28:** six Coilcraft XGL / XAL inductors (Digi-Key no longer carries
  Coilcraft), Murata DFE2MCPH1R0MJLLQ, ADBMS6822 / ADBMS6832, LT8640S / LT8648S, LTC6812, MAX96751, AURIX TC489,
  TLF4D985, TLE9350B…LE, IAUCN08S7L110, MLX81332 / MLX81340, OX03H10 / OX08D10 / AR0823AT / IMX623 / IMX728 image
  sensors, NCV7410, SI8921BD-AS4, L9965A-TR, TPS2HCS05-Q1 (preview).
- **Obsolete or last-time-buy, 7:** AD2433WCCPZ, ADT7311WTRZ-RL7 (LTB 29 Jul 2027), RC21211A000GNA#BB0,
  ISL76683AROZ-T7A (LTB 17 Jan 2027), ISL78100ARZ-T7A, ISL78365ARZ-T7A, ISL79985IRZ.
- **44 supplier-quote items** from discovery (`discovery/quote-items.json`): NXP S32K5 / S32N / S32J100, Renesas R-Car and
  RH850/U2B, Valens VA70xx, Qualcomm QCA67x7AQ, NXP SAF85xx / SAF86xx, automotive UFS 4.1, …
- **Catalogue labels to review** (found on the pages, not changed here): the BSS123 family estimate is labelled AEC-Q101
  but `BSS123W-7-F` shows no grade; Nexperia's standard codes (e.g. `BAV99,215`) are catalogued while the automotive
  types are the `-Q` codes; Marvell's automotive Ethernet parts (88Q…) belong to Infineon since 14 Aug 2025.
- **Class table** (`server/utils/pcb-class-pricing.ts`): 126 audit warnings say a 1k price is far outside its class range
  (current-sense shunts and precision resistors in the chip-resistor row, power MOSFETs in "QFN IC (unidentified)",
  hybrid capacitors). The new sourced prices can give those kinds their own rows, as round 5 did; not done in this round.

## 6. What a 200k price in the catalogue is, after this round

- A **published** break where one exists near that quantity (31 parts have a break at 100,000 or above).
- Otherwise **derived**: from the part's own largest published reel / tray row along its own same-packing slope (688
  parts), or along the franchise curve (858 parts), and labelled DERIVED on the costing.
- Mostly a **Digi-Key** price, which §2 shows is the dear end of the market. A supplier quote or a purchase price at
  volume (`scripts/actuals/pcb-actuals.csv`) remains the only way to know what is paid; accuracy against prices paid is
  still unmeasured.

## 7. Files

`calculator/scripts/pcb-research/2026-11-22-r6/`: `RULES-R6.md` (rules and five addenda), `DISCOVERY.md`, `discovery/`
(13 discovery files, `consolidated.json`, `quote-items.json`), `tasks/` (batches, re-run, slope, verify lists), the raw
research files (`b*.json`, `s1-slope.json`), `v0*-verify.json`, `verify-report.json`, `decisions.json`, `merge/` (what the
merge read, `merge-report.json`), and the scripts named above. `round-stats.py <before> <after>` prints the table at the
top.
