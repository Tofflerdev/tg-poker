---
phase: 03-gameplay-additions
verified: 2026-04-22T08:05:00Z
status: human_needed
score: 5/5 success criteria verified (automated); 2 visual/UX tests require human
overrides_applied: 0
human_verification:
  - test: "Play-through visual verification of ActionBubble overlays"
    expected: "Seat each account at a real table, trigger fold/check/call/bet/raise/all-in actions. Each action produces a Neon-Strip pill over the acting seat — red (fold), cyan (check/call), amber (bet/raise), orange (all-in) — with pop-scale+fade enter (~120ms), 900ms hold, opacity+6px y-drift exit (~200ms). Five near-simultaneous folds on five seats render in parallel, not serialized. Second action at the same seat queues and appears after first's 900ms. Mobile and desktop both position bubbles above the seat avatar without overlapping hole cards or the stack/name strip."
    why_human: "Motion-library animation timing and visual anchor positioning cannot be deterministically asserted from jsdom. Unit tests mock motion/react and assert behavioral contracts (hold duration, queue depth, rotation math) but cannot confirm production animation fidelity or anchor placement accuracy over actual table layout."
  - test: "prefers-reduced-motion honor check"
    expected: "Enable OS-level 'prefers-reduced-motion: reduce' (macOS: System Settings → Accessibility → Display → Reduce motion; Windows: Settings → Ease of Access → Display → Show animations). Trigger a player action. Bubble snaps in instantly (no scale, no fade), stays for exactly 900ms, snaps out instantly (no opacity fade, no y-drift). Bubbles are NEVER suppressed — the action signal must remain."
    why_human: "OS-level preference changes cannot be exercised in CI; useReducedMotion's reactive subscription to window.matchMedia must be verified against a real OS toggle."
  - test: "Profile → Hand History end-to-end smoke"
    expected: "Play ≥3 hands (at least one non-showdown fold by opponents, at least one showdown), then open Profile → History tab. List shows up to 50 hands ordered newest-first, each with relative time / table name / signed delta / WIN-LOST-CHOP badge. Tap a row to expand; BOARD section shows 5 community cards, YOUR CARDS always shows your hole cards, SHOWN AT SHOWDOWN section appears ONLY when opponent hands shown down (folded opponents' cards never appear). Empty state renders for a fresh account. Kill the socket mid-load → error state with 'Try closing and reopening your profile.' after 5s."
    why_human: "End-to-end verification requires live Postgres + live socket + multiple Telegram accounts; unit tests cover the privacy predicate and state transitions but not the real data flow."
---

# Phase 3: Gameplay Additions Verification Report

