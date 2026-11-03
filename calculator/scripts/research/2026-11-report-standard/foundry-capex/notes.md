# Foundry capex: automatic green-sand lines, fettling cells and pattern plates (3 Nov 2026)

This round is research only. It unblocks P1, P2 and P4 and the steel row of P3 in `../foundry/notes.md` (Blockers, and
§§ P1–P4). It does not touch the engine or the rate book.

- **Data.** `data.json` holds 30 rows. Each row has the value, currency, year, what the figure includes, the URL that was
  read, the date and an exact quote. Each row also carries `readMethod`, an `evidence_grade` and `gbp_at_book_fx`.
- **FX.** `gbp_at_book_fx` uses the library's own 2026-10 display FX (`REGIONAL_DATA.fxToGBP`: EUR 1.1965, PLN 5.096,
  CZK 29.1177, INR 127.2, USD 1.3317). Nothing is escalated, and nothing is converted at the transaction-date rate. Treat it
  as an order of magnitude, not a price.
- **How pages were read.** Every page was opened with plain `curl` (no user-agent change) or through a publisher's public
  API, then text-searched for the quote. There are two exceptions:
  - **TED notices.** The notice pages and XML return HTTP 202 with an empty body to curl, which is a bot check, and the
    fetch tool also got an empty page. The Czech gazette mirror's TLS certificate has expired. Neither was bypassed.
    For TED, only the award metadata from the official TED Search API (`api.ted.europa.eu/v3`) was read. These rows say
    "VALUE ONLY; scope unread".
  - **Contracts Finder.** Notice pages return 403. The Brunel row was read through the official Contracts Finder REST API.

## 1. Findings

### 1.1 Automatic moulding lines (Blocker for P1 / P2)

No source prices a DISA MATCH or a DISAMATIC line on its own, ex-works, with a stated scope. What the published record
does give falls into three groups.

**Line or machine, narrow scope (closest to a machine rate):**

| Row | What | Value | GBP at book FX | Scope / grade |
|---|---|---|---|---|
| L2 | DISAMATIC 270-A replacing a DISAMATIC 2070, Dovre (BE) | EUR 3.0 M (2015) | £2.51 M | DISA moulding equipment. The existing DISA sand plant is kept. Maker's press release. |
| L3 | Vertical moulding *machine*, DISA India | Rs 8 cr imported, 350 moulds/h; Rs 4 cr India-built, 250 moulds/h (2011) | £0.63 M / £0.31 M (≈ £1.08 M / £0.54 M at 2011 FX, not sourced here) | Machine only. DISA India MD in trade press. 15 years old. |
| L10 | Sinto P10-S automatic pouring unit for an HWS line, Çemaş (TR) | EUR 1.09 M (2026) | £0.91 M | Pourer only. Listed-company disclosure. |

**Line plus periphery (contract or award values, scope partly known):**

| Row | What | Value | GBP | Scope / grade |
|---|---|---|---|---|
| L1 | Horizontally-parted line + accompanying equipment, Odlewnie Polskie (PL) | EUR 8.86 M net (2024) | £7.40 M | Three suppliers: HWS (line), Jöst (vibratory), Induga (induction furnaces). +4,000 t/yr. Stock-exchange filing. **Opened this round**; it confirms the round-2026-10-30b row, which had not been opened. The filing does not split melting out. |
| L4 | "formovací linka", Metaz Týnec (CZ) | CZK 154.3 M award (2017) | £5.30 M | TED award, value only. |
| L5 | "formovací linka", Giff (CZ, ~5,500 t/yr jobbing iron) | CZK 79.9 M award (2020) | £2.74 M | TED award, value only. |

**Whole projects (upper bounds only):**

