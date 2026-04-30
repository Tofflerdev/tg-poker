---
phase: 04-resilience
plan: 06
subsystem: resilience
tags: [integration, reconnect, grace-timer, atomic-balance, session-recovery, eviction, overlay-mount]

# Dependency graph
requires:
  - phase: 04-resilience
    provides: UserRepository.tryDecrementBalance + refundCurrentChips (Plan 04-01)
  - phase: 04-resilience
    provides: GraceRegistry singleton-as-module (Plan 04-02)
  - phase: 04-resilience
    provides: typed `replacedBySession` event on ExtendedServerEvents (Plan 04-03)
  - phase: 04-resilience
    provides: SessionRecovery.recoverPersistedSessions (Plan 04-04)
  - phase: 04-resilience
    provides: ReconnectOverlay component + exported timing constants (Plan 04-05)
provides:
  - Live reconnect handshake: auth handler emits typed `replacedBySession`, pushes personalized tableJoined+state snapshot, calls GraceRegistry.clear
  - Live grace-armed disconnect: stage-aware GraceRegistry.arm + disconnectedAt/lastSeenAt write; no immediate leave/refund
  - Live atomic buy-in (joinTable + legacy join) with rollback on insufficient balance — Concern #5/#11 closed
  - Live atomic refund on leaveTable via UserRepository.refundCurrentChips (single source of truth for clearing session columns)
  - Live boot recovery sweep wired into setTimeout block AFTER setupTableEvents and BEFORE HandHistoryQueue
  - Live setOnHandComplete listener calls reArmIfMidHand to swap mid-hand → between-hands grace at hand boundaries (Pitfall 1 fix)
  - ReconnectOverlay mounted at App root via const-once + render-many pattern (overlays every view)
affects: [04-resilience]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-namespace import for singleton-as-module API: `import * as GraceRegistry from './GraceRegistry.js'` keeps call-site grep-friendly (`GraceRegistry.arm` / `GraceRegistry.clear` / `GraceRegistry.reArmIfMidHand`)"
    - "const-once render-many for top-level overlays: define `const overlay = <ReconnectOverlay ... />` once in render body, then sprinkle `{overlay}` into every early-return fragment alongside `{devToolbar}`"
    - "Atomic-write + post-update read for client balance refresh: prisma.user.updateMany doesn't return the row, so we follow the atomic decrement with `UserRepository.findByTelegramId` to emit the new balance to the client"

key-files:
  created:
    - .planning/phases/04-resilience/04-06-SUMMARY.md
  modified:
    - server/index.ts
    - client/src/App.tsx

key-decisions:
  - "Imports added at top of server/index.ts: `* as GraceRegistry`, `* as SessionRecovery`, default `prisma` — namespace imports preserve grep-ability for the 5 GraceRegistry call sites and the 1 SessionRecovery call site"
  - "Auth-handler eviction callback emits typed bare `replacedBySession` (no `as any`, no payload) — the type contract from Plan 04-03 is now load-bearing"
  - "Auth-handler reconnect branch reuses `tableJoined` event (not a new `reconnect` event) so the existing client handler in App.tsx fires and routes the user to view='game' automatically. Personalized via `getStateForPlayer(telegramId)` (T-04-Info-Leak mitigation: same hole-card filter as the regular state push)"
  - "joinTable + legacy join handlers BOTH replaced — historical Concern #5 was on both call sites. Two `tryDecrementBalance` calls in server/index.ts is correct (verification grep == 2)"
  - "leaveTable handler clears GraceRegistry FIRST, then calls refundCurrentChips — the player chose to leave, so any in-flight grace timer for this telegramId would later double-refund or wrongly vacate. The clear is defensive (no live grace timer is expected here, but inexpensive insurance)"
  - "Disconnect handler writes ONLY `disconnectedAt` + `lastSeenAt` — never `currentChips/currentTableId/currentSeat` (RESILIENCE-02 invariant; those columns are owned by Phase 3 checkpointSeatedPlayers)"
  - "setOnHandComplete listener calls `reArmIfMidHand` AFTER `await checkpointSeatedPlayers(evt)` — the registry needs the chips/seat to be checkpointed before swapping mid-hand → between-hands (so a between-hands expiry that runs immediately on the next tick would refund the right amount)"
  - "Boot block converted to `async` callback so `await SessionRecovery.recoverPersistedSessions()` can run between setupTableEvents and HandHistoryQueue.startFlushTimer per D-C2"
  - "Identity guard at end of disconnect handler PRESERVED verbatim (T-01-04-04 / Pitfall 4) — an evicted prior socket's disconnect must not clear the new socket's mapping"
  - "Client-side overlay mounted via const-once pattern: `const overlay = <ReconnectOverlay socket={socket} lastStage={gameState.stage} onDismissExpired={...} />` defined once, sprinkled `{overlay}` 11 times alongside `{devToolbar}` — overlay JSX exists once, mount sites are 11 (matches plan acceptance criteria of ≥7)"
  - "onDismissExpired wired to `setView('menu') + setCurrentTableId(null) + setMySeat(null)` so dismissing a vacated overlay returns the user to the main menu with their post-refund balance reflecting in MainMenu without a stale table reference lingering in App state"

