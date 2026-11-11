# Global Cost Engineering KPI Dashboard — stage 1 audit (11 Nov 2026)

Spec: `CostVision_KPI_Dashboard_Spec.md` (user upload, 11 Nov 2026). Stage 1 is "audit the existing application
before development"; this note records what CostVision holds today and what the dashboard cannot report without a
decision. No code was changed for this audit; the build that followed is `kpi-dashboard-2026-11-11.md`.

## 1. Where saved costings live today

| Store | What it holds | Who can read it | Fit for a shared dashboard |
|---|---|---|---|
| Browser IndexedDB (`sc:*`, `src/engine/scenario.ts`) | Every "Save scenario": `input` (UniversalStackInput), `result` (PartCostResult), `region`, `createdAt` | That browser only | No — not on the server, lost with the browser profile |
| SQLite `scenarios` (`/api/sync/scenarios`) | A fire-and-forget mirror of the same save (`saveScenarioFromModal`, main.ts). Ownership = `created_by`. The mirror **omits `region`** | Owner only | Partly — the right place, but incomplete and best-effort |
| SQLite `projects` (`/api/projects`) | Software should-cost configs (`sw_should_cost`), baselines, licence registers, SW actuals, drawing reviews | Owner only | Software programmes only |
| SQLite `knowledge_cases` | One row per `commodity::part name` (lower-cased) — **keyed by NAME across all users** | Stats shared | No — consolidates by similar name, which the spec forbids |
| SQLite `supplier_quotes` | Quote per scenario: `unit_price`, `currency` (18-code allowlist), supplier, tooling | **Any signed-in user can list every user's quotes** (no ownership check) | The only "current cost" anywhere — see §4 |
| SQLite `bom_items` | Parent/child scenario links | — | Not needed for v1 |

## 2. Fields the spec needs v what exists

| Spec field | Exists? | Where / note |
|---|---|---|
| Costing ID, owner, created date | Yes | scenario id, `created_by`, `created_at` |
| Last updated | No | `scenarios` has no `updated_at` |
| Component name | Yes | `input.partName` |
| Part number | **No** | nowhere |
| Revision | **No** | each save is a new id; no link between revisions of one part |
| Commodity | Yes | `input` carries the commodity's operations; the form's commodity is not stored as a field on the scenario |
| Vehicle programme (L460, L461, L663, EMA, JEA) | **No** | only inside the PCB ECU library and software demos |
| Model year | **No** | — |
| Powertrain (MHEV, PHEV, BEV …) | **No** | software module only |
| Country / market | Partly | `region` in IndexedDB, dropped by the server mirror |
| Should-cost + currency | Yes | `result.total` — the engine always works in **GBP**; a China costing is computed in £ from the CN book converted at the book's FX |
| Current cost (paid / quoted) + currency | **No** on the costing | `supplier_quotes.unit_price` + `currency`, linked by scenario id, when someone enters one |
| Status (draft / completed / reviewed / approved) | **No** | no workflow exists |
| Annual volume | Yes | `input.annualVolume` (a costing input, not a validated demand figure) |
| Validated / implemented savings | **No** | no status data, so the spec's own rule says these KPIs cannot be shown |

## 3. Tools named in the spec

"CSS System" and "CPSC II" are **not in this repository** (no code, data or reference). They are JLR systems. The
dashboard can consolidate CostVision's own records; bringing in CSS / CPSC II needs either an export file from each
(an import adapter) or an API, and a field map from JLR. Nothing in this session can see their data structures.

Tools inside CostVision that save costings: commodity calculators and CAD to COST (scenarios), PCB analysis
(not saved as a record), software should-cost (`projects`), EV pack / e-motor (scenarios).

## 4. FX today

- `REGIONAL_DATA[cc].fxToGBP` and the world-round books: **one ECB snapshot, 30 Oct 2026** (£1 = €1.1965 …), 39
  currencies. `FX_TO_GBP` (insights.ts) is display FX derived from it; the PCB catalogue keeps its own 29 Sep snapshot.
- No historical FX table, no FX source of record, no live provider — and Phase 1 runs with **no internet**, so a live
  provider is not available inside JLR; rates must come from a file an administrator loads (e.g. JLR Treasury
  monthly rates) or from the rate book.
- A CostVision should-cost is already in £: its FX snapshot is the rate book it was costed on (fingerprint in the
  reproducibility stamp). The only foreign-currency figures are supplier quotes / typed current costs.

## 5. Permissions

Two roles: `user`, `admin` (`requireAdmin` reads the role from the DB). No team, department or organisation concept.
Every costing store is owner-only. Sharing every user's costings with every user is a **change of policy**, not a
setting.

## 6. Risks found while auditing

1. `/api/quotes` GET lists every user's quotes to any signed-in user (no owner filter). Should be fixed whatever the
   dashboard decision.
2. The server scenario mirror is best-effort (`.catch(() => {})`) and drops `region`; a dashboard on it would miss
   saves made offline or before sign-in.
3. `knowledge_cases` merges parts by lower-cased name across users — the dashboard must NOT use it for unique
   components.
4. No revision link: "unique components" can only be counted by part number once a part number exists; by name it
   would break the spec's rule ("do not consolidate solely because names are similar").

## 7. Decisions needed before building (spec §4C, §8, §2)

1. Data scope for v1 (CostVision only, or wait for CSS / CPSC II specs).
2. How records get programme / model year / powertrain / part number / status / current cost (a "record details"
   step on save; nothing in the costing changes).
3. Who sees what (all signed-in users see all records, or a reporting role).
4. Default FX policy for foreign-currency current costs.
