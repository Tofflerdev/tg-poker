---
phase: 06-test-hardening
plan: "05"
subsystem: testing
tags: [vitest, github-actions, ci, npm-scripts]

# Dependency graph
requires:
  - phase: 06-test-hardening
    provides: All 13 Phase 6 test files (06-00..06-04) and shared setup.ts
provides:
  - client/package.json convenience test/test:watch/test:coverage scripts
  - .github/workflows/ci.yml — GitHub Actions gate running build + test on push/PR to main
  - Human-verified end-to-end gate: npm test 63 server + 124 client = 187 total, exits 0
  - TEST-01 and TEST-04 requirements closed
affects: [future PRs, CI/CD pipeline, phase 6 sign-off]

# Tech tracking
tech-stack:
  added: [GitHub Actions (ubuntu-latest, Node 22.x), npm ci, prisma generate in CI]
  patterns:
    - CI workflow runs build (server tsc + Vite) BEFORE tests to catch type errors before test gate
    - Client-level npm test convenience script mirrors root invocation idiom

key-files:
  created:
    - .github/workflows/ci.yml
  modified:
    - client/package.json

key-decisions:
  - "ci.yml uses npm ci (not npm install) for deterministic installs — fast-fail on lockfile drift"
  - "prisma generate step placed before tsc build step so generated client exists during TypeScript compile"
  - "Node 22.x chosen to match local dev engine (STATE.md notes posthog-node prefers 22.22; 22.x satisfies)"
  - "CI triggers only on push/PR to main — feature branches don't burn CI minutes"
  - "No deploy steps in CI YAML — deploy infra is explicitly out of scope for this cycle"

patterns-established:
  - "CI gate pattern: install → generate → build-server → build-client → test (sequential, fail-fast)"
  - "client/package.json test scripts mirror root npm test: vitest run (no config needed — picks up client/vitest.config.ts by convention)"

requirements-completed: [TEST-01, TEST-04]

# Metrics
duration: continuation (tasks 1-2 prior session; task 3 human verify approved)
completed: 2026-05-05
---

# Phase 6 Plan 05: CI Gate & Client Test Scripts Summary

**GitHub Actions CI workflow (build + test on push/PR to main) and client npm test convenience scripts added; human-verified 187 total tests (63 server + 124 client) all passing with clean build**

## Performance

- **Duration:** Continuation plan — Tasks 1-2 committed prior session; Task 3 human-verify approved
- **Started:** 2026-05-05
- **Completed:** 2026-05-05
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint)
- **Files modified:** 2

## Accomplishments

- Added `test`, `test:watch`, and `test:coverage` scripts to `client/package.json` so `cd client && npm test` works as a convenience alias
- Created `.github/workflows/ci.yml` implementing the TEST-04 CI gate: install root deps, generate Prisma client, install client deps, build server (tsc), build client (Vite), run full test suite — all on push/PR to main
- Human verified the complete end-to-end gate: `npm test` exits 0 (63 server + 124 client = 187 tests), `npm run build` exits 0, `cd client && npm run build` exits 0

## Task Commits

Each task was committed atomically:

1. **Task 1: Add client/package.json test scripts** - `ae510ab` (chore)
2. **Task 2: Add GitHub Actions CI workflow** - `d6a72ea` (chore)
3. **Task 3: Human verification gate** - No code changes (human-verify checkpoint — APPROVED)

## Files Created/Modified

- `client/package.json` — Added `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:coverage": "vitest run --coverage"` to scripts block; all original keys preserved
- `.github/workflows/ci.yml` — Full CI pipeline: checkout, Node 22.x setup with lockfile cache, `npm ci` (root + client), `npx prisma generate`, `npm run build` (root tsc), `npm run build` (Vite in client/), `npm test` (root chains server + client suite)

## Decisions Made

- Used `npm ci` over `npm install` for deterministic installs in CI (fails fast if lockfiles drift)
- Placed `prisma generate` after root `npm ci` and before tsc build — generated client must exist before TypeScript compiles `server/db/`
- Cache key includes both `package-lock.json` and `client/package-lock.json` paths so either lockfile change invalidates CI cache
- CI only triggers on main branch push + PR to main — no minutes burned on arbitrary feature branches

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Requirements Closed

| Requirement | Description | Status |
|-------------|-------------|--------|
| TEST-01 | Vitest configured + runs from `npm test` with shared setup | CLOSED (06-00 + 06-05 human gate) |
| TEST-02 | Every interactive component has co-located `*.test.tsx` | CLOSED (06-00..06-03) |
| TEST-03 | Scenario test files cover join-table, fold/call/raise, avatar, ToS, deposit | CLOSED (06-04) |
| TEST-04 | GitHub Actions YAML runs build + test on push/PR; `npm test` is hard gate | CLOSED (this plan) |

## Human Verification Gate Results

- `npm test` exit code: 0
- Server suite: 63/63 passing
- Client suite: 124/124 passing
- Total: 187 tests
- `npm run build` (server tsc): succeeded
- `cd client && npm run build` (Vite production): succeeded

## User Setup Required

None — the GitHub Actions workflow triggers automatically on push/PR. No secrets, environment variables, or external service configuration required for CI to run the test suite.

## Next Phase Readiness

Phase 6 is complete. All four TEST-XX requirements are satisfied. The full suite (187 tests) is green, both server and client build cleanly, and the CI gate is wired.

Remaining project work:
- Supply 20 WebP avatar binaries (tracked blocker — no code changes required after drop)
- Continue Plan 02-03 (next page redesign) if desired

---
*Phase: 06-test-hardening*
*Completed: 2026-05-05*
