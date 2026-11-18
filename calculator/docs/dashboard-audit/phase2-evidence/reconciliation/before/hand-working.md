# Hand working — /tmp/cv-phase2-recon-GzTvzD/should-cost.db (tie on updated_at)

## 1. Frozen FX check (GBP value = original × frozen GBP-per-unit rate)

| Part | Current (orig) | Rate | GBP current | Should (orig) | Rate | GBP should | OK |
|---|---|---|---|---|---|---|---|
| REC-GBP-01 (rc-r1) | 12.0 GBP | 1.000000 | 12.0 | 10.0 GBP | 1.000000 | 10.0 | ✓ |
| REC-REV-04 (RC-REV-2) | 60.0 GBP | 1.000000 | 60.0 | 52.0 GBP | 1.000000 | 52.0 | ✓ |
| REC-EUR-02 (RC-EUR) | 25.0 EUR | 0.840336 | 21.008403361344538 | 20.0 EUR | 0.840336 | 16.80672268907563 | ✓ |
| REC-MIX-03 (RC-MIX) | 40.0 USD | 0.763359 | 30.534351145038165 | 30.0 GBP | 1.000000 | 30.0 | ✓ |
| REC-REV-04 (RC-REV-1) | 60.0 GBP | 1.000000 | 60.0 | 50.0 GBP | 1.000000 | 50.0 | ✓ |
| REC-REV-04 (RC-REV-3) | 60.0 GBP | 1.000000 | 60.0 | 55.0 GBP | 1.000000 | 55.0 | ✓ |
| REC-TIE-07 (rc-r7) | 20.0 GBP | 1.000000 | 20.0 | 15.0 GBP | 1.000000 | 15.0 | ✓ |
| REC-TIE-07 (rc-r8) | 20.0 GBP | 1.000000 | 20.0 | 17.0 GBP | 1.000000 | 17.0 | ✓ |
| REC-VOL-09 (rc-r9) | 12.0 GBP | 1.000000 | 12.0 | 10.0 GBP | 1.000000 | 10.0 | ✓ |
| REC-TST-10 (rc-r10) | 50.0 GBP | 1.000000 | 50.0 | 40.0 GBP | 1.000000 | 40.0 | ✓ |
| REC-COM-11 (rc-r11) | 33.0 GBP | 1.000000 | 33.0 | 30.0 GBP | 1.000000 | 30.0 | ✓ |
| REC-PN-12B (rc-r12) | 9.0 GBP | 1.000000 | 9.0 | 8.0 GBP | 1.000000 | 8.0 | ✓ |
| REC-DRF-13 (rc-r13) | 6.0 GBP | 1.000000 | 6.0 | 5.0 GBP | 1.000000 | 5.0 | ✓ |
| REC-FAKE-14 (rc-r14) | 12.0 GBP | 1.000000 | 12.0 | 0.01 GBP | 1.000000 | 0.01 | ✓ |
| REC-RND-15 (rc-r15) | 14.0 GBP | 1.000000 | 14.0 | 13.04 GBP | 1.000000 | 13.04 | ✓ |
| REC-NEG-16 (rc-r16) | 18.0 GBP | 1.000000 | 18.0 | 20.0 GBP | 1.000000 | 20.0 | ✓ |
| LR_REC_200 (RC-V4) | 6.0 GBP | 1.000000 | 6.0 | 5.0 GBP | 1.000000 | 5.0 | ✓ |
| lr-rec-200 (RC-V2) | 6.0 GBP | 1.000000 | 6.0 | 5.0 GBP | 1.000000 | 5.0 | ✓ |
| LRREC200 (RC-V3) | 6.0 GBP | 1.000000 | 6.0 | 5.0 GBP | 1.000000 | 5.0 | ✓ |
| LR-REC-200 (RC-V1) | 6.0 GBP | 1.000000 | 6.0 | 5.0 GBP | 1.000000 | 5.0 | ✓ |
| REC-CASE-18 (rc-r18a) | 9.0 GBP | 1.000000 | 9.0 | 7.0 GBP | 1.000000 | 7.0 | ✓ |
| REC-CASE-18 (rc-r18b) | 9.0 GBP | 1.000000 | 9.0 | 7.0 GBP | 1.000000 | 7.0 | ✓ |

All GBP values = original × frozen rate: **True**

## 2. Exclusions

- REC-TST-10 (rc-r10): excluded (test)

Included records: 21 of 22

## 3. Applications and the current record (tie-break on `updated_at`)

