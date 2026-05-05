---
phase: 06-test-hardening
reviewed: 2026-05-05T05:39:46Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - client/src/test/setup.ts
  - client/src/components/ui/__tests__/Button.test.tsx
  - client/src/components/ui/__tests__/Tab.test.tsx
  - client/src/components/__tests__/GameControls.test.tsx
  - client/src/components/__tests__/SeatsDisplay.test.tsx
  - client/src/components/__tests__/DailyBonusButton.test.tsx
  - client/src/components/__tests__/Chat.test.tsx
  - client/src/components/__tests__/ConsentBanner.test.tsx
  - client/src/pages/admin/__tests__/AdminTables.test.tsx
  - client/src/pages/admin/__tests__/AdminUsers.test.tsx
  - client/src/pages/admin/__tests__/AdminAudit.test.tsx
  - client/src/pages/admin/__tests__/AdminEconomy.test.tsx
  - client/src/test/scenarios/join-table.test.tsx
  - client/src/test/scenarios/fold-call-raise.test.tsx
  - client/src/test/scenarios/avatar-selection.test.tsx
  - client/src/test/scenarios/tos-gate.test.tsx
  - client/src/test/scenarios/deposit-navigation.test.tsx
  - .github/workflows/ci.yml
  - client/package.json
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 06: Code Review Report

**Reviewed:** 2026-05-05T05:39:46Z
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found

## Summary

The phase-06 test suite covers 17 test files spanning unit tests for UI primitives, component
interaction tests, integration scenario tests, a CI workflow, and the client package manifest.
Overall the tests are well-structured: fixtures are minimal and focused, mocks are appropriately
scoped, and semantic queries (ARIA roles / labels) are used throughout rather than fragile DOM
selectors.

No security vulnerabilities or crash-level bugs were found. The findings break down into four
warnings that could cause false-passing tests or brittle CI, and five informational items.

---

## Warnings

### WR-01: CI `npm test` uses `cd client` shell shorthand — silently passes if client step errors in CI

**File:** `.github/workflows/ci.yml:44-46`

**Issue:** The root `npm test` script in `package.json` is:
```
vitest run --config vitest.config.server.ts && cd client && vitest run
```
The `cd client` is a shell built-in. In GitHub Actions the `run:` key runs each step in a fresh
shell, so `cd` side-effects do not leak across steps, but the compound `&&` chain within a single
`run:` block works on `ubuntu-latest` (bash). The real risk is that if the `cd client` fails for
any reason (e.g. the directory is missing), `vitest run` will execute from the repo root instead of
the client sub-package and will silently use the wrong `vitest.config.ts`, potentially running
zero client tests and reporting a clean exit.

The CI step that runs tests also has no explicit `working-directory: client` guard; it relies
entirely on the root `npm test` script being correct.

**Fix:** Decouple the two test runs into separate CI steps so each failure is visible independently,
and use `working-directory:` to make the client step explicit:
```yaml
- name: Run server tests
  run: npm run test:server

- name: Run client tests
  run: npm run test:client
  working-directory: client
```
The root `package.json` already has `test:server` and `test:client` scripts that support this.

---

### WR-02: `SeatsDisplay` test uses structural DOM query (`div.absolute`) that will break on any class-name refactor

**File:** `client/src/components/__tests__/SeatsDisplay.test.tsx:58-60`

**Issue:** The test locates seat tiles via `container.querySelectorAll('div.absolute')`. The class
`absolute` is a Tailwind utility injected directly on the seat wrapper. This selector is fragile in
two ways: (1) if the seat wrapper gains or loses any other `absolute` element (e.g., an overlay
div), the `.length === 6` assertion will fail spuriously; (2) renaming the CSS approach (e.g.,
switching to inline `position: absolute` style instead of a Tailwind class) will silently yield
0 results with no error message, causing the test to pass vacuously after asserting on an empty
NodeList.

The occupied-seat test at line 78 (`fireEvent.click(tiles[2])`) depends on the index in this
NodeList being stable — any extra `absolute` child anywhere in the tree will cause a
wrong-seat click.

**Fix:** Add a `data-testid="seat-{index}"` attribute to each seat tile in `SeatsDisplay.tsx`, then
query by test ID:
```tsx
// In SeatsDisplay.tsx, seat wrapper:
<div data-testid={`seat-${i}`} className="absolute" ...>

// In the test:
const tile2 = container.querySelector('[data-testid="seat-2"]')!;
fireEvent.click(tile2);
```

---

### WR-03: `AdminUsers` kick test assertion is vacuously true — the disjunction always passes

**File:** `client/src/pages/admin/__tests__/AdminUsers.test.tsx:52-54`

**Issue:** The third test ("clicking Kick shows inline confirm UI before emitting kickUser")
asserts:
```ts
expect(emittedKick || confirmShown).toBe(true);
```
This assertion passes if *either* condition holds, including the degenerate case where the
component emits `kickUser` immediately on first click (no confirmation dialog). Since the
actual component correctly shows a confirmation dialog on first click (`confirmShown` is true),
the test passes today — but it would *also* pass if someone changed the component to emit
immediately without confirmation, defeating the safety guard this test is meant to enforce.

The test's comment says "First click sets confirmKick state — shows inline confirm UI, does NOT
emit." That intent is not reflected in the assertion: the emit side is never asserted to be false.

**Fix:** Assert the two conditions independently:
```ts
// After first click: confirm UI should appear, emit must NOT have fired yet
expect(screen.getByRole('alert')).toBeInTheDocument();
expect(socket.emit).not.toHaveBeenCalled();
```

---

### WR-04: `DailyBonusButton` — two-`useEffect` eligibility logic creates a race condition that the tests do not cover

