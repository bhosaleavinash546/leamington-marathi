# CAD to Cost in seven countries — 15 real parts at 200,000 a year, ex-works (3 Nov 2026)

For the President and the Cost Engineering Director. Every figure in this review is the tool's own output, run LIVE: a
real server, a real browser, the real STEP files, each part taken through the three CAD-to-Cost steps, with the PDF and
the Excel reports exported and opened. Nothing was costed outside the tool.

**Conditions:** 15 real parts (one or two per commodity), 7 countries (United Kingdom, China, India, Poland, Hungary,
Germany, Slovakia), 200,000 parts a year, 5-year programme (1,000,000 parts), ex-works (EXW: packaging in, freight
out). Each country costs on its OWN rate book (labour, machines, energy, materials, FX — see
`docs/rates/world-rate-round-2026-10-30.md`).

**What "no hallucination" was held to:** every figure is measured from the CAD, from a sourced rate book, answered by
the engineer, a visible labelled assumption, or arithmetic the report shows — and the arithmetic must re-add. Four
independent checks enforce it (§2).

## 1. Results

<!-- RESULTS -->

## 2. How the costs were checked

| Check | What it does | Result |
|---|---|---|
| Live harness (`e2e/cad-to-cost-trace.ts`) | Drives every part through the screen in each country; ~146 checks a part (route, questions, buckets, tooling basis, band, compare-routes reference = headline, PDF = Excel = screen, stamp names the country's book, axe WCAG 2.1 AA) | <!-- LIVE --> |
| Step-by-step re-do (`scripts/country-trace/worked-example.py`) | Reads each exported workbook and re-does every step from the printed inputs: material (gross × price − scrap + consumables + energy), each operation (rate × cycle ÷ OEE ÷ parts a cycle; labour rate × time × crew ÷ efficiency), tooling (investment ÷ amortisation), overhead %, margin %, total | <!-- STEPS --> |
| Shadow models (`scripts/arith-audit/*.ts`) | 13 independent re-implementations re-cost every part from its measured geometry in the country's own book, without calling the code they check | 0 FAIL in all 7 countries (§4) |
| Report scan (`scripts/country-trace/report-scan.py`) | Reads every PDF and workbook for leaked placeholders, library ids in prose, wrong-currency money, research notes, the stated terms and volume | <!-- SCAN --> |
| Independent read | A reviewer with no part in the build read 12 PDFs + 12 workbooks line by line (6 parts × UK and China) | 15 High / 20 Medium / ~12 Low findings — §3 |

## 3. Bugs found and fixed

Each fix has a test that fails before and passes after; the full suite (4,600+ tests) passes.

**Wrong numbers**
1. **Compare routes costed at 100,000 a year** whatever volume was typed — the CAD screen's volume field is not on the
   page at step 3 and every later reader fell back to 100,000 (ECU cover reference 0.83 v headline 0.76). One helper
   now returns the engineer's volume (`src/ui/cad-volume.ts`).
2. **Rotomoulding moulds sized on UK machine hours in every country** — 106 coolant-tank moulds in China where 60
   serve; the machine £/h was spread over the country's own hours. Now the costed carousel's hours in the costing's
   book.
3. **Detailed quote teardown showed a gap on an IDENTICAL quote** — the supplier side left out process energy and
   credited melt loss as scrap: −£1.72 a part on the stub axle (−£344,000 a year at 200k), every unchanged driver
   −£1.33, verdict "competitive; hold". Now £0. Its own total is the headline, rounded once.
4. **China aluminium scrap credited above the billet** (¥22.03/kg scrap v ¥21.52/kg billet — the European LME + $56/t
   differential on a billet that sits under LME). Capped at the billet price, and the note says so.
5. **Rule £ rounded to the UK penny** (shot blast, NDT / MPI stations, NDI, impregnation): the printed arithmetic did
   not hold once converted (China NDT ¥1.19 shown, ¥1.15 costed). Kept to 4 dp with the result printed. Three real
   parts move by 1p.
6. **Composite material lines rounded to 4 dp** — the lines missed the bucket by 0.08 p (UK) / ¥0.0065 (CN).
7. **Forge-press feasibility on the wrong steel** — 765 t (plain carbon) beside the costing's 535 t (38MnVS6).
8. **§4C priced the hub flange's drilling at the lathe rate**; a turned boss was "NOT costed … could add £0.42" while
   §4A costs the turning.

**Levers and insights that did not follow from the arithmetic**
9. Lights-out re-costed the 4-man sand-moulding crew (£4.36 → £3.44, the cutting operations only).
10. A routing lever proposed what the router had already rejected, capped its % at 20 (1.19 / 5.18 is 23 %) and, in
    China, printed figures that did not subtract (¥10.03 − ¥9.50 printed as ¥0.44).
11. "Grinding / honing" fired on fettling; "doubling volume halves tooling" where tool life sets the tooling (the seat
    bracket's own ladder goes up at 250k); three different utilisation references for one forging; a fixed "India
    ~67 % lower" index beside the country table; fastener / remelt-alloy / bought-in / CRITICAL levers on parts
    without them.

**Report text ("garbage")**
12. Excel 3-Operations TOTAL row one column left of its headers (labour £ under "Labour Efficiency").
13. Ex-works reports described a "delivery allowance".
14. Composites printed "0.000 kg", "Virtual / Pass-through", a density-1 mass and "prepreg-cf"; kg added to pieces.
15. Internal ids and code in prose — ~250 code references ("casting-advisor.ts: DIE_CASTABLE …") in the route sources,
    "steel → mat-steel-38mnvs6", machine ids in routing / press / mould notes; research bookkeeping in rate notes
    ("CORRECTED … ferrous.anchor.… 1.907 → 1.8985", "read in search results only", search-engine notices).
16. Garbled trace labels ("material: price per"); "Material suggestion is only 0 % confident" under an answered carbon
    prepreg; the screen listed the forging advisor's default 100,000 as a measured annual volume.

## 4. Shadow models in seven countries

Five models were written for the UK at 50,000 a year delivered; they now read region, volume, programme and terms from
each costing and price in that country's book (`scripts/arith-audit/dump-context.ts`). The UK 50k control is unchanged
(0 FAIL). `docs/review/arith-audit/seven-country-200k-2026-11-03.md` has the per-model tables.

| Model | UK | CN | IN | PL | HU | DE | SK |
|---|---|---|---|---|---|---|---|
| casting | 107/0 | 107/0 | 107/0 | 107/0 | 107/0 | 107/0 | 107/0 |
| forging | 123/0 | 123/0 | 123/0 | 123/0 | 123/0 | 123/0 | 123/0 |
| machining | 191/0 | 191/0 | 191/0 | 191/0 | 191/0 | 191/0 | 191/0 |
| injection moulding | 142/0 | 142/0 | 142/0 | 142/0 | 142/0 | 142/0 | 142/0 |
| hollow forming | 208/0 | 208/0 | 208/0 | 208/0 | 208/0 | 208/0 | 208/0 |
| composites + rubber | 258/0 | 258/0 | 258/0 | 258/0 | 258/0 | 258/0 | 258/0 |
| extrusion | 719/0 | 719/0 | 719/0 | 719/0 | 719/0 | 719/0 | 719/0 |
| gear | 180/0 | 180/0 | 180/0 | 180/0 | 180/0 | 180/0 | 180/0 |
| spec commodities | 1046/0 | 1046/0 | 1046/0 | 1046/0 | 1046/0 | 1046/0 | 1046/0 |
| AI-leak guard | 256/0 | 256/0 | 256/0 | 256/0 | 256/0 | 256/0 | 256/0 |
| sheet metal (DE run) | | | | | | 328/0 | |
| PCB (DE run) | | | | | | 350/0 | |
| features + reports (PL run, after fixes 3 / 5) | | | | 798/0 | | | |

## 5. "Is any country using a UK multiplier?" (asked 3 Nov 2026)

Checked every path by which a UK figure can be scaled into another country:

| Path | Before | Now |
|---|---|---|
| Overhead 12 % and packaging | UK basis × a held country multiplier (no source) in every book | UK basis **at par** (×1) and said so — no country overhead share or packaging comparator was sourced |
| Germany materials with no German price | UK × 1.03 | at par |
| Germany capital with no German price | UK × 1.049 | at par |
| Materials / capital with no local price, other books | at par (30 Oct) | at par |
| Logistics | UK basis × a held multiplier | unchanged, but **0 ex-works** — not in any figure of this review |
| Bought-in services (heat treat, NDT, blast …) | a sourced local / UK price pair where researched, else a factor DERIVED from that country's own wages and machine rates | unchanged — derived from the country's own book, not a held multiplier |

`tests/country-rates.test.ts` fails if any booked country carries an overhead, packaging or material multiplier ≠ 1.

## 6. Open — said plainly

- **Accuracy is not measured.** No price paid for any of these parts has been entered (`scripts/actuals/`); the tool's
  figures are reproducible and traceable, not yet validated against purchase prices.
- Logistics for delivered terms is still a held multiplier (freight lanes not researched) — not used here (EXW).
- Bought-in service factors are derived from each country's wages and machine rates where no local service price was
  sourced.
- Cast + machine pattern sets use the wood-pattern life band on an aluminium match plate — the report itself says this
  may overstate the pattern tooling (stub axle £716,625 for 65 sets).
- The UK CNC lathe's capex is built from a Haas VF-2 mill price × a size ratio (labelled), and a few machine lives use
  the German AfA table for a different machine class — next machine research round.
- Route comparison can still list a route outside the part's family when the family was never answered (it reads only
  answers), and a machining row may cost a grade the casting route marks unsuitable — the feasibility screen does not
  yet read the costing's safety answer.
- A volume ladder can step up where a new die set starts (seat bracket £1.03 at 200k, £1.13 at 250k); the table does not
  yet say why.
- The hub flange tooling carries £3,291 beyond its die sets (fixtures / NRE) that the report does not itemise; the STEP
  name says C45 but the representative 38MnVS6 is costed until the grade is answered (it is asked).
- Two generic levers remain rule-of-thumb text without £ (volume re-commitment 3–8 %, regional sourcing 40–70 %).

## 7. Reproduce

```bash
# live, one country (needs a build + OCP):
CV_TRACE_PARTS=scripts/country-trace/parts15-200k.json CV_TRACE_COUNTRY=CN CV_TRACE_TERMS=EXW CV_TRACE_OUT=out/CN npx tsx e2e/cad-to-cost-trace.ts
python3 -I scripts/country-trace/live-summary.py out            # PASS / FAIL and headlines
python3 -I scripts/country-trace/worked-example.py out/*/*.xlsx  # every step re-done from the exports
python3 -I scripts/country-trace/report-scan.py out             # garbage scan of every PDF / workbook
python3 -I scripts/country-trace/review-pack.py out pack.xlsx   # parts × countries workbook
CV_DUMP_REGION=CN CV_DUMP_ANNUAL=200000 CV_DUMP_TERMS=EXW npx tsx scripts/arith-audit/dump.ts dump/CN
npx tsx scripts/arith-audit/<group>.ts dump/CN                  # shadow models
```
