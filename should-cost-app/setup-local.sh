#!/usr/bin/env bash
# ============================================================
# CostIQ – Local Dev Setup for macOS (Apple Silicon / M4)
# Usage:  chmod +x setup-local.sh && ./setup-local.sh
# ============================================================
set -euo pipefail

GREEN="\033[0;32m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; NC="\033[0m"
info()  { echo -e "${GREEN}[✔]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✘]${NC} $*"; exit 1; }
step()  { echo -e "\n${GREEN}──────────────────────────────────────${NC}"; echo -e "${GREEN}▶ $*${NC}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$SCRIPT_DIR/backend"
FRONTEND="$SCRIPT_DIR/frontend"

# ── 1. Homebrew ──────────────────────────────────────────────
step "Checking Homebrew"
if ! command -v brew &>/dev/null; then
  warn "Homebrew not found – installing…"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Add brew to PATH for Apple Silicon
  echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> "$HOME/.zprofile"
  eval "$(/opt/homebrew/bin/brew shellenv)"
else
  info "Homebrew found: $(brew --version | head -1)"
fi

# ── 2. Node.js ───────────────────────────────────────────────
step "Checking Node.js (need v20+)"
if ! command -v node &>/dev/null || [[ $(node -e "process.exit(Number(process.version.slice(1).split('.')[0]) < 20)"; echo $?) -ne 0 ]]; then
  warn "Installing Node.js 20 via nvm…"
  if ! command -v nvm &>/dev/null; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    # shellcheck disable=SC1091
    [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
  fi
  nvm install 20
  nvm use 20
  nvm alias default 20
else
  info "Node.js $(node --version) found"
fi

if ! command -v node &>/dev/null; then
  error "Node.js still not available. Open a new terminal and re-run this script."
fi

# ── 3. PostgreSQL ────────────────────────────────────────────
step "Checking PostgreSQL 16"
if ! command -v psql &>/dev/null; then
  warn "PostgreSQL not found – installing via Homebrew…"
  brew install postgresql@16
  brew link --force postgresql@16
  echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> "$HOME/.zprofile"
  export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
else
  info "PostgreSQL found: $(psql --version)"
fi

# Start Postgres service
if ! pg_isready -q 2>/dev/null; then
  info "Starting PostgreSQL service…"
  brew services start postgresql@16
  sleep 3
fi

if ! pg_isready -q; then
  error "PostgreSQL is not running. Try: brew services start postgresql@16"
fi
info "PostgreSQL is running"

# ── 4. Create database & user ────────────────────────────────
step "Setting up database"
DB_NAME="should_cost_db"
DB_USER="postgres"
DB_PASS="password"
DB_URL="postgres://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"

# Create the postgres superuser role if it doesn't exist (Homebrew postgres uses $USER by default)
if ! psql -U "$(whoami)" -tAc "SELECT 1 FROM pg_roles WHERE rolname='postgres'" postgres 2>/dev/null | grep -q 1; then
  warn "Creating 'postgres' role…"
  psql -U "$(whoami)" -c "CREATE USER postgres WITH SUPERUSER PASSWORD 'password';" postgres 2>/dev/null || true
else
  # Make sure the password is set
  psql -U "$(whoami)" -c "ALTER USER postgres WITH PASSWORD 'password';" postgres 2>/dev/null || true
fi

# Create database
if ! psql -U postgres -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
  info "Creating database '$DB_NAME'…"
  psql -U postgres -c "CREATE DATABASE $DB_NAME;" 2>/dev/null || \
    createdb -U "$(whoami)" "$DB_NAME" 2>/dev/null || \
    error "Could not create database. Check PostgreSQL is running and your user has permissions."
else
  info "Database '$DB_NAME' already exists"
fi

# ── 5. Run migrations ────────────────────────────────────────
step "Running database migrations"
run_sql() {
  local label="$1" file="$2"
  echo "  Applying $label…"
  psql "$DB_URL" -f "$file" -v ON_ERROR_STOP=0 2>&1 | grep -v "^$\|already exists\|duplicate\|NOTICE\|DETAIL" || true
}
run_sql "schema.sql"               "$BACKEND/src/db/schema.sql"
run_sql "schema_v2.sql"            "$BACKEND/src/db/schema_v2.sql"
run_sql "schema_v3.sql"            "$BACKEND/src/db/schema_v3.sql"
run_sql "seed_vehicle_hierarchy"   "$BACKEND/src/db/seed_vehicle_hierarchy.sql"
run_sql "seed_programs (SUV1-5)"   "$BACKEND/src/db/seed_programs.sql"
info "Migrations complete"

# ── 6. Backend .env ──────────────────────────────────────────
step "Configuring backend environment"
if [ ! -f "$BACKEND/.env" ]; then
  cp "$BACKEND/.env.example" "$BACKEND/.env"
  # Generate a random JWT secret
  JWT_SECRET=$(LC_ALL=C tr -dc 'A-Za-z0-9!@#$%^&*' < /dev/urandom | head -c 48)
  sed -i '' "s|change_me_to_a_long_random_string|${JWT_SECRET}|g" "$BACKEND/.env"
  sed -i '' "s|DATABASE_URL=.*|DATABASE_URL=${DB_URL}|g" "$BACKEND/.env"
  info "Created backend/.env (JWT secret auto-generated)"
else
  info "backend/.env already exists — skipping"
fi

# ── 7. Frontend .env ─────────────────────────────────────────
step "Configuring frontend environment"
if [ ! -f "$FRONTEND/.env" ]; then
  cp "$FRONTEND/.env.example" "$FRONTEND/.env"
  info "Created frontend/.env"
else
  info "frontend/.env already exists — skipping"
fi

# ── 8. Install npm dependencies ──────────────────────────────
step "Installing backend dependencies"
cd "$BACKEND" && npm install
info "Backend packages installed"

step "Installing frontend dependencies"
cd "$FRONTEND" && npm install
info "Frontend packages installed"

# ── 9. Create demo admin user ────────────────────────────────
step "Creating demo admin account"
ADMIN_HASH='$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'  # password: "password"
psql "$DB_URL" <<'SQL' 2>/dev/null || true
INSERT INTO "user" (email, password_hash, full_name, role_id)
SELECT 'admin@costiq.local', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
       'CostIQ Admin',
       (SELECT id FROM role WHERE name = 'admin')
ON CONFLICT (email) DO NOTHING;

INSERT INTO "user" (email, password_hash, full_name, role_id)
SELECT 'engineer@costiq.local', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
       'Cost Engineer',
       (SELECT id FROM role WHERE name = 'internal')
ON CONFLICT (email) DO NOTHING;
SQL
info "Demo users created (password for all: password)"

# ── Done ─────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         ✅  Setup Complete!                       ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${YELLOW}To start the app, open two terminal tabs:${NC}"
echo ""
echo -e "  ${GREEN}Tab 1 – Backend:${NC}"
echo -e "    cd $(realpath "$BACKEND") && npm run dev"
echo ""
echo -e "  ${GREEN}Tab 2 – Frontend:${NC}"
echo -e "    cd $(realpath "$FRONTEND") && npm run dev"
echo ""
echo -e "  ${GREEN}Then open:${NC}  http://localhost:5173"
echo ""
echo -e "  ${YELLOW}Demo credentials:${NC}"
echo -e "    admin@costiq.local    /  password   (admin)"
echo -e "    engineer@costiq.local /  password   (internal)"
echo ""
