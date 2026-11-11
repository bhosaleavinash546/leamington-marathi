# KPI Dashboard: independent financial-systems review (Phase 1)

Reviewer: independent agent. I did not write this code, and I changed none of it.
Scope: `src/engine/kpi-dashboard.ts`, `server/data/kpi-store.ts`, `server/utils/kpi-import.ts`, `server/routes/kpi.ts` and `src/ui/kpi-dashboard/*`. I tested these against the build doc, the stage-1 audit, and `findings.md` / `report.md`.

Reproductions are scratch scripts in `phase1-evidence/agent-scratch/`. Run each with `npx tsx <file>` from `calculator/`:
- `fin-classify.ts`: engine only.
- `fin-api.ts`: the real `/api/kpi` router on a throw-away SQLite database in the session scratchpad.
- `fin-guard.ts`: the FX file parser against the built-in reference rates.

**Bottom line.** The arithmetic is correct. The design and control layer is not. Non-admins can change "validated" figures. An unapproved costing replaces an approved one. Admin decisions are lost whenever a new revision is saved. The default period hides costings that are still current. The inverted-rate guard misses EUR and USD. The prior audit's "no financial P0" holds only for its 9-record fixture.

## Findings

### FIN-01: P0. An owner can change a validated annual volume, and the record stays "validated"
- **Where:** `server/routes/kpi.ts:286` (`ADMIN_ONLY_FIELDS` omits `annualVolume`) and `:302` (only `currentCost/Ccy/Terms` reset the status).
- **Reproduction (`fin-api.ts` B):**
  1. An admin sets `volumeValidated: true`. Annualised = £11,990.
  2. Alice, a plain user, PATCHes `annualVolume: 1000000` and gets 200.
  3. `volumeValidated` is still true and `status` is still `approved`. Annualised = **£11,990,000**.
- **Root cause:** validation is a boolean that is not bound to the value it validated.
- **Impact:** the only "validated" money figure on the page can be set by anyone who owns a record.
- **Fix:**
  - Make `annualVolume` admin-only once validated, or clear `volumeValidated` on any volume change.
  - Store `validatedVolume`, `validatedBy`, `validatedAt` and `source` on the record.
- **Regression risk:** low. **Business decision:** no.

### FIN-02: P1. Other permission gaps on approved records
- **Where:** `kpi.ts:264-303`.
- **Reproduction (`fin-api.ts` C, D, E):** a non-admin owner can:
  - move an *approved* record to another part number and programme. The status stays `approved`, so the approval now applies to a different application.
  - set and clear `isTest`, so they can hide their own record or undo an admin's test flag. The route header (`kpi.ts:9`) and the build doc both say the test flag is admin-only.
  - downgrade `approved` to `draft`.
- **Fix:**
  - Add `isTest` to the admin-only fields.
  - Return the record to `completed` on any change to identity fields (part number, programme, model year, powertrain) or volume.
  - Forbid owners from changing a status an admin set.
- **Regression risk:** low. **Business decision:** whether owners may withdraw an approved costing.

### FIN-03: P1. The should-cost is whatever the browser sends
- **Where:** `kpi.ts:217` (`result.total` is any positive number) and `:247` (stored as `shouldCost`). The delivery terms come from client `input.deliveryTerms` (`:247`).
- **Reproduction (`fin-api.ts` A):** posting `result.total: 0.01` gives a record with should-cost £0.01 and gap £11.99.
- **Impact:** any signed-in user can create any opportunity they like. The "AI never sets a price / deterministic engine" defensibility claim does not reach the dashboard. Nothing re-derives the figure on the server.
- **Fix:** recompute on the server (`computeUniversalStack` on the stored input), or at least verify that `result.total` re-adds from `result.breakdown` and store the rate-book fingerprint.
- **Regression risk:** medium. **Business decision:** no.

