---
phase: 04-resilience
plan: 04
subsystem: resilience
tags: [session-recovery, boot-sweep, refund, idempotent, race-safety, blast-radius, prisma]

# Dependency graph
requires:
  - phase: 04-resilience
    provides: Wave-0 RED test contract for SessionRecovery (server/__tests__/SessionRecovery.test.ts, 4 cases) — Plan 04-00
  - phase: 04-resilience
    provides: UserRepository.refundCurrentChips atomic helper — Plan 04-01
provides:
  - recoverPersistedSessions() — boot-time sweep that enumerates every User row with currentTableId IS NOT NULL and refunds via UserRepository.refundCurrentChips, returning { recovered: N }
  - Stale-tableId detection (D-C3) — warns and refunds anyway, robust to renamed/removed tables in config/tables.ts
  - Per-row blast-radius bound (D-C4 amended 2026-04-29) — try/catch around each refund; one row failing does not abort the sweep
  - Always-refund policy (D-C1) — no reseat-as-sit-out branch; player reconnects post-boot to a clean balance and re-picks a table fresh
affects: [04-resilience]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Boot-time sweep over indexed predicate column: prisma.user.findMany({ where: { currentTableId: { not: null } } }) leverages @@index([currentTableId]) on User model — bounded scan even at scale"
    - "Per-row try/catch loop with no outer $transaction: each refund is atomic at the row level via the helper's WHERE col IS NOT NULL guard; outer transaction would re-introduce blast-radius (one failure rolls back all preceding refunds)"
    - "Stale-id detection via Set<PREDEFINED_TABLES.id>: O(1) lookup per row; warn-then-refund preserves chip recovery even when the config has drifted between boots"

key-files:
  created:
    - server/SessionRecovery.ts
  modified: []

key-decisions:
  - "Pattern locked from 04-PLAN <pattern_locked> verbatim: no Promise.all (would short-circuit on rejection), no outer $transaction (per D-C4 amendment 2026-04-29 — refundCurrentChips is self-contained atomic per row), no direct prisma.user.update (refunds go through the atomic helper only)"
  - "Stale-table warn signature uses 4 args (format string + tableId + tid + extra-object) — matches the test spec's expect.anything(), expect.anything() trailing slots; the extra-object carries currentChips for ops-debugging without leaking PII per CONTEXT.md 'Claude's Discretion'"
  - "Recovered count increments ONLY on truthy result from refundCurrentChips — null result (race-cleared by another caller / never seated / user not found) silently skipped, NOT counted, NOT logged. Aligns with the helper's documented return contract (Plan 04-01)"
  - "telegramId stringification via String(BigInt) at the loop boundary — matches Phase 3 checkpointSeat BigInt convention; the helper internally converts back via BigInt(Number(tid))"
  - "Hookup deferred to Plan 04-06 per D-C2: this plan ships only the function. Plan 04-06 inserts `await recoverPersistedSessions()` into server/index.ts:182 setTimeout block AFTER setupTableEvents and BEFORE HandHistoryQueue.startFlushTimer()"

patterns-established:
  - "Boot recovery sweep: indexed-column findMany + per-row atomic helper call wrapped in try/catch — bounded N (max ~36 = 6 tables × 6 seats simultaneous-disconnected at v1 scale), graceful per-row degradation"
  - "Always-refund post-boot: in-memory engine state is empty after restart, so reseating is meaningless until reconnect. Refund + clean session columns is the simplest correct semantics for the cold-start case"

requirements-completed: [RESILIENCE-06]

# Metrics
duration: 1min
completed: 2026-04-30
---

# Phase 04 Plan 04: SessionRecovery Boot Sweep Summary

**Created `server/SessionRecovery.ts` exporting one named async function `recoverPersistedSessions()`. On server boot, the sweep enumerates every `User` row with `currentTableId IS NOT NULL` and refunds each through the atomic helper from Plan 04-01. Stale `currentTableId` values (renamed/removed tables) emit a warn log but still get refunded — chips are owed regardless (D-C3). One row failing does not abort the sweep (D-C4 per-row try/catch, no outer `$transaction`). All 4 RED tests in `SessionRecovery.test.ts` now GREEN; full server suite advances 59 → 63 passing tests with zero regression.**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-04-30T07:06:19Z
- **Completed:** 2026-04-30T07:07:39Z
- **Tasks:** 1
- **Files created:** 1 (server/SessionRecovery.ts; 79 lines)
- **Files modified:** 0

## Public API Surface

```ts
/**
 * Plan 04-04 / RESILIENCE-06 / D-C1..D-C4:
 * Boot-time session recovery sweep.
 */
export async function recoverPersistedSessions(): Promise<{ recovered: number }>;
```

