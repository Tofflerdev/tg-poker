---
phase: 04-resilience
plan: 03
subsystem: types
tags: [typescript, socket.io, types, eviction, single-session]

# Dependency graph
requires:
  - phase: 01-foundations
    provides: "Phase 1 D-07 placeholder cast `'sessionReplaced' as any` at server/index.ts:239 (untyped scaffold)"
  - phase: 04-resilience
    provides: "Wave-0 RED test scaffolds (Plan 04-00) — reconnectHandshake.test.ts asserts replacedBySession bare event contract"
provides:
  - "ExtendedServerEvents.replacedBySession typed event (`() => void`, no payload)"
  - "Compile-time enforcement that the eviction event carries no payload (closes T-04-A3-1)"
  - "Typed contract surface for Plan 04-05 (client overlay) and Plan 04-06 (server emit + cast removal)"
affects: [04-05, 04-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bare-event contracts at the type boundary (no payload, no PII surface)"

key-files:
  created: []
  modified:
    - types/index.ts

key-decisions:
  - "Pure-additive type change — no rename inside ExtendedServerEvents because Phase 1 placeholder was never typed (only `as any` cast)"
  - "Server emit-site at server/index.ts:239 left UNCHANGED — Plan 04-06 owns the cast removal so review boundaries stay clean"

patterns-established:
  - "Bare server → client events for security-sensitive notifications: `() => void` signature locks the no-payload contract at compile time"

requirements-completed: [RESILIENCE-04]

# Metrics
duration: 1min
completed: 2026-04-30
---

# Phase 04 Plan 03: Typed `replacedBySession` Event Summary

**Adds the typed `replacedBySession: () => void` event to `ExtendedServerEvents`, restoring the type-system contract that the Phase 1 D-07 `'sessionReplaced' as any` placeholder had bypassed.**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-04-30T06:55:41Z
- **Completed:** 2026-04-30T06:56:48Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added `replacedBySession: () => void` member to `ExtendedServerEvents` (types/index.ts:254) with documenting comment referencing RESILIENCE-04 / D-A3 and the upstream cast at server/index.ts:239.
- Closed the security regression risk noted in RESEARCH §"Security Domain": the typed `() => void` signature prevents future drift toward leaky payloads (T-04-A3-1).
- Verified zero TypeScript regressions: `npx tsc --noEmit` produces only the pre-existing Plan 04-00 RED scaffold error (`Cannot find module '../SessionRecovery.js'` — Plan 04-04's intentional contract specimen, unrelated to this change).
- Verified zero test regressions: `npm run test:server` reports 59 passed across 10 suites; the failing `SessionRecovery.test.ts` suite is the same pre-existing RED scaffold (also from Plan 04-00).

## Task Commits

Each task was committed atomically:

1. **Task 1: Add typed replacedBySession event to ExtendedServerEvents** — `e84a2f0` (feat)

_Plan metadata commit follows in the final commit step._

## Files Created/Modified

- `types/index.ts` — Added 9 lines (8-line comment block + 1-line typed member) inside `ExtendedServerEvents`. No other interface or type touched.

## Decisions Made

- **Pure-additive shape, not a rename.** Plan 04-03's name says "rename Phase 1 placeholder to typed event," but the placeholder was never declared in the interface — it only existed as the runtime literal `'sessionReplaced' as any` at server/index.ts:239. The type-side change is therefore an addition, and the server emit-site rename moves with Plan 04-06 (where the cast is removed). This keeps the diff in this plan minimal and the review boundary crisp.
- **Server emit untouched.** server/index.ts:239 still emits `'sessionReplaced' as any`. That cast keeps compiling because it bypasses type-checking entirely; Plan 04-06 will switch the literal string and drop the cast simultaneously, gaining the new compile-time contract.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — pure type-only change.

## Next Phase Readiness

- Plan 04-05 (`ReconnectOverlay` client listener) can now register a typed handler for `replacedBySession`.
- Plan 04-06 (server emit + auth handler) can replace the `'sessionReplaced' as any` cast at server/index.ts:239 with the typed `socket.emit('replacedBySession')` form and gain compile-time enforcement of the bare-event contract.
- No new blockers introduced.

## Self-Check: PASSED

- [x] `types/index.ts` exists and contains `replacedBySession: () => void;` (verified line 254)
- [x] No `sessionReplaced` member typed in interface (verified — only the untouched `'sessionReplaced' as any` runtime cast at server/index.ts:239 remains, scoped for Plan 04-06)
- [x] Commit `e84a2f0` exists in `git log` (`feat(04-03): add typed replacedBySession event to ExtendedServerEvents`)
- [x] `npx tsc --noEmit` introduces zero new errors (only pre-existing Plan 04-00 RED scaffold remains)
- [x] `npm run test:server` reports 59 passed (only pre-existing Plan 04-00 SessionRecovery RED suite fails to load, unchanged)

---
*Phase: 04-resilience*
*Completed: 2026-04-30*
