---
phase: 05
plan: 03
subsystem: admin-auth
tags: [jwt, admin, auth, express, cors, boot-guard]
dependency_graph:
  requires: [05-00]
  provides: [adminAuth-surface, admin-login-endpoint, jwt-secret-boot-guard]
  affects: [server/admin/adminAuth.ts, server/middleware/auth.ts, server/index.ts]
tech_stack:
  added: [jsonwebtoken@9.0.3, cors@2.8.5, "@types/jsonwebtoken@9.0.10", "@types/cors@2.8.19"]
  patterns: [HS256-jwt, timing-safe-credential-compare, ephemeral-dev-secret-fallback, fail-closed-boot-guard]
key_files:
  created:
    - server/admin/adminAuth.ts
  modified:
    - server/middleware/auth.ts
    - server/index.ts
    - .env.example
    - package.json
decisions:
  - "signAdminToken uses HS256 + 8h expiry; verifyAdminToken rejects any tampered/expired token"
  - "validateCredentials uses crypto.timingSafeEqual for equal-length comparisons (T-5-03-5); different-length returns false directly"
  - "Dev path: ephemeral process-local secret generated once at module load with single console.warn (never echoes value)"
  - "Prod path: assertSafeBootOrExit exits code 1 if JWT_SECRET is empty (T-5-03-1)"
  - "POST /api/admin/login returns generic 401 for all failure cases — no username-vs-password oracle (T-5-03-2)"
  - "express.json({ limit: '10kb' }) registered before all POST handlers (T-5-03-3, T-5-03-9)"
  - "cors() mirrors Socket.io CORS_ORIGIN list so admin SPA preflight succeeds in dev + prod (T-5-03-4)"
metrics:
  duration_seconds: 194
  completed_date: "2026-05-02"
  tasks_completed: 3
  files_changed: 5
---

# Phase 5 Plan 03: Admin Auth Backbone Summary

**One-liner:** JWT admin auth with HS256+8h expiry, timing-safe credential validation, Express login endpoint, and fail-closed JWT_SECRET boot guard.

## What Was Built

### server/admin/adminAuth.ts (new)

Three exported helpers forming the admin auth surface:

- **`signAdminToken(username)`** — signs a JWT with `{ username }` payload, `expiresIn: '8h'`, `algorithm: 'HS256'` using `JWT_SECRET` from env (lazy read).
- **`verifyAdminToken(token)`** — verifies with `{ algorithms: ['HS256'] }`, returns `{ username }` on success, throws on any failure (bad signature, expired, malformed).
- **`validateCredentials(username, password)`** — reads `ADMIN_USER` / `ADMIN_PASS` lazily; uses `crypto.timingSafeEqual` on equal-length buffers (T-5-03-5); returns false for empty inputs, missing env vars, or length mismatches.

**Dev fallback:** When `JWT_SECRET` is unset and `NODE_ENV !== 'production'`, the module falls back to a `crypto.randomBytes(32)` ephemeral secret generated once at module load, with a single `console.warn`. Tokens do not survive restarts in dev — acceptable for development workflow.

**Lazy env reads:** All three functions read `process.env.*` inside the function body (not at module load), so Vitest's `vi.resetModules()` + fresh `process.env` values in `beforeEach` pick up the new values correctly.

### server/middleware/auth.ts (extended)

`assertSafeBootOrExit()` extended with a third check inside the `IS_PROD` block:

```typescript
const JWT_SECRET = (process.env.JWT_SECRET ?? '').trim();
if (JWT_SECRET === '') {
  process.stderr.write('FATAL: refusing to start — JWT_SECRET is empty in production\n');
  process.exit(1);
}
```

Positioned after the existing `BOT_TOKEN` and `ALLOW_DEV_AUTH` checks. The boot guard prevents the server from starting in production without a stable JWT secret — so `adminAuth.ts`'s production throw path is never reached during normal operation.

### server/index.ts (extended)

Two new imports at top:
- `import cors from 'cors'`
- `import { validateCredentials, signAdminToken } from './admin/adminAuth.js'`

Three additions registered BEFORE `const io = new Server(...)` (in this order):

1. `app.use(express.json({ limit: '10kb' }))` — JSON body parser with 10KB cap (T-5-03-3, T-5-03-9)
2. `app.use(cors({ origin: CORS_ORIGIN, credentials: true }))` — Express CORS mirroring Socket.io CORS_ORIGIN (T-5-03-4)
3. `app.post('/api/admin/login', ...)` — credential validation → JWT issuance; generic 401 for all failures (T-5-03-2)

### .env.example (extended)

Documents three new env vars under `=== Admin Panel (Phase 5 / Plan 05-03) ===`:
- `JWT_SECRET` — required for prod, ephemeral fallback in dev; generation command included
- `ADMIN_USER` — single admin username (default: `admin`)
- `ADMIN_PASS` — admin password (default: `change-me-in-prod`)

## Tests

| Suite | Before | After |
|-------|--------|-------|
| adminAuth.test.ts | 3 RED (module not found) | 3/3 GREEN |
| All other server tests | 75 passing, 5 RED scaffold (05-04) | 75 passing, 5 RED scaffold (05-04) |

RED scaffolds for `adminNamespace.test.ts` and `adminMutations.test.ts` were pre-existing (Plan 05-00 wave-0 pattern); this plan introduced 0 new failures.

## Hand-off to Plan 05-04

`verifyAdminToken` is the symbol the `/admin` Socket.io namespace middleware will import. The namespace middleware needs to:
1. Extract `socket.handshake.auth.token`
2. Call `verifyAdminToken(token)` — throws on failure (reject connection)
3. Stamp `socket.data.adminUser = { username }` on success

`adminNamespace.test.ts` RED suite (3 tests) already exists from Plan 05-00 and will turn GREEN when `server/admin/adminNamespace.ts` is created in Plan 05-04.

## Requirements Closed

- **ADMIN-01** — admin identity model: single `ADMIN_USER` + `ADMIN_PASS` credential pair validated with `validateCredentials`; JWT issued via `signAdminToken`
- **ADMIN-02** (auth half) — `verifyAdminToken` ready for namespace middleware; endpoint (`POST /api/admin/login`) ships the token to the client

## Threat Mitigations Applied

| Threat | Mitigation |
|--------|-----------|
| T-5-03-1: Forged JWT | HS256 + JWT_SECRET; boot guard exits prod if secret missing |
| T-5-03-2: Username/password oracle | Single generic 401 for all failure cases |
| T-5-03-3: Missing body parser | express.json() before all POST handlers |
| T-5-03-4: CORS preflight blocked | cors() mirrors Socket.io CORS_ORIGIN |
| T-5-03-5: Timing attack | crypto.timingSafeEqual on equal-length buffers |
| T-5-03-7: JWT_SECRET in logs | Boot guard checks emptiness only; warn never echoes value |
| T-5-03-9: Large POST body | express.json({ limit: '10kb' }) |

T-5-03-6 (brute force) and T-5-03-8 (XSS token theft) accepted per plan threat register.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all shipped functionality is wired end-to-end.

## Threat Flags

None — no new network surface beyond what is specified in the plan's threat model.

## Self-Check: PASSED

- `server/admin/adminAuth.ts` exists: FOUND
- `server/middleware/auth.ts` contains JWT_SECRET guard: FOUND
- `server/index.ts` contains POST /api/admin/login: FOUND
- Commits fcc6f96, 3ef714b, 35072b2 all present in git log
