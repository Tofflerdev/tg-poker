# Phase 4: Resilience - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `04-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-22
**Phase:** 04-resilience
**Areas discussed:** Reconnect handshake & snapshot, Grace window semantics, Boot recovery policy, Atomic balance SQL

---

## Reconnect handshake & snapshot

### Q1: Does the `sessionToken` column actually get used in v1?

| Option | Description | Selected |
|--------|-------------|----------|
| No token — telegramId alone (Recommended) | Drop column from active use. Every reconnect re-runs `validateInitData` HMAC; eviction maps by telegramId. With one client per telegramId enforced by eviction, there's nothing to disambiguate. Schema column stays for future multi-device. | ✓ |
| Mint + return, optional disambiguation | Mint UUID v4 on first auth, persist to `User.sessionToken`, return to client in `authSuccess`. Client stores in localStorage and sends back on reconnect. Server uses it ONLY to decide which socket is 'newer' on race conditions. | |
| Defer entirely — ship without column writes | Don't touch `sessionToken` column at all this phase. Same as option 1 but explicit that the column is dormant. | |

**User's choice:** No token — telegramId alone (Recommended)

---

### Q2: On reconnect, what gets sent and on which event?

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse `state` + `tableJoined` (Recommended) | Auth handler detects `getPlayerTable(telegramId)` returns a table → emits `tableJoined` with `getStateForPlayer(telegramId)` (already includes own hole cards), then `updateTableState`. No new event type. `turnExpiresAt` is already in `GameState`. | ✓ |
| New `reconnectSnapshot` event | Add a typed `reconnectSnapshot` event with `{state, tableId, seat, lastActionContext?}`. Cleaner semantics but duplicates payload. | |
| Reuse `state`, but add `tableRejoined` ack | Server emits a tiny `tableRejoined { tableId, seat }` ack first so the client can dismiss the overlay deterministically, then a normal `state` push. | |

**User's choice:** Reuse `state` + `tableJoined` (Recommended)

---

### Q3: What's in the `replacedBySession` payload to the evicted socket?

| Option | Description | Selected |
|--------|-------------|----------|
| Bare event, no payload (Recommended) | `socket.emit('replacedBySession')` then `socket.disconnect(true)`. No timestamp, no new-session-id leak. | ✓ |
| `{ at: ISO timestamp }` | Just the eviction time, useful for client-side telemetry / displaying 'Disconnected at HH:MM'. | |
| `{ at, reason: 'session-replaced' }` | Future-proofs the event for other eviction reasons (kicked-by-admin, banned, etc.). | |

**User's choice:** Bare event, no payload (Recommended)

---

### Q4: Does the snapshot need any context the current `GameState` doesn't already carry?

| Option | Description | Selected |
|--------|-------------|----------|
| Nothing extra — GameState is sufficient (Recommended) | Hole cards: already in personalized state. Turn timer remaining: `turnExpiresAt` already present. Bubble replay explicitly out (Phase 3 deferred). | ✓ |
| Add `lastAction` summary | Include the most recent `PlayerActionEvent` so the reconnected client can show recent action context. Slight bubble-replay creep. | |
| Add server-clock timestamp for drift correction | Include `serverNowMs` so the client can correctly compute remaining turn time. | |

**User's choice:** Nothing extra — GameState is sufficient (Recommended)

---

## Grace window semantics

### Q1: On socket `disconnect` (player still has a seat), what immediate server-side state change happens?

| Option | Description | Selected |
|--------|-------------|----------|
| Mark `disconnectedAt = now()`, leave seat as-is (Recommended) | Player stays in seat with chips. Existing turn timer keeps running — auto-fold on timeout if it was their turn. Grace timer is armed. | ✓ |
| Mark `disconnectedAt`, force `sittingOut` immediately | Player sat out immediately so engine skips them next hand. Loses 'come back mid-turn and finish your action' nuance. | |
| Mark `disconnectedAt`, auto-fold immediately if it's their turn | Don't wait for the turn timer. Destroys the 30 s mid-hand grace promise. | |

**User's choice:** Mark `disconnectedAt = now()`, leave seat as-is (Recommended)

---

### Q2: How is the 30 s mid-hand vs 120 s between-hands grace window selected?

