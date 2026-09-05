# Deploying BrainSpark — every feature, including the CAD geometry layer

`docs/OPERATIONS.md` listed "no documented deploy target or process" as a known
gap. This closes it.

The target here is the **complete** feature set: ideation, should-cost, PCB,
harness, Prism, Horizon, the marketplace, **and** the OpenCascade geometry layer
that DFM Studio, DFA, assembly decomposition and Prism's geometry evidence all
depend on. Nothing is left out, and `scripts/preflight.mjs` proves it rather than
asserting it.

---

## 1. What the application actually is

One Node process. `server.mjs` serves the JSON API *and* the built SPA from the
same origin (`server.mjs:4584`), so a normal deployment is **one container on
one port** — no separate front-end host, and no CORS configuration.

Around that process, four things decide every deployment choice:

| | Detail | Consequence |
|---|---|---|
| **State** | `better-sqlite3` at `$DATA_DIR/brainspark.db` (~7.5 MB seeded) plus automatic backups in `$DATA_DIR/backups` | Needs a **persistent volume**. Rules out stateless serverless — Vercel/Netlify functions, Lambda, Cloudflare Workers — unless the DB moves to Postgres, which is a real code change, not configuration. |
| **Native code** | `better-sqlite3` compiles against a specific platform and Node ABI | Build and run on the **same base**. `node:22-bookworm` → `node:22-bookworm-slim` shares a glibc; mixing Alpine and Debian produces a loader error at boot. |
| **Geometry** | `cad-engine/*.py` spawned per request via `python3`, importing `OCP` from `cadquery-ocp` | ~275 MB installed. The app **boots and looks healthy without it** and then fails every CAD route at the first uploaded part. This is the failure the preflight exists to catch. |
| **Memory** | 50 MB in-memory uploads × concurrency, plus `CV_MAX_PYTHON_PROCS` tessellation subprocesses each holding a full mesh | Plan on **4 GB**. Not a 512 MB box. |

Outbound HTTPS is needed for Anthropic, and optionally Brave, PatentsView, FX
and commodity prices. Each of those degrades honestly when unconfigured —
labelled as unavailable, never fabricated.

---

## 2. The fastest correct path

```bash
cp .env.example .env

# The two secrets that decide whether the deployment is safe.
node -e "console.log('JWT_SECRET='+require('crypto').randomBytes(48).toString('base64url'))" >> .env
node -e "console.log('CREDENTIALS_SECRET='+require('crypto').randomBytes(48).toString('base64url'))" >> .env
# then fill in ANTHROPIC_API_KEY, EMAIL_USER, EMAIL_PASS, ADMIN_EMAILS

docker compose up -d --build          # ~6–10 min on a first build

# Prove it — this is the step that distinguishes "it started" from "it works".
docker compose exec brainspark node scripts/preflight.mjs
```

A green preflight means Node, the native module, Python, OpenCascade (proved by
building a solid and writing a STEP file, not merely importing), the secrets, a
volume that will actually survive a redeploy, the knowledge pack and the built
front end are all present. It exits non-zero on any failure, so it works as a
deploy gate:

```bash
docker compose exec -T brainspark node scripts/preflight.mjs --json > preflight.json || exit 1
```

Then put TLS in front. Caddy is two lines and handles certificates itself:

```
brainspark.example.com {
    reverse_proxy 127.0.0.1:3001
}
```

Set `TRUST_PROXY=1` when exactly one proxy sits in front — the value is a hop
count, and a wrong one makes rate limiting count the proxy instead of the
client.

---

## 3. Choosing a host

Every option below runs the same image. They differ in who operates the box.

### Managed container hosts — Fly.io, Railway, Render

Push the repo, attach a volume, set the secrets. Cheapest route to a working
URL with TLS and deploys handled for you.

- Provision **4 GB RAM** and a **volume mounted at `/data`**.
- Fly: `fly volumes create brainspark_data --size 10`, then in `fly.toml` a
  `[mounts] source="brainspark_data" destination="/data"`.
- Render/Railway: add a persistent disk with mount path `/data`.
- Build times are long because of the OCCT wheel — expect 6–10 minutes, and
  enable build caching.

**Watch for:** hosts that advertise "no config needed" often default to 512 MB
or 1 GB and a *rebuilt* filesystem. Both are silent failures here — the first
kills tessellation under load, the second discards your database.

