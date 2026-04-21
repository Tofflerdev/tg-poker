---
phase: 03-gameplay-additions
reviewed: 2026-04-21T17:05:58Z
depth: standard
files_reviewed: 31
files_reviewed_list:
  - client/package.json
  - client/src/components/ActionBubble.tsx
  - client/src/components/ActionBubbleLayer.tsx
  - client/src/components/HandHistoryList.tsx
  - client/src/components/HandHistoryRow.tsx
  - client/src/components/__tests__/ActionBubble.test.tsx
  - client/src/components/__tests__/ActionBubbleLayer.test.tsx
  - client/src/components/__tests__/HandHistoryList.test.tsx
  - client/src/components/__tests__/HandHistoryRow.test.tsx
  - client/src/hooks/__tests__/useHandHistory.test.ts
  - client/src/hooks/useHandHistory.ts
  - client/src/pages/GameRoom.tsx
  - client/src/pages/ProfileSettings.tsx
  - client/src/test/setup.ts
  - client/src/test/smoke.test.tsx
  - client/vitest.config.ts
  - package.json
  - server/HandHistoryQueue.ts
  - server/__tests__/HandHistoryQueue.test.ts
  - server/__tests__/HandHistoryRepository.privacy.test.ts
  - server/__tests__/actionBubbleBroadcast.test.ts
  - server/__tests__/checkpointSeatedPlayers.test.ts
  - server/__tests__/getHandHistory.test.ts
  - server/__tests__/handHistoryRetention.test.ts
  - server/__tests__/setup.ts
  - server/checkpointSeatedPlayers.ts
  - server/db/HandHistoryRepository.ts
  - server/db/UserRepository.ts
  - server/index.ts
  - tests/smoke.test.ts
  - types/index.ts
  - vitest.config.server.ts
findings:
  critical: 0
  warning: 4
  info: 7
  total: 11
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-04-21T17:05:58Z
**Depth:** standard
**Files Reviewed:** 31
**Status:** issues_found

## Summary

Phase 3 adds three substantial features: action bubbles (client + server broadcast), hand history persistence + retention (server queue, repository, reader), and a Profile → History tab (hook + list + row). Overall code quality is high — the team consistently calls out security threats (T-3-PRIVACY, T-3-AUTHZ, T-3-DOS, T-3-INFO-LEAK, T-3-XSS-CLIENT) inline, mirrors plan decision ids in comments, and provides strong test coverage (privacy filter, retries/backoff, retention cadence, timeout, authz). No Critical findings.

The Warnings center on four themes:
1. A type-contract mismatch: several handlers emit `authError` with an object, but the declared server→client signature is `(msg: string)` — clients will receive unexpected shapes.
2. `HandHistoryRow` is a click-interactive element rendered as `role="listitem"` with `onClick` — not keyboard-operable and fails WCAG 2.1.1 Keyboard for non-touch users.
3. `UserRepository.updateStats` still contains a pre-existing "wrong then patched" two-step biggestPot update that can overwrite a larger historical value (TOCTOU).
4. `HandHistoryRepository.findForUser` step-2 query is unbounded per hand — defensive only, but worth a comment-backed cap.

Info findings cover minor concerns: stale-closure re-renders in `GameRoom`, `bubbleIdCounter` as module-level mutable state, string literal used for a non-declared socket event (`sessionReplaced`), `(table: any)` / `result: any` in forwarders, and a small dead-state edge in `HandHistoryList` when `active=false`.

## Warnings

### WR-01: `authError` payload type contradicts declared signature

**File:** `server/index.ts:278,310,341,356,441,490,550,588,763`
**Issue:** `ServerEvents.authError` is declared in `types/index.ts:108` as `(msg: string) => void`, but nine call sites pass an object and suppress the type error with `as any`:

```ts
socket.emit("authError", { message: 'Not authenticated' } as any);
```

Clients that subscribe to `authError` expecting a string will either render `[object Object]`, fail downstream string operations (`.toLowerCase()`, `.includes()`, etc.), or silently misroute. The `as any` cast hides the breakage at build time.

**Fix:** Either broaden the declared type or normalize the payload. Preferred — update the type and all sites to a single shape:

```ts
// types/index.ts
authError: (msg: string | { message: string }) => void;

// server/index.ts — drop `as any`
socket.emit("authError", "Not authenticated");
// or, if structured errors are desired:
socket.emit("authError", { message: 'Not authenticated' });
```

Pick one and grep/replace all nine sites so the wire format is consistent.

---

### WR-02: `HandHistoryRow` is click-interactive with non-interactive role — no keyboard handler

