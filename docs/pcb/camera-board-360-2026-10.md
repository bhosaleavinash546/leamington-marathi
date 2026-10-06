# 360° surround-view camera PCB: manual should-cost vs the tool (China, 250,000 a year)

The inputs come from the live trial of 6 October 2026:
- two board photos (top: CMOS image sensor; bottom: FPD-Link serializer, regulators, power inductor);
- the board data sheet;
- a picture of the BOM.

The live run used the engineer's own API key. This document reproduces that run with the recorded model reading (`e2e/fixtures/pcb-camera-replies.json`, `npm run test:e2e:pcb-camera`). Every figure after the reading is the tool's own arithmetic.

## The board

**From the board data sheet:**
- Rigid FR4, 8 layers, 20.0 × 20.0 mm, 1.35 mm thick, 2.5 g.
- Copper 70/70/35/35/35/35/70/70 µm.
- OSP finish, no conformal coating.
- 80 components.

**From the BOM picture**, 80 parts in 11 lines:
- 49 ceramic capacitors (≤ 1206);
- 7 ferrites;
- 2 inductors, written "Common Mode Choke" (one is the 10 µH "100" power inductor in the bottom photo);
- DS90UB935-Q1, LM53600MQDSXRQ1, TPS62422QDRCRQ1, TLV70233QDSERQ1, BQ24025DRCR;
- 16 resistors (≤ 1206);
- 1 image sensor (not named).

## 1. Manual should-cost (China, 250k a year, per board)

| Element | Basis | £ |
|---|---|---|
| 49 MLCC | ~35 × 0402 100 nF AEC (GCM155: £0.0063 @1k → ~£0.004 @250k) + ~14 × 0603/0805 1–10 µF (~£0.02) | 0.42 |
| 7 ferrite beads | BLM18KG-class, £0.024 @1k → ~£0.012 | 0.08 |
| 10 µH inductor + PoC choke | DFE201610E $0.135 @1k; DLW21SH900 $0.20–0.29 @1k; volume pricing | 0.22 |
| DS90UB935TRHBRQ1 | Digi-Key $4.65 @1k, $4.21 @3k → own slope to 250k | 2.13 |
| LM53600MQDSXRQ1 | Digi-Key $2.70 @3k → 250k | 1.49 |
| TPS62422QDRCRQ1 | Mouser $1.51 @1k → 250k | 0.93 |
| TLV70233QDSERQ1 | Mouser $0.317 @10k → 250k | 0.19 |
| BQ24025DRCR | Digi-Key $4.32 @3k → 250k | 2.39 |
| 16 resistors | 0402 AEC ~£0.002 | 0.03 |
| Image sensor (unnamed, 1–2 MP automotive) | OX01F10 listed at $12–18 (no volume break); AR0233 (2.6 MP) £23.8 @1k. Central £10, range £9–14 | 10.00 |
| **Components at distributor level** | | **17.88** |
| Components bought in China | × 0.88 (country sourcing index) | 15.73 |
| Bare board | 4 cm² 8-layer FR4 + panel waste, 120 drilled vias, impedance, 2 oz outers; automotive fab premium | 0.35–0.55 |
| Assembly | 80 placements, two reflow passes, AOI, X-ray of the CSP imager, ICT at volume, IATF premium | 1.0–1.5 |
| Logistics and duty | 3.7% duty on the customs value + sea freight of 2.5 g | 0.70 |
| Energy, packaging, yield | | 0.15 |
| **Manual total** | | **≈ £18.1** (range £16–22; the imager is most of the range) |

## 2. The tool, before and after this fix

| | Live trial (before) | After the fixes | Manual |
|---|---|---|---|
| Board size used | **59 × 59 mm** (clamp) | 20 × 20 mm | 20 × 20 mm |
| Domain | consumer IoT | automotive (4 of 5 ICs are -Q1) | automotive |
| Image sensor | **£0.45** (generic IC range) | £10.56 (imager range) | £10 (£9–14) |
| DS90UB935-Q1 serializer | **£1.43** (class range) | £2.13 (catalogue) | £2.13 |
| 7 ferrites | **£0.45 each** | £0.05 each | £0.012 each |
| 49 capacitors | £0.06 each (as 1206) | £0.021 each | ~£0.009 avg |
| Test (ICT + X-ray) | **£3.00 flat** | £0.32 at volume | ~£0.3 |
| "Photos show parts your BOM does not list" | false alarm (BOM has no designators) | count check instead | — |
| "~51 missing passives" | false (the BOM is supplied) | 0 | — |
| **Analysis headline** | £16.74 (errors that partly cancelled) | **£19.82** | **≈ £18.1** |
| **Calculate** | **£83.33** (form defaults: 200×150 mm HDI board, UK, bare) | **£19.82** (= the analysis) | — |

