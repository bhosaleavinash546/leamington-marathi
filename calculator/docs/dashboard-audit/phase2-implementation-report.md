# CostVision KPI Dashboard — Phase 2 Implementation Report

Brief: `CostVision_Phase2_Approved_Corrections_1.md`. Source of truth: `phase1-independent-audit.md` + `phase1-evidence/`.
Worktree `/home/user/cv-phase2`, branch `phase2-approved-fixes`, from housekeeping commit `5f385ef5`; final commit
`9119da05`. Evidence: `calculator/docs/dashboard-audit/phase2-evidence/` (untracked, 130 MB).

**Status: Steps 1–7 done; Stop 3.** Stop 1 was approved on 16–17 Nov 2026. The fixes were made in Step 2. Steps 3–5
(verification) and Step 6 (independent review) were done on 17 Nov 2026, and Step 6 led to one in-scope follow-up
commit, `9119da05`. This report is Step 7. Nothing further will be done until you reply.

Sections A–G follow the brief's Step 7. The detailed working record (plan, per-finding notes, Stop 2-A, the Steps 3–5
evidence) is kept in the **Appendix** at the end, with its headings one level down. Nothing was removed from it. Four
Step 7 additions are marked where they appear: the A-17 size correction, the "Defects found" note, N-10 / N-11, and the
A-05 follow-up row.

---

## A. Summary

### Approved findings by status

| Status | Count | Findings |
|---|---|---|
| **Resolved** | 15 | A-02, A-23, A-17, A-18 (approved part), F-19, F-21, F-22 (option (a)), F-23, F-24, F-25, F-26, F-28, A-27 (negative money), A-28 (b), A-29 ("i" buttons) |
| **Partly fixed** | 7 | A-03 (validator / date / source need D-10), A-04 (rate-book stamp needs D-10; new gaps N-10, N-11), A-05 (delete still open, D-4), A-06 (ranking is D-3), A-07 (tolerance etc. D-5), A-10 (D-9 parts), A-11 (switch-on awaits your Stop 2-A choice) |
| **Fixed, not fully verified** | 0 | — (the A-05 follow-up `9119da05` was checked by its own test, the KPI suite, both typechecks and a full-suite re-run at `9119da05`; live e2e and screenshots not re-run for that text-only change. See D) |
| **Blocked** | 2 | A-01, A-25 (D-8 and the allowed domains are blank) |
| **Not started** | 0 | — (A-28 (a) still says "Your choice", so it is not approved and was not built) |

That makes 24 items: the 22 approved plan items plus the 2 conditional ones.

### Readiness verdict: **not ready for production**

- **A-01 is blocked.** D-8 and the allowed domains are blank, so sign-up is still open (P01 unchanged).
- **A-03, A-04 and A-05 are only partly fixed.** They wait on D-10 (validator fields, rate-book stamp) and D-4
  (withdrawing or deleting an approved record). Under the brief's rule, none of the five release-blocking findings is
  resolved apart from A-02.
- **Records saved before the fixes are not corrected by them (N-7).** An owner-inflated validated volume, an
  owner-set test flag and so on stay in the data until someone checks them.
- **A-04 has two new gaps from the review:**
  - N-10: the should-cost basis label is read live from a costing row that can be rewritten.
  - N-11: a save with no breakdown is accepted as "total only".
- **`calculator/dist` was not rebuilt or committed.** The committed bundle still serves the pre-Phase-2 screen, so
  none of the UI fixes would ship as things stand.

---

## B. Per finding

These apply to every finding below unless stated:
- **Shared checks.** Each finding also passed the Step 5 full run: `npm test` 390 files / 6,114 tests, both
  typechecks exit 0, live e2e 59/59. The A-05 follow-up came after that run; the full suite was re-run at the final commit `9119da05`: 391 files / 6,117 tests, all pass.
- **Before / after tests.** "Before X / after Y" is the finding's new test run against the code without the fix and
  with it. The logs are `phase2-evidence/<ID>/test-before-fix.log` and `test-after-fix.log`.
- **Probes.** They come from `phase2-evidence/probes/`.
- **Paths.** Paths are under `calculator/`.

### Block 1 — release-blocking

**A-03 · P0 · Partly fixed** · commit `2edebda2`
- *Problem / root cause:* P14 — the owner changed a validated, approved record's annual volume from 60,000 to
  6,000,000 and got 200. The record stayed validated, and annualised went from £120,000 to £12,000,000.
  `volumeValidated` is a boolean that is not tied to the value validated, and PATCH never cleared it.
- *Correction:* a value change to `annualVolume` on a validated record clears the validation, whoever makes it. A
  same-value save keeps it (the form re-sends every field). A change plus `volumeValidated:true` in one request is
  refused with 400; re-validation is a separate, logged save.
- *Files:* `server/routes/kpi.ts` (the PATCH rule); `tests/kpi-p2-a03-validated-volume.test.ts` (new).
- *Test* `kpi-p2-a03-validated-volume.test.ts` (HTTP): an owner change and an admin change each clear the validation
  (annualised falls out); a same-value save keeps it; change + re-validate gives 400, then two saves give two audit
  entries; a first validation in one save is allowed. Before 3 fail / 2 pass; after 5 pass.
- *Probe:* P14 still validated true → **false**, annualised £12,000,000 → **£0**. P14b admin change true → **false**;
  same-value save true → true; change + re-validate 200 → **400**.
- *Tests run:* 5 KPI files, 61 pass. Reconciliation annualised £1,220,000 → **£20,000**, matching the hand
  calculation. Access checks S4d and S4e pass (both fail on the pre-fix tree).
- *Limitations:* who validated, when and from what source is not stored (D-10 / D-6). Pre-fix data is not corrected
  (N-7). The admin edit form re-sends the box ticked (N-3).

**A-02 · P1 · Resolved** · commit `30b2d690`
- *Problem / root cause:* P01 / SEC-02 — `GET /records/:id` returned the stored `scenarios.data` to any signed-in
  user, including costing inputs, target price and supplier quote.
- *Correction:* a non-owner, non-admin gets only what the panel shows (`panelCosting()`):
  `{commodity, region, result:{total, breakdown (8 buckets), operationDetails[name, cost]}}`. The owner and admins
  still get the full costing. Every caller was checked (the panel, exports, drill-down, e2e) and none needs a removed
  field, so Stop 2 did not apply.
- *Files:* `server/routes/kpi.ts` (`PANEL_BUCKETS`, `panelCosting`); `tests/kpi-p2-a02-record-view.test.ts` (new).
- *Test* `kpi-p2-a02-record-view.test.ts` (HTTP): signed-out 401; Bob gets exactly the panel shape with no secret
  fields; Alice and the admin get the full costing; a non-numeric bucket or extra key is dropped. Before 2 fail /
  2 pass; after 4 pass.
- *Probe:* P01b — costing keys `commodity,input,region,result` → **`commodity,region,result`**; operation keys
  `cost,cycleTimeSec,machineId,name` → **`cost,name`**; secret quote in the body true → **false**.
- *Tests run:* 6 files, 65 pass. Access checks S3a and S3b pass (S3a fails on the pre-fix tree).
- *Limitations:* every signed-in user still sees all records' buckets and supplier costs (a visibility decision,
  D-8b). Open sign-up is A-01.

**A-04 · P1 · Partly fixed** · commit `60223582`
- *Problem / root cause:* P15 — `result.total: 0.01` over a £1,998 breakdown was saved (201), giving a stored
  should-cost of £0.01 and an opportunity of £11.99. The save stored the client's total unchecked.
- *Correction:*
  - (a) `reAddCheck`: the save refuses with 400 when the total is off by more than numeric lines × 0.005 (8 lines →
    £0.04); nothing is written.
  - (b) A read-time `shouldBasis` labels each record `re-added` / `does not re-add` / `total only, not re-added`.
    Imports and saves with no breakdown get the last one. The label shows on the record panel and as two
    data-quality rows (screen and Excel).
  - (c) The rate-book stamp is **not built** (no field; D-10 blank).
- *Files:* `src/engine/kpi-dashboard.ts` (rule, labels); `server/data/kpi-store.ts` (the list reads the linked
  breakdown); `server/routes/kpi.ts` (save check, row field); `kpi-builders.ts`, `kpi-view.ts`, `kpi-export.ts`
  (panel line, data-quality rows); `tests/kpi-p2-a04-should-readd.test.ts` (new).
- *Test* `kpi-p2-a04-should-readd.test.ts`: the rule accepts 13.04 / 12.96 against 13.00 over 8 lines and refuses
  13.05. Over HTTP: the P15 case gives 400 with nothing stored; £0.04 rounding gives 201 `re-added`; £0.05 gives 400;
  no breakdown and imports give `total-only`; a pre-rule record gives `not-re-added`. The data-quality counts and the
  builders print the label. Before 7 fail (the functions did not exist); after 7 pass.
- *Probe:* P15 201 → **400**, opportunity £11.99 → **£0**. P15b £0.05 → **400**; £0.04, no breakdown and import
  still 201 / 200, with a label.
- *Tests run:* 7 files, 72 pass; both typechecks exit 0. Reconciliation −£11.99, matching the hand calculation.
  "Total only" is shown on the screen, PDF and Excel.
- *Limitations:* no rate-book stamp (D-10); the server does not recompute should-cost (not approved). **N-10:** the
  label is read live from a rewritable costing row. **N-11:** a save with no breakdown is accepted. The cold
  `/summary` is slower (see D; needs your acceptance). Pre-fix non-re-adding records are flagged, not excluded.

**A-05 · P1 · Partly fixed, delete still open (D-4)** · commits `b15380c5` and follow-up `9119da05`
- *Problem / root cause:* P02 — an owner could set `isTest`, downgrade approved → draft, delete an approved record,
  re-point it to another part or programme (it stayed approved), and change `commodity` / `country`.
  `ADMIN_ONLY_FIELDS` was incomplete, and the status reset fired only on money fields, by key presence.
- *Correction (`b15380c5`):*
  - `isTest`, `commodity` and `country` are admin-only, and an owner cannot change a reviewed / approved status.
  - A **value** change to part number, programme, model year, powertrain or volume on a reviewed / approved record
    sets it to `completed`, whoever makes the change. Asking to keep it reviewed / approved in the same save gives
    400; re-approval is a separate save.
  - A notes-only save keeps an approved record approved. Delete is unchanged (D-4).
- *Correction (`9119da05`, Step 6 issue 3):* the owner's edit-form note said "Changing the current cost sends this
  costing back for review". But the form sends the current status, so such a save is refused 400 unless the status
  is set to Completed. The note now tells the owner to set Completed, after which an admin approves it again. The 400
  now uses the panel's field labels and "an approved" (it said "currentCost" and "a approved"). The rule is unchanged.
- *Files:* `server/routes/kpi.ts` (PATCH rules; the follow-up uses the new wording); `server/utils/kpi-edit-wording.ts`
  (new, pure helper `resetRefusal`); `src/ui/kpi-dashboard/kpi-view.ts` (`editFormNote`);
  `tests/kpi-p2-a05-owner-powers.test.ts` and `tests/kpi-p2-a05-edit-wording.test.ts` (new).
- *Tests:*
  - `kpi-p2-a05-owner-powers.test.ts` (HTTP, 20): owner 403s; the 10 identity / volume resets for owner and admin;
    the same-request 400; re-approval; the unchanged delete. Before 16 fail / 4 pass; after 20 pass.
  - `kpi-p2-a05-edit-wording.test.ts` (3): the refusal's labels and article, and the form note. Before: failed (the
    exports did not exist). After: 3 pass.
- *Probe:* P02 owner `isTest` 200 → **403**; approved → draft 200 → **403**; delete 200 → 200 (D-4). P02b part-number
  change approved → **completed**; commodity / country 200 → **403**; notes-only save **403 → 200**, still approved.
  P14 approved → **completed**.
- *Tests run:*
  - `b15380c5`: 8 files, 92 pass. Reconciliation +£10.00, with statuses / commodity matching the hand calculation.
    Access checks S4a–S4c pass (fail on the pre-fix tree).
  - `9119da05`: the KPI suite (28 files, 218 tests) passes and both typechecks exit 0. The full suite, the live e2e
    and screenshots were **not** re-run after it.
- *Limitations:* delete / withdraw is unchanged (D-4); who set a status is not stored (D-10). The owner's status list
  still offers Draft / Completed (N-2). The import path is not covered (review note 5, D-9). The follow-up's form note
  has no screenshot.

### Block 1 conditional — blocked

**A-01 · P0 · Blocked (D-8 + allowed domains blank).** Sign-up is open to anyone (P01). Nothing was built, and P01 is
unchanged before and after. D-8b (scoping supplier prices) would not be built in this phase in any case.

**A-25 · P3 · Blocked (D-8 blank).** Removing an e-mail from `ADMIN_EMAILS` does not demote that admin, and the dev
OTP setting is accepted in production. Nothing was built.

### Block 2