**Phase Goal:** Enrich gameplay with action bubbles, persistent hand history, and hand-boundary chip checkpointing — all driven off the Phase 1 Game callbacks, with writes off the hot path.
**Verified:** 2026-04-22T08:05:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Action bubble renders over the acting seat on every player action with FIFO per-seat queueing, ~900 ms hold, and `prefers-reduced-motion` honored | PASSED (automated) / human_needed (visual) | Server broadcast at `server/index.ts:142-158` (try/catch wrapped `io.to(sid).emit('actionBubble', evt)` loop). Client renderer at `client/src/components/ActionBubbleLayer.tsx` with `HOLD_MS = 900` (line 42), per-seat FIFO via `Map<number, BubbleQueueItem[]>`, `AnimatePresence mode="sync"`, `pointerEvents: 'none'`, `zIndex: 30`. `ActionBubble.tsx:47` uses `useReducedMotion() ?? false` with duration-0 variants when reduced. Layer mounted at `GameRoom.tsx:213` inside a `position: relative` wrapper; socket subscription at `GameRoom.tsx:104-107`. 8 ActionBubble tests + 8 ActionBubbleLayer tests pass covering: per-seat parallel render of 5 seats, same-seat FIFO 900ms advance, unique-id key collision guard, rotation with mySeat, unmount cleanup, CSS-var-only styling (no hex literals), reduced-motion null/true safety. |
| 2 | Hand completion writes a HandHistory row per participating player through an async batched queue; the game loop never blocks on DB I/O | VERIFIED | `setOnHandComplete` listener at `server/index.ts:160-177` uses `void (async () => { ... })()` fire-and-forget IIFE. Inside: `evt.perPlayer.forEach((p) => HandHistoryQueue.enqueue(...))` synchronously pushes to in-memory buffer. `server/HandHistoryQueue.ts` flushes every 1000ms OR when buffer reaches 50 rows (`FLUSH_THRESHOLD`), with splice-before-write (`buffer.splice(0, buffer.length)` at line 53), retry-with-backoff `[100, 500]` ms (`RETRY_DELAYS_MS` line 19), drop + `console.error` after 3 attempts. `HandHistoryRepository.createMany` uses `skipDuplicates: true`. 6 HandHistoryQueue tests pass including retry-drop cycle, 50-row immediate flush, 1s interval flush, idempotent startFlushTimer, shutdown drain. |
| 3 | Player opens Profile → Hand History and sees last 50 hands; only own hole cards visible, opponents only at showdown | PASSED (automated) / human_needed (E2E) | `getHandHistory` zero-arg socket handler at `server/index.ts:338-351` — reads `telegramId` from `socket.data.telegramId` ONLY (T-3-AUTHZ), emits `authError` if missing, calls `HandHistoryRepository.findForUser(telegramId)` with no limit arg. `HandHistoryRepository.findForUser` at `server/db/HandHistoryRepository.ts:97` performs two-step query (own rows then `{ handId: { in: handIds } }`), applies `Math.min(Math.max(1, Math.trunc(limit)), 50)` clamp, and applies `holeCards: r.showedDown ? r.holeCards : []` for opponents at line 140. Own cards always verbatim (line 154). Client UI at `client/src/pages/ProfileSettings.tsx:502-504` mounts `<HandHistoryList socket={socket} active={activeTab === 'history'} />`. `client/src/hooks/useHandHistory.ts` emits `getHandHistory` on activation, 5s timeout (`REQUEST_TIMEOUT_MS = 5000` line 31), race guard via `requestIdRef`. `client/src/components/HandHistoryRow.tsx:64-65` defense-in-depth: `visibleShowdownOpponents` filters by `o.showedDown && o.holeCards.length > 0`. 12 HandHistoryRepository.privacy tests + 6 getHandHistory tests + 9 useHandHistory tests + 12 HandHistoryRow tests + 7 HandHistoryList tests pass. |
| 4 | 90-day retention job removes old hand history; profile views never expose other players' hole cards at non-showdown | VERIFIED | `HandHistoryQueue.ts:82-92` `runRetentionSweep()` computes `cutoff = now - 90 days` and calls `HandHistoryRepository.deleteOlderThan(cutoff)` which runs `prisma.handHistory.deleteMany({ where: { playedAt: { lt: cutoff } } })`. `startRetentionJob` at line 94 runs immediate sweep via `setTimeout(0)` then schedules `setInterval(... 24*60*60*1000)`; idempotency guard at line 99 (`if (retentionBootTimer \|\| retentionTimer) return`). Wired at server boot `server/index.ts:186`. Retention logs deleted count per sweep. 4 retention tests pass (immediate + 24h cadence + idempotency + error continuation). Privacy is enforced at two layers: server read-time strip at `HandHistoryRepository.ts:140` AND client defense-in-depth at `HandHistoryRow.tsx:65`. |
| 5 | On each onHandComplete, currentChips, currentTableId, currentSeat are written to the User row; mid-hand ephemeral state (hole cards, bets, timers) is NEVER persisted | VERIFIED | `server/checkpointSeatedPlayers.ts:21-31` uses `Promise.all(evt.perPlayer.map((p) => UserRepository.checkpointSeat(p.telegramId, { currentChips: p.finalChips, currentTableId: evt.tableId, currentSeat: p.seat })))`. Awaited at `server/index.ts:172` inside the async IIFE — separate path from HandHistoryQueue. `UserRepository.checkpointSeat` at `server/db/UserRepository.ts:140-152` writes EXACTLY 3 fields: `currentChips`, `currentTableId`, `currentSeat` — no holeCards, no bet, no turn timer. 4 checkpointSeatedPlayers tests pass including assertion that the data object has exactly `['currentChips', 'currentSeat', 'currentTableId']` keys (D-17 enforcement). |

