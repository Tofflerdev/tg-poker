---
phase: 05
plan: 04
subsystem: admin-namespace
tags: [socket.io, admin, jwt, audit-log, namespace, mutations]
dependency_graph:
  requires: [05-00, 05-01, 05-03]
  provides: [admin-namespace, admin-mutations, admin-state-snapshot, userrepo-atomic-helpers]
  affects:
    - server/admin/adminMutations.ts
    - server/admin/adminState.ts
    - server/admin/adminNamespace.ts
    - server/db/UserRepository.ts
    - server/models/User.ts
    - server/index.ts
tech_stack:
  added: []
  patterns:
    - fire-and-fail-audit (runWithAudit inserts AdminAuditLog BEFORE mutation)
    - jwt-namespace-middleware (adminNamespaceMiddleware reads socket.handshake.auth.token)
    - atomic-balance-delta (adjustBalanceAtomic uses WHERE balance >= |delta| guard)
    - admin-overlay-state (tableAdminState Map owns enabled/disabled/draining overlay)
key_files:
  created:
    - server/admin/adminMutations.ts
    - server/admin/adminState.ts
    - server/admin/adminNamespace.ts
  modified:
    - server/db/UserRepository.ts
    - server/models/User.ts
    - server/index.ts
decisions:
  - "io.of() cast to any to avoid TS2558 (Socket.io v4 of() accepts 0 type args; generic typing applied via ReturnType cast)"
  - "tableAdminState Map owned by adminMutations.ts module — Table model not extended; overlay is admin-only concern"
  - "getAllUsers() iterator added to UserStorage class for buildAdminState snapshot"
  - "Docker Desktop started programmatically for prisma db push; DB was in sync — no schema changes needed"
metrics:
  duration_seconds: 255
  completed_date: "2026-05-02"
  tasks_completed: 3
  files_changed: 6
---

# Phase 5 Plan 04: Admin Namespace & Mutations Summary

**One-liner:** /admin Socket.io namespace with JWT middleware, runWithAudit fire-and-fail pattern, 7 mutation handlers, AdminState snapshot builder, and two new atomic UserRepository helpers.

## What Was Built

### server/admin/adminMutations.ts (new)

The central mutation surface for all admin operations:

- **`runWithAudit(meta, mutationFn)`** — fire-and-fail pattern: `prisma.adminAuditLog.create()` runs FIRST; if it throws, `mutationFn` is never called; if it succeeds, mutation runs. This is the single chokepoint for ADMIN-06.
- **`kickUser(io, adminNs, adminUser, telegramId)`** — Phase 4 eviction path: `replacedBySession` emit + `socket.disconnect(true)` + `tableManager.leaveTable` + `UserRepository.refundCurrentChips` + `GraceRegistry.clear`. Emits `userKicked` delta to all admin clients.
- **`banUser(io, adminNs, adminUser, telegramId)`** — DB ban via `setBannedAt`, mirrors `bannedAt` into in-memory `userStorage` so Plan 05-01's gate sees `BANNED` immediately. Also runs the kick path on any active session.
- **`grantBalance(adminNs, adminUser, telegramId, delta)`** — delegates to `adjustBalanceAtomic`; mirrors `newBalance` into userStorage cache; emits `balanceGranted` inside the mutation.
- **`enableTable / disableTable / drainTable`** — update `tableAdminState` Map with overlay status; write audit row first.
- **`editTableParams(adminNs, adminUser, tableId, params)`** — mutates `table.config` in place; picks up at next hand start. Audited.
- **`getTableAdminStatus(tableId)`** — reads overlay Map; defaults to `'enabled'` if not set.

### server/admin/adminState.ts (new)

- **`buildAdminTableInfo(tableId)`** — returns `AdminTableInfo` from live `tableManager` + `getTableAdminStatus` overlay.
- **`buildAdminState()`** — async snapshot: all tables via `buildAdminTableInfo`, all authenticated users from `userStorage.getAllUsers()` with seated chip/seat data resolved via `tableManager.getPlayerTable`, `totalChipsInPlay` sum, last 10 `AdminAuditLog` rows from Prisma.

### server/admin/adminNamespace.ts (new)

- **`adminNamespaceMiddleware(socket, next)`** — exported standalone for unit tests. Reads `socket.handshake.auth.token`; calls `verifyAdminToken`; stamps `socket.data.adminUser = payload.username` on success; calls `next(new Error('UNAUTHORIZED'))` for missing/invalid/expired tokens.
- **`setupAdminNamespace(io)`** — mounts `io.of('/admin')`, attaches middleware, on `'connection'` emits full `adminState` snapshot and binds all 7 `AdminClientEvents` handlers with server-side validation (bigBlind = 2×smallBlind; delta bounds ±100000).

