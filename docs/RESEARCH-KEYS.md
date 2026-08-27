# Research keys for Horizon deep research

Horizon's deep research needs three keys. Only the first is mandatory; the
other two decide whether the research finds anything worth reporting.

| Key | Cost | Without it |
|---|---|---|
| `ANTHROPIC_API_KEY` | paid | Deep research refuses to run (it will not guess) |
| `BRAVE_API_KEY` | free tier available | **The run finds zero sources and returns an empty report** |
| `PATENTSVIEW_API_KEY` | free | Patent claims — the best free technical source — are skipped |

## Getting the keys

**Brave Search API** — <https://brave.com/search/api/>
Create an account, choose the free "Data for Search" tier, and copy the key
from the dashboard. Keys look like `BSAxxxxxxxxxxxxxxxxxxxxxxxx`. The free tier
is rate-limited (roughly one query per second and a monthly cap); a deep run
issues 10–40 search queries, so the free tier suits a handful of runs per day.
Check their current pricing page before relying on any specific limit.

**PatentsView** — <https://patentsview.org/> → API → request an API key.
It is free for research use and issued by email, usually within a day or two.

## Installing them

Create a file called `.env` in the repository root (it is gitignored — it must
never be committed):

```
ANTHROPIC_API_KEY=sk-ant-...
BRAVE_API_KEY=BSA...
PATENTSVIEW_API_KEY=...
```

`server.mjs` loads this file at startup, so **restart the server** after
editing it. There is no hot reload for environment variables.

For the CLI, the same file is not read automatically — pass them inline:

```bash
export $(grep -v '^#' .env | xargs)
npm run horizon:deep -- --depth deep "stator lamination"
```

## Alternative: the Brave key from the UI

A Brave key can also be saved in the app on the **Analyze** page
("Brave Search API Key"), which stores it in the browser. Horizon's deep
research reuses that saved key automatically, so a key entered there works
for both features without touching `.env`. The Anthropic key works the same
way via **Settings**.

Environment variables are the better choice for a shared deployment (one key,
all users); browser storage suits a single analyst on their own machine.

## Verifying they work

```bash
npm run horizon:deep -- --depth standard "stator lamination"
```

The header prints what it found:

```
search: Brave · patents: PatentsView
```

`NONE` for either means that key is not reaching the process. Then check the
run's own honesty output — the LIMITATIONS block names every capability that
was missing, and the ledger shows which sources were actually opened.

## What no key can buy

Paid engineering databases — SAE Mobilus, IEEE Xplore, ScienceDirect — need
institutional subscriptions and are **not** searched. Every deep report states
this. Patent claims carry much of that weight instead, which is why the free
PatentsView key matters more than its price suggests.