### FIN-04: P1. The "current" record ignores approval, and same-day ties follow `updatedAt`
- **Where:** `kpi-dashboard.ts:188` (`statusRank` is only draft = 0, everything else = 1) and `:284-288`.
- **Reproduction (`fin-classify.ts` case 1):**
  - A's **approved** costing (2026-10-01, gap £4) becomes `duplicate`. B's newer **completed** costing becomes `current`.
  - The KPIs then use B's unreviewed figures (opportunity £4 → £0).
- **Reproduction (case 6):** two saves on the same day.
  - Editing the *older* save's notes bumps its `updatedAt`, and it becomes current again.
  - An admin PATCH (approve, validate) has the same effect, because `updatedAt` moves on every write.
- **Fix:** rank approved > reviewed > completed > draft, or report "latest approved" and "latest submitted" separately. Break ties on `createdAt`, never `updatedAt`.
- **Regression risk:** medium, because current-ness moves for existing data.
- **Business decision:** **yes**. Should the approved figure stay authoritative until a newer one is approved?

### FIN-05: P1. Admin decisions belong to one row and are lost with every new revision; a saving is not tied to the price
- **Where:** `kpi.ts:250-251` (every save inserts `volumeValidated: false` and `savingStatus: null`) and `kpi-dashboard.ts:596-600` (savings count only on the current record).
- **Reproduction (case 2):** rev1 carries a validated £2/pc saving. The owner saves rev2, and validated savings go from £2 to **£0**. The annualised figure also disappears.
- **Reproduction (`fin-api.ts` F):** the owner cuts the current cost to £0.50. The record still shows a **validated £5/pc saving**, which is larger than the price itself.
- **Fix:** keep savings and volume validation at the application level, with an effective date, or carry them forward on a revision and flag them for re-validation. Invalidate a saving when the price it was based on changes.
- **Business decision:** **yes**, on saving lifecycle semantics.

### FIN-06: P1. The period filter acts on the current record's costing date, so it is neither "as at" nor "valid during"
- **Where:** `kpi-dashboard.ts:389-390` and `:767`. Classification is global (`:265`); the filter is applied afterwards.
- **Reproduction (case 4):** a costing that is still current but was saved 14 months ago.
  - Default "Last 12 months": eligible 0, opportunity £0.
  - "All time": opportunity £4/pc, annualised £400,000.
- **Reproduction (case 5):** a custom 2025 window, where a 2025 costing was superseded in 2026, shows **0** eligible records. The figure that was valid in 2025 cannot be reported.
- **Impact:** the band titled "Financial position" (a stock measure) is really "applications re-costed in the window" (a flow). The default view understates the total.
- **Fix:**
  - Use the period only for activity.
  - For the financial band, use "current as at the window end": classify the records with `costingDate ≤ to`.
  - Label the result.
- **Regression risk:** medium. **Business decision:** **yes**.

### FIN-07: P1. Future-dated costings are accepted, become current, and hide the application
- **Where:** `kpi-import.ts:44-49` (`date()` only checks the format) and `kpi-dashboard.ts:286` (sorted by `costingDate` descending).
- **Reproduction (case 3):**
  - A CSS import dated 2030-01-01 becomes `current`, and the real 2026 costing becomes `duplicate`.
  - The default 12-month window ends today, so the application disappears entirely (current = 0).
- **Reproduction (`fin-api.ts` G):** a row dated 2031 with `status=approved`, `volume_validated=yes` and `saving_status=implemented` is imported without any warning.
- **Fix:** refuse a `costing_date` later than today plus a small tolerance, with the same error format the parser already uses.
- **Regression risk:** low. **Business decision:** no.

### FIN-08: P1. The 10× FX guard misses inversions of the main currencies and does not check unreferenced ones
- **Where:** `kpi-import.ts:80-84`.
- **Arithmetic:** an inverted rate is 1/r, so its ratio to the reference is 1/r². That passes the 10× test whenever 0.316 < r < 3.16.
- **Results (`fin-guard.ts`), inverted rates that are *accepted*:**

