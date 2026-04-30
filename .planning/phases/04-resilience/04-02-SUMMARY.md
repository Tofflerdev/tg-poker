---
phase: 04-resilience
plan: 02
subsystem: resilience
tags: [grace-timer, singleton-as-module, state-machine, disconnect-resume, sit-out, refund, race-safety]

# Dependency graph
requires:
  - phase: 04-resilience
    provides: Wave-0 RED test contract for GraceRegistry (server/__tests__/GraceRegistry.test.ts, 10 cases) — Plan 04-00
  - phase: 04-resilience
    provides: UserRepository.refundCurrentChips atomic helper — Plan 04-01
provides:
  - GraceRegistry.arm(telegramId, stage, tableId) — start mid-hand 30s OR between-hands 120s timer; idempotent (clears prior timer first)
  - GraceRegistry.clear(telegramId) — cancel timer + delete registry entry; idempotent (no-op if absent)
  - GraceRegistry.getStage(telegramId) — read-only stage lookup for disconnect-handler logging
  - GraceRegistry.reArmIfMidHand(telegramId) — hand-end hook that swaps mid-hand → between-hands (Pitfall 1 fix); no-op when absent or already between-hands
  - Mid-hand expiry → tableManager.getPlayerTable(tid).sitOut(tid) + prisma.user.update({disconnectedAt: null}); KEEPS chips/seat/tableId (RESILIENCE-02 invariant)
  - Between-hands expiry → tableManager.leaveTable(tid) + UserRepository.refundCurrentChips(tid)
  - Test seams __resetForTests / __getInternalsForTests modeled on HandHistoryQueue
affects: [04-resilience]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Singleton-as-module grace-timer registry: module-level Map<telegramId, GraceEntry>, named-export public API, __resetForTests cancels all timers and clears the Map (mirrors server/HandHistoryQueue.ts pattern)"
    - "Idempotent arm(): clear() called as the first statement inside arm() before scheduling the new timer — prevents handle leak under churn (Pitfall 4 / Assumption A4)"
    - "Race-safe expiry: onExpire deletes registry entry FIRST, then re-checks tableManager.getPlayerTable(tid); undefined → no-op return (Pitfall 6 — onExpire never recreates state)"
    - "Hand-end re-arm hook: reArmIfMidHand() ONLY transitions mid-hand → between-hands; no-op for absent or already-between-hands entries — preserves seat across hand boundary (Pitfall 1 fix)"

key-files:
  created:
    - server/GraceRegistry.ts
  modified: []

key-decisions:
  - "Pattern locked from RESEARCH §Pattern 1: singleton-as-module with module-level registry Map and __resetForTests / __getInternalsForTests test seams — mirrors HandHistoryQueue.ts (Phase 3) verbatim so the project has one consistent shape for stateful test-friendly modules"
  - "Constants D-B2 verbatim: MID_HAND_GRACE_MS = 30_000, BETWEEN_HANDS_GRACE_MS = 120_000 — mid-hand short to free the seat for the next hand if a player vanishes; between-hands long because the engine isn't waiting on the player and the cost of a wrongful vacate is high"
  - "Mid-hand expiry NEVER touches chips (RESILIENCE-02): only sets sittingOut on the seat (in-memory engine state) and clears disconnectedAt in DB. currentChips/currentTableId/currentSeat persist so the player can reclaim the seat via sitIn after a longer reconnect"
  - "Between-hands expiry routes through UserRepository.refundCurrentChips (Plan 04-01) — single source of truth for chip refunds; the IS-NOT-NULL idempotency guard makes it safe to race with a concurrent boot-recovery sweep or client-driven leaveTable"
  - "reArmIfMidHand semantics chosen over a generic re-arm: explicit no-op for absent or already-between-hands entries means the hand-end listener (Plan 04-06) can iterate every still-disconnected seated player without per-player conditionals — the registry itself is the gate"
  - "onExpire deletes the registry entry FIRST (synchronously), then performs side effects — guarantees that even if sitOut/leaveTable somehow re-trigger arm via a callback chain, the new entry is the one that wins, not the expired one"

