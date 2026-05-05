# Phase 5: Admin, Ops & Observability - Context

**Gathered:** 2026-05-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship the hidden admin surface (dashboards + live controls with mandatory audit logging), wire Sentry + PostHog with PII scrubbing, and enforce the ToS gate server-side on `joinTable`.

**In scope:**
1. `/admin/*` React SPA route (lazy-loaded, not linked from player UI) with username/password login — `ADMIN_USER` + `ADMIN_PASS` env vars. Server issues JWT on successful login; JWT stored in `localStorage`.
2. Socket.io `/admin` namespace authenticated via JWT (namespace middleware validates token — replaces Telegram HMAC for the admin surface).
3. Admin dashboards: live tables, active users, economy (chips in play), recent errors.
4. Admin controls: enable/disable table, drain table, edit blinds/buy-in (next hand), kick user, ban user, grant/deduct balance — every mutation writes `AdminAuditLog` row BEFORE the mutation commits.
5. Sentry (`@sentry/react` + `@sentry/node`) with PII scrubber and Replay (privacy-masked).
6. PostHog (`posthog-js` client + `posthog-node` server) with anonymous identity `sha256(telegramId)` and fixed event taxonomy via a shared `track()` abstraction.
7. Server-side `joinTable` ToS gate: users with `tosAcceptedAt IS NULL` receive a typed error routed to the consent screen.

**Out of scope:**
- Deploy infrastructure (Dockerfile, nginx, HTTPS) — explicitly out of this cycle
- Multiple admin users / admin user management — single `ADMIN_USER` credential only
- Admin two-factor auth — single-credential JWT is sufficient for MVP
- PostHog dashboards / Sentry project setup (external service config) — just SDK init and event wiring
- Vitest coverage for admin UI — Phase 6

</domain>

<decisions>
## Implementation Decisions

### Admin Access Model (ADMIN-01, ADMIN-02 — revised)

- **D-01:** Admin panel lives at `/admin/*` path within the same React SPA. The route is lazy-loaded (no code in the main bundle) and has zero links from the player UI. Admins navigate directly to `/admin/` in the browser — this is the "hidden" mechanism.

- **D-02:** Authentication is **username/password, NOT Telegram `initData`**. This overrides the ADMIN-01/ADMIN-02 requirements which specified `ADMIN_TELEGRAM_IDS` + HMAC. The user decided the admin surface should have no dependency on Telegram auth. Credentials: `ADMIN_USER` (username) + `ADMIN_PASS` (password) in `.env`. A `POST /api/admin/login` Express endpoint validates credentials and issues a signed JWT.

- **D-03:** JWT is stored in `localStorage` and sent as a `Bearer` token in the Socket.io auth handshake (`{ auth: { token } }`). The `/admin` namespace middleware validates the JWT signature and rejects connections without a valid token.

- **D-04:** `AdminAuditLog.adminTelegramId` column stores the value of `ADMIN_USER` env var (the admin username string) — the column is a generic `String`, so storing the username is valid. Schema stays unchanged.

- **D-05:** Admin panel renders an **"ADMIN MODE" banner** (per ADMIN-03) as a permanent top bar, styled in Neon Strip. No admin affordance appears anywhere in the player-facing routes.

### Admin Dashboards & Controls (ADMIN-04, ADMIN-05, ADMIN-06)

- **D-06:** Admin dashboards receive live data via **server-push on the `/admin` namespace**: full `adminState` snapshot on connect, then targeted delta events on changes (e.g., `tableStateChanged`, `userBanned`, `balanceGranted`). No polling.

- **D-07:** `AdminAuditLog` write is **fire-and-fail**: the audit row is inserted BEFORE the mutation. If the insert throws, the mutation is aborted and an error is returned to the admin client. This implements ADMIN-06's "failed audit write aborts the mutation" requirement.

- **D-08:** Admin "kick user" action reuses the Phase 4 socket eviction primitive: find the player's socket via `tableManager.socketByTelegram(telegramId)`, emit `replacedBySession` (bare event), call `socket.disconnect(true)`, and also call `tableManager.leaveTable(telegramId)` + `UserRepository.refundCurrentChips`. One path, already tested.

### Observability (OBS-01..04, SECURITY-04)

- **D-09:** **Graceful no-op if DSN/key is missing**: `SENTRY_DSN` and `POSTHOG_API_KEY` env vars are optional. If absent (common in dev), the SDK init is skipped silently and `track()` calls become no-ops. No hard-fail on missing observability config — never block the game for telemetry.

- **D-10:** PII scrubber (`beforeSend` in Sentry, `sanitize` in PostHog) strips: `initData`, `sessionToken`, raw `telegramId` (the 9-digit number), and any field matching `/telegram_id|initdata|session_?token/i`. The scrubber is a shared utility in `server/utils/scrubber.ts` reused by both SDKs.

- **D-11:** `track()` abstraction lives in `server/utils/analytics.ts` (server) and `client/src/utils/analytics.ts` (client). Both export the same function signature: `track(event: TrackableEvent, properties?: Record<string, unknown>): void`. The event taxonomy is a shared `TrackableEvent` union type in `types/index.ts`.

- **D-12:** PostHog identity is `sha256(telegramId)` — computed server-side only. Raw `telegramId` is never sent to PostHog from the client. Client-side PostHog calls use the hashed identity injected into the initial auth response (added to the `authSuccess` payload: `{ ..., analyticsId: sha256(telegramId) }`).

### ToS Gate (COMPLIANCE-04)

- **D-13:** Server-side `joinTable` handler checks `tosAcceptedAt IS NULL` before processing. If NULL → emit typed error `{ type: 'TOS_REQUIRED' }` to the client. Client-side handler for this error type routes to the `Consent` page (already implemented in Phase 2).

