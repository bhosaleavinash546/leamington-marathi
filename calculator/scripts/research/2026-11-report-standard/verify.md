# Independent re-read of the report-standard research (3 Nov 2026)

Scope: every row in `machining/`, `foundry/` and `composites/` `data.json` (191 rows). That covers all rows the three PROPOSAL
sections rely on, plus the context rows. Per-row verdicts, read method and notes are in `verify.json`. Nothing else was edited.

## Method

- **Downloads.** Every source URL was fetched again with plain `curl` (default user agent, no bypass) into a scratch
  folder.
- **PDFs.** Read with `pdftotext` (plain and `-layout`). Two charts were rendered to PNG and read by eye:
  - the OSG tapping chart, where the colour legend separates advisable from possible;
  - the Mitsubishi MC6100 table, where the material block boundaries matter.
- **HTML.** Tags were stripped and each quote fragment was searched for in the text.
- **Tables.** Where a quote is a condensed rendering of a table, I checked each value against its own row and column. This
  applies to the Mitsubishi, Sandvik, Okuma and DISA tables.
- **Blocked pages.** Fifteen pages refuse plain curl with HTTP 403: eleven on CompositesWorld, plus MoldMaking Technology,
  Gardner and Techspex. I opened these with the fetch tool and asked it for the exact sentences. Every quoted sentence came
  back word for word, but it came back through the tool's model. The rows carry
  `readMethod: fetch-tool` so they can be told apart.
- **Arithmetic.** Every derived figure the notes and proposals use was recomputed:
  - n·f;
  - n·z·fz·ae;
  - fn·vc;
  - tapping n × pitch;
  - Q and Pc with Sandvik's K;
  - the M21 cycle sum;
  - PCM press force;
  - layup kg/h ↔ h/m²/ply;
  - autoclave count.

## Counts

| Set | Rows | CONFIRMED | CORRECTED | WRONG | UNREACHABLE | of which fetch-tool only |
|---|---|---|---|---|---|---|
| machining | 91 | 88 | 3 | 0 | 0 | 1 (Techspex, cross-check row) |
| foundry | 66 | 66 | 0 | 0 | 0 | 0 |
| composites | 34 | 34 | 0 | 0 | 0 | 15 (CompositesWorld ×11, MoldMaking, Gardner) |
| **total** | **191** | **188** | **3** | **0** | **0** | 16 |

## Rows that are not CONFIRMED

**machining #9: APX4000 shoulder milling, ductile cast iron < 800 MPa (CORRECTED).**

- vc 190 (140–220) m/min with MC5020 is right.
- The feed is wrong. fz 0.30 belongs to the GREY iron rows (ap < 10). For ductile < 800 MPa the table gives **fz 0.25** at
  ae < 0.15 DC, ap < 20. It gives 0.20 at ap 20–50, and 0.20 at ae 0.15–0.3 DC.
- The proposal table's "GJS shoulder vc 190, fz 0.30" must become fz 0.25.

**machining #13: TungAlu-Mill, aluminium (CORRECTED).**

- The 200–2000 m/min and fz 0.1–0.25 range is right.
- The worked table is mislabelled in the row. At Vc 1000 and fz 0.2 the Ø63 cutter has **z = 5** (5100 × 5 × 0.2 = 5100);
  z = 4 is the Ø50 cutter.
- The Ø100, z = 6, n 3200, Vf 3800 figures are correct, so the proposal's ≈ 2,660 cm²/min stands.

**machining #64: Okuma MA-4000H pallet change (CORRECTED).**

- 6.6 s and 7.1 s are both on the page, but they are not two configurations. They are the same pallet change measured to
  two standards: **6.6 s is footnote *2 (MAS standard)** and **7.1 s is footnote *3 (ISO 10791-9 (2001))**.
- Use 7.1 s so the figure matches the ISO chip-to-chip figures (2.15 s / 2.46 s).

## Points in the notes (not row verdicts) the re-read does not support

### Machining

