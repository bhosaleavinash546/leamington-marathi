# BrainSpark API

All endpoints are JSON over `/api/*`. Authenticated routes take
`Authorization: Bearer <jwt>` (from `/api/auth/signin`). LLM endpoints resolve
the Anthropic key as: request body `apiKey` → stored credential
(`/api/settings/api-key`) → server `ANTHROPIC_API_KEY`.

## Auth
| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/signup` | name, email, password (zod-validated) |
| POST | `/api/auth/signin` | → `{ token, user }` |
| POST | `/api/auth/signout` | revokes the token (persistent) |
| POST | `/api/auth/forgot-password` / `reset-password` / `resend-otp` | OTP flow |
| GET | `/api/auth/me` | current user |
| GET/POST/DELETE | `/api/settings/api-key` | stored (encrypted) Anthropic key |

## Should-cost (deterministic)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/should-cost/catalogue` | materials / processes / regions |
| POST | `/api/should-cost` | single-op or routed: pass `route: ["Sand Casting","Machining (secondary ops)"]` or a chained `process` string ("HPDC + CNC"); optional `toleranceClass`, `surfaceFinish`, `criticalCharacteristics`, `projectedAreaCm2`, `wallThicknessMm`. Returns breakdown, P10-P90, volume curve, live-price provenance, per-op route lines, CO2e+CBAM |
| POST | `/api/should-cost/quotes` | teach a real supplier quote (calibration) |
| GET | `/api/should-cost/quotes` | quote corpus + calibration state |
| POST | `/api/should-cost/bom` | multi-line make/buy roll-up with CORRELATED Monte-Carlo |
| POST | `/api/should-cost/export` | CBS .xlsx negotiation pack |
| POST | `/api/cost-down` | agentic cost-down: AI explores, engine verifies |

## Analysis & AI
| Method | Path | Notes |
|---|---|---|
| POST | `/api/analyze` | idea generation (SSE) with prior-art retrieval + feedback steering |
| POST | `/api/chat` | idea-context chat (SSE) |
| POST | `/api/assistant-chat` | assistant with engine tool-use (computes real costs) |
| POST | `/api/cad-analyze` | CAD/drawing → deterministic cost + DFMA narrative (PDF packs supported) |
| POST | `/api/cad-step` | STEP parse; >1.5 MB returns `202 {jobId}` (worker thread) |
| GET | `/api/jobs/:id` | job status; `?stream=1` = SSE |
| POST | `/api/pcb-bom-cost` | PCB photo → BOM + parametric cost |
| GET | `/api/search?q=` | BM25 search: ideas + your projects + quotes |

