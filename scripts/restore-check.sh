#!/usr/bin/env bash
# =============================================================================
# TG Poker — restore drill for an encrypted backup (plans/db-backup-plan.md §5)
#
# A backup nobody has ever restored is a rumour. Run this on a machine that is
# NOT the server (the private age key must never travel there), after a schema
# migration and at least quarterly.
#
#   ./scripts/restore-check.sh db-20260802-0317.dump.age ~/keys/tgp-backup.key
#
# It decrypts straight into a throwaway postgres:16-alpine container — the
# plaintext dump never lands on your disk — restores it, prints the numbers to
# compare against prod, and prints the elapsed time (that is your RTO).
# =============================================================================
set -euo pipefail

ARCHIVE="${1:-}"
KEYFILE="${2:-}"
CONTAINER="tgp-restore-check"
PG_USER="poker"
PG_DB="poker_db"

if [ -z "$ARCHIVE" ] || [ -z "$KEYFILE" ]; then
    echo "usage: $0 <db-....dump.age> <path/to/tgp-backup.key>" >&2
    exit 2
fi
[ -r "$ARCHIVE" ] || { echo "нет файла: $ARCHIVE" >&2; exit 2; }
[ -r "$KEYFILE" ] || { echo "нет ключа: $KEYFILE" >&2; exit 2; }
command -v age >/dev/null || { echo "age не установлен" >&2; exit 2; }

export MSYS_NO_PATHCONV=1   # git-bash on Windows otherwise mangles /-paths

START=$(date +%s)
cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "[1/4] поднимаю чистый postgres:16-alpine…"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --rm --name "$CONTAINER" \
    -e POSTGRES_USER="$PG_USER" \
    -e POSTGRES_PASSWORD=restore-drill \
    -e POSTGRES_DB="$PG_DB" \
    postgres:16-alpine >/dev/null

for _ in $(seq 1 60); do
    if docker exec "$CONTAINER" pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1; then
        break
    fi
    sleep 1
done
docker exec "$CONTAINER" pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null

echo "[2/4] расшифровываю и восстанавливаю…"
# pg_restore reads the custom-format archive from stdin, so the decrypted dump
# exists only in the pipe. Errors are echoed but not fatal: --clean on a fresh
# database always complains about dropping things that were never there.
age -d -i "$KEYFILE" "$ARCHIVE" \
    | docker exec -i "$CONTAINER" \
        pg_restore -U "$PG_USER" -d "$PG_DB" --clean --if-exists --no-owner \
    || echo "  (pg_restore вернул ненулевой код — смотри сообщения выше; на пустой базе это обычно безобидные DROP-ошибки)"

echo "[3/4] сверка — восстановленная база:"
docker exec -i "$CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -X <<'SQL'
\pset border 2
SELECT (SELECT count(*) FROM users)                       AS users,
       (SELECT count(*) FROM transactions)                AS transactions,
       (SELECT coalesce(sum(balance), 0) FROM users)      AS sum_balance,
       (SELECT count(*) FROM "HandHistory")               AS hands;
SELECT id, user_id, type, amount, created_at
  FROM transactions ORDER BY created_at DESC LIMIT 1;
SQL

ELAPSED=$(( $(date +%s) - START ))
echo
echo "[4/4] то же самое на проде (числа должны совпасть с состоянием НА МОМЕНТ дампа):"
cat <<'EOF'
  ssh root@tgp.isgood.host "cd /opt/tg-poker && docker compose -f docker-compose.prod.yml exec -T postgres \
    psql -U poker -d poker_db -X -c \"SELECT (SELECT count(*) FROM users) users, (SELECT count(*) FROM transactions) transactions, (SELECT coalesce(sum(balance),0) FROM users) sum_balance;\""
EOF
echo
echo "✅ восстановление заняло ${ELAPSED} c — это фактический RTO, запиши его в plans/db-backup-plan.md §5"
