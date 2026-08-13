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
- **Deployment**: no documented deploy target/process; runs wherever `node server.mjs` is started. No process supervisor guidance (systemd/pm2), no TLS termination doc.
- **LLM spend**: no cost dashboard or per-user budget. `checkUsageQuota` bounds request counts, not tokens. A runaway Deep Mode habit is invisible until the invoice.
- **Off-site backups**: backups live on the same disk as the database. A disk loss loses both. Copy `$DATA_DIR/backups/` elsewhere on a schedule.
- **Single instance / single writer**: better-sqlite3, one process. Fine at pilot scale; horizontal scaling needs a DB migration.
- **Org/team model**: orgs scaffolding exists (`routes/orgs.mjs`) but most data is per-user; no sharing/approval workflow between team members yet.
- **Security review**: internal-trust posture. Before exposure beyond a trusted team: dependency audit triage, session revocation, CSRF review for any cookie use, upload size/type hardening pass.

## Measurement debt

Run `npm run eval:status` to see which accuracy gates and LLM evals have recorded results and which claims are currently unmeasured. The ideation eval needs an `ANTHROPIC_API_KEY` and costs real tokens — the deterministic gates are free and run in CI.
