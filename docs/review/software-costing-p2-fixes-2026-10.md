# Software costing — P2 fixes: before / after (October 2026)

Branch `claude/sw-costing-p2-fixes`. The findings come from `docs/review/software-costing-360-2026-10.md` §6, and the P1 fixes
are in `software-costing-p1-fixes-2026-10.md`. This page shows what each P2 fix changed and why.

- **Baseline:** `calculator/scripts/sw-review/baseline-p2-before.json`, saved before any P2 fix, and `baseline-p2-after.json`.
- **Per-commit re-run:** `npx tsx scripts/sw-review/baseline.ts <out.json>` was run in a worktree of every fix commit.
- **Tests:** each fix is its own commit, with a test in `calculator/tests/sw-p2-fixes.test.ts` (one describe block per fix).

Tags follow the review: **Verified** (checked in code and by test or live run), **Likely**, **Unverified**.

## 1. What changed, fix by fix

| # | Fix | Commit | What it does | Moves the numbers? |
|---|---|---|---|---|
| — | Baseline saved | `bf8bda2` | Snapshots the default programme, all 20 vehicle demos and the back-test | — |
| 8 | Invalid inputs refused | `897490d` | `validateSWInputs` runs at the top of `computeSWProgram` and throws `SWInputError` with every problem it finds. It checks: region / source in the book; life 1–40; volume 1–20 M; overhead 1–5; senior share 0–1; base rate; discount; compression; recovery; module ids; ASIL / complexity / reuse / CAL keys; custom PM. The screen shows the reason and no longer turns 0 into 10 yr / 80,000 | No (only blocks bad input) |
| 9 | Person-months = what was costed | `e321d24` | `personMonths` is now development effort after complexity, the safety-reuse floor and the schedule penalty. It used to be the figure *before* those, so BMS showed 172.8 PM while 258.5 PM were paid for. New `effortPersonMonths` covers all costed effort (dev + test + integration + cyber + calibration + ML). The card is now "Engineering Effort". The unsourced "1.4–1.7× peak headcount" line is gone | Reported PM only — £ unchanged |
| 10 | Uncertainty band follows the headline | `40bdfe9` | The Monte Carlo now includes the ML-data and homologation buckets (11 buckets). Per-vehicle per trial = NRE ÷ recovery vehicles + lifecycle ÷ life vehicles, the same rule as the headline. The volume sensitivity re-costs at 50k / 150k instead of scaling | P10 only (+£4.0 M on the default) |
| 11 | Per-vehicle royalties | `2ae4e72` | AAOS ~$25 / vehicle built, ASR engine ~£15 / vehicle built and map data £11.50 / vehicle **in service** / yr replace the flat £200–220k / yr. Each module's own note names a per-vehicle licence. Royalties are charged on this programme's vehicles and never apportioned across a platform | **Yes — +£71.3 M on the default; +£29–46 M on every demo** |
| 12 | Cyber keyed on CAL | `b728107` | The cyber share follows a per-module ISO/SAE 21434 CAL (none, CAL1–4), not the ASIL. Defaults come from the informative Annex E example table. A CAL column lets a TARA result be entered | Yes — +£0.6–1.2 M per programme |
| 13 | Screen = what was costed | `11b2b91`, `b4a91aa` | A country change moves the inputs and both hub pickers. Rate provenance, validation and the assumptions note show the active (company) book. The dev-source table re-costs through the engine | No (the default uses no company book; screen consistency) |
| 14 | Rate basis in exports | `6ba48b2` | Excel and PDF print the rate book, the base rate (typed or from the book), the multipliers, overhead, loaded £/PM, powertrain, platform volume, recovery, discount and calibration. The 24 static report pages and their docs copies carry a "Reference example" banner | No |
| 21 | Calibration to actuals | `322e214` | Log finished modules (their settings + actual effort). The factor = Σ actual ÷ Σ modelled, with n shown. It is applied only when the user chooses, and only to the model's base effort | No (off until used) |
| — | Live check + fixes | `c1b6285` | `e2e/sw-live.ts` drives every P2 fix in a real server + browser. Fixed a nearly invisible factor line on the new card | No |

## 2. Baseline re-run — default programme, step by step

The default programme is the BEV stack, UK, 80k / yr × 10 yr, 43 modules. £M except where stated.

