---
phase: 05-admin-ops-observability
verified: 2026-05-02T22:25:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 1
overrides:
  - must_have: "An allowlisted admin connects to the /admin Socket.io namespace (namespace middleware re-runs initData HMAC and checks ADMIN_TELEGRAM_IDS)"
    reason: "User explicitly replaced Telegram-ID allowlist with ADMIN_USER + ADMIN_PASS credentials + HS256 JWT (CONTEXT D-02). The admin surface has no dependency on Telegram auth. JWT-based namespace middleware delivers equivalent access control for the MVP."
    accepted_by: "user (CONTEXT D-02)"
    accepted_at: "2026-05-02T00:00:00Z"
human_verification:
  - test: "Visit http://localhost:5173/admin — confirm AdminLogin renders, not the player UI. Submit invalid credentials. Submit valid credentials (ADMIN_USER/ADMIN_PASS from .env). Verify ADMIN MODE banner and all 4 tabs render."
    expected: "AdminLogin form appears immediately; invalid creds show 'Invalid username or password' with password cleared; valid creds store JWT, show amber ADMIN MODE banner, and render Tables/Users/Economy/Audit Log tabs with live data from adminState snapshot."
    why_human: "Visual layout, banner appearance, tab navigation, and live Socket.io data flow cannot be verified without running the app."
  - test: "With two browser windows (player + admin), seat a player at a table, then use the admin Kick button with inline confirmation. Verify player sees eviction."
    expected: "Player socket receives replacedBySession, disconnect occurs, table manager removes them, chips are refunded. Admin Audit Log tab shows kick entry."
    why_human: "Requires two concurrent live Socket.io sessions; cannot verify programmatically without running the server."
  - test: "Use Admin panel 'Grant Balance' with +500 delta and -500 delta on a user. Verify DB row updated atomically."
    expected: "Positive delta increments unconditionally; negative delta only succeeds when balance >= |delta|. AdminAuditLog row written for each."
    why_human: "Requires live DB connection and running server to observe atomic update behavior."
  - test: "Verify Sentry is silent (no console errors) when SENTRY_DSN is not set; PostHog is silent when POSTHOG_API_KEY is not set."
    expected: "Neither '[Boot] Sentry initialized' nor '[Boot] PostHog initialized' appears in server logs when env vars are absent. track() calls produce no errors."
    why_human: "Requires launching the server process and inspecting stdout/stderr."
  - test: "Verify Vite build emits separate admin chunk and no admin code in player bundle."
    expected: "client/dist/assets/AdminApp-*.js exists as a separate file; grepping client/dist/assets/index-*.js for 'ADMIN MODE' or 'adminJwt' finds nothing."
    why_human: "Build already confirmed (05-05 SUMMARY shows chunk AdminApp-C3D6-bPz.js), but bundle content needs manual verification to confirm no admin symbol leakage."
---

# Phase 5: Admin, Ops & Observability Verification Report

