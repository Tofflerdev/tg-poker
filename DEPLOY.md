# Deployment Guide — TG Poker

**Domain:** `tgp.isgood.host` | **Stack:** Node.js + PostgreSQL + nginx + Docker | **VPS OS:** Ubuntu 22.04

---

## Routine deploy (already set up — use this every time)

Push your changes to GitHub, then SSH to the VPS and run:

```bash
ssh root@tgp.isgood.host
cd /opt/tg-poker
bash update.sh
```

That's it. The script:
1. `git pull origin main` — pulls latest code
2. `docker compose -f docker-compose.prod.yml up -d --build` — rebuilds and restarts changed containers (postgres data is preserved)
3. `docker image prune -f` — cleans up old images

The app is back online automatically — nginx and postgres are not rebuilt unless their config changed.

---

## What's running on the VPS right now

| Container | Image | Role |
|-----------|-------|------|
| `tg-poker-postgres-1` | postgres:16-alpine | Database (persistent volume `pgdata`) |
| `tg-poker-app-1` | tg-poker-app | Node.js server (port 3000, internal only) |
| `tg-poker-nginx-1` | nginx:alpine | Reverse proxy (ports 80/443, public) |

SSL cert: `/etc/letsencrypt/live/tgp.isgood.host/` (auto-renewed via systemd `certbot.timer` + renewal hooks)  
App dir: `/opt/tg-poker`  
Env file: `/opt/tg-poker/.env`

---

## Useful commands

```bash
cd /opt/tg-poker

# View live logs
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml logs -f nginx

# Check container status
docker compose -f docker-compose.prod.yml ps

# Restart app only (without rebuild)
docker compose -f docker-compose.prod.yml restart app

# Full rebuild (same as update.sh step 2)
docker compose -f docker-compose.prod.yml up -d --build

# Stop everything
docker compose -f docker-compose.prod.yml down

# Access the database
docker compose -f docker-compose.prod.yml exec postgres psql -U poker -d poker_db

# Check SSL certificate expiry
openssl s_client -connect tgp.isgood.host:443 -servername tgp.isgood.host 2>/dev/null | openssl x509 -noout -dates
```

---

## Environment variables

File: `/opt/tg-poker/.env`

```env
POSTGRES_USER=poker
POSTGRES_PASSWORD=<strong password>
POSTGRES_DB=poker_db
BOT_TOKEN=<telegram bot token>
JWT_SECRET=<openssl rand -base64 48>
ADMIN_USER=<admin login>
ADMIN_PASS=<admin password>
NODE_ENV=production
PORT=3000
DOMAIN=tgp.isgood.host
```

To change a value: edit `.env`, then restart:
```bash
docker compose -f docker-compose.prod.yml up -d
```

---

## First-time setup (new VPS)

Only needed if setting up from scratch on a new server.

### 1. Point DNS

Create an A record in your DNS provider:
```
Type: A  |  Name: tgp  |  Value: <VPS_IP>  |  TTL: 300
```

### 2. Install Docker on VPS

```bash
apt-get update && apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### 3. Configure GitHub SSH access on VPS

```bash
ssh-keygen -t ed25519 -C "vps-deploy"
cat ~/.ssh/id_ed25519.pub
# Add this key as a Deploy Key in GitHub repo → Settings → Deploy keys
```

### 4. Clone and configure

```bash
git clone git@github.com:Tofflerdev/tg-poker.git /opt/tg-poker
cd /opt/tg-poker
cp .env.production .env
nano .env   # set POSTGRES_PASSWORD and BOT_TOKEN
```

### 5. Get SSL certificate

```bash
apt-get install -y certbot
certbot certonly --standalone -d tgp.isgood.host
```

Auto-renewal runs via the systemd `certbot.timer` that ships with the certbot
package (no cron needed — `certbot.timer` fires twice daily and renews only
when the cert is within 30 days of expiry). Because the cert uses the
**standalone** authenticator, certbot needs port 80, which the nginx container
holds. Renewal hooks free it just for the renewal:

```bash
mkdir -p /etc/letsencrypt/renewal-hooks/pre /etc/letsencrypt/renewal-hooks/post

printf '%s\n' '#!/bin/sh' \
  'docker compose -f /opt/tg-poker/docker-compose.prod.yml stop nginx' \
  > /etc/letsencrypt/renewal-hooks/pre/stop-nginx.sh

