# Foundry practice at volume: sourced figures (research round, 3 Nov 2026)

What this answers: the report-standard review (`docs/review/report-standard-2026-11/README.md` §2) found that the sand-casting
rules cost **jobbing practice** at 200,000 castings a year:

- the semi-automatic line runs at 30 moulds/h with a crew of 4 (`SAND_LINE`, `casting.manning`);
- fettling is 6 manual minutes on a 7.4 kg ductile casting (`FETTLING_MINUTES.medium`);
- pattern life is 8,000 moulds, a wood band, on a pattern priced as an aluminium match plate (`casting.dieMouldLife`);
- core cost comes from the undercut face count (`casting.coreCostPerPart`);
- the yield band is `SAND_GRAVITY_YIELD_BY_ALLOY['ductile-iron']`.

Every figure is in `data.json` (66 rows), each with value, unit, conditions, source, URL, date and the exact text quoted from
the page I read. Each row also carries `evidence_grade`:

- maker spec;
- case study;
- authoritative reference;
- trade press;
- supplier blog.

**Read this first.** Most figures here are makers' rated maximums or vendor case studies. They are published, but they are
not independent. The EU BREF (2005 and 2024 editions) is the only authoritative, multi-plant source for yield and binder
levels. No source gives a moulds-per-year threshold for choosing a line class, or a core-box life. The proposal labels those
parts as engineering judgement.

## 1. Moulding lines: rates, sizes, crew, where used

