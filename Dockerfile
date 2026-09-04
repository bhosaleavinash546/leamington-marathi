# ─────────────────────────────────────────────────────────────────────────────
# BrainSpark — one image, every feature, including the OpenCascade geometry layer.
#
# The whole app is ONE process: server.mjs serves the API and the built SPA from
# the same origin (server.mjs:4584), so there is no second container and no CORS
# to configure for a normal deployment.
#
# Two things decide the shape of this file:
#
#   1. better-sqlite3 is a NATIVE module. It is compiled in the builder stage and
#      copied to the runtime stage, so both stages must share a glibc — hence
#      node:22-bookworm building for node:22-bookworm-slim. Swapping either for
#      Alpine breaks the binary at runtime with a confusing loader error.
#
#   2. The CAD/DFM engines are Python subprocesses (cad-engine/*.py), spawned per
#      request via `python3`. They import OCP from cadquery-ocp, which ships its
#      own OpenCASCADE (~275 MB) but links against a handful of system libraries
#      the slim image does not carry. That list below is not guesswork: it was
#      read off `ldd` for all 69 shared objects in the installed wheel.
#
# The app BOOTS without Python. It just fails every DFM, DFA, assembly and
# Prism-geometry route at the first real part — which is exactly the sort of
# silent gap `scripts/preflight.mjs` exists to catch before your users do.
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: build the front end and compile the native module ───────────────
FROM node:22-bookworm AS builder
WORKDIR /app

# build-essential + python3 are for node-gyp, in case better-sqlite3 has no
# prebuild for this platform. They stay in the builder and never ship.
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential python3 \
    && rm -rf /var/lib/apt/lists/*

# Dependencies first, so a source-only change does not re-run npm ci.
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# kb-pack.json is generated from src/data/*-knowledge-base.ts and is what the
# ideation pipeline actually reads. Building it here means the image can never
# ship a knowledge pack that is stale relative to its own source.
RUN npm run kb:export && npm run build

# Drop dev dependencies AFTER the build. The compiled better_sqlite3.node
# survives this, which is the point of doing it here rather than reinstalling.
RUN npm prune --omit=dev


# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001 \
    DATA_DIR=/data \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# python3 + the exact system libraries cadquery-ocp links against. libgl1 pulls
# libGLX/libGLdispatch; libx11-6 pulls libxcb/libXau/libXdmcp/libbsd/libmd.
# There is no display and no GPU — OCCT still links its OpenGL visualisation
# toolkit even when only the modelling kernel is used, so the libraries must be
# present for `import OCP` to succeed at all.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip \
      libgl1 libx11-6 libxrender1 libexpat1 zlib1g \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Pinned to the range CI tests against (.github/workflows/ci.yml). The wheel is
# manylinux and carries its own OCCT, so nothing is compiled here.
RUN python3 -m pip install --break-system-packages --no-cache-dir \
      'cadquery-ocp>=7.7,<7.9' \
    && python3 -c "import OCP.gp; print('OCP import OK')"

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/kb-pack.json ./kb-pack.json

# Application source. Engines, routes, cad-engine and scripts are all runtime
# code — cad-engine/*.py is spawned per request and scripts/preflight.mjs is run
# against the deployed container.
COPY package.json ./
COPY server.mjs ./
COPY *.mjs ./
COPY routes ./routes
COPY cad-engine ./cad-engine
# src/ is NOT frontend-only. Fifteen .mjs modules under src/services and
# src/data are RUNTIME code the server and routes import directly — the CAD
# B-rep and feature helpers, the foresight register, the vehicle BOM, the
# commodity classifier, the report cores. Omitting them produces an image that
# builds cleanly, boots cleanly, and throws MODULE_NOT_FOUND the first time
# anyone opens the affected page. Copying only the .mjs files keeps the React
# sources (already compiled into dist/) out of the image.
COPY src/services/*.mjs ./src/services/
COPY src/data/*.mjs ./src/data/
COPY scripts ./scripts
COPY benchmark ./benchmark
COPY docs ./docs

# The DB, its automatic backups and any derived state live here. MOUNT A VOLUME
# ON IT — without one, every deploy silently starts from an empty database and
# the marketplace re-seeds ~1,600 ideas as if it were a fresh install.
RUN mkdir -p /data && chown -R node:node /data /app
VOLUME ["/data"]

USER node
EXPOSE 3001

# Uses the app's own liveness route rather than a TCP probe, so a process that
# is up but wedged still fails.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