**Score:** 5/5 truths verified by automated evidence. Items 1 and 3 also queued for human verification due to motion-library visuals and end-to-end E2E requirements.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|---------|--------|---------|
| `vitest.config.server.ts` | Server test config (Node env) | VERIFIED | Present at repo root; 38 tests discover correctly |
| `client/vitest.config.ts` | Client test config (jsdom env) | VERIFIED | Present; 46 tests discover correctly |
| `server/__tests__/setup.ts` | Server test setup | VERIFIED | Present |
| `client/src/test/setup.ts` | Client test setup + matchMedia mock | VERIFIED | Present; `@testing-library/jest-dom/vitest` imported; matchMedia mocked for useReducedMotion |
| `types/index.ts` | ActionBubbleEvent + HandHistoryDTO + HandHistoryOpponentDTO + socket event types | VERIFIED | Line 315: `ActionBubbleEvent extends PlayerActionEvent {}` (no extra fields). Lines 332-340, 349-364: DTOs. Line 242: `actionBubble` on ExtendedServerEvents. Reader events `getHandHistory` / `handHistoryData` / `handHistoryError` all declared. |
| `server/index.ts` | actionBubble broadcast, onHandComplete listener, getHandHistory handler, boot wiring, SIGTERM drain | VERIFIED | Lines 142-158 (actionBubble fan-out), 160-177 (onHandComplete IIFE with enqueue + awaited checkpoint), 182-188 (boot: startFlushTimer + startRetentionJob), 192-200 (SIGTERM handler), 338-351 (zero-arg getHandHistory handler with authError gate + generic error). |
| `server/HandHistoryQueue.ts` | Batched queue + retry + retention | VERIFIED | 128 lines; splice-before-write (line 53); RETRY_DELAYS_MS = [100, 500]; RETENTION_DAYS = 90; idempotent guards on both timers; shutdown drain. |
| `server/db/HandHistoryRepository.ts` | createMany + deleteOlderThan + findForUser with privacy filter | VERIFIED | `skipDuplicates: true` (line 40); `findForUser` at line 97 with two-step query, clamp at line 98, privacy ternary at line 140, PREDEFINED_TABLES tableName resolution at line 128 with fallback at line 150. |
| `server/db/UserRepository.ts` | checkpointSeat writing exactly 3 fields | VERIFIED | Lines 140-152: writes exactly `{ currentChips, currentTableId, currentSeat }`; no ephemeral state. |
| `server/checkpointSeatedPlayers.ts` | Promise.all fan-out | VERIFIED | 31 lines; Promise.all over perPlayer entries. |
| `client/src/components/ActionBubble.tsx` | Animated Neon Strip pill with reduced-motion handling | VERIFIED | Imports `motion`, `useReducedMotion` from `motion/react`; uses `VARIANT_TIER` tokens; `bubbleLabel` produces exact UI-SPEC strings; `useReducedMotion() ?? false` nullish coalesce; no hex literals. |
| `client/src/components/ActionBubbleLayer.tsx` | Per-seat FIFO + 900ms hold + positioning | VERIFIED | 201+ lines; `HOLD_MS = 900` (exported as `ACTION_BUBBLE_HOLD_MS`); `pointerEvents: 'none'`, `zIndex: 30`; rotation `(seat - rotationOffset + TOTAL_SEATS) % TOTAL_SEATS`; AnimatePresence mode="sync"; unique id counter for AnimatePresence key collision guard. |
| `client/src/pages/GameRoom.tsx` | Mount ActionBubbleLayer + subscribe to actionBubble | VERIFIED | Line 7 imports layer; line 40 declares `bubblePushRef`; lines 104-107 subscribe/cleanup; line 213 mount inside relative wrapper. |
| `client/src/hooks/useHandHistory.ts` | Emit/subscribe hook with 5s timeout + race guard | VERIFIED | 83 lines; `REQUEST_TIMEOUT_MS = 5000`; `requestIdRef` increments on each activation; cleans up on deactivation or unmount. |
| `client/src/components/HandHistoryList.tsx` | Loading/empty/error/data states + single-row expansion | VERIFIED | `expandedHandId` state; states per UI-SPEC; Empty state uses named `'white'` keyword (no hex). |
| `client/src/components/HandHistoryRow.tsx` | Row with collapsed + expanded view + defense-in-depth privacy gate | VERIFIED | 232+ lines; `visibleShowdownOpponents` at line 64 enforces `showedDown && holeCards.length > 0`; BOARD + YOUR CARDS always rendered when expanded; SHOWN AT SHOWDOWN section only when filter returns non-empty. |
| `client/src/pages/ProfileSettings.tsx` | Swap Phase 2 History stub for real content | VERIFIED | Line 7 imports HandHistoryList; line 503 `<HandHistoryList socket={socket} active={activeTab === 'history'} />`; Phase 2 placeholder copy removed. |
| `client/package.json` | motion@^12.38.0 dependency | VERIFIED | `"motion": "^12.38.0"` present in dependencies. |

