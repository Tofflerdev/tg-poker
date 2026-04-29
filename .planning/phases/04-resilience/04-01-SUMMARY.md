---
phase: 04-resilience
plan: 01
subsystem: database
tags: [prisma, postgres, atomic-sql, race-safety, resilience, user-repository]

# Dependency graph
requires:
  - phase: 04-resilience
    provides: Wave-0 RED test contract for UserRepository atomic helpers (server/__tests__/UserRepository.atomic.test.ts, 6 cases)
provides:
  - UserRepository.tryDecrementBalance(telegramId, amount) — atomic single-statement UPDATE that decrements balance iff balance >= amount; returns boolean
  - UserRepository.refundCurrentChips(telegramId) — two-step idempotent refund of currentChips → balance with WHERE currentChips IS NOT NULL guard; clears all five session columns; returns { refunded } or null
  - SQL-level primitives closing Concern #5 (buy-in double-spend) and providing the safe refund path for grace expiry, leaveTable cashout, and boot recovery
affects: [04-resilience]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-statement atomic conditional UPDATE via prisma.user.updateMany with `gte` / `not: null` predicates — no read-then-write transaction required"
    - "Two-step idempotent refund: read column to capture value, then atomic UPDATE with idempotency guard predicate that makes concurrent callers safe (one wins via count===1, others see count===0)"

key-files:
  created: []
  modified:
    - server/db/UserRepository.ts

key-decisions:
  - "tryDecrementBalance implemented via prisma.user.updateMany (not $queryRaw, not $transaction) — D-D1 SQL pattern locked in 04-CONTEXT.md; safe on Prisma 7.4.2 (post issue #8612 fix in 4.4.0)"
  - "refundCurrentChips uses two-step pattern (findUnique → updateMany) NOT inverted: read-first captures the chip amount; the atomic UPDATE then carries an IS-NOT-NULL idempotency guard so a concurrent boot-recovery sweep cannot double-credit"
  - "updateBalance preserved unchanged — daily-bonus and hand-end winnings paths continue to use it (D-D2: only buy-in deduction needs the gte guard)"
  - "telegramId param shape: tryDecrementBalance(telegramId: number) keeps the existing numeric signature used by index.ts:526/739; refundCurrentChips(telegramId: string) takes string for downstream callers (GraceRegistry, SessionRecovery, leaveTable) that hold socket.data telegramId as string. Internal conversion: BigInt(telegramId) and BigInt(Number(telegramId)) respectively, mirroring checkpointSeat:140-152"

patterns-established:
  - "Atomic UPDATE WHERE balance >= n: closes TOCTOU race on buy-in deduct without an explicit transaction — single SQL statement is the atomicity boundary"
  - "Idempotent column-clear UPDATE WHERE col IS NOT NULL: makes refund safe to race; loser sees count===0 and returns null, winner gets count===1 and returns the refunded amount"

requirements-completed: [RESILIENCE-07]

# Metrics
duration: 2min
completed: 2026-04-29
---

# Phase 04 Plan 01: UserRepository Atomic Helpers Summary

**Two new SQL-level primitives on UserRepository — `tryDecrementBalance` (race-safe buy-in deduct via single-statement `UPDATE ... WHERE balance >= n`) and `refundCurrentChips` (two-step idempotent refund + session-column clear, gated by `WHERE currentChips IS NOT NULL`) — turn 6 RED tests GREEN and unblock Plans 04-02, 04-04, 04-06.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-29T19:29:55Z
- **Completed:** 2026-04-29T19:31:14Z
- **Tasks:** 2
- **Files modified:** 1 (server/db/UserRepository.ts; +68 lines)

## Accomplishments

