# Software costing — P3 fixes: before / after (October 2026)

Branch `claude/sw-costing-p3-fixes`. The findings are in `docs/review/software-costing-360-2026-10.md` §6 (items 15–19).
Two items that were still open are fixed on the same branch:

- **B19:** the AI "no key" reply was cached as if it were a real answer.
- **The panel's accessibility failures.** The P2 report called these "P3 in the review". That was wrong: the review
  never ranked them.

**Baseline:** `calculator/scripts/sw-review/baseline-p3-before.json`, saved before any fix, and `baseline-p3-after.json`.
`baseline.ts` was re-run in a worktree of every fix commit.

**Tests:** each fix is its own commit, with a test in `calculator/tests/sw-p3-fixes.test.ts`.

Tags: **Verified** (code and test or live run), **Likely**, **Unverified**.

## 1. What changed, fix by fix

| # | Fix | Commit | What it does | Moves the numbers? |
|---|---|---|---|---|
| — | Baseline saved | `24619e9` | Snapshot of the default programme, 20 demos and the back-test | — |
| 19 | Headline percentile stated | `00d03b8` | The Monte Carlo reports where the headline sits in its own band (`headlinePercentile`). The panel, PDF and Excel say so next to P50. Default: **about P33** (headline £388.7 M, P50 £402.4 M) | No |
| 17 | Cloud per connected vehicle; tool licences over development | `5ed275d` | See below | **Yes — default −£4.5 M; demos −3 to −8 %** |
| 18 | Rate workbook validated and versioned | `c789225` | See below | No |
| 15 | Results in the display currency | `417f053`, `1e77ebd` | See below | No (display) |
| 16 | Optional size-based effort | `7d9f88a` | See below | No (off until a size is entered) |
| B19 | AI "no key" notice not cached | `77f1755` | `/api/aichat` flags the notice (and an empty model reply) with `aiUnavailable`. The panel caches only real replies; before, a cached notice kept showing after a key was added | No |
| a11y | Panel passes axe WCAG 2.1 AA | `6fe763f` | See below | No |
| — | Live check + after-snapshot | `3a03e2e` | `e2e/sw-live.ts` covers every P3 fix | No |

### #17 Cloud and tool licences

- **Cloud:** each module's flat £ / yr is re-expressed per connected vehicle-year.
  - The reference fleet is the default programme's average fleet in service: 80,000 × (1 + … + 10) / 10 = 440,000.
    That the module figures were written for that programme is **Likely**; nothing documents it.
  - The fleet grows by the annual volume each year until the programme ends (the same rule as map data).
  - Cloud is charged per vehicle and is not shared across a platform.
  - New input: connected share.
