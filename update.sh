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
echo "[1/4] Pulling latest changes..."
BEFORE=$(git rev-parse HEAD)
git pull origin main
AFTER=$(git rev-parse HEAD)

# Step 2: Rebuild and restart services.
# SENTRY_RELEASE tags every Sentry event with the commit actually deployed, so a
# new issue points at the deploy that introduced it. Exported (not written to
# .env) because it changes on every run; a shell variable takes precedence over
# .env in compose substitution.
echo ""
echo "[2/4] Rebuilding services..."
export SENTRY_RELEASE=$(git rev-parse --short HEAD)
echo "release: ${SENTRY_RELEASE}"
docker compose -f docker-compose.prod.yml up -d --build

# Step 3: nginx.conf is bind-mounted as a single FILE, and git pull replaces it
# (new inode) rather than writing through — the running container keeps serving the
# old one, and `up -d` sees no spec change so it never recreates. A config fix can
# therefore look deployed while nginx has never read it. Recreate on any nginx/ change.
echo ""
echo "[3/4] Checking nginx config..."
if [ "${BEFORE}" != "${AFTER}" ] && ! git diff --quiet "${BEFORE}" "${AFTER}" -- nginx/; then
    echo "nginx config changed — recreating container..."
    docker compose -f docker-compose.prod.yml up -d --force-recreate nginx
else
    echo "unchanged."
fi

# Step 4: Prune unused images + trim BuildKit cache. `image prune` does NOT
# touch the build cache — without the builder prune it grows by hundreds of MB
# per deploy (three npm ci stages) and eventually fills the disk. Keep 2 GB so
# rebuilds still hit warm layers on this 1 GB box.
echo ""
echo "[4/4] Cleaning up..."
docker image prune -f
docker builder prune -f --reserved-space 2g

echo ""
echo "✅ Update complete!"
