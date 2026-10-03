# Rubber cost model — end-to-end review, 3 October 2026

The rubber and elastomer model was traced from the uploaded CAD to the pound, as
the casting, moulding, sheet-metal, machining, forging and gear models were.
Every finding has a test in `calculator/tests/rubber-review.test.ts`.

**Summary.** The rubber rules could not cost the commonest rubber parts on a
vehicle:

- **Silicone machine for everything.** Any compound above 250,000 a year went
  to the *liquid-silicone* injection machine.
- **Extrusions never recognised.** A door seal was "injection moulded" with a
  25-minute cure.
- **Thickness from an artefact.** The cure came from the ray-cast maximum wall,
  which reads 18 mm on a 2–3 mm profile and nothing at all on a grommet, so the
  grommet was blocked.
- **No rubber route.** The route question had no rubber option, so a rubber part
  could only be costed by forcing the drop-down.
- **Unsourced cure term.** The heat-penetration term was a 4 s/mm² constant.

On the screen, every optional machine drop-down fell to the first machine in the
library, so rubber flash was trimmed on a CNC lathe.

## 0. Test parts (modelled — the audit set held no rubber part)

`cad-audit/parts/RUB_modelled_parts.py`. **Not customer parts.**

| Part | Compound | Geometry |
|---|---|---|
| Grommet | EPDM | Ø40 flange, Ø26 body with a groove, Ø12 bore, 11 cm³ |
| AV mount block | NR | 60 × 60 × 35 mm, R6 edges, Ø10 bore — the thick-section case |
| Door seal | EPDM | 1 m profile: hollow Ø14 / Ø10 bulb on an 18 × 3 mm foot, 1.29 cm² section |

## 1. Findings

| # | What was wrong | Effect | Fix |
|---|---|---|---|
| 1 | **Every compound above 250k/yr routed to `injection_mould_lsr`.** That machine is for liquid silicone only. | EPDM and NR costed on the LSR machine. | LSR only for liquid silicone. A solid-rubber part at volume is transfer-moulded. The library has no rubber injection press, so transfer is the costed proxy and the basis says so. |
| 2 | **Extruded profiles never recognised.** | 1 m door seal "injection moulded", 25-min cure: **£13.53**. | A part 8× longer than its section, whose volume equals the measured section silhouette × length (±10%), is extruded. Line speed 12 / 8 / 4 m/min by section; cure tunnel in line at the same takt; crew 2. Door seal **£0.75**. |
| 3 | **Cure section = ray-cast max wall.** | Door seal 18 mm (true 2–3 mm). Grommet: no reading, so the costing blocked. | The 95th-percentile ray wall, capped at 2 × the solid's mean section 2·V/S; with no ray reading, 1.5 × 2·V/S. Door seal 4.6 mm, grommet 6.4 mm, mount 25 mm (the true inscribed section). |
| 4 | **Heat penetration 4 s/mm² × t²**, unsourced. | 25 mm mount: 42-min cure. | Slab conduction from both faces, centre at 90% of the mould temperature (Fourier number ≈ 1 on the half thickness): t² ÷ (4α), α = 0.1 mm²/s, which is 2.5 s/mm² × t². Mount 28 min. |
| 5 | **Cavities from a footprint bucket**, capped at 8. | A 50k/yr grommet on a 5-min cure needed two presses' worth of time. | The cavity count that makes the part cheapest: press and crew time ÷ cavities, plus the tool amortised. It must make the year's volume on one press, fit the platen (2.5 × footprint each) and stay ≤ 32. Grommet: 19-up. |
| 6 | **No rubber route.** | A rubber CAD part could only be costed by forcing the drop-down; the bulk path could not be answered into it. | `rubber` is a route; a part named EPDM, NBR, FKM, silicone, rubber, grommet, gasket, O-ring, weatherstrip or anti-vibration is offered it. |
| 7 | **Metal inserts counted from cylindrical bosses** on the rubber. | A boss is not an insert. | Inserts come from the engineer's answer, else 0, stated. |
| 8 | **Cure written twice on screen.** The rule put the mould cure in the separate-cure field too; with a cure oven chosen, the screen added a second cure. | — | The separate cure is the extrusion tunnel only; a moulded part cures in the mould. |
| 9 | **Crew, OEE, labour efficiency, scrap, press** differed between paths. | Screen OEE 0.78 / headless 0.80, 0.88 against 0.92, 0% against 3%; the screen's press was its first drop-down option. | Rules on both paths. Crew 0.5 on hand-loaded presses, 0.25 LSR, 2 on an extrusion line, 1 die-cut; OEE 0.80; 0.92; 3% scrap; the route's press. |
| 10 | **No deflash, post-cure or mould change.** | — | Deflash and visual check as a bench task (compression 10 s, transfer 5 s, LSR 2 s). Post-cure 4 h in a 100 kg batch (FKM, silicone, ACM, AEM, HNBR; FFKM 24 h). Mould change and heat-up 1.5 h a batch (die 1 h). |
| 11 | **Moulds rounded up inside a year.** | — | Fractional mould sets, as the forging review did for die sets. |
| 12 | **Every optional machine drop-down lost its "— None —"** when filled from the library. | Screen deflash on a CNC lathe (£41/h) at a machinist's rate. Forging preform and trim selects the same. | The empty option is kept. |
| 13 | **Projected-area basis** still said "two largest bounding-box dimensions". | — | It is the measured silhouette, and says so. |

