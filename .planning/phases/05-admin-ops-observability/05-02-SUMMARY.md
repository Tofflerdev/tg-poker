---
phase: 05
plan: 02
subsystem: observability
tags: [sentry, posthog, pii-scrubber, analytics, privacy]
dependency_graph:
  requires: [05-00]
  provides: [scrubber-utils, analytics-track, sentry-init, posthog-init, analyticsId-in-authSuccess]
  affects: [server/index.ts, client/src/index.tsx, client/src/App.tsx, types/index.ts]
tech_stack:
  added: ["@sentry/node@10.51.0", "posthog-node@5.33.0", "@sentry/react@10.51.0", "posthog-js@1.372.6"]
  patterns: [env-guard graceful no-op, sha256 identity, PII scrubber beforeSend, privacy-masked Replay]
key_files:
  created:
    - server/utils/scrubber.ts
    - server/utils/analytics.ts
    - client/src/utils/scrubber.ts
    - client/src/utils/analytics.ts
    - client/.env.example
  modified:
    - server/index.ts
    - client/src/index.tsx
    - client/src/App.tsx
    - types/index.ts
    - .env.example
    - client/src/vite-env.d.ts
decisions:
  - "client entry point is index.tsx not main.tsx — plan referenced main.tsx but actual file is index.tsx; all changes applied to index.tsx"
  - "posthog-node@5.33.0 engine warning (requires node>=22.22.0, running 22.19.0) — installed anyway, runtime is compatible"
  - "AdminLogin RED scaffold and admin module RED scaffolds remain failing as expected — they are owned by plans 05-03 to 05-05"
metrics:
  duration_seconds: 233
  completed_date: "2026-05-02"
  tasks_completed: 3
  files_changed: 12
---

# Phase 5 Plan 02: Observability Foundation Summary

**One-liner:** Sentry + PostHog initialized on server and client with env-guard no-ops, privacy-masked Replay, sha256 analyticsId injected into authSuccess, and PII scrubber wired as Sentry beforeSend on both sides.

## What Was Built

### 4 Utility Modules

**`server/utils/scrubber.ts`** — Pure PII redactor. Strips field names matching `/telegram_?id|initdata|session_?token/i` and 6-12 digit numeric runs in string values. Used as Sentry `beforeSend` on the server. No Node-specific imports — safe to copy to client.

**`server/utils/analytics.ts`** — Server analytics surface. `initAnalytics(client)` stores the PostHog instance. `track(analyticsId, event, properties?)` is a typed no-op if not initialized. `toAnalyticsId(telegramId)` returns sha256 hex. `shutdownAnalytics()` drains PostHog batches on exit.

**`client/src/utils/scrubber.ts`** — Identical implementation to server scrubber, duplicated because Vite cannot import across the server boundary. Wired to `@sentry/react` `beforeSend`.

**`client/src/utils/analytics.ts`** — Client analytics surface. `track(event, properties?)` calls `posthog.capture`. `identifyAnalytics(analyticsId)` calls `posthog.identify` once per session (guarded by `_identified` flag).

### Boot Integration

**`server/index.ts`:**
- Added `@sentry/node`, `posthog-node`, `scrubSentryEvent`, analytics imports
- Sentry.init block guarded by `process.env.SENTRY_DSN` — silent no-op if absent
- PostHog.init block guarded by `process.env.POSTHOG_API_KEY` — silent no-op if absent
- `authSuccess` emit extended: `{ ...user, analyticsId: toAnalyticsId(user.telegramId) }` — raw telegramId never leaves server for analytics
- SIGTERM extended + SIGINT added to drain both HandHistoryQueue and analytics

**`client/src/index.tsx`:**
- `Sentry.init` guarded by `import.meta.env.VITE_SENTRY_DSN` with `replayIntegration({ maskAllText: true, blockAllMedia: true })`, `replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 1.0`
- `posthog.init` guarded by `import.meta.env.VITE_POSTHOG_API_KEY` with `person_profiles: 'never'`, `autocapture: false`

### analyticsId Identity Flow

`server/index.ts authSuccess emit` → `analyticsId: toAnalyticsId(user.telegramId)` → `client/src/App.tsx authSuccess listener` → `identifyAnalytics(userData.analyticsId)` → `posthog.identify(analyticsId)`. Raw telegramId never reaches PostHog.

### Env Documentation

- `.env.example` — documents `SENTRY_DSN`, `POSTHOG_API_KEY`, `POSTHOG_HOST` as optional with commented-out examples
- `client/.env.example` — documents `VITE_SENTRY_DSN`, `VITE_POSTHOG_API_KEY`, `VITE_POSTHOG_HOST` (Vite prefix required)
- `client/src/vite-env.d.ts` — `ImportMetaEnv` interface extended with the three new `VITE_` vars

### Types

`types/index.ts` — `TelegramUser.analyticsId?: string` added as additive optional field.

## Test Results

- `server/__tests__/scrubber.test.ts` — 4/4 GREEN (RED scaffold from 05-00 → GREEN)
- `server/__tests__/analytics.test.ts` — 2/2 GREEN (RED scaffold from 05-00 → GREEN)
- All 63 prior server tests + 3 tosGate tests — GREEN (72 passing total, 8 pre-existing RED admin scaffolds remain as expected)
- All 57 client tests — GREEN (1 pre-existing RED AdminLogin scaffold remains as expected)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Applied changes to index.tsx not main.tsx**
- **Found during:** Task 3
- **Issue:** Plan referenced `client/src/main.tsx` as the client entry point, but actual entry point is `client/src/index.tsx`
- **Fix:** Applied all Sentry/PostHog boot init to `client/src/index.tsx` instead
- **Files modified:** `client/src/index.tsx`
- **Commit:** 1081652

## Known Stubs

None — all modules wire to real PostHog/Sentry instances when env vars are present; no-ops when absent is intentional by design, not a stub.

## Threat Flags

No new threat surface introduced beyond what is documented in the plan's threat model. The four mitigations (T-5-02-1 through T-5-02-4) are all implemented.

## Self-Check: PASSED

Files verified:
- `server/utils/scrubber.ts` — FOUND
- `server/utils/analytics.ts` — FOUND
- `client/src/utils/scrubber.ts` — FOUND
- `client/src/utils/analytics.ts` — FOUND
- `client/.env.example` — FOUND
- `.env.example` contains `SENTRY_DSN` — FOUND
- `types/index.ts` contains `analyticsId?: string` — FOUND

Commits verified:
- `007d3d6` — feat(05-02): install server deps + add scrubber and analytics modules
- `1231c93` — feat(05-02): wire Sentry+PostHog into server boot; emit analyticsId in authSuccess
- `1081652` — feat(05-02): install client deps + client scrubber/analytics; init Sentry+PostHog in index.tsx
