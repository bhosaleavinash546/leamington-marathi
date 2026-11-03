# Should-cost report review — brief for each expert reviewer

CostVision produces a should-cost PDF report and an Excel workbook for every part costed from CAD (repo
`/home/user/leamington-marathi/calculator`; read `CLAUDE.md` for the tool's rules — the golden rule is that every figure is
measured, from a sourced rate book, answered by the engineer, a visible labelled assumption, or arithmetic actually shown).

Today's PDF for the stub axle (cast + machined ductile iron, PRCR002) is 22 pages / ~11,000 words. Nobody reads that. The
decision is taken: a **core should-cost report of 6–8 pages** for decision-makers, plus a **separate full audit pack**
(rate build-ups, full traceability, every rule basis, every DFM finding with face numbers, uncertainty method, carbon). The
Excel workbook keeps everything. Missing quality items (inspection, part marking, rust protection, PPAP…) are listed as
"Not included" until the engineer answers a question about them — never invented as a cost.

## The reports (live exports, 200,000 parts a year, 5-year programme, ex-works)
- `/tmp/claude-0/-home-user-leamington-marathi/8bf32d1a-7485-5bd6-9947-7843ee6c5644/scratchpad/rpt0/UK/<part>.pdf` and
  `.xlsx` — 15 parts, one or two per commodity; `rpt0/CN/` the same in China (¥).
- Parts: stub-axle-cast-machine (cast + machine), casting-bracket (sand casting), hub-flange-forging, knuckle-forging,
  machining-manifold (CNC), ecu-cover-moulding (injection moulding), seat-bracket-sheet (stamping),
  battery-rail-al-extrusion, extrusion-vent-pipe (polymer extrusion), blow-moulding-air-duct, roto-header-tank,
  thermoforming-trim-cover, composites-hat-stiffener, rubber-grommet, gear-m3-z38.
- Read PDFs with `pdftotext -layout <file> -` (add `-f N -l N` for one page); workbooks with python3 openpyxl
  (`python3 -I`). Screenshots of the screen are beside them (`<part>-0N-*.png`).

## What to do
1. Read the **stub axle UK PDF line by line, all pages**, from your role's point of view.
2. Read the other 14 UK PDFs for your role's concerns (skim what you have already seen; focus on what differs by commodity).
   Check the China stub axle for currency / text problems in your area only.
3. Do NOT edit any file and do not run the app or tests.

## Output — write ONE file, `/tmp/claude-0/-home-user-leamington-marathi/8bf32d1a-7485-5bd6-9947-7843ee6c5644/scratchpad/review/<role>.md`
A. **Findings register** — a markdown table, one row per item:
   `| # | Part (or ALL) | Page / section | Quote (short, exact) | Class | Why | Proposed fix |`
   Class is exactly one of: `KEEP-CORE` (belongs in the 6–8 page core report), `MOVE-AUDIT` (true and useful, but for the
   audit pack only), `REMOVE` (padding, duplicate, tool-internal note, no reader needs it), `WRONG` (an engineering /
   commercial error — say what is right and why), `HALLUCINATION` (a figure or claim with no measured / sourced / answered /
   labelled basis), `MISSING` (a should-cost report of this commodity needs it and it is absent). Be specific and
   quote the report. Rank WRONG / HALLUCINATION rows by £ effect where you can estimate it from the report's own numbers.
B. **Commodity matrix (your role's view)** — for EACH of the 14 commodities: what must be in the core report (the key cost
   drivers / checks your discipline needs on page one), what goes to the audit pack, and which DFM / quality / process
   checks apply or must NOT apply (e.g. draft checks only on as-cast faces).
C. **Top 10** — your ten most important changes, in order.

Be concrete and honest; no generic advice. If the tool is right, say so. If you are unsure, say so and why.