| After | Total | NRE | Lifecycle | Licensing | Cyber | £ / vehicle | Dev PM (reported) | Effort PM | P10 | P50 | P90 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Before | 320.9 | 146.9 | 174.0 | 22.4 | 3.35 | 401.07 | 1,745.6 | — | 296.4 | 332.6 | 367.0 |
| #8 | 320.9 | 146.9 | 174.0 | 22.4 | 3.35 | 401.07 | 1,745.6 | — | 296.4 | 332.6 | 367.0 |
| #9 | 320.9 | 146.9 | 174.0 | 22.4 | 3.35 | 401.07 | **2,391.3** | **4,100.3** | 296.4 | 332.6 | 367.0 |
| #10 | 320.9 | 146.9 | 174.0 | 22.4 | 3.35 | 401.07 | 2,391.3 | 4,100.3 | **300.4** | 332.8 | 367.0 |
| #11 | **392.2** | 146.9 | **245.3** | **93.7** | 3.35 | **490.21** | 2,391.3 | 4,100.3 | 370.0 | 406.0 | 445.1 |
| #12 | **393.3** | **148.0** | 245.3 | 93.7 | **4.45** | **491.59** | 2,391.3 | **4,135.3** | 371.0 | 407.1 | 446.4 |
| #13, #14, #21 | 393.3 | 148.0 | 245.3 | 93.7 | 4.45 | 491.59 | 2,391.3 | 4,135.3 | 371.0 | 407.1 | 446.4 |

**Why each move happened**

- **#9:** £ did not move. The reported development PM rose from 1,745.6 to 2,391.3, because it now counts the effort the £ already paid for. **Verified**: the test checks development £ = PM × loaded rate.
- **#10:** two buckets were added to the uncertainty (ML data 0.70 / 1.00 / 1.40, homologation 0.80 / 1.00 / 1.30; CostVision engineering estimates). The low tail narrowed by £4.0 M. The headline did not move.
- **#11 — the reconciliation (Verified, matches the baseline to £0.1 M):**

  | Module | Royalty | Over the programme |
  |---|---|---|
  | AAOS (`ivi_os`) | $25 ÷ 1.3238 = £18.89 × 800,000 built | £15.1 M |
  | ASR engine (`voice_assistant`) | £15 × 800,000 built | £12.0 M |
  | Map data (`navigation`) | £11.50 × 80,000 × (1 + 2 + … + 10) = 4.4 M vehicle-years in service | £50.6 M |
  | Flat IP fees removed | (£220k + £200k + £220k) × 10 yr | −£6.4 M |
  | **Net** | | **+£71.3 M** (= +£89.14 / vehicle) |

  Map data is the largest line, because the fleet in service grows every year. **The figures come from each module's own note and are unsourced estimates** (tagged so on the module row and in `royaltyBasis`). "Pays until the programme ends" is CostVision's assumption: a real map contract may stop after a free period or be paid by the owner. Check it against a real contract before quoting.
- **#12:** cyber modules now take their CAL tier. Infotainment / connectivity (QM or B, network-facing) rose to CAL4 = 14 %. On the default: +£1.1 M cyber, +35 effort PM. **Unverified**: the tiers (8 / 8 / 10 / 14 %) are the old ASIL tiers re-keyed — the review found no published effort ratio per CAL — and the default CALs are engineering judgement, not a TARA.

## 3. Baseline re-run — all vehicle demos (£M programme total)

| Programme | Before P2 | After P2 | Change | of which #11 | of which #12 | £ / vehicle |
|---|---|---|---|---|---|---|
| Range Rover L460 (PHEV) | 294.8 | **342.1** | +16.1 % | +46.26 | +1.07 | £491 → £570 |
| BMW X7 (48V MHEV) | 193.7 | **230.3** | +18.9 % | +35.99 | +0.68 | £403 → £480 |
| Audi Q8 (48V MHEV) | 205.2 | **245.4** | +19.6 % | +39.48 | +0.67 | £415 → £496 |
| Mercedes GLS 450 (48V MHEV) | 293.2 | **325.6** | +11.1 % | +31.25 | +1.15 | £724 → £804 |
| Porsche Cayenne Electric (2026) | 291.2 | **321.5** | +10.4 % | +29.14 | +1.10 | £728 → £804 |
| Porsche Cayenne E-Hybrid (PHEV) | 310.0 | **340.3** | +9.8 % | +29.14 | +1.15 | £775 → £851 |
| Porsche Cayenne (48V MHEV) | 271.0 | **301.3** | +11.2 % | +29.14 | +1.15 | £678 → £753 |
| Porsche Cayenne V8 (ICE) | 254.3 | **284.6** | +11.9 % | +29.14 | +1.15 | £636 → £712 |
| Range Rover L460 (ICE) | 243.9 | **291.2** | +19.4 % | +46.26 | +1.07 | £406 → £485 |
| Range Rover L460 (MHEV) | 259.2 | **306.5** | +18.3 % | +46.26 | +1.07 | £432 → £511 |
| Range Rover L460 (BEV) | 277.6 | **324.9** | +17.0 % | +46.26 | +1.02 | £463 → £541 |
| BMW X7 (ICE) | 183.2 | **219.8** | +20.0 % | +35.99 | +0.68 | £382 → £458 |
| BMW X7 (PHEV) | 219.0 | **255.7** | +16.7 % | +35.99 | +0.68 | £456 → £533 |
| BMW X7 (BEV) | 207.2 | **243.8** | +17.7 % | +35.99 | +0.65 | £432 → £508 |
| Audi Q8 (ICE) | 194.2 | **234.3** | +20.7 % | +39.48 | +0.67 | £392 → £473 |
| Audi Q8 (PHEV) | 232.0 | **272.1** | +17.3 % | +39.48 | +0.67 | £469 → £550 |
| Audi Q8 (BEV) | 219.5 | **259.6** | +18.3 % | +39.48 | +0.64 | £443 → £524 |
| Mercedes GLS 450 (ICE) | 276.0 | **308.4** | +11.7 % | +31.25 | +1.15 | £682 → £762 |
| Mercedes GLS 450 (PHEV) | 333.4 | **365.8** | +9.7 % | +31.25 | +1.15 | £823 → £903 |
| Mercedes GLS 450 (BEV) | 314.0 | **346.4** | +10.3 % | +31.25 | +1.10 | £775 → £855 |

