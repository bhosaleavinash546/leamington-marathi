# Leamington Marathi Event Finance

A static finance interface at `/finance/`, with Supabase Auth + Postgres for private records and a Supabase Edge Function for Google Drive invoices. No production finance data, user list, passwords, Google secrets or service-role keys belong in this public GitHub repository.

## Status

Implementation is prepared; live Supabase and Drive configuration is required before committee use. `config.js` intentionally has empty public configuration, so sign-in is disabled until setup is complete. No pretend password gate or local-only ledger is used. The dashboard's design QA uses fictional data in a separate temporary preview outside this repository; no demo accounts or example financial records ship here.

## What the first version supports

- Multiple events, GBP amounts stored as integer pence, and category budgets.
- Expenses: date, category, amount, supplier, description, invoice reference, payment method, notes and optional invoice (PDF/JPEG/PNG/WebP, 10 MB maximum).
- Income: tickets, sponsorship, stall fees, donations and other income; distinguish expected money from received money.
- Pending → approved/rejected → paid workflow. Another administrator/treasurer approves a person's own claim. Paid records are immutable through the app.
- Separate received income, approved/paid expense commitments, pending claims, cash balance, payables and expected income.
- Budget comparisons, category doughnut, income source bars and monthly cash movement.
- Search/filter ledger, invoice downloads through an authenticated handler, CSV export with spreadsheet-formula protection, and an audit log.
- Roles: administrator/treasurer manage finances; contributor submits expense claims; viewer is read-only. All approved users can read all event records and invoices. If access needs to be restricted by event, add event-specific membership before deployment.

Ticket income is entered manually, including a quantity in notes if useful. This version does not connect to a ticketing provider, reconcile a bank feed, make actual bank payments, scan invoices with OCR, issue tax advice, support multi-currency, or implement refunds/amendments. Correct a pending claim by rejecting and submitting a new one; do not reuse the app for negative-value adjustments until a proper correction workflow is added.

## 1. Choose the private backend

Use a **dedicated Supabase project for Leamington Marathi finance**, preferably in a UK region where available. Do not reuse another app's project without first checking its data and security configuration. The existing public member page uses an unconfigured Firebase scaffold; this finance feature is independent of that scaffold.

In Supabase Authentication:

1. Enable email/password sign-in.
2. Disable public sign-up. Only the administrator creates/invites accounts.
3. Set the site URL and permitted email redirects to `https://leamingtonmarathi.com/finance/`.
4. Configure a production email sender and password policy before real invitations; test delivery. Set passwords to at least 12 characters and enable supported breach protections.
5. Run `backend/schema.sql` once as the project owner in the SQL editor. This enables row-level security on every finance table, restricts grants and installs guarded review/audit functions.
6. Create/invite the approved accounts in Authentication. Do not email passwords or commit them here. The invitation/recovery landing form lets each person set their own password.
7. Add membership using the authentication user's UUID. Use a statement like this in the private SQL editor, replacing the values:

```sql
insert into public.finance_members(user_id, role)
select id, 'admin' from auth.users where lower(email)=lower('APPROVED_ADMIN_EMAIL');
```

Assign `treasurer`, `contributor` or `viewer` to other approved accounts. At least two administrators/treasurers are needed if both submit their own expense claims, because self-approval is rejected by the database. Membership cannot be changed by the website. To revoke access:

```sql
update public.finance_members set active=false
where user_id=(select id from auth.users where lower(email)=lower('EMAIL_TO_REVOKE'));
```

API reads and writes are denied immediately by membership checks even while an old sign-in token remains valid. An open page may contain previously downloaded data; the app clears its view after its next access check (at most one minute while active). Revocation cannot erase an export someone previously downloaded.

## 2. Connect the specified Google Drive folder

The folder URL alone is not an upload credential. Its owner must authorize the app. Keep the folder private, with no `Anyone with the link` permission, and review its existing inherited permissions. This app never creates public sharing links or modifies Drive permissions.

Recommended approach: a Google OAuth web client owned by Leamington Marathi, with the Drive API enabled, using `drive.file` and offline access. The **chosen existing folder must be explicitly selected with Google Picker under that same OAuth client** (with `drive.file`) so the application has permission to use it. A folder link by itself does not grant `drive.file` access. Alternatively, let the application create a new folder and use that folder's ID. Do not silently switch to whole-Drive access to get past a permission error.

