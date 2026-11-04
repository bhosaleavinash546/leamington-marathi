# Phase-B research: cast-steel charge, China billet and scrap, HSLA sheet, forge saw and heater, forging draft (4 Nov 2026)

This round is research only. It answers five weak inputs from the independent CAD-to-COST review (UK, 200k/yr, 5 yr,
EXW): issue 34 (cast-steel charge), issue 36 (seat bracket grade), issue 37 (forge saw, heater and draft), and the China
battery rail's billet premium and scrap price. It does not touch the engine or any rate book. Every proposal in §2 is a
proposal: rates move only through the generators and a dated config (`scripts/uk-book.ts`, `scripts/country-book.ts`,
`scripts/rate-refresh/*/build-config.py`).

- **Data.** `data.json` holds 38 rows, in the same shape as `../2026-11-review-round/data.json`. Each row has:
  - the value, currency, year and unit;
  - what the figure includes;
  - the URL read, the date and an exact quote;
  - `evidence_grade`, `readMethod` and, where it is money, `gbp_at_book_fx`.
- **Grades.**
  - A = a published price, award, official statistic or standard.
  - B = trade press, a price agency or an analyst.
  - C = a vendor claim or a dealer asking price.
  - D = our inference.

  Where a figure is A but our *reading* of it is D (for example, an award whose machine size is not stated), the row says so.
- **FX.** `gbp_at_book_fx` uses the FX given for this round: £1 = €1.1965 = US$1.3344 = ¥8.88. Nothing is escalated.
  Note that the previous round used US$1.3317.
- **How pages were read.**
  - Plain `curl` (with `--compressed` where the server gzips), with no user-agent change.
  - The publishers' own public APIs, with no key: HMRC uktradeinfo OData, Eurostat Comext, USAspending, UK Contracts
    Finder REST, TED Search v3 and the Internet Archive metadata API.
  - Quotes were text-searched in what came back.
  - For API rows the "quote" is the returned values. For the IS 3469 tables the quote was read off the rendered page
    image and checked against the OCR text.
  - Blocked pages are listed in §4. None was bypassed.

The effects in §2 use the UK 200k / 5 yr EXW exports of the review run (`scratchpad/c2c/exports/uk200k/UK/*.xlsx`,
`cn200k/…/battery-rail-al-extrusion.xlsx`). Overhead (12 %) and margin (8 %) give an O&M multiplier of
1.12 × 1.08 = **1.2096**.

## 1. Findings

### 1.1 UK cast-steel metal charge (review issue 34)

**The book's input is the wrong step in the chain.** letsrecycle says its prices are what processors pay
"merchants and local collectors" (S2). So the book's 0A £142.5/t is a merchant *buying* price. A foundry is a
*consumer*: it buys processed, graded scrap, delivered. The published consumer-side levels are:

| Row | What | Value | £/kg at book FX | Grade |
|---|---|---|---|---|
| S1 | letsrecycle 0A plate & girder, Oct 2026 (book anchor, July mid-point £142.5) | £120–150/t | 0.135 | A as a merchant price |
| S3 | **UK exports of HMS (7204 49 90), Jan–Aug 2026**, FOB: export parity a UK consumer must match | £0.292/kg non-EU, £0.280 EU (2025: £0.259 / 0.269) | **0.292** | A |
| S4 | UK exports of new-production bundles (7204 41 91), Jan–Aug 2026 | £0.343/kg | 0.343 | A |
| S5 | Intra-EU imports of HMS, 2025 (DE €0.283, CZ €0.306) | €0.288/kg | 0.241 | A |
| S6 | Germany BDSV, May 2026: E3 heavy old €305.2/t; E2/E8 new steel €319.0/t | €305–319/t | 0.255–0.267 | B |
| S7 | Notional EAF model, Oct 2026: scrap US$314/t | US$314/t | 0.235 | B |

**Additions per tonne of liquid steel.**