| Option | Description | Selected |
|--------|-------------|----------|
| Snapshot `game.stage` at disconnect, then re-arm if hand ends (Recommended) | If `'waiting'` or `'showdown'` → 120 s. Else → 30 s. If 30 s timer still running when the hand ends, cancel it and re-arm 120 s. | ✓ |
| Always 30 s, then upgrade to 120 s if grace expired but hand still active | Single short timer always. If it expires while hand is mid-stream, sit-out the player and arm a second 120 s before vacating. | |
| Always 120 s regardless of hand state | Drop the mid-hand distinction. Violates RESILIENCE-05 literal wording. | |

**User's choice:** Snapshot `game.stage` at disconnect, then re-arm if hand ends (Recommended)

---

### Q3: On grace expiry, what happens to the seat and chips?

| Option | Description | Selected |
|--------|-------------|----------|
| Mid-hand expiry → sit-out (chips stay); between-hands expiry → vacate + refund (Recommended) | Mid-hand: 30 s expires → set `sittingOut = true`, clear `disconnectedAt`, keep `currentChips`/Table/Seat. Between-hands: 120 s → `leaveTable`, refund `currentChips` to `balance`, clear all session columns. | ✓ |
| Always sit-out on expiry; vacate only on explicit user leave or boot recovery | Both timers just sit the player out. Longer-lived seat squatters. | |
| Always vacate on expiry (refund chips, clear session) | Both timers vacate. No 'sat-out waiting for return' state. | |

**User's choice:** Mid-hand expiry → sit-out (chips stay); between-hands expiry → vacate + refund (Recommended)

---

### Q4: Client-side 'Reconnecting…' overlay behavior?

| Option | Description | Selected |
|--------|-------------|----------|
| Delayed overlay (~1.5 s), with grace countdown, dismissed on `tableJoined` (Recommended) | Wait ~1.5 s before showing overlay (avoids flicker on momentary blips). Show full-screen Neon Strip overlay with countdown. On grace expiry, swap to a non-blocking 'You were sat out / removed' state with back-to-Tables button. | ✓ |
| Instant overlay, no countdown | Show the moment socket drops. Just a spinner. Flickers on every WebSocket hiccup. | |
| Persistent banner, not full overlay | Top-of-screen Neon Strip banner; game UI stays visible behind. | |

**User's choice:** Delayed overlay (~1.5 s), with grace countdown, dismissed on `tableJoined` (Recommended)

---

## Boot recovery policy

### Q1: Default action for persisted sessions on boot (rows with `currentTableId IS NOT NULL`)?

| Option | Description | Selected |
|--------|-------------|----------|
| Always refund (Recommended) | Every restart treated as clean reset: refund `currentChips` to `balance`, clear all session columns. Players reconnect and see their balance whole. | ✓ |
| Reseat as sit-out (table must still exist) | If `currentTableId` matches PREDEFINED_TABLES → `addPlayer` then `sitOut`. If table no longer exists → fall back to refund. | |
| Hybrid by freshness | If `disconnectedAt > now() - 5 min` AND table exists → reseat sit-out. Else → refund. | |

**User's choice:** Always refund (Recommended)

---

### Q2: When in the boot sequence does recovery run?

| Option | Description | Selected |
|--------|-------------|----------|
| After `setupTableEvents` (Recommended) | Inside the existing `setTimeout(..., 1000)` block, AFTER `setupTableEvents` loop, before the `[Boot] HandHistoryQueue + retention job started` log. | ✓ |
| Before `listen()` binds the HTTP port | Run synchronously before `server.listen()`. Stronger ordering guarantee. | |
| Per-table inside `setupTableEvents` | When wiring each table's callbacks, also `recoverSessionsForTable(tableId)`. | |

**User's choice:** After `setupTableEvents` (Recommended)

---

### Q3: If `currentTableId` references a table that no longer exists in `PREDEFINED_TABLES`?

| Option | Description | Selected |
|--------|-------------|----------|
| Refund and clear (Recommended) | Treat as if 'always refund' was selected: chips back to balance, session cleared, `console.warn`. | ✓ |
| Hold session, log error | Don't refund. Risks chips locked indefinitely if no admin acts. | |
| Hold session AND refund | Defensive: both refund and warn. | |

