# Phase 5: Admin, Ops & Observability — Research

**Researched:** 2026-05-02
**Domain:** Admin SPA (JWT + Socket.io namespace), Sentry SDK, PostHog SDK, PII scrubbing, ToS gate
**Confidence:** HIGH (all critical claims verified against npm registry and official docs or official GitHub)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Admin panel lives at `/admin/*` path within the same React SPA. Lazy-loaded, zero links from player UI. Admins navigate directly to `/admin/`.
- **D-02:** Authentication is username/password (NOT Telegram `initData`). `ADMIN_USER` + `ADMIN_PASS` env vars. `POST /api/admin/login` issues a signed JWT.
- **D-03:** JWT stored in `localStorage`, sent as `Bearer` token in Socket.io auth handshake `{ auth: { token } }`. `/admin` namespace middleware validates JWT and rejects without valid token.
- **D-04:** `AdminAuditLog.adminTelegramId` stores the value of `ADMIN_USER` env var (the admin username string). Schema unchanged.
- **D-05:** Admin panel renders a permanent "ADMIN MODE" banner (ADMIN-03). No admin affordance in player-facing routes.
- **D-06:** Admin dashboards receive live data via server-push on the `/admin` namespace: full `adminState` snapshot on connect, then targeted delta events. No polling.
- **D-07:** `AdminAuditLog` write is fire-and-fail: audit row inserted BEFORE mutation. If insert throws, mutation is aborted and error returned to admin client.
- **D-08:** Admin kick reuses Phase 4 `replacedBySession` primitive: `tableManager.socketByTelegram(telegramId)`, emit `replacedBySession`, `socket.disconnect(true)`, `tableManager.leaveTable(telegramId)`, `UserRepository.refundCurrentChips`. One path.
- **D-09:** Graceful no-op if DSN/key is missing: `SENTRY_DSN` and `POSTHOG_API_KEY` env vars are optional. SDK init skipped silently if absent.
- **D-10:** PII scrubber strips `initData`, `sessionToken`, raw `telegramId` (the 9-digit number), and any field matching `/telegram_id|initdata|session_?token/i`. Shared utility in `server/utils/scrubber.ts`.
- **D-11:** `track()` abstraction: `server/utils/analytics.ts` (server) and `client/src/utils/analytics.ts` (client). Both export `track(event: TrackableEvent, properties?: Record<string, unknown>): void`. Event taxonomy is `TrackableEvent` union type in `types/index.ts`.
- **D-12:** PostHog identity is `sha256(telegramId)` computed server-side. Raw `telegramId` never sent to PostHog from client. Client-side PostHog calls use `analyticsId` injected into `authSuccess` payload.
- **D-13:** `joinTable` handler checks `tosAcceptedAt IS NULL` before processing. If NULL → emit `{ type: 'TOS_REQUIRED' }`.
- **D-14:** Block ALL users with `tosAcceptedAt IS NULL` — no createdAt date cutoff.
- **D-15:** `tosVersion` value on acceptance is `"1.0"`. Gate checks `tosAcceptedAt IS NULL` only (not version).

### Claude's Discretion
- Admin login form UX: standard username/password form, minimal Neon Strip styling
- JWT secret: `JWT_SECRET` env var (fail-closed: hard-fail on boot if missing in production, log warning in dev)
- JWT expiry: 8 hours
- `recharts` + `react-hook-form` + `zod` as admin UI dependencies
- Admin dashboard data: live player count, seated vs standing, total chips in play, last 10 `AdminAuditLog` entries
- PostHog Replay: disabled for admin interface (only enabled on player app)
- `TrackableEvent` string union defined in `types/index.ts`

### Deferred Ideas (OUT OF SCOPE)
- Multiple admin users with individual passwords — v1.1+
- Admin 2FA — v1.1+
- PostHog custom dashboards / Sentry alert rules — external service config
- Admin audit log viewer beyond last-10 entries — v1.1+
- ToS version-based re-acceptance gate — v1.1+
- Street-by-street hand replayer — v1.1+
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADMIN-01 | Admin identified by env allowlist; no isAdmin DB flag; access denied by default | D-02 overrides: `ADMIN_USER`/`ADMIN_PASS` env vars; JWT auth pattern verified |
| ADMIN-02 | Admin on `io.of('/admin')` namespace with JWT middleware (D-02 override: was HMAC+allowlist) | Socket.io namespace auth pattern verified (jsonwebtoken library) |
| ADMIN-03 | Lazy-loaded admin subtree with "ADMIN MODE" banner; not linked from player UI | React.lazy() pattern confirmed in App.tsx; UI contract in 05-UI-SPEC.md |
| ADMIN-04 | Admin dashboards: active tables, active users, economy (chips in play), recent errors | adminState shape defined; server-push via /admin namespace confirmed |
| ADMIN-05 | Admin controls: enable/disable table, drain, edit blinds/buy-in, kick, ban, grant balance | All primitives verified in codebase; kick path via Phase 4 `replacedBySession` |
| ADMIN-06 | Every admin mutation writes AdminAuditLog BEFORE commit; failed write aborts mutation | Prisma `AdminAuditLog` model exists in schema; fire-and-fail pattern researched |
| OBS-01 | @sentry/react + @sentry/node with shared DSN, env/release tags, PII scrubber | `@sentry/node@10.51.0` + `@sentry/react@10.51.0` verified in npm registry |
| OBS-02 | Sentry Replay enabled (privacy-masked) | Sentry Replay API verified in @sentry/react |
| OBS-03 | PostHog client + server, anonymous identity `sha256(telegramId)` | `posthog-js@1.372.6` + `posthog-node@5.33.0` verified in npm registry |
| OBS-04 | `track()` abstraction with fixed event taxonomy (9 events) | Pattern designed; both utils files to be created |
| SECURITY-04 | PII scrubber strips initData, sessionToken, raw telegramId from Sentry/logs/analytics | scrubber.ts utility shared across both SDKs |
| COMPLIANCE-04 | `joinTable` handler rejects users with `tosAcceptedAt IS NULL` with typed error | joinTable handler ~line 518 of server/index.ts; `tosAcceptedAt` field exists in DB schema |
</phase_requirements>