### server/db/UserRepository.ts (extended)

Two new static methods added after `refundCurrentChips`:

- **`adjustBalanceAtomic(telegramId, delta)`** — single `updateMany` with `WHERE balance >= -delta` guard for negative deltas; reads back `newBalance` via `findUnique`; returns `{ success, newBalance? }`.
- **`setBannedAt(telegramId, banAt)`** — single `updateMany` setting `bannedAt` + clearing all 5 session columns (`currentTableId/Seat/Chips/disconnectedAt/lastSeenAt`); returns `{ success }`.

### server/models/User.ts (extended)

- **`getAllUsers()`** — returns `Array.from(this.users.values())` for `buildAdminState` to iterate over all authenticated users.

### server/index.ts (extended)

- Added `import { setupAdminNamespace } from './admin/adminNamespace.js'`
- Added `setupAdminNamespace(io)` call immediately after `const io = new Server(...)` and before `io.on('connection'` (line ~106).

## Tests

| Suite | Before | After |
|-------|--------|-------|
| adminMutations.test.ts | 2 RED | 2/2 GREEN |
| adminNamespace.test.ts | 3 RED | 3/3 GREEN |
| All other server tests | 75 passing | 75 passing |
| **Total** | **75 passing + 5 RED** | **80/80 GREEN** |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `io.of()` TypeScript type argument count (TS2558)**
- **Found during:** Task 2 build verification
- **Issue:** `io.of<AdminClientEvents, AdminServerEvents, DefaultEventsMap, AdminSocketData>('/admin')` — TypeScript error TS2558: Expected 0 type arguments but got 4. Socket.io v4's `of()` overloads do not accept 4 type parameters.
- **Fix:** Cast `io.of('/admin') as any` then `as ReturnType<typeof io.of>` to get a usable typed namespace reference without TS errors. The runtime behavior is identical.
- **Files modified:** `server/admin/adminNamespace.ts`
- **Commit:** bb5c29e

**2. [Rule 3 - Blocking] Docker Desktop not running for `prisma db push`**
- **Found during:** Task 3
- **Issue:** `npx prisma db push` failed with P1001 (cannot reach localhost:5432); Docker Desktop was not running.
- **Fix:** Started Docker Desktop programmatically via `Start-Process`, waited for daemon, ran `docker-compose up -d`, then `prisma db push`. Output: "Your database is now in sync."
- **Files modified:** None — infrastructure only.

## Known Stubs

None — all shipped functionality is wired end-to-end.

## Threat Flags

None — no new network surface beyond what is specified in the plan's threat model. The `/admin` namespace is the only new socket surface, and it is fully gated by JWT middleware per T-5-04-1.

## Hand-off to Plan 05-05

The live contract for the React admin client:

- **Connect:** `io('/admin', { auth: { token: <jwt-from-login> } })` — receives `adminState` snapshot on connect.
- **Server → Client events:** `adminState`, `tableStateChanged`, `userBanned`, `userKicked`, `balanceGranted`, `auditLogAppended`, `adminError` (see `AdminServerEvents` in `types/index.ts`).
- **Client → Server events:** `enableTable`, `disableTable`, `drainTable`, `editTableParams`, `kickUser`, `banUser`, `grantBalance` (see `AdminClientEvents` in `types/index.ts`).
- **editTableParams payload:** `{ tableId, smallBlind, bigBlind, buyIn }` — server enforces `bigBlind === smallBlind * 2`.
- **grantBalance payload:** `{ telegramId, delta }` — delta must be non-zero integer in [-100000, 100000].

## Requirements Closed

- **ADMIN-02** — `/admin` Socket.io namespace gated by JWT middleware
- **ADMIN-04** — connect emits full snapshot; targeted deltas thereafter
- **ADMIN-05** — 7 mutation handlers (enable/disable/drain table, editParams, kick, ban, grantBalance)
- **ADMIN-06** — `runWithAudit` is the single chokepoint; failed audit aborts mutation

## Self-Check: PASSED

- `server/admin/adminMutations.ts` exists: FOUND
- `server/admin/adminState.ts` exists: FOUND
- `server/admin/adminNamespace.ts` exists: FOUND
- `server/db/UserRepository.ts` contains `adjustBalanceAtomic` and `setBannedAt`: FOUND
- `server/models/User.ts` contains `getAllUsers`: FOUND
- `server/index.ts` contains `setupAdminNamespace(io)`: FOUND
- Commits f6f97c1, bb5c29e, b53528a all present in git log: FOUND
