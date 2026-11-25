# Phase 2 · Step 3 — financial reconciliation (A-03, A-04, A-05, A-06; A-11 dry run)

Run 17 Nov 2026 on throwaway SQLite databases in `/tmp` (synthetic users and records only, AI off).

## How it was run

| What | Command (from `calculator/`) | Output |
|---|---|---|
| Pre-fix code | `git archive 5f385ef5` of `calculator/{server,src,dist,public,scripts}` + top-level files into `/tmp/cv-phase2-prefix` (no git state touched; `node_modules` symlinked — same lockfile) | — |
| Test set on the pre-fix code | `npx tsx …/reconciliation/recon-run.ts /tmp/cv-phase2-prefix/calculator …/reconciliation/before` | `before/run.json`, `before/records-server.csv`, `before/db-path.txt` |
| Test set on the fixed code (+ screen) | `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium npx tsx …/recon-run.ts . …/after --browser` (fresh `npm run build`, restored afterwards) | `after/run.json`, `after/screen.json` (cards + table), `after/exports/` (PDF, Excel, CSV from the screen), `after/dashboard-1440-light.png` |
| By hand | `python3 -I hand.py <db> updated before/hand-working.md before/hand.json`; `python3 -I hand.py <db> created after/hand-working.md after/hand.json` | the working, record by record |
| Excel | `python3 -I ../A-28/recalc-check.py after/exports/costvision-kpi-dashboard.xlsx /tmp/cv-phase2-recon-lo` (LibreOffice, recalculation forced) | `after/xlsx-recalc.json` |
| Originals / FX | `python3 -I fx-check.py` (compares `before/run.json` v `after/run.json`) | `fx-original-check.txt` |
| Fixed server on pre-fix data | `npx tsx …/existing-data.ts …/before/db-path.txt …/existing-data.json` | `existing-data.json` |
| A-11 dry run | `npx tsx scripts/kpi-identity-dry-run.ts <after db> …/a11-dry-run.json` | `a11-dry-run.txt/.json`, DB SHA-256 before / after identical |

`hand.py` reads `costing_records` read-only and applies the KPI definitions itself (it never imports the engine). It
does not model "invalid" exclusions (the set has none).

## The test set (same API calls, same order, on both trees)

| # | Record | Covers | Pre-fix response | Fixed response |
|---|---|---|---|---|
| R1 | REC-GBP-01, GBP, 8-line breakdown = £10.00; admin validates volume 10,000 + validated saving £0.50 | annualised base, savings | 201 / 200 / 200 | same |
| R2 | REC-EUR-02, import, should €20, current €25 (EUR/EUR) | **non-GBP** | import 200 | same |
| R3 | REC-MIX-03, import, should £30 GBP, current $40 USD | **different currencies** | (same import) | same |
| R4–R6 | REC-REV-04, 3 imported revisions (Sep / Oct / Nov) | **≥ 3 revisions** | (same import) | same |
| R7, R8 | REC-TIE-07, two saves the same day (should £15, then £17), then a note on the FIRST | **A-06** | 201, 201, 200 | same |
| R9 | REC-VOL-09; admin: volume 60,000 validated + approved; OWNER: volume → 600,000 | **A-03, A-05** | 200 (stays validated + approved) | 200 → validation cleared, status **completed** |
| R10 | REC-TST-10 approved; OWNER sets `isTest` | A-05 | **200** (record excluded) | **403** |
| R11 | REC-COM-11 approved; OWNER sets commodity Forging, country CN | A-05 | **200, 200** | **403, 403** |
| R12 | REC-PN-12 approved; OWNER changes part number → REC-PN-12B | A-05 | 200, stays approved | 200, → **completed** |
| R13 | REC-DRF-13 approved; OWNER sets draft | A-05 | **200** (draft) | **403** (stays approved) |
| R14 | REC-FAKE-14, total £0.01, breakdown 999 + 999 | **A-04 does not re-add** | **201** (stored) | **400**, nothing stored |
| R15 | REC-RND-15, total £13.04, 8 lines sum £13.00 | **A-04 rounding only** | 201 | 201, basis "re-added" |
| R16 | REC-NEG-16, current £18 below should £20 | unfavourable (never netted) | 201 | 201 |
| R17 | LR-REC-200 / lr-rec-200 / LRREC200 / LR_REC_200, imports | **A-11** (case / punctuation) | 200 | 200 |
| R18 | REC-CASE-18 on Q901 (Alice) and q901 (Bob) | A-11 programme case | 201, 201 | 201, 201 |

