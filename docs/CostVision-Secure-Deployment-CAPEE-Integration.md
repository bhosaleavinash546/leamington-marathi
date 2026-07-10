# CostVision — Secure Enterprise Deployment & CAPEE Integration Plan

**Prepared for:** ABC Company / JLR IT-Security & Engineering Systems
**Prepared by:** CostVision engineering (IT-Security Architect / AI Deployment / Enterprise Integration perspective)
**Classification:** Internal
**Version:** 1.0 · July 2026

> **Grounding note:** unlike a generic vendor answer, every claim in this document is verified
> against the CostVision codebase (routes, SDK usage, data flows audited line-by-line). Where a
> capability requires change, the change is named precisely.

---

## 0. Verified Data-Flow Inventory (the facts everything below rests on)

An audit of every outbound network call in the CostVision server:

| # | Data flow | Destination | Contains CAD / images / drawings? | Status |
|---|---|---|---|---|
| 1 | **CAD geometry extraction (OCCT)** | **Local process** (Python/CadQuery in-server) | CAD file processed entirely in memory on the server | ✅ Already internal |
| 2 | **CAD text fallback** | **Local** `preprocessCADFile()` | Raw file text parsed locally; only a derived summary continues | ✅ Already internal |
| 3 | **All 18 cost engines, knowledge base, calibration, similarity, drift monitor, RAG retrieval, exports** | **Local** (Node + SQLite) | No | ✅ Already internal |
| 4 | **LLM calls** (CAD analysis narrative, PCB photo→BOM, AI assistant, RFQ decomposition) | `api.anthropic.com` (default) | **CAD-derived numeric/text summaries; part photos and PCB photos (base64)** | ⚠️ Must be internalized |
| 5 | **Live component pricing** (opt-in, off by default) | Nexar/Octopart, RS, Farnell | Manufacturer part-number strings only — never CAD/images | ⚠️ Policy decision |
| 6 | **News feeds** (dashboard ticker) | Public RSS endpoints | Outbound fetch of public news only; no company data sent | ⚠️ Disable or proxy |

**The single decisive fact:** the CAD file itself **never leaves the server today** — geometry is
extracted by a local OCCT engine. The only flows carrying protected content outward are the **LLM
calls** (photos + CAD-derived summaries). Internalize the LLM endpoint and the platform meets the
requirement in full.

---

## 1. Secure Deployment Strategy

### 1.1 Deployment options (recommendation: Option B, fallback A)

| Option | Description | CAD data locality | AI capability | Verdict |
|---|---|---|---|---|
| **A. Fully air-gapped on-prem** | CostVision Node server + SQLite/PostgreSQL on JLR VMs; LLM features disabled or served by a self-hosted open-weights model on internal GPUs | 100% inside JLR network | Deterministic engines: full. LLM features: reduced quality (self-hosted model) or off | Feasible **today** (the deterministic core needs zero external calls) |
| **B. On-prem + private-cloud LLM (recommended)** | App on-prem; LLM calls routed to **Claude on AWS Bedrock or Google Vertex inside JLR's own cloud tenancy** via PrivateLink/Private Service Connect — traffic never touches the public internet; zero-data-retention configuration | CAD files: on-prem. Photos/summaries: within JLR's own tenancy, encrypted, not retained | Full | **Recommended** — full capability, contractual + technical data control |
| **C. Hybrid SaaS** | App on-prem, public Anthropic API | Photos/summaries traverse public API | Full | ❌ Fails the stated requirement — not proposed |

### 1.2 Secure API gateway architecture

```
JLR internal network
┌────────────────────────────────────────────────────────────────────┐
│  Engineers / CAPEE ──TLS──▶ JLR API Gateway (Apigee/Azure APIM)     │
│        │  OIDC (Azure AD)         │  mTLS + JWT validation          │
│        ▼                          ▼                                 │
│   CostVision Web UI ─────▶ CostVision App Server (Node)             │
│                              ├── OCCT geometry engine (local)       │
│                              ├── 18 cost engines + knowledge base   │
│                              ├── SQLite→PostgreSQL (encrypted)      │
│                              └── LLM egress ▶ Internal LLM Gateway  │
│                                              │ (allow-listed, DLP-  │
│                                              │  inspected, logged)  │
└──────────────────────────────────────────────┼──────────────────────┘
                             PrivateLink / VPN │ (Option B only)
                              JLR cloud tenancy▼
                              Claude on Bedrock/Vertex (no retention)
```

Key properties:
- **One egress point.** All LLM traffic exits via a single internal LLM gateway; everything else
  is deny-by-default at the firewall. (The Anthropic SDK honours a base-URL override, so pointing
  CostVision at the internal gateway is **configuration, not code**.)
