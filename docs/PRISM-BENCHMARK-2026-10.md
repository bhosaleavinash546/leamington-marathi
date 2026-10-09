> Research report produced for the Prism review of 9 October 2026 (docs/PRISM-REVIEW-2026-10-09.md). Facts come from web-search snippets; page fetches were blocked by the proxy, so open the sources before quoting a figure externally. Items marked [unconfirmed] could not be confirmed.

# Prism: competitive benchmark and technique research

9 October 2026. This is a research report. 

**Method.** 25 web searches, the budget limit, plus a read of the repo so that recommendations build on what Prism already has. Vendor claims are marked as vendor claims. Anything I could not confirm is marked **[unconfirmed]**. Section 4 lists every source and what it supports.

**What Prism already has (checked in the repo, so not re-recommended as new):**

| Capability | Where it lives |
|---|---|
| Monte Carlo band (p10/p50/p90) | `simulateShouldCost` / `simulateRouteCost` in `costing-engine.mjs`, with `MODEL_DISPERSION = 0.34` measured from held-out residuals |
| Quote calibration: log-ratio fit with shrinkage, clamped to 0.25–4×, with a leave-one-out proof | `calibration.mjs` |
| Similar-part memory over the organisation's own runs, with explained similarity | `prism-memory.mjs` (`geoSignature`, `rankSimilarRuns`, `rankTeardowns`) |
| Wright's-law index | `foresight.mjs` `wrightCostIndex`; foresight only, not piece cost |
| Moulding cycle ∝ wall² | `coolingKSecPerMm2: 2.0` in `costing-engine.mjs`. One constant for every polymer. |
| Tolerance cost | Three classes as bounded multipliers (standard / tight / precision → cycle ×1.0 / 1.15 / 1.35, scrap +0 / 1 / 3 pp) |
| Carbon | `carbon.mjs`. Prism shows a CO₂e delta only on a process switch. |
| TRIZ | `triz.mjs` and `triz-trimming.mjs` |

**Gaps found in the repo:**
- The Prism dossier sets `p10: null, p90: null`, so the band is not shown on the Prism page.
- There is no per-feature tolerance cost.
- There is no learned feature recogniser.

---

## 1. Competitors