---

## Summary

Phase 5 ships three distinct deliverables that share no code but all land in the same phase: (1) the hidden admin SPA with JWT auth and a live `/admin` Socket.io namespace, (2) Sentry + PostHog observability with PII scrubbing, and (3) the server-side ToS gate on `joinTable`. All foundational infrastructure is already in place from Phases 1–4: `AdminAuditLog` and `tosAcceptedAt` columns exist in the DB schema, the `replacedBySession` eviction primitive exists for the kick path, `React.lazy()` is already used in App.tsx for the DevToolbar, and the existing auth middleware provides a pattern for JWT validation.

The most architecturally complex deliverable is the admin namespace. Key decisions: the admin `POST /api/admin/login` Express route must be registered BEFORE Socket.io setup to avoid routing conflicts; the `/admin` namespace middleware must verify the JWT on every connection (not just first connect); and the `adminState` snapshot shape must be defined carefully because every field becomes a live contract for the admin frontend. The fire-and-fail audit pattern (D-07) means every admin mutation function must be structured as: `await prisma.adminAuditLog.create(...)` first, then `await mutate(...)` — with any exception from the create propagating to the caller.

For observability, both Sentry and PostHog gracefully no-op when env vars are absent (D-09), which means `client/src/main.tsx` and `server/index.ts` must guard SDK init behind an env-var check. The `sha256(telegramId)` PostHog identity must be computed server-side only and injected into the `authSuccess` payload as `analyticsId` — client code must never access raw `telegramId` for PostHog identity.

**Primary recommendation:** Implement in wave order — (1) ToS gate (simplest, 5-line server change + 2-line client), (2) observability (isolated utils with no inter-dependencies), (3) admin namespace + REST login (most complex, requires careful ordering of Express routes + Socket.io namespace setup).

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| jsonwebtoken | 9.0.3 | JWT sign/verify for admin auth | Node.js JWT standard; `sign()` + `verify()` APIs are stable |
| @types/jsonwebtoken | 9.0.10 | TypeScript types for jsonwebtoken | Separate type package for ESM project |
| @sentry/node | 10.51.0 | Server-side error tracking | Official Sentry SDK for Node.js |
| @sentry/react | 10.51.0 | Client-side error tracking + Replay | Official Sentry SDK for React; co-versioned with @sentry/node |
| posthog-node | 5.33.0 | Server-side analytics | Official PostHog Node.js SDK |
| posthog-js | 1.372.6 | Client-side analytics + session recording | Official PostHog JavaScript SDK |
| recharts | 3.8.1 | Chart widgets in admin economy dashboard | Pre-approved by user; ships own types |
| react-hook-form | 7.75.0 | Admin login + control forms | Pre-approved by user; minimal re-renders |
| zod | 4.4.2 | Form validation schemas | Pre-approved by user; TypeScript-native |

[VERIFIED: npm registry — all versions confirmed 2026-05-02]

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/recharts | 2.0.1 | TypeScript types for recharts | Only if recharts 3.x doesn't ship own types; verify after install |

**Note on recharts v3:** recharts v3.x ships bundled TypeScript definitions; `@types/recharts` is for v2.x and lower. With recharts 3.8.1, do NOT install `@types/recharts` — it is for the old API and will conflict. [VERIFIED: recharts GitHub — v3 includes types natively]

**Note on zod v4:** zod 4.x is the current release. The import path is still `import { z } from 'zod'`. No breaking API changes for the validation patterns this phase uses (`z.string()`, `z.number().int()`, `z.object()`, `.refine()`). [VERIFIED: zod changelog]

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| jsonwebtoken | jose | jose is ESM-native and actively maintained; jsonwebtoken is more familiar and also works with NodeNext. Either is fine; jsonwebtoken has 0 deps for verify. |
| posthog-node | Segment | PostHog is decided; this row is informational only |
| recharts | Chart.js | recharts is decided; this row is informational only |

**Installation (server):**
```bash
npm install jsonwebtoken @types/jsonwebtoken @sentry/node posthog-node
```

**Installation (client):**
```bash
cd client && npm install @sentry/react posthog-js recharts react-hook-form zod
```

**Version verification:** All versions above confirmed against npm registry on 2026-05-02. `npm view <pkg> version` run for each package listed.

---

## Architecture Patterns

### Recommended Project Structure

New files this phase creates:

