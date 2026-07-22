# Deploying CostVision to Fly.io

CostVision is a **full-stack app** — an Express API + SQLite + the built Vite UI,
all served by one process (`server/index.ts` on `:3002`, serving `/calculator` and
`/api`). It is **not** a static site, so GitHub Pages can't host it. Fly.io runs the
container from `calculator/Dockerfile`.

Files: [`fly.toml`](./fly.toml) (this dir) · [`Dockerfile`](./Dockerfile) ·
CI/CD [`.github/workflows/fly-deploy.yml`](../.github/workflows/fly-deploy.yml).

## One-time setup

```bash
# 0. Install + log in
brew install flyctl          # or: curl -L https://fly.io/install.sh | sh
fly auth login

# 1. Create the app (name must be globally unique — if "costvision" is taken,
#    pick another and update `app = "..."` in fly.toml).
cd calculator
fly apps create costvision

# 2. Persistent volume for the SQLite DB (knowledge base, rate overrides,
#    projects, auth). Must be in the same region as primary_region in fly.toml.
fly volume create costvision_data --region lhr --size 1

# 3. Secrets (never commit these — they are NOT in fly.toml or the image).
fly secrets set \
  ANTHROPIC_API_KEY="sk-ant-..." \
  JWT_SECRET="$(openssl rand -hex 32)"
#   Optional: SMTP_HOST/SMTP_USER/SMTP_PASS (OTP email), TEAM_API_KEY (team sync),
#   METAL_PRICE_API_KEY (live metal prices). Without them those features degrade
#   gracefully (OTPs log to console, etc.).

# 4. First deploy (from calculator/).
fly deploy
```

The app comes up at `https://<app-name>.fly.dev/` (the server 301-redirects `/` →
`/calculator/`). Check health: `curl https://<app-name>.fly.dev/api/health` should
report `apiKeyConfigured: true`.

## Continuous deployment (GitHub Actions)

`fly-deploy.yml` deploys automatically **after the CI workflow passes** on
`claude/new-session-ts4byp` (typecheck + full test suite + build must be green
first), and can also be run on demand from the Actions tab.

```bash
# Create a deploy token and add it as a GitHub Actions secret named FLY_API_TOKEN.
fly tokens create deploy -x 999999h
# GitHub → repo → Settings → Secrets and variables → Actions → New secret:
#   name: FLY_API_TOKEN   value: <the token>
```

## Custom domain (optional)

```bash
fly certs add costvision.example.com     # then add the CNAME/A records Fly prints
```
(Do **not** reuse `leamingtonmarathi.com` — that stays with the Marathi community
site on GitHub Pages.)

## Known limitation — STEP/IGES CAD geometry

The Alpine image installs `python3` but **not** cadquery/OCP (musl-incompatible), so
in the deployed container the STEP/IGES measurement path does not run — only the
pure-TS **STL** fast path. Everything else works: the deterministic cost engine, the
self-audit + calibration layers, PCB and CAD *text/vision* AI, auth, and persistence.

To enable STEP measurement in production, switch the base image to a glibc distro
(e.g. `node:22-bookworm-slim`) and install cadquery (`pip install cadquery` or a
mamba/conda OCP env) — a larger image (~1.5 GB) and a separate follow-up.