1. **WSX445 finish rates.** The Ø100 face-mill rates of 515 / 468 / 374 cm²/min assume z = 7. The WSX445 PDF has no
   body / teeth table. The only Ø100 7-blade cutter in the sources is Okuma's demonstration tool (row 15).
   - The arithmetic is right **given z = 7**.
   - z must be sourced from the WSX445 body catalogue, or labelled an assumption.
2. **GJS < 800 MPa face milling (row 3).** 160 m/min is the VP15TF value. The first-recommended grade, MC5020, gives
   **200 (180–250)**, the same as for < 450 MPa.
   - The proposal mixes grades: MC5020 for < 450, VP15TF for < 800.
   - Like-for-like, the GJS < 800 start value is 200.
3. **MVE / MVS coolant.** Neither Mitsubishi PDF states the coolant type. "MVE = external" and "MVS = through-coolant" are
   not on the cited pages.
4. **MVS deep rows.** The deep rows are NOT lower-feed. At Ø12 the row is 10DC–25DC (not 10–30DC), with f 0.34 against
   0.30 for 3DC–8DC. In steel that is 3100 × 0.34 = 1,054 mm/min against 1,020.
   - Proposal item 10's conclusion still holds: no derate within the catalogue's reach.
   - The §2 wording in the notes is wrong.
5. **Boring "f 0.1–0.2" (T515).** The page gives only the application examples at f 0.2 mm/rev (0.008 ipr). These are
   tool-life comparisons against competitors, not recommendations. The f 0.1 lower bound and the 142 mm/min figure have
   no source.

### Foundry

6. **Fettling time study (row 41).** The notes call 45 s / 40 s "the only measured figure in the 5–10 kg class". The page
   gives no weight for the five components, only the foundry's 0.1–30 kg range.
   - P4 itself says 0.1–30 kg and is accurate.
   - The "5–10 kg" framing should go.
7. **500,000-mould plate (row 35).** The statement sits in an FMT article about an **aluminium** foundry (Boose Quality
   Castings, DISA MATCH 16/20), and it is an "up to" figure.
   - P3 applies it to steel plates for ductile iron. That is an extrapolation and should be stated as one.
8. **BREF metal yields (row 57).** Notes §5 / P6 write "grey, mechanised, high quality, cored 55–65". BREF Table 3.13 gives
   **55–60** for complicated heavy-cored work and 60–65 for relatively simple work.
   - The row itself is correct.

### Composites

9. **Invar on the CW tooling page (TL-5 / TL-6).** The same page also says the aerospace industry wants composite tools
   "that can withstand thousands of autoclave cure cycles, like Invar can". That is a qualitative "thousands" for Invar.
   - It is still no cycle count.
   - It supports the proposal's "metal layup tool lasts the programme" wording more than the notes credit.
10. **PCM mould material (VR-1).** VR-1 does not state the PCM mould-tool material. The page names only the polyurethane-board
    preform tool. The proposal's matched steel tool rests on TL-12 / VR-3 ("matched metal tools", "steel mold"), which are
    confirmed.
11. **SMC > 10,000 parts (VR-9).** The "> 10,000 parts" sentence is said of compression moulding in general, not SMC
    specifically.
12. **HP-RTM 166 s (VR-6).** 166 s is a hypothetical scenario (Table 1), not a trial result.

## Which PROPOSAL items still stand (on CONFIRMED / CORRECTED rows only)

### Machining (notes §5)

