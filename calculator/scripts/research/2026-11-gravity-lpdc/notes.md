# Gravity die and low-pressure die casting research: cycle, impressions, capex, die, T6, LPDC, cutting tools (5 Nov 2026)

This round is research only. It looks at the weak inputs behind **Part1**, a motorcycle triple clamp. Part1 is a 1.36 kg
as-cast LM25 / A356-T6 gravity die casting, machined, costed in China at 200k a year over 5 years, ex-works. It does not
touch the engine or any rate book. Every item in §2 is a proposal: rates move only through the generators and a dated
config (`scripts/uk-book.ts`, `scripts/country-book.ts`, `scripts/rate-refresh/*/build-config.py`).

- **Data.** `data.json` holds 30 rows, in the same shape as `../2026-11-phase-b/data.json`. Each row has:
  - the value, currency, year and unit;
  - what the figure includes;
  - the URL read, the date and an exact quote;
  - `evidence_grade`, `readMethod` and, where it is money, `gbp_at_book_fx`.

  Every quote was checked by a script against the saved page text (whitespace collapsed) before it was written. A quote
  that joins two passages uses " ... " between them. Where a row quotes two pages, " || " separates them.
- **Grades.**
  - A = a published price, award, official statistic or standard.
  - B = a peer-reviewed paper, a government study, a textbook, trade press or an analyst.
  - C = a vendor claim or a dealer list price.
  - D = our inference.

  Where a figure is A but our *reading* of it is D (for example, an award whose scope is not shown), the row says so.
- **FX.** £1 = €1.1965 = US$1.3344 = ¥8.88. Nothing is escalated.
- **How pages were read.**
  - Plain `curl` (`--compressed`), with no user-agent change.
  - The publishers' own public APIs, with no key: Europe PMC REST, UK Contracts Finder REST, TED Search v3 and Wikipedia
    raw wikitext.
  - Blocked pages are listed in §4. None was bypassed.
- **Part1 baseline.** The baseline is the China 200k trace of 4 Nov 2026 (`scratchpad/p1/sc.txt`, `byrule.txt`):
  - **Total: ¥68.71** at 9 % overhead and 8 % margin. The O&M multiplier is **1.1772** (1.2096 at the 12 % China default,
    which gives ¥70.57).
  - The gravity op: 0.08 h × 1/(1 − 3 % rejects) = 4.95 min, at a machine rate of ¥55.27/h ÷ 0.80 OEE plus a labour rate
    of ¥34.42/h × crew 1. That is **¥8.54**.
  - T6: ¥4.5945/kg × 1.357 kg = **¥6.23**. This is the UK rate of £1.10/kg × 0.4704 (a steel Q&T ratio) × 8.88.
  - Permanent mould: ¥29,704 a set; 50k life; 21 sets = **¥0.62** a part.
  - Cutting-tool wear: 5.9 min × ¥0.3552/min (£0.04) = **¥2.09**.
  - Fettling: 2 min = **¥1.18**.

## 1. Findings

### 1.1 Gravity die casting: cycle, impressions, crew, OEE (brief item 1)

**What the sources say about the die cycle** (one die opening; castings a cycle = impressions):

| Row | Source | Cycle or output | Part |
|---|---|---|---|
| G2 | FMT 2009 (Hall), tilt-pour | **single machine 12–30 cycles/h (2–5 min)**; on a rotary table, 5-min castings at 120/h with one operator and robots; ~95 % uptime | generic aluminium PM |
| G1 | FMT 2016 (Vondriska), 8-station turntable | 75 s index → 48 castings/h; 36 s index → 96/h | semi-permanent moulds |
| G3 | Gauss (Italpresse) cell at Wuling, Liuzhou, 2011 | 11 heads/h a machine (5.5 min); **one operator on four machines** | cored cylinder heads (heavy) |
| G4 | Indonesian journal 2025 | 3.0 → **1.24 min/part** after mechanising | small motorcycle accessories |
| G5 | Bonollo 2005 (Italy) | GDC **0.15 h/pc** (9 min) for 6 kg and 13 kg; riser cut + deburr 5 min manual | 6–13 kg boxes |
| L1 | Materials 2024, LPDC knuckle | fill 10–12 s; **solidified at 142 s** | AlSi7Mg0.3 knuckle (heavier than Part1) |