| Currency | Reference (GBP per unit) | Inverted rate | Ratio |
|---|---|---|---|
| EUR | 0.8358 | 1.196 | ×1.43 |
| USD | 0.7509 | 1.332 | ×1.77 |
| SGD | 0.5859 | 1.707 | ×2.91 |
| CAD | 0.5365 | 1.864 | ×3.47 |

- **Caught:** the 23 weaker currencies.
- **No reference rate, so no check at all:** CHF, AUD, NOK, DKK, HKD, ARS and others. CHF at £1,000 and ARS at £5,000 per unit are accepted.
- **False rejection:** a genuine 2015 TRY rate (£0.238) is refused, because the 2026 reference is £0.0151. Hyperinflation currencies cannot carry historical rates.
- **Live reproduction (`fin-api.ts` H):** a correct EUR 0.84 row is overwritten by an inverted 1.19 row with no warning. Every EUR value converted at that rate would be overstated by **43 %**.
- **Fix:**
  - Compare against the previous approved row for the same currency, with a tolerance by period distance.
  - Reject when the rate is closer to 1/reference than to the reference.
  - Require a reference or an explicit override for currencies without one.
- **Regression risk:** low. **Business decision:** the tolerance.

### FIN-09: P2. The FX table itself has no history
- **Where:** `kpi-store.ts:122-128` (an UPSERT overwrites the row) and `kpi.ts:353` (the audit stores only `{currencies}`).
- **Reproduction:** after H, the table holds only the 1.19 rate. Both audit rows read `{"currencies":["EUR"]}`.
- **Impact:** a record snapshot whose `source` is "Treasury" cannot be traced to a particular version of the table. A rate that was overwritten cannot be recovered or reviewed.
- **Fix:** make `fx_rates` append-only (with `version`, `loaded_by`, `superseded_at`), store the version in each `FxApplied`, and audit old → new values.
- **Business decision:** no.

### FIN-10: P2. FX policy resolution defects
- **Where:** `kpi-dashboard.ts:226-241`.
- **Case 11, `costing-date` policy:** a stale **2019 daily** row beats the costing month's monthly row. A 2026-11 costing converts at 0.86 from "old daily".
- **Case 11b, `reporting-date` policy:** this picks the latest *period*, including future or budget rows (a 2027-12 budget rate at 0.70). It is also frozen at save time, so it is not a reporting-date rate.
- **Case 11c, `monthly` policy:** a 2019 costing with no 2019 row takes the **Oct-2026 reference rate**. That rate is flagged `approved:false` but still feeds every KPI. Unapproved FX appears only as a count in data quality.
- **Saved costings:**
  - The FX date is the *save* date (`kpi.ts:245`), not the date of the quote or PO.
  - The CostVision should-cost carries `identity` FX ("GBP — no conversion"). A China costing is actually converted at the rate book's 30-Oct FX inside the engine. So each side of the gap uses a different FX basis, and the record hides one of them.
- **Fix:**
  - Use a bounded look-back for `costing-date`.
  - Exclude future periods.
  - Stop converting at the reference rate for dates outside its validity, or exclude those records from the headline.
  - Capture a quote date.
  - Store the book FX on the should-cost.

### FIN-11: P1. The two sides of the gap do not have to cover the same cost scope, volume or unit
- **Where:** `kpi.ts:247` and `kpi-store.ts:46,222-235`.
- **Should-cost side:** `PartCostResult.total` is all 8 buckets. That includes **amortised tooling**, packaging, logistics and margin, at the costing's own volume and programme life.
- **Current-cost side:** the current cost is a free "per piece" number. Nothing records whether it includes tooling, what volume it was quoted at, or its date.
- **Unit:** `cost_unit` is never written; it always defaults to `piece`. The engine header says costs are "compared only on the same … unit" (`kpi-dashboard.ts:25-26`), but no unit check exists. Only the delivery terms are compared.
- **Impact:** a supplier price that excludes tooling, compared with a should-cost that includes it, understates the gap or turns it unfavourable. It is systematic, not random.
- **Fix:** capture `currentIncludesTooling`, `quoteVolume`, `quoteDate` and `unit`, and set `basis-mismatch` on scope or unit too. Alternatively, compare the should-cost *ex* tooling with tooling reported separately.
- **Business decision:** **yes**, on the scope definition.

