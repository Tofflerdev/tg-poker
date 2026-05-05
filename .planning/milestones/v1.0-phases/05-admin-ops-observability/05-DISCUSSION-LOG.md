# Phase 5: Admin, Ops & Observability - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-01
**Phase:** 05-admin-ops-observability
**Areas discussed:** Admin entry point

---

## Admin Entry Point

### Gray area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Admin entry point | How does an admin reach the admin panel? | ✓ |
| Observability SDK dev behavior | SDK no-op vs warn vs fail when DSN missing | |
| ToS gate scope | Block all NULL vs date-based grandfathering | |
| Admin live data push | Timer snapshots vs delta events vs on-demand poll | |

**User selected:** Admin entry point only. Remaining areas deferred to Claude's discretion.

---

## Admin Entry: URL Pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-detect + in-app button | Show admin entry in main menu if in ADMIN_TELEGRAM_IDS | |
| Hidden URL / hash route | Navigate to /#/admin or similar | ✓ |
| Dev-only: auto-open in dev mode | Feature-flag only | |

**User's choice:** Hidden URL / hash route

---

## Admin Entry: URL Specifics

| Option | Description | Selected |
|--------|-------------|----------|
| /#/admin hash route | Within existing React SPA hash router | |
| ?admin=1 query param | Query param in same-origin URL | |
| /admin/ dedicated path | Path-based route, server serves SPA | ✓ |

**User's choice:** A dedicated path like /admin/

---

## Admin Auth Model

**User's free-text response:** "Admin panel should not have any connection to Telegram. It's a separate web page, authentication via login password"

**Notes:** This overrides ADMIN-01/ADMIN-02 requirements which specified ADMIN_TELEGRAM_IDS + Telegram HMAC. The user wants a username/password login completely decoupled from Telegram identity.

---

## Admin Credentials Storage

| Option | Description | Selected |
|--------|-------------|----------|
| ADMIN_USER + ADMIN_PASS env vars | Hard-coded in .env, JWT issued on success | ✓ |
| Separate admin_users DB table | bcrypt hashes, multi-admin support | |
| Static credentials file | JSON/YAML read at startup | |

**User's choice:** Env vars: ADMIN_USER + ADMIN_PASS

---

## Admin App Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Separate path in same React SPA (/admin/*) | Lazy-loaded, one build | ✓ |
| Completely separate app (different HTML entry) | Second Vite entry, fully isolated | |

**User's choice:** Separate path in same React SPA

---

## Admin Session Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| JWT in localStorage, Bearer header | Stateless, no cookie complexity | ✓ |
| Session cookie (httpOnly) | More XSS-safe but CORS complexity | |

**User's choice:** JWT in localStorage, Bearer header

---

## Admin Transport

| Option | Description | Selected |
|--------|-------------|----------|
| Socket.io /admin namespace with JWT auth | Real-time pushes, JWT in handshake auth | ✓ |
| REST endpoints at /api/admin/* | Simpler CRUD but polling/SSE for live data | |

**User's choice:** Socket.io /admin namespace with JWT auth

---

## Claude's Discretion

- Observability SDK dev behavior: silent no-op if DSN/key missing
- ToS gate scope: block all tosAcceptedAt IS NULL users (no date cutoff)
- Admin live data: server-push full snapshot on connect + delta events on changes
- JWT secret: JWT_SECRET env var; hard-fail in production if missing
- JWT expiry: 8 hours
- admin UI recharts + react-hook-form + zod (already in ADMIN-03 requirements)
- tosVersion value: "1.0"

## Deferred Ideas

- Multiple admin users / individual passwords — v1.1+
- Admin 2FA — v1.1+
- Admin audit log full viewer — v1.1+
- ToS version-based re-acceptance — v1.1+
