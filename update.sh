#!/bin/bash
# ============================================
# TG Poker — Update Script
# Run on VPS to pull latest changes and rebuild
# ============================================

set -e

APP_DIR="/opt/tg-poker"

echo "=========================================="
echo "  TG Poker — Update Script"
echo "=========================================="

cd ${APP_DIR}

# Step 1: Pull latest changes
echo ""
echo "[1/3] Pulling latest changes..."
git pull origin main

# Step 2: Rebuild and restart services
echo ""
echo "[2/3] Rebuilding services..."
docker compose -f docker-compose.prod.yml up -d --build

# Step 3: Prune unused images
echo ""
echo "[3/3] Cleaning up..."
docker image prune -f

echo ""
echo "✅ Update complete!"