All 18 expected artifacts present, substantive (non-stub), and wired into downstream consumers.

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `Game.ts` onPlayerAction emission | `server/index.ts` setOnPlayerAction listener | Phase 1 sync fire-and-forget callback | WIRED | Lines 142-158: try/catch wrapped fan-out; `table.setOnPlayerAction((evt) => { ... })`. |
| `server/index.ts` setOnPlayerAction | All sockets at table | `io.to(sid).emit('actionBubble', evt)` loop over `getAllPlayerIds()` | WIRED | Line 152. |
| `Game.ts` onHandComplete emission | `server/index.ts` setOnHandComplete listener | Phase 1 callback with async IIFE | WIRED | Lines 160-177. |
| `setOnHandComplete` listener | `HandHistoryQueue.enqueue` | Direct call per perPlayer entry | WIRED | Line 169: `HandHistoryQueue.enqueue(HandHistoryRepository.toWriteRow(evt, p))`. |
| `setOnHandComplete` listener | `checkpointSeatedPlayers(evt)` | `await` inside async IIFE | WIRED | Line 172. |
| `HandHistoryQueue.flush` | `HandHistoryRepository.createMany` | `createMany({ data, skipDuplicates: true })` | WIRED | Queue flushWithRetry → createMany at line 40 with skipDuplicates. |
| Server boot | `HandHistoryQueue.startFlushTimer` + `startRetentionJob` | Module-level `setTimeout` block | WIRED | `server/index.ts:185-186`. |
| SIGTERM signal | `HandHistoryQueue.shutdown` | `process.on('SIGTERM', ...)` | WIRED | Lines 192-200. |
| Client `getHandHistory` socket emit | Server `getHandHistory` handler | Socket.io zero-arg request/response | WIRED | `useHandHistory.ts:61` emits; `server/index.ts:338` handles with zero-arg signature. |
| Server handler | `HandHistoryRepository.findForUser` | Direct await with `socket.data.telegramId` only | WIRED | `server/index.ts:345`. |
| `HandHistoryRepository.findForUser` | `PREDEFINED_TABLES` | `Map<id, name>` lookup at read time | WIRED | Lines 127-128 build map; line 150 uses `.get(...)` with fallback. |
| Server → client response | `handHistoryData` event | `socket.emit('handHistoryData', rows)` | WIRED | Line 346. |
| `ProfileSettings` History tab | `HandHistoryList` | JSX mount at `renderHistoryTab` | WIRED | `ProfileSettings.tsx:503`. |
| `HandHistoryList` | `useHandHistory(socket, active)` | Hook invocation | WIRED | Gated by `activeTab === 'history'`. |
| `HandHistoryList` row mapping | `HandHistoryRow` | `rows.map(r => <HandHistoryRow ... />)` | WIRED | Single-row expansion via `expandedHandId` state. |
| `HandHistoryRow` expanded opponents section | `visibleShowdownOpponents` filter | Defense-in-depth predicate | WIRED | Line 65 filter applied before rendering SHOWN AT SHOWDOWN section. |
| `GameRoom.tsx` socket subscription | `bubblePushRef.current` → `ActionBubbleLayer.pushBubble` | Imperative push handle bridge | WIRED | `GameRoom.tsx:102-104` forwards to ref set via `registerPushHandle` prop. |

