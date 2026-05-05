---
phase: 06
plan: 02
subsystem: client-tests
tags: [testing, vitest, rtl, daily-bonus, chat, consent-banner]
dependency_graph:
  requires: [06-00]
  provides: [daily-bonus-button-tests, chat-tests, consent-banner-tests]
  affects:
    - client/src/components/__tests__/DailyBonusButton.test.tsx
    - client/src/components/__tests__/Chat.test.tsx
    - client/src/components/__tests__/ConsentBanner.test.tsx
tech_stack:
  added: []
  patterns: [vitest-tdd, rtl-fireEvent, socket-stub-with-trigger, act-state-flush, scrollIntoView-stub]
key_files:
  created:
    - client/src/components/__tests__/DailyBonusButton.test.tsx
    - client/src/components/__tests__/Chat.test.tsx
    - client/src/components/__tests__/ConsentBanner.test.tsx
  modified: []
decisions:
  - "DailyBonusButton: two-useEffect eligibility (balance/lastRefill then canClaimDaily override) is correctly tested by passing canClaimDaily as a prop — the second useEffect overrides the first synchronously in jsdom"
  - "Chat: Element.prototype.scrollIntoView = vi.fn() in beforeAll stubs the jsdom gap — scrollToBottom useEffect fires on mount (welcome message triggers messages state change) and would throw without the stub"
  - "ConsentBanner: socket._trigger('tosAccepted') wrapped in act() to flush the three simultaneous state updates (setSubmitting, setDismissed, onAccept call) without React act() warning"
  - "D-02 component coverage complete: Button + Tab (06-00), GameControls + SeatsDisplay (06-01), DailyBonusButton + Chat + ConsentBanner (06-02) — all 7 interactive components covered"
metrics:
  duration: "3 minutes"
  completed: "2026-05-05"
  tasks_completed: 3
  tasks_total: 3
  files_created: 3
  files_modified: 0
---

# Phase 6 Plan 2: DailyBonusButton + Chat + ConsentBanner Tests Summary

One-liner: 16 new happy-path tests closing D-02 component coverage — DailyBonusButton eligibility gate (5), Chat sendChatMessage emit flow (6), ConsentBanner Accept/Dismiss/ack lifecycle (5).

## What Was Built

### Task 1 — DailyBonusButton.test.tsx (commit 2f641f3)

Created `client/src/components/__tests__/DailyBonusButton.test.tsx` with 5 tests:

| Test | Assertion |
|------|-----------|
| canClaimDaily=true eligible → click fires onClaim | `onClaim` called exactly once |
| balance<1000, no lastRefill eligible → click fires onClaim | `onClaim` called exactly once |
| balance>=1000 ineligible → button disabled, click NOT fired | `onClaim` not called |
| canClaimDaily=false ineligible → click NOT fired | `onClaim` not called |
| eligible state renders label + "Ready" status | textContent matches /daily bonus/i and /ready/i |

All 5 GREEN on first run.

### Task 2 — Chat.test.tsx (commit 19ba705)

Created `client/src/components/__tests__/Chat.test.tsx` with 6 tests:

| Test | Assertion |
|------|-----------|
| type + click Send → emits sendChatMessage with author payload | `socket.emit` called with `('sendChatMessage', { authorId, authorName, text, type })` |
| empty textarea → Send disabled, NO emit | `send.disabled === true`; emit not called |
| whitespace-only → Send disabled, NO emit | `send.disabled === true`; emit not called |
| trim whitespace → emits trimmed text | emit called with `expect.objectContaining({ text: 'hello' })` |
| clears textarea after Send | `textarea.value === ''` |
| currentUser=null → textarea + Send both disabled | both `.disabled === true` |

**Auto-fix applied (Rule 3):** `Element.prototype.scrollIntoView = vi.fn()` in `beforeAll` — jsdom does not implement `scrollIntoView`; Chat's `scrollToBottom()` useEffect fires on mount when the welcome system message is added and throws without the stub.

All 6 GREEN after fix.

### Task 3 — ConsentBanner.test.tsx (commit 15dc530)

