#!/usr/bin/env bash
# =============================================================================
# TG Poker — hourly encrypted Postgres backup
#
# Runs on the HOST (not inside a container), once an hour from
# /etc/cron.d/tgp-backup. Rationale for every step: plans/db-backup-plan.md.
#
#   pg_dump -Fc  →  age (public key)  →  local dir (48h)  →  Backblaze B2
#   once a day (BACKUP_DAILY_HOUR_UTC): a second copy under daily/ in B2 plus
#   the file itself to the owner's Telegram DM. That daily message doubles as
#   the heartbeat — no morning file in the DM means backups have stopped.
#
# Retention on the remote is done HERE, not by bucket lifecycle rules: it is one
# fewer thing configured in a web UI that nobody will remember, it shows up in
# this log, and it keeps the script portable across storage providers.
#
# The dump never touches the disk unencrypted: pg_dump is piped straight into
# age. Only the *public* key lives on this box, so whoever takes the server
# still cannot read a single backup.
# =============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/tg-poker}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
ENV_FILE="$APP_DIR/.env"
LOG_FILE="$BACKUP_DIR/backup.log"
LOCK_FILE="/var/lock/tgp-backup.lock"
COMPOSE_FILE="docker-compose.prod.yml"

# cron gives us a near-empty PATH; docker/age/rclone all live in these two.
PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export PATH
# cron does not reliably export HOME, and rclone would then look for its config
# in the wrong place — point at it explicitly.
export RCLONE_CONFIG="${RCLONE_CONFIG:-/root/.config/rclone/rclone.conf}"
# B2 keeps every version of a file: a plain `rclone delete` only writes a hide
# marker, so the bytes stay and the bucket grows forever while `rclone ls` shows
# a tidy 7 days. Retention here is meant literally. Other backends ignore this.
export RCLONE_B2_HARD_DELETE=true

STEP="startup"

# --- tiny helpers ------------------------------------------------------------

log() { printf '%s %s\n' "$(date -u '+%Y-%m-%d %H:%M:%S UTC')" "$*" >>"$LOG_FILE"; }