## DFM / DFA Studio (deterministic — no LLM on this path)
Every figure comes from an OpenCascade kernel or one of the costing engines. The
AI is deliberately not on the path that produces the numbers.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/dfm/rules` | the rule catalogue: **26 rules** across 4 process families, each with its threshold, unit, rationale, fix and cited **source**, plus the DFA time-model provenance and `unwritten` — the 5 design drivers deliberately NOT implemented, each naming the measurement it would need. Fetchable before anything is uploaded, so a user can see what *will* be checked and what never will be |
| POST | `/api/dfm/analyze` | multipart `cadFile` (STEP/IGES only — an STL has no topology). Optional `material`, `costProcess`, `region`, `annualVolume`, `toleranceClass`, `surfaceFinish`, or an explicit `process` family. Returns measured geometry (`dfm.draft`, `dfm.wallThickness`, `dfm.features` incl. ribs and prismatic pockets/slots, `dfm.sheetMetal`, `dfm.setups`), per-family rule `results`, priced cost impact, and **`analysisLimits`** |
| POST | `/api/dfm/dfa` | multipart `cadFile` = a multi-solid STEP assembly, plus `options` JSON (`region` or `labourRateEurPerHr`, `density`/`densityByIndex`, `answers`, `securingByIndex`, `insertionFlags`, `calibration`). Returns the decomposition (per-solid mass, bbox, **measured** α/β symmetry, shape-signature instance groups, contacts) and the DFA analysis |

Three behaviours worth knowing before you integrate:

- **A rule has three outcomes, not two.** `findings` (failed), `passed`, and
  `notEvaluated` — each unevaluated rule carries the reason its measurement was
  unavailable. `coveragePct` and `evaluatedCount` say how much of the catalogue
  actually ran, and `score` is `null` rather than 100 when nothing could be.
- **A unit error withholds the numbers.** If the model looks like it is in metres,
  every dimensional finding is suppressed and re-reported as not-evaluated with
  that reason — findings computed at the wrong scale are worse than none.
- **The catalogue states its own gaps.** `unwritten` lists the drivers that have
  no rule — tool reachability, tolerance stack-up, sink/warp, blank nesting,
  press tonnage — because each needs a measurement the pipeline does not produce.
  A rule with no measurement can only ever report NOT EVALUATED, so shipping one
  would inflate the rule count while lowering coverage on every part forever.
- **The DFA index is withheld until a human answers.** `theoreticalMinParts` and
  `designEfficiencyPct` stay `null` until the three minimum-part questions are
  answered per part; geometry only *proposes* them.

## Marketplace
| Method | Path | Notes |
|---|---|---|
| GET | `/api/marketplace` | 1,600+ ideas (with `votes` count, `engineCheck` in ideaData) |
| POST | `/api/marketplace` | submit (pending approval) |
| POST | `/api/marketplace/:id/vote` | toggle your vote |

## Complete route index

The sections above describe the endpoints in depth. This index is the COMPLETE
list — every route the server registers, with whether it needs a bearer token.
`tests/api-documented.test.mjs` fails when a route is added without a row here,
because until Sept 2026 this file described 30 of 139 paths and the remaining
109 were discoverable only by grepping the source (review R-43).

Auth: **yes** = `Authorization: Bearer <jwt>` required. Routes marked **no** are
deliberately public (catalogues, health, the shared-link reader, the landing
form) — everything that reads or writes user data requires a token.

### Auth and account
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/signup` | no | create an account; sends a verification OTP |
| POST | `/api/auth/verify-signup` | no | confirm the signup OTP |
| POST | `/api/auth/signin` | no | → `{ token, user }` |
| POST | `/api/auth/signout` | yes | revoke the presented token (persisted, survives restart) |
| POST | `/api/auth/forgot-password` | no | start the reset OTP flow |
| POST | `/api/auth/reset-password` | no | complete it |
| POST | `/api/auth/resend-otp` | no | reissue a pending OTP |
| GET | `/api/auth/me` | yes | the current user |
| GET | `/api/settings/api-key` | yes | whether a personal Anthropic key is stored (never the key) |
| POST | `/api/settings/api-key` | yes | store one, encrypted at rest |
| DELETE | `/api/settings/api-key` | yes | remove it |

### Should-cost and the deterministic engines
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/should-cost/catalogue` | no | materials, processes, regions |
| POST | `/api/should-cost` | yes | single-op or routed estimate — see the section above |
| POST | `/api/should-cost/quotes` | yes | teach a real supplier quote |
| GET | `/api/should-cost/quotes` | yes | the caller's quote corpus and calibration state |
| POST | `/api/should-cost/bom` | yes | multi-line roll-up with correlated Monte-Carlo |
| POST | `/api/should-cost/export` | yes | CBS `.xlsx` negotiation pack |
| POST | `/api/should-cost/delta-ideas` | yes | engine-priced deltas against a baseline estimate |
| POST | `/api/cost-down` | yes | agentic cost-down: the model explores, the engine verifies |
| POST | `/api/harness-cost` | yes | wire-harness engine (conductors, terminals, connectors, assembly) |
| GET | `/api/prices` | no | live commodity prices with their vintage |

### PCB
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/pcb-cost/catalogue` | no | stack-ups, finishes, classes |
| POST | `/api/pcb-cost` | yes | parametric bare-board cost |
| POST | `/api/pcb-detailed` | yes | cost-breakdown view; reconciles with `/api/pcb-cost` within 0.5% |
| POST | `/api/pcb-detailed/mhr` | yes | machine-hour-rate build-up behind that view |
| POST | `/api/pcb-bom-cost` | yes | photo → BOM → assembled cost |
| POST | `/api/pcb-bom-import` | yes | import a BOM file instead of a photo |
| POST | `/api/pcb-part-prices` | yes | live component pricing (DigiKey/Octopart) |
| GET | `/api/pcb-part-prices/status` | yes | whether that lookup is configured — labelled, never faked |
| POST | `/api/pcb-insights` | yes | narrative read of a costed board |

