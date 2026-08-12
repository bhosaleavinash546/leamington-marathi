# CAD-to-Cost live audit — 12 Aug 2026

Real STEP parts through all three arms of the pipeline (browser UI via
Playwright, `/api/cad/analyze` in `mode=both`, headless `cost-from-cad.ts`),
with independent OCCT ground truth and every money cell recomputed by hand.
Run basis: 200,000/yr, China, 5-year programme.

- `FINDINGS.md` — the full report: findings, provenance map, fixes, before/after
- `parts/` — the parts (two large uploads gitignored; re-upload to reproduce)
- `truth/` — independent cadquery measurements (`scripts/cad-audit-truth.py`)
- `runs/` / `runs-after/` — raw captures before / after the fixes
- `reports/` / `reports-after/` — the AI-analysis PDFs rendered by the REAL
  product renderer, headless; `armA-*.pdf` in runs/ are the browser's own exports
- `verify-findings.json` — machine-check results (`scripts/cad-audit-verify.ts`)

Harness scripts live in `calculator/scripts/cad-audit-*.{ts,py}`; regression
tests in `calculator/tests/cad-live-audit-fixes.test.ts`.
