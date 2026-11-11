# KPI Dashboard: independent security review (code review, 11 Nov 2026)

Scope: `/api/kpi` and what it exposes. This was an audit only. No repository file was changed. Evidence comes from reading the code and from one scratch probe, `agent-scratch/sec-probe.ts`. The probe runs the real `kpi.ts` router and `requireAuth` over HTTP against a throwaway database, with two users (Alice, Bob), one admin, and one user with no name. Its output is quoted below. `tests/kpi-dashboard-server.test.ts` passes (13/13). It does not test any of the issues below.

## Issues

### SEC-01: P0, release-blocking. Anyone can sign up, and every account can read every supplier cost
- **Where:** `server/routes/auth.ts:119-185`. The only email check is `isValidEmail` at `:69-71`, a regex. No code or config restricts the email domain: a search for `ALLOWED_EMAIL*` or `EMAIL_DOMAIN` finds nothing, and no doc in the repo describes a "JLR-only" restriction. `fly.toml` deploys to the public internet (`HOST=0.0.0.0`, `force_https`). Any verified account gets everything listed under SEC-02, plus `GET /records?all=1` and `GET /records.csv` (`kpi.ts:131-153`).
- **Reproduce:** sign up with any mailbox → verify the code → open the dashboard → Export CSV. The file holds every eligible record: part numbers, programme codes, current cost (quote or PO price), its source, should-cost, gap, volume and owner names.
- **Root cause:** the policy "every signed-in user sees every record" assumes that every signed-in user is an employee. Sign-up does not enforce that.
- **Impact:** supplier prices and unreleased programme data are exposed to anyone on the internet. This is the whole commercial dataset, not one leak.
- **Fix:**
  - Add a server-side domain allowlist (for example `ALLOWED_EMAIL_DOMAINS`) checked at `/signup` AND at sign-in, AND in `requireAuth`, so existing off-domain accounts are cut off too.
  - Or make sign-up invite-only / admin-approved, or put the app behind SSO or a private network.
  - Optionally add a `kpi_viewer` role.
- **Regression risk:** low. **Business decision:** yes: who may hold an account, and whether all employees may see all supplier prices.

### SEC-02: P1 (release-blocking together with SEC-01). The record view returns another user's whole saved costing
- **Where:**
  - `kpi.ts:167-172` returns `JSON.parse(scenarios.data)` (the full `input` and `result`) to any signed-in user.
  - `publicRow` (`kpi.ts:89-102`) gives every user `currentCost`, `currentSource`, `notes`, `ownerId` and `annualVolume`.
- **Evidence:** in the probe, Bob read Alice's record and got her input exactly as saved: `"secretSupplierQuote":"Acme £9.10","targetPrice":8.5`.
  - The screen draws only the eight cost buckets and the operations (`kpi-view.ts:294-300`). The API sends everything `lastInput` and `lastResult` hold (`main.ts:1119-1129`): target price, trace, rates and any other field.
  - This also gets around the owner-only rule on scenarios: `sync.ts:66-77` lists only the caller's own scenarios.
- **Impact:** more is exposed than the screen shows, and more than anyone has reviewed.
- **Fix:** return a server-side allowlist (`result.total`, `breakdown`, operation `{name, cost}`, `commodity`, `region`). Send the full JSON only to the owner and to admins. Decide whether `currentCost` should be visible to non-owners at all, or only in aggregate.
- **Regression risk:** low. The UI reads only those fields. **Business decision:** yes.

### SEC-03: P1, release-blocking. An owner can inflate an admin-validated volume
- **Where:** `kpi.ts:286`. `ADMIN_ONLY_FIELDS` lists `volumeValidated` but not `annualVolume`, and nothing clears the validation when the volume changes.
- **Evidence:**
  1. The admin approves the record and validates its volume.
  2. Alice sends `PATCH {annualVolume: 900000000}` → 200, `volumeValidated: true`, `status: "approved"`.
  3. The annualised KPI moves from **£10,000 to £9,000,000,000**.
