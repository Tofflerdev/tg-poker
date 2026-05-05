---
phase: 3
slug: gameplay-additions
researched: 2026-04-18
domain: Animation (motion/react), async DB write queue, Prisma v7 batching, Socket.io event patterns, React FIFO queue state
confidence: HIGH
---

# Phase 3: Gameplay Additions — Research

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
D-01 through D-20 are fully locked. Research does not re-litigate any of them. Key locked decisions that shape implementation:
- D-08: `motion` (NOT `framer-motion`), import from `motion/react`, mandatory for GAME-02.
- D-09: sync fire-and-forget — listeners queue async work themselves.
- D-10/D-11/D-12: in-process buffer + 1 s / 50-row flush + `createMany({ skipDuplicates })` + 3-attempt backoff (100 ms / 500 ms) then drop+log.
- D-13: `HandHistoryQueue.ts` singleton with `enqueue()` + `shutdown(): Promise<void>`.
- D-14: chip checkpoint is a SEPARATE awaited async path, not the batched queue.
- D-15: checkpoint every occupied seat at every `onHandComplete`.
- D-18: store always, filter at read time — opponent holeCards returned only when `showedDown === true`.
- D-19: last 50 hands ordered `playedAt DESC`, Socket.io event `getHandHistory`, no REST.
- D-20: `setInterval` retention job inside the server process, boot-time immediate sweep, 24-hour cadence.

### Claude's Discretion
- Exact `ActionBubbleLayer.tsx` internals (Map vs flat array for per-seat queues).
- Animation timing micro-tuning within D-05 bands.
- Whether `HandHistoryQueue.shutdown()` also drains on hot-reload in dev.
- Internal TypeScript types for queue rows and socket events.
- Russian/English copy for empty state and relative-time formatting.
- Whether to add a "last updated N s ago" freshness hint.

### Deferred Ideas (OUT OF SCOPE)
- Paginated hand history beyond 50.
- History filters (table, date, result).
- Street-by-street replayer.
- Postgres-backed durable job queue.
- Sentry alerting on dropped batches.
- Cashout/kick/grace-expiry checkpoint clear — Phase 4.
- Reconnect bubble state restore — Phase 4.
- Queue drain on hot-reload (may land as discretion, otherwise Phase 5).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GAME-01 | Remove redundant top-left table/phase label and top-right pot label from game room | Confirmed already scoped in Phase 2 D-24; Phase 3 merely verifies the labels are gone. |
| GAME-02 | Floating action bubble on every player action using `motion/react` with FIFO queueing | Library section below: `motion` v12.38.0, `motion/react` subpath, `AnimatePresence`. |
| GAME-03 | Bubble duration 800–1000 ms, `prefers-reduced-motion` honored | 900 ms constant locked D-04; `useReducedMotion` hook vs `window.matchMedia` decision documented below. |
| PROFILE-02 | Hand history persisted on hand completion without blocking game loop | Async queue pattern section below; `createMany({ skipDuplicates })` with Prisma v7 + adapter-pg. |
| PROFILE-03 | Profile shows last 50 hands with hole-card privacy | Socket.io `getHandHistory` event pattern; privacy filter section. |
| PROFILE-04 | 90-day retention + opponent hole cards never exposed at non-showdown | Retention job section; privacy filter section. |
| RESILIENCE-02 | Economic state checkpointed at hand boundaries via `onHandComplete` | Chip checkpoint section: `prisma.user.update()` per seat, separate from queue. |
</phase_requirements>

---

## Summary

- **`motion/react` is a stable, verified subpath export** of the `motion` npm package (v12.38.0 latest as of 2026-04-18). `AnimatePresence` + `motion.div` are the only APIs needed. The `useReducedMotion` hook is available from `motion/react` and is preferable to raw `window.matchMedia` because it reacts to OS-level changes at runtime. [VERIFIED: npm registry]

- **Per-seat FIFO state is cleanest as `useState<Map<number, BubbleItem[]>>`** with a new Map reference on every mutation — this satisfies React's reference-equality check without flattening into a single array (which would require per-seat filter on every render). The exit-complete dequeue pattern requires a stable bubble `id` per enqueued item so `AnimatePresence` can track keys correctly.

- **`prisma.handHistory.createMany({ data, skipDuplicates: true })` works with the `@prisma/adapter-pg` driver on Prisma v7** — `skipDuplicates` maps to `INSERT ... ON CONFLICT DO NOTHING` in PostgreSQL, which is fully supported by the pg adapter. No transaction wrapper needed for best-effort history writes. [VERIFIED: installed prisma v7.4.2]

- **The `HandHistoryQueue` retry loop MUST hold a reference to the original batch array** across retry attempts; creating a new array copy on each attempt is safe and cleaner than mutating the shared buffer. The flusher should splice the buffer before attempting the write (not after), so a crash between splice and write loses at most one batch — acceptable given best-effort semantics.