**User's choice:** Refund and clear (Recommended)

---

### Q4: How is recovery driven — batch SQL or per-row Prisma?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-row in a Prisma `$transaction` (Recommended) | `findMany` then for each row run a transaction. Audit-logging trivial later (Phase 5); bounded blast radius. | ✓ |
| Single batched UPDATE via `$queryRaw` | One raw SQL UPDATE returning rows. Atomic, fast. Harder to instrument. | |
| `findMany` + per-row Prisma `update` (no transaction) | Same as option 1 but no transaction wrapper. Window of inconsistency on partial completion. | |

**User's choice:** Per-row in a Prisma `$transaction` (Recommended)

---

## Atomic balance SQL

### Q1: Which SQL approach for the atomic balance check?

| Option | Description | Selected |
|--------|-------------|----------|
| Prisma `updateMany` with conditional `where` (Recommended) | `prisma.user.updateMany({ where: { telegramId, balance: { gte: amount } }, data: { balance: { decrement: amount } } })`. Returns `{ count }`. Stays inside Prisma. | ✓ |
| Raw `$queryRaw UPDATE...WHERE...RETURNING` | Single round-trip, returns the row. Adds raw SQL surface. | |
| Interactive `$transaction` with read-then-write | Requires SERIALIZABLE isolation to be safe. Heavier and easier to get wrong. | |

**User's choice:** Prisma `updateMany` with conditional `where` (Recommended)

---

### Q2: What's the scope of the atomic guard?

| Option | Description | Selected |
|--------|-------------|----------|
| Buy-in (gte guard) + cashout/refund (idempotent guard) (Recommended) | Buy-in: `WHERE balance >= n`. Cashout / grace-expiry refund / boot recovery: `WHERE currentChips IS NOT NULL`. Daily bonus / hand-end winnings unchanged. | ✓ |
| Buy-in only (literal spec) | Only `joinTable` deduction gets the guard. Leaves double-credit window open. | |
| All balance writes routed through one helper | Single `atomicAdjustBalance` helper used everywhere. Most consistent, biggest refactor. | |

**User's choice:** Buy-in (gte guard) + cashout/refund (idempotent guard) (Recommended)

---

### Q3: Keep the existing pre-check at `server/index.ts:504`?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep as a UX hint, atomic SQL is the gate (Recommended) | Pre-check stays so cache catches obvious case fast. Atomic `updateMany` is authority. Defense in depth; closes Concern #5. | ✓ |
| Remove the pre-check entirely — only the atomic SQL gates | Slightly simpler; loses instant-feedback path. | |
| Keep pre-check, no atomic SQL (status quo) | Doesn't satisfy RESILIENCE-07 — not an option. | |

**User's choice:** Keep as a UX hint, atomic SQL is the gate (Recommended)

---

### Q4: On insufficient funds, what does the client see?

| Option | Description | Selected |
|--------|-------------|----------|
| `tableError` with same `Insufficient balance...` string (Recommended) | Server emits the same `tableError` string already used at `server/index.ts:505`. No new error type. | ✓ |
| New typed error event `buyInRejected` | Distinguish 'pre-check failed' vs 'atomic SQL failed'. New type to maintain. | |
| Reuse existing `errorMessage` | Generic socket error event. Less specific category. | |

**User's choice:** `tableError` with same `Insufficient balance...` string (Recommended)

---

## Claude's Discretion

(Areas where the user said "you decide" — none in this discussion. All four areas had explicit selections from Recommended options.)

## Deferred Ideas

- `reconnect_succeeded` / `reconnect_failed` PostHog events → Phase 5 (OBS-04).
- Sentry breadcrumbs around grace-timer state transitions → Phase 5 (OBS-01).
- `sessionToken` actually used for multi-device disambiguation → v1.1+.
- Server-clock drift correction in snapshot → v1.1+.
- `lastAction` summary in reconnect snapshot → v1.1+.
- Per-stake custom reconnect grace windows → already in REQUIREMENTS.md future section.
- Reseat-as-sit-out on boot recovery → reconsider only if "always refund" produces real UX complaints.
- Admin-triggered "kick / ban" reusing eviction primitive → Phase 5 (ADMIN-05).
