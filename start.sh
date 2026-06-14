#!/bin/bash
set -e

echo ""
echo "  ╔═══════════════════════════════════╗"
echo "  ║       CostVision — Starting       ║"
echo "  ╚═══════════════════════════════════╝"
echo ""

# First-time .env setup
if [ ! -f calculator/.env ]; then
  cp calculator/.env.example calculator/.env
  echo "  ✅ Created calculator/.env"
  echo ""
  echo "  ⚠️  ACTION REQUIRED:"
  echo "  Open calculator/.env and fill in:"
  echo "    ANTHROPIC_API_KEY=sk-ant-..."
  echo "    JWT_SECRET=$(openssl rand -hex 32)"
  echo ""
  read -p "  Press Enter once you've saved .env to continue..." _
fi

# Start Docker
echo "  🐳 Starting Docker containers..."
docker compose up -d --build

echo ""
echo "  ✅ CostVision is running!"
echo "  🌐 Opening http://localhost:5173 ..."
echo ""

# Open in browser
sleep 2
open http://localhost:5173