```
server/
├── utils/
│   ├── scrubber.ts          # PII scrubber (shared by Sentry + PostHog + logs)
│   └── analytics.ts         # server-side track() abstraction
├── admin/
│   ├── adminAuth.ts         # JWT sign/verify helpers + ADMIN_USER/ADMIN_PASS validation
│   ├── adminNamespace.ts    # io.of('/admin') setup + namespace middleware
│   └── adminState.ts        # adminState snapshot builder + delta event emitters

client/src/
├── utils/
│   └── analytics.ts         # client-side track() abstraction
├── pages/admin/
│   ├── AdminApp.tsx         # Root of lazy-loaded admin subtree (router + AdminBanner)
│   ├── AdminLogin.tsx       # /admin/login page
│   ├── AdminTables.tsx      # /admin/tables tab
│   ├── AdminUsers.tsx       # /admin/users tab
│   ├── AdminEconomy.tsx     # /admin/economy tab
│   └── AdminAudit.tsx       # /admin/audit tab

types/index.ts               # Add: TrackableEvent, AdminState, admin socket events, TOS_REQUIRED error
```

### Pattern 1: Socket.io Namespace with JWT Auth

**What:** Create a named namespace `io.of('/admin')`, attach middleware that extracts and verifies the Bearer JWT from `socket.handshake.auth.token`, and reject the connection on any failure.

**When to use:** Whenever admin socket access must be independently authenticated from the main namespace.

```typescript
// Source: Socket.io docs — https://socket.io/docs/v4/namespaces/#namespace-middleware
// server/admin/adminNamespace.ts
import { Server } from 'socket.io';
import { verifyAdminToken } from './adminAuth.js';

export function setupAdminNamespace(io: Server): void {
  const admin = io.of('/admin');

  admin.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error('UNAUTHORIZED'));
    }
    try {
      const payload = verifyAdminToken(token);
      socket.data.adminUser = payload.username;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  admin.on('connection', (socket) => {
    // send full snapshot on connect
    socket.emit('adminState', buildAdminState());
    // ...event handlers
  });
}
```

[VERIFIED: Socket.io v4 docs — namespace middleware signature confirmed]

### Pattern 2: Express REST Login Route (Must Register Before Socket.io)

**What:** `POST /api/admin/login` validates `ADMIN_USER`/`ADMIN_PASS` env vars and issues a JWT. The route must be registered after `app.use(express.json())` and before `server.listen()`.

**Critical ordering:** In the existing `server/index.ts`, Express routes are registered before Socket.io handlers. The `POST /api/admin/login` route follows the same position as the existing `app.get('/api/tables', ...)` route.

```typescript
// Source: training knowledge + verified against existing index.ts pattern [ASSUMED for exact positioning]
app.use(express.json()); // ensure JSON body parsing is active

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (
    !username || !password ||
    username !== process.env.ADMIN_USER ||
    password !== process.env.ADMIN_PASS
  ) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = signAdminToken(username); // 8h expiry
  res.json({ token });
});
```

**Note:** Check whether `express.json()` middleware is already registered in `server/index.ts`. The existing file serves `app.get('/')` with `res.json()` but does not currently receive POST bodies — `app.use(express.json())` must be added if absent. [VERIFIED: existing index.ts read — no `express.json()` call found; must be added]

### Pattern 3: JWT Sign/Verify with jsonwebtoken

```typescript
// Source: jsonwebtoken README — https://github.com/auth0/node-jsonwebtoken
// server/admin/adminAuth.ts
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

export function signAdminToken(username: string): string {
  if (!JWT_SECRET) throw new Error('JWT_SECRET not set');
  return jwt.sign({ username }, JWT_SECRET, { expiresIn: '8h' });
}

export function verifyAdminToken(token: string): { username: string } {
  if (!JWT_SECRET) throw new Error('JWT_SECRET not set');
  return jwt.verify(token, JWT_SECRET) as { username: string };
}
```

**Boot guard:** Per Claude's Discretion, `JWT_SECRET` must be present in production. The existing `assertSafeBootOrExit()` in `server/middleware/auth.ts` is the pattern to follow — add a parallel check there for `JWT_SECRET` when `NODE_ENV=production`. [ASSUMED — exact integration point in assertSafeBootOrExit]

### Pattern 4: Fire-and-Fail Audit Log Pattern

**What:** Every admin mutation must follow this exact ordering to satisfy D-07/ADMIN-06.

```typescript
// Pattern used for all admin mutations
async function adminKickUser(telegramId: string, adminUser: string): Promise<void> {
  // 1. Write audit log FIRST — if this throws, mutation is aborted
  await prisma.adminAuditLog.create({
    data: {
      adminTelegramId: adminUser,   // ADMIN_USER string (D-04)
      action: 'kick',
      targetType: 'user',
      targetId: telegramId,
      beforeJson: { /* snapshot before */ },
      afterJson: null,
    }
  });
  // 2. Only runs if audit write succeeded
  await performKick(telegramId);
}
```

**Critical:** Do NOT wrap in a `try/catch` that swallows the audit error. The audit write failure must propagate to the caller, which must return a failure response to the admin client.

### Pattern 5: Sentry Initialization with PII Scrubber

Server-side (`server/index.ts` boot block):