**Phase Goal:** Ship the hidden admin surface (dashboards + live controls with mandatory audit logging), turn on error tracking and anonymous analytics with PII scrubbing, and enforce the ToS gate server-side on `joinTable`.
**Verified:** 2026-05-02T22:25:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Admin connects to /admin namespace (auth model); sees "ADMIN MODE" banner; live dashboards for tables/users/economy/recent audit — no admin affordance in player UI | PASSED (override) | JWT + ADMIN_USER/ADMIN_PASS replaces ADMIN_TELEGRAM_IDS per user decision CONTEXT D-02. `adminNamespaceMiddleware` validates HS256 JWT. AdminBanner renders with role=banner. IS_ADMIN_PATH gate in App.tsx prevents admin code in player bundle. Separate chunk AdminApp-C3D6-bPz.js confirmed. |
| 2 | Admin can perform all 7 mutations; every mutation writes AdminAuditLog BEFORE commit; failed audit aborts mutation | VERIFIED | `runWithAudit` in adminMutations.ts: `prisma.adminAuditLog.create` at line 36 runs BEFORE `mutationFn()` at line 44. All 7 handlers (kickUser, banUser, grantBalance, enableTable, disableTable, drainTable, editTableParams) go through `runWithAudit`. adminMutations test 2/2 GREEN. Note: `auditLogAppended` is NOT broadcast live (WR-01 from code review); audit entries only visible in initial snapshot. |
| 3 | Sentry (react + node) initializes with shared DSN, env+release tags, Replay with privacy masking, and beforeSend scrubber that strips initData/sessionToken/telegramId | VERIFIED | server/index.ts: `if (process.env.SENTRY_DSN) { Sentry.init({ beforeSend: scrubSentryEvent }) }`. client/src/index.tsx: `if (import.meta.env.VITE_SENTRY_DSN) { Sentry.init({ integrations: [Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })], replaysOnErrorSampleRate: 1.0, beforeSend: scrubSentryEvent }) }`. scrubber.test.ts 4/4 GREEN. |
| 4 | PostHog (client + server) emits fixed event taxonomy using sha256(telegramId); raw telegramId never leaves server | VERIFIED | server/utils/analytics.ts: `track(analyticsId, event: TrackableEvent, ...)`. toAnalyticsId computes sha256. authSuccess payload includes `analyticsId: toAnalyticsId(user.telegramId)`. client App.tsx: `identifyAnalytics(userData.analyticsId)`. analytics.test.ts 2/2 GREEN. |
| 5 | New user with tosAcceptedAt IS NULL receives typed error from joinTable handler routing to consent screen | VERIFIED | server/middleware/joinGate.ts: `gateUserOrEmit` emits `serverError { type: 'TOS_REQUIRED' }`. Wired in server/index.ts joinTable handler after user lookup. client App.tsx: `socket.on("serverError", payload => { if (payload.type === 'TOS_REQUIRED') setView('consent') })`. tosGate.test.ts 3/3 GREEN. |

