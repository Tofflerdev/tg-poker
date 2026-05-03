# Phase 6: Test Hardening - Context

**Gathered:** 2026-05-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship a complete Vitest + RTL test suite covering every interactive UI component and key user-journey scenarios, wired as a hard gate against regressions. The server test suite (already at 16 files, ~63 tests) is complete; Phase 6 extends the client suite.

**In scope:**
1. `Telegram.WebApp` + Socket.io client added to the shared `client/src/test/setup.ts` — every test gets these mocks for free.
2. Every interactive client UI component gets at least one co-located `*.test.tsx` covering happy-path interaction (TEST-02).
3. Scenario tests covering the six flows from TEST-03: join-table, fold/call/raise, disconnect+reconnect UI states, avatar selection, ToS gate, deposit-stub navigation.
4. `npm test` passes end-to-end as the hard gate (TEST-01 / TEST-04).

**Out of scope:**
- Server test suite changes (already complete).
- Deploy infrastructure (CI/CD Dockerfile, nginx) — explicitly out of this cycle per PROJECT.md.
- Visual regression tests / Playwright E2E.
- Coverage thresholds — left to Claude's discretion.

</domain>

<decisions>
## Implementation Decisions

### Coverage Scope (TEST-02)

- **D-01:** Scope is **broad — all interactive components** get at least one `*.test.tsx`. "Interactive" means any component a user can tap, click, or type into. Pure display components (CommunityCards, DealerButton, BetChipsDisplay, PayoutChipsDisplay, PotDisplay, HandDisplay, PokerChip, AnimatedCard) do NOT need tests in this phase.

- **D-02:** Components requiring new test files (in addition to the 7 already covered):
  - `GameControls` — fold/call/raise/all-in buttons and raise slider
  - `SeatsDisplay` — empty-seat "+" click to sit
  - `DailyBonusButton` — claim action
  - `Chat` — message input + send button
  - `ConsentBanner` — Accept button
  - `ui/Button` — onClick, active/disabled states, variant rendering
  - `ui/Tab` — selection state + onChange callback
  - Admin UI: `AdminLogin` already has a test; other admin panels (AdminTables, AdminUsers, AdminAudit, AdminEconomy) — Claude's discretion (smoke render tests at minimum).

- **D-03:** **GameControls test depth: happy-path only.** Three assertions: clicking Fold emits `'fold'` via socket, clicking Call emits `'call'`, clicking Raise with slider emits `'raise'` with the slider value. `vi.fn()` stubs for socket. No edge-case testing of slider clamping or disabled-state logic in this phase.

- **D-04:** **SeatsDisplay gets its own unit test** (empty-seat click fires the sit action) in addition to being covered by the join-table scenario test. SeatsDisplay is complex enough (6 seat positions, active/folded/avatar states) to warrant isolation.

- **D-05:** **Page components (MainMenu, TableList, ProfileSettings, Deposit, Consent) do NOT get separate unit tests.** They are covered by TEST-03 scenario tests. Separate page tests would duplicate scenario coverage.

- **D-06:** **`ui/Button` and `ui/Tab` get dedicated test files.** Button: onClick fires, `disabled` prevents click, variant class applied. Tab: clicking a tab fires onChange with the correct id. `ui/Badge` and `ui/Card` are display-only — no test files.

### Scenario Tests (TEST-03)

- **D-07:** Six scenario flows required by TEST-03:
  1. **Join table** — TableList renders tables; clicking "Sit" fires `joinTable` socket emit.
  2. **Fold/Call/Raise** — GameControls renders with correct turn; each action fires the expected socket emit.
  3. **Disconnect+reconnect UI states** — Already covered by `ReconnectOverlay.test.tsx` (Phase 4). No new scenario test needed unless a full page integration is desired. **Claude's discretion.**
  4. **Avatar selection** — ProfileSettings Avatar tab renders avatar grid; clicking an avatar fires `selectAvatar` emit.
  5. **ToS gate** — Consent page renders "Accept" CTA; clicking fires `acceptToS` emit.
  6. **Deposit-stub navigation** — MainMenu's Deposit block navigates to the Deposit page; Deposit page renders "coming soon" copy.

- **D-08:** Scenario tests live in `client/src/test/scenarios/` (a new subdirectory, included by the existing `vitest.config.ts` `src/test/**/*.test.{ts,tsx}` glob). They render pages (not full App router) and use `vi.fn()` socket stubs to simulate server responses.

### Mock Setup (TEST-01)

- **D-09:** `Telegram.WebApp` mock is added to `client/src/test/setup.ts` — a global `window.Telegram = { WebApp: { ... } }` stub that returns safe defaults for `initData`, `initDataUnsafe`, `ready()`, `expand()`, etc. Prevents "Telegram is not defined" crashes in any component that calls `useTelegram()`.

- **D-10:** Socket.io client mock strategy — **Claude's discretion.** Either a shared `vi.mock('socket.io-client')` in setup.ts or per-test manual mocks using the existing pattern from ReconnectOverlay.test.tsx. The requirement is that socket interactions can be asserted without a live server.

### CI Gate (TEST-04)

- **D-11:** `npm test` (root `package.json`) is the hard gate — it already runs both server and client suites sequentially. TEST-04's "CI runs the suite against a prod-like Vite build" is satisfied by: (a) `npm run build` (tsc compile) succeeding, and (b) `npm test` passing. No GitHub Actions YAML is required for v1.0 since deploy infra is out of scope. A GitHub Actions workflow file is **Claude's discretion** — if cheap to add, include it; otherwise skip.

### Claude's Discretion

