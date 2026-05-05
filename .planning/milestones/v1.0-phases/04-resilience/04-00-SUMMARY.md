---
phase: 04-resilience
plan: 00
subsystem: testing
tags: [vitest, react-testing-library, tdd, red-tests, fake-timers, mocking, scaffold]

# Dependency graph
requires:
  - phase: 03-gameplay-additions
    provides: Vitest+RTL test stack, motion/react mock pattern, inline socket-handler harness pattern, singleton __resetForTests pattern
provides:
  - 5 Wave-0 RED test files establishing the contract for Plans 04-01..04-06
  - Test seam: GraceRegistry singleton with __resetForTests / __getInternalsForTests
  - Test seam: SessionRecovery boot-sweep with mocked prisma.user.findMany + per-row try/catch
  - Test seam: UserRepository atomic helpers (tryDecrementBalance, refundCurrentChips) with prisma.user.updateMany mocking
  - Test seam: reconnect handshake inline harness mirroring server/index.ts auth handler shape
  - Test seam: ReconnectOverlay socket event-emitter facade with disconnect/connect/replacedBySession/tableJoined triggers
affects: [04-resilience]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RED-first test scaffolding: import not-yet-created modules so suites fail with module-not-found until implementation lands"
    - "Inline auth-handler harness: copy server/index.ts auth handler body verbatim into a test-only makeAuthHandler() so contract drift is caught"
    - "Bare-event assertion: check .toHaveLength(1) on emit.mock.calls[k] to verify Socket.io event was sent without a payload"

key-files:
  created:
    - server/__tests__/GraceRegistry.test.ts
    - server/__tests__/SessionRecovery.test.ts
    - server/__tests__/UserRepository.atomic.test.ts
    - server/__tests__/reconnectHandshake.test.ts
    - client/src/components/__tests__/ReconnectOverlay.test.tsx
  modified: []

key-decisions:
  - "All five Phase-4 test files written FIRST as RED scaffolds — every <verify> in Plans 04-01..04-06 has a real automated assertion target from day 1"
  - "reconnectHandshake.test.ts uses an inline harness (not a real socket.io server) — passes today because mocks back the handler; the contract enforcement is that Plan 04-06 must keep server/index.ts in sync with this harness shape"
  - "Constants-as-export pattern for ReconnectOverlay: RECONNECT_OVERLAY_DEBOUNCE_MS / GRACE_MID_HAND_MS / GRACE_BETWEEN_HANDS_MS exported from the component module so tests assert the literal values (1500 / 30000 / 120000) instead of timing-fragile observed values"

patterns-established:
  - "Wave-0 RED scaffolds: tests reference modules that DO NOT yet exist — failure mode is 'Cannot find module' / 'is not a function', NOT a parse error. Suites must compile."
  - "Mock collaborators BEFORE importing the module under test (vi.mock hoists; preserves singleton wiring)"

requirements-completed: [RESILIENCE-02, RESILIENCE-04, RESILIENCE-05, RESILIENCE-06, RESILIENCE-07]

# Metrics
duration: 5min
completed: 2026-04-29
---

# Phase 04 Plan 00: Wave-0 Test Scaffolds Summary

**Five RED Vitest test files establishing the behavior contract for the resilience subsystem (GraceRegistry, SessionRecovery, UserRepository atomic helpers, reconnect handshake, ReconnectOverlay) — every downstream plan now has an automated verification target from the moment it begins.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-29T19:21:00Z (approx)
- **Completed:** 2026-04-29T19:26:31Z
- **Tasks:** 2
- **Files created:** 5

## Accomplishments

- 4 server-side Vitest test files scaffolded; 3 are RED (modules not yet created), 1 self-contained reconnectHandshake harness passing as a contract specimen.
- 1 client-side Vitest+RTL test file scaffolded with motion/react passthrough mock and a fake-timers-driven socket event-emitter facade — RED on `import { ReconnectOverlay } from '../ReconnectOverlay'`.
- Verified that all 89 EXISTING tests (43 server + 46 client) continue to pass — this plan only adds files; it modifies nothing.
- Honored the GSD Nyquist rule: every `<verify>` in Plans 04-01..04-06 now has a real `npx vitest run …` target.

## Test File Inventory

| File | `describe` block | `it()` count | RED via |
|------|------------------|--------------|---------|
| `server/__tests__/GraceRegistry.test.ts` | `GraceRegistry` | 10 | `Cannot find module '../GraceRegistry.js'` (module created in Plan 04-02) |
| `server/__tests__/SessionRecovery.test.ts` | `SessionRecovery` | 4 | `Cannot find module '../SessionRecovery.js'` (module created in Plan 04-04) |
| `server/__tests__/UserRepository.atomic.test.ts` | `UserRepository atomic helpers` (with nested `tryDecrementBalance (D-D1)` / `refundCurrentChips (D-D2)`) | 6 | `UserRepository.tryDecrementBalance is not a function` / `UserRepository.refundCurrentChips is not a function` (helpers added in Plan 04-01) |
| `server/__tests__/reconnectHandshake.test.ts` | `reconnect handshake` | 5 | Inline harness — mocks back auth handler; PASSES today as a contract specimen. Plan 04-06 must mirror handler shape verbatim or these tests catch the drift. |
| `client/src/components/__tests__/ReconnectOverlay.test.tsx` | `ReconnectOverlay` | 11 | `Failed to resolve import "../ReconnectOverlay"` (component created in Plan 04-05) |