- Closed Concern #5 (buy-in double-spend race) at the DB layer: `tryDecrementBalance` uses `prisma.user.updateMany({ where: { balance: { gte: amount } }, data: { balance: { decrement: amount } } })` — one SQL statement, no read-then-write window. Returns `true` iff exactly one row updated.
- Added the safe refund primitive used by grace-expiry / boot-recovery / leaveTable: `refundCurrentChips` reads `currentChips`, then issues a single UPDATE with `WHERE currentChips IS NOT NULL` and increments `balance` while clearing `currentChips`, `currentTableId`, `currentSeat`, `disconnectedAt`, `lastSeenAt` in the same statement. Race-safe: concurrent callers see `count: 0` and return `null` — no double-credit possible.
- Verification: 6 RED tests in `server/__tests__/UserRepository.atomic.test.ts` → 6 GREEN. Full server suite advances 43 → 49 passing tests (+6 = exactly the new atomic-helper cases). No regression in pre-existing tests.

## Method Signatures

```ts
// Plan 04-01 / RESILIENCE-07 / D-D1
static async tryDecrementBalance(telegramId: number, amount: number): Promise<boolean>

// Plan 04-01 / RESILIENCE-02 / RESILIENCE-07 / D-D2
static async refundCurrentChips(telegramId: string): Promise<{ refunded: number } | null>
```

## SQL Shapes (locked from 04-CONTEXT.md / 04-RESEARCH.md)

**tryDecrementBalance — single-statement atomic deduct:**
```ts
const result = await prisma.user.updateMany({
  where: { telegramId: BigInt(telegramId), balance: { gte: amount } },
  data:  { balance: { decrement: amount } }
});
return result.count === 1;
```

**refundCurrentChips — two-step idempotent refund:**
```ts
// Step 1: capture chips amount
const user = await prisma.user.findUnique({
  where: { telegramId: BigInt(Number(telegramId)) },
  select: { currentChips: true }
});
if (!user || user.currentChips === null) return null;

const chipsToRefund = user.currentChips;

// Step 2: atomic refund + clear (IS-NOT-NULL guard makes it idempotent)
const result = await prisma.user.updateMany({
  where: { telegramId: BigInt(Number(telegramId)), currentChips: { not: null } },
  data:  {
    balance: { increment: chipsToRefund },
    currentChips: null,
    currentTableId: null,
    currentSeat: null,
    disconnectedAt: null,
    lastSeenAt: null
  }
});

if (result.count === 0) return null; // race: another caller already cleared
return { refunded: chipsToRefund };
```

## Pre/Post Test Counts

| State | Test File | tryDecrementBalance | refundCurrentChips | Total |
|-------|-----------|---------------------|--------------------|-------|
| Pre (RED, after 04-00) | UserRepository.atomic.test.ts | 0/2 (TypeError: not a function) | 0/4 (TypeError: not a function) | **0/6 RED** |
| Post (this plan) | UserRepository.atomic.test.ts | **2/2 GREEN** | **4/4 GREEN** | **6/6 GREEN** |

Server suite overall: 43 passing → 49 passing (+6, exactly the atomic cases). The two unresolved RED files (`SessionRecovery.test.ts`, `GraceRegistry.test.ts`) are expected scaffolds for Plans 04-04 and 04-02 per the 04-00 SUMMARY — not regressions.

## Confirmation: updateBalance preserved

- `grep -c "static async updateBalance" server/db/UserRepository.ts` → **1** (unchanged)
- `updateBalance` continues to handle daily-bonus refill (claimDailyBonus → balance: 1000) and hand-end winnings (`updateBalance(telegramId, +amount)`) per D-D2.
- `grep -c "\$queryRaw" server/db/UserRepository.ts` → **0** (no raw SQL)
- `grep -c "\$transaction(async" server/db/UserRepository.ts` → **0** (no read-then-write transaction)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add tryDecrementBalance to UserRepository** — `a19289a` (feat)
2. **Task 2: Add refundCurrentChips to UserRepository** — `c3d47ed` (feat)

**Plan metadata:** _(this SUMMARY + STATE.md + ROADMAP.md + REQUIREMENTS.md final commit follows)_

## Files Created/Modified

- `server/db/UserRepository.ts` — added two static methods (`tryDecrementBalance`, `refundCurrentChips`) totaling 68 inserted lines; no other lines touched. `updateBalance`, `claimDailyBonus`, `checkpointSeat`, `updateStats`, mappers, etc. all preserved.

