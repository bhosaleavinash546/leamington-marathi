# Hand working — /tmp/cv-phase2-recon-TaqWvm/should-cost.db (tie on created_at)

## 1. Frozen FX check (GBP value = original × frozen GBP-per-unit rate)

| Part | Current (orig) | Rate | GBP current | Should (orig) | Rate | GBP should | OK |
|---|---|---|---|---|---|---|---|
| REC-GBP-01 (rc-r1) | 12.0 GBP | 1.000000 | 12.0 | 10.0 GBP | 1.000000 | 10.0 | ✓ |
| REC-REV-04 (RC-REV-1) | 60.0 GBP | 1.000000 | 60.0 | 50.0 GBP | 1.000000 | 50.0 | ✓ |
| REC-MIX-03 (RC-MIX) | 40.0 USD | 0.763359 | 30.534351145038165 | 30.0 GBP | 1.000000 | 30.0 | ✓ |
| REC-EUR-02 (RC-EUR) | 25.0 EUR | 0.840336 | 21.008403361344538 | 20.0 EUR | 0.840336 | 16.80672268907563 | ✓ |
| REC-REV-04 (RC-REV-2) | 60.0 GBP | 1.000000 | 60.0 | 52.0 GBP | 1.000000 | 52.0 | ✓ |
| REC-REV-04 (RC-REV-3) | 60.0 GBP | 1.000000 | 60.0 | 55.0 GBP | 1.000000 | 55.0 | ✓ |
| REC-TIE-07 (rc-r7) | 20.0 GBP | 1.000000 | 20.0 | 15.0 GBP | 1.000000 | 15.0 | ✓ |
| REC-TIE-07 (rc-r8) | 20.0 GBP | 1.000000 | 20.0 | 17.0 GBP | 1.000000 | 17.0 | ✓ |
| REC-VOL-09 (rc-r9) | 12.0 GBP | 1.000000 | 12.0 | 10.0 GBP | 1.000000 | 10.0 | ✓ |
| REC-TST-10 (rc-r10) | 50.0 GBP | 1.000000 | 50.0 | 40.0 GBP | 1.000000 | 40.0 | ✓ |
| REC-COM-11 (rc-r11) | 33.0 GBP | 1.000000 | 33.0 | 30.0 GBP | 1.000000 | 30.0 | ✓ |
| REC-PN-12B (rc-r12) | 9.0 GBP | 1.000000 | 9.0 | 8.0 GBP | 1.000000 | 8.0 | ✓ |
| REC-DRF-13 (rc-r13) | 6.0 GBP | 1.000000 | 6.0 | 5.0 GBP | 1.000000 | 5.0 | ✓ |
| REC-RND-15 (rc-r15) | 14.0 GBP | 1.000000 | 14.0 | 13.04 GBP | 1.000000 | 13.04 | ✓ |
| REC-NEG-16 (rc-r16) | 18.0 GBP | 1.000000 | 18.0 | 20.0 GBP | 1.000000 | 20.0 | ✓ |
| LR_REC_200 (RC-V4) | 6.0 GBP | 1.000000 | 6.0 | 5.0 GBP | 1.000000 | 5.0 | ✓ |
| LRREC200 (RC-V3) | 6.0 GBP | 1.000000 | 6.0 | 5.0 GBP | 1.000000 | 5.0 | ✓ |
| lr-rec-200 (RC-V2) | 6.0 GBP | 1.000000 | 6.0 | 5.0 GBP | 1.000000 | 5.0 | ✓ |
| LR-REC-200 (RC-V1) | 6.0 GBP | 1.000000 | 6.0 | 5.0 GBP | 1.000000 | 5.0 | ✓ |
| REC-CASE-18 (rc-r18a) | 9.0 GBP | 1.000000 | 9.0 | 7.0 GBP | 1.000000 | 7.0 | ✓ |
| REC-CASE-18 (rc-r18b) | 9.0 GBP | 1.000000 | 9.0 | 7.0 GBP | 1.000000 | 7.0 | ✓ |

All GBP values = original × frozen rate: **True**

## 2. Exclusions


Included records: 21 of 21

## 3. Applications and the current record (tie-break on `created_at`)

