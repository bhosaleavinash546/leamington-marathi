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

## Marketplace
| Method | Path | Notes |
|---|---|---|
| GET | `/api/marketplace` | 1,600+ ideas (with `votes` count, `engineCheck` in ideaData) |
| POST | `/api/marketplace` | submit (pending approval) |
| POST | `/api/marketplace/:id/vote` | toggle your vote |

## Other
Projects (`/api/projects*`), business cases (`/api/business-cases*`, accepts
`sourceIdeaId`), VAVE actions (`/api/vave-actions*`, accepts `sourceIdeaId`),
prices (`/api/prices`), rate library admin (`/api/admin/rate-library*`),
health (`/api/health`).
