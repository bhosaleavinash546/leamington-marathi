# Round 4 — independent price review (13 Oct 2026). Read fully, with `../../RULES.md`.

You are a REVIEWER, not the researcher. Another agent recorded the prices in your list. Your job: check, independently,
whether each recorded price is real and right, before it enters a catalogue that prices customer PCBs. Assume nothing in
the list is correct until you have seen it yourself.

For EACH part in your list (`review/<your list>.json`):
1. Search for the part's distributor price yourself (WebSearch only; WebFetch is blocked). Prefer the SAME distributor and
   break the researcher recorded; a second franchised distributor is even better.
2. Check the ORDERABLE CODE exists as written (a distributor or the maker lists it), and that `desc` / `aecq` are right
   (is it really AEC-Q qualified? is the value / rating right?).
3. Give one verdict:
   - `CONFIRMED` — you saw a franchised-distributor price within ±25% of a recorded observation at a comparable break
     (state what you saw, with URL).
   - `CORRECT` — the part is real but a recorded number is wrong or unverifiable, and you found a valid replacement:
     give the replacement observations in the `../../RULES.md` shape (distributor, qty ≥ 100, price, currency, url, date
     "2026-10-13"). Only franchised distributors on their own site or an aggregator naming them (Findchips, Octopart,
     TrustedParts, Digipart). Never punchouttest.*, fat.lcsc.com, OEMsTrade, brokers, Source ESB, datasheet sites.
   - `DROP` — the code does not exist as written, the price is wrong and you cannot find a valid one, or it was read
     from a disallowed source. Say why.
   - `UNVERIFIED` — your searches neither confirmed nor contradicted it (say what you tried). Use sparingly.
   - Also set `aecqCorrect: true|false` and `codeExists: true|false|null`.
4. Never invent a price. A rounded figure ("about $0.56") from a search summary is NOT a confirmation of an exact price.

Budget: at most **20 WebSearch calls** in total (other reviewers are searching too). Order your work so the
highest-value parts (most expensive first) are checked first; mark the rest `UNVERIFIED` with "budget" if you run out.

Output: write ONE file, `review/<your list name>-verdicts.json`:
```json
{ "reviewer": "<list name>", "reviewed": "2026-10-13",
  "verdicts": [ { "mpn": "...", "verdict": "CONFIRMED|CORRECT|DROP|UNVERIFIED", "codeExists": true, "aecqCorrect": true,
                  "evidence": "what you saw, with URL", "replacementObservations": [] } ],
  "notes": [] }
```
Write only that file. Do not run git. Reply only with one paragraph: counts per verdict, searches used, and the most
serious problem you found.