- **Tool licences:** they now run over `developmentMonths` (default 90, the tool's own M1–M90 phase timeline) instead of
  the production life. The phase table follows the same duration.

### #18 Rate workbook

- A misspelt key (e.g. "Indai") is refused, and the error lists the known keys.
- Also refused: a 0 multiplier, a value above 20 (a £ figure typed into a multiplier cell), and a key listed twice.
- The base rate must be £1,000–500,000 / PM. The engine shares this range: "28" typed for £28k was accepted by both (B8).
- Upload, source switch and reset each record the resolved book in the version store. New endpoints:
  `GET /sw/versions` and `GET /sw/versions/:id`.

### #15 Display currency

- `sw-currency.ts` takes the page's currency code, symbol and FX rate.
- The cards, Monte Carlo, all tables, the rate table, the PDF and the Excel (values and headers) now follow it.
- Inputs stay in £, as the app's money rule says.
- **Bug found live, fixed in `1e77ebd`:** `result.inputs` was the live inputs object. A redraw after editing the form
  re-costed from half-typed values and threw; the engine now keeps a copy.

### #16 Size-based effort

- A module may take a size in KSLOC. Its nominal effort is then **COCOMO II.2000**: PM = 2.94 × KSLOC^1.0997, with
  nominal scale factors (Boehm et al., *COCOMO II Model Definition Manual* v2000.0).
- ASIL, complexity, reuse and the effort calibration apply on top as before. A custom PM still wins.
- Logged actuals may carry a size, so calibration compares like with like.
- The Excel and the rate basis show the effort basis of each module.

### Accessibility

- **label (57):** linked labels (`for=`) for all 20 config fields; every module-row control is named.
- **select-name (2):** the region and dev-source selects.
- **contrast (12):** fixed with theme tokens `--sw-good` / `--sw-bad`, darker phase fills under white text, body text
  for the budget column and the gold buttons. The dark theme's muted text was 3.9:1 and is lifted.

## 2. Baseline re-run — default programme

BEV stack, UK, 80k / yr × 10 yr. All figures £M except per vehicle.

| After | Total | NRE | Lifecycle | Licensing | Cyber | £ / vehicle | P10 | P50 | P90 |
|---|---|---|---|---|---|---|---|---|---|
| Before P3 | 393.3 | 148.0 | 245.3 | 93.7 | 4.45 | 491.59 | 371.0 | 407.1 | 446.4 |
| #19 | 393.3 | 148.0 | 245.3 | 93.7 | 4.45 | 491.59 | 371.0 | 407.1 | 446.4 |
| #17 | **388.7** | **143.4** | 245.3 | 93.7 | 4.45 | **485.92** | 366.4 | 402.4 | 441.7 |
| #18, #15, #16, B19, a11y | 388.7 | 143.4 | 245.3 | 93.7 | 4.45 | 485.92 | 366.4 | 402.4 | 441.7 |

- Only #17 changed a figure in any snapshot. Every other step's snapshot is identical to the one before it, checked
  by diffing the JSON.
- On the default, #17 moves only the NRE (−£4.54 M):
  - Tool licences: 7.5 development years instead of 10 production years.
  - Lifecycle is unchanged: the cloud reference fleet *is* this programme's fleet, so its cloud reproduces exactly
    (pinned by a test).

## 3. Baseline re-run — vehicle demos (£M programme total)

| Programme | Before P3 | After | Change | NRE Δ | Lifecycle Δ (cloud) | £ / vehicle |
|---|---|---|---|---|---|---|
| Range Rover L460 (PHEV) | 342.1 | **331.4** | −3.1 % | −1.06 | −9.71 | £570 → £552 |
| BMW X7 (48V MHEV) | 230.3 | **213.8** | −7.2 % | −0.95 | −15.64 | £480 → £445 |
| Audi Q8 (48V MHEV) | 245.4 | **225.4** | −8.1 % | −2.86 | −17.08 | £496 → £455 |
| Mercedes GLS 450 (48V MHEV) | 325.6 | **300.5** | −7.7 % | −2.86 | −22.25 | £804 → £742 |
| Porsche Cayenne Electric | 321.5 | **300.1** | −6.6 % | −0.98 | −20.37 | £804 → £750 |
| Porsche Cayenne E-Hybrid | 340.3 | **318.9** | −6.3 % | −1.06 | −20.37 | £851 → £797 |
| Porsche Cayenne (48V MHEV) | 301.3 | **280.6** | −6.9 % | −0.95 | −19.78 | £753 → £701 |
| Porsche Cayenne V8 (ICE) | 284.6 | **263.9** | −7.3 % | −0.89 | −19.78 | £712 → £660 |
| Range Rover L460 (ICE / MHEV / BEV) | 291.2 / 306.5 / 324.9 | **280.9 / 296.1 / 314.2** | −3.5 / −3.4 / −3.3 % | ≈ −0.9 | −9.4 to −9.7 | |
| BMW X7 (ICE / PHEV / BEV) | 219.8 / 255.7 / 243.8 | **203.3 / 238.5 / 226.7** | −7.5 / −6.7 / −7.0 % | ≈ −1.0 | −15.6 to −16.1 | |
| Audi Q8 (ICE / PHEV / BEV) | 234.3 / 272.1 / 259.6 | **214.6 / 251.4 / 239.1** | −8.4 / −7.6 / −7.9 % | ≈ −2.9 | −17.1 to −17.6 | |
| Mercedes GLS 450 (ICE / PHEV / BEV) | 308.4 / 365.8 / 346.4 | **283.5 / 339.7 / 320.5** | −8.1 / −7.1 / −7.5 % | ≈ −2.9 | −22.3 to −22.9 | |

**Why each demo falls.** Cloud now follows each programme's own fleet in service, and every demo's fleet is smaller
than the default's:

| Programme | Fleet | Vehicle-years, as a share of the flat figure |
|---|---|---|
| L460 | 75k × 8 yr | 2.70 M vs 3.52 M (×0.77) |
| Mercedes GLS | 45k × 9 yr | 2.03 M vs 3.96 M (×0.51) |

The NRE falls because tool licences run over 7.5 years, not the 8–9-year production life. Per car, the order is still
ICE < MHEV < BEV < PHEV (L460: £280.9 M / £296.1 M / £314.2 M / £331.4 M).

**Back-test.** The variance against the 7 published figures moved by 1–7 points. The published figures are still
unverified (0 / 7 sourced), so this says nothing about accuracy.

## 4. Live check (Verified)

`npm run build && CV_OUT=<dir> npx tsx e2e/sw-live.ts` (real server, Chromium). In addition to the P1 / P2 checks:

- **Headline note:** "sits at about P33 of this band … P50 = …".
- **New fields:** development-duration and connected-share fields and 54 size inputs are present.
- **Currency, on screen:** EUR turns £371.1 M (L460 settings) into €432.3 M (= × 1.1650). The rate table reads
  "€/person-month". GBP restores £371.1 M.
- **Currency, in the Excel:** the export in EUR reads "Value (€M)", total 432.347, a per-vehicle figure in €, and a
  currency note.
- **axe on the panel:** **[]** (it was 57 label + 2 select-name + 12 contrast) and 0 page errors. This was run in the
  light colour scheme only; the dark tokens were corrected but not run through axe.

## 5. Still open or unknown

- **Cloud reference fleet:** that the module cloud figures were set for the default programme is **Likely**, not
  documented.
- **Royalty and CAL figures:** still unsourced (from P2). **Unverified.**
- **COCOMO mapping:** reading a COCOMO person-month as this tool's development PM may overlap part of the integration
  test the tool adds on top. **Likely.** Calibrate to your own projects before relying on the size path.
- **The 7 published benchmarks:** still unsourced. Accuracy is **unmeasured**: there are no real software actuals in
  the repo.
- **Static reports:** labelled, not regenerated.
- **Dark-theme axe run:** not done.
