# UK rate book research — rules (10 Oct 2026)

Goal: the UK's OWN rates for CostVision's base book (every other country is derived from it), for a UK automotive
tier-1/tier-2 supplier (West Midlands / North-East / North-West average), 2-shift working, effective **October 2026**.
The current UK book (`current-uk-book.json`) has known errors: machine capital and power draw far above real machine
prices (a 3-axis VMC carries £55,660/yr depreciation), and casting £/kg defined as a DELIVERED FOUNDRY price
("index + alloying + melt/cast/finish stockholder margin") while the engine adds melting, labour, line, overhead and
margin again. Accuracy is the only goal.

**Never invent a number.** Every figure needs a URL + the date it applies to (or the page's publish date), and what it is
(list price / transaction / index / survey / regulator statistic). "not found in any source" is a correct answer. If you
derive a figure, show the arithmetic.

Prefer, in order: UK Government statistics (ONS ASHE, DESNZ Quarterly Energy Prices, HMRC rates), regulator / central
bank (Bank of England), producer list prices and official price indices (LME, Eurofer/MEPS public summaries, Fastmarkets /
Argus / Platts public pieces, BMRA / letsrecycle scrap prices, Outokumpu / Acerinox alloy surcharges, plastics price
reporters' public pages — Plasticker, PIE, ICIS public), machine makers' published list prices and UK dealers' price
lists, commercial-property agents' UK industrial rent reports (Savills, Knight Frank, CBRE, JLL, Colliers), recruiter /
salary surveys (Hays, Reed, Totaljobs, Indeed UK, Make UK), trade press. Never a marketplace listing as a PRICE — only as a
cross-check, and say so.

Money in GBP (state the FX if converted; use the date's rate). Prices ex-VAT, delivered to a UK plant where possible.
Use dates from 2026 where they exist; older figures only with a stated reason.

Output: a JSON file in `research/` (name given in your task) with
`{ "domain", "researched": "2026-10-10", "items": [ { "key", "value", "unit", "basis", "source": "<URL>", "date", "notes" } ], "notes": [] }`
plus derived figures with their arithmetic in `basis`. Write that file and change nothing else.
Reply with ONE short paragraph: what you found, what you could not, and any current-book figure you are confident is
wrong (current vs evidence).
