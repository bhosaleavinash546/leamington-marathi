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

---

## Addendum 2 (22 Nov 2026, after the pilot — b05, b13, s1) — this REPLACES the limits and source order above

The pilot priced 22 / 36 passives, 35 / 36 ICs and gave 9 / 40 existing parts their own slope. What it found:
- **Digi-Key now serves product pages** (digikey.com, digikey.co.uk) with the full price table for every packing — cut
  tape and tape-and-reel (reel breaks to 100,000 on chip resistors), the Grade / Qualification field, part status and
  stock. `../RULES.md`'s "Digi-Key is blocked" no longer holds. One page read prices one part.
  `https://www.digikey.com/en/products/result?keywords=<exact code>` usually lands on the product page; when it shows
  a list, take the product link from it (a second read).
- **Search summaries of distributor pages are STALE**: on 10 of 17 parts the live Digi-Key price was 9–39 % above the
  summary's figure. Stored catalogue prices had moved too.
- TME serves product pages but rate-limits (HTTP 429 after 4–7 pages while several agents read it), rounds small prices
  to 2 decimals and often shows only small breaks. Farnell, Mouser, RS, Rutronik, Future, Arrow, TrustedParts and
  Findchips refused.

**Rules from now on**
1. **Only a price you READ ON THE PAGE goes into `observations`.** A figure from a search summary is not a price: put it
   in `notes` if useful ("summary: …"), never in `observations`. A line you could price only from a summary gets
   `observations: []` and notes starting `SUMMARY-ONLY:`.
2. **Source order:** the Digi-Key product page for the exact code first. Then ONE cross-check at another franchised
   distributor if a page serves (TME: at most one page a minute, at most 8 pages in your task, stop at the first 429;
   others: one try each, stop at the first refusal). Never retry a refused site through another host.
3. **Every observation carries two extra fields:** `"packing"`: `"cut tape"` | `"reel"` | `"tray"` | `"tube"` | `"bulk"` |
   `"unknown"` and `"evidence": "page-read"`. Record from the SAME page: the break nearest 1,000 (say its packing), and
   for the full packaging (reel / tray / tube) the SMALLEST and the LARGEST break shown — e.g. cut tape 1,000; reel
   10,000; reel 100,000. Record a break exactly as the row shows it (unit price, not the extended price). A reel price
   dearer than cut tape is recorded as shown — say so in `notes`.
4. **Never take a price from a page's hidden data** (JSON-LD `lowPrice`, script variables) or pair it with a break
   yourself. If the visible table rounds a price to "0.00", that distributor has no usable price for the part.
5. **Status:** "Obsolete", "Discontinued at Digi-Key", "Last Time Buy", "Not For New Designs" → notes starting
   `OBSOLETE:` / `NRND:` with what the page says; record no price for obsolete / discontinued, record the price for NRND.
   "Out of stock" with a normal table is fine — say `out of stock` in notes.
6. **Limits:** at most **10 web searches** (for finding an orderable code or a product URL — not for prices) and about
   **60 page reads**, one at a time, never in parallel, never scripted. If Digi-Key starts refusing, stop reading it,
   write what you have and say so.
7. Work every line you can: a line whose code is exact costs one read. Lines not reached go in `notResearched`.

---

## Addendum 3 (23 Nov 2026, after wave 1) — a second page source, and the 200k break

- **Master Electronics** (masterelectronics.com, a franchised distributor) serves full product pages, with reel ladders
  up to 500,000–1,000,000 on chip resistors. It is the preferred CROSS-CHECK after the Digi-Key page (one page per
  part, same pacing: one at a time; stop at the first refusal). Where its table has them, record the break nearest
  1,000, **the break at or nearest 200,000**, and the largest break. No result for a code → say so in `notes`, move on.
- Its pages print prices to 2–4 decimals and carry template banners ("no longer being manufactured", "NOT RoHS") that
  are not about the part — judge status from the page's own stock / lifecycle fields. **A price row with fewer than
  two significant figures (e.g. 0.00, 0.003) is not recorded.** A listing dearer than Digi-Key's ONE-piece price, or a
  larger break dearer than a smaller one, is stale: `notes` only.
- When two distributors differ by more than 2.5× at the same quantity, record both as shown and start `notes` with
  `SPREAD: <ratio>× (<distributor> <price> v <distributor> <price> @ <qty>)`.
- Digi-Key keyword URLs (`…/products/result?keywords=<code>`) that landed on the product page are acceptable as the
  observation URL; use the product's own detail URL when the page shows it.
- Common-mode chokes are `transformer`, whatever the task line says (RULES-R4).
- Limits unchanged: 10 searches, about 60 page reads.