FX: one synthetic approved table (EUR 1.19 and USD 1.31 **units per GBP**, Sep–Nov 2026) loaded first, so
EUR = 0.840336 and USD = 0.763359 GBP per unit, frozen on each record.

## Results — every KPI affected by A-03, A-04, A-05, A-06 (all-time view)

"Hand" = `hand.py` on that run's own database (pre-fix tie rule on the pre-fix DB, A-06 rule on the fixed DB).

| KPI | Before (pre-fix code) | Hand (pre-fix DB) | After (fixed code) | Hand (fixed DB) | What moved it |
|---|---|---|---|---|---|
| Eligible current records | 17 | 17 | 17 | 17 | A-04 −1 (R14 refused), A-05 +1 (R10 not excluded) |
| Σ GBP current | 283.542755 | 283.542755 | 321.542755 | 321.542755 | A-04 −12 (R14); A-05 +50 (R10) |
| Σ GBP should-cost | 241.856723 | 241.856723 | 283.846723 | 283.846723 | A-04 −0.01; A-05 +40; A-06 +2 (R8 £17 replaces R7 £15) |
| Σ gap | 41.686032 | 41.686032 | 37.696032 | 37.696032 | |
| **Weighted gap** = Σ gap ÷ Σ current | **14.7019 %** | 14.7019 % | **11.7235 %** | 11.7235 % | positive = current above should-cost (sign unchanged) |
| **Potential opportunity** (Σ positive gaps) | **£43.686032** (16) | £43.686032 | **£39.696032** (16) | £39.696032 | A-04 −£11.99 (R14), A-05 +£10.00 (R10), A-06 −£2.00 (R7 gap 5 → R8 gap 3): 43.686032 − 11.99 + 10 − 2 = 39.696032 |
| Unfavourable (Σ negative gaps) | −£2.00 (1) | −£2.00 | −£2.00 (1) | −£2.00 | unchanged; not netted |
| **Annualised** (gap × validated volume) | **£1,220,000** (2) | £1,220,000 | **£20,000** (1) | £20,000 | A-03: R9 £2 × 600,000 = £1,200,000 drops out (validation cleared); R1 £2 × 10,000 = £20,000 stays |
| Validated / implemented savings | £0.50 / — | £0.50 | £0.50 / — | £0.50 | unchanged |
| Records (included) / current / excluded | 21 / 17 / 1 (test) | 21 / 17 / 1 | 21 / 17 / 0 | 21 / 17 / 0 | A-04 −1 (R14); A-05 R10 no longer excluded |
| Completed costings (current, non-draft) | 16 | 16 | 17 | 17 | A-05: R13 not downgraded to draft |
| Awaiting review (current, completed) | 13 | 13 | 14 | 14 | 13 − R14 (A-04) + R9 (A-03/A-05 reset) + R12 (A-05 reset) = 14 |
| Approved (current) | 3 (R9, R11, R12) | 3 | 3 (R10, R11, R13) | 3 | A-05 |
| Current by commodity | Casting 14, Forging 2, Machining 1 | same | Casting 15, Forging 1, Machining 1 | same | A-05: R11 stays Casting; R10 in, R14 out |
| Should-cost basis (data quality) | — (no field) | — | re-added 11, not re-added 0, total only 6 | 11 CostVision saves with a breakdown; 6 current imports | A-04 |

All figures above re-add exactly (to 1e-6) between the API, the hand working and (after) every output below.

### The after figure on every output (fixed code)

| Output | Opportunity | Weighted gap | Unfavourable | Annualised | Eligible | Notes |
|---|---|---|---|---|---|---|
| API `/summary` | £39.696032 | 11.72349 % | −£2.00 | £20,000 | 17 | an ordinary user's summary = the admin's (`summaryAsUser`) |
| KPI cards (screen, 1440 light) | **£39.70** (exact £39.70) | **+11.7%** | **−£2.00** | **£20,000.00** (title) / £20.0k | "16 of 17 eligible" | `after/screen.json` |
| Records table (screen, 17 current rows) | Σ of the displayed 2-dp gaps = £39.69 | (Σcur − Σshould)/Σcur from displayed cells = 11.72 % | −£2.00 | — | 17 rows | the 1p is display rounding of two cells (£0.534351 → £0.53, £4.201681 → £4.20); every row's figures match the API row |
| PDF (from the screen) | £39.70 | 11.7% | -£2.00 | £20,000.00 | 17 | `after/exports/pdf.txt`; DQ "total only 6", "does not re-add 0", "excluded 0" |
| Excel (from the screen, recalculated in LibreOffice) | £39.70 (Exec summary); Reconciliation 39.6960318 = re-add ✓ | 11.7% / 0.1172349 ✓ | −£2.00 ✓ | £20,000.00; 20000 = re-add ✓ | 17 ✓ | 0 formula errors, **10/10 ✓** (`after/xlsx-recalc.json`) |
| CSV (screen export = server CSV, same rows; order differs) | Σ positive "GBP cost gap" = 39.696032 | 11.72349 % | −2.0 | Σ gap × volume where validated = 20,000 | 17 eligible | |