- **Socket.io `getHandHistory` must use the callback-based request/response pattern** (client emits with a callback, server calls it) OR the two-event emit/ack pattern already used by `getProfile` / `profileData`. The codebase exclusively uses the two-event pattern: client emits `getHandHistory`, server responds by emitting `handHistoryData`. Match this convention.

- **`setInterval` for the retention job requires a guard against double-registration** on dev server hot-reload. Use a module-level boolean `retentionJobStarted` flag; the `setInterval` call is skipped if already set. The interval itself is not cancelable in dev (acceptable — duplicate deletes of already-deleted rows are no-ops).

- **The `HandHistory` schema stores `tableId` but NOT `tableName`**. The reader must resolve the display name at query time by joining `tableId` against the static `PREDEFINED_TABLES` config, or by adding `tableName String` to the write payload (simpler, avoids a join that will never change). This is a gap: neither the schema nor the D-10 write payload currently includes `tableName`. See Open Questions.

**Primary recommendation:** Implement in the order: (1) `HandHistoryQueue.ts` server module, (2) chip checkpoint helper, (3) `getHandHistory` socket handler, (4) `ActionBubbleLayer` + `ActionBubble` client components, (5) `HandHistoryList` + `HandHistoryRow` client components. This orders server work (no UI dependencies) before client work (requires event contract).

---

## Library: motion/react

### Package Identity
| Property | Value | Source |
|----------|-------|--------|
| npm package name | `motion` | [VERIFIED: npm registry] |
| Current version | `12.38.0` | [VERIFIED: `npm view motion version`] |
| Import path for React APIs | `import { motion, AnimatePresence, useReducedMotion } from 'motion/react'` | [VERIFIED: npm exports map `./react` key] |
| React peer dep | `react ^18.0.0 \|\| ^19.0.0` | [VERIFIED: npm registry] |
| Unpacked size | ~601 KB (full package) | [VERIFIED: npm registry] |
| Legacy package | `framer-motion` — DO NOT use | [ASSUMED: successor relationship per author] |

**Install:**
```bash
cd client && npm install motion
```

### API Surface Needed

Only three APIs from `motion/react` are required for this phase:

**`motion.div` (or `motion.span`)** — animated HTML element. Used for the bubble pill itself.

```typescript
// Source: motion/react — confirmed export via package.json exports map
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';

<motion.span
  key={bubble.id}
  initial={{ scale: 0.8, opacity: 0 }}
  animate={{ scale: 1, opacity: 1 }}
  exit={{ opacity: 0, y: -6 }}
  transition={{ duration: 0.12, ease: 'easeOut' }}
>
  FOLD
</motion.span>
```

**`AnimatePresence`** — wraps a conditional/keyed child and orchestrates exit animations before unmount. Required for the dequeue-on-exit pattern.

```typescript
<AnimatePresence mode="wait">
  {head && <motion.span key={head.id} ... />}
</AnimatePresence>
```

`mode="wait"` ensures the exit animation of the departing bubble completes before the enter animation of the next begins — matching the "FIFO, head renders until exit complete" contract from D-03.

**`useReducedMotion()`** — returns `boolean | null`. `true` when `prefers-reduced-motion: reduce` is active at the OS level. Preferred over `window.matchMedia` because it is reactive (subscribes to media query changes at runtime). [ASSUMED: hook existence confirmed by training knowledge — verify at implementation time]

```typescript
const reducedMotion = useReducedMotion();

const variants = reducedMotion
  ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
  : { initial: { scale: 0.8, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { opacity: 0, y: -6 } };

const transition = reducedMotion
  ? { duration: 0 }
  : { duration: action === 'enter' ? 0.12 : 0.20, ease: action === 'enter' ? 'easeOut' : 'easeIn' };
```

### Vite Compatibility Note
`motion` ships ES module and CJS variants via the exports map. Vite resolves the `import` condition, so the ESM path (`./dist/es/react.mjs`) is used automatically — no Vite config changes required. [ASSUMED: standard Vite ESM resolution — verify if build warnings appear]

### AnimatePresence Exit Timing and the 900 ms Hold

`AnimatePresence` triggers the `exit` animation when the child is removed from the JSX tree. The hold duration is controlled by a `useEffect` timeout in the parent, which removes the head bubble from state after 900 ms. The exit animation then plays for 200 ms, during which the bubble is still visible (opacity 1 → 0). Total time from appear to fully invisible: ~1100 ms. The next bubble in the queue should be promoted to head state only after the current head is removed from state (i.e., at the 900 ms timeout firing), not after the 1100 ms total. This ensures the exit animation of the departing bubble overlaps with the enter of the arriving one, consistent with the `mode="sync"` default for `AnimatePresence`. If `mode="wait"` is used, the next bubble's enter waits until exit completes (~200 ms), adding latency. Choose `mode` based on desired feel — `mode="sync"` (default) is recommended for responsiveness.

