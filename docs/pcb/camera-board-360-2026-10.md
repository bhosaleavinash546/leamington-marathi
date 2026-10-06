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

## 7. Re-cost with evidence (delivered UK, 250k a year, sensor from its photo)

The engineer confirmed:
- the £17.00 is **delivered to the UK**;
- the volume is **250,000 a year**;
- the image sensor's part number is **not available**.

The faint diagonal marks on the sensor, the QFN and the board read "A2MAC1": the watermark of the teardown service, not chip markings. The evidence is in `research/camera-board-evidence-2026-10.md`. It comes from search summaries, because this environment blocks the pages themselves and the UK tariff service.

**The sensor, from its photo.**
- **Size:** at 17 px/mm (the 20 mm board is 341 px wide), the package is about **9.5 × 7.5 mm** and the optical window about **5.9 × 4.4 mm**.
- **Resolution class:** that window is about 1/2.7"–1/3" class, i.e. **2–3 MP**. Nearest stated active areas: Sony ISX031 5.81 × 4.66 mm (3 MP), then OmniVision OX03C10 (2.5 MP). The DS90UB935 serializer carries up to that class.
- **Price:** automotive CIS at volume is **US$3–8 for 1–2 MP**, over $10 for 8 MP (China industry press, 2025). Yole reports low-resolution automotive prices falling. A 2–3 MP part sits in the upper half: **$7 central** (£5.29), range $5–9.

### Manual should-cost (EMS level)

| Element | Basis | £ |
|---|---|---|
| Image sensor (2–3 MP automotive, CSP) | $7 at volume (range $5–9) | 5.29 |
| DS90UB935-Q1 | TI list $3.707 (large reel) × 0.85 contract | 2.38 |
| LM53600-Q1 | Mouser $2.78 @1k → 250k (catalogue) | 1.50 |
| TPS62422-Q1 | TI list $1.061 × 0.85 | 0.68 |
| TLV702-Q1 | TI list $0.266 × 0.85 | 0.17 |
| BQ24025 | Digi-Key $4.32 @3k → 250k (no TI list found; upper end) | 2.39 |
| 49 MLCC, 7 beads, 10 µH inductor, PoC choke, 16 resistors | volume prices (§1) | 0.66 |
| **Components** | | **13.07** |
| EMS material burden | 5% at ≥ 100k (engineering figure; cost-plus EMS practice) | 0.65 |
| Bare board | 8-layer 900–1,260 CNY/m² at volume (1,800 list less 30–50%) on 4 cm² at 70% panel use, plus 2 oz copper and automotive fab | 0.15 |
| Assembly | 73 points × 0.012 CNY + 7 fine-pitch × 0.03 CNY (Shenzhen EMS quotes) = £0.12; AOI £0.05, X-ray £0.06, ICT £0.17, IATF premium £0.15 | 0.55 |
| Yield / rework, packaging, freight, energy | | 0.24 |
| UK import duty | 8529 90 92 is the likely code; its rate could not be confirmed here (0–3.7% → £0–0.54) | 0.27 |
| **Manual should-cost, delivered UK** | | **≈ £14.9** (range £13.2–16.7) |

Two readings of the actual:
- **EMS bought directly:** £17.00 is **+14%** over the should-cost, room to negotiate.
- **Tier-1 module supplier:** add its SG&A and profit (typically 8–12%). That gives **≈ £16.1–16.7**, and £17 is close.

### What changed in the tool (evidence, not tuning)

| Change | Evidence | Effect on this board |
|---|---|---|
| Imager class range £3–15 automotive (was £6–30) | 1–2 MP $3–8 at volume, 8 MP > $10; distributor single-unit listings are not volume prices | sensor £10.56 → **£5.28** |
| EMS material burden on components: 5% (≥ 100k), 7% (10k–100k), 10% (< 10k), stated in the breakdown | EMS quotes carry a material margin that falls on larger programmes (Venture Outsource; EMSNow cost-plus) | **+£0.64** |
| AOI at volume (station time + programme, table price as ceiling), as ICT and X-ray | same basis as the ICT / X-ray fix | AOI £0.37 → ~£0.08 |
| Not changed: fab £/dm², SMT £/placement, UK duty rate | evidence too weak to move a table (a single older 8-layer figure; vendor-page placement quotes; the tariff rate unread). The tool's fab (£0.41) is likely high and its placement price about 2× the Shenzhen quotes — together about £0.4 on this board | — |

**Result:**

| | £ / board | vs £17.00 |
|---|---|---|
| Tool | **15.26** | −10.2% |
| Manual should-cost (EMS level) | 14.9 | −12% |
| Manual + Tier-1 margin | 16.1–16.7 | −2 to −5% |

The radar demo board at 250k moves to **£52.90** with the material burden (was £50.97).

**To confirm with a minute's look:** the UK duty on trade-tariff.service.gov.uk for 8529 90 92 from China, and whether the supplier is an EMS or a Tier-1.

## 8. The live report reviewed page by page (6 Oct 2026, £15.68)

The user's live run printed a 10-page should-cost report. The headline was right (the analysis, China, delivered UK).
Almost everything around it was wrong, because the report body was the machined-part one.