That is the entire public surface. One named export. One return shape. No state. No options. No retries.

## Return-Shape Contract

`{ recovered: N }` where `N` is the count of rows where `UserRepository.refundCurrentChips` returned a non-null result (i.e., a refund actually happened). Rows that returned `null` (never seated, race-cleared, user not found) and rows that threw (logged via `console.error` and skipped) do NOT increment `recovered`.

## Log Shapes (Four Variants)

| Event | Console method | Format |
|-------|----------------|--------|
| Successful refund | `console.log` | `'[BootRecovery] refunded telegramId=%s chips=%d table=%s', tid, refunded, tableId` |
| Stale tableId | `console.warn` | `'[BootRecovery] stale tableId %s for telegramId=%s — refunded', tableId, tid, { currentChips }` |
| Per-row error | `console.error` | `'[BootRecovery] refund failed for telegramId=%s:', tid, err` |
| Race-cleared / never seated | (no log) | Helper returned null — silent skip, not counted |

The final aggregate summary line will be added at the call site in Plan 04-06 (`[BootRecovery] swept N rows, refunded M`).

## D-C1 Always-Refund Policy Confirmation

**No reseat-as-sit-out branch exists in this module.** Every row matched by the findMany predicate is fed through `UserRepository.refundCurrentChips` regardless of `disconnectedAt` recency, regardless of whether the tableId is current. The in-memory `Game` instance is empty after boot anyway (no engine state survives a restart per Phase 1 D-09); there is no seat to re-occupy until the player reconnects. Refund + clean session columns + player picks a table fresh is the simplest correct semantics.

`grep -c "sitOut\|reseat\|sitIn" server/SessionRecovery.ts` → **0** ✓

## D-C3 Stale-tableId Detection

```ts
const knownTableIds = new Set(PREDEFINED_TABLES.map((t) => t.id));
// ...
if (tableId && !knownTableIds.has(tableId)) {
  console.warn(
    '[BootRecovery] stale tableId %s for telegramId=%s — refunded',
    tableId, tid, { currentChips: row.currentChips }
  );
}
// refund proceeds regardless
```

If `config/tables.ts` is edited between boots (table renamed, removed, or rebalanced), rows with the old id are detected by O(1) Set lookup and refunded with a warn log. Operationally: `grep '\[BootRecovery\] stale tableId' logs.txt` flags users who need attention even though their chips are already back.

## D-C4 Per-Row Blast-Radius Bound (Amended 2026-04-29)

**No `Promise.all`. No outer `$transaction`.**

The implementation uses a `for...of` loop with a try/catch inside the body:

```ts
for (const row of rows) {
  // ...
  try {
    const result = await UserRepository.refundCurrentChips(tid);
    if (result) { recovered++; /* log */ }
  } catch (err) {
    console.error('[BootRecovery] refund failed for telegramId=%s:', tid, err);
  }
}
```

Why no `$transaction`: `UserRepository.refundCurrentChips` is **already atomic per row** via its conditional `updateMany WHERE currentChips IS NOT NULL`. Wrapping the whole loop in a single `$transaction` would re-introduce the blast-radius problem the D-C4 amendment was designed to avoid — one row's constraint violation would roll back ALL preceding refunds. Per-row try/catch is the correct pattern.

Why no `Promise.all`: any rejection short-circuits, leaving the remaining rows unswept on this boot. Sequential `for...of` with try/catch ensures every row gets its turn.

`grep -c "Promise.all" server/SessionRecovery.ts` → **0** ✓
`grep -c "\\\$transaction" server/SessionRecovery.ts` → **0 invocations** (3 mentions all inside the doc comment explaining why the pattern is forbidden — the plan REQUIRED a comment referencing "D-C4, amended 2026-04-29" explaining why no $transaction)

## Idempotency Against Client-Driven Races (Pitfall 3)

The boot sweep runs at `+1000ms` after `tableManager.initialize()` (Plan 04-06 hookup). A fast client may auth and trigger their own refund path between `+500ms` (socket open) and `+1000ms`. The atomic IS-NOT-NULL guard inside `UserRepository.refundCurrentChips` makes the second caller a no-op:

1. Client refund hits first → `count === 1`, returns `{ refunded: N }`.
2. Sweep refund hits second → `currentChips` is now null → `findUnique` returns null → returns null.
3. Sweep increments `recovered` only on truthy results → no double credit.

If the order is reversed (sweep first, client second), the same logic applies. **One refund total per row, regardless of who wins the race.**

## No Direct DB Writes Outside Helper