**A-06 · P1 · Partly fixed** · `f05d2856`
- *Problem / root cause:* a same-day tie between two costings broke on `updatedAt` (the sort's third key), so a note
  on the older costing made it current.
- *Correction:* the tie now breaks on `createdAt`.
- *Files:* `src/engine/kpi-dashboard.ts` (`classifyRecords` sort); `tests/kpi-p2-a06-same-day-tie.test.ts`.
- *Test:* engine and HTTP — a note or an admin edit on the older costing leaves the newer one current, and Σ should
  stays £17. Before 2 fail / 2 pass; after 4 pass.
- *Probe:* P06b roles `first:current, second:superseded` → **`first:superseded, second:current`**. P06 is unchanged
  (D-3).
- *Tests run:* 9 files, 96 pass. Reconciliation −£2.00, matching the hand calculation; R8 is current on the screen
  and in all exports.
- *Limitations:* a newer unapproved costing still displaces an approved one (D-3). The tie-break is computed when
  records are read, so it applies to old data too.

**A-07 · P1 · Partly fixed** · `fe35878e`
- *Problem / root cause:* P03 — inverted EUR 1.19 and USD 1.31 rates were accepted. There was one 10× band, and for a
  reference above 0.316 the inverse falls inside it.
- *Correction:* after the unchanged 10× guard, a rate closer on a log scale to 1/reference is refused, naming the row
  and column. A reference within 10 % of 1.0 gives a warning instead. The rate stays in GBP per one unit.
- *Files:* `server/utils/kpi-import.ts` (`parseFxRows`); `tests/kpi-p2-a07-fx-inversion.test.ts`.
- *Test:* parser and HTTP — inverted EUR / USD refused; correct rates load; `units_per_gbp` inverted on load; ZAR
  still refused by the 10× guard; a reference near 1 warns; an ordinary user gets 403. Before 3 fail / 5 pass; after
  8 pass.
- *Probe:* P03 inverted EUR / USD 200 (2 loaded) → **400** (none loaded). AED, ZAR and the CHF overwrite are unchanged.
- *Tests run:* 10 files, 104 pass.
- *Limitations:* the tolerance, the previous-rate check and unreferenced currencies (AED) are D-5. Overwriting a
  period's rate is A-12.

**A-10 · P1 · Partly fixed** · `360cebb0`
- *Problem / root cause:* P09 — a row dated 2031 imported and became current. P09b — a re-import "updated" a deleted
  record. Only the date format was checked, and the update ignored deletion.
- *Correction:* a costing date after today + 1 day (UTC) is refused, as is a row matching a deleted record. Each
  refused row is reported with its row number and column. The import stays all-or-nothing.
- *Files:* `server/utils/kpi-import.ts`, `server/routes/kpi.ts` (import route); `tests/kpi-p2-a10-import-rows.test.ts`.
- *Test:* today and today + 1 are accepted, today + 2 and 2031 refused; a deleted-record row is refused with nothing
  written; valid files still import. Before 3 fail / 2 pass; after 5 pass.
- *Probe:* P09 200 → **400**, nothing imported. P09b 200 `updated:1` → **400** (row 2, `source_record_id`).
- *Tests run:* 11 files, 109 pass.
- *Limitations:* imported approval / validation / saving flags and re-import overwriting are D-9. Date-dependent
  fixtures may fail on the 1st–2nd of a month (N-1).

**A-11 · P1 · Partly fixed (switch-on is your Stop 2-A choice)** · `82b88cea`
- *Problem / root cause:* P08 — LR-VAR-100 / LRVAR100 / LR_VAR_100 gave three current records; P16 — Q900 / q900
  gave two. The part number is only upper-cased and stripped of spaces; the programme is used as typed.
- *Correction:* `foldIdentityCode()` folds case and removes spaces, `-`, `_`, `.` and `/`. It is **not wired into
  anything**. `scripts/kpi-identity-dry-run.ts` opens the database read-only and lists what a folded key would merge.
- *Files:* `src/engine/kpi-dashboard.ts` (the function only); `scripts/kpi-identity-dry-run.ts`;
  `tests/kpi-p2-a11-identity-fold.test.ts`.
- *Test:* the five spellings and Q900 / q900 each fold to one key. It is **not switched on**: the app's key is
  unchanged and there are still five current records. The dry run leaves the database's bytes and mtime unchanged.
  Before: the file failed to load. After: 7 pass.
- *Probe:* P08b and P16 unchanged before and after, as required.
- *Tests run:* 12 files, 116 pass; both typechecks exit 0.
- *Dry runs:* probe DB 25 → 22 applications, £73.68 → £69.68. Reconciliation set 17 → 14, £39.70 → £35.70. Details
  in F.
- *Limitations:* not switched on; Unicode dashes are not folded; controlled lists and ISO country codes are not
  approved. The dry-run script prints "£-2.00" (N-9).

**A-23 · P3 (also F-27) · Resolved** · `f8a54c71`
- *Problem / root cause:* P10 — a user with no name showed as `gone@test` to everyone, and list rows carried
  `ownerId`. The display name fell back to the e-mail, and `publicRow` always sent `ownerId`.
- *Correction:* the display name is the name, else a non-e-mail import owner, else "Unnamed user". `ownerId` goes to
  admins only. The client never read it (editing rights come from `canEdit`), so no `isOwner` flag was needed.
- *Files:* `server/data/kpi-store.ts` (`displayName`); `server/routes/kpi.ts` (`publicRow`);
  `tests/kpi-p2-a23-names-and-ids.test.ts`.
- *Test:* blank, whitespace-only and e-mail-shaped names give "Unnamed user"; no e-mail or `ownerId` in the rows,
  record view, summary or CSV for a user; the admin still gets `ownerId`. Before 3 fail / 1 pass; after 4 pass.
- *Probe:* P10 `gone@test` → **Unnamed user**; `ownerId` in rows → **none**.
- *Tests run:* 13 files, 120 pass. Access checks S3c, S3d and S3e pass (S3c and S3d fail on the pre-fix tree).
- *Limitations:* several unnamed users merge into one "Unnamed user" filter option. Names need not be unique
  (SEC-09). `/meta` returns the caller's own id.

**A-17 · P2 · Resolved** · `ca50ec85`
- *Problem / root cause:* the 8-page PDF was 10,901,505 B, 99.1 % of it raw RGB chart images. jsPDF was used without
  `compress`, and images without compression.
- *Correction:* `compress: true` and `addImage(…, 'FAST')` (lossless Flate). No new package.
- *Files:* `src/ui/kpi-dashboard/kpi-export.ts`; `tests/kpi-p2-a17-pdf-compression.test.ts`.
- *Test:* the settings; a chart PNG is stored FlateDecode at under 1/20 of the size, with byte-identical pixels.
  Before 3 fail; after 3 pass.
- *Before / after:*
  - Live fixture **10,901,505 B → 190,583 B (≈0.19 MB, 1.75 %)**
    (`A-17/live-after/costvision-kpi-dashboard-2026-11-17-2152.pdf`).
  - All 9 chart images pixel-identical (SHA-256); 100 % zoom crops `A-17/chart1-*-100pct.png`.
  - Volume run 20k / 50k 13,075,670 / 13,077,628 B → **448,204 / 446,529 B (−97 %)**.
  - The Step 5 live run, after Block 3 added axis titles, gave 247,144 B.
- *Tests run:* 14 files, 123 pass.
- *Limitations:* none known.

**A-18 · P2 · Resolved (approved part)** · `18044323`
- *Problem / root cause:* P17 — malformed filter JSON returned 200 with the **unfiltered** company totals
  (16 records), because `filtersOf` fell back to no filter on any failure.
- *Correction:* a strict `validateFilters`. The server answers 400 `BAD_FILTER` with a reason on `/summary`,
  `/records`, `/records.csv` and `/drill`. The screen shows "This filter could not be applied", the reason and
  **Clear filters**, and loads nothing until the filter is cleared or changed.
- *Files:* `src/engine/kpi-dashboard.ts`, `server/routes/kpi.ts`, `kpi-builders.ts` (`badFilterHtml`), `kpi-view.ts`;
  `tests/kpi-p2-a18-bad-filter.test.ts`.
- *Test:* 15 malformed cases on all four endpoints give 400. Well-formed filters, including a no-match, give 200 / 0.
  The builder escapes and uses `role="alert"`. Before 17 fail / 1 pass; after 18 pass.
- *Probe:* P17 200 (16, unfiltered) → **400**. P12 431 → 431 (Node refuses the over-long URL before the route).
- *Screens:* `A-18/screens-{before,after}/`, 1440 and 390, both themes. Before: company totals. After: the error, and
  Clear filters works. axe 0, overflow 0.
- *Tests run:* 15 files, 141 pass; both typechecks exit 0.
- *Limitations:* filters are not in the URL (not approved). Values over 120 characters now give the error (N-4).

### Block 3 — screen polish (all P3)

The Block 3 checks are shared:
- **Screens and measurements.** `block3/b3-screens.ts` ran on a throwaway server, before (`18044323`) and after
  (`9b5aa86a`), at 1920 / 1440 / 1366 / 1024 / 768 / 390, dark and light. Both runs gave axe 0, 0 px sideways scroll
  and identical financial figures.
- **Tests.** The area run after the last commit gave 31 files, 205 pass. Both typechecks exit 0, and the live e2e
  gave 59/59.

| ID · commit | Problem → correction | Files (+ new test) | Test before → after | Before / after evidence | Status · limits |
|---|---|---|---|---|---|
| F-19 · `f2895439`, `9b5aa86a` | No axis titles → both axes titled, value axis with unit ("Records (count)", "£ per piece (Σ)", "Gap, £ per piece (Σ)"); follow-up shortened money titles that were cut off on a 220 px chart | `kpi-charts.ts`; `kpi-p2-f19-axis-titles.test.ts` | 3 fail → 3 pass (16 titles, exact text, theme colour) | `block3/{before,after}/f19-*` | **Resolved** · no % axis exists, so no "%" title |
| F-21 · `3fcf77d3` | Opportunity card lacked its base → "4 of 6 eligible records above should-cost" | `kpi-builders.ts`; `kpi-p2-f21-opportunity-base.test.ts` | 2 fail → 2 pass | text in all 12 views; `f21-a29-financial-*` | **Resolved** · one more line at 1366 / 390 (+17 px); 390 still fits (797 of 844 px) |
| F-22 · `942b052a` | 5 literal shadows → `var(--shadow-lg)` / `var(--shadow-md)`; backdrop literal kept (option (a)) | `kpi-dashboard.css`; `kpi-p2-f22-shadow-tokens.test.ts` | 2 fail / 2 pass → 4 pass | computed shadows (`b3-results.json`); `f22-*` | **Resolved** · dark shadows now the theme's (darker); backdrop stays literal |
| F-23 · `5d8e4da3` | Sticky bar `top: 64px` → `56px` | `kpi-dashboard.css`; `kpi-p2-f23-sticky-seam.test.ts` | 1 fail → 1 pass | seam 8 → 0 px at 1920–768 both themes (390 is not sticky) | **Resolved** · 56 is a literal matched to the header |
| F-24 · `480291c0` | Column "Created" → "Costing date" | `kpi-builders.ts`; `kpi-p2-f24-costing-date-column.test.ts` | 1 fail / 1 pass → 2 pass | headers in 12 views; `f24-*` | **Resolved** · Excel / CSV keep both columns |
| F-25 · `f1f21adc` | Empty heading + `sheet_metal` → heading only with a breakdown / operations; display name via `COMMODITY_REPORT_LABELS` (read only) | `kpi-view.ts`; `kpi-p2-f25-costing-panel.test.ts` | 5 fail → 5 pass | panel text; `f25-panel-*` | **Resolved** · says "Pressed sheet metal" (the map's label); "no breakdown" now said twice (N-6) |
| F-26 · `5758c9c7` | Smooth scroll under reduced motion → `scrollBehavior()` 'auto' | `kpi-view.ts`; `kpi-p2-f26-reduced-motion-scroll.test.ts` | 2 fail → 2 pass | `scrollY` at 40 ms: 22 px (mid-scroll) → 4,244 px (there) | **Resolved** |
| F-28 · `787f2fd9` | Export `btn-primary` → `btn-secondary` | `kpi-view.ts`; `kpi-p2-f28-export-button.test.ts` | 1 fail → 1 pass | green fill → Refresh's surface; `f28-head-*` | **Resolved** |
| A-27 · `59c1bf4d` | "£-1.00" in insights / Excel → one `gbpSigned` (−£1.00); Excel two-section formats | `kpi-dashboard.ts`, `kpi-builders.ts`, `kpi-export.ts`; `kpi-p2-a27-negative-money.test.ts` | 4 fail → 4 pass | insight, PDF text, LibreOffice display (`A-27/`, `A-28/recalc-live-*`) | **Resolved** for money · PDF prints "-£" (font); % and original-currency use a hyphen (N-5) |
| A-28 (b) · `b735e5c5` | Reconciliation sheet gains annualised, validated and implemented savings rows (live formulas + check) | `kpi-export.ts`; `kpi-p2-a28b-reconciliation-rows.test.ts` | 3 fail / 2 pass → 5 pass | LibreOffice recalc: 7 rows → **10/10 ✓**, 0 errors | **Resolved** · counts beside cards not re-added; A-28 (a) not built |
| A-29 · `a35033f0` | "i" buttons 18 px → invisible 24 × 24 `::after` hit area | `kpi-dashboard.css`; `kpi-p2-a29-tip-hit-area.test.ts` | 1 fail / 1 pass → 2 pass | hit test 0/8 → 8/8 in 12 views; no pixel change at the buttons | **Resolved** for "i" · 41 × 15 links not in scope |

---

## C. All files changed

`git diff --stat 5f385ef5..HEAD` (HEAD = `9119da05`):

```
 calculator/scripts/kpi-identity-dry-run.ts         | 118 +++++++++++++++
 calculator/server/data/kpi-store.ts                |  44 +++++-
 calculator/server/routes/kpi.ts                    | 129 +++++++++++++---
 calculator/server/utils/kpi-edit-wording.ts        |  18 +++
 calculator/server/utils/kpi-import.ts              |  28 +++-
 calculator/src/engine/kpi-dashboard.ts             |  99 ++++++++++++-
 calculator/src/ui/kpi-dashboard/kpi-builders.ts    |  28 +++-
 calculator/src/ui/kpi-dashboard/kpi-charts.ts      |  27 ++--
 calculator/src/ui/kpi-dashboard/kpi-export.ts      |  37 +++--
 calculator/src/ui/kpi-dashboard/kpi-view.ts        |  80 +++++++---
 calculator/src/ui/styles/kpi-dashboard.css         |  16 +-
 calculator/tests/kpi-p2-a02-record-view.test.ts    |  92 ++++++++++++
 .../tests/kpi-p2-a03-validated-volume.test.ts      | 110 ++++++++++++++
 calculator/tests/kpi-p2-a04-should-readd.test.ts   | 142 ++++++++++++++++++
 calculator/tests/kpi-p2-a05-edit-wording.test.ts   |  36 +++++
 calculator/tests/kpi-p2-a05-owner-powers.test.ts   | 164 +++++++++++++++++++++
 calculator/tests/kpi-p2-a06-same-day-tie.test.ts   |  86 +++++++++++
 calculator/tests/kpi-p2-a07-fx-inversion.test.ts   |  98 ++++++++++++
 calculator/tests/kpi-p2-a10-import-rows.test.ts    |  97 ++++++++++++
 calculator/tests/kpi-p2-a11-identity-fold.test.ts  |  94 ++++++++++++
 .../tests/kpi-p2-a17-pdf-compression.test.ts       |  87 +++++++++++
 calculator/tests/kpi-p2-a18-bad-filter.test.ts     | 104 +++++++++++++
 calculator/tests/kpi-p2-a23-names-and-ids.test.ts  |  86 +++++++++++
 calculator/tests/kpi-p2-a27-negative-money.test.ts |  61 ++++++++
 .../tests/kpi-p2-a28b-reconciliation-rows.test.ts  | 101 +++++++++++++
 calculator/tests/kpi-p2-a29-tip-hit-area.test.ts   |  33 +++++
 calculator/tests/kpi-p2-f19-axis-titles.test.ts    |  77 ++++++++++
 .../tests/kpi-p2-f21-opportunity-base.test.ts      |  30 ++++
 calculator/tests/kpi-p2-f22-shadow-tokens.test.ts  |  41 ++++++
 calculator/tests/kpi-p2-f23-sticky-seam.test.ts    |  19 +++
 .../tests/kpi-p2-f24-costing-date-column.test.ts   |  29 ++++
 calculator/tests/kpi-p2-f25-costing-panel.test.ts  |  47 ++++++
 .../tests/kpi-p2-f26-reduced-motion-scroll.test.ts |  28 ++++
 calculator/tests/kpi-p2-f28-export-button.test.ts  |  17 +++
 34 files changed, 2213 insertions(+), 90 deletions(-)
```

| File | Finding(s) (from `git show --stat` per commit) |
|---|---|
| `scripts/kpi-identity-dry-run.ts` (new) | A-11 |
| `server/data/kpi-store.ts` | A-04 (linked breakdown read), A-23 (`displayName`) |
| `server/routes/kpi.ts` | A-03, A-02, A-04, A-05 (both commits), A-10, A-23, A-18 |
| `server/utils/kpi-edit-wording.ts` (new) | A-05 follow-up `9119da05` |
| `server/utils/kpi-import.ts` | A-07, A-10 |
| `src/engine/kpi-dashboard.ts` | A-04, A-06, A-11, A-18, A-27 |
| `src/ui/kpi-dashboard/kpi-builders.ts` | A-04, A-18, F-21, F-24, A-27 |
| `src/ui/kpi-dashboard/kpi-charts.ts` | F-19 (both commits) |
| `src/ui/kpi-dashboard/kpi-export.ts` | A-04, A-17, A-27, A-28 (b) |
| `src/ui/kpi-dashboard/kpi-view.ts` | A-04, A-18, F-25, F-26, F-28, A-05 follow-up |
| `src/ui/styles/kpi-dashboard.css` | F-22, F-23, A-29 |
| `tests/kpi-p2-<id>-*.test.ts` (23 new files) | each the finding in its name (A-05 has two) |

**Every changed file maps to a finding ID; none is without one.** These were deliberately left out of the diff:
- this report and `phase2-evidence/`, which are untracked;
- `calculator/dist`, which was not rebuilt or committed (see F);
- `package.json`, the lockfile, and every deployment or shared-CSS file, which were not touched.

---

## D. Test and regression results

| Check | Baseline (worktree, before Phase 2) | Final | Run? |
|---|---|---|---|
| `npm test` (full) | 368 files, 5,998 pass | **390 files, 6,114 pass** at Step 5 (+22 files, +116 tests; no baseline test fails) | Run at Step 5, and **re-run at the final commit `9119da05`: 391 files, 6,117 tests, all pass** (446 s; both typechecks exit 0) — `phase2-evidence/final/npm-test-9119da05.log`, `typecheck-9119da05.log` |
| KPI suite (`tests/kpi-*`) | — | 27 files / 215 pass (Step 6 reviewer, at `9b5aa86a`); **28 files / 218 pass** after `9119da05` | Run |
| `tsc -p tsconfig.build.json --noEmit` / `npm run typecheck` | exit 0 / exit 0 | exit 0 / exit 0 (Step 5, and again after `9119da05`) | Run |
| Live e2e `e2e/kpi-dashboard-live.ts` | 59/59 | **59/59 PASS** (Step 5) | Run at Step 5; not after `9119da05` |
| `npm run build` | — | exit 0 (Step 5); `dist` restored to the committed bundle afterwards | Run; **not committed** |
| Worktree dev DB | empty | Step 5: empty (22 tables, 0 users, 0 scenarios). Checked read-only now, after the follow-up's KPI run: 25 tables (KPI tables now created), 0 users, 0 scenarios, 0 KPI records; 3 rows in the CAD blank-cache tables written by test runs | Run |

**All 17 Phase 1 probes** (`regression/probes-before-v-after-diff.txt`). The Phase 2 "before" run equals Phase 1 on
every field.

| Result | Probes |
|---|---|
| Changed, as expected from an approved fix | P02 (A-05), P03 (A-07), P08 (its file is now refused because it holds P09's 2031 row), P09 (A-10), P10 (A-23), P14 (A-03 / A-05), P15 (A-04), P17 (A-18) |
| Unchanged, as expected | P01 (A-01 blocked), P04 and P05 (A-08), P06 (D-3), P07 (A-13), P11 (A-20), P12 (Node 431), P13 (controls), P16 (A-11 not wired) |
| Supplementary | P01b, P02b, P06b, P09b, P14b, P15b — all changed as intended |

**Access checks** (`access/after/checks.json`; 110 requests, tokens removed): **16/16 PASS on the fixed tree. The
pre-fix tree gave 8 PASS / 8 FAIL**, and the 8 that fail are exactly the checks the fixes target (S3a, S3c, S3d,
S4a–S4e). Signed-out users get 401 on all 16 routes, and admin-only routes give 403. The admin passed 18/18 actions.
There is no "outside the allowed domains" role because A-01 is blocked.

**Reconciliation** (`reconciliation/README.md`; 23 synthetic records / actions; the hand figures come from `hand.py`,
which uses no engine code):

| KPI (all time) | Before | After | Hand (fixed DB) | Moved by |
|---|---|---|---|---|
| Potential opportunity | £43.686032 | **£39.696032** | £39.696032 | A-04 −11.99, A-05 +10.00, A-06 −2.00 |
| Weighted gap | +14.7019 % | **+11.7235 %** | 11.7235 % | (same) |
| Unfavourable | −£2.00 | −£2.00 | −£2.00 | unchanged, not netted |
| Annualised | £1,220,000 | **£20,000** | £20,000 | A-03 |
| Eligible / current / excluded | 17 / 17 / 1 | 17 / 17 / 0 | same | A-04, A-05 |
| Should-cost basis (DQ) | — | re-added 11, total only 6 | 11 / 6 | A-04 |

The cards, records table, PDF, Excel (10/10 ✓, 0 formula errors) and CSV all give the after figures. Original
currencies and the frozen FX snapshots are unchanged, and every item on the "What must not change" list holds on
this set.

**Volume** (`regression/volume/volume-summary.md`; medians of 3):
- **Exports:** complete at 50,000 (30,000 + 20,000 rows).
- **Response times at 50k:** table page / search / drill / record are 47 / 36 / 22 / 13 ms, all under 50 ms.
- **PDF size:** −97 %.
- **Over the brief's 10 % line (needs your acceptance):**
  - **A-04's cold `/summary` with linked costings seeded at 50k: 2,129 ms against 1,437 ms pre-fix, +692 ms (+48 %).**
    At 20k it is 845 ms against 539 ms, and a rebuild after a write is +18 %.
  - **Excel export at 20k: +12 %** against Phase 1 (+7 % at 50k). The file is 5–6 % larger because of A-28 (b)'s
    columns.

Without seeded costings (Phase 1's harness) the fixed code is level with Phase 1. The other >10 % moves are explained
as noise in the Appendix (the pre-fix tree, measured the same evening, shows the same spread).

**Screens:** the full 12-view set (`regression/screens/final/`) has axe 0 and 0 px sideways scroll in all views.
Against Phase 1, the only differences are approved ones. At 390 px the financial position still fits on the first
screen (797 of 844 px).

**Console / network:** no errors on the dashboard, the costing tools' pages or the 24 volume runs.

**Rest of CostVision:** all costing-tool tiles open; CAD to Cost live 32/32; STL DFM live 10/10; drawing live 73/73;
the theme survives a reload.

**CI smoke (`npm run test:e2e`) FAILS on both the fixed and the pre-fix tree.** It waits for the removed software
wizard. This is pre-existing (N-8).

**Not run:**
- the load test (H.5): E-4 is blank. 100k / 250k records, concurrency, throttling, a low-memory laptop and every H.5
  threshold are "not tested";
- after `9119da05`: the full `npm test`, the live e2e, the screenshots and the volume run;
- a screenshot of the follow-up's edit-form note.

---

## E. Independent review results (Step 6)

A separate agent, which wrote none of the fixes, reviewed `5f385ef5..9b5aa86a` against the brief. It found:
- **Tests:** it ran 27 KPI files / 215 tests, all passing. It also ran the 22 `kpi-p2` test files against the
  pre-fix tree: 84 fail / 25 pass. The 25 are deliberate guards.
- **Scope:** nothing is out of scope. There is no dependency, schema, migration or deployment change. Blocked items
  were not built, and A-11 is not switched on.
- **Hygiene:** commit hygiene is OK and there are no secrets in the evidence.
- **Money invariants:** intact.
- **Verdict:** **acceptable to take to Stop 3 with corrections; no blocker.**

| # | Severity · finding | Issue | What was done |
|---|---|---|---|
| 1 | Should-fix · A-04 | The "should-cost basis" label is computed when records are read, from the linked `scenarios` row's **current** breakdown (`kpi-store.ts` `SELECT_WITH_COSTING`). That row can be rewritten later: a re-POST with the same scenario id, or the owner's `/api/sync/scenarios`. So the label and the data-quality count can drift in either direction after the save. The screen always uses a fresh scenario id, so ordinary use is not affected. The proper fix stores the verdict or breakdown at save, which is a new field and needs D-10 | **Not fixed** → new finding **N-10 (P2)** |
| 2 | Should-fix · A-04 | A CostVision save with no breakdown (or no numeric line) is accepted as "total only". The probe sent a total of 0.01 with no breakdown and got 201. This matches the brief's wording ("records that carry a breakdown") but lets a client skip the check. Every real CostVision result carries a re-adding 8-bucket breakdown, so requiring one would be safe, but it tightens the approved rule | **Needs you** → new finding **N-11 (P2)** |
| 3 | Minor · A-05 | The owner's edit-form note was misleading, and the 400 showed raw field names and "a approved" | **Fixed in scope**, commit `9119da05` (see B, A-05) |
| 4 | Should-fix (performance) · A-04 | The cold `/summary` with costings is +48 % at 50k, and the Excel export is +12 % at 20k. Both are over the 10 % line and were stated in Step 5 | **Needs you to accept.** A stored field (N-10, D-10) would remove the read-time cost |
| 5 | Note · A-03 / A-05 | The admin re-import updates a live record wholesale, including `volume_validated` and `status`. So the "whoever makes the change" rules do not hold on the import path | D-9 territory, already in the D-9 remainder. Not a defect in the approved part |
| 6 | Note · A-23 | Users without a name merge into one "Unnamed user" filter option (as stated). The hyphen-minus on percentages and original-currency amounts is N-5 | Already listed |
| 7 | Note | `calculator/dist` was not rebuilt or committed, so the screen fixes are not in the committed bundle. The evidence folder is 130 MB and untracked | **Open item for you** (F). Not done here: there is no deploy in this phase |
| 8 | Report accuracy | The status table gave A-17's live PDF as "0.25 MB", but the evidence file is 190,583 B (≈0.19 MB). Separately, "Defects found in the approved fixes: None" did not reflect issues 1–3 | **Corrected** throughout: 190,583 B checked with `stat`. The "None" line now points here |

---

## F. Open items

### Blocked by a blank decision (grouped by decision)

| Decision | Blocks |
|---|---|
| **D-8** + allowed domains | A-01 (open sign-up), A-25 (admin demotion, dev OTP in production) |
| D-8b | Scoping who sees supplier prices. It would not be built in this phase in any case |
| **D-10** | A-03 (validator, date, source); A-04 (rate-book stamp; N-10, a stored should-cost basis); A-12 and A-13 (not approved); D-1's data capture |
| **D-4** | A-05: deleting or withdrawing an approved record (owner delete still 200) |
| D-3 | A-06: ranking approved > reviewed > completed (P06) |
| D-3b | A-16: parallel costings of one part |
| D-5 | A-07 remainder (tolerance, previous-rate check, unreferenced currencies such as AED); A-15 |
| D-6 | A-03: the source of the annual volume |
| D-9 | A-10 remainder (imported approval / validation / saving flags; re-import overwriting in-app decisions); review note 5 |
| D-1, D-2, D-7 | A-09, A-08, A-13 (not approved) |
| E-2 | Deleting test-tool leftovers (nothing was deleted) |
| E-4 | Load test (H.5), not tested |
| A-28 (a) | Treat a current cost of 0 as a value, keep it as missing and flag it, or no. Still "Your choice", so it was not built |

### Partly fixed — what is left

| Finding | Left |
|---|---|
| A-03 | Who validated, when, from what source (D-10, D-6). Pre-fix data (N-7) |
| A-04 | Rate-book stamp (D-10); server-side recompute (not approved); N-10; N-11; the performance acceptance |
| A-05 | Delete / withdraw (D-4); who set a status (D-10); the status list (N-2) |
| A-06 | Ranking (D-3) |
| A-07 | D-5 items above |
| A-10 | D-9 items above; N-1 |
| A-11 | Switching on (your Stop 2-A choice); controlled lists; ISO country codes |

### Not approved in this phase (untouched)

A-08, A-09, A-12, A-13, A-15, A-16 (decisions D-1 to D-10); A-14 (audit before / after values); A-19, A-20, A-21
(server exports, rate limiting, cache); A-22 / F-02 ("Where to act" layout); A-24 (xlsx → ExcelJS); A-26 (app-wide CSP /
token); the A-04 server recompute; the A-10 and A-11 remainders; F-16 (deep link into an open tab); X-01 (menu
position).

### A-11 dry run — what switching it on would merge (your choice of option 1, 2 or 3)

- **Probe DB:**
  - 25 → **22** applications; eligible 20 → 17; opportunity £73.68 → **£69.68**; annualised unchanged.
  - The three LR-VARB-100 spellings merge into one (two become superseded).
  - P16-CASE on Q900 / q900 merges: Bob's later costing is current and Alice's is a duplicate.
- **Reconciliation set:**
  - **17 → 14** applications; opportunity **£39.70 → £35.70**.
  - LR-REC-200 / lr-rec-200 / LRREC200 / LR_REC_200 merge.
  - REC-CASE-18 on Q901 / q901 merges.
  - The £4.00 drop is two £1 variant gaps plus one £2 programme-case gap.
- **Options** (details in Appendix, Stop 2-A):
  1. Switch on for part number and programme everywhere, after a dry run on the real database that you review.
  2. Switch on for the part number only, plus a data-quality count of programme-case variants.
  3. Do not switch on, and add a "possible same component" data-quality list instead.

### New findings (Phase 2; not fixed)

| ID | Pri | One line |
|---|---|---|
| N-1 | P3 | KPI test / e2e fixtures date rows `${MONTH}-02…04`. A-10 refuses them on the 1st–2nd of a month |
| N-2 | P3 | The owner's edit form offers Draft / Completed on an approved record. The server refuses Draft, and Completed unless an identity / volume field changes |
| N-3 | P3 | The admin's form re-sends "volume validated" ticked, so the A-03 400 forces a round trip |
| N-4 | P3 | Imported labels over 120 characters become a filter error (A-18) |
| N-5 | P3 | Negative % and original-currency amounts use a hyphen (still sign-first) |
| N-6 | P3 | The panel says "no breakdown" twice for a total-only save (A-04 + F-25) |
| N-7 | P2 | Records changed before the fixes stay as they were (R9's volume, R10's test flag). A read-only audit-log check is needed before go-live |
| N-8 | P3 | CI smoke `npm run test:e2e` fails before and after: it waits for the removed software wizard (pre-existing) |
| N-9 | P3 | The A-11 dry-run script prints "£-2.00" |
| **N-10** | **P2** | The A-04 should-cost basis is read live from a rewritable `scenarios` row, so the label / DQ count can drift after save. Fix = store at save (D-10) |
| **N-11** | **P2** | A CostVision save with no breakdown is accepted as "total only". Requiring a breakdown on CostVision saves tightens the approved rule, so it needs your decision |

### Other open items for you

- **Rebuild `calculator/dist` and `git add -f calculator/dist`** before anything ships (CLAUDE.md). It was not done,
  because there is no deploy in this phase.
- **Accept, or not, the A-04 performance cost** (D above).
- **Before committing the evidence (130 MB, untracked):** add a `.gitignore` like Phase 1's for the screenshots and
  exports.

### Leftover files from test tools (paths only; nothing deleted — E-2 blank)

Checked with `ls -d` on 17 Nov 2026 at 23:57 UTC. The machine's boot time reads 23:51 UTC, so this is after the
restart, and **all of these still exist**:
- `/tmp/cv-kpi-<pid>-<time>/`: 41 directories, including Phase 1's `/tmp/cv-kpi-1736-1794393709989/` and
  `/tmp/cv-kpi-3738-1794393793005/`
- `/tmp/cv-phase1-probe-*`: 15 (3 from Phase 1, 12 from early Phase 2 probe runs, including
  `/tmp/cv-phase1-probe-XSgz3x`, the A-11 dry-run DB)
- `/tmp/cv-kpi-p2-*`: 290 (the new tests' temp databases); `/tmp/cv-kpi-audit-*`: 17; `/tmp/cv-kpi-live-*`: 14
- `/tmp/cv-phase2-*`: 32 entries — `a18-*` ×4, `a28-lo`, `b3-*` ×9 (server DBs, LibreOffice profiles, PDF text,
  `b3-live`), `c2c-live`, `drawing-live`, `stl-dfm-live`, `hand-afterdb-oldtie.{json,md}`, `npm-ci.log`, `perf-dl`
  (506 MB), `prefix` (104 MB), `probe-*` ×5, `recon-*` ×3, `recon-lo`, `review` (Step 6)
- `calculator/node_modules/.vite-temp/` in both `/home/user/leamington-marathi` and `/home/user/cv-phase2`
- Kept as instructed: `/home/user/leamington-marathi/calculator/data/should-cost.db` (empty dev DB). The worktree's
  own `calculator/data/should-cost.db` also remains, created by the test runs.

---

## G. Confirmation

- **Commits and branch:** housekeeping commit `5f385ef5` "Phase 1 audit report and evidence"; worktree
  `/home/user/cv-phase2`, branch `phase2-approved-fixes`; final commit `9119da05` (24 commits after `5f385ef5`: one
  per finding plus the F-19 and A-05 follow-ups).
- **Nothing was pushed, merged, opened as a pull request or deployed.** No deployment configuration changed: `git
  diff --stat 5f385ef5..HEAD -- '*fly.toml' 'calculator/package*.json' docker-compose*.yml '*Dockerfile*' .github` is
  **empty**.
- **The original working copy changed only through the housekeeping commit.** In `/home/user/leamington-marathi`
  (read-only commands only), `git log --oneline -1` = `5f385ef5 Phase 1 audit report and evidence`, `git status
  --short` is **empty**, and the branch is `dashboard-audit-fixes`.
- **No real data and no Fly server were accessed.** Only throwaway SQLite databases in `/tmp`, the worktree's empty
  dev database and synthetic files (no real CSS System, CPSC II or FX table) were used. No secrets or tokens appear
  in this report, the commits or the evidence; access-check requests show "Bearer <removed>".

---

# Appendix — working record (Stop 1 plan, Step 2 per-finding notes, Stop 2-A, Steps 3–5)

The material below is the record as kept during the work. Its headings are demoted one level. Where it disagrees with
sections A–G, sections A–G are current. In particular, A-17's live PDF is 190,583 B and Step 6 raised issues (E).

### Status as at Steps 3–5 (before Step 6; superseded by section A)

**Readiness verdict: not ready for production.** A-01 is blocked (D-8 and the domains blank); A-03, A-04 and A-05 are
partly fixed (D-10, D-4); records changed before the fixes are not corrected by them (N-7).

| Item | Finding | Commit | Status after Steps 3–5 |
|---|---|---|---|
| 1 | A-03 | `2edebda2` | **Partly fixed** — approved part verified (probe, test, reconciliation £1,220,000 → £20,000 = hand, access S4d/S4e); validator / date / source need D-10; pre-fix data not corrected (N-7) |
| 2 | A-02 | `30b2d690` | **Resolved** (probe P01b, test, Step 4 S3a/S3b PASS; pre-fix tree FAILS S3a) |
| 3 | A-04 | `60223582` | **Partly fixed** — approved part verified (reconciliation −£11.99 = hand; R15 rounding kept; imports "total only" on screen, PDF, Excel); rate-book stamp needs D-10 |
| 4 | A-05 | `b15380c5` | **Partly fixed, delete still open (D-4)** — approved part verified (reconciliation +£10.00, statuses / commodity = hand; Step 4 S4a–S4c PASS) |
| 5 | A-06 | `f05d2856` | **Partly fixed** — tie-break verified (reconciliation −£2.00 = hand, R8 current on screen and exports); ranking approved > newer is D-3 |
| 6 | A-07 | `fe35878e` | **Partly fixed** — inversion check verified (P03, tests, full regression); tolerance, previous-rate check, unreferenced currencies are D-5 |
| 7 | A-10 | `360cebb0` | **Partly fixed** (D-9 parts open); approved part verified (P09, P09b, regression) |
| 8 | A-11 | `82b88cea` | **Partly fixed** — function + dry run (also on the reconciliation set: 17 → 14 applications, £39.70 → £35.70); switching on is **Stop 2-A** |
| 9 | A-23 | `f8a54c71` | **Resolved** (P10, test, Step 4 S3c/S3d/S3e PASS; pre-fix tree FAILS S3c/S3d) |
| 10 | A-17 | `ca50ec85` | **Resolved** (live 10.9 MB → 0.19 MB, 190,583 B — corrected at Step 7 from "0.25 MB"; 20k / 50k 13.08 MB → 0.45 MB, −97 %) |
| 11 | A-18 | `18044323` | **Resolved** for the approved part (P17; regression clean) |
| 12 | F-19 | `f2895439` + `9b5aa86a` | **Resolved** |
| 13 | F-21 | `3fcf77d3` | **Resolved** |
| 14 | F-22 | `942b052a` | **Resolved** — option (a): backdrop literal kept as decided |
| 15 | F-23 | `5d8e4da3` | **Resolved** (sticky filter bar 8 px higher than Phase 1 in the 12-view run, as intended) |
| 16 | F-24 | `480291c0` | **Resolved** |
| 17 | F-25 | `f1f21adc` | **Resolved** |
| 18 | F-26 | `5758c9c7` | **Resolved** |
| 19 | F-28 | `787f2fd9` | **Resolved** |
| 20 | A-27 | `59c1bf4d` | **Resolved** for negative money (percentages unchanged — N-5) |
| 21 | A-28 (b) | `b735e5c5` | **Resolved** (also 10/10 ✓ on the reconciliation set). A-28 (a) not built (undecided) |
| 22 | A-29 | `a35033f0` | **Resolved** for the "i" buttons |
| — | A-01, A-25 | — | **Blocked** (D-8 and the domains blank) |

---

### Stop 1

#### Starting-state check (original working copy `/home/user/leamington-marathi`)

| Check | Expected | Found |
|---|---|---|
| Branch / HEAD | `dashboard-audit-fixes` @ `a618cd4d` | `dashboard-audit-fixes` @ `a618cd4d` ✓ |
| Local commits not pushed | 36 | 36 ahead of `claude/new-session-ts4byp` (no upstream) ✓ |
| Tracked changes (`git diff --stat`) | none | none ✓ |
| Untracked | Phase 1 report + evidence | `phase1-independent-audit.md`, `phase1-evidence/` only ✓ |
| Stash | — | empty ✓ |

#### Housekeeping commit

- The evidence was scanned for secrets before staging: no tokens, no OTPs, no keys. The only e-mail addresses are the
  synthetic `outsider@example.org` and `u-noname@example.test`.
- `calculator/docs/dashboard-audit/phase1-evidence/.gitignore` patterns:

  ```
  perf-downloads/
  e2e-live/*.pdf
  e2e-live/*.xlsx
  e2e-live/*.csv
  ```

  These exclude 81 MB of export downloads. The live run's result JSON, server log and three PNGs (about 2 MB) are kept,
  because they are the evidence.
- The files were staged by explicit path only: the report, the evidence folder and its `.gitignore`. That is 84 files,
  19.2 MB. `git status` showed nothing else staged.
- Commit: **`5f385ef5` "Phase 1 audit report and evidence"**. The working copy is clean after it, and it has not been
  touched since.
- **E-2 is blank, so nothing was deleted.** These test-tool leftovers stay:
  - `/tmp/cv-kpi-1736-1794393709989/`
  - `/tmp/cv-kpi-3738-1794393793005/`
  - three `/tmp/cv-phase1-probe-*` directories
  - `calculator/node_modules/.vite-temp/`
  - the empty `calculator/data/should-cost.db`, which is kept as instructed

#### Worktree

- Path `/home/user/cv-phase2`, branch `phase2-approved-fixes`, starting commit `5f385ef5`.
- `npm ci` (from the lockfile, `--no-audit --no-fund`): 463 packages, exit 0. `package.json` and the lockfile are
  unchanged (`git status` clean).

#### Decisions filled in → what is unblocked

| Decision | Filled? | Effect in this phase |
|---|---|---|
| D-1, D-2, D-3, D-3b, D-5, D-6, D-7, D-9 | blank | Not needed by any approved fix. A-07 builds only the inversion check (the tolerance is D-5); A-06 is the tie-break only (the ranking is D-3) |
| **D-4** | blank | **A-05 delete / withdraw stays as today** → A-05 can only be *partly fixed, delete still open* |
| **D-8** + domains | blank | **A-01 and A-25 are BLOCKED** (Block 1 conditional skipped) |
| D-8b | blank | Not built in any case |
| **D-10** | blank | **No new field, no migration** → A-03 clears the flag only (*partly fixed*, no validator / date / source); A-04 cannot record the rate book (*partly fixed*) |
| A-28 (a) | "Your choice" | **Not built** |
| E-2 | blank | Nothing deleted (paths listed above) |
| E-4 | blank | No load test; every H.5 item will be reported "not tested" |

---

### Plan (order: Block 1 → Block 2 → Block 3; Block 1 conditional is blocked)

Every file below is **dashboard-only** unless marked. "Shared" means another page or costing tool also uses the file.

| # | ID | One line | Files (re-checked against the code) | Shared? | Depends on | Risk | Test added (fails before, passes after) |
|---|---|---|---|---|---|---|---|
| 1 | **A-03** P0 | Any change to the annual volume of a validated record clears `volumeValidated`, whoever makes it. An admin re-validates in a separate PATCH, which is logged as before | `server/routes/kpi.ts` PATCH (`:289-314`) | No | D-10 blank → flag only | Low — one rule in PATCH | HTTP: an owner, and an admin, each change a validated volume → `volumeValidated:false`. The annualised KPI falls out. A same-value save (the edit form always sends every field) does NOT clear. A patch that changes the volume AND sets `volumeValidated:true` is refused 400 "re-validate separately" |
| 2 | **A-02** P1 | `/records/:id` sends a non-owner, non-admin user only what the panel shows: costing `{commodity, region, result:{total, breakdown (8 buckets), operationDetails [name, cost]}}`. The owner and admins get the full saved costing | `server/routes/kpi.ts` (`:162-180`) | No | — | Low | HTTP: Bob reads Alice's record → no `input`, no extra result fields, buckets and total present. Alice and the admin → full costing |
| 3 | **A-04** P1 | (a) Save refuses a should-cost whose breakdown does not re-add within *number of numeric breakdown lines × 0.005* (8 lines → £0.04). (b) Every record carries a derived **should-cost basis**: `re-added` / `does not re-add` / `total only, not re-added` (imports, or a save with no breakdown). It shows in the record panel and in a new data-quality count. (c) Rate book: **skipped** (no field; D-10 blank) | `server/routes/kpi.ts` (save `:207-260`); `server/data/kpi-store.ts` `listRecords` (one extra SQL read of the linked scenario's `$.result.total` / `$.result.breakdown`; no schema change); `src/engine/kpi-dashboard.ts` (optional `shouldBasis` on the record, new `DataQuality` counts); `src/ui/kpi-dashboard/kpi-view.ts` (panel line), `kpi-builders.ts` (data-quality rows), `kpi-export.ts` (Data quality sheet rows) | No | Tolerance (confirm below); D-10 for the rate book | **Medium** — the save path refuses inputs it accepted before; a new read in `listRecords` (timed in the volume run) | HTTP: total 0.01 with a £1,998 breakdown → 400. Total off by rounding (≤ £0.04) → 201. No breakdown → 201, basis "total only". Import → "total only". Engine: data-quality counts |
| 4 | **A-05** P1 | Server: `isTest`, `commodity`, `country` admin-only. An owner cannot change a *reviewed / approved* status (the statuses only an admin can set). A **changed** identity field (part number, programme, model year, powertrain) or volume on a reviewed / approved record → `completed`, whoever makes it. A patch that changes identity / volume and asks for reviewed / approved in the same request is refused 400 ("re-approve separately"). The existing money-field rule is kept. Delete unchanged (D-4) | `server/routes/kpi.ts` (`ADMIN_ONLY_FIELDS`, PATCH) | No | D-4 blank → delete open | **Medium** — the edit form sends every field every time, so "changed" must be value-compared (status included), or owners could not save notes on an approved record | HTTP, as owner: `isTest` / `commodity` / `country` → 403; approved → draft → 403; a notes-only save of an approved record keeps it approved; part number / programme / MY / powertrain / volume change → `completed`. As admin: the same identity change → `completed`; re-approve afterwards → approved; `isTest` allowed |
| 5 | **A-06** P1 | Same-day ties break on `createdAt`, not `updatedAt` | `src/engine/kpi-dashboard.ts` sort (`:284-288`) | No | — (ranking is D-3) | Low–medium — can change which costing is current for same-day ties; covered in the Step 3 reconciliation | Engine: two same-day costings; editing the older one's notes no longer makes it current |
| 6 | **A-07** P1 | Refuse a rate that is closer (on a log scale) to 1/reference than to the reference. Where the reference is within 10 % of 1.0, warn instead. The 10× guard is unchanged | `server/utils/kpi-import.ts` `parseFxRows` (`:79-84`) | No | — (tolerance etc. D-5) | Low | Parser + HTTP: EUR 1.19 and USD 1.31 → 400 with row and column; EUR 0.84 → OK; a reference within 10 % of 1 → loaded with a note; ZAR still refused by the 10× guard |
| 7 | **A-10** P1 (part) | Refuse rows with a future `costing_date`, and rows whose tool + reference matches a **deleted** record; each refused row is reported with its reason (the import stays all-or-nothing, as today) | `server/utils/kpi-import.ts` (`date` / row checks; row number carried); `server/routes/kpi.ts` import (`:379-401`) | No | Approval flags + overwrite = D-9 (open) | Low | HTTP: a 2031 row → 400 naming row and column; a row matching a deleted record → 400; a valid file still imports |
| 8 | **A-11** P1 (part) | `foldIdentityCode()`: fold case and remove spaces, `-`, `_`, `.`, `/`. **Not wired** into grouping, identity or KPIs. Read-only dry-run script lists which records a folded key would group | `src/engine/kpi-dashboard.ts` (new exported function only); new `scripts/kpi-identity-dry-run.ts` (opens the DB **read-only**) | No | Switch-on needs approval (Stop 2) | Low — nothing calls it | Unit: LR-VAR-100 / LRVAR100 / LR_VAR_100 / lr.var/100 → one key; Q900 / q900 → one key; existing `normalisePartNumber` unchanged. Dry run on the throwaway reconciliation set → Stop 2 |
| 9 | **A-23** P3 | Display name never an e-mail: use the trimmed full name, else an import's owner label that is not an e-mail, else "Unnamed user". `ownerId` removed from rows sent to ordinary users (the client never reads it; `canEdit` is computed on the server) | `server/data/kpi-store.ts` `rowToRecord` (`:151`); `server/routes/kpi.ts` `publicRow` | No | — | Low | HTTP: a user with a blank name → "Unnamed user" in rows, detail, CSV; no `ownerId` in list rows for a user; an import owner "R. Rao" kept |
| 10 | **A-17** P2 | Lossless compression on: `new jsPDF({…, compress: true})` + `addImage(…, 'FAST')` | `src/ui/kpi-dashboard/kpi-export.ts` (`:258`, `:293`) | No | — | Low | Live: PDF size before / after (Phase 1: 10.9 MB) + a 100 % zoom image diff of one chart |
| 11 | **A-18** P2 | Server: a malformed `f` (bad JSON, > 20,000 chars, unknown key, wrong type, unknown date preset, bad custom date, unknown status / non-ISO currency) → 400 `BAD_FILTER` with a reason, never the unfiltered totals. Screen: that error shows "This filter could not be applied" + a **Clear filters** button (resets filters, including the stored ones) | `server/routes/kpi.ts` `filtersOf`; `src/engine/kpi-dashboard.ts` (a strict `validateFilters` beside `parseFilters`); `src/ui/kpi-dashboard/kpi-view.ts` error state | No | Filters in the URL not approved | Low–medium — stricter input; the screen only ever sends well-formed filters, so the risk is a stale stored filter, which this handles | HTTP: malformed / unknown → 400; a well-formed no-match → 200 with 0. UI: a corrupt stored filter → error + Clear filters → dashboard loads |
| 12 | F-19 | Axis titles with units ("Current records", "£ per piece", "%") | `kpi-charts.ts` | No | — | Low | UI test on the chart configs |
| 13 | F-21 | Opportunity card "x of y eligible" | `kpi-builders.ts` (`:129-131`) | No | — | Low | Builder test |
| 14 | F-22 | The five literal box-shadows → `var(--shadow-md)` / `var(--shadow-lg)`. **The dialog backdrop (`rgba(0,0,0,.45)`) has no existing theme token** — see the question below | `kpi-dashboard.css` (`:49,64,97,111,237,238`) | No (`kd-` only) | Your answer on the backdrop | Low | CSS test: no `rgba(` in shadows |
| 15 | F-23 | Sticky filter bar `top: 56px` (the app header is 56 px, `calculator.css:175`) | `kpi-dashboard.css:54` | No | — | Low | Screenshot + metric: the bar top equals the header bottom |
| 16 | F-24 | Records-table column "Created" → "Costing date" (the Excel column of that name is the real created timestamp and stays) | `kpi-builders.ts:293` | No | — | Low | Builder test |
| 17 | F-25 | Panel: the "Original costing analysis" heading only when a breakdown or operations exist, otherwise one line; commodity display name via the existing `COMMODITY_REPORT_LABELS` ("Sheet metal", not `sheet_metal`) | `kpi-view.ts` (`:294-300`); reads `src/ui/data/commodity-meta.ts` (shared, **read only**) | Reads a shared map, changes nothing in it | — | Low | Builder / UI test |
| 18 | F-26 | Smooth scroll only without `prefers-reduced-motion` | `kpi-view.ts:642` | No | — | Low | UI test |
| 19 | F-28 | Export button `btn-secondary` (same as Refresh) | `kpi-view.ts:142` | No | — | Low | Shell test |
| 20 | A-27 | One sign-first money formatter (−£4.03). The engine's insight formatters (`gbp0` / `gbp2`, `:671-672`) get the screen's rule; Excel GBP formats become sign-first; the PDF keeps `pdfSafe` (− → -, still sign-first) | `kpi-dashboard.ts`, `kpi-export.ts` | No | — | Low | Unit: insight text for a negative gap reads "−£4.03"; Excel number formats |
| 21 | A-28 (b) | Reconciliation sheet: annualised opportunity, validated savings and implemented savings rows, each a live formula over the exported rows, plus a check against the dashboard figure | `kpi-export.ts` (`:187-196`) | No | — | Low | Workbook test + LibreOffice recalc (0 errors) |
| 22 | A-29 | 24 × 24 px hit area on the "i" buttons via an invisible `::after` extension; the glyph and layout unchanged | `kpi-dashboard.css` | No | — | Low | Live metric: the hit box ≥ 24 px, screenshots identical |

**Not touched** (from "Not approved" and "What must not change"):

- the weighted-gap formula and its sign;
- opportunity v unfavourable;
- the missing-value rule; FX freezing and recalculation;
- the identity key and the revision rule (A-11 not wired);
- the period semantics (A-08);
- server-side exports, rate limiting and the cache (A-19, A-20, A-21);
- "Where to act" layout (A-22 / F-02);
- the xlsx package (A-24); app-wide CSP / token storage (A-26);
- `main.ts`, `fly.toml`, `package.json` / lockfile;
- shared CSS and components.

**No new dependency, no schema change, no migration.**

#### Questions to confirm at Stop 1

1. **A-04 tolerance:** number of numeric breakdown lines × 0.005 in the record's currency. A CostVision breakdown has 8
   lines, so the tolerance is £0.04. Confirm.
2. **A-10 "future":** a costing date later than today (server date, UTC). Should a one-day grace apply for users east of
   UTC, where "today" can already be tomorrow in UTC? **Proposed: refuse anything after today + 1 day.**
3. **F-22 backdrop:** no theme token exists for a dialog backdrop. Options:
   - (a) leave the one backdrop literal and replace only the five shadows;
   - (b) a dashboard-scoped `--kd-backdrop` defined for both themes in `kpi-dashboard.css` (still a colour value, just
     named);
   - (c) add an app-wide token (a shared-CSS change, not approved).

   **Proposed: (a).**
4. **A-05 "status set by an admin":** with no field recording who set a status (D-10 blank), "admin-set" is taken as
   *reviewed or approved*, the only statuses an owner cannot set. An admin setting a record back to draft or completed
   cannot be told apart from the owner doing it. Confirm this reading.
5. **A-03 / A-05, same-request re-approval:** a patch that changes the volume (or an identity field) and in the same
   request sets `volumeValidated: true` (or status approved) is refused, so validation and approval are always separate
   logged actions. Confirm.

#### Fresh baseline in the worktree (before any change)

| Check | Phase 1 | Phase 2 worktree baseline | Log |
|---|---|---|---|
| `npm test` | 368 files, 5,998 tests pass | **368 files, 5,998 tests pass** (396 s) | `phase2-evidence/baseline/npm-test.log` |
| `tsc -p tsconfig.build.json --noEmit` | exit 0 | **exit 0** | `baseline/typecheck-build.log` |
| `npm run typecheck` | exit 0 | **exit 0** | `baseline/typecheck-full.log` |
| Live e2e `e2e/kpi-dashboard-live.ts` | 59/59 | **59/59 PASS** | `baseline/e2e-live.log`, `baseline/e2e-live/results.json` |
| PDF export size (live fixture) | 10,901,505 B | **10,901,505 B** (identical) | `baseline/e2e-live/` |
| Worktree dev DB after `npm test` | — | `calculator/data/should-cost.db` created by the test run: 22 tables, **0 users, 0 scenarios**, no KPI table — empty | `baseline/dev-db-after-tests.txt` |

The worktree's `git status` shows only the new `phase2-evidence/` folder and this report.

---

### Step 2 — Block 1 and Block 2 control fixes (plan items 1–11)

Probes: `phase2-evidence/probes/probes.ts` is the Phase 1 probe script with two changes (stated in its header): the
output path is an argument, and the `save()` helper's breakdown re-adds to its total (Phase 1 sent a fixed £13 breakdown
with totals of £3–£99, which A-04 now refuses; the probes test other things). Six supplementary probes were added for
cases Phase 1 did not probe (P01b A-02, P02b A-05, P06b A-06, P09b A-10, P14b A-03, P15b A-04). **The "before" run
(`phase2-evidence/probes/probes-before.json`) was taken on the unchanged code** (P14b was corrected to use one record per
case and re-run with the A-03 change stashed). Each finding's folder holds `probes-after.json` (all probes, after that
finding) and `probe-before-after.json` (its probes side by side). Tests that fail before / pass after:
`<finding>/test-before-fix.log`, `<finding>/test-after-fix.log`. The report and evidence are not in the finding commits.

#### A-03 (P0) — a validated annual volume can be changed by its owner

| Item | Content |
|---|---|
| Original problem | P14: the owner PATCHes `annualVolume` 60,000 → 6,000,000 on a validated, approved record → 200, still validated; annualised £120,000 → £12,000,000 |
| Root cause | `volumeValidated` is a boolean not bound to the value validated; PATCH never touched it on a volume change |
| Correction made | PATCH: a value change of `annualVolume` on a validated record sets `volumeValidated:false`, owner or admin. Same value (the form sends every field) keeps it. Change + `volumeValidated:true` in one request on a validated record → 400 "…validate it as a separate save" (Stop 1, Q5). A first validation of a not-yet-validated record (volume + flag in one save) is unchanged — e2e and Phase 1 probe set-ups use it |
| Files changed | `calculator/server/routes/kpi.ts` (PATCH rule); `calculator/tests/kpi-p2-a03-validated-volume.test.ts` (new) |
| Commit | `2edebda2` |
| Test added | `kpi-p2-a03-validated-volume.test.ts` (HTTP): owner change → cleared + annualised drops to 0; admin change → cleared; same-value save → kept; change + re-validate in one request → 400, then two separate saves → validated, two audit entries; first validation in one save → allowed. **Before the fix: 3 failed / 2 passed. After: 5 passed** |
| Probe before / after | P14: `stillValidated` true → **false**; annualised after the owner's change £12,000,000 → **£0 (n 0)**. P14b: admin change → validated true → **false**; same-value save → true → true; change + re-validate in one request 200 → **400** |
| Tests run | the new file + the four existing KPI test files: 5 files, 61 tests passed |
| Status | **Fixed, reconciliation pending** (Step 3); will be **partly fixed** at best — D-10 blank, no validator / date / source stored |
| Remaining limitations | P14 still shows `statusAfter: approved` — that is A-05. No record of who validated, when or from what source (D-10). An admin editing a validated volume in the form must untick the box (the 400 message says so) |

#### A-02 (P1) — the record view returns another user's whole costing

| Item | Content |
|---|---|
| Original problem | P01 / SEC-02: `GET /records/:id` returned `scenarios.data` — Bob read Alice's costing inputs, target price and supplier quote |
| Root cause | The route returned the whole saved scenario JSON, not the fields the panel shows |
| Correction made | A non-owner, non-admin gets `panelCosting()`: `{commodity, region, result: {total, breakdown (the 8 buckets, numbers only), operationDetails: [{name, cost}]}}`. Owner and admin: full costing, unchanged |
| Callers checked (Stop 2 condition) | Record panel and its "Original costing analysis" (`kpi-view.ts` `openRecord`, reads `commodity`, `region`, `result.total`, `result.breakdown[8 keys]`, `result.operationDetails[].name/.cost`) — all kept. Exports: do not call this endpoint (PDF / Excel use `/records?all=1` + `/summary`; CSV is built server-side from the list). Drill-down: `/drill`. e2e scripts: none read `costing`. **No caller needs a removed field → no Stop 2** |
| Files changed | `calculator/server/routes/kpi.ts` (`PANEL_BUCKETS`, `panelCosting`, used in `/records/:id`); `calculator/tests/kpi-p2-a02-record-view.test.ts` (new) |
| Commit | `30b2d690` |
| Test added | `kpi-p2-a02-record-view.test.ts` (HTTP): signed-out 401; Bob gets exactly the panel shape, the body has no `secretSupplierQuote` / `targetPrice` / `cycleTimeSec` / machine id / `traceability`; Alice and the admin get the full costing; a non-numeric bucket or extra key is dropped. **Before: 2 failed / 2 passed. After: 4 passed** |
| Probe before / after | P01b (Bob's view of Alice's costing): costing keys `commodity,input,region,result` → **`commodity,region,result`**; result keys `breakdown,internalTrace,operationDetails,total` → **`breakdown,operationDetails,total`**; operation keys `cost,cycleTimeSec,machineId,name` → **`cost,name`**; secret quote in body true → **false**. Alice / Ada: unchanged (full). P01 `detailIncludesFullCostingBreakdown` stays true by design — the 8 buckets are panel fields |
| Tests run | new file + A-03 file + four existing KPI files: 6 files, 65 passed |
| Status | **Fixed, not fully verified** — Step 4 access checks pending. P01's open sign-up is A-01 (blocked, D-8) |
| Remaining limitations | Any signed-in user still sees every record's buckets and supplier current cost — that is the visibility decision (D-8b), not A-02 |

#### A-04 (P1) — the server accepts any should-cost total

| Item | Content |
|---|---|
| Original problem | P15: `result.total: 0.01` with a £1,998 breakdown → 201, stored should-cost £0.01, opportunity £11.99 |
| Root cause | The save route stored `sc.result.total` as sent; nothing re-derived or cross-checked it |
| Correction made | (a) `reAddCheck(total, breakdown)` (engine): every finite numeric breakdown value is a line; tolerance = lines × 0.005 (8 lines → £0.04). The save refuses 400 beyond it, naming lines, sum and difference; nothing is written (no scenario, no record). (b) `shouldCostBasis` → each record carries a derived `shouldBasis`: `re-added` / `not-re-added` / `total-only`, read with the record from the linked costing's `$.result.breakdown` (SQL `LEFT JOIN scenarios`, `json_valid`-guarded; no stored field, no schema change). Imports and saves without a breakdown → `total-only`, never refused. Shown in the record panel (one line under "Cost") and as two data-quality rows ("Should-cost total only, not re-added", "Should-cost does not re-add") on screen and in the Excel "Data quality" sheet; `dataQuality.shouldBasis` counts current records. (c) Rate book: **not recorded** (no field; D-10 blank) |
| Files changed | `src/engine/kpi-dashboard.ts` (`ShouldBasis`, `SHOULD_BASIS_LABEL`, `READD_TOLERANCE_PER_LINE`, `reAddCheck`, `shouldCostBasis`, `KpiRecord.shouldBasis?`, `DataQuality.shouldBasis`); `server/data/kpi-store.ts` (select reads the linked breakdown; a DB without a `scenarios` table, e.g. the perf test's bare in-memory DB, uses the old select); `server/routes/kpi.ts` (save check; `publicRow.shouldBasis`); `src/ui/kpi-dashboard/kpi-builders.ts` (`shouldBasisHtml`, two DQ rows); `kpi-view.ts` (panel line); `kpi-export.ts` (two Excel DQ rows); `tests/kpi-p2-a04-should-readd.test.ts` (new) |
| Commit | `60223582` |
| Test added | `kpi-p2-a04-should-readd.test.ts`: the rule (13.04 / 12.96 v 13.00 over 8 lines OK, 13.05 refused, non-numeric lines ignored, no breakdown → null); HTTP: P15 case → 400 and nothing stored; £0.04 rounding → 201 `re-added`; £0.05 → 400; no breakdown → `total-only`; import → `total-only`; a pre-rule record → `not-re-added`; a malformed costing row does not break the list; summary DQ `{reAdded 2, notReAdded 1, totalOnly 3}`; record view carries the basis; the DQ table and panel builders print it. **Before: 7 failed (functions missing). After: 7 passed** |
| Probe before / after | P15: save 201 → **400**; opportunity £11.99 → **£0**. P15b: £0.04 rounding 201 → 201; £0.05 201 → **400**; no breakdown 201 → 201; import 200 → 200; `shouldBasis` absent → **ROUND re-added, NOBD total-only, IMP total-only**; DQ basis absent → `{reAdded 17, notReAdded 0, totalOnly 9}` |
| Screens | `phase2-evidence/screens/before/` (committed dist = pre-Phase-2 UI) v `screens/after-A-04/` (fresh build): the drawer shows "Should-cost basis: Total only, not re-added — …" (`state-record-drawer-{dark,light}-1440.png`); the DQ table gains two rows, so every full page is ~71–234 px taller. All 12 width × theme views: overflow 0 px, axe 0 (`before.log`, `after-A-04.log`). The build was used for the screenshots only; `calculator/dist` was restored to the committed bundle (**not rebuilt in the commit** — see "For the parent") |
| Tests run | new file + A-02 + A-03 + four existing KPI files: 7 files, 72 passed. `tsc -p tsconfig.build.json --noEmit` exit 0; `npm run typecheck` exit 0 |
| Performance note | the list read now parses the linked costing JSON for CostVision records. Synthetic check (50,000 records × 16 KB costing, better-sqlite3 in memory): plain select 59 ms → with `json_valid` + `json_extract` 334 ms. It is paid only on a cache rebuild (after a write or the 5-minute TTL). The Step 5 volume run should measure it on the real harness (Phase 1's harness has no `scenarios` rows, so it will not see this cost) |
| Status | **Fixed, reconciliation pending**; will be **partly fixed** at best (rate-book stamp needs D-10) |
| Remaining limitations | No rate-book stamp (D-10). Server-side recompute not approved (open item). A record saved before the fix with a non-re-adding total is flagged, not excluded — the KPI definitions are unchanged |

#### A-05 (P1) — owner powers on approved records

| Item | Content |
|---|---|
| Original problem | P02: the owner sets `isTest` (record excluded), downgrades approved → draft, deletes an approved record — all 200. FIN-02 / SEC-04: an owner re-points an approved record to another part / programme and it stays approved; `commodity` / `country` writable |
| Root cause | `ADMIN_ONLY_FIELDS` incomplete; the status reset fired only on money fields, and only by key presence |
| Correction made | `isTest`, `commodity`, `country` added to the admin-only list. Owner: a status change to reviewed / approved → 403 (as before); any status change on a reviewed / approved costing → 403, except "completed" together with a resetting change. A value change of part number, programme, model year, powertrain or annual volume on a reviewed / approved costing → status `completed`, owner or admin (the owner's money change keeps doing the same — the existing rule, now value-compared). Same request asking for reviewed / approved (or echoing it) → 400 "…an admin then re-approves it as a separate save" (Stop 1, Q5). Value comparison throughout, because the form sends every field: a notes-only save of an approved costing is now accepted and stays approved (it was 403 before). "Admin-set" = reviewed or approved (Stop 1, Q4) |
| Files changed | `calculator/server/routes/kpi.ts` (PATCH; `ADMIN_ONLY_FIELDS`, `IDENTITY_FIELDS`, `ADMIN_STATUSES`); `calculator/tests/kpi-p2-a05-owner-powers.test.ts` (new) |
| Commit | `b15380c5` |
| Test added | `kpi-p2-a05-owner-powers.test.ts` (HTTP, 20 tests): owner `isTest` / `commodity` / `country` → 403, admin → 200; owner approved / reviewed → draft / completed → 403; notes-only full-form save keeps approved; owner cannot approve a completed costing; owner AND admin each change part number / programme / MY / powertrain / volume → completed (10 cases); reviewed → completed; same values → stays approved; change + approved echo (owner) and change + approved (admin) → 400 and nothing written, then two saves work; admin approving a completed costing while fixing its programme → one save; owner money change → completed; owner delete of an approved costing → 200 (D-4, unchanged). **Before: 16 failed / 4 passed. After: 20 passed** |
| Probe before / after | P02: owner `isTest` 200 → **403** (record no longer excluded); approved → draft 200 → **403**; owner delete of approved 200 → 200 (D-4, unchanged by design). P02b: owner part-number change status approved → **completed**; owner commodity 200 → **403**; owner country 200 → **403**; owner notes-only form save **403 → 200, stays approved**; admin programme change approved → **completed**; admin re-approve → approved; owner volume change approved → **completed**. P14: `statusAfter` approved → **completed** (with A-03: validated false). P13 positive controls unchanged |
| Tests run | the four Phase 2 files + four existing KPI files: 8 files, 92 passed; `tsc -p tsconfig.build.json --noEmit` exit 0 |
| Status | **Partly fixed, delete still open (D-4)**; reconciliation pending |
| Remaining limitations | Delete / withdraw of an approved record unchanged (D-4). No record of who set a status (D-10). The owner's edit form still offers "Draft" / "Completed" on an approved costing; the server refuses with a clear message (no UI change was in the plan for A-05) |
| Follow-up (Step 6, issue 3) | Commit `9119da05`: the owner's edit-form note on a reviewed / approved costing said "Changing the current cost sends this costing back for review", but such a save is refused 400 unless the status is set to Completed. The note now says so (`kpi-view.ts::editFormNote`), and the 400 uses field labels and "an approved" (`server/utils/kpi-edit-wording.ts::resetRefusal`, new). Test `tests/kpi-p2-a05-edit-wording.test.ts` (3): failed before (missing exports), passes after. KPI suite 28 files / 218 tests pass; both typechecks exit 0; full suite at `9119da05` 391 files / 6,117 tests pass (`phase2-evidence/final/`). Live e2e and screenshots not re-run (text-only change in the edit dialog) |

#### A-06 (P1) — same-day ties follow the last-edit time

| Item | Content |
|---|---|
| Original problem | FIN-04 case 6: two costings of one application saved the same day — the tie broke on `updatedAt`, so a note on the older one (or an admin PATCH) made it current and moved every financial KPI |
| Root cause | `classifyRecords` sort: status rank → costing date → **`updatedAt`** → id |
| Correction made | The tie breaks on `createdAt` (status rank → costing date → `createdAt` → id). The ranking (approved > reviewed > completed) is D-3 and not built |
| Files changed | `calculator/src/engine/kpi-dashboard.ts` (sort in `classifyRecords`); `calculator/tests/kpi-p2-a06-same-day-tie.test.ts` (new) |
| Commit | `f05d2856` |
| Test added | `kpi-p2-a06-same-day-tie.test.ts`: engine — the later-created costing is current although the earlier one was edited later; a later costing date still wins; draft v non-draft unchanged. HTTP — two same-day saves, a note by the owner and an edit by the admin on the older one leave the newer one current, and the KPI Σ should stays £17. **Before: 2 failed / 2 passed. After: 4 passed** |
| Probe before / after | P06b: after a note on the first costing, roles `first:current, second:superseded` → **`first:superseded, second:current`**. P06 (approved v newer completed, a D-3 question): unchanged, as expected |
| Tests run | the five Phase 2 files + four existing KPI files: 9 files, 96 passed |
| Status | **Fixed, reconciliation pending** (Step 3 must show which current records move) |
| Remaining limitations | An approved costing can still be displaced by a newer unapproved one (P06) — D-3 |

#### A-07 (P1) — an inverted FX rate inside the 10× band is accepted

| Item | Content |
|---|---|
| Original problem | P03: EUR 1.19 and USD 1.31 (inverted) accepted → 200 (×1.42 / ×1.77 the reference) |
| Root cause | One static 10× band; for a reference above 0.316 the inverse falls inside it (EUR, USD, SGD, CAD) |
| Correction made | `parseFxRows`: after the unchanged 10× guard, a rate whose distance to 1 ÷ reference is smaller than its distance to the reference (natural log) is refused with row, column and a message that names both and points to `units_per_gbp`. Reference within 10 % of 1.0 → the row loads and a warning note names it. GBP per one unit kept. All 27 references are below 0.9, so today the warning branch is reached only by a reference near 1 (tested with a synthetic CHF 0.95); KWD-style references above 1 are checked the other way round |
| Files changed | `calculator/server/utils/kpi-import.ts`; `calculator/tests/kpi-p2-a07-fx-inversion.test.ts` (new) |
| Commit | `fe35878e` |
| Test added | `kpi-p2-a07-fx-inversion.test.ts`: parser — EUR 1.19 / USD 1.31 refused at 2:gbp_per_unit / 3:gbp_per_unit; EUR 0.84, 0.95, USD 0.70, SGD 0.55, CAD 0.60 accepted; units_per_gbp 1.19 stored as 1 ÷ 1.19; ZAR 23.5 still refused by the 10× message; reference within 10 % of 1 → loaded with a note; reference above 1 checked the other way; a currency without a reference is not checked (D-5). HTTP — the inverted file → 400 and the table stays empty; a correct file loads; a normal user 403. **Before: 3 failed / 5 passed. After: 8 passed** |
| Probe before / after | P03: inverted EUR / USD 200 (2 loaded) → **400 (none loaded)**; the fx.load audit entry for EUR/USD disappears. AED (no reference) 4.9 and 4,900 still 200 — D-5; ZAR 400 unchanged; CHF overwrite (A-12) unchanged |
| Tests run | the six Phase 2 files + four existing KPI files: 10 files, 104 passed. e2e fixtures upload `units_per_gbp` rates (unaffected) |
| Status | **Fixed, not fully verified** (Step 5 regression pending) |
| Remaining limitations | Currencies with no reference (AED…), tolerance and the comparison with the previous approved rate are D-5. The table still overwrites a period's rate (A-12, not approved) |

#### A-10 (P1, part) — imports trust future dates and rewrite deleted records

| Item | Content |
|---|---|
| Original problem | P09: a row dated 2031-01-01 imports and becomes current. FIN-14: a re-import silently "updates" a soft-deleted record (P09b: 200, `updated: 1`) |
| Root cause | `parseImportRows` checked the date format only; the import route updated any record matching tool + ref, deleted or not |
| Correction made | `parseImportRows(rows, headers, { today })`: a costing date after `latestImportDate(today)` = today + 1 day (UTC) → error at `costing_date`. It also returns `rowNumbers`. The import route refuses a row whose tool + ref matches a deleted record (error at `source_record_id`, naming the row). All-or-nothing as before |
| Files changed | `calculator/server/utils/kpi-import.ts`; `calculator/server/routes/kpi.ts` (import route); `calculator/tests/kpi-p2-a10-import-rows.test.ts` (new) |
| Commit | `360cebb0` |
| Test added | `kpi-p2-a10-import-rows.test.ts`: parser with a fixed today — today and today + 1 accepted, today + 2 and 2031 refused at `2:costing_date` / `3:costing_date`; HTTP — a file with a 2031 row → 400, nothing imported; tomorrow (UTC) → imported; a file with a new row and a row pointing at a deleted record → 400 at `3:source_record_id`, the deleted record unchanged, the new row not added; a valid file imports and a live record re-imports as an update; a normal user 403. **Before: 3 failed / 2 passed. After: 5 passed** |
| Probe before / after | P09 (in P08's file): import 200, 2031 row current → **400**, nothing imported — so P08's three variants are no longer imported by that file either (all-or-nothing). P08b (new, the variants alone; before measured at `fe35878e` with A-10 stashed, `probes/probes-before-P08b.json`): 3 separate current records before and after — A-11 is not wired, as required. P09b: re-import of a deleted record 200 `updated: 1` → **400**, naming row 2, `source_record_id` |
| Tests run | the seven Phase 2 files + four existing KPI files: 11 files, 109 passed; `tsc -p tsconfig.build.json --noEmit` exit 0 |
| Status | **Partly fixed** (D-9 parts open) |
| Remaining limitations | D-9: an imported file can still set approved / validated / saving status, and a re-import still overwrites in-app decisions on live records. Note (new finding N-1): the existing `kpi-dashboard-server.test.ts` and the e2e fixtures import rows dated `${MONTH}-02` … `${MONTH}-04`; on the 1st–2nd of a month those are more than one day ahead and will now be refused |

#### A-11 (P1, part) — part-number and programme variants split one component

| Item | Content |
|---|---|
| Original problem | P08: LR-VAR-100, LRVAR100, LR_VAR_100 → three current records. P16: Q900 / q900 → two current records (opportunity and annualised doubled) |
| Root cause | `normalisePartNumber` only upper-cases and strips spaces; the programme is used as typed |
| Correction made (approved part only) | `foldIdentityCode(code)` in the engine: upper case; remove whitespace, `-`, `_`, `.`, `/`; null when empty. **Not wired**: nothing in the app calls it. `scripts/kpi-identity-dry-run.ts <db> [out.json]`: opens the DB `readonly` + `fileMustExist`, folds part number AND programme into a candidate application key, lists every group that would merge (each record: tool, part, programme, MY, powertrain, status, date, role now → role folded), excluded records that would match, and the all-time eligible / opportunity / unfavourable / annualised today v folded |
| Files changed | `calculator/src/engine/kpi-dashboard.ts` (new exported function only); `calculator/scripts/kpi-identity-dry-run.ts` (new); `calculator/tests/kpi-p2-a11-identity-fold.test.ts` (new) |
| Commit | `82b88cea` |
| Test added | `kpi-p2-a11-identity-fold.test.ts` (7): the five LR-VAR-100 spellings → one key; Q900 / q900 → one key; other characters kept (A v B suffix, `#`, `+`); empty → null; **not switched on** — `normalisePartNumber('LR-VAR-100')` still `LR-VAR-100` and the three variants + Q900 / q900 stay five current records; the pure dry run (groups, roles folded, excluded match, summary counts); the script on a temp file DB leaves size, mtime and bytes identical and refuses a missing path. **Before: the file failed to load (function and script missing). After: 7 passed** |
| Probe before / after | P08b (variants only): 3 separate current records before and after; P16: `q900:current, Q900:current` before and after — **no change, as required (not wired)** |
| Tests run | all 8 Phase 2 test files + 4 existing KPI files: 12 files, 116 passed; both typechecks exit 0 |
| Dry run (Stop 2 item) | Run on the throwaway probe database `/tmp/cv-phase1-probe-XSgz3x/should-cost.db` (the A-10 "after" probe run; synthetic data only), SHA-256 identical before and after the run: `A-11/dry-run-probe-db.txt` / `.json`. **See Stop 2 below.** The Step 3 agent should re-run it on the reconciliation set: `npx tsx scripts/kpi-identity-dry-run.ts <db> <out.json>` |
| Status | **Partly fixed — function + dry run done; switching on is a Stop 2 decision** |
| Remaining limitations | Not wired (by instruction). Unicode dashes / zero-width characters are not folded (only the five characters approved). Powertrain, commodity, country not folded; controlled lists and ISO country codes not approved (open) |

#### A-23 (P3, also F-27) — e-mail as a display name; internal ids in rows

| Item | Content |
|---|---|
| Original problem | P10: a user with no name shows as `gone@test` to everyone; list rows carry `ownerId` (`gone`, `import:CSS System:R. Rao`) |
| Root cause | `rowToRecord` fell back `full_name → owner_label (the e-mail on a CostVision save) → 'Unknown user'`; `publicRow` always included `ownerId` |
| Correction made | `displayName(fullName, ownerLabel)` in the store: the trimmed full name, else the owner label, skipping any value shaped like an e-mail (`^\S+@\S+$`), else **"Unnamed user"**. `publicRow(r, admin)` includes `ownerId` for admins only (list, record view, save and edit responses). Client check: no screen, export or e2e reads `ownerId` (the tour types it but never reads it); editing rights are `canEdit` from the server, so no `isOwner` flag was needed |
| Files changed | `calculator/server/data/kpi-store.ts` (`displayName`, `UNNAMED_USER`); `calculator/server/routes/kpi.ts` (`publicRow` + its four callers); `calculator/tests/kpi-p2-a23-names-and-ids.test.ts` (new) |
| Commit | `f8a54c71` |
| Test added | `kpi-p2-a23-names-and-ids.test.ts`: blank, whitespace-only and e-mail-shaped names → "Unnamed user"; "Bob Baker" and the import owner "R. Rao" kept; an import owner that is an e-mail → "Unnamed user"; no `@corp.test` / `@supplier.test` in the rows, record view, summary (Created-by filter) or CSV; no `ownerId` in rows or the record view for an ordinary user, `canEdit` still true for the owner; the admin still gets `ownerId`. **Before: 3 failed / 1 passed. After: 4 passed** |
| Probe before / after | P10: `ownerNameShown` gone@test → **Unnamed user**; `rowCarriesOwnerId` gone → **absent** (0 rows carry the key); `importOwnerIdExample` import:CSS System:R. Rao → **none**. (The probe's P10 line was made null-safe — it crashed on the now-missing key; the before value is unchanged.) `/meta` still returns the caller's OWN user id — not a list row, not in the approved fix |
| Tests run | all 9 Phase 2 files + 4 existing KPI files: 13 files, 120 passed; `tsc -p tsconfig.build.json --noEmit` exit 0 |
| Screens | No visible change with the standard e2e fixture (every fixture user has a name). Covered by the final screenshot run after A-18 |
| Status | **Fixed, not fully verified** (Step 4 access checks pending) |
| Remaining limitations | Several unnamed users all appear as one "Unnamed user" value in the Created-by filter. Display names need not be unique (SEC-09, not in this fix). `/meta` returns the caller's own id |

#### A-17 (P2) — 10.9 MB PDF from uncompressed chart images

| Item | Content |
|---|---|
| Original problem | `50-pdf-size-analysis.txt`: 8-page PDF 10,901,505 B; 99.1 % is nine chart images stored as raw RGB |
| Root cause | `new jsPDF({…})` without `compress`; `addImage(url, 'PNG', …)` without an image compression |
| Correction made | `PDF_DOC_OPTIONS = { orientation: 'landscape', unit: 'mm', format: 'a4', compress: true }` and `addImage(…, undefined, PDF_IMAGE_COMPRESSION = 'FAST')` (Flate, lossless). Existing jsPDF 4.2 only, no new package |
| Files changed | `calculator/src/ui/kpi-dashboard/kpi-export.ts`; `calculator/tests/kpi-p2-a17-pdf-compression.test.ts` (new) |
| Commit | `ca50ec85` |
| Test added | `kpi-p2-a17-pdf-compression.test.ts`: the export's settings; with them a 1000 × 418 chart PNG is stored `/FlateDecode` and the file is < 1/20 of the uncompressed one; the stored pixels (Flate + PNG predictors undone) equal the uncompressed RGB byte for byte. **Before: 3 failed. After: 3 passed** |
| Size before / after | Live e2e (`e2e/kpi-dashboard-live.ts`, same fixture, same day): committed bundle **10,901,505 B** (`A-17/live-before/`) → fresh build **190,583 B (1.75 %)** (`A-17/live-after/`). Both runs 59/59 PASS. (Phase 1 expected ≈ 0.2 MB.) The 20k / 50k measurement is Step 5 |
| Image check | `A-17/pdf-images.py` extracts every image XObject (undoing Flate and PNG predictors): all **9 charts pixel-identical** (same SHA-256 of the RGB) before and after (`pdf-images-before.json`, `pdf-images-after.json`). Chart 1 at 100 %: `chart1-before-100pct.png`, `chart1-after-100pct.png` (identical files) |
| Tests run | all 10 Phase 2 files + 4 existing KPI files: 14 files, 123 passed; `tsc -p tsconfig.build.json --noEmit` exit 0 |
| Status | **Resolved** on the live fixture (size and pixels before / after, test fails before and passes after, area tests pass); volume-run size in Step 5 |
| Remaining limitations | none known. `calculator/dist` not rebuilt in the commit (see "For the parent") |

#### A-18 (P2) — a malformed filter silently shows company-wide totals

| Item | Content |
|---|---|
| Original problem | P17: malformed filter JSON → 200 with the **unfiltered** totals (16 records); a > 20,000-character filter and unknown keys / wrong types were dropped silently the same way |
| Root cause | `filtersOf` fell back to `parseFilters({})` on any failure; `parseFilters` drops what it cannot use |
| Correction made | Engine `validateFilters(raw)` (strict; `parseFilters` unchanged): object only; keys = the nine dimensions + `datePreset` / `dateFrom` / `dateTo`; each dimension a list of ≤ 200 strings of 1–120 characters; status ∈ draft / completed / reviewed / approved; currency ISO 4217 or "(not set)"; model year four digits or "(not set)"; known date preset; dates YYYY-MM-DD. Server: `filtersOf(req, res)` answers **400 `{code: 'BAD_FILTER', error: 'This filter could not be applied: <reason>.'}`** on `/summary`, `/records`, `/records.csv`, `/drill`. Screen: on BAD_FILTER — or a filter stored in this browser that fails `validateFilters` on load — `badFilterHtml` shows "This filter could not be applied", the reason, "No figures are shown…" and a **Clear filters** button (the existing `data-clear-all` handler: resets the filters and stores the defaults). Nothing loads (auto-refresh included) until the filter is changed or cleared. Filters are not put in the URL (not approved) |
| Files changed | `src/engine/kpi-dashboard.ts` (`validateFilters`); `server/routes/kpi.ts` (`filtersOf` + its four callers); `src/ui/kpi-dashboard/kpi-builders.ts` (`badFilterHtml`); `kpi-view.ts` (`S.badFilter`, `restore`, `loadAll`, `filtersChanged`, `renderBody`); `tests/kpi-p2-a18-bad-filter.test.ts` (new) |
| Commit | `18044323` |
| Test added | `kpi-p2-a18-bad-filter.test.ts` (18): 15 malformed cases (truncated JSON, array, null, unknown key, non-list, non-string, empty value, > 120 chars, > 200 values, unknown preset, bad custom date, numeric date, unknown status, non-ISO currency, bad model year) → 400 BAD_FILTER on **all four** filtered endpoints; well-formed no-match → 200 / 0; good filters, no filter, "(not set)" values and a left-over custom date with another preset → 200; `validateFilters` equals `parseFilters` on valid input; the error builder has `role="alert"`, the text and the Clear filters button, and escapes. **Before: 17 failed / 1 passed. After: 18 passed.** (A > 20,000-character filter is refused by the server too, but Node answers such a URL 431 first — Phase 1 P12 — so it is not testable over HTTP) |
| Probe before / after | P17: malformed 200 (16 records, unfiltered) → **400**; well-formed no-match 0 → 0. P12 (over-long URL): 431 → 431 (unchanged, refused by Node before the route) |
| Screens | `A-18/a18-screens.ts` (evidence script, throwaway server, two synthetic records) with a stored filter that has an unknown key (`programmes`) or an unknown date preset, at 1440 and 390 px, dark and light. **Before** (`A-18/screens-before/`, A-18 server + UI changes stashed, committed bundle): the dashboard shows the company-wide totals (2 KPI card blocks, no alert) in all 8 views. **After** (`A-18/screens-after/`, fresh build): the error state with the reason and Clear filters, no figures, in all 8 views; Clear filters → dashboard loads (2 card blocks) and the stored filter is the default (`*-after-clear.png`). axe 0, overflow 0 px, no page errors in all 16 shots (`a18-results.json`). Full 12-view audit after the build (`screens/after-A-18/`, `after-A-18.log`): overflow 0 px, axe 0 in all 12 (page heights as after A-04) |
| Tests run | all 11 Phase 2 files + 4 existing KPI files: 15 files, 141 passed; both typechecks exit 0 |
| Status | **Resolved** for the approved part (probe, screenshots, test before / after, area tests) — Step 5 regression pending |
| Remaining limitations | Filters are still not in the URL (not approved); an unknown but well-formed VALUE (e.g. a programme no record has) is a no-match (200 / 0), by design. Values over 120 characters (possible for an imported commodity / owner) now give the error instead of being dropped |

---

### Step 2 — Block 3 screen polish (plan items 12–22)

One commit per item (F-19 has a follow-up commit). Every item has its own test file, `tests/kpi-p2-<id>-*.test.ts`,
run against the code without the fix (`<id>/test-before-fix.log`) and with it (`test-after-fix.log`), and the KPI area
tests after it (`test-area-after.log`). Block 3 has no Phase 1 probe (no server change), so the "probe" is a live
measurement script written for it.

**Evidence script** `phase2-evidence/block3/b3-screens.ts` (throwaway server + temp SQLite `/tmp/cv-phase2-b3-*`, AI
off, synthetic records only: the live e2e's API saves, one save with an 8-bucket breakdown, one with a −50 % gap, two
CSS System / CPSC II import rows dated today − 4/5 days, a synthetic FX file, two admin-validated volumes, one validated
and one implemented saving). It measures and screenshots every Block 3 item at **1920, 1440, 1366, 1024, 768 and
390 px, dark and light**, plus the exports (Excel, PDF, CSV) from the screen. Run twice under the same conditions:
- **before** = the code at `18044323` (end of Block 2; `calculator/src` checked out from that commit, built, run, then
  restored) → `block3/before/`, `before.log`;
- **after** = the code at `9b5aa86a` (all Block 3 commits), built → `block3/after/`, `after.log`.

Both runs: axe 0 violations and 0 px sideways scroll in all 12 views, no page errors; the financial figures are
identical (`b3-results.json` → `financial`). **Full 12-view audit** (`e2e/kpi-dashboard-audit.ts`, the Phase 1
harness) after Block 3: `screens/after-block3/`, `after-block3.log`, `evidence/after-block3-metrics.json` — overflow
0 px and axe 0 in all 12 views; theme persists over a reload; every costing-tool tile opens; no page error. A pixel diff
of the 12 fold screenshots against `screens/after-A-18/` (`block3/fold-diff.ts` → `block3/fold-diff-after-A-18-v-after-block3.txt`)
shows changes only at the header row (the "Last refreshed" time and the Export button, F-28), the opportunity card's
sub-line (F-21), the opportunity chart (F-19) and — at 1366 and 390 — the content below the financial cards, moved
down 17 px by the one extra line of the opportunity card. **At 390 px the financial position still fits on the first
screen**: the first card row ends at 797 px of 844 (778 before); at 1366 × 768 it ends at 637 px (620 before).
**Live e2e** (`e2e/kpi-dashboard-live.ts`) on the Block 3 build: **59/59 PASS** (`block3/e2e-live-after.log`). `calculator/dist`
was built only for these runs and restored to the committed bundle afterwards (no dist commit).

#### F-19 — charts have no axis titles

| Item | Content |
|---|---|
| Original problem | Phase 1 §E: no axis titles in `kpi-charts.ts:150,180`; a count axis gave no unit |
| Root cause | The Chart.js scale configs set ticks only |
| Correction made | Every chart with axes titles both: the category ("Commodity", "Programme", "Model year", "Costing tool", "Powertrain", "Costing date") and the value with its unit — "Records (count)", "Current records (count)", "Costings saved (count)", "£ per piece (Σ)" (current v should-cost) and "Gap, £ per piece (Σ)" (opportunity charts). Theme text colour, never a series colour. The PDF's chart images use the same configs, so they carry the titles too. No chart has a % axis (the gap % is in the tooltip / table), so no "%" title. The doughnut has no axes; the heatmap and the status bar are HTML with their own labels. The follow-up commit shortened the money titles: the first wording ("£ per piece (Σ of gaps above should-cost)") was cut off on the 220 px opportunity-by-powertrain chart in the live screenshot |
| Files changed | `calculator/src/ui/kpi-dashboard/kpi-charts.ts` (`axisTitle`, `barConfig` axis / valueAxis options, the activity and cost configs); `calculator/tests/kpi-p2-f19-axis-titles.test.ts` (new) |
| Commit | `f2895439`, follow-up `9b5aa86a` |
| Test added | `kpi-p2-f19-axis-titles.test.ts`: all 8 axis-bearing charts title both axes (16 titles); each title's exact text (value axis with unit); titles in the theme text colour. **Before: 3 failed. After: 3 passed** |
| Before / after | Screenshots of every chart card, 1440 and 390, both themes: `block3/{before,after}/f19-chart-<id>-<theme>-<w>.png` (+ the whole sections `f19-charts-*`, `f19-act-*`) |
| Tests run | KPI area (`tests/kpi-*`): all pass after each commit (`F-19/test-area-after*.log`) |
| Status | **Resolved** (full Step 5 regression pending) |
| Remaining limitations | none known |

#### F-21 — the opportunity card does not state its eligible base

| Item | Content |
|---|---|
| Original problem | The gap card said "5 eligible records"; the opportunity card only "3 records above should-cost" |
| Correction made | `financialCardsHtml`: "3 of 5 eligible records above should-cost · per piece, summed" — the same eligible count as the gap card. Text only |
| Files changed | `calculator/src/ui/kpi-dashboard/kpi-builders.ts`; `calculator/tests/kpi-p2-f21-opportunity-base.test.ts` (new) |
| Commit | `3fcf77d3` |
| Test added | `kpi-p2-f21-opportunity-base.test.ts`: "3 of 5 eligible records …", singular "1 of 1 eligible record", zero cases. **Before: 2 failed. After: 2 passed** |
| Before / after | Live (`b3-results.json` → `opportunitySub`): "4 records above should-cost · per piece, summed" → "**4 of 6 eligible records** above should-cost · per piece, summed" in all 12 views. Screenshots `f21-a29-financial-<theme>-{1440,390}.png` |
| Status | **Resolved** |
| Remaining limitations | The longer line wraps once more at 1366 and 390 px (+17 px); the financial position still fits on the first screen (above) |

#### F-22 — literal shadow colours (option (a))

| Item | Content |
|---|---|
| Original problem | `kpi-dashboard.css:49,64,97,111,237` — five `box-shadow`s with literal `rgba(0,0,0,…)`; `:238` the dialog backdrop |
| Correction made | Export menu, filter popover and dialog → `var(--shadow-lg)`; card hover and the "i" explanation → `var(--shadow-md)`. **The dialog backdrop `rgba(0,0,0,.45)` is left as a literal (option (a), decided at Stop 1)** — no theme token exists for it |
| Files changed | `calculator/src/ui/styles/kpi-dashboard.css`; `calculator/tests/kpi-p2-f22-shadow-tokens.test.ts` (new) |
| Commit | `942b052a` |
| Test added | `kpi-p2-f22-shadow-tokens.test.ts`: no `box-shadow` in the dashboard CSS has a literal colour; the five use the named tokens; the backdrop literal is unchanged; both themes define the tokens. **Before: 2 failed / 2 passed. After: 4 passed** |
| Before / after | Computed shadows (dark 1440, `b3-results.json` → `shadows`, `dialogShadow`): menu `rgba(0,0,0,.25) 0 12px 32px` → `rgba(0,0,0,.65) 0 16px 44px` (the dark theme's `--shadow-lg`); card hover `rgba(0,0,0,.08) 0 2px 10px` → `rgba(0,0,0,.55) 0 6px 20px` (`--shadow-md`); in light the tokens are the light theme's blue-tinted shadows. Backdrop `rgba(0,0,0,.45)` before and after. Screenshots `f22-{export-menu,filter-popover,card-hover,dialog,a29-tip-open}-<theme>-1440.png` |
| Status | **Resolved** (as decided: option (a)) |
| Remaining limitations | The dark theme's shadows are now darker / larger (the theme's own values); the backdrop stays a literal |

#### F-23 — 8 px seam under the sticky filter bar

| Item | Content |
|---|---|
| Original problem | `.kd-filters { position: sticky; top: 64px }` under a 56 px header |
| Correction made | `top: 56px` (the `.header` height, `calculator.css`) |
| Files changed | `calculator/src/ui/styles/kpi-dashboard.css`; `calculator/tests/kpi-p2-f23-sticky-seam.test.ts` (new) |
| Commit | `5d8e4da3` |
| Test added | `kpi-p2-f23-sticky-seam.test.ts`: the bar's sticky top equals the header height read from `calculator.css` (56). **Before: failed ("64"). After: passed** |
| Before / after | Live, scrolled to the charts (`b3-results.json` → `sticky`): header bottom 56 px, bar top **64 → 56**, seam **8 px → 0 px** at 1920, 1440, 1366, 1024 and 768, both themes. At 390 px the bar is `position: static` (not sticky) before and after — no seam to close. Screenshots `f23-sticky-<theme>-{1440,1024,390}.png` |
| Status | **Resolved** |
| Remaining limitations | The 56 is a literal matching `.header { height: 56px }`; the test fails if either changes |

#### F-24 — the records-table column "Created" shows the costing date

| Item | Content |
|---|---|
| Correction made | `TABLE_COLUMNS` costingDate label "Created" → "Costing date". The Excel / CSV keep both columns ("Costing date", and "Created" = the real created timestamp) |
| Files changed | `calculator/src/ui/kpi-dashboard/kpi-builders.ts`; `calculator/tests/kpi-p2-f24-costing-date-column.test.ts` (new) |
| Commit | `480291c0` |
| Test added | `kpi-p2-f24-costing-date-column.test.ts`: the column is "Costing date", no column is "Created", the cell is the costing date; the CSV keeps both. **Before: 1 failed / 1 passed. After: 2 passed** |
| Before / after | Live headers (`recordsHeaders`): "Created" → "Costing date" in all 12 views. Screenshots `f24-records-<theme>-{1440,390}.png` |
| Status | **Resolved** |

#### F-25 — empty "Original costing analysis" heading; raw commodity id

| Item | Content |
|---|---|
| Original problem | A costing saved with a total only showed the heading "Original costing analysis" over one sentence "(sheet_metal, UK)" and nothing else |
| Correction made | New exported `costingAnalysisHtml(costing, record)` in `kpi-view.ts` (the panel's existing markup, moved into a function): the heading only when the saved costing has an eight-bucket breakdown or operations; otherwise one line, "No cost breakdown was saved with this costing (Pressed sheet metal, UK)." The commodity goes through `COMMODITY_REPORT_LABELS` (`src/ui/data/commodity-meta.ts`, **read only** — the same labels the server already uses for the record's Commodity field, so the panel says "Pressed sheet metal" in both places; the brief's example "Sheet metal" is that map's report label for `sheet_metal`). Imported records keep their "Original costing" source note (it is not empty) |
| Files changed | `calculator/src/ui/kpi-dashboard/kpi-view.ts`; `calculator/tests/kpi-p2-f25-costing-panel.test.ts` (new) |
| Commit | `f1f21adc` |
| Test added | `kpi-p2-f25-costing-panel.test.ts`: total-only → no heading, one line, display name, no `sheet_metal`; breakdown → heading + table + "Injection moulding"; operations only → heading; unknown id escaped; import note kept; no costing → nothing. **Before: 5 failed (no builder). After: 5 passed** |
| Before / after | Live panel text (`panel-api-total-only`): headings ["Cost", "Original costing analysis"] + "(sheet_metal, UK)" → ["Cost"] + "No cost breakdown was saved with this costing (Pressed sheet metal, UK)."; with a breakdown "(forging, UK)" → "(Forging, UK)", heading and table kept; import unchanged. Screenshots `f25-panel-{api-total-only,api-breakdown,import}-<theme>-{1440,390}.png` |
| Status | **Resolved** |
| Remaining limitations | For a total-only save the panel now says twice that there is no breakdown (A-04's "Should-cost basis: Total only, not re-added — no breakdown was saved with it…" and this line). The scenario reference (`sc-a4`) and the uppercased record id in the eyebrow (Phase 1 suggestions under F-25) were not in the approved fix and are unchanged |

#### F-26 — smooth scrolling ignores reduced motion

| Item | Content |
|---|---|
| Correction made | `scrollTo` uses the new exported `scrollBehavior()`: `'auto'` under `prefers-reduced-motion: reduce`, `'smooth'` otherwise |
| Files changed | `calculator/src/ui/kpi-dashboard/kpi-view.ts`; `calculator/tests/kpi-p2-f26-reduced-motion-scroll.test.ts` (new) |
| Commit | `5758c9c7` |
| Test added | `kpi-p2-f26-reduced-motion-scroll.test.ts`: `scrollBehavior()` is 'auto' with the media query matching, 'smooth' otherwise / without `matchMedia`; no dashboard file hard-codes `behavior: 'smooth'`. **Before: 2 failed. After: 2 passed** |
| Before / after | Live, 1440 dark, click "Details" (data quality) and read `scrollY` 40 ms later (`b3-results.json` → `f26`): reduced motion **22 px (mid-scroll) → 4,244 px (already there)**; no preference 9 px before and after (smooth, as intended) |
| Status | **Resolved** |

#### F-28 — Export button heavier than the other header buttons

| Item | Content |
|---|---|
| Correction made | Export `btn btn-primary btn-sm` → `btn btn-secondary btn-sm` (Refresh's and Admin's class list). `shell()` is exported for the test |
| Files changed | `calculator/src/ui/kpi-dashboard/kpi-view.ts`; `calculator/tests/kpi-p2-f28-export-button.test.ts` (new) |
| Commit | `787f2fd9` |
| Test added | `kpi-p2-f28-export-button.test.ts`: Export's class list equals Refresh's and Admin's; no primary button in the header. **Before: failed (btn-primary). After: passed** |
| Before / after | Live computed style (dark 1440): Export background `rgb(34,197,94)` (green fill) → `rgb(23,28,25)`, the same as Refresh, 27 px high like Refresh; light: blue fill → Refresh's surface. Screenshots `f28-head-<theme>-{1440,390}.png` |
| Status | **Resolved** |

#### A-27 (P3) — negatives printed "£-4.03" in insights and exports

| Item | Content |
|---|---|
| Original problem | Engine `gbp0` / `gbp2` (`kpi-dashboard.ts:759-760`) printed "£-1.00"; the screen's `gbp` "−£1.00"; Excel one-section formats "-£" |
| Correction made | One formatter: engine `gbpSigned(n, dp)` (sign first, U+2212); `gbp0` / `gbp2` (KPI_FMT — insights, Excel / PDF KPI rows, PDF commodity table) and the screen's `gbp()` call it. Excel GBP formats are two-section, sign first: `£#,##0.00;"−"£#,##0.00` (gap column `…;[Red]"−"£#,##0.00`). The PDF keeps `pdfSafe` (− → -, so "-£1.00": still sign-first; its built-in font has no U+2212). CSV values are numbers (no change) |
| Files changed | `calculator/src/engine/kpi-dashboard.ts`, `calculator/src/ui/kpi-dashboard/kpi-builders.ts`, `calculator/src/ui/kpi-dashboard/kpi-export.ts`; `calculator/tests/kpi-p2-a27-negative-money.test.ts` (new) |
| Commit | `59c1bf4d` |
| Test added | `kpi-p2-a27-negative-money.test.ts`: `gbpSigned` / `KPI_FMT` = the screen's `gbp` for several values; the significant-gap insight reads "P-NEG: −£4.03", never "£-"; KPI row "Unfavourable gaps" "−£4.03", PDF text "-£4.03"; every £ number format in the workbook is sign-first. **Before: 4 failed. After: 4 passed** |
| Before / after | Screen insight (live, all 12 views): "LR-CLP-050: **£-1.00** (-50.0%)" → "**−£1.00** (-50.0%)" (`a27-insights-*.png`). PDF text (`pdftotext`, `A-27/pdf-negative-money-{before,after}.txt`): "£-1.00" ×2, "£-2.15" → "-£1.00" ×2, "-£2.15". Workbook as LibreOffice displays it (`A-28/recalc-live-{before,after}.json` → `negativeMoneyAsDisplayed`): "-£0.58 -£1.00 -£1.15 -£2.15 **£-1.00 £-2.15**" → "−£0.58 −£1.00 −£1.15 −£2.15" |
| Status | **Resolved** for negative money |
| Remaining limitations | Percentages in insights keep the engine's `pct1` ("-50.0%", hyphen) while the screen's `pct` prints "−50.0%"; original-currency amounts print "-4.03 EUR" (sign-first, hyphen). Both are sign-first; the approved fix covered money in GBP. The PDF prints "-" (font limit) |

#### A-28 (b) (P3) — the Reconciliation sheet does not re-add annualised or savings

| Item | Content |
|---|---|
| Correction made | "Costing records" gains "Saving status" and "GBP saving (per piece)" (after "Volume validated"). Three rows are appended to "Reconciliation" (the existing seven keep their cells, so the weighted-gap row's `C5/C3` still holds): **Annualised opportunity (validated volumes)** = `SUMPRODUCT((eligibility="eligible")*(gap>0)*(volume validated="yes")*(annual volume>0), gap, annual volume)`; **Validated savings** / **Implemented savings** = `SUMIFS(GBP saving, saving status, "validated"/"implemented", GBP saving, ">=0")` — the engine's rules. Each has the dashboard figure beside it and the existing ✓ / ✗ check. **A-28 (a) is not built** (the brief's choice is still "Your choice") |
| Files changed | `calculator/src/ui/kpi-dashboard/kpi-export.ts`; `calculator/tests/kpi-p2-a28b-reconciliation-rows.test.ts` (new) |
| Commit | `b735e5c5` |
| Test added | `kpi-p2-a28b-reconciliation-rows.test.ts`: the fixture's dashboard figures (annualised £180,000 over 2; savings); the two new columns; the three formulas over the right columns, the dashboard value in B, the check in D; an independent re-add of the exported cells by the same rules equals the dashboard; the old rows keep their place. **Before: 3 failed / 2 passed. After: 5 passed** |
| Before / after | LibreOffice recalculation (`A-28/recalc-check.py`, forced recalculation on load): unit fixture `A-28/recalc-unit-book.json` — 0 formula errors, **10/10 ✓**; live export from the screen: before `A-28/recalc-live-before.json` 7 rows (no annualised / savings), after `recalc-live-after.json` **10 rows, all ✓** (annualised £344,000, validated £0.80, implemented £1.15), 0 formula errors |
| Status | **Resolved** |
| Remaining limitations | The rows re-add the money; the record counts beside the cards ("over 2 validated volumes", "1 record") are not re-added (none of the existing rows re-adds a count other than "eligible") |

#### A-29 (P3) — "i" buttons under 24 × 24 px

| Item | Content |
|---|---|
| Correction made | `.kd-tip` gets `position: relative`; `.kd-tip::after` is an invisible 24 × 24 px box centred on it (`left/top: 50%; transform: translate(-50%, -50%)`) — no background, border or outline. The 18 px circle, border and glyph are unchanged |
| Files changed | `calculator/src/ui/styles/kpi-dashboard.css`; `calculator/tests/kpi-p2-a29-tip-hit-area.test.ts` (new) |
| Commit | `a35033f0` |
| Test added | `kpi-p2-a29-tip-hit-area.test.ts`: the visible button stays 18 × 18, 50 % radius; the `::after` is 24 × 24, centred, with nothing visible. **Before: 1 failed / 1 passed. After: 2 passed** |
| Before / after | Live hit test (`b3-results.json` → `tips`): for each of the 11 "i" buttons, `elementFromPoint` at the 4 corners and 4 edge mid-points of a 23 px square on its centre — **0/8 → 8/8** in all 12 views; the box stays 18 × 18. The fold pixel diff shows no change at any "i" button at 1920, 1440, 1024 and 768 px (at 1366 and 390 the cards below the opportunity card moved 17 px, F-21) |
| Status | **Resolved** for the "i" buttons |
| Remaining limitations | The 41 × 15 px inline links Phase 1 also counted are not in the approved fix (unchanged) |

---

### Stop 2 items (from plan items 1–11)

#### Stop 2-A — A-11: switching the folded identity key on (the dry run)

- **What is needed:** your approval to use `foldIdentityCode` on the part number and the programme code when records
  are grouped into applications (identity, "current" selection, every KPI, the filter values). Nothing uses it today.
- **Dry run** (read-only; `scripts/kpi-identity-dry-run.ts`; database SHA-256 identical before and after): the throwaway
  probe database `/tmp/cv-phase1-probe-XSgz3x/should-cost.db` (31 synthetic records from the Phase 2 probe run after
  A-10). Output: `phase2-evidence/A-11/dry-run-probe-db.txt` and `.json`.

  | | Today | Folded |
  |---|---|---|
  | Applications (included records) | 25 | **22** |
  | Current records | 25 | **22** |
  | Eligible current records | 20 | **17** |
  | Potential opportunity (all time, GBP per piece) | £73.68 | **£69.68** |
  | Annualised (validated volume) | £240,000.00 | £240,000.00 |

  Groups that would merge (2 groups, 5 records):

  | Folded key | Records today (each current today) | After folding |
  |---|---|---|
  | `LRVARB100\|L460\|2027\|BEV` | `LR-VARB-100` (2026-10-01), `LRVARB100` (10-02), `LR_VARB_100` (10-03) — CSS System imports | `LR_VARB_100` current; the other two **superseded** (same owner) |
  | `P16CASE\|Q900\|2028\|BEV` | `P16-CASE · Q900` (Alice), `P16-CASE · q900` (Bob), same day | Bob's `q900` current (created later — A-06); Alice's **duplicate** |

  The £4.00 drop is exactly the double count Phase 1 described (P08 / P16): two extra £1 gaps on the variants and one
  extra £2 gap on the case variant.
- **Why it is a decision:** folding re-keys existing applications — current records, eligible counts, opportunity and
  the Created-by / programme filter values change for existing data, and a costing that is current today can become
  superseded or a duplicate. Folding only new saves would make new and old records group differently (your brief).
- **Options:**
  1. **Switch on for part number + programme, everywhere at once** (grouping, filters, drill-down, exports), with the dry
     run re-run on the real database first and its group list reviewed by you. The stored values are not rewritten —
     the folded key is computed when records are read (no migration).
  2. **Switch on for the part number only**, keep programme case-sensitive (Q900 ≠ q900), and add a data-quality count of
     programme codes that differ only by case.
  3. **Do not switch on**; add a data-quality list ("possible same component: LR-VAR-100 / LRVAR100 …") from the same
     function, so people fix the source data. No KPI changes.
  4. Any of the above plus the Phase 1 remainder (controlled lists, ISO country codes) — not approved in this phase.
- **Affects:** `classifyRecords` (application key), `partKey`, `uniqueComponents`, filter options for programme, the
  drill-down component level, CSV / Excel / PDF row roles. Re-running the Step 3 reconciliation would be needed.
- **Dry run on the Step 3 reconciliation set** (17 Nov 2026; `phase2-evidence/reconciliation/a11-dry-run.txt`, DB SHA-256
  identical before and after): applications / current 17 → **14**, eligible 17 → 14, opportunity £39.70 → **£35.70**;
  unfavourable and annualised unchanged. Merges: LR-REC-200 + lr-rec-200 + LRREC200 + LR_REC_200 (today 3 current, as
  case is already folded; folded 1) and REC-CASE-18 on Q901 (Alice) + q901 (Bob) (today 2 current; folded Bob's current,
  Alice's a duplicate). £4.00 = two £1 variant gaps + one £2 programme-case gap.

No other Stop 2 condition arose in items 1–11: no A-02 caller needs a removed field (A-02 section), no new dependency,
no schema change, nothing outside the approved scope was needed.

---

### New findings (Phase 2, items 1–11) — not fixed

| ID | Proposed priority | Finding | Evidence |
|---|---|---|---|
| N-1 | P3 | **Date-dependent test fixtures after A-10.** `tests/kpi-dashboard-server.test.ts` (import of `${MONTH}-02` / `${MONTH}-03`) and the e2e fixtures (`e2e/kpi-dashboard-live.ts`, `-audit.ts`, `-tour.ts`: `${MONTH}-03` / `${MONTH}-04`) build costing dates from the current month. On the 1st–2nd of a month these are more than one day ahead, so A-10 (correctly) refuses them and those tests / live checks would fail on those days only. Proposed: build the fixture dates relative to today (e.g. today − n days). Test / fixture change only | `grep -n 'MONTH}-0' tests/kpi-dashboard-server.test.ts e2e/kpi-dashboard-*.ts`; A-10 rule `latestImportDate` |
| N-2 | P3 | **The owner's edit form offers status options the server refuses.** On a reviewed / approved costing the owner's Status select still lists Draft and Completed (and keeps the disabled current status selected). After A-05 the server refuses Draft (403) and Completed unless the same save changes an identity field / volume (400 asks for it). The message is clear, but the form offers a choice that cannot succeed. Proposed: on an admin-set record show the owner only the current status (and "Completed" when an identity / volume field changed) | `kpi-view.ts` `editFormHtml` (`statuses` for a non-admin); A-05 tests |
| N-3 | P3 | **An admin's edit form re-sends "Annual volume validated" ticked.** The form sends every field, so an admin who changes the volume of a validated record without unticking the box gets the A-03 400 ("…save the new volume first with the box unticked…"). Correct and explained, but a UI that unticks the box when the volume field changes would avoid the round trip | `kpi-view.ts` `submitEdit` / `editFormHtml`; A-03 test "same request" |
| N-4 | P3 | **Over-long filter values become an error.** Before A-18 a filter value over 120 characters was silently dropped (wrong totals); now it is a 400. Imported commodity / owner labels have no length limit, so a filter option over 120 characters can exist and selecting it shows the error. Proposed: cap imported labels at 120 characters, or raise the filter limit to the stored-field limits | `server/utils/kpi-import.ts` (no length cap on `commodity`, `owner`); `validateFilters` |
| N-5 | P3 | **(items 12–22) Negative percentages and original-currency amounts use a hyphen.** After A-27 every negative GBP amount prints "−£" (U+2212) on screen, insights and Excel. Percentages in the engine's insights (`pct1`: "-50.0%") and original-currency amounts (`money()`: "-4.03 EUR"; PDF currency table `toFixed`) still use the hyphen-minus, while the screen's `pct` prints "−50.0%". All are sign-first, so this is a glyph inconsistency, not the A-27 defect. Proposed: route `pct1` and `money()` through the same sign rule | `kpi-dashboard.ts` `pct1`; `kpi-builders.ts` `money`; insight text in `block3/after/b3-results.json` → `insights` |
| N-6 | P3 | **(items 12–22) The record panel says "no breakdown" twice for a total-only save.** A-04's should-cost basis line ("Total only, not re-added — no breakdown was saved with it…") and F-25's line ("No cost breakdown was saved with this costing (Pressed sheet metal, UK).") both show. Proposed: when the basis is "total only", keep one of the two (e.g. fold the commodity / region into the basis line) | `block3/after/f25-panel-api-total-only-*.png` |
| N-7 | P2 | **(Step 3) Records changed before the fixes stay as they were.** A-03 / A-04 / A-05 act when a record is written; nothing re-checks records already saved. The fixed server reading the pre-fix reconciliation database still counts R9's owner-inflated volume as validated and approved (annualised £1,220,000, not £20,000) and keeps R10 excluded as test; R14's £0.01 total is counted but flagged "not re-added" (A-04 works on old data as a flag only). A-06 does apply to old data (read time: −£2.00). Proposed: before go-live, a one-off read-only check of the real database's `kpi_audit` for `record.edit` entries by non-admins that changed `annualVolume`, `isTest`, `commodity`, `country`, status or an identity field of a validated / reviewed / approved record, and a list for an admin to re-validate. No code change needed to list them | `phase2-evidence/reconciliation/existing-data.json`, `README.md` § "Pre-fix data" |
| N-8 | P3 | **(Step 5, pre-existing) The CI smoke-launch (`npm run test:e2e`, `e2e/smoke.ts`) fails on both the fixed branch and the pre-fix tree.** It waits for `.sw-wiz-card`, the software wizard removed on 14 Oct 2026 (CLAUDE.md "the guided wizard is gone"); `smoke.ts` was last changed 28 Sep 2026. Not caused by Phase 2 and not dashboard code. Proposed: update the smoke step to the cockpit's selectors (outside this phase's scope) | `phase2-evidence/regression/rest/smoke.log`, `smoke-prefix.log` |
| N-9 | P3 | **(Step 3) The A-11 dry-run script prints "£-2.00".** `scripts/kpi-identity-dry-run.ts` formats money with a hyphen after the £ (A-27's rule covers the screen, insights and exports, not this read-only script). Cosmetic; proposed: use `gbpSigned` | `phase2-evidence/reconciliation/a11-dry-run.txt` |
| N-10 | P2 | **(Step 6) The A-04 should-cost basis can drift after the save.** The label and data-quality count are computed at read time from the linked `scenarios` row's current breakdown (`kpi-store.ts` `SELECT_WITH_COSTING`), and that row can be rewritten later (a re-POST with the same scenario id; the owner's `/api/sync/scenarios`). The screen always uses a fresh scenario id, so ordinary use is unaffected. Proposed: store the verdict / breakdown at save — a new field, needs D-10 | Step 6 review, issue 1 (section E) |
| N-11 | P2 | **(Step 6) A CostVision save with no breakdown is accepted as "total only".** Probe: total 0.01, no breakdown → 201. This matches the brief ("records that carry a breakdown") but lets a client skip the re-add check. Every real CostVision result carries a re-adding 8-bucket breakdown, so requiring one on CostVision saves (imports unchanged) would be safe, but it tightens the approved rule. Needs your decision | Step 6 review, issue 2 (section E) |

No Stop 2 condition arose in items 12–22: nothing outside the approved scope, no new dependency, no schema change,
no migration. `src/ui/data/commodity-meta.ts` (shared) is read, not changed.

---

### For the parent (items 1–11)

- **Commits** (branch `phase2-approved-fixes`, after `5f385ef5`): A-03 `2edebda2`, A-02 `30b2d690`, A-04 `60223582`,
  A-05 `b15380c5`, A-06 `f05d2856`, A-07 `fe35878e`, A-10 `360cebb0`, A-11 `82b88cea`, A-23 `f8a54c71`, A-17 `ca50ec85`,
  A-18 `18044323`. Each commit stages only its finding's source and test files.
- **Not committed:** this report and `phase2-evidence/` (left untracked, as at Stop 1). `phase2-evidence/A-17/live-before/`
  holds the 10.9 MB "before" PDF and both live runs' Excel / CSV exports (15 MB), and `phase2-evidence/screens/` holds
  three full 12-view screenshot sets (before, after-A-04, after-A-18; 50 MB) — add a `.gitignore` like Phase 1's before
  committing the evidence.
- **`calculator/dist` was not rebuilt in any commit.** UI changes (A-04, A-17, A-18) were built only to take screenshots
  / the live run, and `dist` was restored to the committed bundle each time. CLAUDE.md asks for a rebuild + `git add -f
  calculator/dist` before shipping — a separate "Rebuild dist" commit once Block 3 is done.
- **Probe script** for later steps: `npx tsx docs/dashboard-audit/phase2-evidence/probes/probes.ts <out.json>` (from
  `calculator/`). It now names its temp databases `/tmp/cv-phase2-probe-*`. Earlier Phase 2 runs (before the rename)
  left 12 directories `/tmp/cv-phase1-probe-*` dated 2026-11-17 21:22–21:42 (the three Phase 1 ones are dated
  2026-11-11); other Phase 2 leftovers: `/tmp/cv-kpi-p2-*` (test DBs), `/tmp/cv-kpi-audit-*`, `/tmp/cv-phase2-a18-*`,
  `/tmp/kpi-dashboard-live` is not used (the live runs wrote into the evidence folder). Nothing deleted (E-2 blank).
- **Step 3 needs:** A-03, A-04, A-05, A-06 reconciliation (they are "fixed, reconciliation pending"); the A-11 dry run on
  the reconciliation set; note that A-04 makes every save carry a `shouldBasis` and adds two data-quality rows.
- **Step 5 needs:** A-04's list read parses the linked costing JSON (synthetic 50k × 16 KB: +275 ms per cache rebuild);
  Phase 1's volume harness inserts no `scenarios` rows, so it will not see that cost — seed scenarios to measure it.
- **Full `npm test` after item 11** (`phase2-evidence/block1-2-final/npm-test.log`): **379 files, 6,083 tests, all passed**
  (baseline 368 / 5,998 → +11 new files, +85 new tests; no baseline test fails). Both typechecks exit 0 (last run after
  A-18). Worktree dev DB after the run: empty (`block1-2-final/dev-db-after-tests.txt`). The live e2e ran 59/59 PASS
  twice during A-17 (committed bundle and fresh build).

### For the parent (items 12–22)

- **Commits** (branch `phase2-approved-fixes`, after `18044323`): F-19 `f2895439` (+ follow-up `9b5aa86a`), F-21
  `3fcf77d3`, F-22 `942b052a`, F-23 `5d8e4da3`, F-24 `480291c0`, F-25 `f1f21adc`, F-26 `5758c9c7`, F-28 `787f2fd9`,
  A-27 `59c1bf4d`, A-28 (b) `b735e5c5`, A-29 `a35033f0`. One finding per commit; each stages only its source and test
  files. Blocks 1–2 commits untouched.
- **New tests**: 11 files, 31 tests (`tests/kpi-p2-{f19,f21,f22,f23,f24,f25,f26,f28,a27,a28b,a29}-*.test.ts`).
  Area run after the last commit (`block3/test-area-final.log`): `tests/kpi-*`, `tests/ui-*`, dark-theme-scope,
  motion-system, no-inline-handlers — **31 files, 205 tests, all passed**. `tsc -p tsconfig.build.json --noEmit` and
  `npm run typecheck`: **exit 0** (`block3/typecheck-*.log`). Live e2e 59/59 PASS. The full `npm test` was not run for
  items 12–22 (Step 5).
- **Not committed**: this report and `phase2-evidence/` (still untracked). New evidence: `block3/` (≈ 11 MB of
  screenshots and the live exports), `screens/after-block3/` (+ `.log`, `evidence/after-block3-metrics.json`),
  `F-19 … A-29/` test logs, `A-27/pdf-negative-money-*.txt`, `A-28/` (recalc script, unit book, results).
- **`calculator/dist` not rebuilt in any commit** — built only for the screenshots / live run, then restored with
  `git checkout -- calculator/dist` and the build's 17 new asset files removed (`git clean -fX calculator/dist`). A
  separate "Rebuild dist" commit is still needed before shipping (CLAUDE.md).
- **Temp leftovers** (paths only, nothing deleted — E-2 blank): `/tmp/cv-phase2-b3-*` (4 server DB dirs, LibreOffice
  profiles `-lo-before` / `-lo-after`, PDF text `-before.txt` / `-after.txt`, live e2e output `/tmp/cv-phase2-b3-live`),
  `/tmp/cv-phase2-a28-lo`, and the audit harness's `/tmp/cv-kpi-audit-*`.
- **For Step 5**: the 12-view baseline to compare against is now `screens/after-block3/`; expected visible changes
  versus Phase 1 are the Block 3 items above (and A-18's error state). At 390 the financial cards' first row ends at
  797 / 844 px.


---

### Steps 3–5 — verification (17 Nov 2026)

Done by a separate agent that wrote none of the fixes. **No application code changed**; nothing committed. Pre-fix
behaviour was measured on a copy of commit `5f385ef5` extracted with `git archive` into `/tmp/cv-phase2-prefix` (server,
src, the committed pre-Phase-2 `dist`, scripts; `node_modules` symlinked — same lockfile; no worktree, so no git state
was touched). `calculator/dist` was built once (`npm run build`, exit 0) for the live runs and restored to the committed
bundle afterwards (`git checkout -- calculator/dist` + `git clean -fX calculator/dist`, 17 build files removed); `git
status` shows only the untracked report and evidence.

#### Step 3 — financial reconciliation (`phase2-evidence/reconciliation/`, `README.md` there has the full working)

Test set: 23 synthetic records / actions, built by `recon-run.ts` through the API in the same order on both trees —
non-GBP (EUR/EUR import), mixed currencies (GBP should / USD current), a part with 3 revisions, two same-day costings
with a note on the first (A-06), an approved record whose validated volume the owner changes (A-03 / A-05), owner
`isTest` / commodity / country / part-number / draft changes on approved records (A-05), a £0.01 total over a £1,998
breakdown and a £13.04 total over £13.00 in 8 lines (A-04), imports with a total and no breakdown (A-04), part numbers
differing by case / punctuation and a Q901 / q901 programme (A-11). Synthetic approved FX table: EUR 1.19, USD 1.31
units per GBP. "Hand" = `hand.py`, which reads the saved rows and applies the definitions itself (no engine import).

| KPI (all time) | Before (pre-fix code) | Hand, pre-fix DB | After (fixed) | Hand, fixed DB | Moved by |
|---|---|---|---|---|---|
| Potential opportunity | £43.686032 (16) | £43.686032 | **£39.696032** (16) | £39.696032 | A-04 −11.99, A-05 +10.00, A-06 −2.00 |
| Weighted gap | +14.7019 % | 14.7019 % | **+11.7235 %** | 11.7235 % | Σ gap 41.686 → 37.696; Σ current 283.543 → 321.543 |
| Σ GBP current / should | 283.542755 / 241.856723 | same | 321.542755 / 283.846723 | same | A-04 (−12 / −0.01), A-05 (+50 / +40), A-06 (should +2) |
| Unfavourable | −£2.00 (1) | −£2.00 | −£2.00 (1) | −£2.00 | unchanged, not netted |
| Annualised | £1,220,000 (2) | £1,220,000 | **£20,000** (1) | £20,000 | A-03: £2 × 600,000 drops out |
| Eligible / current / included / excluded | 17 / 17 / 21 / 1 | same | 17 / 17 / 21 / 0 | same | A-04 R14 out; A-05 R10 not excluded |
| Completed costings / awaiting review / approved | 16 / 13 / 3 | same | 17 / 14 / 3 | same | A-05 (no downgrade; resets R9, R12); A-04 R14 out |
| Current by commodity | Casting 14, Forging 2, Machining 1 | same | Casting 15, Forging 1, Machining 1 | same | A-05 R11 |
| Should-cost basis (DQ) | — | — | re-added 11, not re-added 0, total only 6 | 11 / 6 | A-04 |
| Validated savings | £0.50 | £0.50 | £0.50 | £0.50 | unchanged |

**Every output gives the after figure** (fixed code, screen at 1440 light as the admin, all time): KPI cards £39.70 /
+11.7 % / −£2.00 / annualised £20,000.00 / "16 of 17 eligible"; records table 17 current rows, every row = the API row
(Σ of the displayed 2-dp gaps £39.69 — display rounding of £0.534351 and £4.201681); PDF £39.70 / 11.7 % / -£2.00 /
£20,000.00, DQ "total only 6, does not re-add 0, excluded 0"; Excel (LibreOffice recalculation) Executive summary the
same, Reconciliation **10/10 ✓**, 0 formula errors; CSV (screen export = server CSV, same rows) re-adds to 39.696032 /
11.72349 % / −2 / 20,000. An ordinary user's `/summary` financial block = the admin's.

**Original currencies and frozen FX unchanged:** 21 records in both runs — no difference in any original value,
currency, terms, GBP value or FX snapshot (rate, source, date, method, approved); every GBP value = original × its
frozen rate on both DBs; no PATCH re-froze a current / should-cost snapshot (R1 only gained its saving snapshot from the
admin's saving PATCH, as before); EUR and USD currency totals identical before and after. **"What must not change"**
holds on this set (weighted-gap formula and sign, opportunity / unfavourable separate, no 1:1 conversion, currencies
never added, older revisions counted once, gaps never savings, one filter context across outputs).

**Pre-fix data read by the fixed server** (`existing-data.json`): A-06 re-selects at read time (−£2.00), but R9's
owner-inflated validated volume (annualised £1,220,000) and R10's owner-set test flag stay; R14's £0.01 is counted and
flagged "not re-added". → **N-7**.

**A-11 dry run on this set:** see Stop 2-A (17 → 14 applications, £39.70 → £35.70).

#### Step 4 — access checks (`phase2-evidence/access/`)

`access-run.ts` calls every `/api/kpi` route as each role on a throwaway DB; 110 requests and responses are in
`after/requests.json` (Authorization shown as "Bearer <removed>"; no token written — `grep eyJ` = 0). The same script on
the pre-fix tree is `before-prefix/`. A-01 / A-25 blocked, so no "outside the allowed domains" role.

| Check | Role | Fixed | Pre-fix |
|---|---|---|---|
| S1 401 on all 16 `/api/kpi` routes | signed-out | PASS | PASS |
| S6 admin-only routes (excluded list + CSV, FX policy / rates / recalculate, import, audit) → 403 | ordinary user | PASS | PASS |
| S3a another user's costing: only `commodity, region, result{total, breakdown, operationDetails[name, cost]}` | ordinary user | PASS | **FAIL** (input, trace, quote) |
| S3b full costing still returned | owner, admin | PASS | PASS |
| S3c no internal user id in rows, record view, summary, CSV, drill | ordinary user | PASS | **FAIL** |
| S3d no e-mail address anywhere ("Unnamed user" for a blank name and an e-mail-shaped import owner) | ordinary user | PASS | **FAIL** |
| S3e admin still gets `ownerId`; S3f `/meta` = caller's own id only | admin / user | PASS | PASS |
| S4a test flag, commodity, country, approved → draft / completed, approve own, validate volume, saving → 403, record unchanged | owner | PASS | **FAIL** |
| S4b part number / programme / MY / powertrain / volume change on an approved record → completed | owner | PASS | **FAIL** |
| S4c notes-only full-form save of an approved record → 200, stays approved | owner | PASS | **FAIL** (403) |
| S4d validated volume changed → validation cleared + completed | owner | PASS | **FAIL** |
| S4e admin changes validated volume → cleared + completed; change + re-validate in one request on a still-validated record → 400; separate re-validate / re-approve → 200 | admin | PASS | **FAIL** |
| S4f edit / delete another user's record → 403 | ordinary user | PASS | PASS |
| S5 admin: approve, review, commodity, country, validated volume, saving, test flag on/off, excluded list, FX load, policy, recalc preview + apply, template, import, audit, edit + delete others' | admin | PASS (18/18 × 200) | PASS |
| S4g owner deletes an approved record → 200 (D-4, unchanged by design) | owner | PASS | PASS |

**Fixed: 16/16 PASS. Pre-fix: 8 PASS, 8 FAIL — exactly the checks the fixes target.**

#### Step 5 — regression (`phase2-evidence/regression/`)

**Automated**

| Check | Baseline (worktree, before Phase 2) | Final | Log |
|---|---|---|---|
| `npm test` | 368 files, 5,998 tests pass | **390 files, 6,114 tests, all pass** (443 s) — +22 files, +116 tests; no baseline test fails | `npm-test.log` |
| `tsc -p tsconfig.build.json --noEmit` | exit 0 | **exit 0** | `typecheck-build.log` |
| `npm run typecheck` | exit 0 | **exit 0** | `typecheck-full.log` |
| `npm run build` | — | **exit 0** (restored after) | `build.log` |
| Live e2e `e2e/kpi-dashboard-live.ts` | 59/59 | **59/59 PASS**; PDF 247,144 B (Phase 1 10,901,505 B; the A-17 run before Block 3's axis titles gave 190,583 B) | `e2e-live.log`, `e2e-live/` |
| Worktree dev DB after `npm test` | empty | **empty** (22 tables, 0 users, 0 scenarios, no KPI table) | `dev-db-after-tests.txt` |

**All 17 Phase 1 probes** (`probes-after-final.json`; diff `probes-before-v-after-diff.txt`; the Phase 2 "before" run
equals Phase 1's `20-probes.json` on every field — `probes-phase1-v-phase2before-diff.txt`):

| Probe | Before → after | Expected? |
|---|---|---|
| P01 open sign-up | no change | yes — A-01 blocked (D-8) |
| P02 owner powers | isTest 200 → 403 (not excluded); approved → draft 200 → 403; delete 200 → 200 | yes — A-05; delete D-4 |
| P03 FX guard | inverted EUR/USD 200 (2 loaded) → 400; AED, ZAR, CHF overwrite unchanged | yes — A-07; rest D-5 / A-12 |
| P04 / P05 periods | no change | yes — A-08 not approved |
| P06 newer unapproved wins | no change | yes — D-3 |
| P07 saving lost on revision | no change | yes — A-13 not approved |
| P08 variants | file now refused (it holds P09's 2031 row; all-or-nothing) → 0 rows; P08b (variants alone) no change | yes — A-10; A-11 not wired |
| P09 future date | 200, current → 400, not imported | yes — A-10 |
| P10 ids / e-mails | `gone@test` → "Unnamed user"; `ownerId` in rows → none | yes — A-23 |
| P11 rate limit | no change | yes — A-20 not approved |
| P12 long filter | 431 → 431 | yes — refused by Node before the route |
| P13 controls | no change (401 / 403 as before) | yes |
| P14 validated volume | still validated → cleared; approved → completed; annualised £12,000,000 → £0 | yes — A-03, A-05 |
| P15 client should-cost | 201 → 400; opportunity £11.99 → £0 | yes — A-04 |
| P16 programme case | no change | yes — A-11 not wired |
| P17 malformed filter | 200 unfiltered (16) → 400 | yes — A-18 |
| Supplementary P01b, P02b, P06b, P09b, P14b, P15b | as in Step 2 (A-02, A-05, A-06, A-10, A-03, A-04) | yes |

No server `[kpi]` error in either run.

**Screens** (`screens/final/`, `screens-final.log`, `screens/evidence/final-metrics.json`; Phase 1 harness
`e2e/kpi-dashboard-audit.ts`): all 12 width × theme views (1920, 1440, 1366, 1024, 768, 390; dark and light): **axe 0
violations, 0 px sideways scroll**. Compared with Phase 1 (`screens-v-phase1.txt`, pixel diff
`fold-diff-phase1-v-final.txt`) the only changes are approved ones: header row (refresh time, F-28 secondary Export —
1–2 px taller at 390, moving the content below it by ~2 px), opportunity sub-line "x of y eligible" (F-21, one more line
at 1366 / 390: card row bottom 620 → 637 and 778 → 797 px), chart axis titles (F-19), the two A-04 data-quality rows
(page +71 to +253 px), the records table +25 px wide ("Costing date", F-24), the sticky filter bar 8 px higher (F-23),
"−£2.88" in the insight (A-27), rows without `ownerId` and with `shouldBasis` (A-23, A-04). Financial and operational KPIs
of the fixture are **identical** to Phase 1. **At 390 px the financial position still fits on the first screen** (first
card row ends at 797 of 844 px). Keyboard tab stops, filter popover, theme persistence (dark survives a reload), the
no-permission checks, drill chip and phone filters are unchanged from Phase 1.

**Volume** (`regression/volume/`: Phase 2 copy of `phase1-evidence/perf.ts` — output path, `CV_ROOT`, `SEED_COSTINGS`;
`run-all.sh`, `volume-summary.md`, `export-rowcheck.txt`). Each configuration 3 times, medians; "seeded" = every
CostVision record also has a linked ~16 KB costing in `scenarios` (8-bucket breakdown that re-adds, 20 operations,
a trace) written before the server reads the data — A-04's list read joins it, and Phase 1's harness wrote none. The
pre-fix tree was measured the same way the same evening, so machine noise can be separated from code effects.

| Measure (median of 3, ms) | Phase 1 | Fixed | Fixed, seeded | Pre-fix | Pre-fix, seeded |
|---|---|---|---|---|---|
| 20k `/summary` cold (cache rebuild) | 575 | 579 | **845** | 604 | 539 |
| 20k table page / search / drill / record | 18 / 16 / 11 / 9 | 22 / 17 / 12 / 8 | 20 / 18 / 13 / 10 | 22 / 17 / 12 / 7 | 19 / 16 / 12 / 7 |
| 20k Excel / PDF export | 3,328 / 2,105 | 3,714 / 2,550 | 3,559 / 2,378 | 3,346 / 2,313 | 3,390 / 2,226 |
| 50k `/summary` cold | 1,461 | 1,519 | **2,129** | 1,326 | 1,437 |
| 50k `/summary` after a write | 600 | 587 | 566 | 521 | 478 |
| 50k table page / search / drill / record | 42 / 33 / 21 / 13 | **47 / 36 / 22 / 13** (all < 50) | 43 / 32 / 18 / 11 | 47 / 36 / 23 / 10 | 41 / 36 / 22 / 15 |
| 50k CSV (server) / all-rows JSON | 381 / 965 | 438 / 1,063 | 434 / 1,104 | 429 / 964 | 487 / 1,057 |
| 50k open dashboard / all-time change | 318 / 857 | 405 / 839 | 324 / 826 | 326 / 803 | 378 / 795 |
| 50k Excel / PDF / CSV export (screen) | 8,733 / 3,210 / 457 | 9,302 / 3,450 / 540 | 9,107 / 3,417 / 555 | 8,643 / 3,326 / 548 | 8,424 / 3,273 / 534 |
| **PDF size** 20k / 50k | 13,075,670 / 13,077,628 B | **448,204 / 446,529 B (−97 %)** | same | 13,075,670 / 13,077,628 | same |
| Excel size 50k | 7,340,079 B | 7,749,528 B (+6 %) | same | 7,340,090 | same |

Explained > 10 % changes (every other measure is within 10 % of Phase 1 or within the same-evening pre-fix spread):
- **A-04 list read with costings seeded:** `/summary` cold +306 ms at 20k (+57 % v pre-fix seeded) and **+692 ms at 50k
  (2,129 v 1,437 ms, +48 %)**; a rebuild after a write +88 ms at 50k (566 v 478, +18 %). This is the `json_extract` of every
  linked costing on a cache rebuild (after a write or the 5-minute TTL); the cold figure also reads the 593 MB seeded
  database from disk. Without costings (Phase 1's harness) the fixed code is level with Phase 1. Real costings may be
  larger or smaller than 16 KB; this was flagged by the A-04 author and is now measured. Not a defect against any stated
  threshold (H.5's `/summary` p95 < 1.5 s at 100k was not tested — E-4), but the cold 50k summary is now ~2.1 s.
- Excel export +12 % at 20k / +7 % at 50k: the file is 5–6 % larger (A-28 (b)'s two new columns); PDF export +21 % at 20k
  v Phase 1 but +10 % v the same-evening pre-fix tree (Flate compression, A-17) and +7 % at 50k.
- Small-number noise: 3 → 4 ms warm summary, 18 → 22 ms table page (the pre-fix tree also measured 22 ms). 50k "open
  dashboard" 405 ms (fixed, plain) v 324 ms (fixed, seeded) and 326 ms (pre-fix): run-to-run spread.
- Browser heap after exports varies with GC timing (pre-fix same evening 489–943 MB at 50k; Phase 1 124 MB) — not
  attributable; H.5's heap threshold was not tested.

**Table page, search, drill-down and record view < 50 ms at 50,000:** yes (median 47 / 36 / 22 / 13 ms; the table page's
three runs were 49, 47, 45 ms — the pre-fix tree measured 47, 43, 51 the same evening). **Exports complete at
50,000:** Excel "Costing records" 30,001 rows (30,000 + header) and "Older revisions & duplicates" 20,001, CSV 30,000 data
rows — as Phase 1 (Data quality 22 rows (+2, A-04), Reconciliation 13 rows (+3, A-28 (b))). No page errors in any of the
24 runs.

**Load test (H.5): not tested — E-4 is blank.** Not tested: 100k and 250k records; 25 concurrent viewers + 2 writers;
"fast 3G" and "corporate VPN" throttling; a 4 GB RAM laptop profile; the thresholds `/summary` p95 < 1.5 s at 100k,
table p95 < 300 ms, Excel < 10 s at 100k (server-built), PDF < 1 MB, browser heap < 300 MB peak, zero silent truncation.

**Rest of CostVision** (`regression/rest/`, the audit harness's `regressionSmoke` / `themePersistence`)

| Check | Result |
|---|---|
| CSS System and CPSC II | Not CostVision screens — their data arrive by the admin import. Both imported in the reconciliation set, the probes and the live e2e (59/59) |
| Other costing tools open (machining, casting, sheet metal, forging, plastic, PCB image, CAD tiles; home, analytics, KPI, news, negotiation, viewer navigation) | all open, no page error, no failed request (`regressionSmoke`, same as Phase 1); tile screenshots `screens/final/regression-tile-*` |
| CAD interfaces | `e2e/cad-to-cost-live.ts` **32/32 PASS** (3 real parts, OCP available); `e2e/stl-dfm-live.ts` **10/10 PASS** |
| Drawing interfaces | `e2e/drawing-live.ts` **73/73 PASS** |
| Sign-in, navigation, theme | navigation as above; theme toggled to dark survives a reload; no-token 401, user 403 (`noPermission`) |
| Console / network errors | none on the dashboard (12 views, live e2e, 24 volume runs) or the costing tools' pages in the harness |
| Build | `npm run build` exit 0; both typechecks exit 0 |
| CI smoke-launch `npm run test:e2e` | **FAILS on both the fixed branch and the pre-fix tree** — waits for the removed software wizard's `.sw-wiz-card`; pre-existing, not Phase 2 → **N-8** |

#### Defects found in the approved fixes

*Superseded by section E.* The Steps 3–5 agent found no defect. The Step 6 independent review then raised issues 1–3
(N-10, N-11 and the A-05 edit-form wording, fixed in `9119da05`); see section E. The Steps 3–5 note was: every approved
fix behaves as specified on the reconciliation set, the access checks, the probes and the
regression. The one test-design slip during Step 4 (S4e first tried the same-request re-validation on a record that the
previous PATCH had already un-validated, which the rule rightly allows) was corrected in the script, not the code.

#### Leftover files from the verification (paths only; nothing deleted — E-2 blank)

`/tmp/cv-phase2-prefix/` (pre-fix code copy), `/tmp/cv-phase2-recon-*` (3 reconciliation DBs: before, after, the copy
for `existing-data`), `/tmp/cv-phase2-recon-lo/`, `/tmp/cv-phase2-perf-dl/` (24 runs' exports, 506 MB), the probe run's
`/tmp/cv-phase2-probe-*`, `/tmp/cv-phase2-drawing-live/`, `/tmp/cv-phase2-stl-dfm-live/`, `/tmp/cv-phase2-c2c-live/`,
`/tmp/cv-kpi-audit-*` (audit harness). The access-check and volume DB directories were deleted by their scripts.
`phase2-evidence/regression/` (20 MB, mostly `screens/final/`) and `reconciliation/after/exports/` should be excluded by a
`.gitignore` like Phase 1's before the evidence is committed.
