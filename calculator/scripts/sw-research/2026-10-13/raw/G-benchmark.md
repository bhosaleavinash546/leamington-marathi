# Task G — Software should-cost: world-class benchmark and capability gaps (13 Oct 2026)

**Scope.** Benchmarks CostVision's automotive software should-cost (`src/engine/sw-should-cost.ts`,
`src/ui/panels/sw-should-cost-ui.ts`) against commercial estimators and published practice. It does **not** repeat the
feature table of `docs/review/software-costing-360-2026-10.md` §5 (size inputs, effort model, reuse, rates, ASIL, cyber,
V&V, maintenance, risk, calibration, COTS, price); it adds **outputs, visuals, UX patterns, the gap ranking, and the
schedule / staffing equations**.

**How this was researched — read before quoting.** 14 web searches (budget 14). **WebFetch failed on every host tried
(`getaddrinfo ENOTFOUND` for totalmetrics.com, qsm.com, rose-hulman.edu, en.wikipedia.org)**, so — as in the 8 Oct
review — every external statement below rests on the **search engine's extract of the cited page, not a full read**.
Tag: **[SE]** = seen in a search extract of that URL. **[Code]** = read in this repo today. **[Judgement]** = my own
opinion / arithmetic, not a source. Spot-check any [SE] cell in a browser before it goes in front of a customer.

---

## 1. What CostVision has today (Code, 13 Oct 2026)

- Guided wizard (default) + Advanced panel; 49+ automotive modules in categories A–G; powertrain scope ICE/MHEV/PHEV/BEV;
  ASIL, complexity, reuse, CAL per module; optional `sizeKSLOC` → COCOMO II.2000 nominal PM (A 2.94, B 0.91, ΣSF 18.97,
  so E = 1.0997) [Code `sw-should-cost.ts:1322–1331`].
- Results are **tables plus a few small SVGs**: KPI cards, Monte Carlo P10/P50/P90 (+ headline percentile), a
  "Programme Milestone Phases" bar, cost by category, 10-dimension composition, module detail, a tornado-style
  sensitivity **table**, unverified benchmarks, dev-source decomposition, insights, AI narrative [Code UI sections at
  lines 1618–1957].
- Saved configurations compared side by side ("Compare All") [Code `sw-should-cost-ui.ts:2447`].
- Calibration: one ratio-of-sums `effortCalibration` from the user's logged actuals [Code `sw-calibration.ts`].
- **No schedule model.** Phases are fixed NRE shares 5/15/50/20/10 % over M1–M90 scaled to `developmentMonths`
  [Code `buildPhases`, `sw-should-cost.ts:1479`]. "Average FTE" = total effort ÷ (**production** life × 12)
  [Code UI `:1586`, `:1946`] — [Judgement] this divides development effort by production years, so it is not a staffing
  figure an engineering manager would recognise; there is no peak staff, no duration derived from effort, and no
  compression penalty.

## 2. Product-by-product: inputs, outputs, visuals, UX

### 2.1 Galorath SEER for Software (SEER-SEM; now marketed with "SEERai")
- **Inputs.** Size (SLOC, function points, use cases — prior review [1–3]); **knowledge bases** chosen for *Platform,
  Application, Acquisition Method, Development Method, Development Standard, Class*, which set baseline values for
  "more than 50 parameters"; each parameter takes a rating from **Very Low (VLo−) to Extra High (EHi+)** [SE]
  https://arxiv.org/pdf/1508.00032 and https://ipfs.aleph.im/ipfs/QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco/wiki/SEER-SEM.html
- **Outputs.** "a group of models … to provide estimates of effort, duration, staffing, and defects" [SE]
  https://en.wikipedia.org/wiki/SEER-SEM. Output list: *Schedule — elapsed schedule for all activities; Staffing
  Profiles — resources required by month; Support/Maintenance — effort/cost for a defined maintenance period;
  Quality/Defects — defect tracking during development and defects delivered at completion* [SE]
  https://totalmetrics.com/__data/assets/pdf_file/0018/6840/SEER-for-Software.pdf
