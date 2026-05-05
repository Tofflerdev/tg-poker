---
phase: 06
plan: 04
subsystem: client-tests
tags: [testing, vitest, rtl, scenarios, test-03]
dependency_graph:
  requires: [06-00, 06-01, 06-02]
  provides: [scenario-tests-join-table, scenario-tests-fold-call-raise, scenario-tests-avatar-selection, scenario-tests-tos-gate, scenario-tests-deposit-navigation]
  affects:
    - client/src/test/scenarios/join-table.test.tsx
    - client/src/test/scenarios/fold-call-raise.test.tsx
    - client/src/test/scenarios/avatar-selection.test.tsx
    - client/src/test/scenarios/tos-gate.test.tsx
    - client/src/test/scenarios/deposit-navigation.test.tsx
tech_stack:
  added: []
  patterns: [vitest-tdd, rtl-fireEvent, socket-stub-with-trigger, act-state-flush, role-radio-avatar-selector]
key_files:
  created:
    - client/src/test/scenarios/join-table.test.tsx
    - client/src/test/scenarios/fold-call-raise.test.tsx
    - client/src/test/scenarios/avatar-selection.test.tsx
    - client/src/test/scenarios/tos-gate.test.tsx
    - client/src/test/scenarios/deposit-navigation.test.tsx
  modified: []
decisions:
  - "join-table: Card has role='button' so getByRole+closest('[role=button]') is reliable; click on table name text bubbles up to Card onClick"
  - "fold-call-raise: Desktop Raise button has two child spans ('Raise' + amount), so accessible name is 'Raise 20'; /^raise/i partial regex used"
  - "avatar-selection: Confirm button label is 'No changes' when dirty=false (not 'Confirm'); separate queries for each state needed"
  - "avatar-selection: Avatar tiles render as button[role='radio'][aria-label='{slug}'], so getByRole('radio', { name: 'wolf' }) is the reliable selector"
  - "tos-gate: socket._trigger wrapped in act() to flush React state updates cleanly (same pattern as ConsentBanner tests in 06-02)"
  - "deposit-navigation: getByRole('button', { name: /deposit — add chips/i }) targets the BlockCard div[role='button'] precisely"
  - "TEST-03 item 3 (disconnect+reconnect) satisfied by existing ReconnectOverlay.test.tsx (per D-07) — no new file required"
metrics:
  duration: "3 minutes"
  completed: "2026-05-05"
  tasks_completed: 3
  tasks_total: 3
  files_created: 5
  files_modified: 0
---

# Phase 6 Plan 4: Scenario Tests (TEST-03) Summary

One-liner: Five scenario test files in `client/src/test/scenarios/` covering join-table, fold/call/raise, avatar selection, ToS gate, and deposit navigation — 15 new GREEN tests close TEST-03.

## What Was Built

### Task 1 — join-table.test.tsx + fold-call-raise.test.tsx (commit a7774af)

**join-table.test.tsx** — 3 tests covering the table selection flow:

| Test | Assertion |
|------|-----------|
| clicking a table row fires onSelectTable with that table id | `onSelectTable` called with `'t-beg-1'` |
| empty tables array renders no crash (smoke) | container truthy; no `[role=button]` table rows |
| Back button fires onBack | `onBack` called exactly once |

**fold-call-raise.test.tsx** — 3 tests covering the GameControls desktop action bar:

| Test | Assertion |
|------|-----------|
| Fold → socket.emit("fold") | emit called with `'fold'` |
| Call (toCall>0) → socket.emit("call") | emit called with `'call'` |
| Raise → socket.emit("raise", 20) | emit called with `('raise', 20)` |

**Selector adjustment (Rule 1):** The desktop Raise button renders two nested `<span>` children ("Raise" + the raiseAmount). This makes the accessible name "Raise 20", not "Raise". Changed regex from `/^raise$/i` to `/^raise/i` to match the partial name.

### Task 2 — avatar-selection.test.tsx + tos-gate.test.tsx (commit 96d8412)

**avatar-selection.test.tsx** — 3 tests covering the ProfileSettings avatar tab flow:

| Test | Assertion |
|------|-----------|
| switching avatar + Confirm emits updateAvatar with chosen id | `socket.emit` called with `('updateAvatar', { avatarId: 'wolf' })` |
| Confirm disabled when no avatar change pending | `noChangesBtn.disabled === true` |
| selecting already-current avatar keeps Confirm disabled | `noChangesBtn.disabled === true` |

**tos-gate.test.tsx** — 3 tests covering the Consent page gate flow:

| Test | Assertion |
|------|-----------|
| Accept button disabled until checkbox checked | `accept.disabled === true` |
| checkbox + Accept emits acceptTos with version 1.0 | `socket.emit` called with `('acceptTos', { version: '1.0' })` |
| tosAccepted ack invokes onAccept | `onAccept` called once |

**Selector adjustment (Rule 1):** The Confirm button in `ProfileSettings.renderAvatarTab()` renders `{dirty ? 'Confirm' : 'No changes'}`. When `dirty=false` (no avatar change), the button text is "No changes", not "Confirm". Tests for the disabled state use `getByRole('button', { name: /no changes/i })`. Only after a tile click makes `dirty=true` does the button become "Confirm".

**Avatar tile selector:** Tiles are `<button role="radio" aria-label="{slug}">` — `getByRole('radio', { name: 'wolf' })` is clean and precise. No need to use alt-text on the img child.