- **Ferroalloys** (A prices; the consumption is our sizing from the EN 10213 analysis in C1):

  | Addition | Price (UK import, 2026) | Consumption | £/t liquid steel |
  |---|---|---|---|
  | FeMn HC (F1) | £0.87–0.94/kg | +0.3 % Mn: about 4.4 kg | ≈ 4 |
  | FeSi (F2) | £0.92–1.24/kg | +0.2–0.3 % Si: about 5 kg | ≈ 5.5 |
  | Al deoxidiser (S8: 0.1–0.2 %; F4: £1.73–2.28/kg) | about £2/kg | 1–2 kg | 2–4 |

  **Total for carbon steel (GS-C25 / WCB): ≈ £11–14/t = £0.011–0.014/kg.** The EAF model's ferroalloy line is
  US$29.58/t = £22.2/t (S7), so the range used is **£0.012–0.022/kg**.
- **Low-alloy grades** (our sizing at A prices):
  - G17CrMo5-5 (Cr 1.25 %, Mo 0.55 %, C1): about 20 kg HC FeCr × £0.95 = £19/t, plus about 8.3 kg FeMo × £26.10 =
    £215/t. That is **≈ +£0.23/kg over carbon steel** (F3).
  - G20Mn5 (Mn 1.0–1.6 %): about +£10/t.
  - Check the book's "grade premium (Cr–Mo content)" against these figures. They were not compared this round.
- **Selling-price ceiling (P5, PRODCOM 2024).** Steel castings for land vehicles sell at €2.30/kg (FR) and €3.34/kg (CZ).
  The bracket's £9.14 is a cast-and-machined part. The as-cast half is not split out here.
- **No public "metal cost per tonne of steel castings"** and no CAEF, CMF or BIR price table was found (§3).

### 1.2 China aluminium billet premium and extrusion scrap

**Billet fee.** The book's ¥0.045/kg is real (Mysteel, Foshan, 18 Sep 2026), but it was a cyclical low:

| Row | Date | What | Value |
|---|---|---|---|
| AL3 | Aug 2026 | Foshan Φ120 fee | ¥180 → ¥90/t, low ¥30/t; "clearly below the industry's average production cost line" |
| AL4 | Jan 2026 | Casthouse billet cost (SMM) | "200–300 yuan/mt" |
| AL1 | 27 Oct 2026 | Foshan fee | Φ90 ¥320/t, Φ120 / Φ178 ¥270/t; A00 Foshan ¥23,880/t |
| AL2 | 29 Oct 2026 | Fee by region | Foshan ¥330–380/t; Wuxi ¥210–360/t; Nanchang ¥320–400/t |

So a through-cycle fee is **¥300/t incl. VAT = ¥0.265/kg ex-VAT**. The book has ¥0.045/kg. These SMM spot quotes are
VAT-inclusive by Chinese convention, as the China book's own research records for SMM A00 / A356 (D).

**The book's negative premium is not an error in itself.** The −US$21/t is the ex-VAT A00 (¥21.47) converted at
¥6.684/$ against the library LME of $3,240. China's ex-VAT spot sits at or slightly below LME.

**Scrap.** The book credits extrusion scrap at the billet price (¥21.5162/kg). The published prices sit below it:

| Row | What | Value | Basis |
|---|---|---|---|
| AL5 | Clean new 6063 scrap (6063 白料新料), Mysteel, 28–30 Oct 2026 | ¥20,400–20,800/t; Guangdong ¥20,600 on 2 Nov | Quoted as "现款不开票自提价": cash, no VAT invoice, buyer collects |
| AL6 | ScrapMonster, 3 Aug 2026 | ¥21,550/t | Basis not stated |
| AL7 | Remelt (recycled) 6063 billet, 21 Oct 2026 | ¥23,500–23,700/t against A00 ¥23,530 | Value if scrap is tolled back to billet, less the remelt fee |

- Against A00 Foshan **ex-VAT** (¥21,133/t on 27 Oct), the scrap is **97.7 % of A00** if the cash price is read as
  VAT-free, which is how the no-invoice cash quote reads (about −US$73/t).
- If the scrap price is read as VAT-inclusive (÷1.13 = ¥18.27/kg), it is **86.5 %** (about −US$430/t).
- The usual A00 − 6063 new scrap spread on quoted prices is about **¥3,200/t** (13.5 %).

### 1.3 Sheet-steel grades for stamping (review issue 36)