patterns-established:
  - "Atomic-deduct + post-read balance refresh: when an updateMany doesn't return the row, follow with findByTelegramId and emit the new balance to the client"
  - "Singleton-as-module call-site grep discipline: `import * as GraceRegistry` keeps the public surface (`arm` / `clear` / `reArmIfMidHand`) pinned to the namespace, so audits via `grep -c 'GraceRegistry\\.\\(arm\\|clear\\|reArm\\)'` give a single accurate count"
  - "App-root overlay mount: const-once + render-many; the overlay is render-cheap when hidden (returns null), so painting it 11 times has no perf cost — and ensures coverage in every view including legal/consent/deposit pages"

requirements-completed: [RESILIENCE-02, RESILIENCE-04, RESILIENCE-05, RESILIENCE-06, RESILIENCE-07]

# Metrics
duration: 6min
completed: 2026-04-30
---

# Phase 04 Plan 06: Live Wiring of Resilience Primitives Summary

**Wired all five Phase 4 primitives (atomic balance helpers, GraceRegistry, typed `replacedBySession`, SessionRecovery boot sweep, ReconnectOverlay) into the live `server/index.ts` and `client/src/App.tsx` code paths. Eight production-code edits across two files; full server suite still 63/63, full client suite still 57/57. Reconnect snapshot, stage-aware grace timer, atomic buy-in/refund, boot recovery, and full-screen reconnect overlay are now live behaviors.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-30T15:36:51Z
- **Completed:** 2026-04-30T15:40:52Z
- **Tasks:** 3
- **Files modified:** 2 (server/index.ts; client/src/App.tsx)

## The 8 Production-Code Edits

### Task 1 — server/index.ts (5 edits)
1. **Imports added (top of file)** — `import * as GraceRegistry from "./GraceRegistry.js"`, `import * as SessionRecovery from "./SessionRecovery.js"`, `import prisma from "./db/prisma.js"`. Namespace imports preserve grep discipline for downstream audits.
2. **Eviction event rename (auth handler, line ~239)** — Removed `'sessionReplaced' as any` placeholder; replaced with typed `prior.emit('replacedBySession')` (bare event, no payload, no cast). The type contract from Plan 04-03 is now load-bearing.
3. **Reconnect snapshot push (auth handler, after line ~249)** — For an already-seated `telegramId`, after refreshing the socket handle, the handler computes `seat = state.seats.findIndex(p => p?.id === telegramId)`, emits `tableJoined { tableId, seat, state }` via `getStateForPlayer(telegramId)` (own hole cards only), calls `updateTableState(seatedTable.id)` to refresh other seats, and calls `GraceRegistry.clear(telegramId)` to cancel any in-flight grace timer.
4. **joinTable atomic buy-in (line ~526)** — `UserRepository.updateBalance(user.telegramId, -tableInfo!.config.buyIn)` replaced with `UserRepository.tryDecrementBalance(user.telegramId, tableInfo!.config.buyIn)`. On `false`, the in-memory join is rolled back via `socket.leave(tableId) + tableManager.leaveTable(telegramId) + socket.emit("tableError", ...) + return`. On success, `findByTelegramId` is called to read back the new balance and emit `balanceUpdate`. Concern #5 + Concern #11 closed.
5. **Legacy `join` handler atomic buy-in + leaveTable atomic refund** — Same atomic pattern in the legacy `join` handler (D-D2). leaveTable handler now: `GraceRegistry.clear(telegramId) → UserRepository.refundCurrentChips(telegramId) → on truthy result, refresh client balance via findByTelegramId + balanceUpdate emit`. The previous `chipsToReturn` in-memory read + `updateBalance` is gone — refund is atomic via the helper, which is also the single source of truth for clearing all five session columns.

