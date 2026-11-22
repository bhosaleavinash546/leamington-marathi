# Round 6 (22 Nov 2026) — more ICs and SMT parts, priced for 200,000 boards a year

Read fully, with `../RULES.md`, `../2026-10-13-gap/RULES-R4.md`, `../2026-10-13-gap/RULES-R4b.md` and
`../2026-10-13-r5/RULES-R5.md`. **All of them apply in full** (franchised distributors only, breaks ≥ 100, allowed currencies
only, no rounded "about" figures, no VAT-inclusive China storefronts, no Source ESB / ciiva / OEMsTrade / JLCPCB /
punchouttest / fat.lcsc / Rochester / brokers, URL + date on every price, the exact orderable code named on the page — a
category page, a family page or a generic search is not a price).

**Why this round.** Costings are made at 200,000 boards a year. The catalogue derives its 200k price from each part's 1k
price and a volume slope. 718 distributor-priced parts have only ONE break, so they sit on a generic curve
(10k = 1k × 0.85); 325 parts are estimates; only 171 SMT passives are held. The round adds parts and gives each part its
OWN slope.

## The 200k rule (new — applies to every task)
1. For every part record **(a) the price at 1,000 units** (or the nearest break, 500–2,500) and **(b) the LARGEST break
   the SAME distributor publishes** — full reel, several reels, 10k / 25k / 50k / 100k where shown. Both in one
   `observations` list, same `distributor`, same currency, same page / date. That pair is the part's own slope.
2. A second distributor's price at 1k is still wanted (cross-check). Two DIFFERENT distributors never make a slope.
3. **Never write a 200k price. Never extrapolate, interpolate or scale a price.** Record only breaks you saw stated. The
   merge derives 10k–300k and labels them DERIVED.
4. A break below 100 units is not a price. An out-of-stock listing that is dearer at a larger break is stale — skip it.
5. Passives: cut-tape 1k prices overstate; the reel break (10k / 15k / 50k) is the one that matters. Record two
   distributors per passive where you can (reel prices differ 4–14× between distributors).

## Three kinds of task (your task file says which)
- **EXTEND** (`p1`–`p5`, `i1`–`i4`, `d1`, `d2`; a text list of cells, series and functions). Find the AUTOMOTIVE orderable
  code first, run `python3 scripts/pcb-research/2026-11-22-r6/has.py <code> [...]` from `calculator/` and skip parts that
  are `[distributor, obs]`. A line naming a SERIES or FUNCTION = choose ONE representative part distributors stock, say
  why in `notes`. Your file ends with the catalogue's ESTIMATES in your domain: an orderable member priced for a family
  key lets it be linked — put the family key in `family`. Parts not reached go in `notResearched` (code + why).
- **SLOPE** (`s1`–`s4`; a JSON list of catalogue parts priced at one break). For each: find the largest published break
  of the STORED distributor for the exact code (the stored URL is given). Record the stored break again AND the larger
  one if you can see both on the same page today; else the two breaks you see at any ONE franchised distributor. Copy
  `mpn`, `mfr`, `desc`, `category`, `pkg`, `aecq` unchanged. No larger break published → `observations: []`,
  notes `NO-LARGER-BREAK: <largest shown>`.
- **VERIFY** (`h1`, `v1`–`v5`; a JSON list). As RULES-R5 §A: the exact code at a DIFFERENT franchised distributor;
  verdict first in `notes`: `CONFIRMED:` (±40 %) / `DISPUTED:` (> 2.5×, both figures and URLs) / `WRONG-CODE:` /
  `UNVERIFIED:`; wrong stored listings in top-level `disputes`.

## Budget and output
- **At most 20 web searches.** Ten agents share the budget. Plan first; one search should price several parts (an
  aggregator page naming the distributor and breaks for the exact code, sibling codes in one query).
- Work in the task's priority order; stop when the budget is spent.
- Write ONE file: `scripts/pcb-research/2026-11-22-r6/<task name>.json`, the `../RULES.md` shape, with
  `"researched": "<today>"`, plus `notResearched` (extend / slope) or `disputes` (verify). Change no other file. No git.
- Reply with ONE paragraph: parts researched / with ≥ 1 observation / with two breaks of one distributor (own slope) /
  with ≥ 2 distributors / none; searches used; the most serious problem found.

**Never invent a part, an orderable code or a price. An empty result with the reason is correct; a wrong number is
worse than none.**