| Application key | Records (status, costing date, created, updated) | Current |
|---|---|---|
| `REC-GBP-01|L460|2027|BEV` | rc-r1 completed 2026-11-17 c=22:46:52.613 u=22:46:52.725 | **rc-r1** |
| `REC-REV-04|L663|2026|Petrol` | RC-REV-3 completed 2026-11-10 c=22:46:52.752 u=22:46:52.752<br>RC-REV-2 completed 2026-10-10 c=22:46:52.752 u=22:46:52.752<br>RC-REV-1 approved 2026-09-10 c=22:46:52.752 u=22:46:52.752 | **RC-REV-3** |
| `REC-EUR-02|L460|2027|BEV` | RC-EUR completed 2026-10-15 c=22:46:52.752 u=22:46:52.752 | **RC-EUR** |
| `REC-MIX-03|L461|2027|BEV` | RC-MIX completed 2026-10-20 c=22:46:52.752 u=22:46:52.752 | **RC-MIX** |
| `REC-TIE-07|L460|2028|MHEV` | rc-r7 completed 2026-11-17 c=22:46:52.782 u=22:46:52.936<br>rc-r8 completed 2026-11-17 c=22:46:52.845 u=22:46:52.845 | **rc-r7** |
| `REC-VOL-09|L461|2027|BEV` | rc-r9 approved 2026-11-17 c=22:46:52.964 u=22:46:53.034 | **rc-r9** |
| `REC-COM-11|JEA|2028|BEV` | rc-r11 approved 2026-11-17 c=22:46:53.133 u=22:46:53.170 | **rc-r11** |
| `REC-PN-12B|L460|2027|Petrol PHEV` | rc-r12 approved 2026-11-17 c=22:46:53.178 u=22:46:53.193 | **rc-r12** |
| `REC-DRF-13|L663|2027|BEV` | rc-r13 draft 2026-11-17 c=22:46:53.220 u=22:46:53.257 | **rc-r13** |
| `REC-FAKE-14|EMA|2027|BEV` | rc-r14 completed 2026-11-17 c=22:46:53.266 u=22:46:53.266 | **rc-r14** |
| `REC-RND-15|L461|2028|MHEV` | rc-r15 completed 2026-11-17 c=22:46:53.274 u=22:46:53.274 | **rc-r15** |
| `REC-NEG-16|L663|2028|Petrol` | rc-r16 completed 2026-11-17 c=22:46:53.341 u=22:46:53.341 | **rc-r16** |
| `LR_REC_200|L460|2027|BEV` | RC-V4 completed 2026-10-04 c=22:46:53.354 u=22:46:53.354 | **RC-V4** |
| `LR-REC-200|L460|2027|BEV` | RC-V2 completed 2026-10-02 c=22:46:53.354 u=22:46:53.354<br>RC-V1 completed 2026-10-01 c=22:46:53.354 u=22:46:53.354 | **RC-V2** |
| `LRREC200|L460|2027|BEV` | RC-V3 completed 2026-10-03 c=22:46:53.354 u=22:46:53.354 | **RC-V3** |
| `REC-CASE-18|Q901|2028|BEV` | rc-r18a completed 2026-11-17 c=22:46:53.362 u=22:46:53.362 | **rc-r18a** |
| `REC-CASE-18|q901|2028|BEV` | rc-r18b completed 2026-11-17 c=22:46:53.371 u=22:46:53.371 | **rc-r18b** |

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
| rc-r14 | REC-FAKE-14 | 12.000000 | 0.010000 | DAP | 11.990000 | 11.990000 |  | no | — |  |  |
| rc-r1 | REC-GBP-01 | 12.000000 | 10.000000 | DAP | 2.000000 | 2.000000 |  | yes | 10000 | 2.000000 × 10,000 = 20,000.00 | validated 0.5 |
| RC-MIX | REC-MIX-03 | 30.534351 | 30.000000 | DAP | 0.534351 | 0.534351 |  | no | — |  |  |
| rc-r16 | REC-NEG-16 | 18.000000 | 20.000000 | DAP | -2.000000 |  | -2.000000 | no | — |  |  |
| rc-r12 | REC-PN-12B | 9.000000 | 8.000000 | DAP | 1.000000 | 1.000000 |  | no | — |  |  |
| RC-REV-3 | REC-REV-04 | 60.000000 | 55.000000 | DAP | 5.000000 | 5.000000 |  | no | — |  |  |
| rc-r15 | REC-RND-15 | 14.000000 | 13.040000 | DAP | 0.960000 | 0.960000 |  | no | — |  |  |
| rc-r7 | REC-TIE-07 | 20.000000 | 15.000000 | DAP | 5.000000 | 5.000000 |  | no | — |  |  |
| rc-r9 | REC-VOL-09 | 12.000000 | 10.000000 | DAP | 2.000000 | 2.000000 |  | yes | 600000 | 2.000000 × 600,000 = 1,200,000.00 |  |
| RC-V2 | lr-rec-200 | 6.000000 | 5.000000 | DAP | 1.000000 | 1.000000 |  | no | — |  |  |

## 5. Totals

- Eligible current records: **17**
- Σ GBP current = **283.542755**; Σ GBP should = **241.856723**; Σ gap = **41.686032**
- Weighted gap = 41.686032 ÷ 283.542755 × 100 = **14.7019 %** (positive: current above should-cost)
- Opportunity = Σ positive gaps = **£43.686032** over 16 records; unfavourable = Σ negative gaps = **£-2.000000** over 1 (not netted)
- Annualised = **£1,220,000.00** over 2 validated volume(s)
- Validated savings = **£0.50** (1); implemented = **£0.00** (0)
- Current records by status: {'completed': 13, 'approved': 3, 'draft': 1} → completed costings (non-draft) 16, awaiting review 13, awaiting approval 0
- Current records by commodity: {'Casting': 14, 'Machining': 1, 'Forging': 2}
- Records: 21 included (17 current), 1 excluded