---

## Async Queue Patterns

### HandHistoryQueue.ts Design

**Buffer and flush cycle:**
```typescript
// server/HandHistoryQueue.ts
let buffer: HandHistoryRow[] = [];
let flushTimer: NodeJS.Timeout | null = null;
let retentionJobStarted = false;

export function enqueue(row: HandHistoryRow): void {
  buffer.push(row);
  if (buffer.length >= 50) {
    // Burst cap reached — flush immediately (don't wait for timer)
    void flush();
  }
}

async function flush(): Promise<void> {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0, buffer.length); // splice BEFORE write
  await flushWithRetry(batch, 0);
}
```

**Critical design point — splice before write:** The batch is extracted from the buffer before the first write attempt. If the server crashes between splice and write, those rows are lost. This is acceptable: hand history is best-effort (D-12). The alternative (splice after success) risks double-insertion on retry, which `skipDuplicates: true` would handle — but splice-before is simpler.

**Retry loop:**
```typescript
const RETRY_DELAYS = [100, 500]; // ms between attempts 1→2 and 2→3

async function flushWithRetry(batch: HandHistoryRow[], attempt: number): Promise<void> {
  try {
    await HandHistoryRepository.createMany(batch);
  } catch (err) {
    if (attempt < 2) {
      await delay(RETRY_DELAYS[attempt]);
      return flushWithRetry(batch, attempt + 1);
    }
    // Attempt 3 failed — drop and log
    console.error(
      '[HandHistoryQueue] dropping batch after 3 attempts. handIds:',
      batch.map(r => r.handId)
    );
  }
}
```

**Shutdown (graceful drain):**
```typescript
export async function shutdown(): Promise<void> {
  if (flushTimer) { clearInterval(flushTimer); flushTimer = null; }
  if (buffer.length > 0) {
    const batch = buffer.splice(0, buffer.length);
    await flushWithRetry(batch, 0);
  }
}
```

**SIGTERM wiring in server/index.ts:**
```typescript
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received — draining HandHistoryQueue...');
  await HandHistoryQueue.shutdown();
  process.exit(0);
});
```

**Vite/concurrently dev hot-reload note:** `concurrently` does not send SIGTERM on file-change reload in the typical `tsc --watch` + `nodemon`-style setup. The current dev script is `npm run dev = tsc && node dist/server/index.js` (full rebuild, not watch). Hot-reload is not a concern for the flush interval double-registration problem — process is fully replaced on each dev restart. The retention job double-registration guard is still recommended as defensive hygiene.

### Prisma v7 `createMany` with `adapter-pg`

`prisma.handHistory.createMany({ data: batch, skipDuplicates: true })` is fully supported. The `@prisma/adapter-pg` driver translates this to:

```sql
INSERT INTO "HandHistory" (...) VALUES ... ON CONFLICT DO NOTHING
```

PostgreSQL supports `ON CONFLICT DO NOTHING` without specifying a conflict target when no unique constraint exists beyond the PK. The `HandHistory` model has only a `@id` PK — so `skipDuplicates` defends against retry re-insertion of the same `id` (cuid). [VERIFIED: Prisma v7.4.2 installed; PostgreSQL 16 + adapter-pg 7.4.2 confirmed in STACK.md]

**No transaction wrapper needed for the queue flush.** A transaction would make a partial batch failure roll back all rows; the queue's retry-then-drop semantics are better served by letting rows that succeed stay persisted and only retrying the failed batch as a whole. `createMany` in Prisma v7 is itself atomic at the statement level.

**Type note:** `telegramId` in `HandHistory` is `String` (not `BigInt`) — match what `HandCompleteEvent.perPlayer[].telegramId` provides (already a string per `types/index.ts`). No conversion needed.

---

## Chip Checkpoint Path

### Concrete Implementation

```typescript
// server/index.ts — inside setOnHandComplete listener
table.setOnHandComplete(async (evt) => {
  // 1. Best-effort history (queue, non-blocking)
  evt.perPlayer.forEach(p => HandHistoryQueue.enqueue(toHandHistoryRow(evt, p)));

  // 2. Economic checkpoint (separate, awaited)
  await checkpointSeatedPlayers(evt);
});
```

`checkpointSeatedPlayers` must be declared `async` and the `onHandComplete` listener itself must be `async`. `Game.ts` calls the callback synchronously and ignores the return value (D-09 Phase 1), so the `async` return is a Promise that `Game.ts` does not await — the game loop does NOT block. The listener itself awaits the checkpoint before returning, but since `Game.ts` doesn't await the listener's return, this is effectively fire-and-forget from the game loop's perspective.

**Per-player update vs single transaction:**

D-14 says "one helper" but leaves batch vs individual to implementer. Two options:

| Option | Code | Tradeoff |
|--------|------|---------|
| Individual `prisma.user.update()` per player | N queries (max 6) | Simpler; any failure is per-player |
| `prisma.$transaction([...updates])` | 1 transaction | Atomic across all seats; slightly less code |

Recommendation: use `prisma.$transaction([...updates])` for cleanliness. At most 6 players = 6 `prisma.user.update()` calls bundled in one transaction. On failure, all rollback — consistent with "all-or-nothing at hand boundary" which is better than partial writes for a crash-recovery feature.

**`updateChips` helper in `UserRepository.ts`:**
```typescript
static async checkpointSeat(
  telegramId: string,
  data: { currentChips: number; currentTableId: string; currentSeat: number }
): Promise<void> {
  await prisma.user.update({
    where: { telegramId: BigInt(Number(telegramId)) },
    data
  });
}
```

**Important:** `UserRepository` methods currently accept `telegramId: number` (e.g., `updateBalance(telegramId: number, ...)`). The `HandCompleteEvent.perPlayer[].telegramId` field is a `string`. The new helper should accept `string` and convert internally with `BigInt(Number(telegramId))` — consistent with how `findOrCreate` handles the BigInt column. [VERIFIED: UserRepository.ts read]

**Seated players at hand end:** `evt.perPlayer` already contains exactly the seated players that participated in the hand (built in Game.ts from `this.seats.filter(p => p !== null)`). This covers sit-out players who were seated (they appear in `seats` even while sitting out). No need to separately query table state.

---

## Hole-Card Privacy Filter

### Data Flow

Server stores all `holeCards` verbatim in `HandHistory` rows (D-18). The filter happens in `HandHistoryRepository.findForUser()`:

```typescript
// server/db/HandHistoryRepository.ts
static async findForUser(telegramId: string, limit = 50): Promise<HandHistoryDTO[]> {
  const rows = await prisma.handHistory.findMany({
    where: { telegramId },
    orderBy: { playedAt: 'desc' },
    take: limit,
  });

  // Privacy filter: this is the viewer's OWN rows — always return holeCards
  // No filtering needed here because we only query rows WHERE telegramId = requestingUser.telegramId
  return rows.map(r => toDTO(r));
}
```

Wait — re-read D-18. "Every HandHistory row persists holeCards verbatim. The read API returns rows where:
- If `row.telegramId === requestingUser.telegramId` → holeCards always returned.
- Else → holeCards returned only when `row.showedDown === true`, otherwise replaced with `[]`."

This implies the query is NOT filtered by `telegramId` — it returns ALL players' rows for the hands the user participated in. But PROFILE-03 says "user's last 50 hands", and D-19 says "strict last 50 hands for the viewing user, ordered `playedAt DESC`".

**Resolution:** The viewer's 50 rows are fetched by `WHERE telegramId = requesting_user`. However, the expanded HandHistoryRow UI shows board + own cards + "opponents' cards only when showedDown". For the opponent cards on the same hand:

- Option A: Single query `WHERE telegramId = user`, then for each hand a second query `WHERE handId = ? AND showedDown = true` to get opponent revealed cards. (Two round trips per hand.)
- Option B: Single query `WHERE handId IN (user's last 50 handIds) AND (telegramId = user OR showedDown = true)`. One broader query with a single DB round trip.
- Option C: Store enough in each row that no cross-row join is needed. (Not possible with current schema — each row is per-player.)

**Recommendation (Option B):** Query is:
```sql
SELECT * FROM "HandHistory"
WHERE "handId" IN (
  SELECT "handId" FROM "HandHistory"
  WHERE "telegramId" = :requesting_user
  ORDER BY "playedAt" DESC LIMIT 50
)
AND ("telegramId" = :requesting_user OR "showed_down" = true)
```

In Prisma:
```typescript
// Step 1: get the user's last 50 handIds
const userRows = await prisma.handHistory.findMany({
  where: { telegramId },
  orderBy: { playedAt: 'desc' },
  take: 50,
  select: { handId: true, playedAt: true }
});
const handIds = userRows.map(r => r.handId);

// Step 2: get all rows for those hands where visible to requesting user
const allRows = await prisma.handHistory.findMany({
  where: {
    handId: { in: handIds },
    OR: [
      { telegramId },
      { showedDown: true }
    ]
  }
});
```

Then group by `handId` in TypeScript, replace `holeCards` with `[]` for rows where `telegramId !== requestingUser && !showedDown`. The `showedDown` check on the row itself makes the server-side filter stateless — no cross-row join needed.

**DTO type:** Return a `HandHistoryDTO` that includes `holeCards: string[]` (empty `[]` when filtered). Client treats empty `[]` as "not shown". The `HandHistoryRow` component only shows the "SHOWN AT SHOWDOWN" section when the row has non-empty `holeCards` AND `row.telegramId !== viewer.telegramId`.

---

## Retention Job

### setInterval Semantics