All key links verified; no stub wiring.

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---------|---------------|--------|---------------------|--------|
| `ActionBubbleLayer` | `queues: Map<number, BubbleQueueItem[]>` | `pushBubble(evt)` called by GameRoom socket handler forwarding server `actionBubble` events | Yes — server broadcasts on every `Game.ts` action emission (5 sites confirmed from Phase 1 CONTEXT) | FLOWING |
| `HandHistoryList` | `rows: HandHistoryDTO[]` (via useHandHistory) | `handHistoryData` socket event from `HandHistoryRepository.findForUser` which runs `prisma.handHistory.findMany` against the Phase 1 HandHistory table populated by HandHistoryQueue flushes | Yes — DB-backed Prisma query, two-step fetch confirmed by 12 privacy tests | FLOWING |
| `HandHistoryRow` (expanded) | `row.holeCards`, `row.board`, `row.opponents` | `HandHistoryDTO` from useHandHistory; ultimately from `HandHistory` Prisma table | Yes — data originates from `HandHistoryQueue.enqueue(toWriteRow(evt, p))` on every `onHandComplete` | FLOWING |
| `User` row (post-hand) | `currentChips`, `currentTableId`, `currentSeat` | `UserRepository.checkpointSeat` called by `checkpointSeatedPlayers(evt)` | Yes — Prisma `user.update` per seated player on every hand completion | FLOWING |

All data-rendering artifacts have a verified producer writing real (non-static, non-hardcoded) data.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---------|---------|--------|--------|
| Server test suite compiles and runs | `npx vitest run --config vitest.config.server.ts` | 38 passed (7 files) — smoke, actionBubbleBroadcast, checkpointSeatedPlayers, getHandHistory, HandHistoryQueue, handHistoryRetention, HandHistoryRepository.privacy | PASS |
| Client test suite compiles and runs | `cd client && npx vitest run` | 46 passed (6 files) — smoke, useHandHistory, ActionBubbleLayer, HandHistoryList, HandHistoryRow, ActionBubble | PASS |
| Server TypeScript compiles clean | `npx tsc --noEmit -p tsconfig.json` | Exits 0, no errors | PASS |
| Client TypeScript compiles with only pre-existing error | `cd client && npx tsc --noEmit -p tsconfig.json` | One error in `client/src/hooks/useTelegram.ts:131` — PRE-EXISTING (documented in `deferred-items.md`, last touch commit `f9519a9` pre-Phase-03). Phase 3 adds no new type errors. | PASS (pre-existing, not a phase regression) |
| GAME-01 regression grep | `grep "Table #\|table-phase\|pot-label" client/src/pages/GameRoom.tsx` | Zero matches | PASS |
| No hex literals in new client components | Grep on ActionBubble.tsx, ActionBubbleLayer.tsx, HandHistoryRow.tsx, HandHistoryList.tsx, useHandHistory.ts | Zero matches | PASS |
| No dangerouslySetInnerHTML in new client files | Grep on new client files | Zero matches | PASS |
| Privacy filter is single source of truth | `grep -c "showedDown ? r.holeCards : \[\]" server/db/HandHistoryRepository.ts` | 1 match (line 140) | PASS |
| Defense-in-depth privacy filter on client | `grep -c "showedDown && o.holeCards.length > 0" client/src/components/HandHistoryRow.tsx` | 1 match (line 65) | PASS |
| getHandHistory handler zero-arg | `grep -cE 'socket\.on\("getHandHistory", *async *\(\) *=>' server/index.ts` | 1 match | PASS |
| Retention cutoff = 90 days | `grep "RETENTION_DAYS = 90" server/HandHistoryQueue.ts` | 1 match (line 20) | PASS |
| Checkpoint writes exactly 3 fields (D-17) | Read `UserRepository.checkpointSeat` body | Data object contains ONLY `currentChips`, `currentTableId`, `currentSeat` — no holeCards, no bet, no timer state | PASS |

