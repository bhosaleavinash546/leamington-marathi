# Operations — what's handled, what's honestly not

Status of the production-readiness gaps, kept current so nobody discovers them in an incident.
"Pilot" below = a handful of trusted users on one instance.

## Repository and environment — read this before anything else

**BrainSpark has no repository of its own.** It is a branch —
`claude/auto-cost-reduction-tool-mzol0x` — inside `bhosaleavinash546/leamington-marathi`, whose
`main` branch is an unrelated product: the Leamington Marathi community website (GitHub Pages,
`CNAME` → `leamingtonmarathi.com`). `main` has no `package.json`, no `server.mjs`, no `.github/`.
A third unrelated project, a Marathi panchang engine, sits on its own branch in the same repo.

**The failure this causes.** An ephemeral container clones the repo at the *default* branch — the
website — and may then create the working branch from that commit instead of checking out the
remote branch that holds the work. Observed 2026-08-12:

```
efa16de  checkout: moving from efa16de… to claude/auto-cost-reduction-tool-mzol0x
```

The checkout looks like the website and BrainSpark appears to have vanished. Nothing is lost — the
remote branch is intact — but the session will happily start work from the wrong base.

**Check on every fresh container, before touching anything:**

```bash
git rev-parse HEAD                      # must NOT be main's tip
ls package.json server.mjs              # both present => you are on BrainSpark
```

**Restore if wrong** (destroys uncommitted work — confirm there is none first):

```bash
git fetch origin claude/auto-cost-reduction-tool-mzol0x
git reset --hard origin/claude/auto-cost-reduction-tool-mzol0x
```

**The real fix is a repository of its own**, which makes a fresh clone correct by construction and
needs no check and no rescue. See DECISIONS 48 for why nothing *inside* this repo can solve it, for
the cloud-environment setup script that partially mitigates it from outside, and for the migration
commands — ready to run by anyone whose GitHub access is not bound to this single repo.

## Environment variables — the complete list

Every `process.env.*` this codebase reads, with its default and what happens when it is absent.
`tests/env-documented.test.mjs` fails when a new one is introduced without a row here, so this
table cannot silently fall behind the code again (Sept 2026 review, R-43 — 20 of 32 were
undocumented, two of them fatal in production).

**Absent is a decision, not a blank.** Where an unset variable changes behaviour rather than
merely picking a default, the row says so.

### Required in production

| Variable | Default | If unset |
|---|---|---|
| `JWT_SECRET` | `autocost-ai-dev-secret-2025` | **The server refuses to start when `NODE_ENV=production`.** Every issued token would be forgeable with a secret published in this repo. |
| `ANTHROPIC_API_KEY` | — | Server-side key resolution fails; users must supply their own key in Settings. Every LLM-backed tool returns an honest "no API key configured" rather than degrading silently. |
| `CREDENTIALS_SECRET` | falls back to `JWT_SECRET` | Stored per-user API keys are encrypted with the JWT secret, so rotating the JWT secret makes every stored key undecryptable. Set it separately in production. |
| `DATA_DIR` | `./data` | The SQLite DB lands inside the checkout — lost on every container rebuild. |

### Deployment

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `3001` | HTTP listen port. |
| `NODE_ENV` | unset | `production` enables the JWT-secret refusal above and the production CORS policy. |
| `ALLOWED_ORIGINS` | unset (permissive) | Comma-separated origin allow-list for CORS. |
| `TRUST_PROXY` | `1` | Express `trust proxy` hop count. Wrong values make `req.ip` — and therefore rate limiting — read the proxy instead of the client. |
| `LOG_LEVEL` | `info` | pino level. |
| `BRAINSPARK_BACKUPS` | on | `0` disables the automatic SQLite backups described below. |

### Accounts and email

| Variable | Default | Notes |
|---|---|---|
| `EMAIL_USER` / `EMAIL_PASS` | unset | SMTP credentials. **When unset, OTPs are printed to the server log instead of emailed** — a development affordance that must not reach production. |
| `SMTP_HOST` | `smtp.gmail.com` | |
| `SMTP_PORT` | `587` | STARTTLS; `secure` is false at this port. |
| `EMAIL_FROM_NAME` | `BrainSpark` | Display name on outbound mail. |
| `ADMIN_EMAILS` | unset | Comma-separated; these accounts get the admin surfaces. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | unset | Seeds a first admin account on an empty database. |

### Model and cost control

| Variable | Default | Notes |
|---|---|---|
| `CV_SMALL_MODEL` | `claude-sonnet-5` | The cheap model for critics, repairs and extraction. The flagship is a literal in the code, deliberately — see DECISIONS. |
| `CV_THINKING_BUDGET` | `6000` | Extended-thinking token budget on the ideation call. |
| `CV_MONTHLY_TOKEN_QUOTA` | `3000000` | Per-user monthly cap. Requests past it are refused with the tally, not silently truncated. |
| `CV_ANALYZE_TIMEOUT_MS` | `600000` | Whole-pipeline ceiling for `/api/analyze`. |
| `CV_ANALYZE_CALL_TIMEOUT_MS` | `420000` | Ceiling for a single model call inside that pipeline. |
| `BRAINSPARK_IDEATION_MODE` | unset | `legacy` reverts every generation upgrade from this build — the A/B arm the ideation eval measures against. |
| `CV_FORESIGHT_READ_COUNT` | `6` | Documents the Horizon deep-research loop fetches and reads per sweep. |

### Geometry and upload limits

