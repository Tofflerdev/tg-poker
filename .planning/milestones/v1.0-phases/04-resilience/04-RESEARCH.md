# Phase 4: Resilience - Research

**Researched:** 2026-04-29
**Domain:** Reconnect-resume + boot-time crash recovery + atomic balance SQL on top of an existing telegramId-keyed Socket.io / Prisma stack
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### A. Reconnect Handshake & Snapshot (RESILIENCE-04)

- **D-A1:** No `sessionToken` use in v1. Schema column from Phase 1 D-14 stays in place but is never read or written by Phase 4. Every reconnect re-runs `validateInitData` HMAC. Eviction is keyed solely by `telegramId` via the existing `tableManager.socketByTelegram` map.
- **D-A2:** Reuse existing `state` + `tableJoined` events on reconnect. No new `reconnectSnapshot` event type. Auth handler at `server/index.ts:208`: after `setSocketForTelegram`, if `tableManager.getPlayerTable(telegramId)` returns a table, emit `tableJoined { tableId, seat, state: getStateForPlayer(telegramId) }` to the new socket and run `updateTableState(tableId)` to refresh other seats.
- **D-A3:** `replacedBySession` is a bare event with no payload (rename of Phase 1 D-07 placeholder `sessionReplaced`). After emit, server calls `socket.disconnect(true)`. The evicted client renders a static "You were logged in elsewhere" notice.
- **D-A4:** `GameState` payload is sufficient for resume — no `lastAction` summary, no `serverNowMs` clock-drift correction in v1.

#### B. Grace Window Semantics (RESILIENCE-05)

- **D-B1:** On `disconnect`, mark `disconnectedAt = now()` and leave the seat as-is. No immediate sit-out, no immediate auto-fold. Existing `Game.TURN_TIME_LIMIT = 30000` continues to run independently.
- **D-B2:** Grace duration set by snapshot of `game.stage` at disconnect. If `stage === 'waiting'` or `stage === 'showdown'` (or no active hand) → 120 s timer. Else → 30 s timer. If the 30 s mid-hand timer is still running when the hand ends, cancel it and re-arm a fresh 120 s between-hands timer.
- **D-B3:** Two-stage grace expiry:
  - **Mid-hand (30 s) expiry** → set `sittingOut = true` on the player, clear `disconnectedAt`, KEEP `currentChips` / `currentTableId` / `currentSeat`. Player can reconnect later and `sitIn`. Their seat remains held.
  - **Between-hands (120 s) expiry** → `tableManager.leaveTable(telegramId)`, refund `currentChips` to `balance` via the atomic refund path (D-D2), clear all session columns.
- **D-B4:** Client "Reconnecting…" overlay UX:
  - **Trigger:** socket `disconnect` event → start a 1500 ms debounce timer. On reconnect-before-debounce, never show overlay.
  - **Render:** full-screen Neon Strip overlay (`rgba(10,10,14,0.9)` + `backdrop-blur(12px)`), centered cyan-glowing "Reconnecting…" text with depleting countdown.
  - **Countdown source:** client computes from grace duration locally. Mid-hand vs between-hands inferred from last `GameState.stage` before disconnect.
  - **Dismissed on:** next `tableJoined` event.
  - **On grace expiry:** swap content to non-blocking "You were sat out — your seat is held" (mid-hand) or "You were removed from the table — chips returned to balance" (between-hands) with a single "Back to Tables" button.

#### C. Boot Recovery Policy (RESILIENCE-06)

- **D-C1:** Always refund on boot. Every persisted session (`currentTableId IS NOT NULL`) is treated as a clean reset — no reseat-as-sit-out branch. For each row: refund `currentChips` to `balance` and clear all session columns.
- **D-C2:** Recovery runs after `setupTableEvents`, before `[Boot] HandHistoryQueue + retention job started`. Position: inside the existing `setTimeout(..., 1000)` block at `server/index.ts:182`.
- **D-C3:** Stale `currentTableId` (no match in `PREDEFINED_TABLES`) → refund + warn. `console.warn('[BootRecovery] stale tableId %s for telegramId=%s — refunded', tableId, telegramId)`.
- **D-C4:** Per-row Prisma `$transaction`. `prisma.user.findMany({ where: { currentTableId: { not: null } } })` → for each row run `prisma.$transaction([...])` doing the refund + column clear via the same atomic helper from D-D2.

#### D. Atomic Balance SQL (RESILIENCE-07)

- **D-D1:** Prisma `updateMany` with conditional `where` is the SQL form. No raw `$queryRaw`, no read-then-write transactions:
  ```ts
  const result = await prisma.user.updateMany({
    where: { telegramId, balance: { gte: amount } },
    data:  { balance: { decrement: amount } }
  });
  if (result.count === 0) { /* insufficient funds */ }
  ```
- **D-D2:** Two guards by domain:
  - **Buy-in path** (`server/index.ts:526` + legacy `join` at `:739`): `WHERE balance >= n` — refuse on insufficient funds.
  - **Cashout / grace-expiry refund / boot-recovery refund:** `WHERE currentChips IS NOT NULL` idempotency guard (capture `currentChips` first, then update with `IS NOT NULL` guard).
  - **Daily bonus / hand-end winnings:** unchanged — already-safe paths.
- **D-D3:** Keep the existing pre-check at `server/index.ts:504` (`user.balance < tableInfo.config.buyIn`) as a UX hint. The atomic `updateMany` is the actual gate; its `count === 0` path ALSO emits `tableError` and aborts the join (rolling back the in-memory `joinTable` if it already happened).
- **D-D4:** Reuse existing `tableError` event with the same `"Insufficient balance. Buy-in is N"` string. No new typed error event in v1.

### Claude's Discretion

- File names / module layout: likely `server/SessionRecovery.ts` (boot recovery sweep) and `server/GraceRegistry.ts` (per-telegramId grace timer registry) — but a single `server/Resilience.ts` colocating both is acceptable.
- Atomic balance helpers can live in `server/db/UserRepository.ts` (extending it) or in a new `server/db/BalanceRepository.ts` — implementer's choice.
- Internal data structure of the grace-timer registry (`Map<telegramId, { timer, stage, expiresAt }>` or similar).
- Exact wording / Russian/English copy for overlay states.
- Whether the overlay shows a manual "Cancel and go to Tables" button before grace expires.
- Whether boot recovery emits a structured log line per recovered session (recommended).
- Whether to add a small `console.info` on every grace-timer arm/cancel/expiry for ops visibility (recommended).
- TypeScript types for new socket events (`replacedBySession`) added to `types/index.ts` `ExtendedServerEvents`.

### Deferred Ideas (OUT OF SCOPE)