- **Impact:** the headline "annualised opportunity", which the docs say is admin-controlled, can be set by any record owner.
- **Fix:** when a non-admin changes `annualVolume`, reset `volumeValidated` to false (or make the field admin-only once validated). Do the same for the saving fields that depend on the money values.
- **Regression risk:** low. **Business decision:** no.

### SEC-04: P1, release-blocking. An owner can change a reviewed / approved record and it stays approved
- **Where:** `kpi.ts:297-303`. The record goes back to "completed" only when `MONEY_FIELDS` (`currentCost/Ccy/Terms`) change. Part number, programme, model year, powertrain, commodity, country, annual volume and notes can all change while the status stays "approved".
- **Evidence:**
  - The probe moved an approved record from L460 to L461 and from Casting to "Anything": still `status: "approved"`.
  - An owner can also downgrade approved → draft: `PATCH {status:'draft'}` → 200.
- **Impact:** approval no longer means the record is what the reviewer saw. An approved figure can be moved into another programme or application.
- **Fix:** any non-admin edit to a reviewed or approved record sends it back to "completed". Do not let a non-admin change an approved record's status.
- **Regression risk:** low. **Business decision:** confirm the workflow.

### SEC-05: P1. Fields the UI hides from non-admins are not admin-only on the server (isTest, commodity, country)
- **Where:** `patchSchema` (`kpi.ts:264-284`) accepts `isTest`, `commodity` and `country`. `ADMIN_ONLY_FIELDS` (`:286`) leaves them out. The file header (`:9`) and the build doc ("Admin also sets … test flag") say the test flag is admin-only. The UI shows the box only to admins (`kpi-view.ts:369-373`). The UI never sends commodity or country.
- **Evidence:** the owner's `PATCH {isTest:true}` → 200. After the admin set `isTest:true`, the owner's `PATCH {isTest:false}` → 200 with `excluded: null`. The owner undid the admin's exclusion.
- **Impact:**
  - Owners can hide a record from everyone except admins, or put back a record an admin excluded.
  - They can relabel the commodity or country so it no longer matches the linked costing.
- **Fix:** add `isTest` to `ADMIN_ONLY_FIELDS`. Make `commodity` / `country` admin-only, or remove them from the patch (they come from the costing). Add the missing tests.
- **Regression risk:** low. **Business decision:** whether commodity and country should be editable at all.

### SEC-06: P2. Any user can replace another user's approved "current" record with a figure they make up
- **Where:**
  - `statusRank` (`src/engine/kpi-dashboard.ts:188`) is draft 0, everything else 1. A newer *completed* record beats an older *approved* one (`:284-299`).
  - `POST /records` takes the should-cost from the client: `scenario.result.total` (`kpi.ts:217, 247`). The server never re-costs it.
- **Evidence:** Bob saved the same part, programme, model year and powertrain with `result.total: 0.01`. Bob's record became `role: current` and drives the KPIs. Alice's approved record became `duplicate`.
  - The guard "A CostVision should-cost … cannot be edited here" (`:304`) has no effect, because a new POST can carry any value.
- **Impact:** any account can change headline gap and opportunity figures. This goes against the "money is deterministic" invariant.
- **Fix:**
  - Rank approved > reviewed > completed > draft.
  - Stop another owner's newer record from displacing an approved current one; flag it for review instead.
  - Re-cost on the server, or store a server-signed result hash from the costing response.
- **Regression risk:** medium (the classification tests change). **Business decision:** yes.

### SEC-07: P2. No rate limit and no size caps on /api/kpi
- **Where:**
  - `index.ts:118` mounts `/api/kpi` with no limiter. `projects.ts:22` shows the pattern to copy.
  - The cache key includes the filter JSON (`kpi.ts:126`, at most 100 entries). Changing `f` misses the cache every time. Each miss is a synchronous build, which the doc measured at about 0.39 s for 50k records.
  - `records?all=1` returns up to 100,000 full rows (`:138`).
  - `POST /records` accepts any number of saves per user, each up to the 10 MB JSON limit (`index.ts:91`). `scenario.input` and `result` have no size bound (`kpi.ts:216-217`), and every write invalidates the cache.
