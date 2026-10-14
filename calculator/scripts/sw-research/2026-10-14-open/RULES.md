# Research rules — software costing open items (14 Oct 2026)

Accuracy is the goal. A figure enters the model only if it can be traced.

1. Record ONLY figures that a search result (title + snippet) or an opened page states. Copy the exact words that
   carry the number into `quote`. Never compute, round, convert or "typical"-ise a figure inside a record — put any
   arithmetic in a separate `derivation` field that shows every step.
2. Every record: `topic`, `figure` (as stated, with unit and currency), `quote`, `source` (publisher + title),
   `url`, `date` (publication or data date as stated; "n/s" if none), `geography`, `access` ("page" if the page was
   opened, "search-snippet" if read from the result only), `confidence` (High = primary source — regulation text,
   company filing / annual report, official price list; Medium = reputable secondary — analyst, trade press quoting a
   named source; Low = blog, forum, vendor marketing, undated).
3. Prefer primary sources: regulations (UNECE, EUR-Lex), company annual reports / investor results, official price
   pages (AWS, Azure), government rate cards (UK G-Cloud / Crown Commercial), statistics offices.
4. "NOT FOUND" is a valid, useful answer. Never fill a gap with an estimate, a memory, or a figure from a different
   product presented as this one. If only an adjacent figure exists, record it and say what it is NOT.
5. Note conflicts: when two sources disagree, record both.
6. Search budget is shared across parallel agents — stay within your allowance and stop when it is spent.
7. Output: one JSON array of records + a short markdown summary of what was and was not found, saved to the file
   path you are given.
