# Software engineering rates by country — research rules (13 Oct 2026)

**Why.** CostVision's automotive software should-cost priced every country as ONE UK rate (£28,000 / person-month, "bare")
× a country multiplier (e.g. India 0.20, China 0.35), dated Jan 2025 with no URLs. The Chief Engineer rejected it. We are
replacing it with **each country's OWN software-engineering cost, built from sourced figures in that country**, and only
for countries where automotive / embedded software is actually developed. No UK multiplier, no "country = X % of UK".

**Read this file fully. Every number you write must be one you SAW on a page you can give the URL of. If you cannot find
a figure, write `null` and say what you tried. Never estimate, interpolate, or "typically" a figure yourself.**

## What to collect, per country (hub)

1. **Evidence that automotive software is developed there** (`evidence`): 2–4 named software / R&D centres of OEMs or
   Tier-1s / engineering-service firms doing automotive software in that country (e.g. "Continental Timișoara — ~X
   engineers, ADAS / body software"), each with a URL. If you find no real automotive software activity, say so — the
   country will then NOT get its own rate.
2. **Salaries** (`salaries`) for software engineers in the automotive / embedded field, by seniority, and where you can
   by role:
   - roles: `embedded_sw_engineer` (also "automotive software engineer", "AUTOSAR developer"), `sw_test_engineer`
     (V&V / HIL / test), `sw_architect`, `functional_safety_engineer` (ISO 26262), `cybersecurity_engineer`
     (ISO 21434 / automotive security), `sw_project_manager`; and, as a fall-back, `software_developer_general`
     (official-statistics occupation, e.g. ONS SOC 2134/2136, BLS 15-1252, ISCO 2512) — state which;
   - levels: `junior` (0–2 y), `mid` (3–5 y), `senior` (6–10 y), `lead` (10+ / principal), or `all` (an occupation
     median that does not split by level);
   - record exactly what the source says: gross, `period` annual / monthly, currency, statistic (median / mean / p25 /
     p75 / range low / range high), the year of the data, the city / region, and whether it includes bonus / 13th–14th
     month / variable pay. Convert NOTHING in the stored figure; put your reading in `note` (e.g. "monthly ×13 per
     source", "CTC incl. employer PF").
   - Aim for: one OFFICIAL statistic for software developers (national statistics office / labour ministry), and two
     independent SURVEYS for embedded / automotive engineers by level (Hays, Michael Page, Robert Walters, Randstad,
     Morgan McKinley, StepStone, Kununu, Glassdoor, PayScale, Levels.fyi (Bay Area only), AmbitionBox / Naukri (IN),
     Just Join IT / No Fluff Jobs (PL), Platy.cz / Paylab, ITviec (VN), Doda / OpenWork / Levtech (JP), Saramin / Wanted
     (KR), Zhaopin / BOSS Zhipin / Liepin reports (CN), OCC / Glassdoor MX, Statistics Canada / Job Bank (CA)), plus a
     collective agreement where software engineers are covered (IG Metall ERA — Germany, Austria FEEI / Metall KV,
     Sweden Unionen / Sveriges Ingenjörer statistics, Syntec / Metallurgie France).
3. **Local supplier / contractor sell rates** (`supplierRates`) if you see them: engineering-services or contractor
   hourly / daily rates for embedded / automotive software in that country, from a rate card, a public procurement
   framework, a freelance-market survey (e.g. freelancermap, Malt, IT Jobs Watch contract rates, Useme), or a listed
   engineering-services firm's disclosed rates. Record unit (hour / day / month), currency, URL.

## Sources

- Allowed: national statistics, labour ministries, collective agreements, named salary surveys / guides (with year),
  job-board salary aggregates (Glassdoor, PayScale, Indeed, Levels.fyi, AmbitionBox …) labelled `job-board-aggregate`.
- **Excluded (do not use): salaryexplorer.com, salaryexpert.com / ERI, erieri, "averagesalarysurvey", any page whose
  figures are machine-generated estimates for every job title, AI-written blog listicles with no named data, and
  recruiter blogs that quote no data source.** Also exclude a figure seen only as "about / around" in a search summary.
- Prefer reading the page (WebFetch) over trusting a search snippet. If you only saw the snippet, set
  `"seenIn": "search-snippet"` (it will be weighted down); else `"seenIn": "page"`.
- Data year 2024–2026 only (2023 allowed for official statistics, say so).

## Budget and output

- Your web-search budget is stated in your task. Ten agents share one budget — do not exceed yours. Combine queries.
- Priority inside a country: (a) official software-developer statistic, (b) embedded / automotive SW engineer by level
  from two surveys, (c) evidence, (d) other roles, (e) supplier rates.
- Write ONE file `scripts/sw-research/2026-10-13/raw/<your task name>.json`:

```json
{ "task": "A", "researched": "2026-10-13", "searchesUsed": 0,
  "countries": [ {
    "hub": "DE",                    // ISO code; US uses "US-MI" (Michigan / Detroit) and "US-CA" (California)
    "cities": ["Munich", "Stuttgart"],
    "currency": "EUR",
    "evidence": [ { "claim": "...", "url": "...", "seenIn": "page" } ],
    "salaries": [ { "role": "embedded_sw_engineer", "level": "senior", "value": 78000, "period": "annual",
                    "currency": "EUR", "statistic": "median", "dataYear": 2025, "region": "Bavaria",
                    "includesBonus": false, "source": "StepStone Gehaltsreport 2025", "sourceType": "salary-survey",
                    "url": "...", "seenIn": "page", "note": "" } ],
    "supplierRates": [ { "basis": "contractor day rate, embedded C", "value": 750, "unit": "day", "currency": "EUR",
                         "dataYear": 2025, "source": "...", "url": "...", "seenIn": "page", "note": "" } ],
    "notes": "anything a reviewer needs (e.g. 13th month custom, CTC)"
  } ],
  "notResearched": ["..."] }
```

- Change no other file. No git. Reply with one paragraph: per country the number of salary figures and evidence items,
  searches used, and the most serious doubt you have about any figure.