- **Visuals / tracking.** Staff level (FTE) vs elapsed months comparing *effective*, *optimal* and *planned vs actual*
  staffing; tracking views where a rising defect-reporting rate flags a worsening trend, with user thresholds and a health
  indicator [SE] https://ndia.dtic.mil/wp-content/uploads/2008/cmmi/Track5B/Wednesday/7173galorath.pdf . Boeing (2013)
  lists actual/predicted cost and schedule vs baseline, a **stoplight summary**, staffing profiles default and
  constrained [SE] https://ndia.dtic.mil/wp-content/uploads/2013/system/W16050_Rahmani.pdf
- **What-if / calibration.** Vendor pages stress what-if staffing scenarios and resource modelling [SE]
  https://galorath.com/seer/use-case/resource-allocation/ ; calibration to the customer's own history (SSA case study:
  "capability to be calibrated to SSA's experience") [SE]
  https://galorath.com/wp-content/uploads/2025/04/Social-Security-Administration-SSA-SEER-SEM-.pdf ; Monte Carlo
  P50/P80/P95 and the DoD SRDR dataset were covered in the prior review ([5], [6]).
- **UX pattern.** Template-first: pick knowledge bases → defaults filled → override the parameters that matter.

### 2.2 QSM SLIM-Estimate (+ SLIM-Control, SLIM-Metrics, SLIM-DataManager)
- **Inputs.** Size (any unit via gearing factor — prior review [23]) and **Productivity Index (PI)**: "a macro level,
  empirically-based productivity measure … integral part of the Putnam Model", influenced by application type and
  complexity, team skill, management, requirements stability, tools, method; PI is computed from completed projects'
  size, effort and duration and used to calibrate new estimates; with no history the QSM database PI is the default
  [SE] https://qsm.com/slim-metrics
- **Model.** "a macro model based on the software equation described in *Measures for Excellence*"; effort computed in
  person-years [SE] https://qsm.com/slim-metrics (same search; the extract attributes it to QSM FAQ material).
- **Outputs / visuals.** A *solution panel* with a smooth theoretical **Rayleigh** staffing curve vs an average monthly
  staffing chart; small projects (< 18,000 LOC) tend to a front-loaded Rayleigh, large (> 100,000 LOC) peak near the end
  of phase 3; **defect discovery Rayleigh curve** with priority classes as % of the curve; MTTD [SE]
  https://qsm.com/faq-page/47 , https://qsm.com/faq-page/46 , https://www.infoq.com/articles/understanding-quality-reliability-qsm/
- **What-if.** SLIM-Control "tradeoff forecast" — see the impact of more / fewer staff on schedule and apply it to the
  forecast [SE] https://www.qsm.com/faq-page/37
- **Benchmark.** SLIM-Metrics rates a project 1–5 stars against **reference trend lines** (size, effort, duration,
  defects, staff) [SE] https://qsm.com/slim-metrics ; portfolio analysis in the product line [SE]
  https://www.qsm.com/node/1455
- **Caveat.** A 2024 critique argues Putnam's software equation does not fit data — "Putnam's software equation
  debunked" [SE] https://shape-of-code.com/2024/11/17/putnams-software-equation-debunked/

### 2.3 Unison (formerly PRICE Systems) TruePlanning
- Search found **no software-model documentation** (only hardware walkthroughs: six activities across two phases)
  [SE] https://www.unisonglobal.com/blog-posts/what-does-that-button-do-trueplanning . Vendor: "activity-based estimates
  of cost, schedule and uncertainty" [SE] https://www.unisonglobal.com/product/cost-engineering . Inputs per prior review
  (SLOC / FP / use-case points, rates by labour resource, DO-178 calculator). **Not verified:** its software outputs.
