---
phase: 05-admin-ops-observability
reviewed: 2026-05-02T00:00:00Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - .env.example
  - client/.env.example
  - client/src/App.tsx
  - client/src/index.tsx
  - client/src/pages/admin/AdminApp.tsx
  - client/src/pages/admin/AdminAudit.tsx
  - client/src/pages/admin/AdminBanner.tsx
  - client/src/pages/admin/AdminEconomy.tsx
  - client/src/pages/admin/AdminLogin.tsx
  - client/src/pages/admin/AdminTables.tsx
  - client/src/pages/admin/AdminUsers.tsx
  - client/src/pages/admin/useAdminSocket.ts
  - client/src/utils/analytics.ts
  - client/src/utils/scrubber.ts
  - client/src/vite-env.d.ts
  - package.json
  - server/admin/adminAuth.ts
  - server/admin/adminMutations.ts
  - server/admin/adminNamespace.ts
  - server/admin/adminState.ts
  - server/db/UserRepository.ts
  - server/index.ts
  - server/middleware/auth.ts
  - server/middleware/joinGate.ts
  - server/models/User.ts
  - server/utils/analytics.ts
  - server/utils/scrubber.ts
  - types/index.ts
findings:
  critical: 2
  warning: 5
  info: 4
  total: 11
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-05-02T00:00:00Z
**Depth:** standard
**Files Reviewed:** 27
**Status:** issues_found

## Summary

Phase 5 adds the admin panel (JWT auth, `/admin` Socket.io namespace, audit log, table mutations), Sentry/PostHog observability, a PII scrubber, a ToS/ban join gate, and client-side lazy loading of the admin subtree.

The security fundamentals are solid: HMAC timing-safe comparison in Telegram auth, timing-safe credential validation in admin login, an ephemeral dev JWT secret with a hard prod boot guard, PII scrubbing before Sentry, and a sha256-based analytics ID instead of raw telegramIds. The audit-first pattern in `runWithAudit` is correctly implemented.

Two critical issues need fixing before production deployment: the admin login endpoint has no rate-limiting, making it vulnerable to credential stuffing; and the `socket` returned by `useAdminSocket` is always `null` on first render due to a `useRef` / state timing mismatch, causing silent failures of all admin mutations. Five warnings cover a logic bug in `auditLogAppended` fan-out, a missing `adminError` listener that swallows server-side error feedback, the `updateStats` double-write race for `biggestPot`, missing CSRF protection on the login endpoint, and a `setTimeout` used to escape setState-during-render in a hook callback.

---

## Critical Issues

### CR-01: Admin login endpoint has no rate-limiting — brute-force / credential stuffing

**File:** `server/index.ts:80`
**Issue:** `POST /api/admin/login` performs `validateCredentials` with constant-time comparison, which is correct, but there is no rate-limiting middleware on this endpoint. An attacker with network access to the server can enumerate passwords at wire speed. The credential pair (`ADMIN_USER` / `ADMIN_PASS`) is a single static secret; a 10-character lowercase password has ~141 trillion combinations but at 10 000 req/s that is only ~160 days of brute-force with no lock-out.

**Fix:** Add an express-rate-limit (or similar) guard before the handler. Minimal addition using the already-installed `express` package's ecosystem:

```typescript
// In server/index.ts, before app.post('/api/admin/login', ...)
import rateLimit from 'express-rate-limit';

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // 10 attempts per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' },
});

app.post('/api/admin/login', adminLoginLimiter, (req, res) => { ... });
```

`express-rate-limit` needs to be added to `package.json` dependencies. Alternatively, reject at the nginx layer with `limit_req_zone`.

---

### CR-02: `useAdminSocket` always returns `socket: null` — all admin mutations silently fail

