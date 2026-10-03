# Composites cost model — end-to-end review, 3 October 2026

The composites model was traced from the uploaded CAD to the pound, as the
previous commodities were. Every finding has a test in
`calculator/tests/composites-review.test.ts`.

**Summary.** A composite part could not get from its CAD to a composite cost:

- **The route question had no composites option.** A laminate could only be
  costed by forcing the drop-down.
- **The name reader knew no composite word.** "… CFRP PREPREG" and "… GFRP RTM"
  parts went straight to sheet metal, and were asked steel or aluminium.
- **Headless had no composites costing at all.** `toCostParams` returned null.

Behind that, the screen's own defaults did the costing:

- **Cure:** 4 parts a cure batch whatever their size, and the first oven or
  autoclave in the drop-down.
- **Trim and inspection:** 0.5 h trim, a £25 NDI scan on every part.
- **Shop settings:** crew 2, OEE 0.78, labour efficiency 0.90.
- **Tools:** as many as `ceil(volume ÷ tool life)`. A prepreg tool is tied up
  for hours through layup and cure, so the volume often needs more than that.
- **Wall:** the laminate thickness was the ray-cast wall.
- **Unit mix-ups:** the CAD fill wrote cm² into the m² area field and seconds
  into the cure-hours field. The rules happened to overwrite both.

## 0. Test parts

Modelled in `cad-audit/parts/COMP_modelled_parts.py`. **Not customer parts.**

| Part | Geometry | System |
|---|---|---|
| Roof panel | 1200 × 900 × 80 mm, R40, 2 mm laminate | carbon prepreg, autoclave |
| Battery-enclosure lid | 700 × 500 × 60 mm, R15, 3 mm laminate | dry glass + vinyl ester RTM |
| Hat-section stiffener | 400 × 120 × 40 mm, R6, 2.5 mm laminate | carbon prepreg |

All three are in the real-parts baseline (50,000/yr). The review test pins them
at 5,000/yr.

## 1. Findings

| # | What was wrong | Effect | Fix |
|---|---|---|---|
| 1 | **No composites route.** | A laminate could not be answered into its commodity. | `composites` is a route. |
| 2 | **No composite words in the name reader.** | Lid and stiffener went straight to sheet metal; the roof was asked blow / roto / sheet. | The reader knows CFRP, GFRP, FRP, prepreg, composite, laminate, carbon / glass fibre, RTM, VARTM and infusion. It does not take "carbon" alone, because of carbon steel. Every branch of the route question offers the route a file names. All three are now asked, leaning composites. |
| 3 | **The fill test called open shells "sealed"**, ahead of the enclosure probe. | Roof panel and BIW inner panel were told they "enclose a sealed void". | A measured enclosure outranks the fill test when the centre sits over the part (≥ 30% of rays hit). The BIW inner panel now gets the open-drape question, sheet metal still offered. The blow duct, seen from beside, keeps its old route. |
| 4 | **No headless costing.** | Bulk runs and the baseline could not price a laminate. | `toCostParams` builds the composites parameters, ahead of the single-grade material check that refused them (fibre + resin are priced per kg), with envelope packaging. |
| 5 | **Wall = ray-cast mean.** | — | 2·V/S. Roof 1.92 mm → 8 plies of 0.25 mm carbon. |
| 6 | **Cure batch 4, cure machine the first in the list.** | — | Cure cell by system: carbon prepreg → 1200 mm autoclave; glass prepreg / infusion → oven; RTM → the press, cured in its die. Parts per load = tools (plan + 50 mm flange) that fit the bed: roof 2 a load, stiffener 20 (capped), RTM 1. A tool that does not fit is costed one to a load and says a larger cell is needed. |
| 7 | **Tools = ceil(volume ÷ life).** | Throughput ignored; whole sets bought. | Tools in service = volume × (layup + cure + 0.5 h turnaround) ÷ (4,000 h × OEE). The module buys the greater of that and volume ÷ life, fractionally. Roof: 7 in service at 5,000/yr, though tool life (500) still sets the total. |
| 8 | **Trim 0.5 h, NDI £25, crew 2, OEE 0.78, efficiency 0.90**: screen defaults; headless had none. | — | Rules on both paths: <ul><li>trim on the 5-axis waterjet: 0.1 h load + edge at 1.5 m/min;</li><li>C-scan £25 on structural carbon only;</li><li>crew 1 (the layup hours are laminator-hours);</li><li>OEE 0.80; efficiency 0.92; scrap 4%;</li><li>skilled laminator, semi-skilled cure and trim.</li></ul> |
| 9 | **CAD-fill units:** cm² into the m² area field, seconds into the cure-hours field. | Overwritten by the rules, but wrong whenever they were not. | Converted. A typed 0 trim time also stays 0 instead of falling to 0.5 h. |
| 10 | **Tool sized on the "along draw" silhouette.** | — | The plan (largest silhouette), shared with thermoforming. |

