# CAD to COST — nine-commodity parity sweep (30 Oct 2026)

**Asked:** confirm that the CAD to COST workflow — measure → confirm → cost, one method, the calculator of the chosen
commodity — holds for every commodity the tool routes, not only the five parts of the 29 Oct review (forging, cast +
machine, injection moulding, pressed sheet metal, aluminium extrusion). The other nine routes had never been driven
through the three steps in a real browser.

**How:** `e2e/cad-to-cost-trace.ts` with a nine-part manifest (`CV_TRACE_PARTS`), a real server (OCP kernel, no AI
key), a real browser at 1440 × 1000, UK, 100,000 a year, 5-year programme. For each part: the three steps, every
question answered as the manifest says, screen = headless (the comparison's reference row from `costMeasuredPart`
against the headline), the PDF and the Excel opened and the cost re-added from the workbook, axe WCAG 2.1 AA on every
step, both themes. One part per route from `cad-audit/parts/`.

## 1. Result — every route reaches the cost by the same three steps, screen = headless on all nine

| Route | Part | Headline | Answered on the way | Screen = headless | Tooling (one-off) |
|---|---|---|---|---|---|
| Blow moulding | BM_Air_Duct.stp | £0.97 | resin, capacity (exact, 2.5 L typed) | £0.97 = £0.97 | £11,839 |
| Rotational moulding | ROTO_Header_Tank.stp | £14.53 | resin | £14.53 = £14.53 | £608,100 |
| Thermoforming | TF_Trim_Cover.stp | £2.18 | resin | £2.18 = £2.18 | £13,683 |
| Composite laminate | COMP_Hat_Stiffener.stp | £98.69 | laminate (carbon prepreg, autoclave) | £98.69 = £98.69 | £12,671,000 |
| Polymer extrusion | EXT_Vent_Pipe.stp | £0.85 | resin (PE100 pipe) | £0.85 = £0.85 | £7,488 |
| Rubber | RUB_Grommet.stp | £0.30 | compound (EPDM 70 Sh A) | £0.30 = £0.30 | £25,903 |
| Gear | test-gear-m3-z38.step | £18.06 | helix (spur), ISO 1328 class 8, gear steel | £18.06 = £18.06 | £315,936 |
| Machining from solid | MACH_Hydraulic_Manifold.stp | £22.45 | process, aluminium | £22.45 = £22.45 | £24,208 |
| Casting (as-cast) | Casting_Braket.stp | £17.86 | process, steel, leak-tight / tolerance / safety | £17.86 = £17.86 | £140,367 |

On every part: the comparison's reference row equals the headline to the penny and carries the screen's band; every
comparison row re-adds independently from its trace (material, 2 to 11 operations, tooling, overhead, margin — all
"closes yes"); the workbook re-adds to the headline (operations from rate × time ÷ OEE ÷ parts a cycle, overhead and
margin at the stated percentages); the stamp (rate book · rules v · kernel rev) is on screen, in the PDF and in the
Excel word for word; axe 0 violations on every step in both themes.

Each part was costed by its own commodity calculator — the same `computeUniversalStack` 8 buckets fed by that route's
rule pack and module: the roto tank is paced by its slowest carousel station and its moulds sized to the volume; the
trim cover is nested on the former's window and trimmed on the router; the vent pipe is section × length on a pipe
line; the grommet is cavities by platen with a deflash bench and a post-cure; the gear is a bar-slice blank, hobbing,
case hardening and a class-8 finish; the manifold is roughed by removal rate and finished by face type on the
twin-pallet cell; the bracket is sand-cast, fettled, melted and shot-blast with its machining on the cell.

Second run (after the fixes below, five parts): 301 pass · 5 fail · 4 info. The five: two harness gaps (a direct-cost
material was re-added as weight × £/kg) and three screen findings, all fixed and re-run (§4).

## 2. What the first run found

### P1 — a route with its own material question was blocked by the generic one

**Finding.** The hat stiffener, the vent pipe and the grommet opened step 2 on two questions: the process (leaning
composites / extrusion / rubber on the part's own evidence) and "What is this part made of? — aluminium / steel / cast
iron / titanium / copper alloy / plastic". The second was raised by the MACHINING placeholder's rules (the server runs
a placeholder commodity's rule pack while the process question is open), offered the families of the other routes on
the table, had no answer a rubber or carbon part could give, and was blocking — Get cost never applied. An engineer
who accepted the leaning route had nowhere to go but "Not listed?".

**Fix.** `server/routes/cad.ts::placeholderCommodity` — while the process question is open, the rules that run are the
LEANING route's (when it has a rule pack); no leaning, or none with a pack, keeps the old fallback. On both `/analyze`
and `/reanalyze`. The grommet now opens on the process and the compound, the stiffener on the laminate, the vent pipe
on the resin; change the route and the re-run brings that route's questions. `tests/cad2c-parity-sweep.test.ts` pins
the three parts' leaning, their placeholder and that `material.family` is no longer among their questions.

### P2 — the kernel check timed out and the screen said the kernel was not installed

**Finding.** Every part opened under a red "STEP and IGES files cannot be read on this computer — the CAD kernel (OCP)
is not installed" while the kernel was measuring STEP files a few seconds later. The server's kernel probe (a Python
import) timed out under load on the first health call, the result was cached as "not installed", and every later
health call repeated it.

**Fix.** `server/utils/geometry-bridge.ts`: a probe that times out returns `{ available: false, unknown: true }` and is
NOT cached (the next health call probes again; timeout 60 s); `server/index.ts` logs it as "?"; the screen says the
check did not finish, not that the kernel is missing (`src/ui/main.ts`). Second run: the notice is gone on all five.

### P3 — the cost card's answer chips printed the whole question on route-specific answers

