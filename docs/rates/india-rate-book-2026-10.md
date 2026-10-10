# India rate book: labour, machine, material and energy rates rebuilt for India (10 October 2026)

**Request:** a Director found mismatches and errors in the India labour and machine-hour rates. The ask was to research
and correct every India rate (raw materials, labour, machines, energy), with push-back where the existing data is
right.

**Basis:**
- An average of the four main manufacturing clusters: Pune, Chennai, Bengaluru and Delhi NCR.
- 3-shift working.
- October 2026 rates, ex-GST, in INR (held in £ at the book's FX of £1 = ₹127.2).

**Branch:** `claude/new-session-ts4byp`. Commits: `f45b883` (research + config), `4715163` (engine + India book), `3a3ad5c`.

**Tags:**
- **Verified:** reproduced by a run or a test.
- **Likely:** strong evidence, not reproduced.
- **Unverified:** not checked.

## 1. What was wrong (Verified)

India had no data of its own. Every India rate was the UK book × a few factors from one table (`REGIONAL_DATA.IN`):

| Area | How it was built | What that gave |
|---|---|---|
| Labour | 8 roles, one £/h each, aged by a wage-increment estimate | Skilled machinist **₹654/h**, engineer **₹1,537/h**, foundry operative ₹384/h. Indian evidence: **₹162, ₹254, ₹130** |
| Machines | UK build-up, with depreciation, maintenance, floor, indirect and finance each × 0.52; UK hours (2 shifts) | VMC **₹3,419/h** machine only. Its depreciation implied a **~₹3.7 crore** machine; a domestic VMC is **₹34.6 lakh** (Jyoti CNC). Indian job shops charge **₹250–1,500/h including the operator** |
| Materials | UK £/kg × one factor per family (steel and iron ×0.89, resins ×0.86–0.975) | See below |
| Energy | One flat tariff | ₹8.78/kWh electricity, ₹3.82/kWh gas. These turned out to be about right |

Errors the research found inside the book itself:
- **Inverted sheet grades:** DC01 sheet (₹103) was priced above the deeper-drawing DC04 (₹87).
- **One grade, two prices:** 4140 / 42CrMo4 was in the book at ₹137 and at ₹182.
- **Below metal content:** ETP copper bar (₹1,370) was priced below the copper cathode it is made from (₹1,385).
- **Contradictory machines:** the 200 t injection moulding machine was in the book twice, at ₹1,362/h and ₹703/h.
- **Foundry margin counted twice:** the book defines a casting £/kg as "index + alloying + **melt / cast / finish stockholder margin**" (a delivered foundry price). The casting engine *also* adds melt energy, melt labour, melt loss, the moulding line, fettling, overhead and margin, so the foundry's margin was counted twice. Ductile iron was ₹97/kg; the metal charge is ₹46.

## 2. How the new book is built

All research was done in this session by researchers following one rule set (`scripts/rate-refresh/india-2026-10/RULES.md`):
- **Never invent:** every figure has a URL and a date. "Not found" is an accepted answer.
- **Source order:**
  1. Government and regulators: JPC, state minimum-wage notices, MERC / TNERC / KERC / HERC tariff orders, the Rubber Board, RBI.
  2. Producers: Hindalco, NALCO, IOCL, Jyoti CNC.
  3. Market reporters' public pages: BigMint, SMM, Knight Frank.
  4. Pay surveys: Payscale, AmbitionBox, WageIndicator.
- **Marketplace listings** (IndiaMART and similar) are cross-checks only, never prices.
- **Caveat:** the researchers' page fetches were blocked by the network proxy, so every figure was read from search-result extracts of the cited page. **Spot-check the key figures before quoting them externally.**

The chain, with one script per step:
1. **Research files:** `scripts/rate-refresh/india-2026-10/research/*.json`, five domains and about 210 items.
2. **Config builder:** `build-config.py` writes `scripts/rate-refresh/2026-10-india.json`. It records which grade follows which anchor, and how. This is the only place judgement enters, and each family says why.
3. **Generator:** `scripts/country-book.ts` writes:
   - `src/engine/country-books/in.ts`, the India book (generated);
   - the India labour table, the India `lab-in-*` entries and the India billet premium;
   - **`register.csv`**, every India rate (current → new, decision, basis, source). That is 435 materials, 214 machines and 14 labour rates.
4. **Engine:** `buildRegionalLibrary('IN')` uses the India book where it has evidence. Anything else falls back to the old scaling and says so. The UK book is untouched.

**Pricing methods:**
- **Direct:** the research figure itself.
- **Ladder:** India anchor × (the book's UK grade ÷ the book's UK base grade), i.e. the Indian market level with the book's grade premium. Used where Indian grade extras were not found.
- **Floor:** raised to the metal the grade contains.
- **Held:** unchanged, with the reason. This is the push-back.

## 3. Labour (Verified against sources; statutory loading only)

Fully-loaded rates are built from:
- monthly gross pay (pay surveys, cross-checked against 2026 minimum wages in Maharashtra, Karnataka and Haryana);
- statutory loading: employer PF 12% and EDLI / admin 1% (PF wage capped at ₹15,000), ESI 3.25% (only when gross ≤ ₹21,000), bonus 8.33%, gratuity 4.81%, with basic taken as 50% of gross under the Code on Wages;
- 2,264 productive hours a year (Factories Act: 48 h/week, 312 paid days, less leave and holidays).

| Role | Gross / month | Before ₹/h | **After ₹/h** |
|---|---|---|---|
| Skilled CNC machinist | ₹27,000 | 654 | **162** |
| Semi-skilled operator | ₹18,500 | 448 | **114** |
| Foundry operative | ₹21,000 | 384 | **130** |
| Electronics / SMT operator | ₹23,000 | 576 | **138** |
| Quality inspector | ₹20,000 | 705 | **123** |
| Maintenance technician | ₹24,000 | 719 | **144** |
| Production supervisor | ₹33,000 | 883 | **197** |
| Process engineer (2–6 yrs) | ₹45,000 | 1,537 | **254** |
| Forge / furnace / plastics operators | ₹18,000–23,000 | 450–500 | **111–138** |

**Not yet included (open, P1):** no source was found for:
- night-shift allowance;
- canteen, transport and uniform;
- group insurance;
- the labour agency's margin on contract workers (about half of Indian auto employment is contract labour);
- bonus above the 8.33% statutory minimum.

The rates above are therefore a floor. Typically these items add 10–25%. That figure is my estimate, not sourced, so it was not applied.

## 4. Machines

**The operating model** applies to every machine (sources in the config):
- **Hours:** 7,200 a year (3 shifts × 8 h × 300 days).
- **Depreciation:** Schedule II triple-shift rule. Held capital × 2.0 ÷ 1.5; the effective life for India-capex machines is 7.5 years.
- **Finance:** 8.75% (1-year MCLR, Jul–Oct 2026).
- **Floor:** ₹25.05/sq ft/month (Knight Frank, H1 2026, average of the four clusters).
- **Power and support staff:** power at the India tariff; support staff at India wages.
- **Footprint, power draw and utilisation:** each machine keeps its book values.

**Capex:**

| Group | Evidence | Machines |
|---|---|---|
| CNC machining (VMC, turning, drilling) | Jyoti CNC average realisation per machine sold, ₹34.56 lakh (Q1 FY27) | `mach-vmc3` ₹3,419 → **555/h**; HAAS VF-2 2,854 → **399**; CNC lathe 2,490 → **396**; drilling centre 1,840 → **338**; Mazak QT200 3,181 → **427** |
| All other 209 machines | **Capex not found from an acceptable source.** Capital is HELD at the old basis (UK × 0.52), with the operating model applied | Median **−28%**. Examples: 400 t press ₹2,470 → 1,668; 200 t IMM 1,362 → 1,087; HPDC 500 t 3,086 → 2,201; sand line 1,842 → 1,230 |

**Checks:**
- No machine rate went up.
- India machines are now about 0.34 × their UK rate (median, was 0.52). The service factors (heat treatment, NDT, process, toolroom) use this, so they follow.

**Sanity check:** the CNC machining rates (₹338–555/h, machine only) now sit inside the Indian job-shop band of ₹250–1,500/h *including* the operator.

**Still too high (open, P1):** presses, IMM, HPDC, forging, 5-axis, lasers and gear machines are still on UK capital. A 400 t press at ₹1,668/h compares with ₹150–300/h for SME power presses (smaller presses, so the comparison is indicative only).

## 5. Materials

**175 updated, 261 held.** Every grade is in `register.csv`. By family:

| Family | Anchor (India) | Change |
|---|---|---|
| CR sheet (DC01 / DC04) | JPC Sep 2026 CR coil 0.63 mm, ₹72.0/kg | DC01 ₹103 → **72**, DC04 87 → **72** |
| Automotive sheet (IF, HSLA, DP, TRIP, MS, PHS, 24 grades) | CR anchor × the book's grade premium (Indian extras not found) | −20 to −24% (Low) |
| HRPO, HR structural | JPC HR ₹64.5 + HRPO extra ₹6.7 | −18 to −26% |
| GP / GA / EG coated | JPC GP ₹79.8 | −28 to −37% |
| Carbon and alloy bar, forging stock (25) | BigMint EN8 / C45 black round bar ₹72.75 (Apr 2026) × the book's premium | −25%; 4140 duplicate unified at ₹136 |
| Stainless bar | BigMint 316L black bar ₹340 | 316L ₹717 → **340**; family −24 to −53% |
| Stainless sheet | 316 HR coil ₹395; 304 CR ₹215–224; 430 / 409L China + duty | −23 to −60% (304 / 430 / 409L Low) |
| **Ductile / CGI / ADI iron** | **Metal charge ₹46.0** (60% pig iron ₹47 + scrap ₹40 + returns) | GJS-500-7 ₹97 → **46** (−53%) |
| Grey / malleable iron | Charge ₹42.6 (the mix is my assumption) | −41% |
| Cast carbon steel | Charge ₹38.3 (melting scrap) | GS-C25 ₹238 → **38** (−84%) |
| Cast stainless | 304 scrap ₹145 | CF8 ₹585 → **145** |
| Ni-Resist D-2 / D-5S | Ni + Cr + iron units | +2% / +9%. The book was close |
| Cast aluminium (22 alloys) | SMM ADC12, 7 Oct 2026: Mumbai ₹305.0, Delhi ₹304.75 | −10.6%; secondary ADC12 ₹248 → **305** |
| ETP copper bar / sheet | Cathode ₹1,385 (floor) | +1 to +4% |
| PP / PE / PVC | Delhi market, Sep 2026: PP ₹129, HDPE ₹136, PVC ₹102 | **+15 to +23%** (the book was low) |
| PET / PC / PBT / ABS | India index or CIF + 8.25% duty | −11 to −25% (the book was high) |
| PA6 / PA66 unfilled | CIF + duty | +9% / +33% |
| Natural rubber (raw) | RSS-4 Kottayam ₹278 | +22% |
| Al extrusion billet premium | Hindalco 6063 billet over LME | $550 → **$710/t** |

**Held, no Indian evidence this round:**
- electrical steel;
- wrought aluminium sheet and bar (the book is above P1020, which is plausible);
- brass and bronze, zinc;
- **magnesium:** looks about 2× high, but the alloy premium was not found;
- titanium, nickel alloys and superalloys;
- **filled polymer compounds:** the book's UK compound premiums would carry UK figures into India;
- engineering polymers without an anchor;
- rubber compounds, composites, paint, masterbatch;
- the 15 grades that already had an India-specific price from the extrusion and thermoforming country tables.

## 6. Energy: push-back (held)

| | Book | Evidence | Decision |
|---|---|---|---|
| Electricity | ₹8.78/kWh | MH ₹11.80 all-in, TN ₹8.81, HR ₹7.72 ex-tax. KA energy charge ₹6.60, demand charge not found. Three-cluster ex-tax mean ₹9.08 (+3.4%) | **Held.** Inside the spread, and Karnataka would lower the mean |
| Gas | ₹3.82/kWh | Gujarat Gas industrial PNG ₹44.68/SCM = ₹3.84/kWh | **Held.** Agrees |

## 7. Effect on real parts (India, 100k/yr, the casting 360 parts)

Traced with `scripts/casting-review-2026-10-10/trace.mts`. Live: see §9.

| Part | Before | **After** | Main movers |
|---|---|---|---|
| Steering knuckle (ductile iron, sand + machining) | ₹2,519.13 | **₹1,059.59** (−58%) | Metal ₹321 → 152; CNC machining ₹338–399/h (was ₹1,840–2,854); labour ₹130–162/h; NDT follows India wages |
| Stub axle PRCR002 | ₹5,184.39 | **₹2,258.56** (−56%) | Same |
| Casting bracket (cast steel) | ₹2,544.96 | **₹796.02** (−69%) | Cast steel charge ₹238 → 38 |

**Largest remaining unsourced lines on the knuckle:**
- cutting-tool wear **₹167**: a UK £0.10/min figure, treated as traded and not country-scaled;
- 100% X-ray **₹120**: an unsourced £5/part rate × the India factor.

Both are open method points from the casting 360 review (M4, M8).

**Accuracy is not measured.** There is no Indian purchase price for these parts on file. These figures are what the evidence-based rates compute, not a validated price.

## 8. Open: needs another research round (web search ran out this turn)

The session's web-search allowance (200 searches per turn, shared by every researcher) was used up. In priority order:
1. **Indian capex for presses, IMMs, HPDC, sand lines, induction furnaces, forging presses, lasers, gear machines and 5-axis.** These 209 machines still carry UK capital. Sources to try: Indian customs import values by HS code, maker price lists, and capex figures from tier-1 annual reports.
2. **Labour extras:** night-shift allowance, canteen and transport, insurance, and the contract-agency margin.
3. **Indian grade extras:** automotive sheet (IF, HSLA, DP, PHS), alloy bars (EN19, 20MnCr5, 100Cr6), stainless 410 / 17-4PH / 2205, and electrical steel (CRNO / CRGO).
4. Ingot prices for LM6 / LM25 / A356, Mg alloy premiums, polymer compounds (GF / FR), POM, PMMA and TPE.
5. **Karnataka and Delhi tariffs** (demand charge, duty) and city piped-gas prices, to close the energy check.
6. **Foundry treatment:** FeSiMg and inoculant (₹3–5/kg on ductile iron) are not in the charge cost yet.

**Decisions for you (not changed):**
- **UK casting basis.** The UK book also prices castings as delivered foundry prices, so its foundry margin is counted twice there too. India now uses the metal charge. The UK should follow, but that moves every UK casting, so it needs your approval.
- **UK machine capital.** The UK book's VMC capital also looks high (it implies about £400–550k for a VMC). Out of scope here; flagged for the UK review.

## 9. Checks

- **Full suite:** 255 files, **3,703 passed, 0 failed**. Typecheck clean. `tests/india-rate-book.test.ts` adds 14 tests.
- **Four tests that pinned the old India figures were restated, with reasons:**
  - casting-grade-gap: book grades are skipped;
  - country-rates §12: an NRE below ₹100 keeps a decimal;
  - labour ranking: India or Vietnam is now the cheapest;
  - China sourcing insight: it may name India, never China.
- **The UK book is unchanged.** The real-parts baseline (UK) does not move.
- **Live (real server and browser, India, 100k/yr, `e2e/cad-parts-live.ts`):**
  - knuckle **₹1,059.54** ±8.7%, stub axle **₹2,258.46** ±9.5%, bracket **₹795.98** ±8.4%;
  - the traces give ₹1,059.59 / 2,258.56 / 796.02; the ₹0.05–0.10 gap is the known screen-vs-headless rounding;
  - the PDF and Excel export checks pass (`check-exports.py`);
  - the Excel labour sheet shows "skilled (role), India, ₹161.54/h" with its India-book source.
