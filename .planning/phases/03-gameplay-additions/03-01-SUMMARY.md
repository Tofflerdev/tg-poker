---
phase: 03-gameplay-additions
plan: "01"
subsystem: server-events
tags: [actionBubble, socket-events, types, vitest, game-callbacks]
dependency_graph:
  requires: ["03-00"]
  provides: ["ActionBubbleEvent type", "ExtendedServerEvents.actionBubble", "actionBubble fan-out listener"]
  affects: ["types/index.ts", "server/index.ts"]
tech_stack:
  added: []
  patterns: ["synchronous fire-and-forget callback (D-09)", "telegramId → socketId fan-out (mirrors updateTableState)"]
key_files:
  created:
    - server/__tests__/actionBubbleBroadcast.test.ts
  modified:
    - types/index.ts
    - server/index.ts
decisions:
  - "ActionBubbleEvent extends PlayerActionEvent with no additional fields (T-3-SCHEMA)"
  - "Fan-out wrapped in try/catch so transport errors never propagate into Game.ts (Risk #6 / D-09)"
  - "setOnHandComplete no-op preserved — owned by Plan 03-02"
metrics:
  duration: "~6 minutes"
  completed: "2026-04-20T16:37:57Z"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 3
---

# Phase 03 Plan 01: actionBubble Server Broadcast Summary

**One-liner:** Synchronous actionBubble fan-out in setOnPlayerAction using telegramId→socketId resolution with try/catch guard, matching PlayerActionEvent shape exactly (no holeCards).

## What Was Built

Wired the `actionBubble` server-broadcast event by replacing the Phase 1 no-op listener in `server/index.ts:setupTableEvents` with a synchronous fan-out body. The listener iterates `table.getAllPlayerIds()`, resolves each socketId via `getSocketId()`, and emits `io.to(sid).emit('actionBubble', evt)` — mirroring the established pattern in `updateTableState`.

## Listener Body (verbatim — for downstream plan reference)

```ts
table.setOnPlayerAction((evt) => {
  // Phase 3 / Plan 03-01 (D-01, D-09): synchronous fan-out of actionBubble to
  // every authenticated socket at this table. Mirrors updateTableState's
  // telegramId → socketId resolution. Wrapped in try/catch so a transport
  // hiccup never propagates back into Game.ts (T-3-SCHEMA / Risk #6).
  try {
    const playerIds = table.getAllPlayerIds(); // telegramIds
    playerIds.forEach((telegramId) => {
      const sid = getSocketId(telegramId);
      if (sid) {
        io.to(sid).emit('actionBubble', evt);
      }
    });
  } catch (err) {
    console.error('[ActionBubble] broadcast error:', err);
  }
});
```

## setOnHandComplete Status

`setOnHandComplete` at `server/index.ts:157` is **unchanged** — still the Phase 1 no-op:

```ts
table.setOnHandComplete((_evt) => {
  // Phase 1: no-op. Phase 3 queues HandHistory writes; Phase 3 checkpoints chips.
});
```

Plan 03-02 owns this change.

## GAME-01 Regression Check

```
grep -n "Table #\|table-phase\|pot-label" client/src/pages/GameRoom.tsx
```

Result: **zero matches** — Phase 2 already removed the redundant top-left table/phase label and top-right pot label. No regression introduced by this plan.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add ActionBubbleEvent type + ExtendedServerEvents.actionBubble | b04cd56 | types/index.ts |
| 2 | Replace no-op onPlayerAction with actionBubble fan-out + unit tests | c700bb1 | server/index.ts, server/__tests__/actionBubbleBroadcast.test.ts |

## Test Results

```
✓ server/__tests__/actionBubbleBroadcast.test.ts (4 tests) 7ms
  Test Files  1 passed (1)
        Tests  4 passed (4)
```

Test cases:
1. Emits `actionBubble` once per resolved socketId at the table
2. Skips telegramIds with no live socket (silent skip)
3. Emits the exact input payload without mutation (reference equality + key-set assertion — T-3-SCHEMA)
4. Swallows `getSocketId` exceptions without throwing (try/catch guard)

## Threat Mitigations Applied

| Threat ID | Status |
|-----------|--------|
| T-3-SCHEMA-01 | Mitigated — `ActionBubbleEvent extends PlayerActionEvent {}` with no extra fields; test asserts exact key set |
| T-3-AUTHZ-01 | Mitigated — listener registered per-table closure; `getAllPlayerIds()` only returns this table's members |
| T-3-DOS-01 | Mitigated — try/catch wraps entire fan-out body; test 4 enforces exception swallowing |
| T-3-PRIVACY-01 | Accepted — action + amount are PUBLIC info already on `state` events |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — this plan adds no client-facing UI. The client-side bubble renderer lands in Plan 03-04.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced.

## Self-Check: PASSED

- [x] `types/index.ts` contains `export interface ActionBubbleEvent extends PlayerActionEvent {}`
- [x] `types/index.ts` contains `actionBubble: (evt: ActionBubbleEvent) => void;` in `ExtendedServerEvents`
- [x] `server/index.ts` fan-out body present with `io.to(sid).emit('actionBubble', evt)`
- [x] `server/__tests__/actionBubbleBroadcast.test.ts` exists with 4 test cases
- [x] `npx tsc --noEmit -p tsconfig.json` exits 0
- [x] `npx vitest run --config vitest.config.server.ts server/__tests__/actionBubbleBroadcast.test.ts` exits 0 — 4 passed
- [x] `setOnHandComplete` no-op unchanged at server/index.ts:157
- [x] GAME-01 regression check: zero matches for redundant labels in GameRoom.tsx
- [x] Commits b04cd56 and c700bb1 exist in git log
