---
phase: 05-admin-ops-observability
plan: "00"
subsystem: testing
tags: [vitest, typescript, admin, observability, compliance, tdd, posthog, sentry, jwt]

# Dependency graph
requires:
  - phase: 04-resilience
    provides: "replacedBySession typed event in ExtendedServerEvents; GraceRegistry; SessionRecovery; reconnect handshake shape"
provides:
  - "TrackableEvent union type (OBS-04/D-11) — closed analytics event taxonomy"
  - "ServerErrorType union ('TOS_REQUIRED' | 'BANNED', COMPLIANCE-04/D-13)"
  - "AdminState / AdminTableInfo / AdminUserInfo / AdminAuditLogEntry interfaces (ADMIN-04/Pattern 9)"
  - "AdminServerEvents / AdminClientEvents typed interfaces for /admin Socket.io namespace (ADMIN-02)"
  - "serverError typed event added to ExtendedServerEvents (COMPLIANCE-04/D-13)"
  - "6 server RED test suites (scrubber, analytics, adminAuth, adminNamespace, adminMutations, tosGate)"
  - "1 client RED test suite (AdminLogin form happy path + 401 error)"
affects:
  - "05-01 (joinGate.ts implements tosGate RED → GREEN)"
  - "05-02 (scrubber.ts + analytics.ts implement scrubber/analytics RED → GREEN)"
  - "05-03 (adminAuth.ts implements adminAuth RED → GREEN)"
  - "05-04 (adminNamespace.ts + adminMutations.ts implement namespace/mutations RED → GREEN)"
  - "05-05 (AdminLogin.tsx implements client AdminLogin RED → GREEN)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave-0 RED scaffold: test files reference non-existent modules so each downstream plan has a pre-written GREEN target"
    - "Dynamic import + vi.resetModules() pattern for module-level side-effect isolation in analytics/adminAuth/adminNamespace/tosGate tests"
    - "Inline socket harness pattern (fake socket object + vi.fn next) for Socket.io middleware tests without a real server"
    - "vi.mock at file top + vi.resetAllMocks in beforeEach for prisma-layer tests (adminMutations)"

key-files:
  created:
    - "server/__tests__/scrubber.test.ts — RED suite for PII scrubber (SECURITY-04, OBS-01)"
    - "server/__tests__/analytics.test.ts — RED suite for server-side analytics no-op + capture (OBS-03, OBS-04)"
    - "server/__tests__/adminAuth.test.ts — RED suite for JWT sign/verify + credential validator (ADMIN-01)"
    - "server/__tests__/adminNamespace.test.ts — RED suite for /admin namespace JWT middleware (ADMIN-02)"
    - "server/__tests__/adminMutations.test.ts — RED suite for fire-and-fail audit pattern (ADMIN-06)"
    - "server/__tests__/tosGate.test.ts — RED suite for joinTable TOS_REQUIRED/BANNED gate (COMPLIANCE-04)"
    - "client/src/pages/admin/__tests__/AdminLogin.test.tsx — RED suite for AdminLogin form (ADMIN-01, 05-05)"
  modified:
    - "types/index.ts — Phase 5 type contracts appended (TrackableEvent, ServerErrorType, AdminState, AdminServerEvents, AdminClientEvents, serverError event)"
    - "tsconfig.json — server/__tests__ excluded from tsc compilation (Rule 3 auto-fix)"

key-decisions:
  - "05-00: Wave-0 RED scaffold pattern used for Phase 5 — 7 test files written before any implementation; each downstream plan (05-01..05-05) has a pre-written automated verification target"
  - "05-00: Dynamic import + vi.resetModules() used for analytics/adminAuth/adminNamespace/tosGate to isolate module-level singleton state between tests"
  - "05-00: server/__tests__ excluded from tsconfig.json include scope — test files run by vitest only, not tsc; this avoids tsc errors from RED imports referencing not-yet-created modules"
  - "05-00: AdminLogin.test.tsx placed at client/src/pages/admin/__tests__/ — mirrors vitest include glob src/**/__tests__/**/*.test.{ts,tsx} from client/vitest.config.ts"

patterns-established:
  - "RED-first scaffold: all Phase 5 test files created before their implementation modules; tests remain RED until downstream plans ship"
  - "Implementation seam ownership: scrubber.ts → 05-02; analytics.ts → 05-02; adminAuth.ts → 05-03; adminNamespace.ts → 05-04; adminMutations.ts → 05-04; joinGate.ts → 05-01; AdminLogin.tsx → 05-05"

requirements-completed:
  - ADMIN-01
  - ADMIN-02
  - ADMIN-03
  - ADMIN-06
  - OBS-01
  - OBS-03
  - OBS-04
  - SECURITY-04
  - COMPLIANCE-04

# Metrics
duration: 25min
completed: 2026-05-02
---

# Phase 5 Plan 00: Admin / Ops / Observability Wave-0 RED Scaffolds Summary

**Seven RED test files + full Phase 5 TypeScript contracts published: TrackableEvent, AdminState, AdminServerEvents/AdminClientEvents, ServerErrorType, and serverError event — all downstream plans (05-01..05-05) have pre-written automated verification targets.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-02T16:10:00Z
- **Completed:** 2026-05-02T16:35:00Z
- **Tasks:** 3 (+ 1 auto-fix deviation)
- **Files modified:** 9

## Accomplishments

