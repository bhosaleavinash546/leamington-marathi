# BMW rear-axle inverter control board PCBA — should-cost (26 Nov 2026)

G6-CTRL REV007. China build, 400,000 boards a year, 6-year programme; resistors and capacitors priced at the millions break.
The bill of materials (39 rows, 1,189 parts, manufacturer part numbers) and the PCB characteristics (6 layers,
70/35/35/35/35/70 µm, tin, 1.6 mm, partial coating, both sides) are the A2Mac1 record supplied with the request; the board
size (280 × 220 mm, ±5 %) is measured off the photos against the TC389's 25 mm body.

| Result (£ a board) | Ex-works China | Delivered UK |
|---|---|---|
| Manual should-cost | 74.48 | 77.34 |
| CostVision tool, China market components | 108.86 | 112.97 |
| CostVision tool, global distributor components | 119.05 | 123.51 |
| CostVision tool after the review fixes (26 Nov 2026), China market, no typed price | 76.30 | 79.18 |
| CostVision tool after the review fixes, global distributor prices | 110.35 | 114.49 |

Files
- `reading.py` → `reading.json`, `bom.csv` (the BOM uploaded to the tool — no designator column: the BOM's row names are
  not designators), `replies.json` (the stand-in model reply the live run replays).
- `research/batch-a.json`, `batch-b.json`: distributor prices read for this costing; `build-sources.py` →
  `research/line-sources.json` (every line: part priced, seller, price, break, date, page).
- `manual.py` → `manual.json`, `manual-costing.xlsx` (live formulas).
- `report.py` (+ `report.css`, `report-pdf.mjs`): re-computes every figure, asserts it against `manual.json`, reads the
  tool's two live runs and writes the report (HTML → PDF) and the workbook.

Re-run
```bash
python3 -I reading.py && python3 -I build-sources.py && python3 -I manual.py
# live tool runs (needs a build): scripts/edu-ctrl-2026-11-25/live-run.ts with CV_REPLIES=../bmw-rear-inverter-2026-11-26/replies.json,
# CV_BOM_FILE=<this dir>/bom.csv, CV_QTY=400000, CV_EDITS (6 layers, 2 oz outer / 1 oz inner, 1.6 mm, finish imag, 210 g,
# lot 33333, 6 years, coat sides 1, FPY 0.97, staking 24, programming 60 s, FCT 90 s, component market global | local),
# CV_BOM_EDITS {"SAK-TC389QP-160F300SAE": {"unitPriceGBP": 9.02}}
python3 -I report.py <global-run-dir> <china-run-dir> <out-dir>
node report-pdf.mjs <out-dir>/report.html <out-dir>/bmw-rear-inverter-pcb-should-cost.pdf
```
The photos (`photos/`) are the user's and are not committed.

`bom-a2mac1.csv` is the same BOM with the A2Mac1 row names in a RefDes column — the file the tool now reads at its own
quantities (it used to split the row names into one-off parts). What the costing changed in the tool, and the effect:
`docs/pcb/bmw-inverter-review-2026-11-26.md`.

Tool fix made with this costing: a BOM file's transistor / MOSFET (SOT-23, SOT-363, DFN) and transformer rows were typed as
ICs by `inferComponentType` and priced on the IC range; description words now decide (`tests/pcb-bom-postprocess.test.ts`).
