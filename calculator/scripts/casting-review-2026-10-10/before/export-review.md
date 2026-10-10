# Export review — cast + machine parts, India, 100,000 / yr (display INR)

Inputs: `../before/{knuckle,stub_axle,casting_bracket}.{pdf,xlsx,json}`, `../before/server.log`.
Extracted text: `knuckle.pdf.txt`, `knuckle.xlsx.txt` (every cell, value + number format; there are NO formulas in any
workbook, so no #REF!/#VALUE! is possible), same for `stub_axle.*` and `casting_bracket.*`. `check.py` re-does the
workbook arithmetic.

## What checks out (Verified)

- **Knuckle numbers match the screen everywhere.** Headline ₹2,445.66, all 8 buckets, factory cost, overhead base ₹2,018.13,
  overhead 9 % = ₹181.63, subtotal, margin 8 % = ₹181.16 — the same in Excel 1-Summary, PDF §1 and the screen. The % column sums to 100.0 %.
- Each of the 11 operations' machine ₹, labour ₹ and total is the same in Excel 3-Operations, PDF §4A/§4B and the screen. Each
  re-computes from rate × cycle ÷ OEE (labour: rate × manning × time ÷ efficiency) to within 0.01. Totals: ₹870.75 + ₹229.13 = ₹1,099.88.
- Material: 3.238 ÷ 0.98127 = 3.2998 kg; × ₹97.354 = ₹321.25. Metal + six consumables (₹529.69) + energy (₹28.83) = ₹879.78 = bucket 1.
  Energy: 3.2852 kWh × £0.069 × 127.1941 = ₹28.83.
- Tooling ₹3,846,985.50 ÷ 100,000 = ₹38.47 = bucket 4. The machine-rate build-ups in Excel 4 and PDF §5 add up, and annual ÷ effective hours = the rate for all 4 machines.
- §7 band: P10 2,222.08 / P90 2,699.06 → ±9.75 %, printed as ±9.8 % (same as the screen). §8 sensitivity: every range re-computes
  (for example, the VF-2 ops' machine cost ₹470.57 × 10 % × 1.09 × 1.08 × 2 = ₹110.79). In §9 every row's buckets add up to its total, and the India row equals the screen.
  §10 carbon: 6.82 + 10.81 + 0.55 = 18.18 kgCO2e.
- Geometry: 356.1 cm³ matches `cad-audit/truth/steering_knuckle_RH.json` (356.101 cm³). At 7.1 g/cm³ that is 2.528 kg finished; 3.238 kg as cast.
  This is lighter than the expected 5–15 kg range, but it is what the solid measures.
- Stub axle (₹5,024.68 ±10.3 %) and bracket (₹2,549.45 ±13.7 %): the same arithmetic passes (`check.py` output). Headlines and bands match `summary.json`.
- The FX rate is the same in both reports: £1 = 127.1941 INR. In Excel every money cell is numeric and formatted `"₹"#,##0.00`.

## Findings

Severity: P1 = wrong number, P2 = misleading or inconsistent, P3 = cosmetic. No P1 was found: every printed money figure
reconciles to the screen and to its own arithmetic. The problems are labels, currency, claims and missing bases.

| id | report | where | what it says | what it should say | sev | tag |
|---|---|---|---|---|---|---|
| X1 | PDF | every page (headline p1, §1–§2, §4A/§4B rates, §5, §6 units, §7, §8 "Range", §9, §10, DFM £) | Every INR figure is printed with no symbol: "Total Should-Cost 2445.66", "3846985.50", units "/kg", "/hr", "Range " (header with a trailing blank). The only currency symbols in the PDF are £. 0 occurrences of ₹ in 16 pages. | Cause: `winAnsiSafe` (src/export/pdf.ts:305) deletes U+20B9 because it is not in WinAnsi, so `currencySymbol('INR')`='₹' prints as nothing. Should print "INR 2,445.66" or "Rs 2,445.66" (WinAnsi-safe) on every money cell and unit. | P2 | Verified |
| X2 | PDF | p2, DFM "Many different hole sizes" | "41.68/part" … "at that operation's own rates (£20.88 per hour of cycle …)" | Two currencies in one finding, one of them unlabelled. 41.68 is INR: 0.80 min × £20.88/h × 1.09 × 1.08 × 127.1941 = 41.69. Should read "INR 41.68/part … (INR 2,656 per hour …)". | P2 | Verified |
| X3 | PDF | p2, same finding | "A £ is what the finding moves THIS costing by"; "0.80 min off Drilling" | 0.80 min = (9 − 1) sizes × 6 s, i.e. every size merged into ONE tool. The pricer's own basis says "an upper bound (every size merged into one)" (machining-access.ts:438), but the PDF drops that wording. The 9 sizes include Ø63/68/71/75, which are cored and finish-bored bearing bores, not drills. Should say "upper bound — all sizes on one tool, not achievable here", or exclude the bores > Ø20. | P2 | Verified |
| X4 | PDF | p4 "What was NOT checked" (also bracket p3) | "No material family was confirmed, so any check whose threshold depends on the alloy or resin did not run." | The family WAS answered (cast iron, costed EN-GJS-500-7; bracket: steel GS-C25). Either the DFM run was not given `materialFamily` (types.ts:260), so alloy checks really were skipped, or the sentence is wrong. Both are a contradiction inside the report. | P2 | Verified |
| X5 | PDF | p3 "Holes on a compound angle" vs "Features need several setups" | Compound angle: "that fixturing is priced once, in the 'several setups' finding". Setups finding: "Not priced: … It carried a separate £ … that disagreed". | The fixturing is priced in neither finding. Should say "not priced here; the costing's own 4 fixturings carry it". | P2 | Verified |
| X6 | PDF | §4A p6 (all 3 parts) | Fettling and Melt shop rows: machine "Sand Casting Moulding Line", rate 1842.27, OEE 100.0 %. Deburr row: "HAAS VF-2", rate 2854.07, OEE 100.0 %. | Excel 3-Operations and the screen say "— bench (no machine time)", machine ₹0, no OEE. The PDF should print "bench — no machine" and blank the rate and OEE. | P2 | Verified |
| X7 | PDF | §12 #1 (knuckle 60 %, stub 51 %, bracket 26 %) | "Per-part consumables (cores, patterns, shell, filters) are 60% of the material cost line" — "evaluate reclaim (shell sand, wax)" | The 60.2 % is right (₹529.69 / ₹879.78). The items named are not what the costing holds: NDT ₹228.95 (43 %), cutting-tool wear ₹166.98 (32 %), heat treat ₹60.83, cores ₹53.47, shot blast ₹12.72, green sand ₹6.74. This is a green-sand part, so there is no shell, wax, pattern or filter line. The bracket has no cores at all, yet the same text is printed. It should name the actual lines. | P2 | Verified |
| X8 | PDF | §12 #3 | "Machining is 35.6% of the part." | 35.6 % is the whole Process (Machine) bucket, which includes the moulding line (₹79.06). The machining ops (setup → deburr) are ₹916.50 = 37.5 % with labour, or ₹791.69 = 32.4 % machine-only. | P2 | Verified |
| X9 | PDF | stub axle §12 "Alternate Material Grade" + "Indexation Clause"; bracket same | "Material is 40.0% of part cost — the largest lever on this part is the metal itself" | Bucket 1 is 40.0 %, but the metal is ₹901.25 = 17.9 % of ₹5,024.68 (bracket: ₹742.93 = 29.1 % vs "41.5 %"). The rest of the bucket is consumables, NDT, tool wear and energy. Should quote the metal share. | P2 | Verified |
| X10 | PDF | p1 Geometry Provenance (all 3) | "Material cost and geometry-derived machining are grounded in the actual solid — not an estimate." | The volume is measured, but the costed weight adds a rule-based machining stock: +0.710 kg = +28 % on the knuckle. The £/kg is "NOT SOURCED — held at the June 2026 price" (Low), and model confidence is Low. Should say "geometry measured; stock allowance, prices and rates estimated (Low)". | P2 | Verified |
| X11 | PDF | §8 sensitivity row | "Net weight (measured geometry) 3.24kg" | 3.24 kg is the as-cast costed weight (2.528 kg measured + 0.710 kg rule stock). Label it "costed (as-cast) weight". | P2 | Verified |
| X12 | PDF + Excel | PDF §3 consumable rows "Per part"; §6 consumables row; Excel 2-Material D14–D19; Excel 7-Checks A27–A28 | Consumables and services shown only as "per part". The Excel "RULE-OWNED VALUES" table is a header with zero rows. | The rule bases appear nowhere in either report: NDT ₹228.95 = 2D X-ray £5 × India service factor (casting.ts:713); heat treat = stress-relieve because safety-critical; stock 3 mm a side (ISO 8062-3 typical) = 0.71 kg; moulding crew 4; fettling 6.19 min. NDT alone is larger than the whole labour bucket. The table lists only AI-model overrides (excel.ts:297), so in deterministic mode it is always empty and gives no "none" row. Print each rule-decided value with its basis. | P2 | Verified |
| X13 | PDF + Excel | PDF §2, §7; Excel 1-Summary B29–B31 | "Total Tooling Cost 3846985.50"; "amortised over 100,000 parts" | No breakdown of the ₹38.5 lakh (£30,245): pattern, core boxes, fixtures. Neither report says that 100,000 = ONE year's volume because programme life was blank (main.ts:10933 "blank = one year"). The note at pdf.ts:2280 fires only when years are given. §7 says tooling is the widest band driver, so both the basis and the 1-year assumption need stating. | P2 | Verified |
| X14 | Excel + PDF | Excel 3-Operations col K, 5-LabourRates col A, 6-Traceability col E; PDF §6 Rate ID | Labour ID "lab-uk-foundry", "lab-uk-skilled", "lab-uk-furnace", "lab-uk-semiskilled" on rows marked Region "India". The Source on the same row says "lab-in-skilled — the rate book's own India rate". | The rates are India's (₹653.78 = £5.14, as on the screen), but the ID says UK. Show the role ("Skilled machinist, India"), not a library id, or the lab-in-* id the source names. | P2 | Verified |
| X15 | PDF | §6 Source column p10–12; §5 notes; §5 "How to read" | "cores £0.42 · … NDT £1.80 · cutting-tool wear £1.31" beside value 529.6936; "£0.069/kWh"; "Target £40/hr"; "raises £/hr" | GBP basis text sits next to INR values with no label: the PDF header reads "Source / Reference", while Excel's reads "(as recorded, GBP)". Label the column GBP, or convert. | P2 | Verified |
| X16 | PDF + Excel | op "Drilling — 12 holes (… 1×Ø63.0×3, 1×Ø68.0×40, 1×Ø71.0×3, 1×Ø75.0×6)" on "CNC Drilling Centre"; stub axle "Drilling — 22 holes" incl. Ø24–Ø46 | The name says drilling on a drilling centre | Per machining-time.ts:338, holes > Ø20 on sand castings are cored and finish-bored. The label (and probably the machine, a drilling centre at ₹1,840/h) misdescribes the bearing-bore work. The label is verified; whether the machine assignment is wrong is not. | P2 | Verified label / Likely machine |
| X17 | PDF | stub axle — whole report | No "Geometric DFM / DFA" section, and no sentence saying DFM was not run | server.log: DFM job dcb30cbf… was polled from 04:43:01 to 04:43:19 but `/report` was never fetched, and the exports ran at 04:43:20. The report silently omits the DFM, so a reader would assume no issues. Should state "DFM still running / not included" (or the export should wait). | P2 | Verified |
| X18 | PDF + Excel | stub axle p1 "measured from the CAD solid" | One solid, 1,037.1 cm³, costed as one casting | `cad-audit/truth/PRCR002.json` records `"solids": 2`. Neither report says the file holds 2 bodies. I cannot tell whether the second body belongs in the casting. | P2 | Likely |
| X19 | PDF | knuckle p3 / bracket p3 "Features need several setups" | Knuckle: "3 fixturings"; bracket: "9 fixturings on a 3-axis machine" | The costing charges "Load / clamp / unload — 4 fixturing(s)" on both. The report says "compare the two" but gives no reconciliation, so the two figures contradict each other inside one report (bracket 9 vs 4). I cannot verify which is right. | P2 | Verified contradiction |
| X20 | PDF | knuckle p3 / bracket p2 "Deep internal corner" | "the corner's pocket pass is in the cost either way" | On cast + machine, pockets are cast in (machining-time.ts:322), and §4A has no pocket or roughing op, only face finishing, holes, turning and handling. The claim is something the costing does not hold. | P2 | Verified |
| X21 | PDF | §3 Material Detail (all 3) | "Scrap / Runner Weight 0.0618 kg — Gross - Net" | The next row says runners and risers are remelted. 0.0618 kg is melt loss, not runner weight (a knuckle's gating is far heavier). Rename it "Melt loss". | P2 | Verified |
| X22 | PDF | bracket p3 "Non-stock hole diameter" | "Diameter 4.9 mm, flagged above 4.9 mm" | 4.92 is rounded to 4.9, so the line reads "4.9 > 4.9". Print 4.92 mm. | P3 | Verified |
| X23 | PDF | bracket p3, same finding | "that saving is the hole-size consolidation finding" | The bracket report has no such finding (5 sizes, below the threshold). | P3 | Verified |
| X24 | PDF | knuckle p3 DFA | "+2.0999999999999996s Fasteners approach …" | Unrounded float: should print +2.1 s. | P3 | Verified |
| X25 | PDF | knuckle p3 DFA | "4 distinct hole axes across 14 holes" | The costing, §4C and the drilling op all count 12 holes. | P3 | Likely |
| X26 | PDF | knuckle p2 DFM header | "6 issue(s) … from 205 measured feature(s) and 4 rule(s)" | 6 issues cannot come from 4 rules. `rulesEvaluated` counts only per-feature rules (types.ts:286). | P3 | Verified |
| X27 | PDF | §3 | "Scrap Credit -0.00" | Negative zero: print 0.00. | P3 | Verified |
| X28 | PDF + Excel | PDF p1 + Excel A34 warning; §3 / Excel B6 "Material ID mat-gjs500"; §6 / Excel 6 field names (`material.pricePerKg`, `…labourRatePerHr`); op names carry "[geometry-measured]"; Excel 3/4 "Machine ID" sand-cast-line, mach-haas-vf2 | "rawMaterial.materialId: Material rate confidence: Low", raw ids, internal field names | Should be plain language ("Material price confidence: Low"; grade name; "Machine rate, Finish machining +X"). | P3 | Verified |
| X29 | PDF + Excel | PDF §2 decisions / Excel 7-Checks C24 (bracket C22) | "Which cast iron grade? — engine default" | The costing uses EN-GJS-500-7, set by the safety-critical rule (bracket: GS-C25). Name the grade that was used. | P3 | Verified |
| X30 | PDF | p1 headline | "2445.66" | The screen shows "₹2,445.66 ±9.8%". The band only appears on p13, and the Excel shows no band or overall confidence grade anywhere. | P3 | Verified |
| X31 | PDF | §2, §5, §7, §8, §6 | "3846985.50", "2677384.89" (no thousands separators); §8 "0.09hr" for a 5.59 min cycle and "0.98" utilisation (98 % elsewhere); "-1%" next to "-1.2%"; §6 values at 4 dp; wrapped units "Uni t", "/k g", "2854.073 / 8" | Consistent 2 dp with separators; cycle in min; utilisation in %. | P3 | Verified |
| X32 | PDF | §13 → §15 | Section §14 missing | Renumber the sections. | P3 | Verified |
| X33 | PDF | §11 | "1 observations" | "1 observation" | P3 | Verified |
| X34 | PDF + Excel | §3 / 2-Material, 6-Traceability | The 600-character price note is repeated twice on one page. It carries three dates: "Index-anchored 2026-07", "Held at the June 2026 price", "Effective Date 2026-09" | State one effective date: the price is June 2026, not refreshed. | P3 | Verified |
| X35 | Excel | 5-LabourRates A9–A24 | "ALL AVAILABLE LABOUR RATES IN LIBRARY" lists blow, roto, thermoform and SMT operators, and repeats the 4 used rows | Drop the rows this costing does not use. | P3 | Verified |
| X36 | Excel | 6-Traceability E6/F6 | Consumables row: Rate ID "mat-gjs500", confidence "Medium" | The consumables are rules at 0.5–0.6 confidence, not the material rate. | P3 | Verified |
| X37 | Excel | 2-Material D9, D12, D21 | Text cells beginning "=" ("= net ÷ utilisation") stored as `t="str"` (formula-result type with no formula) | LibreOffice opens them as text. Excel not tested. Safer to store them as plain strings (`t="s"`/inlineStr) or drop the leading "=". | P3 | Likely |
| X38 | PDF | §10 | "18.18 kgCO2e · 5.61 /kg"; process 17.16 kWh | The unit should be kgCO2e/kg. The 17.16 kWh differs from the costing's 3.2852 kWh melt energy (the report discloses this, but it still confuses readers). | P3 | Verified |
| X39 | PDF | p3 DFA | "bounding box 114×236×210 mm" | The kernel bbox is 236.8 × 210.1 × 116.5 mm (truth file). Probably a different frame. | P3 | Likely |
| X40 | (cost logic, both reports) | shot blast row | Knuckle and bracket shot blast = ₹12.72 = exactly £0.10 × 127.19 | `Math.max(0.10, …)` (casting.ts:677) is a UK £ floor that is not multiplied by the country factor, so the floor binds in India. | P3 | Likely |
| X41 | PDF + Excel | bracket op / §4C | "3×Ø14.0×1 thru, 1×Ø20.0×1 blind" drilled | 1 mm deep "holes" look like spot-faces or a thin web being costed as drilled holes. Not verifiable from the exports. | P3 | Likely |
| S1 | Screen (not an export) | json `screen.breakdown[24–46]` rate trace | "22.438727985074628£/hr", "4.164451389068892£", "1.8690000000000002£/kg", all in £ while the display is INR | The exports convert and round these correctly (Excel ₹2,854.07, ₹529.69). Only the screen trace is raw. | P2 | Verified |

## Not verified

- The DFM £ and regional rows against the SCREEN: the json does not capture the screen's DFM or regional tables. They were
  checked only for internal arithmetic.
- Whether the bores > Ø20 are timed as boring inside the "Drilling" op (X16): the exports carry only the op total.
- The second solid in PRCR002.stp (X18).
- How Excel itself (not LibreOffice) opens the `t="str"` cells (X37).

## Outside the exports, noticed in passing (not scored)

- `mach-haas-vf2` is costed at 50 % utilisation (₹2,854/h) against 80 % for the other machines, on a 100k/yr dedicated programme. This inflates every milling op by about 60 % of its fixed share.
- Floor space is the same ₹166.94/h for the lathe, the drilling centre and the VF-2.