### Task 2 — server/index.ts (3 edits)
1. **setOnHandComplete listener — re-arm hook** — After `await checkpointSeatedPlayers(evt)`, the listener now runs `evt.perPlayer.forEach(p => GraceRegistry.reArmIfMidHand(p.telegramId))`. The registry-side helper is a no-op for absent or already-between-hands entries, so the listener can iterate every per-player entry blindly without per-player conditionals. Pitfall 1 (mid-hand timer fires after hand ends) closed.
2. **Disconnect handler — grace arming** — Body rewritten. Old: immediate `tableManager.handleDisconnect + chipsToReturn read + updateBalance refund`. New: `seatedTable.updatePlayerSocketId(tid, undefined)` (drops the transport handle, KEEPS the seat) → reads `seatedTable.getState().stage` → maps to `'between-hands'` (waiting/showdown) or `'mid-hand'` (else) → writes `disconnectedAt: new Date(), lastSeenAt: new Date()` via `prisma.user.update` → `GraceRegistry.arm(tid, graceStage, seatedTable.id)` → `updateTableState(seatedTable.id)` to repaint other clients. The identity guard at the end is preserved verbatim.
3. **Boot block — SessionRecovery hookup** — `setTimeout(() => {...}, 1000)` converted to `setTimeout(async () => {...}, 1000)`. After `tables.forEach(t => setupTableEvents(t.id))` and BEFORE `HandHistoryQueue.startFlushTimer()`, the block now runs `await SessionRecovery.recoverPersistedSessions()` inside a try/catch and logs `[Boot] SessionRecovery refunded N session(s)`. Failures are non-fatal; the server continues to listen.

### Task 3 — client/src/App.tsx (2 edits)
1. **Import + const-once overlay** — Added `import { ReconnectOverlay } from "./components/ReconnectOverlay"`. Defined `const overlay = <ReconnectOverlay socket={socket} lastStage={gameState.stage} onDismissExpired={() => { setView('menu'); setCurrentTableId(null); setMySeat(null); }} />` immediately after `const devToolbar = ...`. The overlay subscribes to socket lifecycle events internally and renders nothing while connected.
2. **Render `{overlay}` in 11 view fragments** — Single `replace_all` Edit added `{overlay}` after every `{devToolbar}` so the overlay overlays every view: auth, menu, tables, profile, deposit, defense-in-depth consent guard, consent (explicit), legal-tos, legal-privacy, legal-rg, game. Verification: `grep -c "{overlay}" client/src/App.tsx` returns 11 (acceptance criteria required ≥7).

## Confirmation: forbidden patterns are GONE

| Pattern | Count | Status |
|---------|-------|--------|
| `'sessionReplaced'` in `server/index.ts` | 0 | GONE — the cast and the string literal are both removed |
| `Rollback join? For now just log error` in `server/index.ts` | 0 | GONE — Concern #11 closed |
| `tableManager.handleDisconnect` in `server/index.ts` | 0 | GONE — Phase 4 disconnect path no longer calls this. The method itself stays in `TableManager.ts` for Phase 5 ADMIN-05 (kick) per the plan's note |

## Confirmation: required patterns are PRESENT

| Pattern | Count | Required |
|---------|-------|----------|
| `GraceRegistry` | 5 | ≥4 (import + auth.clear + leaveTable.clear + disconnect.arm + setOnHandComplete.reArmIfMidHand) ✓ |
| `SessionRecovery.recoverPersistedSessions` | 1 | ==1 (boot block) ✓ |
| `UserRepository.tryDecrementBalance` | 2 | ==2 (joinTable + legacy join) ✓ |
| `UserRepository.refundCurrentChips` | 1 | ==1 (leaveTable) ✓ |
| `{overlay}` in `client/src/App.tsx` | 11 | ≥7 ✓ |

## Confirmation: `Table.getState()` verified present (no substitution needed)

The plan's `<critical_invariants>` and Task 2 read_first call out the need to verify `Table.getState()` (NOT `Table.getStateForPlayer()`) for the disconnect handler stage read. Re-confirmed: `server/models/Table.ts:238` exposes `getState(): GameState` — delegates to `this.game.getState()`. The disconnect handler uses `seatedTable.getState().stage` correctly; no method substitution was required.