- Published all Phase 5 TypeScript contracts in `types/index.ts` (TrackableEvent union, ServerErrorType, AdminState/AdminTableInfo/AdminUserInfo/AdminAuditLogEntry interfaces, AdminServerEvents/AdminClientEvents, serverError event added to ExtendedServerEvents)
- Created 6 server-side RED test suites covering every Phase 5 implementation seam (scrubber, analytics, adminAuth, adminNamespace, adminMutations, tosGate)
- Created 1 client-side RED test suite for AdminLogin form (happy path + 401 error + render assertions)
- Both build targets (server tsc + client Vite) compile with exit 0
- All 61 existing server tests + 57 existing client tests remain GREEN

## Task Commits

1. **Task 1: Augment types/index.ts with Phase 5 shared contracts** — `f5c5f75` (feat)
2. **Task 2: Write 6 server-side RED test scaffolds** — `30f5750` (test)
3. **Task 3: Write 1 client-side RED test scaffold (AdminLogin)** — `2cbbc91` (test)
4. **Deviation fix: Exclude server/__tests__ from tsc compilation** — `fc7ab30` (fix)

## Files Created/Modified

- `types/index.ts` — Phase 5 contracts appended (86 lines added): TrackableEvent, ServerErrorType, AdminTableInfo, AdminUserInfo, AdminAuditLogEntry, AdminState, AdminServerEvents, AdminClientEvents, serverError event in ExtendedServerEvents
- `server/__tests__/scrubber.test.ts` — RED: PII scrubber (initData/sessionToken/telegramId redaction, numeric-run scrubbing, recursion, Sentry event passthrough)
- `server/__tests__/analytics.test.ts` — RED: server analytics no-op when uninitialized + posthog.capture forwarding
- `server/__tests__/adminAuth.test.ts` — RED: signAdminToken/verifyAdminToken round-trip + tamper rejection + validateCredentials
- `server/__tests__/adminNamespace.test.ts` — RED: /admin namespace middleware rejects missing/malformed JWT, admits valid token + stamps socket.data.adminUser
- `server/__tests__/adminMutations.test.ts` — RED: fire-and-fail audit pattern (audit row written BEFORE mutation fn; audit throw aborts mutation)
- `server/__tests__/tosGate.test.ts` — RED: gateUserOrEmit emits TOS_REQUIRED / BANNED / passes through clean users
- `client/src/pages/admin/__tests__/AdminLogin.test.tsx` — RED: AdminLogin form render, JWT storage on success, error display + password clear on 401
- `tsconfig.json` — Added `server/__tests__` and `tests/` to `exclude` array (Rule 3 auto-fix)

## Decisions Made

- Wave-0 RED scaffold pattern adopted for Phase 5 (same as Phase 4 Plan 00) — tests written first, implementations land in 05-01..05-05
- `vi.resetModules()` + dynamic `import()` used for modules with singleton state (analytics client, admin auth env vars) to ensure test isolation
- `server/__tests__` excluded from tsc scope (tsconfig.json) — test files run exclusively by vitest; excluding avoids tsc "Cannot find module" errors from deliberate RED imports
- Implementation seam ownership locked: scrubber.ts → 05-02; analytics.ts → 05-02; adminAuth.ts → 05-03; adminNamespace.ts → 05-04; adminMutations.ts → 05-04; joinGate.ts → 05-01; AdminLogin.tsx → 05-05

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Excluded server/__tests__ from tsconfig.json to fix build failure**
- **Found during:** Task 1 verification (`npm run build`)
- **Issue:** `tsconfig.json` includes the `server/` directory which includes `server/__tests__/`. RED test files statically import modules that do not yet exist (`../utils/scrubber.js`, `../admin/adminAuth.js`, etc.), causing tsc to emit "Cannot find module" errors. The plan's Task 1 acceptance criterion requires `npm run build` to exit 0.
- **Fix:** Added `server/__tests__` and `tests/` to the `exclude` array in `tsconfig.json`. Vitest has its own `vitest.config.server.ts` include glob — no functionality is lost; tests still run correctly under vitest.
- **Files modified:** `tsconfig.json`
- **Verification:** `npm run build` exits 0; `npm run test:server` still picks up all test files and the new RED suites fail as expected.
- **Committed in:** `fc7ab30`

---

**Total deviations:** 1 auto-fixed (Rule 3 — blocking)
**Impact on plan:** Required for correctness. Excluding test dirs from tsc is standard practice; vitest has its own resolution config. No scope creep.

## Issues Encountered

None beyond the tsconfig blocking issue resolved by the Rule 3 auto-fix above.

## Known Stubs

None — this plan ships no production logic. All files are either pure type definitions (`types/index.ts` additions) or test scaffolds. No stub data flows to UI rendering.

## Threat Flags

None — this plan creates only type contracts and test files. No new network endpoints, auth paths, file access patterns, or schema changes are introduced.

## Next Phase Readiness

- All Phase 5 type contracts are exported and available for import by implementation plans
- 7 RED test suites provide automated verification targets for plans 05-01..05-05
- Implementation seam ownership documented above — each downstream plan knows exactly which test file turns GREEN after it ships
- No blockers for Phase 5 plan execution

## Self-Check: PASSED

All created files confirmed on disk. All 4 task commits confirmed in git history (f5c5f75, 30f5750, 2cbbc91, fc7ab30).

---
*Phase: 05-admin-ops-observability*
*Completed: 2026-05-02*