### CAD, DFM and DFA
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/cad-analyze` | yes | CAD/drawing → deterministic cost + DFMA narrative |
| POST | `/api/cad-step` | yes | STEP parse; >1.5 MB returns `202 { jobId }` |
| POST | `/api/cad-diff` | yes | compare two revisions of a part |
| POST | `/api/cad/analyze` | yes | OCCT geometry analysis (server kernel) |
| POST | `/api/cad/tessellate` | yes | mesh for the viewer |
| GET | `/api/jobs/:id` | yes | job status; `?stream=1` for SSE |
| GET | `/api/dfm/rules` | yes | the rule catalogue with sources and its stated gaps |
| GET | `/api/dfm/options` | yes | selectable process families, materials, classes |
| POST | `/api/dfm/analyze` | yes | one part: measured geometry, rule results, priced impact |
| POST | `/api/dfm/batch` | yes | many parts in one submission |
| POST | `/api/dfm/dfa` | yes | multi-solid assembly → decomposition + DFA analysis |
| POST | `/api/dfm/drawing-extract` | yes | pull tolerances and notes off a drawing |
| GET | `/api/dfm/rule-overrides` | yes | the caller's plant-specific thresholds |
| PUT | `/api/dfm/rule-overrides/:ruleId` | yes | set one |
| DELETE | `/api/dfm/rule-overrides/:ruleId` | yes | revert to the catalogue value |
| GET | `/api/dfm/snapshots` | yes | saved analyses |
| POST | `/api/dfm/snapshots` | yes | save one |
| GET | `/api/dfm/snapshots/:id` | yes | read one |
| DELETE | `/api/dfm/snapshots/:id` | yes | delete one |

### Prism (backend paths keep the `part360` name — API stability over cosmetics)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/part360/dossier` | yes | the evidence dossier, entitlement waterfall and quote forensics |
| POST | `/api/part360/batch` | yes | the same across a folder of parts |
| POST | `/api/part360/assembly` | yes | decompose a STEP assembly into a suggested BOM |
| POST | `/api/part360/assembly-dossier` | yes | roll a confirmed BOM up to an assembly dossier |
| POST | `/api/part360/draft-functions` | yes | first-draft function list for value analysis |
| POST | `/api/part360/quote-extract` | yes | read a supplier quote PDF into engine buckets |
| GET | `/api/part360/teardowns` | yes | the caller's private teardown evidence |
| POST | `/api/part360/teardowns` | yes | add one |
| DELETE | `/api/part360/teardowns/:id` | yes | remove one |

### Ideation, innovation and TRIZ
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/analyze` | yes | idea generation (SSE) |
| POST | `/api/chat` | yes | idea-context chat (SSE), optionally grounded in a Prism dossier |
| POST | `/api/assistant-chat` | yes | assistant with engine tool-use |
| POST | `/api/teardown-vision` | yes | photo → teardown observations |
| GET | `/api/innovate/methods` | no | the 11 method cores and what each needs |
| POST | `/api/innovate/value` | yes | function-cost matrix |
| POST | `/api/innovate/fast-matrix` | yes | FAST decomposition |
| POST | `/api/innovate/spec-deltas` | yes | cost of each specification, priced |
| POST | `/api/innovate/teardown-delta` | yes | your part against a teardown benchmark |
| POST | `/api/innovate/target` | yes | target-cost gap decomposition |
| POST | `/api/innovate/morph` | yes | morphological alternatives |
| POST | `/api/innovate/dfa` | yes | part-count reduction candidates |
| POST | `/api/innovate/resolve` | yes | resolve a named lever to engine inputs |
| GET | `/api/triz/catalogue` | no | principles, parameters, the contradiction matrix |
| POST | `/api/triz/recommend` | yes | principles for a stated contradiction |
| POST | `/api/triz/resolve` | yes | apply one to the part at hand |
| POST | `/api/triz/separate` | yes | the four separation strategies |
| POST | `/api/triz/trim` | yes | function-model trimming |
| GET | `/api/idea-archive` | yes | the quality-diversity archive and its coverage gaps |
| POST | `/api/feedback` | yes | approve/reject an idea; steers later generation |
| GET | `/api/feedback/context` | yes | the caller's taste profile and avoid-list |

### Horizon (foresight)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/foresight/catalogue` | no | subjects and lanes |
| POST | `/api/foresight/predict` | yes | the forward view for a subject |
| POST | `/api/foresight/evidence` | yes | the evidence behind it, with currency badges |
| POST | `/api/foresight/deepdive` | yes | a single question, researched |
| POST | `/api/foresight/research` | yes | one research sweep |
| POST | `/api/foresight/deep` | yes | the iterative deepening loop; returns a job |
| GET | `/api/foresight/deep/:jobId` | yes | that job's state and result |
| POST | `/api/foresight/critique` | yes | adversarial read of a finding |
| GET | `/api/foresight/ledger` | yes | the research ledger |
| POST | `/api/foresight/ledger` | yes | record a finding |
| GET | `/api/foresight/ledger/:id` | yes | one entry with its sources |
| DELETE | `/api/foresight/ledger/:id` | yes | remove one |
| POST | `/api/foresight/promote` | yes | promote a verified finding into the register |
| GET | `/api/foresight/promoted` | yes | what has been promoted |
| DELETE | `/api/foresight/promoted/:id` | yes | un-promote |
| POST | `/api/patent-watch` | yes | patent activity for a subject |

