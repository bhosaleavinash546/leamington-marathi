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

CMD ["npx", "tsx", "server/index.ts"]