- [Judgement] Its distinctive UX is the **cost-object tree** (a programme as a tree of hardware + software + system
  cost objects, one roll-up) — this is CostVision's natural home for software alongside its hardware commodities.

### 2.4 COCOMO II / COCOMO III
- COCOMO II.2000 effort PM = A·Size^E·ΠEM, E = B + 0.01·ΣSF (prior review [36]); schedule in §4 below.
- **COCOMO III** (Clark, PSM 2019): still a **draft**, "next step is to calibrate the model to real-world data";
  adds **functional size inputs** and a new **Software Security** parameter; some driver nominals shifted, some split /
  dropped [SE] https://www.psmsc.com/UG2019/Presentations/p9-Clark-COCOMO%20III%20Data%20Collection.pdf ; Delphi on driver
  ranges [SE] https://psmsc.com/UG2018/Workshops/w6-out-Clark-PSM%202018%20COCOMO%20III%20Workshop%20Outbrief.pdf .
  **No 2020–2026 release found.**

### 2.5 ISBSG
- Core metric **Project Delivery Rate (PDR)** = effort hours per function point (inverse of productivity); a normalised
  Level-1 PDR is recommended; ISBSG short papers compare Business / **Real-Time** / Mathematically-intensive /
  Infrastructure application types [SE] https://www.isbsg.org/category/productivity/page/3/ ; a 2025 short paper on
  price per FP in contracts [SE] https://www.isbsg.org/wp-content/uploads/2025/11/Short-Paper-2025-11-2-Price-per-FP-contract.pdf
- Spread: same AFP, productivity "varied from 0.2 to 300" (study on R11, > 5,000 projects) [SE]
  https://arxiv.org/pdf/1902.03608 . **No automotive-specific ISBSG figure found.**

### 2.6 Function points — IFPUG / COSMIC
- COSMIC Measurement Manual v5.0 (Part 1 rules = ISO 19761; Part 2 guidelines, edited 9 Sep 2024; Part 3b **real-time
  examples**) [SE] https://cosmic-sizing.org/publications/measurement-manual-v5-0-may-2020-part-2-guidelines/
- **AUTOSAR guideline**: Soubra & Chaaban (IWSM/Mensura 2012, IEEE CS pp. 78–84) "Functional Size Measurement of ECU
  Software Designed Following the AUTOSAR Standard: A Measurement Guideline Based on COSMIC ISO 19761" [SE]
  https://puma.ub.uni-stuttgart.de/bibtex/cf88f244c66acc6a6a4816db25f75273 . The COSMIC real-time guideline and Renault's
  automated Simulink sizing were covered in the prior review ([50]–[55]). No official COSMIC "automotive guideline"
  document was found beyond these.

### 2.7 Automotive-specific practice
- **Vector PREEvision** (E/E architecture tool) "compares design alternatives based on key metrics like **system cost**,
  weight, **software footprint** and network bus traffic" [SE]
  https://www.oemoffhighway.com/engineering-manufacturing/software/software/product/10368695/vector-cantechinc-vector-preevision-75-modelbased-development-software ;
  customer-specific metrics per vehicle variant and a product-line / variant concept for shared platforms [SE]
  https://saemobilus.sae.org/content/2016-01-0016 ; a "variant-sensitive synthesis mode … to analyze and compare distinct
  architecture variants" [SE] https://saemobilus.sae.org/content/2019-01-0111/
- **Roland Berger "Computer on Wheels"**: OEM software spend USD 26 bn (2021) → USD 59 bn by 2030 incumbent vs ~USD 43 bn
  SDV approach; 100+ million LOC per vehicle [SE]
  https://www.mynewsdesk.com/rolandberger/pressreleases/automotive-industry-software-spending-set-to-rise-to-as-much-as-usd-59-billion-per-year-by-2030-3195000 ,
  https://content.rolandberger.com/hubfs/07_presse/Roland_Berger_Article_Computer_on_Wheels_4_2022.pdf . A per-vehicle
  range (USD 327–575 SDV; 419 incumbent) appeared in one extract only — **do not quote** until read.