| # | Item | Status |
|---|---|---|
| 1 | Catalogue table (start values) | **Stands, with three edits.** See the list below this table. |
| 2 | Face time from cutter geometry | **Stands.** Uses rows 0–4 and 13. z per body must be sourced (point 1). |
| 3 | Turning area / (fn·vc) | **Stands.** Rows 44 and 47–53 confirmed; 485 / 260 / 280 / 3,000 cm²/min recomputed. |
| 4 | Drill / bore / tap n·f | **Stands.** Drill rows 19–41 confirmed. Tap rows 58–62 confirmed. Bore: f 0.2 only (point 5). |
| 5 | Fixed allowances un-scaled | **Stands.** No source figure involved; the allowances are labelled engineering-typical. |
| 6 | Retire `timeFactor`; Sandvik K ratios | **Stands.** All 9 K values (rows 72–80) confirmed. |
| 7 | Roughing via K × spindle kW | **Stands.** 206 cm³/min at 10.5 kW and 187 cm³/min at 8.6 kW recomputed. Okuma rows confirmed as demonstration figures only. |
| 8 | `TOOL_CHANGE_SEC` 2.2 s (2.5 s ≥ 4 kg) | **Stands.** Rows 63, 67, 68, 69 confirmed: 2.15 / 2.1 / 2.2 / 2.7 s; 2.46 / 2.5 s for tools over 4 kg. |
| 9 | `PALLET_CHANGE_SEC` 7 s | **Stands.** Row 64 corrected: 7.1 s is the ISO 10791-9 figure, 6.6 s the MAS figure. |
| 10 | Deep-hole threshold | **Stands.** Rows 42, 43 and 27–34 confirmed. Wording correction in point 4. |

The three edits to item 1:

- GJS shoulder fz **0.25**, not 0.30 (row 9);
- GJS < 800 face milling **200** like-for-like (MC5020), or state the grade;
- boring f 0.2 only.

The aluminium and GJL entries are as printed.

### Foundry (PROPOSAL P1–P6)

Every row the six items cite is CONFIRMED, so all six stand on their sources. The [J] / [GAP] labels are unchanged.

- **P1:**
  - rows 0, 1, 4 (D3-555 B 555 / 485), 9 and 15;
  - utilisation from rows 21, 22 and 24 (83 %, 94–97 %, > 90 % recomputed);
  - FBO IV from row 18.
- **P2:** crew from rows 27 (DISAMATIC 3 → 2 with automatic pouring), 28 and 29.
- **P3:**
  - Wood life from rows 37 and 38.
  - Aluminium life from rows 37, 38 and 39, with the 10× spread confirmed.
  - Steel 500k from row 35. That row is confirmed, but its context is aluminium castings (point 7).
- **P4:** 40 s cell and 0.5 crew from rows 41, 42 and 47. The "5–10 kg" framing is to be dropped (point 6).
- **P5:** Laempe cycles (rows 50 and 51) and BREF binder / amine / purge figures (row 53).
- **P6:** Döktaş 50.6 % (row 64), differential case 62 → 67 % (row 62), Fundimig 68 % (row 63), and BREF Tables 3.12 / 3.13
  (rows 57 and 58). Fix the 55–65 wording (point 8).

### Composites (PROPOSAL 3.1–3.3)

Every row the proposals cite is CONFIRMED, so every item stands. Fifteen of the rows (the CompositesWorld, MoldMaking and
Gardner ones) were read through the fetch tool only. All of the 3.1 and 3.2 numbers below were recomputed or checked:

- **3.1.1 tool life:** TL-1 (< 300), TL-3 / TL-5 (500), TL-4 (1,000), TL-8 (1,000–100,000), TL-11 (> 100,000) and TL-10 (200,000).
- **3.1.2 metal tool:** 4,505 cycles a tool.
- **3.1.3 layup:**
  - hand 0.91 kg/h gives 0.427 h/m²/ply and 20.7 min;
  - today's 0.06 h/m²/ply equals 6.46 kg/h;
  - ATL is 9.1 kg/h.
- **3.1.4 cure, M21:** 3.7–5.7 h.
- **3.1.4 cure, M77:** 23 min.
- **3.1.5 autoclaves:** 9.4, and 11.7–17.7 on M21 timing.
- **3.1.6 alert:** quotes VR-4.
- **3.2 PCM:**
  - 8 min, 8 MPa, < 5 min preform;
  - press force 382 kN;
  - 3–4 tools at 200k;
  - 130 °C / 5 min.
- **3.2 alternatives:**
  - HP-RTM 3–7 min, and ≤ 3 min for 50–80k a line;
  - WCM;
  - C-SMC 1–4 min.
- **3.3:** JHM > 1,000 open mould; RTM 1,000–5,000 (1998).

**Before a report prints any composites quote:** if raw-text proof is required, the fifteen fetch-tool rows need a person to
open the page in a browser. Plain curl is refused with 403 on those hosts.
