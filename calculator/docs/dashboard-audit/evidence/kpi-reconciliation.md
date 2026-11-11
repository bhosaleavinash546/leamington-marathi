# Hand reconciliation — three KPIs against the saved records (after the fixes)

Source: `GET /api/kpi/records?scope=all&all=1` and `/summary` (all time) captured by `e2e/kpi-dashboard-audit.ts` in `after-metrics.json`. The working below re-does each figure from the ORIGINAL values and the FROZEN FX rate on each record, in this script, without calling the dashboard code.

## Records

| Part | Role | Current (orig) | FX | GBP current | Should (orig) | FX | GBP should | Terms | Eligible |
|---|---|---|---|---|---|---|---|---|---|
| LR-BKT-410 | current | None  | None |  | 6.1 GBP | 1 |  | None/DAP | no |
| LR-BRK-001 | current | 14.2 EUR | 0.8403361344537815 | 11.932773 | 14.809092817902815 GBP | 1 | 14.809093 | DAP/DAP | yes |
| LR-HSG-220 | current | 420 CNY | 0.10582010582010583 |  | 41 GBP | 1 |  | EXW/DAP | no |
| LR-KNK-100 | current | 31.5 GBP | 1 | 31.5 | 27.1 GBP | 1 | 27.1 | DAP/DAP | yes |
| LR-KNK-100 | duplicate | 31.5 GBP | 1 |  | 25.9 GBP | 1 |  | DAP/DAP | no |
| LR-KNK-100 | superseded | 31.5 GBP | 1 |  | 26.4 GBP | 1 |  | DAP/DAP | no |
| LR-PCB-500 | current | 1690 INR | 0.008992805755395683 | 15.197842 | 1450 INR | 0.008992805755395683 | 13.039568 | DAP/DAP | yes |
| LR-SEAL-9 | current | 2.6 EUR | 0.8403361344537815 | 2.184874 | 2.1 EUR | 0.8403361344537815 | 1.764706 | DAP/DAP | yes |
| LR-SHF-310 | current | 18.4 USD | 0.7633587786259541 | 14.045802 | 15.2 GBP | 1 | 15.2 | DAP/DAP | yes |

## KPI 1 — Potential unit cost opportunity
Σ of (GBP current − GBP should) where positive: 4.400000 (LR-KNK-100) + 2.158273 (LR-PCB-500) + 0.420168 (LR-SEAL-9) = **6.978441** over 3 records.
Dashboard: **6.978441** over 3 records → MATCH.

## KPI 2 — Weighted cost gap %
Σ GBP current = 74.861290; Σ GBP should = 71.913367; Σ gap = 2.947923; gap ÷ current × 100 = **3.937847 %** over 5 eligible records.
Dashboard: **3.937847 %** over 5 → MATCH.

## KPI 3 — Unfavourable gaps
Σ of (GBP current − GBP should) where negative: -2.876320 (LR-BRK-001) + -1.154198 (LR-SHF-310) = **-4.030518** over 2 records.
Dashboard: **-4.030518** over 2 → MATCH.

## Also
Unique components: distinct part numbers among current records = 7; dashboard 7.
Annualised: the one record with an admin-validated volume (LR-KNK-100, current): gap × 60,000; dashboard 264000.00 over 1.
Records: 9 saves, 7 current; dashboard 9 / 7.
