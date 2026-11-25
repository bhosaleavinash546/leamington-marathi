# KPI dashboard — decisions applied (25 Nov 2026)

Decisions taken on the open items of the Phase 2 report (`phase2-implementation-report.md` §F).

| Decision | Choice | What changed | Tests |
|---|---|---|---|
| **D-8** (A-01) access policy | Domain allowlist, set in config | Sign-up is refused (403) unless the address's domain is in `CV_SIGNUP_DOMAINS` (comma-separated, settings file) or the address is in `ADMIN_EMAILS`. The first account on an empty database may register from the same machine (a fresh laptop install). Checked before any account lookup. Existing accounts are not affected. The Windows launcher writes both settings, commented. `server/utils/signup-policy.ts`, `server/routes/auth.ts` | `kpi-dashboard-decisions-2026-11.test.ts`, `review-360.test.ts` |
| **A-11** identity | Option 2 — part number only | `normalisePartNumber` folds case, spaces, `-`, `_`, `.`, `/` (LR-VAR-100 = LRVAR100 = LR_VAR_100). Programmes are not folded; a new data-quality row "Programme spelling variants" counts current records of one part / model year / powertrain whose programme codes differ only in case or punctuation (Q900 / q900) — screen and Excel. Drill labels keep the part number as typed. `scripts/kpi-identity-dry-run.ts` now shows what option 1 (folding the programme too) would add | `kpi-p2-a11-identity-fold.test.ts`, `kpi-dashboard.test.ts`, `kpi-dashboard-decisions-2026-11.test.ts` |
| **D-4** (A-05) approved records | Owner may, with a reason | An owner may withdraw a reviewed / approved costing to Completed or Draft, or delete it, only with a reason of at least 5 characters; the audit log records it (`record.withdraw` {from, to, reason}; `record.delete` {status, reason}). The reason is not stored on the record. A reason never lets an owner raise a status. The edit form shows the reason field to the owner of a reviewed / approved costing | `kpi-p2-a05-owner-powers.test.ts` |

Note on A-11: a saved filter or link that names a component by its old key (e.g. `P-200`) now needs the folded key (`P200`).

Still blocked by a blank decision: D-1, D-2, D-3 (A-06 ranking), D-5, D-6, D-7, D-9, D-10 (A-03 validator fields, A-04 rate-book
stamp, N-10), N-11, the A-04 performance acceptance, E-2 (leftover test files), E-4 (load test), A-25 (admin demotion).