**Rated output by mould size** (makers' tables; rates are maxima "at 200 mm mould thickness", or 250 mm for MATCH 24/28+):

| Class | Model | Mould / flask (mm) | Moulds/h uncored / cored | Source |
|---|---|---|---|---|
| Semi-manual flask | HWS HSP-1D…4D | 650×500 … 1250×1000 | 70 … 40 | Wagner-Sinto |
| Auto flask | HWS DAFM-SD / EFA-SD / ZFA-SD | by flask | ≤70 / ≤120 / ≤240 | Wagner-Sinto |
| Auto flask (aeration) | HWS ACE-3…6 | 700×500 … 1200×1000 | 150 … 120 | Wagner-Sinto |
| Auto flask | DISA FLEX 70HS / 80 / 90 | 700–1000 × 800–1300 | 120 / 110 / 100 | DISA spec |
| Auto flask (plant) | Künkel Wagner, Curitiba | 1250×900 | 225 (design) | Foundry-Planet 2011 |
| Horizontal flaskless (matchplate) | DISA MATCH 14/19, 16/20, 20/24 | 483×356 … 610×508 | 180/145 or 210/160 | DISA spec |
| | DISA MATCH 24/28 | 711×610 | 120/100 (150 with kit) | DISA spec |
| | DISA MATCH 28/32, 32/32 | 813×711, 813×813 | 100/75 | DISA spec |
| | Sinto FBO III-S / IV / V | 610×508 / 700×600 / 812×812 | 160 / 100 / 100 | Wagner-Sinto |
| Vertical flaskless | DISAMATIC D1-205 / D1-315 | 400×500 | 205/185, 315/285 | DISA spec |
| | DISAMATIC C3-250 / C3-350 (A, B, X) | 480×600, 535×650, 535×750 | 250/220, 350/300 | DISA spec |
| | DISAMATIC D3-365 / 425 / 555 | 480×600 … 570×750 | 365/333, 425/380, 555/485 | DISA spec |
| | DISAMATIC D5-355 / 415 / 450 | 600×775 … 650×850 | 355/330 … 450/415 | DISA spec |
| | DISAMATIC C5-S | 800×600 | 400/345 | DISA C5 brochure |

**Where the sources disagree on a rating:**

- The 2012 Foundry-Planet table rates the MATCH 20/24 at 160/120. The current DISA specification gives 180/145 or 210/160.
- The same table rates the MATCH 28/32 at 80 cored moulds/h. The current specification gives 75.

**Realised rates** (vendor case studies):

- **D3-B-555, Ma'anshan:** 520–540 moulds/h, line uptime ≥ 95 %, over 20 million moulds in about 5 years.
- **C3-350, Guangzhou Deshan:** an average of more than 7,000 moulds a day, running 24/7. That works out to about 292 moulds/h,
  83 % of the uncored rating (my calculation).
- **D3 555, Luyuan:** above 560 moulds/h uncored and about 480 with cores.
- **DISA Match 130, Littlestown:** 120 moulds/h with up to 18 cores, and more than 90 % of rated production each shift.

**Where each class is used.** The sources give positioning statements only:

- DISA: vertical moulding gives "the lowest cost-per-casting for medium-to high-volume production".
- DISA: matchplate "suits lower production volumes" and is "perfect for short to medium-run".
- EU BREF 2005: "Large series of small castings are made in flaskless green sand moulding."
- EU BREF 2024, Table 2.7 (CAEF 2020): a serial-production iron foundry runs an "automatic moulding plant, green sands", with
  "metal or plastic" patterns and "automatic shot blasting and mechanised grinding".

**No source gives a moulds/yr threshold** between the line classes.

**Crew per line** (thin evidence, all from vendors or trade press):

| Line | Crew | Source |
|---|---|---|
| Automatic matchplate | 1 machine operator who sets cores as needed | EMI white paper |
| Automatic matchplate | 1 per line; 8 people for 3 lines including supervision and material handling | Littlestown |
| DISAMATIC lines | 3 per line with manual pouring, 2 with automatic pouring | Trakya Döküm |
| DISA matchplate replacing a horizontal line | Half the people on the line | Jiangsu Weide |
| Automatic core setter | 5–8 s cycle delay per mould, against 12–15 s by hand | Littlestown |

**Finding.** The code's 30 moulds/h sits below even the published semi-manual HWS HSP range (40–70 moulds/h). Every
published automatic line rates 100–555 moulds/h. The crew of 4 sits above every published automatic-line figure (1–3).

## 2. Pattern and core-box life

| Pattern material | Published life | Source (grade) |
|---|---|---|
| Wood | 500–3,000 moulds | Supro MFG table (supplier blog, 2026) |
| Wood (hardwood) | 2k–8k pulls to first refurbishment, 10k–20k total | YB Metal (supplier blog) |
| Wood | "perhaps 50 pieces or less per year" | Casting Source / AFS (volume guidance, not life) |
| Urethane / epoxy | 20k–40k / 30k–60k total | YB Metal |
| Plastic | annual volumes up to 5,000 | Casting Source / AFS |
| Aluminium (incl. core boxes) | 10,000–50,000 moulds | Supro MFG |
| Aluminium (CNC) | 25k–100k to first refurbishment, 80k–150k total | YB Metal |
| Metal (aluminium or iron) | 100,000–500,000 cycles before significant refurbishment | Bowmanville Foundry (blog) |
| Cast iron (no-bake) | 50,000–150,000 moulds | Supro MFG |
| Low-alloy steel matchplate | up to 500,000 green-sand moulds | DISA via FMT, Feb 2024 |
| Pattern plates on DISA flaskless | "Normally only one set of pattern plates is needed, even for high production volumes" | DISA |

Two more points from the sources:

- **Volume guidance (AFS Casting Source, 2021):** metal patterns above 5,000 a year. Aluminium is used for matchplates and
  cope / drag plates on automated moulding. Iron is "most common in high pressure molding processes such as
  vertically-parted molds".
- **The sources disagree on aluminium by about 10×:** 10k–50k (Supro), 80k–150k with refurbishment (YB), and "metal"
  100k–500k (Bowmanville). All three are supplier blogs with no stated data. The only maker figure is for steel (DISA,
  500k maximum).

**Finding.** The code's 8,000 moulds lies inside the published WOOD bands (2k–20k). It does not fit the aluminium match plate
the code prices. Every published aluminium figure is higher, and every steel / iron figure is much higher.

**Core boxes:** no published life figure was found. The only statement is that a core box may be "wood or plastic to metal
for high production cores" (FMT 2016). This is a gap.

## 3. Fettling (ductile iron, 5–10 kg)

| Case | Time | Source |
|---|---|---|
| High-volume ductile iron, 0.1–30 kg, flash and ingates (the only measured figure in the 5–10 kg class) | Manual 45 s, CNC / robot cell 40 s; one operator runs 2 machines | Malleable Castings (SA) time study |
| 22 kg iron compressor casting with 6–8 mm flash (an upper bound) | Robot holding the spindle 260 s (193 s grinding); robot holding the casting 437 s | Grindmaster / Institute of Indian Foundrymen |
| Cylinder block | 2 min automatic against 15–20 min manual; snag grinders add 15–20 % to manual output | Mahindra & Mahindra (Mestry, 2011) |
| 15–60 kg iron | Robot cell 3× faster than an operator | FMT 2016 (Comau) |
| Benton Foundry | 2 operators replace 7 floor grinders | FMT 2017 |
| Sinto BARINDER | 1 person runs several machines | Sinto |

More context:

- Fettling is 25–30 % of foundry manpower, and automation raises productivity 5–8 fold (Grindmaster).
- On grey iron the feeders "can generally be knocked off"; hydraulic equipment is increasingly used for this, and automatic
  grinding machines are increasingly used in serial production (EU BREF 2005 §2.7).

**Finding.** No published source supports 6 manual minutes for a small, high-volume ductile casting from a flaskless line.
The one measured data point for that class is 45 s manual and 40 s automated. Manual figures for big or heavy-flash
castings run from 15 to 40 min. **Not opened:** the EU HORSE project figure ("10 kg … manually cleaned in 40 mins"), because
i4ms.eu is outside this session's network.

## 4. Core making

- **Laempe shooter cycle times** (machine strokes only — no gassing, amine injection or venting in these):

  | Model | Shot volume | Shooting area | Cycle |
  |---|---|---|---|
  | LL10 | 10–15 l | 380×380 mm | 16 s |
  | LL20 | 20–30 l | 520×520 mm | 22 s |
  | L20 | 20–40 l | 900×650 mm | 18 s |
  | L40 | 40–80 l | 960×700 mm | 22 s |
  | L100 | 100–150 l | 1200×800 mm | 32 s |
  | LHL30 / 50 / 100 | 30–50 / 50–130 / 80–300 l | — | entire strokes 18 / 21 / 24 s, average strokes 15 / 15 / 20 s |

- **Cold box process (EU BREF 2024):**
  - binder 1.0–2.0 % of the sand weight, resin to isocyanate 50:50;
  - amine about 0.05 % is needed, and 0.10–0.15 % is used;
  - the purge lasts 10–15 × the amine injection time.

  No source gives the injection time in seconds.
- **Binder cost (BREF 2005):** binder is 1–3 % of the mixed sand by weight but 30–60 % of its raw-material cost.
- **Silica sand price:** €10–25/t at 2003 prices (BREF 2005). This is stale.
- **Use:** amine cold box is used by more than 90 % of automobile foundries (German survey, 1991).
- **How a core is costed.** No open handbook or paper found states a method. aPriori's cost-model guide pages and the
  Chougule & Ravi (2006) paper were not readable: 403, or paywalled.

  From the components above, a core costs: core sand mass × (sand £/kg + binder % × binder £/kg + amine), plus the shooter
  cycle ÷ cores per shot × (machine + operator £/h), plus the core box ÷ its life. This is a construction, not a quoted
  method.
- **Gaps:**
  - the binder price (£/kg);
  - the gassing / injection time;
  - core-box life;
  - a measured core volume. The kernel gives undercut faces, not the core's volume.

## 5. Ductile iron yield (green sand, automatic lines)

**Definitions differ.** The BREF "metal yield / OME" is good castings ÷ metal melted, so it includes scrap castings, pigging
and melt loss. The code's `yieldFraction` is casting ÷ poured weight, and the code charges melt loss and scrap separately.
On the same process, BREF figures therefore sit BELOW a pour-weight yield.

| Figure | Value | Definition | Source |
|---|---|---|---|
| Mechanised repetition, small nodular | 40–50 % | metal yield | BREF 2024 Table 3.13 (ETSU 1990) |
| Medium nodular jobbing | 50–60 % | metal yield | BREF 2024 Table 3.13 (ETSU 1990) |
| Grey, mechanised, high quality, cored | 55–65 % | metal yield | BREF 2024 Table 3.13 (ETSU 1990) |
| Iron foundries' OME (EU, n = 73) | median 58 %, mean 51 %, 80th percentile 80 % | metal yield | BREF 2024 Table 3.12 |
| Nodular iron (UK survey) | mean 63 %, range 40–90 % | metal yield | BREF 2005 Table 3.48 (ETSU 1995) |
| Nodular iron (UK, 82 foundries) | 51.8 % (1981) → 55.7 % (1987) | metal yield | BREF 2005 Table 4.30 |
| Ductile automotive, Fundimig | 68 % | scrap-adjusted casting yield | MAGMA |
| Ductile differential case housing | 62 → 67 % | casting yield | BREF 2024 |
| EN-GJS-500, 26.8 kg casting, DISA line, Döktaş | 26.8 / 53 = 50.6 % | pour-weight yield | Foseco |
| Luyuan "yield rate" | 99.4 % | QUALITY yield — do not use | DISA case study |

**Finding.** The code's ductile band of 0.55–0.70 (midpoint 0.625) sits inside the published pour-weight figures (50.6–68 %).
It also sits sensibly above the BREF metal-yield figures. It is defensible as it stands, but it is unsourced.

## Pages not used (would not open, or were not a primary source)

- **Refused or unreachable** (no bypass attempted):
  - SFSA tutorial pages: Cloudflare challenge;
  - directindustry.com DISA catalogue PDFs: 403;
  - Sanfoundry pattern-life table: 403;
  - aPriori cost-model guide: 403;
  - Norton white paper: 403;
  - Leoben thesis: 403;
  - web.archive.org: blocked for the fetch tool;
  - i4ms.eu (HORSE): outside this session's network.
- **Not openly available:** ASM Handbook Vol. 15, Campbell's *Complete Casting Handbook*, AFS / CAEF / BDG / VDG handbooks.
  No figure here is attributed to them.
- **Seen only in search snippets, so not used:**
  - a lecture-slide "number of castings" table (2,000 hardwood / 6,000 Al / 100,000 cast iron for small castings);
  - the DISA ASEAN brake-disc yield table (79–82.5 %).

---

## PROPOSAL — constants in `casting.ts` / `casting-advisor.ts` (not applied; research only)

Labels used below:

- **[S]** — sourced; data.json row named;
- **[J]** — engineering judgement where no source exists, to be printed as such;
- **[GAP]** — needs a rate-book or research item first.

### P1. `SAND_LINE` → a line chosen by annual moulds and mould size (casting.ts ~L236)

Replace the single `{ MOULDS_PER_HR: 30, FLASK_MM: [500, 400] }` with a table of line classes. The cored rate applies when
the part has cores.

| id | Class | Usable mould face (mm) | Moulds/h uncored / cored | Crew | Source |
|---|---|---|---|---|---|
| `semi-auto-flask` | semi-manual flask (HSP-2D class) | 800×650 | 60 / 60 [S rating; cored = uncored J] | 4 (keep current) [J] | Wagner-Sinto HSP table |
| `auto-matchplate` | horizontal flaskless (DISA MATCH 24/28) | 711×610 | 120 / 100 | 1 + 1 pourer if pouring is manual | DISA spec; EMI; Littlestown |
| `auto-flaskless-h` | horizontal flaskless (FBO IV) | 700×600 | 100 / 100 [J cored] | as matchplate | Wagner-Sinto FBO table |
| `vertical-c3` | DISAMATIC C3-250 B | 650×535 (thickness ≤ 340) | 250 / 220 | 2 with automatic pouring, 3 with manual | DISA spec; Trakya |
| `vertical-d3` | DISAMATIC D3-555 B | 650×535 (≤ 395) | 555 / 485 | 2 / 3 | DISA spec; Trakya |

**Selection.** No source sets a volume threshold, so the selection is **[J]**: take the lowest-cost class whose mould face
holds at least one impression. The class must also need ≤ ~85 % of the line's available hours, and that figure must be
printed as a loading.

The utilisation is **[S]**, read off the published case studies:

- 83 % (Guangzhou Deshan, 24/7 average against the uncored rating);
- 94–97 % (Ma'anshan, against the rating);
- more than 90 % (Littlestown, each shift).

**Stub axle, 103,093 moulds a year (the reviewer's figure):**

| Line | Hours | Loading of 3,500 h | Crew-minutes per casting (2 impressions) |
|---|---|---|---|
| Current, 30 moulds/h | 3,436 h | 98 % (123 % at OEE 0.8) | 4 × 60 ÷ (30 × 2) = 4.0 |
| auto-matchplate, 100 cored moulds/h | 1,031 h | 29 % | 2 × 60 ÷ (100 × 2) = 0.6 |

**Impressions also change** with the larger mould face (711×610 against 500×400), so `sandImpressions` reads the chosen
class's face. Note that a vertical mould's thickness limits the casting depth on both faces.

**[GAP]** The library has no automatic-line machine rate: `sand-cast-line` capital is HELD. An automatic matchplate line and a
DISAMATIC line each need a sourced capex before this can ship. Until then, the report must say that the line rate is an
overstatement.

### P2. `casting.manning` (casting.ts ~L812)

Take the crew from the line class above:

- semi-auto flask: 4 **[J]** — the current figure, unsourced;
- automatic matchplate: 1 operator, + 1 if pouring is manual **[S: EMI, Littlestown]**;
- DISAMATIC: 3 with manual pouring, 2 with automatic pouring **[S: Trakya]**.

### P3. `casting.dieMouldLife`, sand (casting.ts ~L528) — life follows the pattern material that is PRICED

| Pattern material | Proposed life (moulds) | Basis | Published range |
|---|---|---|---|
| Wood | 8,000 **(unchanged)** | sourced as a wood figure | 2k–20k [S: YB, Supro] |
| Aluminium (what `estimateSandPatternCost` prices today) | **100,000** (total life with refurbishment) [J] | DISA puts a steel plate at 500k, so aluminium sits lower | 10k–150k [S: Supro, YB, Bowmanville] — sources disagree ×10 |
| Steel / iron plate on an automatic flaskless line | **500,000** [S: DISA "up to 500,000"] | DISA: "normally only one set … even for high production volumes" | 50k–500k |

**Stub axle** (2 impressions, about 1,030,000 castings over the programme):

- now: 8k life → about 65 sets;
- aluminium at 100k: 200k castings a set → about 5 sets;
- steel at 500k: about 1 set.

The steel row needs `estimateSandPatternCost` to price a **steel** plate when the line is automatic: today it prices
aluminium 7075 (casting-tooling.ts L104). That is **[GAP]**: steel plate price and machining hours.

Replacement sets must also be priced without design or try-out costs (cost-engineer finding #24). Those come from the
toolmaker build-up, not from this research.

### P4. `FETTLING_MINUTES` / `casting.fettlingMinutes` (casting-advisor.ts L517, casting.ts ~L654)

- **Automatic line + ferrous + mass ≤ 30 kg:** an automated grinding cell.
  - Cycle: **40 s** [S: Malleable Castings time study — ductile, 0.1–30 kg, high volume]. Range 40–260 s
    [S: Grindmaster, 22 kg with heavy flash].
  - Crew: 0.5 [S: "one operator for 2 machines"; Sinto "1 person … several machines"].
  - The cell's own machine rate is **[GAP]**: a robotic or CNC grinding-cell capex is needed in the rate book.
- **Manual (semi-auto line, low volume):** keep 2 / 6 / 15 min, but print it as **"engineering-typical, not sourced"**. The
  published manual figures run from 45 s (small high-volume ductile) to 15–20 min (cylinder block), so 6 min cannot be
  sourced or refuted for a mid-size jobbing casting.
- The rule should follow the line class from P1. No published volume threshold exists **[J]**.

### P5. `casting.coreCostPerPart` (casting.ts ~L388) — build it up from the core, when a core volume exists

`core £ = Vcore × ρsand × [sand £/kg + b × binder £/kg + a × amine £/kg]`
`        + (t_shoot + t_gas + t_purge) ÷ cores per shot × (shooter + operator £/h)`
`        + core box £ ÷ core-box life`

**Sourced terms:**

- b = 1.0–2.0 % (use 1.5 %), and a = 0.10–0.15 % of the sand weight [S: BREF 2024];
- t_shoot from the Laempe class by core volume: ≤ 15 l LL10 16 s, ≤ 30 l LL20 22 s, ≤ 40 l L20 18 s, ≤ 80 l L40 22 s
  [S: Laempe];
- t_purge = 10–15 × the amine injection time [S: BREF 2024].

**[GAP]:**

- t_gas (amine injection, in seconds);
- the binder and amine £/kg (no published price — a supplier quote is needed);
- a current sand £/t (the BREF price dates from 2003);
- core-box life;
- core volume. The kernel measures undercut faces, not the cored void. An enclosed void (`enclosesSealedVoid`) or the
  cored-bore volume from the feature table could size it.

**Until those gaps close:** keep today's undercut-count bands, but print them as unsourced in the core report's "assumptions
that move the price" list. The stub axle's cores are £3.09, about 7.5 % of the price.

### P6. `SAND_GRAVITY_YIELD_BY_ALLOY['ductile-iron']` (casting-advisor.ts L103)

**Keep [0.55, 0.70].** It is consistent with the published pour-weight yields: Döktaş 50.6 %, differential case 62–67 %,
Fundimig 68 %. It sits correctly above the BREF metal yields (OME median 58 %; small mechanised nodular 40–50 %).

Change only the basis text, from "engineering-typical band, not sourced" to cite BREF 2024 Tables 3.12 / 3.13, Fundimig and
Döktaş. State the definitional difference: casting ÷ pour, with scrap and melt loss charged separately.

Optionally, lower the band to [0.50, 0.65] for castings under about 2 kg. BREF says "small nodular … 40–50 %" metal yield
[S, but on a metal-yield basis].

### Order of work

1. P3 (wood life on an aluminium pattern) and P6 (basis text) are data changes with sources in hand.
2. P1, P2 and P4 need two rate-book items first: an automatic moulding line and a grinding cell, each with sourced capex.
3. P5 waits on a binder quote and a core-volume measure.

Each change then goes through:

1. the shadow models (`scripts/arith-audit/`);
2. the real-parts baseline, `--update` with the reason;
3. a live re-cost of the stub axle and the casting bracket.