The ONLY mutation in this module is via `UserRepository.refundCurrentChips`. No `prisma.user.update`. No `prisma.$transaction`. The atomic helper from Plan 04-01 IS the single source of truth for clearing session columns, and this preserves the project's idempotency invariant.

`grep -c "prisma\.user\.update[^M]" server/SessionRecovery.ts` → **0** ✓
`grep -c "prisma\.user\.findMany" server/SessionRecovery.ts` → **1** (the boot enumeration query) ✓

## Test Count: 4 GREEN

All 4 cases in `server/__tests__/SessionRecovery.test.ts` now PASS:

| # | Case | What it covers |
|---|------|----------------|
| 1 | `calls refundCurrentChips for every row with currentTableId IS NOT NULL (D-C1)` | Enumeration + always-refund routing |
| 2 | `logs warn for stale tableId not in PREDEFINED_TABLES but still refunds (D-C3)` | Stale-id detection + warn shape + refund-anyway |
| 3 | `per-row sweep — one row failing does not abort others (D-C4)` | Blast-radius bound: middle row throws, outer rows still refund, recovered = 2 |
| 4 | `returns { recovered: 0 } when no persisted sessions exist` | Empty-findMany degenerate case |

## Pre/Post Test Counts

| State | Server suite | SessionRecovery.test.ts |
|-------|--------------|--------------------------|
| Pre (after 04-02) | 59/59 passing (1 RED file: SessionRecovery.test.ts for this plan) | 0/4 RED (`Cannot find module '../SessionRecovery.js'`) |
| Post (this plan) | **63/63 passing** (zero RED files in scope; 04-06 has no test file) | **4/4 GREEN** |

Net delta: +4 GREEN cases, exactly matching the 4 SessionRecovery tests turning. Zero regression in pre-existing tests.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create SessionRecovery.recoverPersistedSessions()** — `23ff86c` (feat)

**Plan metadata:** _(this SUMMARY + STATE.md + ROADMAP.md + REQUIREMENTS.md final commit follows)_

## Files Created/Modified

- `server/SessionRecovery.ts` — created, 79 lines. One named export `recoverPersistedSessions`. Imports default `prisma` from `./db/prisma.js`, `PREDEFINED_TABLES` from `./config/tables.js`, `UserRepository` from `./db/UserRepository.js`. Doc comment references Plans 04-01, 04-06 and decisions D-C1..D-C4 explicitly so future readers understand the design constraints without re-reading the plan.

## Decisions Made

