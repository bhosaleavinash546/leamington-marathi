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

## CAD geometry images — STEP/IGES vs STL

Two Dockerfiles ship, so you choose the size/capability trade-off:

| Image | Base | CAD support | Size | Use |
|---|---|---|---|---|
| **`Dockerfile.cad`** (fly.toml default) | Debian glibc + cadquery/OCP | **STEP/IGES + STL** | ~1.5 GB | Production — full CAD measurement |
| `Dockerfile` | Alpine (musl) | **STL only** | ~400 MB | Fast local runs / `make start` |

`Dockerfile.cad` installs cadquery 2.8.0 into a venv and puts it on `PATH`, so the
`python3` the server spawns (`geometry-bridge.ts`) is the one with OCP. Verified: it
measures real STEP files (volume, bbox, B-rep faces, per-material weights) on this
exact glibc runtime. It needs the 2 GB VM in `fly.toml` (each OCP process costs a few
hundred MB; `CV_MAX_PYTHON_PROCS` caps concurrency) and takes longer to build.

To trade STEP for a smaller/faster image, set `dockerfile = "Dockerfile"` in
`fly.toml` — the STL fast path and everything else (cost engine, self-audit,
calibration, PCB/CAD AI, auth, persistence) still work; only STEP/IGES measurement
is unavailable.

> Note: the Docker image build itself wasn't run in this environment (no daemon).
> The cadquery/OCP runtime was verified directly on glibc; confirm the full image on
> your first `fly deploy` (or a local `docker build -f Dockerfile.cad .`).