| Row | What | Value | GBP | Scope |
|---|---|---|---|---|
| L6 | Tatra Metalurgie new line "including sand plant and heating furnaces" | ~CZK 600 M planned (2018); CZK 744.5 M award (2021) | £25.6 M | Includes construction CPVs |
| L7 | GF Singen new line, 100 kt/yr | EUR 55 M (2014) | £46.0 M | Whole project |
| L8 | Thomas Dudley D3-Z-425 in a new foundry (UK) | > £10 M (2018) | £10 M | Building, sand plant, pouring, finishing |
| L9 | Kirloskar Ferrous 2nd HPML Phase I, +20 kt/yr (IN) | ≈ Rs 170 cr net (2023) | £13.4 M | Project capex, filed with BSE |

**Sand plant and installation (for the "incl. sand plant if stated" part of the brief):**

- AGA Coalbrookdale sand plant, c. 2015: **£1.8 M** (L12).
- GZUT new bentonite sand plant, 2024, winning price: **PLN 1.42 M = £0.28 M** (L13). Small.
- KAW-MET sand-plant extension, 2024 budget: **PLN 1.31 M** (L14).
- RFI Bari shakeout + sand recovery plant, 2025: **EUR 5.48 M** buyer estimate. The tender drew no bids (L15).
- Installing an owner-supplied line, KAW-MET 2024: **PLN 1.84 M** estimated value, including ~EUR 400k of maker's
  spare parts (L11). Installation is a real add-on to any ex-works line price.

**Not green sand, context only:**

- SKF Cooper Omega Sinto carousel incl. mixer and reclamation: **£720k** (2020, L16).
- Brunel R&D sand-casting cell (Omega): **£210,287** award (2017, L17).

**What it says about the book.** The held `sand-cast-line` build-up implies about £156k of capex (finance ÷ 0.02, per
round-2026-10-30b) or £253k (depreciation × 10). Every automatic-line figure found is 10–50× that. The book row is a
manual or semi-automatic unit, as foundry/notes.md already concluded.

**False lead, recorded so nobody re-uses it.** A web summary offered "£864,980, foundry mould-forming machinery (CPV
43420000), University of Sheffield, Dec 2016". The Contracts Finder API record is an **HP-RTM machine from KraussMaffei**
(CPV 43420000 was one of four codes). It is not a foundry line.

### 1.2 Robotic / automated fettling cells (Blocker for P4)

| Row | What | Value | GBP | Grade |
|---|---|---|---|---|
| **F1** | 7-axis robotic grinding-cleaning centre for an iron foundry (Ø800 × 500 envelope, castings ≥ 40 kg, three tool sets, installation, start-up, 24-month warranty incl. service). KAW-MET, PL, Feb 2025 | **PLN 1,634,390 net** budget | **£320,720** | Buyer's declared budget in a resolved EU-funds procedure (3 bids; Eurocast Industries chosen; winning price not published) |
| F2 | Foundry grinding cells, US range (Sinto America sales manager) | USD 300–500k (2019) | £225–375k | Trade press |
| F3 | Self-built cell, Eagle Alloy (refurbished robot + fencing + tables) | ≈ USD 25k (2016) | £19k | Floor, not comparable |
| F5 | Through-feed shot blast, KAW-MET 2025 | PLN 1,270,935 budget | £249k | The cleaning-room machine before the cell |

F1 and F2 agree: a production fettling cell costs **£0.22–0.38 M**, and F1 is the best-scoped of the two. Two other
sources give no price:

- **Drawski (PL, 2022)** bought "two automatic (CNC) grinders" for its DISAMATIC line (Baza 119419).
- **Thomas Dudley** names robotic fettling inside its > £10 M programme (F4).

### 1.3 Pattern / match plates (P3 steel row)

No toolmaker publishes a matchplate price per plate, per kg or per cm². No procurement award for pattern plates was found:

- TED full-text searches for "Modellplatte" and "pattern plate" returned only museum work.
- Polish EU-fund pattern orders (Zetkama, Drawski, Kutno, Krakodlew) publish no price, or are scanned.

What exists:

- **P1. Dandong Foundry's published table (CN, undated).** It is the only source that prices an iron pattern for an
  automatic line separately from aluminium:
  - automatic moulding, iron pattern: USD 1,500–5,000;
  - manual green sand, aluminium pattern: USD 1,000–5,000;
  - each range runs by shape complexity and size.

  This is a Chinese toolroom cost.
