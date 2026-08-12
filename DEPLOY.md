# Deployment Guide — TG Poker

**Stack:** Node.js + PostgreSQL + nginx + Docker | **VPS OS:** Ubuntu (22.04 on the
stand, 26.04 on the live box — the install below derives the codename from
`/etc/os-release`, and Docker publishes both)

**Two boxes run this repo, from the same `main`.** They share the code, the
compose file and the nginx template, and differ only in `.env` — the domain, the
Crypto Pay token, the bot, and `SENTRY_ENVIRONMENT`. Nothing below hardcodes a
domain; commands use `$DOMAIN`, which you set once per shell:

```bash
DOMAIN=tgp.isgood.host          # the test stand
# DOMAIN=nightriver.isgood.host # the live box
```

| | Live box | Test stand |
|---|---|---|
| Domain | `nightriver.isgood.host` | `tgp.isgood.host` |
| Crypto Pay | mainnet app | testnet app |
| `SENTRY_ENVIRONMENT` | `production` | `staging` |
| `BACKUP_REMOTE` | `b2:tgp-backups/prod` | `b2:tgp-backups/staging` |

Launching the live box is a checklist of its own: `plans/mainnet-cutover-plan.md`.

---

## How a change reaches the live box

**Feature work never happens on `main`, and `main` never goes straight to the live
box.** The order is fixed and step 4 is a person, not a test suite:

1. **Branch.** Every feature or fix starts on its own branch off `main`.
2. **Merge.** When the work is ready to deploy, merge into `main` and push.
3. **Deploy to the stand** — `tgp.isgood.host`, and only there.
4. **The owner checks it by hand on the stand and confirms.** Nothing reaches the
   live box without that confirmation, however small the change looks.
5. **Deploy to the live box** — `nightriver.isgood.host`.

> ⚠️ **Both boxes pull the same `main`, so this gate is timing, not branching.**
> The moment a merge lands, the live box is one `update.sh` away from shipping it,
> and nothing in the tooling stops that. The stand being "one commit behind" is not
> a safety mechanism — the discipline is.

Money makes the gate cheap by comparison: the live box holds real balances and a
real Crypto Pay wallet, and the stand exists precisely so a bad deploy meets
testnet chips first.

## Routine deploy (one box)

Push to GitHub, then — with `$DOMAIN` set to the box you actually mean:

```bash
ssh root@$DOMAIN
cd /opt/tg-poker
bash update.sh
```

`update.sh` runs four steps:

1. `git pull origin main`, remembering the commit before and after.
2. `export SENTRY_RELEASE=<short sha>` then
   `docker compose -f docker-compose.prod.yml up -d --build`. The export is what
   tags Sentry events with the deploy they came from; a manual `up -d` leaves it
   empty and costs you that tag.