### Marketplace
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/marketplace` | yes | approved ideas with votes and engine stamps |
| POST | `/api/marketplace` | yes | submit one (pending approval) |
| POST | `/api/marketplace/:id/vote` | yes | toggle your vote |
| GET | `/api/marketplace/similar` | yes | nearest ideas to a query |
| GET | `/api/marketplace/clusters` | yes | thematic clusters |
| GET | `/api/marketplace/count` | no | how many ideas the corpus holds |

### Projects, business cases, VAVE
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/projects` | yes | the caller's projects |
| POST | `/api/projects` | yes | create one |
| GET | `/api/projects/:id` | yes | read one |
| DELETE | `/api/projects/:id` | yes | delete one |
| PATCH | `/api/projects/:id/annotations` | yes | annotate ideas within it |
| POST | `/api/projects/:id/share` | yes | mint a read-only share token |
| POST | `/api/projects/:id/cross-pollinate` | yes | ideas from adjacent projects |
| GET | `/api/shared/:token` | no | read a shared project — token is the credential |
| GET | `/api/business-cases` | yes | list |
| POST | `/api/business-cases` | yes | create (accepts `sourceIdeaId`) |
| PATCH | `/api/business-cases/:id` | yes | update, including stage-gate movement |
| DELETE | `/api/business-cases/:id` | yes | delete |
| GET | `/api/business-cases/:id/comments` | yes | thread |
| POST | `/api/business-cases/:id/comments` | yes | comment |
| GET | `/api/business-cases/gate-criteria` | yes | the scorecard definition |
| GET | `/api/business-cases/kpi` | yes | portfolio KPIs |
| GET | `/api/vave-actions` | yes | list |
| POST | `/api/vave-actions` | yes | create (accepts `sourceIdeaId`) |
| PATCH | `/api/vave-actions/:id` | yes | update |
| DELETE | `/api/vave-actions/:id` | yes | delete |
| GET | `/api/search` | yes | BM25 across ideas, projects and quotes |

### Organisations and administration
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/orgs` | yes | the caller's organisations and role |
| GET | `/api/orgs/:orgId/members` | yes | members |
| POST | `/api/orgs/:orgId/invites` | yes | mint a single-use invite token (admin role) |
| POST | `/api/orgs/invites/claim` | yes | redeem one |
| PATCH | `/api/orgs/:orgId/members/:email` | yes | change a member's role (admin role) |
| GET | `/api/admin/rate-library` | yes | the active custom rate library |
| POST | `/api/admin/rate-library` | yes | upload a new version |
| POST | `/api/admin/rate-library/preview` | yes | what a candidate library would change, before adopting it |
| GET | `/api/admin/rate-library/status` | yes | which version is live |
| GET | `/api/admin/rate-library/versions` | yes | version history |
| GET | `/api/admin/rate-library/versions/:version/diff` | yes | diff two versions |
| POST | `/api/admin/rate-library/rollback` | yes | go back to a named version |
| POST | `/api/admin/rate-library/revert` | yes | return to the built-in library |

### Public
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | no | liveness |
| POST | `/api/interest` | no | landing-page interest form |
| POST | `/api/webhooks/test` | yes | fire a test payload at a configured webhook |