| Application key | Records (status, costing date, created, updated) | Current |
|---|---|---|
| `REC-GBP-01|L460|2027|BEV` | rc-r1 completed 2026-11-17 c=22:51:49.623 u=22:51:49.651 | **rc-r1** |
| `REC-REV-04|L663|2026|Petrol` | RC-REV-3 completed 2026-11-10 c=22:51:49.661 u=22:51:49.661<br>RC-REV-2 completed 2026-10-10 c=22:51:49.661 u=22:51:49.661<br>RC-REV-1 approved 2026-09-10 c=22:51:49.661 u=22:51:49.661 | **RC-REV-3** |
| `REC-MIX-03|L461|2027|BEV` | RC-MIX completed 2026-10-20 c=22:51:49.661 u=22:51:49.661 | **RC-MIX** |
| `REC-EUR-02|L460|2027|BEV` | RC-EUR completed 2026-10-15 c=22:51:49.661 u=22:51:49.661 | **RC-EUR** |
| `REC-TIE-07|L460|2028|MHEV` | rc-r8 completed 2026-11-17 c=22:51:49.707 u=22:51:49.707<br>rc-r7 completed 2026-11-17 c=22:51:49.669 u=22:51:49.744 | **rc-r8** |
| `REC-VOL-09|L461|2027|BEV` | rc-r9 completed 2026-11-17 c=22:51:49.754 u=22:51:49.773 | **rc-r9** |
| `REC-TST-10|EMA|2028|BEV` | rc-r10 approved 2026-11-17 c=22:51:49.779 u=22:51:49.790 | **rc-r10** |
| `REC-COM-11|JEA|2028|BEV` | rc-r11 approved 2026-11-17 c=22:51:49.799 u=22:51:49.808 | **rc-r11** |
| `REC-PN-12B|L460|2027|Petrol PHEV` | rc-r12 completed 2026-11-17 c=22:51:49.825 u=22:51:49.846 | **rc-r12** |
| `REC-DRF-13|L663|2027|BEV` | rc-r13 approved 2026-11-17 c=22:51:49.852 u=22:51:49.860 | **rc-r13** |
| `REC-RND-15|L461|2028|MHEV` | rc-r15 completed 2026-11-17 c=22:51:49.871 u=22:51:49.871 | **rc-r15** |
| `REC-NEG-16|L663|2028|Petrol` | rc-r16 completed 2026-11-17 c=22:51:49.881 u=22:51:49.881 | **rc-r16** |
| `LR_REC_200|L460|2027|BEV` | RC-V4 completed 2026-10-04 c=22:51:49.890 u=22:51:49.890 | **RC-V4** |
| `LRREC200|L460|2027|BEV` | RC-V3 completed 2026-10-03 c=22:51:49.890 u=22:51:49.890 | **RC-V3** |
| `LR-REC-200|L460|2027|BEV` | RC-V2 completed 2026-10-02 c=22:51:49.890 u=22:51:49.890<br>RC-V1 completed 2026-10-01 c=22:51:49.890 u=22:51:49.890 | **RC-V2** |
| `REC-CASE-18|Q901|2028|BEV` | rc-r18a completed 2026-11-17 c=22:51:49.897 u=22:51:49.897 | **rc-r18a** |
| `REC-CASE-18|q901|2028|BEV` | rc-r18b completed 2026-11-17 c=22:51:49.905 u=22:51:49.905 | **rc-r18b** |

Current records: 17; included records: 21

## 4. Eligible current records and their gaps

| Current record | Part | GBP current | GBP should | Terms | Gap (cur − should) | Opportunity | Unfavourable | Vol validated | Annual vol | Annualised (gap × vol) | Saving |
|---|---|---|---|---|---|---|---|---|---|---|---|
| RC-V3 | LRREC200 | 6.000000 | 5.000000 | DAP | 1.000000 | 1.000000 |  | no | — |  |  |
| RC-V4 | LR_REC_200 | 6.000000 | 5.000000 | DAP | 1.000000 | 1.000000 |  | no | — |  |  |
| rc-r18a | REC-CASE-18 | 9.000000 | 7.000000 | DAP | 2.000000 | 2.000000 |  | no | — |  |  |
| rc-r18b | REC-CASE-18 | 9.000000 | 7.000000 | DAP | 2.000000 | 2.000000 |  | no | — |  |  |
| rc-r11 | REC-COM-11 | 33.000000 | 30.000000 | DAP | 3.000000 | 3.000000 |  | no | — |  |  |
| rc-r13 | REC-DRF-13 | 6.000000 | 5.000000 | DAP | 1.000000 | 1.000000 |  | no | — |  |  |
| RC-EUR | REC-EUR-02 | 21.008403 | 16.806723 | DAP | 4.201681 | 4.201681 |  | no | — |  |  |
| rc-r1 | REC-GBP-01 | 12.000000 | 10.000000 | DAP | 2.000000 | 2.000000 |  | yes | 10000 | 2.000000 × 10,000 = 20,000.00 | validated 0.5 |
| RC-MIX | REC-MIX-03 | 30.534351 | 30.000000 | DAP | 0.534351 | 0.534351 |  | no | — |  |  |
| rc-r16 | REC-NEG-16 | 18.000000 | 20.000000 | DAP | -2.000000 |  | -2.000000 | no | — |  |  |
| rc-r12 | REC-PN-12B | 9.000000 | 8.000000 | DAP | 1.000000 | 1.000000 |  | no | — |  |  |
| RC-REV-3 | REC-REV-04 | 60.000000 | 55.000000 | DAP | 5.000000 | 5.000000 |  | no | — |  |  |
| rc-r15 | REC-RND-15 | 14.000000 | 13.040000 | DAP | 0.960000 | 0.960000 |  | no | — |  |  |
| rc-r8 | REC-TIE-07 | 20.000000 | 17.000000 | DAP | 3.000000 | 3.000000 |  | no | — |  |  |
| rc-r10 | REC-TST-10 | 50.000000 | 40.000000 | DAP | 10.000000 | 10.000000 |  | no | — |  |  |
| rc-r9 | REC-VOL-09 | 12.000000 | 10.000000 | DAP | 2.000000 | 2.000000 |  | no | 600000 |  |  |
| RC-V2 | lr-rec-200 | 6.000000 | 5.000000 | DAP | 1.000000 | 1.000000 |  | no | — |  |  |

## 5. Totals

- Eligible current records: **17**
- Σ GBP current = **321.542755**; Σ GBP should = **283.846723**; Σ gap = **37.696032**
- Weighted gap = 37.696032 ÷ 321.542755 × 100 = **11.7235 %** (positive: current above should-cost)
- Opportunity = Σ positive gaps = **£39.696032** over 16 records; unfavourable = Σ negative gaps = **£-2.000000** over 1 (not netted)
- Annualised = **£20,000.00** over 1 validated volume(s)
- Validated savings = **£0.50** (1); implemented = **£0.00** (0)
- Current records by status: {'completed': 14, 'approved': 3} → completed costings (non-draft) 17, awaiting review 14, awaiting approval 0
- Current records by commodity: {'Casting': 15, 'Machining': 1, 'Forging': 1}
- Records: 21 included (17 current), 0 excluded