### A plain VM — Hetzner, DigitalOcean, Lightsail, EC2

`docker compose up -d` on a 4 GB instance, Caddy in front, `docker compose
logs -f` for logs. Most predictable, and the closest to what you would hand to
an internal IT team. ~€15–30/month.

### On-premise or private cloud

Same image, behind your VPN, TLS terminated by your existing ingress, SSO in
front of it.

**This is probably where it belongs.** The tool holds supplier quotes, teardown
observations, BOMs and your calibration corpus — the material a commercial team
would consider among its most sensitive. Nothing in the architecture prevents
public hosting, but the data argues for private hosting, and choosing a managed
host first does not foreclose it: it is the same container either way.

### Kubernetes

Only if you already run it. One Deployment, one Service, a
`ReadWriteOnce` PVC at `/data`, and **`replicas: 1`** — SQLite is a single-writer
database and a second replica on the same volume will corrupt it. If you need
horizontal scale, the honest answer is to move to Postgres first.

---

## 4. Before you let anyone in

Run the preflight, then confirm these by hand.

- [ ] `JWT_SECRET` and `CREDENTIALS_SECRET` are **different**, ≥32 bytes, and
      not in source control. The server refuses to boot in production on the
      shipped default (`server.mjs:235`) — do not work around it.
- [ ] `EMAIL_USER` / `EMAIL_PASS` are set. **Without SMTP, one-time passcodes
      print to the server log.** Anyone with log access can take over an
      account. This is the single most common way a working deployment is also
      an insecure one.
- [ ] A volume is mounted at `DATA_DIR` and `docker compose down && up` keeps
      your data.
- [ ] `ADMIN_EMAILS` names real people. `ADMIN_EMAIL`/`ADMIN_PASSWORD` seed a
      first admin on an empty database only — remove them after first boot.
- [ ] TLS terminates in front; the container binds to loopback.
- [ ] `CV_MONTHLY_TOKEN_QUOTA` matches what you are willing to spend. The
      default is 3,000,000 tokens per user per month.
- [ ] Backups leave the box. `db-backup.mjs` writes to `$DATA_DIR/backups`
      automatically (`BRAINSPARK_BACKUPS=0` disables) — that protects against
      corruption, not against losing the volume. Copy them off.

Then confirm the geometry path end to end, because it is the one that fails
quietly: upload a real STEP file to DFM Studio and check that measured geometry
comes back rather than an error.

### Things that are honest by default — decide whether you want them that way

- **Commodity prices.** Without `BRAVE_API_KEY` the daily web refresh never
  updates anything, and the app runs on its built-in reference baseline. The
  homepage then labels the strip **"Reference commodity prices · as of 3 Jul
  26"** with a grey dot — it will not call them live. Set the key if you want
  the green dot to mean something.
- **Password reset.** Without SMTP, the reset endpoint returns a clear
  503 — "not configured on this server" — instead of promising an email that
  will not arrive.
- **Fonts.** Self-hosted. IBM Plex Sans and IBM Plex Mono ship inside the
  image (`public/fonts`, 388 KB), so there is no third-party request on first
  paint and nothing for a corporate firewall to block.
- **The first administrator.** `ADMIN_EMAILS` blocks those addresses from
  public signup. Only `ADMIN_EMAIL` + `ADMIN_PASSWORD` creates one, on an empty
  database. Set all three for the first boot; the preflight refuses to pass on
  a fresh database with the block and no seed.

---

## 5. Operating it

**Upgrades.** `git pull && docker compose up -d --build`, then re-run the
preflight. Schema migrations are `ALTER TABLE` statements guarded by try/catch
next to the schema block, so they apply on boot with no separate step.

**Backups.** Automatic to `$DATA_DIR/backups`. To take one by hand:

```bash
docker compose exec brainspark node -e "
  const D=require('better-sqlite3'); const db=new D(process.env.DATA_DIR+'/brainspark.db');
  db.backup(process.env.DATA_DIR+'/backups/manual-'+Date.now()+'.db').then(()=>console.log('done'));
"
docker compose cp brainspark:/data/backups ./backups-$(date +%F)
```

**Restore.** Stop the container, replace `brainspark.db` on the volume, start it.

