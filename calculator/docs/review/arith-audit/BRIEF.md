# Arithmetic and hallucination audit — shared brief for every commodity auditor (30 Oct 2026)

## Why

The Director's bar for the all-commodity demo: **the whole tool is arithmetic, with no hallucinations.** A
hallucination here is ANY figure or statement on screen or in a report that is not one of:
1. **measured** (the CAD kernel / mesh, the user's files),
2. **from the rate book** with its stated source (`src/engine/rate-library.ts`, country books — never edit rates;
   rates move only through `scripts/rate-refresh*` configs),
3. **answered** by the engineer,
4. **a stated, visible assumption** — a constant whose basis is printed where the reader sees it (rule basis, trace
   note, report line) and which says what it is: a named source, or "engineering-typical — not sourced" /
   "ESTIMATE" with the reasoning,
5. **arithmetic on 1–4**, where the arithmetic printed is the arithmetic done.

Anything else — an unlabelled magic number that moves cost, a basis line whose numbers do not give the value, a
step the text claims but the cost does not carry, a step charged twice, an operation out of the process order, a
unit slip (s/h, mm/cm, kg/g), `partsPerCycle` not dividing both machine and labour time — is a defect to find and fix.

Read `CLAUDE.md` (repo root) first: it is the map of the codebase and its invariants. The golden rule: AI never
sets a price; all money is deterministic arithmetic in `calculator/src/engine/`.

## What exists for you

- Dump of every real part costed through the product's own headless chain (UK book, 50,000 a year, 5-year
  programme, the baseline's stated answers in `scripts/real-parts-baseline.ts::ANSWERS`):
  `/tmp/claude-0/-home-user-leamington-marathi/8bf32d1a-7485-5bd6-9947-7843ee6c5644/scratchpad/arith-dump/<part>.json`
  — `provenance` (every rule's value + basis), `params` (the module's inputs as costed), `trace.drivers` (the module's
  output: rawMaterial, operations, tooling), `trace.stackInput`, `trace.operations` (each op as costed: rates, £),
  `trace.traceability`, `trace.result`, `breakdown`, `total`. Re-create it with
  `cd calculator && npx tsx scripts/arith-audit/dump.ts <dir>`.
- `python3 -I scripts/arith-audit/basis-check.py <dumpDir>` — checks every printed "a × b = c" holds.
- `python3 -I scripts/arith-audit/constants.py <files…> --list` — every numeric constant with no stated basis
  within 8 lines (crude: a hit is a lead, not a verdict).
- Real CAD parts: `/home/user/leamington-marathi/cad-audit/parts/` (plus `*_modelled_parts.py` saying what each
  modelled part is). Recorded geometry for each is in `calculator/tests/fixtures/real-parts-baseline.json`.
- `costMeasuredPart` in `calculator/server/services/bulk-run.ts` is the headless chain (rules → `toCostParams` →
  module → `computeUniversalStack`). The screen must cost the same (`tests/cad-workspace.test.ts`).

## What you do, for your commodity group

1. **Sequence.** For each real part of your commodity, list the operations as costed, in order, with machine, time,
   parts per cycle, crew. Compare with how that part is actually made (state the route a production engineer
   would write). Flag a missing step, a doubled step (e.g. blast charged as a consumable AND an operation), a step
   out of order, a step charged that the route does not have.
2. **Independent arithmetic trace.** Write `calculator/scripts/arith-audit/<group>.ts`: for each real part, recompute
   from the measured geometry, the rate book and the answers — WITHOUT calling the module or the rule functions you
   are checking (you may import the rate library, types and pure geometry helpers) — every rule-derived input, every
   operation's cycle / labour time and £, the material line, tooling and amortisation, then the 8 buckets. Compare
   with the dump. Every difference > ½ p (or > 0.5 % on an input) is either a finding or a rule you can name with
   file:line. Print PASS / FAIL per check; exit non-zero on FAIL. Work ONE part fully by hand in the write-up, to
   the penny, every line.
3. **Constants.** Every numeric constant in your files that moves cost (times, rates, £, %, factors, lives,
   yields, thresholds that pick a machine or route): classify as SOURCED (name it), LIBRARY, MEASURED,
   LABELLED-ESTIMATE (visible to the reader), or UNLABELLED. For UNLABELLED ones that move a real part's cost: make the
   basis visible — put the constant and what it is ("engineering-typical, not sourced" or the real source if you can
   find one quickly with a web search on a primary/industry source) into the rule's basis string or the operation
   note so the screen and both reports print it. Do not invent a source. Do not change a value unless it is
   demonstrably wrong (unit error, contradicts its own stated source, contradicts measured geometry).
4. **Text.** Every basis / note / advisor line your commodity prints: does it state only what the cost does? A line
   claiming a step, a %, a saving or a figure the costing does not carry is a hallucination — fix the text.
5. **Fix** each confirmed defect at source in YOUR files only, with a test in
   `calculator/tests/arith-audit-<group>.test.ts` that fails before and passes after. Keep fixes minimal and
   correct. A fix that moves a real part's cost is fine if the old figure was wrong — record before/after.

## Rules of engagement (several auditors work in this tree at once)

- Edit ONLY the files listed as yours. `to-cost-params.ts`: only inside your commodity's own function/case, re-read
  right before each edit. Anything else you want changed (main.ts, core.ts, shared helpers, another commodity's
  file, the rate book): describe it as a PROPOSED change with exact code in your write-up — do not edit.
- Never edit `src/engine/rate-library.ts` values, country books, `tests/fixtures/real-parts-baseline.json`, or
  `tests/fixtures/commodity-rules-prompt/*` — the lead re-records those once at the end. Expect
  `tests/real-parts-baseline.test.ts` and the rules-prompt snapshot test to move when you fix something: say which
  parts move and by how much; do not update them.
- Run only targeted tests: `cd calculator && npx vitest run tests/<your files>` (the full suite is run by the lead).
  `npx tsc --noEmit -p tsconfig.json` must stay clean for your files.
- No git commands that change state (no commit, stash, checkout, reset). No `npm install`. No AI calls.
- Never write a model identifier into code, docs or comments.

## Your write-up — `calculator/docs/review/arith-audit/<group>.md`

1. Scope: files, parts, commands to reproduce.
2. Sequence table per part (as costed v as made) and verdict.
3. One part worked by hand to the penny.
4. Shadow-model result per part (checks, PASS / FAIL).
5. Constant register for your files (file:line, value, meaning, class, £ effect on a real part where it matters).
6. Findings register: ID, severity (H = wrong money or a false statement; M = unverifiable / unlabelled figure that
   moves cost ≥ 1 %; L = presentation), file:line, evidence, FIXED (with test) or PROPOSED (with code), before → after £.
7. What you did NOT check and why.

Keep the final message you return SHORT (≤ 25 lines): counts of checks, findings by severity, fixed v proposed,
real parts whose cost moves (before → after), and the path of your write-up.