**Finding.** "What is the nominal capacity of this container? I know the exact capacity", "Spur or helical — what is
the helix angle? Spur", "ISO 1328 flank tolerance class? Class 8" — where the common answers print a word ("Process",
"Resin"). **Fix.** `src/ui/cad-workspace.ts::ANSWER_NAMES` names every route-specific question (Capacity, Helix,
Quality class, Gear steel, Hardening, Casting process, Forging process, Press route, Temper, Bends …).

### P4 — the composite's largest bucket was one opaque line, and its cost card showed a placeholder grade

**Finding.** Material is £34.15 of the stiffener's £98.69. The Excel material sheet printed "Supplied / bought-in
price — no weight-based material · Direct material cost 34.146 · priced by the commodity module"; the PDF the same.
Nothing said how much fibre, at what price, with what waste. The cost card's grade chip read "Virtual / Pass-through
(default)" (the library's placeholder id) and no costed weight.

**Fix.** `modules/composites.ts` itemises the direct cost (`rawMaterial.lines`, display only — no cost path reads it):
fibre (or prepreg) kg bought = net ÷ (1 − waste) × reject uplift at its £/kg, resin the same where priced, NDI per
part; the PDF's §3B and the Excel material sheet print the lines under the figure (the itemisation path the PCBA BOM
already used). The cost card drops the grade chip on the placeholder id (the Laminate chip names the material) and
prints the cured part weight the form holds.

The gear's blank is also a direct cost (a bar slice priced by the rule, £4.86 here). Its basis — "bar slice Ø × L mm =
kg × £/kg" — is on the Basis view and the traceability sheet, so it was left as it is; the harness re-adds a
direct-cost material from its direct line.

### P5 — gear: the grade chip said "(default)" after the gear steel was answered

The cost card's "answered" flag knew the grade, resin and locked-material answers only. It now counts the compound,
the aluminium alloy and the gear steel (`gear.materialClass`) too.

### Harness

- An entry question (a capacity, a helix angle) with a radio answer in the manifest is ticked, not typed into the entry.
- A part whose every question was pre-leaned has no answer round; that is the product working (Get cost applied at
  once) and is recorded as INFO, not as a failed "Updating…" check.
- A direct-cost material (laminate, gear blank) is re-added from its itemised lines, or from the direct line when
  there are none — the weight × £/kg re-add printed NaN on both.
- Page console warnings and errors are logged (`[page warning]`, `[page error]`).

## 3. Observations — what the costings say (not measured against a price paid)

- **Composite hat stiffener £98.69 at 100,000 a year.** The itemised material now shows what the one line hid: prepreg
  0.241 kg bought at £33.60/kg = £8.10, and NDI £25 a part × the reject uplift = £26.04 — the C-scan rule is three
  quarters of the "material" bucket. £25 a part is the rule's figure for a structural carbon part; at 100,000 a year an
  in-line scan would not cost that, and it is the next composites constant to source. £25.34 of it is tooling: the rules put tools in service by
  volume × (layup + cure + turnaround) and wear them out fractionally, so a carbon prepreg autoclave part at this
  volume carries £12.7 M of layup tools. That is what the method says an autoclave route costs at automotive volume —
  the comparison is where the engineer sees the alternative. The process (£16.25) is the autoclave and the waterjet.
- **Rotational-moulded header tank £14.53.** Process £5.63 + labour £3.87 — a slow carousel. Tooling £608k is the
  moulds in service for the volume (never one per arm). The comparison offers blow moulding at £2.32 (cheaper at every
  volume): a 0.66 kg tank at 100,000 a year is a blow-moulding part, and the tool says so.
- **Thermoformed trim cover £2.18.** Injection moulding at £1.26 crosses over at ~20,600 a year on the central estimate
  (interpolated between the re-costs at 10,000 and 25,000), bands overlapping below 25,000. This is the right answer
  for a 0.26 kg ABS cover.
- **Vent pipe £0.85, grommet £0.30, air duct £0.97.** Material-led, as these parts are. The blow-moulded duct carries a
  typed 2.5 L capacity (the band the rules offered was 2–20 L).
- **Gear £18.06.** Material £8.03 (blank £4.86 + case hardening £3.17), process £4.33, labour £1.63. A class 8 spur at
  m3 z38.
- **Manifold £22.45.** 7.4 : 1 buy-to-fly on the plate (14 % becomes the part) — the stock rule's answer for a block
  with 13 holes; the comparison offers cast and machine (needs the tolerance class answered to cost).
- **Casting bracket £17.86 as-cast (steel GS-C25).** Labour £7.32 of it; forging at £19.42 and cast and machine at
  £19.99 are dearer at every volume with overlapping bands — "indistinguishable", as the row says.

Accuracy against prices paid is still unmeasured on all nine.

## 4. Second and third runs

Five parts after the fixes (`scratchpad/nine2`): all five reach the cost; screen = headless on each; the kernel notice
gone; 301 pass · 5 fail · 4 info — the five being P3, P4, P5 and the two harness re-adds, fixed afterwards.
Composites and gear re-run on the final build (`scratchpad/nine3`): see the figures in §1 — the chips print
"Laminate" / "Helix" / "Quality class", the costed weight is on the card, the material re-adds from its lines.

## 5. Where the evidence is

- `scratchpad/nine1` (nine parts, first run, old harness), `nine2` (five parts after the fixes), `nine3` (composites +
  gear on the final build): screenshots both themes, PDFs, workbooks, `trace.json`, `run.log`, `server.log`.
- `tests/cad2c-parity-sweep.test.ts`; the manifest `cad2c-nine.json` beside the five-part one.
- `docs/review/cad2c-five-part-review-2026-10-29.md` — the first five routes; `docs/review/cad2c-readiness-2026-10-29.md`.
