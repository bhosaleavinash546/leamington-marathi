# Range Rover L460 PHEV — independent trace of the software costing

Programme: 200,000 vehicles a year × 6 years = 1,200,000 vehicles · PHEV · Tier1_Supplier · 52 modules · 0 % discount.
Every figure below is recomputed by hand from the published tables and reconciled with the tool's own result.

## Step 1 — Engineering rate (UK hub)

- Hub book: mid £6,237 / senior £6,531 per person-month (152 h). Build-up from the salaries: mid GBP 66,875 × (1 + 13.88 % employer on-cost) ÷ 1,856 productive h × 152 h ÷ FX 1 = £6,237; senior 70,000 × (1 + 13.92 % on-cost at that salary) → £6,531.
- Senior share 0.55: 0.55 × 6,531 + 0.45 × 6,237 = **£6,398.70**.
- Development source Tier1_Supplier: efficiency 0.88 ÷ (1 − margin 0.117) = × 0.9966.
- Burden: (1 + 15 %) × (1 + 40 %) × (1 + 0 %) = × 1.610.
- Loaded rate = 6,398.70 × 0.9966 × 1.610 = **£10,266.91 per person-month**.

## Step 2 — Effort per module

development PM = catalogue PM × reuse × ASIL factor; costed PM = development PM × (0.12 requirements + 0.14 architecture + 0.22 × complexity algorithms + 0.37 × (1 + (complexity − 1) × 0.15) implementation + 0.15 × safety-reuse scale).
Reuse {"Fresh":1,"Light":0.82,"Medium":0.6,"Heavy":0.35,"Platform":0.14}; ASIL {"QM":1,"A":1.18,"B":1.4,"C":1.6,"D":1.82}; complexity {"Low":0.6,"Medium":1,"High":1.7,"Very High":2.8}; safety reuse floor {"QM":0,"A":0,"B":0.4,"C":0.5,"D":0.6}.

## Step 3 — Verification, integration, cyber, calibration (fractions of development £)

testing = development × the module's test fraction; integration = × its integration fraction; cybersecurity = × the CAL uplift {"none":0,"CAL1":0.08,"CAL2":0.08,"CAL3":0.1,"CAL4":0.14}; calibration = × its calibration fraction.

## Step 4 — Tools

engineer-years = (development + testing + integration + cyber + calibration) ÷ loaded rate ÷ 12; tools = engineer-years × £39,500 per seat-year.

## Step 5 — Maintenance

(development + testing + integration) × the module's % a year × Σ weights. Weights: 1.000, 1.000, 1.000, 0.500, 0.500, 0.500, 0.125, 0.125, 0.125, 0.125, 0.125, 0.125, 0.125, 0.125, 0.125, 0.125 → Σ = 5.750 (production years: full 3, then 0.5; then 10 years of security support at 0.5 × 0.25).

## Step 6 — Licences, royalties, cloud

IP licences = module £ / yr × 6. Royalties = 200,000 × 6 × £ per vehicle built + 200,000 × 6 × 3 subscription years × £ per vehicle-year. Cloud = module £ / yr ÷ 440,000 × 200,000 × 6 × 8 service years.

## Step 7 — Every module (UK hub, £)