```typescript
// Source: @sentry/node docs — https://docs.sentry.io/platforms/javascript/guides/node/
import * as Sentry from '@sentry/node';
import { scrubSentryEvent } from './utils/scrubber.js';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.npm_package_version,
    beforeSend: (event) => scrubSentryEvent(event),
  });
}
```

Client-side (`client/src/main.tsx`):

```typescript
// Source: @sentry/react docs — https://docs.sentry.io/platforms/javascript/guides/react/
import * as Sentry from '@sentry/react';
import { scrubSentryEvent } from './utils/scrubber';

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    beforeSend: (event) => scrubSentryEvent(event),
  });
}
```

**Client env var naming:** Vite requires client env vars to be prefixed `VITE_`. So `SENTRY_DSN` (server) maps to `VITE_SENTRY_DSN` (client). Similarly, PostHog: `POSTHOG_API_KEY` (server) maps to `VITE_POSTHOG_API_KEY` (client). [VERIFIED: Vite docs — VITE_ prefix required for client exposure]

### Pattern 6: PostHog Initialization

Server-side:

```typescript
// Source: posthog-node README — https://github.com/PostHog/posthog-node
import { PostHog } from 'posthog-node';

let posthogClient: PostHog | null = null;

if (process.env.POSTHOG_API_KEY) {
  posthogClient = new PostHog(process.env.POSTHOG_API_KEY, {
    host: 'https://app.posthog.com',
  });
}

export function trackServer(
  analyticsId: string,
  event: string,
  properties?: Record<string, unknown>
): void {
  posthogClient?.capture({ distinctId: analyticsId, event, properties });
}
```

Client-side:

```typescript
// Source: posthog-js README — https://posthog.com/docs/libraries/js
import posthog from 'posthog-js';

if (import.meta.env.VITE_POSTHOG_API_KEY) {
  posthog.init(import.meta.env.VITE_POSTHOG_API_KEY, {
    api_host: 'https://app.posthog.com',
    person_profiles: 'never',   // anonymous mode — no profiles created
    autocapture: false,          // only manual track() calls
    capture_pageview: false,
  });
}
```

**PostHog identity wiring:** On `authSuccess`, the server adds `analyticsId: sha256(telegramId.toString())` to the payload. The client calls `posthog.identify(analyticsId)` once on successful auth, then all subsequent `posthog.capture()` calls use that identity automatically. [VERIFIED: posthog-js docs]

**sha256 on server:** Node.js built-in `crypto` module suffices — no new dependency.

```typescript
import crypto from 'crypto';
export const toAnalyticsId = (telegramId: number): string =>
  crypto.createHash('sha256').update(telegramId.toString()).digest('hex');
```

### Pattern 7: PII Scrubber Implementation

```typescript
// server/utils/scrubber.ts  (also imported by client via re-export or duplicated)
const PII_FIELD_RE = /telegram_id|initdata|session_?token/i;
const TELEGRAM_ID_RE = /\b\d{6,12}\b/g;  // 6-12 digit numbers (covers all Telegram IDs)

export function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => {
      if (PII_FIELD_RE.test(k)) return [k, '[REDACTED]'];
      if (typeof v === 'string') return [k, v.replace(TELEGRAM_ID_RE, '[REDACTED]')];
      if (v && typeof v === 'object') return [k, scrubObject(v as Record<string, unknown>)];
      return [k, v];
    })
  );
}

// For Sentry beforeSend
export function scrubSentryEvent(event: Record<string, unknown>): Record<string, unknown> {
  return scrubObject(event);
}
```

**Note on client import:** `server/utils/scrubber.ts` cannot be directly imported by the Vite client (cross-boundary import). The client needs its own copy at `client/src/utils/scrubber.ts`. The implementation is identical — it's a pure function with no Node.js dependencies. [VERIFIED: project structure — client and server are separate build targets]

### Pattern 8: React Lazy-Loading Admin Route

```typescript
// client/src/App.tsx — add after existing lazy imports
const AdminApp = lazy(() => import('./pages/admin/AdminApp'));

// Inside JSX router — add as new branch:
if (window.location.pathname.startsWith('/admin')) {
  return (
    <Suspense fallback={<div>Loading admin…</div>}>
      <AdminApp />
    </Suspense>
  );
}
```

**Alternative (React Router not used):** The existing codebase uses a custom `AppView` state machine (no React Router). The admin subtree is at a distinct URL prefix `/admin/*`. The simplest approach that matches the existing pattern: check `window.location.pathname.startsWith('/admin')` early in App's render (before the main socket connection logic) and short-circuit to the `AdminApp`. This avoids installing React Router for a single route. [VERIFIED: existing App.tsx read — custom view state machine, no router installed]

### Pattern 9: adminState Snapshot Shape

```typescript
// types/index.ts additions
export interface AdminTableInfo {
  id: string;
  name: string;
  config: TableConfig;
  status: 'enabled' | 'disabled' | 'draining';
  playerCount: number;
  handInProgress: boolean;
}

export interface AdminUserInfo {
  telegramId: string;
  displayName: string;
  chips: number;           // current chips if seated, 0 if standing
  tableId: string | null;
  seat: number | null;
  bannedAt: string | null;
}

export interface AdminState {
  tables: AdminTableInfo[];
  users: AdminUserInfo[];   // connected users only
  totalChipsInPlay: number;
  recentAuditLogs: AdminAuditLogEntry[];  // last 10
}

export interface AdminAuditLogEntry {
  id: string;
  adminTelegramId: string;  // stores ADMIN_USER string per D-04
  action: string;
  targetType: string;
  targetId: string;
  beforeJson: unknown;
  afterJson: unknown;
  createdAt: string;  // ISO
}
```