**HSLA extras over deep-drawing quality, from published producer price books (A):**

| Row | Price book | DDS (≈ DC04) | HSLA 345 MPa (≈ HC340LA) | Extra over DDS | HSLA 60 ksi (≈ HC420LA) |
|---|---|---|---|---|---|
| SH1 | U.S. Steel, CR, effective 08/02/2026 | $1.50/cwt = $33/t | HSLA-S $2.75 / HSLA-F $3.25 per cwt | **+$27.6 to +$38.6/t = £0.021–0.029/kg** | "Inquire" |
| SH2 | Stelco, CR, July 2024 (currency stated as Canadian or US$) | $1.50/cwt | HSLA 50: $4.25 | **+$60.6/t = £0.045/kg** | $5.50, i.e. +$88.2/t = £0.066/kg over DDS |

**The library's HSLA premium is 7–15 times the published extra.** The book is a ladder on its own old premium:

| Library grade | Book price | Premium over DC04 (£0.756) |
|---|---|---|
| `mat-hsla340` | £1.071/kg | +£0.315/kg (+42 %) |
| `mat-hsla420` | £1.161/kg | +£0.405/kg |

On the published extras, HSLA 340 would be about **£0.78–0.80/kg** and HSLA 420 about **£0.80–0.82/kg**. These are
North American extras: no UK or EU HSLA extra list, MEPS figure or Chinese HC340LA price was readable (§4). In China,
only the base CR is published: 1.0 mm ¥3,738/t incl. VAT (SH3, = £0.373/kg ex-VAT).

**Grades actually used** (C/B):

- Seat reinforcement brackets 2.0–2.5 mm are **S420MC** (hot-rolled micro-alloyed HSLA). Rear seat panels are
  **HC420LA / HC460LA** (thyssenkrupp, SH4).
- ArcelorMittal's seat study uses HSLA, DP and CP for side members, gussets and brackets (SH5).
- B-pillars in the WorldAutoSteel concept are TRIP690 (SH6); production B-pillars are AHSS or press-hardened.
- **No source recommends a deep-drawing mild grade (DC04) for a seat structural or locking bracket.**

### 1.4 Forging billet saw and induction heater (review issue 37)

**Induction heater.**

- **Throughput and power.** SMS Elotherm states about 500 kW heats up to 1,250 kg/h of steel billets of Ø51 mm or less
  to 1,250 °C (FG1, C). That is 0.40 kWh/kg, which agrees with the 0.35 kWh/kg the knuckle trace already charges as
  energy.
- **The knuckle's demand.** The press runs 235 parts/h nominal (188/h at OEE 0.8) on a 5.08 kg billet. That is
  0.96–1.2 t/h, so **one 500 kW heater**.
- **Capex.**
  - A used Inductoforge line derated to 250 kW, with conveyors, PLC and pyrometer: **US$175,000** asking (FG2, C).
  - A US DLA award to Inter-Power (a forge-heater maker), size unread: **US$285,840** (2017) (FG3, A value / D scope).
  - **No new list price or award with a stated kW was found.** A new 500 kW heater line is therefore an ESTIMATE of
    **£250–400k**.
- **Crew.** None was published. An in-line heater is fed by the press crew: **0 extra crew (D)**.

**Billet cut-off saw.**

- **Capex.**
  - A new Tsune automatic cold saw, DLA 2019: **US$161,400** (model truncated) (FG4, A / D).
  - Used Tsune TK5C-160GL (Ø30–160 mm, 2015): US$64,500. Used TK160GL: US$76,500 (FG5, C).
  - A UK workshop automatic band saw: £58,500 (FG6, lower bound).
  - Estimate **£80–160k** for a production carbide saw for Ø40–100 mm bar.
- **Throughput.** No published cut time for Ø70 was found. Assumed about 400 cuts/h (D).
- **Crew.** Assumed 0.5 operator (D).
- **Cold billet shear.** No price or award was found (§3).

### 1.5 Forging draft and machining allowances (review issue 37)

