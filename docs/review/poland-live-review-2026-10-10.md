# Poland live review — 3 commodities, line by line (10 Oct 2026)

Three parts were run live in Poland through the real server and a real browser. Each one went through upload → questions →
costing → PDF and Excel exports:

- PRCR002 stub axle, sand cast + machined ductile iron;
- IM_ECU_Cover, injection moulded PA66-GF30;
- Seat_Locking_Bracket, progressive-die stamping.

Every run used 100,000 a year over a 5-year programme, in PLN. Three reviewers read every line of the PDF (1,908, 1,101
and 1,060 lines) and every cell of the Excel, and recomputed the figures by hand. Each finding below was checked against
the code before it was fixed.

## 1. Trace — every step

| Step | PRCR002 | IM_ECU_Cover | Seat bracket |
|---|---|---|---|
| CAD read | STEP, OCP kernel | STEP, OCP kernel | STEP, OCP kernel, blank unfolded |
| Questions answered | route cast + machine, family cast iron, safety-critical **yes**, pressure-tight no, tolerance standard, grade GJS-500-7 (pre-selected) | route injection moulding, resin PA66-GF30 | family steel |
| Rates book | every call `ratesRegion: PL` | `PL` | `PL` |
| Labour | foundry zł56.57/h, skilled zł66.34/h (Poland book) | semi-skilled zł61.46/h, technician zł72.71/h | semi-skilled zł61.46/h |
| Machines | sand line zł80.89/h (capital held), VF-2 zł26.88/h (Haas EU capex) | IMM 200 t zł71.90/h (held) | press 400 t zł98.45/h (held) |
| Material | GJS-500-7 charge zł1.73/kg (Poland book) | PA66-GF30 zł15.32/kg (**UK × 0.97 — no Polish price**) | DC04 coil zł3.78/kg (Poland book) |
| Headline (before fixes) | **zł165.57** | **zł4.86** | **zł5.35** |

The arithmetic reconciles in all three reports:

- the 8 buckets sum to the total;
- overhead is 10 % of material + process + labour + tooling;
- margin is 8 % of the subtotal;
- every operation's machine and labour cost = time ÷ OEE × rate (× crew ÷ labour efficiency);
- every machine-rate build-up sums;
- the regional table rows sum.

The errors were in the bases, three logic paths and the presentation.

## 2. Fixed (each with a test)

