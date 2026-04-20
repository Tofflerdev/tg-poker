---
phase: 03-gameplay-additions
plan: 02
subsystem: server-persistence
tags: [hand-history, async-queue, chip-checkpoint, retention, sigterm, tdd]
dependency_graph:
  requires: ["03-00"]
  provides: ["HandHistoryQueue", "HandHistoryRepository", "checkpointSeatedPlayers", "UserRepository.checkpointSeat"]
  affects: ["03-03", "04-resilience"]
tech_stack:
  added: []
  patterns:
    - "In-process batched write queue with splice-before-write atomicity"
    - "Retry with exponential backoff then drop (bounded buffer under DB outage)"
    - "Boot-time setTimeout(0) for immediate sweep, setInterval registered inside callback for test isolation"
    - "Promise.all fan-out for per-seat chip checkpoints (independent rows)"
    - "Fire-and-forget async IIFE in synchronous Game.ts callback"
key_files:
  created:
    - server/HandHistoryQueue.ts
    - server/db/HandHistoryRepository.ts
    - server/checkpointSeatedPlayers.ts
    - server/__tests__/HandHistoryQueue.test.ts
    - server/__tests__/checkpointSeatedPlayers.test.ts
    - server/__tests__/handHistoryRetention.test.ts
  modified:
    - server/db/UserRepository.ts
    - server/index.ts
decisions:
  - "Boot-time retention sweep uses setTimeout(0) with setInterval registered inside the callback — ensures fake-timer tests using runOnlyPendingTimersAsync see exactly one pending timer at a time (deviation from plan's void runRetentionSweep() approach; semantically equivalent in production)"
  - "retentionBootTimer tracked separately from retentionTimer to enable __resetForTests to cancel both; idempotency guard checks either non-null"
metrics:
  duration: "~25 minutes"
  completed_at: "2026-04-20T16:45:29Z"
  tasks_completed: 3
  tasks_total: 3
  files_created: 6
  files_modified: 2
requirements_addressed: [PROFILE-02, PROFILE-04, RESILIENCE-02]
---

# Phase 03 Plan 02: Hand-History Write Pipeline + Chip Checkpoint Summary

**One-liner:** In-process batched HandHistory queue (1s/50-row flush, 3x retry+drop) with a separate awaited chip-checkpoint path and 90-day retention sweep, all wired to the `onHandComplete` callback.

## What Was Built

### Task 1 — HandHistoryQueue + HandHistoryRepository + retention job

`server/db/HandHistoryRepository.ts` — Prisma CRUD layer:
- `createMany(rows)` with `skipDuplicates: true` defends against retry double-insertion
- `deleteOlderThan(cutoff)` for the retention sweep
- `toWriteRow(evt, p)` converts a `HandCompleteEvent` + `HandCompletePerPlayer` to a write row (privacy filter deferred to read time per D-18 / Plan 03-03)

`server/HandHistoryQueue.ts` — singleton in-process queue:
- `enqueue(row)` adds to buffer; triggers immediate `flush()` at threshold=50
- `startFlushTimer()` schedules 1-second `setInterval` flush (idempotent)
- `flush()` splices buffer BEFORE writing (splice-before-write prevents unbounded growth under DB outage)
- `flushWithRetry()` retries with 100ms → 500ms backoff, drops after 3 attempts with `console.error`
- `startRetentionJob()` schedules boot sweep + 24h recurring sweep (idempotent)
- `shutdown()` clears flush timer and drains remaining buffer
- `__resetForTests()` / `__getInternalsForTests()` for test isolation

### Task 2 — UserRepository.checkpointSeat + checkpointSeatedPlayers

`server/db/UserRepository.ts` — added `checkpointSeat(telegramId: string, data)`:
- Writes exactly `{currentChips, currentTableId, currentSeat}` — no ephemeral state (D-17)
- BigInt conversion via `BigInt(Number(telegramId))` matches existing pattern

`server/checkpointSeatedPlayers.ts`:
- `checkpointSeatedPlayers(evt)` fans out `Promise.all` across all `perPlayer` entries
- Rejects if any seat update rejects (caller in index.ts wraps in try/catch)

### Task 3 — Wire index.ts

`server/index.ts`:
- Three new imports at top (HandHistoryQueue, HandHistoryRepository, checkpointSeatedPlayers)
- `setOnHandComplete` no-op replaced with async IIFE: enqueues history rows then awaits chip checkpoint
- Boot `setTimeout` block extended to call `startFlushTimer()` + `startRetentionJob()`
- SIGTERM handler added for graceful drain

## Test Results

```
server/__tests__/HandHistoryQueue.test.ts       6 passed
server/__tests__/handHistoryRetention.test.ts   4 passed
server/__tests__/checkpointSeatedPlayers.test.ts 4 passed
server/__tests__/actionBubbleBroadcast.test.ts  4 passed  (regression)
Total: 18 passed, 0 failed
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Boot-time retention sweep timer sequencing**
- **Found during:** Task 1 test verification
- **Issue:** Plan spec used `void runRetentionSweep()` directly (not timer-based) followed by `setInterval`. Vitest's `runOnlyPendingTimersAsync()` treats all registered timers as pending regardless of delay, causing both the `setInterval`'s first tick AND the immediate sweep to fire — resulting in 2 calls where tests expected 1.
- **Fix:** Changed boot sweep to `retentionBootTimer = setTimeout(() => { ...; retentionTimer = setInterval(...) }, 0)`. The `setInterval` is registered inside the callback, so only one timer is pending when `runOnlyPendingTimersAsync` is called. Production behavior is identical (0ms delay fires immediately). Added `retentionBootTimer` module variable tracked by `__resetForTests`.
- **Files modified:** `server/HandHistoryQueue.ts`
- **Commits:** `b650a0f`

## Known Stubs

None — all plan goals achieved. HandHistory write path is live on every `onHandComplete` event. Chip checkpoint writes to DB. Reader path (Plan 03-03) will add `findForUser` to `HandHistoryRepository`.

## Threat Flags

None — no new network endpoints, auth paths, or file access patterns introduced. The `onHandComplete` listener runs server-side only and the HandHistory schema was already in the DB from Phase 2.

## Self-Check: PASSED

All 9 artifacts found on disk. All 3 task commits verified in git log.

| Check | Result |
|-------|--------|
| server/HandHistoryQueue.ts | FOUND |
| server/db/HandHistoryRepository.ts | FOUND |
| server/checkpointSeatedPlayers.ts | FOUND |
| server/__tests__/HandHistoryQueue.test.ts | FOUND |
| server/__tests__/checkpointSeatedPlayers.test.ts | FOUND |
| server/__tests__/handHistoryRetention.test.ts | FOUND |
| Commit b650a0f (Task 1) | FOUND |
| Commit e8ba560 (Task 2) | FOUND |
| Commit 4010ae7 (Task 3) | FOUND |
