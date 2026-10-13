# Round 5 (13 Oct 2026) — verify and extend. Read fully, with `../RULES.md` and `../2026-10-13-gap/RULES-R4b.md`
(both apply in full: franchised distributors only, breaks ≥ 100, allowed currencies only, no rounded figures, no VAT-inclusive
China storefronts, no Source ESB / ciiva / OEMsTrade / JLCPCB / punchouttest / fat.lcsc / brokers, URL + date on every price).

Two kinds of task. Your task file says which.

## A. VERIFY (tasks `v1`–`v5`, a JSON list of catalogue entries)

Each entry has been priced from ONE distributor only, or from no stored listing at all. You must find out whether that
price stands.
1. Search the EXACT code at a DIFFERENT franchised distributor from the stored one(s) — prefer Digi-Key, Mouser, Arrow,
   Avnet, Farnell / Newark, RS, TME, Future, LCSC. Record up to 3 new observations (RULES.md shape).
2. If you can also see the stored distributor's current price for the same break, compare.
3. Verdict per entry, in `notes`, starting with one of:
   - `CONFIRMED:` a second distributor within ±40% of the stored 1k-equivalent (MCUs / SoCs / memory spread more than
     passives — state the ratio);
   - `DISPUTED:` a franchised listing you SAW contradicts the stored price by more than 2.5× — give both figures and URLs;
   - `WRONG-CODE:` the stored observation is for another code / package / grade — say which;
   - `UNVERIFIED:` nothing found (say what you tried) or budget.
4. If a stored observation is wrong (WRONG-CODE, or a URL that clearly does not list this part), add it to the
   top-level `"disputes": [ { "mpn", "url", "reason" } ]` list with the stored URL — the merge can then drop it.
5. Copy `mpn`, `mfr`, `desc`, `category`, `pkg`, `aecq` from the task entry unchanged (fix `desc` / `aecq` only if you
   have evidence, and say so in notes).

## B. EXTEND (tasks `r1`–`r5`, a text list)

As round 4: find the AUTOMOTIVE orderable code first, check `python3 scripts/pcb-research/2026-10-13-r5/has.py <code>`
(skip `[distributor, obs]` parts), price with TWO distributors where you can, list unreached lines in `notResearched`.

## Budget and output
- At most **20 web searches**. Ten agents share the budget. Combine parts in one search where you can (same maker on
  Findchips / Octopart, sibling codes).
- Work in priority order (verify: most expensive first — the list is sorted by maker; sort it by `currentQ1kGBP` yourself).
- Write ONE file: `scripts/pcb-research/2026-10-13-r5/<task name>.json`, the RULES.md shape with
  `"researched": "2026-10-13"`, plus `"disputes"` (verify) or `"notResearched"` (extend). Change no other file. No git.
- Reply with one paragraph: counts (verify: CONFIRMED / DISPUTED / WRONG-CODE / UNVERIFIED; extend: researched / priced /
  2+ distributors / none), searches used, and the most serious problem found.
