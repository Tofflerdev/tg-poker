---
phase: 01-foundations-design-system
plan: "04"
subsystem: server/identity
tags: [resilience, identity, refactor, telegramId, socket-eviction, RESILIENCE-03]
dependency_graph:
  requires: [01-03, 01-05]
  provides: [telegramId-keyed-identity, socket-eviction-scaffold]
  affects:
    - types/index.ts
    - server/Game.ts
    - server/models/Table.ts
    - server/models/User.ts
    - server/TableManager.ts
    - server/index.ts
    - server/middleware/auth.ts
tech_stack:
  added: []
  patterns:
    - telegramId-as-durable-key (Player.id = stringified telegramId)
    - socket.data for per-connection auth context
    - eviction-on-duplicate-session (D-07 scaffold)
    - transport-handle separation (Player.socketId vs Player.id)
key_files:
  created: []
  modified:
    - types/index.ts
    - server/models/User.ts
    - server/TableManager.ts
    - server/Game.ts
    - server/models/Table.ts
    - server/index.ts
    - server/middleware/auth.ts
decisions:
  - Player.id holds telegramId (stringified); Player.socketId holds the mutable transport handle
  - socketToTelegram parallel index deleted entirely — callers read socket.data.telegramId
  - createUserFromInitData socketId param removed (was unused); call site updated
  - Eviction scaffold emits sessionReplaced placeholder; Phase 4 expands to full snapshot+resume
  - Disconnect handler does NOT remove seated players from table (Phase 4 owns grace window)
  - Disconnect guard checks getSocketIdForTelegram === socket.id before clearing to handle race
  - updateTableState / handleTableShowdown resolve socketId via getSocketIdForTelegram per player
metrics:
  duration_minutes: 35
  completed_date: "2026-04-15"
  tasks_completed: 3
  files_changed: 7
requirements: [RESILIENCE-03]
---

# Phase 01 Plan 04: telegramId-as-Durable-Identity Refactor Summary

**One-liner:** Big-bang identity refactor keying all in-memory maps and socket handlers on `telegramId` (string), adding `Player.socketId` transport handle, and scaffolding D-07 eviction for duplicate-session connects.

## Tasks Completed

| # | Name | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Define SocketData type; rekey UserStorage and TableManager by telegramId | 3f4da39 | types/index.ts, server/models/User.ts, server/TableManager.ts |
| 2 | Add Player.socketId transport handle; rekey Game and Table methods to telegramId | dee4030 | types/index.ts, server/Game.ts, server/models/Table.ts |
| 3 | Rewrite index.ts handlers to use socket.data.telegramId; wire eviction scaffold | 03542a3 | server/index.ts, server/middleware/auth.ts |

## What Was Built

### types/index.ts

- `Player.id` comment updated: now explicitly documents that the field holds telegramId (durable key)
- `Player.socketId?: string` added — mutable transport handle, updated on reconnect/disconnect (D-05)
- `Player.telegramId?: number` kept for display/DB use
- New `SocketData` interface exported under section comment `// --- Socket.io socket.data extension (RESILIENCE-03) ---`:
  ```ts
  export interface SocketData { telegramId?: string; }
  ```

### server/models/User.ts

- `users` Map rekeyed from `socketId → TelegramUser` to `telegramId (string) → TelegramUser`
- `socketToTelegram` Map deleted entirely — no replacement; all callers read `socket.data.telegramId`
- `addUser(telegramId, user)`, `getUser(telegramId)`, `removeUser(telegramId)` — signatures updated
- `getProfileBySocket` and `updateBalance(socketId)` removed; `updateBalance` now takes telegramId
- Profile map (`telegramId → UserProfile`) unchanged

### server/TableManager.ts

- `playerToTable` Map rekeyed: `string /* telegramId */ → string /* tableId */`
- Added `private socketByTelegram: Map<string, string>` (D-06)
- Three new public methods:
  - `setSocketForTelegram(telegramId, socketId, onEvict)` — registers socket; invokes `onEvict(prior)` synchronously if a different socket was mapped (D-07)
  - `getSocketIdForTelegram(telegramId)` — live socketId lookup
  - `clearSocketForTelegram(telegramId)` — called on clean disconnect
- All player-facing methods (`joinTable`, `leaveTable`, `getPlayerTable`, `getPlayerTableId`, `spectateTable`, `handleDisconnect`) renamed param from `socketId` to `telegramId`

### server/Game.ts

- `addPlayer` first param renamed `telegramId`; stores it into `player.id`; accepts optional `socketId?: string` param stored into `player.socketId`
- `updatePlayerSocketId(telegramId, newSocketId)` new public method — finds player by `player.id === telegramId` and mutates `player.socketId`
- All callback emission sites already used `String(player.telegramId ?? player.id)` — with `player.id === telegramId` this naturally produces the correct stringified telegramId with no change needed

### server/models/Table.ts

