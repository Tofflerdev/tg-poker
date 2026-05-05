---
phase: 01-foundations-design-system
plan: "02"
subsystem: database
tags: [prisma, migration, schema, postgresql]
dependency_graph:
  requires: [01-01]
  provides: [v1_mvp_launch migration, HandHistory schema, AdminAuditLog schema, User session columns]
  affects: [server/db/UserRepository.ts, prisma/schema.prisma]
tech_stack:
  added: []
  patterns: [prisma-migrate-dev, single atomic migration]
key_files:
  created:
    - prisma/migrations/20260415071704_v1_mvp_launch/migration.sql
    - prisma/migrations/migration_lock.toml
  modified:
    - prisma/schema.prisma
    - .env.example
decisions:
  - "Option A (dev DB reset) selected by user — no local test data to preserve; fresh migration from scratch"
  - "telegramId stored as String in HandHistory/AdminAuditLog — no FK to User; lookup-by-string per D-15/D-16"
  - "All 10 v1_mvp_launch User additions remain nullable with no defaults per D-14"
metrics:
  duration: "~20 minutes"
  completed: "2026-04-15"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 4
---

# Phase 01 Plan 02: v1_mvp_launch Schema Migration Summary

Single atomic Prisma migration (`v1_mvp_launch`) produced and applied to a fresh dev PostgreSQL instance. All Phase 3/4/5 schema requirements land in one commit: 10 additive User session/crash-safety columns, HandHistory per-player-row table, AdminAuditLog table with typed core + JSON before/after, and targeted indexes from D-17.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Edit prisma/schema.prisma | 5beca88 | prisma/schema.prisma |
| 2 | Human checkpoint — approve dev DB reset | (checkpoint) | — |
| 3 | Run migrate dev, regenerate client, verify | 3a134cb | prisma/migrations/**, .env.example |

## What Was Built

### Schema Changes (Task 1 — 5beca88)

**User model additions (D-14):** 10 nullable columns appended under `// --- v1_mvp_launch additions ---` comment: `avatarId`, `currentTableId`, `currentSeat`, `currentChips`, `sessionToken`, `disconnectedAt`, `lastSeenAt`, `bannedAt`, `tosAcceptedAt`, `tosVersion`. Plus `@@index([currentTableId])` for Phase 4 boot recovery.

**HandHistory model (D-15):** Per-player-row table; `telegramId` is a plain String (no FK per design). Indexes: `(telegramId, playedAt DESC)` for profile queries, `(playedAt)` for retention job.

**AdminAuditLog model (D-16):** Typed core fields + nullable `beforeJson`/`afterJson` (JSONB). Indexes: `(adminTelegramId, createdAt DESC)` and `(action, createdAt DESC)`.

### Migration (Task 3 — 3a134cb)

- Dev DB reset via `docker compose down -v && docker compose up -d`
- `prisma migrate dev --name v1_mvp_launch` generated `prisma/migrations/20260415071704_v1_mvp_launch/migration.sql`
- Migration applied to fresh `poker_db` in Docker Postgres 16
- `prisma generate` regenerated client (v7.4.2) to `node_modules/@prisma/client`
- `npx tsc --noEmit` passes — all new User columns are optional, no existing code broken
- `.env.example` updated with `ALLOW_DEV_AUTH` documentation line for Plan 05

## Verification Results

- `prisma migrate status` → "Database schema is up to date!" (1 migration applied)
- Migration directory: `prisma/migrations/20260415071704_v1_mvp_launch/migration.sql` (2403 bytes)
- `prisma validate` passes
- `npx tsc --noEmit` passes (0 errors)
- `.env.example` contains `ALLOW_DEV_AUTH`
- All 10 User fields confirmed in schema
- Both `model HandHistory` and `model AdminAuditLog` confirmed in schema

## Decisions Made

1. **Option A (reset) approved** — User confirmed no local test data to preserve; dropped Docker volume and recreated fresh DB for clean single-migration baseline.
2. **No FK links** — HandHistory and AdminAuditLog reference telegramId as plain String per D-15/D-16 design decisions. Admin identity validated at middleware level (Phase 5).
3. **prisma.config.ts required DATABASE_URL env var** — `dotenv` not loading `.env` in worktree; solved by passing `DATABASE_URL` inline for CLI invocations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Missing DATABASE_URL environment variable in worktree**
- **Found during:** Task 3
- **Issue:** The worktree has no `.env` file; `prisma.config.ts` uses `dotenv/config` to load `process.env.DATABASE_URL`, which was undefined, causing `prisma migrate dev` to fail with "The datasource.url property is required".
- **Fix:** Passed `DATABASE_URL="postgresql://poker:poker@localhost:5432/poker_db"` as an inline env var to all Prisma CLI invocations. The connection string matches `.env.example` defaults.
- **Files modified:** None (runtime fix only)
- **Commit:** N/A

**2. [Rule 3 - Blocker] docker-compose / npx not in default PATH**
- **Found during:** Task 3 setup
- **Issue:** Shell PATH in the executor environment did not include Docker or Node.js bin directories.
- **Fix:** Extended PATH to include `/c/Program Files/Docker/Docker/resources/bin` and `/c/nvm4w/nodejs` for all commands.
- **Files modified:** None (runtime fix only)

## Threat Flags

None — no new network endpoints, auth paths, or trust boundary changes introduced. Schema-only plan; all threat mitigations documented in plan's threat model (T-01-02-01 through T-01-02-06) are deferred to their respective implementation phases (Phase 3, 4, 5).

## Known Stubs

None — this plan produces schema and migration artifacts only. No application code was written.

## Self-Check: PASSED

- `prisma/migrations/20260415071704_v1_mvp_launch/migration.sql` — EXISTS
- `prisma/schema.prisma` with all 10 User fields, HandHistory, AdminAuditLog — CONFIRMED
- `.env.example` with `ALLOW_DEV_AUTH` — CONFIRMED
- Commit 5beca88 (schema) — FOUND
- Commit 3a134cb (migration + .env.example) — FOUND
- `npx tsc --noEmit` — PASSES (0 errors)
