# Machining cutting data — sourced research (3 Nov 2026)

Scope: report-standard review §2, "Machining time base". Reviewers judged `src/engine/machining-time.ts` /
`feature-machining.ts` 2–3× slow on a production cell (stub axle 24 HMC min against a judged 7–9). This folder holds
**published manufacturer data only**. Every figure is in `data.json` (91 rows: quantity, material, value, unit,
conditions, source, url, date read, exact quote. The quotes are condensed from PDF text extraction, so table
columns are joined by spaces). Nothing here was taken from a search snippet. Every document was
downloaded or opened and read (PDF text via `pdftotext`; the OSG chart was also rendered to read its colour legend).
No code was changed.

## 1. Sources actually read

| Source | What it gives | Age / caveat |
|---|---|---|
| Mitsubishi Materials, `mitsubishicarbide.net` manuals: WSX445 face mill, APX4000 / SPX shoulder mills, FMAX PCD/CBN face mill, MVE and MVS solid-carbide drills, SVJD turning | vc, fz/f, ap, ae by material row (mild / carbon-alloy 180–280 HB / grey < 350 MPa / ductile < 450 and < 800 MPa / Al Si < 5 %) | PDFs dated Feb–Mar 2023 (metadata) |
| Mitsubishi Materials USA, TOOL NEWS B266A (MC6100 steel turning grades) | finish / medium turning vc and f in steel 180–280 HB | inch units, converted by us; CDN copy |
| Sandvik Coromant, *Metalcutting Technical Guide (D) Milling* | worked face / shoulder milling examples in C45-class steel; **power constant K** per CMC material group | 2006 (PDF metadata); distributor-hosted copy (Directools) |
| Sandvik Coromant, *Small Part Machining* catalogue | turning vc by CMC group and feed (GC4015, GC3005, H10), **kc0.4** per group, CoroDrill Delta-C drilling vc / fn by diameter | 2002–2004 (page stamps / metadata); grades superseded; distributor-hosted copy |
| Tungaloy (`tungaloy.com`): T515 cast-iron turning brochure; TungAlu-Mill standard conditions | turning vc ranges grey / ductile, boring application examples; aluminium face / shoulder milling vc, fz and worked n / Vf tables | 2017 / 2020 |
| OSG, A-Tap flier n_102 (`osg.co.jp`) | tapping speed bands (advisable / possible) for S45C, SCM, AC/ADC, FCD | 2026-05 |
| Okuma, MA-4000H brochure (Jul 2025) and MB-5000HII (Feb 2026) | chip-to-chip (ISO 10791-9), tool-to-tool, **pallet change**, indexing; maker "actual data" removal rates in S45C, FCD450, A5052 | maker's own CDN |
| GROB G350 page; DMG MORI NHX 4000 2nd gen press release (2016); HELLER H gen4 news | chip-to-chip 2.7 s (VDI 2852), 2.2 s, spindle run-up 1.4–2.6 s | |
| Hoffmann Group (GARANT) product pages | DIN 1897 Ø14 and DIN 338 Ø14.5 flute length and recommended max drilling depth | |
| Techspex (third-party database) | Makino a51nx 2.2 s chip-to-chip | **not a maker source** — kept only as a cross-check, flagged in the row |

## 2. What could not be obtained (and was therefore NOT used)

- **Haas** (EC-400 flyer, haascnc.com speeds-and-feeds PDFs): HTTP 403 to both curl and the fetch tool. Not used.
  The search snippet's "2.8 s / 3.6 s" is therefore NOT in the data.
- **Sandvik Coromant website** (knowledge pages, kc1 table, cutting-data calculator): JS-only page, no content
  readable. Sandvik data come only from the two catalogue PDFs above (old grades, stated).
- **DN Solutions, Heller, Okuma, Mitsubishi catalogue pages on DirectIndustry / mmc-carbide.com**: 403. Not used.
- **Makino, Mazak** maker spec pages: no readable content / redirects. Only the flagged Techspex row.
- **Kennametal, Iscar, Seco, Walter, Guhring, Emuge** cutting-data catalogues: not reached in the time; no figure from
  them is used. A Guhring "no pecking at 5×D" claim was seen only on a distributor page that is now 404 — not used.
- **Peck-drilling threshold**: no maker statement read. What the MVS table shows is that Mitsubishi gives the SAME
  feed for every L/D from 3×D to 8×D on its through-coolant drill (rows "3DC–8DC"), and a separate, lower-feed row
  set for 10–30×D plus a 2×D pilot row. That is evidence the catalogue does not derate (or peck) to 8×D; it is not a
  statement about pecking.
- **Microalloyed forging steel (38MnVS6)** and **6082 / A356 by name**: no catalogue row names them. Map by the
  catalogue's own groups (carbon/alloy steel 180–280 HB; Al wrought aged CMC 30.12; cast Al Si 5–10 % / CMC 30.21–22)
  — the hardness of 38MnVS6 was not sourced here.