- `playerIds` Set now holds telegramIds (not socketIds)
- All public methods renamed `socketId` → `telegramId`: `addPlayer`, `removePlayer`, `removePlayerMidGame`, `getPlayer`, `getStateForPlayer`, `addSpectator`, `hasPlayer`, `fold`, `check`, `call`, `raise`, `allIn`, `showCards`, `sitOut`, `sitIn`
- `updatePlayerSocketId(telegramId, newSocketId)` pass-through to `game.updatePlayerSocketId`
- `getAllPlayerIds()` now returns telegramIds from `player.id`

### server/index.ts

- `Server<>` generic extended with `SocketData` as 4th type argument (Pitfall 4)
- `createUserFromInitData` call updated (socketId param removed from signature)
- `auth` handler:
  - Populates `socket.data.telegramId = String(user.telegramId)` before any storage call
  - Calls `userStorage.addUser(telegramId, user)`
  - Wires D-07 eviction via `tableManager.setSocketForTelegram(telegramId, socket.id, onEvict)` — prior socket receives `sessionReplaced` event and is `disconnect(true)`'d
  - Refreshes `player.socketId` via `table.updatePlayerSocketId(telegramId, socket.id)` if already seated
- All downstream handlers read `const telegramId = socket.data.telegramId` and emit `authError` + return if unset
- `handleGameAction` uses `telegramId` for all table lookups and game method calls
- `updateTableState` and `handleTableShowdown` resolve socketId via `getSocketIdForTelegram(telegramId)` before `io.to(socketId).emit(...)`
- Chat broadcast also resolves socketId per player telegramId
- `disconnect` handler:
  - Reads `telegramId = socket.data.telegramId`; skips cleanup if unset (unauthenticated socket)
  - Calls `table.updatePlayerSocketId(telegramId, undefined)` to clear transport handle
  - Guards `clearSocketForTelegram` with `getSocketIdForTelegram(telegramId) === socket.id` to prevent race condition
  - Does NOT remove seated players from table (Phase 4 grace window)

### server/middleware/auth.ts

- Removed unused `socketId: string` first parameter from `createUserFromInitData` signature

## Verification Results

- `npx tsc --noEmit` passes with zero errors across all three tasks
- `socketToTelegram` grep returns nothing across all server files
- `socket.id` authority-use check: exactly 3 non-logging references remain (eviction hook `.sockets.get`, transport-handle `updatePlayerSocketId`, disconnect guard `=== socket.id`) — all legitimate
- `socket.data.telegramId =` assignment present in auth handler
- `setSocketForTelegram` wired in auth handler
- `git diff --name-status 78d5e8a HEAD` shows exactly 7 modified files (`M` only) — zero deletions, zero unexpected files

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused `socketId` parameter from `createUserFromInitData`**

- **Found during:** Task 3 verification (structural check flagged it as a non-logging `socket.id` authority use, causing the `<=3` guard to fail with 4 matches)
- **Issue:** `createUserFromInitData(socket.id, validatedData, devId)` passed `socket.id` as first arg. The param was never used inside the function body — legacy from before identity refactor.
- **Fix:** Removed `socketId: string` from `createUserFromInitData` signature in `auth.ts`; updated call site in `index.ts`.
- **Files modified:** `server/middleware/auth.ts`, `server/index.ts`
- **Commit:** `03542a3`

## Known Stubs

- **D-07 eviction payload**: `prior.emit('sessionReplaced')` is a placeholder event with no payload. Phase 4 will expand to `{ reason, snapshot }` including full GameState snapshot for seamless reconnect. File: `server/index.ts`, auth handler eviction callback.

## Threat Flags

No new network endpoints or schema changes introduced. All changes are within the trust boundaries enumerated in the plan's threat model (T-01-04-01 through T-01-04-05):

- T-01-04-01 (Spoofing): Mitigated — all handlers read identity from `socket.data.telegramId` only.
- T-01-04-02 (Split-brain): Mitigated — D-07 eviction scaffold disconnects prior socket.
- T-01-04-03 (Elevation): Mitigated — handlers emit `authError` and return if `telegramId` unset.
- T-01-04-04 (Disconnect race): Mitigated — disconnect guard checks `=== socket.id` before clear.
- T-01-04-05 (Repudiation): Partially mitigated — `updatePlayerSocketId` keeps `Player.socketId` in sync; full snapshot resume deferred to Phase 4.

## Self-Check: PASSED

- `types/index.ts` — modified with `SocketData` interface and `Player.socketId` field
- `server/models/User.ts` — rekeyed by telegramId, `socketToTelegram` removed
- `server/TableManager.ts` — rekeyed by telegramId, three new socket-by-telegram methods
- `server/Game.ts` — `addPlayer` telegramId param, `updatePlayerSocketId` method
- `server/models/Table.ts` — all methods use telegramId, `updatePlayerSocketId` pass-through
- `server/index.ts` — `socket.data.telegramId` as sole identity source, eviction wired
- `server/middleware/auth.ts` — `socketId` param removed from `createUserFromInitData`
- All three task commits verified: `3f4da39`, `dee4030`, `03542a3`
- `npx tsc --noEmit` passes (verified post all commits)
- `git diff --name-status 78d5e8a HEAD` — 7 modified files, zero deletions
