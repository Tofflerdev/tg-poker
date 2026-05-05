# Phase 3: Gameplay Additions - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Enrich gameplay off the Phase 1 callback seams: floating action bubbles over seats, persistent async-written hand history with reader UI and retention, and hand-boundary chip checkpointing for Phase 4 crash recovery.

**In scope:**
1. Action bubbles on every player action (Fold / Check / Call N / Bet N / Raise to N / All-in) over the acting seat, with per-seat FIFO queueing, min display ~800–1000 ms, and `prefers-reduced-motion` honored. `motion/react` is added this phase.
2. Async batched `HandHistory` writer driven by `onHandComplete`; game loop never blocks on DB I/O.
3. Profile → History tab content: last 50 hands for the viewing user, with hole-card privacy (only own hole cards; others only on showdown).
4. 90-day `HandHistory` retention job running inside the server process.
5. Chip / seat / tableId checkpoint for every seated player on each `onHandComplete`, written via a separate synchronous path (not the history queue). Mid-hand ephemeral state never persisted.

**Out of scope (carried over):**
- Reconnect snapshot flow → Phase 4 (RESILIENCE-04/05).
- Player-leaves-table checkpoint clear + chips-refund-to-balance → Phase 4 (RESILIENCE-06/07).
- Sentry / PostHog wiring for failed-flush alerting → Phase 5 (OBS-*).
- Server-side ToS gate on `joinTable` → Phase 5 (COMPLIANCE-04).
- Admin namespace / controls → Phase 5.
- Vitest scenario test for disconnect+reconnect UI → Phase 6.
- Street-by-street hand replayer → v1.1+.

</domain>

<decisions>
## Implementation Decisions

### Action Bubbles (GAME-02, GAME-03)

- **D-01:** Bubble is rendered **client-side**, triggered by a new server-broadcast event `actionBubble` emitted from the Phase 1 `onPlayerAction` listener in `server/index.ts`. One event per action. Payload mirrors `PlayerActionEvent` (tableId, telegramId, seat, action, amount, totalBetThisStreet, potAfter). Existing `gameStateUpdate` is not repurposed — bubbles need their own lifecycle independent of state snapshots.

- **D-02:** **Anchor position: above the seat's avatar, offset outward** (away from the pot center). Never overlaps hole cards or the stack/name strip. Uses the existing `SEAT_POSITIONS_DESKTOP` / `SEAT_POSITIONS_MOBILE` arrays from `SeatsDisplay.tsx` with a small additional outward delta per seat index; "my seat" (bottom center) bubbles render just above the expanded mobile card layout.

- **D-03:** **FIFO scope: per-seat independent queues.** Each seat owns its own queue. Five near-simultaneous folds render on five seats simultaneously. A second action at the same seat queues behind the first and renders after the first's minimum display elapses. No global serialization (rejected: 5 fast folds would take ~5 s to clear, lagging behind actual game pace). No queue-depth cap in Phase 3 — queue depth is naturally bounded by hand flow.

