# CostVision — AI-Powered Cost Intelligence

A full-stack should-cost calculator with an AI agent, CAD/photo analysis, and
cost-saving recommendations across 19 manufacturing commodities.

---

## 🚀 Install & Run (MacBook — one command)

You only need **Docker Desktop** installed. Everything else is automatic.

### Step 1 — Install Docker Desktop (once)
Download and install from <https://www.docker.com/products/docker-desktop/>,
then open the **Docker** app and wait until the whale icon stops animating.

### Step 2 — Start CostVision
In Terminal, from this folder:

```bash
./start.sh
```

That's it. The script will:
1. ✅ Check Docker is running
2. ✅ Create the config file automatically
3. ✅ Generate a secure login secret for you (no manual steps)
4. 🔑 Ask you to **paste your Anthropic API key** once (it remembers it)
5. 🐳 Build and start the app
6. 🌐 Open <http://localhost:5173> in your browser

> **API key:** your existing Anthropic key from any other app works fine —
> you do **not** need a new one. Find or create one at
> <https://console.anthropic.com/settings/keys>.

---

## 🔁 Everyday commands

| What you want | Command |
|---------------|---------|
| Start the app | `./start.sh`  *(or `make start`)* |
| Stop the app | `make stop` |
| Restart | `make restart` |
| View live logs | `make logs` |
| Container status | `make status` |
| Open in browser | `make open` |

The app runs at **<http://localhost:5173>**. Your data (saved scenarios,
accounts) persists across restarts in a Docker volume.

---

## ⚙️ What's running

A single Docker container runs both:
- **Frontend** — Vite + TypeScript UI on port `5173`
- **Backend** — Express API + SQLite on port `3001`

Config lives in `calculator/.env` (created on first run, never committed to git).

---

## 🛠 Troubleshooting

- **"Docker is not running"** → open the Docker Desktop app first, then re-run `./start.sh`.
- **Page won't load** → give it a few seconds on first build, then check `make logs`.
- **Change your API key** → edit `ANTHROPIC_API_KEY` in `calculator/.env`, then `make restart`.

---

Designed & Developed by **Avinash Bhosale** · CostVision © 2026