The tool is now 9% above the manual figure. Most of the gap is two class-range lines, which carry no part number:
- the 49 capacitors as a 0603 average (+£0.5);
- the two inductors (+£0.3).

A BOM that names their part numbers closes it.

## 3. What was wrong and what changed

1. **Calculate ignored the analysis.** The photo tool sits on the PCB Fab form, and Calculate costed that form's defaults as a bare board.
   - **Now:** the analysis fills the form (`src/ui/pcb/analysis-link.ts`), and Calculate with nothing edited reports the analysis exactly. The components are itemised, and the board and assembly are bought-in prices with no second overhead or margin.
   - **An edited field** (size, layers, vias, finish, HDI, copper, quality grade, volume) is written into the analysis's board spec and re-priced on the server (`/reprice`) before Calculate reports it.
   - **A quality grade** sets the costing: Automotive Grade 1/2 → automotive.
2. **Board size.** An estimated size was pulled to ±30–40% of 1.6 placements/cm², which suits a sparse ECU, not a camera module. Now a size is kept unless the density it implies is not buildable (over 30 placements/cm² a side) or not credible (under 0.4/cm²).
3. **Test at volume.** ICT and X-ray were flat small-batch prices. They are now station time plus a fixture or programme spread over the order, with the table price as the ceiling for small runs. The fixture (£5,000), the X-ray time (20 s) and the X-ray programme (£300) are stated engineering figures.
4. **BOM lines named by kind.** "Ferrite", "Common Mode Choke" and "Image sensor" with no package fell to the SOIC IC range (£0.08–1.80). They now take the bead, choke and **imager** (£6–30 automotive) ranges. "≤ 1206" is read as a size limit, not a 1206 part.
5. **TI "-Q1" family names** ("DS90UB935-Q1") find the catalogued orderable code (DS90UB935TRHBRQ1).
6. **Automotive from the parts list.** When at least two named ICs are AEC-Q100 codes (…Q1, /V), and they are at least half of the named ICs, the board is automotive whatever the photo classifier said.
7. **A BOM with no designators** is checked against the photos by count, not designator by designator. A supplied BOM is never "missing passives".
8. **Catalogue.** Seven parts were added from franchised listings (`scripts/pcb-research/2026-10-06-r7/`). The automotive image sensors still have no break of 100 or more: OX01F10 is listed at $12–18 without one, and AR0147 is obsolete.

## 4. Effect on the radar demo board

The radar's ICT and X-ray were the same flat charges. At 250k a year, its headline moves from **£55.82 to £50.97**, and the assembly from £6.91 to £2.57. Screen, PDF and server still agree, and the 25-point scorecard passes 25/25.

## 5. Running it live

The live check needs a key in your `calculator/.env`: `ANTHROPIC_API_KEY=…`. Then restart.

1. Open the PCB Fab form.
2. Upload the two photos and the board data sheet as photos, and attach the BOM picture under "Attach BOM (file or image)".
3. Choose China and 250,000.
4. Analyze, then Calculate.

**What to expect:**
- The headline should be **£18–22**, depending on the sensor price the reading lands on.
- Calculate equals the headline.
- Changing a field (for example layers) and pressing Calculate re-prices the analysis.

The model's reading of a real photo can differ from the recorded one. Its accuracy is not measured, because there is no labelled board yet.

## 6. The actual: £17.00 from the supplier

The engineer reports buying this board at **£17.00**. It is recorded in `calculator/scripts/actuals/pcb-actuals.csv` (`npx tsx scripts/accuracy-report.ts scripts/actuals/pcb-actuals.csv`), which reports "insufficient": one board cannot claim accuracy, and no rate is tuned to it.

| | £ / board | vs £17.00 |
|---|---|---|
| Tool | 19.82 | +16.6% |
| Tool, without UK duty and freight (if £17 is ex-works / FOB China) | 19.12 | +12.5% |
| Manual should-cost | 18.10 | +6.5% |

**Where the gap is likely to be, largest first:**
1. **The image sensor.** It is £10.56 in the tool, about half the board. Its part number is not on the BOM, and the only listings are $12–18 with no volume break. A 1–2 MP automotive imager on a 250k contract is plausibly £6–8, and at £7 the tool would be about £16.7.
2. **Contract versus distributor pricing.** The named ICs (£7.1 together) are distributor breaks extrapolated to 250k. Tier-1 / EMS contract prices are typically 10–30% lower.
3. **Passives with no part number** are priced from class ranges: about £0.8 above a named-part build-up.
4. **Terms.** The tool's figure is delivered to the UK, with duty and freight of £0.70.

**To close it with evidence, not by tuning:**
- read the sensor's marking (or get its part number from the supplier);
- confirm the Incoterm and the annual volume;
- log further boards' actuals. With five or more PCBA actuals the calibration layer (`src/engine/calibration.ts`) can measure and correct the bias.