- **The book's 0.08 h (4.8 min) a casting, with one impression and one operator, is at the slow end for a 1.36 kg part.**
  It matches a 6–13 kg casting (G5) or a cylinder head (G3).
  - The sources put a small part's die cycle at 2–3 min: G2's 2–5 min band at the fast end, and G4's 1.24–3 min.
  - A knuckle (heavier, thicker) solidifies in 2.4 min under pressure (L1).
- **Impressions.** No source states a rule for choosing 1, 2 or 4 impressions. The general guidance is that small castings
  go multi-cavity to spread the cycle. In the brief's terms, the binding limits are:
  - platen / mould weight (the JD-700 class takes a 250 kg mould, K5);
  - pouring time from one ladle;
  - thermal balance.

  A 1.36 kg part with a 138 cm² parting footprint (the trace) fits two impressions on a 750 × 350 mm die holder (K5).
  **That 2 is the right count is our inference (D)**; 4 is plausible only with robot ladling.
- **Crew.**
  - Gauss: one operator for four tilt machines with hand-set cores, which is 0.25 a machine (G3).
  - Hall: one operator for a rotary table with tending robots (G2).
  - The book charges 1.0 a machine (`casting.manning`, "one operator to a gravity cell").
- **OEE.**
  - Vendor claims: Artimpianti > 86 % OEE, 95 % availability (G6, C); Hall ~95 % uptime (G2, C).
  - The book's 80 % sits below both. **Keep 80 %** until a plant figure exists: both claims are marketing.
- **Yield.**
  - DOE's aluminium permanent-mould plant ships 0.65 t a tonne melted (G7, B, all losses).
  - Bonollo's GDC yields are 0.73 and 0.80 on 6–13 kg parts (G5).
  - The book's 0.6 band midpoint is supported. Leave it.

### 1.2 Capex: tilt-pour machine, robot cell, LPDC (brief item 2)

| Row | What | Value | £ at book FX | Grade |
|---|---|---|---|---|
| K1 | **Book anchor**: Brunel / Tecnofond tilting cell, 2017 | £82,769 | 82,769 | A as an award, D as a production cell |
| K2 | US tilt-pour machine + HPU + controls, 2009 | < US$75,000 | < 56,205 | C |
| K3 | Bonollo 2005: GDC installation / LPDC installation | €100,000 / €200,000 | 83,577 / 167,154 | B |
| K4 | China, Jingda JD-700 tilting machine | US$14,700 | 11,016 | C |
| K5 | China, Jingda tilting machine "with robot pouring" | US$19,000–19,800 | 14,239–14,838 | C (robot in or out not stated) |
| K6 | China LPDC: Boqiao / Delin gantry LPDC with 1.8 t furnace | US$40–100k / US$200–250k | 29,976–74,940 / 149,880–187,350 | C |
| K2 | US LPDC cell, 2009 | US$500,000 | 374,700 | C |

- **The book's £82,769 is a European or UK price for a tilting machine.** K2 and K3 bracket it: £56k (machine only, 2009 US)
  and £84k (2005 Italian installation).
- **China's own machines list at £11–15k** (K4, K5). The China book holds capital AT PAR (`capitalHeldFactor 1`), so a
  Chinese gravity cell is costed on the UK £82,769.
- **No published price was found** for a robot ladle, a holding furnace, or a rotary carousel (§3).
- **For LPDC, the published ratio LPDC ÷ GDC investment is about 2×** (K3), and in the US 2009 ratio it is up to 6.7×
  (K2: US$500k cell v < US$75k machine).

### 1.3 Gravity die (H13): price and life (brief item 3)