**File:** `client/src/pages/admin/useAdminSocket.ts:124-129`
**Issue:** The hook returns `socketRef.current` as part of its value object, but `socketRef` is a `useRef` — mutations to `.current` do NOT trigger a re-render. The socket is created inside `useEffect`, which runs after the first render. On every render, `socketRef.current` is evaluated at the moment the return statement executes. Since `useEffect` has not run yet on the first render, `socket` is always `null` on mount. On subsequent renders triggered by `setState` (e.g., when `adminState` arrives and calls `setState`), React re-renders but because `socketRef.current` was set synchronously inside the effect, its value IS the socket — so it appears to work in practice when `state` changes cause a re-render. However, `AdminApp` gates rendering the tabs on `!socket` and `!state` (lines 106-113), which means the tab content only mounts after BOTH `state` and `socket` are non-null. Because `state` is stored in `useState` (triggers re-render) but `socket` is stored in `useRef` (does not), the tab content CAN render when `state` arrives but with a stale `null` socket if no re-render has been triggered separately. Any admin component receiving `socket` as a prop may call `socket.emit(...)` on `null` in edge cases, throwing a runtime error.

**Fix:** Store the socket in `useState` instead of (or in addition to) `useRef`:

```typescript
// useAdminSocket.ts
const [socket, setSocket] = useState<AdminSocket | null>(null);
const socketRef = useRef<AdminSocket | null>(null); // keep ref for cleanup

useEffect(() => {
  const token = localStorage.getItem('adminJwt');
  if (!token) { setUnauthorized(true); return; }

  const sock: AdminSocket = io('/admin', { auth: { token }, autoConnect: true });
  socketRef.current = sock;
  setSocket(sock);  // triggers re-render so consumers see the live socket

  // ... event listeners unchanged ...

  return () => {
    sock.removeAllListeners();
    sock.disconnect();
    socketRef.current = null;
    setSocket(null);
  };
}, []);

return { state, socket, connectionError, unauthorized };
// socket now comes from useState, not socketRef.current
```

---

## Warnings

### WR-01: `auditLogAppended` fan-out is missing — audit entries are not broadcast to connected admins

**File:** `server/admin/adminMutations.ts:31-48` and `server/admin/adminNamespace.ts:68-131`
**Issue:** `runWithAudit` creates the DB row but never emits `auditLogAppended` to the admin namespace. `useAdminSocket` listens for `auditLogAppended` (line 106) and appends entries to the local audit list in real time. However, none of the mutation functions (`kickUser`, `banUser`, `grantBalance`, `enableTable`, `disableTable`, `drainTable`, `editTableParams`) emit this event after the audit row is written. The Audit Log tab only shows entries that were in the initial snapshot; live actions are not reflected until the admin reconnects.

**Fix:** Emit `auditLogAppended` from `runWithAudit` after the `prisma.adminAuditLog.create` succeeds. `runWithAudit` needs access to `adminNs` — thread it through, or have each caller emit the event after `runWithAudit` returns. The simplest approach is to return the created row and let the caller emit:

```typescript
// adminMutations.ts — return created row from runWithAudit
export async function runWithAudit<T>(
  adminNs: AdminNs,
  meta: AuditMeta,
  mutationFn: () => Promise<T>
): Promise<T> {
  const row = await prisma.adminAuditLog.create({ data: { ... } });
  const result = await mutationFn();
  // Broadcast to all connected admin clients.
  adminNs.emit('auditLogAppended', {
    id: row.id,
    adminTelegramId: row.adminTelegramId,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    beforeJson: row.beforeJson,
    afterJson: row.afterJson,
    createdAt: row.createdAt.toISOString(),
  });
  return result;
}
```

All callers of `runWithAudit` need to pass `adminNs` as the first argument.

---

### WR-02: `adminError` events from the server are never handled by the client

**File:** `client/src/pages/admin/useAdminSocket.ts:34-122`
**Issue:** `AdminServerEvents` includes an `adminError` event (`{ code: string; message: string }`). The server emits it for ENABLE_TABLE_FAILED, KICK_FAILED, BAN_FAILED, GRANT_FAILED, INVALID_PARAMS, INVALID_DELTA, STATE_BUILD_FAILED, etc. `useAdminSocket` registers listeners for every other server event but has no `sock.on('adminError', ...)` handler. Admin mutation failures are completely silent to the operator.

**Fix:** Add an error state and listener:

```typescript
// useAdminSocket.ts
const [lastError, setLastError] = useState<{ code: string; message: string } | null>(null);

// inside useEffect:
sock.on('adminError', (err) => setLastError(err));

// in return:
return { state, socket, connectionError, unauthorized, lastError };
```

Then surface `lastError` in `AdminAuthenticatedShell` next to the `connectionError` banner, clearing it on the next successful action.

---

### WR-03: `updateStats` has a double-write race that can overwrite `biggestPot` incorrectly

**File:** `server/db/UserRepository.ts:314-335`
**Issue:** `updateStats` first does an `UPDATE` that sets `biggestPot: winnings > 0 ? { set: Math.max(winnings, 0) } : undefined` — this unconditionally sets `biggestPot` to `winnings` (not `MAX(biggestPot, winnings)`) on every winning hand. Then it does a second `findUnique` + `update` to "correct" it. Between the first write and the corrective second write, another concurrent call (e.g., two players win pots simultaneously) can read the row with the wrong `biggestPot` value, see that the new `winnings` is not greater, and skip the corrective write, leaving `biggestPot` permanently lower than it should be. Also, the first write's `set: Math.max(winnings, 0)` is always just `winnings` (since `winnings > 0` is already checked), so it overwrites the existing `biggestPot` even when the existing value was larger.

**Fix:** Use a single `UPDATE ... SET biggestPot = GREATEST(biggestPot, winnings)` via Prisma raw or eliminate the first write's `biggestPot` field and rely solely on the corrective second pass:

```typescript
static async updateStats(telegramId: number, won: boolean, winnings: number) {
  await prisma.user.update({
    where: { telegramId: BigInt(telegramId) },
    data: {
      handsPlayed: { increment: 1 },
      handsWon: won ? { increment: 1 } : undefined,
      totalWinnings: { increment: winnings },
      // Remove biggestPot from this update entirely
    }
  });

  if (winnings > 0) {
    // Use a raw query for the atomic MAX comparison
    await prisma.$executeRaw`
      UPDATE "User" SET "biggestPot" = GREATEST("biggestPot", ${winnings})
      WHERE "telegramId" = ${BigInt(telegramId)}
    `;
  }
}
```

---

### WR-04: Admin login endpoint has no CSRF protection

**File:** `server/index.ts:80-93`
**Issue:** `POST /api/admin/login` relies solely on the `Content-Type: application/json` header and CORS for cross-origin request filtering. However, an attacker on the same origin or within the CORS allowlist (e.g., `http://localhost:5173` in dev) can forge a POST that makes the browser submit credentials. The JWT is stored in `localStorage`, not an `HttpOnly` cookie, so the CSRF risk does not extend to subsequent admin actions (Socket.io reads localStorage directly from JS). But a successful login CSRF could allow an attacker to log in as admin using pre-known credentials via a scripted cross-site request in dev mode. In production the CORS restriction mitigates this, but the defense is incomplete.

**Fix:** For a minimal improvement, verify that the `Content-Type: application/json` check is enforced (express.json already rejects non-JSON bodies), and add an `Origin` header check on the server side for the login endpoint. As a stronger fix, require a `X-Requested-With: XMLHttpRequest` header or implement a CSRF token flow. Given the endpoint issues a short-lived 8-hour JWT and CORS is restricted in prod, this is a Warning rather than Critical.

---

### WR-05: `setTimeout(onLogout, 0)` in `AdminAuthenticatedShell` render path — fragile pattern

**File:** `client/src/pages/admin/AdminApp.tsx:61-64`
**Issue:** When `unauthorized` becomes `true`, the component does `setTimeout(onLogout, 0)` inside the render function body and returns `null`. This works in practice but violates React's render purity contract. A React concurrent-mode render can be discarded and re-run, causing multiple deferred `onLogout` calls. While this is currently a class component rendered under `React.StrictMode` (which double-invokes renders in dev), the use of `setTimeout` inside a render is a well-known anti-pattern.

**Fix:** Move the logout side-effect into `useEffect`:

```typescript
// AdminAuthenticatedShell
useEffect(() => {
  if (unauthorized) {
    onLogout();
  }
}, [unauthorized, onLogout]);

if (unauthorized) return null;
```