- CostVision's server sits behind the corporate API gateway — no direct exposure.

### 1.3 Zero-trust access model
- No implicit network trust: every request to CostVision authenticated (OIDC token) and authorized
  per route; service-to-service (CAPEE→CostVision) uses mTLS + short-lived client-credential tokens.
- CostVision already enforces JWT on all sensitive routes (projects, knowledge base, rate library);
  swap the local JWT issuer for **Azure AD (Entra ID)** token validation — a bounded change (§5).

### 1.4 Role-based access control
Map Azure AD groups → CostVision roles:

| Role | Rights |
|---|---|
| Cost Engineer | Run costings, view knowledge base, log actuals |
| Senior/Lead | + edit rate libraries, dismiss drift findings |
| Admin | + upload company rate library, user administration |
| CAPEE service account | API-only: costing endpoints + knowledge read |

### 1.5 PLM/CAD vault integration (Teamcenter / 3DEXPERIENCE / Windchill)
- CostVision consumes CAD via its `/api/cad/analyze` upload endpoint. Integrate the vault by adding
  a **vault connector** service inside JLR that pulls the released STEP/JT from PLM (using the
  engineer's delegated credentials), streams it to CostVision, and never persists it to disk.
- CAD files are processed **in memory** today (multer buffer → OCCT) and are not stored by
  CostVision — an important compliance property to preserve and to state in the DPIA.

---

## 2. CAD Data Protection

**Can CostVision run without sending CAD data externally? Yes — verified in code:**

| Function | Where it runs today | External? |
|---|---|---|
| CAD/geometry processing (volume, weight, walls, features, setups) | Local OCCT engine (in-server Python bridge) | No |
| Feature extraction (holes, threads, faces, undercuts) → feature-based costing | Local OCCT + local deterministic engine | No |
| BOM extraction from files (CSV/XML/pick-and-place) | Local parsers | No |
| BOM extraction from **photos** (PCB image→BOM) | LLM vision call | **Yes today** → route to private LLM (§1.1-B) or disable |
| AI narrative/insight generation | LLM call (summaries only) | **Yes today** → same remedy |
| All cost math, learning loop, autonomous agent | Local | No |

**Architectural changes required (small, enumerated):**
1. Point the LLM client at the internal gateway / Bedrock-Vertex endpoint (config or ~50-line
   client-factory change to use Anthropic's Bedrock/Vertex SDK).
2. Add a build/runtime flag `AIR_GAPPED=1` that hard-disables all LLM routes and the news/pricing
   fetchers, so security can *prove* zero egress in Tier-0 environments (test: outbound firewall
   deny + full regression suite — the 790 deterministic tests pass without network).
3. Disable/proxy the news RSS fetcher and keep live component pricing **off** (its default) unless
   procurement approves MPN-only egress.

**Logs & metadata:** application logs contain part names and cost figures (business-sensitive, not
CAD). Actions: log to the corporate SIEM over TLS; no CAD payloads are ever logged (verified —
uploads are buffered, not written); set log retention per JLR policy; redact part identifiers in
DEBUG logs if programmes are classified.

---

## 3. Integration with CAPEE

CostVision is API-first — every capability used by its own UI is a JSON endpoint, which is exactly
what CAPEE needs.

### 3.1 Integration surface (exists today)

| CAPEE need | CostVision endpoint | Notes |
|---|---|---|
| Should-cost a part | cost engines via `computeUniversalStack` — expose as `POST /api/cost/:commodity` (thin wrapper, ~1 day) | Engines are pure TS modules; also embeddable as an **npm package** in CAPEE's backend if preferred over HTTP |
| CAD → auto-inputs | `POST /api/cad/analyze` | CAD stays inside; returns geometry + suggested inputs |
| PCB photo → BOM | `POST /api/pcb/analyze-image-stream` | Private-LLM routing per §1 |
| Similar parts / suggestions | `POST /api/knowledge/similar` | The learning loop, callable from CAPEE screens |
| Log actual price | `POST /api/knowledge/actual` | CAPEE PO data can feed the learning automatically — **the highest-value integration** |
| Autonomous findings | `GET /api/knowledge/drift` | Surface in CAPEE dashboards |
| RFQ analysis | `POST /api/rfq/analyze` | Structured lines in, negotiation brief out |
| Rate libraries | `GET/PUT /api/rate-library/*` | See 3.3 |

### 3.2 Two integration patterns (pick per feature)
- **Pattern 1 — Service call (recommended default):** CAPEE backend → CostVision REST API via the
  corporate gateway (mTLS + Azure AD client credentials). Loose coupling, independent releases.
- **Pattern 2 — Engine embedding:** package `src/engine/**` (pure TypeScript, no I/O) as a private
  npm module inside CAPEE for the deterministic math only. Zero network hops; but forfeits the
  shared knowledge base unless CAPEE also calls the knowledge API. Use only where latency or
  isolation demands it.

### 3.3 Shared data architecture
- **Single source of truth for rates:** either (a) CAPEE adopts CostVision's rate-library API
  (admin-gated company library upload already exists), or (b) a nightly sync job maps CAPEE's
  material/machine tables into CostVision's `RateLibrary` schema. Recommend (a) — one governed
  library, both tools consume it.
- **Shared knowledge base:** move CostVision from SQLite to **PostgreSQL** (bounded change — the
  store layer is already isolated behind data-access modules) on JLR's managed DB estate; both
  CAPEE and CostVision read/write cases and actuals there. Every CAPEE costing then feeds the
  learning loop, and CAPEE inherits similarity suggestions.

### 3.4 Unified authentication
- Replace CostVision's local JWT signup/signin with **OIDC against Azure AD** (validate Entra
  tokens in the existing `auth-middleware`; group→role mapping per §1.4). LDAP-only fallback via
  the gateway if required. Effort: ~1–2 weeks including role mapping and tests.

### 3.5 CAPEE modifications required
| Layer | Change | Size |
|---|---|---|
| Backend | HTTP client for CostVision APIs + token acquisition; PO-price hook → `knowledge/actual` | Small |
| UI | "AI insights" panel on CAPEE's costing screen (similar parts, calibrated estimate, uncertainty band); CAD-upload button that proxies to `/api/cad/analyze`; drift-findings widget | Medium |
| Data pipeline | Rate-library adoption or sync; one-off historical-quote import to seed the knowledge base | Small–Medium |

### 3.6 Workflow merge & governance
- CAPEE remains the system of record for costing workflow/approvals; CostVision is the **AI + physics
  engine and organisational memory** behind it. No forked truth: rates and knowledge live once.
- **Version control:** CostVision ships from a git repo with 790 automated tests and CI-able build
  (`tsc` + `vitest` + `vite`); pin CAPEE against tagged CostVision API versions; contract tests in
  CAPEE's pipeline against a staging CostVision.

---

## 4. Security & Compliance

- **Encryption in transit:** TLS 1.2+ everywhere internally; mTLS for CAPEE↔CostVision; PrivateLink
  (no public path) for Option-B LLM traffic.
- **Encryption at rest:** move DB to PostgreSQL with TDE / encrypted volumes (LUKS or the cloud
  KMS equivalent). CAD files are **not stored at rest** by CostVision (in-memory processing) —
  preserve this property; if caching is ever added, require AES-256 + TTL.
- **Secure CAD storage:** stays in the PLM vault (system of record). CostVision holds derived
  numbers only.
- **DLP:** the internal LLM gateway is the DLP chokepoint — inspect/annotate LLM payloads, enforce
  the allow-list, alert on anomalies. Firewall deny-all-egress from the CostVision host except the
  gateway.
- **Audit trails:** gateway access logs + CostVision app logs (auth events, rate-library changes,
  knowledge writes, drift dismissals are all attributable to user IDs today) → SIEM. Add an
  append-only audit table for admin actions (small change).
- **Compliance mapping:**
  - **ISO 27001:** covered by the controls above (A.8 asset handling, A.9 access, A.10 crypto,
    A.12 ops, A.13 comms); include CostVision in the ISMS scope statement.
  - **SOC 2:** relevant if consuming cloud LLM — AWS Bedrock / Google Vertex carry SOC 2 Type II;
    obtain reports via the cloud agreements.
  - **GDPR:** minimal personal data (user accounts, quotes may name suppliers). DPIA the LLM flow;
    zero-retention config on Bedrock/Vertex; data stays in-region (eu-west for JLR).
  - **ISO/SAE 21434 (automotive cyber):** CostVision is an engineering IT tool, not an in-vehicle
    system — out of direct scope, but apply TARA-style review to the LLM egress and supply-chain
    (SBOM for the Node dependencies; `npm audit` in CI).

---

## 5. Required Modifications to CostVision (complete list)

| # | Modification | Why | Effort |
|---|---|---|---|
| 1 | LLM client factory: base-URL override / Bedrock / Vertex support | Private LLM routing (§1.1-B) | Days |
| 2 | `AIR_GAPPED` mode flag: disable LLM, news, live pricing; provable zero egress | Tier-0 environments, security sign-off | Days |
| 3 | Azure AD (OIDC) token validation replacing local JWT issuance | Unified auth | 1–2 weeks |
| 4 | SQLite → PostgreSQL for projects/knowledge/rate stores | Shared, managed, encrypted DB | ~1 week (stores are isolated modules) |
| 5 | Thin `POST /api/cost/:commodity` wrapper over the engines | Clean CAPEE service contract | Days |
| 6 | Append-only admin audit table + SIEM log shipping | Audit trail hardening | Days |
| 7 | Historical-quote CSV import (seeds knowledge base + calibration) | Start smart, not empty | Days |
| 8 | (If required) country-specific LLM routing — per-region gateway endpoints | Data-residency routing | Days (config-driven) |
| 9 | (Optional) self-hosted open-weights vision/LLM adapter for full air-gap AI | Only if private-cloud tenancy is rejected | Weeks + GPU hardware |

Nothing on this list is architectural surgery — the engine/UI/server separation and the isolated
store modules make each item bounded.

---

## 6. Step-by-Step Rollout Plan

| Phase | Scope | Exit criteria | Indicative duration |
|---|---|---|---|
| **1. IT-Security assessment** | Review this data-flow inventory against JLR policy; decide Option A vs B; DPIA for LLM flow | Signed architecture decision | 2–3 weeks |
| **2. Architecture design** | Gateway config, Azure AD app registrations, network zones, PostgreSQL provisioning, LLM gateway design | Approved HLD/LLD | 3–4 weeks |
| **3. Pilot with dummy CAD** | Deploy on-prem in a sealed zone; firewall deny-all; run the 790-test suite + dummy STEP/photos; verify zero unexpected egress via network capture | Security-witnessed egress test passed | 2 weeks |
| **4. CAPEE integration pilot** | Service-account auth; CAPEE calls costing + knowledge APIs; PO-price hook feeding actuals; 2–3 friendly cost engineers | End-to-end costing from CAPEE with AI insights; accuracy dashboard populated | 4–6 weeks |
| **5. Enterprise rollout** | Azure AD groups for all users; historical-quote seeding; training (1-hour session — the tool adds one habit: "Log Actual £") | Adoption + support runbook | 4 weeks |
| **6. Monitoring & governance** | SIEM dashboards, quarterly access review, monthly drift-findings review in sourcing meetings, rate-library change board | Steady-state ops | Ongoing |

---

## 7. Final Recommendation & Feasibility Assessment

| Question | Verdict |
|---|---|
| Secure deployment feasible with **no CAD leaving JLR**? | **Yes.** CAD processing is already fully local (OCCT in-process, files never persisted). The only change needed is routing LLM calls to a private endpoint — or air-gapping with the deterministic core, which works today with zero egress. |
| CAPEE + CostVision integration feasible? | **Yes, and high-value.** API-first design means CAPEE consumes costing, CAD-to-inputs, similarity, calibration and drift findings as internal services; the PO-price hook turns CAPEE's data into CostVision's learning fuel. |
| Required changes | The 9-item list in §5 — all bounded; items 1–5 are the critical path (~4–6 engineering weeks total). |
| Remaining risks | (i) If security rejects private-cloud LLM tenancy, vision features (PCB photo→BOM) need self-hosted models — quality/hardware trade-off; (ii) knowledge base value depends on adoption of the one-click actual-logging habit; (iii) single team currently maintains CostVision — mitigate with the existing test suite (790), docs, and a named CAPEE-side maintainer. |
| Governance model | Rate-library change board (monthly); drift-findings review in sourcing meetings; quarterly access + egress audit; CostVision releases tagged and contract-tested against CAPEE; knowledge base backed up with the corporate DB estate. |

**Bottom line:** the requirement is not just achievable — CostVision's architecture is unusually
well-suited to it, because the heavy CAD/geometry/cost work was built local-first, and the LLM is
an *edge* dependency behind one configurable endpoint, not the core.

---

## Appendix A — Security Checklist (condensed)

- [ ] Architecture decision: Option A (air-gapped) or B (private-cloud LLM) signed off
- [ ] CostVision host: deny-all egress except internal LLM gateway (B) or total (A)
- [ ] `AIR_GAPPED` / base-URL configuration applied and witnessed
- [ ] Azure AD OIDC live; local signup disabled; roles mapped to AD groups
- [ ] mTLS between CAPEE and CostVision; service account least-privilege
- [ ] PostgreSQL with encryption at rest; backups in corporate estate
- [ ] Confirm no CAD persistence (in-memory processing) documented in DPIA
- [ ] News feeds disabled or proxied; live component pricing off unless approved
- [ ] Logs → SIEM; no CAD payloads in logs; retention per policy
- [ ] npm SBOM + `npm audit` in CI; dependency update cadence agreed
- [ ] Pen test of gateway + CostVision endpoints before Phase 5
- [ ] Quarterly access review + egress re-verification scheduled
