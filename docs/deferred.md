# Deferred Roadmap Items — and why

The 2026-07-15 audit roadmap was executed in-code where that was honest.
These items are deliberately **not** faked in code because they require
external services, business decisions, or organisational work. Each lists its
in-repo substrate so none starts from zero.

| Item | Why deferred | Substrate already in place |
|---|---|---|
| **Stripe billing / subscriptions** | Needs a Stripe account, price book, and a pricing decision (per-seat vs metered). | Metering is live: `llm_calls` carries userId+route token counts; `CV_MONTHLY_TOKEN_QUOTA` enforces monthly quotas with 429s. Stripe bolts onto this without schema changes. |
| **SSO / SAML** | Needs an IdP tenant (Okta/Entra) and a customer to federate with. | JWT auth is isolated in `requireAuth`/`signToken` — an OIDC callback route can mint the same tokens. Orgs/roles substrate exists (`routes/orgs.mjs`). |
| **SOC 2 / ISO 27001** | Organisational certification, not code. | The controls story is started: encrypted secrets at rest, fail-closed prod config, audit-grade request + LLM logs, backup runbook (`docs/operations.md`). |
| **Postgres migration** | SQLite (WAL) is correct at current scale; migrating now adds ops burden without a driver. Trigger: >1 app instance or >50 GB. | All state is behind `db.prepare` call sites; Litestream replication documented. |
| **PLM/ERP integrations (Teamcenter, SAP)** | Needs partner systems and credentials; integration contracts differ per customer. | Exports (Excel/PPTX/PDF/CSV) are the interchange today; `docs/api.md` documents the API for integrators. |
| **i18n (German first)** | Meaningful only with a translation owner; half-translated UIs read worse than English. | Strings are component-local; the currency layer is already multi-currency. |
| **Embeddings / vector retrieval** | BM25 over ~1,650 ideas measurably suffices (see `idea-index.mjs` rationale); embeddings earn their keep nearer ~10k docs. | The index interface is one function (`search`) — swappable without touching callers. |
| **Multi-agent idea verification** | Cost/benefit unproven for this workload; measure first. | The LLM eval harness (`benchmark/llm-eval.mjs`) provides the baseline that would justify (or kill) it. |
| **Feature-based machining cycle model** | Real effort: needs the OCCT setup/face outputs threaded into the engine's cycle model + validation set. Highest-value engine upgrade remaining. | The Python engine already computes setup counts, planar areas, and hole tables; `benchmark/cost-fixtures-holdout.json` documents the CNC-at-volume miss it would fix. |