patterns-established:
  - "Singleton-as-module grace timer: module-level Map keyed by validated telegramId, named-export public API + clear-first idempotency in arm() — bounded memory (max ~36 simultaneous-disconnected players across 6 tables, T-04-B1)"
  - "Race-safe one-shot expiry: delete-from-map-first + re-read-collaborator-state pattern — onExpire never assumes the world is unchanged since arm() (Pitfall 6 / T-04-B3)"
  - "Hand-boundary re-arm hook: external listener (setOnHandComplete) calls reArmIfMidHand which is itself a no-op for non-applicable states — the called-into module owns the state-transition logic, the caller just enumerates"

requirements-completed: [RESILIENCE-02, RESILIENCE-05]

# Metrics
duration: 2min
completed: 2026-04-29
---

# Phase 04 Plan 02: GraceRegistry Singleton-as-Module Summary

**Created `server/GraceRegistry.ts` — a singleton-as-module grace-timer state machine that owns the 30s mid-hand / 120s between-hands disconnect window, modeled on Phase 3's `HandHistoryQueue.ts`. Mid-hand expiry calls `sitOut` and clears `disconnectedAt` (chips/seat preserved per RESILIENCE-02); between-hands expiry calls `leaveTable` + `UserRepository.refundCurrentChips` from Plan 04-01. All 10 RED tests in `server/__tests__/GraceRegistry.test.ts` now GREEN; full server suite advances 49 → 59 passing tests with zero regression.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-29T19:35:31Z
- **Completed:** 2026-04-29T19:36:56Z
- **Tasks:** 1
- **Files created:** 1 (server/GraceRegistry.ts; 134 lines)
- **Files modified:** 0

## Public API Surface

```ts
export type GraceStage = 'mid-hand' | 'between-hands';

// Start (or replace) the grace timer. Idempotent — calls clear() first.
export function arm(telegramId: string, stage: GraceStage, tableId: string): void;

// Cancel and remove. Idempotent — no-op if not armed.
export function clear(telegramId: string): void;

// Read-only stage lookup; undefined when not armed.
export function getStage(telegramId: string): GraceStage | undefined;

// Hand-end hook: swap mid-hand → between-hands; no-op on absent or already-between-hands.
export function reArmIfMidHand(telegramId: string): void;

// Test-only seams.
export function __resetForTests(): void;
export function __getInternalsForTests(): { registry: Map<string, GraceEntry> };
```

## Grace Constants (D-B2 verbatim)

```ts
const MID_HAND_GRACE_MS = 30_000;        // 30s — short window mid-hand: engine is waiting on this player's turn (auto-fold ALREADY happens via Game.TURN_TIME_LIMIT, so the grace timer is purely about whether we vacate the seat or just sitOut)
const BETWEEN_HANDS_GRACE_MS = 120_000;  // 120s — long window between hands: no engine pressure, cost of wrongful vacate is high (chip refund + seat loss)
```

## How re-arm-on-hand-end Works (Pitfall 1 Fix)

The original concern: a player disconnects mid-hand → `arm(tid, 'mid-hand', table)` starts a 30s timer. If the hand finishes (e.g., 18s later) BEFORE the timer fires, we don't want to vacate the player at the 30s mark just because they were disconnected during a hand that has now ended — they should get the full between-hands grace from THIS moment forward.

The fix: at the end of every hand, the `setOnHandComplete` listener (Plan 04-06) iterates every still-disconnected seated player and calls `reArmIfMidHand(tid)`. The registry-internal logic:

