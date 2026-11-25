# PCB Image → BOM → cost: the accuracy programme (EDU v6, 25 Nov 2026)

Five rounds on the EDU control board (Dana TM4 Gemini CTRL, China, 10,000 a year) showed where the tool's errors come
from. They are not price lookups: they are what the tool thinks is on the board, and how it prices what it cannot
identify. Seven changes follow, in the order they were recommended. Every figure added is page-read (sourced) or a
labelled CostVision engineering estimate; nothing was tuned to a board or to a price paid.

## Result (Stage 4 on the stored readings — `npm run accuracy:pcb`)

| Board | Before v6 | After v6 | Note |
|---|---|---|---|
| Camera board, China 250k, **price paid £17.00 delivered** | £15.97 (−6.1 %) | **£16.18 (−4.8 %)** | operations added; one price paid is "insufficient" |
| EDU control board, ex-works, global component prices (default) | £180.84 | **£185.01** | + operations, coating both sides (the user's figure); manual £150.56 |
| EDU control board, ex-works, **China component market** (the engineer's choice) | — | **£160.34** | +6.5 % on the manual (which uses China reel prices) |
| Radar demo board, China 250k | £55.11 | £55.38 | |

The China market is an OPTION, not the default: on the only board with a price paid it moves the tool from −4.8 % to
−13.1 % (its passives and chokes at China reels). An EMS that buys locally takes it; one that buys from franchised
distributors does not. Five or more prices paid would settle which is closer — until then it is the engineer's call.

## 1. Measure — `scripts/pcb-board-accuracy.ts`, `tests/fixtures/pcb-boards/*.board.json`
- A board file names a stored analysis, the country, volume, the engineer's form choices (`boardSpecPatch`) and the
  **price paid with its basis** (delivered UK / ex-works). `npm run accuracy:pcb` runs each through Stage 4 (no model, no
  network) and prints the error, MAPE and bias; below five prices paid the verdict is "insufficient". A manual
  should-cost is a `reference` and never counts. A `<board>.truth.json` (the real BOM) adds counting scores, now with
  `partsCountError`. Boards: camera (£17.00 paid), EDU (global and China market — no price paid yet), radar.
- The PCB shadow model (`scripts/arith-audit/pcb.ts`) now encodes the package A / C bare-board rules (18 × 24 in panel,
  highest utilisation, drilling allowance, set-ups per lot, one-offs over the programme, market ASP in any currency) and the
  v6 operations: **361 PASS · 0 FAIL** (it carried 16 failures).

## 2. Count — photo roles, zooms, empty footprints, no symmetry (`server/utils/pcb-counting.ts`)
- 24 photos (was 8): 2 sides, 6 chip close-ups (slots 0–7 unchanged), **16 zooms for counting** (slots 8–23). The
  prompt gives each a role: count on the side photos; zooms only confirm which footprints are fitted; a part seen twice
  is one part.
- Per line the model states `countMethod` (counted / designator-range / estimated), `qtyMin` / `qtyMax`, `side`,
  `seenIn`; per board `emptyFootprints`. Designator ranges include unfitted positions; a second channel is never
  counted by symmetry.
- The tool turns the ranges into a quantity band (parts and £, with the EMS burden) that widens the confidence band, warns
  `COUNT_RANGE` and `COUNT_BY_SYMMETRY`, and prints the count method under each BOM line. A reading that does not state
  how it counted (older analyses) stays exact — nothing invented.

## 3. Read — chip markings on full-resolution tiles (`server/utils/pcb-ocr-tiles.ts`)
- The side photos go up at 3,264 px (4,096 under Deep analysis); the OCR stage gets each also as overlapping tiles of ≤
  1,568 px (a 4,080 × 2,295 photo → 3 × 2), within the request budget. Only the OCR stage sees tiles. Reports keep a
  1,600 px copy. `PCB_OCR_TILES=0` switches it off.

## 4. The dearest lines (`server/utils/pcb-verify-list.ts`, `src/ui/pcb/verify-panel.ts`)
- "Verify these first": the ten dearest lines, each confirmed / to verify and why — screen, PDF §2, workbook.
- **Customer-supplied parts** (directed buy / consignment): a checkbox per BOM line (kept on `userCorrections`, so every
  re-price keeps it); no EMS burden on them; the **EMS invoice** = delivered less them.

## 5. Market — China component prices (`server/data/pcb-component-market.ts`, `scripts/pcb-market-rows.mts`)
- 379 automotive parts, szlcsc own-stock whole reels ex-VAT, page-read 25 Nov 2026 (`scripts/pcb-research/2026-11-25-v6/`),
  in 26 class rows (p10–p90 + median, ≥ 8 parts; a near-stockless part more than 3× from its class median dropped as a
  stale listing). LCSC.com is the same price table at a fixed factor — a cross-check, not a second source.
- PCB form "Component prices": **Global distributors (default)** / Build country's market. With the market, China
  class lines take the market row (`…automotive@cn`) and a named part its own reel price when lower; every other country
  in the comparison, and the UK curve, stay at global prices.
- Passive volume above 300k: TME's UNI-ROYAL resistors fall only 4–6 % from 100k to 1.2M — the catalogue curve stays
  flat above 300k (now sourced, not assumed).

## 6. Operations — audit package B (`server/data/pcb-operations.ts`)
- Second reflow side (set-up a lot + stencil; JLCPCB doubles both, Pentalogix stencil $195), second coated side,
  coating inspection (Axxon-Mycronic 25 s a side), masking (engineering 10 s a connector), press-fit (TE 3–5 s a connector,
  0.5 s a pin), programming (AURIX data sheet: write ≤ 1 s/MB + erase 1 s/MB, + 10 s handling; SEGGER ATE2 €5,480),
  functional test (60 s — engineering estimate, no published time) + hipot (Interpower 1 s; Chroma tester $13,981).
  Stations follow the tool's convention (time × 2 × labour; one-offs over the programme). Read off the BOM (press-fit
  lines, MCU flash from the catalogue, HV parts) or typed on the PCB form (blank = the tool's figure).
- **Full-economic** = delivered + the automotive programme NRE over annual × years — screen, PDF, workbook.

## 7. Bare board — market ASP beyond China (`server/data/pcb-market-evidence.ts`)
- **Thailand**: KCE Electronics (automotive-led) sales ÷ area by layer class, 9M 2026 (rises inside).
- **Japan**: METI production statistics 2025, value ÷ area by layer class.
- Not found (table + premium stays): EU, USA, Mexico, Vietnam, Philippines, Indonesia (statistics count pieces, fabs
  publish revenue only); Taiwan (only consolidated across TW / CN / TH plants); Korea (mobile HDI / substrate mixes);
  India (revenue ÷ production area, single-sided boards in the mix).

## Still open
- Five or more prices paid (`tests/fixtures/pcb-boards/README.md`) — the only way to know whether global or market prices
  are closer, and how far the photo reading is from the real count.
- Functional-test time, masking time, press-fit and coater capex: no published figures — engineering estimates, typed
  overrides on the form.
- The model-facing changes (photo roles, count fields, tiles) are proved by unit tests and the schema; their effect on a
  live photo reading is unmeasured until a labelled board with photos and its real BOM is added.
