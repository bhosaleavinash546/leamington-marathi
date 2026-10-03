# Polymer extrusion from CAD — build, 3 October 2026

Extrusion had a module and an advisor, but no rules from CAD, so an extruded
part could not be costed from its geometry:

- **No route option.** The route question had no extrusion option.
- **No headless costing.** `toCostParams` had no mapping.
- **Screen defaults.** The CAD fill set only three things: a length (the
  longest box side), a kg/m (net weight ÷ that length) and the ray-cast wall.
  The screen's own defaults did the rest, including a 90 mm screw where the
  module defaulted to 75 mm.

This build adds the rules, the route, the headless path and the tests
(`calculator/tests/extrusion-build.test.ts`).

**Scope: polymer extrusion only** — tube, pipe and profile on screw lines.
Aluminium extrusion is not built, because the rate library has no extrusion
press, billet heater, stretcher or ageing oven. Adding machines to the library
is outside what these builds change. A metal grade answered into the extrusion
route is refused with that reason, and the engineer is offered machining.

## 0. Test parts

Modelled in `cad-audit/parts/EXT_modelled_parts.py`. **Not customer parts.**

| Part | Section | Length | Grade |
|---|---|---|---|
| Fuel / brake line tube | Ø8 × 1 mm | 600 mm | PA12 tube grade |
| Vent / coolant pipe | Ø32 × 3 mm | 1,000 mm | PE100 pipe grade |
| Twin-chamber conduit / trim profile | 40 × 25 mm, 2 mm walls + web | 2,000 mm | rigid PVC compound |

## 1. What the rules derive

| Input | Rule |
|---|---|
| Is it a profile? | The long axis ≥ 8 × the next dimension, and volume = the measured section silhouette × length (±10%). Shared with rubber (`derive/profile.ts`). |
| Cut length | The long axis. |
| Section, kg/m | Section = volume ÷ length, exact for a constant section; × the grade's density. |
| Wall | 2·V/S, the mean wall of the section. |
| Process | Round and hollow (section < 70% of its disc): a tube up to Ø16 mm, a pipe above. Otherwise a profile, "complex" when its outline is long for its area. |
| Line, screw, cooling | Small tube → the precision tube line (45 mm screw, water bath); pipe → the 90 mm pipe line (vacuum sizing); profile → the 75 mm profile line (vacuum calibration). |
| Line rate | The advisor's lesser of the screw's output and the cooling-limited haul-off at the measured wall and kg/m. Pipe: 95 kg/h, cooling-limited. Profile: 156 kg/h, screw-limited (rigid PVC). |
| Start-up scrap | A quarter-hour of the screw's rated output, spread over a run. Runs are monthly, but at least a shift long, so a small tube runs twice a year and its purge is 7%, not 30%. |
| Running scrap | 2% (sampling, gauge drift, saw ends). |
| Die | The advisor's die + calibration build-up at the larger section dimension; complexity from the process. |
| Electricity | The UK tariff (specific energy from the family, in the module). |
| Crew, OEE, efficiency, labour | 0.5 (one operator across two lines); 0.80; 0.92; semi-skilled. |
| Leak test | Not assumed. A pressure test is a specification; the engineer ticks it. |
| Material menu | PA12 tube, PE100 pipe, rigid PVC, TPE profile, PP, PVC foam. Any library polymer is accepted; a metal is refused. |

**Routing.** A constant-section part is asked extrusion / rubber / machining
**before** the hollow and bend tests. A tube's centre is in its bore, so every
enclosure ray meets its wall and the vent pipe read as a closed tank: it was
asked blow / roto / sheet. The fuel line and the profile were asked casting /
cast + machine / machining. A name still leans the question: the EPDM door seal
leans rubber.

## 2. Costs (headless = screen, 50,000/yr)

| Part | Before | After |
|---|---|---|
| Fuel line tube, 600 mm | could not be costed from CAD | **£0.41** |
| Vent pipe, 1 m | could not be costed from CAD | **£1.06** |
| Twin-chamber profile, 2 m | could not be costed from CAD | **£2.02** |

At 5,000/yr: £2.30, £2.68 and £6.87. A year's die amortisation dominates
there, which is the tool's convention for every commodity.

## 3. Hand reconciliation: vent pipe, 50,000/yr

Library rates:

| Item | Rate |
|---|---|
| PE100 | £1.34/kg (scrap £0.12/kg) |
| Pipe line | £29.79/h |
| Cut-off / inspection station | £4.41/h |
| Semi-skilled operator | £19.94/h |
| Electricity | £0.268/kWh |

OEE 0.80; labour efficiency 0.92.

| Line | Working | £ |
|---|---|---|
| Section | 273.3 cm³ ÷ 1,000 mm = 273.3 mm² × 960 kg/m³ = 0.2624 kg/m; wall 2·V/S = 2.99 mm; round hollow Ø32 → pipe | |
| Rate | screw 0.0533 × 90² = 432 kg/h; cooling 28 ÷ 2.99^1.4 = 6.0 m/min × 60 × 0.2624 = 95 kg/h → **95 kg/h** | |
| Scrap | start-up 432 × 0.25 = 108 kg ÷ 1,093 kg a run (12 runs) = 9.9%; running 2% → 11.9% | |
| Material | 0.2624 ÷ 0.881 = 0.2978 kg × £1.34 − 0.0354 kg × £0.12 = 0.395; energy 0.42 kWh/kg × 0.2978 × £0.268 = 0.034 | 0.428 |
| Process | line 0.2978 ÷ 95 = 0.003134 h × £29.79 ÷ 0.8 = 0.117; cut-off 4 s × £4.41 ÷ 0.8 = 0.006 | 0.123 |
| Labour | line 0.003134 h × £19.94 × 0.5 ÷ 0.92 = 0.034; inspect 6 s × £19.94 ÷ 0.92 = 0.036 | 0.070 |
| Tooling | £7,488 die + calibration ÷ 50,000 | 0.150 |
| Packaging + logistics | | 0.120 |
| Overhead 12% of £0.771; margin 8% of £0.984 | | 0.093 + 0.079 |
| **Total** | | **1.06** |

## 4. Live in a browser

The modelled STEP files at 50,000/yr, a real server and a browser, every field
identical:

| Part | Screen | Headless |
|---|---|---|
| Fuel line tube | **£0.41** | **£0.41** |
| Vent pipe | **£1.06** | **£1.06** |
| Twin-chamber profile | **£2.02** | **£2.02** |

## 5. Still open, stated rather than hidden

- **Aluminium extrusion** (crash rails, battery-tray and sill profiles) is not
  modelled. It needs a press line in the rate library, which is a decision for
  the rate owners.
- **Every constant is engineering-typical:**
  - start-up time, run length, running scrap;
  - crew, the tube / pipe split at Ø16 mm;
  - the "complex profile" threshold.

  The line rates and die costs are the existing advisor's. None has been
  compared with an extruder's quote.
- **Start-up is costed as purged material only.** The line-hours spent sizing
  up are not charged.
- **Co-extrusion, foamed and reinforced profiles** are a specification, not a
  shape. They default to mono-layer; set the layers or the grade on the form.
- **Secondary operations are not priced from CAD:** bending a fuel line, end
  forming, fitting quick connectors, punching a profile.
- **The modelled parts are not customer parts.**
