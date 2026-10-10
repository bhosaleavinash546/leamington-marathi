# India rate book research — rules (10 Oct 2026)

Goal: India's OWN rates for CostVision, an average of the four main manufacturing clusters
(**Pune, Chennai, Bengaluru, Delhi NCR**), **3-shift** working, effective **October 2026**. The current India book
(`current-india-book.json`) is the UK book × a few factors; a Director found it wrong. Accuracy is the only goal.

**Never invent a number.** Every figure needs a URL + the date it applies to (or the page's publish date), and what it
is (list price / transaction / tender / survey / regulator order). "not found in any source" is a correct answer.
If you derive a figure (e.g. CTC from a salary), show the arithmetic.

Prefer, in order: Government / regulator (Labour Bureau, state Minimum Wages notifications, MERC/TNERC/KERC/DERC tariff
orders, JPC, PPAC, Rubber Board, CBIC customs tariff, RBI), producer list prices (SAIL, Tata Steel, JSW, Hindalco,
NALCO, Reliance, IOCL, GAIL, Haldia), market reporters' public pages (BigMint/SteelMint, Mysteel, Fastmarkets public
summaries, Metal Junction, ICIS public pieces), industry surveys and recruiter salary data (Naukri, AmbitionBox,
Glassdoor, Payscale, Indeed India, TeamLease), then trade press (ET, Business Standard, Autocar Pro, Plastics Insights).
Never a reseller's B2B listing (IndiaMART / TradeIndia) as a PRICE — at most as a cross-check, and say so.

Money in INR. State whether a price includes GST (we need ex-GST, ex-works / delivered to a plant in the cluster).
Use dates from 2026 where they exist; older figures only with a stated reason (e.g. the latest tariff order).

Output: a JSON file in `research/` (name given in your task) with
`{ "domain", "researched": "2026-10-10", "items": [ { "key", "value", "unit", "basis", "source": "<URL>", "date", "notes" } ], "notes": [] }`
plus, where asked, derived figures with their arithmetic in `basis`. Write that file and change nothing else.
Reply with ONE short paragraph: what you found, what you could not, and any figure in the current book you are
confident is wrong (current vs evidence).
