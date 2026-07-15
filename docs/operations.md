# Operations Guide

How to run, back up, and monitor BrainSpark in production.

## Deployment

One process is a complete deployment: `npm run build` emits the front end to
`dist/`, and `server.mjs` serves it (static + SPA fallback) alongside the API.

```bash
npm ci
npm run build
NODE_ENV=production \
JWT_SECRET=<strong-unique> \
CREDENTIALS_SECRET=<different-strong-unique> \
ALLOWED_ORIGINS=https://app.example.com \
PORT=3001 node server.mjs
```

Production fail-closed checks: the server refuses to start without a real
`JWT_SECRET` **and** a dedicated `CREDENTIALS_SECRET` (one leaked secret must
not both forge sessions and decrypt stored API keys).

### Behind a load balancer
`TRUST_PROXY=1` (default) trusts the first hop so per-IP rate limits work.
Raise it only if you chain proxies.

### Key environment variables
| var | default | purpose |
|---|---|---|
| `DATA_DIR` | `./data` | SQLite + persisted state location |
| `CV_MAX_CAD_WORKERS` | 2 | concurrent STEP-parse worker threads (WASM heaps) |
| `CV_MAX_PYTHON_PROCS` | 2 | concurrent OCCT tessellation sidecars |
| `CV_THINKING_BUDGET` | 6000 | extended-thinking tokens on idea generation (0 disables) |
| `CV_SMALL_MODEL` | `claude-sonnet-5` | tier for narration/patent/diff calls |
| `CV_ANALYZE_TIMEOUT_MS` | 300000 | idea-generation deadline |
| `ADMIN_EMAILS` | — | comma-separated admin accounts |

## Backups

All state lives in `DATA_DIR/brainspark.db` (WAL mode). Two supported paths:

1. **Litestream (recommended)** — continuous streaming replication to S3/compatible:
   ```yaml
   # litestream.yml
   dbs:
     - path: /srv/brainspark/data/brainspark.db
       replicas:
         - url: s3://your-bucket/brainspark
   ```
   `litestream replicate -config litestream.yml` alongside the server;
   restore with `litestream restore -o data/brainspark.db s3://your-bucket/brainspark`.

2. **Snapshot** — SQLite online backup without stopping the server:
   ```bash
   sqlite3 data/brainspark.db ".backup 'backup-$(date +%F).db'"
   ```

## Monitoring

- `GET /api/health` → `{ status, version }` — liveness probe.
- Request logs: pino JSON on stdout (`LOG_LEVEL=info`).
- LLM spend: the `llm_calls` table carries model, tokens, latency, ok,
  **userId and route** — e.g. cost per endpoint:
  ```sql
  SELECT route, COUNT(*) calls, SUM(inputTokens) inTok, SUM(outputTokens) outTok
  FROM llm_calls GROUP BY route ORDER BY outTok DESC;
  ```
- Crash discipline: unhandled rejections are logged (not fatal); uncaught
  exceptions log then exit(1) — run under a supervisor (systemd/PM2/container
  restart policy).

## Test & release gates

```bash
npm test               # unit + HTTP integration (boots a real server)
npm run benchmark:cost # engine accuracy gate (16-fixture primary set)
node benchmark/cost-run.mjs --fixtures benchmark/cost-fixtures-holdout.json  # held-out over-fit detector
npm run build && npm run e2e   # Chromium smoke + axe accessibility gate
```

CI runs all of the above on every push (`.github/workflows/ci.yml`).
