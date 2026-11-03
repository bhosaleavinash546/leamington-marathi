# Worked examples — every costing step re-done from the exported workbook (3 Nov 2026)

Each part costed live at 200,000 a year, 5 years, ex-works, in the United Kingdom (£) and China (¥). Every row is
read off the Excel report the tool exported; "Re-done" is the arithmetic repeated from the printed inputs by
`scripts/country-trace/worked-example.py` (no call into the tool); "Holds" means it matches the printed figure within
the rounding of its 4-dp inputs. The other five countries were re-done the same way: 1,920 steps on 105 costings, all
hold. Parent review: `seven-country-cad2c-review-2026-11-03.md`.

### AL_Battery_Rail — United Kingdom — base rate book

Stamp: United Kingdom rate book v2.2.0 · rules v8 · kernel 374f8cebdccb · 3 Nov 2026. Currency GBP.

Answered: Which process makes this part? → Aluminium extrusion; Which aluminium alloy? → EN AW-6063 (Al-Mg0.7Si); Which extrusion process? → not answered — the rules’ value (see the basis); Which temper? → not answered — the rules’ value (see the basis); Which finish? → not answered — the rules’ value (see the basis); Is the profile stretch-bent after extrusion? → not answered — the rules’ value (see the basis).

Set by the rules from the measured part: Alloy = EN AW-6063 (Al-Mg0.7Si) (engineer); Process = Direct (forward) hot extrusion (rule); Section area (mm²) ℹ = 1437.5 (geometry); Outline (mm) ℹ = 1135 (geometry); Circumscribing circle (mm) ℹ = 161.6 (geometry); Tongue ratio ℹ = 0 (geometry); Voids (chambers) ℹ = 4 (geometry); Thinnest wall (mm) ℹ = 2.5 (geometry); Cut length (mm) ℹ = 1800 (geometry); Finished part (kg) ℹ = 6.9863 (geometry); Temper = T6 (rule); Finish = Mill finish (rule); ….

| Step | What | Arithmetic | Re-done | Printed | Holds |
|---|---|---|---|---|---|
| 2 | material bought: EN AW-6063 (Al-Mg0.7Si) extrusion billet | 7.7284 kg × 3.2668/kg | 25.247137 | 25.24703 | ✓ |
| 2 | scrap credit | 0.7421 kg × 2.48/kg | -1.840408 | -1.841193 | ✓ |
| 2 | net raw material = bucket 1 | 25.24703 -1.841193 (scrap credit) +0.03208 (die nitriding) +0.135889 (process energy) | 23.573806 | 23.573806 | ✓ |
| 2 | bucket 1 on the summary | material sheet total | 23.573806 | 23.573806 | ✓ |
| 3 | Direct extrusion — press, quench, stretch, saw — machine | 338.338333/h × 0.023413 h ÷ 0.78 OEE ÷ 15 a cycle | 0.677053 | 0.677044 | ✓ |
| 3 | Direct extrusion — press, quench, stretch, saw — labour | 24.65/h × 0.023413 h × 4.0 crew ÷ 0.92 efficiency ÷ 15 a cycle | 0.167284 | 0.167282 | ✓ |
| 3 | Die change and press set-up (per run) — machine | 338.338333/h × 3e-05 h ÷ 1.0 OEE ÷ 1 a cycle | 0.01015 | 0.01015 | ✓ |
| 3 | Die change and press set-up (per run) — labour | 24.65/h × 3e-05 h × 4.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.003215 | 0.003215 | ✓ |
| 3 | Artificial ageing (6 h a load + 0.75 h load / unload, 8,000 kg a load — ESTIMATE) — machine | 31.705625/h × 6.887755 h ÷ 1.0 OEE ÷ 1145 a cycle | 0.190725 | 0.190725 | ✓ |
| 3 | Artificial ageing (6 h a load + 0.75 h load / unload, 8,000 kg a load — ESTIMATE) — labour | 24.65/h × 0.765306 h × 1.0 crew ÷ 0.92 efficiency ÷ 1145 a cycle | 0.017908 | 0.017908 | ✓ |
| 3 | Precision cut-to-length and deburr (cold saw, end trims) — machine | 17.625938/h × 0.005278 h ÷ 0.78 OEE ÷ 1 a cycle | 0.119269 | 0.119264 | ✓ |
| 3 | Precision cut-to-length and deburr (cold saw, end trims) — labour | 24.65/h × 0.005278 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.141416 | 0.14141 | ✓ |
| 3 | Inspect, interleave and pack (13.2 s — 6 s + 4 s a metre, engineering-typical, not sourced) — labour | 24.65/h × 0.003741 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.100234 | 0.100248 | ✓ |
| 3 | operations = bucket 2 (process) | sum of machine £ | 0.997183 | 0.997183 | ✓ |
| 3 | operations = bucket 3 (labour) | sum of labour £ | 0.430063 | 0.430063 | ✓ |
| 4 | tooling over the programme (the programme: 5 years × 200,000 a year) | 1,747,086.47 ÷ 1,000,000 parts | 1.747086 | 1.747086 | ✓ |
| 5 | packaging (as printed) + logistics | 0.35 + 0 (ex-works) |  |  | ✓ |
| 6 | overhead 12.0% of material + process + labour + tooling | 0.12 × 26.748138 | 3.209777 | 3.209777 | ✓ |
| 7 | margin 8.0% of the subtotal | 0.08 × 30.307915 | 2.424633 | 2.424633 | ✓ |
| 8 | total = the 8 buckets | 23.5738 + 0.9972 + 0.4301 + 1.7471 + 0.3500 + 0.0000 + 3.2098 + 2.4246 | 32.732548 | 32.732549 | ✓ |

### BM_Air_Duct — United Kingdom — base rate book

Stamp: United Kingdom rate book v2.2.0 · rules v8 · kernel 374f8cebdccb · 3 Nov 2026. Currency GBP.

Answered: Which process makes this part? → Blow moulded; Which resin is this moulded in? → PP Blow Grade (MFI 1.0, random co-polymer); What is the nominal capacity of this container? → I know the exact capacity; What is the nominal capacity, in litres? → 2.5.

Set by the rules from the measured part: Wall Thickness (mm) ℹ = 1.99 (geometry); Grade = PP Blow Grade (MFI 1.0, random co-polymer) — £1.11/kg (engineer); Part Volume (L) ℹ = 2.5 (engineer); Part Weight (kg) = 0.2856 (geometry); Flash Weight (kg) ℹ = 0.0343 (rule); Flash Reground (0–1) ℹ = 1 (rule); Process Type = EBM — 2-Head (Bottles 1–5L) (rule); Cavities = 1 (rule); Blow Machine = EBM Blow Moulder (up to 5L) — £20.59/hr (advisor); Cool Factor (s/mm²) ℹ = 3.16 (rule); Blow Time (s) ℹ = 5 (rule); Open/Close (s) ℹ = 4.3 (rule); ….

| Step | What | Arithmetic | Re-done | Printed | Holds |
|---|---|---|---|---|---|
| 2 | material bought: PP Blow Grade (MFI 1.0, random co-polymer) | 0.2929 kg × 1.11/kg | 0.325119 | 0.325145 | ✓ |
| 2 | net raw material = bucket 1 | 0.325145 +0 (scrap credit) +0 (process energy) | 0.325145 | 0.325145 | ✓ |
| 2 | bucket 1 on the summary | material sheet total | 0.325145 | 0.325145 | ✓ |
| 3 | Extrusion Blow Moulding — machine | 20.586875/h × 0.006215 h ÷ 0.8 OEE ÷ 1 a cycle | 0.159934 | 0.159929 | ✓ |
| 3 | Extrusion Blow Moulding — labour | 23.07/h × 0.006215 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.077924 | 0.077921 | ✓ |
| 3 | Deflashing — machine | 11.330588/h × 0.006211 h ÷ 0.8 OEE ÷ 1 a cycle | 0.087968 | 0.087965 | ✓ |
| 3 | operations = bucket 2 (process) | sum of machine £ | 0.247894 | 0.247894 | ✓ |
| 3 | operations = bucket 3 (labour) | sum of labour £ | 0.077921 | 0.077921 | ✓ |
| 4 | tooling over the programme (the programme: 5 years × 200,000 a year) | 24,285.13 ÷ 1,000,000 parts | 0.024285 | 0.024285 | ✓ |
| 5 | packaging (as printed) + logistics | 0.08 + 0 (ex-works) |  |  | ✓ |
| 6 | overhead 12.0% of material + process + labour + tooling | 0.12 × 0.675245 | 0.081029 | 0.081029 | ✓ |
| 7 | margin 8.0% of the subtotal | 0.08 × 0.836274 | 0.066902 | 0.066902 | ✓ |
| 8 | total = the 8 buckets | 0.3251 + 0.2479 + 0.0779 + 0.0243 + 0.0800 + 0.0000 + 0.0810 + 0.0669 | 0.903176 | 0.903177 | ✓ |

### Casting_Braket — United Kingdom — base rate book

Stamp: United Kingdom rate book v2.2.0 · rules v8 · kernel 374f8cebdccb · 3 Nov 2026. Currency GBP.

Answered: Which process makes this part? → Cast; What is this part made of? → Steel; Which steel grade? → not answered — costed as GS-C25 (Cast Carbon Steel); Does this part have to hold pressure or be leak-tight? → No — structural or cosmetic only; Is the part coated or surface-treated? → not answered — the rules’ value (see the basis); What tolerance class does the drawing call for? → Standard; Is this part safety-critical or fatigue-loaded? → No.

Set by the rules from the measured part: Grade = GS-C25 (Cast Carbon Steel) — £0.15/kg (geometry); Subtype = Sand (advisor); Casting Yield (0–1) ⓘ = 0.525 (library); Core Cost/Part (£) ⓘ — material cost = 0 (geometry); Part Weight (kg) = 2.512 (geometry); Die Cost (£) ⓘ = 8012 (advisor); Die Life (shots) ⓘ — affects total die cost = 32000 (library); Cycle Time (hr) ⓘ = 0.0083 (geometry); Labour = Foundry Operative (UK) — £24.60/hr (library); Fettling (bench min/part) ⓘ = 6 (rule); Heat Treat (£/kg) ⓘ = 0.35 (library); Shot Blast (£/part) ⓘ = 0.208 (library); ….

| Step | What | Arithmetic | Re-done | Printed | Holds |
|---|---|---|---|---|---|
| 2 | material bought: GS-C25 (Cast Carbon Steel) | 2.5846 kg × 0.148/kg | 0.382521 | 0.382524 | ✓ |
| 2 | net raw material = bucket 1 | 0.382524 +0 (scrap credit) +0.049327 (green-sand additions (4.93 kg poured × £0.01/kg, engineering-typical)) +0.8792 (heat treatment) +0.208 (shot blast) +1.4912 (machining consumables) +0.628432 (process energy) | 3.638683 | 3.638683 | ✓ |
| 2 | bucket 1 on the summary | material sheet total | 3.638683 | 3.638683 | ✓ |
| 3 | Sand Casting — Moulding — machine | 29.895238/h × 0.008557 h ÷ 0.8 OEE ÷ 1 a cycle | 0.319767 | 0.319756 | ✓ |
| 3 | Sand Casting — Moulding — labour | 24.6/h × 0.008557 h × 4.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.915227 | 0.915195 | ✓ |
| 3 | Melt shop (charge, melt, treat, ladle) — 4.93 kg poured × 1.5 operator-h/t (engineering-typical) — labour | 24.6/h × 0.007399 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.197843 | 0.197846 | ✓ |
| 3 | Fettling (gate / riser removal, grind) — labour | 24.6/h × 0.103093 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 2.756617 | 2.756611 | ✓ |
| 3 | CNC Machining — 18 features — machine | 10.867708/h × 0.207117 h ÷ 0.8 OEE ÷ 1 a cycle | 2.813609 | 2.813604 | ✓ |
| 3 | CNC Machining — 18 features — labour | 27.95/h × 0.207117 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 3.146152 | 3.146147 | ✓ |
| 3 | Pallet change (1 fixturing(s) × 10 s) — machine | 10.867708/h × 0.002778 h ÷ 0.8 OEE ÷ 1 a cycle | 0.037738 | 0.037735 | ✓ |
| 3 | Machining change-over, amortised (1 fixturing(s) × 45 min ÷ batch 5000) — machine | 10.867708/h × 0.00015 h ÷ 1.0 OEE ÷ 1 a cycle | 0.00163 | 0.00163 | ✓ |
| 3 | Machining change-over, amortised (1 fixturing(s) × 45 min ÷ batch 5000) — labour | 27.95/h × 0.00015 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.004557 | 0.004557 | ✓ |
| 3 | operations = bucket 2 (process) | sum of machine £ | 3.172725 | 3.172725 | ✓ |
| 3 | operations = bucket 3 (labour) | sum of labour £ | 7.020356 | 7.020357 | ✓ |
| 4 | tooling over the programme (the programme: 5 years × 200,000 a year) | 276,571.00 ÷ 1,000,000 parts | 0.276571 | 0.276571 | ✓ |
| 5 | packaging (as printed) + logistics | 0.15 + 0 (ex-works) |  |  | ✓ |
| 6 | overhead 12.0% of material + process + labour + tooling | 0.12 × 14.108336 | 1.693 | 1.693 | ✓ |
| 7 | margin 8.0% of the subtotal | 0.08 × 15.951336 | 1.276107 | 1.276107 | ✓ |
| 8 | total = the 8 buckets | 3.6387 + 3.1727 + 7.0204 + 0.2766 + 0.1500 + 0.0000 + 1.6930 + 1.2761 | 17.227443 | 17.227443 | ✓ |

### COMP_Hat_Stiffener — United Kingdom — base rate book

Stamp: United Kingdom rate book v2.2.0 · rules v8 · kernel 374f8cebdccb · 3 Nov 2026. Currency GBP.

Answered: Which process makes this part? → Composite laminate; Which fibre and resin system? → Carbon prepreg, autoclave.

Set by the rules from the measured part: Process = Prepreg Hand Layup (engineer); Fibre Price (£/kg) = 33.6 (library); Resin Price (£/kg) = 0 (library); Part Weight (kg) = 0.3028 (geometry); Fibre Weight Fraction = 0.65 (library); Waste Fraction = 0.15 (library); Plies = 10 (geometry); Area (m²) = 0.081 (geometry); Layup Time (hr/part) = 0.049 (rule); Cure Time (hr/cycle) = 3 (library); Mould / Mandrel Cost (£) = 12671 (rule); Tool Life (parts) = 500 (rule); ….

| Step | What | Arithmetic | Re-done | Printed | Holds |
|---|---|---|---|---|---|
| 2 | Prepreg Prepreg (fibre + resin) | 0.371078 × 33.6000 | 12.468221 | 12.468221 | ✓ |
| 2 | NDI Non-destructive inspection (C-scan / UT) per part | 1.041667 × 0.8566 | 0.892292 | 0.892292 | ✓ |
| 2 | direct material = its lines | 12.468221 + 0.892292 | 13.360513 | 13.360527 | ✓ |
| 2 | net raw material = bucket 1 | 13.360527 +0 (scrap credit) +0 (process energy) | 13.360527 | 13.360527 | ✓ |
| 2 | bucket 1 on the summary | material sheet total | 13.360527 | 13.360527 | ✓ |
| 3 | Prepreg Hand Layup — machine | 0.678824/h × 0.051042 h ÷ 0.8 OEE ÷ 1 a cycle | 0.043311 | 0.04331 | ✓ |
| 3 | Prepreg Hand Layup — labour | 27.95/h × 0.051042 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 1.550678 | 1.550668 | ✓ |
| 3 | Cure (Autoclave) — machine | 42.431071/h × 0.15625 h ÷ 0.8 OEE ÷ 1 a cycle | 8.287319 | 8.287319 | ✓ |
| 3 | Cure (Autoclave) — labour | 24.65/h × 0.039063 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 1.046634 | 1.04662 | ✓ |
| 3 | Trim, Drill & Finish — machine | 30.647333/h × 0.116667 h ÷ 0.8 OEE ÷ 1 a cycle | 4.469415 | 4.469403 | ✓ |
| 3 | Trim, Drill & Finish — labour | 24.65/h × 0.116667 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 3.125915 | 3.125906 | ✓ |
| 3 | operations = bucket 2 (process) | sum of machine £ | 12.800032 | 12.800032 | ✓ |
| 3 | operations = bucket 3 (labour) | sum of labour £ | 5.723194 | 5.723194 | ✓ |
| 4 | tooling over the programme (the programme: 5 years × 200,000 a year) | 25,342,000.00 ÷ 1,000,000 parts | 25.342 | 25.342 | ✓ |
| 5 | packaging (as printed) + logistics | 0.07 + 0 (ex-works) |  |  | ✓ |
| 6 | overhead 12.0% of material + process + labour + tooling | 0.12 × 57.225753 | 6.86709 | 6.86709 | ✓ |
| 7 | margin 8.0% of the subtotal | 0.08 × 64.162843 | 5.133027 | 5.133027 | ✓ |
| 8 | total = the 8 buckets | 13.3605 + 12.8000 + 5.7232 + 25.3420 + 0.0700 + 0.0000 + 6.8671 + 5.1330 | 69.29587 | 69.295871 | ✓ |