- `reconnect_succeeded` / `reconnect_failed` PostHog events → Phase 5 (OBS-04).
- Sentry breadcrumbs around grace-timer state transitions → Phase 5 (OBS-01).
- `sessionToken` column actually used for multi-device disambiguation → v1.1+.
- Server-clock drift correction (`serverNowMs` in snapshot) → v1.1+.
- `lastAction` summary in reconnect snapshot → v1.1+.
- Bubble replay on reconnect → already deferred in Phase 3.
- Per-stake custom reconnect grace windows → REQUIREMENTS.md future section.
- Reseat-as-sit-out on boot recovery → not in v1.
- Admin-triggered "kick / ban" reusing the eviction primitive → Phase 5 (ADMIN-05).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RESILIENCE-02 | Economic state (`currentChips`/`currentTableId`/`currentSeat`) is written at hand boundaries via `onHandComplete`; mid-hand ephemeral state never persisted. | Substrate landed in Phase 3 D-14/D-17 via `checkpointSeatedPlayers` (server/checkpointSeatedPlayers.ts). Phase 4 EXTENDS — adds the leaves-table refund path that Phase 3 D-16 explicitly carved out. |
| RESILIENCE-04 | On socket reconnect, server re-verifies `initData` HMAC every time, emits `replacedBySession` to any prior socket, evicts it, and sends a full `GameState` snapshot including the player's own hole cards. | `validateInitData` already runs on every connect (`server/middleware/auth.ts:40`); `setSocketForTelegram` already evicts (`server/TableManager.ts:262`); `getStateForPlayer` already reveals own hole cards (`server/Game.ts:890`); only the rename `sessionReplaced → replacedBySession` and the post-eviction `tableJoined+state` emit are new. |
| RESILIENCE-05 | Client shows "Reconnecting…" overlay during disconnect; grace 30 s mid-hand / 120 s between hands before sat-out / vacated. | New `GraceRegistry` module + new `ReconnectOverlay` component. Pattern mirrors `HandHistoryQueue` singleton-as-module. Stage detection via existing `game.stage` at disconnect (sync, no DB). |
| RESILIENCE-06 | On server boot, recovery module reads persisted session rows and (per D-C1) refunds `currentChips`, clears session columns. Never restores in-flight hand state. | `User.@@index([currentTableId])` already in schema (`prisma/schema.prisma:36`); per-row Prisma `$transaction` is idiomatic. Recovery hooks into existing `setTimeout(..., 1000)` block at `server/index.ts:182`. |
| RESILIENCE-07 | Buy-in / cashout balance transitions use atomic SQL (`UPDATE ... WHERE balance >= :n`) and refuse on insufficient funds. | Verified Prisma 7 `updateMany` returns `{ count }`, supports `gte`/`not: null` filters, and supports `decrement`/`increment` atomic operations in `data`. Lost-update bug (issue #8612) was fixed in Prisma 4.4.0; we run 7.4.2. |
</phase_requirements>

## Summary

Phase 4 closes the three highest-severity items in `.planning/codebase/CONCERNS.md` (#1 reconnect, #2 crash safety, #5 buy-in race) on top of the substrate Phase 1 and Phase 3 already laid down. The substrate is good — `telegramId` keying, `socketByTelegram` map with eviction hook, all session columns + `@@index([currentTableId])`, `getStateForPlayer` revealing own hole cards, `Game.ts` engine I/O-free with intact turn timer, `checkpointSeatedPlayers` writing chips at every hand boundary. The Phase 4 work is therefore largely **additive**: rename one event, extend the auth handler with one snapshot push, add a grace-timer module, add a boot-recovery sweep, and convert two `updateBalance` increments to atomic `updateMany` writes.

The only domain-specific gotchas (all small) are: (1) the disconnect handler currently does the 30s-late "leaveTable + refund" eagerly — it must be replaced with a grace-aware path; (2) the eviction event currently emits `'sessionReplaced' as any` — that cast must come out and the event added to `ExtendedServerEvents`; (3) the buy-in path currently has a stale `// Rollback join? For now just log error` TODO that becomes a real rollback in this phase; (4) the `App.tsx` socket lifecycle is currently completely bare — connect/disconnect handlers must be wired with the 1500 ms debounce.

**Primary recommendation:** Treat Phase 4 as a five-task plan keyed off the four decision blocks A/B/C/D plus the client overlay (E). Each block maps cleanly to one new file or one focused edit, with the `GraceRegistry` borrowing the singleton-as-module + `__resetForTests` pattern from `HandHistoryQueue`. No new npm dependencies. All tests use the existing Vitest + RTL infrastructure already running in `npm run test:server` and `npm run test:client`.

## Project Constraints (from CLAUDE.md)

- **Stack lock:** Node.js + Express + Socket.io 4.7.5 + TypeScript (ES2022, NodeNext modules); React 18 + Vite + Tailwind 4 client; PostgreSQL 16 via Prisma 7.4.2 with `@prisma/adapter-pg`. No new top-level dependencies in this phase per CONTEXT.md "no new npm dependencies."
- **Communication is Socket.io only** — no REST API for game logic. New `replacedBySession` event must be a typed Socket.io event in `types/index.ts`.
- **Auth model:** Telegram `initData` HMAC validation via `crypto-js` / `crypto.timingSafeEqual` (Phase 1 D-20). Phase 4 re-runs HMAC on every connect (D-A1) — DO NOT introduce session-token-as-auth.
- **Predefined tables:** all 6 tables in `server/config/tables.ts`, not dynamically created. Boot recovery (D-C3) treats unknown `currentTableId` values as stale and refunds; never tries to reseat into a non-existent table.
- **Production CORS:** restricted to `https://tgp.isgood.host` — irrelevant to Phase 4 logic but the dev-only `ALLOW_DEV_AUTH` bypass MUST not interfere with reconnect (verified: `validateInitData` returns a synthetic `WebAppInitData` for the bypass, the rest of the auth flow is unchanged).
- **Neon Strip overlay:** `rgba(10,10,14,0.85-0.9)` + `backdrop-blur(12px)`; cyan `#00e5ff` for active/glow, red `#ff4757` for terminal/error states, amber `#ffab00` for chips. Buttons 56 px height, `paddingBottom: max(env(safe-area-inset-bottom), 12px)` on bottom-docked panels. Use existing CSS custom properties from `client/src/styles/neon.css` (NOT hard-coded hex values — Phase 1 D-03 banned orphan literals).
- **Mobile WebSocket reality:** Telegram Mini App on mobile drops the WebSocket frequently for ~300–800 ms during transport changes. The 1500 ms overlay debounce (D-B4) is calibrated for this — research confirms socket.io 4.x reconnect cycles complete within ~1 s on healthy networks, so showing the overlay only after 1500 ms catches genuine disconnects without flickering on routine hiccups.

## Standard Stack

### Core (already in tree — Phase 4 reuses, does not add)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@prisma/client` | 7.4.2 (verified) | DB ORM | Already configured with `@prisma/adapter-pg`; `updateMany` is the idiomatic atomic-with-where path [VERIFIED: npm view @prisma/client version → 7.8.0 latest, but project runs 7.4.2 which has all needed features per `package.json:16`] |
| `@prisma/adapter-pg` | 7.4.2 | Postgres driver adapter | Required by Prisma v7 for raw pg.Pool usage; already wired in `server/db/prisma.ts` [VERIFIED: server/db/prisma.ts:7] |
| `pg` | 8.19.0 | Postgres connection pool | Used by the adapter; no direct usage in Phase 4 [VERIFIED: package.json:23] |
| `socket.io` | 4.7.5 | Server transport | Already running; `socket.disconnect(true)` is the eviction primitive (D-A3) [VERIFIED: package.json:24, also CITED: socket.io.com docs/v4/server-socket-instance] |
| `socket.io-client` | 4.7.5 | Client transport | Single instance in `client/src/App.tsx:34`; reconnect logic already automatic [VERIFIED: client/package.json:13, CITED: socket.io.com/docs/v4/client-socket-instance] |
| `crypto` (node built-in) | — | `setTimeout`/`clearTimeout` for grace timers; HMAC for auth | No alternative library needed [VERIFIED: server/middleware/auth.ts:1] |

### Supporting (test infrastructure, already configured)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | 1.6.1 (verified) | Test runner | All Phase 4 server/client tests [VERIFIED: package.json:36, also CITED: client/vitest.config.ts] |
| `@testing-library/react` | 14.3.1 | Client component tests | `ReconnectOverlay.test.tsx` follows pattern from `ActionBubbleLayer.test.tsx` [VERIFIED: client/package.json:21] |
| `@testing-library/jest-dom` | 6.9.1 | Custom matchers (`toBeInTheDocument`, `toHaveStyle`) | Already in `client/src/test/setup.ts` [VERIFIED: client/package.json:20] |
| `jsdom` | 24.1.3 | DOM env for client tests | Already configured [VERIFIED: client/package.json:25] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Prisma `updateMany WHERE balance >= n` | `prisma.$queryRaw\`UPDATE users SET balance = balance - ${n} WHERE telegramId = ${id} AND balance >= ${n} RETURNING balance\`` | Functionally equivalent, but raw SQL invites maintenance burden in a project with no other raw SQL. CONTEXT.md D-D1 explicitly chose `updateMany`. **DO NOT USE.** [CITED: prisma.io/docs/orm/reference/prisma-client-reference] |
| Per-row Prisma `$transaction` for boot recovery | Single `prisma.$transaction(rows.map(...))` (one big transaction) | Single transaction has smaller round-trip count but blast-radius problem: one bad row aborts the whole sweep. CONTEXT.md D-C4 explicitly chose per-row. **DO NOT USE.** |
| New `reconnectSnapshot` Socket.io event | Reuse `tableJoined` + `state` | A new event would require client+server+types changes for zero behavioral gain. CONTEXT.md D-A2 explicitly chose to reuse. **DO NOT USE.** |
| Server-pushed grace remaining time | Client computes locally from `gameState.stage` snapshot | Server push adds an event for no behavioral gain — the rules are static (30/120 s). CONTEXT.md D-B4 explicitly chose local. **DO NOT USE.** |

**Installation:** None. No new dependencies in Phase 4.

**Version verification (npm registry, 2026-04-29):**
- `@prisma/client@7.8.0` is latest, project runs `^7.4.2` (in caret range, will resolve to latest 7.x) [VERIFIED: npm view @prisma/client version]
- `@prisma/adapter-pg@7.8.0` matches [VERIFIED: npm view @prisma/adapter-pg version]
- `socket.io@4.8.3` is latest, project runs `^4.7.5` (will resolve to 4.8.x) [VERIFIED: npm view socket.io version]
- `vitest@4.1.5` is latest, project pinned to `^1.6.1` (does NOT auto-resolve to 4.x — major bump). Phase 4 stays on the pinned 1.6.x line [VERIFIED: npm view vitest version, confirmed against package.json].

## Architecture Patterns

### Recommended Module Layout

```
server/
├── index.ts                          # MODIFIED: auth handler + disconnect handler + joinTable + leaveTable + boot block
├── TableManager.ts                   # MODIFIED: handleDisconnect repurposed (grace path lives in GraceRegistry)
├── GraceRegistry.ts                  # NEW: singleton-as-module, Map<telegramId, GraceEntry>
├── SessionRecovery.ts                # NEW: recoverPersistedSessions() boot sweep
├── db/
│   └── UserRepository.ts             # MODIFIED: add tryDecrementBalance() + refundCurrentChips()
└── __tests__/
    ├── GraceRegistry.test.ts         # NEW: timer state machine + re-arm on hand-end
    ├── SessionRecovery.test.ts       # NEW: per-row $transaction sweep
    ├── UserRepository.atomic.test.ts # NEW: tryDecrementBalance race + refund idempotency
    └── reconnectHandshake.test.ts    # NEW: auth handler state-snapshot push + replacedBySession emit

client/src/
├── App.tsx                           # MODIFIED: wire disconnect/connect → overlay state machine
└── components/
    ├── ReconnectOverlay.tsx          # NEW: full-screen overlay with countdown + expired sub-views
    └── __tests__/
        └── ReconnectOverlay.test.tsx # NEW: debounce + countdown + dismiss-on-tableJoined

types/
└── index.ts                          # MODIFIED: add `replacedBySession: () => void` to ExtendedServerEvents
```

### Pattern 1: Singleton-as-Module Stateful Registry (`GraceRegistry`)

**What:** Module-level state (`let buffer = []`, `let timer = null`) with named exports. Exposes `__resetForTests()` and `__getInternalsForTests()` for Vitest. Established by `server/HandHistoryQueue.ts` in Phase 3. Same shape lets tests mock the public API surface and inspect/reset internals deterministically.

**When to use:** Any process-wide registry where you want a single instance and explicit test seams. Better than a class instance because there is no constructor-injection ceremony and nothing to mock at the import boundary.

**Example (verified pattern from `server/HandHistoryQueue.ts:23-127`):**
```ts
// server/GraceRegistry.ts
import { tableManager } from './TableManager.js';
import { UserRepository } from './db/UserRepository.js';
import prisma from './db/prisma.js';

const MID_HAND_GRACE_MS = 30_000;
const BETWEEN_HANDS_GRACE_MS = 120_000;

interface GraceEntry {
  timer: NodeJS.Timeout;
  stage: 'mid-hand' | 'between-hands';
  expiresAt: number;
  tableId: string;
}

const registry = new Map<string /* telegramId */, GraceEntry>();

export function arm(telegramId: string, stage: 'mid-hand' | 'between-hands', tableId: string): void {
  clear(telegramId); // idempotent — re-arming replaces
  const ms = stage === 'mid-hand' ? MID_HAND_GRACE_MS : BETWEEN_HANDS_GRACE_MS;
  const timer = setTimeout(() => onExpire(telegramId, stage), ms);
  registry.set(telegramId, { timer, stage, expiresAt: Date.now() + ms, tableId });
  console.info('[Grace] armed telegramId=%s stage=%s tableId=%s', telegramId, stage, tableId);
}

export function clear(telegramId: string): void {
  const entry = registry.get(telegramId);
  if (!entry) return;
  clearTimeout(entry.timer);
  registry.delete(telegramId);
  console.info('[Grace] cleared telegramId=%s', telegramId);
}

export function getStage(telegramId: string): 'mid-hand' | 'between-hands' | undefined {
  return registry.get(telegramId)?.stage;
}

async function onExpire(telegramId: string, stage: 'mid-hand' | 'between-hands'): Promise<void> {
  registry.delete(telegramId);
  // ... per D-B3 — see "Pattern 2: Stage-aware grace expiry" below
}

// Test seams (verified pattern, see HandHistoryQueue.__resetForTests)
export function __resetForTests(): void {
  registry.forEach(entry => clearTimeout(entry.timer));
  registry.clear();
}
export function __getInternalsForTests() { return { registry }; }
```

### Pattern 2: Stage-Aware Grace Expiry (D-B3)

**What:** Two terminal branches off the timer-fire callback, gated on the `stage` snapshot taken at disconnect.

**When to use:** Inside `GraceRegistry.onExpire`. The decision was already made when the timer was armed (D-B2) — `onExpire` only routes.

**Example:**
```ts
async function onExpire(telegramId: string, stage: 'mid-hand' | 'between-hands'): Promise<void> {
  registry.delete(telegramId);
  const table = tableManager.getPlayerTable(telegramId);
  if (!table) return; // already left

  if (stage === 'mid-hand') {
    // KEEP seat. Set sittingOut. Clear disconnectedAt. Don't touch chips.
    table.sitOut(telegramId);
    await prisma.user.update({
      where: { telegramId: BigInt(Number(telegramId)) },
      data: { disconnectedAt: null }
    });
    console.info('[Grace] expired mid-hand telegramId=%s — sat out, seat held', telegramId);
  } else {
    // VACATE seat. Refund chips atomically.
    tableManager.leaveTable(telegramId);
    const result = await UserRepository.refundCurrentChips(telegramId);
    console.info('[Grace] expired between-hands telegramId=%s — refunded %d', telegramId, result?.refunded ?? 0);
  }
}
```

### Pattern 3: Atomic conditional `updateMany` (D-D1, D-D2)

**What:** Single SQL round-trip that combines a guard predicate with a mutation. Returns `{ count: 0 | 1 }`. `count === 0` means the guard failed.

**When to use:** Buy-in (`balance >= n`), refund (`currentChips IS NOT NULL`), any place a TOCTOU race could occur between two concurrent socket actions. [VERIFIED: github.com/prisma/prisma/issues/8612 — lost-updates bug fixed in Prisma 4.4.0; we run 7.4.2 so the SELECT+UPDATE-as-one-atomic-statement guarantee holds.]

**Example (buy-in):**
```ts
// server/db/UserRepository.ts (new method)
static async tryDecrementBalance(telegramId: number, amount: number): Promise<boolean> {
  const result = await prisma.user.updateMany({
    where: { telegramId: BigInt(telegramId), balance: { gte: amount } },
    data:  { balance: { decrement: amount } }
  });
  return result.count === 1;
}
```

**Example (refund — captures `currentChips` first, then atomic clear):**
```ts
static async refundCurrentChips(telegramId: string): Promise<{ refunded: number } | null> {
  // Step 1: capture currentChips
  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(Number(telegramId)) },
    select: { currentChips: true }
  });
  if (!user || user.currentChips === null) return null; // already cleared / never seated

  const chipsToRefund = user.currentChips;

  // Step 2: atomic refund + clear, guarded by IS NOT NULL idempotency
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

  if (result.count === 0) return null; // race: another process already refunded
  return { refunded: chipsToRefund };
}
```

### Pattern 4: Per-Row `$transaction` Boot Sweep (D-C4)

**What:** `findMany` to enumerate, then a per-row Prisma `$transaction` for the refund + clear. Logs one line per row. Per-row blast radius.

**When to use:** Boot recovery only. The cost of N round-trips is negligible (max ~36 rows for 6 tables × 6 seats) and audit-logging in Phase 5 will trivially attach to each per-row transaction.

**Example:**
```ts
// server/SessionRecovery.ts
import prisma from './db/prisma.js';
import { PREDEFINED_TABLES } from './config/tables.js';
import { UserRepository } from './db/UserRepository.js';

export async function recoverPersistedSessions(): Promise<{ recovered: number }> {
  const known = new Set(PREDEFINED_TABLES.map(t => t.id));

  const stale = await prisma.user.findMany({
    where: { currentTableId: { not: null } },
    select: { telegramId: true, currentTableId: true, currentChips: true }
  });

  let recovered = 0;
  for (const row of stale) {
    const tid = String(row.telegramId);
    if (row.currentTableId && !known.has(row.currentTableId)) {
      console.warn('[BootRecovery] stale tableId %s for telegramId=%s — refunded', row.currentTableId, tid);
    }
    const result = await UserRepository.refundCurrentChips(tid);
    if (result) {
      console.log('[BootRecovery] refunded telegramId=%s chips=%d table=%s', tid, result.refunded, row.currentTableId);
      recovered++;
    }
  }
  return { recovered };
}
```

### Anti-Patterns to Avoid

- **Read-then-write balance check.** Reading `user.balance` first and then writing `balance - n` is exactly the buy-in race that Concern #5 calls out. Fixed by D-D1's atomic `updateMany`.
- **Server-pushing grace countdown over the wire.** D-B4 says client computes locally. Don't add a `graceTick` event.
- **Restoring `Game` instance state from DB on boot.** D-C1 is always-refund — there is no in-memory `Game` to reseat into until players reconnect, and the engine is intentionally I/O-free per Phase 1 D-09.
- **Putting hole cards in the boot-recovery sweep payload.** Schema doesn't store them (Phase 3 D-17). `getStateForPlayer` reveals own hole cards on reconnect from the live `Game` instance only.
- **Leaving the `'sessionReplaced' as any` cast in place.** Phase 1 D-07 explicitly scaffolded this for Phase 4 to clean up. The Phase 4 PR must rename the event AND remove the cast (typed contract restored).
- **Re-arming the grace timer on `connect` instead of clearing it.** D-B (intent): a successful auth (re-) handshake means the player is back; clear, don't re-arm. Re-arming hides the re-arrival from the registry.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic balance check + decrement | Read-then-write in a `$transaction` callback | `prisma.user.updateMany({ where: { balance: { gte: n } }, data: { balance: { decrement: n } } })` | Prisma's `updateMany` compiles to a single `UPDATE ... WHERE` SQL statement — atomic at the DB level [VERIFIED: prisma.io/docs/orm/reference/prisma-client-reference]. Read-then-write opens a TOCTOU window even inside `$transaction` at default isolation. |
| Per-process timer registry with cleanup | A class with constructor-injected map | Module-level `Map` + named exports (singleton-as-module) | Already established by `server/HandHistoryQueue.ts`. Tests use `__resetForTests()` between cases — no DI plumbing needed. |
| Reconnect detection with custom heartbeat | Manual `setInterval` ping/pong | `socket.on('disconnect', ...)` + `socket.on('connect', ...)` from socket.io-client | socket.io-client already runs heartbeat + auto-reconnect; clients only need to listen for `disconnect`/`connect` events [CITED: socket.io.com/docs/v4/client-socket-instance]. |
| Eviction event flushing | Manual `socket.emit` then `setTimeout(() => socket.disconnect(), 100)` | `socket.emit('replacedBySession'); socket.disconnect(true);` | socket.io's `disconnect(true)` flushes pending writes to the transport before closing [CITED: socket.io.com/docs/v4/server-socket-instance]. The `true` argument means "close the underlying connection" not "force without flush." |
| Boot-time race against socket listener | Wrap in `await server.listen` promise | Existing `setTimeout(..., 1000)` block | Sessions are queued by the client (auth happens after the listener is bound), so the recovery sweep doesn't need to gate `server.listen()`. CONTEXT.md D-C2 confirms. |
| Telegram `initData` re-validation on reconnect | Cache HMAC result keyed by `sessionToken` | Run `validateInitData()` every connect | Phase 1 D-A1 + RESILIENCE-04 spec: re-verify every time. `validateInitData` is sub-millisecond on a 256-byte payload — perf cost is negligible. |

**Key insight:** Every domain Phase 4 touches already has a battle-tested primitive in the tree. The risk is NOT inventing new primitives but **wrapping existing ones in incomplete state machines** (e.g., a grace timer that forgets to cancel on hand-end re-arm; a refund path that forgets idempotency). The plans should use the patterns above verbatim.

## Runtime State Inventory

> Phase 4 is a feature addition, not a rename/refactor. The closest analog: it changes the **behavior** of disconnect (from "leave + refund" to "grace + sit-out / vacate"). No string renames, no migration. Most categories are N/A; documented for completeness so the planner can confirm.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — verified by grep on `prisma/schema.prisma` and `server/db/`. The new behavior writes to the SAME columns Phase 1 D-14 added (`disconnectedAt`, `lastSeenAt`, `currentChips`, `currentTableId`, `currentSeat`); no schema change in Phase 4. | None. The `User` row is the only persistence touched, and all needed columns exist. |
| Live service config | None — no n8n / Datadog / external config in this project. PostgreSQL runs in Docker locally and on the production host; no external SaaS state. | None. |
| OS-registered state | None — no Windows Task Scheduler / systemd / launchd registrations. Server runs as a Node process under whatever supervisor the deploy target uses. | None. |
| Secrets / env vars | `BOT_TOKEN` (existing, unchanged), `DATABASE_URL` (existing, unchanged), `NODE_ENV` (existing, unchanged), `ALLOW_DEV_AUTH` (existing, unchanged), `PORT` (existing, unchanged). Phase 4 introduces NO new env vars. | None. |
| Build artifacts / installed packages | `dist/server/` (TypeScript build output) — rebuilt by `npm run build`. No `egg-info`-style stale-after-rename artifacts because no package rename. | None — standard `npm run build` cycle. |

**The canonical question — "After every file in the repo is updated, what runtime systems still have the old string cached, stored, or registered?"** — has answer: **nothing**. Phase 4 is pure feature addition; existing rows in `User` retain their semantics. The only behavior shift is in-process (disconnect handler logic), so a server restart is sufficient to pick up the new behavior.

**One subtle data-shape note (planner should confirm):** existing `User` rows from Phases 1–3 may have non-NULL `disconnectedAt` from prior dev sessions where the dev-bypass crashed mid-hand. The boot-recovery sweep (D-C1) handles these by refunding any row with non-NULL `currentTableId` — the `disconnectedAt` cleanup happens as part of `refundCurrentChips`'s column-clear. No special migration step needed.

## Common Pitfalls

### Pitfall 1: 30s mid-hand timer fires AFTER hand ends, vacating a healthy player
**What goes wrong:** Player disconnects on flop, mid-hand timer set to 30s. Other players finish the hand 5s later. The 30s timer fires 25s into the next hand and incorrectly vacates the (now-healthy-but-disconnected) player.
**Why it happens:** D-B2's re-arm logic ("if mid-hand timer still running when hand ends, cancel and re-arm 120s") is easy to miss — the engine doesn't naturally have a "hand ended" hook for the grace registry.
**How to avoid:** Wire the re-arm into the `setOnHandComplete` listener at `server/index.ts:160`. Add `GraceRegistry.reArmIfMidHand(telegramId)` call inside the per-player loop. The registry checks if the entry exists AND is `stage === 'mid-hand'`, and if so swaps to `between-hands`.
**Warning signs:** Test scenario "player disconnects on turn, hand ends 5s later, player still gone at 130s" should leave them sat-out, not vacated. If they're vacated, the re-arm wire is missing.

### Pitfall 2: `replacedBySession` event lost because socket disconnects before flush
**What goes wrong:** Server emits `replacedBySession`, then immediately `socket.disconnect(true)`. The eviction event never reaches the prior client.
**Why it happens:** `disconnect(true)` argument confusion. socket.io's `socket.disconnect(true)` parameter means "close low-level connection" not "force-without-flush" — the emit IS flushed first [CITED: socket.io.com/docs/v4/server-socket-instance]. But if the prior client's transport has already failed silently, the emit never lands. There is no ack mechanism in v1 (D-A3 says bare event).
**How to avoid:** Accept this as an acceptable failure mode for v1. The evicted client will see its socket disconnect with `reason === 'io server disconnect'` regardless of whether the typed event arrived. Falling back on the `disconnect` reason as a secondary signal is fine.
**Warning signs:** "I never saw the 'logged in elsewhere' notice on the prior tab." Acceptable in v1; document.

### Pitfall 3: Boot recovery sweep races with first-connect refund attempts
**What goes wrong:** Server boots, recovery sweep runs at +1000 ms, but a fast client connects at +500 ms and triggers a refund via the disconnect-handler path before the sweep gets there.
**Why it happens:** The sweep is in a `setTimeout(1000)` block alongside `setupTableEvents`. A client that connects before the boot sweep would see the persisted `currentChips` and (depending on order) double-refund.
**How to avoid:** D-D2's `WHERE currentChips IS NOT NULL` idempotency guard makes this safe — the second refund returns `{ count: 0 }` and is a no-op. Both code paths use the same `refundCurrentChips` helper, so the guard is in one place.
**Warning signs:** Test scenario "client connects during boot recovery sweep" should leave the user with one refund's worth of chips, not two.

### Pitfall 4: Eviction races with auth handler — old socket evicted, new socket not yet bound
**What goes wrong:** `setSocketForTelegram(telegramId, newSocketId, onEvict)` calls `onEvict(priorSocketId)` BEFORE updating the map. If `onEvict`'s `socket.disconnect(true)` triggers the prior socket's `disconnect` handler, which calls `tableManager.getSocketIdForTelegram(telegramId)` and finds it pointing somewhere — there's a brief window of confusion.
**Why it happens:** Code path: `setSocketForTelegram` → `onEvict` → prior socket disconnects → handler at `server/index.ts:798` runs → `if (tableManager.getSocketIdForTelegram(telegramId) === socket.id)` check.
**How to avoid:** Phase 1 D-04/D-06 already designed this correctly — the disconnect handler's identity guard at `server/index.ts:836` (`if (tableManager.getSocketIdForTelegram(telegramId) === socket.id)`) prevents the prior socket's disconnect from clearing the new socket's mapping. Phase 4 must NOT add a competing `clearSocketForTelegram` call elsewhere.
**Warning signs:** Test scenario "open second client, first client disconnects, then second client tries to act" — second client should still receive game updates.

### Pitfall 5: Client overlay debounce timer not cleared on rapid disconnect/reconnect cycles
**What goes wrong:** Mobile network blips cause `disconnect` → debounce starts → `connect` 200ms later (under threshold, no overlay) → 500ms later `disconnect` again → debounce STARTS A NEW timer. Original 1500ms timer was never cleared. After 1300ms, original timer fires (overlay shows), then 200ms later reconnects again. Overlay flashes for 200ms.
**Why it happens:** `useEffect` cleanup not capturing the debounce timer correctly, or storing in a ref but not clearing on `connect`.
**How to avoid:** Store the debounce timer in a `useRef`. On `connect`: `if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; setShowOverlay(false); }`. On `disconnect`: `if (debounceRef.current) clearTimeout(debounceRef.current); debounceRef.current = setTimeout(() => setShowOverlay(true), 1500);`.
**Warning signs:** Test scenario "disconnect, connect after 200ms, disconnect again, connect after 1700ms total" should NEVER show the overlay.

### Pitfall 6: Boot recovery deletes a session row that a player is actively reconnecting into
**What goes wrong:** Server boots at T=0. Recovery sweep starts at T=+1000ms. Client (which never knew the server was down because they had the Mini App backgrounded) reconnects at T=+1100ms — the auth handler sees their `currentTableId` in the DB but the row has just been cleared by the in-flight sweep.
**Why it happens:** D-A2's reconnect handshake reads `tableManager.getPlayerTable(telegramId)`, NOT the DB. After server boot, the in-memory `playerToTable` map is empty (no `Game` instance has them seated). So the player's `tableJoined` snapshot push is correctly skipped, and they fall through to the regular auth path with their refunded balance. **No actual bug — the design self-corrects.**
**How to avoid:** Verify in tests: "client connects post-boot pre-recovery" and "client connects post-boot post-recovery" both result in the player being on the menu screen, NOT auto-reseated. Their balance has been refunded.
**Warning signs:** Player ends up at a stale `tableId` they aren't actually seated at — would mean the auth handler reads from DB instead of `tableManager`. D-A2 is explicit: read from in-memory `tableManager`.

### Pitfall 7: BigInt conversion on telegramId — silent overflow / type mismatch
**What goes wrong:** `User.telegramId` is `BigInt`. The grace-registry / boot-recovery code uses `string` for telegramId (Phase 1 D-04 / RESILIENCE-03). Conversions like `BigInt(Number(telegramId))` are subtly wrong if the string is a 19-digit Telegram ID (overflows `Number.MAX_SAFE_INTEGER` at 9007199254740992).
**Why it happens:** Telegram IDs in 2026 are typically 9–10 digits (well under MAX_SAFE), but the type system says BigInt.
**How to avoid:** Existing code (`UserRepository.checkpointSeat:145`) uses `BigInt(Number(telegramId))`. This is correct **today** but fragile. Consider `BigInt(telegramId)` directly when the input is a numeric string. Document in code: "// Telegram IDs are ≤10 digits in 2026; safe to round-trip via Number."
**Warning signs:** A user whose telegramId starts with high digits suddenly can't reconnect. Untestable without a real such ID; document the invariant.

## Code Examples

### Example 1: Reconnect handshake (auth handler extension)

```ts
// server/index.ts — extends the existing socket.on("auth", ...) handler
// after `setSocketForTelegram` and `seatedTable.updatePlayerSocketId`,
// add the snapshot push:

const seatedTable = tableManager.getPlayerTable(telegramId);
if (seatedTable) {
  seatedTable.updatePlayerSocketId(telegramId, socket.id);

  // === Phase 4 / D-A2 NEW ===
  const state = seatedTable.getStateForPlayer(telegramId);
  socket.emit("tableJoined", { tableId: seatedTable.id, seat: state.seats.findIndex(p => p?.id === telegramId), state });
  updateTableState(seatedTable.id);

  // === Phase 4 / D-B (clear pending grace timer) NEW ===
  GraceRegistry.clear(telegramId);
}
```

### Example 2: Disconnect handler with grace arming

```ts
// server/index.ts — replaces the existing disconnect handler body
// at server/index.ts:798

socket.on("disconnect", async () => {
  console.log("[Socket] Player disconnected:", socket.id);
  const telegramId = socket.data.telegramId;
  if (!telegramId) return;

  const seatedTable = tableManager.getPlayerTable(telegramId);
  if (seatedTable) {
    seatedTable.updatePlayerSocketId(telegramId, undefined);

    // === Phase 4 / D-B1, D-B2 NEW ===
    const stage = seatedTable.getState().stage;
    const graceStage: 'mid-hand' | 'between-hands' =
      (stage === 'waiting' || stage === 'showdown') ? 'between-hands' : 'mid-hand';

    await prisma.user.update({
      where: { telegramId: BigInt(Number(telegramId)) },
      data: { disconnectedAt: new Date(), lastSeenAt: new Date() }
    });

    GraceRegistry.arm(telegramId, graceStage, seatedTable.id);
    updateTableState(seatedTable.id);
  }

  // === REMOVED: tableManager.handleDisconnect() + chip refund ===
  // (the grace timer's expire path now owns the leave-or-sit-out decision)

  if (tableManager.getSocketIdForTelegram(telegramId) === socket.id) {
    tableManager.clearSocketForTelegram(telegramId);
  }
  userStorage.removeUser(telegramId);
});
```

### Example 3: Atomic buy-in with rollback

```ts
// server/index.ts — replaces the existing joinTable buy-in deduction
// at server/index.ts:524-532

// === Phase 4 / D-D1 + D-D2 NEW ===
const ok = await UserRepository.tryDecrementBalance(user.telegramId, tableInfo!.config.buyIn);
if (!ok) {
  // Rollback the in-memory join (Concern #11 — was a TODO)
  tableManager.leaveTable(telegramId);
  socket.leave(tableId);
  socket.emit("tableError", `Insufficient balance. Buy-in is ${tableInfo!.config.buyIn}`);
  return;
}
// Reflect new balance to client (DB read, since updateMany doesn't return the row)
const refreshed = await UserRepository.findByTelegramId(user.telegramId);
if (refreshed) {
  user.balance = refreshed.balance;
  socket.emit("balanceUpdate", refreshed.balance);
}
```

### Example 4: Boot recovery in the existing setTimeout block

```ts
// server/index.ts — extends the existing setTimeout block at :182

setTimeout(async () => {
  const tables = tableManager.getAllTablesInfo();
  tables.forEach((t) => setupTableEvents(t.id));

  // === Phase 4 / D-C1, D-C2 NEW ===
  try {
    const result = await SessionRecovery.recoverPersistedSessions();
    console.log('[Boot] SessionRecovery refunded %d session(s)', result.recovered);
  } catch (err) {
    console.error('[Boot] SessionRecovery failed:', err);
    // Non-fatal — server continues to listen
  }

  HandHistoryQueue.startFlushTimer();
  HandHistoryQueue.startRetentionJob();
  console.log('[Boot] HandHistoryQueue + retention job started');
}, 1000);
```

### Example 5: Client overlay state machine

```tsx
// client/src/App.tsx — adds inside the App component, alongside other useEffects

const [overlayState, setOverlayState] = useState<
  | { kind: 'hidden' }
  | { kind: 'reconnecting'; stage: 'mid-hand' | 'between-hands'; expiresAt: number }
  | { kind: 'sat-out' }
  | { kind: 'vacated' }
>({ kind: 'hidden' });

const debounceRef = useRef<NodeJS.Timeout | null>(null);
const lastStageRef = useRef<GameStage>('waiting');

// Track last known game stage so we can compute grace duration locally on disconnect
useEffect(() => {
  lastStageRef.current = gameState.stage;
}, [gameState.stage]);

useEffect(() => {
  const onConnect = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setOverlayState({ kind: 'hidden' });
  };

  const onDisconnect = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const stage = lastStageRef.current;
      const graceStage: 'mid-hand' | 'between-hands' =
        (stage === 'waiting' || stage === 'showdown') ? 'between-hands' : 'mid-hand';
      const ms = graceStage === 'mid-hand' ? 30_000 : 120_000;
      setOverlayState({ kind: 'reconnecting', stage: graceStage, expiresAt: Date.now() + ms });
    }, 1500);
  };

  socket.on('connect', onConnect);
  socket.on('disconnect', onDisconnect);
  socket.on('replacedBySession', () => setOverlayState({ kind: 'vacated' /* "logged in elsewhere" sub-view */ }));

  return () => {
    socket.off('connect', onConnect);
    socket.off('disconnect', onDisconnect);
    socket.off('replacedBySession');
    if (debounceRef.current) clearTimeout(debounceRef.current);
  };
}, []);

// Dismiss on tableJoined — already wired at line 200 of App.tsx, just add:
socket.on("tableJoined", (payload) => {
  // ... existing body ...
  setOverlayState({ kind: 'hidden' }); // NEW
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Read-then-write balance (`UserRepository.updateBalance(-buyIn)`) | Atomic `updateMany WHERE balance >= n` returning `{ count }` | Phase 4 | Closes Concern #5 (buy-in race / double-spend). Idiomatic Prisma; no raw SQL maintenance. |
| Immediate `leaveTable + refund` on disconnect | Grace-armed sit-out / vacate decision, deferred 30s/120s | Phase 4 | Closes Concern #1 (no reconnect). Substrate from Phase 1 D-04..D-07. |
| In-memory only seat/chips state | DB-checkpointed at hand boundaries + boot-recovery refund | Phases 3 + 4 | Closes Concern #2 (no crash safety). Phase 3 ships writes, Phase 4 ships reads. |
| `'sessionReplaced' as any` cast in eviction emit | Typed `replacedBySession: () => void` event | Phase 4 | Removes the `as any` lying about the event contract. Phase 1 D-07 staged this. |
| Server-side `setInterval` heartbeat | socket.io 4.x built-in heartbeat + `socket.active` reconnection state | Already current | Reaffirmed during research [CITED: socket.io.com/docs/v4/client-socket-instance]. No custom heartbeat needed. |

**Deprecated/outdated:**
- `tableManager.handleDisconnect()` (line 249 of TableManager.ts) currently does `this.leaveTable(telegramId)` — Phase 4 should EITHER repurpose this as the grace-arming entry point OR delete the method and call `leaveTable` directly from the grace expiry path. CONTEXT.md "code touch points" suggests rename/repurpose; either is acceptable per Claude's discretion.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The 1500 ms overlay debounce is calibrated correctly for mobile Telegram WebSocket hiccups (300–800 ms typical heal time) | Common Pitfalls / Pattern 5 | UX flicker if hiccups exceed 1500 ms. Easily tunable by changing one constant; no architectural impact. CONTEXT.md D-B4 locks this value. [ASSUMED — based on general mobile WebSocket lore, not measured on this app's prod traffic.] |
| A2 | All Telegram IDs in 2026 fit safely in `Number.MAX_SAFE_INTEGER` (9007199254740991), so `BigInt(Number(telegramId))` round-trips are safe | Pitfall 7 | If Telegram ever issues 16+ digit IDs, the round-trip silently truncates. Mitigation: switch to `BigInt(telegramId)` directly when input is a numeric string. [ASSUMED — Telegram has not published a hard upper bound; current practice is 10-digit IDs.] |
| A3 | Boot recovery sweep completes before any client could re-auth-and-reseat into the same `currentTableId` row, OR the idempotency guard handles the race | Pitfall 3 | If both the sweep and a fast-client refund hit `refundCurrentChips` at the same instant, ONE will see `count === 1` and the other `count === 0`. The `IS NOT NULL` guard ensures only one wins. [VERIFIED via Prisma docs: `updateMany` is one atomic SQL statement at the DB layer, post 4.4.0 fix.] |
| A4 | The grace-timer registry's `Map<telegramId, GraceEntry>` does not leak under high churn (many disconnect/reconnect cycles) | Pattern 1 | If `arm()` doesn't `clear()` first when re-arming, timers accumulate and fire spuriously. The reference implementation in this RESEARCH.md does call `clear()` on every `arm()` — must be reflected in the plan. [VERIFIED by Pattern 1 code example.] |

**No critical user-facing decisions tagged ASSUMED** — the four assumptions are minor / mitigated and don't require user confirmation before planning. They become test-time concerns at most.

## Open Questions

1. **Should the disconnect handler write `disconnectedAt` to the DB synchronously, or rely on the grace timer to do it?**
   - What we know: D-B1 says "mark `disconnectedAt = now()` and arm the grace timer." `disconnectedAt` is useful for ops/debugging but is not READ by any Phase 4 code path (the timer is in-process; boot recovery uses `currentTableId` not `disconnectedAt`).
   - What's unclear: writing it adds a DB round-trip on every disconnect. Worth it?
   - Recommendation: write it (1 round-trip is cheap and gives ops a "last seen disconnect" marker for support tickets). The reference `disconnect` handler in Example 2 above writes both `disconnectedAt` and `lastSeenAt`.

2. **What does the disconnected player see in `getStateForPlayer` while their grace timer is running and the hand continues without them?**
   - What we know: The engine path is unchanged — `Game.fold(currentPlayerId)` will be called by the existing turn timer if it was their turn. Other players' `getStateForPlayer` correctly shows them folded.
   - What's unclear: when they reconnect mid-grace, the `state` snapshot reflects their auto-folded status, which is the correct outcome (their seat is held but folded for that hand).
   - Recommendation: no special handling. Auto-fold-on-turn-timeout was already the existing behavior; grace doesn't change it. Just verify in test that "disconnect-on-turn → 30s elapses → reconnect → see myself folded" works.

3. **Should `replacedBySession` carry a timestamp or any payload at all?**
   - What we know: D-A3 locks "bare event with no payload." The original Phase 1 D-07 placeholder also had no payload.
   - What's unclear: the Server's `'sessionReplaced' as any` cast looks like it allowed a payload — was payload ever planned?
   - Recommendation: D-A3 is locked. No payload. Type as `replacedBySession: () => void` in `ExtendedServerEvents`.

4. **Does the dev-mode `?player=N` URL parameter (App.tsx:67) survive eviction?**
   - What we know: The dev player ID is stored in `sessionStorage`. After eviction + reload, the same devId persists. The new socket re-auths with the same `telegramId`, which evicts the (already-gone) prior socket — no-op.
   - What's unclear: not really unclear, but worth a manual UAT check with two browser tabs at `?player=1` to confirm eviction is observable.
   - Recommendation: include this scenario in `04-HUMAN-UAT.md`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (existing) | All server code | ✓ (assumed — project already built/running) | Project pinned to `@types/node@20.x` | — |
| PostgreSQL 16 (Docker) | Boot recovery query, atomic balance SQL | ✓ via `docker-compose up -d` (per CLAUDE.md) | 16 | — |
| `@prisma/client` 7.4.2 | All Prisma calls | ✓ (verified in `package.json:16`) | 7.4.2 in `^7.4.2` range | — |
| `socket.io` 4.7.5 + `socket.io-client` 4.7.5 | All transport | ✓ (verified) | 4.7.5 | — |
| `vitest` 1.6.1 | All tests | ✓ (verified) | 1.6.1 | — |
| `@testing-library/react` 14.3.1 | Client tests (`ReconnectOverlay.test.tsx`) | ✓ (verified) | 14.3.1 | — |
| `motion/react` 12.38.0 | Optional — overlay enter/exit animation | ✓ (verified, added in Phase 3) | 12.38.0 | Plain CSS transition fallback acceptable; `prefers-reduced-motion` handling already in setup. |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

**Note:** Phase 4 explicitly adds NO new npm dependencies (CONTEXT.md). All necessary primitives (timers, atomic SQL, Socket.io reconnect events, Vitest, RTL) are already in the tree.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 1.6.1 (server: node env), Vitest 1.6.1 + @testing-library/react 14.3.1 (client: jsdom env) |
| Config files | `vitest.config.server.ts`, `client/vitest.config.ts` |
| Quick run command | `npm run test:server` (server only, ~5s) or `cd client && npm test` (client only) |
| Full suite command | `npm test` (runs both — server then client) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RESILIENCE-04 | Auth handler emits `tableJoined + state` snapshot for already-seated telegramId | unit | `vitest run --config vitest.config.server.ts server/__tests__/reconnectHandshake.test.ts` | ❌ Wave 0 |
| RESILIENCE-04 | Auth handler emits `replacedBySession` to prior socket and disconnects it | unit | same file as above | ❌ Wave 0 |
| RESILIENCE-04 | `getStateForPlayer(telegramId)` reveals own hole cards (regression check) | unit (existing) | covered by Phase 1 / Phase 3 tests already | ✅ |
| RESILIENCE-05 | Grace timer mid-hand 30s arms when stage in {preflop, flop, turn, river} | unit | `vitest run --config vitest.config.server.ts server/__tests__/GraceRegistry.test.ts` | ❌ Wave 0 |
| RESILIENCE-05 | Grace timer between-hands 120s arms when stage in {waiting, showdown} | unit | same file as above | ❌ Wave 0 |
| RESILIENCE-05 | Mid-hand timer re-arms to 120s when hand ends mid-grace | unit | same file as above (uses `vi.useFakeTimers()` + `setOnHandComplete` mock) | ❌ Wave 0 |
| RESILIENCE-05 | `clear(telegramId)` cancels in-flight timer and removes registry entry | unit | same file as above | ❌ Wave 0 |
| RESILIENCE-05 | Mid-hand expiry → calls `table.sitOut(tid)` + clears `disconnectedAt` | unit | same file as above (mocks tableManager + prisma.user.update) | ❌ Wave 0 |
| RESILIENCE-05 | Between-hands expiry → calls `tableManager.leaveTable(tid)` + `refundCurrentChips` | unit | same file as above (mocks tableManager + UserRepository.refundCurrentChips) | ❌ Wave 0 |
| RESILIENCE-05 | Client overlay does NOT render when reconnect lands within 1500ms | unit | `cd client && vitest run src/components/__tests__/ReconnectOverlay.test.tsx` | ❌ Wave 0 |
| RESILIENCE-05 | Client overlay renders 1500ms after disconnect with countdown | unit | same file (uses `vi.useFakeTimers()`, advances 1500ms, asserts presence) | ❌ Wave 0 |
| RESILIENCE-05 | Client overlay dismisses on `tableJoined` event | unit | same file (mock socket emit, assert overlay unmounts) | ❌ Wave 0 |
| RESILIENCE-05 | Client overlay shows "sat out" sub-view when 30s expires without reconnect | unit | same file (advance 31500ms total) | ❌ Wave 0 |
| RESILIENCE-06 | `recoverPersistedSessions` calls `refundCurrentChips` for every row with `currentTableId IS NOT NULL` | unit | `vitest run --config vitest.config.server.ts server/__tests__/SessionRecovery.test.ts` | ❌ Wave 0 |
| RESILIENCE-06 | Stale tableId (not in `PREDEFINED_TABLES`) logs warn + still refunds | unit | same file as above | ❌ Wave 0 |
| RESILIENCE-06 | Sweep is per-row — one row failing does not abort the sweep | unit | same file as above (mock one rejection, assert others still ran) | ❌ Wave 0 |
| RESILIENCE-07 | `tryDecrementBalance` returns true when `balance >= amount` | unit | `vitest run --config vitest.config.server.ts server/__tests__/UserRepository.atomic.test.ts` | ❌ Wave 0 |
| RESILIENCE-07 | `tryDecrementBalance` returns false when `balance < amount` (no DB write) | unit | same file as above (mock `updateMany` returning `{count: 0}`) | ❌ Wave 0 |
| RESILIENCE-07 | `refundCurrentChips` is idempotent: second call returns null and does no second write | unit | same file as above | ❌ Wave 0 |
| RESILIENCE-07 | `refundCurrentChips` returns null when `currentChips IS NULL` (never seated) | unit | same file as above | ❌ Wave 0 |
| RESILIENCE-02 | Grace-expiry refund path uses the SAME `refundCurrentChips` helper as boot recovery | unit | covered by GraceRegistry.test.ts via mock-spy on UserRepository.refundCurrentChips | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test:server` (server-only ~5s) for server tasks; `cd client && vitest run` for client tasks. Each task should run at minimum the file it touches.
- **Per wave merge:** `npm test` (full suite — both server and client).
- **Phase gate:** `npm test` green before `/gsd-verify-work`. Per CONTEXT.md the `04-HUMAN-UAT.md` will track multi-tab eviction and mobile reconnect scenarios that automated tests can't cover.

### Wave 0 Gaps

- [ ] `server/__tests__/GraceRegistry.test.ts` — covers RESILIENCE-05 timer state machine + re-arm logic. Use `vi.useFakeTimers()` + module-level `__resetForTests` (mirror pattern from `HandHistoryQueue.test.ts`).
- [ ] `server/__tests__/SessionRecovery.test.ts` — covers RESILIENCE-06 boot sweep. Mock `prisma.user.findMany` and `UserRepository.refundCurrentChips`.
- [ ] `server/__tests__/UserRepository.atomic.test.ts` — covers RESILIENCE-07. Mock `prisma.user.updateMany` returning `{count: 0}` and `{count: 1}`. Mock `prisma.user.findUnique` for the read step in `refundCurrentChips`.
- [ ] `server/__tests__/reconnectHandshake.test.ts` — covers RESILIENCE-04. Inline-harness pattern (mirror `getHandHistory.test.ts:20`); copy the auth handler body verbatim and assert socket emits + tableManager.setSocketForTelegram calls.
- [ ] `client/src/components/__tests__/ReconnectOverlay.test.tsx` — covers RESILIENCE-05 client side. Use `render` + `vi.useFakeTimers()` (mirror `ActionBubbleLayer.test.tsx:45`).
- [ ] No framework install needed — Vitest + RTL already configured.

**Test seam patterns (verified existing):**
- Module-level singleton with `__resetForTests` / `__getInternalsForTests` — see `server/HandHistoryQueue.ts:113-127`.
- Inline-harness for socket handlers (don't import `index.ts`, copy the handler body) — see `server/__tests__/getHandHistory.test.ts:20-38`.
- Prisma client mock via `vi.mock('../db/prisma.js', ...)` or repository mock via `vi.mock('../db/UserRepository.js', ...)` — see `server/__tests__/checkpointSeatedPlayers.test.ts:3-7`.
- Fake timers + `vi.advanceTimersByTimeAsync` — see `server/__tests__/HandHistoryQueue.test.ts:32`.
- jsdom + RTL with `motion/react` mock — see `client/src/components/__tests__/ActionBubbleLayer.test.tsx:16-29`. **N.B.:** `ReconnectOverlay` may NOT need motion if a CSS transition is sufficient; use motion only if the overlay needs the same enter/exit choreography as `ActionBubble`.

## Security Domain

`security_enforcement` is enabled (default). Phase 4 surfaces several security-critical control points:

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Re-run `validateInitData` HMAC on every reconnect (Phase 1 D-A1 reaffirmed by D-A1 of this phase). `crypto.timingSafeEqual` already used. NEVER fall back to session-token-only auth in v1. |
| V3 Session Management | yes | Single-active-session-per-telegramId enforced by `socketByTelegram` eviction. `replacedBySession` event signals intentional eviction. `sessionToken` column intentionally dormant in v1 (D-A1) — reduces attack surface. |
| V4 Access Control | yes | `socket.data.telegramId` is the authorization key for every game action. The reconnect snapshot push uses `getStateForPlayer(telegramId)` which already enforces hole-card privacy. No new auth-z surface introduced. |
| V5 Input Validation | yes | New `replacedBySession` is server→client only — no input. New `tryDecrementBalance(telegramId, amount)` accepts an `amount` from `tableInfo.config.buyIn` (server-trusted) — no user input flows in. **No new validation code needed.** |
| V6 Cryptography | no | No new crypto. HMAC validation reuses Phase 1's `crypto.timingSafeEqual` path. |

### Known Threat Patterns for Node + Prisma + Socket.io stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Buy-in race / double-spend (Concern #5) | Tampering | Atomic `updateMany WHERE balance >= n` (D-D1). [VERIFIED: prisma.io/docs/orm/reference/prisma-client-reference + issue #8612 fixed in 4.4.0] |
| Refund double-credit on concurrent reconnects | Tampering | Idempotent `updateMany WHERE currentChips IS NOT NULL` guard (D-D2). |
| Session hijack via stolen `socketId` | Spoofing | `socketId` is NEVER the auth key — `telegramId` is, and it's set from validated `initData` HMAC. socketIds change on every reconnect; useless to an attacker. |
| Eviction race / split-brain (two clients with same telegramId) | Tampering / Repudiation | `setSocketForTelegram` evicts before binding new socket (Phase 1 D-07 substrate, formalized by D-A2/D-A3 here). |
| HMAC replay (initData reuse) | Spoofing | `auth_date` freshness check (24h window) at `server/middleware/auth.ts:106` — pre-existing, not a Phase 4 change. |
| Boot recovery refund race | Tampering | Per-row `$transaction` (D-C4) + `IS NOT NULL` guard (D-D2). The same code path also handles concurrent client-driven refunds. |
| Information disclosure via reconnect snapshot | Information disclosure | `getStateForPlayer(telegramId)` is the SAME path as the regular game-state push — same privacy filtering already audited in Phase 1 / Phase 3. No new info-leak surface. |
| Grace timer abuse (forced disconnect to "stall" hand) | Denial of Service | Existing `Game.TURN_TIME_LIMIT = 30000` auto-folds the player on their turn regardless of disconnect — disconnecting does NOT pause the engine. |

**Notable non-issue:** the `replacedBySession` event has no payload (D-A3) so there is nothing to leak even on misdelivery.

**Notable security regression risk:** the `'sessionReplaced' as any` cast at `server/index.ts:239` MUST be removed in Phase 4. The `as any` could hide future signature drift; restoring the typed contract (`replacedBySession: () => void` in `ExtendedServerEvents`) closes that gap.

## Sources

### Primary (HIGH confidence)
- `server/index.ts` — entry point, all socket handlers, boot block. Verified line numbers used throughout.
- `server/TableManager.ts` — telegramId-keyed maps + eviction primitive (`setSocketForTelegram` at :262).
- `server/Game.ts` — `getStateForPlayer` at :890 (reveals own hole cards), `TURN_TIME_LIMIT` at :29, `setOnHandComplete` at :952.
- `server/db/UserRepository.ts` — existing CRUD; `checkpointSeat` at :140 establishes the BigInt conversion convention.
- `server/db/prisma.ts` — single Prisma client with `@prisma/adapter-pg` + `pg.Pool`.
- `prisma/schema.prisma` — confirmed `User.@@index([currentTableId])` at line 36 (boot-recovery scan support).
- `server/HandHistoryQueue.ts` — pattern source for singleton-as-module + `__resetForTests`.
- `server/__tests__/HandHistoryQueue.test.ts`, `server/__tests__/checkpointSeatedPlayers.test.ts`, `server/__tests__/getHandHistory.test.ts`, `client/src/components/__tests__/ActionBubbleLayer.test.tsx` — reference test patterns.
- `types/index.ts` — `ExtendedServerEvents` shape (:223), confirmed `tableJoined` payload already carries `{ tableId, seat, state }`.
- `client/src/App.tsx` — single Socket.io connection at :34; ready for overlay state machine.
- [prisma.io/docs/orm/reference/prisma-client-reference](https://www.prisma.io/docs/orm/reference/prisma-client-reference) — confirms `updateMany` returns `{ count }`, supports `gte`/`not: null` filters, supports `decrement` in `data`.
- [prisma.io/docs/orm/prisma-client/queries/crud](https://www.prisma.io/docs/orm/prisma-client/queries/crud) — confirms `increment`/`decrement` work in `updateMany`.
- [socket.io.com/docs/v4/client-socket-instance](https://socket.io/docs/v4/client-socket-instance/) — disconnect reasons, `socket.active`, Manager-emits-reconnect.
- [socket.io.com/docs/v4/server-socket-instance](https://socket.io/docs/v4/server-socket-instance/) — `socket.disconnect(true)` flushes pending writes.

### Secondary (MEDIUM confidence)
- [github.com/prisma/prisma/issues/8612](https://github.com/prisma/prisma/issues/8612) — `updateMany` lost-updates bug, closed in milestone 4.4.0; we run 7.4.2.
- npm registry version checks (2026-04-29): `@prisma/client@7.8.0`, `@prisma/adapter-pg@7.8.0`, `socket.io@4.8.3`, `vitest@4.1.5` (project on 1.6.1 — pinned).
- [github.com/prisma/prisma/discussions/8340](https://github.com/prisma/prisma/discussions/8340) — `updateMany` conditional `where` patterns.

### Tertiary (LOW confidence)
- General mobile WebSocket hiccup duration estimate (300–800 ms typical) — not directly cited in any specific source, drawn from general mobile networking lore. Risk is low because the 1500 ms debounce is empirically tunable and CONTEXT.md D-B4 locks the value.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library version verified against npm registry on 2026-04-29; CONTEXT.md "no new deps" constraint trivially satisfied.
- Architecture: HIGH — every pattern is either already in the tree (singleton-as-module, telegramId keying, eviction hook) or is a textbook idiomatic Prisma/socket.io pattern verified against official docs.
- Pitfalls: HIGH — six of seven pitfalls are derived from the actual code and CONTEXT.md decisions, not speculation. Pitfall 7 (BigInt overflow) is properly tagged ASSUMED.
- Validation Architecture: HIGH — every test file path maps to a real existing pattern; sampling rates and gate semantics match the existing `package.json` scripts.
- Security: HIGH — every threat pattern has a concrete mitigation either already in the tree or in CONTEXT.md decisions; no new auth surface introduced.

**Research date:** 2026-04-29
**Valid until:** 2026-05-29 (30 days; stack is stable, no fast-moving libraries in scope).
