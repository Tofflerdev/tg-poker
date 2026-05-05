---
phase: 06
plan: 00
subsystem: client-tests
tags: [testing, vitest, rtl, ui-primitives, telegram-stub]
dependency_graph:
  requires: []
  provides: [telegram-webappstub, button-tests, tab-tests]
  affects: [client/src/test/setup.ts, client/src/components/ui/__tests__]
tech_stack:
  added: []
  patterns: [vitest-tdd, rtl-fireEvent, window-stub]
key_files:
  created:
    - client/src/components/ui/__tests__/Button.test.tsx
    - client/src/components/ui/__tests__/Tab.test.tsx
  modified:
    - client/src/test/setup.ts
decisions:
  - "window.Telegram stub uses vi.fn() for all callables so downstream tests can spy/assert without re-stubbing"
  - "initData: '' keeps useTelegram() in standalone/dev-mock mode — no Telegram auth path exercised in tests"
  - "Baseline client suite was 60 tests (not 57 as plan stated) — plan count was from an earlier state; final count is 71"
metrics:
  duration: "4 minutes"
  completed: "2026-05-05"
  tasks_completed: 3
  tasks_total: 3
  files_created: 2
  files_modified: 1
---

# Phase 6 Plan 0: Test Foundation (Telegram Stub + UI Primitives) Summary

One-liner: Shared Telegram.WebApp vi.fn() stub in setup.ts plus 11 new happy-path tests for Button and TabBar primitives (D-06, D-09).

## What Was Built

### Task 1 — Telegram WebApp stub in setup.ts (commit 883e08a)

Added a global `window.Telegram.WebApp` stub to `client/src/test/setup.ts` that runs before every test file. The stub uses `vi.fn()` for every callable method so individual tests can spy and assert on calls without additional setup. `initData: ''` keeps `useTelegram()` in standalone mode, matching the dev-mock auth path App.tsx already supports.

Stub surface covered:
- `initData: ''`, `initDataUnsafe: {}`, `version`, `platform`, `colorScheme`, `themeParams`, `isExpanded`, `viewportHeight`, `viewportStableHeight`
- `BackButton`: `show`, `hide`, `onClick`, `offClick` — all `vi.fn()`
- `MainButton`: `setText`, `setParams`, `show`, `hide`, `onClick`, `offClick`, `showProgress`, `hideProgress`, `enable`, `disable` — all `vi.fn()`
- `HapticFeedback`: `impactOccurred`, `notificationOccurred`, `selectionChanged` — all `vi.fn()`
- `ready`, `expand`, `close` — all `vi.fn()`
- `setHeaderColor`, `setBackgroundColor`, `showPopup`, `showAlert`, `showConfirm` — all `vi.fn()`
- `enableClosingConfirmation`, `disableClosingConfirmation` — plain `noop`

Existing `matchMedia` mock and `jest-dom` import preserved. Smoke test and full prior 60-test suite stayed GREEN.

### Task 2 — Button.test.tsx (commit c79e53f)

Created `client/src/components/ui/__tests__/Button.test.tsx` with 6 happy-path tests:

| Test | Assertion |
|------|-----------|
| fires onClick when clicked | `onClick` called exactly once |
| does NOT fire onClick when disabled | `onClick` not called |
| variant="fold" → CSS token | style contains `var(--color-action-fold)` |
| variant="call" → CSS token | style contains `var(--color-action-call)` |
| emphasis=true → inset glow | style contains `inset 0 0 12px` |
| emphasis absent → box-shadow: none | style matches `/box-shadow:\s*none/i` |

All 6 GREEN on first run.

### Task 3 — Tab.test.tsx (commit 4f1ec93)

Created `client/src/components/ui/__tests__/Tab.test.tsx` with 5 happy-path tests:

| Test | Assertion |
|------|-----------|
| standalone Tab fires onClick | `onClick` called once |
| renders tablist with 3 buttons | `role="tablist"` present + 3 button elements |
| clicking inactive tab fires onChange | `onChange` called with `'avatar'` |
| clicking active tab still fires onChange | `onChange` called with `'profile'` |
| rerender with new activeId | no crash; all 3 buttons still in DOM |

All 5 GREEN on first run.

## Final Test Counts

| Suite | Before | After |
|-------|--------|-------|
| Client tests | 60 | 71 |
| New Button tests | — | 6 |
| New Tab tests | — | 5 |
| Regressions | 0 | 0 |

Full client suite: **71/71 passing**, 10 test files.

## Deviations from Plan

**1. [Rule 1 - Bug] Baseline test count was 60, not 57**
- **Found during:** Task 1 verification
- **Issue:** Plan stated "57 prior tests" but the actual baseline was 60 passing client tests. The plan's count was from an earlier project state; Phase 5 added 3 more tests after the plan was authored.
- **Fix:** Treated 60 as the non-regression baseline. Final count 71 = 60 + 6 + 5 as expected.
- **Impact:** None — all 60 prior tests still pass.

## Known Stubs

None.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes introduced. Test files only.

## Self-Check: PASSED

Files created:
- FOUND: client/src/components/ui/__tests__/Button.test.tsx
- FOUND: client/src/components/ui/__tests__/Tab.test.tsx
- FOUND: client/src/test/setup.ts (modified)

Commits:
- FOUND: 883e08a (feat(06-00): add Telegram.WebApp stub)
- FOUND: c79e53f (test(06-00): add happy-path Button tests)
- FOUND: 4f1ec93 (test(06-00): add happy-path Tab/TabBar tests)