| Module | Cat | ASIL | Cplx | Reuse | CAL | Base PM | Dev PM | Development | Testing | Integration | Cyber | Calibration | Tools | Maintenance | IP licences | Royalties | Cloud | Total |
|---|---|---|---|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| BMS Core Software | A | D | High | Medium | CAL4 | 90 | 98.3 | 1,203,623 | 481,449 | 216,652 | 168,507 | 96,290 | 694,607 | 1,312,190 | 108,000 | 0 | 0 | 4,281,319 |
| Cell Balancing Algorithms | A | C | High | Medium | none | 20 | 19.2 | 235,140 | 89,353 | 28,217 | 0 | 23,514 | 120,621 | 202,808 | 36,000 | 0 | 0 | 735,653 |
| SOC/SOH/SOE Estimation Models | A | C | High | Medium | none | 42 | 40.3 | 493,794 | 207,394 | 69,131 | 0 | 59,255 | 265,969 | 620,107 | 132,000 | 0 | 2,618,182 | 4,465,832 |
| Battery Thermal Management Software | A | B | High | Medium | none | 30 | 25.2 | 308,621 | 108,017 | 46,293 | 0 | 30,862 | 158,315 | 266,186 | 36,000 | 0 | 0 | 954,295 |
| Fast-Charging Control Software | A | C | Medium | Medium | CAL3 | 25 | 24.0 | 246,406 | 93,634 | 34,497 | 24,641 | 19,712 | 134,300 | 258,430 | 84,000 | 0 | 654,545 | 1,550,166 |
| EDU (Electric Drive Unit) Control Software | A | D | High | Medium | CAL4 | 65 | 71.0 | 869,283 | 365,099 | 173,857 | 121,700 | 104,314 | 523,957 | 971,685 | 132,000 | 0 | 0 | 3,261,895 |
| Inverter Control Algorithms | A | D | Very High | Medium | none | 45 | 49.1 | 754,705 | 316,976 | 135,847 | 0 | 75,471 | 411,341 | 694,329 | 84,000 | 0 | 0 | 2,472,669 |
| Motor Control (FOC/DTC/SVPWM) | A | D | Very High | Medium | none | 42 | 45.9 | 704,391 | 295,844 | 126,790 | 0 | 84,527 | 388,435 | 648,040 | 72,000 | 0 | 0 | 2,320,029 |
| Regenerative Braking Software | A | C | High | Medium | none | 20 | 19.2 | 235,140 | 89,353 | 37,622 | 0 | 23,514 | 123,637 | 208,217 | 36,000 | 0 | 0 | 753,483 |
| Camera Perception Stack | B | B | Very High | Medium | CAL3 | 130 | 109.2 | 1,677,123 | 838,561 | 335,425 | 167,712 | 100,627 | 1,000,124 | 2,623,020 | 960,000 | 0 | 18,545,455 | 26,248,046 |
| Radar Processing Stack | B | B | Very High | Medium | none | 60 | 50.4 | 774,057 | 348,325 | 123,849 | 0 | 61,925 | 419,407 | 859,899 | 240,000 | 0 | 1,745,455 | 4,572,917 |
| Ultrasonic Processing Software | B | B | Medium | Medium | none | 15 | 12.6 | 129,363 | 45,277 | 15,524 | 0 | 7,762 | 63,457 | 87,475 | 48,000 | 0 | 0 | 396,857 |
| Sensor Fusion Engine | B | C | Very High | Medium | none | 95 | 91.2 | 1,400,674 | 700,337 | 308,148 | 0 | 112,054 | 808,325 | 2,216,426 | 330,000 | 0 | 4,363,636 | 10,239,600 |
| Path Planning Algorithms | B | C | Very High | Medium | none | 80 | 76.8 | 1,179,515 | 589,757 | 235,903 | 0 | 70,771 | 665,568 | 1,844,761 | 300,000 | 0 | 3,272,727 | 8,159,002 |
| Control Algorithms (ACC / LKA / AEB) | B | D | High | Medium | none | 65 | 71.0 | 869,283 | 417,256 | 156,471 | 0 | 121,700 | 501,661 | 1,161,624 | 132,000 | 0 | 0 | 3,359,995 |
| Driver Monitoring Software (DMS) | B | B | Very High | Medium | CAL2 | 55 | 46.2 | 709,552 | 319,298 | 113,528 | 56,764 | 42,573 | 398,106 | 919,615 | 540,000 | 0 | 3,927,273 | 7,026,709 |
| Highway Assist / Traffic Jam Assist | B | C | Very High | Medium | none | 75 | 72.0 | 1,105,795 | 552,898 | 243,275 | 0 | 110,580 | 645,242 | 1,749,810 | 390,000 | 0 | 4,800,000 | 9,597,599 |
| IVI Operating System (Android Automotive / QNX) | C | QM | Very High | Medium | CAL4 | 160 | 96.0 | 1,474,393 | 516,038 | 324,367 | 206,415 | 29,488 | 817,779 | 2,395,816 | 0 | 22,668,000 | 2,618,182 | 31,050,477 |
| Navigation Stack | C | QM | High | Medium | none | 42 | 25.2 | 308,621 | 92,586 | 43,207 | 0 | 6,172 | 144,462 | 306,646 | 0 | 41,400,000 | 8,290,909 | 50,592,605 |
| Vehicle Voice Assistant | C | QM | Very High | Medium | CAL4 | 65 | 39.0 | 598,972 | 209,640 | 107,815 | 83,856 | 23,959 | 328,382 | 843,113 | 0 | 4,608,000 | 0 | 6,803,738 |
| Telematics Control Unit (TCU) Software | C | B | High | Medium | CAL4 | 30 | 25.2 | 308,621 | 117,276 | 46,293 | 43,207 | 12,345 | 169,199 | 325,812 | 108,000 | 18,132,000 | 1,963,636 | 21,226,390 |
| Bluetooth / WiFi / 5G Connectivity Stack | C | QM | High | Medium | CAL4 | 30 | 18.0 | 220,444 | 66,133 | 26,453 | 30,862 | 6,613 | 112,375 | 179,992 | 210,000 | 0 | 436,364 | 1,289,237 |
| App Framework & HMI Layer | C | QM | Very High | Medium | none | 85 | 51.0 | 783,272 | 234,981 | 117,491 | 0 | 15,665 | 369,153 | 914,274 | 540,000 | 0 | 0 | 2,974,835 |
| Body Control Software | D | B | Medium | Medium | none | 45 | 37.8 | 388,089 | 124,188 | 54,332 | 0 | 23,285 | 189,126 | 260,641 | 60,000 | 0 | 0 | 1,099,662 |
| Chassis Control Software | D | C | High | Medium | none | 60 | 57.6 | 705,420 | 282,168 | 126,976 | 0 | 98,759 | 389,003 | 640,874 | 108,000 | 0 | 0 | 2,351,200 |
| Gateway ECU Software | D | B | High | Medium | CAL4 | 28 | 23.5 | 288,047 | 100,816 | 46,087 | 40,327 | 11,522 | 156,072 | 250,096 | 72,000 | 0 | 0 | 964,967 |
| Zonal Architecture Software | D | B | Very High | Medium | CAL4 | 65 | 54.6 | 838,561 | 318,653 | 167,712 | 117,399 | 41,928 | 475,866 | 914,199 | 132,000 | 0 | 0 | 3,006,319 |
| Vehicle Motion Management (VMM) | D | C | Very High | Medium | none | 80 | 76.8 | 1,179,515 | 530,782 | 259,493 | 0 | 188,722 | 692,039 | 1,359,155 | 168,000 | 0 | 0 | 4,377,706 |
| AUTOSAR Classic BSW & Integration | E | C | High | Medium | none | 45 | 43.2 | 529,065 | 185,173 | 105,813 | 0 | 21,163 | 269,701 | 377,223 | 780,000 | 0 | 0 | 2,268,138 |
| AUTOSAR Adaptive Platform | E | B | High | Medium | CAL3 | 60 | 50.4 | 617,243 | 234,552 | 135,793 | 61,724 | 24,690 | 344,335 | 681,436 | 660,000 | 0 | 654,545 | 3,414,319 |
| RTOS & OS Porting | E | C | Medium | Medium | none | 12 | 11.5 | 118,275 | 41,396 | 16,558 | 0 | 3,548 | 57,638 | 60,799 | 210,000 | 0 | 0 | 508,215 |
| Diagnostics (UDS / OBD-II) | E | A | Medium | Medium | none | 25 | 17.7 | 181,724 | 54,517 | 25,441 | 0 | 9,086 | 86,811 | 120,374 | 96,000 | 0 | 545,455 | 1,119,409 |
| CAN / LIN / FlexRay / Ethernet Communication Stacks | E | B | Medium | Medium | none | 20 | 16.8 | 172,484 | 51,745 | 24,148 | 0 | 5,175 | 81,291 | 114,253 | 132,000 | 0 | 0 | 581,096 |
| Time Synchronisation & Network Management | E | A | Low | Medium | none | 14 | 9.9 | 90,551 | 25,354 | 10,866 | 0 | 2,717 | 41,515 | 43,736 | 36,000 | 0 | 0 | 250,739 |
| Secure Boot & Root of Trust | F | B | High | Medium | CAL3 | 20 | 16.8 | 205,748 | 92,586 | 41,150 | 20,575 | 8,230 | 118,077 | 234,244 | 132,000 | 0 | 981,818 | 1,834,427 |
| Encryption Modules & Crypto Stack | F | B | Medium | Medium | CAL3 | 15 | 12.6 | 129,363 | 51,745 | 18,111 | 12,936 | 3,881 | 69,263 | 114,551 | 96,000 | 0 | 0 | 495,850 |
| Intrusion Detection System (IDS) | F | QM | High | Medium | CAL3 | 28 | 16.8 | 205,748 | 86,414 | 37,035 | 20,575 | 10,287 | 115,438 | 302,860 | 270,000 | 0 | 1,963,636 | 3,011,993 |
| Secure OTA Software Update Framework | F | B | High | Medium | CAL4 | 20 | 16.8 | 205,748 | 82,299 | 37,035 | 28,805 | 8,230 | 116,098 | 261,690 | 210,000 | 0 | 2,618,182 | 3,568,086 |
| Key Management System | F | B | High | Medium | CAL4 | 15 | 12.6 | 154,311 | 61,724 | 21,603 | 21,603 | 6,172 | 85,094 | 163,971 | 168,000 | 0 | 1,745,455 | 2,427,934 |
| OTA Update Manager (Vehicle-side) | G | B | High | Medium | CAL4 | 30 | 25.2 | 308,621 | 117,276 | 55,552 | 43,207 | 12,345 | 172,168 | 332,200 | 330,000 | 0 | 3,927,273 | 5,298,642 |
| Cloud Backend Services | G | QM | Very High | Medium | CAL4 | 65 | 39.0 | 598,972 | 191,671 | 95,836 | 83,856 | 17,969 | 316,860 | 1,019,451 | 780,000 | 0 | 26,181,818 | 29,286,433 |
| Data Pipeline & Telemetry | G | QM | High | Medium | CAL3 | 30 | 18.0 | 220,444 | 66,133 | 30,862 | 22,044 | 8,818 | 111,669 | 255,538 | 390,000 | 0 | 6,981,818 | 8,087,327 |
| Fleet Management & Analytics Software | G | QM | Medium | Medium | none | 20 | 12.0 | 123,203 | 34,497 | 14,784 | 0 | 3,696 | 56,485 | 158,685 | 270,000 | 0 | 4,363,636 | 5,024,987 |
| Predictive Active Suspension & Body Control | D | C | Very High | Medium | none | 42 | 40.3 | 619,245 | 272,468 | 123,849 | 0 | 99,079 | 357,365 | 642,343 | 96,000 | 0 | 0 | 2,210,349 |
| Premium Audio DSP & Active Noise Control | C | QM | Very High | Medium | none | 28 | 16.8 | 258,019 | 72,245 | 30,962 | 0 | 30,962 | 125,739 | 145,394 | 252,000 | 0 | 0 | 915,322 |
| Automated Parking & Surround-View | B | B | High | Medium | none | 48 | 40.3 | 493,794 | 197,518 | 88,883 | 0 | 49,379 | 265,969 | 448,612 | 72,000 | 0 | 0 | 1,616,155 |
| Climate & Thermal Comfort Control | D | A | Medium | Medium | none | 26 | 18.4 | 188,993 | 56,698 | 22,679 | 0 | 15,119 | 90,889 | 123,450 | 36,000 | 0 | 0 | 533,830 |
| AR Head-Up Display & AR Navigation | C | A | High | Medium | none | 30 | 21.2 | 260,124 | 83,240 | 36,417 | 0 | 26,012 | 130,101 | 196,536 | 108,000 | 0 | 0 | 840,431 |
| Engine Management Software (ECU) | A | B | Very High | Medium | CAL3 | 65 | 54.6 | 838,561 | 352,196 | 167,712 | 83,856 | 100,627 | 494,685 | 937,344 | 132,000 | 0 | 0 | 3,106,982 |
| Transmission Control Software (TCU) | A | B | High | Medium | none | 60 | 50.4 | 617,243 | 246,897 | 111,104 | 0 | 86,414 | 340,377 | 560,765 | 108,000 | 0 | 0 | 2,070,800 |
| Emissions After-treatment & OBD | A | QM | High | Medium | none | 30 | 18.0 | 220,444 | 77,155 | 33,067 | 0 | 22,044 | 113,082 | 190,133 | 36,000 | 0 | 0 | 691,925 |
| Hybrid Supervisory Control & Energy Management | A | C | Very High | Medium | none | 80 | 76.8 | 1,179,515 | 530,782 | 259,493 | 0 | 188,722 | 692,039 | 1,359,155 | 168,000 | 0 | 0 | 4,377,706 |
| **Sum** | | | | | | | | 28,527,858 | 11,718,376 | 5,266,010 | 1,460,571 | 2,368,276 | 15,819,218 | 33,879,985 | 10,626,000 | 86,808,000 | 103,200,000 | 299,674,293 |

