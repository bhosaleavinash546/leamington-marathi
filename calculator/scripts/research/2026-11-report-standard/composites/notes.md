# Composites — sourced tool life, layup rate, cure cycle and volume routes (research, 3 Nov 2026)

Research only. Nothing in `src/`, `server/`, `tests/` or other `scripts/` folders was changed. Every figure is in
`data.json` with its URL, date, exact quote, `kind` (datasheet / trade press / vendor claim) and `read_method`.
`pdf-text` means the quote was copied from the PDF's text. `webfetch` means the page was read through the fetch
tool's summariser, so check the quote on the live page before a report prints it. Snippets were never used. Twelve pages
refused access or failed to load (403 / 429 / DNS / reset). They are listed under `not_used` and none of their figures
appear in this note.

Context: `TOOL_RATE_PER_M2.prepreg_layup.life = 500` (composites.ts), `layupHrPerM2PerPly 0.06` and `cureHr 3.0`
for `prepreg-cf` (derive/laminate.ts), `MAX_PARTS_PER_CURE 20` and an autoclave bed of 2.8 × 1.0 m. The hat
stiffener has V = 195.36 cm³ and S = 1,614.9 cm². That gives a 2.42 mm wall, 10 plies, a 0.0807 m² laminate and
0.313 kg laid. At 200k a year for 5 years the costing gives 222 tools in service, 2,000 tools over the programme and
tooling of £25.34 of £69.37.

## 1. Findings

### 1.1 Tool life by tool material

| Tool material | Life | Source (data.json id) | Strength |
|---|---|---|---|
| Carbon/epoxy (tooling prepreg) | **< 300 cure cycles** at ≤ 185 °C | SME 2010, Cytec (TL-1) | trade press, supplier statement |
| Carbon/BMI (HexTool M61) | **"several hundred" autoclave cycles at 180 °C; > 500 part cure cycles shown** | Hexcel datasheet ©2015 (TL-3) | manufacturer datasheet (PDF) |
| Carbon/BMI (M61, older sheet) | 1,000 tool thermal cycles at 180 °C | Hexcel (TL-4) | manufacturer datasheet (PDF) |
| Carbon/BMI (HexTool) | 500 autoclave cycles | CompositesWorld M&P page (TL-5) | trade press |
| Carbon/BMI (Cytec Duratool) | > 1,000 cure cycles at 191 °C | SME 2010 (TL-2) | vendor claim |
| Nickel-shell (Weber NVD) | 1,000–100,000+ parts | SME 2010 (TL-8) | vendor claim |
| Electroformed nickel (slush moulding, not composites) | 10,000–85,000 parts | MoldMaking Tech. 2005 (TL-9) | context only |
| **Invar** | **no published cycle count found.** Sources say "would last the life of the program" (TL-7) and that metal tools "withstand many thousands of production cycles" (TL-6) | SME 2009; CompositesWorld | qualitative |
| Steel / aluminium autoclave layup tool | **no published cycle count found** | — | gap |
| Forged-steel compression dies (SMC) | up to 200,000 parts a die set | CompositesWorld 2007 (TL-10) | trade press |
| Steel SMC tool / open mould / RTM | > 100,000 / > 1,000 / > 1,000–5,000 mouldings | JHM Technologies 1998 (TL-11) | vendor, old |
| Compression-mould steel | AISI 4140 pre-hardened to 30–32 HRC, nickel or chrome plated | CKN A302 (TL-12) | knowledge base |

**What this says about the 500-part constant.** 500 is a sourced life for a **carbon/BMI composite tool**. The rule's
own comment says "invar or tooling prepreg", and the £14,000/m² rate is unsourced. Each of the 222 tools in service
would see 1,000,000 ÷ 222 = **4,505 cure cycles**. That is more than any composite-tool life published (≤ 1,000), so the
volume needs a metal tool. For Invar the only published statements say it lasts the programme, with no number. The
reviewers' "3,000–10,000+" and "steel / Invar 5,000+" are judgement, and none of the pages I could open gives them.

### 1.2 Layup deposition rate

| Method | Rate | Conditions | Id |
|---|---|---|---|
| Hand layup | **2 lb/h = 0.91 kg/h** | flat carbon/epoxy charge, 4–40 plies | LR-1 (CW 2003) |
| Hand layup | "a few pounds per hour" | general | LR-3 (CW KC) |
| ATL, 3 in tape | **20 lb/h = 9.1 kg/h** | same flat charge, ply drops included | LR-2 (CW 2003) |
| AFP | > 45 kg/h nominal; 787 achieved ~1/5 of a projected 50 kg/h; large systems now 100 kg/h | aircraft-scale skins | LR-3, LR-4 |
| Vendor blog | hand 2–3, AFP 10–150 kg/h | no citation, contradicts itself | LR-5 (context only) |

**The current 0.06 h/m²/ply equals 6.46 kg/h.** That is ATL speed on a flat charge (9.1 kg/h), not hand layup
(0.91 kg/h). At the sourced hand rate the stiffener's 0.313 kg takes **20.7 min instead of 2.9 min**, which is
0.427 h/m²/ply at 0.3875 kg/m² a ply. A hat section is harder to lay than a flat charge, so 0.91 kg/h is an upper
bound for its hand rate. The Bristol ~1 kg/h figure (Crowley et al. 2016) could not be opened (403) and is not used.