- **D-14:** **Block ALL users with `tosAcceptedAt IS NULL`** — no createdAt date cutoff. Rationale: the app has not shipped to production; all existing users are dev/test users. Simplest implementation; no `TOS_GATE_DATE` constant to maintain.

- **D-15:** `tosVersion` value on acceptance is the string `"1.0"`. Future ToS revisions increment this. The `joinTable` gate checks `tosAcceptedAt IS NULL` only (not the version) — version gating is a v1.1+ concern.

### Claude's Discretion

- Admin login form UX: standard username/password form, minimal Neon Strip styling (dark background, cyan-bordered inputs), submit button in `active` variant
- JWT secret: `JWT_SECRET` env var (fail-closed: hard-fail on boot if missing in production, log warning in dev)
- JWT expiry: 8 hours (admin sessions are expected to be short-lived)
- `recharts` + `react-hook-form` + `zod` as specified in ADMIN-03 for admin UI dependencies
- Admin dashboard data: live player count, seated vs standing, total chips in play, last 10 `AdminAuditLog` entries
- PostHog Replay: disabled for admin interface (only enabled on player app to capture reconnect-bug flows)
- `track()` event taxonomy type definitions in `types/index.ts` as `TrackableEvent` string union

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §ADMIN — ADMIN-01..06 (note: auth model revised by D-02, use D-01..D-05 above)
- `.planning/REQUIREMENTS.md` §OBS — OBS-01..04
- `.planning/REQUIREMENTS.md` §COMPLIANCE — COMPLIANCE-04 specifically
- `.planning/REQUIREMENTS.md` §SECURITY — SECURITY-04 (PII scrubber)

### Schema & Existing Code
- `prisma/schema.prisma` — `AdminAuditLog` model (fields: `adminTelegramId`, `action`, `targetType`, `targetId`, `beforeJson`, `afterJson`)
- `prisma/schema.prisma` — `User` model fields: `bannedAt`, `tosAcceptedAt`, `tosVersion`
- `server/index.ts` — `joinTable` handler (lines ~518–580, where ToS gate insertion point lives)
- `server/db/UserRepository.ts` — `refundCurrentChips` + `tryDecrementBalance` atomic helpers (D-08 kick path)
- `server/GraceRegistry.ts` — grace timer state machine (used by kick path)
- `client/src/pages/Consent.tsx` — existing ToS consent UI (client already handles routing to it)
- `client/src/App.tsx` — existing route structure + `lazy()` pattern for adding `/admin/*` route
- `types/index.ts` — shared event types (add `TrackableEvent` union and `TOS_REQUIRED` error here)

### Phase Context
- `.planning/phases/04-resilience/04-CONTEXT.md` — D-A3 (`replacedBySession` bare event), D-B3 (leaveTable + refund path) — admin kick reuses these
- `.planning/phases/02-design-system-rollout-avatars/02-CONTEXT.md` — D-05 (Button variant API) — admin UI uses same primitives

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `client/src/components/ui/Button.tsx` — Neon Strip button variants (active, neutral, fold etc.) — admin login form and controls use these
- `client/src/styles/neon.css` + Tailwind theme — all admin UI consumes these tokens; no new style system
- `server/db/UserRepository.ts` — `refundCurrentChips`, `tryDecrementBalance` — admin kick/ban/balance-grant paths call these directly
- `server/GraceRegistry.ts` — `clear(telegramId)` — called on admin kick to cancel any pending grace timer
- `server/middleware/auth.ts` — HMAC validation pattern — admin JWT middleware follows the same fail-closed pattern

### Established Patterns
- Socket.io namespace auth: `socket.handshake.auth.token` is the standard pattern for token-based namespace auth — mirrors how `initData` is passed in `socket.handshake.auth`
- Lazy loading: `client/src/App.tsx` already uses `React.lazy()` for `DevToolbar` — same pattern for admin subtree
- Atomic DB helpers: `UserRepository` pattern of returning `count` from `updateMany` for idempotency (Phase 4) — audit log uses same pattern

### Integration Points
- `server/index.ts` `joinTable` handler (~line 518): insert `if (!user.tosAcceptedAt)` check before balance check
- `server/index.ts` boot block: add `POST /api/admin/login` Express route before Socket.io setup
- `client/src/App.tsx`: add `Route path="/admin/*"` with `Suspense` + `lazy(() => import('./pages/admin/AdminApp'))`
- `types/index.ts`: add `TrackableEvent` type + `{ type: 'TOS_REQUIRED' }` typed server error

</code_context>

<specifics>
## Specific Ideas

- Admin panel is a separate `/admin/` path — admin must know the URL; no link from player UI
- Credentials: `ADMIN_USER` + `ADMIN_PASS` env vars only (single admin user; no DB admin table)
- JWT in `localStorage`, Bearer token in Socket.io auth handshake
- Socket.io `/admin` namespace (JWT-authenticated) for all live admin communication
- `adminTelegramId` column in `AdminAuditLog` stores the `ADMIN_USER` string value (not a Telegram ID)
- All users with `tosAcceptedAt IS NULL` are gated — no date-based grandfathering

</specifics>

<deferred>
## Deferred Ideas

- Multiple admin users with individual passwords — v1.1+
- Admin 2FA — v1.1+
- PostHog custom dashboards / Sentry alert rules — external service config, out of scope
- Admin audit log viewer in the admin UI (beyond the last-10 recent entries) — v1.1+
- ToS version-based re-acceptance gate (e.g., force re-accept on `tosVersion !== '1.0'`) — v1.1+
- Street-by-street hand replayer accessible from admin — v1.1+

</deferred>

---

*Phase: 05-admin-ops-observability*
*Context gathered: 2026-05-01*
