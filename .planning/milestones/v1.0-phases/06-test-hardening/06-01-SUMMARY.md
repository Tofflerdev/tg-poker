---
phase: 06
plan: 01
subsystem: client-tests
tags: [testing, vitest, rtl, game-controls, seats-display]
dependency_graph:
  requires: [06-00]
  provides: [game-controls-tests, seats-display-tests]
  affects: [client/src/components/__tests__/GameControls.test.tsx, client/src/components/__tests__/SeatsDisplay.test.tsx]
tech_stack:
  added: []
  patterns: [vitest-tdd, rtl-fireEvent, socket-stub, selector-querySelectorAll]
key_files:
  created:
    - client/src/components/__tests__/GameControls.test.tsx
    - client/src/components/__tests__/SeatsDisplay.test.tsx
  modified: []
decisions:
  - "GameControls desktop layout targeted by relying on setup.ts matchMedia mock (matches:false) — no extra stubbing needed"
  - "makeGameState uses 'as any as GameState' cast to omit rarely-read fields (pots, spectators, communityCards, etc.)"
  - "SeatsDisplay selector: container.querySelectorAll('div.absolute') returns exactly 6 — child divs use only inline position styles, not Tailwind class"
  - "motion/react passthrough mock included in SeatsDisplay test defensively — SeatsDisplay and its HandDisplay/Card chain don't currently use motion, but mock prevents future breakage"
  - "Player required fields (seat, hand, totalBet, acted, showCards, sittingOut) added to makePlayer helpers to avoid TypeScript cast errors"
metrics:
  duration: "5 minutes"
  completed: "2026-05-05"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 0
---

# Phase 6 Plan 1: GameControls + SeatsDisplay Tests Summary

One-liner: 7 happy-path GameControls emit-assertion tests (D-03) and 4 SeatsDisplay empty-seat-click tests (D-04), all GREEN; full client suite grows from 71 to 82.

## What Was Built

### Task 1 — GameControls.test.tsx (commit ae86947)

Created `client/src/components/__tests__/GameControls.test.tsx` with 7 tests covering the complete happy-path action bar:

| Test | Assertion |
|------|-----------|
| clicking Fold emits "fold" | `socket.emit` called with `'fold'` |
| clicking Call emits "call" (toCall > 0) | `socket.emit` called with `'call'` |
| clicking Check emits "check" (toCall === 0) | `socket.emit` called with `'check'` |
| clicking Raise emits "raise" with default amount | `socket.emit` called with `('raise', 20)` |
| clicking + then Raise emits "raise" with bumped amount | `socket.emit` called with `('raise', 40)` |
| clicking All-In emits "allIn" | `socket.emit` called with `'allIn'` |
| not-my-turn: "thinking..." panel visible, buttons absent | `queryByRole('button', {name:/^fold$/i})` returns null |

**Helpers:**
- `makeSocket()` — emit/on/off as vi.fn(); mirrors ReconnectOverlay.test.tsx pattern
- `makePlayer(overrides)` — all required Player fields (seat, hand, totalBet, acted, showCards, sittingOut, waitingForBB, allIn, folded)
- `makeGameState(overrides)` — minimal GameState with stage='flop', currentPlayer=0, currentBet=40, bigBlind=20

**Key decision:** Desktop layout renders by default because `useIsMobile()` reads matchMedia which setup.ts stubs to `matches:false`. The `raiseAmount` state initializes to 20 and `useEffect` on `isMyTurn` runs `setRaiseAmount(Math.max(20, 20))` = 20 — so the raise emit test asserts `('raise', 20)` correctly.

### Task 2 — SeatsDisplay.test.tsx (commit 9bb63fc)

Created `client/src/components/__tests__/SeatsDisplay.test.tsx` with 4 tests:

| Test | Assertion |
|------|-----------|
| clicking empty seat fires onSit(2) (D-04) | `onSit` called once with `2` |
| clicking occupied seat does NOT fire onSit | `onSit` not called |
| clicking empty seat when mySeat already set does NOT fire onSit | `onSit` not called |
| renders six absolutely-positioned seat tiles (smoke) | `div.absolute` NodeList length === 6 |

**Selector strategy:** `container.querySelectorAll('div.absolute')` targets the Tailwind `absolute` class on each seat root `<div>`. Child elements (TimerRing SVG, Avatar inner div, HandDisplay container) use only inline `position:` styles — not the `absolute` className — so the query reliably returns exactly 6. Verified against SeatsDisplay.tsx source lines 382-395.

**Motion mock:** Defensive passthrough mock included even though SeatsDisplay, HandDisplay, and Card do not currently import motion/react.

## Final Test Counts

| Suite | Before | After |
|-------|--------|-------|
| Client tests (total) | 71 | 82 |
| New GameControls tests | — | 7 |
| New SeatsDisplay tests | — | 4 |
| Regressions | 0 | 0 |

Full client suite: **82/82 passing**, 12 test files.

## Deviations from Plan

None — plan executed exactly as written. The required fields for `Player` (totalBet, acted, showCards, sittingOut) were already anticipated by the plan's note to "inspect types/index.ts and add them" — added to helpers as planned.

## Known Stubs

None.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes introduced. Test files only.

## Self-Check: PASSED

Files created:
- FOUND: client/src/components/__tests__/GameControls.test.tsx
- FOUND: client/src/components/__tests__/SeatsDisplay.test.tsx

Commits:
- FOUND: ae86947 (test(06-01): add GameControls happy-path tests (D-03))
- FOUND: 9bb63fc (test(06-01): add SeatsDisplay empty-seat click tests (D-04))