| Variable | Default | Notes |
|---|---|---|
| `CV_MAX_CAD_WORKERS` | `2` | Concurrent CAD worker processes. |
| `CV_MAX_PYTHON_PROCS` | `2` | Concurrent OCCT/python subprocesses. Raise only with the RAM to match — each holds a full tessellation. |
| `CV_MAX_STL_BYTES` | `314572800` (300 MB) | Upload ceiling for mesh files. |
| `CV_DFM_GEO_TIMEOUT_MS` | `120000` | Per-part DFM geometry timeout, hard-capped at 600000 in code. |
| `CV_DFM_RATE_MAX` | `40` | DFM requests per 10-minute window. |
| `CV_TESSELLATE_RATE_MAX` | `60` | Tessellation requests per 10-minute window. |

### Static shop-window build

Build-time only — read by `vite.site.config.ts` and `scripts/site-postbuild.mjs`
during `npm run build:site`, never by the running server.

| Variable | Default | Notes |
|---|---|---|
| `SITE_BASE` | `/<repo>/` from `site/site.config.json` | URL prefix the GitHub Pages bundle is built for. **Unset is the normal case** — the default is derived from the repo name, which is what Pages serves a project site from. Set it to `/` to host the shop window at a domain root. Get it wrong and every asset URL points outside the site: the postbuild fails the build rather than shipping a page with no fonts. |
| `VITE_STATIC_SITE` | unset | `1` selects the shop-window branch of the landing page — every call to action becomes an external link, because no backend is deployed alongside it. **Unset while running `build:site` publishes a page of dead buttons**, so `tests/static-site.test.mjs` fails the build if it is missing. See DEPLOYMENT §9. |

### External data

| Variable | Default | Notes |
|---|---|---|
| `FX_API_URL` | Frankfurter EUR base | FX source. When the fetch fails the dated fallback table is used and **every rate is reported stale** rather than presented as live. |
| `BRAVE_API_KEY` | unset | Horizon web research. Unconfigured degrades to labelled "no live search", never to invented sources — see `docs/RESEARCH-KEYS.md`. |
| `PATENTSVIEW_API_KEY` | unset | Patent search. Same degradation contract. |

### Test and CI only

| Variable | Default | Notes |
|---|---|---|
| `CV_HEAVY_IT` | unset | `1` enables the heavy integration tests that are skipped by default. |
| `CHROMIUM_PATH` | `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` | Browser binary for the e2e and PDF-QA runs. |
| `CI` | set by the runner | Used to pick non-interactive behaviour. |

## Handled

| Concern | State |
|---|---|
| Backups | Automatic daily online backup of `$DATA_DIR/brainspark.db` to `$DATA_DIR/backups/` (keep 7, `db-backup.mjs`). One backup at every boot. Disable with `BRAINSPARK_BACKUPS=0`. **Restore:** stop the server, copy the chosen `backups/brainspark-<stamp>.db` over `$DATA_DIR/brainspark.db`, restart. |
| Secrets | JWT via `JWT_SECRET` (required in production); user Anthropic keys stored encrypted (`CREDENTIALS_SECRET`). No secrets in the repo. |
| Auth | JWT bearer, email OTP flow, per-route rate limits, admin allowlist (`ADMIN_EMAILS`). |
| Prompt-injection | All user strings sanitized + framed as untrusted data before any prompt; retrieved corpus text cleaned. |
| Tests/CI | 285+ tests + 4 deterministic accuracy gates run in CI on every push. |
| Provenance | Every AI-touched number is labelled (engine-verified / AI-estimated / LIVE price / unverified); marketplace ideas labelled curated vs community. |
| 2D drawing extraction | `POST /api/dfm/drawing-extract` is the one vision call in the DFM routes: 15 req/hr per user, ~8 MB base64 cap, PDF/PNG/JPEG/WebP only, needs an Anthropic key (request → stored user key → server env). Extracted values are re-normalized on `/analyze` and judged deterministically. |

## Known gaps (acceptable for pilot, must be planned before wider rollout)

- **Error monitoring**: no Sentry/alerting — server errors only reach stdout logs. Nobody is paged when it breaks.
- ~~**Deployment**: no documented deploy target/process~~ — CLOSED 4 Sept 2026. `Dockerfile`, `docker-compose.yml`, `.env.example` and `docs/DEPLOYMENT.md` cover the full feature set including the OpenCascade geometry layer. `scripts/preflight.mjs` runs inside the deployed container and refuses to pass on a missing geometry layer, a weak or default secret, SMTP left unset (OTPs would print to the log), or a `DATA_DIR` that a redeploy would discard. `tests/deploy-image-completeness.test.mjs` checks the Dockerfile's COPY set against the real transitive import graph — it was written after the first draft omitted five runtime modules that live under `src/`.
- **LLM spend**: no cost dashboard or per-user budget. `checkUsageQuota` bounds request counts, not tokens. A runaway Deep Mode habit is invisible until the invoice.
- **Off-site backups**: backups live on the same disk as the database. A disk loss loses both. Copy `$DATA_DIR/backups/` elsewhere on a schedule.
- **Single instance / single writer**: better-sqlite3, one process. Fine at pilot scale; horizontal scaling needs a DB migration.
- **Org/team model**: orgs scaffolding exists (`routes/orgs.mjs`) but most data is per-user; no sharing/approval workflow between team members yet.
- **Security review**: internal-trust posture. Before exposure beyond a trusted team: dependency audit triage, session revocation, CSRF review for any cookie use, upload size/type hardening pass.

## Measurement debt

Run `npm run eval:status` to see which accuracy gates and LLM evals have recorded results and which claims are currently unmeasured. The ideation eval needs an `ANTHROPIC_API_KEY` and costs real tokens — the deterministic gates are free and run in CI.