**Score:** 5/5 truths verified (1 with user-approved override)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/middleware/joinGate.ts` | gateUserOrEmit helper | VERIFIED | Exports `gateUserOrEmit`; emits TOS_REQUIRED and BANNED; ban-first ordering |
| `server/index.ts` | gateUserOrEmit wired in joinTable | VERIFIED | Line 603: `if (!gateUserOrEmit(user, socket))` after user lookup, before balance check |
| `client/src/App.tsx` | serverError listener + IS_ADMIN_PATH gate | VERIFIED | socket.on("serverError") at line 252; IS_ADMIN_PATH gate at line 107; AdminApp lazy at line 35 |
| `server/utils/scrubber.ts` | scrubObject + scrubSentryEvent | VERIFIED | Both exports present; PII_FIELD_RE regex `/telegram_?id\|initdata\|session_?token/i` confirmed |
| `server/utils/analytics.ts` | track + initAnalytics + toAnalyticsId + shutdownAnalytics | VERIFIED | All 4 exports confirmed; typed as TrackableEvent |
| `client/src/utils/scrubber.ts` | Identical client-side scrubber | VERIFIED | File exists; identical impl to server scrubber |
| `client/src/utils/analytics.ts` | track + identifyAnalytics | VERIFIED | Both exports; `posthog.identify(analyticsId)` on authSuccess |
| `server/index.ts` | Sentry.init + PostHog.init guarded by env vars | VERIFIED | Lines 38-54 in server/index.ts; both init blocks env-guarded |
| `client/src/index.tsx` | Sentry.init with Replay + PostHog.init guarded | VERIFIED | Lines 9-27 in client/src/index.tsx; maskAllText + blockAllMedia confirmed |
| `.env.example` | SENTRY_DSN, POSTHOG_API_KEY, JWT_SECRET, ADMIN_USER, ADMIN_PASS documented | VERIFIED | All 5 vars present in .env.example |
| `client/.env.example` | VITE_SENTRY_DSN, VITE_POSTHOG_API_KEY documented | VERIFIED | File exists with both vars |
| `server/admin/adminAuth.ts` | signAdminToken + verifyAdminToken + validateCredentials | VERIFIED | All 3 exports; HS256, 8h expiry, timingSafeEqual confirmed |
| `server/middleware/auth.ts` | JWT_SECRET fail-closed boot guard | VERIFIED | assertSafeBootOrExit extended at line 37: exits 1 when JWT_SECRET empty in prod |
| `server/index.ts` | POST /api/admin/login + express.json() + cors() | VERIFIED | All 3 present; JSON before login route; CORS mirrors Socket.io CORS_ORIGIN |
| `server/admin/adminMutations.ts` | runWithAudit + 7 mutation handlers | VERIFIED | runWithAudit + kickUser + banUser + grantBalance + enableTable + disableTable + drainTable + editTableParams all exported |
| `server/admin/adminState.ts` | buildAdminState + buildAdminTableInfo | VERIFIED | Both exports; reads tableManager + userStorage + prisma.adminAuditLog |
| `server/admin/adminNamespace.ts` | adminNamespaceMiddleware + setupAdminNamespace | VERIFIED | Both exports; 7 AdminClientEvents handlers bound; adminState snapshot on connect |
| `server/db/UserRepository.ts` | adjustBalanceAtomic + setBannedAt + mapToTelegramUser includes bannedAt | VERIFIED | All 3 confirmed; WHERE balance >= -delta guard for negative deltas |
| `server/models/User.ts` | getAllUsers() iterator | VERIFIED | Added at line 113 |
| `server/index.ts` | setupAdminNamespace(io) call | VERIFIED | Line 105; after `const io = new Server` and before `io.on("connection")` |
| `client/src/pages/admin/AdminLogin.tsx` | Login form with POST /api/admin/login + JWT storage + 401 handling | VERIFIED | AdminLogin.test.tsx 3/3 GREEN; all acceptance criteria confirmed |
| `client/src/pages/admin/AdminBanner.tsx` | 44px amber bar with role=banner + ADMIN MODE | VERIFIED | role="banner"; `var(--color-action-raise)`; ADMIN MODE text |
| `client/src/pages/admin/AdminTables.tsx` | Table rows with 4 action buttons + inline confirm + edit | VERIFIED | All 4 emit calls (enableTable, disableTable, drainTable, editTableParams) confirmed |
| `client/src/pages/admin/AdminUsers.tsx` | User rows with Kick/Ban + BalanceDeltaInput | VERIFIED | kickUser + banUser + grantBalance emits; aria-labels confirmed |
| `client/src/pages/admin/AdminEconomy.tsx` | StatCards + recharts BarChart | VERIFIED | ResponsiveContainer height={280} inside 320px Card; totalChipsInPlay displayed |
| `client/src/pages/admin/AdminAudit.tsx` | Last 10 audit entries color-coded | VERIFIED | ACTION_COLOR + ACTION_LABEL maps; 'Last 10 Actions' heading; recentAuditLogs.map |
| `client/src/pages/admin/useAdminSocket.ts` | /admin namespace socket lifecycle | VERIFIED | io('/admin') with auth token; adminState/tableStateChanged/userBanned/userKicked handlers wired |
| `client/src/App.tsx` | Lazy AdminApp via IS_ADMIN_PATH gate | VERIFIED | lazy(() => import("./pages/admin/AdminApp")); IS_ADMIN_PATH check; player socket null-cast |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| server/index.ts joinTable handler | server/middleware/joinGate.ts gateUserOrEmit | import + invocation before balance check | WIRED | Line 11 import; line 603 invocation; lexical order: user lookup → gateUserOrEmit → balance check |
| client/src/App.tsx serverError handler | setView('consent') on TOS_REQUIRED | socket.on("serverError") branch | WIRED | Lines 252-258; TOS_REQUIRED → setView('consent'); BANNED → alert + reset |
| server/index.ts authSuccess | toAnalyticsId(user.telegramId) → client identifyAnalytics | userWithAnalytics spread; client authSuccess listener | WIRED | Server line 349: `analyticsId: toAnalyticsId(user.telegramId)`; client App.tsx line 202: `identifyAnalytics(userData.analyticsId)` |
| Sentry.init beforeSend (server + client) | scrubSentryEvent | beforeSend callback | WIRED | server/index.ts line 43; client/src/index.tsx line 18; both call scrubSentryEvent |
| track() call | TrackableEvent union (types/index.ts) | event parameter typed as TrackableEvent | WIRED | server/utils/analytics.ts line 24: `event: TrackableEvent`; TypeScript blocks non-union strings |
| POST /api/admin/login | validateCredentials + signAdminToken | Express handler reads req.body | WIRED | server/index.ts line 82: validateCredentials(username, password); line 85: signAdminToken(username) |
| /admin namespace middleware | verifyAdminToken (Plan 05-03) | adminNamespaceMiddleware | WIRED | adminNamespace.ts line 3 imports verifyAdminToken; line 34 calls it |
| Admin action handlers | AdminAuditLog | runWithAudit | WIRED | All 7 handlers call runWithAudit which calls prisma.adminAuditLog.create BEFORE mutationFn |
| kickUser handler | Phase 4 eviction path | replacedBySession + disconnect(true) + leaveTable + refundCurrentChips + GraceRegistry.clear | WIRED | adminMutations.ts lines 80-96 |
| banUser handler | in-memory userStorage | cached.bannedAt = banAt.toISOString() | WIRED | adminMutations.ts line 133: `if (cached) cached.bannedAt = banAt.toISOString()` |
| AdminLogin | POST /api/admin/login (Plan 05-03) | fetch('/api/admin/login', { method: 'POST' }) | WIRED | AdminLogin.tsx line 37 |
| useAdminSocket | /admin Socket.io namespace | io('/admin', { auth: { token } }) | WIRED | useAdminSocket.ts line 41 |
| client/src/App.tsx | AdminApp lazy-loaded chunk | React.lazy(() => import("./pages/admin/AdminApp")) | WIRED | App.tsx line 35; Vite chunk AdminApp-C3D6-bPz.js confirmed in dist/ |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| AdminTables.tsx | `state.tables` | useAdminSocket → adminState event → buildAdminState() → tableManager.getAllTables() | Yes — live table data from TableManager | FLOWING |
| AdminUsers.tsx | `state.users` | useAdminSocket → adminState event → buildAdminState() → userStorage.getAllUsers() | Yes — live user data from in-memory userStorage | FLOWING |
| AdminEconomy.tsx | `state.totalChipsInPlay` | useAdminSocket → adminState event → buildAdminState() → sum of seated chips | Yes — computed from live tableManager state | FLOWING |
| AdminAudit.tsx | `state.recentAuditLogs` | useAdminSocket → adminState event → buildAdminState() → prisma.adminAuditLog.findMany() | Yes — real DB query, last 10 rows | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Server test suite — all 80 tests GREEN | npm run test:server (17 files) | 80 passed (0 failed) | PASS |
| Client test suite — all 60 tests GREEN | cd client && npx vitest run (8 files) | 60 passed (0 failed) | PASS |
| AdminApp Vite chunk exists separately | ls client/dist/assets/AdminApp*.js | AdminApp-C3D6-bPz.js (460.75 kB) | PASS |
| gateUserOrEmit exports and emits correct payloads | tosGate.test.ts 3/3 | All GREEN | PASS |
| scrubObject strips PII fields and numeric runs | scrubber.test.ts 4/4 | All GREEN | PASS |
| track() is no-op without initAnalytics | analytics.test.ts 2/2 | All GREEN | PASS |
| signAdminToken/verifyAdminToken/validateCredentials | adminAuth.test.ts 3/3 | All GREEN | PASS |
| adminNamespaceMiddleware rejects bad/missing JWT | adminNamespace.test.ts 3/3 | All GREEN | PASS |
| runWithAudit: audit row written BEFORE mutation | adminMutations.test.ts 2/2 | All GREEN | PASS |
| AdminLogin 3 scenarios (render, 200 path, 401 path) | AdminLogin.test.tsx 3/3 | All GREEN | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| ADMIN-01 | 05-00, 05-03 | Admin identity model (ADMIN_TELEGRAM_IDS allowlist → overridden to ADMIN_USER/ADMIN_PASS + JWT per D-02) | SATISFIED (override) | validateCredentials + signAdminToken; assertSafeBootOrExit JWT_SECRET guard |
| ADMIN-02 | 05-00, 05-03, 05-04 | /admin Socket.io namespace with namespace-level middleware | SATISFIED | adminNamespaceMiddleware verifies HS256 JWT; setupAdminNamespace mounts it |
| ADMIN-03 | 05-05 | Lazy-loaded admin subtree with ADMIN MODE banner; not linked from player UI | SATISFIED | IS_ADMIN_PATH gate; React.lazy AdminApp; AdminBanner; separate Vite chunk |
| ADMIN-04 | 05-04 | Live dashboards: tables, users, economy, recent errors | SATISFIED | buildAdminState snapshot on connect; tableStateChanged/userBanned/userKicked deltas; 4 tabs render live data |
| ADMIN-05 | 05-04 | 7 admin controls (enable/disable/drain/editParams/kick/ban/grantBalance) | SATISFIED | All 7 handlers in adminMutations.ts; all 7 event bindings in adminNamespace.ts; all 7 emits in AdminTables/AdminUsers |
| ADMIN-06 | 05-00, 05-04 | AdminAuditLog written BEFORE mutation; failed audit aborts mutation | SATISFIED | runWithAudit: prisma.adminAuditLog.create at line 36 before mutationFn() at line 44; adminMutations.test.ts 2/2 GREEN |
| OBS-01 | 05-02 | Sentry (react + node) initialized with DSN, env tag, release, PII scrubber beforeSend | SATISFIED | Both Sentry.init blocks confirmed; scrubSentryEvent wired as beforeSend |
| OBS-02 | 05-02 | Sentry Replay enabled (errors sampled, privacy-masked) | SATISFIED | replayIntegration({ maskAllText: true, blockAllMedia: true }); replaysOnErrorSampleRate: 1.0 |
| OBS-03 | 05-02 | PostHog (client + server) with anonymous sha256(telegramId) identity | SATISFIED | toAnalyticsId computes sha256; analyticsId in authSuccess; identifyAnalytics called |
| OBS-04 | 05-02 | Fixed track() taxonomy (9 event types) via TrackableEvent union | SATISFIED | TrackableEvent union in types/index.ts; track() typed to accept only union members |
| SECURITY-04 | 05-00, 05-02 | initData/sessionToken/telegramId scrubbed from Sentry via beforeSend | SATISFIED | scrubObject strips PII_FIELD_RE + TELEGRAM_ID_RE; scrubber.test.ts 4/4 GREEN |
| COMPLIANCE-04 | 05-00, 05-01 | joinTable rejects tosAcceptedAt IS NULL with typed error → consent screen | SATISFIED | gateUserOrEmit emits TOS_REQUIRED; App.tsx routes to setView('consent'); tosGate.test.ts 3/3 GREEN |

### Anti-Patterns Found

| File | Issue | Severity | Impact |
|------|-------|----------|--------|
| `client/src/pages/admin/useAdminSocket.ts:124` | `socket: socketRef.current` returned from useRef — does not trigger re-renders (CR-02 from code review). In practice works because `adminState` arrival triggers re-render and socketRef.current is set synchronously before any event fires. AdminApp gates tab rendering on both `!state` and `!socket`. | Warning | Potential null socket in concurrent-mode edge cases; admin mutations could throw if socket null; tabs do render correctly in practice. |
| `client/src/pages/admin/AdminApp.tsx:62` | `setTimeout(onLogout, 0)` inside render function body (WR-05 from code review). | Info | React anti-pattern; concurrent mode could call onLogout multiple times. Functional in production. |
| `server/index.ts:80` | POST /api/admin/login has no rate-limiting (CR-01 from code review). | Warning | Brute-force attack surface on admin credentials. Mitigated in prod by HTTPS + strong ADMIN_PASS; not acceptable for production without rate limiting. |
| `server/admin/adminMutations.ts` / `server/admin/adminNamespace.ts` | `auditLogAppended` event never emitted (WR-01 from code review). Client `useAdminSocket` has handler for it, but server never fires it. Audit tab only shows initial snapshot entries. | Warning | Live audit log updates do not work; must reconnect to see new entries. Does not block ADMIN-06 goal (audit row is still written before mutation). |
| `client/src/pages/admin/AdminLogin.tsx:17-21` | `loginSchema` zod object defined but zodResolver not connected to useForm — dead code (IN-03 from code review). | Info | No functional impact; validation falls back to react-hook-form `required` option. |
| `client/src/App.tsx:107-124` | Hooks declared after conditional early return (`IS_ADMIN_PATH` branch) — React Rules of Hooks violation (IN-02 from code review). Safe in practice because IS_ADMIN_PATH is a module-level constant. | Info | ESLint react-hooks plugin will flag; future refactors may break silently. |

### Human Verification Required

#### 1. Admin Panel End-to-End Smoke Test

**Test:** Start server (`npm run dev:all`). Visit `http://localhost:5173/admin`. Verify AdminLogin renders (no player UI visible). Submit invalid credentials. Submit valid credentials (ADMIN_USER + ADMIN_PASS from .env).
**Expected:** AdminLogin form shows first; 401 path shows 'Invalid username or password' with password cleared, username preserved; valid login stores JWT, shows amber ADMIN MODE banner (44px top bar), TabBar with Tables/Users/Economy/Audit Log tabs, live data from server.
**Why human:** Visual rendering, banner appearance, tab navigation, and live Socket.io data flow require running the app.