| # | Sev. | What the report or screen said | Fix |
|---|---|---|---|
| 1 | **Critical** | ECU cover: "Hole deeper than standard drill reach — PLN 0.69/part", plus end-mill and setup findings, on a **moulded** part (14% of its cost) | The DFM job was queued at upload while the route was still guessed as machining. It was re-queued only once a material FAMILY was answered, and a moulding answers the RESIN. An answered resin now implies the plastic family, so the job re-runs as injection moulding. |
| 2 | **Critical** | Seat bracket: "largest saving PLN 0.39 — scrap revenue recovery" (7.4%) | The lever re-costed scrap as better utilisation, so it bought less metal AND kept the scrap credit. It now raises only the scrap credit to 30% of prime: ≈ PLN 0.01–0.05. A new `scrapRecoveryPricePerKgOverride` makes that a real re-cost. |
| 3 | **Critical** | Stub axle: "With material at 45.3% of cost … index-linked clause" | That bucket carries cores, heat treatment, NDT and tool wear; the metal is 9.7%. The clause now quotes the metal / resin share only. |
| 4 | **High** | Tool maintenance: one year's 5% (die) / 3% (mould) on a 5-year programme | Charged for every year the amortisation covers (`maintenanceYears` = amortisation ÷ annual). The seat bracket rises about 2.4%. |
| 5 | **High** | Cavity choice: "1-up PLN 1.79 v 2-up PLN 2.14" ranked over ONE year while the costing amortised over 500,000 | Every tool decision ranks on the amortisation the costing carries: cavitation, stamping v laser + brake, and rubber cavities. That is annual × the typed programme years, or one year when blank, exactly as CAD Apply writes it. Real-parts baseline unchanged (no programme typed). |
| 6 | **High** | Screen: "the UK book £3.10/kg", "cores £2.06 …", "× £0.1378/kWh" on a złoty costing; the cost drawer showed £ values with "£/kg" | The screen's trace and cost drawer use the same money-text conversion as the reports. |
| 7 | **High** | Reports: "capex PLN 196,420 (PLN 196,420)", "PLN 240.60 (PLN 240.58)/m²/yr" | A book note's "(£…)" restating the local figure is dropped in a non-£ report. |
| 8 | **High** | "2D X-ray at PLN 25 a part × 0.4957 = 12.64" (25 × 0.4957 = 12.39) | A whole-£ amount under 100 converts to 2 dp ("PLN 25.48"), so printed arithmetic reproduces. |
| 9 | **High** | "COSTABLE — no blocking decision is open" beside "What is this part made of? blocking OPEN" | A question asked in an earlier round and settled by a later answer now says so ("plastic — settled by the resin answered (PA66 GF30)"). |
| 10 | **High** | PA66-GF30 (53% of the ECU cover) graded "Medium" on a UK price × 0.97 | In a country with its own rate book, a held grade is graded Low. Countries without a book keep their grading. |
| 11 | **High** | Held machines: "capital HELD … round-2 evidence shows it both ways (aluminium extrusion lines ~2–3× low, press brakes ~4× high …)", "3 × 8 h hours", and both "maintenance per running hour held" and "3.5% of capex" | One plain line: "capital HELD — no Poland capex was sourced for this machine, so its capital is the UK book's × 0.72 (Low confidence) …". The maintenance clause is shown only on machines with sourced capex. |
| 12 | Medium | "Pattern equipment: 32 set(s) (life 16,000 moulds each)" | 16,000 is castings (8,000 moulds × 2 impressions). It now reads "castings each". |
| 13 | Medium | "The tooling investment itself (PLN 1,002,474.93) is paid up front" | It is recovered through the unit cost, and includes replacement sets and maintenance bought along the way. The text now says so. |
| 14 | Medium | "§9 … Ex-Works" and "regional table is Ex-Works" while every row and the headline carry a logistics bucket | Both now say what is in (the supplier's delivery allowance, bucket 6) and what is out (import duty, cross-border freight). |
| 15 | Medium | "§14 — Inputs to Confirm: None" on reports with held capital, a UK-derived resin and Low rates | §14 now lists every rate the costing grades Low, with how to close it. |
| 16 | Medium | "India: conversion ~62% below Poland … re-cost the part there", beside §9 showing 79% | Labelled as an index, not a costing; the figure is the regional table's re-cost. |
| 17 | Medium | "kernel face-count parametric said PLN 127,400 (not used)", a UK £25,000 printed as a Polish figure | Labelled "(UK basis, not country-adjusted)". |
| 18 | Low | Cover warning "rawMaterial.materialId: Material rate confidence: Medium" | Plain names, as on the form ("Material: …"). |

## 3. Open — not fixed in this round (stated for the demo)

| Item | Why it is open |
|---|---|
| **DFM section empty** on two exports ("had not finished when this report was exported") | The report says so honestly. Re-export once the DFM panel completes (the re-run waits for it). |
| PA66-GF30 density 1,300 kg/m³ (datasheets ~1.35–1.37) | A library value for every country: +4.6% on the ECU cover's material. Next rate refresh. |
| Cooling basis prints 2.3 mm while the costed wall is 2.5 mm; the 3% reject allowance inside cycle times is not stated | Presentation of the moulding and casting basis. |
| Shot blast / fettling on the finished weight, heat treatment on the as-cast weight | Casting finishing basis (small: ~zł0.4). |
| No swarf credit on cast + machine (~zł1.85 on the stub axle) | Modelling gap, known. |
| No journal grind / MPI / nodularity check on a safety-critical axle; NDT 100% v sample not stated | Scope of the casting route. |
| Overhead 10%, packaging, logistics (×1.20) unsourced for Poland | Round-2 research found no source; Polish freight is ~½ a Western lane per km. |
| Excel lacks the PDF's §7–§15 (sensitivity, regions, levers, roadmap); PLN v zł mixed in the Excel | Export scope. |
| Sensitivity omits consumables and packaging + logistics; "-10% cost" headers mean the driver | Sensitivity panel. |
| Diacritics (Wrocław, Poznań) lose ł / ń in the PDF | The PDF's built-in font. |
| Internal ids (mat-…, mach-…, lab-pl-…) and field paths in §6 traceability | Kept as the audit key — a traceability table needs a key. |

## 4. Before and after

LIVE_AFTER
