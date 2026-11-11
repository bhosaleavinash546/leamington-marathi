# CostVision KPI Dashboard — Phase 1 Independent Audit & Production Readiness

Date: 11 Nov 2026 · Branch `dashboard-audit-fixes` · HEAD `a618cd4d` · Audit only: **no application code, database,
configuration, theme or costing logic was changed** (proof in §G.4).

**Independence statement.** The same assistant that built the dashboard (b22408a7) and made the earlier design-audit
fixes wrote this report, so it is not independent by authorship. To offset that:

- two fresh reviewers who had not seen the code reviewed it separately:
  - financial / FX / filters → `phase1-evidence/agent-financial-review.md`, IDs FIN-xx;
  - security / access / exports → `phase1-evidence/agent-security-review.md`, IDs SEC-xx;
- every finding below that matters was **reproduced live** against the real server on a throwaway database
  (`phase1-evidence/probes.ts` → `20-probes.json`);
- where this report disagrees with the earlier `report.md` ("no financial P0"), the evidence here wins.

Evidence folder: `calculator/docs/dashboard-audit/phase1-evidence/` (every path below is relative to it unless stated).

---

## A. Executive verdict

### **Not ready for production.**

The arithmetic is correct. Every figure the dashboard prints re-adds independently to the penny:

- live e2e 59/59, including an independent re-add from the exported workbook;
- both reviewers' checks;
- exports complete at 20k and 50k records.

The **controls around** that arithmetic are not production-grade. The reproductions below each took one API call by an
ordinary signed-in user:

| # | What happens | Proof |
|---|---|---|
| 1 | **Anyone with any e-mail address can sign up and read every supplier price**, the full saved costing behind every record, and export them all. No domain allowlist exists in code or config, and the documented "JLR-only sign-up" is not implemented. | `20-probes.json` P01: outsider@example.org signs up → 200, reads the record, the €123.45 supplier price, the full 8-bucket breakdown and the CSV |
| 2 | **An owner can inflate an admin-validated annual volume ×100; the record stays "validated" and "approved".** Annualised opportunity went £120,000 → £12,000,000. | P14 |
| 3 | **The should-cost is whatever the browser posts.** A forged `result.total` of £0.01 is stored and creates an £11.99 "opportunity". | P15 |
| 4 | **A newer *unapproved* costing by anyone displaces an *approved* one** as the figure used in every KPI. | P06 |
| 5 | **An owner can mark their own record as test, downgrade it from approved to draft, or delete it**, removing it from KPIs. The UI hides the test box; the API does not. | P02 |
| 6 | **An inverted EUR / USD FX rate is accepted** (×1.42 / ×1.77 off), and so is any rate for a currency without a reference (AED at 4,900 accepted). The FX table keeps no history. | P03 |

The dashboard also mislabels or mis-defines several financial concepts. Each of these needs a business decision (§D):

- the default "Last 12 months" view hides costings that are still current (P05);
- a historical period cannot show the figure that was valid then (P04);
- validated savings vanish on any new revision (P07);
- the two sides of the gap are not proven to be the same scope or unit.

**Conditions for release.** The verdict becomes *Conditionally ready* once all of the following hold:

- items 1–6 are closed: access restricted, owner powers bounded, the server re-derives or verifies the should-cost,
  approval-aware selection, and an FX guard plus history;
- the business decisions in §D are taken and implemented;
- the screen labels say what the period filter means.

None of these is large. The engine is pure and well tested, and most fixes are server-side validation.

---

## B. Architecture and feature compliance

### B.1 Actual architecture

```
 Costing screen (main.ts) ──"Save to KPI Dashboard" (More menu)──► POST /api/kpi/records  {scenario JSON, details}
                                                                        │  zod schema; should-cost = scenario.result.total (client value)
 CSS System / CPSC II CSV/XLSX (admin) ──► POST /api/kpi/import ───────┤  kpi-import.ts parser (xlsx 0.18.5 / csv)
 FX CSV (admin) ──► POST /api/kpi/fx/rates (10× guard v built-in ref) ─┤
                                                                        ▼
                    SQLite (better-sqlite3)   costing_records  (original values + currencies + frozen FX snapshot + GBP)
                                              fx_rates         (currency, period) UPSERT — no history
                                              kpi_audit        (action, user, detail JSON — new values only)
                                              scenarios        (the full CostVision costing, linked by source_ref)
                                                                        │
                                       loadClassified(): listRecords → classifyRecords (pure engine) — cached 5 min / until a write
                                                                        ▼
   src/engine/kpi-dashboard.ts (984 lines, pure): exclusion → applicationKey (part|programme|MY|powertrain) →
   current / superseded / duplicate → eligibility (both costs, both GBP, same terms) → filters → KPIs, charts, insights,
   drill, records page, CSV
                                                                        ▼
   GET /api/kpi/summary · /records · /records.csv · /drill · /records/:id · /fx · /meta · /audit (admin)
                                                                        ▼
   src/ui/kpi-dashboard/ (view 736, builders 351, charts 332, export 338, save-modal 135) + kpi-dashboard.css (289)
   Excel (ExcelJS, live reconciliation formulas) and PDF (jsPDF + Chart.js PNGs) are built in the BROWSER from
   /summary + /records?all=1; CSV is built on the server.
```

- All `/api/kpi/*` routes sit behind `requireAuth`, mounted at `server/index.ts:118`.
- Admin checks are inside the router: `isAdmin`, and `ADMIN_ONLY_FIELDS` at `kpi.ts:286`.
- Visibility, by user decision: every signed-in user sees every eligible record.

### B.2 Feature-by-feature compliance (spec v implementation)