### FIN-12: P1. Free-text identity fields are not normalised, so the same component is counted twice
- **Where:** `kpi-dashboard.ts:177-181` and `:270-272`.
- **Reproduction (case 10):** programme `L460` against `l460` gives two current records for one component. Opportunity doubles (£4 → £8) and annualised doubles (£400k → £800k).
- **Part-number variants not matched:** `LR-100` / `LR.100` / `LR100`, a Unicode non-breaking hyphen, a zero-width space, `LR0100`, and revision suffixes (`LR100A`, `LR100 rev B` → `LR100REVB`).
- **Other free-text fields:** powertrain, commodity (CostVision labels against import text) and tool names are free text too.
- **Country codes:** CostVision writes `UK` (`kpi.ts:245`), but the import template example writes `GB` (`kpi-import.ts:191`), which makes two filter values.
- **Fix:**
  - Use controlled vocabularies for programme, powertrain, commodity and country (ISO 3166).
  - Fold hyphens, dots and Unicode punctuation in part numbers, and remove zero-width characters.
  - Use a configurable revision-suffix rule.
- **Regression risk:** medium; it re-keys applications.

### FIN-13: P2. Too coarse for some cases and too fine for others; the build doc misstates what happens
- **Where:** `kpi-dashboard.ts:270` and `:293-299`.
- **Parallel costings collapse into one.** Country, plant, route, supplier, scenario and source tool are not in the application key. The same owner's UK casting and CN forging of one part gives one record `superseded` and silent (case 7).
  - The build doc says a two-country costing is a "duplicate candidate". For the same owner it is actually a *superseded* revision, and it does not appear in the duplicate count.
  - Two independent supplier quotes, or a CSS costing alongside a CostVision costing, also collapse to one current record.
- **Owner identity is too fine for imports.** An imported owner is `import:<tool>:<label>` (`kpi.ts:393`). The same engineer in CostVision and in CSS, or "A. Engineer" against an email, counts as different owners and produces duplicates.
- **Deletion brings back old figures.** Deleting the current record silently restores the previous revision, however old.
- **Consequences of adding country or tool to the key:**
  - Historical applications split, and unique components stay the same.
  - Current records, opportunity and annualised all rise, because parallel costings become additive. That is wrong when they are alternatives rather than concurrent supply.
  - Exports and saved filters change row counts.
  - Better: add the attribute as a *scenario dimension* and choose one "baseline" per application, rather than summing.
- **Business decision:** **yes**.

### FIN-14: P2. The import trusts the file's own claims of approval
- **Where:** `kpi-import.ts:147-181` and `kpi.ts:389-395`.
- **What a file can set:** `approved`, `volume_validated=yes`, `saving_status=implemented` and future dates. All are accepted (`fin-api.ts` G).
- **What the audit records:** only counts.
- **Re-imports:**
  - A re-import overwrites admin decisions made in the app.
  - `findImported` (`kpi-store.ts:274-277`) does not filter `deleted_at`, so a re-import "updates" a soft-deleted record that stays excluded. It is reported as `updated`.
  - Tool names are exact strings, so `CSS System` and `css system` create a second copy.
- **Fix:**
  - Import as `completed` with validation flags off unless the admin ticks "file is authoritative".
  - Audit each row's before and after values.
  - Normalise tool names.
  - Refuse or report rows that hit deleted records.