## Step 8 — Programme

- Homologation: type approval £755,401 + ISO 26262 assessor (ASIL-D present) £600,000 + CSMS £1,500,000 + SUMS £800,000 = **£3,655,401**.
- NRE = development + testing + integration + cyber + calibration + tools + homologation = **£68,815,709**.
- Lifecycle = maintenance + IP licences + royalties + cloud = **£234,513,985**.
- Programme total = **£303,329,694**; per vehicle = ÷ 1,200,000 = **£252.77**.

## Reconciliation with the tool — every hub

| Hub | Loaded £/PM | NRE | Total | Per vehicle | Module-by-module check |
|---|--:|--:|--:|--:|---|
| UK | 10,267 | £68.8M | £303.3M | £253 | PASS (52 modules × 10 buckets to 1p) |
| DE | 10,605 | £70.4M | £306.1M | £255 | PASS (52 modules × 10 buckets to 1p) |
| AT | 10,058 | £67.8M | £301.6M | £251 | PASS (52 modules × 10 buckets to 1p) |
| SE | 10,338 | £69.2M | £303.9M | £253 | PASS (52 modules × 10 buckets to 1p) |
| FR | 9,181 | £63.6M | £294.5M | £245 | PASS (52 modules × 10 buckets to 1p) |
| IT | 5,788 | £47.3M | £267.0M | £223 | PASS (52 modules × 10 buckets to 1p) |
| PT | 5,198 | £44.5M | £262.2M | £219 | PASS (52 modules × 10 buckets to 1p) |
| PL | 6,824 | £52.3M | £275.4M | £230 | PASS (52 modules × 10 buckets to 1p) |
| CZ | 6,399 | £50.2M | £272.0M | £227 | PASS (52 modules × 10 buckets to 1p) |
| RO | 5,390 | £45.4M | £263.8M | £220 | PASS (52 modules × 10 buckets to 1p) |
| HU | 6,500 | £50.7M | £272.8M | £227 | PASS (52 modules × 10 buckets to 1p) |
| RS | 5,333 | £45.1M | £263.3M | £219 | PASS (52 modules × 10 buckets to 1p) |
| TR | 2,240 | £30.2M | £238.3M | £199 | PASS (52 modules × 10 buckets to 1p) |
| EG | 882 | £23.7M | £227.3M | £189 | PASS (52 modules × 10 buckets to 1p) |
| IN | 1,072 | £24.6M | £228.8M | £191 | PASS (52 modules × 10 buckets to 1p) |
| CN | 5,573 | £46.3M | £265.3M | £221 | PASS (52 modules × 10 buckets to 1p) |
| VN | 1,955 | £28.9M | £236.0M | £197 | PASS (52 modules × 10 buckets to 1p) |
| JP | 4,051 | £38.9M | £252.9M | £211 | PASS (52 modules × 10 buckets to 1p) |
| KR | 5,396 | £45.4M | £263.8M | £220 | PASS (52 modules × 10 buckets to 1p) |
| US-MI | 12,890 | £81.4M | £324.6M | £270 | PASS (52 modules × 10 buckets to 1p) |
| US-CA | 19,284 | £112.2M | £376.4M | £314 | PASS (52 modules × 10 buckets to 1p) |
| CA | 7,108 | £53.6M | £277.7M | £231 | PASS (52 modules × 10 buckets to 1p) |
| MX | 2,101 | £29.6M | £237.1M | £198 | PASS (52 modules × 10 buckets to 1p) |