- **VMC chip-to-chip**: no VMC maker spec read (Haas blocked). HMC / universal figures only.
- **A published "machinability index"** (e.g. % of B1112) from a maker: not found. Section 6 below uses Sandvik's power
  constant K and kc0.4, which are force/power ratios, not tool-life ratios.

## 3. The figures that matter, against the tool

The tool's effective rates are its aluminium constant ÷ `timeFactor` (cast iron 1.6, steel 2.0). Catalogue columns are
**in-cut** rates computed from the sourced vc / f / fz with `n = 1000·vc/(π·D)`, `vf = n·z·fz` (Sandvik's own
formulas, data.json). Approach, over-run and rapid moves are NOT in them (see §4).

| Operation | Tool (Al / iron / steel) | Catalogue, in-cut (source) | Ratio catalogue ÷ tool |
|---|---|---|---|
| Drill Ø12–14, feed along hole | 400 / 250 / 200 mm/min, + 0.15 min a hole × factor, + 0.25 min + 2nd pass if Ø13–26 blind or L > 2D | Ø12: steel 180–280 HB 713 (MVE), 1,020 (MVS 3–8×D); GJS < 450 MPa 589 / 900; GJL 693 / 1,184; Al Si<5 % 806 / 2,100. Sandvik R840 Ø10–14: C45 364–1,485; GJS pearlitic 477–1,459; GJS ferritic 637–1,751; cast Al 819–3,050 | steel 3.6–5×; iron 2.4–3.6×; Al 2–5× (cutting term only) |
| Finish face milling, area swept | 80 / 50 / 40 cm²/min (8,000 mm²/min ÷ factor) + 0.2 min a face × factor (near-net); wall rate 40 / 25 / 20 cm²/min (from-solid) | Ø100 z=7, ae 70, fz 0.15 (WSX445 finish): steel 220 m/min → 735 mm/min → **515 cm²/min**; GJS < 450 MPa 200 → **468**; GJS < 800 MPa 160 → 374; GJL 220 → 515. Al (TungAlu-Mill Ø100 z=6, vc 1000, fz 0.2 → Vf 3,800) → ~2,660 | face: ×9–13 (iron/steel), ×33 (Al); vs the wall rate ×19–26 |
| Finish turning, surface generated (fn·vc) | 120 / 75 / 60 cm²/min | steel C45: GC4015 fn 0.1 @ 485 → 485 cm²/min; MC6115 FP 250–480 m/min × 0.08–0.25; GJS pearlitic GC3005 fn 0.1 @ 260 → 260, fn 0.3 @ 215 → 645; T515 ductile 150–300 m/min × 0.15–0.41; cast Al H10 2,000 × 0.15 → 3,000 | steel ~8×; iron 3.5–8.6×; Al ~25× |
| Finish boring, feed along bore (Ø45) | 150 / 94 / 75 mm/min + 0.25 min × factor | Tungaloy T515 boring example: GJS 80-55-06 201 m/min, f 0.2 → 284 mm/min (142 at f 0.1); grey 299 m/min, f 0.2 → 423 | iron 1.5–3× |
| Rigid tapping M10×1.5 | 500 / 312 / 250 mm/min + 0.10 min × factor | OSG A-SFT: S45C advisable 15–50 m/min → 716–2,387 mm/min; SCM advisable 10–15 → 477–716; FCD / AC-ADC "possible" 5–50 → 239–2,387 | steel ~2.9× at the low end of advisable |
| Roughing (milling) MRR | 120 / 50 / 35 cm³/min ("practical average incl. step-downs and air moves") | Catalogue medium cut, Ø100 z=7, ae 70, ap 3, fz 0.2: steel 206 cm³/min at 10.5 kW (Sandvik K 5.1); GJS 187 at 8.6 kW (K 4.6). Okuma maker peak "actual data": S45C 483 (face) / 704 (end), FCD450 809, A5052 4,022 | 4–6× in-cut (not like for like: the tool's figure includes air moves) |
| Chip-to-chip tool change | 6 s (`TOOL_CHANGE_SEC`) | Okuma MA-4000H 2.15 s (≤ 4 kg) / 2.46 s, ISO 10791-9; MB-5000HII 2.1 / 2.5 s; DMG NHX 4000 2.2 s; GROB G350 2.7 s (VDI 2852); Heller spindle run-up alone 1.4–2.6 s | tool is 2.2–2.9× the maker best case |
| Pallet change | 10 s (`PALLET_CHANGE_SEC`, "maker figures 7–12 s") | Okuma MA-4000H **6.6 / 7.1 s** | tool 1.4–1.5× |

**Worked cross-checks on the reviewers' examples** (cutting terms only; the proposal in §5 adds the stated non-cutting):

- Ø14 × 59 drilled + reamed hole in GJS-500-7: tool 1.11 min ((0.15 + 59/400 + 0.25 + 59/400) × 1.6). Catalogue drill
  59 mm ÷ 477–1,251 mm/min (Sandvik 09.2, Ø14) = 0.05–0.12 min; a second (ream/bore) pass at 0.2 mm/rev, ~200 m/min
  ≈ 0.07 min. Cutting ≈ 0.12–0.19 min a hole against 1.11 — the fixed 0.40 min × 1.6 is most of the gap.
- 4,385 mm² face in steel (knuckle): tool 1.50 min ((0.2 + 4385/8000) × 2.0). Catalogue finish 735 mm/min with a Ø100
  cutter: ~63 mm of face length + 100 mm cutter run-out ≈ 0.22 min. The cutter's own run-out dominates a small face —
  which is why §5 models it from the cutter diameter, not from area.

So the published data support the reviewers' **direction** and roughly their **magnitude** on the cutting terms
(drilling, facing, turning 3–10×); the remaining question for the stub-axle total is the non-cutting time
(positioning, approach, spindle start/stop), which no catalogue gives — see §4.

## 4. What the catalogues do NOT give (must stay labelled engineering-typical, or come from a supplier cycle sheet)

- Rapid positioning between features: the machine's rapid rate is sourced (Okuma MA-4000H X-Y 60 m/min, 1.0 G) but the
  number and length of moves is a CAM output.
- Approach / retract clearances, spindle start-stop between tools (Heller's 1.4–2.6 s run-up is part of chip-to-chip).
- Cutter entry/exit over-run on face passes (geometry: + cutter diameter; Sandvik `Tc = lm / vf` with lm the
  machined length — the over-run is in lm).
- Deburr, gauging, probing cycles.
- Air-cut share in roughing (the tool's 35 / 50 / 120 cm³/min embeds it; a catalogue MRR does not).
- Ream vs single-pass, peck cycles below 8×D, tolerance-driven second passes — need the drawing.
- Tool life → tool £ per minute (`toolCostPerCutMin`) — not researched here.

## 5. PROPOSAL — mapping onto `machining-time.ts` / `feature-machining.ts` (NOT implemented; for review)

Principle: replace each constant by a **published vc / f table by material group and operation**, compute the in-cut
time from geometry with the maker's formulas, and keep every non-cutting allowance as its own constant, **not scaled
by the material** (the reviewers' point — `× timeFactor` on 0.15 / 0.25 / 0.20 / 0.10 min fixed allowances has no
basis in any source read). Use the catalogue **start (recommended) value**, not the range top, and print it.

1. **New data table** `CATALOGUE_CUTTING_DATA[family][operation]` = `{ vc, f or fz, z, Dc, source }`, seeded from
   `data.json`. Proposed start values (mid of the recommended figure, as printed):
   | family | face mill finish | shoulder | drill Ø12–16 (n·f) | turn finish | bore | tap |
   |---|---|---|---|---|---|---|
   | steel (C45 / 42CrMo4, 180–280 HB) | vc 220, fz 0.15 (WSX445) | vc 160, fz 0.25 (APX4000) | 713 / 561 mm/min (MVE, conservative) | vc 485 @ fn 0.1 (GC4015) or 250–480 × 0.08–0.25 (MC6115) | — | 15 m/min (OSG advisable low end; SCM 10) |
   | cast iron GJS (< 450 / < 800 MPa) | vc 200 / 160, fz 0.15 | vc 190, fz 0.30 | 589 / 462 mm/min (MVE) | vc 260 @ fn 0.1 (GC3005 09.2) | vc 201, f 0.1–0.2 (T515) | 5–15 m/min (no advisable band; use 15 short-chamfer top) |
   | cast iron GJL | vc 220, fz 0.15 | vc 230, fz 0.30 | 693 / 525 mm/min (MVE) | vc 280 @ fn 0.1 (GC3005 08.2) | vc 299, f 0.2 | as GJS |
   | aluminium (6082 / A356) | vc 1000, fz 0.2 (TungAlu-Mill) | same | 806 / 627 (MVE) — MVS 2,100 with through-coolant | vc 2000 (H10, CMC 30.2x) @ fn 0.15 | — | 5–50 possible (no advisable band) |
   The MVE (external coolant) row is proposed as the default because it is the conservative of the two Mitsubishi
   tables; MVS applies when the machine has through-spindle coolant (the HMC cell normally does — a stated choice).
2. **`FINISH_RATE_CM2_PER_MIN.wall` (40) and `FACE_MILL_FEED_MM2_PER_MIN` (8,000)** → face time per face =
   `passes × (L + Dc + 2·c) / vf`, passes = ⌈W / (0.7·Dc)⌉, vf = `n·z·fz` from the table; Dc chosen from the face
   width (catalogue bodies Ø63 / Ø80 / Ø100 / Ø125). `c` (clearance) is engineering-typical and printed as such.
   Walls (from-solid side passes): `wall height × vf` per pass with the shoulder-mill row.
3. **`FINISH_RATE_CM2_PER_MIN.turning` (120, "derated ~3×")** → `area / (fn · vc · 1000)` with the turning row (the
   code's own note already cites Sandvik's Tc = lm/(fn·n)); delete the unsourced 3× derate and put approach / retract
   in a separate stated allowance per diameter step.
4. **`DRILL_FEED_MM_PER_MIN` (400), `BORE_FINISH_MM_PER_MIN` (150), `TAP_FEED_MM_PER_MIN` (500)** → `n·f` from the
   drill / boring / tap rows at the hole's own diameter (`n = 1000·vc/(πD)`), so a Ø6 and a Ø20 drill no longer share a
   feed. Tapping feed = `n × pitch` (pitch from `tappedThread`).
5. **Fixed per-feature allowances (0.15 drill, 0.25 bore pass, 0.20 face, 0.10 blind, 0.10 tap, 0.06 micro)** → keep
   as non-cutting constants, **remove the `× timeFactor`** on them, label "engineering-typical positioning / approach,
   not sourced", and list them with their £ on the "unsourced figures" page. The 0.25-min + second-L "bore pass" on
   every Ø13–26 blind / > 2D hole should become a pass at the boring row's feed (≈ 0.07 min on the Ø14×59 example).
6. **`timeFactor`** → retire for cutting time (each operation reads its own material row). If a single scalar is still
   wanted for an unlisted metal, the only sourced relative figures are Sandvik's power constant K (fz 0.2, ae/Dc 0.8):
   steel C45 5.1, 42CrMo4 non-hardened 5.4, QT 6.4, GJL 3.0–3.7, GJS ferritic 3.0, GJS pearlitic 4.6, Al wrought aged 2.1,
   Al cast 2.2 — i.e. per unit of power, steel ≈ 2.3–2.4 × aluminium and GJS 1.4–2.2 × aluminium. These are force ratios,
   relevant to power-limited ROUGHING only; in finishing and drilling the catalogue speeds for cast iron and C45-class
   steel are nearly equal (WSX445 220 / 220 / 200 m/min; MVE Ø12 713 / 693 / 589 mm/min).
7. **`millRoughCm3PerMin` (120 / 50 / 35)** → in-cut Q = min(catalogue medium cut Q, machine power × 100 / K × η)
   using Sandvik's `Pc = ap·ae·vf·K/100 000` (η 0.8 already in K) and the costed machine's continuous spindle kW
   (rate book). Air moves / step-downs as a separate, stated non-cutting share — not hidden inside the rate.
8. **`TOOL_CHANGE_SEC` (6)** → 2.2 s chip-to-chip (Okuma CTC 2.15 s ISO 10791-9, DMG 2.2 s; GROB 2.7 s VDI 2852) for
   the HMC/universal class, printed with the standard; keep the 6 s for a non-production VMC only if a VMC source is
   found (none read). Tools ≥ 4 kg (face mills) 2.5 s (Okuma).
9. **`PALLET_CHANGE_SEC` (10)** → 7 s (Okuma MA-4000H 6.6 / 7.1 s). Its comment "maker figures 7–12 s" is not supported
   by any maker page read here; only Okuma's figure is.
10. **Deep-hole DFM threshold** (reviewers' point 23): DIN 338 jobber Ø14.5 reaches 92.3 mm (6.4×D) and the MVS
    through-coolant table runs 3–8×D at one feed — a 4.2:1 hole is inside standard catalogue reach.

After any of this: shadow models (`scripts/arith-audit/`) and the real-parts baseline must be updated, and the stub axle
re-costed live; the result is still not "measured" until a supplier cycle sheet is compared (actuals file).

## 6. Disagreements between sources (all kept in data.json)

- Drill feed Ø12 in C45-class steel: MVE 713 mm/min, MVS 1,020, Sandvik R840 range 424–1,485 — a 3.5× spread inside
  the recommended windows. The MVE start value is the low, conservative one.
- Ductile iron turning: Sandvik GC3005 09.2 260 m/min (fn 0.1); Tungaloy T515 150–300 m/min; Tungaloy's own
  application example 201 m/min (boring). Consistent.
- Chip-to-chip: 2.1–2.7 s across Okuma / DMG / GROB; different standards (ISO 10791-9 vs VDI 2852) and tool masses.
- Okuma's removal rates are maker demonstrations ("actual data ... may not be obtained") — upper bounds, not production
  rates; do not use them as the costing rate.