- **Price.**

  | Source | Mould | Price | £ at book FX |
  |---|---|---|---|
  | D1, China | H13 / P20 gravity mould for a **motorcycle caliper** | US$3,800 (listing range US$3,000–5,000) | £2,848 (£2,248–3,747) |
  | D2, China | wheel gravity mould / LPDC wheel mould | US$5,150 / US$10,222 | £3,859 / £7,660 |
  | K2, US 2009 | permanent mould | US$15–50k | — |
  | K3, Italy 2005 | die for a 6–13 kg part, same for GDC and LPDC | €16k | — |

  **The tool's Part1 China mould, ¥29,704 = £3,345 (= US$4,464), sits inside the Chinese listing band for a caliper
  mould.** The level is supported; complexity (the 3 slides) is not tested by any listing (§3).
- **Life.**
  - 10,000–120,000 cycles, limited by thermal fatigue and erosion. H13 lasts "several times" grey iron (D3: Degarmo et al.
    via Wikipedia, B; D4 the same range).
  - Wrought H13 is the best in thermal fatigue; the material is chosen by the number of castings bought (D5, B).
  - LPDC dies are "re-used over many thousands of casting cycles", with a cast-iron frame and tool-steel wear areas (D6, C).
  - **No source gives a castings-to-scrap figure for a 1–2 kg aluminium H13 gravity die, nor the cost of mid-life
    refurbishment** (re-nitriding, cavity inserts).
  - Note an inconsistency in the model: the book's 50k flat sits in the lower half of the range, yet the toolmaker model
    (`estimateGravityMouldCost`) prices **cast-iron blocks**. The life and the material priced should be one decision.

### 1.4 T6 heat treatment (brief item 4)

- **No published toll price was found, for China or the UK** (§4 lists the searches).
  - The only ¥/t figure seen (¥2,000/t added by solution + age, on forgings) is on Zhihu, which answered 403. It is
    **not used**.
- **Bottom-up (H3, D) from a Chinese T6 set's published specification (H1, C).**
  - The set: a 163 kW drop-bottom solution / quench furnace, a 30 kW ageing furnace, 1.5 t loads, US$40–60k.
  - Costed on the China book's tariff and labour, it gives **¥1.0–2.0/kg, central ¥1.5/kg**:

    | Element | ¥/kg |
    |---|---|
    | Energy: 0.7–1.0 kWh/kg × ¥0.630 | 0.44–0.63 |
    | Furnace operator | ≈ 0.29 |
    | Capital | ≈ 0.05 |
    | Baskets, quench water, maintenance, toll overhead + margin | +30–60 % |

  - The sensible-heat floor is 0.14 kWh/kg (520 K × 0.96 kJ/kg·K). Pilot work bounds the heat-up share: charging hot saves
    0.072 kWh/kg (H2, B).
- **The book's ¥4.59/kg in China is about 3× this.** The cause is twofold:
  - the UK £1.10/kg is labelled "engineering-typical, not sourced";
  - it is moved by `heatTreatServiceFactor`, which is the ratio of a **steel quench-and-temper** model, not an aluminium T6.
- **Continuous v batch.** No throughput or energy figure for a continuous T6 line for castings was read (the wheel-line
  pages were blocked, §4). The bottom-up is a batch estimate.

### 1.5 Low-pressure die casting (brief item 5)

- **Cycle.**
  - A knuckle fills in about 12 s and solidifies in 142 s (L1). Add die open / extract / spray, which is not published.
  - Bonollo measures LPDC production time **41 % below GDC** (0.067–0.088 h v 0.15 h, G5 / L2).
  - Hall says the same 12–30 cycles/h as tilt-pour (G2).
  - Degarmo (via Wikipedia) says LPPM cycles are *longer* than gravity (L3). Kurtz: "slower casting cycles" (G8).
  - **The sources disagree.** Treat LPDC cycle as about equal to gravity per die, ± 40 %.