# Read one key out of .env without sourcing it (the file holds secrets and
# arbitrary shell would run as root).
env_get() {
    local key="$1" line
    line=$(grep -m1 -E "^[[:space:]]*${key}=" "$ENV_FILE" 2>/dev/null || true)
    [ -n "$line" ] || return 0
    line=${line#*=}
    line=${line%$'\r'}            # tolerate a CRLF .env
    line=${line#\"}; line=${line%\"}
    line=${line#\'}; line=${line%\'}
    printf '%s' "$line"
}

# Alerts must never take the script down themselves, hence the `|| true`s.
tg_alert() {
    local text="$1"
    if [ -z "${BOT_TOKEN:-}" ] || [ -z "${TG_CHAT_ID:-}" ]; then
        log "ALERT (telegram not configured): $text"
        return 0
    fi
    curl -sS -m 30 -o /dev/null \
        --data-urlencode "chat_id=${TG_CHAT_ID}" \
        --data-urlencode "text=${text}" \
        "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" >/dev/null 2>&1 || true
}

on_error() {
    local code=$? line=${1:-?}
    log "FAILED at step '${STEP}' (line ${line}, exit ${code})"
    tg_alert "🔴 tg-poker: бэкап БД упал
шаг: ${STEP}
код выхода: ${code} (строка ${line})
хост: $(hostname)
лог: ${LOG_FILE}"
    exit "$code"
}

die() { STEP="$1"; log "FATAL: $2"; tg_alert "🔴 tg-poker: бэкап БД не запустился
шаг: $1
${2}"; exit 1; }

# --- preflight ---------------------------------------------------------------

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# Size-based log rotation: one 1 MiB generation back, nothing fancier.
if [ -f "$LOG_FILE" ] && [ "$(stat -c %s "$LOG_FILE")" -gt 1048576 ]; then
    mv -f "$LOG_FILE" "${LOG_FILE}.1"
fi

# Overlapping runs would fight over the same file names, and a slow dump plus a
# slow upload can outlive the hour. Second instance just leaves.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
    log "another run still in progress — skipping this hour"
    exit 0
fi

trap 'on_error $LINENO' ERR

[ -f "$ENV_FILE" ] || die "preflight" "нет $ENV_FILE"

BOT_TOKEN="$(env_get BOT_TOKEN)"
TG_CHAT_ID="$(env_get BACKUP_TG_CHAT_ID)"
AGE_RECIPIENT="$(env_get BACKUP_AGE_RECIPIENT)"
REMOTE="$(env_get BACKUP_REMOTE)"; REMOTE="${REMOTE:-b2:tgp-backups}"
DAILY_HOUR="$(env_get BACKUP_DAILY_HOUR_UTC)"; DAILY_HOUR="${DAILY_HOUR:-03}"
KEEP_HOURS="$(env_get BACKUP_LOCAL_RETENTION_HOURS)"; KEEP_HOURS="${KEEP_HOURS:-48}"
KEEP_HOURLY_DAYS="$(env_get BACKUP_REMOTE_HOURLY_DAYS)"; KEEP_HOURLY_DAYS="${KEEP_HOURLY_DAYS:-7}"
KEEP_DAILY_DAYS="$(env_get BACKUP_REMOTE_DAILY_DAYS)"; KEEP_DAILY_DAYS="${KEEP_DAILY_DAYS:-90}"
PG_USER="$(env_get POSTGRES_USER)"; PG_USER="${PG_USER:-poker}"
PG_DB="$(env_get POSTGRES_DB)"; PG_DB="${PG_DB:-poker_db}"

[ -n "$AGE_RECIPIENT" ] || die "preflight" "BACKUP_AGE_RECIPIENT не задан в .env — шифровать нечем"
command -v age >/dev/null || die "preflight" "age не установлен"
command -v rclone >/dev/null || die "preflight" "rclone не установлен"
[ -r "$RCLONE_CONFIG" ] || die "preflight" "нет конфига rclone: $RCLONE_CONFIG"

cd "$APP_DIR"

STAMP="$(date -u '+%Y%m%d-%H%M')"
NAME="db-${STAMP}.dump.age"
OUT="$BACKUP_DIR/$NAME"

log "=== backup $NAME start ==="

# --- 1. dump + encrypt in one pipe ------------------------------------------

STEP="pg_dump | age"
# `set -o pipefail` (from set -e...pipefail above) makes a failing pg_dump fail
# the whole pipeline even though age happily encrypts a truncated stream.
docker compose -f "$COMPOSE_FILE" exec -T postgres \
        pg_dump -U "$PG_USER" -Fc "$PG_DB" \
    | age -r "$AGE_RECIPIENT" -o "$OUT.part"
mv -f "$OUT.part" "$OUT"
chmod 600 "$OUT"

# --- 2. sanity: the dump is not a pile of nothing ----------------------------

STEP="проверка размера"
SIZE=$(stat -c %s "$OUT")
# age neither compresses nor pads (pg_dump -Fc is already compressed), so the
# encrypted size tracks the plaintext one to within a ~200-byte header. A real
# dump is megabytes; anything under 10 KB means Postgres is down or empty and
# cron is cheerfully archiving nothing.
if [ "$SIZE" -lt 10240 ]; then
    rm -f "$OUT"
    die "проверка размера" "дамп подозрительно мал (${SIZE} байт) — Postgres лёг или база пуста"
fi
log "dump ok: ${SIZE} bytes"

# --- 3. local retention ------------------------------------------------------

STEP="локальный ретеншен"
find "$BACKUP_DIR" -maxdepth 1 -name 'db-*.dump.age' -mmin "+$((KEEP_HOURS * 60))" -delete
find "$BACKUP_DIR" -maxdepth 1 -name '*.part' -mmin +180 -delete

# --- 4. upload to the remote -------------------------------------------------

STEP="rclone → ${REMOTE}/hourly"
rclone copy --no-traverse "$OUT" "${REMOTE}/hourly/"
log "uploaded to ${REMOTE}/hourly/${NAME}"

# --- 5. once a day: daily/ copy + the file into the owner's DM ---------------

HOUR="$(date -u '+%H')"
if [ "$HOUR" = "$DAILY_HOUR" ]; then
    STEP="rclone → ${REMOTE}/daily"
    rclone copy --no-traverse "$OUT" "${REMOTE}/daily/"
    log "uploaded to ${REMOTE}/daily/${NAME}"

    STEP="telegram sendDocument"
    if [ -n "$BOT_TOKEN" ] && [ -n "$TG_CHAT_ID" ]; then
        HTTP=$(curl -sS -m 120 -o /tmp/tgp-backup-tg.json -w '%{http_code}' \
            -F "chat_id=${TG_CHAT_ID}" \
            -F "document=@${OUT}" \
            -F "caption=🗄 tg-poker: суточный бэкап БД ${STAMP} UTC ($((SIZE / 1024)) КБ). Расшифровать: age -d -i tgp-backup.key ${NAME}" \
            "https://api.telegram.org/bot${BOT_TOKEN}/sendDocument")
        if [ "$HTTP" != "200" ]; then
            log "sendDocument HTTP ${HTTP}: $(head -c 400 /tmp/tgp-backup-tg.json 2>/dev/null || true)"
            false   # → ERR trap → alert
        fi
        rm -f /tmp/tgp-backup-tg.json
        log "daily copy sent to telegram"
    else
        log "telegram not configured — daily DM skipped"
    fi
fi

# --- 6. remote retention -----------------------------------------------------
# Last, deliberately: this hour's backup is already safe by now, so a failure
# here alerts about a storage-growth problem without ever costing us a backup.

STEP="ретеншен на ${REMOTE}"
rclone delete --min-age "${KEEP_HOURLY_DAYS}d" "${REMOTE}/hourly/"
rclone delete --min-age "${KEEP_DAILY_DAYS}d" "${REMOTE}/daily/"
log "remote retention applied (hourly ${KEEP_HOURLY_DAYS}d, daily ${KEEP_DAILY_DAYS}d)"

STEP="done"
log "=== backup $NAME ok ==="