### Task 3 — deposit-navigation.test.tsx (commit abac83c)

**deposit-navigation.test.tsx** — 3 tests covering the Deposit page flow:

| Test | Assertion |
|------|-----------|
| Deposit block click on MainMenu fires onNavigate('deposit') | `onNavigate` called with `'deposit'` |
| Deposit page renders "Coming Soon" text | `screen.getByText(/coming soon/i)` present |
| Deposit page Back button fires onBack | `onBack` called exactly once |

**Selector choice:** `BlockCard` renders a `div[role="button"][aria-label="Deposit — add chips"]`. Used `getByRole('button', { name: /deposit — add chips/i })` — more specific than `/deposit/i` to avoid ambiguity with the "Daily Bonus" section's deposit subtitle text.

## TEST-03 Coverage

| Item | Description | File | Status |
|------|-------------|------|--------|
| 1 | Join table flow | `join-table.test.tsx` | COVERED |
| 2 | Fold/Call/Raise socket events | `fold-call-raise.test.tsx` | COVERED |
| 3 | Disconnect+reconnect UI | `ReconnectOverlay.test.tsx` (Phase 4) | COVERED (per D-07) |
| 4 | Avatar selection | `avatar-selection.test.tsx` | COVERED |
| 5 | ToS gate | `tos-gate.test.tsx` | COVERED |
| 6 | Deposit navigation | `deposit-navigation.test.tsx` | COVERED |

TEST-03 requirement is fully satisfied. All 6 scenarios (5 new files + 1 existing) are GREEN.

## Final Test Counts

| Suite | Before | After |
|-------|--------|-------|
| Client tests (total) | 109 | 124 |
| New join-table tests | — | 3 |
| New fold-call-raise tests | — | 3 |
| New avatar-selection tests | — | 3 |
| New tos-gate tests | — | 3 |
| New deposit-navigation tests | — | 3 |
| Regressions | 0 | 0 |

Full client suite: **124/124 passing**, 24 test files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Desktop Raise button accessible name is "Raise 20" not "Raise"**
- **Found during:** Task 1 verification (first run failed on fold-call-raise test 3)
- **Issue:** The plan's template used `/^raise$/i` but the desktop Raise button has two child spans: `<span>Raise</span><span>20</span>`. RTL computes accessible name as "Raise 20".
- **Fix:** Changed to `/^raise/i` (partial match, not anchored at end).
- **Files modified:** `client/src/test/scenarios/fold-call-raise.test.tsx`
- **Commit:** a7774af

**2. [Rule 1 - Bug] Confirm button label is "No changes" when dirty=false**
- **Found during:** Task 2 — reading ProfileSettings.tsx before writing
- **Issue:** The plan's template used `getByRole('button', { name: /confirm/i })` for the disabled-state test, but `ProfileSettings.renderAvatarTab()` renders `{dirty ? 'Confirm' : 'No changes'}`. When dirty=false, there is no "Confirm" button — only "No changes".
- **Fix:** Test 2 and Test 3 use `getByRole('button', { name: /no changes/i })` for the disabled-state assertions.
- **Files modified:** `client/src/test/scenarios/avatar-selection.test.tsx`
- **Commit:** 96d8412

**3. [Rule 1 - Bug] Plan avatar tile selector used getByAltText but tiles have aria-label**
- **Found during:** Task 2 — reading ProfileSettings.tsx avatar tab render (lines 427-480)
- **Issue:** The plan's template used `screen.getByAltText(new RegExp(targetId, 'i'))` to find avatar tiles, then walked up to the closest button. However, tiles already ARE buttons with `role="radio"` and `aria-label={id}`. Direct `getByRole('radio', { name: 'wolf' })` is cleaner and more robust.
- **Fix:** Used `getByRole('radio', { name: 'wolf' })` directly — no DOM walking needed.
- **Files modified:** `client/src/test/scenarios/avatar-selection.test.tsx`
- **Commit:** 96d8412

**4. [Rule 1 - Bug] Plan deposit selector used getByLabelText but BlockCard is role="button"**
- **Found during:** Task 3 — reading MainMenu.tsx BlockCard component
- **Issue:** The plan's template used `getByLabelText(/deposit/i)` but `BlockCard` renders `div[role="button"][aria-label="..."]`. RTL's `getByLabelText` primarily targets form elements. `getByRole('button', { name: /deposit — add chips/i })` is the correct query.
- **Fix:** Used `getByRole('button', { name: /deposit — add chips/i })`.
- **Files modified:** `client/src/test/scenarios/deposit-navigation.test.tsx`
- **Commit:** abac83c

## Known Stubs

None. These are test-only files.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes introduced. Test files only.

## Self-Check: PASSED

Files created:
- FOUND: client/src/test/scenarios/join-table.test.tsx
- FOUND: client/src/test/scenarios/fold-call-raise.test.tsx
- FOUND: client/src/test/scenarios/avatar-selection.test.tsx
- FOUND: client/src/test/scenarios/tos-gate.test.tsx
- FOUND: client/src/test/scenarios/deposit-navigation.test.tsx

Commits:
- FOUND: a7774af (test(06-04): add join-table + fold-call-raise scenario tests)
- FOUND: 96d8412 (test(06-04): add avatar-selection + tos-gate scenario tests)
- FOUND: abac83c (test(06-04): add deposit-navigation scenario tests)

Full client suite: 124/124 passing (24 test files).