### IM_ECU_Cover — United Kingdom — base rate book

Stamp: United Kingdom rate book v2.2.0 · rules v8 · kernel 374f8cebdccb · 3 Nov 2026. Currency GBP.

Answered: Which process makes this part? → Injection moulded; Which resin is this moulded in? → PC/ABS Blend (automotive grade).

Set by the rules from the measured part: Wall Thickness (mm) = 2.5 (geometry); Projected Area (cm²) = 216.2 (geometry); Grade = PC/ABS Blend (automotive grade) — £1.92/kg (engineer); Part Weight (kg) = 0.1407 (geometry); Cavities = 2 (rule); Cavity Pressure (MPa) = 65 (rule); IMM Machine = 400T Injection Moulding Machine — £39.77/hr (advisor); Cool Factor (s/mm²) = 2.2 (rule); Fill Time (s) = 1.5 (rule); Pack Time (s) = 2 (rule); Eject Time (s) = 4.5 (rule); Runner Weight (kg) = 0.0422 (rule); ….

| Step | What | Arithmetic | Re-done | Printed | Holds |
|---|---|---|---|---|---|
| 2 | material bought: PC/ABS Blend (automotive grade) | 0.1489 kg × 1.92/kg | 0.285888 | 0.285845 | ✓ |
| 2 | scrap credit | 0.0053 kg × 0.08/kg | -0.000424 | -0.000424 | ✓ |
| 2 | net raw material = bucket 1 | 0.285845 -0.000424 (scrap credit) +0.004507 (process energy) | 0.289928 | 0.289928 | ✓ |
| 2 | bucket 1 on the summary | material sheet total | 0.289928 | 0.289928 | ✓ |
| 3 | Injection Moulding — machine | 39.770313/h × 0.006165 h ÷ 0.85 OEE ÷ 2 a cycle | 0.144226 | 0.144225 | ✓ |
| 3 | Injection Moulding — labour | 24.65/h × 0.006165 h × 0.5 crew ÷ 0.95 efficiency ÷ 2 a cycle | 0.039991 | 0.039991 | ✓ |
| 3 | Mould change (amortised over the batch) — machine | 39.770313/h × 0.0005 h ÷ 1.0 OEE ÷ 1 a cycle | 0.019885 | 0.019885 | ✓ |
| 3 | Mould change (amortised over the batch) — labour | 35.17/h × 0.0005 h × 1.0 crew ÷ 1.0 efficiency ÷ 1 a cycle | 0.017585 | 0.017585 | ✓ |
| 3 | operations = bucket 2 (process) | sum of machine £ | 0.16411 | 0.16411 | ✓ |
| 3 | operations = bucket 3 (labour) | sum of labour £ | 0.057576 | 0.057576 | ✓ |
| 4 | tooling over the programme (the programme: 5 years × 200,000 a year) | 61,203.00 ÷ 1,000,000 parts | 0.061203 | 0.061203 | ✓ |
| 5 | packaging (as printed) + logistics | 0.06 + 0 (ex-works) |  |  | ✓ |
| 6 | overhead 12.0% of material + process + labour + tooling | 0.12 × 0.572817 | 0.068738 | 0.068738 | ✓ |
| 7 | margin 8.0% of the subtotal | 0.08 × 0.701555 | 0.056124 | 0.056124 | ✓ |
| 8 | total = the 8 buckets | 0.2899 + 0.1641 + 0.0576 + 0.0612 + 0.0600 + 0.0000 + 0.0687 + 0.0561 | 0.757679 | 0.75768 | ✓ |

### EXT_Vent_Pipe — United Kingdom — base rate book

Stamp: United Kingdom rate book v2.2.0 · rules v8 · kernel 374f8cebdccb · 3 Nov 2026. Currency GBP.

Answered: Which process makes this part? → Extruded (polymer) and cut to length; Which polymer grade is this extruded in? → PE100 Pipe Grade (black, PE4710).

Set by the rules from the measured part: Grade = PE100 Pipe Grade (black, PE4710) — £1.34/kg (engineer); Process ℹ = Pipe (geometry); Part Length (m) = 1 (geometry); Profile kg/m ℹ = 0.2624 (geometry); Wall Thickness (mm) ℹ = 2.99 (geometry); Extruder / Line = Pipe Extrusion Line 90mm (SSE + vacuum tank + haul-off + saw) — £25.76/hr (rule); Screw Ø (mm) ℹ = 90 (rule); Cooling ℹ = Vacuum tank (rule); Line Rate (kg/hr) ℹ = 95 (advisor); Startup Scrap ℹ = 0.0054 (rule); Steady Scrap ℹ = 0.02 (rule); Colour changes/day ℹ = 0 (rule); ….

| Step | What | Arithmetic | Re-done | Printed | Holds |
|---|---|---|---|---|---|
| 2 | material bought: PE100 Pipe Grade (black, PE4710) | 0.2692 kg × 1.34/kg | 0.360728 | 0.36078 | ✓ |
| 2 | scrap credit | 0.0068 kg × 0.12/kg | -0.000816 | -0.000821 | ✓ |
| 2 | net raw material = bucket 1 | 0.36078 -0.000821 (scrap credit) +0.020581 (process energy) | 0.38054 | 0.38054 | ✓ |
| 2 | bucket 1 on the summary | material sheet total | 0.38054 | 0.38054 | ✓ |
| 3 | Extrusion — machine | 25.761961/h × 0.002834 h ÷ 0.8 OEE ÷ 1 a cycle | 0.091262 | 0.091265 | ✓ |
| 3 | Extrusion — labour | 24.65/h × 0.002834 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.037966 | 0.037968 | ✓ |
| 3 | Inspect and bundle (station 4 s, operator 6 s — engineering-typical, not sourced) — machine | 4.054375/h × 0.001111 h ÷ 0.8 OEE ÷ 1 a cycle | 0.005631 | 0.005631 | ✓ |
| 3 | Inspect and bundle (station 4 s, operator 6 s — engineering-typical, not sourced) — labour | 24.65/h × 0.001667 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.044665 | 0.044656 | ✓ |
| 3 | operations = bucket 2 (process) | sum of machine £ | 0.096896 | 0.096896 | ✓ |
| 3 | operations = bucket 3 (labour) | sum of labour £ | 0.082624 | 0.082623 | ✓ |
| 4 | tooling over the programme (the programme: 5 years × 200,000 a year) | 7,488.00 ÷ 1,000,000 parts | 0.007488 | 0.007488 | ✓ |
| 5 | packaging (as printed) + logistics | 0.06 + 0 (ex-works) |  |  | ✓ |
| 6 | overhead 12.0% of material + process + labour + tooling | 0.12 × 0.567547 | 0.068106 | 0.068106 | ✓ |
| 7 | margin 8.0% of the subtotal | 0.08 × 0.695653 | 0.055652 | 0.055652 | ✓ |
| 8 | total = the 8 buckets | 0.3805 + 0.0969 + 0.0826 + 0.0075 + 0.0600 + 0.0000 + 0.0681 + 0.0557 | 0.751305 | 0.751305 | ✓ |

### test-gear-m3-z38 — United Kingdom — base rate book

Stamp: United Kingdom rate book v2.2.0 · rules v8 · kernel 374f8cebdccb · 3 Nov 2026. Currency GBP.

Answered: Spur or helical — what is the helix angle? → Spur — 0°; ISO 1328 flank tolerance class? → Class 7 — finished automotive transmission; What is the gear cut from? → Case-hardening steel (20MnCr5 / 8620); Which hardening route does this gear take? → not answered — the rules’ value (see the basis).

Set by the rules from the measured part: Teeth (z) ℹ = 38 (geometry); Helix Angle β (°, 0 = spur) ℹ = 0 (engineer); Normal Module (mm) ℹ = 3 (geometry); Face Width (mm) = 30 (geometry); Internal (ring) Gear = No — external (edited) (geometry); ISO 1328 Class ℹ = Class 7 — finished automotive (engineer); Material Class ℹ = Case-hardening steel (20MnCr5 / 8620) (engineer); Effective Case Depth (mm) ℹ = 0.7 (library); Case Hardened ℹ = Yes — carburise + quench (edited) (rule); Material (grade) = 20MnCr5 (Gear Steel) (UK) — £1.48/kg (library); Net Gear Weight (kg) ℹ = 2.088 (geometry); Blank Material (£/part) ℹ = 4.76 (rule); ….