- Socket.io mock depth: shared global mock in setup.ts vs per-test vi.fn() stubs
- Coverage threshold configuration in vitest.config.ts (if added)
- GitHub Actions YAML for TEST-04 (lightweight — just `npm test`)
- Admin panel beyond AdminLogin: smoke render tests or interactive tests
- Whether disconnect+reconnect scenario (TEST-03 item 3) needs a new scenario file beyond the existing ReconnectOverlay unit tests
- `client/package.json` `test` script (currently missing; root `npm test` runs `cd client && vitest run` directly — Claude may add a client-level script for convenience)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §TEST — TEST-01, TEST-02, TEST-03, TEST-04 (authoritative scope)
- `.planning/ROADMAP.md` §"Phase 6: Test Hardening" — goal and 4 success criteria

### Existing Test Infrastructure
- `client/vitest.config.ts` — jsdom + globals + setupFiles; `include` glob covers `src/**/__tests__/**` and `src/test/**`
- `client/src/test/setup.ts` — shared setup: jest-dom matchers + `window.matchMedia` mock
- `client/src/test/smoke.test.tsx` — minimal smoke test (pattern reference)
- `client/src/components/__tests__/ReconnectOverlay.test.tsx` — motion/react mock pattern (canonical reference for tests with animation)
- `client/src/components/__tests__/ActionBubbleLayer.test.tsx` — complex per-seat queue test pattern
- `client/src/components/__tests__/ActionBubble.test.tsx` — simple component test pattern
- `client/src/hooks/__tests__/useHandHistory.test.ts` — hook test pattern (vi.fn() socket stubs)
- `client/src/pages/admin/__tests__/AdminLogin.test.tsx` — page-level test pattern

### Existing Run Scripts
- Root `package.json` `"test"` script: `vitest run --config vitest.config.server.ts && cd client && vitest run`
- Root `package.json` `"test:coverage"`: adds `--coverage` flags to both
- `client/package.json` has NO `test` script (root script invokes `cd client && vitest run` directly)

### Components Without Tests (Phase 6 targets)
Interactive (must have tests):
- `client/src/components/GameControls.tsx`
- `client/src/components/SeatsDisplay.tsx`
- `client/src/components/DailyBonusButton.tsx`
- `client/src/components/Chat.tsx`
- `client/src/components/ConsentBanner.tsx`
- `client/src/components/ui/Button.tsx`
- `client/src/components/ui/Tab.tsx`
- Admin panels: `client/src/pages/admin/AdminTables.tsx`, `AdminUsers.tsx`, `AdminAudit.tsx`, `AdminEconomy.tsx`

Display-only (skip):
- AnimatedCard, BetChipsDisplay, PayoutChipsDisplay, CommunityCards, DealerButton, HandDisplay, PotDisplay, PokerChip, DevToolbar

### Design Language
- `CLAUDE.md` §"UI Design — Neon Strip Style" — test assertions should not couple to specific hex colors or inline styles; prefer text content, aria roles, and data-testid attributes

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `window.matchMedia` mock already in `setup.ts` — prevents jsdom crashes for motion/react.
- `motion/react` passthrough mock established in ReconnectOverlay.test.tsx and ActionBubbleLayer.test.tsx — copy-paste pattern for any component using motion.
- `@testing-library/user-event` v14 installed — use `userEvent.setup()` + `await user.click()` / `await user.type()` for interaction simulation.
- `@vitest/coverage-v8` installed — `npm run test:coverage` already configured.

### Established Patterns
- Socket mock: `vi.fn()` stubs passed as props or via `vi.mock('socket.io-client')` — no live server needed.
- `vi.useFakeTimers()` / `vi.useRealTimers()` pattern used in ActionBubbleLayer and ReconnectOverlay for timer-driven behavior.
- Test file location: `client/src/components/__tests__/ComponentName.test.tsx` — follow this convention.
- Scenario tests: new `client/src/test/scenarios/` directory (matched by existing `src/test/**` glob in vitest.config.ts).

### Integration Points
- `useTelegram()` hook reads `window.Telegram.WebApp` — adding a `window.Telegram` stub to setup.ts unblocks any component that calls this hook.
- Socket.io client: components receive socket via props or React context (check each component) — mock at the prop level or via `vi.mock`.
- `GameControls` receives `socket` as a prop — easy to mock with `vi.fn()`.
- `Chat` likely receives `socket` as a prop — check `client/src/components/Chat.tsx`.

</code_context>

<specifics>
## Specific Ideas

- Scenario tests in `src/test/scenarios/` — clean separation from unit tests, matched by existing glob.
- SeatsDisplay unit test covers the empty-seat click; scenario join-table test covers the full socket round-trip — complementary, not redundant.
- GameControls happy-path only — "fold fires socket" is the signal; slider edge cases deferred to v1.1+ if game logic bugs surface.
- Pages covered by scenarios only — avoids the trap of testing that React renders HTML.

</specifics>

<deferred>
## Deferred Ideas

- **Coverage thresholds** — `vitest --coverage --reporter=lcov` with a `lines: 80` threshold gate. Left to Claude's discretion for Phase 6; could be added as a v1.1 hardening step.
- **Playwright / Cypress E2E tests** — full browser automation against the running server. Out of scope for v1.0; no deploy infra.
- **Visual regression tests** (Percy, Chromatic) — Neon Strip pixel-level diffing. v1.1+ when the design is fully stable.
- **GameControls slider edge cases** — min raise = BB, max raise = stack, all-in button visibility. v1.1+ after game play feedback.
- **Server test coverage extension** — Phase 6 focuses on client; server suite already at 16 files.
- **GitHub Actions YAML** — lightweight `npm test` gate on push. Left to Claude's discretion; deploy infra is out of scope but a CI YAML is not deploy infra per se.

### Reviewed Todos (not folded)
None — todo matcher returned zero matches for Phase 6.

</deferred>

---

*Phase: 06-test-hardening*
*Context gathered: 2026-05-03*