### 1.3 Autoclave cure cycle and capacity

- **180 °C aerospace epoxy (Hexcel M21, PDF):** heat-up at 1–2 °C/min, a 120 min hold, cool-down at 2–5 °C/min and venting
  at ≤ 60 °C (AC-1). My arithmetic gives 80–160 + 120 + 24–60 min = **3.7–5.7 h** before load, pressurisation and unload.
  The rule's 3.0 h is below that range.
- **Fast-cure epoxy (Hexcel M77, PDF):** autoclave cycle of 10 min to 140 °C, 7 min dwell and 6 min cool, **23 min** in all (AC-2).
  Hexcel adds that autoclave cycles are longer than press cycles because "the large autoclave mass takes a long time to
  heat up and cool down". With 20 metal tools in a load, tool heat-up would govern, and no published figure covers it.
- Automotive prepreg in an autoclave ran "almost 2 hours" before RapidClave (Plasan / Corvette). For aerospace, 8 h is
  "considered fast" (AC-3).
- **Bed size.** The UW autoclave is 100 in × 35.4 in (≈ 2.5 × 0.9 m), heats at up to 10 °F/min and cools at 3 °F/min
  (AC-4). This supports the rule's 2.8 × 1.0 m bed as a small-autoclave class. Scholz's motorsport unit is Ø1.5 × 3.3 m
  (AC-5). I found no published "parts per load" norm, and the 20-a-load cap stays unsourced.
- **Autoclaves implied** at 200k/yr with 20 parts a load, 4,000 h and OEE 0.8: **9.4 at 3.0 h, 11.7–17.7 at 3.7–5.7 h**.

### 1.4 Volume routes (what runs at 100k–200k a year)

| Route | Cycle | Annual per tool / line | Id |
|---|---|---|---|
| **Prepreg compression moulding (PCM)** | press **8 min at 140 °C, 8 MPa** (GT-R); preforming < 5 min; cure **2 min at 150 °C** (M77); takt **≤ 3 min** for automotive prepregs (Solvay) | **50,000–84,000 a tool** (5- and 3-min-cure prepreg) | VR-1, VR-2, VR-3 |
| HP-RTM | **3–7 min** realistic; BMW < 10 min; preforming is slower than the mould | **50–80k a line needs ≤ 3 min**; the first serial lines (2013) made parts for ≤ 30k vehicles | VR-5, VR-6, VR-7 |
| Wet compression moulding | ~180 s (Dieffenbacher), < 60 s (Dow), 75–135 s (Hexion) | > 73,000 a line (paper), 4 operators + 1 foreman | VR-8 |
| SMC / compression (incl. SMC-C) | 30–150 s cure; 1–4 min cycle | > 10,000 parts; "high volume (100,000 parts per year)"; steel dies up to 200,000 parts | VR-9, VR-10, VR-11 |
| Prepreg + autoclave | hours | "14,000 to 40,000 parts would be considered very high volume for CFRP prepreg"; 20–25k a year on one line is its sweet spot; "In automotive, you haven't reached high volume until about 100,000 parts" | VR-4 |

At 200k a year the sources leave no single-tool route for continuous carbon. That would take 3–4 PCM tools
(200k ÷ 84k to 50k), 3–4 HP-RTM lines or ~3 WCM lines. Only SMC / C-SMC is documented at 100k+ on steel dies, and it uses
chopped fibre, which changes the properties.

## 2. Gaps (not found in a page I could read)

1. **Invar, steel and aluminium autoclave layup tools: no cycle count** and no resurfacing interval. Ask a tool maker
   (Invar / steel) for a quote with a stated life. The sterc.org paper ("several thousand parts", per a snippet) did
   not resolve and is not used.
2. **Tool cost per m² by material** (Invar, steel, BMI, PCM steel matched tool, HP-RTM tool): nothing sourced.
   The £12k + £14k/m² stays unsourced.
3. **Hand layup of a shaped (hat) part, debulk time, ply cutting time:** only flat-charge rates were found. The Bristol
   papers that measure complex shapes were refused (403).
4. **Vacuum-bag consumables £/m²** (film, breather, peel ply, sealant): no published price found. Needs a distributor
   price list (Airtech / Aerovac / Solvay).
5. **Autoclave parts-per-load norm and load / pressurise / unload time:** not found.
6. **Pultrusion of a carbon/epoxy hat:** only machine pulling-speed envelopes (0.04–5 m/min, CX-1) were read, and no process rate.
7. **PCM / HP-RTM tool life in parts:** the only figures are SMC steel dies (100k–200k), so they are analogues.
8. MIT (Goel / Gutowski 2000) was rate-limited (429) and is worth a retry for hand-layup and equipment-cost models.

## 3. PROPOSAL (for the rule change round — not implemented)

> Clearly a proposal. Each number carries its data.json id. Anything without an id is labelled an assumption.

### 3.1 Composites constants