- **`<action>` block executed verbatim.** The plan provided complete code; the file was written exactly as specified. No deviations from the locked content.
- **Stale-table warn arg shape (4 args) chosen to match test spec** — `expect.stringContaining('[BootRecovery] stale tableId')` then `'deleted-table-xyz'` then `expect.anything()` then `expect.anything()`. Our call passes the format string, tableId, tid, and an `{ currentChips }` extra-object. The extra-object slot is operationally useful (log captures the chip amount that's about to be refunded) and behaviorally matches the spec.
- **Insertion of doc comment block explaining D-C4 amendment** is a plan-mandated acceptance criterion ("File comment references 'D-C4, amended 2026-04-29' explaining why no $transaction"). The 3 grep matches for `$transaction` are all inside that comment — they document the forbidden pattern, not invoke it.
- **`recovered` increments only on truthy `result`** — preserves the existing helper's null-return semantics. A null result means the row was already cleared by a concurrent caller (race-loser path) or never had `currentChips` set; either way, treating it as "not recovered by this sweep" is the honest count.

## Deviations from Plan

None — plan executed exactly as written. The `<action>` block specified the complete file content; the file was written as specified. All 16 acceptance criteria pass on first verification run; no auto-fixes (Rules 1-3) were needed; no architectural decision (Rule 4) was encountered. Vitest produced 4/4 GREEN on the first invocation; full server suite produced 63/63 GREEN with zero regression.

## Threat Surface Verification

The threat model from the plan covers six threats; this implementation addresses each:

| Threat ID | Disposition | Implementation |
|-----------|-------------|----------------|
| T-04-C1 (Tampering / sweep) | mitigate | Refund delegates to `UserRepository.refundCurrentChips` (Plan 04-01); IS-NOT-NULL guard makes concurrent boot/client/leaveTable refunds safe — only one wins per row, others get null. |
| T-04-C3 (Tampering / stale tableId) | mitigate | `Set<PREDEFINED_TABLES.id>` lookup + warn log + refund proceeds; chips never orphaned, no manual ops cleanup needed. |
| T-04-C4 (DoS / per-row blast radius) | mitigate | `for...of` with try/catch in body; bounded N (~36 max at v1 scale); no outer `$transaction`. |
| T-04-Pitfall3 (sweep races first client) | mitigate | Idempotency guard in helper; both paths converge to one refund. |
| T-04-Pitfall6 (sweep deletes row player is reconnecting into) | mitigate | Player's `tableManager.getPlayerTable(tid)` is empty post-boot (no Game has them seated); falls through to menu screen with refunded balance — design self-corrects. |
| T-04-V5 (input validation / findMany result) | accept | Function consumes only DB-internal data; no external input flows in. |

No new threat surface introduced beyond what the plan's `<threat_model>` already enumerates.

## Issues Encountered

None. The first `npx vitest run --config vitest.config.server.ts server/__tests__/SessionRecovery.test.ts` invocation produced 4/4 GREEN; the full `npm run test:server` produced 63/63 passing tests (59 prior + 4 new) with zero RED files remaining for this plan's scope.

## User Setup Required

None — no external service configuration required. The function will be wired into the boot path by Plan 04-06.

## Next Phase Readiness

- **Plan 04-06 (auth handler / disconnect handler / setOnHandComplete listener / boot recovery hookup) UNBLOCKED.** The function is a pure-named export ready to drop into `server/index.ts:182`'s `setTimeout(..., 1000)` block — `await recoverPersistedSessions()` between `tables.forEach((t) => setupTableEvents(t.id))` and `HandHistoryQueue.startFlushTimer()`. Plan 04-06 will likely also add a `console.log('[BootRecovery] swept N rows, refunded M')` at the call site.
- **No blockers.** Server suite at 63/63; zero RED files in this plan's scope. Existing tests still pass; no regression.
- **Phase 4 advances to plan 5/7 (executing) → 6/7 ready.** Of the 7 plans in Phase 04: 04-00, 04-01, 04-02, 04-03, 04-04, 04-05 are done. Only 04-06 remains.

## Self-Check: PASSED

**Files created (verified via filesystem):**
- ✓ FOUND: server/SessionRecovery.ts (79 lines, 1 named export, 1 boot-sweep function)

**Commits (verified via `git log --oneline`):**
- ✓ FOUND: 23ff86c feat(04-04): add SessionRecovery boot sweep with per-row blast-radius bound

**Test execution (verified via vitest):**
- ✓ `server/__tests__/SessionRecovery.test.ts` — **4/4 GREEN**
- ✓ Full server suite — 63/63 cases passing across 11 files (was 59/59 across 10 files; +1 file +4 cases, exactly matching this plan's scope)
- ✓ No regression in pre-existing tests (59 prior + 4 new = 63)

**Acceptance criteria (verified via grep / file content):**
- ✓ File `server/SessionRecovery.ts` exists
- ✓ File contains `export async function recoverPersistedSessions(): Promise<{ recovered: number }>` (line 35)
- ✓ File contains `prisma.user.findMany` with `currentTableId: { not: null }` (lines 38-41)
- ✓ File contains `select: { telegramId: true, currentTableId: true, currentChips: true }` (line 40)
- ✓ File contains `import { PREDEFINED_TABLES } from './config/tables.js'` (line 2)
- ✓ File contains `new Set(PREDEFINED_TABLES.map((t) => t.id))` (line 36)
- ✓ File contains `if (tableId && !knownTableIds.has(tableId))` (line 49)
- ✓ File contains `console.warn(` with `'[BootRecovery] stale tableId'` (lines 50-55)
- ✓ File contains `UserRepository.refundCurrentChips(tid)` inside a `try` block (line 59 inside try at 58)
- ✓ File contains a `catch` block with `console.error('[BootRecovery] refund failed'` (lines 71-73)
- ✓ File contains `if (result)` block that increments `recovered++` — only success counts (lines 60-67)
- ✓ File does NOT contain `Promise.all` (`grep -c "Promise.all"` → 0)
- ✓ File does NOT contain `prisma.$transaction` invocation (`grep -c "prisma\.\$transaction"` → 0; the 3 doc-comment mentions are required by acceptance criteria explaining the pattern is forbidden)
- ✓ File does NOT contain direct `prisma.user.update` (`grep -c "prisma\.user\.update[^M]"` → 0)
- ✓ File comment references "D-C4, amended 2026-04-29" explaining why no $transaction (lines 22-26, 71-73)
- ✓ All 4 cases in `server/__tests__/SessionRecovery.test.ts` pass
- ✓ Full server suite (`npm run test:server`) does not regress (63/63)

---
*Phase: 04-resilience*
*Completed: 2026-04-30*
