# Supercharger control board PCBA — should-cost (26 Nov 2026)

Valeo B112235-B, the control board of a 48 V electric supercharger. China build, 100,000 boards a year, 6-year programme,
120 × 100 mm (given), conformal coating on the component areas of both sides (given). Controller marking read:
NXP SC667506WKK / 1N00R / ZRAA2635A — one chip: NXP's customer build of the S12ZVMC256 (mask set 1N00R), LQFP-80 EP.

| Result (£ a board) | Ex-works China | Delivered UK |
|---|---|---|
| Manual should-cost | 15.04 | 15.63 |
| CostVision tool, China market components | 17.15 | 17.79 |
| CostVision tool, global distributor components | 23.50 | 24.38 |

Files
- `reading.py` → `reading.json`, `replies.json`: the board read off 15 photos (26 lines, 322 SMT parts, count method and range
  a line); `replies.json` is the stand-in model reply the live run replays.
- `research/parts.json`: identity and price research (sources and quotes); `build-line-prices.py` → `research/line-prices.json`
  (distributor breaks carried to volume on the catalogue franchise curve, slope 0.0706).
- `manual.py` → `manual.json`, `manual-costing.xlsx`: the hand build-up (live formulas).
- `report.py` (+ `report.css`, `report-pdf.mjs`): re-computes every figure, asserts it against `manual.json`, reads the tool's
  two live runs and writes the report (HTML → PDF) and the workbook.

Re-run
```bash
python3 -I reading.py && python3 -I build-line-prices.py && python3 -I manual.py
# live tool runs (needs a build): scripts/edu-ctrl-2026-11-25/live-run.ts with CV_REPLIES=../supercharger-pcb-2026-11-26/replies.json,
# CV_QTY=100000, CV_EDITS (120 × 100 mm, 40 g, lot 8333, 6 years, coat sides 2, FPY 0.97, component market global | local),
# CV_BOM_EDITS U1 = £3.55 (the controller price at 100k a year, given)
python3 -I report.py <global-run-dir> <china-run-dir> <out-dir>
node report-pdf.mjs <out-dir>/report.html <out-dir>/supercharger-pcb-should-cost.pdf
```
The photos (`photos/`) are the user's and are not committed.