1. **Tool life by tool material.** This replaces the single `TOOL_RATE_PER_M2.prepreg_layup.life` (new `COMP_TOOL_LIFE`):
   - `cfrp-epoxy`: **300** cycles, the upper bound of "< 300" (TL-1)
   - `cfrp-bmi`: **500** cycles (TL-3 / TL-5), band to 1,000 (TL-4)
   - `nickel-shell`: **1,000** cycles, the lower end of a vendor range (TL-8), labelled vendor claim
   - `invar` / `steel` (autoclave layup): **no wear replacements within the programme**, printed as "metal layup tool:
     the published statements say it lasts the programme (SME 2009; CompositesWorld) — no cycle count published;
     resurfacing not included — confirm with the tool maker". Resurfacing goes on the commodity's "Not included" list.
   - `steel-matched` (PCM / HP-RTM / WCM / SMC): **100,000** parts (TL-11 "> 100,000"), band to 200,000 (TL-10).
2. **Choose the tool material from the cycles each tool sees.** Cycles a tool = amortisation volume ÷ tools in service.
   Choose the cheapest material whose life is at least that figure, and fall back to metal. On the hat stiffener that is
   4,505 cycles, which leads to a metal tool and **no replacements**. Tooling then falls from 2,000 tools to the tools in
   service (≈ 222–407 depending on items 3–4; 222 × £12,671 = £2.81/part at today's unsourced tool price). The tool
   price for metal must stay labelled unsourced, and the reports print tools in service and replacements separately.
3. **Layup rate in kg/h by method, ply mass ÷ rate.** This replaces `layupHrPerM2PerPly`:
   - hand **0.91 kg/h** (LR-1, flat charge, an upper bound for a shaped part) → 0.427 h/m²/ply for 0.25 mm CF
   - ATL **9.1 kg/h** (LR-2, flat charge). It needs a forming step for a hat, which is unsourced.
   - Print the method. Today's 6.46 kg/h is ATL-class and must not be called hand layup.
4. **Cure time by resin system** (an advisory question `composites.resinSystem`):
   - 180 °C aerospace epoxy: **3.7–5.7 h** (AC-1 arithmetic), centre 4.7 h, with the range in the band
   - fast-cure 140–150 °C epoxy: **0.38 h** autoclave (AC-2), plus tool heat-up flagged unsourced
   - Today's 3.0 h has no source and lies outside both.
5. **Capacity line.** Print the autoclaves implied: 9.4 at today's inputs and 11.7–17.7 on M21 timing.
6. **Route alert.** Prepreg with an autoclave above **25,000 a year** prints "Prepreg / autoclave is a low-volume route:
   20–25k parts a year on one line is its sweet spot; automotive high volume starts at ~100k (Huntsman, ACMA 2016)"
   (VR-4). The threshold quotes the source and is not a judgement.

### 3.2 Volume route the comparison should offer: prepreg compression moulding (PCM)

PCM keeps the **same prepreg** as the costed route, so it stays in the material family. That is the rule
`route-feasibility.ts` applies.

| Input | Proposed value | Id |
|---|---|---|
| Preform | ≤ 5 min a part (1 min heat to 60–70 °C, 0.3 MPa form, cool) | VR-1 |
| Press cycle | **8 min** at 140 °C (only published total cycle), fast case 3 min takt | VR-1, VR-3 |
| Cure (grade table) | 2 min at 150 °C … 5 min at 130 °C (Hexcel recommends 130 °C / 5 min for compression) | VR-2 |
| Pressure → press | **8 MPa** × projected area. Hat: 0.398 × 0.120 m → **382 kN (≈ 39 t)** | VR-1 (arithmetic) |
| Tool | matched steel, AISI 4140 30–32 HRC, plated | TL-12 |
| Tool life | 100,000 parts (band to 200,000) | TL-11, TL-10 |
| Capacity check | 50,000–84,000 parts a tool a year → **3–4 tools at 200k** | VR-1 |
| Tool price | **unsourced** (gap 2), a labelled assumption | — |

The comparison should also offer, with their sourced cycles:
- **HP-RTM** (dry NCF + fast epoxy, 3–7 min, ≤ 3 min for 50–80k a line; VR-5 / VR-6)
- **C-SMC** (1–4 min, 100k/yr, steel dies; VR-9 / VR-10), with a caveat: chopped fibre, so the properties are not the same as UD prepreg
- WCM (VR-8), for simpler geometry

Pultrusion of the constant hat section has no sourced rate (gap 6). It goes to "Not costed: no published line rate".

### 3.3 Side findings in other `TOOL_RATE_PER_M2` lives (unsourced today)

- `hand_layup.life 200`: JHM (TL-11) gives an open mould **> 1,000**.
- `rtm.life 5,000`: matches JHM's "> 1,000 to 5,000", but that is a 1998 **composite** RTM tool, and the rule's comment says "matched steel die".
- `vartm 300`, `filament_winding 2,000`, `pultrusion 20,000`: no source found.
- The module schema hints ("Al mould: 500–2000; CFRP mould: 100–400; invar: 2000–5000") are unsourced and should cite this file or be removed.