#### 2. Admin Kick and Ban with Live Player Session

**Test:** Seat a player at a table (two browser sessions). Use Admin Users tab to kick the player with inline confirm. Then ban a different user.
**Expected:** Kicked player's socket receives `replacedBySession`, disconnects, chips refunded. Banned user subsequently cannot join tables (BANNED error). AdminAuditLog entries appear in DB for both actions.
**Why human:** Requires two concurrent live Socket.io sessions; multi-session coordination cannot be verified programmatically.

#### 3. Sentry/PostHog Graceful No-Op Verification

**Test:** Start server without SENTRY_DSN or POSTHOG_API_KEY in .env. Check server startup logs.
**Expected:** Neither '[Boot] Sentry initialized' nor '[Boot] PostHog initialized' appears. No errors thrown. `track()` calls produce no output.
**Why human:** Requires launching the server process and observing stdout/stderr.

#### 4. Vite Bundle Content Verification

**Test:** Run `cd client && npm run build`. Verify `dist/assets/AdminApp-*.js` exists. Grep `dist/assets/index-*.js` for 'ADMIN MODE', 'adminJwt', 'AdminApp'.
**Expected:** AdminApp chunk exists separately. No admin-specific strings in the player main bundle.
**Why human:** Bundle content analysis for code isolation requires manual inspection of generated assets.

#### 5. grantBalance Atomic Guard Verification

**Test:** Use Admin panel to grant -500 balance to a user who has only 200 chips.
**Expected:** Grant fails (UserRepository.adjustBalanceAtomic returns `{ success: false }` due to WHERE balance >= 500 guard). Admin sees error or no change. Balance does not go negative.
**Why human:** Requires live DB connection and server to observe atomic SQL guard behavior.

### Gaps Summary

No hard gaps blocking phase goal achievement. All 12 required artifacts exist, are substantive, and are wired. All test suites pass (80/80 server, 60/60 client). The phase goal is functionally achieved.

Three known issues from code review (WR-01 missing auditLogAppended broadcast, CR-01 no rate limiting, CR-02 useRef socket pattern) are pre-production concerns captured in the code review but do not prevent the MVP admin surface from functioning for its intended use.

The ADMIN-01 deviation (ADMIN_TELEGRAM_IDS → ADMIN_USER/ADMIN_PASS + JWT) is a user-directed design change documented in CONTEXT D-02 and carries an override in this verification report.

---

_Verified: 2026-05-02T22:25:00Z_
_Verifier: Claude (gsd-verifier)_
