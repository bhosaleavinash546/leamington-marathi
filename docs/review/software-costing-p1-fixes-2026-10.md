# Software costing — P1 fixes: before / after (October 2026)

Branch `claude/sw-costing-p1-fixes`. The review that found these is `docs/review/software-costing-360-2026-10.md`; this
page shows what each P1 fix changed and why. Baseline: `calculator/scripts/sw-review/baseline-before.json` (saved before
any fix) and `baseline-after.json`; reproduce with `npx tsx scripts/sw-review/baseline.ts <out.json>` on any commit.
Every fix is its own commit with a test in `calculator/tests/sw-p1-fixes.test.ts`.

## 1. What changed, fix by fix

| # | Fix | Commit | What it does | Moves the numbers? |
|---|---|---|---|---|
| — | Baseline saved | `bd9c5f8` | Snapshot of the default programme, all 20 vehicle demos and the back-test | — |
| 3 | One overhead default | `c700a8b` | Engine, screen fallback, wizard tooltip, all demos and the 3 report scripts use 1.15. They used 1.55–1.62, which the engine's own comment says counts benefits twice | **Yes — every demo −20 to −25 %** |
| 2 | Company rate book honoured | `11a7a22` | The base-rate field overrides only when typed; demos and the saved-config comparison keep the company book | No (no company book in the baseline) |
| 7 | No invented savings | `21510be` | Removed "30–50 %", "25–35 %", "+15 %", "~40 %", "cloud is the main driver", "healthy"; the AI narrative is told to add no numbers | No (text only) |
| 6 | Benchmarks labelled unverified | `f262bd4` | One list for the table and the back-test; every figure marked "Unverified" (no source links); the peer-median claim is withheld; no test pins the model to these figures | No |
| 1 | Base effort: one definition | `74d03ec` | Base person-months are NOMINAL (QM, Medium, fresh) — as the engine, its formula document and its back-test already treated them; the contradicting comment is corrected and the meaning pinned by a test | No (definition) |
| 20 | ASIL uplift sourced, applied once | `71bcb0c` | Development ×1.00 / 1.18 / 1.40 / 1.60 / 1.82 (QM→D; B and D from Solcept, A and C interpolated, all Low confidence with the link); the test share no longer rises with ASIL on top | **Yes — −26 to −37 % on top of #3** |
| 4 | ICE / hybrid modules | `02dee82` | Engine control, transmission, after-treatment / OBD, hybrid supervisor, 48 V BSG — every figure copied from a named existing module, labelled "estimate" | No (default off) |
| 5 | Powertrain in the engine; shared software apportioned | `dbdf3b4`, `9e1e826` | One powertrain scope used by the screen (new picker in the wizard and the advanced form), the demos and the scripts; a platform-volume input attributes shared software to a variant by its volume share | **Yes — ICE / MHEV / PHEV variants gain their powertrain software; BEV unchanged** |
| — | Static reports labelled | `a056eea` | The pre-generated report pages pre-date these fixes and now say so | No |

## 2. Baseline re-run — £M programme total

