---
phase: 05-admin-ops-observability
plan: "05"
subsystem: ui
tags: [react, socket.io, recharts, react-hook-form, zod, lazy-loading, admin]

requires:
  - phase: 05-04
    provides: /admin Socket.io namespace with adminState snapshot, mutation handlers, auditLogAppended events
  - phase: 05-03
    provides: POST /api/admin/login endpoint returning HS256 JWT
  - phase: 05-00
    provides: AdminLogin RED test scaffold in client/src/pages/admin/__tests__/AdminLogin.test.tsx
provides:
  - Lazy-loaded AdminApp Vite chunk (dist/assets/AdminApp-C3D6-bPz.js) — zero admin code in player bundle
  - AdminLogin form (react-hook-form + zod) — POST /api/admin/login, JWT in localStorage, 'Invalid username or password' on 401
  - AdminBanner — fixed 44px amber bar, role=banner, 'ADMIN MODE'
  - AdminTables — Enable/Disable/Drain/Edit table controls with inline confirm + inline edit form
  - AdminUsers — Kick/Ban (inline confirm) + BalanceDeltaInput + Apply Delta per user row
  - AdminEconomy — Total Chips in Play + Active Players StatCards + recharts BarChart per table
  - AdminAudit — last 10 AdminAuditLogEntry rows color-coded by action
  - useAdminSocket — /admin namespace socket lifecycle hook; exposes state/socket/connectionError/unauthorized
  - IS_ADMIN_PATH gate in App.tsx — short-circuits to AdminApp before player socket or useTelegram runs
  - ADMIN-03 requirement closed
affects: [phase-06-test-hardening, verify-work]

tech-stack:
  added: [react-hook-form@7.75.0, zod@4.4.2, recharts@3.8.1]
  patterns:
    - Lazy-loaded admin subtree via React.lazy + Suspense, separate Vite chunk
    - IS_ADMIN_PATH const computed once at module load; guards player socket creation
    - TabBar used with tabs/activeId/onChange API (not children syntax)
    - Inline confirm pattern for destructive actions (Drain, Kick, Ban)
    - useAdminSocket hook owns /admin namespace lifecycle with cleanup on unmount

key-files:
  created:
    - client/src/pages/admin/AdminApp.tsx
    - client/src/pages/admin/AdminBanner.tsx
    - client/src/pages/admin/AdminLogin.tsx
    - client/src/pages/admin/AdminTables.tsx
    - client/src/pages/admin/AdminUsers.tsx
    - client/src/pages/admin/AdminEconomy.tsx
    - client/src/pages/admin/AdminAudit.tsx
    - client/src/pages/admin/useAdminSocket.ts
  modified:
    - client/src/App.tsx

key-decisions:
  - "05-05: AdminApp lazy-loaded via React.lazy() — separate Vite chunk AdminApp-C3D6-bPz.js; zero admin code in player main bundle (T-5-05-1 mitigated)"
  - "05-05: IS_ADMIN_PATH = window.location.pathname.startsWith('/admin') computed once at module load; player socket null-cast when on admin path (T-5-05-2 / D-01)"
  - "05-05: TabBar API uses tabs/activeId/onChange (not children JSX) — adjusted from plan template to match actual Tab.tsx prop contract"
  - "05-05: useAdminSocket returns socketRef.current synchronously; AdminAuthenticatedShell renders 'Connecting...' while state is null + socket is null"

patterns-established:
  - "Admin subtree is entirely self-contained under client/src/pages/admin/ — no cross-import from player pages"
  - "Inline confirm for destructive admin actions (role=alert div expands in-row, two-button confirm/cancel)"
  - "recharts ResponsiveContainer always wrapped in explicit-height parent (height: 320) per Pitfall 7"

requirements-completed: [ADMIN-03]

duration: 15min
completed: "2026-05-02"
---

# Phase 05 Plan 05: Admin React Subtree Summary

**Lazy-loaded admin dashboard at /admin — login form, ADMIN MODE banner, 4-tab live dashboard (Tables/Users/Economy/Audit), useAdminSocket hook — emitted as a separate Vite chunk with zero admin code in the player bundle**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-02T19:05:00Z
- **Completed:** 2026-05-02T19:10:00Z
- **Tasks:** 3 (Task 1 partially pre-completed in prior commit 05e626c)
- **Files modified:** 9 (8 created, 1 modified)

## Accomplishments

- AdminLogin form (react-hook-form + zod): POST /api/admin/login, stores JWT on 200, shows 'Invalid username or password' on 401 with password cleared; 3/3 RED tests turned GREEN in prior commit
- AdminBanner: fixed-position 44px amber bar with role='banner' and aria-label='Admin mode indicator'
- 4 admin tab components: AdminTables (Enable/Disable/Drain/Edit with inline confirms), AdminUsers (Kick/Ban with inline confirm + balance delta), AdminEconomy (StatCards + recharts BarChart), AdminAudit (last 10 color-coded log rows)
- useAdminSocket hook owns /admin namespace socket; handles connect_error UNAUTHORIZED, tableStateChanged delta merges, userBanned/userKicked/auditLogAppended reactive updates
- App.tsx IS_ADMIN_PATH gate: lazy AdminApp rendered BEFORE useTelegram or player socket; player socket null-cast when on admin path
- Vite build emits separate chunk `dist/assets/AdminApp-C3D6-bPz.js` — admin code not in player main bundle
- All 60 client tests GREEN (57 existing + 3 AdminLogin)