---

## Info

### IN-01: `AdminAudit` shows `afterJson` even when `beforeJson` is null — condition is inverted

**File:** `client/src/pages/admin/AdminAudit.tsx:80-83`
**Issue:** The diff display reads `{row.beforeJson ? \`→ ${JSON.stringify(row.afterJson ?? '')}\` : ''}`. This shows the after-state only when `beforeJson` is truthy. For actions like `kick` where `beforeJson` can be `null` (user was not in memory), no diff is shown. For actions where `afterJson` is `null` (also `kick`), it shows `→ null`. The intent is likely to show diffs only when there is meaningful before/after data.

**Fix:** Change the condition to show the diff when either field is non-null, or simply always render `afterJson` when it exists:

```tsx
{(row.beforeJson || row.afterJson)
  ? ` → ${JSON.stringify(row.afterJson ?? '')}`
  : ''}
```

---

### IN-02: `App.tsx` — hooks called conditionally (after early return for admin path)

**File:** `client/src/App.tsx:107-113` and `115-124`
**Issue:** The `App` component returns early at line 107-113 when `IS_ADMIN_PATH` is true, then declares hooks (`useTelegram`, `useState`, `useEffect`, etc.) at lines 115+. React's Rules of Hooks require that hooks are always called in the same order on every render — conditional early returns before hook declarations violate this rule. In this specific case, `IS_ADMIN_PATH` is a module-level constant that never changes, so the same code path is always taken, meaning the hooks-before-return rule is technically not violated at runtime. However, React's ESLint plugin (`eslint-plugin-react-hooks`) will flag this as an error, and future refactors that make the branch non-constant will silently break. The comment at line 46 acknowledges this with `// never accessed when IS_ADMIN_PATH is true`.

**Fix:** The cleanest solution is to split the component:

```tsx
// In App.tsx
const App: React.FC = () => {
  if (IS_ADMIN_PATH) {
    return (
      <Suspense fallback={<div style={{ padding: 24, color: '#b0bec5' }}>Loading admin…</div>}>
        <AdminApp />
      </Suspense>
    );
  }
  return <PlayerApp />;
};

const PlayerApp: React.FC = () => {
  const { user, initData, ... } = useTelegram();
  // ... all existing hooks and render logic
};
```

This eliminates the conditional hook concern entirely.

---

### IN-03: `AdminLogin` uses `z.object` schema but does not use `zodResolver` — zod validation is client-only

**File:** `client/src/pages/admin/AdminLogin.tsx:17-21`
**Issue:** A `loginSchema` is defined with `zod`, but `useForm` is initialized without a `resolver`. The zod schema is never connected to react-hook-form's validation. Field-level validation is instead done via the `register()` `required` option (line 111). The `loginSchema` object is dead code — it is defined but never used for anything other than type inference via `z.infer<typeof loginSchema>`.

**Fix:** Either connect the schema via `@hookform/resolvers/zod` or remove the dead schema definition and use `z.infer` type directly from the `register` constraints:

```typescript
import { zodResolver } from '@hookform/resolvers/zod';
// ...
const { register, handleSubmit, formState: { errors }, setValue } = useForm<LoginForm>({
  defaultValues: { username: '', password: '' },
  resolver: zodResolver(loginSchema),  // connect schema
});
```

---

### IN-04: Commented-out TODO code in `updateStats` — confusing dual-write comment

**File:** `server/db/UserRepository.ts:320-334`
**Issue:** The first `update` call on line 315 contains `// Logic for biggest pot needs check against current biggest` inline with the data argument, followed by a comment block `// Correct logic for biggest pot:` preceding a second query. This makes the intent unclear and the first write's `biggestPot: winnings > 0 ? { set: Math.max(winnings, 0) } : undefined` is effectively wrong (as noted in WR-03). The code comment acknowledges the bug but leaves the broken first write in place.

**Fix:** Remove the first write's `biggestPot` field (it sets the wrong value and is superseded) and consolidate the logic as suggested in WR-03.

---

_Reviewed: 2026-05-02T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