- Only #11 and #12 move a demo total; no other fix changes any demo by more than £1.
- The #11 rise is the same for every powertrain of one car, because royalties depend on volume and life, not on the powertrain. It is larger on higher-volume cars (the L460 at 75k / yr) than on the Cayenne / GLS.
- The per-car order from P1 holds: ICE < MHEV < BEV < PHEV. For the L460: £291.2 M / £306.5 M / £324.9 M / £342.1 M.

**Back-test (Model Validation panel).** Modelled totals rose with the royalties. Variance against the 7 published figures:

| Programme | Before → after |
|---|---|
| BMW iX | −53 % → −45 % |
| Porsche Taycan | −43 % → −38 % |
| Mercedes EQS | −59 % → −53 % |
| Range Rover | −34 % → −22 % |
| Tesla Model S | −53 % → −42 % |
| Audi Q8 e-tron | −44 % → −35 % |
| Lucid Air | −19 % → −19 % |

**This is not evidence of accuracy.** None of the 7 published figures is sourced (0 / 7 verified), and no test pins the model to them.

## 4. Live check (Verified)

`npm run build && CV_OUT=<dir> npx tsx e2e/sw-live.ts` — real server, Chromium. Results:

- A zero volume is refused on screen: *"annual volume must be 1–20,000,000 vehicles"*.
- 54 CAL selects are present; `ivi_os` = CAL4 and `navigation` = none. 3 "per-vehicle royalty" badges.
- Page country India → the software hub picker shows India and the costing re-runs there (£171.3 M, L460 settings).
- The dev-source rows come from the engine: OEM £177.2 M ×1.00, Tier-1 £171.3 M ×0.88, Startup £163.4 M ×0.72.
- Three logged actuals (Gateway ECU 80, Body Control 105, RTOS 32 PM vs model 66.2 / 95.8 / 25.5) give ×1.157 (n = 3). "Use this factor" fills the field, and Calculate moves £345.6 M → £379.8 M.
- The downloaded Excel carries the RATE BASIS block (book v1.1.0, base rate source, overhead, powertrain, effort calibration ×1.157).
- `reports/l460-deepdive.html` carries the reference-example banner.
- 0 page errors.
- **axe** on the panel: 57 label, 2 select-name, 12 contrast — the same counts as before P2. These are pre-existing and still open; the new CAL selects and the calibration fields are labelled, so they add none.

## 5. What is still open or unknown

- **Royalty figures:** unsourced, taken from each module's own note. **Unverified.** The in-service-until-programme-end rule for map data is an assumption.
- **CAL tiers and defaults:** no published effort ratio per CAL was found. **Unverified.**
- **Calibration** fits effort only and is per browser (localStorage). It is not shared across a team and not stored on the server.
- **Static reports** are labelled, not regenerated. Regenerating them with the current model is a separate step (`scripts/gen-sw-report.ts`, `gen-l460-deepdive.ts`, `gen-allmodels-deepdive.ts`). The PDF copies in `calculator/docs/*.pdf` carry no banner.
- **Accessibility:** the panel's pre-existing axe findings (above) remain. They are P3 in the review.
- **Accuracy:** still unmeasured. No real software actuals exist in the repo.
