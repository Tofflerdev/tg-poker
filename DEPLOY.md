# 🚀 Deployment Guide — TG Poker

Deploy the Telegram Poker Mini App to a VPS with Docker, nginx, and Let's Encrypt SSL.

**Domain:** `tgp.isgood.host`  
**Stack:** Node.js + PostgreSQL + nginx + Docker  
**OS:** Ubuntu 22.04

---

## Prerequisites

- VPS with Ubuntu 22.04 (minimum 1GB RAM, 1 CPU)
- Domain `tgp.isgood.host` pointing to your VPS IP (A record in DNS)
- SSH access to the VPS as root
- Telegram Bot Token from [@BotFather](https://t.me/BotFather)
- GitHub repository with the project code

---

## Step 1: Point DNS to VPS

In your DNS provider, create an **A record**:

```
Type: A
Name: tgp
Value: <YOUR_VPS_IP>
TTL: 300
```

Verify it resolves:
```bash
dig tgp.isgood.host
```

---

## Step 2: Setup Git on VPS

1. **Generate SSH key on VPS** (for GitHub access):
   ```bash
   ssh-keygen -t ed25519 -C "vps-deploy"
   cat ~/.ssh/id_ed25519.pub
   ```

2. **Add Deploy Key to GitHub**:
   - Go to your GitHub repo → Settings → Deploy keys
   - Click "Add deploy key"
   - Paste the public key
   - Title: "VPS Deploy Key"
   - Allow write access: Unchecked (read-only is safer)

3. **Clone the repository**:
   ```bash
   mkdir -p /opt/tg-poker
   git clone git@github.com:your-username/tg-poker.git /opt/tg-poker
   cd /opt/tg-poker
   ```

---

## Step 3: Configure environment

On the VPS:

```bash
cd /opt/tg-poker

# Copy the production env template
cp .env.production .env

# Edit with your values
nano .env
```

**Required values to change:**

```env
POSTGRES_PASSWORD=<generate-a-strong-password>
BOT_TOKEN=<your-bot-token-from-botfather>
```

Generate a strong password:
```bash
openssl rand -base64 32
```

---

## Step 4: Run the deploy script

```bash
cd /opt/tg-poker
chmod +x deploy.sh update.sh
bash deploy.sh
```

The script will:
1. ✅ Install Docker & Docker Compose
2. ✅ Configure firewall (ports 22, 80, 443)
3. ✅ Verify `.env` configuration
4. ✅ Obtain SSL certificate via Let's Encrypt
5. ✅ Build and start all services (postgres, app, nginx)

---

## Step 5: Set up Telegram Bot

1. Open [@BotFather](https://t.me/BotFather) in Telegram
2. Create a new bot: `/newbot`
3. Copy the bot token → put it in `.env` as `BOT_TOKEN`
4. Create a Mini App: `/newapp`
   - Select your bot
   - Set the Web App URL: `https://tgp.isgood.host`
5. Optionally set menu button: `/setmenubutton`
   - URL: `https://tgp.isgood.host`
   - Button text: `🎰 Play Poker`

After updating `BOT_TOKEN`, restart:
```bash
cd /opt/tg-poker
docker compose -f docker-compose.prod.yml up -d
```

---

## Step 6: Verify deployment

1. Open `https://tgp.isgood.host` in browser — should show the app
2. Open your bot in Telegram → tap the Mini App button
3. Test authentication, joining a table, playing a hand

---

## Updating the App

After pushing changes to GitHub, run this on the VPS:

```bash
cd /opt/tg-poker
bash update.sh
```

This script will:
1. `git pull` latest changes
2. Rebuild Docker containers
3. Restart services
4. Prune unused images

---

## Useful Commands

```bash
cd /opt/tg-poker

# View all logs
docker compose -f docker-compose.prod.yml logs -f

# View only app logs
docker compose -f docker-compose.prod.yml logs -f app

# View only nginx logs
docker compose -f docker-compose.prod.yml logs -f nginx

# Restart all services
docker compose -f docker-compose.prod.yml restart

# Restart only the app (after code changes)
docker compose -f docker-compose.prod.yml up -d --build app
docker compose -f docker-compose.prod.yml restart nginx

# Stop everything
docker compose -f docker-compose.prod.yml down

# Full rebuild
docker compose -f docker-compose.prod.yml up -d --build

# Check service status
docker compose -f docker-compose.prod.yml ps

# Access PostgreSQL
docker compose -f docker-compose.prod.yml exec postgres psql -U poker -d poker_db

# Check SSL certificate expiry
openssl s_client -connect tgp.isgood.host:443 -servername tgp.isgood.host 2>/dev/null | openssl x509 -noout -dates
```

---

## Architecture

```
Internet
    │
    ▼
┌─────────┐     ┌──────────────┐     ┌────────────┐
│  nginx   │────▶│  Node.js App │────▶│ PostgreSQL │
│ :80/:443 │     │    :3000     │     │   :5432    │
└─────────┘     └──────────────┘     └────────────┘
    │
    ├── Static files (client SPA)
    ├── /socket.io/ → WebSocket proxy
    └── /api/ → HTTP proxy
```

All services run in Docker containers on the same internal network.
nginx is the only service exposed to the internet.