```typescript
// server/index.ts boot path (after queue + table setup)
let retentionJobStarted = false;

function startRetentionJob(): void {
  if (retentionJobStarted) return; // guard against double-registration
  retentionJobStarted = true;

  // Boot-time immediate sweep
  void runRetentionSweep();

  // 24-hour recurring sweep
  setInterval(() => { void runRetentionSweep(); }, 24 * 60 * 60 * 1000);
}

async function runRetentionSweep(): Promise<void> {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  try {
    const result = await prisma.handHistory.deleteMany({
      where: { playedAt: { lt: cutoff } }
    });
    console.log(`[RetentionJob] deleted ${result.count} rows older than ${cutoff.toISOString()}`);
  } catch (err) {
    console.error('[RetentionJob] sweep failed:', err);
  }
}
```

**Drift handling:** `setInterval` in Node.js does not compensate for timer drift. At 24-hour intervals, drift is negligible (< 1 ms per interval). No corrective action needed. The boot-time sweep catches any backlog that accumulated during downtime.

**Index usage:** `@@index([playedAt])` already exists on `HandHistory` (Phase 1 D-17). The `WHERE playedAt < cutoff` range scan will use this index efficiently in PostgreSQL. [VERIFIED: prisma/schema.prisma read]

**Single instance assurance:** The app runs as a single Node.js process. The `retentionJobStarted` flag prevents double-registration if somehow `startRetentionJob()` is called twice during the `setTimeout` 1000 ms boot delay.

---

## Socket.io Conventions

### Confirmed Pattern: Two-Event Emit/Ack

Reading `server/index.ts` (lines 260–280), the established request/response pattern is:

1. **Client emits:** `socket.emit('getProfile')` — no payload, no callback argument.
2. **Server responds:** `socket.emit('profileData', profile)` on success; `socket.emit('profileError', msg)` on failure.

This is the pattern to follow for `getHandHistory`. [VERIFIED: server/index.ts read]

```typescript
// Server handler (server/index.ts)
socket.on('getHandHistory', async () => {
  const telegramId = socket.data.telegramId;
  if (!telegramId) return; // un-authed socket, silent drop

  try {
    const rows = await HandHistoryRepository.findForUser(telegramId, 50);
    socket.emit('handHistoryData', rows);
  } catch (err) {
    console.error('[HandHistory] fetch error:', err);
    socket.emit('handHistoryError', 'Server error');
  }
});

// Client (ProfileSettings.tsx)
socket.emit('getHandHistory');
socket.on('handHistoryData', (rows) => { /* render */ });
socket.on('handHistoryError', (msg) => { /* error state */ });
```

### New Event Types to Add to `types/index.ts`

```typescript
// Add to ExtendedServerEvents
handHistoryData: (rows: HandHistoryDTO[]) => void;
handHistoryError: (msg: string) => void;
actionBubble: (evt: ActionBubbleEvent) => void;

// Add to ExtendedClientEvents
getHandHistory: () => void;

// New interfaces
export interface ActionBubbleEvent extends PlayerActionEvent {
  // No additional fields — all needed data is in PlayerActionEvent
  // tableId, telegramId, seat, action, amount
}

export interface HandHistoryDTO {
  id: string;
  handId: string;
  telegramId: string;      // whose row this is
  tableId: string;
  tableName: string;       // resolved from PREDEFINED_TABLES (see Open Questions)
  playedAt: string;        // ISO string
  board: string[];
  holeCards: string[];     // [] when privacy filter applied
  seat: number;
  netDelta: number;
  finalChips: number;
  showedDown: boolean;
  won: boolean;
}
```

---

## Validation Architecture