| Step | What | Arithmetic | Re-done | Printed | Holds |
|---|---|---|---|---|---|
| 2 | Blank Blank material per part (bar × £/kg − chips: the blank rule's basis) | 1.020408 × 4.7600 | 4.857142 | 4.857142 | ✓ |
| 2 | direct material = its lines | 4.857142 | 4.857142 | 4.857143 | ✓ |
| 2 | net raw material = bucket 1 | 4.857143 +0 (scrap credit) +0.325284 (£0.1527/kg × 2.088 kg ÷ (1 − 2% reject)) +1.946505 (£0.9136/kg × 2.088 kg ÷ (1 − 2% reject)) +0.325284 (£0.1527/kg × 2.088 kg ÷ (1 − 2% reject)) +0.405426 (£0.1903/kg × 2.088 kg ÷ (1 − 2% reject)) +0 (process energy) | 7.859642 | 7.859642 | ✓ |
| 2 | bucket 1 on the summary | material sheet total | 7.859642 | 7.859642 | ✓ |
| 3 | Blank turning (face, OD, bore) — machine | 7.786875/h × 0.053901 h ÷ 0.8 OEE ÷ 1 a cycle | 0.52465 | 0.524648 | ✓ |
| 3 | Blank turning (face, OD, bore) — labour | 27.95/h × 0.053901 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.818768 | 0.818765 | ✓ |
| 3 | Gear hobbing — machine | 55.608125/h × 0.015779 h ÷ 0.8 OEE ÷ 1 a cycle | 1.096801 | 1.096812 | ✓ |
| 3 | Gear hobbing — labour | 27.95/h × 0.015779 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.239686 | 0.239689 | ✓ |
| 3 | Chamfer and deburr — machine | 25.959756/h × 0.007132 h ÷ 0.8 OEE ÷ 1 a cycle | 0.231431 | 0.231434 | ✓ |
| 3 | Chamfer and deburr — labour | 24.65/h × 0.007132 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.191091 | 0.191093 | ✓ |
| 3 | Gear grinding — machine | 126.532372/h × 0.0147 h ÷ 0.8 OEE ÷ 1 a cycle | 2.325032 | 2.325013 | ✓ |
| 3 | Gear grinding — labour | 27.95/h × 0.0147 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.223296 | 0.223294 | ✓ |
| 3 | Gear inspection — machine | 56.211538/h × 0.005715 h ÷ 0.8 OEE ÷ 1 a cycle | 0.401561 | 0.40155 | ✓ |
| 3 | Gear inspection — labour | 28.03/h × 0.005715 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.174121 | 0.174116 | ✓ |
| 3 | operations = bucket 2 (process) | sum of machine £ | 4.579457 | 4.579457 | ✓ |
| 3 | operations = bucket 3 (labour) | sum of labour £ | 1.646957 | 1.646957 | ✓ |
| 4 | tooling over the programme (the programme: 5 years × 200,000 a year) | 625,512.04 ÷ 1,000,000 parts | 0.625512 | 0.625512 | ✓ |
| 5 | packaging (as printed) + logistics | 0.13 + 0 (ex-works) |  |  | ✓ |
| 6 | overhead 12.0% of material + process + labour + tooling | 0.12 × 14.711568 | 1.765388 | 1.765388 | ✓ |
| 7 | margin 8.0% of the subtotal | 0.08 × 16.606956 | 1.328556 | 1.328557 | ✓ |
| 8 | total = the 8 buckets | 7.8596 + 4.5795 + 1.6470 + 0.6255 + 0.1300 + 0.0000 + 1.7654 + 1.3286 | 17.935513 | 17.935513 | ✓ |

### FORGE_Hub_Flange — United Kingdom — base rate book

Stamp: United Kingdom rate book v2.2.0 · rules v8 · kernel 374f8cebdccb · 3 Nov 2026. Currency GBP.

Answered: Which process makes this part? → Forged; What tolerance class does the drawing call for? → Standard; Which steel grade? → not answered — costed as 38MnVS6 (Microalloyed); Is the part coated or surface-treated? → not answered — the rules’ value (see the basis); Is this part safety-critical or fatigue-loaded? → No.

Set by the rules from the measured part: Grade = 38MnVS6 (Microalloyed) — £1.15/kg (rule); Part Weight (kg) = 2.842 (geometry); Projected Area (cm²) ℹ = 116 (geometry); Shape Complexity ℹ = Simple (upset/block) (geometry); Yield Fraction (0–1) = 0.743 (library); Flash + Scale (kg) = 0.284 (rule); Forge Machine = 1600T Mechanical Forge Press — £91.69/hr (advisor); Strokes to Form = 2 (rule); Time/Blow (s) ℹ = 4 (rule); Cycle Time (hr) ℹ = 0.003056 (rule); Labour = Forge Operator / Hammer-man (UK) — £25.15/hr (rule); Manning = 2 (rule); ….

| Step | What | Arithmetic | Re-done | Printed | Holds |
|---|---|---|---|---|---|
| 2 | material bought: 38MnVS6 (Microalloyed) | 4.2931 kg × 1.15/kg | 4.937065 | 4.9371 | ✓ |
| 2 | scrap credit | 1.3931 kg × 0.20/kg | -0.27862 | -0.278626 | ✓ |
| 2 | net raw material = bucket 1 | 4.9371 -0.278626 (scrap credit) +0.348 (descale) +1.3592 (machining tool wear and cell consumables) +0.273472 (process energy) | 6.639146 | 6.639146 | ✓ |
| 2 | bucket 1 on the summary | material sheet total | 6.639146 | 6.639146 | ✓ |
| 3 | Forging — machine | 91.690476/h × 0.003118 h ÷ 0.8 OEE ÷ 1 a cycle | 0.357364 | 0.357406 | ✓ |
| 3 | Forging — labour | 25.15/h × 0.003118 h × 2.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.170473 | 0.170493 | ✓ |
| 3 | Flash Trimming — machine | 15.208929/h × 0.003118 h ÷ 0.8 OEE ÷ 1 a cycle | 0.059277 | 0.059284 | ✓ |
| 3 | Flash Trimming — labour | 25.15/h × 0.003118 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.085237 | 0.085247 | ✓ |
| 3 | Turning — outside and faces on the CNC lathe, op 10 / op 20 — machine | 7.786875/h × 0.130333 h ÷ 0.8 OEE ÷ 1 a cycle | 1.268608 | 1.268612 | ✓ |
| 3 | Turning — outside and faces on the CNC lathe, op 10 / op 20 — labour | 27.95/h × 0.130333 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 1.979787 | 1.979792 | ✓ |
| 3 | CNC Machining — 7 features — machine | 6.641563/h × 0.05845 h ÷ 0.8 OEE ÷ 1 a cycle | 0.485249 | 0.485249 | ✓ |
| 3 | CNC Machining — 7 features — labour | 27.95/h × 0.05845 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.887868 | 0.887868 | ✓ |
| 3 | Machining load / unload + change-over (3 fixturing(s): 0.6 min each + 45 min ÷ batch 5000) — machine | 6.641563/h × 0.03045 h ÷ 0.8 OEE ÷ 1 a cycle | 0.252794 | 0.252794 | ✓ |
| 3 | Machining load / unload + change-over (3 fixturing(s): 0.6 min each + 45 min ÷ batch 5000) — labour | 27.95/h × 0.03045 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.925084 | 0.925084 | ✓ |
| 3 | operations = bucket 2 (process) | sum of machine £ | 2.423345 | 2.423345 | ✓ |
| 3 | operations = bucket 3 (labour) | sum of labour £ | 4.048484 | 4.048484 | ✓ |
| 4 | tooling over the programme (the programme: 5 years × 200,000 a year) | 533,579.81 ÷ 1,000,000 parts | 0.53358 | 0.53358 | ✓ |
| 5 | packaging (as printed) + logistics | 0.17 + 0 (ex-works) |  |  | ✓ |
| 6 | overhead 12.0% of material + process + labour + tooling | 0.12 × 13.644555 | 1.637347 | 1.637347 | ✓ |
| 7 | margin 8.0% of the subtotal | 0.08 × 15.451902 | 1.236152 | 1.236152 | ✓ |
| 8 | total = the 8 buckets | 6.6391 + 2.4233 + 4.0485 + 0.5336 + 0.1700 + 0.0000 + 1.6373 + 1.2362 | 16.688054 | 16.688054 | ✓ |

### steering_knuckle_RH — United Kingdom — base rate book

Stamp: United Kingdom rate book v2.2.0 · rules v8 · kernel 374f8cebdccb · 3 Nov 2026. Currency GBP.

Answered: Which process makes this part? → Forged; What is this part made of? → Steel; What tolerance class does the drawing call for? → Standard; Which steel grade? → not answered — costed as 38MnVS6 (Microalloyed); Is the part coated or surface-treated? → not answered — the rules’ value (see the basis); Is this part safety-critical or fatigue-loaded? → Yes — safety-critical.

Set by the rules from the measured part: Grade = 38MnVS6 (Microalloyed) — £1.15/kg (rule); Part Weight (kg) = 3.255 (geometry); Projected Area (cm²) ℹ = 129.6 (geometry); Shape Complexity ℹ = Moderate (impression) (geometry); Yield Fraction (0–1) = 0.743 (library); Flash + Scale (kg) = 0.326 (rule); Forge Machine = 1600T Mechanical Forge Press — £91.69/hr (advisor); Strokes to Form = 3 (rule); Time/Blow (s) ℹ = 4 (rule); Cycle Time (hr) ℹ = 0.004167 (rule); Labour = Forge Operator / Hammer-man (UK) — £25.15/hr (rule); Manning = 2 (rule); ….

| Step | What | Arithmetic | Re-done | Printed | Holds |
|---|---|---|---|---|---|
| 2 | material bought: 38MnVS6 (Microalloyed) | 4.918 kg × 1.15/kg | 5.6557 | 5.655712 | ✓ |
| 2 | scrap credit | 1.5966 kg × 0.20/kg | -0.31932 | -0.319316 | ✓ |
| 2 | net raw material = bucket 1 | 5.655712 -0.319316 (scrap credit) +0.398571 (descale) +0.680918 (NDT) +1.4957 (machining tool wear and cell consumables) +0.313277 (process energy) | 8.224862 | 8.224863 | ✓ |
| 2 | bucket 1 on the summary | material sheet total | 8.224863 | 8.224863 | ✓ |
| 3 | Forging — machine | 91.690476/h × 0.004252 h ÷ 0.8 OEE ÷ 1 a cycle | 0.487335 | 0.48734 | ✓ |
| 3 | Forging — labour | 25.15/h × 0.004252 h × 2.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.232473 | 0.232476 | ✓ |
| 3 | Flash Trimming — machine | 15.208929/h × 0.004252 h ÷ 0.8 OEE ÷ 1 a cycle | 0.080835 | 0.080836 | ✓ |
| 3 | Flash Trimming — labour | 25.15/h × 0.004252 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.116237 | 0.116238 | ✓ |
| 3 | CNC Machining — 20 features — machine | 10.867708/h × 0.207733 h ÷ 0.8 OEE ÷ 1 a cycle | 2.821977 | 2.821982 | ✓ |
| 3 | CNC Machining — 20 features — labour | 27.95/h × 0.207733 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 3.155509 | 3.155514 | ✓ |
| 3 | Pallet change (1 fixturing(s) × 10 s) — machine | 10.867708/h × 0.002778 h ÷ 0.8 OEE ÷ 1 a cycle | 0.037738 | 0.037735 | ✓ |
| 3 | Machining change-over, amortised (1 fixturing(s) × 45 min ÷ batch 5000) — machine | 10.867708/h × 0.00015 h ÷ 1.0 OEE ÷ 1 a cycle | 0.00163 | 0.00163 | ✓ |
| 3 | Machining change-over, amortised (1 fixturing(s) × 45 min ÷ batch 5000) — labour | 27.95/h × 0.00015 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.004557 | 0.004557 | ✓ |
| 3 | operations = bucket 2 (process) | sum of machine £ | 3.429523 | 3.429523 | ✓ |
| 3 | operations = bucket 3 (labour) | sum of labour £ | 3.508785 | 3.508785 | ✓ |
| 4 | tooling over the programme (the programme: 5 years × 200,000 a year) | 869,691.37 ÷ 1,000,000 parts | 0.869691 | 0.869691 | ✓ |
| 5 | packaging (as printed) + logistics | 0.19 + 0 (ex-works) |  |  | ✓ |
| 6 | overhead 12.0% of material + process + labour + tooling | 0.12 × 16.032862 | 1.923943 | 1.923943 | ✓ |
| 7 | margin 8.0% of the subtotal | 0.08 × 18.146805 | 1.451744 | 1.451744 | ✓ |
| 8 | total = the 8 buckets | 8.2249 + 3.4295 + 3.5088 + 0.8697 + 0.1900 + 0.0000 + 1.9239 + 1.4517 | 19.598549 | 19.598549 | ✓ |

### MACH_Hydraulic_Manifold — United Kingdom — base rate book

Stamp: United Kingdom rate book v2.2.0 · rules v8 · kernel 374f8cebdccb · 3 Nov 2026. Currency GBP.

Answered: Which process makes this part? → Machined from solid; What is this part made of? → Aluminium.

Set by the rules from the measured part: Material = 6082-T6 Aluminium Bar (UK) — £3.49/kg (engineer); Net Weight (kg) = 1.312 (geometry); Stock Weight (kg) = 1.909 (geometry); Mat. Util. (0=auto) = 0.6871 (geometry); Setup Time (hr) = 1.5 (rule); Batch Size = 5000 (rule); Setup Machine = Horizontal machining centre — 400 mm twin pallet, 4th axis (production cell) — £10.87/hr (advisor); Reject Rate (0=none) ⓘ = 0.02 (rule); Tooling Cost (£) = 24000 (rule); Programming NRE (£) = 208 (rule); Cutting Tool Wear (£/part) ⓘ = 0.7706 (rule).

| Step | What | Arithmetic | Re-done | Printed | Holds |
|---|---|---|---|---|---|
| 2 | material bought: 6082-T6 Aluminium Bar | 1.9484 kg × 3.49/kg | 6.799916 | 6.800068 | ✓ |
| 2 | scrap credit | 0.6097 kg × 0.54/kg | -0.329238 | -0.329221 | ✓ |
| 2 | net raw material = bucket 1 | 6.800068 -0.329221 (scrap credit) +0.786327 (tool wear (inserts, end mills, drills)) +0 (process energy) | 7.257174 | 7.257174 | ✓ |
| 2 | bucket 1 on the summary | material sheet total | 7.257174 | 7.257174 | ✓ |
| 3 | Setup (amortised) — machine | 10.867708/h × 0.0003 h ÷ 1.0 OEE ÷ 1 a cycle | 0.00326 | 0.00326 | ✓ |
| 3 | Setup (amortised) — labour | 27.95/h × 0.0003 h × 1.0 crew ÷ 1.0 efficiency ÷ 1 a cycle | 0.008385 | 0.008385 | ✓ |
| 3 | Milling — +X (17 faces) — machine | 10.867708/h × 0.103265 h ÷ 0.8 OEE ÷ 1 a cycle | 1.402817 | 1.402822 | ✓ |
| 3 | Milling — +X (17 faces) — labour | 27.95/h × 0.103265 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 1.568618 | 1.568622 | ✓ |
| 3 | Milling — +Z (12 faces) — machine | 10.867708/h × 0.072959 h ÷ 0.8 OEE ÷ 1 a cycle | 0.991121 | 0.991124 | ✓ |
| 3 | Milling — +Z (12 faces) — labour | 27.95/h × 0.072959 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 1.108263 | 1.108266 | ✓ |
| 3 | Milling — +Y (8 faces) — machine | 10.867708/h × 0.048571 h ÷ 0.8 OEE ÷ 1 a cycle | 0.659819 | 0.659825 | ✓ |
| 3 | Milling — +Y (8 faces) — labour | 27.95/h × 0.048571 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.737804 | 0.737811 | ✓ |
| 3 | Drilling — 13 holes — machine | 10.867708/h × 0.102857 h ÷ 0.8 OEE ÷ 1 a cycle | 1.397275 | 1.397277 | ✓ |
| 3 | Drilling — 13 holes — labour | 27.95/h × 0.102857 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 1.56242 | 1.562422 | ✓ |
| 3 | Pallet change — 2 fixturing(s) — machine | 10.867708/h × 0.005714 h ÷ 0.8 OEE ÷ 1 a cycle | 0.077623 | 0.077626 | ✓ |
| 3 | Pallet change — 2 fixturing(s) — labour | 27.95/h × 0.005714 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.086797 | 0.086801 | ✓ |
| 3 | Deburr and gauge check (bench) — labour | 24.65/h × 0.019592 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.524938 | 0.524933 | ✓ |
| 3 | operations = bucket 2 (process) | sum of machine £ | 4.531934 | 4.531934 | ✓ |
| 3 | operations = bucket 3 (labour) | sum of labour £ | 5.59724 | 5.597241 | ✓ |
| 4 | tooling over the programme (the programme: 5 years × 200,000 a year) | 24,208.00 ÷ 1,000,000 parts | 0.024208 | 0.024208 | ✓ |
| 5 | packaging (as printed) + logistics | 0.1 + 0 (ex-works) |  |  | ✓ |
| 6 | overhead 12.0% of material + process + labour + tooling | 0.12 × 17.410557 | 2.089267 | 2.089267 | ✓ |
| 7 | margin 8.0% of the subtotal | 0.08 × 19.599824 | 1.567986 | 1.567986 | ✓ |
| 8 | total = the 8 buckets | 7.2572 + 4.5319 + 5.5972 + 0.0242 + 0.1000 + 0.0000 + 2.0893 + 1.5680 | 21.16781 | 21.167809 | ✓ |

### ROTO_Header_Tank — United Kingdom — base rate book

Stamp: United Kingdom rate book v2.2.0 · rules v8 · kernel 374f8cebdccb · 3 Nov 2026. Currency GBP.

Answered: Which process makes this part? → Rotomoulded; Which resin is this moulded in? → LLDPE Roto Powder (natural).

Set by the rules from the measured part: Material ℹ = LLDPE Roto Powder (natural) (UK) — £1.47/kg (engineer); Material Family ℹ = PE (LLDPE/HDPE) (rule); Wall Thickness (mm) ℹ = 3.99 (geometry); Part Weight (kg) ℹ = 0.6425 (geometry); Heating Time (s) ℹ = 1078 (advisor); Cooling Time (s) ℹ = 1455 (advisor); Cooling Method ℹ = Forced air (rule); No. of Arms ℹ = 4 (rule); Parts / Arm = 4 (geometry); Projected Area (cm²) ℹ = 382.4 (geometry); Mould Type ℹ = CNC aluminium (rule); Mould Cost (£) ℹ = 12162 (advisor); ….

| Step | What | Arithmetic | Re-done | Printed | Holds |
|---|---|---|---|---|---|
| 2 | material bought: LLDPE Roto Powder (natural) | 0.6691 kg × 1.47/kg | 0.983577 | 0.983521 | ✓ |
| 2 | scrap credit | 0.0067 kg × 0.11/kg | -0.000737 | -0.000736 | ✓ |
| 2 | net raw material = bucket 1 | 0.983521 -0.000736 (scrap credit) +0.167265 (Consumables & services) +0 (process energy) | 1.15005 | 1.15005 | ✓ |
| 2 | bucket 1 on the summary | material sheet total | 1.15005 | 1.15005 | ✓ |
| 3 | Rotational Moulding — machine | 58.311355/h × 0.308706 h ÷ 0.8 OEE ÷ 4 a cycle | 5.625333 | 5.625326 | ✓ |
| 3 | Rotational Moulding — labour | 23.07/h × 0.308706 h × 2.0 crew ÷ 0.92 efficiency ÷ 4 a cycle | 3.870569 | 3.870564 | ✓ |
| 3 | operations = bucket 2 (process) | sum of machine £ | 5.625326 | 5.625326 | ✓ |
| 3 | operations = bucket 3 (labour) | sum of labour £ | 3.870564 | 3.870564 | ✓ |
| 4 | tooling over the programme (the programme: 5 years × 200,000 a year) | 1,253,814.43 ÷ 1,000,000 parts | 1.253814 | 1.253814 | ✓ |
| 5 | packaging (as printed) + logistics | 0.08 + 0 (ex-works) |  |  | ✓ |
| 6 | overhead 12.0% of material + process + labour + tooling | 0.12 × 11.899754 | 1.42797 | 1.427971 | ✓ |
| 7 | margin 8.0% of the subtotal | 0.08 × 13.407725 | 1.072618 | 1.072618 | ✓ |
| 8 | total = the 8 buckets | 1.1501 + 5.6253 + 3.8706 + 1.2538 + 0.0800 + 0.0000 + 1.4280 + 1.0726 | 14.480343 | 14.480344 | ✓ |

### RUB_Grommet — United Kingdom — base rate book

Stamp: United Kingdom rate book v2.2.0 · rules v8 · kernel 374f8cebdccb · 3 Nov 2026. Currency GBP.

Answered: Which process makes this part? → Moulded or extruded rubber; Which rubber compound is this? → EPDM 70 Shore A.

Set by the rules from the measured part: Rubber Compound = EPDM 70 Shore A (UK) — £1.90/kg (engineer); Part Weight (kg) = 0.0126 (geometry); Thickness (mm) ⓘ = 6.4 (geometry); Process Route = Transfer Moulding (rule); Cure Time (sec) = 0 (rule); Cure Oven Machine = — none — (rule); Cycle Time (sec, 0=predict) ⓘ = 307 (advisor); Cavities = 32 (rule); Projected Area (cm²) = 5.7 (geometry); Flash + Sprue (kg) = 0.0004 (rule); Mould Steel = P20 (rule); Mould / Die Cost (£, 0=estimate) ⓘ = 25903 (advisor); ….

| Step | What | Arithmetic | Re-done | Printed | Holds |
|---|---|---|---|---|---|
| 2 | material bought: EPDM 70 Shore A | 0.0134 kg × 1.9/kg | 0.02546 | 0.025464 | ✓ |
| 2 | scrap credit | 0.0004 kg × 0.05/kg | -2e-05 | -2.1e-05 | ✓ |
| 2 | net raw material = bucket 1 | 0.025464 -2.1e-05 (scrap credit) +0 (process energy) | 0.025443 | 0.025443 | ✓ |
| 2 | bucket 1 on the summary | material sheet total | 0.025443 | 0.025443 | ✓ |
| 3 | Rubber Transfer Mould — machine | 20.40293/h × 0.087915 h ÷ 0.8 OEE ÷ 32 a cycle | 0.070067 | 0.070068 | ✓ |
| 3 | Rubber Transfer Mould — labour | 24.65/h × 0.087915 h × 0.5 crew ÷ 0.92 efficiency ÷ 32 a cycle | 0.036805 | 0.036806 | ✓ |
| 3 | Deflash / trim and visual check (bench) — labour | 24.65/h × 0.001432 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.038368 | 0.038364 | ✓ |
| 3 | Mould change + heat-up (1.5 h ÷ 5000 batch) — machine | 20.40293/h × 0.0003 h ÷ 1.0 OEE ÷ 1 a cycle | 0.006121 | 0.006121 | ✓ |
| 3 | Mould change + heat-up (1.5 h ÷ 5000 batch) — labour | 35.17/h × 0.0003 h × 1.0 crew ÷ 1.0 efficiency ÷ 1 a cycle | 0.010551 | 0.010551 | ✓ |
| 3 | operations = bucket 2 (process) | sum of machine £ | 0.076189 | 0.076188 | ✓ |
| 3 | operations = bucket 3 (labour) | sum of labour £ | 0.085721 | 0.085721 | ✓ |
| 4 | tooling over the programme (the programme: 5 years × 200,000 a year) | 25,903.00 ÷ 1,000,000 parts | 0.025903 | 0.025903 | ✓ |
| 5 | packaging (as printed) + logistics | 0.007 + 0 (ex-works) |  |  | ✓ |
| 6 | overhead 12.0% of material + process + labour + tooling | 0.12 × 0.213255 | 0.025591 | 0.025591 | ✓ |
| 7 | margin 8.0% of the subtotal | 0.08 × 0.245846 | 0.019668 | 0.019668 | ✓ |
| 8 | total = the 8 buckets | 0.0254 + 0.0762 + 0.0857 + 0.0259 + 0.0070 + 0.0000 + 0.0256 + 0.0197 | 0.265514 | 0.265514 | ✓ |

### Seat_Locking_Bracket — United Kingdom — base rate book

Stamp: United Kingdom rate book v2.2.0 · rules v8 · kernel 374f8cebdccb · 3 Nov 2026. Currency GBP.

Answered: What is this part made of? → Steel; Is the part coated or surface-treated? → not answered — the rules’ value (see the basis).

Set by the rules from the measured part: Thickness (mm) = 1.6 (geometry); Blank L (mm) = 299 (geometry); Blank W (mm) = 230 (geometry); Perimeter (mm) = 1929 (geometry); Press = 400T Mechanical Press (general press shop) — £38.19/hr (rule); Num. Ops = 8 (geometry); Press line ℹ = Coil-fed (one die) (geometry); Presses in line ℹ = 1 (rule); Blanking ℹ = In the die (coil-fed) (rule); Blanks/min = 0 (rule); Draw addendum (mm) ℹ = 10 (rule); Pitch (mm) = 233 (geometry); ….

| Step | What | Arithmetic | Re-done | Printed | Holds |
|---|---|---|---|---|---|
| 2 | material bought: DC04 (CR4 Deep-Drawing) | 0.8675 kg × 0.756/kg | 0.65583 | 0.655864 | ✓ |
| 2 | scrap credit | 0.301 kg × 0.20/kg | -0.0602 | -0.06021 | ✓ |
| 2 | net raw material = bucket 1 | 0.655864 -0.06021 (scrap credit) +0 (process energy) | 0.595654 | 0.595655 | ✓ |
| 2 | bucket 1 on the summary | material sheet total | 0.595655 | 0.595655 | ✓ |
| 3 | Press (progressive) — machine | 38.187857/h × 0.000846 h ÷ 0.85 OEE ÷ 1 a cycle | 0.038008 | 0.038009 | ✓ |
| 3 | Press (progressive) — labour | 24.65/h × 0.000846 h × 0.5 crew ÷ 0.95 efficiency ÷ 1 a cycle | 0.010976 | 0.010976 | ✓ |
| 3 | Die change (amortised over the batch) — machine | 38.187857/h × 0.0002 h ÷ 1.0 OEE ÷ 1 a cycle | 0.007638 | 0.007638 | ✓ |
| 3 | Die change (amortised over the batch) — labour | 35.17/h × 0.0002 h × 1.0 crew ÷ 1.0 efficiency ÷ 1 a cycle | 0.007034 | 0.007034 | ✓ |
| 3 | operations = bucket 2 (process) | sum of machine £ | 0.045647 | 0.045647 | ✓ |
| 3 | operations = bucket 3 (labour) | sum of labour £ | 0.01801 | 0.01801 | ✓ |
| 4 | tooling over the programme (the programme: 5 years × 200,000 a year) | 131,463.75 ÷ 1,000,000 parts | 0.131464 | 0.131464 | ✓ |
| 5 | packaging (as printed) + logistics | 0.07 + 0 (ex-works) |  |  | ✓ |
| 6 | overhead 12.0% of material + process + labour + tooling | 0.12 × 0.790776 | 0.094893 | 0.094893 | ✓ |
| 7 | margin 8.0% of the subtotal | 0.08 × 0.955669 | 0.076454 | 0.076453 | ✓ |
| 8 | total = the 8 buckets | 0.5957 + 0.0456 + 0.0180 + 0.1315 + 0.0700 + 0.0000 + 0.0949 + 0.0765 | 1.032122 | 1.032122 | ✓ |

### PRCR002 — United Kingdom — base rate book

Stamp: United Kingdom rate book v2.2.0 · rules v8 · kernel 374f8cebdccb · 3 Nov 2026. Currency GBP.

Answered: Which process makes this part? → Cast then machined; What is this part made of? → Cast iron; Is this part safety-critical or fatigue-loaded? → Yes — safety-critical; Does this part have to hold pressure or be leak-tight? → No — structural or cosmetic only; Is the part coated or surface-treated? → not answered — the rules’ value (see the basis); Which cast iron grade? → not answered — costed as EN-GJS-500-7 (Ductile Iron); What tolerance class does the drawing call for? → Standard.

Set by the rules from the measured part: Grade = EN-GJS-500-7 (Ductile Iron) — £0.29/kg (geometry); Casting Subtype = Sand (advisor); Casting Yield (0–1) = 0.625 (library); Core Cost/Part (£) = 3 (geometry); Finished Weight (kg) = 7.364 (geometry); Die Cost (£) = 11025 (advisor); Die Life (shots) = 16000 (library); Cycle Time (hr) = 0.0167 (geometry); Casting Labour = Foundry Operative (UK) — £24.60/hr (library); Fettling (bench min/part) ⓘ = 6 (rule); Heat Treatment (£/kg) ⓘ = 0 (rule); Shot Blast / Deburr (£/part) ⓘ = 0.752 (library); ….

| Step | What | Arithmetic | Re-done | Printed | Holds |
|---|---|---|---|---|---|
| 2 | material bought: EN-GJS-500-7 (Ductile Iron) | 9.261 kg × 0.293/kg | 2.713473 | 2.713472 | ✓ |
| 2 | net raw material = bucket 1 | 2.713472 +0 (scrap credit) +3.092784 (cores) +0.149839 (green-sand additions (14.98 kg poured × £0.01/kg, engineering-typical)) +0.752 (shot blast) +0.7673 (NDT) +2.8116 (cutting-tool wear) +1.690785 (process energy) | 11.97778 | 11.97778 | ✓ |
| 2 | bucket 1 on the summary | material sheet total | 11.97778 | 11.97778 | ✓ |
| 3 | Sand Casting — Moulding — machine | 29.895238/h × 0.017216 h ÷ 0.8 OEE ÷ 1 a cycle | 0.643346 | 0.643364 | ✓ |
| 3 | Sand Casting — Moulding — labour | 24.6/h × 0.017216 h × 4.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 1.841363 | 1.841416 | ✓ |
| 3 | Melt shop (charge, melt, treat, ladle) — 14.98 kg poured × 1.5 operator-h/t (engineering-typical) — labour | 24.6/h × 0.022476 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.600989 | 0.600985 | ✓ |
| 3 | Fettling (gate / riser removal, grind) — labour | 24.6/h × 0.103093 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 2.756617 | 2.756611 | ✓ |
| 3 | Machining Setup (amortised) — machine | 10.867708/h × 0.0003 h ÷ 1.0 OEE ÷ 1 a cycle | 0.00326 | 0.00326 | ✓ |
| 3 | Machining Setup (amortised) — labour | 27.95/h × 0.0003 h × 1.0 crew ÷ 1.0 efficiency ÷ 1 a cycle | 0.008385 | 0.008385 | ✓ |
| 3 | Finish machining — +Y side — machine | 10.867708/h × 0.0624 h ÷ 0.8 OEE ÷ 1 a cycle | 0.847681 | 0.847681 | ✓ |
| 3 | Finish machining — +Y side — labour | 27.95/h × 0.0624 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.94787 | 0.94787 | ✓ |
| 3 | Finish machining — +X side — machine | 10.867708/h × 0.0566 h ÷ 0.8 OEE ÷ 1 a cycle | 0.76889 | 0.76889 | ✓ |
| 3 | Finish machining — +X side — labour | 27.95/h × 0.0566 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.859766 | 0.859766 | ✓ |
| 3 | Finish machining — +Z side — machine | 10.867708/h × 0.0433 h ÷ 0.8 OEE ÷ 1 a cycle | 0.588215 | 0.588215 | ✓ |
| 3 | Finish machining — +Z side — labour | 27.95/h × 0.0433 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.657736 | 0.657736 | ✓ |
| 3 | Drilling — 12 holes — machine | 10.867708/h × 0.1328 h ÷ 0.8 OEE ÷ 1 a cycle | 1.80404 | 1.80404 | ✓ |
| 3 | Drilling — 12 holes — labour | 27.95/h × 0.1328 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 2.017261 | 2.017261 | ✓ |
| 3 | Finish boring — 10 cored bore(s) — machine | 10.867708/h × 0.107 h ÷ 0.8 OEE ÷ 1 a cycle | 1.453556 | 1.453556 | ✓ |
| 3 | Finish boring — 10 cored bore(s) — labour | 27.95/h × 0.107 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 1.625353 | 1.625353 | ✓ |
| 3 | Turning — spindle on the CNC lathe (journals, taper, shoulders) — machine | 7.786875/h × 0.0665 h ÷ 0.8 OEE ÷ 1 a cycle | 0.647284 | 0.647284 | ✓ |
| 3 | Turning — spindle on the CNC lathe (journals, taper, shoulders) — labour | 27.95/h × 0.0665 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 1.010149 | 1.010149 | ✓ |
| 3 | Load / clamp / unload — lathe fixture, 1 fixturing — machine | 7.786875/h × 0.02 h ÷ 0.8 OEE ÷ 1 a cycle | 0.194672 | 0.194672 | ✓ |
| 3 | Load / clamp / unload — lathe fixture, 1 fixturing — labour | 27.95/h × 0.02 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.607609 | 0.607609 | ✓ |
| 3 | Pallet change — 1 fixturing(s) — machine | 10.867708/h × 0.0028 h ÷ 0.8 OEE ÷ 1 a cycle | 0.038037 | 0.038037 | ✓ |
| 3 | Pallet change — 1 fixturing(s) — labour | 27.95/h × 0.0028 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.042533 | 0.042533 | ✓ |
| 3 | Deburr and gauge check (bench) — labour | 24.65/h × 0.041 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 1.098533 | 1.098533 | ✓ |
| 3 | operations = bucket 2 (process) | sum of machine £ | 6.988999 | 6.988999 | ✓ |
| 3 | operations = bucket 3 (labour) | sum of labour £ | 14.074207 | 14.074208 | ✓ |
| 4 | tooling over the programme (the programme: 5 years × 200,000 a year) | 731,491.00 ÷ 1,000,000 parts | 0.731491 | 0.731491 | ✓ |
| 5 | packaging (as printed) + logistics | 0.36 + 0 (ex-works) |  |  | ✓ |
| 6 | overhead 12.0% of material + process + labour + tooling | 0.12 × 33.772478 | 4.052697 | 4.052697 | ✓ |
| 7 | margin 8.0% of the subtotal | 0.08 × 38.185175 | 3.054814 | 3.054814 | ✓ |
| 8 | total = the 8 buckets | 11.9778 + 6.9890 + 14.0742 + 0.7315 + 0.3600 + 0.0000 + 4.0527 + 3.0548 | 41.239989 | 41.23999 | ✓ |

### TF_Trim_Cover — United Kingdom — base rate book

Stamp: United Kingdom rate book v2.2.0 · rules v8 · kernel 374f8cebdccb · 3 Nov 2026. Currency GBP.

Answered: Which process makes this part? → Thermoformed; Which resin is this moulded in? → ABS Thermoforming Sheet.

Set by the rules from the measured part: Grade = ABS Thermoforming Sheet — £1.94/kg (engineer); Method = Vacuum (rule); Sheet Thickness (mm) ℹ = 4.08 (geometry); Draw Depth (mm) = 47 (geometry); Min Opening (mm) = 200 (geometry); Part Weight (kg) ℹ = 0.2571 (geometry); Parts / Sheet = 4 (rule); Sheet Weight (kg) ℹ = 1.7481 (rule); Thermoformer = Thermoformer (Small/Single Station) — £12.40/hr (rule); Heat Time (s) = 101 (advisor); Cool Time (s) = 41 (advisor); Tool Cooling = Water-cooled tool (rule); ….

| Step | What | Arithmetic | Re-done | Printed | Holds |
|---|---|---|---|---|---|
| 2 | material bought: ABS Thermoforming Sheet | 0.4505 kg × 1.94/kg | 0.87397 | 0.87405 | ✓ |
| 2 | scrap credit | 0.1855 kg × 0.44/kg | -0.08162 | -0.081615 | ✓ |
| 2 | net raw material = bucket 1 | 0.87405 -0.081615 (scrap credit) +0.016482 (process energy) | 0.808917 | 0.808916 | ✓ |
| 2 | bucket 1 on the summary | material sheet total | 0.808916 | 0.808916 | ✓ |
| 3 | Thermoforming — machine | 12.396563/h × 0.046678 h ÷ 0.8 OEE ÷ 4 a cycle | 0.180827 | 0.180828 | ✓ |
| 3 | Thermoforming — labour | 23.07/h × 0.046678 h × 1.0 crew ÷ 0.92 efficiency ÷ 4 a cycle | 0.292625 | 0.292626 | ✓ |
| 3 | CNC Trim (5-axis router) — machine | 15.785938/h × 0.009164 h ÷ 0.8 OEE ÷ 1 a cycle | 0.180828 | 0.180824 | ✓ |
| 3 | CNC Trim (5-axis router) — labour | 23.07/h × 0.009164 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.229797 | 0.229792 | ✓ |
| 3 | operations = bucket 2 (process) | sum of machine £ | 0.361652 | 0.361652 | ✓ |
| 3 | operations = bucket 3 (labour) | sum of labour £ | 0.522418 | 0.522418 | ✓ |
| 4 | tooling over the programme (the programme: 5 years × 200,000 a year) | 23,293.00 ÷ 1,000,000 parts | 0.023293 | 0.023293 | ✓ |
| 5 | packaging (as printed) + logistics | 0.05 + 0 (ex-works) |  |  | ✓ |
| 6 | overhead 12.0% of material + process + labour + tooling | 0.12 × 1.716279 | 0.205953 | 0.205954 | ✓ |
| 7 | margin 8.0% of the subtotal | 0.08 × 1.972233 | 0.157779 | 0.157779 | ✓ |
| 8 | total = the 8 buckets | 0.8089 + 0.3617 + 0.5224 + 0.0233 + 0.0500 + 0.0000 + 0.2060 + 0.1578 | 2.130012 | 2.130011 | ✓ |

### AL_Battery_Rail — China (CN) — rates rebuilt for this country

Stamp: China rate book v2.2.0-CN · rules v8 · kernel 374f8cebdccb · 3 Nov 2026. Currency CNY.

Answered: Which process makes this part? → Aluminium extrusion; Which aluminium alloy? → EN AW-6063 (Al-Mg0.7Si); Which extrusion process? → not answered — the rules’ value (see the basis); Which temper? → not answered — the rules’ value (see the basis); Which finish? → not answered — the rules’ value (see the basis); Is the profile stretch-bent after extrusion? → not answered — the rules’ value (see the basis).

Set by the rules from the measured part: Alloy = EN AW-6063 (Al-Mg0.7Si) (engineer); Process = Direct (forward) hot extrusion (rule); Section area (mm²) ℹ = 1437.5 (geometry); Outline (mm) ℹ = 1135 (geometry); Circumscribing circle (mm) ℹ = 161.6 (geometry); Tongue ratio ℹ = 0 (geometry); Voids (chambers) ℹ = 4 (geometry); Thinnest wall (mm) ℹ = 2.5 (geometry); Cut length (mm) ℹ = 1800 (geometry); Finished part (kg) ℹ = 6.9863 (geometry); Temper = T6 (rule); Finish = Mill finish (rule); ….

| Step | What | Arithmetic | Re-done | Printed | Holds |
|---|---|---|---|---|---|
| 2 | material bought: EN AW-6063 (Al-Mg0.7Si) extrusion billet | 7.7284 kg × 21.51624/kg | 166.286109 | 166.285407 | ✓ |
| 2 | scrap credit | 0.7421 kg × 21.52/kg | -15.969992 | -15.967575 | ✓ |
| 2 | net raw material = bucket 1 | 166.285407 -15.967575 (scrap credit) +0.134002 (die nitriding) +1.051923 (process energy) | 151.503757 | 151.503756 | ✓ |
| 2 | bucket 1 on the summary | material sheet total | 151.503756 | 151.503756 | ✓ |
| 3 | Direct extrusion — press, quench, stretch, saw — machine | 1720.433428/h × 0.023413 h ÷ 0.78 OEE ÷ 15 a cycle | 3.442778 | 3.442734 | ✓ |
| 3 | Direct extrusion — press, quench, stretch, saw — labour | 31.669632/h × 0.023413 h × 4.0 crew ÷ 0.92 efficiency ÷ 15 a cycle | 0.214922 | 0.214919 | ✓ |
| 3 | Die change and press set-up (per run) — machine | 1720.433428/h × 3e-05 h ÷ 1.0 OEE ÷ 1 a cycle | 0.051613 | 0.051613 | ✓ |
| 3 | Die change and press set-up (per run) — labour | 31.669632/h × 3e-05 h × 4.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.004131 | 0.004131 | ✓ |
| 3 | Artificial ageing (6 h a load + 0.75 h load / unload, 8,000 kg a load — ESTIMATE) — machine | 170.051089/h × 6.887755 h ÷ 1.0 OEE ÷ 1145 a cycle | 1.022943 | 1.022943 | ✓ |
| 3 | Artificial ageing (6 h a load + 0.75 h load / unload, 8,000 kg a load — ESTIMATE) — labour | 31.669632/h × 0.765306 h × 1.0 crew ÷ 0.92 efficiency ÷ 1145 a cycle | 0.023008 | 0.023008 | ✓ |
| 3 | Precision cut-to-length and deburr (cold saw, end trims) — machine | 71.260038/h × 0.005278 h ÷ 0.78 OEE ÷ 1 a cycle | 0.482193 | 0.482173 | ✓ |
| 3 | Precision cut-to-length and deburr (cold saw, end trims) — labour | 31.669632/h × 0.005278 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.181687 | 0.18168 | ✓ |
| 3 | Inspect, interleave and pack (13.2 s — 6 s + 4 s a metre, engineering-typical, not sourced) — labour | 31.669632/h × 0.003741 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.128778 | 0.128795 | ✓ |
| 3 | operations = bucket 2 (process) | sum of machine £ | 4.999463 | 4.999463 | ✓ |
| 3 | operations = bucket 3 (labour) | sum of labour £ | 0.552533 | 0.552534 | ✓ |
| 4 | tooling over the programme (the programme: 5 years × 200,000 a year) | 7,342,185.46 ÷ 1,000,000 parts | 7.342185 | 7.342185 | ✓ |
| 5 | packaging (as printed) + logistics | 3.108 + 0 (ex-works) |  |  | ✓ |
| 6 | overhead 12.0% of material + process + labour + tooling | 0.12 × 164.397938 | 19.727753 | 19.727753 | ✓ |
| 7 | margin 8.0% of the subtotal | 0.08 × 187.233691 | 14.978695 | 14.978695 | ✓ |
| 8 | total = the 8 buckets | 151.5038 + 4.9995 + 0.5525 + 7.3422 + 3.1080 + 0.0000 + 19.7278 + 14.9787 | 202.212386 | 202.212387 | ✓ |

### BM_Air_Duct — China (CN) — rates rebuilt for this country

Stamp: China rate book v2.2.0-CN · rules v8 · kernel 374f8cebdccb · 3 Nov 2026. Currency CNY.

Answered: Which process makes this part? → Blow moulded; Which resin is this moulded in? → PP Blow Grade (MFI 1.0, random co-polymer); What is the nominal capacity of this container? → I know the exact capacity; What is the nominal capacity, in litres? → 2.5.

Set by the rules from the measured part: Wall Thickness (mm) ℹ = 1.99 (geometry); Grade = PP Blow Grade (MFI 1.0, random co-polymer) — ¥9.86/kg (engineer); Part Volume (L) ℹ = 2.5 (engineer); Part Weight (kg) = 0.2856 (geometry); Flash Weight (kg) ℹ = 0.0343 (rule); Flash Reground (0–1) ℹ = 1 (rule); Process Type = EBM — 2-Head (Bottles 1–5L) (rule); Cavities = 1 (rule); Blow Machine = EBM Blow Moulder (up to 5L) — ¥102.65/hr (advisor); Cool Factor (s/mm²) ℹ = 3.16 (rule); Blow Time (s) ℹ = 5 (rule); Open/Close (s) ℹ = 4.3 (rule); ….

| Step | What | Arithmetic | Re-done | Printed | Holds |
|---|---|---|---|---|---|
| 2 | material bought: PP Blow Grade (MFI 1.0, random co-polymer) | 0.2929 kg × 9.855024/kg | 2.886537 | 2.886764 | ✓ |
| 2 | net raw material = bucket 1 | 2.886764 +0 (scrap credit) +0 (process energy) | 2.886764 | 2.886764 | ✓ |
| 2 | bucket 1 on the summary | material sheet total | 2.886764 | 2.886764 | ✓ |
| 3 | Extrusion Blow Moulding — machine | 102.648722/h × 0.006215 h ÷ 0.8 OEE ÷ 1 a cycle | 0.797452 | 0.797425 | ✓ |
| 3 | Extrusion Blow Moulding — labour | 31.669632/h × 0.006215 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.106971 | 0.106967 | ✓ |
| 3 | Deflashing — machine | 53.798396/h × 0.006211 h ÷ 0.8 OEE ÷ 1 a cycle | 0.417677 | 0.417666 | ✓ |
| 3 | operations = bucket 2 (process) | sum of machine £ | 1.215091 | 1.215091 | ✓ |
| 3 | operations = bucket 3 (labour) | sum of labour £ | 0.106967 | 0.106967 | ✓ |
| 4 | tooling over the programme (the programme: 5 years × 200,000 a year) | 130,221.78 ÷ 1,000,000 parts | 0.130222 | 0.130222 | ✓ |
| 5 | packaging (as printed) + logistics | 0.7104 + 0 (ex-works) |  |  | ✓ |
| 6 | overhead 12.0% of material + process + labour + tooling | 0.12 × 4.339044 | 0.520685 | 0.520685 | ✓ |
| 7 | margin 8.0% of the subtotal | 0.08 × 5.570129 | 0.44561 | 0.44561 | ✓ |
| 8 | total = the 8 buckets | 2.8868 + 1.2151 + 0.1070 + 0.1302 + 0.7104 + 0.0000 + 0.5207 + 0.4456 | 6.015739 | 6.01574 | ✓ |

### Casting_Braket — China (CN) — rates rebuilt for this country

Stamp: China rate book v2.2.0-CN · rules v8 · kernel 374f8cebdccb · 3 Nov 2026. Currency CNY.

Answered: Which process makes this part? → Cast; What is this part made of? → Steel; Which steel grade? → not answered — costed as GS-C25 (Cast Carbon Steel); Does this part have to hold pressure or be leak-tight? → No — structural or cosmetic only; Is the part coated or surface-treated? → not answered — the rules’ value (see the basis); What tolerance class does the drawing call for? → Standard; Is this part safety-critical or fatigue-loaded? → No.

Set by the rules from the measured part: Grade = GS-C25 (Cast Carbon Steel) — ¥2.16/kg (geometry); Subtype = Sand (advisor); Casting Yield (0–1) ⓘ = 0.525 (library); Core Cost/Part (¥) ⓘ — material cost = 0.00 (geometry); Part Weight (kg) = 2.512 (geometry); Die Cost (¥) ⓘ = 27,093 (advisor); Die Life (shots) ⓘ — affects total die cost = 32000 (library); Cycle Time (hr) ⓘ = 0.0083 (geometry); Labour = Foundry Operative (China) — ¥31.67/hr (library); Fettling (bench min/part) ⓘ = 6 (rule); Heat Treat (¥/kg) ⓘ = 1.46 (library); Shot Blast (¥/part) ⓘ = 0.6474 (library); ….

| Step | What | Arithmetic | Re-done | Printed | Holds |
|---|---|---|---|---|---|
| 2 | material bought: GS-C25 (Cast Carbon Steel) | 2.5846 kg × 2.159616/kg | 5.581744 | 5.581792 | ✓ |
| 2 | net raw material = bucket 1 | 5.581792 +0 (scrap credit) +0.438028 (green-sand additions (4.93 kg poured × ¥0.09/kg, engineering-typical)) +3.67166 (heat treatment) +0.647352 (shot blast) +13.241856 (machining consumables) +2.176998 (process energy) | 25.757686 | 25.757685 | ✓ |
| 2 | bucket 1 on the summary | material sheet total | 25.757685 | 25.757685 | ✓ |
| 3 | Sand Casting — Moulding — machine | 127.386515/h × 0.008557 h ÷ 0.8 OEE ÷ 1 a cycle | 1.362558 | 1.36251 | ✓ |
| 3 | Sand Casting — Moulding — labour | 31.669632/h × 0.008557 h × 4.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 1.178248 | 1.178207 | ✓ |
| 3 | Melt shop (charge, melt, treat, ladle) — 4.93 kg poured × 1.5 operator-h/t (engineering-typical) — labour | 31.669632/h × 0.007399 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.2547 | 0.254704 | ✓ |
| 3 | Fettling (gate / riser removal, grind) — labour | 31.669632/h × 0.103093 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 3.548823 | 3.548816 | ✓ |
| 3 | CNC Machining — 18 features — machine | 55.655919/h × 0.207117 h ÷ 0.8 OEE ÷ 1 a cycle | 14.409109 | 14.409085 | ✓ |
| 3 | CNC Machining — 18 features — labour | 33.079776/h × 0.207117 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 3.723578 | 3.723572 | ✓ |
| 3 | Pallet change (1 fixturing(s) × 10 s) — machine | 55.655919/h × 0.002778 h ÷ 0.8 OEE ÷ 1 a cycle | 0.193265 | 0.19325 | ✓ |
| 3 | Machining change-over, amortised (1 fixturing(s) × 45 min ÷ batch 5000) — machine | 55.655919/h × 0.00015 h ÷ 1.0 OEE ÷ 1 a cycle | 0.008348 | 0.008348 | ✓ |
| 3 | Machining change-over, amortised (1 fixturing(s) × 45 min ÷ batch 5000) — labour | 33.079776/h × 0.00015 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.005393 | 0.005393 | ✓ |
| 3 | operations = bucket 2 (process) | sum of machine £ | 15.973193 | 15.973194 | ✓ |
| 3 | operations = bucket 3 (labour) | sum of labour £ | 8.710692 | 8.710692 | ✓ |
| 4 | tooling over the programme (the programme: 5 years × 200,000 a year) | 930,988.08 ÷ 1,000,000 parts | 0.930988 | 0.930988 | ✓ |
| 5 | packaging (as printed) + logistics | 1.332 + 0 (ex-works) |  |  | ✓ |
| 6 | overhead 12.0% of material + process + labour + tooling | 0.12 × 51.372559 | 6.164707 | 6.164707 | ✓ |
| 7 | margin 8.0% of the subtotal | 0.08 × 58.869266 | 4.709541 | 4.709541 | ✓ |
| 8 | total = the 8 buckets | 25.7577 + 15.9732 + 8.7107 + 0.9310 + 1.3320 + 0.0000 + 6.1647 + 4.7095 | 63.578807 | 63.578807 | ✓ |

### COMP_Hat_Stiffener — China (CN) — rates rebuilt for this country

Stamp: China rate book v2.2.0-CN · rules v8 · kernel 374f8cebdccb · 3 Nov 2026. Currency CNY.

Answered: Which process makes this part? → Composite laminate; Which fibre and resin system? → Carbon prepreg, autoclave.

Set by the rules from the measured part: Process = Prepreg Hand Layup (engineer); Fibre Price (¥/kg) = 298 (library); Resin Price (¥/kg) = 0.00 (library); Part Weight (kg) = 0.3028 (geometry); Fibre Weight Fraction = 0.65 (library); Waste Fraction = 0.15 (library); Plies = 10 (geometry); Area (m²) = 0.081 (geometry); Layup Time (hr/part) = 0.049 (rule); Cure Time (hr/cycle) = 3 (library); Mould / Mandrel Cost (¥) = 38,442 (rule); Tool Life (parts) = 500 (rule); ….

| Step | What | Arithmetic | Re-done | Printed | Holds |
|---|---|---|---|---|---|
| 2 | Prepreg Prepreg (fibre + resin) | 0.371078 × 298.3680 | 110.717801 | 110.717801 | ✓ |
| 2 | NDI Non-destructive inspection (C-scan / UT) per part | 1.041667 × 1.5069 | 1.569688 | 1.569726 | ✓ |
| 2 | direct material = its lines | 110.717801 + 1.569726 | 112.287527 | 112.287654 | ✓ |
| 2 | net raw material = bucket 1 | 112.287654 +0 (scrap credit) +0 (process energy) | 112.287654 | 112.287654 | ✓ |
| 2 | bucket 1 on the summary | material sheet total | 112.287654 | 112.287654 | ✓ |
| 3 | Prepreg Hand Layup — machine | 2.204501/h × 0.051042 h ÷ 0.8 OEE ÷ 1 a cycle | 0.140653 | 0.140652 | ✓ |
| 3 | Prepreg Hand Layup — labour | 33.079776/h × 0.051042 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 1.83528 | 1.835268 | ✓ |
| 3 | Cure (Autoclave) — machine | 160.909957/h × 0.15625 h ÷ 0.8 OEE ÷ 1 a cycle | 31.427726 | 31.427726 | ✓ |
| 3 | Cure (Autoclave) — labour | 31.669632/h × 0.039063 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 1.344686 | 1.344668 | ✓ |
| 3 | Trim, Drill & Finish — machine | 143.046111/h × 0.116667 h ÷ 0.8 OEE ÷ 1 a cycle | 20.860951 | 20.860891 | ✓ |
| 3 | Trim, Drill & Finish — labour | 31.669632/h × 0.116667 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 4.016088 | 4.016077 | ✓ |
| 3 | operations = bucket 2 (process) | sum of machine £ | 52.429269 | 52.429269 | ✓ |
| 3 | operations = bucket 3 (labour) | sum of labour £ | 7.196013 | 7.196013 | ✓ |
| 4 | tooling over the programme (the programme: 5 years × 200,000 a year) | 76,883,040.00 ÷ 1,000,000 parts | 76.88304 | 76.88304 | ✓ |
| 5 | packaging (as printed) + logistics | 0.6216 + 0 (ex-works) |  |  | ✓ |
| 6 | overhead 12.0% of material + process + labour + tooling | 0.12 × 248.795976 | 29.855517 | 29.855517 | ✓ |
| 7 | margin 8.0% of the subtotal | 0.08 × 279.273093 | 22.341847 | 22.341848 | ✓ |
| 8 | total = the 8 buckets | 112.2877 + 52.4293 + 7.1960 + 76.8830 + 0.6216 + 0.0000 + 29.8555 + 22.3418 | 301.614941 | 301.614941 | ✓ |

### IM_ECU_Cover — China (CN) — rates rebuilt for this country

Stamp: China rate book v2.2.0-CN · rules v8 · kernel 374f8cebdccb · 3 Nov 2026. Currency CNY.

Answered: Which process makes this part? → Injection moulded; Which resin is this moulded in? → PC/ABS Blend (automotive grade).

Set by the rules from the measured part: Wall Thickness (mm) = 2.5 (geometry); Projected Area (cm²) = 216.2 (geometry); Grade = PC/ABS Blend (automotive grade) — ¥17.05/kg (engineer); Part Weight (kg) = 0.1407 (geometry); Cavities = 2 (rule); Cavity Pressure (MPa) = 65 (rule); IMM Machine = 400T Injection Moulding Machine — ¥69.41/hr (advisor); Cool Factor (s/mm²) = 2.2 (rule); Fill Time (s) = 1.5 (rule); Pack Time (s) = 2 (rule); Eject Time (s) = 4.5 (rule); Runner Weight (kg) = 0.0422 (rule); ….

| Step | What | Arithmetic | Re-done | Printed | Holds |
|---|---|---|---|---|---|
| 2 | material bought: PC/ABS Blend (automotive grade) | 0.1489 kg × 17.0496/kg | 2.538685 | 2.538303 | ✓ |
| 2 | scrap credit | 0.0053 kg × 0.71/kg | -0.003763 | -0.003769 | ✓ |
| 2 | net raw material = bucket 1 | 2.538303 -0.003769 (scrap credit) +0.015614 (process energy) | 2.550148 | 2.550147 | ✓ |
| 2 | bucket 1 on the summary | material sheet total | 2.550147 | 2.550147 | ✓ |
| 3 | Injection Moulding — machine | 69.413542/h × 0.006165 h ÷ 0.85 OEE ÷ 2 a cycle | 0.251726 | 0.251725 | ✓ |
| 3 | Injection Moulding — labour | 31.669632/h × 0.006165 h × 0.5 crew ÷ 0.95 efficiency ÷ 2 a cycle | 0.05138 | 0.05138 | ✓ |
| 3 | Mould change (amortised over the batch) — machine | 69.413542/h × 0.0005 h ÷ 1.0 OEE ÷ 1 a cycle | 0.034707 | 0.034707 | ✓ |
| 3 | Mould change (amortised over the batch) — labour | 39.589704/h × 0.0005 h × 1.0 crew ÷ 1.0 efficiency ÷ 1 a cycle | 0.019795 | 0.019795 | ✓ |
| 3 | operations = bucket 2 (process) | sum of machine £ | 0.286432 | 0.286432 | ✓ |
| 3 | operations = bucket 3 (labour) | sum of labour £ | 0.071175 | 0.071174 | ✓ |
| 4 | tooling over the programme (the programme: 5 years × 200,000 a year) | 241,319.77 ÷ 1,000,000 parts | 0.24132 | 0.24132 | ✓ |
| 5 | packaging (as printed) + logistics | 0.5328 + 0 (ex-works) |  |  | ✓ |
| 6 | overhead 12.0% of material + process + labour + tooling | 0.12 × 3.149073 | 0.377889 | 0.377889 | ✓ |
| 7 | margin 8.0% of the subtotal | 0.08 × 4.059762 | 0.324781 | 0.324781 | ✓ |
| 8 | total = the 8 buckets | 2.5501 + 0.2864 + 0.0712 + 0.2413 + 0.5328 + 0.0000 + 0.3779 + 0.3248 | 4.384543 | 4.384543 | ✓ |

### EXT_Vent_Pipe — China (CN) — rates rebuilt for this country

Stamp: China rate book v2.2.0-CN · rules v8 · kernel 374f8cebdccb · 3 Nov 2026. Currency CNY.

Answered: Which process makes this part? → Extruded (polymer) and cut to length; Which polymer grade is this extruded in? → PE100 Pipe Grade (black, PE4710).

Set by the rules from the measured part: Grade = PE100 Pipe Grade (black, PE4710) — ¥9.50/kg (engineer); Process ℹ = Pipe (geometry); Part Length (m) = 1 (geometry); Profile kg/m ℹ = 0.2624 (geometry); Wall Thickness (mm) ℹ = 2.99 (geometry); Extruder / Line = Pipe Extrusion Line 90mm (SSE + vacuum tank + haul-off + saw) — ¥147.92/hr (rule); Screw Ø (mm) ℹ = 90 (rule); Cooling ℹ = Vacuum tank (rule); Line Rate (kg/hr) ℹ = 95 (advisor); Startup Scrap ℹ = 0.0054 (rule); Steady Scrap ℹ = 0.02 (rule); Colour changes/day ℹ = 0 (rule); ….

| Step | What | Arithmetic | Re-done | Printed | Holds |
|---|---|---|---|---|---|
| 2 | material bought: PE100 Pipe Grade (black, PE4710) | 0.2692 kg × 9.5016/kg | 2.557831 | 2.558198 | ✓ |
| 2 | scrap credit | 0.0068 kg × 0.85/kg | -0.00578 | -0.005819 | ✓ |
| 2 | net raw material = bucket 1 | 2.558198 -0.005819 (scrap credit) +0.071295 (process energy) | 2.623674 | 2.623674 | ✓ |
| 2 | bucket 1 on the summary | material sheet total | 2.623674 | 2.623674 | ✓ |
| 3 | Extrusion — machine | 147.917558/h × 0.002834 h ÷ 0.8 OEE ÷ 1 a cycle | 0.523998 | 0.524015 | ✓ |
| 3 | Extrusion — labour | 31.669632/h × 0.002834 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.048778 | 0.04878 | ✓ |
| 3 | Inspect and bundle (station 4 s, operator 6 s — engineering-typical, not sourced) — machine | 17.608286/h × 0.001111 h ÷ 0.8 OEE ÷ 1 a cycle | 0.024454 | 0.024456 | ✓ |
| 3 | Inspect and bundle (station 4 s, operator 6 s — engineering-typical, not sourced) — labour | 31.669632/h × 0.001667 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.057384 | 0.057373 | ✓ |
| 3 | operations = bucket 2 (process) | sum of machine £ | 0.548471 | 0.548471 | ✓ |
| 3 | operations = bucket 3 (labour) | sum of labour £ | 0.106153 | 0.106152 | ✓ |
| 4 | tooling over the programme (the programme: 5 years × 200,000 a year) | 22,715.04 ÷ 1,000,000 parts | 0.022715 | 0.022715 | ✓ |
| 5 | packaging (as printed) + logistics | 0.5328 + 0 (ex-works) |  |  | ✓ |
| 6 | overhead 12.0% of material + process + labour + tooling | 0.12 × 3.301012 | 0.396121 | 0.396121 | ✓ |
| 7 | margin 8.0% of the subtotal | 0.08 × 4.229933 | 0.338395 | 0.338395 | ✓ |
| 8 | total = the 8 buckets | 2.6237 + 0.5485 + 0.1062 + 0.0227 + 0.5328 + 0.0000 + 0.3961 + 0.3384 | 4.568328 | 4.568328 | ✓ |

### test-gear-m3-z38 — China (CN) — rates rebuilt for this country

Stamp: China rate book v2.2.0-CN · rules v8 · kernel 374f8cebdccb · 3 Nov 2026. Currency CNY.

Answered: Spur or helical — what is the helix angle? → Spur — 0°; ISO 1328 flank tolerance class? → Class 7 — finished automotive transmission; What is the gear cut from? → Case-hardening steel (20MnCr5 / 8620); Which hardening route does this gear take? → not answered — the rules’ value (see the basis).

Set by the rules from the measured part: Teeth (z) ℹ = 38 (geometry); Helix Angle β (°, 0 = spur) ℹ = 0 (engineer); Normal Module (mm) ℹ = 3 (geometry); Face Width (mm) = 30 (geometry); Internal (ring) Gear = No — external (edited) (geometry); ISO 1328 Class ℹ = Class 7 — finished automotive (engineer); Material Class ℹ = Case-hardening steel (20MnCr5 / 8620) (engineer); Effective Case Depth (mm) ℹ = 0.7 (library); Case Hardened ℹ = Yes — carburise + quench (edited) (rule); Material (grade) = 20MnCr5 (Gear Steel) (China) — ¥3.65/kg (library); Net Gear Weight (kg) ℹ = 2.088 (geometry); Blank Material (¥/part) ℹ = 11.72 (rule); ….

| Step | What | Arithmetic | Re-done | Printed | Holds |
|---|---|---|---|---|---|
| 2 | Blank Blank material per part (bar × ¥/kg − chips: the blank rule's basis) | 1.020408 × 11.7216 | 11.960814 | 11.960814 | ✓ |
| 2 | direct material = its lines | 11.960814 | 11.960814 | 11.960816 | ✓ |
| 2 | net raw material = bucket 1 | 11.960816 +0 (scrap credit) +1.303521 (¥0.6118/kg × 2.088 kg ÷ (1 − 2% reject)) +8.081651 (¥3.7935/kg × 2.088 kg ÷ (1 − 2% reject)) +1.303521 (¥0.6118/kg × 2.088 kg ÷ (1 − 2% reject)) +1.390273 (¥0.6527/kg × 2.088 kg ÷ (1 − 2% reject)) +0 (process energy) | 24.039782 | 24.039781 | ✓ |
| 2 | bucket 1 on the summary | material sheet total | 24.039781 | 24.039781 | ✓ |
| 3 | Blank turning (face, OD, bore) — machine | 19.067614/h × 0.053901 h ÷ 0.8 OEE ÷ 1 a cycle | 1.284704 | 1.284699 | ✓ |
| 3 | Blank turning (face, OD, bore) — labour | 33.079776/h × 0.053901 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.96904 | 0.969036 | ✓ |
| 3 | Gear hobbing — machine | 267.179593/h × 0.015779 h ÷ 0.8 OEE ÷ 1 a cycle | 5.269783 | 5.269837 | ✓ |
| 3 | Gear hobbing — labour | 33.079776/h × 0.015779 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.283677 | 0.28368 | ✓ |
| 3 | Chamfer and deburr — machine | 115.17549/h × 0.007132 h ÷ 0.8 OEE ÷ 1 a cycle | 1.026789 | 1.026801 | ✓ |
| 3 | Chamfer and deburr — labour | 31.669632/h × 0.007132 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.245508 | 0.245511 | ✓ |
| 3 | Gear grinding — machine | 625.257236/h × 0.0147 h ÷ 0.8 OEE ÷ 1 a cycle | 11.489102 | 11.489006 | ✓ |
| 3 | Gear grinding — labour | 33.079776/h × 0.0147 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.264279 | 0.264276 | ✓ |
| 3 | Gear inspection — machine | 258.12028/h × 0.005715 h ÷ 0.8 OEE ÷ 1 a cycle | 1.843947 | 1.843896 | ✓ |
| 3 | Gear inspection — labour | 30.819816/h × 0.005715 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.191451 | 0.191446 | ✓ |
| 3 | operations = bucket 2 (process) | sum of machine £ | 20.914239 | 20.914239 | ✓ |
| 3 | operations = bucket 3 (labour) | sum of labour £ | 1.953949 | 1.953949 | ✓ |
| 4 | tooling over the programme (the programme: 5 years × 200,000 a year) | 4,627,126.69 ÷ 1,000,000 parts | 4.627127 | 4.627127 | ✓ |
| 5 | packaging (as printed) + logistics | 1.1544 + 0 (ex-works) |  |  | ✓ |
| 6 | overhead 12.0% of material + process + labour + tooling | 0.12 × 51.535096 | 6.184212 | 6.184212 | ✓ |
| 7 | margin 8.0% of the subtotal | 0.08 × 58.873708 | 4.709897 | 4.709897 | ✓ |
| 8 | total = the 8 buckets | 24.0398 + 20.9142 + 1.9539 + 4.6271 + 1.1544 + 0.0000 + 6.1842 + 4.7099 | 63.583605 | 63.583605 | ✓ |

### FORGE_Hub_Flange — China (CN) — rates rebuilt for this country

Stamp: China rate book v2.2.0-CN · rules v8 · kernel 374f8cebdccb · 3 Nov 2026. Currency CNY.

Answered: Which process makes this part? → Forged; What tolerance class does the drawing call for? → Standard; Which steel grade? → not answered — costed as 38MnVS6 (Microalloyed); Is the part coated or surface-treated? → not answered — the rules’ value (see the basis); Is this part safety-critical or fatigue-loaded? → No.

Set by the rules from the measured part: Grade = 38MnVS6 (Microalloyed) — ¥4.36/kg (rule); Part Weight (kg) = 2.842 (geometry); Projected Area (cm²) ℹ = 116 (geometry); Shape Complexity ℹ = Simple (upset/block) (geometry); Yield Fraction (0–1) = 0.743 (library); Flash + Scale (kg) = 0.284 (rule); Forge Machine = 1600T Mechanical Forge Press — ¥420.31/hr (advisor); Strokes to Form = 2 (rule); Time/Blow (s) ℹ = 4 (rule); Cycle Time (hr) ℹ = 0.003056 (rule); Labour = Forge Operator / Hammer-man (China) — ¥31.67/hr (rule); Manning = 2 (rule); ….

| Step | What | Arithmetic | Re-done | Printed | Holds |
|---|---|---|---|---|---|
| 2 | material bought: 38MnVS6 (Microalloyed) | 4.2931 kg × 4.35564/kg | 18.699198 | 18.699331 | ✓ |
| 2 | scrap credit | 1.3931 kg × 0.76/kg | -1.058756 | -1.0553 | ✓ |
| 2 | net raw material = bucket 1 | 18.699331 -1.0553 (scrap credit) +1.073858 (descale) +12.069696 (machining tool wear and cell consumables) +0.947357 (process energy) | 31.734942 | 31.734942 | ✓ |
| 2 | bucket 1 on the summary | material sheet total | 31.734942 | 31.734942 | ✓ |
| 3 | Forging — machine | 420.312597/h × 0.003118 h ÷ 0.8 OEE ÷ 1 a cycle | 1.638168 | 1.638361 | ✓ |
| 3 | Forging — labour | 31.669632/h × 0.003118 h × 2.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.214665 | 0.21469 | ✓ |
| 3 | Flash Trimming — machine | 72.780682/h × 0.003118 h ÷ 0.8 OEE ÷ 1 a cycle | 0.283663 | 0.283696 | ✓ |
| 3 | Flash Trimming — labour | 31.669632/h × 0.003118 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.107333 | 0.107345 | ✓ |
| 3 | Turning — outside and faces on the CNC lathe, op 10 / op 20 — machine | 19.067614/h × 0.130333 h ÷ 0.8 OEE ÷ 1 a cycle | 3.106424 | 3.106432 | ✓ |
| 3 | Turning — outside and faces on the CNC lathe, op 10 / op 20 — labour | 33.079776/h × 0.130333 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 2.343145 | 2.343151 | ✓ |
| 3 | CNC Machining — 7 features — machine | 16.0491/h × 0.05845 h ÷ 0.8 OEE ÷ 1 a cycle | 1.172587 | 1.172587 | ✓ |
| 3 | CNC Machining — 7 features — labour | 33.079776/h × 0.05845 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 1.050822 | 1.050822 | ✓ |
| 3 | Machining load / unload + change-over (3 fixturing(s): 0.6 min each + 45 min ÷ batch 5000) — machine | 16.0491/h × 0.03045 h ÷ 0.8 OEE ÷ 1 a cycle | 0.610869 | 0.610869 | ✓ |
| 3 | Machining load / unload + change-over (3 fixturing(s): 0.6 min each + 45 min ÷ batch 5000) — labour | 33.079776/h × 0.03045 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 1.094869 | 1.094869 | ✓ |
| 3 | operations = bucket 2 (process) | sum of machine £ | 6.811945 | 6.811946 | ✓ |
| 3 | operations = bucket 3 (labour) | sum of labour £ | 4.810877 | 4.810877 | ✓ |
| 4 | tooling over the programme (the programme: 5 years × 200,000 a year) | 1,926,519.00 ÷ 1,000,000 parts | 1.926519 | 1.926519 | ✓ |
| 5 | packaging (as printed) + logistics | 1.5096 + 0 (ex-works) |  |  | ✓ |
| 6 | overhead 12.0% of material + process + labour + tooling | 0.12 × 45.284284 | 5.434114 | 5.434114 | ✓ |
| 7 | margin 8.0% of the subtotal | 0.08 × 52.227998 | 4.17824 | 4.17824 | ✓ |
| 8 | total = the 8 buckets | 31.7349 + 6.8119 + 4.8109 + 1.9265 + 1.5096 + 0.0000 + 5.4341 + 4.1782 | 56.406238 | 56.406237 | ✓ |

### steering_knuckle_RH — China (CN) — rates rebuilt for this country

Stamp: China rate book v2.2.0-CN · rules v8 · kernel 374f8cebdccb · 3 Nov 2026. Currency CNY.

Answered: Which process makes this part? → Forged; What is this part made of? → Steel; What tolerance class does the drawing call for? → Standard; Which steel grade? → not answered — costed as 38MnVS6 (Microalloyed); Is the part coated or surface-treated? → not answered — the rules’ value (see the basis); Is this part safety-critical or fatigue-loaded? → Yes — safety-critical.

Set by the rules from the measured part: Grade = 38MnVS6 (Microalloyed) — ¥4.36/kg (rule); Part Weight (kg) = 3.255 (geometry); Projected Area (cm²) ℹ = 129.6 (geometry); Shape Complexity ℹ = Moderate (impression) (geometry); Yield Fraction (0–1) = 0.743 (library); Flash + Scale (kg) = 0.326 (rule); Forge Machine = 1600T Mechanical Forge Press — ¥420.31/hr (advisor); Strokes to Form = 3 (rule); Time/Blow (s) ℹ = 4 (rule); Cycle Time (hr) ℹ = 0.004167 (rule); Labour = Forge Operator / Hammer-man (China) — ¥31.67/hr (rule); Manning = 2 (rule); ….

| Step | What | Arithmetic | Re-done | Printed | Holds |
|---|---|---|---|---|---|
| 2 | material bought: 38MnVS6 (Microalloyed) | 4.918 kg × 4.35564/kg | 21.421038 | 21.421082 | ✓ |
| 2 | scrap credit | 1.5966 kg × 0.76/kg | -1.213416 | -1.209415 | ✓ |
| 2 | net raw material = bucket 1 | 21.421082 -1.209415 (scrap credit) +1.229912 (descale) +0.909747 (NDT) +13.281816 (machining tool wear and cell consumables) +1.085247 (process energy) | 36.718389 | 36.71839 | ✓ |
| 2 | bucket 1 on the summary | material sheet total | 36.71839 | 36.71839 | ✓ |
| 3 | Forging — machine | 420.312597/h × 0.004252 h ÷ 0.8 OEE ÷ 1 a cycle | 2.233961 | 2.233983 | ✓ |
| 3 | Forging — labour | 31.669632/h × 0.004252 h × 2.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.292738 | 0.29274 | ✓ |
| 3 | Flash Trimming — machine | 72.780682/h × 0.004252 h ÷ 0.8 OEE ÷ 1 a cycle | 0.386829 | 0.386833 | ✓ |
| 3 | Flash Trimming — labour | 31.669632/h × 0.004252 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.146369 | 0.14637 | ✓ |
| 3 | CNC Machining — 20 features — machine | 55.655919/h × 0.207733 h ÷ 0.8 OEE ÷ 1 a cycle | 14.451964 | 14.451987 | ✓ |
| 3 | CNC Machining — 20 features — labour | 33.079776/h × 0.207733 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 3.734653 | 3.734659 | ✓ |
| 3 | Pallet change (1 fixturing(s) × 10 s) — machine | 55.655919/h × 0.002778 h ÷ 0.8 OEE ÷ 1 a cycle | 0.193265 | 0.19325 | ✓ |
| 3 | Machining change-over, amortised (1 fixturing(s) × 45 min ÷ batch 5000) — machine | 55.655919/h × 0.00015 h ÷ 1.0 OEE ÷ 1 a cycle | 0.008348 | 0.008348 | ✓ |
| 3 | Machining change-over, amortised (1 fixturing(s) × 45 min ÷ batch 5000) — labour | 33.079776/h × 0.00015 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.005393 | 0.005393 | ✓ |
| 3 | operations = bucket 2 (process) | sum of machine £ | 17.274401 | 17.274401 | ✓ |
| 3 | operations = bucket 3 (labour) | sum of labour £ | 4.179162 | 4.179163 | ✓ |
| 4 | tooling over the programme (the programme: 5 years × 200,000 a year) | 3,084,229.15 ÷ 1,000,000 parts | 3.084229 | 3.084229 | ✓ |
| 5 | packaging (as printed) + logistics | 1.6872 + 0 (ex-works) |  |  | ✓ |
| 6 | overhead 12.0% of material + process + labour + tooling | 0.12 × 61.256183 | 7.350742 | 7.350742 | ✓ |
| 7 | margin 8.0% of the subtotal | 0.08 × 70.294125 | 5.62353 | 5.62353 | ✓ |
| 8 | total = the 8 buckets | 36.7184 + 17.2744 + 4.1792 + 3.0842 + 1.6872 + 0.0000 + 7.3507 + 5.6235 | 75.917655 | 75.917654 | ✓ |

### MACH_Hydraulic_Manifold — China (CN) — rates rebuilt for this country

Stamp: China rate book v2.2.0-CN · rules v8 · kernel 374f8cebdccb · 3 Nov 2026. Currency CNY.

Answered: Which process makes this part? → Machined from solid; What is this part made of? → Aluminium.

Set by the rules from the measured part: Material = 6082-T6 Aluminium Bar (China) — ¥30.99/kg (engineer); Net Weight (kg) = 1.312 (geometry); Stock Weight (kg) = 1.909 (geometry); Mat. Util. (0=auto) = 0.6871 (geometry); Setup Time (hr) = 3 (rule); Batch Size = 5000 (rule); Setup Machine = HAAS VF-2 (3-axis Mill) — ¥21.30/hr (advisor); Reject Rate (0=none) ⓘ = 0.02 (rule); Tooling Cost (¥) = 30,334 (rule); Programming NRE (¥) = 915 (rule); Cutting Tool Wear (¥/part) ⓘ = 6.84 (rule).

| Step | What | Arithmetic | Re-done | Printed | Holds |
|---|---|---|---|---|---|
| 2 | material bought: 6082-T6 Aluminium Bar | 1.9484 kg × 30.9912/kg | 60.383254 | 60.384601 | ✓ |
| 2 | scrap credit | 0.6097 kg × 4.80/kg | -2.92656 | -2.92348 | ✓ |
| 2 | net raw material = bucket 1 | 60.384601 -2.92348 (scrap credit) +6.98258 (tool wear (inserts, end mills, drills)) +0 (process energy) | 64.443701 | 64.443701 | ✓ |
| 2 | bucket 1 on the summary | material sheet total | 64.443701 | 64.443701 | ✓ |
| 3 | Setup (amortised) — machine | 21.300227/h × 0.0006 h ÷ 1.0 OEE ÷ 1 a cycle | 0.01278 | 0.01278 | ✓ |
| 3 | Setup (amortised) — labour | 33.079776/h × 0.0006 h × 1.0 crew ÷ 1.0 efficiency ÷ 1 a cycle | 0.019848 | 0.019848 | ✓ |
| 3 | Milling — +X (17 faces) — machine | 21.300227/h × 0.103265 h ÷ 0.8 OEE ÷ 1 a cycle | 2.74946 | 2.749468 | ✓ |
| 3 | Milling — +X (17 faces) — labour | 33.079776/h × 0.103265 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 1.856513 | 1.856518 | ✓ |
| 3 | Milling — +Z (12 faces) — machine | 21.300227/h × 0.072959 h ÷ 0.8 OEE ÷ 1 a cycle | 1.942554 | 1.942559 | ✓ |
| 3 | Milling — +Z (12 faces) — labour | 33.079776/h × 0.072959 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 1.311667 | 1.31167 | ✓ |
| 3 | Milling — +Y (8 faces) — machine | 21.300227/h × 0.048571 h ÷ 0.8 OEE ÷ 1 a cycle | 1.293217 | 1.293228 | ✓ |
| 3 | Milling — +Y (8 faces) — labour | 33.079776/h × 0.048571 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.873216 | 0.873224 | ✓ |
| 3 | Drilling — 13 holes — machine | 16.0491/h × 0.102857 h ÷ 0.8 OEE ÷ 1 a cycle | 2.063453 | 2.063456 | ✓ |
| 3 | Drilling — 13 holes — labour | 33.079776/h × 0.102857 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 1.849177 | 1.84918 | ✓ |
| 3 | Load / clamp / unload — 4 fixturing(s) — machine | 21.300227/h × 0.040816 h ÷ 0.8 OEE ÷ 1 a cycle | 1.086738 | 1.086746 | ✓ |
| 3 | Load / clamp / unload — 4 fixturing(s) — labour | 33.079776/h × 0.040816 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 1.467591 | 1.467603 | ✓ |
| 3 | Deburr and gauge check (bench) — labour | 31.669632/h × 0.019592 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.674425 | 0.67442 | ✓ |
| 3 | operations = bucket 2 (process) | sum of machine £ | 9.148237 | 9.148237 | ✓ |
| 3 | operations = bucket 3 (labour) | sum of labour £ | 8.052463 | 8.052463 | ✓ |
| 4 | tooling over the programme (the programme: 5 years × 200,000 a year) | 31,248.72 ÷ 1,000,000 parts | 0.031249 | 0.031249 | ✓ |
| 5 | packaging (as printed) + logistics | 0.888 + 0 (ex-works) |  |  | ✓ |
| 6 | overhead 12.0% of material + process + labour + tooling | 0.12 × 81.675650 | 9.801078 | 9.801078 | ✓ |
| 7 | margin 8.0% of the subtotal | 0.08 × 92.364728 | 7.389178 | 7.389178 | ✓ |
| 8 | total = the 8 buckets | 64.4437 + 9.1482 + 8.0525 + 0.0312 + 0.8880 + 0.0000 + 9.8011 + 7.3892 | 99.753906 | 99.753907 | ✓ |

### ROTO_Header_Tank — China (CN) — rates rebuilt for this country

Stamp: China rate book v2.2.0-CN · rules v8 · kernel 374f8cebdccb · 3 Nov 2026. Currency CNY.

Answered: Which process makes this part? → Rotomoulded; Which resin is this moulded in? → LLDPE Roto Powder (natural).

Set by the rules from the measured part: Material ℹ = LLDPE Roto Powder (natural) (China) — ¥11.63/kg (engineer); Material Family ℹ = PE (LLDPE/HDPE) (rule); Wall Thickness (mm) ℹ = 3.99 (geometry); Part Weight (kg) ℹ = 0.6425 (geometry); Heating Time (s) ℹ = 1078 (advisor); Cooling Time (s) ℹ = 1455 (advisor); Cooling Method ℹ = Forced air (rule); No. of Arms ℹ = 4 (rule); Parts / Arm = 4 (geometry); Projected Area (cm²) ℹ = 382.4 (geometry); Mould Type ℹ = CNC aluminium (rule); Mould Cost (¥) ℹ = 36,896 (advisor); ….

| Step | What | Arithmetic | Re-done | Printed | Holds |
|---|---|---|---|---|---|
| 2 | material bought: LLDPE Roto Powder (natural) | 0.6691 kg × 11.633688/kg | 7.784101 | 7.783656 | ✓ |
| 2 | scrap credit | 0.0067 kg × 0.87/kg | -0.005829 | -0.005825 | ✓ |
| 2 | net raw material = bucket 1 | 7.783656 -0.005825 (scrap credit) +0.515702 (Consumables & services) +0 (process energy) | 8.293533 | 8.293533 | ✓ |
| 2 | bucket 1 on the summary | material sheet total | 8.293533 | 8.293533 | ✓ |
| 3 | Rotational Moulding — machine | 235.382673/h × 0.308706 h ÷ 0.8 OEE ÷ 4 a cycle | 22.707514 | 22.707485 | ✓ |
| 3 | Rotational Moulding — labour | 31.669632/h × 0.308706 h × 2.0 crew ÷ 0.92 efficiency ÷ 4 a cycle | 5.313373 | 5.313366 | ✓ |
| 3 | operations = bucket 2 (process) | sum of machine £ | 22.707485 | 22.707485 | ✓ |
| 3 | operations = bucket 3 (labour) | sum of labour £ | 5.313366 | 5.313366 | ✓ |
| 4 | tooling over the programme (the programme: 5 years × 200,000 a year) | 3,803,752.58 ÷ 1,000,000 parts | 3.803753 | 3.803753 | ✓ |
| 5 | packaging (as printed) + logistics | 0.7104 + 0 (ex-works) |  |  | ✓ |
| 6 | overhead 12.0% of material + process + labour + tooling | 0.12 × 40.118137 | 4.814176 | 4.814176 | ✓ |
| 7 | margin 8.0% of the subtotal | 0.08 × 45.642713 | 3.651417 | 3.651417 | ✓ |
| 8 | total = the 8 buckets | 8.2935 + 22.7075 + 5.3134 + 3.8038 + 0.7104 + 0.0000 + 4.8142 + 3.6514 | 49.29413 | 49.29413 | ✓ |

### RUB_Grommet — China (CN) — rates rebuilt for this country

Stamp: China rate book v2.2.0-CN · rules v8 · kernel 374f8cebdccb · 3 Nov 2026. Currency CNY.

Answered: Which process makes this part? → Moulded or extruded rubber; Which rubber compound is this? → EPDM 70 Shore A.

Set by the rules from the measured part: Rubber Compound = EPDM 70 Shore A (China) — ¥16.87/kg (engineer); Part Weight (kg) = 0.0126 (geometry); Thickness (mm) ⓘ = 6.4 (geometry); Process Route = Transfer Moulding (rule); Cure Time (sec) = 0 (rule); Cure Oven Machine = — none — (rule); Cycle Time (sec, 0=predict) ⓘ = 307 (advisor); Cavities = 32 (rule); Projected Area (cm²) = 5.7 (geometry); Flash + Sprue (kg) = 0.0004 (rule); Mould Steel = P20 (rule); Mould / Die Cost (¥, 0=estimate) ⓘ = 78,570 (advisor); ….

| Step | What | Arithmetic | Re-done | Printed | Holds |
|---|---|---|---|---|---|
| 2 | material bought: EPDM 70 Shore A | 0.0134 kg × 16.872/kg | 0.226085 | 0.22612 | ✓ |
| 2 | scrap credit | 0.0004 kg × 0.44/kg | -0.000176 | -0.000183 | ✓ |
| 2 | net raw material = bucket 1 | 0.22612 -0.000183 (scrap credit) +0 (process energy) | 0.225937 | 0.225936 | ✓ |
| 2 | bucket 1 on the summary | material sheet total | 0.225936 | 0.225936 | ✓ |
| 3 | Rubber Transfer Mould — machine | 93.829643/h × 0.087915 h ÷ 0.8 OEE ÷ 32 a cycle | 0.322228 | 0.322229 | ✓ |
| 3 | Rubber Transfer Mould — labour | 31.669632/h × 0.087915 h × 0.5 crew ÷ 0.92 efficiency ÷ 32 a cycle | 0.047287 | 0.047287 | ✓ |
| 3 | Deflash / trim and visual check (bench) — labour | 31.669632/h × 0.001432 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.049294 | 0.049289 | ✓ |
| 3 | Mould change + heat-up (1.5 h ÷ 5000 batch) — machine | 93.829643/h × 0.0003 h ÷ 1.0 OEE ÷ 1 a cycle | 0.028149 | 0.028149 | ✓ |
| 3 | Mould change + heat-up (1.5 h ÷ 5000 batch) — labour | 39.589704/h × 0.0003 h × 1.0 crew ÷ 1.0 efficiency ÷ 1 a cycle | 0.011877 | 0.011877 | ✓ |
| 3 | operations = bucket 2 (process) | sum of machine £ | 0.350378 | 0.350378 | ✓ |
| 3 | operations = bucket 3 (labour) | sum of labour £ | 0.108453 | 0.108453 | ✓ |
| 4 | tooling over the programme (the programme: 5 years × 200,000 a year) | 78,570.24 ÷ 1,000,000 parts | 0.07857 | 0.07857 | ✓ |
| 5 | packaging (as printed) + logistics | 0.06216 + 0 (ex-works) |  |  | ✓ |
| 6 | overhead 12.0% of material + process + labour + tooling | 0.12 × 0.763337 | 0.0916 | 0.0916 | ✓ |
| 7 | margin 8.0% of the subtotal | 0.08 × 0.917097 | 0.073368 | 0.073368 | ✓ |
| 8 | total = the 8 buckets | 0.2259 + 0.3504 + 0.1085 + 0.0786 + 0.0622 + 0.0000 + 0.0916 + 0.0734 | 0.990465 | 0.990465 | ✓ |

### Seat_Locking_Bracket — China (CN) — rates rebuilt for this country

Stamp: China rate book v2.2.0-CN · rules v8 · kernel 374f8cebdccb · 3 Nov 2026. Currency CNY.

Answered: What is this part made of? → Steel; Is the part coated or surface-treated? → not answered — the rules’ value (see the basis).

Set by the rules from the measured part: Thickness (mm) = 1.6 (geometry); Blank L (mm) = 299 (geometry); Blank W (mm) = 230 (geometry); Perimeter (mm) = 1929 (geometry); Press = 400T Mechanical Press (general press shop) — ¥187.09/hr (rule); Num. Ops = 8 (geometry); Press line ℹ = Coil-fed (one die) (geometry); Presses in line ℹ = 1 (rule); Blanking ℹ = In the die (coil-fed) (rule); Blanks/min = 0 (rule); Draw addendum (mm) ℹ = 10 (rule); Pitch (mm) = 233 (geometry); ….

| Step | What | Arithmetic | Re-done | Printed | Holds |
|---|---|---|---|---|---|
| 2 | material bought: DC04 (CR4 Deep-Drawing) | 0.8675 kg × 3.195024/kg | 2.771683 | 2.771828 | ✓ |
| 2 | scrap credit | 0.301 kg × 0.85/kg | -0.25585 | -0.254459 | ✓ |
| 2 | net raw material = bucket 1 | 2.771828 -0.254459 (scrap credit) +0 (process energy) | 2.517369 | 2.517369 | ✓ |
| 2 | bucket 1 on the summary | material sheet total | 2.517369 | 2.517369 | ✓ |
| 3 | Press (progressive) — machine | 187.086506/h × 0.000846 h ÷ 0.85 OEE ÷ 1 a cycle | 0.186206 | 0.186211 | ✓ |
| 3 | Press (progressive) — labour | 31.669632/h × 0.000846 h × 0.5 crew ÷ 0.95 efficiency ÷ 1 a cycle | 0.014101 | 0.014102 | ✓ |
| 3 | Die change (amortised over the batch) — machine | 187.086506/h × 0.0002 h ÷ 1.0 OEE ÷ 1 a cycle | 0.037417 | 0.037417 | ✓ |
| 3 | Die change (amortised over the batch) — labour | 39.589704/h × 0.0002 h × 1.0 crew ÷ 1.0 efficiency ÷ 1 a cycle | 0.007918 | 0.007918 | ✓ |
| 3 | operations = bucket 2 (process) | sum of machine £ | 0.223628 | 0.223629 | ✓ |
| 3 | operations = bucket 3 (labour) | sum of labour £ | 0.02202 | 0.02202 | ✓ |
| 4 | tooling over the programme (the programme: 5 years × 200,000 a year) | 481,617.90 ÷ 1,000,000 parts | 0.481618 | 0.481618 | ✓ |
| 5 | packaging (as printed) + logistics | 0.6216 + 0 (ex-works) |  |  | ✓ |
| 6 | overhead 12.0% of material + process + labour + tooling | 0.12 × 3.244636 | 0.389356 | 0.389356 | ✓ |
| 7 | margin 8.0% of the subtotal | 0.08 × 4.255592 | 0.340447 | 0.340447 | ✓ |
| 8 | total = the 8 buckets | 2.5174 + 0.2236 + 0.0220 + 0.4816 + 0.6216 + 0.0000 + 0.3894 + 0.3404 | 4.596039 | 4.596039 | ✓ |

### PRCR002 — China (CN) — rates rebuilt for this country

Stamp: China rate book v2.2.0-CN · rules v8 · kernel 374f8cebdccb · 3 Nov 2026. Currency CNY.

Answered: Which process makes this part? → Cast then machined; What is this part made of? → Cast iron; Is this part safety-critical or fatigue-loaded? → Yes — safety-critical; Does this part have to hold pressure or be leak-tight? → No — structural or cosmetic only; Is the part coated or surface-treated? → not answered — the rules’ value (see the basis); Which cast iron grade? → not answered — costed as EN-GJS-500-7 (Ductile Iron); What tolerance class does the drawing call for? → Standard.

Set by the rules from the measured part: Grade = EN-GJS-500-7 (Ductile Iron) — ¥2.67/kg (geometry); Casting Subtype = Sand (advisor); Casting Yield (0–1) = 0.625 (library); Core Cost/Part (¥) = 14.47 (geometry); Finished Weight (kg) = 7.364 (geometry); Die Cost (¥) = 36,852 (advisor); Die Life (shots) = 16000 (library); Cycle Time (hr) = 0.0167 (geometry); Casting Labour = Foundry Operative (China) — ¥31.67/hr (library); Fettling (bench min/part) ⓘ = 6 (rule); Heat Treatment (¥/kg) ⓘ = 0.00 (rule); Shot Blast / Deburr (¥/part) ⓘ = 2.34 (library); ….

| Step | What | Arithmetic | Re-done | Printed | Holds |
|---|---|---|---|---|---|
| 2 | material bought: EN-GJS-500-7 (Ductile Iron) | 9.261 kg × 2.670216/kg | 24.72887 | 24.728864 | ✓ |
| 2 | net raw material = bucket 1 | 24.728864 +0 (scrap credit) +14.915654 (cores) +1.330572 (green-sand additions (14.98 kg poured × ¥0.09/kg, engineering-typical)) +2.341656 (shot blast) +1.190808 (NDT) +24.967008 (cutting-tool wear) +5.857177 (process energy) | 75.331739 | 75.331739 | ✓ |
| 2 | bucket 1 on the summary | material sheet total | 75.331739 | 75.331739 | ✓ |
| 3 | Sand Casting — Moulding — machine | 127.386515/h × 0.017216 h ÷ 0.8 OEE ÷ 1 a cycle | 2.741358 | 2.741437 | ✓ |
| 3 | Sand Casting — Moulding — labour | 31.669632/h × 0.017216 h × 4.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 2.370541 | 2.370609 | ✓ |
| 3 | Melt shop (charge, melt, treat, ladle) — 14.98 kg poured × 1.5 operator-h/t (engineering-typical) — labour | 31.669632/h × 0.022476 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.773703 | 0.773699 | ✓ |
| 3 | Fettling (gate / riser removal, grind) — labour | 31.669632/h × 0.103093 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 3.548823 | 3.548816 | ✓ |
| 3 | Machining Setup (amortised) — machine | 21.300227/h × 0.00075 h ÷ 1.0 OEE ÷ 1 a cycle | 0.015975 | 0.015975 | ✓ |
| 3 | Machining Setup (amortised) — labour | 33.079776/h × 0.00075 h × 1.0 crew ÷ 1.0 efficiency ÷ 1 a cycle | 0.02481 | 0.02481 | ✓ |
| 3 | Finish machining — +Y side — machine | 21.300227/h × 0.0624 h ÷ 0.8 OEE ÷ 1 a cycle | 1.661418 | 1.661418 | ✓ |
| 3 | Finish machining — +Y side — labour | 33.079776/h × 0.0624 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 1.121836 | 1.121836 | ✓ |
| 3 | Finish machining — +X side — machine | 21.300227/h × 0.0566 h ÷ 0.8 OEE ÷ 1 a cycle | 1.506991 | 1.506991 | ✓ |
| 3 | Finish machining — +X side — labour | 33.079776/h × 0.0566 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 1.017563 | 1.017563 | ✓ |
| 3 | Finish machining — +Z side — machine | 21.300227/h × 0.0433 h ÷ 0.8 OEE ÷ 1 a cycle | 1.152875 | 1.152875 | ✓ |
| 3 | Finish machining — +Z side — labour | 33.079776/h × 0.0433 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.778453 | 0.778453 | ✓ |
| 3 | Drilling — 12 holes — machine | 16.0491/h × 0.1328 h ÷ 0.8 OEE ÷ 1 a cycle | 2.664151 | 2.664151 | ✓ |
| 3 | Drilling — 12 holes — labour | 33.079776/h × 0.1328 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 2.387497 | 2.387497 | ✓ |
| 3 | Finish boring — 10 cored bore(s) — machine | 21.300227/h × 0.107 h ÷ 0.8 OEE ÷ 1 a cycle | 2.848905 | 2.848905 | ✓ |
| 3 | Finish boring — 10 cored bore(s) — labour | 33.079776/h × 0.107 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 1.923661 | 1.923661 | ✓ |
| 3 | Turning — spindle on the CNC lathe (journals, taper, shoulders) — machine | 19.067614/h × 0.0665 h ÷ 0.8 OEE ÷ 1 a cycle | 1.584995 | 1.584995 | ✓ |
| 3 | Turning — spindle on the CNC lathe (journals, taper, shoulders) — labour | 33.079776/h × 0.0665 h × 0.5 crew ÷ 0.92 efficiency ÷ 1 a cycle | 1.195546 | 1.195546 | ✓ |
| 3 | Load / clamp / unload — lathe fixture, 1 fixturing — machine | 19.067614/h × 0.02 h ÷ 0.8 OEE ÷ 1 a cycle | 0.47669 | 0.47669 | ✓ |
| 3 | Load / clamp / unload — lathe fixture, 1 fixturing — labour | 33.079776/h × 0.02 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.719126 | 0.719126 | ✓ |
| 3 | Load / clamp / unload — 4 fixturing(s) — machine | 21.300227/h × 0.08 h ÷ 0.8 OEE ÷ 1 a cycle | 2.130023 | 2.130023 | ✓ |
| 3 | Load / clamp / unload — 4 fixturing(s) — labour | 33.079776/h × 0.08 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 2.876502 | 2.876502 | ✓ |
| 3 | Deburr and gauge check (bench) — labour | 31.669632/h × 0.041 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 1.411364 | 1.411364 | ✓ |
| 3 | operations = bucket 2 (process) | sum of machine £ | 16.78346 | 16.78346 | ✓ |
| 3 | operations = bucket 3 (labour) | sum of labour £ | 20.149482 | 20.149481 | ✓ |
| 4 | tooling over the programme (the programme: 5 years × 200,000 a year) | 2,434,833.84 ÷ 1,000,000 parts | 2.434834 | 2.434834 | ✓ |
| 5 | packaging (as printed) + logistics | 3.1968 + 0 (ex-works) |  |  | ✓ |
| 6 | overhead 12.0% of material + process + labour + tooling | 0.12 × 114.699514 | 13.763942 | 13.763942 | ✓ |
| 7 | margin 8.0% of the subtotal | 0.08 × 131.660256 | 10.53282 | 10.53282 | ✓ |
| 8 | total = the 8 buckets | 75.3317 + 16.7835 + 20.1495 + 2.4348 + 3.1968 + 0.0000 + 13.7639 + 10.5328 | 142.193076 | 142.193075 | ✓ |

### TF_Trim_Cover — China (CN) — rates rebuilt for this country

Stamp: China rate book v2.2.0-CN · rules v8 · kernel 374f8cebdccb · 3 Nov 2026. Currency CNY.

Answered: Which process makes this part? → Thermoformed; Which resin is this moulded in? → ABS Thermoforming Sheet.

Set by the rules from the measured part: Grade = ABS Thermoforming Sheet — ¥14.56/kg (engineer); Method = Vacuum (rule); Sheet Thickness (mm) ℹ = 4.08 (geometry); Draw Depth (mm) = 47 (geometry); Min Opening (mm) = 200 (geometry); Part Weight (kg) ℹ = 0.2571 (geometry); Parts / Sheet = 4 (rule); Sheet Weight (kg) ℹ = 1.7481 (rule); Thermoformer = Thermoformer (Small/Single Station) — ¥59.48/hr (rule); Heat Time (s) = 101 (advisor); Cool Time (s) = 41 (advisor); Tool Cooling = Water-cooled tool (rule); ….

| Step | What | Arithmetic | Re-done | Printed | Holds |
|---|---|---|---|---|---|
| 2 | material bought: ABS Thermoforming Sheet | 0.4505 kg × 14.5632/kg | 6.560722 | 6.561322 | ✓ |
| 2 | scrap credit | 0.1855 kg × 3.30/kg | -0.61215 | -0.612671 | ✓ |
| 2 | net raw material = bucket 1 | 6.561322 -0.612671 (scrap credit) +0.057096 (process energy) | 6.005747 | 6.005746 | ✓ |
| 2 | bucket 1 on the summary | material sheet total | 6.005746 | 6.005746 | ✓ |
| 3 | Thermoforming — machine | 59.478551/h × 0.046678 h ÷ 0.8 OEE ÷ 4 a cycle | 0.867606 | 0.867608 | ✓ |
| 3 | Thermoforming — labour | 31.669632/h × 0.046678 h × 1.0 crew ÷ 0.92 efficiency ÷ 4 a cycle | 0.401705 | 0.401706 | ✓ |
| 3 | CNC Trim (5-axis router) — machine | 79.229403/h × 0.009164 h ÷ 0.8 OEE ÷ 1 a cycle | 0.907573 | 0.907553 | ✓ |
| 3 | CNC Trim (5-axis router) — labour | 31.669632/h × 0.009164 h × 1.0 crew ÷ 0.92 efficiency ÷ 1 a cycle | 0.315457 | 0.31545 | ✓ |
| 3 | operations = bucket 2 (process) | sum of machine £ | 1.775161 | 1.775162 | ✓ |
| 3 | operations = bucket 3 (labour) | sum of labour £ | 0.717156 | 0.717157 | ✓ |
| 4 | tooling over the programme (the programme: 5 years × 200,000 a year) | 70,658.16 ÷ 1,000,000 parts | 0.070658 | 0.070658 | ✓ |
| 5 | packaging (as printed) + logistics | 0.444 + 0 (ex-works) |  |  | ✓ |
| 6 | overhead 12.0% of material + process + labour + tooling | 0.12 × 8.568723 | 1.028247 | 1.028247 | ✓ |
| 7 | margin 8.0% of the subtotal | 0.08 × 10.040970 | 0.803278 | 0.803278 | ✓ |
| 8 | total = the 8 buckets | 6.0057 + 1.7752 + 0.7172 + 0.0707 + 0.4440 + 0.0000 + 1.0282 + 0.8033 | 10.844248 | 10.844247 | ✓ |
