---
phase: 04-resilience
reviewed: 2026-04-30T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - client/src/App.tsx
  - client/src/components/ReconnectOverlay.tsx
  - client/src/components/__tests__/ReconnectOverlay.test.tsx
  - server/GraceRegistry.ts
  - server/SessionRecovery.ts
  - server/__tests__/GraceRegistry.test.ts
  - server/__tests__/SessionRecovery.test.ts
  - server/__tests__/UserRepository.atomic.test.ts
  - server/__tests__/reconnectHandshake.test.ts
  - server/db/UserRepository.ts
  - server/index.ts
  - types/index.ts
findings:
  critical: 1
  warning: 6
  info: 5
  total: 12
status: issues_found
---

# Phase 4: Code Review Report — Resilience

**Reviewed:** 2026-04-30
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Phase 4 introduces disconnect grace timers (`GraceRegistry`), atomic balance helpers (`tryDecrementBalance` / `refundCurrentChips`), boot recovery (`SessionRecovery`), the typed `replacedBySession` event, and a debounced reconnect overlay. The core state-machine logic in `GraceRegistry` is sound, the atomic SQL semantics are correct against Prisma 7, the Pitfall 1 hand-complete re-arm hook is correctly wired, and the per-row blast-radius bound in the boot sweep is faithfully implemented.

The most important issue is a real cross-socket bug in the disconnect handler: `userStorage.removeUser(telegramId)` is called unconditionally, which means an evicted (prior) socket's later `disconnect` event will wipe the in-memory `TelegramUser` cache that the *new* socket relies on. The same identity guard that protects `clearSocketForTelegram` should gate `removeUser` too.

Several other findings are smaller — a wasted `setInterval` running after grace expiry in the overlay, an unnecessary `Number()` round-trip on telegramId BigInts, an unbounded `findMany` in boot recovery, and a stale-read window in `refundCurrentChips`'s two-step read-then-write.

Test files are largely well-structured. The `reconnectHandshake.test.ts` harness diverges from the production auth handler in one subtle way (it omits `updateTableState`) — flagged as Info because the divergence is contained to test code.

## Critical Issues

### CR-01: Evicted prior socket's disconnect wipes the new socket's userStorage entry

**File:** `server/index.ts:884-887`
**Issue:**
The disconnect handler ends with:
```ts
if (tableManager.getSocketIdForTelegram(telegramId) === socket.id) {
  tableManager.clearSocketForTelegram(telegramId);
}
userStorage.removeUser(telegramId);
```
The identity guard (T-01-04-04 / Pitfall 4) correctly protects `clearSocketForTelegram` from being run by an evicted prior socket — but `userStorage.removeUser(telegramId)` is **unconditional and outside the guard**.

Concrete sequence:
1. Player has socket-A authenticated, `userStorage` keyed by tid.
2. Player opens a second tab → socket-B authenticates → `setSocketForTelegram` invokes `onEvict(socket-A)`, which calls `prior.disconnect(true)`.
3. Server's `disconnect` handler fires for socket-A. `getSocketIdForTelegram(tid)` now returns socket-B's id, so the guard skips `clearSocketForTelegram` (correct).
4. **But** `userStorage.removeUser(tid)` runs anyway, deleting the `TelegramUser` entry that socket-B's handlers (`claimDailyBonus`, `joinTable`, `acceptTos`, `updateProfile`) silently depend on.
5. Subsequent `joinTable`/`claimDailyBonus`/etc. calls from socket-B hit `userStorage.getUser(tid) → undefined` and silent-return (e.g. `joinTable` line 528 emits `errorMessage("Authentication required")`).

This negates D-A3's intent: the new session is supposed to fully take over from the evicted one. Right now the new session is functionally half-broken until the player re-emits `auth` (which only happens once on socket open).