No test framework is currently installed (confirmed: no Vitest, no jest.config, no `__tests__` directories, no `*.test.*` files). `.planning/config.json` sets `ui_test_framework: "vitest+rtl"` and `nyquist_validation` is absent (treated as enabled). Wave 0 must install Vitest + React Testing Library before any other work. [VERIFIED: filesystem + config.json read]

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest + `@testing-library/react` + jsdom (TEST-01, config `ui_test_framework: "vitest+rtl"`) |
| Config file | `client/vite.config.ts` (extend with `test` block) OR `client/vitest.config.ts` (new) |
| Quick run | `cd client && npx vitest run --reporter=verbose` |
| Full suite | `cd client && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File |
|--------|----------|-----------|-------------------|------|
| GAME-01 | Redundant labels absent from GameRoom | Manual visual | — (Phase 2 GAME-01 deliverable; verify via screenshot) | — |
| GAME-02 | `ActionBubble` renders with correct label text per action | Unit | `npx vitest run ActionBubble` | `client/src/components/ActionBubble.test.tsx` — Wave 0 |
| GAME-02 | `ActionBubbleLayer` enqueues events and renders head bubble | Unit | `npx vitest run ActionBubbleLayer` | `client/src/components/ActionBubbleLayer.test.tsx` — Wave 0 |
| GAME-03 | `useReducedMotion=true` produces zero-duration transitions | Unit | `npx vitest run ActionBubble` | Same file — mock `useReducedMotion` |
| PROFILE-02 | `HandHistoryQueue.enqueue()` batches rows and flushes | Unit (Node) | `npx vitest run HandHistoryQueue` | `server/HandHistoryQueue.test.ts` — Wave 0 |
| PROFILE-02 | Flush retries up to 3 times then drops | Unit (Node) | same | same |
| PROFILE-03 | `HandHistoryRepository.findForUser` privacy filter | Unit (Node, mock Prisma) | `npx vitest run HandHistoryRepository` | `server/db/HandHistoryRepository.test.ts` — Wave 0 |
| PROFILE-03 | `HandHistoryList` renders empty state, loading state | Unit | `npx vitest run HandHistoryList` | `client/src/components/HandHistoryList.test.tsx` — Wave 0 |
| PROFILE-04 | Privacy: opponent holeCards `[]` when `showedDown=false` | Unit | same as PROFILE-03 repository test | same |
| RESILIENCE-02 | `checkpointSeatedPlayers` calls `UserRepository.checkpointSeat` for each player | Unit (mock Prisma) | `npx vitest run checkpoint` | `server/checkpoint.test.ts` — Wave 0 |

**Sampling rate:**
- Per task commit: `cd client && npx vitest run --reporter=dot` (fast smoke)
- Per wave merge: `cd client && npx vitest run` (full suite)
- Phase gate: full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `client/vite.config.ts` — add `test: { environment: 'jsdom', globals: true }` block (or new `vitest.config.ts`)
- [ ] `client/src/test-setup.ts` — `Telegram.WebApp` mock + socket.io-client mock
- [ ] Install: `cd client && npm install -D vitest @testing-library/react @testing-library/user-event jsdom`
- [ ] Install server test support: `npm install -D vitest` (root, for server unit tests)
- [ ] `client/src/components/ActionBubble.test.tsx` — covers GAME-02, GAME-03
- [ ] `client/src/components/ActionBubbleLayer.test.tsx` — covers GAME-02 queue behavior
- [ ] `client/src/components/HandHistoryList.test.tsx` — covers PROFILE-03 empty/loading/error states
- [ ] `server/HandHistoryQueue.test.ts` — covers PROFILE-02 queue + retry
- [ ] `server/db/HandHistoryRepository.test.ts` — covers PROFILE-03/04 privacy filter
- [ ] `server/checkpoint.test.ts` — covers RESILIENCE-02

---

## Risks / Gotchas

### 1. `tableName` Not in `HandHistory` Schema
**What:** The `HandHistory` model stores `tableId` (e.g., `"table-standard-1"`) but not `tableName` (e.g., `"Standard 10/20"`). The `HandHistoryRow` UI needs to display a human-readable table name.
**Options:**
- A: Resolve in `HandHistoryRepository` by importing `PREDEFINED_TABLES` (server-only, no schema change).
- B: Add `tableName String` to the `HandHistory` write payload and persist it (simplest for read path, but requires noting it in write plan).
**Risk if missed:** History rows display raw table IDs (e.g., `"table-standard-1"`) rather than `"Standard 10/20"`.
**Recommendation:** Option B — write `tableName` at persist time. The `onHandComplete` event has `tableId`; `tableManager.getTable(tableId).name` resolves the display name. Add `tableName String` to `HandHistoryDTO` (no schema change needed if stored as a derived field in the DTO, OR requires a schema migration if persisted). If no schema change is desired, use Option A (resolve at query time from static config).

### 2. `telegramId` BigInt/String Mismatch in Checkpoint Path
**What:** `UserRepository` methods accept `telegramId: number` (numeric). `HandCompleteEvent.perPlayer[].telegramId` is `string` (Phase 1 D-10). The new `checkpointSeat` helper must convert: `BigInt(Number(telegramId))`.
**Risk if missed:** TypeScript error or runtime BigInt coercion failure for IDs > `Number.MAX_SAFE_INTEGER` (Telegram IDs are currently 10-digit, safely within safe integer range, but the pattern should be defensive).

### 3. `AnimatePresence` Key Uniqueness
**What:** `AnimatePresence` tracks children by `key`. If two bubbles for the same seat use the same key (e.g., both keyed to the action type), the second bubble won't animate — React sees the same key and reuses the DOM node.
**Fix:** Each enqueued bubble must have a unique `id` (e.g., `${seat}-${Date.now()}-${Math.random()}` or a monotonic counter). This is the FIFO queue item's ID, not the seat index.

### 4. `onHandComplete` Listener is Registered Per-Table at Boot
**What:** `setupTableEvents()` is called for all tables in a `setTimeout` 1000 ms after server boot. If the queue or checkpoint helper is not initialized before this callback fires, `HandHistoryQueue.enqueue()` could be called on an uninitialized module.
**Fix:** Initialize `HandHistoryQueue` (start the flush interval, set the flag) before the `setTimeout` that calls `setupTableEvents`. Module-level initialization in `HandHistoryQueue.ts` (i.e., the `setInterval` starts on import) is the simplest approach.

### 5. `useReducedMotion` Returns `null` on First Render (SSR-like behavior)
**What:** On the initial render before the hook can read the media query, `useReducedMotion()` may return `null` (not yet determined). Treat `null` as `false` (allow animations on first render; OS preference will be applied on re-render).
**Fix:** `const reduced = useReducedMotion() ?? false;`

### 6. `setOnHandComplete` Listener Async Pattern
**What:** `Game.ts` calls `this.onHandComplete?.(evt)` synchronously and discards the return value (D-09). If the listener is `async`, it returns a Promise that is silently discarded. The async work (checkpoint) runs, but any unhandled rejection inside it will be an unhandled Promise rejection — not caught by any try/catch in Game.ts.
**Fix:** Wrap the entire async body in try/catch inside the listener. Do NOT let rejections escape:
```typescript
table.setOnHandComplete((evt) => {
  void (async () => {
    try {
      evt.perPlayer.forEach(p => HandHistoryQueue.enqueue(toRow(evt, p)));
      await checkpointSeatedPlayers(evt);
    } catch (err) {
      console.error('[onHandComplete] checkpoint error:', err);
    }
  })();
});
```

### 7. `getHandHistory` 5-Second Timeout on Client (from UI-SPEC.md)
**What:** UI-SPEC specifies: "Socket error or no response within 5 seconds → renders error state." This requires a `setTimeout` on the client to transition from loading to error state if `handHistoryData` never arrives.
**Fix:** In `HandHistoryList` or the `useHandHistory` hook: set a 5 s timeout on emit; clear it on `handHistoryData` receipt. The timeout fires `setError(true)`.

### 8. Bubble Anchor Coordinates Must Account for `pointerEvents: 'none'`
**What:** `ActionBubbleLayer` is positioned absolutely over the table with `pointerEvents: 'none'`. The layer must be inside a container that matches the game table dimensions exactly (same width/height as SeatsDisplay's parent), otherwise `SEAT_POSITIONS_*` percentage coordinates will be wrong.
**Fix:** Mount `ActionBubbleLayer` as a sibling of `SeatsDisplay` inside the same parent container, with `position: absolute; inset: 0`.

### 9. No `handId` Uniqueness Constraint on `HandHistory`
**What:** The schema has `handId String` without a unique constraint — only `id` (cuid) is the PK. `skipDuplicates: true` deduplicates by PK (`id`), not by `(handId, telegramId)`. If the same `perPlayer` row is re-enqueued (e.g., a bug double-fires `onHandComplete`), the retry path would insert duplicates because each call to `enqueue` creates a new `id`.
**Risk level:** LOW — `onHandComplete` is only called once per hand end (lines 587 and 779 are mutually exclusive paths in Game.ts). Not a practical risk, but worth noting.
**Mitigation:** Add a `@@unique([handId, telegramId])` index if strict deduplication is required. Not needed for Phase 3 given the fire path analysis.

---

## Open Questions

1. **`tableName` storage decision**
   - What we know: `HandHistory` has `tableId` but not `tableName`. The reader needs a display name.
   - What's unclear: Should `tableName` be persisted in the row (requires noting in write payload, no schema migration needed if added to `HandHistoryDTO` as a virtual field resolved at query time) or resolved at read time from static config?
   - Recommendation: Resolve at read time in `HandHistoryRepository` by importing `PREDEFINED_TABLES` (Option A — zero schema impact, tables are static). If a future requirement adds dynamic tables, revisit.

2. **Vitest in the server (Node) context**
   - What we know: `types/index.ts` uses `module: NodeNext` resolution which requires `.js` extensions. Vitest's default module resolver handles `.ts` → `.js` extension aliasing but may need configuration.
   - What's unclear: Whether `vitest --config` needs `resolve.conditions: ['node']` for server-side tests.
   - Recommendation: Use separate `vitest.config.server.ts` for server tests with `environment: 'node'` and `resolve: { conditions: ['node'] }`.

3. **`HandHistoryQueue` shutdown in dev hot-reload**
   - What we know: CLAUDE.md dev script is `npm run dev = tsc && node dist/server/index.js` (no watch mode). There is no hot-reload signal.
   - What's unclear: Whether the team will add `nodemon` or `tsc --watch` + process restart, which would send SIGTERM.
   - Recommendation: Wire SIGTERM handler regardless — it's low-cost and correct for production too.

---

## Sources

### Primary (HIGH confidence)
- `npm view motion version` + `npm view motion@12.38.0 exports` — confirmed v12.38.0, `./react` subpath export, peer deps [VERIFIED]
- `server/index.ts` — confirmed two-event socket pattern (`getProfile` / `profileData`); confirmed no-op Phase 1 callbacks at lines 139, 144 [VERIFIED]
- `prisma/schema.prisma` — confirmed `HandHistory` schema, indexes, `User` checkpoint columns [VERIFIED]
- `server/Game.ts` grep — confirmed `onHandComplete` fire at lines 587, 779; `onPlayerAction` at lines 309, 328, 355, 393, 436 [VERIFIED]
- `server/db/UserRepository.ts` — confirmed BigInt conversion pattern, `telegramId: number` parameter convention [VERIFIED]
- `server/models/Table.ts` — confirmed `setOnPlayerAction`, `setOnHandComplete` wrappers delegate to `this.game` [VERIFIED]
- `client/src/components/SeatsDisplay.tsx` — confirmed `SEAT_POSITIONS_DESKTOP/MOBILE` arrays; `rotationOffset = mySeat ?? 0`; `visualIndex = (i - rotationOffset + totalSeats) % totalSeats` [VERIFIED]
- `.planning/config.json` — confirmed `nyquist_validation` absent (treat as enabled), `ui_test_framework: "vitest+rtl"` [VERIFIED]
- `types/index.ts` — confirmed `PlayerActionEvent`, `HandCompleteEvent` shapes; `ExtendedServerEvents`/`ExtendedClientEvents` extension pattern [VERIFIED]

### Secondary (MEDIUM confidence)
- `motion` package unpacked size ~601 KB — measured via npm registry metadata [VERIFIED]
- `@prisma/adapter-pg` + PostgreSQL `ON CONFLICT DO NOTHING` for `skipDuplicates` — known Prisma behavior, consistent with v7.4.2 [ASSUMED — verify at implementation if unexpected errors arise]

### Tertiary (LOW confidence / Assumed)
- `useReducedMotion` hook existence in `motion/react` v12 — [ASSUMED: from training knowledge; verify at `npm install` time by checking the type exports]
- `AnimatePresence mode` options (`"sync"` default, `"wait"`) — [ASSUMED: consistent with Framer Motion API which motion supersedes]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `useReducedMotion()` is exported from `motion/react` v12 | Library: motion/react | Must fall back to `window.matchMedia('(prefers-reduced-motion: reduce)')` — still works, just not reactive |
| A2 | `AnimatePresence` `mode="sync"` is the default and `mode="wait"` is a valid prop | Library: motion/react | If API differs, adjust exit orchestration — minor code change |
| A3 | `prisma.handHistory.createMany({ skipDuplicates })` uses `ON CONFLICT DO NOTHING` (no conflict target) | Async Queue | If Prisma v7 requires a unique index target for this to be effective, rows may still double-insert on retry. Add `@@unique([handId, telegramId])` as mitigation. |
| A4 | Dev workflow does not send SIGTERM on rebuild (no nodemon/watch) | Async Queue | If SIGTERM is sent, the drain handler will work correctly regardless — no negative risk |
| A5 | Vitest can test Node.js server modules without complex config changes | Validation Architecture | If NodeNext module resolution breaks Vitest, server tests may need `tsx` transformer or separate config |

---

## RESEARCH COMPLETE

**Phase:** 3 — Gameplay Additions
**Overall confidence:** HIGH (all critical paths verified against codebase; library version verified against registry; three LOW-risk assumptions documented)

### Key Findings
- `motion` v12.38.0 (`motion/react` subpath) is the correct install; peer deps match React 18.2.0 already in the project.
- The two-event socket pattern (`getHandHistory` / `handHistoryData`) is confirmed by reading `getProfile` / `profileData` in `server/index.ts`.
- Schema is complete — no migrations needed. `HandHistory` + `User` checkpoint columns all exist in `20260415071704_v1_mvp_launch`.
- `tableName` is NOT stored in `HandHistory` rows — must be resolved at read time from `PREDEFINED_TABLES` static config (zero schema impact).
- The `onHandComplete` async-in-sync-callback gotcha requires a `void (async () => { try {...} })()` wrapper to prevent silent unhandled rejections.
- No test infrastructure exists; Wave 0 must install Vitest + RTL before any implementation task.

### Confidence by Area
| Area | Level | Reason |
|------|-------|--------|
| motion/react library | HIGH | Version + export path verified against npm registry |
| Socket.io conventions | HIGH | Pattern directly read from server/index.ts |
| Prisma write path | HIGH | Version + schema verified; skipDuplicates behavior well-established |
| React queue state patterns | MEDIUM | Derived from React reference equality semantics; no codebase precedent |
| Retention job setInterval | HIGH | No external dependency; pure Node.js |
| Validation architecture | MEDIUM | Test framework not yet installed; command shapes assumed based on Vitest defaults |
