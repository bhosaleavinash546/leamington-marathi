# Independent validation — offline 2D drawing reader + 3D CAD should-costing (10 Nov 2026)

**Readiness: suitable for controlled internal testing.** Safe and traceable (no drawing leaves the machine, nothing
unconfirmed reaches a cost, CAD-only costing unchanged, exports agree to the penny); not yet an accurate reader (30 % of
what genuine public drawings state is read, 58 % on CAD-exported PDFs with selectable text); cost accuracy is NOT
validated — no real price exists for any tested part.

| File | What it is |
|---|---|
| `Independent-Technical-Validation-Report.pdf` | the report: summary, method, compliance, coverage, extraction, reconciliation, A v C costing, accuracy, exports, regression, defects, readiness, the nine questions |
| `Validation-Workbook.xlsx` | the same evidence as data: dashboard, requirements, test register, extraction (per drawing × group), reconciliation, costing A v C (8 buckets), independent validation, export audit, functional & regression, CAD-only regression, defect register |
| `evidence/truth/` | 44 truth files written from rendered drawing images by reviewers who never ran the reader (format: `scripts/drawings/accuracy-lib.ts`) |
| `evidence/dataset/` | the 29 public sources with licence and match evidence (`register.json`) and the sources not used and why (`not-used.json`) |
| `evidence/audit/`, `evidence/reliability/`, `evidence/measurement/` | code audit (63 requirements, 19 findings), reliability / export run (110 cases), measurement before and after the fixes (`*-final.json`) |
| `evidence/defect-register.json`, `evidence/facts.json` | 52 defects with status, fix commit and proof; the report's conclusions |
| `evidence/scripts/` | the deliverable generator (it reads the evidence files from the session's validation folder) and the test plan |

The drawings and CAD files themselves are NOT committed (licences vary: public domain, CC BY-SA 4.0, BSD-3, GPL-3.0);
`evidence/dataset/register.json` gives each source URL to fetch them again.

Fixes made during the validation: commits 59b0aa70, 2a4b54c2 and 90022108 (dist e72adf46, e8328c23, 1166766a).