All automated spot-checks pass. Runtime end-to-end validation is deferred to human verification.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|------------|-------------|-------------|--------|----------|
| GAME-01 | 03-01 (regression check) | Redundant table/phase/pot labels removed from GameRoom | SATISFIED | `grep "Table #\|table-phase\|pot-label" client/src/pages/GameRoom.tsx` returns zero matches. Previously shipped in Phase 2; re-verified here. |
| GAME-02 | 03-01, 03-03 | Floating action bubble over acting seat with motion/react + FIFO queue | SATISFIED | Server broadcast at `server/index.ts:142-158`; client renderer at `ActionBubbleLayer.tsx` with per-seat `Map<number, BubbleQueueItem[]>`; 16 unit tests pass. Visual fidelity requires human verification. |
| GAME-03 | 03-03 | 800-1000ms hold + prefers-reduced-motion honored | SATISFIED | `HOLD_MS = 900` at `ActionBubbleLayer.tsx:42` (midpoint of 800-1000ms band per D-04); `useReducedMotion() ?? false` at `ActionBubble.tsx:47` with duration-0 variants. Hold unconditionally preserved per D-06. OS-level reduced-motion toggle requires human verification. |
| PROFILE-02 | 03-02 | Hand history persisted without blocking game loop (async/batched queue) | SATISFIED | `HandHistoryQueue.ts` buffer + 1s/50-row flush + retry/backoff + drop-after-3; `server/index.ts:160-177` uses fire-and-forget async IIFE so Game.ts never awaits DB. 6 queue tests + 4 retention tests pass. Note: REQUIREMENTS.md checkbox still shows `[ ]` pending, but implementation fully satisfies the criteria. |
| PROFILE-03 | 03-04, 03-05 | Profile shows user's last 50 hands with own cards always + opponents at showdown only | SATISFIED | `findForUser` with 50-row cap, read-time privacy filter; client UI with useHandHistory hook + HandHistoryList + HandHistoryRow; defense-in-depth client filter. 34 unit tests pass covering all combinations. |
| PROFILE-04 | 03-02, 03-04 | 90-day retention job; opponents' hole cards never exposed at non-showdown | SATISFIED | `RETENTION_DAYS = 90` with 24h sweep cadence; privacy filter single source of truth at `HandHistoryRepository.ts:140` (server) + defense-in-depth at `HandHistoryRow.tsx:65` (client). |

No ORPHANED requirements — every ID declared in plans appears in REQUIREMENTS.md and is mapped to concrete implementation.

Note: REQUIREMENTS.md lists PROFILE-02 with `[ ]` (Pending) but the implementation fully satisfies the acceptance criteria. This is a bookkeeping lag, not an implementation gap. The roadmap phase completion will update it to Complete.

### Anti-Patterns Found