**Fix:**
```ts
// Identity guard preserved — only wipe BOTH socket map AND user cache
// when THIS socket is still the current one. An evicted (prior) socket's
// disconnect must not nuke the replacement's session state.
if (tableManager.getSocketIdForTelegram(telegramId) === socket.id) {
  tableManager.clearSocketForTelegram(telegramId);
  userStorage.removeUser(telegramId);
}
```

A regression test should be added to `reconnectHandshake.test.ts`: after `evictCb` fires for socket-OLD, simulate socket-OLD's disconnect handler running and assert that `userStorage.removeUser` is NOT called (or is called only for socket-OLD's case where the guard fails).

## Warnings

### WR-01: ReconnectOverlay leaves tickRef interval running after grace expiry

**File:** `client/src/components/ReconnectOverlay.tsx:99-107`
**Issue:**
When the grace `setTimeout` fires (`graceRef.current` expired), the component transitions to `sat-out` or `vacated`:
```ts
graceRef.current = setTimeout(() => {
  graceRef.current = null;
  setOverlayState(stage === 'mid-hand' ? { kind: 'sat-out' } : { kind: 'vacated' });
}, graceMs);
// Start the per-second tick for the visible countdown.
if (tickRef.current) clearInterval(tickRef.current);
tickRef.current = setInterval(() => {
  setTickNow(Date.now());
}, 1000);
```
The `tickRef` interval is only cleared in `clearAllTimers()`, which is called by `connect` / `tableJoined` / `replacedBySession` / unmount. After the grace expires, the user sits indefinitely on the `sat-out` or `vacated` sub-view — and `tickRef` keeps firing every second, calling `setTickNow(Date.now())`, which causes a re-render of an unmounted countdown (the render path branches on `kind` and never reads `tickNow` for `sat-out`/`vacated`/`replaced`).

It's a wasted re-render every second for the lifetime of the terminal sub-view (potentially many minutes if the user doesn't hit "Back to Tables"). Not a correctness bug but real wasted work and battery drain on mobile.

**Fix:** clear the tick (and the now-fired grace timer ref) when transitioning to the terminal state:
```ts
graceRef.current = setTimeout(() => {
  graceRef.current = null;
  if (tickRef.current) {
    clearInterval(tickRef.current);
    tickRef.current = null;
  }
  setOverlayState(stage === 'mid-hand' ? { kind: 'sat-out' } : { kind: 'vacated' });
}, graceMs);
```

### WR-02: refundCurrentChips two-step has a stale-amount race window

**File:** `server/db/UserRepository.ts:112-135`
**Issue:**
The helper does:
1. `findUnique` → captures `chipsToRefund = user.currentChips`
2. `updateMany WHERE currentChips IS NOT NULL` with `data: { balance: { increment: chipsToRefund }, currentChips: null, ... }`

The `IS NOT NULL` guard correctly prevents double-credit when another caller has *cleared* the column between the two queries. It does **not** prevent a stale-amount write when another caller has *changed* `currentChips` between the two queries — for example, a checkpoint at hand-end (`UserRepository.checkpointSeat`) running concurrently with a between-hands grace expiry.

Concrete (admittedly tight-window) scenario:
- T0: hand ends → `onHandComplete` fires → `checkpointSeat` updates `currentChips` from 500 → 350 (player lost a hand).
- T0: GraceRegistry's `setTimeout` fires concurrently → `refundCurrentChips` runs.
- T0+ε: `findUnique` returns the pre-checkpoint value `currentChips=500` (read snapshot before the checkpoint commits).
- T0+2ε: checkpoint commits 350.
- T0+3ε: `updateMany` writes `balance += 500` (stale captured amount) and clears the column. Player gets refunded 500 instead of 350 — phantom 150 chip credit.

In practice the window is microseconds and Phase 4's flow guarantees `reArmIfMidHand` swaps mid-hand→between-hands so a between-hands timer can only fire ≥120s after the most recent hand boundary, and `checkpointSeat` only fires AT a hand boundary. The race is therefore extremely unlikely. Still worth tightening since `tryDecrementBalance` already shows the pattern.

