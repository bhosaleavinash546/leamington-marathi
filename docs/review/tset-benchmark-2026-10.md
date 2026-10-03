# CostVision against Tset — benchmark, October 2026

**Scope of the evidence.** Tset's own site could not be fetched from this environment; the network proxy blocks it. Everything said about Tset comes from:

- public search results quoting Tset's pages;
- press releases, both Tset's own and A2MAC1's acquisition notice;
- review sites: Capterra, G2, GetApp, Software Advice.

Every Tset claim below carries its source. **"Not public" means the sources did not settle it, not that Tset lacks it.**

Everything said about CostVision was counted in the repository on 3 October 2026.

---

## 1. In one page

**Who Tset is.**

- **Company:** a Vienna cost-engineering software company, founded in 2018.
- **Funding:** a €12.7 M Series A in July 2024, from investors including Brose Ventures, Carbon Removal Partners and Ingenics.
- **Customers:** AGCO, Brose, LEGO, thyssenkrupp, ZF and BMW Group.
- **Acquisition:** on **18 June 2026, A2MAC1 signed to acquire Tset**, closing in Q3 2026. A2MAC1 is the automotive teardown and benchmarking company, with about 70 vehicle teardowns a year.

The point of the deal is to join A2MAC1's teardown cost data to Tset's calculation platform. A2MAC1 data is "automatically translated into each customer's proprietary costing structure", and complex assemblies are costed "at scale using AI-powered costing".

**What Tset is.** Tset is a **calculation platform with very broad master data**:

- 50+ calculation modules, covering 18 manufacturing technologies and 50+ secondary processes;
- 3,000 machines;
- 690 sub-regions in 79 countries;
- labour at 5 skill levels across 11 industries;
- cost **and CO₂ in every calculation by default**;
- a CBAM simulation;
- an open API, cloud or on-premise deployment;
- 4.7/5 on review sites.

**Its AI stance matches ours:** deterministic models stay in charge, and AI classifies, searches, flags and suggests routing.

**Where CostVision stands.**

- **Ahead:** automation from the raw engineering file. CostVision measures STEP geometry and reads PCB photos and Gerbers. It routes the part, asks only what geometry cannot settle, and then builds the cost. It goes deeper in a few commodities: aluminium extrusion, sheet-metal unfold, BIW press lines, casting melt. It quantifies uncertainty and calibrates against actuals. It runs offline or air-gapped.
- **Behind:** master data breadth (about 10–15× smaller), secondary-process coverage, multi-level assemblies, carbon depth, integrations, enterprise features, and — above all — **external validation and benchmark data**. Tset now has A2MAC1's teardowns behind it. CostVision has never been compared with a price paid.

---

## 2. What Tset has built, and how

| Area | What Tset offers | Source |
|---|---|---|
| **Calculation approach** | Bottom-up: the output is "a chain of manufacturing steps, required materials, machines, workers … all adjustable". A PCB example was broken into dozens of steps, each tied to master data. | Tset product-costing pages (via search) |
| **Inputs** | "Build calculations from 3D models, upload a Bill of Materials, or start with manual inputs." Breakdowns "from 3D models or BOMs in under a minute". | Tset mechanical-engineering page |
| **Coverage** | "50+ calculation modules"; an automotive pack of **18 manufacturing technologies + 50+ secondary processes**. Named modules: machining (turning, milling, grinding), forging (die and cold), PCB / PCBA, injection moulding, transfer-die stamping, HPDC, sheet metal. Reviewers single out the sheet-metal module. | Tset cost-carbon page; Tier-1 case study; videos |
| **PCB / PCBA** | Bottom-up from parameters (board layout, component count, process specifics): SMD / THT, flashing, coating, singulation, X-ray, stencils, test jigs, set-up allocation. | Tset PCBA blog and video |
| **Master data** | **690 sub-regions / 79 countries.** Location factors for 52 countries / 578 sub-regions: power, gas, floor space, interest, CO₂e. **Labour at 5 skill levels × 11 industries.** **3,000 machines** with investment, energy, maintenance and consumables. Overhead benchmarks, automotive and non-automotive. A "Master Data Service" launched in 2025. Partnership with Kerkhoff. Regular updates. | Tset master-data blog; Summit 2025 recap |
| **Carbon** | Cost **and** CO₂ in every calculation by default. Scope 1–3 upstream. CO₂ and cost simulation for CBAM. A patent on carbon-footprint optimisation. | Tset cost-carbon page; CBAM press release |
| **Lifecycle** | Concept → SOP → EOP. Use cases: design-to-cost, should-cost for sourcing, quoting, benchmarking, predicting supplier price changes. | Tset press, solutions pages |
| **AI** | "AI in cost engineering — do's and don'ts": deterministic, auditable models stay in charge; AI classifies, searches, summarises, flags outliers and suggests routing; every result must trace input → output. After the A2MAC1 deal: "AI-powered costing" of complex assemblies at scale. | Tset AI blog; A2MAC1 release |
| **Integration** | Open API ("data must be usable from anywhere, not restricted to the costing software"). Cloud SaaS or on-premise. | Tset API blog; Summit 2025; Capterra |
| **Price** | From **$415/month** flat (Capterra listing); enterprise on request. | Capterra |
| **User view** | 4.7/5. **Pros:** intuitive web UI, quick onboarding, responsive support, the sheet-metal module. **Cons:** some features still in development, an inconsistent Excel export, thin documentation of deeper functions, admin cost on-premise. | G2 / Capterra / GetApp |
| **Results claimed** | A Tier-1 recreational-engine maker saved €4.9 M a year on a 5,500-piece volume. | Tset benchmarking whitepaper (via search) |