## Against the live screen (rounded figures captured in the browser)

| Hub | Screen total | Hand total | Screen NRE | Hand NRE | Screen £/veh | Hand £/veh | Match |
|---|--:|--:|--:|--:|--:|--:|---|
| UK | £303.3M | £303.3M | £68.8M | £68.8M | £253 | £253 | yes |
| DE | £306.1M | £306.1M | £70.4M | £70.4M | £255 | £255 | yes |
| AT | £301.6M | £301.6M | £67.8M | £67.8M | £251 | £251 | yes |
| SE | £303.9M | £303.9M | £69.2M | £69.2M | £253 | £253 | yes |
| FR | £294.5M | £294.5M | £63.6M | £63.6M | £245 | £245 | yes |
| IT | £267.0M | £267.0M | £47.3M | £47.3M | £223 | £223 | yes |
| PT | £262.2M | £262.2M | £44.5M | £44.5M | £219 | £219 | yes |
| PL | £275.4M | £275.4M | £52.3M | £52.3M | £230 | £230 | yes |
| CZ | £272.0M | £272.0M | £50.2M | £50.2M | £227 | £227 | yes |
| RO | £263.8M | £263.8M | £45.4M | £45.4M | £220 | £220 | yes |
| HU | £272.8M | £272.8M | £50.7M | £50.7M | £227 | £227 | yes |
| RS | £263.3M | £263.3M | £45.1M | £45.1M | £219 | £219 | yes |
| US-MI | £324.6M | £324.6M | £81.4M | £81.4M | £270 | £270 | yes |
| US-CA | £376.4M | £376.4M | £112.2M | £112.2M | £314 | £314 | yes |
| CA | £277.7M | £277.7M | £53.6M | £53.6M | £231 | £231 | yes |
| MX | £237.1M | £237.1M | £29.6M | £29.6M | £198 | £198 | yes |
| IN | £228.8M | £228.8M | £24.6M | £24.6M | £191 | £191 | yes |
| CN | £265.3M | £265.3M | £46.3M | £46.3M | £221 | £221 | yes |
| VN | £236.0M | £236.0M | £28.9M | £28.9M | £197 | £197 | yes |
| JP | £252.9M | £252.9M | £38.9M | £38.9M | £211 | £211 | yes |
| KR | £263.8M | £263.8M | £45.4M | £45.4M | £220 | £220 | yes |
| TR | £238.3M | £238.3M | £30.2M | £30.2M | £199 | £199 | yes |
| EG | £227.3M | £227.3M | £23.7M | £23.7M | £189 | £189 | yes |
