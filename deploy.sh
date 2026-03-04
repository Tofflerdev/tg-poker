#!/bin/bash
# ============================================
# TG Poker — VPS Deployment Script
# Run on Ubuntu 22.04 VPS as root
# Usage: bash deploy.sh
# ============================================

set -e

DOMAIN="tgp.isgood.host"
APP_DIR="/opt/tg-poker"

echo "=========================================="
echo "  TG Poker — Deployment Script"
echo "  Domain: ${DOMAIN}"
echo "=========================================="

# ============================================
# Step 1: Install Docker & Docker Compose
# ============================================
echo ""
echo "[1/5] Installing Docker..."

if ! command -v docker &> /dev/null; then
    apt-get update
    apt-get install -y ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null

    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable docker
    systemctl start docker
    echo "✅ Docker installed successfully!"
else
    echo "✅ Docker already installed, skipping..."
fi

# ============================================
# Step 2: Setup firewall
# ============================================
echo ""
echo "[2/5] Configuring firewall..."

if command -v ufw &> /dev/null; then
    ufw allow 22/tcp
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw --force enable
    echo "✅ Firewall configured!"
else
    echo "⚠️  UFW not found, skipping firewall setup..."
fi

# ============================================
# Step 3: Check .env file
# ============================================
echo ""
echo "[3/5] Checking configuration..."

cd ${APP_DIR}

if [ ! -f .env ]; then
    echo ""
    echo "❌ ERROR: .env file not found at ${APP_DIR}/.env"
    echo ""
    echo "Create it from the template:"
    echo "  cp .env.production .env"
    echo "  nano .env"
    echo ""
    echo "Required values:"
    echo "  - POSTGRES_PASSWORD (strong random password)"
    echo "  - BOT_TOKEN (from @BotFather)"
    echo ""
    exit 1
fi

echo "✅ .env file found"

# ============================================
# Step 4: Obtain SSL certificate
# ============================================
echo ""
echo "[4/5] Setting up SSL..."

CERT_PATH="/etc/letsencrypt/live/${DOMAIN}"

if [ ! -d "${CERT_PATH}" ]; then
    echo "No SSL certificate found. Obtaining via certbot standalone..."
    
    # Stop anything on port 80
    docker compose -f docker-compose.prod.yml down 2>/dev/null || true
    
    # Install certbot if not present
    if ! command -v certbot &> /dev/null; then
        apt-get update
        apt-get install -y certbot
    fi
    
    # Get certificate using standalone mode (no nginx needed)
    echo "Enter your email for Let's Encrypt notifications:"
    read -r CERTBOT_EMAIL
    
    certbot certonly --standalone \
        --non-interactive \
        --agree-tos \
        --email "${CERTBOT_EMAIL}" \
        -d ${DOMAIN}
    
    echo "✅ SSL certificate obtained!"
    
    # Setup auto-renewal cron
    (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --pre-hook 'docker compose -f ${APP_DIR}/docker-compose.prod.yml stop nginx' --post-hook 'docker compose -f ${APP_DIR}/docker-compose.prod.yml start nginx'") | crontab -
    echo "✅ Auto-renewal cron job added"
else
    echo "✅ SSL certificate already exists"
fi

# ============================================
# Step 5: Build and start all services
# ============================================
echo ""
echo "[5/5] Building and starting services..."

cd ${APP_DIR}

# Update docker-compose to mount host certificates
docker compose -f docker-compose.prod.yml up -d --build

echo ""
echo "Waiting for services to start..."
sleep 15

# Check status
echo ""
echo "Service status:"
docker compose -f docker-compose.prod.yml ps

echo ""
echo "=========================================="
echo "  ✅ Deployment complete!"
echo "=========================================="
echo ""
echo "Your app is available at:"
echo "  🌐 https://${DOMAIN}"
echo ""
echo "Next steps:"
echo "  1. Set up your Telegram bot with @BotFather"
echo "  2. Use /newapp to create a Mini App with URL: https://${DOMAIN}"
echo "  3. Make sure BOT_TOKEN in .env matches your bot"
echo "  4. Restart if you changed .env:"
echo "     cd ${APP_DIR} && docker compose -f docker-compose.prod.yml up -d"
echo ""
echo "Useful commands:"
echo "  View logs:     cd ${APP_DIR} && docker compose -f docker-compose.prod.yml logs -f"
echo "  View app logs: cd ${APP_DIR} && docker compose -f docker-compose.prod.yml logs -f app"
echo "  Restart:       cd ${APP_DIR} && docker compose -f docker-compose.prod.yml restart"
echo "  Stop:          cd ${APP_DIR} && docker compose -f docker-compose.prod.yml down"
echo "  Rebuild:       cd ${APP_DIR} && docker compose -f docker-compose.prod.yml up -d --build"
echo ""