Complete OAuth consent and obtain the refresh token server-side through a trusted setup tool. Put the resulting client secret and refresh token directly into Supabase Edge Function secrets, never into chat, GitHub, a frontend configuration file or screenshots. An OAuth app left in Google's external Testing mode can have short-lived refresh-token eligibility; complete the appropriate production consent setup and any required verification before relying on the connection for ongoing events.

Set these Edge Function secrets:

| Name | Meaning |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Authorized web OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | Offline refresh token for the finance folder owner |
| `GOOGLE_DRIVE_FOLDER_ID` | The chosen private folder's exact ID |
| `FINANCE_ORIGIN` | `https://leamingtonmarathi.com` |

Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` inside the function. Check these exist in your project. Only the function uses the service-role key. Uploads are named with event/date/UUID/original filename within the one configured folder. Files from all events stay in that folder; transactions retain the event association.

This application is not a Google Drive connector installation and does not need access to every guest's or committee member's Drive. Only the backend's finance-folder connection is used for uploads. Read requests are proxied after verifying the logged-in user's active membership.

## 3. Deploy the handler and connect the frontend

Use a Supabase CLI project. Copy `backend/functions/finance-invoices/` into `supabase/functions/finance-invoices/` and merge the function block from `backend/config.toml` into `supabase/config.toml`. Deploy the `finance-invoices` function. Keep gateway JWT verification enabled; the handler also verifies tokens with `auth.getUser` and checks active membership independently. Test against the actual project's signing-key configuration before rollout; investigate any gateway 401 rather than weakening checks.

Set only the following **public** values in `finance/config.js`:

- `supabaseUrl`: the project's HTTPS URL.
- `supabaseAnonKey`: the browser anon key (not service-role or secret key).

No public website navigation is changed by this branch. After merge, GitHub Pages serves `/finance/`; anyone can fetch the login page or public source, but financial records and invoices are returned only to approved signed-in accounts. The access restriction is enforced by the database and handler, not by hiding a URL. If the login page itself must also be inaccessible, an additional hosting-level access gateway is needed.

Update the community privacy notice with the actual finance data practices, approved-user access, retention period, Supabase and Google processing, and support contact before collecting real receipts. Agree a retention/export/backup process with the committee; the code does not invent a retention policy or automatically delete records.

## 4. Acceptance checks before live use

Use synthetic test receipts and a non-production event first:

1. Unauthenticated and unapproved users cannot read any finance table or download an invoice through the function.
2. A viewer can read but cannot submit, approve, edit budgets or create events.
3. A contributor submits an expense with a real test PDF. Confirm the record and file appear once in the selected private Drive folder.
4. A contributor cannot call the API directly to record income, change status, spoof a submitter or grant themselves a role.
5. A different treasurer approves the claim, downloads the invoice and records a payment with a reference. Self-approval and invalid transitions fail.
6. Revoking a user stops reads/uploads/downloads, including calls using an already-issued token.
7. Verify budget vs actual, cash balance, outstanding amounts and CSV against an independently calculated example. Test an event with more than 1,000 records; the UI paginates the API.
8. Confirm invitations, password resets and sign-out on the actual domain, on a phone and desktop.
9. Revoke Drive access or cause a test upload failure: no success message should appear. Check both Drive and the ledger before retrying after network timeouts.
10. Confirm that no public Drive permission exists and that a copied invoice endpoint URL without authorization fails.

Upload compensation trashes an unlinked file and removes a partial transaction if linking fails. Google Drive and Postgres cannot share one transaction: timeouts or termination can leave a file requiring administrator reconciliation. Error responses never claim success in that case. Review function logs and the finance folder after partial failures. At this stage there is no durable upload queue or automatic orphan reconciler.

## Verification performed in development

- `node --test finance/backend/tests/domain.test.mjs` checks money, aggregates, export escaping, role gates and invoice signatures.
- `database.test.mjs` executes the migration and permission tests in a real local PostgreSQL engine (PGlite) with minimal Supabase auth-role stubs. This validates PostgreSQL RLS/function behavior, but does not replace testing the hosted Supabase Auth/gateway environment.
- Desktop and 390px mobile dashboard layouts and transaction category controls are checked in a separate browser preview with explicitly labelled fictional data.
- Google OAuth, real Drive uploads, email delivery and hosted Supabase deployment need the owner's configuration and are not claimed as tested.