## Test Counts (zero regressions)

| Suite | Pre (after 04-05) | Post (this plan) | Δ |
|-------|-------------------|------------------|---|
| Server (`npm run test:server`) | 63 / 63 across 11 files | **63 / 63 across 11 files** | 0 (no new tests; existing suites including reconnectHandshake still GREEN) |
| Client (`cd client && npx vitest run`) | 57 / 57 across 7 files | **57 / 57 across 7 files** | 0 (App.tsx has no dedicated test file; ReconnectOverlay test contract still GREEN) |

The `reconnectHandshake.test.ts` inline harness from Plan 04-00 is the contract specimen for this plan's auth-handler shape: 5 cases, all still GREEN. The harness asserts:
- `tableJoined` payload shape (`tableId`, `seat`, `state`) ✓
- `seat` computed via `findIndex` (player at seat 2 yields `seat: 2`, NOT hardcoded 0) ✓
- `GraceRegistry.clear(telegramId)` called on successful reconnect ✓
- `replacedBySession` bare event (1 arg, no payload) emitted to prior socket ✓
- `getStateForPlayer(telegramId)` used (privacy regression check) ✓

These five contracts are preserved verbatim by the production auth handler.

## Task Commits

Each task was committed atomically:

1. **Task 1: Auth handler reconnect snapshot + atomic balance flow** — `f9ec45e` (feat)
2. **Task 2: Grace-aware disconnect + boot recovery + hand-end re-arm hook** — `2516395` (feat)
3. **Task 3: Mount ReconnectOverlay at App root for full-screen coverage** — `9d024b3` (feat)

**Plan metadata:** _(this SUMMARY + STATE.md + ROADMAP.md + REQUIREMENTS.md final commit follows)_

## Files Created/Modified

- `server/index.ts` — 8 logical edits, +106 / -59 net (3 imports added; 5 handler edits in Task 1; 3 handler edits in Task 2). All five Wave-0 server tests still GREEN.
- `client/src/App.tsx` — 2 logical edits, +29 / -0 net (1 import + 1 const-once + 11 inline mounts). Full client suite still GREEN.

## Decisions Made

- **Namespace imports for singleton-as-module APIs.** `import * as GraceRegistry from "./GraceRegistry.js"` instead of `import { arm, clear, reArmIfMidHand }`. Rationale: the call-site stays grep-friendly (`GraceRegistry\\.arm` etc.), and renaming the registry surface (e.g., adding a new function) doesn't require updating import lists.
- **`SessionRecovery` namespace import** for the same reason — single call site, single named export, but consistent with `GraceRegistry`'s shape.
- **Default-import `prisma`** because that's the existing project convention (mirrors `server/GraceRegistry.ts:3` and `server/SessionRecovery.ts:1`). Switching to a named import here would break the convention.
- **`replace_all` for `{overlay}` injection.** All 11 fragments share an identical `<>{devToolbar}` prefix — exactly the right shape for `replace_all`. Manual per-site edits would have been brittle and noisy in the diff.
- **`onDismissExpired` clears table+seat App state, not just view.** Without `setCurrentTableId(null) + setMySeat(null)`, dismissing a `vacated` overlay would leave a dangling `currentTableId` and `mySeat` in App's state. The next `getTables` round-trip would render correctly but a quick re-pick of the same table would inherit the stale seat. Defensive cleanup is consistent with `tableLeft` handler at line 209-212.

## Deviations from Plan

None — plan executed exactly as written. All 8 edits matched the plan's `<action>` blocks verbatim. All acceptance criteria for all 3 tasks pass on first verification run; no auto-fixes (Rules 1-3) were needed; no architectural decision (Rule 4) was encountered.

One pre-existing TypeScript error was discovered in `client/src/hooks/useTelegram.ts:131` (`displayName` missing on `TelegramUser` set-state arg). Verified present on `main` BEFORE this plan's edits via `git stash` round-trip — out of scope per CLAUDE.md / SCOPE BOUNDARY rule. Logged to `.planning/phases/04-resilience/deferred-items.md` for future cleanup. The client vitest suite passes 57/57 regardless; this is a `tsc --noEmit` error in an unrelated file.

## Threat Surface Verification

The threat model from the plan covers ten threats; this implementation addresses each:

| Threat ID | Disposition | Implementation |
|-----------|-------------|----------------|
| T-04-A1 (Authentication / reconnect handshake) | mitigate | `validateInitData` HMAC re-runs on every connect (preserved from Phase 1). Reconnect snapshot only emitted if `tableManager.getPlayerTable(telegramId)` returns a table — a forged `socket.data.telegramId` cannot benefit because the auth handler populates it from the validated initData. |
| T-04-A3 (Tampering / typed eviction event) | mitigate | `prior.emit('replacedBySession')` is now type-checked against `ExtendedServerEvents.replacedBySession: () => void` (Plan 04-03). Adding a payload would fail tsc. The `as any` cast is REMOVED. |
| T-04-D1 (Tampering / atomic buy-in) | mitigate | `tryDecrementBalance` is atomic at SQL layer (Plan 04-01). On `count===0`, `socket.leave + tableManager.leaveTable + tableError + return` rolls back the in-memory join. Concern #5 + #11 closed. |
| T-04-D2 (Tampering / atomic refund leaveTable) | mitigate | `refundCurrentChips` IS-NOT-NULL guard idempotent against concurrent grace-expiry / boot-recovery refunds. |
| T-04-B2-DoS (DoS / grace timer abuse) | accept | `Game.TURN_TIME_LIMIT = 30_000` auto-folds the disconnected player on their turn regardless of grace. Grace is additive, not blocking. |
| T-04-Pitfall1 (mid-hand timer fires after hand ends) | mitigate | `setOnHandComplete` listener calls `GraceRegistry.reArmIfMidHand(p.telegramId)` for every per-player entry — mid-hand entries are swapped to between-hands with the same tableId; the previous mid-hand timer is cancelled by `arm()`'s clear-first idempotency. |
| T-04-Pitfall4 (eviction race / split-brain) | mitigate | Identity guard preserved verbatim at the end of the disconnect handler: `if (tableManager.getSocketIdForTelegram(telegramId) === socket.id) clearSocketForTelegram(telegramId)`. The evicted (prior) socket's disconnect cannot wipe the new socket's mapping. |
| T-04-Pitfall6 (boot recovery races client first-connect) | mitigate | The atomic IS-NOT-NULL guard plus the auth handler's reliance on `tableManager.getPlayerTable` (in-memory, empty post-boot) → reconnecting players fall through to the menu screen with refunded balance; the design self-corrects. |
| T-04-V5 (input validation / disconnect handler) | accept | `socket.data.telegramId` is server-trusted (set by validated initData). `seatedTable.getState().stage` reads server-internal Game state. No external input. |
| T-04-Info-Leak (reconnect snapshot privacy) | mitigate | `getStateForPlayer(telegramId)` is the SAME path as the regular game-state push — same hole-card filter audited in Phase 1 / Phase 3. `getState()` is used ONLY in the disconnect handler to read the stage field, never in any client-facing emit. |
| T-04-COMPLIANCE-04 (ToS gate on reconnect) | accept | Phase 5 owns the server-side ToS gate on joinTable. Reconnect snapshot honors an already-acquired session (the player passed the Phase 2 client-side ToS gate when they originally joined). |

No new threat surface introduced beyond what the plan's `<threat_model>` enumerates.

## Issues Encountered

None during implementation. One ergonomics observation:

- **Hook system flagged the read-before-edit reminder repeatedly even though `server/index.ts` and `client/src/App.tsx` were both Read in this session.** The hook fires per-Edit and doesn't track session-level Read history; behavior was identical regardless (the edits all succeeded). Not a deviation — the hook is purely advisory.

## User Setup Required

None — pure code wiring, no env vars, no schema changes, no external service config.

Manual UAT scenarios deferred to `04-HUMAN-UAT.md` per `.planning/VALIDATION.md` "Manual-Only Verifications":

- Multi-tab eviction (open the Mini App in tab A, then in tab B → tab A sees the replaced overlay)
- Mobile reconnect UX (toggle airplane mode mid-hand → overlay appears at 1500 ms, countdown shows 30 s, reconnect dismisses; toggle airplane between hands → countdown shows 120 s)
- Server boot refund visibility (kill server with seated players → restart → log shows `[Boot] SessionRecovery refunded N session(s)`)
- Mobile WebSocket hiccup tolerance (network blip <1500 ms → overlay never appears thanks to debounce)

## Next Phase Readiness