**File:** `client/src/components/__tests__/DailyBonusButton.test.tsx` (reflects a bug in `client/src/components/DailyBonusButton.tsx:68-73`)

**Issue:** `DailyBonusButton` computes eligibility in two separate `useEffect` hooks that run in
declaration order on every render. The second effect (`canClaimDaily` override, lines 68-73)
unconditionally overwrites `isEligible` when `canClaimDaily !== undefined`. However it also calls
`setTimeLeft('Ready')` only when `canClaimDaily === true`, not when it is `false`. This means:

- If `canClaimDaily=false` is passed while `balance < 1000` and no `lastDailyRefill`, the first
  effect correctly sets `isEligible=true` and `timeLeft='Ready'`, then the second effect sets
  `isEligible=false` but leaves `timeLeft='Ready'`. The displayed label says "Ready" but the
  button is disabled — inconsistent UI state.

The existing test at line 27 ("ineligible (canClaimDaily=false explicitly) → click does NOT fire
onClaim") only checks that `onClaim` is not called; it does not assert the displayed `timeLeft`
label, so this inconsistency goes undetected.

**Fix:** In `DailyBonusButton.tsx`, clear `timeLeft` when overriding to ineligible:
```ts
useEffect(() => {
  if (canClaimDaily !== undefined) {
    setIsEligible(canClaimDaily);
    if (canClaimDaily) {
      setTimeLeft('Ready');
    } else {
      setTimeLeft(''); // clear the stale 'Ready' label
    }
  }
}, [canClaimDaily]);
```
And add a test assertion to cover this case:
```ts
it('canClaimDaily=false clears the Ready label even when balance<1000', () => {
  render(<DailyBonusButton balance={500} canClaimDaily={false} onClaim={vi.fn()} />);
  const btn = screen.getByRole('button', { name: /daily bonus/i });
  expect(btn.textContent).not.toMatch(/ready/i);
});
```

---

## Info

### IN-01: `@testing-library/jest-dom` imported redundantly in admin tests

**File:** `client/src/pages/admin/__tests__/AdminTables.test.tsx:3`, `AdminUsers.test.tsx:3`, `AdminAudit.test.tsx:3`, `AdminEconomy.test.tsx:2`

**Issue:** These four files each import `@testing-library/jest-dom/vitest` at the top level. The
global setup file `client/src/test/setup.ts:1` already imports this for the entire test suite, so
the per-file imports are redundant. They do not cause failures but add noise.

**Fix:** Remove the per-file `import '@testing-library/jest-dom/vitest'` lines from all four admin
test files. The setup file handles this globally.

---

### IN-02: `AdminEconomy` imports placed after `beforeAll` block — non-standard module order

**File:** `client/src/pages/admin/__tests__/AdminEconomy.test.tsx:16-17`

**Issue:** The `import` statements for `AdminEconomy` and its types appear on lines 16-17, after
the `beforeAll` block on lines 6-14. ES module `import` declarations are hoisted by the runtime
regardless of textual position, so this does not cause a functional bug today. However, the
unusual ordering will surprise readers and contradicts the ES module specification expectation
that imports appear at the top of the file.

**Fix:** Move the imports to the top of the file, before the `beforeAll` block.

---

### IN-03: `fold-call-raise` scenario file duplicates the `makeSocket` / `makePlayer` / `makeGameState` factories from `GameControls.test.tsx`

**File:** `client/src/test/scenarios/fold-call-raise.test.tsx:6-44`

**Issue:** The three factory functions in this file are character-for-character copies of the ones
in `client/src/components/__tests__/GameControls.test.tsx`. The scenario file also tests the same
three actions (fold, call, raise) against the same component. This duplication means any change to
the `Player` or `GameState` type signature must be patched in two places.

**Fix:** Extract the shared factories into a `client/src/test/helpers/gameFixtures.ts` module and
import from both test files. Alternatively, evaluate whether the scenario file adds coverage
beyond what `GameControls.test.tsx` already provides; if not, remove it.

---

### IN-04: `setup.ts` Telegram WebApp stub uses `noop` for `enableClosingConfirmation` / `disableClosingConfirmation` but `vi.fn()` for all other methods — inconsistency

**File:** `client/src/test/setup.ts:24,70-71`

**Issue:** Most Telegram WebApp methods in the stub are `vi.fn()`, which allows tests to assert
on calls (`expect(window.Telegram.WebApp.ready).toHaveBeenCalled()`). Two methods —
`enableClosingConfirmation` and `disableClosingConfirmation` — are plain `noop` functions and
cannot be spied on. If a future component calls one of these and a test wants to assert the call
was made, the test will have to replace the stub manually. This is a minor inconsistency but can
cause confusion.

**Fix:** Replace `noop` with `vi.fn()` for consistency:
```ts
enableClosingConfirmation: vi.fn(),
disableClosingConfirmation: vi.fn(),
```

---

### IN-05: `join-table` scenario test has a fragile `closest('[role="button"]')` fallback

**File:** `client/src/test/scenarios/join-table.test.tsx:35-37`

**Issue:** The test navigates up from the text node using `.closest('[role="button"]')` and falls
back to clicking the text element directly (`?? beg`). The fallback means if `TableList` changes
to not assign `role="button"` to the card (e.g., uses a native `<button>` instead), the click
will land on the inner text span rather than the card, potentially failing to trigger the card's
`onClick`. The test would not fail — it would pass via the fallback — masking a real regression.

**Fix:** Assert that the card is found before clicking:
```ts
const card = beg.closest('[role="button"]') as HTMLElement;
expect(card).not.toBeNull(); // Guard: card must have role=button
fireEvent.click(card);
```

---

_Reviewed: 2026-05-05T05:39:46Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