### Pattern 10: ToS Gate in joinTable

```typescript
// server/index.ts — insert BEFORE balance check (~line 528)
// Source: D-13, D-14, COMPLIANCE-04
socket.on('joinTable', async (payload) => {
  const telegramId = socket.data.telegramId;
  if (!telegramId) { /* existing auth check */ }

  const user = userStorage.getUser(telegramId);
  if (!user) { /* existing guard */ }

  // COMPLIANCE-04 / D-13 / D-14: gate ALL users with no ToS acceptance
  if (!user.tosAcceptedAt) {
    socket.emit('tableError', JSON.stringify({ type: 'TOS_REQUIRED' }));
    return;
  }

  // ... existing balance check and join logic
});
```

**Typed error routing:** `tableError` currently emits a plain string. The `{ type: 'TOS_REQUIRED' }` object must be serialized to JSON string OR a new typed event must be added. The cleanest approach: add a dedicated `serverError` event to `ExtendedServerEvents` that carries `{ type: string }` — this avoids breaking existing `tableError` string consumers. Alternatively, `JSON.stringify({ type: 'TOS_REQUIRED' })` can be parsed by the client. Check existing `tableError` consumers before deciding. [ASSUMED — exact event name; planner should verify existing tableError handler in App.tsx]

### Anti-Patterns to Avoid
- **Importing server utils into Vite client:** `server/utils/scrubber.ts` uses Node.js imports implicitly via TypeScript paths; the client must have its own copy.
- **Single JWT_SECRET across namespaces:** The JWT secret is admin-only; do not reuse it for any player-facing auth.
- **Polling for admin state:** D-06 is explicit — server-push only. No `setInterval` polling.
- **Audit log in same transaction as mutation:** D-07 specifies fire-and-fail, not a DB transaction. If both are in a Prisma `$transaction`, a rollback would undo the audit log — defeating its purpose.
- **Sending raw telegramId to PostHog:** sha256 must be computed before any PostHog call. The `track()` abstraction must receive `analyticsId` (already hashed), never the raw number.
- **Admin socket on main namespace:** The `/admin` namespace isolation is critical for security — admin events must not be accessible on the default `/` namespace.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT sign/verify | Custom HMAC token | `jsonwebtoken` | Handles expiry, algorithm safety, well-tested |
| Form validation | Manual if-chains | `zod` + `react-hook-form` | Type inference, `refine()` for cross-field rules, register pattern |
| Chart rendering | SVG path math | `recharts` | Responsive containers, tooltip, axis formatting |
| SHA-256 hashing | Manual crypto | Node.js built-in `crypto` | Already a dependency; `createHash('sha256')` is 2 lines |
| Sentry PII scrub | Custom regex on every log call | Centralized `beforeSend` hook | One scrubber path; impossible to accidentally leak in new code |

**Key insight:** All three third-party integrations (Sentry, PostHog, recharts) are purpose-built for exactly the use case here. The custom code in this phase is purely the wiring layer.

---

## Common Pitfalls

### Pitfall 1: `express.json()` Not Present for POST /api/admin/login
**What goes wrong:** `req.body` is `undefined`; username/password comparison always fails; every login attempt returns 401.
**Why it happens:** The existing `server/index.ts` only uses `app.get()` handlers — no POST body parsing middleware is registered.
**How to avoid:** Add `app.use(express.json())` at the top of the Express setup, before any route handlers.
**Warning signs:** `req.body` logs as `undefined` in console.

### Pitfall 2: CORS Not Configured for Admin POST Endpoint
**What goes wrong:** Browser blocks the `POST /api/admin/login` preflight.
**Why it happens:** The existing CORS config is for Socket.io. Express routes need their own CORS headers OR the Socket.io CORS config needs to also cover REST endpoints.
**How to avoid:** Use the `cors` npm package or manually set `Access-Control-Allow-Origin` headers on Express routes. In development, use the same origin list as Socket.io CORS.
**Warning signs:** Network tab shows a CORS preflight failure on the login POST.

### Pitfall 3: JWT_SECRET Undefined in Dev — Silent Auth Bypass
**What goes wrong:** If `JWT_SECRET` is not set in `.env`, `jwt.sign()` and `jwt.verify()` throw or produce `undefined` behavior depending on the library version.
**Why it happens:** Dev `.env` doesn't always mirror prod env vars.
**How to avoid:** Fail-closed: throw on boot if `JWT_SECRET` is missing (in prod). In dev, log a warning but generate a random ephemeral secret (`crypto.randomBytes(32).toString('hex')`) so the flow still works without persistent sessions.
**Warning signs:** Admin login appears to work but tokens signed in one process can't be verified by another.

### Pitfall 4: Sentry Replay Capturing Player PII via DOM
**What goes wrong:** Sentry Replay records DOM text, including chip counts, player names, and potentially Telegram display data.
**Why it happens:** Default Replay config captures all text.
**How to avoid:** Always initialize with `maskAllText: true` and `blockAllMedia: true` (already specified in Pattern 5). The `beforeSend` scrubber covers structured event data; Replay masking covers visual recording.
**Warning signs:** Sentry session replay shows readable text in the recording.

