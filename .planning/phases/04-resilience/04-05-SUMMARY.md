---
phase: 04-resilience
plan: 05
subsystem: ui
tags: [react, socket.io-client, reconnect, neon-strip, vitest, rtl]

# Dependency graph
requires:
  - phase: 04-resilience
    provides: Wave-0 RED test scaffold (ReconnectOverlay.test.tsx) — 11 cases pinning state machine contract
  - phase: 04-resilience
    provides: typed `replacedBySession` event in ExtendedServerEvents (Plan 04-03)
provides:
  - Full-screen Neon Strip "Reconnecting…" overlay component (ReconnectOverlay.tsx)
  - Three exported timing constants (RECONNECT_OVERLAY_DEBOUNCE_MS, GRACE_MID_HAND_MS, GRACE_BETWEEN_HANDS_MS)
  - 5-state OverlayState union with transition table (D-B4 verbatim)
  - 1500 ms disconnect debounce that closes mobile WebSocket-hiccup flicker
  - Three terminal sub-views (sat-out, vacated, replaced) for grace expiry / eviction
affects: [04-06 (App.tsx integration mounts the overlay), 06 (test hardening)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Self-contained socket-event consumer component (subscribes via useEffect, cleans up on unmount)"
    - "Triple useRef timer storage (debounce + grace + tick) — Pitfall 5 fix for rapid-cycle flicker"
    - "lastStageRef pattern: ref-mirror of prop so closure-captured callback reads freshest value"
    - "Sync visible-tick state at state-machine entry to avoid stale-render off-by-one (tickNow = Date.now() at overlay open)"

key-files:
  created:
    - "client/src/components/ReconnectOverlay.tsx"
  modified: []

key-decisions:
  - "tickNow state synced inside debounce callback at overlay-open time (Date.now()) — without this, the initial render reads stale tickNow from component-mount and Math.ceil((expiresAt - tickNow)/1000) rounds up to graceSec+2 (32 / 122) instead of graceSec (30 / 120). This is a Rule 1 deviation from the plan's literal implementation; the plan-supplied code did NOT sync tickNow and would have failed two test cases."
  - "OverlayState modeled as discriminated union with `kind` discriminator — exhaustive narrowing at render site, no impossible states (e.g., reconnecting without expiresAt)"
  - "replacedBySession bypasses debounce entirely (D-A3 instantaneous eviction) — clearAllTimers() then setOverlayState({ kind: 'replaced' })"
  - "Two-timer strategy for grace expiry: deterministic setTimeout(graceMs) for the actual transition, separate setInterval(1000) for the visible countdown digit. Both stored in distinct refs and cleared together."
  - "Backdrop literal `rgba(10,10,14,0.9)` is the one allowed hex/rgba exception — D-B4 specifies the value verbatim and it's a tint of --color-surface-base"

patterns-established:
  - "Pattern: Socket-event subscription with full cleanup — subscribe in useEffect, unsubscribe via socket.off in cleanup, plus clearAllTimers() to drain refs"
  - "Pattern: Pitfall 5 closure (debounce-flicker) — clear prior debounce ref BEFORE starting a new one inside the disconnect handler"
  - "Pattern: Test-driven rendering contract — data-testid values for each terminal sub-view, exported timing constants for assertion stability"

requirements-completed: [RESILIENCE-05]

# Metrics
duration: 12min
completed: 2026-04-30
---

# Phase 04 Plan 05: ReconnectOverlay Summary

**Full-screen Neon Strip reconnect overlay with 1500 ms debounce, stage-aware countdown (30 s mid-hand / 120 s between-hands), and three terminal sub-views (sat-out / vacated / replaced) — RESILIENCE-05 client side.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-30T06:58:00Z
- **Completed:** 2026-04-30T07:01:36Z
- **Tasks:** 1
- **Files modified:** 1 (created)

## Accomplishments

- Created `client/src/components/ReconnectOverlay.tsx` (262 lines) with full state machine
- Exported the three timing constants the Wave-0 test imports literally (`RECONNECT_OVERLAY_DEBOUNCE_MS=1500`, `GRACE_MID_HAND_MS=30_000`, `GRACE_BETWEEN_HANDS_MS=120_000`)
- All 11 cases in `ReconnectOverlay.test.tsx` flipped from RED → GREEN (one extra over the plan's "10 cases" — the constants assertion counts as its own test)
- Full client suite: 57 / 57 passing (was 46 / 46 — added 11 new tests, zero regressions)
- Component now ready for Plan 04-06 to mount inside `<App>` with the live socket and `gameState.stage` prop wiring

## Task Commits

1. **Task 1: Create ReconnectOverlay component with state machine** — `f10f368` (feat)

_TDD note: this plan executed against pre-existing Wave-0 RED tests from Plan 04-00; no separate "test" commit was needed — the RED → GREEN transition is captured in the single `feat` commit._

## OverlayState State Machine (5 kinds, D-B4)

```
type OverlayState =
  | { kind: 'hidden' }
  | { kind: 'reconnecting'; stage: 'mid-hand' | 'between-hands'; expiresAt: number }
  | { kind: 'sat-out' }
  | { kind: 'vacated' }
  | { kind: 'replaced' };
```

### Transition Table

| Trigger                                                            | From            | To                                                            |
| ------------------------------------------------------------------ | --------------- | ------------------------------------------------------------- |
| `socket.on('disconnect')`                                          | hidden          | hidden, start `debounceRef` (1500 ms)                         |
| Debounce 1500 ms expires (still disconnected)                      | hidden          | reconnecting (stage = stageFor(lastStage); expiresAt = now + graceMs); start grace + tick |
| `socket.on('connect')` BEFORE debounce                             | hidden          | hidden (clearTimeout debounce; no state change visible)       |
| `socket.on('connect')` AFTER overlay shown                         | reconnecting    | hidden (clear all timers)                                     |
| `socket.on('tableJoined')`                                         | reconnecting    | hidden (clear all timers)                                     |
| Grace timer expires (mid-hand)                                     | reconnecting    | sat-out                                                       |
| Grace timer expires (between-hands)                                | reconnecting    | vacated                                                       |
| `socket.on('replacedBySession')`                                   | any             | replaced (bypass debounce — D-A3)                             |
| Component unmount                                                  | any             | (cleanup) all timers cleared, all socket.off invoked          |

### Stage Inference

```
const stageFor = (lastStage: GameStage): 'mid-hand' | 'between-hands' =>
  lastStage === 'waiting' || lastStage === 'showdown' ? 'between-hands' : 'mid-hand';
```

## Three Timer Refs (Pitfall 5 Fix)

- `debounceRef` — `setTimeout(1500ms)` started on `disconnect`. Cleared on `connect` BEFORE starting a new debounce inside the disconnect handler (closes the rapid-cycle flicker — RESEARCH "Common Pitfalls" #5).
- `graceRef` — `setTimeout(graceMs)` started when entering `reconnecting`. Fires the deterministic transition to `sat-out` / `vacated`.
- `tickRef` — `setInterval(1000ms)` started when entering `reconnecting`. Updates `tickNow` state for the visible countdown digit. Decoupled from `graceRef` so a slow tick can't drift the actual expiry.

All three refs are cleared together by `clearAllTimers()` on `connect`, `tableJoined`, `replacedBySession`, and unmount.

## data-testid Coverage

All four required ids present (verified by `grep`):

- `data-testid="reconnect-overlay"` — active reconnecting countdown view
- `data-testid="reconnect-overlay-sat-out"` — mid-hand expiry sub-view
- `data-testid="reconnect-overlay-vacated"` — between-hands expiry sub-view
- `data-testid="reconnect-overlay-replaced"` — replacedBySession sub-view

## Neon Strip Token Consumption

`grep -c "var(--color"` returns **14** (≥4 required). Tokens consumed:

- `--color-active` (cyan — Reconnecting title, sat-out title, button border/text/glow)
- `--color-chip` (amber — countdown digit)
- `--color-neutral` (gray — subtext)
- `--color-action-fold` (red — vacated + replaced titles)
- `--glow-call` (cyan glow — title text-shadow, button box-shadow)
- `--glow-fold` (red glow — terminal-state title text-shadow)

The single literal exception is the backdrop `rgba(10,10,14,0.9)` — D-B4 specifies this verbatim as a tint of `--color-surface-base`.

## Decisions Made

- **tickNow sync at state entry** (Rule 1 deviation): the plan-supplied code computed `Math.ceil((expiresAt - tickNow)/1000)` using stale `tickNow` from initial mount. Under fake timers, `vi.advanceTimersByTime(1500)` makes `Date.now()` advance to T+1500 inside the debounce callback, so `expiresAt = T+1500 + graceMs`. The initial `tickNow = T` (from `useState(Date.now())` at mount) makes `remainingMs = graceMs + 1500` → `Math.ceil` rounds up to `graceSec+2`. Tests expect `/30|29|28/` and `/120|119|118/`. Fix: `setTickNow(startedAt)` inside the debounce callback at the moment we transition to `reconnecting`, so the first render computes `remainingMs ≈ graceMs` exactly.
- **OverlayState as discriminated union** — `kind` discriminator gives exhaustive narrowing at the render site; impossible states (e.g., reconnecting without expiresAt) cannot exist.
- **replacedBySession bypasses debounce** — D-A3 specifies instantaneous eviction. Handler calls `clearAllTimers()` then `setOverlayState({ kind: 'replaced' })` directly with no debounce path.
- **Two-timer strategy** for grace + tick — deterministic `setTimeout(graceMs)` owns the actual state transition; separate `setInterval(1000ms)` owns only the visible digit. Decoupled so a slow tick can't drift expiry.
- **`onDismissExpired?: () => void` prop** — overlay calls it from sat-out / vacated buttons. Plan 04-06 will wire this to `setView('menu')` in App.tsx; the test contract only asserts button presence.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] tickNow staleness made initial countdown render as 32 / 122 instead of 30 / 120**

- **Found during:** Task 1 (first vitest run after creating the file with the plan's literal code)
- **Issue:** The plan-supplied implementation initialized `tickNow` with `useState(Date.now())` at component mount and never updated it on entering `reconnecting`. Under fake timers, `Date.now()` at mount returned T; after `vi.advanceTimersByTime(1500)` the debounce callback fired with `Date.now() === T+1500`, so `expiresAt = T+1500 + 30000 = T+31500`. The first render still saw `tickNow === T`, so `remainingMs = 31500` and `Math.ceil(31500/1000) = 32`. Tests `/30|29|28/` failed with received text `Reconnecting…32seconds — your turn is held`. Same root cause for the 120 → 122 case.
- **Fix:** Added `setTickNow(startedAt)` inside the debounce callback (where `startedAt = Date.now()`), called immediately before `setOverlayState({ kind: 'reconnecting', ... })`. The two batched state updates land in the same render, so `remainingMs = expiresAt - tickNow = graceMs` exactly, producing `30` / `120` on first paint.
- **Files modified:** `client/src/components/ReconnectOverlay.tsx`
- **Verification:** `cd client && npx vitest run src/components/__tests__/ReconnectOverlay.test.tsx` — all 11 tests pass (was 9 / 11). Full client suite 57 / 57.
- **Committed in:** `f10f368` (Task 1 commit, alongside the rest of the component)

---

**Total deviations:** 1 auto-fixed (1 bug — Rule 1)
**Impact on plan:** Single localized fix to the countdown render path; no scope creep, no architectural change. The fix is internally consistent with the plan's stated intent ("countdown number for mid-hand starts at 30") — the plan's <action> block contained an implementation bug that contradicted its own behavior contract.

## Issues Encountered

- None beyond the deviation above. The plan's <action> block was otherwise reproducible verbatim.

## User Setup Required

None — pure client component, no external service config, no env vars.

## Next Phase Readiness

- **Plan 04-06 (App.tsx integration)** is now unblocked. The integration must:
  1. Import `ReconnectOverlay` from `./components/ReconnectOverlay`
  2. Mount it once inside `<App>`, passing `socket={socket}` and `lastStage={gameState?.stage ?? 'waiting'}`
  3. Wire `onDismissExpired={() => setView('menu')}` so the "Back to Tables" buttons dismiss the expired overlay
  4. The overlay will render NOTHING until the socket fires `disconnect` AND the disconnect persists ≥ 1500 ms — safe to mount unconditionally
- **Test contract pinned** — any future change to `OverlayState`, the timing constants, or the four `data-testid` values will break the 11-case suite immediately.
- **Constants exported** — `RECONNECT_OVERLAY_DEBOUNCE_MS` etc. are imported by tests and may be re-exported / consumed elsewhere; treat as part of the component's public API.

## Self-Check: PASSED

- File `client/src/components/ReconnectOverlay.tsx` — FOUND
- Commit `f10f368` (feat 04-05 ReconnectOverlay) — FOUND in `git log`
- Test file `client/src/components/__tests__/ReconnectOverlay.test.tsx` — 11 / 11 GREEN
- Full client suite — 57 / 57 passing (no regression)
- Acceptance criteria — all 17 plan-listed criteria verified (3 exported constants, 4 data-testids, 4 socket.on / socket.off pairs, var(--color-*) ≥4 occurrences (actual: 14), useRef ≥3 occurrences (actual: 6), exact rgba(10,10,14,0.9) backdrop literal present)

---
*Phase: 04-resilience*
*Completed: 2026-04-30*