**Fix:** combine into a single conditional updateMany using a raw `currentChips: { not: null }` and use Prisma raw / a SELECT FOR UPDATE inside a transaction, OR (simpler) capture the refund amount via a `RETURNING`-style approach:
```ts
// Use $queryRaw to atomically read-and-clear in one statement (Postgres):
const rows = await prisma.$queryRaw<Array<{ refunded: number }>>`
  UPDATE "users"
     SET balance        = balance + COALESCE("currentChips", 0),
         "currentChips" = NULL,
         "currentTableId" = NULL,
         "currentSeat" = NULL,
         "disconnectedAt" = NULL,
         "lastSeenAt" = NULL
   WHERE "telegramId" = ${BigInt(Number(telegramId))}
     AND "currentChips" IS NOT NULL
   RETURNING "currentChips" AS refunded
`;
return rows[0] ? { refunded: rows[0].refunded } : null;
```
This is a single SQL round-trip with row-level locking and no read-then-write window.

### WR-03: BigInt(Number(telegramId)) round-trip is lossy and unnecessary

**File:** `server/GraceRegistry.ts:106`, `server/db/UserRepository.ts:114, 122, 213`, `server/index.ts:870`
**Issue:**
Pattern `BigInt(Number(telegramId))` round-trips the string through a JS `number`. For Telegram IDs above `Number.MAX_SAFE_INTEGER` (2^53 − 1 = 9,007,199,254,740,991), precision is silently lost. Today Telegram IDs are 10 digits, but the project's own type contract uses `string` precisely because integers may overflow. Other call sites in the same repo use `BigInt(telegramId)` directly without the `Number()` step (e.g. `findOrCreate`, `updateBalance`, `claimDailyBonus`, `acceptTos`).

The codebase comments justify this with "Telegram IDs are ≤10 digits in 2026; round-trip is safe (Pitfall 7)" — that's true today but the assumption isn't enforced anywhere and the round-trip costs nothing if you skip it. `BigInt(stringValue)` works fine on a numeric string.

**Fix:**
```ts
// Before:
where: { telegramId: BigInt(Number(telegramId)) }
// After:
where: { telegramId: BigInt(telegramId) }
```
Apply consistently across `GraceRegistry.onExpire`, `UserRepository.refundCurrentChips`, `UserRepository.checkpointSeat`, and the disconnect-handler `prisma.user.update` in `index.ts:870`.

### WR-04: SessionRecovery loads all stale sessions into memory unbounded

**File:** `server/SessionRecovery.ts:37-40`
**Issue:**
```ts
const rows = await prisma.user.findMany({
  where: { currentTableId: { not: null } },
  select: { telegramId: true, currentTableId: true, currentChips: true },
});
```
No `take`, no batching, no streaming. In production a long crash window or operational issue could leave thousands of stale rows. Boot would then load all of them into memory and run a sequential `for` loop of refunds (each is its own `findUnique` + `updateMany` round-trip — 2N queries total).

For a 6-table poker app this is unlikely to bite, but it's worth a `take: 10_000` cap with a warning log if the cap is hit, mirroring the row cap pattern already used in `HandHistoryRepository.findForUser`.

**Fix:**
```ts
const rows = await prisma.user.findMany({
  where: { currentTableId: { not: null } },
  select: { telegramId: true, currentTableId: true, currentChips: true },
  take: 10_000,
});
if (rows.length === 10_000) {
  console.warn('[BootRecovery] hit 10k row cap — additional sessions deferred to next restart');
}
```

### WR-05: Disconnect handler awaits prisma.user.update before arming grace timer

**File:** `server/index.ts:868-877`
**Issue:**
```ts
try {
  await prisma.user.update({
    where: { telegramId: BigInt(Number(telegramId)) },
    data: { disconnectedAt: new Date(), lastSeenAt: new Date() }
  });
} catch (err) {
  console.error('[Disconnect] failed to mark disconnectedAt:', err);
}
GraceRegistry.arm(telegramId, graceStage, seatedTable.id);
```
The grace timer (the thing that protects the seat) is armed only AFTER a DB write completes. If the DB is slow or hung (network hiccup, lock contention), the player's grace window doesn't even start ticking — the seat is held in memory but no `setTimeout` exists to vacate it.

