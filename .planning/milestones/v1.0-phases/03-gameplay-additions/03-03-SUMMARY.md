---
phase: 03-gameplay-additions
plan: 03
subsystem: client-ui
tags: [action-bubble, motion-react, per-seat-fifo, reduced-motion, neon-strip, animations]
dependency_graph:
  requires: ["03-00", "03-01"]
  provides: ["ActionBubble", "ActionBubbleLayer", "ACTION_BUBBLE_HOLD_MS", "bubbleLabel"]
  affects: ["03-04", "03-05"]
tech_stack:
  added:
    - "motion@^12.38.0 (client dep) — motion.span, AnimatePresence, useReducedMotion"
  patterns:
    - "Per-seat FIFO queue via Map<seat, BubbleQueueItem[]> — five seats render in parallel, same-seat actions queue FIFO"
    - "Imperative push-handle pattern (registerPushHandle callback) for socket→layer bridge instead of forwardRef"
    - "AnimatePresence mode='sync' wrapping the full anchor list; inner ActionBubble keyed on head.id so same-seat queue advances drop the old pill without exit-tail"
    - "useReducedMotion() ?? false (null→false fallback) per RESEARCH Gotcha #5"
    - "vi.mock('motion/react', ...) passthrough for fake-timer deterministic tests — keeps production AnimatePresence intact"
key_files:
  created:
    - client/src/components/ActionBubble.tsx
    - client/src/components/ActionBubbleLayer.tsx
    - client/src/components/__tests__/ActionBubble.test.tsx
    - client/src/components/__tests__/ActionBubbleLayer.test.tsx
  modified:
    - client/package.json
    - client/src/pages/GameRoom.tsx
decisions:
  - "Unit tests mock motion/react with a passthrough (Fragment AnimatePresence + plain-tag motion proxy) so fake timers advance deterministically; production code keeps real motion/react with enter/exit animations. Behavioral contract (head renders → 900 ms → next renders) is preserved by the test mock."
  - "Seat position arrays (SEAT_POSITIONS_DESKTOP/MOBILE) are duplicated from SeatsDisplay rather than extracted to a shared module — layout is stable per CLAUDE.md Compact Card contract and the duplication is minimal."
  - "Push-handle pattern (registerPushHandle callback) instead of forwardRef + useImperativeHandle — keeps the layer self-contained for unit testing and avoids React 18 ref-forwarding types in tests."
  - "Pre-existing TypeScript error in client/src/hooks/useTelegram.ts:131 (missing displayName on TelegramUser SetStateAction) logged to deferred-items.md — untouched by this plan (Scope Boundary)."
metrics:
  duration: "~55 minutes"
  completed_at: "2026-04-20T23:51:45Z"
  tasks_completed: 3
  tasks_total: 3
  files_created: 4
  files_modified: 2
requirements_addressed: [GAME-02, GAME-03]
---

# Phase 03 Plan 03: Client Action-Bubble Layer Summary

**One-liner:** Per-seat FIFO bubble layer over the poker table with motion/react enter/exit animations, 900 ms minimum hold, reduced-motion fallback, and a socket→layer push-handle bridge in GameRoom.

## What Was Built

### Task 1 — motion dep + ActionBubble pill component

`client/package.json` — added `"motion": "^12.38.0"` (D-08). Installed via `npm install`.