---

## 3. Head to head

**Key:**

- **Ahead** — CostVision has more, on the evidence.
- **Parity** — both have it.
- **Behind** — Tset has more.
- **Not public** — Tset's sources don't say.

| # | Dimension | Tset | CostVision (counted 3 Oct 2026) | Verdict |
|---|---|---|---|---|
| 1 | **Deterministic, auditable money** | "Deterministic models stay in charge" | Golden rule: AI never sets a price. Rules overwrite every AI field. Every field carries a basis and source. Golden-figure hand calculations are pinned in tests (£24.79 bracket; the crash box reconciled to the penny). | **Parity** (CostVision's is enforced in code and tests) |
| 2 | **Primary technologies** | 18 technologies (automotive pack), 50+ modules | 23 commodity types: machining, casting, cast + machine, forging, gear, sheet metal / fab / BIW, injection / blow / roto / thermoforming, polymer and aluminium extrusion, rubber, composites, painting, PCB fab, PCBA, wiring harness, assembly, automotive software | **Parity** on primary processes |
| 3 | **Secondary processes** | 50+ | Heat treatment (gear, casting), surface treatment, fettling / blast / NDT, finishing on extrusions, CNC on near-net parts — embedded per commodity, not a shared catalogue | **Behind** |
| 4 | **3D CAD → cost, unattended** | "From 3D models … in under a minute"; how deep the geometry read goes is not public | Measured B-rep kernel (OCP): feature table, wall 2·V/S, silhouettes, enclosure probe, sheet-metal unfold with forming check, extrusion section probe, turning signature. Process routing with questions only where geometry can't decide. **15 commodities cost headless from STEP.** | **Ahead** on demonstrable depth (Tset's depth not public) |
| 5 | **Drawings and photos** | Not public | Vision identification of process and material from photo, drawing and renders (AI only leans, the engineer confirms). PCB photo → BOM. Gerber / drill files measured. | **Ahead** |
| 6 | **PCB / PCBA** | Parameter-driven bottom-up: SMD / THT, flashing, coating, X-ray, stencils, test jigs | Photo / BOM / Gerber → BOM + fab. 458-part priced catalogue with sources. ICT, X-ray, functional test, stencil, conformal coat. Automotive premiums folded into the headline. | **Parity** on process steps, **Ahead** on input automation |
| 7 | **BOM / assembly** | BOM upload; complex assemblies "at scale" with A2MAC1 | BOM CSV parser; assembly roll-up of hand-entered lines; bulk costing of many parts by command-line script only. **No multi-level BOM, no STEP-assembly split, no bulk costing in the UI.** | **Behind** |
| 8 | **Master data — regions** | 79 countries / 690 sub-regions; location factors 52 / 578 | **20 regions**, country level only. Sourced and dated, with a refresh script. | **Behind** (~4× countries, no sub-regions) |
| 9 | **Master data — machines** | 3,000 | **197** machine classes, each with a cost build-up | **Behind** (~15×) |
| 10 | **Master data — labour** | 5 skill levels × 11 industries | **42** labour rates (skill level × region) | **Behind** |
| 11 | **Materials** | Not public (counts) | **424 grades, 65 categories**, each with price, scrap value, density, source and date. Scoped per commodity. Global aluminium billet prices by region. | **Not public** (strong on our side) |
| 12 | **Carbon** | Cost + CO₂ by default; scope 1–3; CBAM simulation | `carbon.ts`: representative material factors, energy, grid, logistics — labelled LOW confidence. No CBAM. | **Behind** |
| 13 | **Uncertainty and calibration** | Not public | Monte-Carlo band; learn-from-actuals calibration with a conformal band; drift monitor; part similarity | **Ahead** (on public evidence) |
| 14 | **Negotiation** | Should-cost for supplier negotiation; quoting | Quote teardown (simple and detailed), negotiation report and template, RFQ analysis | **Parity** |
| 15 | **External validation and benchmarks** | Partner-validated modules; customer savings case; **A2MAC1 teardown data (~70 vehicles a year)** | Real-parts baseline (40 parts) pins **what the tool says, not what is true**. **No comparison with a price paid.** | **Behind — the largest gap** |
| 16 | **Integration** | Open API; data usable outside the tool | REST routes behind authentication, but no published API (no OpenAPI spec), no PLM / ERP connectors, no webhooks | **Behind** |
| 17 | **Deployment** | Cloud SaaS or on-premise | Docker, Fly.io, a **Windows offline package** (no admin rights), **air-gapped mode** with every costing path still working | **Ahead** for locked-down sites |
| 18 | **Enterprise** | Multi-customer SaaS; a "central platform" strategy | JWT login, projects, share links, SQLite. No SSO, roles, approval flow, versioned calculations or audit trail. | **Behind** |
| 19 | **Customer costing structures** | Benchmark data "translated into each customer's costing structure" | One 8-bucket structure; overhead and margin by commodity and tier | **Behind** |
| 20 | **Usability and maturity** | 4.7/5; praised UI; documentation gaps noted | A single ~20k-line UI file being split; strong in-tool provenance (each field's basis on hover) | **Behind** on polish, **Ahead** on explanation |

---

## 4. Where CostVision is genuinely ahead — keep and sell these

1. **The engineering file in, the cost out, without filling a form.** STEP measured by a real B-rep kernel → process route → questions only where physics can't decide → cost. Tset's public material talks about inputs and parameters; CostVision shows the measurement.
2. **Depth in specific commodities.** Aluminium extrusion goes from the section probe through press force, billet length, mill lengths and cut-to-length, priced by region. Sheet-metal blank development has a forming check. BIW press-line planning, casting melt and remelt, and forging line takt are each written up and hand-reconciled.
3. **Explainability you can audit line by line.** Every rule states its basis. Golden parts are reconciled to the penny in tests, and the screen matches the unattended path to the penny.
4. **Uncertainty and learning.** Monte-Carlo bands, calibration against actuals and drift monitoring are built in.
5. **Runs where cloud tools can't.** Offline Windows package and air-gapped mode.

---

## 5. Improvement areas — prioritised

| Priority | Gap | Why it matters against Tset | What to build | Effort |
|---|---|---|---|---|
| **1** | **No validation against real prices** | Tset now has A2MAC1 teardown costs. A director will ask "how close is it?" | Load 30–50 parts JLR actually paid for (`actuals-import.ts` already parses them). Run `npm run accuracy` per commodity and publish MAPE and bias. Calibrate the worst commodity first. | S–M |
| **2** | **Master data breadth** | 79 countries / 3,000 machines against 20 / 197 | Grow to ~40 countries, adding each one's labour, energy, floor and billet premium through the refresh script. Expand machines per commodity by size class to ~600. Labour by skill × industry. Consider licensing a data partner (Tset partners with Kerkhoff; costdata, DFMA Global Costing Data are alternatives). | M–L |
| **3** | **Carbon by default** | Tset puts cost **and** CO₂ in every calculation; CBAM is live from 2026 | Per-operation CO₂ = energy kWh (now carried per part on aluminium extrusion) × regional grid factor. Material factors per grade with sources. A CBAM certificate cost on imported metal in landed cost. Show CO₂ beside £ on every result. | M |
| **4** | **Secondary-process catalogue** | Tset lists 50+ | One shared catalogue usable by every commodity: heat treatment, plating / anodise / paint, welding (MIG / TIG / spot / laser), assembly and fastening, leak / functional test, washing, marking. Today these are embedded per commodity. | M |
| **5** | **Assemblies and BOMs** | Tset costs BOMs and, with A2MAC1, assemblies "at scale" | Multi-level BOM import (Excel / CSV / PLM export). Split a STEP assembly into parts and cost them with bulk costing (already built for the CLI). Roll up with assembly operations. Expose bulk costing in the UI. | M |
| **6** | **Open API and integrations** | Tset sells an open API | Publish an OpenAPI spec for `/api/cad`, bulk and project endpoints. Add PLM (Teamcenter / 3DEXPERIENCE) and SAP export hooks and webhooks. | M |
| **7** | **Enterprise readiness** | Tset serves BMW, ZF and others | SSO (OIDC), roles, versioned and approved calculations, an audit log, and Postgres in place of SQLite for multi-user use. | M–L |
| **8** | **Customer costing structures** | Benchmark data mapped to each customer's own cost structure | Configurable cost structures (bucket names, overhead bases, margin schemes) mapped onto the 8 buckets. | S–M |
| **9** | **A step-chain editor** | Tset's calculation is an editable chain of steps | One cross-commodity editor of the routing (operations, machine, labour, time), on top of the commodity forms, so an engineer can add a step a module doesn't model. | M |
| **10** | **Benchmark / teardown library** | A2MAC1 data | Build an internal library of costed parts and teardowns (`part-similarity.ts` already exists) and use it as a cross-check on every new estimate. | M (ongoing) |
| 11 | Polish | Reviewers praise Tset's UI | Continue splitting `main.ts`, and add user documentation. | M |

**Suggested next step.** Ask Tset (or A2MAC1) for a trial and cost **the same five JLR parts** in both tools: a machined bracket, a casting, a pressing, a moulding and a PCBA. Compare time to estimate, cost, the questions asked and traceability. That would replace every "Not public" above with a measurement.

---

## Sources

- Tset — cost & carbon product page: https://tset.com/product/cost-carbon
- Tset — mechanical engineering (3D / BOM inputs): https://tset.com/industries/mechanical-and-industrial-engineering
- Tset — master data blog: https://tset.com/blog/master-data-in-cost-engineering
- Tset — AI in cost engineering, do's and don'ts: https://tset.com/blog/ai-in-cost-engineering-the-dos-and-donts
- Tset — PCBA / PCB costing: https://tset.com/blog/how-to-calculate-pcba-and-pcb-costs-in-product-costing-software
- Tset — machining video: https://tset.com/videos/machining · forging video: https://tset.com/videos/forging
- Tset — Tier-1 supplier case: https://tset.com/blog/cost-engineering/why-a-tier-1-supplier-chose-tset-for-costing-efficiency
- Tset — Summit 2025 recap: https://tset.com/blog/tset-summit-2025-shaping-the-next-decade-of-cost-engineering
- Tset — API integration: https://tset.com/blog/next-level-cost-engineering-starts-with-api-integration
- Tset — CBAM simulation: https://tset.com/press-and-news/tset-cbam-supply-chain-cost-co2-simulation
- Tset — Series A: https://tset.com/press-and-news/series-a-funding-tset · Tech.eu: https://tech.eu/2024/07/30/tset-closes-12-7m-series-a-to-expand-its-industrial-carbon-accounting-software-globally/
- A2MAC1 — agreement to acquire Tset: https://www.a2mac1.com/newsroom/a2mac1-signs-agreement-to-acquire-tset/ · GlobeNewswire: https://www.globenewswire.com/news-release/2026/06/18/3314032/0/en/A2MAC1-signs-Agreement-to-acquire-Tset-in-order-to-accelerate-next-phase-of-growth-in-AI-enabled-Costing-Intelligence.html
- Reviews and pricing — Capterra: https://www.capterra.com/p/10025012/Tset/ · G2: https://www.g2.com/products/tset/reviews · GetApp: https://www.getapp.com/operations-management-software/a/tset/