**Total:** 5 test files, 36 `it()` cases, 5 RED contracts ready to turn GREEN as Plans 04-01..04-06 land.

## Task Commits

Each task was committed atomically:

1. **Task 1: Server Wave-0 test scaffolds (4 files)** — `7dc3029` (test)
2. **Task 2: Client Wave-0 test scaffold (ReconnectOverlay)** — `bd75a56` (test)

**Plan metadata:** _to be created in final commit (this SUMMARY + STATE.md + ROADMAP.md + REQUIREMENTS.md)_

## Files Created/Modified

- `server/__tests__/GraceRegistry.test.ts` — 10 cases: arm/clear/reArmIfMidHand state machine + mid-hand/between-hands expiry routing + no-op-on-already-left (D-B2/D-B3)
- `server/__tests__/SessionRecovery.test.ts` — 4 cases: refund-all-rows / stale-tableId-warn / per-row-blast-radius / no-rows-no-op (D-C1/D-C3/D-C4)
- `server/__tests__/UserRepository.atomic.test.ts` — 6 cases: tryDecrementBalance true/false on row-count + refundCurrentChips returns/null/idempotent/user-not-found (D-D1/D-D2)
- `server/__tests__/reconnectHandshake.test.ts` — 5 cases: tableJoined snapshot emit + seat-via-findIndex (NOT hardcoded 0) + GraceRegistry.clear-on-reconnect + replacedBySession bare event + getStateForPlayer privacy path (D-A2/D-A3, RESILIENCE-04)
- `client/src/components/__tests__/ReconnectOverlay.test.tsx` — 11 cases: constants assertion + no-render-while-connected + 1500 ms debounce + countdown 30 s/120 s + dismiss-on-tableJoined + sat-out / vacated / replaced sub-views + rapid-cycle debounce reset (D-A3, D-B4)

## Decisions Made

- **All Wave-0 tests written before any implementation.** This honors the Nyquist rule: every downstream `<verify>` block has a real `npx vitest run …` command from day 1, eliminating manual-inspection drift.
- **reconnectHandshake uses an inline harness, not real socket.io.** A faithful inline copy of the auth handler body keeps the test deterministic AND establishes a textual contract: any divergence in `server/index.ts` (e.g., reverting to hardcoded `seat: 0`) will fail the seat-2 assertion immediately.
- **ReconnectOverlay constants exported as named consts.** `RECONNECT_OVERLAY_DEBOUNCE_MS = 1500`, `GRACE_MID_HAND_MS = 30_000`, `GRACE_BETWEEN_HANDS_MS = 120_000` are exported from the component module so tests assert literal values — not timing-fragile observed values. Plan 04-05 must export these or the suite fails on import.
- **Bare-event assertion via `.mock.calls[k].length`.** D-A3 specifies `replacedBySession` as a bare event with no payload. We assert this via `expect(replacedCalls[0]).toHaveLength(1)` (event name only, no second arg) — catches the regression where someone adds a payload object.

## Deviations from Plan

None - plan executed exactly as written. All five test files were created with the exact content specified in the plan body. RED state confirmed for the 4 modules-not-yet-created files; reconnectHandshake.test.ts passes via its inline harness (intentional per plan).

## Issues Encountered

None. The two `vitest run` invocations produced exactly the expected failure modes:
- Server suite: 3 failed test files (GraceRegistry, SessionRecovery, UserRepository.atomic) + 1 passed (reconnectHandshake), all 43 prior tests still green.
- Client suite: 1 failed test file (ReconnectOverlay), all 46 prior tests still green.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Plans 04-01..04-06 unblocked.** Each downstream plan now has a `<verify>` target that can be run as soon as the implementation lands.
- **Wave-1 entry points:** Plan 04-01 (UserRepository atomic helpers) turns 6 tests GREEN. Plan 04-02 (GraceRegistry) turns 10 tests GREEN. Plan 04-04 (SessionRecovery) turns 4 tests GREEN. Plan 04-05 (ReconnectOverlay) turns 11 tests GREEN. Plan 04-06 (reconnect handshake in server/index.ts) keeps 5 tests GREEN by mirroring the inline harness shape.
- **No blockers.** Existing test suites remain green; no downstream plan's automated verification is regressed.

## Self-Check: PASSED

**Files created (verified via filesystem):**
- ✓ FOUND: server/__tests__/GraceRegistry.test.ts
- ✓ FOUND: server/__tests__/SessionRecovery.test.ts
- ✓ FOUND: server/__tests__/UserRepository.atomic.test.ts
- ✓ FOUND: server/__tests__/reconnectHandshake.test.ts
- ✓ FOUND: client/src/components/__tests__/ReconnectOverlay.test.tsx

**Commits (verified via git log):**
- ✓ FOUND: 7dc3029 test(04-00): add Wave-0 RED test scaffolds for resilience server modules
- ✓ FOUND: bd75a56 test(04-00): add Wave-0 RED test scaffold for ReconnectOverlay

**Test execution (verified via npm run test:server and `cd client && npx vitest run`):**
- ✓ Server: 8 passed test files, 3 failed (the 3 RED modules-not-yet-created files); 43 existing tests still pass
- ✓ Client: 6 passed test files, 1 failed (ReconnectOverlay RED); 46 existing tests still pass
- ✓ All failures are module-not-found / method-not-found, NOT parse errors

---
*Phase: 04-resilience*
*Completed: 2026-04-29*