## Decisions Made

- Adhered to the SQL shapes locked in `04-CONTEXT.md` (D-D1, D-D2) verbatim — did not deviate. The plan called these patterns "locked" for a reason: every alternative (raw SQL, async transaction, inverted read-after-write) has a documented race window or a Prisma incompatibility.
- Inserted `tryDecrementBalance` directly after `updateBalance` (the related write path) and `refundCurrentChips` directly after `tryDecrementBalance` — keeps related write helpers grouped at the top of the class for discoverability by Plan 04-02 / 04-04 / 04-06 implementers.
- BigInt shape kept consistent with existing code: `BigInt(telegramId)` for the numeric overload (mirrors `updateBalance` line 63), `BigInt(Number(telegramId))` for the string overload (mirrors `checkpointSeat` line 145). No change to BigInt convention.

## Deviations from Plan

None — plan executed exactly as written. The `<action>` blocks specified the exact code to insert; both methods were inserted verbatim. All acceptance criteria pass on first verification run; no auto-fixes (Rules 1-3) needed; no architectural decision (Rule 4) encountered.

## Issues Encountered

None. Both vitest runs returned the expected results on first invocation:
- Task 1: `tryDecrementBalance` filter → 2 passed, 4 skipped (unrelated `refundCurrentChips` cases not yet implemented).
- Task 2: full file → 6 passed (all atomic-helper cases GREEN).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Plan 04-02 (GraceRegistry, between-hands branch) unblocked.** `GraceRegistry.onExpire` between-hands path will call `UserRepository.refundCurrentChips(telegramId)` and act on `{ refunded: N }` vs `null`. The idempotency guarantee is verified.
- **Plan 04-04 (SessionRecovery boot sweep) unblocked.** `SessionRecovery.recoverPersistedSessions` per-row try/catch will call `refundCurrentChips` for stale rows; the `count === 0` race-loser path returns `null` without throwing — safe to wrap in try/catch as planned.
- **Plan 04-06 (leaveTable cashout) unblocked.** The `leaveTable` socket handler can call `refundCurrentChips(socket.data.telegramId)` as the cashout path; client-driven leave + concurrent grace-expiry refund cannot double-credit.
- **Buy-in call sites in `server/index.ts:526` and `:739` ready to migrate.** They currently call `updateBalance(user.telegramId, -tableInfo!.config.buyIn)` (read-then-write race exposed) and should be replaced by `tryDecrementBalance(user.telegramId, buyIn)` with refusal on `false`. That migration is part of the existing call-site work in downstream plans.
- **No blockers.** All 6 RED tests for this plan are now GREEN; full server suite at 49/49 (excluding the 2 expected RED scaffolds for 04-02/04-04). Existing tests still pass; no regression.

## Self-Check: PASSED

**Files modified (verified via filesystem and `git diff`):**
- ✓ FOUND: server/db/UserRepository.ts (+68 lines, 2 methods inserted)

**Commits (verified via `git log --oneline`):**
- ✓ FOUND: a19289a feat(04-01): add tryDecrementBalance atomic helper to UserRepository
- ✓ FOUND: c3d47ed feat(04-01): add refundCurrentChips atomic helper to UserRepository

**Test execution (verified via vitest):**
- ✓ `server/__tests__/UserRepository.atomic.test.ts` — 6/6 GREEN
- ✓ Full server suite — 49/49 cases passing (the 2 file-level failures are 04-02/04-04 RED scaffolds, expected per 04-00 SUMMARY)
- ✓ No regression in pre-existing tests (43 prior + 6 new = 49)

**Forbidden patterns (verified via grep):**
- ✓ `$queryRaw` count: 0 (no raw SQL — D-D1 forbidden pattern absent)
- ✓ `$transaction(async` count: 0 (no read-then-write transaction — D-D2 forbidden pattern absent)
- ✓ `static async updateBalance` count: 1 (preserved unchanged for daily-bonus / winnings paths — D-D2 invariant)

---
*Phase: 04-resilience*
*Completed: 2026-04-29*
