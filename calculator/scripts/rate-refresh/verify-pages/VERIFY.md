# Verifying research figures on their pages (30 Oct 2026)

Each worklist item is a figure a CostVision rate book USES whose value an automatic check could not find on its cited
page (`status`: `page-no-figure` = the page opened but the number was not matched literally; `page-failed` = the page
did not open to a plain fetch; `no-url` = no page cited — a statute, a derivation or engineering judgement).

For each item:
1. Read the cached page text first (`cachedText` paths) — it is what the URL served today. If there is none, or it is a
   cookie wall / JS shell, open the URL yourself (curl, WebFetch, or a headless browser:
   `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`, launch with `proxy: { server: process.env.HTTPS_PROXY }`).
2. Find the figure the `basis` quotes (it may be in another unit or currency — €/t v €/kg, HUF v EUR — or a range; check
   the arithmetic in `basis`).
3. Give ONE verdict:
   - `confirmed` — the quoted source figure is on the page (quote the sentence / table cell);
   - `differs` — the page shows a different figure for the same thing (give `pageValue`, quote it, and say whether the
     page has been UPDATED since the research date or the research misread it);
   - `not-on-page` — the page opens but does not contain the figure (moved, paywalled, different content);
   - `unreachable` — the page will not open (HTTP code / reason);
   - `derived-ok` / `derived-wrong` — for `no-url` items: re-do the arithmetic in `basis` from the figures it names
     (which must themselves be in other items); say which;
   - `statute-confirmed` / `statute-not-found` — a law / regulator figure checked on the official text.
   Never guess. "not-on-page" and "unreachable" are honest answers.
4. Write ONE JSON array to `verify-pages/verdicts/<worklist name>.json`: `[{ "file", "i", "key", "verdict", "pageValue",
   "quote", "url", "notes" }]` — one entry per worklist item, same order. Change nothing else in the repository.

Use the cached text and direct page opens; at most 15 web searches (only to find where a moved page went).