| Vendor | CAD-based should-cost | DFM | Idea generation / AI | What it does that Prism does not |
|---|---|---|---|---|
| **aPriori** | Physics-based process models run on 3D CAD. Cost, carbon and DFM come from one model. | Mature DFM. **DFM Severity Classification** method launched 31 Mar 2026. | **aiSource**: early access 26 May 2026, general availability 19 Aug 2026. AI sourcing and negotiation built on aPriori should-cost, DFM, process and carbon data. Positioned as the first of a series of AI capabilities. Targets of "90% faster negotiation prep, 3× realised savings" are vendor projections. **Design Value Dashboard** (Apr 2026). **Windchill+ certified** (Jun 2026). | PLM-embedded automatic re-costing on every CAD revision (Windchill / Teamcenter connectors). A large library of calibrated regional cost models. A negotiation workflow productised for buyers. A portfolio dashboard of design-value savings. Carbon on every part by default. Prism's **counter-offer and quote forensics** overlap aiSource's pitch, and aiSource is the direct competitor to Prism's procurement story. |
| **Siemens Teamcenter PCM** (ex-Tecnomatix / Perfect Costing) | Deep process and tooling costing. **NX Feature2Cost** recognises ribs, undercuts, bends and slider directions; v8.5 added facet-based recognition. **"Teamcenter Costing 3D Model-to-Cost"** and a **"Copilot Costing Add-on"** were shown at the Costing Symposium (23 Sep 2026). Siemens says commercial release is "around the corner". | Feature recognition feeds the tooling cost (moulds, dies). | The Copilot is described only as an "AI-driven assistant". Its features are **[unconfirmed]**. | **Tooling cost** driven by recognised features: slider count from undercut direction, mould and die cost. Automatic recalculation when the part changes in Teamcenter. An enterprise data model (plants, rates, BOM roll-up). Industry users such as Schaeffler and Dräxlmaier spoke at the symposium. |
| **Boothroyd Dewhurst** DFMA / DFM Concurrent Costing | Science-based models for about 23 processes. The latest release I found is **v3.0 (2017)**. A 2025+ release is **[unconfirmed]**. | Includes geometry calculators. | None found. | The canonical **DFA** method that Prism's `dfa-engine` follows. The brand recognition of "DFMA" with OEM cost engineers. |
| **Galorath SEER-MFG** | Parametric manufacturing and assembly cost (SEER-MFG and SEER-3D). Mostly aerospace and defence. | Limited. | **SEERai**: generative AI with agentic workflows and "Instant RAG". Won a Gold Merit award for best use of AI in manufacturing (Oct 2025). Builds estimates from natural language and turns documents into work breakdown structures. These are vendor claims. | Cost, **schedule and risk** in one suite. Programme-level estimating. An LLM that drafts the estimate structure from documents. |
| **Tset** | More than 220 pre-configured process models, including die casting, stamping, forging, injection, machining and PCBA. Data on 11,600+ material prices, 3,000 machines and regional wages and energy. | Not prominent. | AI features **[unconfirmed]**. API: Brose triggers prefilled calculations from SAP. | **kg CO₂e/pc shown next to €/pc on every calculation by default**, exportable for Scope 3, CBAM and PCF. A large, maintained master-data library. ERP integration. |
| **FACTON EPC** | Enterprise should-costing (v12) with a cost model designer, benchmark data, and an API for "CAD-to-Cost". | — | A "Predictive Costing" AI white paper (2019) covers early estimates and outlier detection. Shipped AI is **[unconfirmed]**. | Governance, multi-client operation, enterprise benchmark data. |
| **Costdata / 4cost** | **[unconfirmed]**: no search results. | — | — | — |
| **LeanCOST** (Hyperlean, now sold by Var Group) | Automatic feature recognition from 3D, auto-generated BOM, cost vs quantity and economic batch size. It was in the Altair Partner Alliance from 2016. Whether it is still listed there is **[unconfirmed]**. | Some. | None found. | **Cost-vs-quantity curves and economic batch size** as a first-class output. |
| **Paperless Parts** | Geometry interrogation plus pricing rules, for job shops. | Requirements Review highlights cost-driving tolerances and notes on prints, with user-built rules for risky conditions. | **Wingman** (Sep 2024) quotes from prints. AI-assisted quote setup (Feb 2024). BOM Builder. A Hexagon partnership (Jun 2024). | User-authored rules on drawing callouts. Workflow tooling on the supplier side. |
| **Xometry** (and Fictiv / Protolabs) | The **Instant Quoting Engine** is deep learning trained on real production and delivery outcomes and retrained continuously. Mar 2026: an enterprise machining lead-time model on a dataset four times larger, plus dynamic pricing. | Computational-geometry DFM feedback on upload. | ML pricing, not LLM. | **Market price learned from millions of real transactions**, plus a **lead-time prediction**. Prism has neither. Fictiv and Protolabs: I found only Fictiv's engineering articles (cooling-time formula). Their quoting internals are **[unconfirmed]**. |
| **CADDi** (Drawer) | Not a should-cost tool. It is a drawing and data platform. Patented one-click **similar-drawing search** returns past designs together with procurement and price history. Raised a **$114M Series D at a $1.2B valuation**, to build AI models for 3D CAD and 2D drawings. | — | Drawing AI: OCR and structuring of legacy drawings. | **Cost by analogy at scale**: a new drawing shows what similar parts actually cost and who supplied them. Prism's `prism-memory` does this only over its own prior runs, using a hand-built signature. |
| **Hexagon** | RADAN Radquote and the Sheet Metal Fabrication Suite quote from real machine capabilities, with a material / labour / overhead breakdown. | Sheet metal. | Partnership with Paperless Parts. | Quotes constrained by real machines (nesting, press brake) for sheet metal. |
| **Cetim TechniQuote** | Quoting for machine shops with feature recognition. Since Sep 2023 it integrates **ModuleWorks Self-Driving CAM**, so milling time comes from **generated toolpaths**. | — | — | **Machining time from simulated toolpaths** rather than from removal rate × volume. |
| **Dassault 3DEXPERIENCE** | The "Cost Manager / Cost Specialist" role covers target cost, estimates, and risk and opportunity across the lifecycle. A CAD-feature should-cost engine is **[unconfirmed]**. | — | — | Lifecycle target-cost tracking inside PLM. |
| **Altair** (Inspire) | Inspire Form and Inspire Mold give **forming and moulding feasibility** by simulation, aimed at material reduction. Cost estimation was through LeanCOST. An Altair AI cost feature (for example physicsAI for cost) is **[unconfirmed]**. | Simulation-backed feasibility. | — | Real forming and fill simulation, not rules. |
| **Spanflug** (MAKE / BUY) | CNC quoting from CAD and drawings, with machining time and cost. Free for 5 parts a month. CERATIZIT invested (2024) and added AI tool selection (AMB 2026). | — | AI tool selection. | Tool selection from a tooling-vendor catalogue feeding machining time. |
| **AI-native entrants** | **PartAI** (Israel, founded 2025, pre-funding): reads blueprints, GD&T, finish callouts and 3D geometry to produce should-cost baselines for large BOMs. Its closeness to "Partful" is **[unconfirmed]**. Also: **Axya** (sheet metal estimator), **Apexon** (CAD-to-quote on AWS Marketplace). | — | — | Bulk BOM throughput, "hours not weeks". |
| Cofactory, Toolkit, CostAI, Vathos, Labelf, "Partful" | **[unconfirmed / no match]**. Cofactory came back as an unrelated San Francisco startup. Vathos is a machine-vision robotics firm (Düsseldorf). No manufacturing-cost company was found under the other names. | | | |

