---
phase: 5
slug: admin-ops-observability
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-02
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts / none — Wave 0 installs if needed |
| **Quick run command** | `npm run typecheck` |
| **Full suite command** | `npm run build && cd client && npm run build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run typecheck`
- **After every plan wave:** Run `npm run build && cd client && npm run build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 5-01-01 | 01 | 0 | ADMIN-01 | T-5-01 | JWT validated before /admin namespace access | unit | `npm run typecheck` | ❌ W0 | ⬜ pending |
| 5-01-02 | 01 | 1 | ADMIN-02 | T-5-02 | POST /api/admin/login rejects wrong credentials with 401 | integration | `npm run typecheck` | ❌ W0 | ⬜ pending |
| 5-02-01 | 02 | 1 | ADMIN-03 | — | Admin route lazy-loads, no admin code in main bundle | build | `cd client && npm run build` | ✅ | ⬜ pending |
| 5-02-02 | 02 | 2 | ADMIN-04 | — | Live dashboard receives adminState on connect | manual | N/A | N/A | ⬜ pending |
| 5-03-01 | 03 | 2 | ADMIN-05 | T-5-03 | Audit log written BEFORE mutation; aborts on log failure | unit | `npm run typecheck` | ❌ W0 | ⬜ pending |
| 5-03-02 | 03 | 2 | ADMIN-06 | — | Kick action calls replacedBySession + leaveTable + refund | manual | N/A | N/A | ⬜ pending |
| 5-04-01 | 04 | 1 | OBS-01 | SECURITY-04 | Sentry beforeSend strips telegramId/initData/sessionToken | unit | `npm run typecheck` | ❌ W0 | ⬜ pending |
| 5-04-02 | 04 | 1 | OBS-02 | SECURITY-04 | PostHog identity is sha256(telegramId), not raw id | unit | `npm run typecheck` | ❌ W0 | ⬜ pending |
| 5-04-03 | 04 | 2 | OBS-03 | — | track() becomes no-op when POSTHOG_API_KEY is absent | unit | `npm run typecheck` | ❌ W0 | ⬜ pending |
| 5-05-01 | 05 | 1 | COMPLIANCE-04 | — | joinTable emits TOS_REQUIRED when tosAcceptedAt IS NULL | unit | `npm run typecheck` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/middleware/adminAuth.ts` — JWT validation middleware stub
- [ ] `server/utils/scrubber.ts` — PII scrubber utility stub
- [ ] `server/utils/analytics.ts` — server-side track() stub
- [ ] `client/src/utils/analytics.ts` — client-side track() stub
- [ ] `types/index.ts` additions: `TrackableEvent` union, `TOS_REQUIRED` typed error

*Existing infrastructure (TypeScript build, Vite) covers structural verification. No new test framework install needed for Wave 0.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live admin dashboard updates on table state change | ADMIN-04 | Requires live Socket.io session | Open /admin, mutate a table, confirm dashboard updates without refresh |
| Replay privacy masking hides PII in Sentry Replay | OBS-01 | Requires Sentry Replay session recording | Trigger a session, verify no text inputs/PII in replay footage |
| Admin kick evicts player from live game | ADMIN-05 | Requires two concurrent sessions | Seat player, kick from admin panel, confirm player sees eviction screen |
| PostHog event appears in PostHog dashboard | OBS-02 | Requires live PostHog project | Trigger table_joined, confirm event in PostHog |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