### FIN-15: P2. The audit trail cannot reconstruct a change
- **Where:** `kpi.ts:310` logs only the *new* values.
- **Missing on the record:** who or when for a volume validation or a saving, the evidence behind it, and the "from" value.
- **Retention:** `/audit` returns only the last 200 rows (`kpi.ts:405`).
- **Fix:** store before and after values. Store validation and saving metadata on the record or the application.

### FIN-16: P3. Minor issues
- A current cost of 0 entered is treated as "No current cost" (`kpi-dashboard.ts:187,306`).
- The Reconciliation sheet does not re-add the annualised or savings figures (`kpi-export.ts:187-196`).
- The weighted gap mixes approved and reference FX without separating them.
- The UI does display-only arithmetic: a share percentage (`kpi-builders.ts`, `dataQualityHtml`), tooltip percentages and the per-commodity weighted % (`kpi-charts.ts:104`). The last uses the engine's row sums, so it is acceptable, but the engine should own it.

## Answers to specific questions

**Q4. Annual volume**
- **Where entered:** in the save dialog (`kpi-save-modal.ts:72`), as an integer number of parts a year.
- **Prefill:** `ctx.input.annualVolume`, the costing's own *input assumption* (`main.ts:1122-1128`), not demand data.
- **Validation:** a single boolean (`volume_validated`). Who and when exist only as patch JSON in `kpi_audit`. There is no source and no date on the record.
- **Not captured anywhere:**
  - quantity per vehicle
  - model-year or production period (SOP/EOP)
  - plant or market
  - volume source (MRP, CBP, forecast)
  - validation date
- **Unit risk:** annualised = per-piece gap × parts per year. That is correct only if the volume already includes quantity per vehicle.

**Q5. Savings evidence**
- **Stored:** only `savingStatus`, `savingPerPiece` and `savingCcy`. The FX is frozen at the *costing* date.
- **Not stored:** a baseline price, the negotiated price, an effective date, a volume, an approval reference or a history.
- **How the totals work:** "validated" and "implemented" are disjoint sums. An implemented saving is not also counted as validated. Both are sums of per-piece savings across different parts.

## Checked and correct (with evidence)
- **Weighted gap:** Σ(GBP current − GBP should) ÷ Σ GBP current. Positive = current above should-cost. It is not a mean of percentages (`kpi-dashboard.ts:613`). The Excel row is `C5/C3` over the same rows (`kpi-export.ts:195`).
- **Opportunity and unfavourable** are summed separately and never netted (`:604-611`; case 12: +£4 and −£4 give opportunity £4). Only the weighted % and Σgap are net, as documented.
- **Missing values:** a missing cost or FX makes the record ineligible, never zero (`:305-308`). An unknown currency gives `no-rate`; GBP is the only 1:1 (`:219-241`; `freeze` returns null, `kpi-store.ts:207-211`).
- **Original-currency mode** never adds currencies across rows. The gap appears only for records with the same currency and the same terms (`:617-633`).
- **Revisions:** classification runs before filters (`:765-770`). KPIs, charts, insights, drill, table and CSV all use the same `matchesFilters` context. Financial KPIs count current records only, so revisions are not double counted. The drill applies to the table and exports, not to the KPIs; this is stated on the chip.
- **Labelling:** gaps are never called savings, and the cards say "per piece, summed — NOT programme spend" (`kpi-builders.ts:131-135`).
- **FX snapshots:** frozen per value. An edit re-freezes only the changed values (`kpi-store.ts:242-253`). Recalculation has preview and apply, admin only, and keeps the previous snapshot in `fx_history` (`:284-319`; `kpi.ts:359-368`).
- **Access to excluded data:** excluded records, the import, FX upload and recalculation, and the audit log are admin-only at the API, not just on screen.
- **CSV** cells are protected against formula injection (`kpi-dashboard.ts:934-940`).
- **Totals reconcile** to the penny on the fixtures here; the prior hand reconciliation in `report.md` agrees.
