---
phase: 01-foundations-design-system
plan: "05"
subsystem: auth
tags: [security, auth, hardening, fail-closed]
dependency_graph:
  requires: []
  provides: [assertSafeBootOrExit, validateInitData-null-return, timingSafeEqual-hmac]
  affects: [server/index.ts, server/middleware/auth.ts]
tech_stack:
  added: []
  patterns: [fail-closed boot guard, timingSafeEqual HMAC comparison, WeakSet dev-bypass tracking]
key_files:
  created:
    - scripts/test-boot-matrix.mjs
  modified:
    - server/middleware/auth.ts
    - server/index.ts
decisions:
  - WeakSet used to track synthetic dev-bypass payloads by object identity, avoiding any hash=== string comparison that would fail the plan's verification regex and more importantly avoid a class of confusion between sentinel values and real HMAC output
  - BOT_TOKEN emptiness checked before ALLOW_DEV_AUTH in assertSafeBootOrExit so the more critical misconfiguration (missing token) is surfaced first when both conditions hold
  - dist/ not committed (gitignored); boot-matrix test uses spawnSync against compiled output
metrics:
  duration_minutes: 25
  completed_date: "2026-04-15"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 3
requirements: [SECURITY-01, SECURITY-02, SECURITY-03]
---

# Phase 01 Plan 05: Auth Hardening — Fail-Closed Summary

**One-liner:** Fail-closed production boot guard (`assertSafeBootOrExit`) + constant-time HMAC via `crypto.timingSafeEqual` + removal of all `createDevUser` fabrication fallbacks.

## What Was Built

### Task 1 — Rewrite auth.ts

`server/middleware/auth.ts` was rewritten in full:

- `DEV_BYPASS_ACTIVE = ALLOW_DEV_AUTH === 'true' && NODE_ENV !== 'production'` — both env vars must cooperate; neither alone is sufficient.
- `assertSafeBootOrExit()` — new export; checks `IS_PROD` and exits(1) with a single `FATAL: refusing to start — <reason>` stderr line before returning to caller. BOT_TOKEN emptiness is checked first; ALLOW_DEV_AUTH second.
- `validateInitData` — return type changed from `{ valid, data }` to `WebAppInitData | null`. HMAC comparison uses `crypto.timingSafeEqual` over UTF-8 Buffer-encoded hex strings, with a length guard before the call. Entire body wrapped in try/catch → `null`. Log lines state failure class only; raw initData never logged.
- `createUserFromInitData` — all `IS_DEV && createDevUser(...)` branches removed. Dev path gated on `DEV_BYPASS_ACTIVE && devBypassPayloads.has(data)` (WeakSet identity check). DB rejection propagates — no fallback.

### Task 2 — Wire boot guard in index.ts; verify .env.example

- `assertSafeBootOrExit` added to the import from `./middleware/auth.js`.
- `assertSafeBootOrExit()` called as the first executable statement after imports, before `express()` / `new Server()` / `server.listen()`.
- Auth socket handler updated for the new null-return API (`validateInitData` result used directly rather than destructured `{ valid, data }`).
- `.env.example` already contained the `ALLOW_DEV_AUTH` documentation line from plan 01-02; no change needed.

### Task 3 — Boot-matrix smoke test

`scripts/test-boot-matrix.mjs` added and committed. Four cases exercised via `spawnSync` against `dist/server/middleware/auth.js`:

| Case | Env | Expected exit | Result |
|------|-----|---------------|--------|
| 1 | prod + ALLOW_DEV_AUTH=true + BOT_TOKEN=x | 1, ALLOW_DEV_AUTH msg | PASS |
| 2 | prod + ALLOW_DEV_AUTH=false + BOT_TOKEN='' | 1, BOT_TOKEN msg | PASS |
| 3 | prod + ALLOW_DEV_AUTH=false + BOT_TOKEN='   ' | 1, BOT_TOKEN msg | PASS |
| 4 | dev + ALLOW_DEV_AUTH=true + BOT_TOKEN='' | 0, no stderr | PASS |

## Commits

| Hash | Message |
|------|---------|
| `eb47715` | feat(01-05): harden auth — timingSafeEqual, fail-closed boot guard, no fabrication |
| `4047f72` | test(01-05): add boot-matrix smoke test for fail-closed auth |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Verification regex false-positive on sentinel hash comparison**

- **Found during:** Task 1 verification run
- **Issue:** Plan's verification script uses `/hash\s*===\s*/` to detect string-equality HMAC comparison. Original implementation stored a sentinel string in `WebAppInitData.hash` and compared it with `data.hash === 'dev-bypass'`, triggering the regex even though no HMAC comparison was occurring.
- **Fix:** Replaced sentinel-in-hash-field approach with a `WeakSet<WebAppInitData>` that tracks synthetic dev-bypass payloads by object identity. `createUserFromInitData` calls `devBypassPayloads.has(data)` — no string comparison on the hash field at all.
- **Files modified:** `server/middleware/auth.ts`
- **Commit:** `eb47715`

## Known Stubs

None — this plan contains no UI or data-rendering paths.

## Threat Flags

None — all changes are within the trust boundaries already enumerated in the plan's threat model (T-01-05-01 through T-01-05-07). No new network endpoints, auth paths, or schema changes introduced.

## Self-Check: PASSED

- `server/middleware/auth.ts` — exists and contains `assertSafeBootOrExit`, `timingSafeEqual`, `ALLOW_DEV_AUTH === 'true'`, `NODE_ENV === 'production'`, `FATAL: refusing to start`
- `server/index.ts` — contains `assertSafeBootOrExit()` call before `server.listen`
- `scripts/test-boot-matrix.mjs` — exists, 4/4 cases PASS
- `npx tsc --noEmit` — passes
- `git diff --name-status f6ee735 HEAD` — only `server/middleware/auth.ts`, `server/index.ts`, `scripts/test-boot-matrix.mjs` (no deletions)
