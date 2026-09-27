FROM node:22-alpine

# Native module build tools (better-sqlite3, bcrypt)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# puppeteer's bundled Chrome is never used at runtime — skip the download so the
# install doesn't fail in the container (no unzip / no browser fetch).
ENV PUPPETEER_SKIP_DOWNLOAD=1

COPY package*.json ./
RUN npm install

COPY . .

# Build Vite frontend into dist/
RUN npm run build

EXPOSE 3002

ENV NODE_ENV=production
# The server listens on 127.0.0.1 by default; a container must listen on all
# interfaces or the published port cannot reach it.
ENV HOST=0.0.0.0

CMD ["npx", "tsx", "server/index.ts"]
