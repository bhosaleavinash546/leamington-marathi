# Software-engineering rate book — each country's own rate (13 Oct 2026)

**Why.** The Chief Engineer rejected the software tool's country rates. Every country was costed at **one UK rate ×
a ratio**: £28,000 per person-month × 1.00 (UK), 0.95 (EU), 0.20 (India), 0.35 (China) … dated January 2025, with no
URL behind any figure.

£28,000 / PM is about £1,400 a day:
- **2.5×** the UK automotive contract day rate (IT Jobs Watch, £550 / day);
- **4×** the cost of an employed UK embedded engineer.

**What replaced it.** A software engineering **hub** is a country (or US state) where automotive software is actually
developed. Each hub has its own rate, built from:
- its own salaries;
- its own statutory employer on-costs;
- its own working hours.

There is no UK term anywhere. **23 hubs**, all with named automotive software centres as evidence:
- UK, Germany, Austria, Sweden, France, Italy, Portugal;
- Poland, Czechia, Romania, Hungary, Serbia;
- Türkiye, Egypt;
- India, China, Vietnam, Japan, South Korea;
- USA–Michigan, USA–California, Canada, Mexico.

Other app countries are costed at the nearest hub, and the screen says which and why. Examples: Spain → Portugal
(no Spanish embedded salary data), Thailand → Vietnam, Brazil → Mexico, Slovakia → Czechia.

**Other commodities' rates are untouched.** `tests/sw-country-rates.test.ts` checks:
- `regional-rates.ts`, `rate-library.ts`, `country-books.ts` and `core.ts` do not read the software book;
- the book itself imports nothing.

## How a hub rate is built (`scripts/sw-rate-book.ts`)

```
mid salary    = median of the hub's central embedded / automotive software salaries + its official developer median
senior salary = median of its senior / upper-quartile figures (or the mid, said so)
+ statutory employer on-cost    Σ component % × the salary inside each component's floor / ceiling
÷ productive hours              (260 − statutory leave − public holidays) × 8 h   (France: 218 "forfait" days)
× 152 h                         the COCOMO II person-month the effort model counts
÷ FX                            REGIONAL_DATA[country].fxToGBP — the app's one dated rate
```

**Where the senior share comes in.** The programme's **senior share** blends the hub's mid and senior rate. The old
1.20 / 0.75 "seniority" factor on a base that was already "senior-blended" counted seniority twice. It is gone.

**What sits on top in the engine (unchanged):**
- the development-source factor;
- the programme **overhead** (default 1.15, a CostVision assumption).

The hub rate is salary plus STATUTORY on-cost only. These are not in it, so put your company's own overhead in that
field:
- non-statutory benefits (pension top-ups, health cover, bonus);
- site and IT cost;
- non-productive time.

| Hub | Mid salary (gross / yr) | On-cost | Productive h | **Mid £/PM** | **Senior £/PM** | Retired £/PM | Confidence |
|---|---|---|---|---|---|---|---|
| United Kingdom | £66,875 | 13.9 % | 1,856 | **6,237** | **6,531** | 27,300 | Medium |
| Germany | €71,692 | 21.0 % | 1,824 | **6,206** | **6,940** | 25,935 (EU) | Medium |
| Austria | €62,000 | 21.0 % | 1,776 | 5,510 | 6,889 | 25,935 (EU) | Low |
| Sweden | SEK 637,800 | 31.4 % | 1,792 | 5,382 | 7,311 | 25,935 (EU) | Medium |
| France | €50,000 | 45 % (PwC average) | 1,744 | 5,424 | 5,966 | 25,935 (EU) | Medium |
| Italy | €30,248 | 30.5 % | 1,824 | 2,824 | 4,248 | 25,935 (EU) | Low |
| Portugal | €30,146 | 23.8 % | 1,800 | 2,704 | 3,678 | 25,935 (EU) | Low |
| Poland | PLN 165,600 | 19.5 % | 1,808 | 3,264 | 5,062 | 12,285 (E. Europe) | Low — **basis disputed** |
| Czechia | CZK 930,000 | 33.8 % | 1,816 | 3,663 | 4,254 | 12,285 | Medium |
| Romania | RON 239,265 | 2.3 % | 1,800 | 3,359 | 3,359 | 12,285 | Low |
| Hungary | HUF 13.8 M | 13 % | 1,824 | 3,035 | 4,882 | 12,285 | Low |
| Serbia | RSD 4.80 M | 15.2 % | 1,848 | 3,324 | 3,324 | 12,285 | Medium |
| Türkiye | TRY 1.13 M (employer cost) | incl. | 1,896 | 1,396 | 1,396 | 12,285 | Low (lower bound) |
| Egypt | EGP 403,597 | 11.3 % | 1,800 | 550 | 550 | 12,285 | Low |
| India | ₹815,000 (CTC) | incl. | 1,856 | 525 | 785 | 5,460 | Low |
| China | ¥254,483 | 25.7 % | 1,936 | 2,828 | 4,001 | 9,555 | Low |
| Vietnam | ₫376.5 M | 21.5 % | 1,896 | 1,068 | 1,341 | 5,460 (India) | Low |
| Japan | ¥5.66 M | 14.6 % | 1,872 | 2,525 | 2,525 | 24,570 | Medium |
| South Korea | ₩73.2 M (employer cost) | incl. | 1,840 | 3,363 | 3,363 | 24,570 (Japan) | Medium |
| USA — Michigan | $130,760 | 7.6 % | 2,080 | **7,769** | **8,250** | 36,855 | Medium |
| USA — California | $183,480 | 7.7 % | 2,080 | **10,902** | **12,932** | 50,505 | Medium |
| Canada (Ontario) | C$89,842 | 6.5 % | 1,928 | 4,015 | 4,769 | 36,855 (Detroit) | Medium |
| Mexico | MXN 300,000 | 10.2 % (partial) | 1,928 | 1,093 | 1,486 | 7,644 | Low |