**How Prism compares.** None of the vendors found combines measured DFM with three outcomes, a deterministic waterfall and quote forensics, LLM idea lenses with each idea **engine-checked**, and a vision read with confirmation checkboxes. The gaps that recur against the incumbents are these:
1. Tooling cost from recognised features (Siemens, aPriori).
2. Carbon next to cost on every line by default (Tset, aPriori).
3. Price and lead time learned from transactions (Xometry).
4. Analogy search over a whole corpus (CADDi).
5. Machining time from toolpaths (Cetim / ModuleWorks).
6. PLM-triggered re-costing (aPriori, Siemens).
7. Cost-vs-volume and economic batch curves (LeanCOST). The `volumeSensitivity` engine exists but Prism does not show it **[check in UI]**.

---

## 2. Techniques

### 2.1 Geometric deep learning on B-rep (feature recognition)
- **State of the art.** UV-Net, BRepNet, AAGNet and BRT all reach **99.0–99.3% accuracy** on MFCAD++ (IoU 96.9–98.6%; AAGNet is best on IoU). Planar faces dominate MFCAD++, so accuracy flatters these models. (arXiv 2504.07134)
- **Robustness.** "Learn the Solid, Not the File" (arXiv 2609.11573, Sep 2026) shows these networks **collapse when the same solid is re-encoded**. Under NURBS / face-splitting perturbation, AAGNet falls from 0.985 to **0.028**, while BRepNet holds at 0.96. Real supplier STEP files differ by exporter, so this matters.
- **For Prism.** The analytic AAG recogniser (`feature_recognition.py`, blend-transparent) is the right production default. It is explainable and its fixtures carry analytic truth. A GNN is worth adding only as a **second opinion that flags disagreement**, never as the source of a cost driver. Canonicalise the input first (merge split faces, as in arXiv 2609.11573) and benchmark on MFCAD++ plus the repo's analytic fixtures.

### 2.2 Similar-part / shape-embedding search (cost by analogy)
- Pattern: embed the shape, index it (FAISS), look up nearest neighbours, then adjust the neighbour's actual cost.
  - Techsoft3D HOOPS AI documents a STEP → embedding → index pipeline.
  - AMC Bridge has a proof of concept on the Purdue Mechanical Components Benchmark.
  - Bickel, Schleich and Wartzack (CAD 2023) use point clouds and show that **alignment** matters to retrieval.
- Commercial proof: CADDi.
- No published method combines a learned embedding with a principled cost adjustment (search result). The **engine** can supply that adjustment: price the neighbour and the new part with the same engine, and apply the ratio to the neighbour's *actual* quote.

### 2.3 GNNs for cost prediction
- Zhang et al. (NWPU): a ConvGNN "Cost Estimation Network" over a machining-feature attribute graph **with precision (tolerance) attributes**. The venue is **[unconfirmed]**.
- Ballegeer et al. 2026 (arXiv 2605.12266): CAD-feature-enhanced ML for sheet-metal bending effort. It notes that part-level cost prediction from B-rep graphs "remains underexplored".
- BenDFM (arXiv 2603.13102): a synthetic sheet-metal manufacturability dataset.
- Industrial CAD and cost datasets are rare (IP constraints). That favours Prism's engine-first approach, with ML only on residuals.

