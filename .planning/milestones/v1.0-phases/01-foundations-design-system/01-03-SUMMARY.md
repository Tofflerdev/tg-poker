---
phase: 01-foundations-design-system
plan: 03
subsystem: server/game-engine
tags: [game-engine, callbacks, events, typescript, GAME-04]
dependency_graph:
  requires: [01-01, 01-02]
  provides: [callback-seams-GAME-04]
  affects: [server/Game.ts, server/models/Table.ts, server/TableManager.ts, server/index.ts, types/index.ts]
tech_stack:
  added: [crypto.randomUUID]
  patterns: [fire-and-forget callback seams, null-checked optional chaining]
key_files:
  created: []
  modified:
    - types/index.ts
    - server/Game.ts
    - server/models/Table.ts
    - server/TableManager.ts
    - server/index.ts
decisions:
  - Game constructor accepts optional tableId string (default '') so existing callers without tableId still compile
  - telegramId field in event uses String(player.telegramId ?? player.id) until Plan 04 key-by-telegramId refactor
  - onHandComplete emits before onShowdown in win-by-fold branch to preserve existing broadcast order
  - currentHandId set to null immediately after onHandComplete emission to guard against double-fire
  - handStartChips snapshot taken before reset() so blind-poster chip values are captured correctly
metrics:
  duration_minutes: 25
  completed_date: "2026-04-15"
  tasks_completed: 3
  files_changed: 5
---

# Phase 01 Plan 03: Game Callback Seams Summary

**One-liner:** Server-internal `onPlayerAction` / `onHandComplete` callback seams wired into Game.ts with `crypto.randomUUID` hand IDs and locked D-10/D-11 payload shapes; Phase 1 consumers are no-ops.

## Tasks Completed

| # | Name | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Define callback payload types in types/index.ts | feaca9f | types/index.ts |
| 2 | Add setters, handId, and emission sites to Game.ts | f9ba2f0 | server/Game.ts |
| 3 | Wire callbacks in Table.ts and register no-op consumers in index.ts | 600100e | server/models/Table.ts, server/TableManager.ts, server/index.ts |

## What Was Built

### types/index.ts
Four new exported types under section comment `// --- Phase 1 Game callback contracts (GAME-04, D-10/D-11) ---`:
- `PlayerActionKind` — union `'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin'`
- `PlayerActionEvent` — per-action event with tableId, telegramId, seat, action, amount, totalBetThisStreet, potAfter
- `HandCompletePerPlayer` — per-player summary including holeCards (server-internal only), netDelta, won, showedDown
- `HandCompleteEvent` — hand-level summary with handId, tableId, completedAt, board, perPlayer array

### server/Game.ts
- Added `private tableId: string` field with constructor `Game(tableId = '')`
- Added `crypto` import and `PlayerActionEvent / HandCompleteEvent / PlayerActionKind` type imports
- Added four private fields: `onPlayerAction`, `onHandComplete`, `currentHandId`, `handStartChips`
- `startNextHand()`: generates `crypto.randomUUID()` into `currentHandId`, snapshots `handStartChips` before `reset()`
- `fold()`, `check()`, `call()`, `raise()`, `allIn()`: each fires `this.onPlayerAction?.(evt)` with correct action kind and delta amount before `nextPlayer()`
- `nextStage()` win-by-fold branch: fires `onHandComplete` then clears `currentHandId`, then calls `onShowdown`
- `showdown()`: fires `onHandComplete` then clears `currentHandId` before returning `lastShowdown`
- Added `setOnPlayerAction(cb)` and `setOnHandComplete(cb)` public setters

### server/models/Table.ts
- Constructor now calls `new Game(id)` passing the table's own id
- Added `PlayerActionEvent` and `HandCompleteEvent` to type import
- Added `setOnPlayerAction(cb)` and `setOnHandComplete(cb)` pass-through methods delegating to `this.game`

### server/TableManager.ts
- Added `getAllTables(): Table[]` method returning `Array.from(this.tables.values())`

### server/index.ts
- `setupTableEvents()` now registers both no-op callbacks via `table.setOnPlayerAction` and `table.setOnHandComplete`
- Comments in the no-op bodies document Phase 3 replacement intent

## Verification Results

- `npx tsc --noEmit` passes with zero errors
- Grep confirms exactly 5 `this.onPlayerAction?.(` call sites in Game.ts
- Grep confirms exactly 2 `this.onHandComplete?.(` call sites in Game.ts
- `crypto.randomUUID` invoked inside `startNextHand`
- `server/index.ts` registers both callbacks on every table via `setupTableEvents`
- `git diff --name-status f3fca23 HEAD` shows exactly 5 modified files matching the plan's `files_modified` list — no deletions

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — this plan adds server-internal callback infrastructure only. No UI or data-flow stubs.

## Threat Flags

No new network endpoints, auth paths, file access patterns, or schema changes introduced. All changes are server-internal synchronous callbacks. The `HandCompleteEvent.perPlayer.holeCards` field is documented as server-internal (never broadcast raw) per T-01-03-02 mitigation.

## Self-Check: PASSED

- `server/Game.ts` — modified and committed at f9ba2f0
- `server/models/Table.ts` — modified and committed at 600100e
- `server/TableManager.ts` — modified and committed at 600100e
- `server/index.ts` — modified and committed at 600100e
- `types/index.ts` — modified and committed at feaca9f
- All three commits verified in `git log --oneline gsd/01-03-exec`
- `tsc --noEmit` passes (verified post-commit)