The full register (current → new, per hub) is `calculator/scripts/sw-research/2026-10-13/register.csv`. Every
observation (value, statistic, year, source, URL) is in the generated `calculator/src/engine/sw-country-rates.ts`,
and in the screen's Rate Library ("How it is built").

**Cross-checks against supplier sell rates.** These are not used in the rate; they show where an in-house engineer
sits:
- **UK:** IT Jobs Watch "Automotive" contract median of £550 / day ≈ £11,150 / PM, against £6,237 in-house mid
  (×1.8).
- **Germany:** freelancermap automotive freelance median of €101 / h ≈ £13,180 / PM, against £6,206 (×2.1).
- **India:** Tata Elxsi revenue per employee FY2025 ≈ ₹30 lakh a year, against ₹8.15 lakh CTC. That revenue includes
  onsite billing.

These gaps are the reason a **supplier quote** should not be compared to an in-house should-cost without margin and
overhead.

## How the research was done (and its limits)

**Who did it.**
- **Five country agents** read salaries, statutory on-costs, hours and evidence.
- **One cross-country agent** collected on-costs, leave and supplier rates.
- **One independent reviewer** re-searched the decisive figures:
  - 13 CONFIRMED;
  - 3 DIFFERENT (corrections applied);
  - 7 NOT-FOUND.

**Sources and constraints.**
- Search budget: 192 of the 200 searches allowed in the turn.
- Rules: `calculator/scripts/sw-research/2026-10-13/RULES.md`.
- Raw output, unchanged: `raw/`.
- Selections: `build-config.py`.
- **No page could be opened.** The research environment's fetch failed (DNS) for every site, so every figure was
  read from a search result of the cited page. Every observation says so, and no hub is graded "High".

**Corrections from the review:**
- **Türkiye.** kariyer.net figures are applicants' NET salary expectations, so they were excluded. The official TÜİK
  employer labour cost for the ICT section is used instead. It is 2024 lira, so it is a lower bound.
- **Romania and Serbia.** INS and RZS publish IT pay NET. Gross is net × the official gross/net ratio:
  - Romania uses the 2025 whole-economy ratio — an assumption;
  - Serbia uses RZS's own 2022 programming pair, which reproduces RZS's January 2025 figure.
- **Korea.** KOSA's average wage already includes severance and the employer's four insurances, so nothing is
  added.
- **Egypt.**
  - The 2023 official figure predates the March 2024 devaluation, so it was excluded.
  - The two remaining sources disagree three-fold.
- **US-CA.** The San Jose median is May 2025 data; a May 2024 quote is in the set too.

**Still open:**
- **Poland.** Bulldogjob's embedded medians may be NET. If so, the PL rate is understated. Read the page.
- **India.** AmbitionBox figures are taken as CTC, which is not verified. If they are not CTC, add ≈ 10 %.
- **China.** No published embedded / automotive salary statistic was found. The figure is the NBS industry average
  plus one Shanghai advert.
- **Vietnam and Mexico.** One survey each. ITviec does not state gross or net.
- **Partial on-costs.**
  - Mexico: IMSS branches, state payroll tax and aguinaldo are missing.
  - Austria: FLAF and the severance fund are missing.
  - UK: auto-enrolment pension is missing.
- **Hours.** Some public-holiday counts are not sourced and are labelled so: CN, JP, KR, IN, EG, MX, and RO leave.
- **Supplier sell rate.** The development-source factors (Tier-1 ×0.88, start-up ×0.72) are unsourced EFFORT factors.
  Since 14 Oct 2026 the price adds a supplier margin: factor ÷ (1 − 18 %), the median of four listed engineering-services
  firms' margins (`supplierMargin`; `docs/review/software-costing-cockpit-2026-10.md`). A sourced sell rate per hub is
  still the next research round.

Regenerate after editing the config:

```
python3 scripts/sw-research/2026-10-13/build-config.py && npx tsx scripts/sw-rate-book.ts
```

`tests/sw-country-rates.test.ts` fails when the generated book is out of date.