### 2.4 Physics-informed cycle time
- **Moulding cooling.**
  - Formula: t_c ≈ s²/(π²α) · ln[(4/π)(T_melt − T_mould)/(T_eject − T_mould)].
  - It is a one-dimensional planar-wall approximation; it is weaker on bosses and thick features (Fictiv, RJG).
  - I checked Fictiv's own example and it does not match its formula: 3 mm ABS gives about 10.8 s, not the 18–22 s stated.
  - Prism uses a single k = 2.0 s/mm² for all polymers. The formula gives about 1.2 s/mm² for ABS and differs by material through α and the temperatures. The material-specific closed form is a defensible physics change, not fixture tuning.
- **Casting.** Chvorinov's rule, t_s = B·(V/A)ⁿ with n ≈ 2, is standard textbook physics; not searched. Prism measures volume and surface area, and the repo already mentions solidification in `costing-engine.mjs` and `sfsa-steel-casting.mjs`. A die-casting cycle from the measured modulus V/A, rather than from mass, is cheap.
- **Machining.** Cetim × ModuleWorks shows the incumbent direction: time from generated toolpaths. A lighter version is a per-feature time model, with roughing by removed volume and MRR, finishing by face area and stepover, and holes by depth and feed. Prism's `machining-feature-cost.mjs` already goes some way here **[check depth]**.

### 2.5 Uncertainty
- Monte Carlo exists. The gap is **coverage guarantees** on a user's own data.
- **Split conformal prediction** gives distribution-free coverage under exchangeability.
  - Recipe (arXiv 2603.27699): take residuals on a calibration set, then use their quantile as the band width.
  - Conformalised **quantile** or log-space scores suit skewed cost data. EnbPI handles drift (PMLR v204, injection moulding).
  - Nearest analogue: conformal intervals for software effort estimation (Cyprus University of Technology).
- No paper applies this to part should-cost. Doing so would be a credible differentiator. Use log(actual / modelled) residuals from `calibration.mjs` records.

### 2.6 Tolerance-cost models
- Classic forms (Dimensioning & Tolerancing Handbook, ch. 14):
  - reciprocal power, C = A + B/tᵏ;
  - reciprocal, C = A + B/t (Chase & Greenwood);
  - reciprocal squared, C = A + B/t² (Spotts);
  - exponential, C = A·e^(−Bt) (Speckhart).
- Armillotta (Polimi, IJAMT 2020 and later) ties the parameters to feature properties: nominal size, shape, area and material.
- Prism's three bucketed multipliers are honest but coarse. A **per-callout** model from the drawing's tightest tolerances, with the IT grade by nominal size, would make the specification lens's "relax this tolerance" ideas engine-checkable.

### 2.7 LLM agents and hallucinated numbers
- "Semantic Training Gap" (arXiv 2605.11234): an industrial agent **fabricated 43% of identifier values** in unconstrained tool calls. The cure was ontology-constrained tool parameters (enums).
- CHEMCOST (arXiv 2605.07251): the best tool-using agents priced only 50.6% within 25% relative error.
- An Italian thesis (UNIVPM): LLM-only part costing had a MAPE of 17–25%, biased high on setup and machining. Its date is **[unconfirmed]**.
- Vendors' public material (SEERai "Instant RAG", aiSource "built on should-cost models", Siemens Copilot) does not say how they stop invented numbers **[unconfirmed]**.
- Prism's rule already goes further than these: every number comes from an engine, and each idea carries an engine check and an arithmetic check.
- One lesson to adopt: **constrain tool and schema parameters to enums** (rule IDs, process keys, feature IDs taken from the measurement), so the model cannot cite a feature that does not exist.

### 2.8 VA/VE automation and TRIZ with LLMs
- AutoTRIZ (Advanced Engineering Informatics vol. 65, 2025) automates the whole TRIZ chain from a problem statement, demonstrated on a battery thermal management system.
- TRIZ Agents (SciTePress 2025 / arXiv 2506.18783) uses multiple specialist agents with tools.
- TRIZ-GPT (arXiv 2408.05897).
- None of these grounds contradictions in **measured** data. Prism's roadmap R6, contradictions from DFM findings, is ahead of the literature. Build it and evaluate it with the ideation eval.

