# Rate research round — 30 Oct 2026 (UK, China, India, Poland, Hungary)

**Goal.** Replace the remaining UNSOURCED figures in CostVision's rate books with sourced ones. A per-£ trace of 40
real parts found that, in every country, the cost not yet on a sourced rate is: machine capital (most machines' capex
is a held "target £/h" build-up, scaled by a country factor), a few materials (carbon prepreg, alloy / 6082 bar, filled
compounds, rubber compounds), tooling / bought-in services (UK £ × a factor), and overhead % / packaging (a held
multiplier). Accuracy is the only goal.

**Never invent a number.** Every figure needs a URL, the date it applies to (or the page's date), and its kind: list
price, dealer offer NEW, public tender / procurement award (e.g. EU TED, Hungarian / Polish public procurement, India
GeM contract), company annual report (e.g. an average selling price = segment revenue ÷ units, arithmetic shown),
exchange settlement, survey, statute. "Not found" is a correct answer. Derived figures show their arithmetic.

**Not a price:** a marketplace listing (Alibaba, Made-in-China, 1688, IndiaMART, eBay, Allegro, Jófogás) or a used
machine — at most a labelled cross-check. A machine price must be for the SAME SCOPE as the library machine named in
your task (a bare press is not a press line; "may include auxiliaries" must be said).

**Network.** This session's proxy refuses most direct page fetches; if a fetch fails, read the figure from the search
result for that URL and mark `"verify": true`. Never cite a page you have not seen in a result.

**Currency.** Give each figure in the currency the source gives; the config builder converts. Ex-VAT / ex-GST.

**Output.** Write ONE JSON file in `research/` under the name your task gives:
`{ "domain", "researched": "2026-10-30", "items": [ { "key", "country", "value", "unit", "currency", "basis", "source", "date", "kind", "scope", "verify", "notes" } ], "notes": [] }`
Change nothing else.

**Search budget.** Eight researchers share the budget: at most 18 web searches. Reuse first: earlier research files in
`scripts/rate-refresh/*/research/*.json` may already hold a figure — copy it with "carried from <file>".

**Reply** with one short paragraph: found, not found, and any book figure you are confident is wrong.