printf '%s\n' '#!/bin/sh' \
  'docker compose -f /opt/tg-poker/docker-compose.prod.yml start nginx' \
  > /etc/letsencrypt/renewal-hooks/post/start-nginx.sh

chmod +x /etc/letsencrypt/renewal-hooks/pre/stop-nginx.sh \
         /etc/letsencrypt/renewal-hooks/post/start-nginx.sh

# Verify the whole flow (uses staging, runs the hooks, brings nginx back):
certbot renew --dry-run
```

> The hooks only run when a renewal is actually attempted, so nginx is stopped
> for a few seconds roughly once every ~60 days, not on every timer tick.
>
> **If the cert ever expires** (timer disabled / hooks missing), renew manually:
> ```bash
> cd /opt/tg-poker
> docker compose -f docker-compose.prod.yml stop nginx
> certbot renew
> docker compose -f docker-compose.prod.yml start nginx
> ```

### 6. Build and start

```bash
cd /opt/tg-poker
docker compose -f docker-compose.prod.yml up -d --build
```

### 7. Configure Telegram Bot

1. [@BotFather](https://t.me/BotFather) → `/newapp` → set Web App URL: `https://tgp.isgood.host`
2. Optionally: `/setmenubutton` → URL `https://tgp.isgood.host`, text `Play Poker`

---

## Database backups

Hourly encrypted dump → Backblaze B2, plus one daily copy into the owner's
Telegram DM. Full rationale and the restore drill: `plans/db-backup-plan.md`.

- Script: `/opt/tg-poker/backup.sh` (in the repo, runs on the **host**, not in a container)
- Schedule: `/etc/cron.d/tgp-backup` — every hour at **:17**
- Local copies: `/opt/tg-poker/backups/*.dump.age`, kept 48 h; log `backups/backup.log`
- Remote: `b2:tgp-backups/hourly/` (7 days) and `daily/` (90 days) — retention is
  applied by the script, not by bucket lifecycle rules
- Encryption: `age`, **public key only on the server** (`BACKUP_AGE_RECIPIENT` in `.env`).
  The private key lives with the owner — without it every backup is noise, including
  the owner's own. Losing it loses the backups.

```bash
# One-time server setup
apt-get install -y age
curl https://rclone.org/install.sh | bash
rclone config create b2 b2 account=<keyID> key=<applicationKey>
chmod 600 /root/.config/rclone/rclone.conf
mkdir -p /opt/tg-poker/backups && chmod 700 /opt/tg-poker/backups
install -m 644 /opt/tg-poker/scripts/tgp-backup.cron /etc/cron.d/tgp-backup

# Run it by hand (same code path as cron)
bash /opt/tg-poker/backup.sh && tail -5 /opt/tg-poker/backups/backup.log

# What is on the remote right now
rclone ls b2:tgp-backups/hourly | tail -5
```

Failures alert the owner over Telegram. A cron that never fires cannot alert, so
the **daily DM is the heartbeat**: no morning file = backups are dead, go look.

**Restore** (see also the cheat sheet at the end of the backup plan):

```bash
rclone copy b2:tgp-backups/hourly/db-YYYYMMDD-HHMM.dump.age .
age -d -i tgp-backup.key db-YYYYMMDD-HHMM.dump.age > restore.dump
docker compose -f docker-compose.prod.yml cp restore.dump postgres:/tmp/r.dump
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U poker -d poker_db --clean --if-exists /tmp/r.dump
```

Rehearse it off the server with `scripts/restore-check.sh <file.age> <key>` —
after schema migrations and at least quarterly.

---

## Architecture

```
Internet
    │
    ▼
┌──────────┐     ┌──────────────┐     ┌────────────┐
│  nginx   │────▶│  Node.js App │────▶│ PostgreSQL │
│ :80/:443 │     │    :3000     │     │   :5432    │
└──────────┘     └──────────────┘     └────────────┘
    │
    ├── Static files (React SPA built into Docker image)
    ├── /socket.io/ → WebSocket proxy to app
    └── /api/      → HTTP proxy to app
```

Static client files are built inside the Docker image (Stage 2) and copied to a shared Docker volume (`client-dist`) that nginx serves directly. PostgreSQL data lives in the `pgdata` volume and survives container rebuilds.