In a pathological case (Postgres unreachable for 60s during a deploy), the disconnect handler hangs at the await, and if the new connection arrives during that window, `GraceRegistry.clear(tid)` from the new auth handler runs before `arm`, and then `arm` runs unconditionally afterwards — leaving an orphan timer for an already-reconnected player. The orphan timer fires later and tries to sit-out / vacate someone who's actively playing.

**Fix:** arm the timer first, then do the bookkeeping write:
```ts
GraceRegistry.arm(telegramId, graceStage, seatedTable.id);
// Mark disconnectedAt + lastSeenAt for ops/debug visibility (best-effort).
try {
  await prisma.user.update({
    where: { telegramId: BigInt(telegramId) },
    data: { disconnectedAt: new Date(), lastSeenAt: new Date() }
  });
} catch (err) {
  console.error('[Disconnect] failed to mark disconnectedAt:', err);
}
```

### WR-06: App.tsx socket-listener useEffect re-binds on every currentUser change

**File:** `client/src/App.tsx:281-295`
**Issue:**
```ts
return () => {
  socket.off("tablesList");
  socket.off("tableJoined");
  // …
};
}, [currentUser, hapticFeedback]);
```
Listing `currentUser` in the deps array causes the entire effect to tear down and re-bind every time `currentUser` mutates (which happens on `balanceUpdate`, `dailyBonusClaimed`, `profileUpdated`, `avatarUpdated`, `tosAccepted` — every one of these listeners triggers a re-render that re-binds itself).

The cleanup is `socket.off("event")` *without* a callback ref — that removes ALL listeners for that event, including listeners installed by other components (e.g. `ReconnectOverlay`'s `tableJoined` listener). Because cleanup runs synchronously before the new bindings, the order is: (1) `setCurrentUser` triggers re-render, (2) effect cleanup nukes all `tableJoined` listeners (including ReconnectOverlay's), (3) effect re-binds App's `tableJoined`. ReconnectOverlay's listener stays gone until ReconnectOverlay's own effect re-runs (which it doesn't, because its deps are `[socket, clearAllTimers]` and neither changed).

**Concrete impact:** a balance update during a reconnect could cause ReconnectOverlay to miss the next `tableJoined` event and never dismiss.

**Fix:** either (a) pass callback refs to `socket.off(event, handler)` instead of bare `socket.off(event)`, or (b) split the effect so the listener bindings don't depend on `currentUser`. Option (a) is the standard fix:
```ts
const onTablesList = (tablesData) => setTables(tablesData);
const onTableJoined = (payload) => { /* ... */ };
// ...
socket.on("tablesList", onTablesList);
socket.on("tableJoined", onTableJoined);
// ...
return () => {
  socket.off("tablesList", onTablesList);
  socket.off("tableJoined", onTableJoined);
  // ...
};
```
Option (b) — remove `currentUser` from deps and read it via a ref inside the effect — is also viable since none of the listeners actually need `currentUser` *at bind time*, only at fire time.

## Info

### IN-01: Test harness in reconnectHandshake.test.ts diverges from production auth handler

**File:** `server/__tests__/reconnectHandshake.test.ts:62-92`
**Issue:**
The harness comment says "Inline harness mirroring the EXACT shape of the server/index.ts auth handler." It does not mirror exactly:

- Production (`server/index.ts:271-280`) calls `updateTableState(seatedTable.id)` between `socket.emit("tableJoined", ...)` and `GraceRegistry.clear(telegramId)`.
- Production runs `userStorage.addUser(telegramId, user)` BEFORE `setSocketForTelegram`.
- Production has the entire auth body wrapped in `try/catch` that emits `authError`.