- **Phase 4 — all primitives now live.** No remaining wiring. Plan 04-06 was the integration plan; with it green, every Phase 4 success criterion is closed:
  - RESILIENCE-02 (mid-hand state never persisted) ✓
  - RESILIENCE-04 (reconnect handshake) ✓
  - RESILIENCE-05 (grace window + overlay) ✓
  - RESILIENCE-06 (boot recovery) ✓
  - RESILIENCE-07 (atomic balance) ✓
- **Phase 5 (Admin, Ops & Observability) unblocked.** ADMIN-05 (kick) can now repurpose the still-present `tableManager.handleDisconnect` method for its admin-driven path.
- **No blockers.** Server suite 63/63, client suite 57/57. tsc clean on server; tsc has one pre-existing error on client in `useTelegram.ts:131` (out of scope, deferred).

## Self-Check: PASSED

**Files modified (verified via filesystem and `git diff`):**
- ✓ FOUND: server/index.ts (Task 1 + Task 2 — 8 logical edits across 3 commits)
- ✓ FOUND: client/src/App.tsx (Task 3 — 2 logical edits)
- ✓ FOUND: .planning/phases/04-resilience/04-06-SUMMARY.md (this file)

**Commits (verified via `git log --oneline`):**
- ✓ FOUND: f9ec45e feat(04-06): integrate auth handler reconnect snapshot + atomic balance flow
- ✓ FOUND: 2516395 feat(04-06): wire grace-aware disconnect + boot recovery + hand-end re-arm hook
- ✓ FOUND: 9d024b3 feat(04-06): mount ReconnectOverlay at App root for full-screen coverage

**Test execution (verified via vitest):**
- ✓ Server suite: 63/63 across 11 files (no regression; `reconnectHandshake.test.ts` 5/5 still GREEN)
- ✓ Client suite: 57/57 across 7 files (no regression; `ReconnectOverlay.test.tsx` 11/11 still GREEN)
- ✓ `npx tsc --noEmit` (server): clean, zero errors

**Acceptance criteria (verified via grep / file content):**
- ✓ `import * as GraceRegistry from "./GraceRegistry.js"` present
- ✓ `import * as SessionRecovery from "./SessionRecovery.js"` present
- ✓ `import prisma from "./db/prisma.js"` present
- ✓ `prior.emit('replacedBySession')` present (no payload, no `as any`)
- ✓ `socket.emit("tableJoined", { tableId: seatedTable.id, seat: seatIdx, state })` present in auth handler
- ✓ `GraceRegistry.clear(telegramId)` present in auth handler (reconnect cancel)
- ✓ `GraceRegistry.clear(telegramId)` present in leaveTable handler (manual leave cancel)
- ✓ `UserRepository.tryDecrementBalance` present in joinTable AND legacy join (count = 2)
- ✓ `UserRepository.refundCurrentChips(telegramId)` present in leaveTable
- ✓ `GraceRegistry.arm(telegramId, graceStage, seatedTable.id)` present in disconnect handler
- ✓ `GraceRegistry.reArmIfMidHand(p.telegramId)` present in setOnHandComplete listener (Pitfall 1 fix)
- ✓ `data: { disconnectedAt: new Date(), lastSeenAt: new Date() }` present in disconnect handler
- ✓ `seatedTable.getState().stage` present in disconnect handler
- ✓ `await SessionRecovery.recoverPersistedSessions()` present in boot block, AFTER setupTableEvents and BEFORE HandHistoryQueue.startFlushTimer (verified via line numbers: 194 → 200 → 207)
- ✓ Identity guard `if (tableManager.getSocketIdForTelegram(telegramId) === socket.id)` preserved in disconnect handler
- ✓ `'sessionReplaced'` count = 0
- ✓ `Rollback join? For now just log error` count = 0
- ✓ `tableManager.handleDisconnect` count = 0
- ✓ `chipsToReturn` count = 0 (immediate-refund pattern removed)
- ✓ `import { ReconnectOverlay } from "./components/ReconnectOverlay"` present in App.tsx
- ✓ `<ReconnectOverlay` count = 1 (defined ONCE as `const overlay`)
- ✓ `socket={socket}` AND `lastStage={gameState.stage}` props on `<ReconnectOverlay>`
- ✓ `{overlay}` count = 11 (≥7 required)

---
*Phase: 04-resilience*
*Completed: 2026-04-30*