## 2. Before and after (5,000/yr)

| Part | Before | After |
|---|---|---|
| Roof panel | **could not be routed** (blow / roto / sheet only); headless: no costing | **£443.36** |
| Battery lid | **routed to sheet metal** without a question; headless: no costing | **£91.17** |
| Hat stiffener | **routed to sheet metal**; headless: no costing | **£99.63** (£25 of it is the C-scan) |

## 3. Hand reconciliation: battery-enclosure lid, 5,000/yr

Library rates:

| Item | Rate |
|---|---|
| E-glass fabric | £3.99/kg |
| Vinyl ester resin | £5.46/kg |
| RTM press | £22.78/h |
| Waterjet | £33.14/h |
| Bench | £0.71/h |
| Skilled labour | £26.19/h |
| Semi-skilled labour | £19.94/h |

Scrap 4% (÷ 0.96); OEE 0.80; labour efficiency 0.92.

| Line | Working | £ |
|---|---|---|
| Laminate | 2·V/S 2.91 mm ÷ 0.50 mm = 6 plies; mould side 0.503 m²; 1,464 cm³ × 1.80 = 2.636 kg | |
| Material | fibre 2.636 × 0.50 × £3.99 = 5.259; resin 1.318 × £5.46 = 7.196; ÷ (1 − 0.12 waste) ÷ 0.96 | 14.74 |
| Process | preform load 0.075 h on the bench 0.07; cure in the die 0.8 h ÷ 0.96 × £22.78 ÷ 0.8 = 23.73; waterjet 0.127 h ÷ 0.96 × £33.14 ÷ 0.8 = 5.48 | 29.28 |
| Labour | layup 0.0781 h × £26.19 ÷ 0.92 = 2.22; cure attendance ¼ × 0.833 h × £19.94 ÷ 0.92 = 4.52; trim 0.132 h × £19.94 ÷ 0.92 = 2.87 | 9.61 |
| Tooling | 5,000 × 1.38 h ÷ (4,000 × 0.8) = 2.15 → 3 matched dies × £35,504 ÷ 5,000 | 21.30 |
| Packaging + logistics | | 0.49 |
| Overhead 12% of £74.94; margin 8% of £84.42 | | 8.99 + 6.75 |
| **Total** | | **91.17** |

## 4. Live in a browser

The modelled STEP files at 5,000/yr, a real server and a browser, every field
identical:

| Part | Screen | Headless |
|---|---|---|
| Roof panel | **£443.36** | **£443.36** |
| Battery lid | **£91.17** | **£91.17** |
| Hat stiffener | **£99.63** | **£99.63** |

All three are routed live through the route question, leaning composites.

## 5. Second pass — a standard composite should-cost, line by line

| Element | Status |
|---|---|
| Fibre + resin by system, fibre fraction, waste | Existing system table (four systems) |
| Ply count from the laminate thickness | Done (#5) |
| Ply cutting (CNC ply cutter, nesting) | **Open** — inside the waste fraction and the layup rate |
| Layup / preforming hours | Existing rate per m² per ply. **Open:** 0.06 h/m²/ply for carbon prepreg is a pre-kitted, simple-shape rate; complex aerospace layup is several times slower |
| Bagging consumables (bag, breather, peel ply, sealant) | **Open** — not priced; typically £5–20/m² for prepreg |
| Cure cell, load, attendance | Done (#6) |
| Demould, trim, drill | Done (#8); drilled holes are not counted from CAD |
| NDI | Done (#8), by system |
| Paint / clear coat (Class-A carbon) | **Open** — not priced |
| Tools: count, life, cost | Done (#7). The cost is the existing per-m² rate by process |
| AFP / ATL, HP-RTM, SMC / compression moulding | **Open** — not in the system table; SMC is the high-volume automotive route |

## 6. Still open, stated rather than hidden

- **Every constant is engineering-typical:**
  - the layup rates and cure times of the four systems;
  - cure beds, tool flange, turnaround, tool hours;
  - waterjet speed, the NDI price, scrap.

  All are printed on the basis. None has been compared with a composites
  supplier's figures.
- **Only four laminate systems.** There is no SMC, HP-RTM or AFP route, so
  high-volume automotive composites are costed as prepreg or RTM.
- **Bagging consumables and Class-A paint** are not priced.
- **The roof tool only just fits the 1200 mm autoclave** (1.0 m usable width
  with a 50 mm flange). There is no larger autoclave in the library.
- **The modelled parts are not customer parts.**