### Pitfall 5: Admin Namespace Events Typed Separately from Main Namespace
**What goes wrong:** TypeScript can't infer admin namespace event types from `ExtendedServerEvents` — they're on a different namespace.
**Why it happens:** Socket.io types in TypeScript are per-namespace; `io.of('/admin')` is a `Namespace` with its own generic parameters.
**How to avoid:** Define dedicated `AdminServerEvents` and `AdminClientEvents` interfaces in `types/index.ts`, then type the admin namespace as `io.of<AdminClientEvents, AdminServerEvents>('/admin')`.
**Warning signs:** TypeScript errors on admin socket emit/on calls, or `as any` casts appearing in admin namespace code.

### Pitfall 6: posthog-node Doesn't Flush on Process Exit
**What goes wrong:** Last analytics events before server shutdown are dropped.
**Why it happens:** `posthog-node` batches events; the process exits before the batch is sent.
**How to avoid:** Call `posthogClient.shutdown()` in the process `SIGTERM`/`SIGINT` handler. [VERIFIED: posthog-node README]
**Warning signs:** Analytics events near server restart times are missing.

### Pitfall 7: recharts ResponsiveContainer Needs a Sized Parent
**What goes wrong:** Chart renders at 0px height.
**Why it happens:** `ResponsiveContainer` reads the parent element's dimensions. If the parent has no explicit height (e.g., it's a flex child with no `flex: 1`), the chart collapses.
**How to avoid:** Wrap `ResponsiveContainer` in a `div` with an explicit height, or set `height` prop directly: `<ResponsiveContainer width="100%" height={200}>`.
**Warning signs:** Economy tab renders blank where the chart should be.

### Pitfall 8: ToS Gate Breaks Existing Dev Test Accounts
**What goes wrong:** After enabling the ToS gate, dev/test accounts created without `tosAcceptedAt` can no longer join tables.
**Why it happens:** D-14 gates ALL users with `tosAcceptedAt IS NULL` — no date cutoff.
**How to avoid:** This is expected behavior per D-14. Dev testers must accept ToS once via the existing Consent screen. Alternatively, dev testing can set `tosAcceptedAt` directly via Prisma Studio.
**Warning signs:** Every `joinTable` attempt in dev returns `TOS_REQUIRED`.

### Pitfall 9: Admin Socket on `/admin` Namespace — Client Must Connect Separately
**What goes wrong:** The admin React app tries to use the existing `socket` from `App.tsx` (which connects to the default namespace).
**Why it happens:** Developers unfamiliar with Socket.io namespaces assume one client = one namespace.
**How to avoid:** `AdminApp.tsx` creates its own socket: `const adminSocket = io('/admin', { auth: { token: localStorage.getItem('adminJwt') } })`. This is completely isolated from the player socket. [VERIFIED: Socket.io docs — namespace client connection pattern]
**Warning signs:** Admin events are never received; server logs show no `/admin` namespace connections.

---

## Code Examples

### Admin Socket.io Client Connection (from AdminApp)
```typescript
// Source: Socket.io docs — namespace client connection
// client/src/pages/admin/AdminApp.tsx
import { io, Socket } from 'socket.io-client';
import type { AdminServerEvents, AdminClientEvents } from '../../../../types/index';

const token = localStorage.getItem('adminJwt');
const adminSocket: Socket<AdminServerEvents, AdminClientEvents> = io('/admin', {
  auth: { token },
  autoConnect: true,
});
```

### TrackableEvent Union Type
```typescript
// types/index.ts addition
export type TrackableEvent =
  | 'user_signed_up'
  | 'daily_bonus_claimed'
  | 'table_joined'
  | 'table_left'
  | 'hand_completed'
  | 'reconnect_succeeded'
  | 'reconnect_failed'
  | 'admin_action'
  | 'error_shown';
```

### track() Abstraction (server)
```typescript
// server/utils/analytics.ts
import type { TrackableEvent } from '../../types/index.js';

let _posthog: import('posthog-node').PostHog | null = null;

export function initAnalytics(client: import('posthog-node').PostHog): void {
  _posthog = client;
}

export function track(
  analyticsId: string,
  event: TrackableEvent,
  properties?: Record<string, unknown>
): void {
  _posthog?.capture({ distinctId: analyticsId, event, properties });
}
```

### track() Abstraction (client)
```typescript
// client/src/utils/analytics.ts
import posthog from 'posthog-js';
import type { TrackableEvent } from '../../../../types/index';

export function track(
  event: TrackableEvent,
  properties?: Record<string, unknown>
): void {
  // posthog.capture is a no-op if posthog was not initialized (POSTHOG_API_KEY absent)
  posthog.capture(event, properties);
}
```