All items below are advisory (categorized by 03-REVIEW.md as Warning or Info); none block goal achievement.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `server/index.ts` (WR-01) | 341, 357, 341 (getHandHistory) etc. | `socket.emit("authError", { message: 'Not authenticated' } as any)` — payload is object but ServerEvents declares `authError: (msg: string)` | Warning | Contract mismatch; client handler for authError may not cover the object shape. Cast `as any` bypasses the type check. Pre-existing pattern mirrored by getHandHistory; not introduced by Phase 3. Phase-6 or Phase-5 cleanup. |
| `client/src/components/HandHistoryRow.tsx` (WR-02) | Card onClick + role="listitem" | Click-interactive element not keyboard-operable (no Enter/Space handler, no tabIndex=0) | Warning | WCAG 2.1.1 Keyboard failure. User can tap to expand on touch but cannot reach/activate via keyboard. Accessibility gap; mitigatable by adding `onKeyDown` handler and `tabIndex={0}`. Does not block phase goal. |
| `server/db/UserRepository.ts` (WR-03) | updateStats | TOCTOU: read-then-write for `biggestPot` can overwrite a larger concurrent value | Warning | Pre-existing pattern (Phase 1). Race window is small (ms) and only affects vanity stats, not economic state. Documented in review for future `update({ data: { biggestPot: { gt: N } } })` rewrite. |
| `server/db/HandHistoryRepository.ts` (WR-04) | findForUser step 2 | Step 2 query has no `take` cap, relying on step 1's 50-row cap to bound total rows | Warning | Bounded to `≤ 6 rows/handId × 50 handIds = 300` rows in practice; but a malformed schema or huge table config would grow without limit. Defensive cap recommended as follow-up. |
| Various | IN-01 through IN-07 | Informational observations (redundant useEffect deps, module-level mutable counter, any-casts, empty-state gating, double BigInt conversion, test isolation) | Info | See 03-REVIEW.md for detail; none block goal. |

No blocker anti-patterns. No TODO/FIXME markers in phase-3 code indicating incomplete work. No `return null` / `placeholder` / `coming soon` stubs.

### Human Verification Required

Three items route to human testing — see YAML frontmatter for structured detail.

1. **Play-through visual verification of ActionBubble overlays** — automated tests verify FIFO queue depth, hold duration, rotation math, and key uniqueness, but cannot assert animation fidelity (pop-scale, opacity transitions, y-drift) or anchor pixel-accuracy over real table layouts on mobile and desktop viewports.

2. **`prefers-reduced-motion` honor check** — requires OS-level preference toggle to exercise `useReducedMotion`'s reactive matchMedia subscription against a real browser environment.

3. **Profile → Hand History end-to-end smoke** — requires live Postgres + live socket + multiple Telegram accounts to observe real data flow through the HandHistoryQueue → Prisma → findForUser → socket response pipeline. Unit tests cover predicates and state transitions but not the integrated stack.

### Gaps Summary

No blocker gaps. All 5 success criteria have concrete, substantive implementations that pass their respective unit tests (84 total tests: 38 server + 46 client, all green). Every declared requirement ID (GAME-01, GAME-02, GAME-03, PROFILE-02, PROFILE-03, PROFILE-04) maps to verified code. Phase goal ("enrich gameplay with action bubbles, persistent hand history, and hand-boundary chip checkpointing — all driven off Phase 1 Game callbacks, with writes off the hot path") is achieved:

- **Action bubbles:** server broadcasts on every `Game.ts` action emission (5 sites from Phase 1); client layer renders per-seat FIFO with motion/react animations and reduced-motion fallback.
- **Persistent hand history:** async batched queue with 1s/50-row flush, retry/backoff, drop-after-3 failure handling, 90-day retention sweep, and a read-time privacy filter with defense-in-depth on the client.
- **Chip checkpointing:** separate awaited path on `onHandComplete` writes exactly `{currentChips, currentTableId, currentSeat}` — no ephemeral state.
- **Writes off hot path:** `Game.ts` callbacks are sync fire-and-forget; `server/index.ts` listener wraps async work in `void (async () => { ... })()` IIFE with try/catch so an unhandled rejection never escapes into the game loop.

Advisory items from 03-REVIEW.md (4 warnings, 7 info, 0 critical) are documented but do not block phase exit. Human verification is required for motion-library visual fidelity, OS-level reduced-motion behavior, and live E2E Profile → History smoke — these cannot be asserted programmatically from the unit test suite.

---

*Verified: 2026-04-22T08:05:00Z*
*Verifier: Claude (gsd-verifier)*