`client/src/components/ActionBubble.tsx` (90 lines) — single animated Neon Strip pill:
- `bubbleLabel(action, amount)` helper produces exact UI-SPEC strings: `FOLD`, `CHECK`, `CALL N`, `BET N`, `RAISE TO N`, `ALL-IN N` (or plain `ALL-IN` when amount is 0).
- `actionToTier` maps `PlayerActionKind` → `ActionTier`: fold→fold, check/call→call, bet/raise→raise, allin→allin.
- Consumes `VARIANT_TIER[tier]` from `ui/tokens.ts` for `color` + `glow` — inline style references `var(--color-action-*)` / `var(--glow-*)` CSS vars ONLY (no hex literals in component source, enforced by test grep).
- `motion.span` with `initial/animate/exit/transition` props per D-05: pop-scale+fade in (120 ms easeOut), opacity + 6 px y-drift out (200 ms easeIn).
- `useReducedMotion() ?? false` (null-coalesce per RESEARCH Gotcha #5) → when reduced, duration 0 for enter/exit (hold still managed by parent layer, so the action signal is never suppressed).
- `role="status"` for a11y, `data-action` + `data-tier` for test assertions.

`client/src/components/__tests__/ActionBubble.test.tsx` (84 lines, 8 tests):
- bubbleLabel exact strings per UI-SPEC (×1 suite covering all 7 action cases + all-in-zero edge)
- FOLD renders with fold tier + role="status"
- check→call tier mapping
- bet→raise tier mapping
- allin→allin tier mapping
- CSS-var-only styling (asserts `var(--color-action-` present, asserts no `#rgb|#rrggbb` pattern)
- reduced-motion `true` renders without crash
- reduced-motion `null` renders without crash (initial-render edge case)

**Commit:** `08397c5` feat(03-03): add motion dep + ActionBubble pill component

### Task 2 — ActionBubbleLayer with per-seat FIFO queues (TDD)

`client/src/components/ActionBubbleLayer.tsx` (201 lines) — per-seat queue manager:
- **Exports:** `ActionBubbleLayer` React.FC, `ACTION_BUBBLE_HOLD_MS = 900` (test-only const), `BubbleQueueItem` + `ActionBubbleLayerProps` types.
- **State:** `useState<Map<number, BubbleQueueItem[]>>` — keyed by seat index; value is FIFO array; head item renders, shifts off after 900 ms.
- **Timers:** `useRef<Map<number, Timeout>>` + `scheduleHeadRemoval(seat)` → each seat has at most one pending 900 ms `setTimeout`. After timeout fires, queues state updates: head shifts off; when queue empties, entry is deleted from the Map (so AnimatePresence plays the exit on the trailing bubble).
- **Push API:** `pushBubble(evt)` generates a unique `id` via `nextBubbleId()` module-level counter (Date.now + sequence) — guards against AnimatePresence key collapse when the same action fires twice at the same seat (RESEARCH Gotcha #3).
- **Imperative bridge:** `registerPushHandle` callback prop — parent (GameRoom) gets the push function via a ref; avoids re-subscribing on every re-render.
- **Position arrays:** `SEAT_POSITIONS_DESKTOP` / `SEAT_POSITIONS_MOBILE` (6 entries each, `{left, top, align}`) copied from SeatsDisplay. Rotation: `visualIndex = (seat - mySeat + 6) % 6` so the viewer's seat sits at bottom.
- **Layer styles:** `position: absolute, inset: 0, pointerEvents: 'none', zIndex: 30, aria-live: 'polite'`. Z-30 sits above seats (z-20) and below chat overlay (z-50); `pointer-events: none` means seat taps still work.
- **Animation framing:** `AnimatePresence mode="sync"` wraps the full anchor list; inner `<ActionBubble key={head.id} />` so a same-seat queue advance unmounts/mounts instantly (no exit-tail holding the old pill in the DOM). Empty-queue seats have their entire anchor removed → AnimatePresence plays the trailing exit animation.

`client/src/components/__tests__/ActionBubbleLayer.test.tsx` (159 lines, 8 tests):
- Layer styles: `position: absolute`, `pointerEvents: none`, `zIndex: 30`
- `ACTION_BUBBLE_HOLD_MS === 900` (D-04 compliance)
- Push then 900 ms advance removes the bubble
- Five different seats render in parallel (per-seat queues, D-03)
- Same-seat FIFO: second action queues behind first; appears after 900 ms
- Unique ids: two identical actions at same seat both render in turn (AnimatePresence doesn't collapse by key)
- Rotation: mySeat=2 + seat=2 → visualIndex 0 → `left:50%, top:94%`; mySeat=null + seat=2 → visualIndex 2 → `left:4%, top:30%`
- Unmount timer cleanup: advancing timers after unmount doesn't throw / doesn't setState on unmounted component

**Commit:** `f82a6a9` feat(03-03): ActionBubbleLayer per-seat FIFO queues with 900ms hold

### Task 3 — Mount in GameRoom + socket subscription

`client/src/pages/GameRoom.tsx` (modified, +27/-0 net useful lines):
- **Imports:** `ActionBubbleLayer` from `../components/ActionBubbleLayer`; `ActionBubbleEvent` added to the existing shared-types import line.
- **Ref:** `const bubblePushRef = React.useRef<((evt: ActionBubbleEvent) => void) | null>(null)` — holds the layer's push handle so the socket listener doesn't re-subscribe on every re-render.
- **Socket subscription:**
  ```tsx
  useEffect(() => {
    const onActionBubble: ExtendedServerEvents['actionBubble'] = (evt) => {
      bubblePushRef.current?.(evt);
    };
    socket.on('actionBubble', onActionBubble);
    return () => { socket.off('actionBubble', onActionBubble); };
  }, [socket]);
  ```
  Cleanup calls `socket.off` with the same handler reference — no leaks on unmount or socket replacement.
- **Mount:** wrapped `<Table />` in a `position: relative, width/height: 100%` container so `ActionBubbleLayer`'s `absolute inset: 0` resolves to the table area (not the full viewport). Layer mounted as sibling with `mySeat`, `isMobile`, and `registerPushHandle={(push) => { bubblePushRef.current = push; }}`.

**Commit:** `6d1d100` feat(03-03): mount ActionBubbleLayer in GameRoom + socket subscription

## Verification Evidence

### Test results (16/16 passing)

```
✓ src/components/__tests__/ActionBubbleLayer.test.tsx (8 tests) 80ms
✓ src/components/__tests__/ActionBubble.test.tsx (8 tests) 58ms
Test Files  2 passed (2)
     Tests  16 passed (16)
```

### Acceptance-criteria greps

- `grep "ActionBubbleLayer" client/src/pages/GameRoom.tsx` → 5 matches (import + JSX mount + 3 comments)
- `grep "socket.on('actionBubble'" client/src/pages/GameRoom.tsx` → 1 match
- `grep "socket.off('actionBubble'" client/src/pages/GameRoom.tsx` → 1 match
- `grep "registerPushHandle" client/src/pages/GameRoom.tsx` → 1 match
- `grep "bubblePushRef" client/src/pages/GameRoom.tsx` → 3 matches (decl + socket handler + mount callback)
- `grep "Table #|table-phase|pot-label" client/src/pages/GameRoom.tsx` → 0 matches (GAME-01 regression clean)
- `grep "socket.emit('actionBubble'" client/src/pages/GameRoom.tsx` → 0 matches (client only receives)
- `grep '"motion"' client/package.json` → `"motion": "^12.38.0"` present

### No-hex-literal check (component source)

- `client/src/components/ActionBubble.tsx` — uses `VARIANT_TIER[tier].color` / `.glow` only; no `#` hex values in style.
- Verified by test: asserts style matches `var(--color-action-` and does NOT match `#[0-9a-fA-F]{3,6}`.

## Decisions Made

1. **vi.mock for motion/react in tests** — motion/react's `AnimatePresence` keeps an exiting child in the DOM during its 200 ms exit animation. Under `vi.useFakeTimers()` the RAF-driven animation never advances, so `queryByText('CALL 100')` would still find the exit-animating element and FIFO tests would fail. Solved by `vi.mock('motion/react', ...)` in the test file that replaces `AnimatePresence` with a passthrough `Fragment` and `motion.*` with a proxy of plain tags (stripping motion-only props). Production code keeps the real library with full enter/exit animations.

2. **Imperative push-handle (registerPushHandle) vs forwardRef** — simpler for parent wiring and unit testing. The layer stays self-contained; tests capture `push` via a local variable in the registerPushHandle callback.

3. **SEAT_POSITIONS duplication** — copied from SeatsDisplay rather than extracted. Layout is stable per the CLAUDE.md Compact Card contract, and reshaping SeatsDisplay's existing positioning would have been a larger blast radius than warranted.

4. **AnimatePresence placement** — wraps the full anchor list (not per seat). When a queue empties the seat's entire anchor drops from JSX → trailing exit animation plays. When a same-seat queue advances the anchor stays mounted but the inner `<ActionBubble>` is keyed on `head.id` → unmounts/mounts instantly (no exit-tail). This matches plan's Task 2 NOTE.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written with one small additional test-infrastructure decision (vi.mock for motion/react) that was explicitly allowed by the plan's Task 2 NOTE:
> "The plan explicitly allows dropping AnimatePresence for the unit test while keeping the behavioral contract: 'head renders → 900 ms → next renders'."

### Deferred Issues

**Pre-existing TypeScript error — `client/src/hooks/useTelegram.ts:131`** (out of scope per Scope Boundary)
- `tsc --noEmit -p client/tsconfig.json` surfaces: missing `displayName` on `TelegramUser` SetStateAction.
- `git log --oneline -3 -- client/src/hooks/useTelegram.ts` confirms last touch in commit `f9519a9` (pre-Phase 03).
- Logged to `.planning/phases/03-gameplay-additions/deferred-items.md` for follow-up triage.

### Architectural Changes

None.

### Authentication Gates

None encountered.

## Known Stubs

None. The layer is fully wired: server broadcasts `actionBubble` (Plan 03-01) → GameRoom `socket.on` → `bubblePushRef.current(evt)` → layer enqueues → `AnimatePresence` renders the pill → 900 ms hold → exit animation → dequeue. No mock data, no "coming soon" text.

## Requirements Addressed

- **GAME-02 — Per-seat action bubbles with 900 ms hold:** layer renders a tier-colored pill over the acting seat, per-seat FIFO queue, exactly 900 ms minimum hold before dequeue. Asserted by unit tests #3, #4, #5, #6.
- **GAME-03 — Reduced-motion fallback preserves the action signal:** `useReducedMotion() ?? false` drives zero-duration enter/exit variants while keeping the 900 ms hold intact. Asserted by ActionBubble tests #7, #8.

## Self-Check: PASSED

- [x] `client/src/components/ActionBubble.tsx` exists (90 lines)
- [x] `client/src/components/ActionBubbleLayer.tsx` exists (201 lines)
- [x] `client/src/components/__tests__/ActionBubble.test.tsx` exists (84 lines, 8 tests)
- [x] `client/src/components/__tests__/ActionBubbleLayer.test.tsx` exists (159 lines, 8 tests)
- [x] `client/src/pages/GameRoom.tsx` modified with ActionBubbleLayer mount + socket subscription
- [x] `client/package.json` contains `"motion": "^12.38.0"`
- [x] Commit `08397c5` present — `feat(03-03): add motion dep + ActionBubble pill component`
- [x] Commit `f82a6a9` present — `feat(03-03): ActionBubbleLayer per-seat FIFO queues with 900ms hold`
- [x] Commit `6d1d100` present — `feat(03-03): mount ActionBubbleLayer in GameRoom + socket subscription`
- [x] 16/16 unit tests pass (`npx vitest run` on both files)
- [x] GAME-01 regression greps clean (no Table # / table-phase / pot-label labels in GameRoom.tsx)