**Note:** The server `track()` takes `analyticsId` as the first argument (because server knows the hashed ID). The client `track()` does NOT take an identity argument (because PostHog JS SDK tracks the current identified user automatically after `posthog.identify()` is called). [VERIFIED: posthog-js docs — `capture()` uses current identity]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Sentry v7/v8 separate `@sentry/integrations` | Sentry v10 — integrations bundled in core packages | Sentry SDK v8+ | No separate `@sentry/integrations` install needed |
| recharts v2 needing `@types/recharts` | recharts v3 ships own TypeScript types | recharts v3.0 | Don't install `@types/recharts` |
| posthog-node v1/v2 `.capture()` direct | posthog-node v5 same `.capture()` API | v5 is current | No API change; new timeout/batch options available |
| zod v3 `z.object()` | zod v4 same API | zod v4.0 2025 | Same usage patterns; `.refine()` unchanged |

**Deprecated/outdated:**
- `@sentry/integrations` package: removed in Sentry SDK v8+; do not install.
- `@types/recharts`: for recharts v2 only; recharts v3 has own types.
- `posthog-js` `capture_pageview: true` (default in older versions): should be explicitly set to `false` for a Single Page App to avoid double-counting.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `express.json()` middleware is NOT currently registered in server/index.ts | Architecture Patterns §2, Common Pitfalls §1 | If already registered, adding it again is harmless (Express deduplicates) |
| A2 | JWT_SECRET boot-guard can be added inside existing `assertSafeBootOrExit()` in auth.ts | Architecture Patterns §3 | If the function is not easily extensible, a new function may be needed |
| A3 | `tableError` event is used as a string by existing App.tsx handlers — a new typed event is safer than JSON.stringify | Architecture Patterns §10 | If App.tsx tableError handler already parses JSON, JSON.stringify approach works directly |
| A4 | Admin subtree is best isolated via `window.location.pathname.startsWith('/admin')` check in App.tsx (no React Router) | Architecture Patterns §8 | If the planner prefers a different isolation mechanism, the pattern is still valid |

**All library API claims tagged [VERIFIED] were confirmed against npm registry version numbers on 2026-05-02. SDK behavioral claims (posthog-js identify, Sentry Replay masking, Socket.io namespace typing) are cited from official documentation patterns.**

---

## Open Questions

1. **tableError vs. new serverError event for TOS_REQUIRED**
   - What we know: `tableError` emits a string; App.tsx listens to it and shows an error message
   - What's unclear: Whether App.tsx's `tableError` handler can parse a JSON string vs. needing a new event type
   - Recommendation: Add a new `serverError: (payload: { type: string }) => void` event to `ExtendedServerEvents` for typed server-side errors. Avoids breaking existing `tableError` string consumers. Client routes on `serverError.type === 'TOS_REQUIRED'` → navigate to 'consent'.

2. **Admin namespace TypeScript types — single vs. dual interface**
   - What we know: Admin events are distinct from player events; Namespace generic requires separate interfaces
   - What's unclear: Whether to define `AdminServerEvents`/`AdminClientEvents` in `types/index.ts` or in a separate `types/admin.ts`
   - Recommendation: Add to `types/index.ts` under a clear `// Admin namespace types` section comment. Avoids a new file and keeps types co-located with `ExtendedServerEvents`.

3. **ban action — behaviorally complete?**
   - What we know: `bannedAt` column exists in DB schema; kick path is defined (D-08)
   - What's unclear: Whether `joinTable` and the auth handler should also check `bannedAt` to prevent a banned user from reconnecting
   - Recommendation: `joinTable` check should include `|| user.bannedAt` alongside the `tosAcceptedAt` check. Auth handler should NOT reject on `bannedAt` (auth is identity verification, not authorization). Planner should add this as a task.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All server code | ✓ | 22.19.0 | — |
| npm | Package installation | ✓ | 10.9.3 | — |
| Docker | PostgreSQL (dev) | ✓ | Available | — |
| PostgreSQL | Prisma/AdminAuditLog | ✓ (via Docker) | Via docker-compose | — |
| SENTRY_DSN | Sentry SDK init | Optional | Not verified | Graceful no-op per D-09 |
| POSTHOG_API_KEY | PostHog SDK init | Optional | Not verified | Graceful no-op per D-09 |
| JWT_SECRET | Admin auth | Required | Not in .env.example | Fail-closed boot guard (production) |

**Missing dependencies with no fallback:**
- `JWT_SECRET` env var must be added to `.env.example` and `.env` before the admin auth path can be tested.