3. **Recreates nginx if anything under `nginx/` changed between those commits.**
   Without this a config change can look deployed and never be read — see the
   inode note under [Troubleshooting](#troubleshooting).
4. `docker image prune -f` and `docker builder prune -f --reserved-space 2g`.
   The builder prune is not optional on a 1 GB box: image prune leaves the build
   cache alone and it grows by hundreds of MB per deploy.

Postgres is not rebuilt and its data survives. **Database migrations apply
themselves**: `docker-entrypoint.sh` runs `npx prisma db push` on every
container start, which is safe for additive and nullable-default columns and is
the only migration mechanism in play.

> ⚠️ **Changes to `update.sh` itself take effect on the NEXT run.** bash reads
> the script as it executes and step 1 replaces the file underneath it. If a
> deploy depends on an edited `update.sh`, run it twice.

---

## What is running

| Container | Image | Role |
|-----------|-------|------|
| `tg-poker-postgres-1` | postgres:16-alpine | Database (volume `pgdata`) |
| `tg-poker-app-1` | tg-poker-app | Node.js server (port 3000, internal only) |
| `tg-poker-nginx-1` | nginx:alpine | Reverse proxy (80/443, public) |

App dir `/opt/tg-poker` · env file `/opt/tg-poker/.env` ·
SSL cert `/etc/letsencrypt/live/$DOMAIN/` (renewed by systemd `certbot.timer`
plus the hooks from step 5 below).

---

## Useful commands

```bash
cd /opt/tg-poker
C="docker compose -f docker-compose.prod.yml"

$C logs -f app                      # live logs
$C ps                               # container status
$C restart app                      # restart without rebuild
$C up -d --build                    # full rebuild (update.sh step 2)
$C down                             # stop everything
$C exec postgres psql -U poker -d poker_db
$C exec app printenv SENTRY_ENVIRONMENT CRYPTO_PAY_TESTNET   # what the app really got

# What nginx is actually serving (inside the container, not on the host)
$C exec nginx cat /etc/nginx/conf.d/default.conf

# SSL expiry
openssl s_client -connect $DOMAIN:443 -servername $DOMAIN 2>/dev/null \
  | openssl x509 -noout -dates
```

---

## Environment variables

File: `/opt/tg-poker/.env`. **Template: `.env.production.example`** (copy it to
`.env` on the box and fill it in). **Annotated reference for every key the code
reads: `.env.example`.** `.env` and `.env.production` are gitignored — the repo
is checked out *as* `/opt/tg-poker`, so anything named like a real env file has
to be uncommittable.

Three rules that have each cost this project a debugging session:

- **Write `.env` by hand on each box. Never copy it from the other one** —
  secrets are per-box, and on the stand `ADMIN_PASS` equals `POSTGRES_PASSWORD`.
  Generate each separately:
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- **compose passes env by an explicit list.** A key in `.env` that is not named
  under `environment:` in `docker-compose.prod.yml` never reaches the container.
- **Some keys are silent when missing.** The app boots healthy without them and
  simply does less:

  | Key | What its absence costs you |
  |---|---|
  | `CRYPTO_PAY_TOKEN` | Deposits disabled. No error, no warning. |
  | `SENTRY_DSN` | No error tracking — including the money-invariant alert. |
  | `POSTHOG_API_KEY` | No analytics. |
  | `BACKUP_TG_CHAT_ID` | Backups still run, failures alert nobody. |

  Keys that fail loudly instead, by design: `DOMAIN` (compose refuses to start),
  `JWT_SECRET` (exits 1 under `NODE_ENV=production`), `BACKUP_AGE_RECIPIENT`
  (backup.sh dies rather than write an unencrypted dump).

`DOMAIN` is read while nginx starts, so changing it needs a recreate, not a
restart:

```bash
docker compose -f docker-compose.prod.yml up -d --force-recreate nginx
```

Any other value: edit `.env`, then `docker compose -f docker-compose.prod.yml up -d`.

---

## First-time setup (new VPS)

Set `DOMAIN=<the new domain>` in your shell first — every step below uses it.

### 1. Point DNS

```
Type: A  |  Name: <subdomain>  |  Value: <VPS_IP>  |  TTL: 300
```

### 2. Install Docker

```bash
apt-get update && apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### 3. GitHub access

```bash
ssh-keygen -t ed25519 -C "vps-deploy"
cat ~/.ssh/id_ed25519.pub
# Add as a Deploy Key: GitHub repo → Settings → Deploy keys
```

### 4. Clone and configure

```bash
git clone git@github.com:Tofflerdev/tg-poker.git /opt/tg-poker
cd /opt/tg-poker
cp .env.production.example .env
nano .env          # every CHANGE_ME, generated on THIS box
```

Do not skip the silent keys in the table above. On a live box the ones that
matter most are `CRYPTO_PAY_TOKEN`, `CRYPTO_PAY_TESTNET=false`, `SENTRY_DSN`,
`SENTRY_ENVIRONMENT=production` and `MONEY_INVARIANT_BASELINE_CHIPS=0`.

### 5. SSL certificate

```bash
apt-get install -y certbot
certbot certonly --standalone -d $DOMAIN
```

Renewal runs from the systemd `certbot.timer` shipped with certbot — it fires
twice daily and renews only inside the last 30 days. The **standalone**
authenticator needs port 80, which the nginx container holds, so hooks free it
for the few seconds a renewal takes:

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

certbot renew --dry-run    # exercises the hooks and brings nginx back
```

> Hooks only run when a renewal is actually attempted — nginx stops for a few
> seconds roughly every 60 days, not on every timer tick.
>
> **If the cert ever expires:**
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
docker compose -f docker-compose.prod.yml logs app | head -40
```

Read that boot log rather than assuming. It states which Crypto Pay app the
token belongs to, whether Sentry initialised, and that the reconciliation and
invariant jobs started. **The Crypto Pay app name is the proof you deployed the
token you meant to.**

### 7. Telegram bot

1. [@BotFather](https://t.me/BotFather) → `/newapp` → Web App URL `https://$DOMAIN`
2. Optionally `/setmenubutton` → same URL, text `Play Poker`

The bot and `BOT_TOKEN` must match: the token carries the HMAC that validates
`initData`, so a mismatched pair means nobody can log in at all.

### 8. Backups

Set up before the box holds anything you would miss — see the next section.

---

## Database backups

Hourly encrypted dump → Backblaze B2, plus one daily copy into the owner's
Telegram DM. Rationale and the restore drill: `plans/db-backup-plan.md`.

- Script `/opt/tg-poker/backup.sh` — runs on the **host**, not in a container
- Schedule `/etc/cron.d/tgp-backup` — hourly at **:17**
- Local copies `/opt/tg-poker/backups/*.dump.age`, kept 48 h; log `backups/backup.log`
- Remote `$BACKUP_REMOTE/hourly/` (7 days) and `/daily/` (90 days); retention is
  applied by the script, not by bucket lifecycle rules
- Encryption `age`, **public key only on the server** (`BACKUP_AGE_RECIPIENT`).
  The private key lives with the owner. Losing it loses every backup, including
  the owner's own.

```bash
# One-time server setup
apt-get install -y age
curl https://rclone.org/install.sh | bash
rclone config create b2 b2 account=<keyID> key=<applicationKey>
chmod 600 /root/.config/rclone/rclone.conf
mkdir -p /opt/tg-poker/backups && chmod 700 /opt/tg-poker/backups
install -m 644 /opt/tg-poker/scripts/tgp-backup.cron /etc/cron.d/tgp-backup

# Run it by hand (same code path as cron) and check where it landed
bash /opt/tg-poker/backup.sh && tail -5 /opt/tg-poker/backups/backup.log
rclone ls $BACKUP_REMOTE/hourly | tail -5
```

> ⚠️ **`BACKUP_REMOTE` must differ per box.** Both boxes name their dumps
> `db-YYYYMMDD-HHMM.dump.age` and both run cron at `:17`, so a shared prefix
> makes the names collide and one box quietly overwrites the other's backups.
> `backup.sh` defaults to `b2:tgp-backups` when the key is unset — which is
> exactly the collision. Use `b2:tgp-backups/prod` and `b2:tgp-backups/staging`.
>
> Use the **same** `BACKUP_AGE_RECIPIENT` on both. One key pair is easier to keep
> than two, and the private half is off-server either way.

Failures alert the owner over Telegram. A cron that never fires cannot alert, so
the **daily DM is the heartbeat**: no morning file means backups are dead.

**Restore:**

```bash
rclone copy $BACKUP_REMOTE/hourly/db-YYYYMMDD-HHMM.dump.age .
age -d -i tgp-backup.key db-YYYYMMDD-HHMM.dump.age > restore.dump
docker compose -f docker-compose.prod.yml cp restore.dump postgres:/tmp/r.dump
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U poker -d poker_db --clean --if-exists /tmp/r.dump
```

Rehearse it off the server with `scripts/restore-check.sh <file.age> <key>` —
after schema migrations and at least quarterly.

---

## Troubleshooting

**A deploy that "isn't visible".** Telegram's WebView serves `/assets/` as
`immutable` for a year, so one cached `index.html` pins the whole old app.
`index.html` itself is `no-cache, must-revalidate`, but **an already-open Mini
App keeps running the old JS from memory** — close and reopen it fully before
concluding anything. To check what is really being served, compare the bundle
hash from `curl https://$DOMAIN/` against the local build.

**An nginx config change that never took.** The template is mounted as a
directory (`./nginx` → `/etc/nginx/templates`) precisely because a bind-mounted
single file gets replaced by `git pull` — new inode, container still reading the
old one, `up -d` seeing no spec change. `nginx -t` and `nginx -s reload` both
pass happily on the stale config. `update.sh` recreates nginx on any `nginx/`
change; by hand it is `up -d --force-recreate nginx`. Always verify with
`exec nginx cat /etc/nginx/conf.d/default.conf`, inside the container.

**Testing the template locally**, without deploying:

```bash
docker run --rm -e DOMAIN=example.com -e NGINX_ENVSUBST_FILTER=DOMAIN \
  -v ./nginx:/etc/nginx/templates:ro --entrypoint /bin/sh nginx:alpine \
  -c "/docker-entrypoint.d/20-envsubst-on-templates.sh; cat /etc/nginx/conf.d/default.conf"
```

The image only runs its init scripts when the command is `nginx`, so calling the
envsubst script explicitly is the point — with any other command the templates
are silently skipped and you read the image's stock config thinking it is yours.

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
    ├── Static files (React SPA built into the image)
    ├── /socket.io/ → WebSocket proxy to app
    └── /api/      → HTTP proxy to app
```

The client is built inside the Docker image (stage 2) and copied to the shared
`client-dist` volume that nginx serves; `docker-entrypoint.sh` prunes files left
by previous builds so the volume does not accumulate stale content-hashed
chunks. PostgreSQL data lives in `pgdata` and survives rebuilds.