DIN 7523-2 is **withdrawn**: DIN points to EN 10243-1/-2, which give tolerances, not drafts (D4). Both are paywalled.
The public substitute is **IS 3469 (Part I):1974** (A, published by Public.Resource.Org), read from the page image.

- **Draft angles (Table 1.4, drop and press forgings).**

  | Surface | Depth from the parting plane | Normal | Close |
  |---|---|---|---|
  | Outside | up to 25 mm | 5–7° | 3–5° |
  | Outside | above 25 mm | 5–10° | 3–7° |
  | Inside | up to 25 mm | 7–10° | 5–8° |
  | Inside | above 25 mm | 8–12° | 5–9° |

  Draft "should increase with the increase of the perpendicular distance of the forging from the parting plane"
  (D1). A forger's guide gives 3° external and 5° internal on a crank press (D3, C). That is the "close" end, and it
  matches the 3° the tool's forging DFM uses.
- **Minimum finish stock per surface (Table 1.5), by greatest dimension.**

  | Greatest dimension | Minimum finish stock per surface |
  |---|---|
  | up to 205 mm | 1.5 mm |
  | 205–410 mm | 2.5 mm (a knuckle) |
  | 410–610 mm | 3.0 mm |
  | 610–915 mm | 4.0 mm |
  | over 915 mm | 5.0 mm |

  Upset forgings: 1.5 / 2.5 / 3.0 mm (D2).
- **The draft metal.** No published worked figure was found. Geometry gives a wedge on each face parallel to the draw:
  **V = Σ Aᵢ · hᵢ · tan α / 2**, where Aᵢ is the face's area and hᵢ its depth from the parting plane (D, exact for a
  plane face).
  - Illustration (D): 20,000 mm² of 0°-draft faces at a mean depth of 30 mm, at 7°, gives 36.8 cm³ = **0.29 kg = 8.4 %
    of the knuckle's 3.43 kg**.
  - The kernel already measures what this needs (the release table at the chosen draw: 37 zero-draft faces and their
    areas), so the figure can be computed per part.

## 2. Proposals: how each item enters the model, and the £ effect