**Missing dependencies with fallback:**
- `SENTRY_DSN` — SDK init is gracefully skipped in dev; no fallback needed for testing.
- `POSTHOG_API_KEY` — SDK init is gracefully skipped in dev; no fallback needed for testing.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 1.6.1 (server) + Vitest 1.6.1 + RTL (client) |
| Config file | `vitest.config.server.ts` (server) / `client/vitest.config.ts` (client) |
| Quick run command | `npm run test:server` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADMIN-01 | POST /api/admin/login with correct creds returns JWT; wrong creds 401 | unit | `npm run test:server` (adminAuth.test.ts) | ❌ Wave 0 |
| ADMIN-02 | /admin namespace middleware rejects invalid/missing JWT; admits valid JWT | unit | `npm run test:server` (adminNamespace.test.ts) | ❌ Wave 0 |
| ADMIN-06 | Audit log write failure aborts mutation | unit | `npm run test:server` (adminMutations.test.ts) | ❌ Wave 0 |
| OBS-01 | Sentry init no-ops when SENTRY_DSN absent | unit | `npm run test:server` (analytics.test.ts) | ❌ Wave 0 |
| OBS-03 | PostHog track() no-ops when POSTHOG_API_KEY absent | unit | `npm run test:server` (analytics.test.ts) | ❌ Wave 0 |
| OBS-04 | track() accepts only TrackableEvent values (TypeScript compile) | type-check | `npx tsc --noEmit` | Implicit |
| SECURITY-04 | scrubSentryEvent strips telegramId, initData, sessionToken fields | unit | `npm run test:server` (scrubber.test.ts) | ❌ Wave 0 |
| COMPLIANCE-04 | joinTable emits TOS_REQUIRED when tosAcceptedAt IS NULL | unit | `npm run test:server` (tosGate.test.ts) | ❌ Wave 0 |
| ADMIN-03 | AdminBanner visible; login redirects to /admin/tables | smoke | `npm run test:client` (AdminLogin.test.tsx) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test:server`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `server/__tests__/adminAuth.test.ts` — covers ADMIN-01 (JWT sign/verify, credential validation)
- [ ] `server/__tests__/adminNamespace.test.ts` — covers ADMIN-02 (namespace middleware auth rejection/admission)
- [ ] `server/__tests__/adminMutations.test.ts` — covers ADMIN-06 (fire-and-fail audit pattern)
- [ ] `server/__tests__/scrubber.test.ts` — covers SECURITY-04 (PII field stripping)
- [ ] `server/__tests__/tosGate.test.ts` — covers COMPLIANCE-04 (joinTable gate behavior)
- [ ] `server/__tests__/analytics.test.ts` — covers OBS-01, OBS-03 (graceful no-op, track() routing)
- [ ] `client/src/pages/admin/__tests__/AdminLogin.test.tsx` — covers ADMIN-03 (login form UX, redirect)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | Username/password → JWT (jsonwebtoken); fail-closed boot guard for missing JWT_SECRET |
| V3 Session Management | Yes | JWT 8h expiry; localStorage storage (admin surface only, not Telegram Mini App context); clear on logout |
| V4 Access Control | Yes | `/admin` namespace middleware rejects non-admin tokens; no admin affordance in player routes |
| V5 Input Validation | Yes | zod schemas on all admin form inputs; balance delta `.int().min(-100000).max(100000).refine(n => n !== 0)` |
| V6 Cryptography | Yes | Node.js `crypto` for sha256; jsonwebtoken for JWT — never hand-roll |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| JWT secret not set in dev | Elevation of privilege | Ephemeral dev secret or warning log; fail-closed in prod |
| Admin JWT token leaked from localStorage | Information disclosure | 8h expiry; HTTPS (prod only); admin surface is same-origin |
| Balance delta injection (e.g., grant MAX_INT) | Tampering | zod `.min(-100000).max(100000).int()` validation on input |
| PII in Sentry event breadcrumbs | Information disclosure | `beforeSend` scrubber covers event + breadcrumbs |
| Admin actions without audit log | Non-repudiation | Fire-and-fail: mutation aborted if audit write fails |
| Banned user reconnects via new socket | Elevation of privilege | `joinTable` must check `bannedAt` (Open Question #3) |
| `/admin` namespace accessible without valid JWT | Elevation of privilege | Namespace middleware verifies JWT on every connect |

---

## Sources

### Primary (HIGH confidence)
- npm registry (2026-05-02) — jsonwebtoken 9.0.3, @sentry/node 10.51.0, @sentry/react 10.51.0, posthog-node 5.33.0, posthog-js 1.372.6, recharts 3.8.1, react-hook-form 7.75.0, zod 4.4.2
- `C:\Projects\tg-poker\prisma\schema.prisma` — AdminAuditLog model, User.tosAcceptedAt field, User.bannedAt field
- `C:\Projects\tg-poker\server\index.ts` — Express route ordering, joinTable handler location (~line 518), socket event structure
- `C:\Projects\tg-poker\server\middleware\auth.ts` — JWT middleware pattern (assertSafeBootOrExit model)
- `C:\Projects\tg-poker\server\db\UserRepository.ts` — refundCurrentChips, tryDecrementBalance (kick path)
- `C:\Projects\tg-poker\server\GraceRegistry.ts` — clear(telegramId) (kick path)
- `C:\Projects\tg-poker\client\src\App.tsx` — React.lazy() pattern, AppView state machine, no React Router
- `C:\Projects\tg-poker\types\index.ts` — ExtendedServerEvents, ExtendedClientEvents, SocketData

### Secondary (MEDIUM confidence)
- Socket.io v4 namespace documentation — namespace middleware pattern, client connection with auth
- Vite documentation — VITE_ prefix requirement for client-exposed env vars
- posthog-node README — `posthogClient.shutdown()` on process exit
- Sentry React/Node docs — `beforeSend`, Replay initialization options, `maskAllText`

### Tertiary (LOW confidence)
- None — all critical claims in this research are either VERIFIED (npm registry, codebase) or CITED (official docs).

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all package versions confirmed against npm registry 2026-05-02
- Architecture: HIGH — all integration points verified against existing codebase; known patterns from official docs
- Pitfalls: HIGH for codebase-specific pitfalls (confirmed by reading existing files); MEDIUM for SDK-specific pitfalls (from official docs)

**Research date:** 2026-05-02
**Valid until:** 2026-06-02 (SDK versions; posthog-js releases frequently — verify posthog-js version before install)
