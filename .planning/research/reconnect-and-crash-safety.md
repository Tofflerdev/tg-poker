# Reconnect Logic & Crash Safety — Research

**Scope:** Socket.io 4.x reconnect protocol + server-crash recovery for NightRiver poker.
**Researched:** 2026-04-13
**Overall confidence:** HIGH (Socket.io docs, industry poker conventions)

---

## 1. Recommended Reconnect Protocol (Socket.io 4.x)

### Two reconnect mechanisms exist — pick one intentionally

| Mechanism | What it does | When to use | Verdict for NightRiver |
|---|---|---|---|
| **Connection State Recovery** (built-in, 4.6+) | Server buffers missed events per session for a TTL; on reconnect `socket.recovered === true` and buffered packets replay | Chat, presence, non-authoritative feeds where replaying a delta is safe | **Do NOT rely on it alone** — buffer only survives in-memory, is lost on server crash, and replaying stale game deltas (e.g. "raise 200" against a new hand) corrupts state |
| **Manual session resume** (handshake `auth`) | Client sends a durable token; server re-associates new `socket.id` with the existing player session and pushes a **full current snapshot** | Authoritative game state, anything with monetary value | **Primary mechanism** — full snapshot is idempotent and safe |

**Recommendation:** enable CSR as a cheap fallback for short network blips, but treat the manual full-snapshot resume as the contract. Always push the authoritative `GameState` via `getStateForPlayer` on every reconnect regardless of `socket.recovered`.

### Handshake shape

Client attaches a session token to the Socket.io handshake:

```ts
// client
const socket = io(SOCKET_URL, {
  auth: { initData: Telegram.WebApp.initData, sessionToken: localStorage.getItem("nr.sess") },
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 5000,
});
```

Server on `connection`:

```ts
io.on("connection", async (socket) => {
  const { initData, sessionToken } = socket.handshake.auth;
  const user = await validateInitData(initData);           // authoritative identity
  const session = await sessionStore.resume(user.telegramId, sessionToken);
  // 1. reassociate socketId → telegramId → table
  // 2. if session.currentTableId, re-join room, push full snapshot
  // 3. cancel the pending grace-period auto-fold timer (see §3)
});
```

**Key rule:** identity is re-established from `initData` HMAC, **not** from `sessionToken`. The token only disambiguates "same player on a new socket" vs "new session". This prevents session-token theft from becoming account takeover.

### Session store

- Keyed by `telegramId` (not socketId).
- Lives **in the `TableManager` memory** for the hot path (O(1) seat lookup) **and mirrored to Postgres** for crash recovery (§2).
- On `disconnect`, do **not** remove the session — mark `disconnectedAt = Date.now()` and start the grace timer.

---

## 2. What Survives a Crash vs. a Socket Drop

| State | Socket drop (process alive) | Server crash (process restart) | Storage |
|---|---|---|---|
| `telegramId` → `socketId` map | rebuild on reconnect | rebuild on reconnect | memory only |
| `currentTableId` | keep in memory | **must restore** | **Postgres** (on User) |
| Seat index | keep in memory | **must restore** | **Postgres** (on User) |
| `currentChips` (stack) | keep in memory | **must restore**, or refund | **Postgres** (on User; checkpoint each hand) |
| Hole cards | keep in memory | **lost** — hand is void, refund bet, start next hand | memory only |
| In-flight bet (`bet`, `totalBet`) | keep in memory | lost with hand | memory only |
| Turn deadline (`turnExpiresAt`) | keep in memory, extend on resume if within grace | lost with hand | memory only |
| Pending action (fold/call/raise) | N/A — client re-reads from snapshot | lost with hand | never persisted |
| Pot state, community cards, deck | keep in memory | lost with hand | memory only |
| Hand history (completed) | write async after showdown | must be already committed | **Postgres** |

**Principle:** persist the *economic* state (which table, how many chips) at hand boundaries; let the *in-flight hand* be ephemeral. On crash-recovery boot, for any User with `currentTableId != null`, **do not restore mid-hand** — either reseat them at the same table with `currentChips` if the table is still configured and open, or credit `currentChips` back to `balance` and clear `currentTableId`. The in-flight bet for the dead hand is forgiven (equivalent to a tournament clock stoppage).

**Checkpoint cadence for `currentChips`:** write on (a) buy-in, (b) every `showdown` completion for every surviving player, (c) cashout/leave. Do **not** write on every bet — too chatty and unnecessary since intra-hand state is void on crash.

---

## 3. Grace Period (Disconnect Protection)

**Industry norms for online cash poker (PokerStars, GGPoker, 888):** 30–90 seconds "disconnect protection" per hand, often limited to N uses per session. Tournament standards use a time bank (15–30s) that auto-folds after depletion.

**Recommended for NightRiver:**

| Event | Behaviour |
|---|---|
| Socket `disconnect` mid-hand | Mark player `disconnected=true`; freeze current turn timer if it is their turn (give them `gracePeriod` seconds to reconnect **or** the remaining `turnExpiresAt`, whichever is larger, capped at 30s) |
| No reconnect within **30s** mid-hand | Auto-fold this hand; keep seat, keep chips, mark `sittingOut=true` for subsequent hands |
| No reconnect within **120s** between hands | Auto-cashout: credit chips back to balance, remove from seat |
| Player reconnects within grace | Clear flag, resume with full snapshot; turn timer continues where it left off |

Expose `gracePeriod` in table config (like `turnTime`) — cash tables 30s, high-stakes perhaps 20s.

**Implementation sketch:**

