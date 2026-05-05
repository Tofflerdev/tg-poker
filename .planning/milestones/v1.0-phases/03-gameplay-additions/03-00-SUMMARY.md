---
phase: 03-gameplay-additions
plan: "00"
subsystem: test-infrastructure
tags: [vitest, rtl, testing, infrastructure]
dependency_graph:
  requires: []
  provides: [vitest-server-runner, vitest-client-runner, test-setup-files]
  affects: [03-01, 03-02, 03-03, 03-04, 03-05]
tech_stack:
  added: [vitest@1.6.1, "@vitest/coverage-v8@1.6.1", "@testing-library/react@14.3.1", "@testing-library/jest-dom@6.x", "@testing-library/user-event@14.x", jsdom@24.1.3]
  patterns: [vitest-node-env, vitest-jsdom-env, RTL-render, matchMedia-mock]
key_files:
  created:
    - vitest.config.server.ts
    - client/vitest.config.ts
    - server/__tests__/setup.ts
    - client/src/test/setup.ts
    - tests/smoke.test.ts
    - client/src/test/smoke.test.tsx
  modified:
    - package.json
    - client/package.json
decisions:
  - "Used vitest@^1 (not v2) per plan spec to match VALIDATION.md Wave 0 requirements"
  - "Server config uses resolve.conditions: ['node'] to avoid NodeNext module resolution edge cases"
  - "Client setup file mocks window.matchMedia for motion/react useReducedMotion compatibility in jsdom"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-20"
  tasks_completed: 3
  tasks_total: 3
  files_created: 6
  files_modified: 2
---

# Phase 03 Plan 00: Test Infrastructure Setup Summary

Vitest test infrastructure installed and verified for both server (Node env) and client (jsdom env). Both smoke tests pass from a clean state, unblocking all Wave 1+ Phase 3 automated verify commands.

## What Was Done

### Task 1 — Install deps + npm scripts (commit 363f263)

Root devDependencies added: `vitest@1.6.1`, `@vitest/coverage-v8@1.6.1`.

Client devDependencies added: `vitest@1.6.1`, `@vitest/coverage-v8@1.6.1`, `@testing-library/react@14.3.1`, `@testing-library/jest-dom@6.x`, `@testing-library/user-event@14.x`, `jsdom@24.1.3`.

Root `package.json` test scripts added (pre-existing `build`, `dev`, `dev:all` unchanged):
```json
"test":          "vitest run --config vitest.config.server.ts && cd client && vitest run",
"test:server":   "vitest run --config vitest.config.server.ts",
"test:client":   "cd client && vitest run",
"test:watch":    "vitest --config vitest.config.server.ts",
"test:coverage": "vitest run --config vitest.config.server.ts --coverage && cd client && vitest run --coverage"
```

### Task 2 — Vitest configs + setup files (commit ca96050)

**`vitest.config.server.ts`** (repo root):
- `environment: 'node'`
- `include: ['server/**/__tests__/**/*.test.ts', 'tests/**/*.test.ts']`
- `setupFiles: ['./server/__tests__/setup.ts']`
- `resolve.conditions: ['node']` — guards against NodeNext resolution issues

**`client/vitest.config.ts`**:
- `environment: 'jsdom'`
- `include: ['src/**/__tests__/**/*.test.{ts,tsx}', 'src/test/**/*.test.{ts,tsx}']`
- `setupFiles: ['./src/test/setup.ts']`
- React plugin for JSX transform

**`server/__tests__/setup.ts`**: Empty placeholder; Plan 03-02 adds Prisma mocks here.

**`client/src/test/setup.ts`**: Imports `@testing-library/jest-dom/vitest` and mocks `window.matchMedia` so `motion/react`'s `useReducedMotion` does not crash in jsdom environment.

### Task 3 — Smoke tests + runner verification (commit efb2f02)

**`tests/smoke.test.ts`** — 2 server-side assertions:
- `1 + 1 === 2`
- `typeof describe === 'function'` (proves globals enabled)

**`client/src/test/smoke.test.tsx`** — 2 client-side assertions:
- RTL `render(<div>hello vitest</div>)` → `getByText` finds element (proves jsdom + RTL wired)
- `window.matchMedia(...)` does not throw (proves setup file loaded)

**Verification output:**
```
Server: 2 passed (1.30s)
Client: 2 passed (13.02s)
```

## Test File Location Guide (for later plans)

| Plan | Test file location |
|------|--------------------|
| 03-01 (ActionBubble server) | `server/__tests__/actionBubble.test.ts` |
| 03-02 (HandHistoryQueue) | `server/__tests__/HandHistoryQueue.test.ts` |
| 03-03 (Client bubble renderer) | `client/src/components/__tests__/ActionBubble.test.tsx` |
| 03-04 (motion) | `client/src/components/__tests__/ActionBubbleMotion.test.tsx` |
| 03-05 (HandHistoryList UI) | `client/src/components/__tests__/HandHistoryList.test.tsx` |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None. No new network endpoints, auth paths, or schema changes introduced. All additions are devDependencies only (no production runtime exposure).

## Self-Check: PASSED

- `vitest.config.server.ts` — FOUND
- `client/vitest.config.ts` — FOUND
- `server/__tests__/setup.ts` — FOUND
- `client/src/test/setup.ts` — FOUND
- `tests/smoke.test.ts` — FOUND
- `client/src/test/smoke.test.tsx` — FOUND
- Commit 363f263 — FOUND (chore: install deps)
- Commit ca96050 — FOUND (chore: configs + setup)
- Commit efb2f02 — FOUND (test: smoke tests)
