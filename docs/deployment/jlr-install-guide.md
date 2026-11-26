# Installing CostVision on a JLR server — Phase 1 (no AI)

A step-by-step guide for the person installing it (JLR IT, or the project owner with IT). Every command is typed on the
server; "you should see" says what a good result looks like. If anything differs, stop and keep the output — never paste
passwords, keys or the settings file anywhere.

Background and status: `docs/deployment/jlr-deployment-readiness-2026-11-26.md`. Files used here: `deploy/jlr/`.

## What you need first (from JLR IT)

| Item | Why |
|---|---|
| A Linux VM (RHEL 9 or Ubuntu 22.04/24.04): 4 vCPU, 8 GB RAM, 50 GB disk, encrypted | Runs the container; CAD measurement and drawing OCR use the memory |
| Docker Engine 24+ with the Compose plugin | Runs the image |
| Outbound internet **blocked** for the VM (once the image is built) | The second guard after `AIR_GAPPED=1` |
| JLR's HTTPS gateway / reverse proxy, with JLR single sign-on in front | Only JLR staff reach the page; HTTPS with a JLR certificate |
| An internal SMTP relay | Sign-in codes are emailed |
| A backup location for the VM | Nightly database backups |

## 1. Copy the tool onto the server

```bash
sudo mkdir -p /opt/costvision && cd /opt/costvision
# copy the repository here (git clone from JLR's mirror, or unpack the release archive)
ls
```
You should see `calculator/`, `deploy/`, `docs/`.

## 2. Build the image

