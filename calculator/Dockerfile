FROM node:22-alpine

# Native module build tools (better-sqlite3, bcrypt need Python + C compiler)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install dependencies first (layer-cached unless package.json changes)
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Frontend (Vite) + Backend (Express)
EXPOSE 5173 3001

CMD ["npm", "run", "dev:full"]
