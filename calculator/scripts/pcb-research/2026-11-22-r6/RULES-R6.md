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

---

## Addendum (22 Nov 2026, after the discovery pass) — LATEST tasks `b01`…, and reading pages

**A fourth kind of task: LATEST** (`tasks/b<nn>-….json`, a JSON list of discovered parts: `mfr`, `family`, `orderableCode`,
`desc`, `category`, `pkg`, `aecq`, `sourceUrl`, `note`, sometimes `boards` = how many reference-design BOMs carry it).
The discovery pass recorded that these parts EXIST; it recorded no price and often did not confirm the grade. For each:
1. **Confirm the exact orderable code on a franchised distributor's listing** (the code named on the page). If the task
   gives only a family (`orderableCode: null`) or a type number without the packing suffix, find the automotive orderable
   code distributors stock and put it in `mpn`; keep the task's family in `family`.
2. **Confirm the grade.** Set `aecq: true` only if a maker or distributor page states AEC-Q100 / Q101 / Q102 / Q200 or
   "automotive grade" for this code or its named series; say where in `notes`. Not confirmed → `aecq: false` and say so.
   If the page shows the part is obsolete / NRND / last-time-buy, do not price it: `observations: []`, notes
   `OBSOLETE: <what the page says, replacement if named>`.
3. **Price it under the 200k rule** (1,000-unit price + the SAME distributor's largest published break; a second
   distributor at ~1k where you can). Every figure with distributor, qty, price, currency, URL, date.
4. A discovery `note` that says the code was seen only in a search summary, joined from wrapped cells, or "automotive
   status not read" means: re-check it first; if the code does not exist as printed, `observations: []`, notes
   `WRONG-CODE: <what you found>`.
5. Not found at any franchised distributor with a break ≥ 100 → `observations: []`, notes `NO-LISTING: <what you tried>`
   (it goes to the supplier-quote list). Never estimate.

**Reading pages.** Besides web search you may READ a distributor's page for the exact code (the discovery pass found that
TME — tme.eu / tme.com — serves product and search pages; most others refuse). A price table you read on the page is
better evidence than a search summary: record every break it shows that matters (1k and the largest).
- One page at a time. **If a site refuses or returns an error page, stop using that site for the rest of your task —
  never retry through another host, a cache, a proxy or a script.** No bulk or scripted fetching.
- At most **20 web searches and about 40 page reads** per task.
- Record the currency and whether the price is net of VAT as the page shows it (use the ex-VAT price; if the page shows
  only a VAT-inclusive price, do not record it). Record the site's country version in `notes` if it matters.
- A TME (or other) SEARCH-results page that lists several codes of a series with prices counts for each code it names.

**Output** for a LATEST task: `scripts/pcb-research/2026-11-22-r6/<task name>.json`, the `../RULES.md` shape (`domain` =
task name, `researched` = today), one entry per task line you worked (priced or not), plus top-level `notResearched`
(lines not reached). Copy `desc` / `category` / `pkg` from the task unless a page shows they are wrong (say so). Reply
with ONE paragraph: lines worked / priced / with two breaks of one distributor / with ≥ 2 distributors / OBSOLETE /
WRONG-CODE / NO-LISTING / not reached; searches and page reads used; which sites refused; the most serious problem.