- **P2. A China supplier blog (Oct 2026).** Aluminium pattern + core boxes USD 4,500–14,000, life 10k–50k moulds. Weak.
- **P3. Eurostat Comext unit values, CN 8480 30 90** (metal / plastic moulding patterns). EU-27 intra-EU exports were
  **EUR 15.65/kg (2024) and EUR 14.67/kg (2025)**; Germany ~EUR 32–36/kg. It is a cross-check on a per-kg price only,
  because it mixes materials, sizes and complexity.

### 1.4 Hours and shifts

- **DISAMATIC C3-350, Deshan (H1).** Runs 24/7 at > 7,000 moulds a day: 20.0 rated-speed hours a day (83 % of 24 h),
  or ≈ 6,400 rated-speed h/yr over 4.4 years.
- **Tatra Metalurgie (H2).** Foundry and forge "practically continuously on three shifts" (2018).
- **Çemaş HWS flask line (H3).** 235 moulds a shift realised with manual pouring, against 400–450 targeted with an
  automatic pourer.
- **Odlewnie Polskie (L1).** States capacity "in nominal working time", with no hours given.

None of these gives a published annual hours figure for a line. The library's own `continuousHoursPerYear` (6,066 h,
3 × 8, Germany book) is the closest stated basis.

## 2. Gaps (what is still missing)

1. **A line-only, ex-works price for a DISA MATCH-class horizontal matchplate line.** Nothing found. L1 is a horizontal
   line, but HWS, with melting and periphery, and for castings up to 250 kg according to an unopened stock-promotion
   article. That is not a MATCH-class line.
2. **Scope of the three Czech TED awards (L4–L6).** A person must open notices 247032-2017, 510315-2020 and 224779-2021 in a
   browser. That gives line type, size, sand plant, VAT basis and supplier.
3. **The DISAMATIC tenders that resolved without a value.** Drawski (Baza 89213, 2022: D3, ~400 moulds/h, 480 × 600).
   Simiński-Ordon (Baza 284237): ≥ 500 moulds/h, cancelled 5 Oct 2026, and may be re-tendered. Watch it, because
   KAW-MET-style settlements state the budget.
4. **Steel matchplate price per plate.** No toolmaker or award gives one. The defensible route is a build-up: plate mass ×
   a sourced steel-plate price, plus CNC hours at the library's own machining rate, cross-checked against Comext
   EUR/kg (P3). That keeps P3's steel row a stated build-up, not a quoted price.
5. **Economic life for foundry moulding plant.** The BMF publishes a branch AfA table "Eisen-, Stahl- und
   Tempergießereien" (No. 35). The page returned HTTP 503 on three tries today, so no life was read. Until it is,
   use the library's 13-year general-table proxy, labelled as not sourced for foundry plant.
6. **Metalpol Węgierska Górka (PL) industrial robots, EUR 1.7 M award (TED 465115-2016).** The full text matches "linii
   formierskiej", but the robots' use is unknown. Not used.

## 3. How each figure maps onto a library machine-rate build-up

The library's rate is `(depreciation + maintenance + energy + floor + indirect + finance) ÷ (hours × utilisation)`.
`uk-2026-10/build-config.py` fills it from capex:

- depreciation = capex ÷ life;
- maintenance = 3 % of capex;
- indirect = 5 % of capex;
- finance = 4 % on half the capex.

Energy and floor are separate. The machine rate is MACHINE ONLY: crew, overhead and margin come elsewhere, and melting is
already a separate per-kg charge in casting.ts. So the capex fed in must be the line without melting, without the
building and without the sand plant, unless the sand plant is meant to be inside the line rate.