- **D-04:** **Min display 900 ms per bubble** (midpoint of GAME-03's 800–1000 ms band). Single constant; no per-action tuning in Phase 3.

- **D-05:** **Enter/exit animation: pop-scale + fade**, via `motion/react`.
  - Enter: `scale 0.8 → 1.0` + `opacity 0 → 1`, ~120 ms, easeOut.
  - Hold: 900 ms (D-04).
  - Exit: `opacity 1 → 0` + `y: 0 → -6px` drift, ~200 ms, easeIn.
  - Fits the Neon Strip glow/pulse vocabulary already established for seats (`seat-glow-pulse`).

- **D-06:** **`prefers-reduced-motion`: instant in/out, keep 900 ms hold.** No scale, no fade, no drift — bubble snaps in, stays for the minimum, snaps out. Bubbles are never disabled entirely — action is a gameplay-relevant signal.

- **D-07:** **Visual styling — Neon Strip action-tier colored pill.** Border + glow color keyed to the same tokens used by `GameControls` and the `Button` primitive:
  - Fold → `--color-action-fold` (red)
  - Check / Call → `--color-action-call` (cyan)
  - Bet / Raise → `--color-action-raise` (amber)
  - All-in → `--color-action-allin` (orange)
  Pill matches `Button` / `Badge` primitive construction (dark translucent background, 1.5 px 50–60 % opacity border, color-matched box-shadow glow). Text: action verb + amount when applicable (`Fold`, `Check`, `Call 100`, `Bet 200`, `Raise to 500`, `All-in 1200`).

- **D-08:** `motion/react` package is **added to `client/package.json` in this phase**. Not currently present. Import shape: `import { motion, AnimatePresence } from 'motion/react'` (the modern `motion` package, not legacy `framer-motion`). GAME-02 mandates this specific library.

- **D-09:** Bubble renderer is a new component `client/src/components/ActionBubbleLayer.tsx` mounted once inside the Game Room, consuming bubbles from a per-seat queue stored in React state. Kept separate from `SeatsDisplay.tsx` to avoid coupling bubble lifecycle with seat re-render churn.

### Hand-History Write Pipeline (PROFILE-02)

- **D-10:** **In-process memory queue** lives inside the `onHandComplete` listener in `server/index.ts`. Buffer is an array of `HandHistoryRow` objects; a `setInterval` flusher runs every 1 s. No Postgres-backed job table, no external worker (both rejected: overkill for 6 predefined tables, and deploy infra is out of scope this milestone).

- **D-11:** **Flush cadence: every 1 s OR when buffer reaches 50 rows**, whichever comes first. `prisma.handHistory.createMany({ data: batch, skipDuplicates: true })`. `skipDuplicates` defends against retry double-insertion.
  - Expected load: 6 tables × ~6 rows/hand ÷ ~60 s/hand = ~0.6 rows/s steady state — batches are small; the 50-row cap is for burst protection, not steady.
  - Profile → History view lag is bounded by 1 s, which is imperceptible.

- **D-12:** **Failure handling: retry with exponential backoff, drop after 3 attempts, log.**
  - Attempt 1 fails → wait 100 ms → attempt 2.
  - Attempt 2 fails → wait 500 ms → attempt 3.
  - Attempt 3 fails → log `ERROR [HandHistoryQueue] dropping batch` with `handId[]` list, drop the batch.
  - Queue memory is bounded (failed batches are dropped, not retained). Phase 5 will wire Sentry so dropped batches page an operator; Phase 3 logs to stderr.
  - Hand history is best-effort — it is NOT the source of truth for economic state (that's the separate chip checkpoint, D-14). Losing a batch loses a handful of visual rows; it does not corrupt player balances.

- **D-13:** **Queue module:** new file `server/HandHistoryQueue.ts` owning the buffer + flush timer + retry logic. Exports `enqueue(row: HandHistoryRow)` and `shutdown(): Promise<void>` (for graceful drain on SIGTERM). Single singleton instance, initialized in `server/index.ts` boot path.

### Chip Checkpoint (RESILIENCE-02)

- **D-14:** **Separate synchronous path**, not the batched hand-history queue. `onHandComplete` listener calls an `async` helper `checkpointSeatedPlayers(table)` that issues `prisma.user.update()` per seated player (or a single `prisma.$transaction([...])` if batching reads cleaner). Awaited inside the async listener — but does not block the `Game.ts` sync emission (D-09 Phase 1: fire-and-forget from `Game.ts`).

- **D-15:** **Scope: every occupied seat at hand end** gets `currentChips`, `currentTableId`, `currentSeat` written on `onHandComplete`. Covers both hand participants and sit-out players who were still seated. One rule, no exceptions.

- **D-16:** **Player-leaves-table flow (cashout, kick, grace-window expiry) stays in Phase 4** (RESILIENCE-06/07). Phase 3 only writes at hand boundaries; existing cashout logic in `server/index.ts` is untouched. This preserves a clean phase boundary.

- **D-17:** **Mid-hand ephemeral state is never persisted** — hole cards, street bets, per-street pot snapshots, turn timer state. The callback payloads carry final values at hand end; nothing fires mid-street.

### Hand-History Reader (PROFILE-03) + Privacy (PROFILE-04)

- **D-18:** **Privacy model: store always + filter at read time.** Every `HandHistory` row persists `holeCards` verbatim. The read API (new Socket.io event `getHandHistory`) returns rows where:
  - If `row.telegramId === requestingUser.telegramId` → `holeCards` always returned.
  - Else → `holeCards` returned only when `row.showedDown === true`, otherwise replaced with `[]`.
  Rejected: null-at-write-time (loses own folded-hand data permanently, blocks any future self-replay feature; also complicates the write payload with cross-player showdown state).

- **D-19:** **Profile → History tab content (Claude's discretion — user skipped this area; sensible defaults):**
  - Strict **last 50 hands for the viewing user**, ordered `playedAt DESC`. No "load more" pagination in v1.0 (matches PROFILE-03 literal wording).
  - No filters in v1.0 (by table, by date, by result). Deferred to v1.1+.
  - Row layout: one Card primitive per hand. Visible: relative time (`2m ago`, `3h ago`), table name, net delta colored `--color-action-sit` (green) for wins / `--color-action-fold` (red) for losses, final chips.
  - **Expand-on-tap** reveals board (5 small `Card` components) and the user's own hole cards always + opponents' hole cards only when `showedDown`.
  - Empty state: Neon Strip styled, "Your played hands will appear here" copy.
  - Query: single Socket.io event `getHandHistory`; server returns up to 50 filtered rows. No REST endpoint.

- **D-20:** **90-day retention job: `setInterval` inside the server process.**
  - On boot: fire one sweep immediately (`prisma.handHistory.deleteMany({ where: { playedAt: { lt: dateSub(now(), 90d) } } })`), then schedule `setInterval(sweep, 24h)`.
  - Single process owns it. No external cron, no deploy infra (out of scope).
  - Uses the `@@index([playedAt])` already landed in Phase 1 D-17 for efficient range scan.
  - Logs deleted row count per sweep.

### Claude's Discretion

- Exact `ActionBubbleLayer.tsx` internals (how per-seat queues are stored in React state: `Map<seat, Queue<Bubble>>` vs flat array with `filter`).
- Micro-tuning of animation timings within the D-05 bands (e.g., 120 ms enter vs 140 ms) if motion/react feedback suggests a nicer feel.
- Whether `HandHistoryQueue.shutdown()` also drains on SIGTERM / on hot-reload in dev.
- Internal TypeScript types for the queue row and socket events (shape is fixed by `HandHistory` model + `HandCompleteEvent` payload from Phase 1 D-11).
- Exact Russian/English copy for Profile → History empty state and relative-time formatting.
- Whether to add a small "last updated N s ago" hint to Profile → History (freshness indicator), since the queue introduces up to 1 s lag.

### Folded Todos

None — no matching todos in the backlog for Phase 3.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Milestone
- `.planning/PROJECT.md` — vision, Neon Strip language, current state.
- `.planning/REQUIREMENTS.md` — GAME-01/02/03/04, PROFILE-02/03/04, RESILIENCE-02.
- `.planning/ROADMAP.md` §"Phase 3: Gameplay Additions" — goal, success criteria, requirement mapping.

### Prior Phase Context (established substrate — must be respected)
- `.planning/phases/01-foundations-design-system/01-CONTEXT.md` — §"Game Callback Contract" (D-08..D-12: callback setters, sync fire-and-forget, payload shapes), §"Prisma `v1_mvp_launch` Migration" (D-14..D-17: HandHistory per-player schema, indexes, User columns).
- `.planning/phases/02-design-system-rollout-avatars/02-CONTEXT.md` — §"Shared `ui/` Primitives" (D-04..D-07: Button/Card/Tab/Badge action-tier variants), §"Profile / Settings" (D-20..D-23: 3-tab layout, History tab stub awaiting Phase 3 content).

### Codebase Map
- `.planning/codebase/CONVENTIONS.md` — socket event naming, module layout.
- `.planning/codebase/STACK.md` — Prisma v7 + `@prisma/adapter-pg`, Socket.io-only transport.
- `.planning/codebase/ARCHITECTURE.md` — Game.ts / TableManager / Table wrapper relationship.
- `CLAUDE.md` — Neon Strip UI design notes, commands, env vars.

### Code Touch Points (Phase 3 will create / modify)

**Server:**
- `server/index.ts` — replace Phase 1 no-op `onPlayerAction` body with `actionBubble` broadcast; replace Phase 1 no-op `onHandComplete` body with `HandHistoryQueue.enqueue(...)` + `checkpointSeatedPlayers(table)`; add `getHandHistory` socket handler; boot the queue + retention job.
- `server/HandHistoryQueue.ts` (new) — in-process batched writer with retry/backoff and graceful drain.
- `server/db/HandHistoryRepository.ts` (new) — Prisma CRUD: `createMany`, `findForUser(telegramId, limit=50)`, `deleteOlderThan(date)`. Privacy filter in `findForUser` (D-18).
- `server/db/UserRepository.ts` — add `checkpointSeat(telegramId, { currentChips, currentTableId, currentSeat })` helper.
- `server/models/Table.ts` — expose helper to enumerate currently-seated players at hand end (or reuse existing `getPlayers()` filtered by `seat !== null`).

**Client:**
- `client/src/components/ActionBubbleLayer.tsx` (new) — bubble queue + motion/react rendering.
- `client/src/components/ActionBubble.tsx` (new) — single bubble component, consumes `Badge` or `ui/` primitive style.
- `client/src/pages/GameRoom.tsx` — mount `<ActionBubbleLayer />`; subscribe to `actionBubble` socket event.
- `client/src/pages/ProfileSettings.tsx` — swap Phase 2 History-tab stub for real content; request `getHandHistory` on tab open.
- `client/src/components/HandHistoryList.tsx` (new) — list of rows.
- `client/src/components/HandHistoryRow.tsx` (new) — single row with expand-on-tap.
- `client/package.json` — add `motion` dependency.
- `client/src/hooks/` — optional small hook `useHandHistory()` if it cleans up pages/ProfileSettings.tsx.

**Types:**
- `types/index.ts` — add `ActionBubbleEvent` socket payload (extends `PlayerActionEvent`), `HandHistoryRow` (reader DTO, with `holeCards` optionally empty per privacy rule), `getHandHistory` request/response event types.

### Tooling & Libraries
- `motion` (npm) — new client dep. GAME-02 mandates. Import from `motion/react`.
- `prisma.handHistory.createMany({ data, skipDuplicates: true })` — Prisma v7 batched insert path.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Game.ts` already emits `onPlayerAction` at all five action sites (fold, check, call, raise, all-in) — lines 309, 328, 355, 393, 436 — with the full payload shape from D-10 Phase 1. Server listener in `server/index.ts:139` is wired as a no-op; Phase 3 replaces the body.
- `Game.ts` already emits `onHandComplete` at both hand-end paths (line 587 normal showdown, line 779 single-surviver) with the full payload from D-11 Phase 1. Listener in `server/index.ts:144` is wired as a no-op.
- `HandHistory` table + indexes exist in `prisma/schema.prisma` + migration `20260415071704_v1_mvp_launch` — no schema change needed in Phase 3.
- `User.currentChips` / `currentTableId` / `currentSeat` columns already exist and are nullable — no migration needed.
- `ui/` primitives (`Button`, `Card`, `Tab`, `Badge`) from Phase 2 cover the visual vocabulary — bubbles and history rows reuse them.
- Profile → History tab already exists as a Neon Strip stub (Phase 2 D-23) — Phase 3 drops content into it without reshaping the page.
- `SEAT_POSITIONS_DESKTOP` / `SEAT_POSITIONS_MOBILE` in `SeatsDisplay.tsx` give bubble anchor coordinates; "my seat" rotation logic already seats the viewer at the bottom.

### Established Patterns
- Socket.io-only transport — new `actionBubble` and `getHandHistory` events follow the existing `socket.emit` + handler pattern.
- Server listeners are registered once per table at boot (`setupTableEvents` in `server/index.ts:127`) — queue + checkpoint hooks plug into this same init path.
- Prisma singleton client via `server/db/prisma.ts` — queue uses the same client.
- CSS custom properties from `client/src/styles/neon.css` are the single source of truth for colors; bubbles consume `--color-action-fold|call|raise|allin` same as `Button`.
- Existing action-tier color mapping (red/cyan/amber/orange) maps 1:1 from `action` payload field to token name.

### Integration Points
- `server/index.ts` is the only consumer of both callbacks — the blast radius of Phase 3 on the server is essentially one file plus two new helpers (`HandHistoryQueue`, `HandHistoryRepository`).
- `GameRoom.tsx` mounts the new `ActionBubbleLayer` once; no change to `SeatsDisplay.tsx` required.
- `ProfileSettings.tsx` History tab swap is self-contained (D-23 locked the layout in Phase 2).

</code_context>

<specifics>
## Specific Ideas

- Bubble FIFO is **per-seat**, not global — explicit user preference to avoid the 5-fold serialization drag.
- Chip checkpoint uses a **separate synchronous path**, not the history queue — economic state has different durability requirements than visual history. Hand history is best-effort; chips are source-of-truth.
- Retention uses `setInterval` inside the server process, not external cron — matches the "deploy infra is out of scope" constraint throughout this milestone.
- Hole-card privacy is **read-time filter on always-stored data**, not write-time nulling — preserves optionality for future features without schema change.
- Player-leaves-table flow (cashout clear + refund) is explicitly **Phase 4**, not pulled forward, to keep the phase boundary clean.
- `motion/react` (modern motion package), not legacy `framer-motion` — GAME-02 wording mandates.
- 900 ms min display is the midpoint of the 800–1000 ms GAME-03 band; single constant, no per-action tuning.

</specifics>

<deferred>
## Deferred Ideas

- **Paginated hand history ("load more" beyond 50)** → v1.1+ (strict last-50 satisfies PROFILE-03 literally).
- **Hand history filters (by table, date, result)** → v1.1+.
- **Street-by-street hand replayer** → v1.1+ (already in REQUIREMENTS.md future section).
- **Postgres-backed durable job queue for hand history** → future, only if hand-loss rate becomes a support issue.
- **Sentry alerting on dropped hand-history batches** → Phase 5 (OBS-01).
- **Cashout / kick / grace-expiry checkpoint clear + balance refund** → Phase 4 (RESILIENCE-06/07).
- **Reconnect restores bubble state / in-flight hand view** → Phase 4 (mid-hand ephemeral is never persisted by design; reconnect sends a fresh GameState snapshot, bubbles are purely forward-going).
- **Queue drain / graceful shutdown integration with process signals** → may land in Phase 3 as Claude's discretion if cheap; otherwise Phase 5 operational hardening.
- **Per-action bubble tuning (different display duration per action type)** → future if UX feedback requests it.

### Reviewed Todos (not folded)
None — todo matcher returned zero matches for Phase 3.

</deferred>

---

*Phase: 03-gameplay-additions*
*Context gathered: 2026-04-18*