## Task Commits

1. **Task 1: AdminLogin + AdminBanner (pre-committed)** — `05e626c` (feat)
2. **Task 2: useAdminSocket + AdminApp + 4 tab components** — `3d064e9` (feat)
3. **Task 3: Lazy /admin route gate in App.tsx** — `f4e11d6` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `client/src/pages/admin/AdminApp.tsx` — lazy default export; JWT gate → AdminLogin or AdminAuthenticatedShell; TabBar with 4 tabs
- `client/src/pages/admin/AdminBanner.tsx` — fixed amber 44px bar, role='banner', 'ADMIN MODE'
- `client/src/pages/admin/AdminLogin.tsx` — react-hook-form + zod form; POST /api/admin/login; JWT storage; 401 error handling
- `client/src/pages/admin/AdminTables.tsx` — table list with Enable/Disable/Drain/Edit; inline confirm + inline edit form
- `client/src/pages/admin/AdminUsers.tsx` — user list with Kick/Ban (inline confirm); BalanceDeltaInput + Apply Delta
- `client/src/pages/admin/AdminEconomy.tsx` — StatCards + recharts BarChart with explicit height=280 inside 320px Card
- `client/src/pages/admin/AdminAudit.tsx` — last 10 audit entries color-coded by action type
- `client/src/pages/admin/useAdminSocket.ts` — /admin namespace socket; adminState snapshot; delta event handlers; cleanup on unmount
- `client/src/App.tsx` — IS_ADMIN_PATH gate; AdminApp lazy import; player socket null-cast when on admin path

## Decisions Made

- TabBar API adjusted from plan template (which used children JSX) to match actual Tab.tsx API (`tabs`, `activeId`, `onChange` props). Plan used `<Tab active={...} onClick={...}>label</Tab>` but the component requires `<Tab label="..." active={...} onClick={...} />`. Fixed by using `<TabBar tabs={ADMIN_TABS} activeId={tab} onChange={...} />`.
- Player socket is null-cast (not skipped at import level) to preserve TypeScript type safety in App.tsx; the IS_ADMIN_PATH short-circuit in the component body ensures the null socket is never accessed.

## Deviations from Plan

**1. [Rule 1 - Bug] Corrected TabBar/Tab usage to match actual component API**
- **Found during:** Task 2 (AdminApp shell creation)
- **Issue:** Plan's code template used `<Tab active={tab === 'tables'} onClick={...}>Tables</Tab>` (children syntax), but the actual Tab component requires `label` prop and TabBar uses `tabs/activeId/onChange` props.
- **Fix:** Used `<TabBar tabs={ADMIN_TABS} activeId={tab} onChange={(id) => setTab(id as AdminTab)} />` with a typed `ADMIN_TABS` array constant.
- **Files modified:** `client/src/pages/admin/AdminApp.tsx`
- **Verification:** `npm run build` exits 0; 60/60 tests GREEN.
- **Committed in:** `3d064e9`

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in plan template vs actual component API)
**Impact on plan:** Minimal — same functionality, correct prop API. No scope change.

## Issues Encountered

- `useAdminSocket.ts` was included in prior commit's plan action but was not actually committed in `05e626c`. It was included in Task 2's commit `3d064e9` along with the other new admin components.

## Known Stubs

None — all admin tabs render live data from `adminState`; no hardcoded placeholder values flow to UI.

## Threat Flags

No new security surface beyond what was planned. The IS_ADMIN_PATH gate and lazy chunk mitigate T-5-05-1 and T-5-05-2 as specified.

## Lazy Chunk Verification

Build output:
```
dist/assets/AdminApp-C3D6-bPz.js  460.75 kB | gzip: 137.62 kB
dist/assets/index-BYIpshjN.js     610.79 kB | gzip: 193.97 kB
```
AdminApp chunk is separate from the player `index-*.js` chunk. Recharts (large dependency) is in the admin chunk only.

## Manual Smoke Checklist (for /gsd-verify-work)

1. `npm run dev:all` → visit `http://localhost:5173/admin` → AdminLogin renders (no flash of player UI)
2. Submit invalid credentials → '401' path renders 'Invalid username or password', password cleared, username preserved
3. Submit valid credentials → JWT stored to localStorage, AdminApp shell renders with ADMIN MODE banner + 4 tabs
4. Switch tabs: Tables / Users / Economy / Audit Log each render without error
5. Click 'Drain Table' → inline confirmation row appears; click 'Confirm Drain' → emit sent, status badge changes
6. Click 'Kick' on a user → inline confirmation appears; confirm → socket emits kickUser
7. Visit `http://localhost:5173/` (player path) → no admin code visible, player app loads normally

## Next Phase Readiness

- Phase 5 is now complete: all 6 plans (00-05) shipped
- Phase 6 (Test Hardening) can begin; admin subtree is a candidate for additional test coverage
- Manual smoke checklist above is for /gsd-verify-work

---
*Phase: 05-admin-ops-observability*
*Completed: 2026-05-02*