Created `client/src/components/__tests__/ConsentBanner.test.tsx` with 5 tests:

| Test | Assertion |
|------|-----------|
| Accept button emits acceptTos with version '1.0' | `socket.emit` called with `('acceptTos', { version: '1.0' })` |
| tosAccepted server ack → onAccept called + localStorage flag set | `onAccept` called once; `localStorage.getItem('consent_banner_dismissed_v1') === '1'` |
| Dismiss → no emit; banner becomes null; flag set | emit not called; Accept button absent; flag `=== '1'` |
| localStorage flag pre-set → renders null | `container.firstChild === null` |
| Read terms button → onViewLegal('tos') | `onViewLegal` called with `'tos'` |

**makeMockSocket** with `_trigger` helper mirrors ReconnectOverlay.test.tsx pattern.
`socket._trigger` wrapped in `act()` to flush three concurrent state updates cleanly.
`beforeEach(() => localStorage.clear())` isolates dismissal flag between tests.

All 5 GREEN.

## Final Test Counts

| Suite | Before | After |
|-------|--------|-------|
| Client tests (total) | 82 | 98 |
| New DailyBonusButton tests | — | 5 |
| New Chat tests | — | 6 |
| New ConsentBanner tests | — | 5 |
| Regressions | 0 | 0 |

Full client suite: **98/98 passing**, 15 test files.

## D-02 Component Coverage — Complete

| Component | Test File | Plan |
|-----------|-----------|------|
| Button | `ui/__tests__/Button.test.tsx` | 06-00 |
| Tab / TabBar | `ui/__tests__/Tab.test.tsx` | 06-00 |
| GameControls | `__tests__/GameControls.test.tsx` | 06-01 |
| SeatsDisplay | `__tests__/SeatsDisplay.test.tsx` | 06-01 |
| DailyBonusButton | `__tests__/DailyBonusButton.test.tsx` | 06-02 |
| Chat | `__tests__/Chat.test.tsx` | 06-02 |
| ConsentBanner | `__tests__/ConsentBanner.test.tsx` | 06-02 |

TEST-02 component-coverage requirement is satisfied for all 7 non-admin interactive components.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] jsdom missing scrollIntoView**
- **Found during:** Task 2 (Chat tests, all 6 failing on first run)
- **Issue:** `messagesEndRef.current?.scrollIntoView is not a function` — jsdom does not implement `scrollIntoView`; Chat's welcome-message `systemMessage` listener fires on mount, updates `messages` state, and triggers the `scrollToBottom()` useEffect which calls `scrollIntoView`.
- **Fix:** `beforeAll(() => { Element.prototype.scrollIntoView = vi.fn(); })` in Chat.test.tsx
- **Files modified:** `client/src/components/__tests__/Chat.test.tsx`
- **Commit:** 19ba705

**2. [Rule 2 - Test Hygiene] act() wrapper for tosAccepted trigger**
- **Found during:** Task 3 (ConsentBanner tests passing but emitting React act() warning)
- **Issue:** `socket._trigger('tosAccepted')` causes three simultaneous state updates (setSubmitting, setDismissed, onAccept) outside `act()`, generating a console warning.
- **Fix:** Added `act` import from `@testing-library/react`; wrapped `socket._trigger('tosAccepted')` in `act(() => { ... })`.
- **Files modified:** `client/src/components/__tests__/ConsentBanner.test.tsx`
- **Commit:** 15dc530

## Known Stubs

None. These are test-only files.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes introduced. Test files only.

## Self-Check: PASSED

Files created:
- FOUND: client/src/components/__tests__/DailyBonusButton.test.tsx
- FOUND: client/src/components/__tests__/Chat.test.tsx
- FOUND: client/src/components/__tests__/ConsentBanner.test.tsx

Commits:
- FOUND: 2f641f3 (test(06-02): add DailyBonusButton happy-path tests (D-02))
- FOUND: 19ba705 (test(06-02): add Chat happy-path tests (D-02))
- FOUND: 15dc530 (test(06-02): add ConsentBanner happy-path tests (D-02))
