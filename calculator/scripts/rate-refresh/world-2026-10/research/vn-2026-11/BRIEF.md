# Vietnam — detailed rate research (Nov 2026)

CostVision costs parts in Vietnam on its own rate book, but Vietnam is the least-sourced country (about 16–18 % of a
typical part on Vietnamese figures). The gaps, by money: materials with no Vietnamese or regional price (45 % of all
cost on 15 real parts), machine capital with no country price (5 %), the exchange rate (held at a 29 Sep snapshot —
sbv.gov.vn refused automated access), and labour by role (from JETRO's Japanese-affiliate survey × ILO all-economy
occupation ratios, no Vietnamese occupation wages). We need what a MANUFACTURER IN VIETNAM pays.

## What counts (the same strict rules as every round)
- A figure is read ON A PAGE or PDF that states it; quote the text that holds the number verbatim. A search-result
  snippet only → `seenIn: "search-snippet"`. A category page or "from" banner without the product is not a price.
- Prefer official / primary: GSO (gso.gov.vn), MOLISA, SBV, Vietcombank / BIDV published rate tables, EVN, Decrees and
  Circulars (thuvienphapluat.vn), listed companies' filings (Hoa Phat, Hoa Sen, Binh Minh Plastics, Tien Phong, Nam Kim),
  then trade data (SMM, Mysteel, Argus, ICIS, businessanalytiq, VSA — Vietnam Steel Association), then dealers'
  published prices.
- Record the unit, currency, VAT (đã / chưa bao gồm VAT), the date, and scope (ex-works, delivered, CFR, retail…).
- Do not compute, convert or adjust — we do the arithmetic. Never guess; record what you tried under `notFound`.
- Do not spoof user agents or get round bot checks; if a site blocks you, record it and move on.

## Output — `<area>.json` in this folder
{ "area": "<area>", "date": "2026-11-0x",
  "items": [ { "key": "…", "what": "…", "value": 0, "unit": "VND/kg | USD/t | VND/month | % …", "currency": "VND|USD",
               "vat": "incl | ex | unknown", "scope": "…", "date": "YYYY-MM-DD", "url": "https://…",
               "quote": "verbatim text holding the number", "seenIn": "page | pdf | search-snippet", "notes": "…" } ],
  "notFound": [ { "key": "…", "tried": "…" } ] }
Report back: counts, the items you trust most, anything doubtful.