**File:** `client/src/components/HandHistoryRow.tsx:88-97`
**Issue:** The row is rendered as `<Card role="listitem" onClick={...} aria-expanded={...}>`. A `listitem` is not a keyboard-operable element: it has no implicit `tabIndex`, no Enter/Space-to-click semantics, and screen readers will not announce the expandable behaviour. Tap-only interactivity violates WCAG 2.1.1 Keyboard, and users on external keyboards (Telegram Desktop / Telegram Web) cannot expand the row at all.

**Fix:** Either make the card a real `<button>` (preferred) or add `tabIndex`, `role="button"`, and a keyboard handler:

```tsx
<Card
  role="button"
  tabIndex={0}
  aria-expanded={expanded}
  aria-label={`Hand at ${row.tableName}, ${result.text}`}
  onClick={() => onToggle(row.handId)}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle(row.handId);
    }
  }}
  // ...
>
```

Also update `HandHistoryList.tsx:131` — `role="list"` expects children with `role="listitem"`, so if you change to `role="button"` restructure to a plain `<div>` wrapper with the buttons inside, or use nested roles (`list` → `listitem` → inner `button`). The `HandHistoryList.test.tsx` assertion on `getAllByRole('listitem')` will need to match the final shape.

---

### WR-03: `updateStats` can overwrite a larger existing `biggestPot` (TOCTOU race)

**File:** `server/db/UserRepository.ts:189-210`
**Issue:** Two problems in one method:

(1) The first `prisma.user.update` call unconditionally `set`s `biggestPot` to `Math.max(winnings, 0)` when `winnings > 0`:

```ts
biggestPot: winnings > 0 ? { set: Math.max(winnings, 0) } : undefined
```

If the user already has `biggestPot=5000` and this hand pays out `winnings=200`, `biggestPot` is clobbered to `200`.

(2) The subsequent "Correct logic for biggest pot" block reads then writes `biggestPot` in two non-atomic queries. Between the `findUnique` and the follow-up `update`, another concurrent `updateStats` call (another hand completes) can race. One of the writes loses its update.

**Fix:** Collapse into a single atomic conditional update — Prisma 7 supports a raw update expression, or use a transaction with a row lock:

```ts
// Drop the buggy first-pass `set` and do the read-modify-write atomically
await prisma.$transaction(async (tx) => {
  const u = await tx.user.findUnique({ where: { telegramId: BigInt(telegramId) }});
  if (!u) return;
  await tx.user.update({
    where: { telegramId: BigInt(telegramId) },
    data: {
      handsPlayed: { increment: 1 },
      handsWon: won ? { increment: 1 } : undefined,
      totalWinnings: { increment: winnings },
      biggestPot: winnings > u.biggestPot ? winnings : undefined,
    },
  });
});
```

NOTE: This was pre-existing (not introduced by Phase 3) but the file is in the review scope. Flagging so it is not lost.

---

### WR-04: `HandHistoryRepository.findForUser` step-2 query has no row cap

**File:** `server/db/HandHistoryRepository.ts:114-116`
**Issue:** The step-2 `findMany` fetches every row whose `handId` is in the requesting user's last 50 `handIds` with no `take:` clause. The comment argues this is bounded: "at most 6 rows per handId (max table size), so cap=50 → ≤ 300 rows." That is true only if the database invariant (one row per seat per hand, max 6 seats) is upheld. If a future migration/import/bug writes duplicate rows per seat-per-hand, this query returns unbounded rows — there is no defensive cap at read time.

Because `findForUser` is invoked by an authenticated, per-socket handler with no rate limit, a flaw in the writer side amplifies into a DoS vector.

**Fix:** Add a defensive `take:` to the step-2 query (6 × 50 = 300 is the documented ceiling; use 512 or 600 to allow ≤2× headroom without changing semantics):

```ts
const allRows = await prisma.handHistory.findMany({
  where: { handId: { in: handIds } },
  take: handIds.length * 6 + 32, // defensive cap; matches 6-max seat ceiling
});
```

Pair this with a unique index `@@unique([handId, telegramId])` on the Prisma schema to prevent duplicate opponent rows at the writer layer.

## Info

### IN-01: `GameRoom.useEffect` on `[currentPlayer, mySeat, isMyTurn, ...]` causes redundant re-renders

**File:** `client/src/pages/GameRoom.tsx:60-69`
**Issue:** The effect reads `isMyTurn`, computes `nowMyTurn`, compares, and then calls `setIsMyTurn(nowMyTurn)`. Because `isMyTurn` is in the dependency array, the state update re-runs the effect; in the second run `wasMyTurn === nowMyTurn` so nothing fires, but React still runs the effect body and re-renders. Works correctly, just wasteful.

**Fix:** Drop `isMyTurn` from deps and use a `useRef` for the previous value, OR derive `isMyTurn` during render without state:

```ts
const isMyTurn = mySeat !== null && gameState.currentPlayer === mySeat;
const prevIsMyTurnRef = useRef(false);
useEffect(() => {
  if (!prevIsMyTurnRef.current && isMyTurn) {
    hapticFeedback?.notificationOccurred("warning");
  }
  prevIsMyTurnRef.current = isMyTurn;
}, [isMyTurn, hapticFeedback]);
```

---

### IN-02: `bubbleIdCounter` is module-level mutable state

**File:** `client/src/components/ActionBubbleLayer.tsx:69-73`
**Issue:** `let bubbleIdCounter = 0;` and `nextBubbleId()` live at module scope. Uniqueness holds because the id template includes `Date.now()`, but sharing mutable module state across component instances is a smell (and makes HMR reloads and tests sensitive to ordering).

**Fix:** Hoist the counter into a `useRef` inside the component:

```tsx
const counterRef = useRef(0);
const nextBubbleId = () => `b-${Date.now()}-${++counterRef.current}`;
```

---

### IN-03: `socket.emit('sessionReplaced' as any)` uses a non-declared event name

**File:** `server/index.ts:239`
**Issue:** `sessionReplaced` is not in `ExtendedServerEvents` and the call is cast to `any`. The declared types therefore cannot protect the wire contract for this event, and client-side subscribers have no typed way to listen.

**Fix:** Add the event to `types/index.ts`:

```ts
// types/index.ts — ExtendedServerEvents
sessionReplaced: (payload?: { reason?: string }) => void;
```

Then drop the `as any` cast.

---

### IN-04: Loose `any` typing in two table handlers

**File:** `server/index.ts:92,674`
**Issue:** `handleTableShowdown(tableId: string, result: any)` and `checkShowdownAndUpdate(table: any, tableId: string)` defeat the type system. The project already exports `ShowdownResult` and a `Table` wrapper type; using them here would catch mis-shaped payloads at compile time.

**Fix:**

```ts
import type { ShowdownResult } from "../types/index.js";
import type { Table as TableModel } from "./models/Table.js"; // or the concrete class

const handleTableShowdown = (tableId: string, result: ShowdownResult) => { /* ... */ };
const checkShowdownAndUpdate = (table: TableModel, tableId: string) => { /* ... */ };
```

---

### IN-05: `HandHistoryList` shows "No hands yet" when `active=false`

**File:** `client/src/components/HandHistoryList.tsx:27-127`
**Issue:** When `active=false`, `useHandHistory` returns `{ rows: null, loading: false, error: null }`. The component falls through to the empty-state branch `(!rows || rows.length === 0)` and renders "No hands yet". Today this is unreachable because `HandHistoryList` is conditionally mounted only when the History tab is active (`ProfileSettings.tsx:503`). If that invariant ever breaks (e.g. a parent decides to keep the component mounted for perf and toggle `active`), the UI lies to the user.

**Fix:** Explicitly guard the inactive state:

```tsx
if (!active) return null; // or a neutral placeholder
```

Or distinguish "unloaded" from "empty" in the hook state (e.g. `loading: boolean` starts `null`).

---

### IN-06: `UserRepository.checkpointSeat` uses `BigInt(Number(telegramId))` double-conversion

**File:** `server/db/UserRepository.ts:145`
**Issue:** `BigInt(Number(telegramId))` round-trips through JS `Number`. Today's Telegram IDs (≤ 10 digits) are well within `Number.MAX_SAFE_INTEGER` (2^53 − 1), but if Telegram ever extends IDs past 15 digits the `Number` coercion silently truncates precision before `BigInt` recovers it. The code comment acknowledges the assumption; a direct `BigInt(telegramId)` from the string representation would be future-proof.

**Fix:**

```ts
where: { telegramId: BigInt(telegramId) }, // string is already a valid BigInt literal
```

---

### IN-07: `HandHistoryList` timeout test relies on socket mock state only

**File:** `client/src/components/__tests__/HandHistoryList.test.tsx:79-85`
**Issue:** The test "renders error state when no response within 5 seconds (timeout)" advances fake timers by 5000 ms and asserts the error UI. If `useHandHistory`'s `REQUEST_TIMEOUT_MS` is ever changed, this test silently passes at a different threshold (or fails opaquely). Consider importing the timeout constant from the hook so the test fails loudly if the contract changes.

**Fix:** Export the constant from the hook and import it into the test:

```ts
// useHandHistory.ts
export const REQUEST_TIMEOUT_MS = 5000;

// HandHistoryList.test.tsx
import { REQUEST_TIMEOUT_MS } from '../../hooks/useHandHistory';
act(() => { vi.advanceTimersByTime(REQUEST_TIMEOUT_MS); });
```

---

_Reviewed: 2026-04-21T17:05:58Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