- **Impact:** a single account can block the event loop or fill the disk.
- **Fix:**
  - Per-user limits (stricter on `all=1`, CSV, POST and import).
  - Cap `JSON.stringify(sc).length` (for example 512 KB) and the number of records per user per day.
  - Stream the CSV and page the exports.
- **Regression risk:** low. **Business decision:** no.

### SEC-08: P2. The audit trail is incomplete and the linked costing can be changed without an audit entry
- **Edits:** `record.edit` stores the patch (`kpi.ts:310`) but not the values before it. `record.save` stores only `{scenario, partNumber}` (`:255`), so the original current cost and should-cost cannot be reconstructed from the log.
- **FX:**
  - `fx.load` logs currency codes only (`:353`).
  - `upsertFxRates` overwrites the earlier rate value, source and loader (`kpi-store.ts:122-128`), so an approved rate's history is lost.
  - `fx.policy` does not log the previous policy (`:339`).
- **Import:** an import that updates records logs counts only (`:397`).
- **Linked costing:** the costing behind a frozen or approved record can be rewritten with no KPI audit entry:
  - via `POST /api/sync/scenarios` with the same id (`sync.ts:88-93`, owner only);
  - by re-POSTing `/api/kpi/records` with an existing own scenario id (`kpi.ts:236-238`, `ON CONFLICT DO UPDATE`).
- **Audit screen:** it shows `users.full_name` only. Blank in the probe for a user with no name. Not unique. It shows the last 200 rows only, with no paging or export (`:405`).
- **What is correct:** deletion is soft (`softDelete`, `deleted_at`). The recalculation keeps `fx_history` with who and when.
- **Fix:**
  - Log before and after values on edit and import, and the values on save.
  - Make `fx_rates` append-only (versioned) and log the rate values.
  - Snapshot the costing into the record at save time, or make linked scenarios immutable.
  - Show the user id or email in the audit; add paging and export.
- **Regression risk:** low. **Business decision:** retention period.

### SEC-09: P3. Personal data exposed to every user
- **Email in place of a name:** `ownerName = full_name || owner_label` (`kpi-store.ts:151`), and `owner_label` is the user's email (`kpi.ts:242`). The probe's user with no name shows as `u-noname@example.test` to everyone, in exports and in the "Created by" filter list.
  - A full name of only spaces passes sign-up (`auth.ts:128`, then `.trim()` at `:175`).
  - A deleted user's records also fall back to the email.
- **Internal ids:** `ownerId` (internal UUIDs) goes to everyone through `publicRow`. `/meta` returns `userId`.
- **Names:** display names are chosen by the user and need not be unique, so one user can appear as another engineer.
- **Fix:** never fall back to the email (use "Unknown user"). Drop `ownerId` from `publicRow` or replace it with a `mine: boolean` flag. Require a non-blank name.

### SEC-10: P3. Import uses an out-of-date xlsx parser (admin-only path)
- **Where:** `xlsx@0.18.5` (`package.json:64`; `kpi-import.ts:23`) is the last npm release and carries known advisories: CVE-2023-30533 (prototype pollution when reading a file) and CVE-2024-22363 (ReDoS).
- **Size:** about 6 MB of compressed XLSX can expand far beyond that in memory (`kpi.ts:330`).
- **Import fields:** imported text fields (`notes`, `component_name`, `owner`) have no length caps.
- **Fix:** move to SheetJS ≥ 0.20.2 from the vendor CDN tarball, or to ExcelJS. Cap the number of rows and the field lengths.