| Programme | Before | after #3 overhead | after #20 ASIL | **After (all P1)** | Change | £ / vehicle | Modules |
|---|---|---|---|---|---|---|---|
| Default programme (BEV stack, UK) | 494.2 | 494.2 | 320.9 | **320.9** | -35% | £618 → £401 | 43 → 43 |
| Range Rover L460 (PHEV) | 539.6 | 420.0 | 271.7 | **294.8** | -45% | £899 → £491 | 49 → 53 |
| BMW X7 (48V MHEV) | 305.2 | 239.7 | 176.9 | **193.7** | -37% | £636 → £403 | 42 → 47 |
| Audi Q8 (48V MHEV) | 312.6 | 249.6 | 187.5 | **205.2** | -34% | £631 → £415 | 42 → 47 |
| Mercedes GLS 450 (48V MHEV) | 489.6 | 371.1 | 265.5 | **293.2** | -40% | £1,209 → £724 | 42 → 47 |
| Porsche Cayenne Electric (2026) | 616.1 | 459.5 | 291.2 | **291.2** | -53% | £1,540 → £728 | 49 → 49 |
| Porsche Cayenne E-Hybrid (PHEV) | 593.5 | 443.4 | 284.7 | **310.0** | -48% | £1,484 → £775 | 49 → 53 |
| Porsche Cayenne (48V MHEV) | 456.1 | 344.7 | 244.0 | **271.0** | -41% | £1,140 → £678 | 42 → 47 |
| Porsche Cayenne V8 (ICE) | 446.2 | 337.6 | 239.7 | **254.3** | -43% | £1,116 → £636 | 40 → 43 |
| Range Rover L460 (ICE) | 411.3 | 323.7 | 230.5 | **243.9** | -41% | £686 → £406 | 40 → 43 |
| Range Rover L460 (MHEV) | 420.0 | 330.2 | 234.5 | **259.2** | -38% | £700 → £432 | 42 → 47 |
| Range Rover L460 (BEV) | 559.2 | 434.6 | 277.6 | **277.6** | -50% | £932 → £463 | 49 → 49 |
| BMW X7 (ICE) | 299.3 | 235.3 | 174.2 | **183.2** | -39% | £624 → £382 | 40 → 43 |
| BMW X7 (PHEV) | 390.3 | 302.0 | 203.4 | **219.0** | -44% | £813 → £456 | 49 → 53 |
| BMW X7 (BEV) | 403.1 | 311.1 | 207.2 | **207.2** | -49% | £840 → £432 | 49 → 49 |
| Audi Q8 (ICE) | 306.5 | 245.0 | 184.7 | **194.2** | -37% | £619 → £392 | 40 → 43 |
| Audi Q8 (PHEV) | 399.4 | 314.0 | 215.6 | **232.0** | -42% | £807 → £469 | 49 → 53 |
| Audi Q8 (BEV) | 412.3 | 323.4 | 219.5 | **219.5** | -47% | £833 → £443 | 49 → 49 |
| Mercedes GLS 450 (ICE) | 479.6 | 363.9 | 261.0 | **276.0** | -42% | £1,184 → £682 | 40 → 43 |
| Mercedes GLS 450 (PHEV) | 628.3 | 470.9 | 307.4 | **333.4** | -47% | £1,551 → £823 | 49 → 53 |
| Mercedes GLS 450 (BEV) | 651.1 | 487.0 | 314.0 | **314.0** | -52% | £1,608 → £775 | 49 → 49 |

**Why each number moved**

- **Overhead (#3)** — every demo ran at 1.55–1.62 against a base rate that already includes benefits; 1.15 is the
  facilities-only overhead the engine was built around. The default programme already used 1.15, so it did not move.
- **ASIL (#20)** — the old factors made an ASIL-D module cost about ten times its QM self (testing about sixteen
  times). The new factor is ×1.82 on the whole module at ASIL-D, the only published per-level figure found. This is the
  largest single change: −35 % on the default programme.
- **Powertrain (#5)** — ICE now carries engine, transmission and emissions software; MHEV adds 48 V and hybrid
  control; PHEV carries both powertrains plus hybrid supervision. On every car the order is now ICE < MHEV < BEV < PHEV
  (e.g. L460: £243.9 M, £259.2 M, £277.6 M, £294.8 M). Before, ICE carried no powertrain software and PHEV was only
  3.5 % above BEV. BEV programmes are unchanged by this fix.
- **Person-months** fall with the ASIL change (e.g. default 2,390 → 1,746 PM) — they still show the effort before the
  complexity / safety scaling (review item 9, P2, not yet fixed).

**Back-test (unverified figures):** the model now sits 19–59 % below the seven published totals (it was −36 % to +37 %).
Those figures have no source links and six of seven are internally inconsistent, so neither the old fit nor the new
gap is evidence about accuracy. The screen says "0/7 figures sourced".

## 3. Checked live

`e2e/sw-live.ts` (real server + browser):
- The wizard offers all four powertrains.
- In the advanced form: ICE £280.7 M, MHEV £299.1 M, PHEV £342.3 M, BEV £321.5 M (default settings).
- 4 estimate modules are labelled in the PHEV costing, and the 7 benchmark rows say "Unverified".
- The L460 demo loads as a PHEV with engine control on, and the stale-report note is shown. No page errors.

The live run found one bug in fix #5: switching PHEV → BEV kept the PHEV de-rating. It is fixed in `9e1e826`.

Full suite: 3,478+ tests pass; build clean.

## 4. Not done / still open

- **The ICE / hybrid module figures are estimates.** Each is copied from an analogue; replace them with sourced
  figures when available. Engine calibration in particular is likely under-stated.
- **The ASIL factors rest on one engineering blog** (read via a search extract) plus interpolation, Low confidence.
  Better than ×3.2, but not a standard.
- **Static report pages** (Study, Benchmark, Deep-Dive, All-Models, "View full report") still show pre-fix figures and
  are labelled so. The L460 deep-dive has about 20 hand-written figures, so it needs a rewrite, not a re-run
  (review item 14).
- **Accessibility (new finding, pre-existing):** axe on the software panel reports fields without linked labels
  (57 "label", 2 "select-name") and 12 contrast failures on existing controls. The panel is not in the app-wide UI audit.
  Not caused by this branch.
- **P2 / P3 items 8–19 and 21** are as listed in the review.