| Feature | Status | Evidence / gap |
|---|---|---|
| Dashboard access & visibility | **Implemented but defective** | Auth on every route (P13: 401 / 403 correct). The access policy is unbounded: open sign-up (A-01). The record detail leaks the full costing JSON (A-02) |
| Financial KPI cards | **Correct and verified** (arithmetic) / **Requires a business decision** (definitions) | Re-added independently (live e2e; FIN "checked and correct"). Validated / implemented savings have no evidence model (A-13); the opportunity card does not show its eligible base (F-21) |
| Coverage & workflow indicators | Correct and verified | Counts match the classification (e2e) |
| Filters & reporting periods | **Implemented but partially correct** | All 10 filters work and are consistent across KPIs, charts, table, drill and exports (FIN; e2e). The period semantics are undefined (A-08). Filters are not in the URL. Malformed filter JSON silently gives the unfiltered view (P17) |
| Opportunity & coverage charts ("Where to act") | Implemented but partially correct | Correct data. Below the first screen at 1366 / 1024 / 390 (F-02 partly fixed; §E) |
| Management insights | Correct and verified | Engine-built; wording never says "savings". Negatives print "£-4.03" (A-27) |
| Analysis charts & table views | Implemented but partially correct | Every chart has a table view; count axes have no title (F-19) |
| Drill-down navigation | Correct and verified | e2e drill; a chip says what it applies to |
| Costing records table | Correct and verified | Sort / search / page at 50k in 33–42 ms (§F). Column "Created" is the costing date (F-24) |
| Record details panel | **Implemented but defective** | Returns another user's whole costing JSON (A-02). An empty "Original costing analysis" heading shows for API saves, with the raw id `sheet_metal` (F-25, still open — `screenshots/state-record-drawer-dark-1440.png`) |
| Original costing analysis | Implemented but partially correct | Read-only 8-bucket view only. No "open in calculator" (F-16 B, not approved). For imports it is hidden (correct) |
| Currency & FX handling | **Implemented but defective** | Snapshots, original values and history are correct. The guard misses inversions; the table has no history; policy edge cases are wrong (A-07, A-12, A-15) |
| PDF / Excel / CSV exports | Implemented but partially correct | Figures reconcile. No silent omission at 50k (12,000 + 8,000 / 30,000 + 20,000 rows). PDF 10.9–13.1 MB from uncompressed images (A-17). Excel takes 8.7 s at 50k |
| Administrative functions | Implemented but partially correct | FX load / policy / recalculation (preview → apply), import and audit are admin-only at the API (P13). The audit stores new values only; the import trusts the file's own approval claims (A-10, A-14) |
| Empty / loading / error states | Correct and verified | `screenshots/state-empty-no-records-dark-1500.png`, `state-loading-dark-1440.png`, `state-error-light-1440.png` |
| Responsive layouts & themes | Correct and verified (no overflow, 0 axe) / partially correct (usability) | 12 width × theme views: 0 px overflow, 0 axe violations. On a phone "Where to act" starts 1.7 screens down. 64 controls are below 24 px (§E) |

**Spec discrepancies of note:**

- (a) The build doc says a same-part two-country costing is a "duplicate candidate". For the same owner it is actually a
  *superseded* revision, and it does not appear in the duplicate count (FIN-13).
- (b) The engine header says costs are compared only on the same unit, but `cost_unit` is never written or checked
  (FIN-11).
- (c) The build doc says the test flag is admin-only. The server lets an owner set it (P02).

---

## C. Prioritised findings register

IDs `A-xx` are this audit's. The cross-references point to the two reviewers' reports and to the earlier `findings.md`
(F-xx). "Repro" names the probe in `20-probes.json` (run `npx tsx docs/dashboard-audit/phase1-evidence/probes.ts` from
`calculator/`). **RB** marks a release-blocking finding.

### P0

| ID | Pri | Affected file/component | Evidence and reproduction | Root cause | Business impact | Recommended correction | Regression risk | Business approval? |
|---|---|---|---|---|---|---|---|---|
| **A-01** RB | P0 | `server/routes/auth.ts:119-185` (sign-up), `:69-71` (regex only); `kpi.ts:131-153` (list / CSV to every user); `fly.toml` (public host) | P01: `POST /api/auth/signup` with outsider@example.org → 201; verify → 200 + token. As that stranger: `/records?all=1` shows the €123.45 supplier price; `/records/:id` → 200 with the full breakdown; `/records.csv` → 200 with the price. No `ALLOWED_EMAIL*` / domain setting exists anywhere (SEC-01) | Visibility "all signed-in users see all" (decided) combined with open self-registration (never restricted) | Every supplier quote, should-cost and programme in the tool is readable and exportable by anyone on the internet who can receive an e-mail. Commercial-data exposure | Server-side allowlist (domain list or invite-only / SSO) enforced at sign-up, sign-in **and** `requireAuth`; existing accounts outside the allowlist disabled | Low (auth path only); existing test accounts must be re-checked | **Yes** — who may hold an account (access policy) |
| **A-03** RB | P0 | `kpi.ts:286` (`ADMIN_ONLY_FIELDS` omits `annualVolume`), `:297-303` | P14: admin validates 60,000 / approves; the owner PATCHes `annualVolume: 6,000,000` → 200; still `volumeValidated: true`, `status: approved`; annualised £120,000 → **£12,000,000** (FIN-01, SEC-03) | Validation is a boolean not bound to the value it validated | The only "validated" money figure on the page can be set ×100 by the record's owner; materially incorrect financial reporting | Changing a validated volume clears validation (or is admin-only); store `validatedVolume`, `validatedBy`, `validatedAt`, `source` | Low | No (control fix). Volume *semantics* are decision D-6 |

### P1