| Page | What it printed | Why it was wrong | Now |
|---|---|---|---|
| 1 | "Commodity: PCB FAB · Region: UK · Operations: 0" | The board is a PCBA built in China | "Populated PCB (PCBA) · Built in: China · Delivered: UK, duty paid" |
| 1 | "Alloy/material: Virtual / Pass-through · Net weight 0.000 kg · utilisation 100%" | A placeholder for the costing engine, not the part | Basis, board type, ASIL as costed, where the parts list came from |
| 1 | "Model confidence Low · 0 traced operations" | It counts machining operations | The analysis's own band (likely £ low–high) and lines to verify |
| 1 | "…Edit a field and press Calculate" | An instruction for the screen | Not printed |
| 2–3 | 8-bucket table, Process/Labour/Tooling £0, "Overhead base" | Buckets for a machined part | Components, EMS burden, bare board, automotive grade, SMT, test, energy/packaging/quality, freight, UK duty; summing to the headline |
| 3 | "ASIL ASIL-C" twice, a **radar** rationale ("radar target detection, Doppler processing") | Stage 1b hallucinated a radar module from a camera board; **ASIL-C also put burn-in (~£0.61) into the price** | The ASIL guard (below): costed **ASIL-B**, the claim and the reason stated, the radar text withheld |
| 3 | "Test/inspection multiplier ×1.50 applied to every operation in section 4" | There is no section 4 operation | Not printed |
| 4 | §3 Material detail: mat-virtual, "Price is irrelevant", Region UK, 0 kg | The placeholder again | Not printed |
| 4 | "13 lines · 82 pieces", RefDes "—" on every line | Counted the PCB and ASM lines as pieces; "Capacitor" is a category, not a designator | 11 lines · 80 parts; no RefDes column when the BOM has none; part number and "priced from" per line |
| 5 | "Lines £14.99 against a £13.34 material bucket — £1.65 excess (bare board, yield, coating)" | Ignored the bought-in board and assembly | "The 11 lines total £12.70 — the components row of §1" (+ burden stated) |
| 5–6 | Empty §4 Operations, §5 Machine rates; §6 with "Uni t", "Medi um" | Nothing to show | Not printed |
| 7 | "Tooling amortisation carries the widest spread"; "excluded: import duty and freight" | No tooling; duty and freight ARE in the figure | "Not in this unit cost": NRE, Tier-1 margin, module housing |
| 8 | §9 China **£1.79** (−89%), Germany £4.42 | Rescaled a pass-through; the headline IS China at £15.68 | §5 the board costed in each of 14 countries, delivered UK, sorted |
| 8 | §10 Embodied carbon 0.00 kgCO2e | No mass on a pass-through | Not printed (no PCBA carbon model yet — stated as a gap, not a zero) |
| 9 | "Material 95.6% exceeds the PCB fab benchmark ceiling of 40% — challenge layer count" | A bare-board benchmark on a populated board | Deterministic drivers: the 3 lines that carry 56%, the components share, the cheapest country, lines without a quote |
| 9–10 | "Raw-material price indexation… metal/resin", generic DFM, an orphan bullet on p10 | Not this commodity | Not printed |
| 6 | NRE not shown | — | §6 One-time automotive NRE (£16,200), per board over a year |

**ASIL guard (`server/utils/pcb-asil-guard.ts`).** The parts list is the ground truth for the ASIL:
- ASIL-C/D is costed only when the BOM carries the hardware such a design needs: a safety PMIC/SBC (TLF35584, FS84/85, VR5510…) or a lockstep safety MCU (AURIX, S32K3, S32R, RH850, TMS570).
- Otherwise the board is costed at ASIL-B, with the claim and the reason in the response, on screen and in the report.
- A rationale naming a function the BOM contradicts (radar text on an image sensor + serializer) is withheld.

It runs in `runStage4`, so every route applies it. The radar demo board (S32R294 + a safety supervisor) keeps ASIL-C and £52.90.

**Accuracy after the fix.** Removing burn-in puts the live run at about **£15.05**, against the actual **£17.00** (−11%). The figure is the EMS delivered price. The £17.00 is what the buyer pays. If that supplier is a Tier-1 or a distributor, its margin is the gap (§7: £16.1–16.7 with a Tier-1 margin). The actual sits inside the report's own likely range (£12.22–£19.77). Burn-in was not kept to close the gap: a surround-view camera module is QM–ASIL-B, and the parts list carries no ASIL-C hardware.

Sample report from the stand-in run: `docs/pcb/screens/camera-report-2026-10-06.pdf` (5 pages, £15.26). `e2e/pcb-camera-live.ts` replays the live classifier (ASIL-C, radar text), exports this report and asserts on its text. `tests/pcba-report.test.ts` pins the guard and the report content.

**Second live report (6 Oct 2026, £15.05).** The guard worked: ASIL-B costed, no radar text, £15.05 (≈ the predicted £15.05). Follow-ups:
- **Ex-works and delivered on the cover.** Ex-works = the board built, tested and packed at the factory gate (total − freight − UK duty): £14.52 against £15.05 delivered. Also shown as a subtotal in §1 and as a column in the country table.
- Freight that rounds to £0.00 now says it is under a penny a board by sea.
- The photo reader's "ICs may be double counted" caveat is dropped when a parts list was supplied.
- The classifier's safety functions are labelled unverified.
- §7 no longer starts at the foot of a page, the country table stays on one page, and BOM rows are not split.