### 2.9 Bayesian calibration
- Bayesian calibration of COCOMO II: within 30% of actuals **75%** of the time, against 52% for regression, on 161 projects (IBM).
- Hierarchical Bayesian updating adds population hyperparameters plus a model-error term (Frontiers in Built Environment 2019).
- Prism's shrinkage toward a global factor is already an empirical-Bayes approximation. The next step is a **hierarchy**: global → process → supplier / region → part family, with a posterior *variance* that feeds the band.

### 2.10 Learning curves
- Wright's law is standard and was not searched. Cost per unit falls by a fixed fraction with each doubling of cumulative volume.
- It exists in `foresight.mjs` for technology foresight but not for piece cost.
- For quote forensics, a supplier quoting year 1 and year 3 at the same price, or an LTA discount below the implied learning rate, is a negotiation lever, and it is arithmetic.

### 2.11 Carbon-cost co-optimisation
- Tset and aPriori show CO₂e next to € on every calculation by default, and Tset exports it for Scope 3, CBAM and PCF.
- Prism has `carbon.mjs` but shows a CO₂e delta only on a process switch.
- Two options: show CO₂e on every route and every idea, and add a **Pareto view** (€ vs kg CO₂e) to route comparison, with an optional internal carbon price (€/t).

---

## 3. Recommendations (ranked by impact on demo credibility and accuracy versus effort)

