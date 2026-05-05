---
status: partial
phase: 05-admin-ops-observability
source: [05-VERIFICATION.md]
started: 2026-05-02T22:30:00Z
updated: 2026-05-02T22:30:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Admin panel end-to-end smoke
expected: AdminLogin form appears immediately; invalid creds show 'Invalid username or password' with password cleared; valid creds store JWT, show amber ADMIN MODE banner, and render Tables/Users/Economy/Audit Log tabs with live data from adminState snapshot.
result: [pending]

### 2. Live kick/ban with concurrent player session
expected: Player socket receives replacedBySession, disconnect occurs, table manager removes them, chips are refunded. Admin Audit Log tab shows kick entry.
result: [pending]

### 3. grantBalance atomic guard
expected: Positive delta increments unconditionally; negative delta only succeeds when balance >= |delta|. AdminAuditLog row written for each.
result: [pending]

### 4. Sentry/PostHog graceful no-op
expected: Neither '[Boot] Sentry initialized' nor '[Boot] PostHog initialized' appears in server logs when env vars are absent. track() calls produce no errors.
result: [pending]

### 5. Vite bundle isolation
expected: client/dist/assets/AdminApp-*.js exists as a separate file; grepping client/dist/assets/index-*.js for 'ADMIN MODE' or 'adminJwt' finds nothing.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
