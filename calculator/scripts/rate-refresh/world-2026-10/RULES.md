# World rate round — rules for every researcher (30 Oct 2026)

**Goal.** Give every one of CostVision's 39 manufacturing countries its OWN rates — no unsourced UK multiplier.
Six countries already have a researched book (UK, Germany, China, India, Poland, Hungary). This round covers the other
33: France, Italy, Spain, Czechia, Romania, Sweden, Netherlands, Belgium, Portugal, Slovakia, Slovenia, Lithuania,
Bulgaria, Austria, Serbia, Turkey, USA, Canada, Mexico, Brazil, Japan, South Korea, Taiwan, Thailand, Vietnam,
Malaysia, Indonesia, Philippines, Singapore, Morocco, Tunisia, Egypt, South Africa. Accuracy is the only goal.

**What is already fetched (do NOT research it again)** — `official/*.json`, read from the publishers' APIs:
ECB euro reference FX (all but EGP, MAD, RSD, TND, TWD, VND); Eurostat labour cost per hour worked in manufacturing
(2025) + the labour cost index to 2026-Q2 + SES 2022 earnings by ISCO major group, and non-household electricity / gas
prices to 2026-S1 for the EU countries, Serbia and Turkey; ECB loan rates (euro area); World Bank lending rates;
ILOSTAT monthly earnings by ISCO major group (non-EU); 2026 public holidays.

**Network.** Full access this round: OPEN the page and read the figure on it. A figure read only from a search-result
snippet must say so (`"verify": true`). Prefer an official API, statistics office, regulator, central bank, exchange,
statute or company annual report over a news article.

**Never invent a number.** Every figure needs: a URL you opened, the date it applies to (or the page date), and its
kind (statute, regulator tariff, statistics office, central bank, exchange settlement, price agency headline, company
annual report, list price, tender award, broker market report). "Not found" is a correct answer. A derived figure shows
its arithmetic. Not a price: marketplace listings (Alibaba, IndiaMART, eBay…), used machines, AI-written summaries.
Give each figure in the currency the source gives; ex-VAT / ex-GST.

**Same scope.** A figure must measure the thing named: an industrial (not household) tariff; a manufacturing (not
all-economy) wage where one exists; prime logistics / industrial rent (say which); straight-line TAX depreciation of
general plant & machinery (say the rate and the statute).

**Output.** ONE JSON file in `research/` under the name your task gives:
`{ "domain", "researched": "2026-10-30", "items": [ { "key", "country", "value", "unit", "currency", "basis", "source",
"date", "kind", "scope", "verify", "notes" } ], "notes": [] }` — `country` is the CostVision code (FR, IT, ES, CZ, RO,
SE, NL, BE, PT, SK, SI, LT, BG, AT, RS, TR, US, CA, MX, BR, JP, KR, TW, TH, VN, MY, ID, PH, SG, MA, TN, EG, ZA). Use the
key names your task gives. Change nothing else in the repository.

**Search budget.** Several researchers share it: at most 25 web searches each. Open pages directly when you know the
publisher (PwC tax summaries, statistics offices, regulators) instead of searching. Reuse first: earlier research in
`scripts/rate-refresh/*/research/*.json` may already hold a figure — copy it with "carried from <file>" only if you
re-open its page.

**Reply** with one short paragraph: what you found, what you did not, and anything in the official layer that looks wrong.