| # | Proposal | Enters through | Part | Effect (after O&M ×1.2096) | Basis |
|---|---|---|---|---|---|
| 1 | **Cast-steel charge = (delivered consumer scrap + Mn/Si/Al trim) ÷ 0.96.**<br>• Scrap: £0.28/kg central (UK HMS export parity £0.29 S3; German E3 / E2-E8 £0.255–0.267 S6; range £0.25–0.30).<br>• Trim: £0.018/kg (range £0.012–0.022).<br>• Charge: **£0.310/kg** (range £0.273–0.335), against £0.148.<br>• Low-alloy grades: add the Cr / Mo / Mn content priced at F3 (G17CrMo5-5 ≈ +£0.23/kg).<br>Label the scrap as "UK HMS export unit value (HMRC) — consumer parity", not the letsrecycle merchant price. | `scripts/rate-refresh/2026-10-uk.json`, family "Cast carbon / low-alloy steel (charge)": anchor 0.1479 → 0.310 and `anchorBasis` rewritten. This is written by `uk-2026-10/build-config.py` (the `WCB` constant, line 76) from a new research item `ferrous.charge.GS-C25_WCB`, then by `scripts/uk-book.ts`. Re-run the India generator afterwards (CLAUDE.md). | Casting bracket (3.127 kg charged) | (0.310 − 0.148) × 3.127 = +£0.51 → **+£0.61**: £9.14 → **≈ £9.75** (range +£0.47 to +£0.71) | S3–S8, F1–F4 (A/B); the trim sizing is D |
| 1b | Apply the same consumer-parity reading to the ductile-iron charge, which also uses the 0A merchant price for its 50 % scrap share. Afterwards check that steel ≥ iron per charged kg. | the same config, `GJS` family | stub axle and other iron parts | not costed this round (iron out of scope) | S3 |
| 2a | **China billet fee ¥0.045 → ¥0.265/kg ex-VAT** (¥300/t incl. VAT: the October range ¥270–380, inside SMM's cost line of ¥200–300). Keep the September A00 basis. | `china-2026-10/research/materials-nonferrous.json` item `nonferrous.al.billet6063_premium` → `build-config.py` line 243 → `scripts/country-book.ts` writes `BILLET_PREMIUM_USD_PER_T.CN` (−US$21 → about +US$12/t) | China battery rail (7.728 kg gross) | +¥0.22 × 7.728 = +¥1.70 gross. If the scrap stays tied to the billet price: net **+¥1.86** after O&M | AL1–AL4 (B) |
| 2b | **China extrusion-scrap recovery at the clean-6063 scrap quote, not the billet price.** Add a per-region scrap differential, because `SCRAP_DIFF_6XXX_USD` (+US$56, Fastmarkets Europe) is per alloy today and has no region. China 6063 new clean scrap = ¥20.65/kg cash ≈ A00 ex-VAT − ¥0.48/kg (about −US$73/t against same-day A00; about −US$137/t against the library LME). State the VAT reading. | `al-extrusion-data.ts` needs a region key on the scrap differential (code change: a proposal, not done), fed by a new research item in the China config | China battery rail (0.742 kg scrap) | Credit −¥0.64 → with 2a, **+¥2.84: ¥202.21 → ≈ ¥205.05 (≈ £23.09, +£0.32)**. With the VAT-inclusive reading (¥18.27/kg): +¥4.97 → ¥207.18 (+£0.56) | AL5–AL7 (B/C) |
| 3a | **Seat-bracket grade default: HSLA, not DC04**, when the name or the safety answer says seat / locking / reinforcement (S420MC or HC420LA). | the sheet-metal grade rule (`derive/grade.ts` lean on name and safety evidence) | Seat bracket (0.8675 kg gross) | **Depends on 3b.** At today's book HSLA 340 (£1.071): +£0.273 → **+£0.33, £1.03 → £1.36**. At the published extra: **+£0.02–0.05, £1.05–1.08** | SH4, SH5 (C) |
| 3b | **Re-price `mat-hsla340` / `mat-hsla420` as DC04 base + the published extra** (+£0.021–0.045/kg for 340, +£0.066/kg for 420), labelled "North American producer extras (U.S. Steel 08/2026, Stelco 07/2024) — no European list found". | `uk-2026-10/build-config.py`, family "CR automotive grades" (the ladder on the book's old £0.84 base): change the method from ladder to anchor + extra | every HSLA stamping | HSLA 340 £1.071 → about £0.78–0.80/kg (−25 %) | SH1, SH2 (A; the transfer to the UK is D) |
| 4 | **Forge line: add the induction heater and billet saw as machines**, and the saw kerf as metal.<br>• Heater `forge-induction-500kw`: capex ESTIMATE £250–400k (FG1–FG3), 10 yr, book convention; in line at the press takt; 0 crew.<br>• Saw `forge-billet-saw`: capex £80–160k (FG4–FG6); 400 cuts/h; 0.5 operator; 3 mm kerf.<br>Both should be labelled ESTIMATE until a quote arrives. | UK book machines through the UK generator (`machines.added`, as done for `mach-hmc-400`); forging rules (`forgeLine`) add the two ops; `RULE_PATH_MAP` for headless | Steering knuckle | Heater £0.08–0.13 + saw machine £0.01–0.02 + saw labour £0.03 + kerf 0.09 kg × (£1.15 − £0.20) = £0.09 → £0.21–0.27 before O&M, **+£0.25–0.33 after: £17.12 → ≈ £17.4** | FG1–FG6 (A value / C / D) |
| 5 | **Forging draft metal as a measured rule.**<br>• V = Σ A·h·tan α / 2 on the zero-draft faces of the release table, at the IS 3469 normal angles: outside 5–7°, inside 7–10° (or the "close" 3° / 5° when the press is a crank press; state which).<br>• Add V × ρ to the as-forged weight.<br>• Check the measured machining stock against the Table 1.5 minimum (2.5 mm a surface at 205–410 mm). | `cost-input-rules/commodities/forging.ts` (`partWeightKg` build-up) + kernel release table; DFM finding unchanged | Steering knuckle | Illustrative (D): +0.29 kg → +£0.46 before O&M, **≈ +£0.56** (range about +£0.3–0.6 for 4–8 % of mass) → with item 4, **£17.12 → ≈ £17.7–18.1** | D1–D4 (A); the illustration is D |

**Net.**

| Part | Now | After the proposals | Change | Items |
|---|---|---|---|---|
| Casting bracket | £9.14 | about £9.75 | +6.7 % | 1 |
| Steering knuckle | £17.12 | about £17.7–18.1 | +3–6 % | 4 + 5 |
| Seat bracket | £1.03 | £1.05–1.08 | +2–5 % | 3a + 3b. 3a alone at the current book price would take it to £1.36, which the published extras do not support |
| China battery rail | ¥202.21 (≈ £22.77) | about ¥205.1 (≈ £23.09) | +1.4 % | 2a + 2b. The VAT-inclusive scrap reading gives ¥207.2 |

These are before the other open items: the bracket's 5 uncosted pockets, the knuckle's undercut, and the foundry
indirects of the previous round.

## 3. Gaps that only a supplier quote (or a paid index) settles

1. **A UK steel foundry's delivered scrap price and its charge mix.** For example, the share of new-production bundles
   against HMS, any pig iron, and returns. Fastmarkets' "delivered consumer UK" series (MB-STE-0432 / 0077) and Argus's
   HMS delivered UK dock are paywalled. The consumer level above is inferred from export parity and German BDSV.
2. **Ferroalloy consumption actually used per tonne** for GS-C25 / WCB, the recoveries, and the foundry's bagged-alloy
   price. The rows are bulk border values.
3. **The book's Cr–Mo grade premium** has not been checked against F3. It needs one pass of the UK config.
4. **New 500 kW induction billet-heater price** (Inductotherm / Inductoheat, EFD, Ajax Tocco, SMS Elotherm, Pillar).
   No list price or award with a stated kW was found. Also its maintenance and coil-change cost.
5. **A production billet saw or cold shear for Ø40–100 mm**: new price, cut time on 38MnVS6 and blade cost per cut.
   No cold-shear price was found at all.
6. **A UK or EU HSLA extras list** (ArcelorMittal, Tata, thyssenkrupp, voestalpine) and a Chinese HC340LA / DC04
   price (Baosteel list extras). Only North American books are public. MEPS UK prices are paywalled.
7. **The VAT and invoice basis of Chinese scrap**, and whether the extruder remelts its own scrap, tolls it, or sells
   it. This decides between −US$73 and −US$430/t.
8. **Forging draft and allowance for the knuckle itself**: the forger's die design (parting line, drafts, flash,
   stock). The IS 3469 table is the 1974 general standard, and EN 10243-1 grade E / F tolerances add on top.

## 4. Search record (blocked or empty)

- **Blocked to plain requests (HTTP 403), not bypassed:**
  - fastmarkets.com (UK delivered-consumer scrap pages);
  - lvdingjia.com (China 6063 scrap);
  - engineersedge.com (forging design);
  - tatasteeluk.com (seating);
  - equipt.com (Amada CMB-150 listing);
  - globalspec datasheets (Inductoforge);
  - eBay (an Ajax Pacer-II 500 kW listing, so its price is not used).
- **Not read because of a TLS error:** rose-hulman.edu (lecture notes; self-signed chain). TLS verification was not
  disabled.
- **Paywalled after a teaser:** SteelOrbis German scrap June–October 2026; only the April and May tables are public.
- **Empty or off-scope:**
  - USAspending "billet heater" returned 0. Its "induction heating system" search kept failing.
  - TED full text for Induktionserwärmungsanlage, induction heater, Blockerwärmung, Kreissägeautomat and nagrzewnica
    indukcyjna found only laboratory or workshop buys.
  - Contracts Finder "induction heater": one EFD adhesive-curing system (£58,193, Warwick 2015, wrong class) and no
    forge heater.
- **Standards:** DIN 7523-2 (withdrawn) and EN 10243-1 are paywalled. ASTM A216 was not read; EN 10213 via roymech was
  used.
- **Not found:**
  - CAEF / CMF / BIR price tables;
  - a published "metal cost per tonne of steel castings";
  - a WorldAutoSteel seat case study;
  - a worked "draft adds X %" figure.