| ID | Pri | Affected file/component | Evidence and reproduction | Root cause | Business impact | Recommended correction | Regression risk | Business approval? |
|---|---|---|---|---|---|---|---|---|
| **A-02** RB | P1 | `kpi.ts:162-180` (`/records/:id` returns `scenarios.data`), `publicRow` | P01 `detailIncludesFullCostingBreakdown: true`; SEC-02: Bob receives Alice's `secretSupplierQuote` / `targetPrice` fields stored in her costing input | The detail returns the whole saved scenario JSON, not the fields the panel shows; this goes around the owner-only rule in `sync.ts` | Cross-user exposure of the full costing (inputs, target prices, quotes) beyond what the dashboard displays | Return only the 8 buckets + total + commodity / region the panel prints; the full costing only to the owner / admin | Low | No |
| **A-04** RB | P1 | `kpi.ts:217`, `:247` (save) | P15: `result.total: 0.01` with a £1,998 breakdown → stored should-cost £0.01, opportunity £11.99 (FIN-03, SEC-06) | The server trusts the client's total; nothing re-derives or cross-checks it | Any user can create any "opportunity"; the "AI never sets a price / deterministic" defensibility stops at the dashboard | At minimum: total must re-add from the breakdown, and store the rate-book fingerprint. Better: re-run `computeUniversalStack` on the stored input server-side | Medium (costings saved from paths whose breakdown does not re-add would be refused — verify first) | No |
| **A-05** RB | P1 | `kpi.ts:264-303` (`patchSchema`, `ADMIN_ONLY_FIELDS`, `MONEY_FIELDS`); `kpi-view.ts:369-373` (UI hides the box) | P02: owner sets `isTest` → 200 → record excluded; owner downgrades approved → draft → 200; owner deletes an approved record → 200. FIN-02 / SEC-04: an owner moves an *approved* record to another part / programme and it stays approved; `commodity` / `country` are writable though the UI never sends them | Admin-only list incomplete; the status resets only on money-field changes | Owners can silently remove or re-point approved figures; the status no longer means what it says | `isTest`, `commodity`, `country` admin-only; any identity or volume change returns the record to `completed`; owners cannot change a status an admin set; delete of an approved record admin-only (or soft-withdraw with audit) | Low | **Partly** — whether an owner may withdraw an approved costing (D-4) |
| **A-06** | P1 | `src/engine/kpi-dashboard.ts:188` (`statusRank` draft = 0, else 1), `:284-288` | P06: CSS "approved" 2026-09-01 → `duplicate`; CPSC "completed" 2026-10-15 → `current`. FIN-04 case 6: same-day ties follow `updatedAt`, so editing a note or an admin PATCH changes which revision counts | Selection ranks only draft v non-draft; ties use a mutable timestamp | Unreviewed figures replace approved ones in every KPI; the current record can flip with a note edit | Tie-break on `createdAt` (safe). Ranking approved > reviewed > completed is a **decision** | Medium (current-ness moves for existing data) | **Yes** (D-3) |
| **A-07** | P1 | `server/utils/kpi-import.ts:80-84` (10× guard) | P03: EUR 1.19 and USD 1.31 (inverted) accepted → 200 (ratios ×1.42, ×1.77); AED 4.9 and AED **4,900** accepted (no reference rate). ZAR inverted correctly refused. FIN-08: an inverted rate passes whenever 0.316 < r < 3.16 (EUR, USD, SGD, CAD); CHF, AUD, NOK, DKK, HKD unchecked; a genuine 2015 TRY rate is refused | A single static 10× band against one 2026 reference; no check without a reference | One wrong upload overstates every EUR value by 43 % with no warning (and the old rate is gone — A-12) | Reject when closer to 1/ref than to ref; compare to the previous approved row for that currency, with a tolerance that widens with period distance; require an explicit override for currencies with no reference | Low | **Yes** — the tolerance (D-5) |
| **A-08** | P1 | `kpi-dashboard.ts:389-390`, `:767` (period on the current record's `costingDate`) | P05: P05-OLD (approved, still current, gap £6, costed 2025-06-01) is absent from the default "Last 12 months" (opportunity £1.50) and present in "All time" (£7.50). P04: a Q1-2026 window shows the Feb-2026 approved costing's save in activity but **no financial figure**, because it was superseded in Oct-2026 | Classification is global; the period then filters by the current record's date — neither "as at" nor "valid during" | The default view understates the live financial position; a historical period cannot report what was valid then; the band titled "Financial position" (a stock) behaves as a flow | Define it (D-2). Recommended: the period drives *activity* only; the financial band is "current as at the period end" (classify records with `costingDate ≤ to`) and is labelled so | Medium (headline figures change for every saved view) | **Yes** (D-2) |
| **A-09** | P1 | `kpi.ts:247` (CostVision save); `kpi-store.ts:46` (`cost_unit` default), engine header `:25-26` | Code evidence (FIN-11): the should-cost is all 8 buckets incl. **amortised tooling, packaging, logistics, margin** at the costing's own volume / life; the current cost is a free "per piece" number with no scope, quote volume, quote date or unit. `cost_unit` is never written; only delivery terms are compared | Only one comparability attribute (terms) is captured | A supplier price excluding tooling, compared with a should-cost including it, systematically understates the gap or flips it unfavourable | Capture `currentIncludesTooling`, `quoteVolume`, `quoteDate`, `unit` on save / import; set `basis-mismatch` on scope or unit; or compare ex-tooling with tooling shown apart | Medium | **Yes** (D-1) |
| **A-10** | P1 | `kpi-import.ts:44-49` (date format only), `:147-181`; `kpi.ts:389-395` | P09: a row dated **2031-01-01** with `status=approved` imports and becomes `current`. FIN-07: it then hides the real costing and, being beyond the 12-month window end, removes the part from the default view. FIN-14: a file can set `approved`, `volume_validated=yes`, `saving_status=implemented`; a re-import overwrites in-app admin decisions and silently "updates" a soft-deleted record | The import trusts the file's own control claims; no future-date check | One spreadsheet can approve figures, validate volumes and claim savings without an admin decision in the tool | Refuse dates > today + tolerance; import as `completed` with validation / saving off unless the admin ticks "file is authoritative"; audit before → after per row; refuse rows that hit deleted records | Low | **Partly** — whether CSS / CPSC approvals are authoritative (D-9) |
| **A-11** | P1 | `kpi-dashboard.ts:177-181`, `:270-272` (normalisation: upper-case + strip spaces) | P08: `LR-VAR-100`, `LRVAR100`, `LR_VAR_100` → three separate current records. P16: programme `Q900` / `q900` → two current records (FIN-12: opportunity and annualised double). CostVision writes country `UK`, the import template `GB` | Free-text identity fields; part-number punctuation kept; programme / powertrain / commodity / country not normalised | Double counting of the same component; split filter values | Fold case on programme / powertrain; fold hyphen / dot / underscore / Unicode punctuation and zero-width characters in part numbers; ISO 3166 country; controlled vocabularies for programme / powertrain / commodity | Medium (re-keys applications — run a dry-run report first) | No for case / punctuation folding; **yes** for revision-suffix rules (D-3) |
| **A-13** | P1 | `kpi.ts:250-251` (every save sets `volumeValidated: false`, `savingStatus: null`); `kpi-dashboard.ts:596-600`; record model (`kpi-store.ts:179-200`) | P07: validated saving £1.50 → **£0** after the owner saves a new revision. FIN-05: a £5/pc validated saving survives a cut of the price to £0.50. Q5: no baseline price, negotiated price, effective date, volume, validator or evidence is stored | Admin decisions live on one row, not on the application; savings are a status + a number | Validated / implemented savings are neither durable nor evidenced; a manual status reads as a verified commercial saving | Model savings at application level with baseline, new price, effective date, volume, validator, evidence reference and history; carry forward on revision flagged for re-validation; invalidate when the underlying price changes | Medium | **Yes** (D-7) |

### P2

| ID | Pri | Affected file/component | Evidence and reproduction | Root cause | Business impact | Recommended correction | Regression risk | Business approval? |
|---|---|---|---|---|---|---|---|---|
| A-12 | P2 | `kpi-store.ts:122-128` (`upsertFxRates`), `kpi.ts:353` | P03: CHF loaded 0.90 then 0.95 → the table holds only 0.95; both audit rows read `{"currencies":["CHF"]}` (no values) | UPSERT overwrites; the audit stores currencies only | A record's FX snapshot cannot be traced to a table version; an overwritten rate cannot be recovered | Append-only `fx_rates` (version, loaded_by, superseded_at); store the version in each snapshot; audit old → new | Low | No (DB structure — listed under D-8 for visibility) |
| A-14 | P2 | `kpi.ts:310` (patch audit), `:405` (last 200 rows); saves log scenario id + part only | FIN-15, SEC-08: edits logged without before-values; a policy change does not log the old policy; imports log counts only; the costing behind an approved record can be rewritten via `/api/sync/scenarios` with no KPI audit entry | Audit designed as an activity log, not a change log | A change cannot be reconstructed; weak evidence for financial governance | Log before + after; paginate the audit; record validation / saving metadata on the record; snapshot the linked costing at approval | Low | No |
| A-15 | P2 | `kpi-dashboard.ts:226-241` (`resolveFx`) | FIN-10: "costing-date" picks a stale 2019 daily row over the month's monthly row; "reporting-date" picks future / budget periods and is frozen at save; "monthly" applies the Oct-2026 reference rate to any year (flagged `approved:false` but in the headline); the FX date is the save date, not the quote date; a China should-cost is labelled "GBP, no conversion" although the engine converted at the book FX | Look-ups unbounded in time; reference fallback unbounded | Wrong rate silently selected in edge cases; two different FX bases inside one gap | Bounded look-back; exclude future periods; reference rate only inside its validity window (else ineligible); capture quote date; store the book FX on the should-cost | Low–medium | **Yes** — FX policy details (D-5) |
| A-16 | P2 | `kpi-dashboard.ts:270` (key), `:293-299`; `kpi.ts:393` (import owner) | FIN-13: the same owner's UK casting and CN forging of one part → one is `superseded` (silent); two independent quotes or a CSS + CostVision costing collapse to one current; an import owner `import:<tool>:<label>` never matches the same engineer in CostVision; deleting the current record silently restores an older revision | Identity = part × programme × MY × powertrain, owner-scoped for revisions | Parallel costings (countries, routes, suppliers) cannot be reported; consequences of changing the key in §D | Do NOT change the key silently. Add country / route / supplier / tool as *scenario dimensions* and choose one baseline per application (see D-3 for consequences) | High if the key changes | **Yes** (D-3) |
| A-17 | P2 | `src/ui/kpi-dashboard/kpi-export.ts:248` (`toDataURL('image/png')`), `:293` (`addImage(url,'PNG',…)`, no compression); `:258` (`new jsPDF` without `compress`) | `50-pdf-size-analysis.txt`: 8-page PDF = 10,901,505 bytes; **99.1 %** is 9 chart images stored as **raw uncompressed RGB** (filter NONE, 1000×~418 px, ~1.25 MB each). The same pixels Flate-compressed (lossless, zlib 9) = **116,894 bytes total**. At 20k / 50k records the PDF is 13.1 MB | jsPDF writes the decoded PNG pixels uncompressed unless asked to compress | 10–13 MB attachments; slow to e-mail and store | Pass `compression: 'FAST'` (or `'SLOW'`) to `addImage` and `compress: true` to `new jsPDF` — **lossless**, expected ≈ 0.2 MB, no visible change. JPEG not needed (flat-colour charts compress better losslessly) | Very low | No |
| A-18 | P2 | `kpi-view.ts` (filter state in memory only); `kpi.ts:73-75` (`filtersOf`) | Filters are not in the URL: a filtered view cannot be linked or bookmarked and browser Back does not step filters (only `#kpi-record=` exists). P17: malformed filter JSON → 200 with the **unfiltered** totals (16 records) instead of an error; a > 20,000-char filter is also silently dropped (an over-long URL is refused with HTTP 431 first) | Fallback to defaults on parse failure | A broken / truncated shared link silently shows company-wide totals as if filtered | Encode filters in the hash (`#kpi?…` — single plain `#name` rules apply in the app shell; check with the shell owner); return 400 on malformed filters | Low | No |
| A-19 | P2 | `kpi.ts:131-153` (`all=1`, cap 100,000 rows), exports built in the browser | §F: `records?all=1` = **27.8 MB at 20k, 69.7 MB at 50k**; browser heap 14.6 MB at open → **344 MB** after the three exports (20k); Excel export 3.3 s (20k) / **8.7 s** (50k); rows beyond 100,000 would be silently cut from exports | Exports pull every row as JSON into the page | Slow exports and high memory on ordinary laptops as data grows; silent truncation above 100k | Build Excel server-side or stream; send only needed columns; refuse (not cut) above the cap with a message | Medium | No |
| A-20 | P2 | `/api/kpi` (no limiter); `kpi.ts` save (10 MB body) | P11: 60 concurrent `records?all=1` → all 200 in 128 ms (no limiter). SEC-07: each new filter JSON misses the summary cache (96–211 ms rebuild at 20k–50k); saves unlimited per user | No rate limit / quotas | One user (or a script) can degrade the service | Per-user rate limit on `/api/kpi`; cap the costing JSON size; cache by normalised filter | Low | No |
| A-21 | P2 | Summary cache (`kpi.ts:37-49`) | §F: the first request after start or after ANY write pays the full re-classification: **575 ms at 20k, 1,461 ms at 50k** (and 210 / 600 ms after a write); warm 3 ms | One global cache invalidated by any write | Busy periods (many saves) make every viewer pay the rebuild | Incremental re-classification of the affected application only, or a background rebuild | Medium | No |
| A-22 | P2 | `kpi-view.ts` order; CSS | `screenshots/light-1366-fold.png`, metrics: "Where to act" starts at 796 px of 768 (1366), 1,123 of 768 (1024), 1,444 of 844 (390). At 1440 the heading is in view (749 of 900) but chart bodies are not (F-02 partly fixed) | Five financial + six coverage cards + an FX line + a data-quality line above it | The spec's main question still needs a scroll on laptops | See §E.1 (compact coverage row; move the FX / data-quality lines under the band) | Low | No |

### P3

| ID | Pri | Affected file/component | Evidence | Root cause | Business impact | Recommended correction | Regression risk | Approval? |
|---|---|---|---|---|---|---|---|---|
| A-23 | P3 | `kpi-store.ts:151` (`ownerName` falls back to e-mail), `kpi.ts:91` (`ownerId` in rows), `/meta` (`userId`) | P10: a user with no name shows as `gone@test` to everyone; rows carry `ownerId` and `import:CSS System:R. Rao`; display names need not be unique (SEC-09). = F-27 (open) | Data minimisation not applied | E-mails / internal ids visible to all users; one user can pose as another by display name | Never fall back to e-mail (show "Unnamed user"); drop `ownerId` from list rows | Low | No |
| A-24 | P3 | `package.json:64` `xlsx@0.18.5` (admin import) | SEC-10: CVE-2023-30533, CVE-2024-22363; no zip-bomb / field-length caps | Unmaintained npm release | Admin-only exposure | Use ExcelJS (already a dependency) for import, or the vendor's patched build; cap sizes | Low | No (dependency change needs your OK) |
| A-25 | P3 | `server/db.ts:214-228` (`ADMIN_EMAILS`), `CV_SHOW_DEV_OTP` | SEC-11: removing an e-mail from `ADMIN_EMAILS` never demotes; with `CV_SHOW_DEV_OTP=1` on a shared server anyone can verify a listed admin address | Promotion-only sync | Stale admins | Sync demotion; refuse `CV_SHOW_DEV_OTP` when `NODE_ENV=production` | Low | **Yes** — admin lifecycle policy (D-8) |
| A-26 | P3 | `server/index.ts:66` CSP `'unsafe-inline'`; token in localStorage | SEC-12 — app-wide, not dashboard-specific; the dashboard escapes correctly | — | One XSS anywhere would expose the dataset | App-wide hardening (out of dashboard scope) | Medium | Yes (app-wide) |
| A-27 | P3 | `kpi-dashboard.ts:671-672` (`gbp0` / `gbp2`) | Insights print `£-4.03`; the screen's own formatter prints `−£4.03`; Excel `-£` | Two formatters | Inconsistent negatives (known issue 4) | Use one sign-first formatter in the engine | Very low | No |
| A-28 | P3 | `kpi-dashboard.ts:187,306`; `kpi-export.ts:187-196` | FIN-16: a current cost of 0 is "no current cost"; the Reconciliation sheet does not re-add annualised or savings; small display % computed in the UI | — | Minor | Treat 0 as a value (or refuse it at entry); add the two rows | Low | No |
| A-29 | P3 | `kpi-builders.ts` (info buttons) | §E.5: 64 of 137 controls at 390 px are under 24 × 24 px (the 18 × 18 "i" buttons, 41 × 15 links) | Icon size | Touch accuracy (WCAG 2.2 2.5.8 is AA in 2.2; the audit target is 2.1 AA, which passes) | 24 px hit area (padding, same glyph) | Very low | No |

**Earlier-audit P3 items, re-verified** (`findings.md`). All are still open unless stated.

| Item | Status | Evidence |
|---|---|---|
| F-02 "Where to act" | Partly fixed | → A-22 |
| F-16 remainder | Open | A record link pasted into an already-open tab does not open the record (needs the not-approved `hashchange` hook in `main.ts`) |
| F-19 axis titles | Open | No axis titles in `kpi-charts.ts:150,180` |
| F-21 eligible count on the opportunity card | Partly fixed | The eligible base is on the gap card; the opportunity card says "3 records above should-cost" without "of 5 eligible" |
| F-22 literal shadows | Open | `kpi-dashboard.css:49,64,97,111,237,238` |
| F-23 8 px seam | Open | `top: 64px` at `kpi-dashboard.css:54` |
| F-24 "Created" label | Open | `kpi-builders.ts:293` |
| F-25 empty analysis heading and raw commodity id | **Open** | `screenshots/state-record-drawer-dark-1440.png` shows the heading with no breakdown and `sheet_metal` |
| F-26 reduced motion | Open | `kpi-view.ts:642` `scrollIntoView({behavior:'smooth'})` ignores the preference. The measured page has 0 running animations with reduced motion |
| F-27 | Open | → A-23 |
| F-28 Export button weight | Open | `kpi-view.ts:142` `btn-primary` |
| X-01 | Open by your decision | "Save to KPI Dashboard" is in the More menu |

**Counts: P0 2 · P1 10 · P2 10 · P3 7 (29 findings), plus 11 carried-over items.** Five findings are
release-blocking (RB): A-01 to A-05. A-02 and A-04 are release-blocking in combination with A-01.

---

## D. Business decisions requiring approval

| # | Area | Decision needed | Options and consequences |
|---|---|---|---|
| **D-1** | Costing methodology / KPI definition | What scope must the current cost and should-cost share before a gap counts? (A-09) | (a) Same scope, unit and terms are required: capture "includes tooling", unit, quote volume and quote date, and make non-matching records ineligible. Coverage falls; the figures become defensible. (b) Compare the should-cost **ex tooling**, with tooling shown apart. The headline changes for every record. (c) Keep as is and label the gap "indicative". |
| **D-2** | KPI definitions / periods | What does the period filter mean for the **financial band**? (A-08) | (a) **Recommended:** "current as at the period end". The financial band shows the figure valid at that date; the period drives activity counts only. (b) "Re-costed in the period" (today's behaviour). Must then be labelled as a flow, and the default view will keep hiding still-current costings. (c) Show both. |
| **D-3** | Record identity / revision selection | (i) Should approved stay authoritative until a newer one is **approved**? (A-06) (ii) Should country, plant, route, supplier or tool distinguish applications? (A-16) (iii) What is the part-number revision-suffix rule? (A-11) | (i) Yes: approved > reviewed > completed > draft. Some current records change today. (ii) Adding a dimension **to the key** splits historical applications. Unique components stay the same, but current records, opportunity and annualised all rise, because alternatives become additive (wrong when they are alternatives). Exports and saved filters change their row counts. **Recommended:** keep the key and add these as scenario dimensions with one chosen baseline per application. (iii) Strip `REV x` / trailing letter, or not. |
| **D-4** | Workflow / permissions | May an owner withdraw, downgrade or delete an approved costing? (A-05) | (a) No; only an admin can. (b) Yes, with a mandatory reason recorded in the audit. |
| **D-5** | FX policy | (i) The FX-guard tolerance and the reference set. (ii) Policy edge rules: look-back limit, future periods, out-of-window reference. (iii) FX date = quote date or save date? (A-07, A-15) | The guard tolerance by period distance, the reference-currency list and the override procedure. Using the quote date requires capturing it (D-1). |
| **D-6** | Annual volume | What exactly the validated volume is (A-03, FIN Q4). Today it is "parts a year" from the costing's own assumption, validated by a yes/no flag | Recommended: parts a year **per application** = vehicle volume × quantity per vehicle × applicability (programme / MY / powertrain / market / plant) over SOP–EOP, with a source (MRP / CBP / forecast), a validation date and a validator. Never vehicle volume × unit gap directly. |
| **D-7** | Savings definitions | What counts as a validated or implemented saving (A-13) | Required evidence: baseline price, new price, effective date, applicable volume, validator, evidence reference and history. Decide whether savings live per application (and survive revisions) and when they must be re-validated. |
| **D-8** | Access policy | Who may hold an account (A-01); admin lifecycle (A-25) | (a) A domain allowlist (which domains). (b) Invite-only. (c) SSO. Also decide whether every user should see every supplier price, or ownership / commodity scoping (this was decided "all see all", which A-01 makes unsafe). |
| **D-9** | Imports | Are CSS System / CPSC II approvals, validations and savings authoritative when imported? (A-10) | (a) No; import as `completed` and an admin re-confirms. (b) Yes, per file, with an explicit admin tick and a per-row audit. |
| **D-10** | Database structure | Approve the schema additions the corrections imply | Append-only `fx_rates` (A-12); validation and saving metadata (A-03, A-13); comparability fields (D-1); application-level decisions (D-3). |

---

## E. UI/UX recommendations (no redesign; existing tokens, components and themes kept)

The evidence for this section:

- `screenshots/` holds 54 PNGs: 6 widths × 2 themes, fold and full page, plus 24 state shots;
- `evidence/screenshots-metrics.json` holds the measurements;
- `30-perf-20000.json` `ux` was measured on 20,000 records.

**What is good and should stay:**

- 0 axe WCAG 2.1 AA violations in all 12 views;
- 0 px horizontal overflow;
- financial-first hierarchy;
- word badges, never colour alone;
- keyboard focus kept after a filter pick, and Escape closes the popover;
- the sticky table header works;
- the theme persists;
- the empty, loading and error states are clear;
- 0 unnamed controls;
- a sensible heading tree (H1 → 6 × H2 → H3 charts) and 22 labelled regions.

1. **First screen, A-22 / F-02.** At 1366 and 1024, "Where to act" is below the first screen. Recommendations:
   - (a) render the six coverage cards as one compact strip (label + number in one row, the sub-text in the tooltip),
     saving about 70 px;
   - (b) move the FX-policy line and the data-quality line into one row *below* the financial band, saving about 40 px;
   - (c) at ≤ 1366, show "Where to act" before Coverage.

   (a)+(b) brings the heading and the first bars into view at 1366 × 768 without shrinking type. At 390, a "Jump to
   Where to act" chip under the band is preferable to reordering.
2. **The opportunity card states its base (F-21).** Add "of 5 eligible" beside "3 records above should-cost". The
   number is already in the payload.
3. **Record panel (F-25 + A-02).**
   - Hide the "Original costing analysis" heading when no breakdown was saved; say "No cost breakdown was saved with
     this costing".
   - Print the commodity label, not `sheet_metal`.
   - Show the scenario reference as a label, not raw `sc-a4`.
   - Show the record id in a smaller muted style. It is uppercased in the eyebrow today.
4. **Charts (F-19).** Add axis titles ("Current records", "£ per piece") and keep the table toggles. In the 50k run the
   status and model-year charts stayed readable.
5. **Touch targets (A-29).** Give the "i" buttons and inline links a 24 × 24 px hit area (padding only, same visuals).
   This fixes 64 of the 137 controls at 390 px.
6. **Reduced motion (F-26).** Use `behavior: 'auto'` under `prefers-reduced-motion`. Measured: no running animations
   and no transitions with reduced motion; only the smooth scroll remains.
7. **Filters (A-18).** Put the filter state in the URL, so a view can be shared and Back works. Show an error on a
   broken link instead of company-wide totals.
8. **Minor items:**
   - F-22: shadows via `--shadow-*` tokens;
   - F-23: sticky bar `top: 56px`;
   - F-24: rename the column "Costing date";
   - F-28: Export as `btn-secondary`;
   - A-27: one negative format, `−£4.03`.

---

## F. Performance and security findings

### F.1 Existing data

The local development database (`calculator/data/should-cost.db`) holds **0 users, 0 scenarios and no KPI tables**. So
"existing data" performance was measured with **0 records**, which is not meaningful. The only realistic existing
fixture is the e2e fixture of 9 records.

### F.2 Volume: end-to-end, throwaway database

**Method.** For each run, `phase1-evidence/perf.ts`:

1. starts the **real server** with `CV_DATA_DIR` set to a new `/tmp/cv-phase1-perf-*` directory;
2. lets the server create its own schema;
3. inserts N synthetic records through the store's own `insertRecord`, with no code, config, migration or dependency
   change;
4. restarts the server and times the HTTP calls and a real headless Chromium session;
5. **deletes the directory**.

The synthetic data has 5 currencies, 8 commodities, 5 programmes, ~60 % unique applications and dates spread over 12
months. The runs were not concurrent with other work.

| Measure | 20,000 records | 50,000 records |
|---|---|---|
| DB size / insert time | 18.6 MB / 0.96 s | 46.2 MB / 2.2 s |
| `/summary` cold (first after start) | **575 ms** | **1,461 ms** |
| `/summary` warm | 3 ms | 3 ms |
| `/summary` after a write | 210 ms | 600 ms |
| `/summary` new filter (commodity) / all-time | 96 / 123 ms | 211 / 370 ms |
| `/records` page 1 sorted by gap / search | 18 / 16 ms | 42 / 33 ms |
| `/drill` | 11 ms | 21 ms |
| `/records/:id` | 9 ms | 13 ms |
| `/records.csv` (server) | 155 ms, 5.7 MB | 381 ms, 14.3 MB |
| `/records?all=1` (feeds the browser's Excel / PDF) | 390 ms, **27.8 MB** | 965 ms, **69.7 MB** |
| Browser: open dashboard → cards + table (cache warm) | 299 ms | 318 ms |
| Browser: change period to "All time" | 498 ms | 857 ms |
| Browser: CSV export | 0.29 s, 5.7 MB | 0.46 s, 14.3 MB |
| Browser: **Excel export** | **3.3 s**, 3.0 MB | **8.7 s**, 7.3 MB |
| Browser: PDF export | 2.1 s, **13.1 MB** | 3.2 s, **13.1 MB** |
| Browser JS heap at open / after exports | 14.6 / **343.9 MB** | 14.8 / 124.2 MB (after GC) |
| DOM nodes (whole app) | 21,359 | 21,433 |
| Export completeness | 12,000 current + 8,000 older = 20,000 ✓ | 30,000 + 20,000 = 50,000 ✓ (`32-perf-export-rowcheck.txt`) |
| Page errors | none | none |

**Reading.**

- The interactive path stays fast at 50k. Paging, searching, drilling and the record detail all respond in under
  50 ms.
- The weak points are the cold or after-write summary rebuild (A-21), the browser-built Excel / PDF pulling the full
  JSON (A-19), and the PDF size (A-17).
- **Not tested:** concurrent users, a network slower than localhost, a database larger than 50k, and memory on a
  low-end laptop.

### F.3 Security, verified at the API (not the screen)

| Checked | Result |
|---|---|
| No token / bad token → `/api/kpi/*` | 401 (P13) |
| Non-admin: excluded list, audit, FX policy, recalculation, import | 403 (P13) |
| Non-admin edits another user's record; sets approved | 403 (P13) |
| Excluded records in the lists, drill, filters and KPIs | Absent (e2e; SEC) |
| SQL | Parameterised; zod schemas with length limits |
| HTML injection | `esc` everywhere on the dashboard; strict deep-link id check (SEC) |
| CSV formula injection | Guarded (FIN, SEC) |
| **Open sign-up → all data** | **FAIL — A-01 (P0)** |
| **Full costing JSON to any user** | **FAIL — A-02** |
| **Owner powers (test flag, status, identity, volume)** | **FAIL — A-03, A-05** |
| Rate limit on `/api/kpi` | None (A-20) |
| Personal data (e-mail fallback, `ownerId`) | Exposed (A-23) |

---

## G. Test results

### G.1 Commands and results (all run in this phase, logs in `phase1-evidence/`)

| Command | Result | Log |
|---|---|---|
| `npm test` (vitest, full suite) | **368 files, 5,998 tests passed**, 402 s — same as the earlier baseline | `10-npm-test.log` |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 | `11-typecheck-build.log` |
| `npm run typecheck` (`tsc --noEmit`) | exit 0 | `12-typecheck-full.log` |
| `e2e/kpi-dashboard-live.ts` (`CV_LIVE_OUT=phase1-evidence/e2e-live`) | **59 / 59 PASS** (independent re-add from the exported workbook, axe on 3 views, exports) | `41-e2e-live.log`, `e2e-live/results.json` |
| `e2e/kpi-dashboard-audit.ts phase1-evidence screenshots` | 12 views: 0 overflow, 0 axe violations, 54 screenshots | `40-screenshots.log`, `evidence/screenshots-metrics.json` |
| `phase1-evidence/probes.ts` (17 live reproductions) | Findings reproduced as listed in §C; no server errors | `20-probes.json` |
| `phase1-evidence/perf.ts 20000` / `50000` | §F.2 | `30-perf-*.json`, `31-perf-*.log` |
| Reviewer scratch probes (`agent-scratch/*.ts`) | Run by the reviewers; results in their reports | `agent-*-review.md` |

### G.2 Limitations

- The existing tests pass **because they do not test the defects in §C**. `tests/kpi-dashboard-server.test.ts` (13
  tests) checks the admin-only routes but not owner powers, the FX inversion, future dates or open sign-up.
- The e2e fixture is 9 records. Volume figures come only from the throwaway runs in §F.2.
- The live run's `localStorage … Access is denied` message in `pastedRecordLink.errors` comes from the harness's blank
  start page. It appears in the earlier `after-metrics.json` too, and is not a dashboard error.
- `npm run build` was **not** run. It rewrites the tracked `calculator/dist`, and `dist` was already current at HEAD
  (`00-git-state-start.txt`).

### G.3 Not tested (with reason)

| Item | Reason |
|---|---|
| Real JLR data / production database | Not available, and must not be touched |
| A sign-up e-mail from another machine | No SMTP. The same-machine OTP path stood in (the point is that **any domain** is accepted) |
| Concurrent multi-user load, slow network, > 50k records | Would need a load tool or install; out of the Phase 1 allowance → Phase 2 plan in §H |
| Screen readers (NVDA / VoiceOver) | Not available; structure checked via axe, headings, regions and names |
| Windows package / Docker CAD image | Not affected by the dashboard; not in scope |

### G.4 Proof of no change

The output of `git status` and `git diff --stat` follows in the chat summary at the stop gate, and is mirrored in
`99-git-state-end.txt`.

Files that tools created **outside** the evidence folder (listed for you to clean up; I have **not** deleted them):

| Path | Created by | Note |
|---|---|---|
| `calculator/data/should-cost.db` | the `npm test` run (modified 10:43:32, mid-suite) | git-ignored; holds 0 users / 0 scenarios / no KPI tables; contents unchanged in substance |
| `calculator/node_modules/.vite-temp/` | vitest | git-ignored cache directory |
| `/tmp/cv-kpi-1736-1794393709989/`, `/tmp/cv-kpi-3738-1794393793005/` | the KPI server tests in the suite | temporary databases |
| `/tmp/cv-phase1-probe-*` (3 directories) | `probes.ts` | throwaway probe databases |
| `/tmp/` temp directories from the two e2e harnesses | `kpi-dashboard-live.ts`, `kpi-dashboard-audit.ts` | throwaway databases |
| The session scratchpad | the reviewers' `fin-api.ts` / `sec-probe.ts` | throwaway databases, outside the repo |

The perf runs delete their own `/tmp/cv-phase1-perf-*` directories.

---

## H. Final recommendation

### H.1 Risks preventing production release

1. A-01, open sign-up → all supplier prices, together with A-02, the full costing to every user. **Blocking.**
2. A-03, owner-inflated validated volume, and A-05, owner powers on approved records. **Blocking.**
3. A-04, the client-supplied should-cost. **Blocking.**
4. Financial definitions not yet decided: D-1, D-2, D-3 (i), D-6, D-7. The headline figures cannot be called
   defensible until these are decided.

### H.2 Changes safe to implement (no business decision; dashboard / KPI server code only)

| Order | Findings | Size |
|---|---|---|
| 1 | A-03 (clear or lock validated volume), A-05 control part (`isTest` / `commodity` / `country` admin-only; identity change → `completed`) | S |
| 2 | A-02 (detail returns only displayed fields), A-23 (no e-mail fallback, no `ownerId` in rows) | S |
| 3 | A-04 (total must re-add from the breakdown; store the rate-book fingerprint) | S–M |
| 4 | A-10 control part (refuse future dates; refuse rows hitting deleted records) | S |
| 5 | A-06 tie-break on `createdAt` (the ranking itself is D-3) | S |
| 6 | A-07 inversion check (closer to 1/ref than to ref → refuse) — no tolerance change | S |
| 7 | A-17 lossless PDF compression; A-18 400 on malformed filters | S |
| 8 | A-11 case / punctuation folding (with a dry-run report of re-keyed applications first) | M |
| 9 | P3 polish: F-19, F-21, F-22, F-23, F-24, F-25, F-26, F-28, A-27, A-28, A-29 | S each |

### H.3 Changes requiring your approval

| Change | Needs |
|---|---|
| A-01 access restriction | D-8 |
| A-05 withdrawal rules | D-4 |
| A-06 ranking | D-3 (i) |
| A-07 tolerance, A-15 FX edge rules | D-5 |
| A-08 period meaning | D-2 |
| A-09 comparability fields | D-1 |
| A-10 import authority | D-9 |
| A-12 / A-13 / A-14 schema | D-10 |
| A-16 identity dimensions | D-3 (ii) |
| A-24 dependency swap | — |
| A-25 admin lifecycle | — |
| A-19 / A-21 server-side exports and incremental cache | architecture |
| A-26 app-wide CSP | — |
| X-01 / F-16 B | protected costing-tool areas |

### H.4 Issues that should remain unchanged

- The pure-engine design, the weighted-gap formula (Σgap ÷ Σcurrent, positive = above should-cost) and opportunity /
  unfavourable kept apart.
- Missing values never treated as zero; no 1:1 FX except GBP; original-currency mode never adding currencies.
- Classification before filters.
- Frozen FX snapshots with an admin preview → apply recalculation.
- CSV injection guard; Excel live reconciliation formulas.
- The admin-only enforcement that already works at the API.
- The visual identity, both themes and the shared components.
- **The identity key itself.** Do not change it without D-3.

### H.5 Phase 2 performance test plan (for approval)

| Item | Plan |
|---|---|
| Volumes | 50k, 100k, 250k records in a throwaway database |
| Users | 25 concurrent viewers plus 2 writers |
| Network | Throttled to "fast 3G" and "corporate VPN" profiles |
| Machine | A 4 GB RAM laptop profile |
| Pass thresholds | `/summary` p95 < 1.5 s warm-or-cold at 100k; table interactions p95 < 300 ms; Excel export < 10 s at 100k (server-built); PDF < 1 MB; browser heap < 300 MB peak; zero silent truncation (refuse above the cap) |
| Tools | Needs your approval to add a load tool (e.g. autocannon or k6) as a dev dependency, or to run one from outside the repo |

---

*Audit only. Stopped at the approval gate: nothing is implemented until you name the approved findings.*