- McKinsey software should-costing (T-shirt sizing vs reference projects, complexity points, team / BCC levers) — prior
  review [49]. **No McKinsey SDV cost figure was found this round**; no Vector / dSPACE / Elektrobit public estimation
  method was found (searches not spent on them after the first results).

## 3. Top 12 capabilities CostVision lacks (ranked for an automotive cost engineer)

Ranking is [Judgement]; each justification cites what the benchmark does. The McKinsey (#2), Galorath Monte Carlo (#7)
and SRDR (#12) URLs come from the 8 Oct review's search extracts ([49], [5], [6]) and were not re-seen this round.

| # | Capability | Why it matters (one line) | Source |
|---|---|---|---|
| 1 | **Schedule & staffing model** — TDEV from effort, Rayleigh / phased staffing curve, peak FTE, compression penalty (SCED) | Every tool above derives duration and monthly staffing from effort; CostVision shows fixed phase % and an "FTE" divided over production life | https://totalmetrics.com/__data/assets/pdf_file/0018/6840/SEER-for-Software.pdf ; https://www.rose-hulman.edu/class/cs/csse372/201310/Homework/CII_modelman2000.pdf |
| 2 | **Supplier quote vs should-cost view** (quote lines mapped to modules / phases / FTE × rate, gap waterfall, negotiation levers) | The automotive use is procurement: McKinsey's method is bottom-up supplier cost + margin to challenge quotes | https://www.mckinsey.com/industries/industrials/our-insights/software-should-costing-a-new-procurement-tool-for-automotive-companies |
| 3 | **Functional sizing from requirements** (COSMIC CFP per function / SWC, size range least–likely–most) | Size is the #1 input in SLIM / SEER; Renault sizes Simulink ECU specs with COSMIC to check supplier cost; CostVision sizes by a fixed PM table or optional KSLOC | https://cosmic-sizing.org/publications/manage-the-automotive-embedded-software-development-cost-productivity-with-the-automation-of-a-functional-size-measurement-method-cosmic/ |
| 4 | **Vehicle E/E architecture map** (domains / zones / central compute with modules placed, coloured by £ and ASIL; click to edit) | PREEvision compares architecture alternatives on system cost and software footprint; a Chief Engineer thinks in ECUs, not tables | https://saemobilus.sae.org/content/2016-01-0016 |
| 5 | **Calibration by domain + productivity index + history trend lines** (size-vs-effort scatter of own projects with ±1σ, star rating) | SLIM computes PI from completed projects and positions new estimates on reference trends; CostVision has one global ratio | https://qsm.com/slim-metrics |
| 6 | **Architecture / sourcing scenario compare with charts** (domain vs zonal, in-house vs Tier-1 vs region; delta waterfall; saved scenarios as cards) | PREEvision's variant-sensitive synthesis and SEER what-if staffing; CostVision's "Compare All" is a table only | https://saemobilus.sae.org/content/2019-01-0111/ ; https://galorath.com/seer/use-case/resource-allocation/ |
| 7 | **Cost-and-schedule probability S-curve** (P50 / P80 / P95 on cost AND on SOP date; per-input least/likely/most) | SEER reports P50 / P80 / P95; CostVision has P10/P50/P90 cost only, no schedule risk | https://galorath.com/risk/monte-carlo-simulation/ |
| 8 | **Defect / quality prediction feeding V&V and warranty / OTA-fix cost** (defects by phase, at SOP, discovery curve) | SEER and SLIM both output defects (delivered defects, Rayleigh discovery, MTTD); a cost engineer needs the field-fix / recall exposure | https://www.infoq.com/articles/understanding-quality-reliability-qsm/ |
| 9 | **Knowledge-base templates by application** (ADAS perception, BMS, body, infotainment, AUTOSAR Classic / Adaptive) that set defaults and ranges | SEER's Platform / Application / Method KBs set >50 parameter defaults — the template-first UX the CE expects | https://arxiv.org/pdf/1508.00032 |
| 10 | **Maintenance driven by change traffic** (annual change rate × size, OTA releases / yr, team size in sustain) instead of % of dev | SEER asks maintenance years / change rate / rigour; COCOMO sizes maintenance via annual change traffic | https://totalmetrics.com/__data/assets/pdf_file/0018/6840/SEER-for-Software.pdf |
| 11 | **Estimate-vs-actual tracking & re-forecast** (monthly actuals, burn vs plan, stoplight, tradeoff forecast) | SEER tracking with health thresholds; Boeing's stoplight summary; SLIM-Control tradeoff forecast | https://ndia.dtic.mil/wp-content/uploads/2013/system/W16050_Rahmani.pdf ; https://www.qsm.com/faq-page/37 |
| 12 | **External benchmark positioning** (ISBSG PDR / real-time segment, DoD SRDR) replacing the unverified peer table | ISBSG PDR by application type and SEER's SRDR dataset give sourced comparators; CostVision's peers are unsourced | https://www.isbsg.org/category/productivity/page/3/ ; https://galorath.com/newsroom/seer-for-software-now-incorporates-the-data-centric-dod-srdr-dataset/ |

Near-misses (not top 12): portfolio roll-up across programmes (QSM portfolio analysis https://www.qsm.com/node/1455);
a programme cost-object tree with hardware (TruePlanning); COCOMO III security driver (CostVision already has CAL).

[Judgement] **UX patterns worth copying**: (1) template-first start (SEER KBs) — pick vehicle + architecture → defaults;
(2) one "solution panel" hero: cost, duration, peak staff, P80, with the staffing curve beneath (SLIM); (3) charts before
tables — staffing curve, S-curve, waterfall, architecture map; tables behind "details"; (4) stoplight / health on
tracking (SEER/Boeing). The current page leads with KPI cards then ~10 stacked tables.

## 4. Published evidence on the two specific questions

### (a) Vehicle-architecture views (zonal / domain maps) to communicate software scope
- **Tooling evidence:** PREEvision compares architecture alternatives on **system cost** and **software footprint**,
  with optimisation targets grouped as global vehicle targets, E/E targets from vehicle functions, and product-line
  targets, applied per variant [SE] https://saemobilus.sae.org/content/2016-01-0016 and the Vector product note above;
  variant-sensitive comparison of architecture variants [SE] https://saemobilus.sae.org/content/2019-01-0111/
- **Function-to-ECU allocation** framed as "What software should run on which ECU?" with partitioning driven by ECU cost
  and performance goals (Mentor Graphics, 2010) [SE] https://ispd.cc/ispd2026/slides/2010/1_04.pdf ; academic taxonomy of
  architecture evaluation metrics in timing, dependability and **cost** [SE] https://www.es.mdu.se/pdf_publications/6545.pdf
- **Zonal vs domain** definitions and the software consequence — zonal "requires … higher software orchestration
  complexity" [SE] https://www.automotive-iq.com/autonomous-drive/articles/domain-vs-zonal-architecture-the-engineering-shift-behind-software-defined-vehicles ;
  https://www.arteris.com/learn/zonal-architecture/
- **Gap in the evidence:** no published study was found that uses a zonal / domain map *specifically to present a
  software cost estimate*. [Judgement] The evidence supports architecture views as the engineer's language for scope
  (PREEvision puts cost and software footprint on the same model); using one as CostVision's scope picker and cost heat
  map is a design choice, not an industry-documented practice.

### (b) Staffing / schedule equations
**COCOMO II.2000 schedule** (Model Definition Manual, §Schedule):

  TDEV_NS = C × PM_NS^F,  F = D + 0.2 × (E − B),  C = 3.67, D = 0.28, B = 0.91, E = B + 0.01 × ΣSF_j

  The manual's worked example: TDEV = 3.67 × (586.6)^(0.28 + 0.2 × (1.15 − 0.91)) = 3.67 × 586.6^0.328 = **29.7 months**;
  C and D are calibrated to the 161 projects in the COCOMO II database; schedule compression / stretch is a separate
  cost driver, **SCED** (Required Development Schedule), not inside the nominal formula in the 2000 calibration (the older
  v1.4 manual put SCED% inside with other constants — a different version) [SE]
  https://www.rose-hulman.edu/class/cs/csse372/201310/Homework/CII_modelman2000.pdf ,
  https://athena.ecs.csus.edu/~buckley/CSc231_files/Cocomo_II_Manual.pdf , http://cs.uns.edu.ar/~prf/teaching/APS18/downloads/PRACTICA/COCOMO2summary.pdf .
  So the Chief Engineer's form **TDEV = 3.67 × PM^(0.28 + 0.2 × (E − 0.91))** matches the source. The full SCED
  multiplier values and phase-distribution tables were **not read** (fetch failed) — read §3 / Appendix of the manual
  before implementing.
  [Judgement, my arithmetic] With CostVision's nominal E = 1.0997, F = 0.3179: 100 PM → 15.9 months (avg 6.3 staff);
  1,000 PM → 33.0 months (30 staff); 3,000 PM → 46.8 months (64 staff). Average staff = PM ÷ TDEV.

**Putnam / Norden / Rayleigh (PNR):**
- Norden–Rayleigh staffing: **dW/dt = 2·K·a·t·e^(−a·t²)**, **a = 1 / (2·t_d²)** — K = total effort (area under the
  curve), t_d = time of peak staffing; equivalently m(t) = (K / t_d²) · t · e^(−t² / (2·t_d²)) [SE]
  https://shape-of-code.com/tag/rayleigh/ , https://dspmuranchi.ac.in/pdf/Blog/staffing%20level%20estimation.pdf
  (the equivalence is my algebra, also stated in the search extract).
- Putnam software equation: **L = C_k · K^(1/3) · t_d^(4/3)** (L size, K total effort, t_d development time, C_k
  technology constant; one secondary source lists C_k = 2 poor, 8 good, 11 excellent environment — single secondary
  source, treat with caution); origin Putnam (1978) "A General Empirical Solution to the Macro Software Sizing and
  Estimating Problem" [SE] https://tutorials.freshersnow.com/software-engineering/putnam-resource-allocation-model/ ,
  https://www.leadinganswers.com/2007/02/schedule_questi.html
- Caveats from the sources: Norden's curve was for general R&D, "not intended to model staffing patterns for software";
  applicable to large projects (≥ ~2 person-years); small projects staff as a square wave [SE]
  https://dspmuranchi.ac.in/pdf/Blog/staffing%20level%20estimation.pdf , https://shape-of-code.com/tag/rayleigh/ ; and
  the 2024 critique "Putnam's software equation debunked" [SE] https://shape-of-code.com/2024/11/17/putnams-software-equation-debunked/
- **Not found:** a source for the manpower buildup index form D₀ = K / t_d³ (MBI) — unverified, do not implement from
  memory.
- [Judgement] For CostVision: TDEV from the COCOMO equation (sourced, calibratable) to get t_d, then the Rayleigh shape to
  spread the PM by month for the staffing chart, with SCED as the compression what-if; label the curve shape a model,
  not a plan, and let calibration to the user's actual durations replace C and D.

## 5. Not verified / open
- Every [SE] line: page not opened (DNS failure in WebFetch). SEER report names, SLIM chart names and TruePlanning
  software outputs need a browser check.
- No automotive-specific productivity benchmark (ISBSG or other) was found; no McKinsey / Capgemini / VDA SDV cost figure
  was found this round; no public Vector / dSPACE / Elektrobit estimation method.
- COCOMO II SCED multipliers and phase distribution percentages: not read this round.