## 2. Before and after (headless, 50,000/yr)

| Part | Before | After |
|---|---|---|
| Grommet | **blocked** (no section) | **£0.68** (19-up transfer, 5.1 min cure) |
| AV mount | **£11.70** (LSR machine, 43 min, 4-up) | **£2.28** (transfer, 28 min, cost-chosen cavities) |
| Door seal | **£13.53** ("moulded", 25 min) | **£0.75** (extruded, 5 s a metre) |

## 3. Hand reconciliation: grommet, 50,000/yr

Library rates:

| Item | Rate |
|---|---|
| EPDM | £1.90/kg (scrap £0.05/kg) |
| Transfer press | £22.05/h |
| Semi-skilled operator | £19.94/h |
| Technician | £28.81/h |

Scrap 3% (÷ 0.97); OEE 0.80; labour efficiency 0.92.

| Line | Working | £ |
|---|---|---|
| Cure | 180 s (EPDM) + 6.4² ÷ 0.4 = 102 s + 25 s handling = **307 s**, 19 cavities | |
| Material | 0.0126 kg ÷ 0.97, 3% flash → 0.0134 kg × £1.90 − flash × £0.05 | 0.025 |
| Process | 307 s ÷ 19 ÷ 0.97 = 0.00463 h × £22.05 ÷ 0.8 = 0.128; mould change 1.5 h ÷ 2,500 × £22.05 = 0.013 | 0.141 |
| Labour | press 0.00463 h × £19.94 × 0.5 ÷ 0.92 = 0.050; deflash 5 s bench = 0.031; change 1.5 h ÷ 2,500 × £28.81 = 0.017 | 0.099 |
| Tooling | £14,496 (19-cavity aluminium transfer tool) ÷ 50,000 | 0.290 |
| Packaging + logistics | | 0.013 |
| Overhead 12% of £0.554; margin 8% of £0.634 | | 0.067 + 0.051 |
| **Total** | | **0.68** |

## 4. Live in a browser

The modelled STEP files, a real server and a browser, every field identical:

| Part | Screen | Headless |
|---|---|---|
| Grommet | **£0.68** | **£0.68** |
| AV mount | **£2.28** | **£2.28** |
| Door seal | **£0.75** | **£0.75** |

The steering-knuckle forging still lands at £44.02 live after the drop-down fix.

## 5. Second pass — a standard rubber should-cost, line by line

| Element | Status |
|---|---|
| Compound weight from part + flash / spew + scrap | Done (flash 3% moulded, 0 extruded; 3% scrap) |
| Compound mixing (masterbatch, final mix) | **Open** — in the library's compound price, not built up |
| Preform / blank prep (cut, weigh) | **Open** — not a separate step |
| Process choice: compression / transfer / injection / LSR / extrusion / die cut | Done (#1, #2); HCR injection is proxied by transfer |
| Cure time from section and compound | Done (#3, #4) |
| Cavitation | Done (#5) |
| Press, crew, OEE | Done (#9) |
| Deflash / trim | Done (#10), as a bench task; cryogenic deflash not offered |
| Post-cure | Done (#10) |
| Mould change | Done (#10) |
| Bonded inserts: insert, blast, primer, bonding | **Open** — count asked (#7), the inserts' cost is not |
| Mould cost (toolmaker build-up) and life | Existing build-up kept; sets fractional (#11) |
| Extrusion: line, cure tunnel, cut to length, joining | Line and tunnel done (#2); cutting waste and joining **open** |
| Inspection / packing | Visual check in deflash; packaging from the library |

## 6. Still open, stated rather than hidden

- **Every constant is engineering-typical:**
  - cure base times, diffusivity, handling
  - line speeds, crews, deflash seconds
  - post-cure hours and load, mould change
  - platen usable area, the 32-cavity cap

  All are printed on the basis. None has been compared with a rubber moulder's
  figures.
- **No rubber (HCR) injection press in the rate library.** Transfer is the proxy;
  at very high volume a real injection press would be cheaper.
- **The extrusion line rate is the library's** (£12.91/h extruder + £13.08/h cure
  tunnel), which looks low for a full line. Corner moulding, joining, flocking,
  coating and cut-to-length waste are not modelled.
- **Bonded rubber-to-metal parts:** the insert count is asked, but the inserts'
  own cost, blast and primer are not priced from CAD.
- **Compound price** is the library's per-compound figure; a customer recipe
  (phr) is costed only through the advisor's recipe helper on the form.
- **The modelled parts are not customer parts.**