1. No entry → no-op (player isn't in grace; nothing to do).
2. Entry stage `'between-hands'` → no-op (already counted as between-hands; resetting the clock would unfairly extend their window every hand boundary).
3. Entry stage `'mid-hand'` → call `arm(tid, 'between-hands', entry.tableId)`. The internal `clear()` cancels the 30s timer; a fresh 120s timer is scheduled.

`tableId` is preserved from the original `arm()` call — the entry carries it forward so the listener doesn't need to know which table the player is at.

## RESILIENCE-02 Confirmation: Mid-hand Expiry Never Touches Chips

**`grep -c "currentChips" server/GraceRegistry.ts` → 0** ✓

The mid-hand `onExpire` branch performs exactly two side effects:

```ts
seatedTable.sitOut(telegramId);                                 // in-memory engine state
await prisma.user.update({                                      // DB: ONLY disconnectedAt
  where: { telegramId: BigInt(Number(telegramId)) },
  data: { disconnectedAt: null }
});
```

`currentChips`, `currentTableId`, `currentSeat` are NEVER written in this branch — the player can reclaim their seat via `sitIn` once they return. The only place chips move is the between-hands branch, which delegates to `UserRepository.refundCurrentChips(tid)` (Plan 04-01) — the project's single chip-refund codepath.

## Race Safety (T-04-B3)

`onExpire` is robust against the reconnect-during-fire race:

1. `setTimeout` fires → enters `onExpire`.
2. Synchronously deletes the registry entry (`registry.delete(telegramId)`).
3. Re-reads the world via `tableManager.getPlayerTable(tid)`. If the player already left (admin kick, another tab triggered `leaveTable`, or `clear()` ran between fire and run), this returns `undefined` → early return, no side effects.

If `clear()` ran BEFORE the timer fired, `clearTimeout` cancelled the handle and `onExpire` never runs at all. The two paths are mutually exclusive.

## Test Count: 10 GREEN

All 10 cases in `server/__tests__/GraceRegistry.test.ts` now PASS:

| # | Case | What it covers |
|---|------|----------------|
| 1 | `arm() with stage=mid-hand sets a 30000 ms timer (D-B2)` | Constant binding |
| 2 | `arm() with stage=between-hands sets a 120000 ms timer (D-B2)` | Constant binding |
| 3 | `clear() cancels timer and removes registry entry` | Public clear() |
| 4 | `arm() called twice replaces the prior timer (idempotent re-arm)` | Pitfall 4 (no leak) |
| 5 | `reArmIfMidHand() swaps mid-hand entry to between-hands keeping same tableId (D-B2 hand-end re-arm)` | Pitfall 1 fix |
| 6 | `reArmIfMidHand() is a no-op when entry stage is already between-hands` | reArm semantics |
| 7 | `reArmIfMidHand() is a no-op when no entry exists` | reArm semantics |
| 8 | `mid-hand expiry calls table.sitOut(tid) and clears disconnectedAt (D-B3)` | Mid-hand routing + RESILIENCE-02 invariant |
| 9 | `between-hands expiry calls leaveTable + refundCurrentChips (D-B3)` | Between-hands routing |
| 10 | `expiry is a no-op when player already left table (getPlayerTable returns undefined)` | Pitfall 6 / T-04-B3 race safety |

## Pre/Post Test Counts

| State | Server suite | GraceRegistry.test.ts |
|-------|--------------|------------------------|
| Pre (after 04-01) | 49/49 passing (3 RED files, all expected scaffolds) | 0/10 RED (`Cannot find module '../GraceRegistry.js'`) |
| Post (this plan) | **59/59 passing** (1 RED file remaining: `SessionRecovery.test.ts` for Plan 04-04, expected) | **10/10 GREEN** |

Net delta: +10 GREEN cases, exactly matching the 10 GraceRegistry tests turning. Zero regression in pre-existing tests.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create GraceRegistry singleton-as-module with arm/clear/getStage/reArmIfMidHand/expiry routing** — `bc0b330` (feat)

**Plan metadata:** _(this SUMMARY + STATE.md + ROADMAP.md + REQUIREMENTS.md final commit follows)_

## Files Created/Modified

- `server/GraceRegistry.ts` — created, 134 lines. Six named exports (arm, clear, getStage, reArmIfMidHand, __resetForTests, __getInternalsForTests), one private helper `onExpire`, two const grace windows. Imports `tableManager` from `./TableManager.js`, `UserRepository` from `./db/UserRepository.js`, default `prisma` from `./db/prisma.js` — wired for runtime; mocked in tests.

## Decisions Made

- **Singleton-as-module locked verbatim from RESEARCH §Pattern 1.** The `Map<telegramId, GraceEntry>` is a module-private const; public API is named exports; `__resetForTests` clears all timers AND empties the Map (NOT just the Map alone — the order matters: `clearTimeout` first, then `delete`). This mirrors `server/HandHistoryQueue.ts:113-127` exactly.
- **`clear(telegramId)` as the FIRST statement in `arm()`** — closes Pitfall 4 (timer leak under churn). Without this, repeated `arm()` calls (e.g., flaky network → multiple disconnect events for the same socket) would leak timers indefinitely. Now: each `arm()` is idempotent — registry size for a given tid stays at 1 always.
- **`onExpire` deletes the entry SYNCHRONOUSLY before any await** — race-safe per Pitfall 6 / T-04-B3. Even if `tableManager.leaveTable` somehow triggered another arm() via a side effect, the new entry would be the one that wins, not the expired one.
- **`reArmIfMidHand` only handles mid-hand → between-hands, never the reverse** — by design (Pitfall 1 fix). A between-hands entry that survives a hand-end is by definition not in the "vacate AFTER hand they disconnected from ended" failure mode; resetting its 120s clock every hand boundary would unfairly extend its window. The no-op for already-between-hands is intentional, not a guard.
- **`tableId` is captured at `arm()` time and survives re-arm** — `reArmIfMidHand` reads `entry.tableId` and passes it to the new `arm()` call. The hand-end listener (Plan 04-06) does NOT need to know which table the player was at; the registry remembers.
- **`onExpire` mid-hand branch uses `BigInt(Number(telegramId))`** — mirrors `UserRepository.checkpointSeat:213` and `UserRepository.refundCurrentChips:114` BigInt conversion convention. Telegram IDs are ≤10 digits in 2026; `Number(tid)` round-trip is safe (Pitfall 7).

## Deviations from Plan

None - plan executed exactly as written.

The `<action>` block in the plan provided the complete file content verbatim; the file was written as specified. All 10 acceptance criteria pass on first verification run; no auto-fixes (Rules 1-3) were needed; no architectural decision (Rule 4) was encountered.

One minor verification artifact noted (NOT a deviation, NOT a behavioral problem): the plan's `<verification>` block expects `grep -c "clear(telegramId)" server/GraceRegistry.ts` to be ≥ 2 (one inside `arm` for idempotency, one as the public function). The actual count is 1 because the public function declaration uses TypeScript signature syntax `clear(telegramId: string): void` — the literal `clear(telegramId)` (with closing paren immediately after `telegramId`) only matches the call site at line 43. The plan's intent is satisfied: `clear(telegramId);` is the first statement inside `arm()` (line 43, immediately after the function signature) AND there is an exported `export function clear(telegramId: string): void { ... }` (line 58). Both elements are present and correct; the grep regex is just over-specific. The 10 behavioral test cases (which DO assert idempotency in case #4 `arm() called twice replaces the prior timer`) all pass.

## Threat Surface Verification

The threat model from the plan covers five threats; this implementation addresses each:

| Threat ID | Disposition | Implementation |
|-----------|-------------|----------------|
| T-04-B1 (Tampering / arm() registry) | mitigate | Module-private `Map`; public arm() takes a string telegramId from the caller — caller (Plan 04-06 auth handler) is responsible for ensuring the tid is from a validated session. arm() is idempotent (clear-first). |
| T-04-B2 (DoS / forced disconnect to stall hand) | accept | NOT pursued in this plan — existing `Game.TURN_TIME_LIMIT = 30_000` already auto-folds the disconnected player on their turn. The grace timer does NOT pause the engine; it ONLY decides post-hand whether to sitOut or vacate. |
| T-04-B3 (onExpire racing reconnect) | mitigate | `onExpire` deletes registry entry first, then re-reads `tableManager.getPlayerTable(tid)` — undefined → early return. `clear()` cancels `setTimeout` handle so onExpire never runs at all if reconnect was first. |
| T-04-B4 (Information disclosure / logs with telegramId) | accept | Phase 5 OBS-04 owns scrubbing. This plan emits `console.info`/`console.error` with raw telegramId — acceptable for v1 dev/ops debugging per CONTEXT.md "Claude's Discretion". |
| T-04-B5 (Tampering / refundCurrentChips race on expiry) | mitigate | Delegates to Plan 04-01's `UserRepository.refundCurrentChips`, which has the IS-NOT-NULL idempotency guard. Concurrent grace expiry + boot recovery + leaveTable → only one wins (count===1), losers see null and log-only. |

No new threat surface introduced beyond what the plan's `<threat_model>` already enumerates.

## Issues Encountered

None. The first `npx vitest run --config vitest.config.server.ts server/__tests__/GraceRegistry.test.ts` invocation produced 10/10 GREEN; the full `npm run test:server` produced 59/59 passing tests (49 prior + 10 new) with the only failing file being `SessionRecovery.test.ts` (RED scaffold for Plan 04-04, expected per 04-00 SUMMARY).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Plan 04-04 (SessionRecovery boot sweep) — independent of this plan**, can proceed in parallel. Both consume the same `UserRepository.refundCurrentChips` from 04-01 but do not depend on each other.
- **Plan 04-06 (reconnect handshake / disconnect handler / setOnHandComplete listener wiring) UNBLOCKED.** The auth handler will call `GraceRegistry.clear(socket.data.telegramId)` on successful reconnect; the disconnect handler will call `GraceRegistry.arm(tid, stage, tableId)` based on whether the table is mid-hand; the `setOnHandComplete` listener will call `GraceRegistry.reArmIfMidHand(tid)` for every still-disconnected seated player. All three integration points are pure named-export calls — no module-shape gymnastics required.
- **No blockers.** Server suite at 59/59 (one expected RED file remaining for 04-04). Existing tests still pass; no regression.

## Self-Check: PASSED

**Files created (verified via filesystem):**
- ✓ FOUND: server/GraceRegistry.ts (134 lines, 6 named exports + 2 grace constants + 1 private onExpire + 1 GraceEntry interface)

**Commits (verified via `git log --oneline`):**
- ✓ FOUND: bc0b330 feat(04-02): add GraceRegistry singleton-as-module timer state machine

**Test execution (verified via vitest):**
- ✓ `server/__tests__/GraceRegistry.test.ts` — **10/10 GREEN**
- ✓ Full server suite — 59/59 cases passing (the 1 file-level failure is `SessionRecovery.test.ts` RED scaffold for Plan 04-04, expected per 04-00 SUMMARY)
- ✓ No regression in pre-existing tests (49 prior + 10 new = 59)

**Acceptance criteria (verified via grep):**
- ✓ File contains `const MID_HAND_GRACE_MS = 30_000` (line 22)
- ✓ File contains `const BETWEEN_HANDS_GRACE_MS = 120_000` (line 23)
- ✓ File contains `export function arm(telegramId: string, stage: GraceStage, tableId: string): void` (line 41)
- ✓ File contains `export function clear(telegramId: string): void` (line 58)
- ✓ File contains `export function getStage(telegramId: string): GraceStage | undefined` (line 69)
- ✓ File contains `export function reArmIfMidHand(telegramId: string): void` (line 84)
- ✓ File contains `export function __resetForTests(): void` (line 124)
- ✓ File contains `export function __getInternalsForTests()` (line 130)
- ✓ `clear(telegramId);` is the FIRST statement inside `arm` (line 43, idempotency Pitfall 4 fix)
- ✓ reArmIfMidHand contains `if (entry.stage !== 'mid-hand') return;` (line 88)
- ✓ onExpire mid-hand branch contains `seatedTable.sitOut(telegramId)` (line 102) AND `disconnectedAt: null` (line 106)
- ✓ onExpire between-hands branch contains `tableManager.leaveTable(telegramId)` (line 113) AND `UserRepository.refundCurrentChips(telegramId)` (line 115)
- ✓ File does NOT touch `currentChips` directly (`grep -c "currentChips" server/GraceRegistry.ts` → 0; RESILIENCE-02 invariant preserved)
- ✓ All 10 cases in `server/__tests__/GraceRegistry.test.ts` pass
- ✓ `npm run test:server` does not regress existing tests (49 → 59, exactly +10 new GREEN)

---
*Phase: 04-resilience*
*Completed: 2026-04-29*