### SEC-11: P3. Admin lifecycle and a configuration trap
- **No demotion:** `promoteAdminIfListed` only ever promotes (`db.ts:218-228`). Removing an email from `ADMIN_EMAILS` does not demote it, and there is no role-management route.
- **Config trap:** with `CV_SHOW_DEV_OTP=1` on a shared server (`auth.ts:51-57`), anyone can verify any email. That includes a not-yet-registered `ADMIN_EMAILS` address, which then becomes admin.
- **Fix:** sync roles both ways from the list (or add an admin role UI with audit). Refuse `CV_SHOW_DEV_OTP` when `NODE_ENV=production`.

### SEC-12: P3. One XSS anywhere in the app would expose the whole dataset
- **Where:** the CSP allows `script-src 'unsafe-inline'` (`index.ts:66`), and the bearer token lives in localStorage or sessionStorage (`auth-fetch.ts:38-41`). One XSS anywhere in the SPA would give the attacker the dashboard data.
- **The dashboard itself is clean** (see below). There is no CSRF exposure: the app uses bearer tokens, not cookies. The inline `style=` attributes need `style-src 'unsafe-inline'`, which is acceptable.
- **Fix:** replace the inline auth guard with a hash or nonce and drop `'unsafe-inline'` from `script-src`.

## Checked and correct
- **Authentication (1):** every `/api/kpi` route sits behind `requireAuth` (`index.ts:118`). No token or a bad token → 401 `SESSION_INVALID` (probe: 401/401). `requireAuth` re-reads the user on every request (deleted users and revoked sessions are refused), and a token is issued only after OTP verification (`auth.ts:257-274, 298-315`).
- **Admin checks (2, 3):** the role is read from the database on every request (`kpi.ts:61-68`). The admin is enforced server-side on:
  - `PUT /fx/policy`, `POST /fx/rates`, `POST /fx/recalculate` (preview included);
  - `POST /import`, `GET /audit`;
  - `scope=excluded` on both `/records` and `/records.csv`.
  
  The UI hides these for non-admins (`kpi-view.ts:242`, the admin dialog), and the server refuses them as well.
- **Owner checks on writes:** PATCH and DELETE need owner or admin (`:293, :319`). Non-admins cannot set `reviewed` / `approved`, `volumeValidated` or `savingStatus/PerPiece/Ccy`. Imported records belong to `import:…` ids that no user holds, so only an admin can edit them.
- **Excluded records stay hidden:** not in `scope=all`, `drill`, `filterOptions`, insights or the KPIs (counts only). The detail view shows them only to the owner or an admin, and revisions drop them for non-admins. `fxHistory` goes to the owner or an admin only.
- **Summary cache:** it is shared across users but holds nothing role-specific.
- **Scenario ownership:** you cannot attach someone else's scenario (`kpi.ts:233-234`, 409).
- **Input validation:** zod with `.strict()` and length limits on save and patch. ISO 4217 codes. The `f` filter is capped at 20k characters and parsed into a whitelist (`parseFilters`: 200 values × 120 characters). `parseRecordQuery` whitelists sort and scope, and caps page size at 200. `fileBase64` is capped at 8 MB.
- **SQL and file paths:** every SQL statement is parameterised. Sort is applied in memory against a whitelist. There are no file-system paths, so no path traversal.
- **XSS:** every user, file or tool string passes through `esc` (`kpi-builders.ts:12-13`): records, chips, the multi-select, drill, insights, the drawer, the admin and audit tables, the costing operations and the heatmap. Status and ids used in attributes are escaped or come from a whitelist.
- **Deep link:** `recordIdFromHash` allows only `[\w-]{1,80}` and calls `encodeURIComponent` before the fetch.
- **Exports:** the CSV escapes cells that start with `= + - @ \t \r` (`kpi-dashboard.ts:934-939`). ExcelJS writes text as text; only the reconciliation cells are formulas, and the code builds them.
- **Deletion:** delete is soft and audited. Errors return generic messages; details go to the server log.
- **Rule copy:** the copy of the rule written in `quotes.ts` is now owner-scoped.