| # | Recommendation | Why (evidence) | Effort |
|---|---|---|---|
| 1 | **Show the Monte Carlo p10–p90 band on the Prism should-cost and waterfall.** It already exists; the dossier currently sends `p10: null`. Label it "band from held-out residuals, coverage measured". | The demo's first question is "how sure are you?". Incumbents show point estimates, so this is cheap and visible. | quick (≤1 day) |
| 2 | **Carbon on every line:** kg CO₂e/part on the should-cost, on each route, and on each idea where the engine can compute it. Say "not computed" otherwise. | Tset and aPriori do this by default, and OEM buyers expect it (Scope 3, CBAM). | quick to medium |
| 3 | **Material-specific moulding cooling time** from the closed-form equation (α, T_melt, T_mould, T_eject per polymer), replacing the single k = 2.0. Gate it on `benchmark:cost` and document the physics rationale. | A defensible physics change that improves accuracy on plastics. The current k is about 1.7× the ABS value. | quick (≤1 day) plus a benchmark run |
| 4 | **Enum-constrained LLM schemas:** in `messagesJson` schemas for Prism lenses, force `evidenceRef` / `featureId` / `ruleId` to enums built from the dossier, so ideas cannot cite non-existent features. | arXiv 2605.11234: 43% of identifiers fabricated without constraints. It closes a credibility hole cheaply. | quick (≤1 day) |
| 5 | **Conformal band on the calibrated engine:** split-conformal on log(actual / modelled) over the user's quote corpus (`calibration.mjs` records). Report "90% interval, empirical coverage X% (n quotes)". Fall back to the Monte Carlo band when n is under about 20. | Gives a coverage guarantee on the customer's own data. No competitor claims this. | medium (≤1 week) |
| 6 | **Feature-driven tooling cost:** mould cost from measured slider and lifter count (undercut directions), cavity size and rib count; die cost from bends and stations. Amortise per part at the stated volume. | Siemens Feature2Cost and aPriori's core strength. Prism already measures the undercuts and bends. Tooling is often the largest item that quotes argue about. | medium |
| 7 | **Per-callout tolerance cost:** a reciprocal-power model per feature from the drawing's tightest tolerances (IT grade by nominal size → process capability → added op / cycle / scrap), with parameters tied to feature size following Armillotta. "Relax ±0.02 → ±0.05 on bore Ø12" then becomes engine-priced instead of "AI-estimated". | Turns the specification lens's most common idea into an engine-checked one. Supported by the literature in §2.6. | medium |
| 8 | **Engine-adjusted cost by analogy:** extend `prism-memory` from the user's own runs to the whole quote corpus. For the k nearest parts with actual quotes, estimate = actual_neighbour × engine(new) / engine(neighbour). Show it as a third "analogy" bar beside the engine and the quote, with the similarity basis. A learned embedding is optional later. | CADDi's main value proposition, made deterministic and explainable. The adjustment-formula gap in the literature is filled by the engine itself. | medium |
| 9 | **Learning-curve and volume forensics:** draw the `volumeSensitivity` cost-vs-volume curve, then apply Wright's learning to multi-year quotes. Flag LTA (long-term agreement) steps below the implied learning rate as a counter-offer lever. | LeanCOST's batch curves. A common buyer negotiation argument that is pure arithmetic. | quick to medium |
| 10 | **Measured-contradiction TRIZ lens (roadmap R6):** pair conflicting DFM findings (for example, rib height for stiffness against fill and ejection) and map them to separation principles in `triz.mjs`. Evaluate with the ideation eval (R7). | AutoTRIZ and TRIZ Agents work from free-text problems. Grounding in measured conflicts is new. | medium |
| 11 | **Hierarchical calibration:** global → process → supplier / region, with posterior variance feeding the band (#1 / #5). Keep the multipliers auditable and keep the clamp. | The Bayesian COCOMO result (75% vs 52% within 30%). A natural extension of the current shrinkage. | medium |
| 12 | **Die-casting / casting cycle from the measured modulus V/A (Chvorinov)** instead of mass. | Physics consistent with the geometry Prism already measures. | quick to medium (benchmark-gated) |
| 13 | **Feature-level machining time** (roughing by MRR × removed volume, finishing by area, holes by depth and feed) from recognised features, cross-checked against `machining-feature-cost.mjs` **[check overlap first]**. The full toolpath approach (ModuleWorks-style) is out of scope. | Cetim / ModuleWorks is the incumbent bar. | medium |
| 14 | **GNN second opinion for feature recognition:** BRepNet, which held up best under perturbation, on canonicalised B-rep. It only flags disagreement with the analytic recogniser and never sets a cost driver. Gate it on the DFM fixtures and MFCAD++. | The robustness evidence argues against GNN-as-truth. Worth having as a demo-friendly "two independent readers agree". Needs Python ML dependencies on customer laptops. | large |
| 15 | **PLM / CAD-revision re-costing** (watch a folder or a Windchill / Teamcenter API, re-run Prism, show the cost delta between revisions). | aPriori (Windchill+) and Siemens do this. An enterprise ask rather than a demo ask. | large |
| 16 | **Lead-time estimate.** Do not build one. There is no deterministic basis, and Xometry's is trained on its own transactions. If asked, say "not modelled". | Honest scoping under the house rule. | — |

**Ranking logic.** Items 1–4 are the best ratio of credibility to effort: visible, cheap, and each closes a gap a competitor or paper exposes. Items 5–8 are the real accuracy and differentiation work. Items 14–15 are large and mainly answer "do you have AI feature recognition?" or "does it plug into PLM?".

---

## 4. Sources

| URL | Supports |
|---|---|
| https://www.businesswire.com/news/home/20260526130779/en/aPriori-Launches-aiSource-an-AI-Sourcing-Solution-Giving-Procurement-Teams-the-Manufacturing-and-Cost-Intelligence-to-Win-More-Supplier-Negotiations | aiSource early access, 26 May 2026; vendor targets; "first in a series" |
| https://www.morningstar.com/news/business-wire/20260812970314/apriori-technologies-launches-aisource-giving-procurement-teams-the-manufacturing-product-intelligence-to-negotiate-on-equal-terms-with-suppliers | aiSource general availability (Aug 2026); deployed in automotive |
| https://www.apriori.com/news-events/ | DFM Severity Classification (Mar 2026), Design Value Dashboard (Apr 2026), Windchill+ certification (Jun 2026) |
| https://www.capterra.com/p/162255/aPriori/ | aPriori positioning: cost, carbon and DFM from 3D CAD, physics-based |
| https://blogs.sw.siemens.com/teamcenter/?p=23058 | Costing Symposium 2026: Copilot Costing Add-on, 3D Model-to-Cost, release "around the corner" |
| https://resources.sw.siemens.com/da-DK/siemens-costing-symposium-2026/ | Symposium date and agenda (23 Sep 2026, Eppstein) |
| https://blogs.sw.siemens.com/teamcenter/new-teamcenter-product-cost-management-capabilities/ | NX Feature2Cost: ribs, undercuts, bends → cost drivers |
| https://blogs.sw.siemens.com/teamcenter/whats-new-in-teamcenter-product-cost-management-3/ | v8.5 facet-based recognition, undercut and slider direction |
| https://resources.sw.siemens.com/lv-LV/e-book-optimizing-costs-profitability-and-sustainability-with-teamcenter-product-cost-management/ | AI copilots for tooling and CO₂ in TcPCM |
| https://www.digitalengineering247.com/article/boothroyd-dewhurst-launches-dfm-concurrent-costing-version-3-0/plm | DFM Concurrent Costing v3.0 (2017) |
| https://www.industryweek.com/innovation/product-development/article/21948184/technologies-of-the-year-dfm-concurrent-costing-version-20 | v2.0: 23 processes |
| https://galorath.com/newsroom/seerai-by-galorath-gold-winner-award-for-ai-in-manufacturing/ | SEERai award (2025) |
| https://galorath.com/newsroom/otto-aviation-standardizes-on-galoraths-ai-powered-estimation-platform-to-drive-price-to-win-strategies-across-sustainable-aerospaceinitiatives/ | SEER-MFG / SEER-3D in use; SEERai agentic workflows |
| https://tset.com/industries/automotive | 220+ process models; data scale; CO₂e next to € by default; Scope 3 / CBAM export |
| https://tset.com/case-study-carbon-footprint-simulation | Bottom-up CO₂ calculation method |
| https://www.facton.com/resources/wod-facton-epc-should-costing-12-whats-new | FACTON EPC v12 |
| https://defensedaily.com/press-releases/artificial-intelligence-in-cost-management-facton-publishes-white-paper-on-predictive-costing | FACTON AI white paper (2019) |
| https://varindustries.vargroup.com/en/soluzioni/costificazione-e-preventivazione/leancost | LeanCOST feature recognition, BOM, batch curves |
| https://www.engineering.com/?p=18052 | LeanCOST added to the Altair partner library (2016) |
| https://www.paperlessparts.com/press/paperless-parts-new-ai-features-surface-critical-requirements-helping-shops-quote-faster-with-confidence/ | Paperless Parts Requirements Review, Wingman |
| https://www.paperlessparts.com/press/hexagon-enters-strategic-partnership-with-paperless-parts-in-north-america/ | Hexagon–Paperless partnership (2024) |
| https://www.nasdaq.com/press-release/xometry-deepens-ai-native-marketplace-advantage-new-enterprise-lead-time-intelligence | Xometry lead-time model and dynamic pricing (Mar 2026) |
| https://xometry.com/machine-learning-for-manufacturing | Xometry IQE: deep learning on transaction data; geometry DFM |
| https://us.caddi.com/product/procurement-b | CADDi similar-drawing search with procurement and price history |
| https://caddi.com/en-us/news/announcements/caddi-raises-114-million-to-fix-manufacturings-biggest-bottleneck-with-ai/ | CADDi Series D ($114M), aim to build 3D / 2D models |
| https://finance.yahoo.com/technology/ai/articles/exclusive-manufacturing-ai-startup-caddi-170000222.html | CADDi $1.2B valuation |
| https://hexagon.com/products/product-groups/hexagon-sheet-metal-fabrication-suite | Hexagon sheet-metal costing breakdown |
| https://platform.softwareone.com/product/radan-radquote/PCP-2246-6942 | RADAN Radquote |
| https://www.moduleworks.com/moduleworks-and-cetim-partner-on-costing-software/ | Cetim TechniQuote with ModuleWorks toolpath-based milling time (2023) |
| https://www.3ds.com/3dexperience-platform/roles?wocset=8 | 3DEXPERIENCE Cost Manager / Specialist role |
| https://altair.com/resource/altair-inspire-form-sheet-metal-forming-feasibility | Altair Inspire Form feasibility (not cost) |
| https://spanflug.de/en/make/ | Spanflug MAKE CNC quoting |
| https://www.pesmedia.com/spanflug-make-with-new-features-at-amb-2026 | Spanflug AI tool selection (2026) |
| https://www.ceratizit.com/int/en/media/news---press-releases/2024/spanflug.html | CERATIZIT investment in Spanflug |
| https://startupim.com/company/partai | PartAI (2025) profile |
| https://axya.co/blog/estimating-manufacturing-costs-with-ai-to-save-thousands-of-hours | Axya sheet-metal estimator |
| https://aws.amazon.com/marketplace/pp/prodview-a2iuka5d6djua | Apexon CAD-to-quote |
| https://www.crunchbase.com/organization/cofactory-ai | Cofactory is not a manufacturing-cost company (as found) |
| https://tracxn.com/d/companies/vathos/__iHLnfsAClFRVcI57M0mEFkF8Pbuejfjlpz5cTUKf8d4 | Vathos: machine vision, not cost |
| https://arxiv.org/pdf/2504.07134 | BRT; MFCAD++ comparison of UV-Net, BRepNet, AAGNet |
| https://arxiv.org/pdf/2609.11573 | Robustness collapse of B-rep networks under re-encoding |
| https://arxiv.org/pdf/2006.10211 | UV-Net |
| https://pure.nwpu.edu.cn/en/publications/a-novel-method-based-on-a-convolutional-graph-neural-network-for-/ | ConvGNN cost estimation with precision attributes |
| https://arxiv.org/pdf/2605.12266 | Sheet-metal effort estimation; cost prediction from B-rep graphs underexplored |
| https://arxiv.org/pdf/2603.13102 | BenDFM dataset |
| https://teses.usp.br/teses/disponiveis/3/3143/tde-12072024-095714/publico/ThiagoTeixeiraPetroneCorr24.pdf | GNN machining process-time thesis |
| https://docs.techsoft3d.com/hoops/ai/_sources/programming_guide/embeddings-retrieval.rst.txt | STEP embedding → index → search pipeline |
| https://www.digitalengineering247.com/article/amc-bridge-demos-aidriven-similar-parts-search | AMC Bridge similar-part search for cost and lead time |
| https://cris.fau.de/publications/283159552/ | Bickel et al. deep-learning retrieval of mechanical parts, alignment |
| https://sites.usc.edu/skgupta/?p=2171 | Shape similarity used for cost estimation by analogy |
| https://arxiv.org/pdf/2603.27699 | Split-conformal recipe; choice of score function |
| https://proceedings.mlr.press/v204/uddin23a/uddin23a.pdf | Conformal regression (EnbPI, MAPIE) in injection moulding |
| https://ktisis.cut.ac.cy/handle/20.500.14279/13755 | Conformal intervals for effort estimation |
| https://www-eng.lbl.gov/~matthewjohnson/Drafting%20&%20Design/METROLOGY/Dimensioning%20and%20Tolerancing%20Handbook/81314_14.pdf | Tolerance-cost model forms (reciprocal, power, exponential) |
| https://re.public.polimi.it/handle/11311/1199320 | Armillotta extended reciprocal-power, feature-tied parameters |
| https://re.public.polimi.it/bitstream/11311/1136873/4/0Selection-of-parameters-in-costtolerance-functions-review-and-approach2020International-Journal-of-Advanced-Manufacturing-Technology.pdf | Review of cost-tolerance parameter selection |
| https://link.springer.com/article/10.1007/s00170-024-14227-x | 2024 reciprocal-exponential tolerance optimisation (link as returned; the formula itself is **[unconfirmed]**) |
| https://arxiv.org/pdf/2605.11234 | 43% fabricated identifiers; ontology-constrained tools |
| https://www.alphaxiv.org/abs/2605.07251.md | CHEMCOST: agents 50.6% within 25% |
| https://tesi.univpm.it/handle/20.500.12075/27314 | LLM part costing MAPE 17–25% (thesis) |
| https://scholars.cityu.edu.hk/en/publications/autotriz-automating-engineering-innovation-with-triz-and-large-la/ | AutoTRIZ (AEI 2025) |
| https://arxiv.org/html/2506.18783v1 | TRIZ Agents |
| https://arxiv.org/pdf/2408.05897 | TRIZ-GPT |
| https://researcher.ibm.com/publications/bayesian-analysis-of-empirical-software-engineering-cost-models | Bayesian COCOMO II calibration: 75% vs 52% |
| https://www.frontiersin.org/articles/10.3389/fbuil.2019.00007/pdf | Hierarchical Bayesian model updating |
| https://www.fictiv.com/articles/injection-molding-cycle-time | Cooling-time formula and validity limits (its worked example is inconsistent) |
| https://rjginc.com/injection-molding-cooling-time-a-breakdown/ | Wall² dominance of cooling time |

**Not confirmed or not searched (by budget):**
- Costdata and 4cost.
- Fictiv and Protolabs quoting internals.
- Altair AI for cost.
- Dassault CAD-feature costing.
- Toolkit, CostAI, Labelf and "Partful".
- The features of the Siemens Copilot.
- How any vendor prevents hallucinated numbers.
- Chvorinov and Wright's law are cited as standard textbook physics, without search.
