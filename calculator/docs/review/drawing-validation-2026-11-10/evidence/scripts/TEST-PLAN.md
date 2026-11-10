# Independent validation — offline 2D drawing + 3D CAD should-costing (test plan, 10 Nov 2026)

Priority order: what could put a wrong number in front of the Cost Engineering Director comes first.

| # | Area | Method | Evidence kept | Priority |
|---|---|---|---|---|
| P1 | Requirements compliance | Independent code read against the original brief; every requirement Pass / Fail / Partial / Not tested with file:line | audit/compliance.json, audit/findings.json | 1 |
| P2 | CAD-only regression | Same parts, same answers, current build v the commit before integration (36f6f7d3), to the penny; real-parts baseline | reliability/results.json | 1 |
| P3 | Data leaving the machine | Runtime with sockets blocked; imports; AI path behaviour when AI mode is on | audit, tests | 1 |
| P4 | Genuine dataset | Public CAD + drawing pairs of the same part and revision (NIST MBE PMI first; open hardware; manufacturer docs), licence recorded; generated fixtures NOT counted as evidence | dataset/register.json | 1 |
| P5 | Extraction accuracy | Truth typed by a reviewer from rendered drawing images WITHOUT running the reader; then reader output scored: completeness, exact match, numeric, fabricated, missed, wrong association, corrections needed | truth/, runs/ | 1 |
| P6 | Reconciliation | Matching / conflicting / missing / unit / material / revision mismatch / wrong pairing — deliberately altered inputs | runs/ | 2 |
| P7 | Costing comparison | CAD-only v CAD + confirmed drawing, same country, volume, life, rate book, date; every moved driver explained. No recorded real prices exist (scripts/actuals/cad-actuals-input.csv has no values), so results are INDICATIVE, not validated | runs/ | 2 |
| P8 | Reliability / negative | Corrupt, empty, unsupported, large, rotated, skewed, low-res, multi-page, concurrent, interrupted; time and memory | reliability/ | 2 |
| P9 | Exports | Every PDF page rendered and read; every worksheet range read; LibreOffice recalc; screen = PDF = Excel | exports/ | 2 |
| P10 | Defects | Register with root cause and severity; fix only safe, contained defects; retest + CAD-only regression | deliverables/ | 3 |

Deliverables: validation report (PDF) and validation workbook (Excel), populated from the evidence files only.