- **Yield.** "Typically over 90 %", and 0.99 in Bonollo's case (L2); "no need for feeders" (G8). Gravity is 0.6–0.8.
- **Scrap.** 3 % v 5 % (G5).
- **Fettling.** LPDC 1 min of loading plus an automatic ingate cut; GDC 5 min manual (G5).
- **Capex.** About 2× gravity (K3), or more (K2, K6).
- **Die.** The same €16k as gravity in Bonollo (K3); a China wheel die is US$10.2k (D2).
- **Uses.** Wheels (most), chassis / suspension parts, battery housings, e-motor housings, crankcases (K7, L1).
- **OEE.** Not found separately.
- **Cost v gravity.** Bonollo's break-even is 2,000–6,000 parts a year for 3–13 kg parts. LPDC is cheaper above it (L2).
  **But in that paper the gravity risers were sold as scrap at €0.70/kg against €1.58/kg bought.** CostVision remelts
  runners in house (only the 4 % dross is lost), so most of the yield gap is worth only melt energy and dross in this model
  (see §2.2).

### 1.6 Cutting-tool cost in aluminium (brief item 6)

- **Tooling is about 3 % of total production cost** across manufacturing (T1, B).
  - A 30 % cheaper tool, or a 50 % longer life, cuts part cost by about 1 %.
  - For Part1 at the costing's own total, 3 % of ¥68.71 = **¥2.06**. That is the same as the ¥2.09 costed. On this
    evidence the £0.04/min is **not shown to be wrong**, but it is not proven either: the 3 % is all-materials and
    all-industries.
- **What was not found** (pages blocked or paywalled, §4):
  - no PCD / carbide tool-life figure in A356 / AlSi7Mg;
  - no size-matched Chinese domestic carbide price;
  - no UK list price.
- **The China question is open.** The book applies the UK £0.04/min × FX in China. The tools are a traded good, but Chinese
  domestic carbide (ZCC-CT and others) likely lists below European brands. No like-for-like price was read.

## 2. Proposals: how each item enters the model, and the ¥ effect on Part1 (China, 200k, 9 % / 12 % overhead)