| Library item (proposed) | Capex basis to use | Why |
|---|---|---|
| `auto-vertical` line (DISAMATIC C3/D3 class) | **L2: EUR 3.0 M, 2015** (≈ £2.51 M at book FX, unescalated). L3 (Rs 8 cr machine, 2011) is a low bound for the machine alone. | Narrowest scope, and the right class. Sand plant excluded in the source. Medium–Low confidence: a press release, 2015 money, one data point. |
| `auto-matchplate` line (DISA MATCH class) | **No direct figure.** L5 (Giff CZK 79.9 M ≈ £2.74 M, award, scope unread) is the only candidate in the right size band for a jobbing iron foundry. | Hold until L5 is opened, or label the line "capex estimate from the vertical-line figure" and say so. |
| Horizontal flask line + periphery (HWS / Künkel Wagner) | L1: EUR 8.86 M incl. accompanying equipment and probably melting, 2024 | An upper bound for a large-casting flask line. Do not use it for DISA MATCH. |
| Sand plant (only if the rate is to carry it) | £1.8 M (L12, c. 2015) for a full plant; PLN 1.42 M (L13) for a small one | Neither states t/h. Keep the sand plant out of the line rate unless P5/P6 need it. |
| Automatic pourer (crew 2 v 3 in P2) | L10: EUR 1.09 M | If P2 takes the "2 with automatic pouring" crew, the pourer's capital should be in the line rate. |
| `fettling-cell` (P4) | **F1: PLN 1,634,390 = £320,720** (scope: cell, three tool sets, installation, warranty). F2 USD 300–500k as the cross-check. | Best-scoped production figure. Budget, not winning price. Grade Low–Medium. |
| Pattern plate (P3 steel row) | Build-up; P1 / P3 as cross-checks | See gap 4. |

**Illustration only, not a proposal.** Take a vertical line at £2.51 M (L2), life 13 years (proxy), maintenance 3 %,
indirect 5 % and finance 2 %. That is ≈ £444k a year before energy and floor:

- at the library's current 3,500 h × 0.75: **£169/h**;
- at 6,066 h × 0.83 (3 × 8, and Deshan's 83 % of 24 h): **£88/h**;
- at a rated 350 moulds/h that is £0.25–0.48 a mould, against today's `sand-cast-line` at £29.90/h ÷ 30 moulds/h ≈
  £1.00 a mould (crew excluded in both).

The hours assumption moves the rate by about 2×. So the line class and its hours must be chosen together, as P1 already
says (≤ ~85 % loading).

The F1 cell at £320,720 with an 8–10 year life, on the same percentages, is ≈ £64–72k a year: **£24–28/h** at
3,500 × 0.75, or £13–14/h at 6,066 × 0.83. At P4's 40 s a casting that is £0.14–0.31 a casting before labour.

## 4. Search record (what was tried and found nothing)

- **UK Contracts Finder** (REST API, keywords moulding / foundry / casting / fettling / pattern plate): no foundry
  moulding-line, fettling-cell or pattern award. The only near hits were the Sheffield HP-RTM machine (false lead) and
  the Brunel sand cell (L17).
- **TED API, CPV 43420000** (all award notices): university, lab and training machines (Paderborn EUR 249,556;
  Miskolc EUR 416,300; CINFU Porto EUR 245,000 and a 3D sand printer EUR 887,950), plus investment-casting lots. None is a
  production green-sand line.
- **TED full text** found nothing for "DISAMATIC", "DISA MATCH", "moulding line", "Formanlage", "linea di formatura",
  "fettling" or "Gussputzen". "formovací linka" produced L4–L6.
- **Polish Baza Konkurencyjności** (public API, ~70 foundry procedures with settlements scanned): F1, F5 and L11–L14
  came from here. Most settlements state the chosen bidder but not the price.
- **Stock-exchange filings:**
  - ESPI (PL): L1.
  - KAP (TR): L10 and H3.
  - BSE (IN): L9.
  - Componenta (FI) gave no line figure.
- **Chinese announcements** ("迪砂 造型线 采购"): nothing with a value.
- **US state grants:** Benton Foundry got a USD 3 M RACP grant (2021–22) for an expansion plus robotic equipment. It has
  no line split and was not used.