```ts
// TableManager.handleDisconnect (revised)
handleDisconnect(socketId: string) {
  const telegramId = userStorage.getTelegramId(socketId);
  const tableId = this.playerToTable.get(telegramId);  // keyed by telegramId, not socketId
  if (!tableId) return;
  const table = this.tables.get(tableId)!;
  table.markDisconnected(telegramId);
  const timer = setTimeout(() => this.evictAfterGrace(telegramId, tableId), 30_000);
  this.graceTimers.set(telegramId, timer);
}

resume(telegramId: string, newSocketId: string) {
  const t = this.graceTimers.get(telegramId);
  if (t) { clearTimeout(t); this.graceTimers.delete(telegramId); }
  // rebind socket → table room, push snapshot
}
```

Note the key change: the `playerToTable` map must be keyed by `telegramId`, not `socketId`. Today it is keyed by `socketId` (see `CONCERNS.md` #1) which makes resume impossible.

---

## 4. Edge Cases

### Double-connect (old socket still alive)
On new connection for a `telegramId` already associated with a live socket, **disconnect the old socket** (`oldSocket.disconnect(true)`) before rebinding. Emit `replacedBySession` to the old client so it can show a friendly "opened in another tab" screen. Never allow two sockets to both send actions for the same seat.

### Reconnect during showdown
`lastShowdown` is part of `GameState`. Pushing the full snapshot naturally includes it. Client shows the showdown UI briefly, then the normal next-hand countdown (`nextHandIn`) takes over. No special case needed.

### Reconnect after the hand ended
If the disconnect happened mid-hand and the hand has since completed (auto-folded), the snapshot shows the player at their seat with updated chips and `sittingOut=true` (or still active if they reconnected between hands). Show a small toast: "You were folded while offline."

### Reconnect to a table that was disabled by admin
- If `table.status === 'disabled'` and player's `currentTableId` points there: on resume, refund `currentChips` to balance, clear `currentTableId`, emit `tableClosed` with reason "Table was taken offline by an administrator", route client back to table list.
- Admin "disable" should trigger a graceful shutdown of in-progress tables: finish current hand, refund everyone, then flip status to `disabled`. Reconnects during that window see the same refund path.

### Server crash mid-hand then reconnect
On boot, `restoreSessions()` reads every `User` with `currentTableId != null`:
- If the table is `enabled` and seat is free → reseat with `currentChips`, `sittingOut=true` until they reconnect.
- Otherwise → credit `currentChips` to `balance`, clear `currentTableId`, emit `tableClosed` with reason "Server restarted".

### Zero-chip reconnect
Already handled today (eviction at 0 chips). On reconnect with `currentChips=0` and `currentTableId` cleared, route to table list.

### `initData` expired between connect and reconnect
Telegram `initData` has a TTL (24h recommended). If it fails HMAC on reconnect, emit `authError` and force the client to re-open the Mini App (which refreshes `initData`).

---

## 5. Minimal Prisma Schema Additions

```prisma
model User {
  // ... existing fields ...

  // --- session / crash-safety ---
  currentTableId   String?   // FK-less string; table IDs are from config, not a DB table
  currentSeat      Int?      // 0..5
  currentChips     Int?      // stack at last checkpoint (buy-in, or post-showdown)
  sessionToken     String?   @db.VarChar(64)   // opaque UUID, rotated on login
  disconnectedAt   DateTime?                    // set when socket drops; nulled on resume
  lastSeenAt       DateTime?                    // heartbeat, useful for ops/admin panel

  @@index([currentTableId])  // for restoreSessions() on boot
}

// Optional: completed-hand log (feeds "hand history" feature from PROJECT.md item 4)
model HandHistory {
  id           String   @id @default(cuid())
  telegramId   String
  tableId      String
  handNumber   Int
  won          Boolean
  delta        Int       // +winnings or -lost chips
  potAmount    Int
  holeCards    Json      // [{rank,suit}, {rank,suit}]
  communityCards Json
  showdown     Json?     // optional detailed eval
  playedAt     DateTime @default(now())

  @@index([telegramId, playedAt(sort: Desc)])
  @@index([tableId, playedAt])
}
```

### Justification

- **`currentTableId` + `currentSeat` + `currentChips`** — the triple needed to reseat after a crash or a multi-device switch. Integer nullable is sufficient; no need for a `Table` DB model since tables are config-defined.
- **`sessionToken`** — opaque rotate-per-login string; used only to disambiguate concurrent sessions for the same `telegramId`. Identity still comes from `initData`.
- **`disconnectedAt`** — powers grace-period eviction job and the admin panel's "idle players" widget.
- **`lastSeenAt`** — cheap heartbeat for ops/analytics. Update on every action, debounced (e.g. every 30s).
- **Index on `currentTableId`** — `restoreSessions()` does one scan per table on boot; small (<= 6 × 6 rows) but index makes the query trivially fast and self-documenting.
- **`HandHistory`** — not strictly reconnect-scoped, but writing it at showdown is the same crash-safety checkpoint moment. Separate table to keep `User` row small and append writes cheap. Satisfies PROJECT.md item 4.

### Migration impact

All additions are nullable or new tables — zero risk to existing rows. A single `prisma migrate dev --name reconnect_and_crash_safety` suffices.

---

## Sources

- Socket.io Connection State Recovery — HIGH — https://socket.io/docs/v4/connection-state-recovery
- Socket.io Handshake `auth` field — HIGH — https://socket.io/docs/v4/middlewares/#sending-credentials
- Socket.io reconnection options — HIGH — https://socket.io/docs/v4/client-options/#reconnection
- PokerStars Disconnect Protection policy (industry norm, 30–90s) — MEDIUM — public help articles
- GGPoker / 888 time-bank conventions — MEDIUM — public rules pages
- NightRiver codebase — `CONCERNS.md` #1, #2, #14; `ARCHITECTURE.md` §Data Flow — HIGH
