
## 20,000 records — median of 3 runs (Phase 1: one run)

| Measure | Phase 1 | after-plain | after-seeded | prefix-plain | prefix-seeded | fixed (plain) v Phase 1 |
|---|---|---|---|---|---|---|
| api.summary_cold_default12m | 575 | 579 | 845 | 604 | 539 | +1 % |
| api.summary_warm_default12m | 3 | 4 | 5 | 4 | 4 | +33 % **>10 %** |
| api.summary_new_filter_commodity | 96 | 127 | 98 | 102 | 97 | +32 % **>10 %** |
| api.summary_all_time | 123 | 149 | 140 | 151 | 136 | +21 % **>10 %** |
| api.records_page1_sorted_gap | 18 | 22 | 20 | 22 | 19 | +22 % **>10 %** |
| api.records_search | 16 | 17 | 18 | 17 | 16 | +6 % |
| api.drill_commodity | 11 | 12 | 13 | 12 | 12 | +9 % |
| api.records_csv | 155 | 188 | 153 | 154 | 153 | +21 % **>10 %** |
| api.records_all_json | 390 | 429 | 421 | 386 | 402 | +10 % |
| api.record_detail | 9 | 8 | 10 | 7 | 7 | -11 % |
| api.summary_after_write | 210 | 175 | 167 | 155 | 172 | -17 % |
| browser.openDashboardToCardsAndTableMs | 299 | 318 | 284 | 298 | 278 | +6 % |
| browser.jsHeapUsedMB | 14.6 | 15.1 | 14.9 | 15.1 | 14.7 | +3 % |
| browser.domNodes | 21,359 | 21,386 | 21,386 | 21,361 | 21,361 | +0 % |
| browser.changeDateToAllTimeMs | 498 | 490 | 471 | 468 | 459 | -2 % |
| browser.exportCsv.ms | 292 | 300 | 299 | 286 | 285 | +3 % |
| browser.exportCsv.bytes | 5,713,064 | 5,713,064 | 5,713,064 | 5,713,064 | 5,713,064 | +0 % |
| browser.exportXlsx.ms | 3,328 | 3,714 | 3,559 | 3,346 | 3,390 | +12 % **>10 %** |
| browser.exportXlsx.bytes | 2,985,409 | 3,122,629 | 3,122,636 | 2,985,411 | 2,985,412 | +5 % |
| browser.exportPdf.ms | 2,105 | 2,550 | 2,378 | 2,313 | 2,226 | +21 % **>10 %** |
| browser.exportPdf.bytes | 13,075,670 | 448,204 | 448,204 | 13,075,670 | 13,075,670 | -97 % |
| browser.jsHeapUsedAfterExportsMB | 343.9 | 238.4 | 337 | 343.5 | 352.1 | -31 % |
| insertMs | 956 | 964 | 2,935 | 949 | 2,814 | +1 % |
| dbBytes | 18,583,552 | 18,583,552 | 237,355,008 | 18,583,552 | 237,355,008 | +0 % |

Runs: after-plain: 664, 579, 549 ms (summary cold); after-seeded: 855, 845, 788 ms (summary cold); prefix-plain: 604, 635, 537 ms (summary cold); prefix-seeded: 515, 539, 555 ms (summary cold)

## 50,000 records — median of 3 runs (Phase 1: one run)

| Measure | Phase 1 | after-plain | after-seeded | prefix-plain | prefix-seeded | fixed (plain) v Phase 1 |
|---|---|---|---|---|---|---|
| api.summary_cold_default12m | 1,461 | 1,519 | 2,129 | 1,326 | 1,437 | +4 % |
| api.summary_warm_default12m | 3 | 4 | 3 | 4 | 4 | +33 % **>10 %** |
| api.summary_new_filter_commodity | 211 | 220 | 213 | 193 | 199 | +4 % |
| api.summary_all_time | 370 | 305 | 305 | 294 | 297 | -18 % |
| api.records_page1_sorted_gap | 42 | 47 | 43 | 47 | 41 | +12 % **>10 %** |
| api.records_search | 33 | 36 | 32 | 36 | 36 | +9 % |
| api.drill_commodity | 21 | 22 | 18 | 23 | 22 | +5 % |
| api.records_csv | 381 | 438 | 434 | 429 | 487 | +15 % **>10 %** |
| api.records_all_json | 965 | 1,063 | 1,104 | 964 | 1,057 | +10 % **>10 %** |
| api.record_detail | 13 | 13 | 11 | 10 | 15 | +0 % |
| api.summary_after_write | 600 | 587 | 566 | 521 | 478 | -2 % |
| browser.openDashboardToCardsAndTableMs | 318 | 405 | 324 | 326 | 378 | +27 % **>10 %** |
| browser.jsHeapUsedMB | 14.8 | 16.1 | 15.7 | 15.7 | 15.6 | +9 % |
| browser.domNodes | 21,433 | 21,507 | 21,482 | 21,455 | 21,480 | +0 % |
| browser.changeDateToAllTimeMs | 857 | 839 | 826 | 803 | 795 | -2 % |
| browser.exportCsv.ms | 457 | 540 | 555 | 548 | 534 | +18 % **>10 %** |
| browser.exportCsv.bytes | 14,337,860 | 14,337,860 | 14,337,860 | 14,337,860 | 14,337,860 | +0 % |
| browser.exportXlsx.ms | 8,733 | 9,302 | 9,107 | 8,643 | 8,424 | +7 % |
| browser.exportXlsx.bytes | 7,340,079 | 7,749,528 | 7,749,527 | 7,340,090 | 7,340,090 | +6 % |
| browser.exportPdf.ms | 3,210 | 3,450 | 3,417 | 3,326 | 3,273 | +7 % |
| browser.exportPdf.bytes | 13,077,628 | 446,529 | 446,529 | 13,077,628 | 13,077,628 | -97 % |
| browser.jsHeapUsedAfterExportsMB | 124.2 | 584.1 | 584.3 | 489.2 | 942.6 | +370 % **>10 %** |
| insertMs | 2,197 | 2,461 | 6,875 | 2,319 | 7,293 | +12 % **>10 %** |
| dbBytes | 46,186,496 | 46,186,496 | 593,149,952 | 46,186,496 | 593,149,952 | +0 % |

Runs: after-plain: 1645, 1519, 1427 ms (summary cold); after-seeded: 2162, 2129, 1996 ms (summary cold); prefix-plain: 1393, 1322, 1326 ms (summary cold); prefix-seeded: 1437, 1417, 1467 ms (summary cold)