| # | Proposal | Enters through | Effect on Part1 before O&M | Basis |
|---|---|---|---|---|
| 1a | **Gravity cycle by die opening, not a flat 0.08 h a casting.**<br>• The die cycle is a rule on the measured section (2·V/S, as HPDC already reads), banded 2–5 min for aluminium (G2), with the fast end for ≤ 2 kg (G4, L1).<br>• Labelled "engineering band from G1–G5; replace with the foundry's cycle sheet". | `cost-input-rules/commodities/casting.ts` `casting.cycleTimeSandGravHr` (the `band` at ~:948): a gravity branch like the sand / investment branches above it | 1 impression, 3.0 min, crew 0.5: ¥8.54 → ¥4.45, **−¥4.09** | G1–G5, L1 (B/C); the 2·V/S mapping is D |
| 1b | **Impressions a die for gravity.** Today `partsPerCycle` is hard-coded to 1 (`modules/casting.ts` ~:279).<br>• Add `gravity.impressions`, chosen like `cavitiesFor` / `impressionPlan`: the fit on the die holder, the mould-weight limit, the ladle (pour) mass, and cost-ranked amortisation.<br>• Pass it to the mould model (`estimateGravityMouldCost` already takes `cavities`). Count mould life in die cycles. | `modules/casting.ts` (`partsPerCycle`), casting rules (new rule + `RULE_PATH_MAP` entry for headless), `casting-tooling.ts` | With 1a, 2 impressions × 3.0 min = 1.55 min a casting: **¥8.54 → ¥2.22, −¥6.31**. Mould ×1.75 (two cavities), so the first set is +¥0.02 a part | G2 / G4 (cycle), K5 (die holder); the count is D |
| 1c | **Crew 0.5 a gravity machine** (a ¼–½ range: Gauss 1 : 4, G3; robot cell 1 a table, G2), stated as such. | `casting.manning` rule | inside 1a / 1b (labour ¥2.84 → ¥0.44 at central) | G2, G3 (C) |
| 2 | **China gravity cell capex**: replace the at-par £82,769 with a Chinese cell build-up.<br>• Machine (K4 / K5): US$15–20k.<br>• Holding furnace + ladle / robot: ESTIMATE, until a price is read.<br>• Label the result ESTIMATE. | `scripts/rate-refresh/2026-10-china.json` machines (via `china-2026-10/build-config.py` → `scripts/country-book.ts`); a new research item `capex.grav-die-cast-std.CN` | If the cell is about half the UK capex, the capital-linked share (~48 % of the UK build-up) halves: machine ¥/h −20–25 %; **about −¥0.4** on the central 1b | K4–K6 (C); the build-up is D |
| 3 | **Die life as one decision with the die material.** H13 cavities: 100k castings (upper half of D3 / D4's 10k–120k); or keep cast-iron blocks at 50k. Count life in die cycles × impressions. | `casting.dieMouldLife` (~:850–873) + `estimateGravityMouldCost` material line (cast-iron → H13 for the long-life option) | 1 impression: 21 → 11 sets, **−¥0.30**; 2 impressions: 6 sets, −¥0.31 | D3–D5 (B); the choice of 100k is D |
| 4 | **Aluminium T6 as its own build-up, not £1.10 × a steel Q&T ratio.**<br>• kWh/kg (solution + age) priced at the country tariff by the core (`rawMaterial.energyKwh`).<br>• Plus furnace labour and capital as a station.<br>• China lands at ¥1.0–2.0/kg; label the energy and the load ESTIMATE until a toll price arrives. | `modules/casting-advisor.ts` `HEAT_TREAT_COST_PER_KG.t6` (~:473) → a T6 station in the casting rules (like `NDT_STATION`); `regional-services.ts` must not apply `heatTreatServiceFactor` (steel Q&T) to an aluminium T6 | ¥4.59 → ¥1.5/kg: **−¥4.20** (range −¥3.52 at ¥2.0 to −¥4.88 at ¥1.0) | H1 (C), H2 (B), H3 (D) |
| 5 | **Cutting-tool £/min: keep £0.04 (UK), label it against T1, and open a China factor.** No change until a domestic price is read. | `machining-time.ts` `TOOL_COST_PER_CUT_MIN` (~:60); a `countryFactor` basis 'global' v a China consumable factor (`regional-services.ts`) | Not proposed. For scale: a China tool price at 50–75 % of UK would be −¥0.52 to −¥1.05 | T1 (B); the China level is a gap |
| 6 | No change to yield (0.6), OEE (0.80) or fettling (2 min). | — | 0 | G5–G7 |

**Net on Part1, China, 200k** (8 % margin; ¥ at £1 = ¥8.88):

| Case | Items | Δ before O&M | Total at 9 % (×1.1772) | Total at 12 % (×1.2096) |
|---|---|---|---|---|
| Now | — | — | ¥68.71 (£7.74) | ¥70.57 (£7.95) |
| Conservative | 1a at 1 impression, 3.5 min, crew 1 (−¥2.31); 3 (−¥0.30); 4 at ¥2.0/kg (−¥3.52) | −¥6.13 | **¥61.50** (£6.93) | ¥63.16 |
| Central | 1a + 1b + 1c: 2 impressions, 3.0 min, crew 0.5 (−¥6.31); 3 (−¥0.29 net of the bigger first set); 4 at ¥1.5/kg (−¥4.20) | −¥10.80 | **¥56.00** (£6.31) | ¥57.51 |
| Low | 2 impressions, 2.5 min, crew ⅓ (−¥6.81); 3 (−¥0.29); 4 at ¥1.0/kg (−¥4.88); tools at 50 % in China (−¥1.05) | −¥13.02 | ¥53.38 | ¥54.82 |

- **The hand estimate of ¥57–63 is the conservative-to-central range at the 12 % China default.** The two items that move
  it are the gravity op (cycle, impressions and crew together: up to −¥6.8) and T6 (−¥3.5 to −¥4.9).
- Capex (item 2, about −¥0.4) and die life (item 3, −¥0.3) are small.
- Capacity check at the central case: 200k × 1.55 min ÷ 0.80 ÷ 60 = 6,440 h, about 1.0 gravity machine at the book's
  6,336 h. One cell can run the part.

### 2.1 The gravity rule pack after 1a–1c (what a reviewer would see)

- **Die cycle.** Printed as "die cycle X min (aluminium gravity band 2–5 min, sources G1–G5; section 2·V/S = Y mm) ÷ N
  impressions".
- **Impressions.** The binding limit is printed: fit, mould weight, ladle, or cost.
- **Crew.** "0.5 operator a machine (Gauss cell 1 : 4 with hand-set cores; robot-tended tables 1 a table)".
- **Mould life.** In die cycles × impressions, matching the material priced.
- **Screen and headless.** Every new rule needs a `RULE_PATH_MAP` entry (`tests/rule-path-coverage.test.ts`). The shadow
  model in `scripts/arith-audit/` that encodes the casting op must change with it.

### 2.2 LPDC as a minimal new casting subtype

**The data supports one, with labelled estimates.** It would not change Part1's China cost much under CostVision's
in-house remelt. With yield 0.9 v 0.6, the poured metal per good casting falls from 2.33 kg to 1.55 kg. In this model that
saves only:

- melt energy: 0.78 kg × 0.65 kWh/kg × ¥0.63 = ¥0.32;
- dross: 4 % of 0.78 kg × ¥21.42 = ¥0.67.

That is about **−¥1.0**, plus the fettling minute (−¥0.57). Against this sits a machine about 2× dearer. **LPDC matters
where integrity is asked** (safety-critical knuckles and clamps: the porosity and properties of L1 / L3) **and at high
mass**, not on price alone at 1.4 kg.

What a minimal `lpdc` subtype needs:

1. **Type and module.**
   - `CastingSubtype` in `modules/casting.ts` gets `'lpdc'`.
   - A `case 'lpdc'` like gravity: one op `Low-Pressure Die Casting` on a new machine, `partsPerCycle` = impressions, and
     the stalk as a perishable tooling item (€1,500 a stalk, K3 — life not found, ESTIMATE).
2. **Advisor.**
   - `CASTING_PROCESS_REFERENCE.lpdc` in `modules/casting-advisor.ts`:
     - yield band [0.85, 0.95] (L2, G8);
     - cycle band '2–6 min/die' (L1, G2, G5);
     - weight range from the wheels and knuckles cited, up to 70 kg (Bonollo states castings "up to 70 kg");
     - die-castable alloys only, like gravity.
   - `castingProcessRefusal` follows gravity's alloy rule.
   - A selection branch for "aluminium, safety-critical or pressure-tight, medium-to-high volume".
   - Routing: answered through `casting.processChoice`, so route compare gets an LPDC row.
3. **Rule pack** (`cost-input-rules/commodities/casting.ts`), each rule with `RULE_PATH_MAP`:
   - cycle (fill + solidification on 2·V/S + open / extract, banded on L1);
   - impressions;
   - crew (ESTIMATE 0.33–0.5);
   - die cost: the toolmaker model at gravity's level plus the stalk / furnace interface, as Bonollo prices the die the same
     (K3);
   - die life (Foseco "many thousands", D6; take gravity's figure, labelled);
   - fettling 1 min + an automatic gate cut (G5);
   - scrap 3 % (G5);
   - T6 as gravity.
4. **Rate book.** A UK machine `lpdc-cell` through the UK generator (`machines.added`, as `mach-hmc-400` was):
   - capex ESTIMATE £170–375k (K3 €200k = £167k in 2005; K2 US$500k = £375k in 2009, cell);
   - held capital in other books, with China from K6 (US$40–100k machine; US$200–250k with furnace).
5. **Feasibility.** `route-feasibility.ts` and `server/services/route-compare.ts`:
   - die-castable alloy;
   - a section that can feed from one bottom gate (no riser);
   - sand cores allowed (G8).
6. **Report text.**
   - An operation name in `operation-names.ts`, a commodity label for the subtype, and `report-standard.ts` supplier
     questions: stalk life, cycle sheet, impressions, furnace sharing.
   - A `safetyConsequence` NDT step as gravity.
7. **Tests.** A parity test (screen = headless), a hand-calc of one LPDC part, and a route-compare row next to gravity.

## 3. Gaps that only a supplier quote (or a plant figure) settles

1. **Part1's actual gravity cycle sheet.** The die cycle (fill, solidify, open, spray), the impressions, and machines per
   operator. Also whether the foundry tilts by hand, by machine, or by robot ladle. The sources give a 2–5 min band, not
   this part.
2. **A Chinese T6 toll price, ¥/kg**, for A356 castings by the batch. Also its load (castings per tonne of basket) and
   cycle. And a UK toll price for the same. No public price list was found in either country.
3. **Gravity die life and refurbishment** for a 1–2 kg aluminium part in H13 (or iron blocks with H13 inserts): castings to
   scrap, re-nitride interval and cost. Also the die maker's price **with 3 slides**, two impressions v one.
4. **A Chinese gravity cell's full price**: tilt machine, holding furnace (kW, kg), ladle robot, die cooling. And a UK / EU
   production tilt-pour cell or rotary carousel. Only machine-only list prices and a research-cell award are public.
5. **LPDC on a part like Part1**: cycle and impressions, stalk life, machine and furnace price, and OEE.
6. **Cutting tools in China**: the supplier's tool cost per part or per minute in AlSi7Mg (PCD v carbide), and a
   size-matched domestic carbide price against a European brand.
7. **OEE of a gravity cell** measured in a plant, not a vendor claim.

## 4. Search record (blocked or empty)

- **Blocked to plain requests, not bypassed:**
  - NED University internship report on Atlas Engineering. A Pakistani motorcycle-parts gravity foundry, which a search
    snippet said covers a handlebar connector at 2 min a cycle. curl failed TLS verification (the server's certificate
    chain), WebFetch got 503, and the Internet Archive reset the connection. **Its figures are not used.** It is the
    closest part to Part1 found, so it is worth a retry.
  - Zhihu (403): two articles on aluminium heat-treat and forging prices.
  - opendata.uni-halle.de: a bot challenge, so the Scharf et al. 2020 heat-treatment energy paper was not read.
  - mdpi.com (403).
  - IndiaMART (403): gravity machine and heat-treat service listings.
  - Exapro (403): used gravity machines.
  - Cromwell UK (403): Sandvik Plura prices.
  - Rubix UK (403).
  - Zoro (403).
  - Misumi Japan (429): a ZCC GM-3E price.
  - Modern Machine Shop (403): tool-cost share articles; the American Machinist page was read instead.
  - ISCAR wheel brochure (403).
  - directindustry PDF of a continuous T6 line (403).
  - ESI Ennore GDC case (403).
  - Open University gravity page (403).
  - TED notice pages: these answer with HTTP 202 and an empty body (a challenge); only the API fields were used (K8).
- **Not found or empty:**
  - TED full text for Niederdruckgießmaschine, Kokillengießmaschine, Kokillengießanlage and "low pressure die casting"
    returned 0. Only university buys returned anything (K8; Brunel "Foundry moulds" £160–250k, not read).
  - UK Contracts Finder: "tilting gravity casting" found only the book's Brunel award (K1). "Low pressure die casting"
    timed out twice.
  - Chinese tenders and prospectuses: no unit price for a 重力铸造机 or 低压铸造机 was found.
  - A published castings-per-cavity rule for 1 v 2 v 4 impressions.
  - A gravity die life figure for small parts.
  - A T6 toll price or a T6 kWh/kg for castings (DOE 2004 gives a melt profile only).
  - PCD / carbide tool life in A356.
  - A UK or EU used-machine price for a Kurtz or LPM low-pressure machine: listings say "price on request".
- **Pages changed since indexing:** the Bohua casting-cost blog posts (a search snippet quoted US$1.00–2.50/kg for T6) no
  longer carry that figure. **Not used.**
