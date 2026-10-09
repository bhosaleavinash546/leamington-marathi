# Round 3 — MHEV / PHEV / BEV vehicle boards (9 Oct 2026). Read fully, with `../RULES.md` (pricing rules) and `../2026-10-09-adas-r2/RULES-R2.md` (forbidden hosts).

Goal: for every board in your domain, (1) what is on it, from authentic sources, and (2) a distributor price for each
part a costing would need. Accuracy is the only goal. **Never invent a part, a quantity, a board fact or a price.**
"not published in any source found" and an empty `observations` list are correct answers.

## 1. Board research → `ecu-map-<domain>.json`

Your task file lists each board (ECU id) and the key ICs the library already holds. For each board find:
- **Key ICs by role**: main MCU / SoC, PMIC / SBC, gate drivers, AFEs, transceivers (CAN FD, LIN, Ethernet), sensors,
  isolators, power stages, memory, plus the power semiconductors and current sensors on power boards.
  Each row: `{ "role", "examples": ["<maker> <part> (<where seen>)"], "source": "<URL>" }`. A row from your engineering
  knowledge with no URL must say `"source": "engineering judgement"` — use this sparingly and never for a named product.
- **Board facts** (`pcb`): layers, size, technology (HDI, heavy copper, IMS, ceramic), laminate, boards in the module.
  Each fact is from a source (URL in `basis`) or says "engineering judgement" or "not published in any source found".
- **Placements** (`placements`): component count range, with its basis.
- **Teardowns**: `{ "title", "url", "finding" }` — TechInsights / System Plus / Yole / Munro / 42how / eeNews / EE Times
  summaries, OEM / Tier-1 press, and manufacturer reference designs (TI TIDA-xxxxx, NXP RD-/EVB, Infineon, ADI, ST
  EVAL boards — a reference design's named parts are authentic evidence of what such a board carries; say it is a
  reference design, not a production board).
- **Board cost evidence** (`boardCostEvidence`, file level): any PUBLIC figure for a board's or module's cost or price
  (teardown cost, ASP) with its URL and context. Do not compute one yourself.

Shape (same as `../2026-10-09-adas/ecu-map-adas-boards.json`):
```json
{ "domain": "ev-<domain>", "researched": "2026-10-09",
  "ecus": [ { "ecu": "BMS_CMU", "name": "...", "function": "...", "powertrains": ["HEV","PHEV","BEV400","BEV800"],
      "pcb": { "layers": "...", "size": "...", "technology": "...", "laminate": "...", "boards": "...", "basis": "..." },
      "placements": { "range": "...", "basis": "..." },
      "keyIcs": [ { "role": "...", "examples": ["..."], "source": "https://..." } ],
      "teardowns": [ { "title": "...", "url": "https://...", "finding": "..." } ] } ],
  "boardCostEvidence": [ { "claim": "...", "url": "https://..." } ],
  "notes": [] }
```
Use the ECU ids from your task file exactly. Keep `powertrains` as given there.

## 2. Parts and prices → `<domain>.json`

From the key ICs you found (and the ones already listed), build the parts list a costing of these boards needs: each
key IC as an AUTOMOTIVE orderable code (AEC-Q100/101/200 where one exists), plus the board-specific support parts the
sources name (isolated DC-DC, gate-drive transformers, shunts / current sensors, DC-link / snubber film caps, TVS,
HV connectors on the board). Generic passives are NOT your job (they are already catalogued).

Before adding a part, check `server/data/pcb-component-catalogue.json` (grep the code and its family). If it is there
with `"confidence": "distributor"` and observations, skip it (list it in `notes` as "already priced"). If it is there
as an estimate or not at all, research it.

Price each part exactly as `../RULES.md` says (franchised distributors only, breaks ≥ 100, up to 3 observations, URL +
date, sibling code → `observedMpn`). Forbidden hosts: `punchouttest.*`, `fat.lcsc.com`. At most 4 searches per part.
Manufacturer list prices (ti.com "1ku") may go in `notes`, never as an observation. File shape: `../RULES.md`, with
`"domain": "ev-<domain>"` and `"researched": "2026-10-09"`; put the ECU ids in `ecuRoles`.

Before you finish, run every observation through the merge's own check (without writing the catalogue):
`npx tsx -e "import {priceFromObservations} from './scripts/pcb-catalogue-research-merge.ts'; ..."` from
`calculator/` — an observation it drops is a wasted one; fix or remove it.

## 3. Budget and reply
You are the only agent searching. Spend about half the budget on boards, half on prices. Write the two files, change no
other file, and reply with ONE paragraph: boards covered (key-IC rows with a URL / engineering judgement), board facts
sourced, teardowns found, parts researched / priced / 2+ distributors, and the parts with none (two or three words why).