The harness omits all three. The assertions still pass because they only check `tableJoined` payload shape, `replacedBySession` event name, `getStateForPlayer` privacy path, and `GraceRegistry.clear` invocation — none of which depend on the missing parts.

If a future Plan 04-06-style edit reorders the production handler (e.g. moves `GraceRegistry.clear` BEFORE `socket.emit("tableJoined")`), this test will not catch the regression because the harness has its own ordering.

**Fix:** include `updateTableState` and `userStorage.addUser` in the harness, OR replace the inline harness with an import of the actual production handler factored into its own module. The latter is the durable answer; the former at least flags the contract clearly.

### IN-02: GraceRegistry log noise on hand-complete (re-arm prints clear+arm)

**File:** `server/GraceRegistry.ts:49, 63`
**Issue:**
`reArmIfMidHand` calls `arm()`, which calls `clear()` first. Both helpers `console.info(...)`. Result: every hand-complete that promotes a mid-hand player to between-hands grace prints two lines per affected player:
```
[Grace] cleared telegramId=1001
[Grace] armed telegramId=1001 stage=between-hands tableId=… ms=120000
```
Cosmetic; consider downgrading the `clear` log to debug-level or skipping it when called from `arm`'s self-replace path.

### IN-03: Refund swallows updateMany count===0 silently in onExpire

**File:** `server/GraceRegistry.ts:117-118`
**Issue:**
```ts
const result = await UserRepository.refundCurrentChips(telegramId);
console.info('[Grace] expired between-hands telegramId=%s — refunded %d', telegramId, result?.refunded ?? 0);
```
When `result === null` (the race-cleared / never-seated / user-not-found path documented in the helper), the log says `refunded 0` — semantically misleading because 0 implies "we ran the refund and it was 0 chips" rather than "we did nothing because someone else cleared first." Same issue in `SessionRecovery` is correctly handled (it skips logging in the null branch).

**Fix:** distinguish the two cases:
```ts
if (result) {
  console.info('[Grace] expired between-hands telegramId=%s — refunded %d', telegramId, result.refunded);
} else {
  console.info('[Grace] expired between-hands telegramId=%s — no-op (already cleared/refunded)', telegramId);
}
```

### IN-04: ReconnectOverlay test does not assert tickRef cleanup on unmount

**File:** `client/src/components/__tests__/ReconnectOverlay.test.tsx`
**Issue:**
The test suite covers debounce, countdown, terminal sub-views, replaced-by-session, and rapid disconnect/connect debounce reset. It does not cover:
1. Component unmount mid-grace — does `clearAllTimers` actually run? (Easy to verify: spy on `clearTimeout`/`clearInterval`.)
2. The wasted `setInterval` after grace expiry (WR-01).

Adding a test for case (1) would protect against future regressions if someone forgets a ref in `clearAllTimers`. Test code only.

### IN-05: refundCurrentChips return narrowing relies on caller knowing the contract

**File:** `server/db/UserRepository.ts:112-135`
**Issue:**
The helper returns `{ refunded: number } | null`, where `null` collapses three semantically distinct cases:
1. User not found (telegramId doesn't exist).
2. `currentChips IS NULL` (never seated or already cleared).
3. `currentChips IS NOT NULL` at read but UPDATE WHERE clause matched 0 rows (race-cleared between read and write).

For ops/debug, callers can't distinguish these from the return value alone. Logs in `SessionRecovery` infer "race-cleared, never seated, or user not found" all as one bucket, which is fine for the boot-sweep narrative. For `GraceRegistry.onExpire` and `leaveTable`, distinguishing might be valuable.

**Fix (low priority):** extend the return type to a discriminated union:
```ts
type RefundResult =
  | { kind: 'refunded'; amount: number }
  | { kind: 'never-seated' }
  | { kind: 'race-cleared' }
  | { kind: 'user-not-found' };
```
Or just leave it and document the bucketing explicitly in the JSDoc. Not actionable for v1.

---

_Reviewed: 2026-04-30_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