### Original currencies and frozen FX (`fx-original-check.txt`)

- 21 records exist in both runs (R14 only in the pre-fix run): **no** difference in any original value, currency, terms,
  GBP value or FX snapshot (rate, source, effective date, method, approved) between the pre-fix and the fixed runs.
- `hand.py` §1: every GBP value = original × its frozen rate (EUR 0.840336, USD 0.763359, GBP 1) — **True** on both DBs.
- Within the fixed run, no PATCH (volume, status, identity, notes) re-froze a current or should-cost snapshot; the only
  snapshot change is R1's new `saving` snapshot, written by the admin's saving PATCH (as before).
- Original-currency totals (`currencyTotals`): EUR 1 record, €25 current / €20 should, gap €5; USD 1 record $40, no
  same-currency gap (should is GBP) — identical before and after; the GBP line moves only by R10 / R14 / R7→R8 as above.
  Currencies are never added together (the screen's original-currency mode and the "Original currencies" sheet list
  them per currency).

### "What must not change" (checked on this set)

| Rule | Held? | Evidence |
|---|---|---|
| Weighted gap = Σ(current − should) ÷ Σ current over eligible; positive = current above should | yes | hand §5 = API = card "+11.7%" = Excel C5/C3 ✓ |
| Opportunity and unfavourable summed separately, never netted | yes | £39.70 and −£2.00 both shown; Σ gap 37.70 = 39.70 − 2.00 |
| Missing cost / rate never zero; no 1:1 conversion except GBP | yes | EUR / USD at the table rates; GBP 1.0 |
| Original-currency mode never adds currencies | yes | currency totals per currency |
| FX frozen per value; recalculation admin preview → apply | yes | no snapshot changed by any edit; access check S5 (preview + apply 200 for admin, 403 for user) |
| Older revisions not double counted; gaps never labelled savings | yes | REC-REV-04: 1 current of 3; savings £0.50 only from the saving field |
| Filters apply one context | yes (all-time) | API, cards, table, PDF, Excel, CSV agree |

## Pre-fix data read by the fixed server (`existing-data.json`)

The fixes act when a record is WRITTEN (A-03, A-04, A-05) or when records are READ (A-06). On a copy of the pre-fix
database the fixed server gives: opportunity £41.686032 (= pre-fix £43.686032 − £2.00: A-06 re-selects R8 at read
time), annualised **still £1,220,000** (R9 keeps the owner's 600,000 validated and approved), R14 (£0.01) still counted
but flagged **"not re-added"** (data quality: re-added 10, not re-added 1, total only 6), R10 still excluded as test.
So data already altered before the fixes is not corrected or flagged by them — see new finding N-7 in the report.

## A-11 dry run on this set (`a11-dry-run.txt`; read-only, DB SHA-256 identical before and after)

| | Today | Folded |
|---|---|---|
| Applications / current records | 17 | **14** |
| Eligible | 17 | 14 |
| Opportunity | £39.70 | **£35.70** |
| Unfavourable / annualised | −£2.00 / £20,000 | same |

Groups that would merge: `LRREC200|L460|2027|BEV` ← LR-REC-200, lr-rec-200, LRREC200, LR_REC_200 (today 3 current:
`LR-REC-200` and `lr-rec-200` already share a key because case is folded today; folded: LR_REC_200 current, the others
superseded); `RECCASE18|Q901|2028|BEV` ← Q901 (Alice) + q901 (Bob) (today 2 current; folded: Bob's q901 current —
created later, A-06 — and Alice's a duplicate). The £4.00 drop = two £1 variant gaps + one £2 programme-case gap.
Not switched on (Stop 2-A).