**Sizing.** `CV_MAX_PYTHON_PROCS` (default 2) is the concurrency dial for CAD
work, and each process holds a full tessellation. Raise it and the memory limit
together, never one alone.

**Logs.** pino JSON to stdout at `LOG_LEVEL`. Compose caps them at 5 × 10 MB.

---

## 6. What this deployment does *not* include

Stated plainly, because a deployment guide that implies completeness it does not
have is the same defect this codebase gates against everywhere else.

- **SSO / SAML / SCIM.** Email-and-password with OTP only. An OEM will ask.
- **Horizontal scale.** SQLite is single-writer; `replicas: 1` is a correctness
  requirement, not a suggestion. Postgres is the prerequisite for scaling out.
- **Multi-region.** One volume, one region.
- **In-CAD plugins and PLM connectors.** Named as out of scope in the audit
  register and still are.
- **A managed upgrade path for the OCCT wheel.** It is pinned to the range CI
  tests (`>=7.7,<7.9`); moving outside that range needs the DFM geometry
  benchmark re-run, because the fixtures are analytic and a kernel change can
  move measured values.

---

## 9. The public shop window on GitHub Pages

There are two separate things called "publishing" here, and conflating them
produces the worst possible outcome.

**The tool cannot run on GitHub Pages.** Pages serves static files. BrainSpark
is one Node process with a `better-sqlite3` database on a persistent volume and
a spawned Python/OpenCascade layer — §1 rules out the whole stateless class for
exactly this reason. A naive Pages deploy of `dist/` would render the app's
interface and then fail every single action: sign-in, generation, upload,
export. That is worse than not publishing, on a product whose one rule is that
claims carry their evidence.

**What Pages does host** is a shop window: the landing page alone, built from
the real `HomePage` component, with the honest framing said on the page.

```bash
npm run build:site      # → dist-site/, ~0.8 MB
```

That script is `VITE_STATIC_SITE=1 vite build --config vite.site.config.ts`
followed by `scripts/site-postbuild.mjs`. Three things make it safe:

| | |
|---|---|
| **`STATIC_SITE`** (`src/lib/site-mode.ts`) | A build-time flag Vite folds to a constant, so the losing branch is eliminated. Under it every call to action becomes an external link to the source or this document, and the vehicle-system tiles become cards rather than links into `/analyze`. **No control on the published page does nothing when clicked.** |
| **`scripts/site-postbuild.mjs`** | Writes `.nojekyll` (Jekyll silently drops underscore paths) and `404.html` (Pages has no SPA rewrite), prunes the assets this page does not use, then **verifies every `@font-face` URL resolves and every root-absolute URL carries the Pages base**. A missing woff2 is the failure that looks fine in review and shows up as the system sans to a visitor, so it fails the build instead. |
| **`tests/static-site.test.mjs`** | Six gates, run in CI before the deploy. The sharpest one fails the build if `VITE_STATIC_SITE=1` was dropped from the command — the single mistake that would publish a page of dead buttons. Verified by building both ways. |

`.github/workflows/pages.yml` builds and deploys on push to `main` (or
`workflow_dispatch`), passing `SITE_BASE=/<repo>/`. **Pages must be set to
"GitHub Actions" as its source** in Settings → Pages; the default,
"Deploy from a branch", ignores this workflow.

**This must be BrainSpark's own repository.** BrainSpark was developed on a
branch of `bhosaleavinash546/leamington-marathi`, whose `main` is an unrelated
live website — the Leamington Marathi community site, already served by Pages
with `CNAME` = `leamingtonmarathi.com`. Switching that repo's Pages source to
"GitHub Actions", or merging this branch into its `main`, would take that site
down and serve BrainSpark from a community group's domain. The repo identity
lives in `site/site.config.json` (`owner` + `repo`); it drives the Vite base,
the postbuild's URL check, the deploy gate and the shop window's own links, so
a move is one file.

Measured on the built bundle, served from the real sub-path at 1440 and 390:
IBM Plex Sans loads, 0 failed requests, 0 console errors, 0 axe serious/critical
violations, no horizontal overflow, and 0 links pointing into the app.

To host the shop window somewhere other than a `<repo>` sub-path, set
`SITE_BASE` (for a root domain, `SITE_BASE=/`).
