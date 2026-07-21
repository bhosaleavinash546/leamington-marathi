# Operations — what's handled, what's honestly not

Status of the production-readiness gaps, kept current so nobody discovers them in an incident.
"Pilot" below = a handful of trusted users on one instance.

## Handled

| Concern | State |
|---|---|
| Backups | Automatic daily online backup of `$DATA_DIR/brainspark.db` to `$DATA_DIR/backups/` (keep 7, `db-backup.mjs`). One backup at every boot. Disable with `BRAINSPARK_BACKUPS=0`. **Restore:** stop the server, copy the chosen `backups/brainspark-<stamp>.db` over `$DATA_DIR/brainspark.db`, restart. |
| Secrets | JWT via `JWT_SECRET` (required in production); user Anthropic keys stored encrypted (`CREDENTIALS_SECRET`). No secrets in the repo. |
| Auth | JWT bearer, email OTP flow, per-route rate limits, admin allowlist (`ADMIN_EMAILS`). |
| Prompt-injection | All user strings sanitized + framed as untrusted data before any prompt; retrieved corpus text cleaned. |
| Tests/CI | 285+ tests + 4 deterministic accuracy gates run in CI on every push. |
| Provenance | Every AI-touched number is labelled (engine-verified / AI-estimated / LIVE price / unverified); marketplace ideas labelled curated vs community. |

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