Building needs package downloads **once** (from the internet or JLR's mirror). Running never does.

```bash
cd /opt/costvision/deploy/jlr
sudo docker compose build
```
You should see the build end with `Image costvision:jlr Built` (10–20 minutes the first time).

If the server has no internet even for the build, build on a machine that has it and carry the image across:
```bash
# on the build machine
docker compose -f deploy/jlr/docker-compose.yml build
docker save costvision:jlr | gzip > costvision-jlr.tar.gz
# on the server
gunzip -c costvision-jlr.tar.gz | sudo docker load
```

## 3. Fill in the settings file

```bash
cd /opt/costvision/deploy/jlr
sudo cp settings.env.example settings.env
sudo chmod 600 settings.env
openssl rand -hex 32          # copy the output into JWT_SECRET
sudo nano settings.env
```
Fill in:
- `JWT_SECRET` — the 64 characters from `openssl rand -hex 32`. The server refuses to start without it.
- `ADMIN_EMAILS` — the administrators' JLR addresses, comma-separated.
- `CV_SIGNUP_DOMAINS` — the email domain(s) allowed to create an account (JLR's).
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` — the mail relay.
- Leave `AIR_GAPPED=1` (Phase 1) and `CV_TRUST_PROXY=1` (behind the gateway).

## 4. Start it

```bash
sudo docker compose up -d
sudo docker compose ps
```
Within about 90 seconds you should see `costvision ... Up ... (healthy)`.

```bash
sudo docker compose logs costvision | head -20
```
You should see, among the first lines:
```
Should-Cost server running on http://localhost:3002 (listening on 0.0.0.0)
AI:           off (AIR_GAPPED=1) — every costing works without it
JWT secret:   ✓ configured
SMTP:         ✓ <your relay>
Environment:  production
CAD kernel:   ✓ OCP ...
```

```bash
curl -s http://127.0.0.1:3002/api/health
```
You should see `"status":"ok"`, `"airGapped":true`, `"aiAvailable":false`, `"jwtConfigured":true`, `"smtpConfigured":true`.

## 5. Put it behind the JLR gateway

The container listens on the server's own `127.0.0.1:3002` only. Point the gateway's internal route at it. The gateway must:
- terminate HTTPS with the JLR certificate and apply JLR single sign-on;
- pass `X-Forwarded-For` (the app counts rate limits per user from it);
- allow uploads up to **250 MB** and requests of up to **11 minutes** (a large STEP file is measured for up to 10 minutes).

Example for an nginx gateway on the same server:
```nginx
location / {
    proxy_pass http://127.0.0.1:3002;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    client_max_body_size 250m;
    proxy_read_timeout 660s;
    proxy_send_timeout 660s;
}
```
If the gateway is on another machine, change the port line in `docker-compose.yml` to `"3002:3002"` and allow only the
gateway's address in the server firewall.

## 6. Create the first administrator

1. Open the tool's JLR address in a browser (through the gateway).
2. Sign up with an address listed in `ADMIN_EMAILS`, enter the code from the email.
3. You should see the admin menu items (rate book upload, dashboard admin).

An address outside `CV_SIGNUP_DOMAINS` is refused with "Sign-up is not open for this email address".

## 7. Load the JLR rate book and invite the pilot users

- Admin → Rate book → download the template, fill in JLR's rates, upload. The stamp on every costing shows the book used.
- Send the pilot group (5–10 users) the address; they sign up with their JLR email.

## 8. Backups

```bash
cd /opt/costvision/deploy/jlr
sudo ./backup.sh
```
You should see a JSON line with `"ok":true` and `"integrity":"ok"`, then `backup: ./backups/should-cost-<time>.db`.

Nightly, from root's crontab (`sudo crontab -e`):
```
15 2 * * * cd /opt/costvision/deploy/jlr && BACKUP_DIR=/srv/backups/costvision KEEP=30 ./backup.sh >> backup.log 2>&1
```
Copy `/srv/backups/costvision` to JLR's backup system.

**Restore** (test it once a month on a copy):
```bash
sudo ./restore.sh /srv/backups/costvision/should-cost-<time>.db
```
It stops the app, checks the backup, keeps the current database beside it, restores, and starts the app again.

## 9. Updates

```bash
cd /opt/costvision/deploy/jlr
sudo ./backup.sh                       # always first
# replace the code with the new release, then:
sudo docker compose up -d --build
sudo docker compose ps                 # healthy again
```
Rebuild monthly even without a release, so the base image's security patches are picked up.

## 10. Switching to Phase 2 (AI) later — after JLR InfoSec approves

1. In `settings.env`: delete `AIR_GAPPED=1`; add `ANTHROPIC_API_KEY=` or JLR's approved route `ANTHROPIC_BASE_URL=`.
2. Allow that one host in the firewall.
3. `sudo docker compose up -d` — the AI features appear on their own; no rebuild.

## Troubleshooting

| You see | Meaning | Do |
|---|---|---|
| Container restarts; log says `FATAL: JWT_SECRET environment variable is not set` | Settings file not filled in | Step 3 |
| `ps` shows `(unhealthy)` | The server is not answering | `docker compose logs costvision` and keep the output |
| Sign-up refused for a JLR user | Their domain is not in `CV_SIGNUP_DOMAINS` | Add it, `docker compose up -d` |
| No sign-in email arrives | Mail relay settings | Check `SMTP_*`; `smtpConfigured` in the health check |
| `CAD kernel: ✗` in the log | The image was built wrongly | Rebuild (step 2) |
| Upload of a big STEP fails at the gateway | Gateway size / time limit | Step 5 limits |

## What has been proven, and how

- **Offline proof** — `calculator/e2e/jlr-offline-proof.ts`, run with no network at all: production mode, `AIR_GAPPED=1`, no key,
  sign-up limited to one domain. 15 / 15 checks on 26 Nov 2026: no outbound network; health; sign-up refused through the
  gateway even on an empty database and from anywhere once an account exists; a real STEP measured by the CAD kernel and
  analysed (no AI); an STL; a 2D drawing read; the AI assistant refused even with a user-supplied key; the KPI dashboard;
  the front end with its security policy; a backup while running, a change, a restore, the server back up.
- **Every commodity in a real browser, offline** — `calculator/e2e/full.ts` with `AIR_GAPPED=1`, no key and no network
  (26 Nov 2026): all 22 commodities costed (injection moulding £3.64 … battery pack £9,651.80), exports, an STL upload
  through CAD to COST, a stale sign-in cleared, the server's rate book used — PASSED.
- **The image itself** — `.github/workflows/docker-cad.yml`, job "JLR image": builds the `jlr` stage, checks it runs as
  uid 10001, runs the offline proof INSIDE the image with no network, a read-only file system and no capabilities, waits for
  the health check to go healthy, checks the app files cannot be written and the data volume can, takes a backup, and
  validates this compose file. (The image could not be built in the development environment — its disk allowance is too
  small for the ~3.5 GB CAD image — so CI is where the image is proven.)
- **Accuracy is a separate matter:** no costing has yet been compared with a price JLR paid; the drawing reader has not yet
  been measured on real JLR drawings. Say so in pilot material.
