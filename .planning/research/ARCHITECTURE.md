# Architecture — v1.0 MVP Integration Research

**Project:** NightRiver (Telegram Mini App Poker)
**Milestone:** v1.0 MVP Launch
**Researched:** 2026-04-14
**Mode:** Project integration (brownfield)
**Confidence:** HIGH for existing-code facts; MEDIUM for proposed patterns (they follow existing conventions)

---

## 0. Guiding Integration Principles

These principles are derived from the existing codebase conventions and should govern every feature below.

1. **Socket.io stays the sole transport for gameplay.** New gameplay-adjacent features (action bubbles, reconnect snapshot, hand history live feed) ride existing typed events in `types/index.ts`. Do not introduce REST for anything a player does at the table.
2. **Authoritative server; client is a view.** Any new feature that affects game state emits from server. Client state is replaced by snapshots, never locally authored for gameplay.
3. **Keep `Game.ts` pure.** New logic that is not poker rules (bubbles, history, persistence checkpoints, grace timers) lives in `Table.ts` / socket layer, NOT in `Game.ts`. Game's only new surface: *callbacks* (`onPlayerAction`, `onHandComplete`) to let the outer layers observe without coupling.
4. **`telegramId` is the durable identity.** Several new features (reconnect, hand history, admin grants) require migrating the `playerToTable` map and `userStorage` lookups to be keyed by `telegramId` rather than `socketId`. This is a cross-cutting refactor and must land early.
5. **Shared types in `types/index.ts` remain the contract.** Any new socket event, payload, or DB-adjacent shape is added there first.
6. **Admin is a separate surface, not a superuser overlay.** Admin auth is orthogonal to Telegram initData. See §6.
7. **Dev bypasses gated by an explicit env var, not by `NODE_ENV` alone.** Easier to reason about, easier to lock down.

---

## 1. Feature Integration Map

Each feature below lists: **purpose**, **new code**, **modified code**, **data flow**, **risks/dependencies**.

### 1.1 Avatar System (20 animal images)

**Purpose:** Random-on-signup avatar; user can re-pick from a gallery in profile; replaces any Telegram avatar reference.

**New code:**
- `client/src/assets/avatars/` — 20 PNG/WebP files (e.g. `avatar-01.webp` … `avatar-20.webp`). Bundled with the Vite build; no network fetch, no CDN, no object store.
- `client/src/components/AvatarPicker.tsx` — modal/grid selector used in onboarding and profile. Neon Strip styled (green border on selected, dashed on unselected — reusing tokens from `SeatsDisplay`).
- `types/index.ts` — extend `UserProfile`: `avatarId: number` (1..20). Deprecate `avatarUrl` field for player-chosen avatars; reuse it only if the admin later grants custom art.
- `client/src/utils/avatars.ts` — `avatarPath(id: number): string` mapping id → bundled asset path. Keeps server agnostic of file names.

**Modified code:**
- `prisma/schema.prisma` — add `avatarId Int @default(0)` on `User` (0 = unset; randomize at first login). Migration: `add_avatar_id`.
- `server/db/UserRepository.ts` — `findOrCreate` randomizes `avatarId` from 1..20 on insert; `updateProfile` accepts `avatarId` and validates range.
- `server/middleware/auth.ts` — no change (avatarId is populated by `findOrCreate`).
- `server/index.ts` — the existing `profile:update` socket event gains `avatarId` in its accepted payload; validates 1..20.
- `client/src/components/SeatsDisplay.tsx` — `Avatar` sub-component resolves `player.avatarId` via `avatarPath()` instead of rendering the initial-letter fallback. Keep letter fallback only for `avatarId === 0` (shouldn't occur after migration).
- `types/index.ts` — `Player` gains `avatarId: number` so it propagates to every snapshot; populated by `Game.addPlayer` from the `TelegramUser` session.
- `client/src/pages/ProfileSettings.tsx` — embed `AvatarPicker`.
- `client/src/pages/MainMenu.tsx` or dedicated `FirstTimeOnboarding.tsx` — "pick your avatar" step if `avatarId === 0` (belt-and-braces; should be set server-side already).

**Data flow:** profile change → client `profile:update({avatarId})` → server validates → `UserRepository.updateProfile` → new `TelegramUser` cached in `userStorage` → next `getStateForPlayer` projection includes new `avatarId` for every seat where this player sits → client re-renders seat.

**Risks:** (a) player changes avatar mid-hand — must propagate to `Player.avatarId` in the live `Game` instance, not just DB; add `Game.updatePlayerAvatar(telegramId, avatarId)` forwarder. (b) Asset weight — keep total <300 KB (WebP, ~10-15 KB each).

---

### 1.2 Hand History

**Purpose:** Durable, queryable log of completed hands for the profile "hand history" tab; configurable depth (e.g. last 50 shown).

**New code:**
- `prisma/schema.prisma` — `HandHistory` model (see `.planning/research/reconnect-and-crash-safety.md` §5 for the exact schema). One row **per participating player per hand**, not one row per hand — makes "my hands" queries a simple indexed lookup.
- `server/db/HandHistoryRepository.ts` — `recordHand(entries: HandHistoryEntry[])` batch-inserts; `getForUser(telegramId, limit)` reads by `telegramId, playedAt desc`.
- `types/index.ts` — `HandHistoryEntry`, `HandHistorySummary` types. Two socket events: `handHistory:get({limit})` and `handHistory:result({entries})`.
- `client/src/pages/ProfileSettings.tsx` or new `ProfileHistory.tsx` — new tab/section rendering history list; lazy-fetches on view mount.

**Modified code:**
- `server/Game.ts` — **do NOT write to DB from Game.** Add a third callback: `setOnHandComplete(cb: (result: HandResult) => void)`. `HandResult` is a shared type carrying everything needed to build the history rows: per-player delta, pot size, hole cards (for surviving hands that saw showdown), community cards, winner IDs.
- `server/models/Table.ts` — subscribe to `game.setOnHandComplete`, forward to an outer callback.
- `server/index.ts` — in the Table callbacks, call `handHistoryRepository.recordHand(...)` (async, fire-and-forget with error logging). Same hook also triggers the **chip-checkpoint write** for crash safety (§1.5).
- `server/index.ts` — add `handHistory:get` socket handler, `validateInitData`-gated, returns at most 200 rows.

**Data flow:** `Game.showdown()` finishes → fires `onHandComplete(result)` → `Table` bubbles up → `server/index.ts` batch-writes N rows to `HandHistory` AND updates `currentChips` for surviving seated players in one transaction → done. Profile page mount → `handHistory:get` → server query → `handHistory:result` → render.

**Risks:** (a) hole-card privacy — only record hole cards for hands the player saw to showdown (or their own, always). Folded opponents' hole cards must NOT be in the history row. (b) Write volume — at peak 6 tables × ~60 hands/hr × 4 players = ~1440 rows/hr. PostgreSQL handles this trivially; index `(telegramId, playedAt desc)` keeps reads fast.

---

### 1.3 Action Bubbles

**Purpose:** Floating popup over a player's seat announcing their action: "Fold", "Call 100", "Raise to 500", "Check", "All-in 2000". Ephemeral; ~1.5s fade.

**New code:**
- `types/index.ts` — `PlayerAction` event payload: `{ seatIndex, telegramId, action: 'fold'|'check'|'call'|'raise'|'allIn', amount?: number, timestamp: number }`. New server event `playerAction` in `ExtendedServerEvents`.
- `client/src/components/ActionBubble.tsx` — absolute-positioned popup anchored to a seat element. Neon Strip styled (red for fold, cyan for check/call, amber for raise, orange for all-in — matches `NEON` tokens in `SeatsDisplay`).
- `client/src/hooks/useActionBubbles.ts` — buffers the last action per seat with TTL and a queue (in case two bubbles would race — unlikely but defensive). Provides `bubbles: Map<seatIndex, ActionBubbleState>` to the table view.

**Modified code:**
- `server/Game.ts` — add a **second new callback** `setOnPlayerAction(cb: (a: PlayerAction) => void)`. Fired from within `fold/check/call/raise/allIn` right after state mutation, before `onStateChange`. Keep `Game` pure: it fires the callback, does not emit.
- `server/models/Table.ts` — wire up the callback.
- `server/index.ts` — in the Table action wiring, broadcast `io.to(tableId).emit('playerAction', payload)`. This is a room-wide broadcast (action is public info); unlike `state` which is per-player.
- `client/src/App.tsx` — listen for `playerAction` and push into the `useActionBubbles` hook state.
- `client/src/components/Table.tsx` (or `SeatsDisplay.tsx`) — render `<ActionBubble>` per active bubble, absolutely positioned over the seat's screen position.

**Data flow:** player acts → `Game` mutates → `onPlayerAction` fires → server broadcasts to table room → every client in the room receives the bubble event → `state` snapshot follows ~immediately via existing `updateTableState`. The two are independent — the bubble is a side channel for UX polish; the snapshot remains authoritative.

**Risks:** (a) Bubble arrives before snapshot — fine, bubble is decorative. (b) Bubble arrives after snapshot — also fine, display for 1.5s from arrival. (c) Auto-fold via turn timer — `Game.startTurnTimer`'s timeout path must also fire `onPlayerAction` with `action: 'fold'`.

---

### 1.4 Reconnect Logic

**Purpose:** Restore seat, chips, hole cards, turn state on socket reconnect.

**New code:**
- `server/SessionStore.ts` — in-memory map keyed by `telegramId` → `{ socketId, tableId, seat, disconnectedAt, graceTimer }`. Methods: `bind`, `unbind`, `markDisconnected`, `resume`, `evictAfterGrace`.
- `server/graceTimers.ts` (or colocate in `SessionStore`) — the 30s mid-hand / 120s between-hand eviction timers.
- `client/src/hooks/useReconnect.ts` — stores rotating `sessionToken` in `localStorage` (key `nr.sess`); includes it in `io(..., { auth: {...} })`; surfaces a "reconnecting…" UI state.

**Modified code:**
- `server/TableManager.ts` — **key shift:** `socketIdToTableId: Map<string,string>` becomes `telegramIdToTableId: Map<string,string>`. `handleDisconnect(socketId)` looks up `telegramId` via `userStorage`, marks session disconnected, starts grace timer — does NOT immediately `leaveTable`.
- `server/models/User.ts` — `userStorage` gains a reverse index `telegramId → socketId` so new sockets can bind to existing session.
- `server/middleware/auth.ts` — on every connection, if a live session exists for the same `telegramId`, disconnect the old socket (`oldSocket.disconnect(true)`) and emit `replacedBySession` to it before accepting the new one.
- `server/index.ts` connect handler — after auth succeeds: `sessionStore.resume(telegramId, newSocketId)` → if a `currentTableId` exists, `socket.join(tableId)`, push `getStateForPlayer` snapshot, cancel grace timer. Emit `sessionResumed` for client UX.
- `client/src/App.tsx` — surfaces reconnect state; on `disconnect` event does not reset game state (keep rendering a "Reconnecting…" overlay instead of punting to menu).
- `types/index.ts` — add events `sessionResumed`, `replacedBySession`, and handshake `auth: { initData, sessionToken }` typing.
- Socket.io server options — enable `connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 }` as a cheap fast-path for short blips. Full snapshot always sent on resume regardless.

**Data flow:** see `.planning/research/reconnect-and-crash-safety.md` §1–3. Summary: disconnect → grace timer starts → new connection with same `initData` → server validates identity, calls `sessionStore.resume`, rejoins socket to table room, pushes full personalised snapshot → client replaces gameState wholesale → resume.

**Risks:** (a) The telegramId-key refactor touches join/leave/disconnect across 3 files and is the single largest structural change in this milestone — plan a dedicated phase slice for it. (b) Double-binding race if initData validation is slow — serialize per-telegramId with a small lock/promise map.

---

### 1.5 Crash Safety

**Purpose:** Persist `currentTableId` + `currentChips` so a server restart doesn't vaporize players' seats or stacks.

**New code:**
- `server/recovery/restoreSessions.ts` — run once at server boot after `initializePredefinedTables` completes. For every `User` with `currentTableId != null`: if the table exists and is enabled, reseat with `currentChips` and `sittingOut=true`; otherwise credit `currentChips` to `balance`, null out session fields.
- Migration `reconnect_and_crash_safety` adding: `currentTableId`, `currentSeat`, `currentChips`, `sessionToken`, `disconnectedAt`, `lastSeenAt` (see research/reconnect-and-crash-safety.md §5).

**Modified code:**
- `server/db/UserRepository.ts` — `setSession(telegramId, {tableId, seat, chips})`, `clearSession(telegramId)`, `checkpointChips(telegramId, chips)`, `findAllActiveSessions()`.
- `server/index.ts` — `joinTable` handler calls `setSession` after buy-in deduction. `leaveTable` / disconnect-eviction calls `clearSession`. The `onHandComplete` hook (already being added for hand history) also calls `checkpointChips` for every seated survivor — single DB round-trip for both writes.
- `server/index.ts` boot — await `restoreSessions()` before `io.listen` so recovered seats are visible to the first connecting client.

**Data flow:** buy-in → chips debited from balance, session row written. Every hand end → `currentChips` re-written to reflect new stack. Leave/cashout → session cleared, balance credited. Server crash → on next boot, `restoreSessions` walks users with non-null `currentTableId`, reseats or refunds.

**Risks:** (a) Partial write if crash occurs between `UserRepository.updateBalance(-buyIn)` and `setSession` — use a single transaction for join. Same for leave. (b) Reseating into a disabled table — `restoreSessions` must check table status; otherwise refund path. (c) Don't checkpoint per-bet — only at hand boundaries (cheaper, correctness unchanged since intra-hand state is void on crash).

---

### 1.6 Admin Panel

**Purpose:** Hidden dashboards + live controls (enable/disable tables, edit params live, kick/ban, grant balance).

**Auth separation — CRITICAL:**
- Admin is **not** a role on `User`. A compromised admin Telegram account must not grant admin powers automatically; likewise a player must not be able to escalate by spoofing an `isAdmin` field.
- Recommendation: **separate admin credentials** — `ADMIN_TOKEN` env var (long random). The admin UI is served from a separate route (`/admin`) gated by either HTTP Basic Auth at nginx or a simple password login that issues a session cookie on the server. Admin's Socket.io namespace `/admin` requires this cookie/token as handshake auth, independent of Telegram initData.
- Alternative (simpler, still acceptable): single `ADMIN_TELEGRAM_IDS` whitelist env var; admin namespace accepts connections only when `initData` user's telegramId is in the list. This couples admin to Telegram account but is trivial to revoke by changing env var. Pick this for MVP; migrate to separate creds post-launch.

**New code:**
- `server/admin/` — new directory.
  - `adminAuth.ts` — middleware checking whitelist.
  - `adminNamespace.ts` — `io.of('/admin')` handlers: `dashboards:subscribe`, `table:disable`, `table:enable`, `table:updateParams`, `user:kick`, `user:ban`, `user:grantBalance`.
  - `metrics.ts` — in-process counters (active players, hands/min, chips-in-play per table) emitted on a 1s interval to subscribed admins.
- `client/src/admin/` — new subtree (separate entry point; could be a separate Vite build or a hidden route in the main SPA gated by `/admin`). Pages: `Dashboard.tsx`, `Tables.tsx`, `Users.tsx`, `Economy.tsx`.
- `types/index.ts` — `AdminClientEvents`, `AdminServerEvents`, `AdminMetricsSnapshot`, `AdminTableCommand`, `AdminUserCommand`.

**Modified code:**
- `server/TableManager.ts` — add `disableTable(id, reason)`, `enableTable(id)`, `updateTableConfig(id, patch)`. Disable = graceful: finish current hand, evict & refund everyone, flip status.
- `server/models/Table.ts` — `status: 'enabled' | 'draining' | 'disabled'`; new hand auto-start respects status.
- `server/db/UserRepository.ts` — `grantBalance(telegramId, delta, reason)` writes an audit row; `banUser(telegramId)` sets a `bannedAt` timestamp.
- `prisma/schema.prisma` — `bannedAt DateTime?` on User; new `AdminAuditLog { id, adminId, action, targetUserId?, payload Json, at }` model.
- `server/middleware/auth.ts` — reject connections where `user.bannedAt != null`.

**Data flow:** Admin opens `/admin` → static HTML loaded → admin connects to `/admin` Socket.io namespace with `initData` → server checks whitelist → subscribes to metrics → receives 1s snapshots. Admin issues a command → server validates → mutates `TableManager` / `UserRepository` → writes audit log → broadcasts `adminActionResult` + optional public `tableClosed`/`kicked` to affected players.

**Risks:** (a) Admin namespace must be 100% separate from the public namespace — never merge event names. (b) Commands must be audit-logged even on failure. (c) Live param edits (e.g. change blinds) must only take effect next hand to avoid mid-hand economic shifts.

---

### 1.7 UI Redesign (Neon Strip tokens)

**Purpose:** Unify every view (home, profile, table list, game room) under Neon Strip; introduce first-position deposit stub; clean up redundant labels on game table.

**Where tokens live — recommendation:**
- **CSS variables in `client/src/styles/neon.css`**, loaded at root. Example: `--nr-red: #ff4757; --nr-cyan: #00e5ff; --nr-amber: #ffab00; --nr-bg-panel: rgba(10,10,14,0.88); --nr-blur: blur(12px);`.
- **Mirrored in `tailwind.config.ts`** under `theme.extend.colors` and `theme.extend.boxShadow` so Tailwind utilities and inline-style `NEON` token objects stay in sync. Both resolve to the same CSS var names.
- **Remove hardcoded hex literals** from `GameControls.tsx` and `SeatsDisplay.tsx` `NEON` objects — replace with `var(--nr-...)` references. This makes theme-adjustment a one-file change.
- **Font & spacing tokens** — add `--nr-fs-xs/sm/md/lg/xl` and `--nr-space-*` for consistency across redesigned pages.

**New code:**
- `client/src/styles/neon.css` — token source of truth.
- `client/src/components/ui/` — atomic Neon Strip primitives extracted from existing seat/controls code: `NeonPanel`, `NeonButton`, `NeonBadge`, `GlowBar`, `NeonDivider`. Each ~30-60 lines. Reused everywhere.
- `client/src/components/DepositStub.tsx` — first-position block on main screen, dashed amber border, `onClick` routes to a `DepositComingSoon.tsx` page that says "Deposits open soon" + a Neon Strip illustration.
- `client/src/pages/TermsOfService.tsx`, `client/src/pages/PrivacyPolicy.tsx`, `client/src/pages/ResponsibleGaming.tsx` — static content pages linked from main menu footer.

**Modified code:**
- `client/src/pages/MainMenu.tsx`, `TableList.tsx`, `ProfileSettings.tsx` — rewrite using new primitives.
- `client/src/components/Table.tsx` — remove top-left phase label, top-right pot label, any debug labels. Pot is already rendered in center via `PotDisplay`; phase is implied by community cards.
- `client/src/components/GameControls.tsx` — replace inline `NEON` hexes with `var(--nr-*)`.
- `client/src/components/SeatsDisplay.tsx` — same token replacement; integrate `avatarId` resolution (§1.1) and `ActionBubble` anchoring (§1.3).
- `tailwind.config.ts` — theme extension with token mirror.

**Data flow:** pure presentation; no backend involvement.

**Risks:** (a) Refactor scope creep — lock the token extraction as its own sub-phase; then rebuild pages in parallel. (b) Regression on `SeatsDisplay` — this file is complex and is touched by avatars, bubbles, and redesign — add Vitest coverage before or during the refactor.

---

### 1.8 Test Suite

**Purpose:** Vitest + React Testing Library; one test file per interactive UI element, scenario coverage.

**New code:**
- `client/vitest.config.ts` — extends `vite.config.ts` (Vitest reads Vite config natively via `defineConfig` + `test` block; no separate config strictly required, but a dedicated file keeps test-only plugins isolated). Use `jsdom` environment.
- `client/src/test/setup.ts` — RTL setup, `@testing-library/jest-dom` matchers, Telegram WebApp global mock, Socket.io-client mock helper.
- `client/src/test/socketMock.ts` — factory producing a fake socket with `emit`/`on`/`off` spies.
- Per-component test files colocated: `SeatsDisplay.test.tsx`, `GameControls.test.tsx`, `ActionBubble.test.tsx`, `AvatarPicker.test.tsx`, `DepositStub.test.tsx`, `Chat.test.tsx`, `DailyBonusButton.test.tsx`, `Card.test.tsx`, `HandDisplay.test.tsx`, `PotDisplay.test.tsx`, plus pages: `MainMenu.test.tsx`, `TableList.test.tsx`, `GameRoom.test.tsx`, `ProfileSettings.test.tsx`.
- Root `package.json` script: `"test": "cd client && vitest run"`, `"test:watch": "cd client && vitest"`.

**Modified code:**
- `client/package.json` — add devDeps: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`.
- `client/vite.config.ts` — no change required; Vitest picks up the config. Optionally add `/// <reference types="vitest" />`.

**Interaction with Vite:** Vitest is Vite-native; it shares the same resolver, aliases, and plugins. The only snag is CSS-in-JS / Tailwind — configure `css: { modules: { classNameStrategy: 'non-scoped' } }` or simply ignore CSS in tests via `css: false` in the Vitest config since tests check behavior, not styles.

**Data flow:** N/A (tests). But each test file that exercises socket-driven components uses `socketMock` to simulate server events and asserts DOM reactions.

**Risks:** (a) Flaky tests around timers (turn ring, bubble fade) — use `vi.useFakeTimers()` and `advanceTimersByTime`. (b) Coverage pressure vs. schedule — target behavior coverage, not line coverage; one happy-path + one edge-case per element is the MVP bar.

---

### 1.9 Observability (Sentry-class + analytics)

**Purpose:** Error tracking server+client; anonymous analytics hooks; responsible-gaming + ToS/Privacy disclaimers.

**Where to wire Sentry:**
- **Server:** `server/observability/sentry.ts` — `Sentry.init({ dsn: process.env.SENTRY_DSN_SERVER, tracesSampleRate: 0.1, integrations: [new ProfilingIntegration()] })`. Imported as the *first* line of `server/index.ts` so it captures boot errors. Wrap the global `uncaughtException`/`unhandledRejection` handlers. Add `Sentry.captureException` into the existing try/catches in `joinTable`, `leaveTable`, `UserRepository` writes. Socket error path: add a middleware `io.use((socket, next) => { try { ... } catch(e) { Sentry.captureException(e); next(e); } })`.
- **Client:** `client/src/observability/sentry.ts` — `Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN, integrations: [Sentry.browserTracingIntegration()], tracesSampleRate: 0.1 })`. Imported in `client/src/index.tsx` before `ReactDOM.createRoot`. Wrap `App.tsx` in `Sentry.ErrorBoundary`.
- **PII scrub:** `beforeSend` hook strips `initData` and session tokens from breadcrumbs and request bodies.

**Event emission hooks for analytics:**
- `server/observability/analytics.ts` — `track(event: string, props: Record<string, unknown>)`. MVP implementation: structured `console.log` with JSON (so it's already compatible with any log-based analytics pipeline) OR a thin HTTP POST to a self-hosted PostHog/Umami. Decide at phase-research time; the abstraction means the call sites are identical.
- Event taxonomy (call-site list):
  - `user.signup` — on `UserRepository.findOrCreate` insert path.
  - `user.dailyBonus.claimed` — in `claimDailyBonus` success.
  - `table.joined` / `table.left` — socket layer.
  - `hand.completed` — in the new `onHandComplete` hook.
  - `session.reconnected` — in `SessionStore.resume`.
  - `admin.action` — in admin namespace, with action name.
- All events use a stable *hashed* `userId` (sha256 of `telegramId`), never raw telegramId. Anonymous by construction.

**Responsible gaming & compliance:**
- New pages `ResponsibleGaming.tsx`, `TermsOfService.tsx`, `PrivacyPolicy.tsx` (already listed in §1.7).
- First-launch consent modal (one-time, persisted via `localStorage` key `nr.consent.v1`) before entering the main menu.
- Footer links on main menu.

**Modified code:**
- `server/index.ts` — Sentry init at top; `track()` calls at event sites.
- `client/src/index.tsx` — Sentry init at top; `<ErrorBoundary>` wrap.
- `client/src/App.tsx` — consent gate.
- `.env.example` — `SENTRY_DSN_SERVER`, `VITE_SENTRY_DSN`, `ANALYTICS_ENDPOINT` (optional).

**Risks:** (a) PII leakage — the `beforeSend` scrub is non-optional. (b) Sentry costs at scale — sample rates 0.1 for traces, 1.0 for errors.

---

### 1.10 Disable Dev-Mode Auth Bypass in Prod

**Purpose:** Ensure the `devId` query-param / empty-initData bypass in `server/middleware/auth.ts` is unreachable in a production build.

**Strategy — env-var gating, not `NODE_ENV` alone:**
- Introduce `ALLOW_DEV_AUTH` env var (default `"false"`). The bypass path activates **only** if `ALLOW_DEV_AUTH === "true"` **AND** `NODE_ENV !== "production"`. Two locks, both must be open.
- Production container omits `ALLOW_DEV_AUTH` entirely; local `.env` sets `ALLOW_DEV_AUTH=true`.
- Also: dead-code the bypass in prod bundles — wrap the bypass block in `if (process.env.ALLOW_DEV_AUTH === 'true' && process.env.NODE_ENV !== 'production')`. Tsc won't strip it (runtime-only) but the runtime check is authoritative.
- Add a **startup assertion** in `server/index.ts`: if `NODE_ENV === 'production'` and `ALLOW_DEV_AUTH === 'true'`, log `FATAL: dev auth enabled in production` and `process.exit(1)`. Prevents operator footgun.
- Add a unit test: spawn auth middleware with `NODE_ENV=production`, send empty initData, assert rejection.

**Modified code:**
- `server/middleware/auth.ts` — double-gate.
- `server/index.ts` — startup assertion.
- `.env.example` — document `ALLOW_DEV_AUTH`.

**Risks:** Minimal — the double-gate is defensive. The startup assertion is the real safety net.

---

## 2. Cross-Cutting Changes (touch many files)

These changes are prerequisites for several features and should be sequenced early.

### 2.1 Key-by-telegramId refactor
- Files: `server/TableManager.ts`, `server/models/User.ts`, `server/index.ts`, `server/models/Table.ts` (where `socketId` is stored on `Player`).
- `Player.socketId` becomes effectively a **current binding**, not identity. Identity everywhere is `telegramId`.
- Enables: reconnect, session resume, admin kick, hand history attribution, analytics.

### 2.2 `Game` callback surface expansion
- `Game.setOnPlayerAction(cb)` — feeds action bubbles.
- `Game.setOnHandComplete(cb)` — feeds hand history + chip checkpoint + analytics `hand.completed`.
- Keeps `Game.ts` pure; socket/DB effects live in `server/index.ts` subscribers.

### 2.3 Shared types additions to `types/index.ts`
- `avatarId` on `Player` and `UserProfile`.
- `PlayerAction`, `HandResult`, `HandHistoryEntry`, `SessionResumed`, `ReplacedBySession`, `AdminMetricsSnapshot`, `AdminTableCommand`, `AdminUserCommand`, `AdminAuditEntry`.
- Handshake `auth: { initData: string; sessionToken?: string }`.

### 2.4 Prisma schema additions
Single migration `v1_mvp_launch` adds: `avatarId`, `currentTableId`, `currentSeat`, `currentChips`, `sessionToken`, `disconnectedAt`, `lastSeenAt`, `bannedAt` on `User`; new `HandHistory` and `AdminAuditLog` models. All nullable / new — zero risk to existing rows.

---

## 3. Suggested Build Order (with dependency reasoning)

The features share non-trivial dependencies. Ordering is driven by three rules:
1. Prerequisites (types, DB, key-by-telegramId refactor) first — everything else depends on them.
2. Non-gameplay polish (branding, tokens, deposit stub, static pages) can run in parallel with server work.
3. Reconnect/crash-safety/admin end the milestone — they exercise every earlier piece.

### Phase A — Foundations (unblock everything)
1. **Shared type additions** (`types/index.ts`) — header change for all subsequent work.
2. **Prisma migration** `v1_mvp_launch` — adds all new columns/tables at once.
3. **Key-by-telegramId refactor** — `TableManager`, `userStorage`, `playerToTable` map, `Player.socketId` rebinding. No behavior change, but unblocks reconnect, admin, hand history.
4. **`Game` callback surface** (`setOnPlayerAction`, `setOnHandComplete`). No consumers yet; ensures downstream work just plugs in.
5. **Dev-auth env-var gate** + startup assertion (§1.10). Small, standalone, belongs with foundations.
6. **Tokens extraction** (§1.7 sub-phase): `neon.css`, Tailwind theme, `ui/` primitives. Unblocks every UI page rewrite.

### Phase B — Design System & Static UI (parallel-izable with Phase A after tokens land)
7. **Page rewrites:** `MainMenu`, `TableList`, `ProfileSettings` using new primitives.
8. **Deposit stub** + `DepositComingSoon` page.
9. **Static compliance pages:** `ResponsibleGaming`, `TermsOfService`, `PrivacyPolicy`, consent modal.
10. **Game table cleanup:** remove redundant labels in `Table.tsx`.
11. **Avatar system** (§1.1) — depends on Phase A migration & types; naturally slots here because it's a UI feature with a thin server change.

### Phase C — Gameplay Additions
12. **Action bubbles** (§1.3) — uses new `onPlayerAction` callback from Phase A.
13. **Hand history** (§1.2) — uses new `onHandComplete` callback + `HandHistory` model from Phase A.
14. **Chip checkpointing** (§1.5, write side) — piggybacks on the same `onHandComplete` hook.

### Phase D — Resilience
15. **Reconnect logic** (§1.4) — `SessionStore`, handshake `sessionToken`, snapshot on resume, grace timers, `replacedBySession` on double-connect. Depends on key-by-telegramId refactor (Phase A) and chip checkpointing (Phase C).
16. **Crash recovery** (§1.5, read side) — `restoreSessions()` at boot. Depends on checkpoint writes working.

### Phase E — Admin & Ops
17. **Admin namespace** (§1.6) — whitelist auth, dashboards, commands, audit log.
18. **Admin UI** — dashboards and controls.
19. **Observability wiring** (§1.9) — Sentry init on both sides, analytics `track()` at the event sites (signup, daily bonus, join/leave, hand completed, reconnect, admin action).

### Phase F — Test Suite (runs *in parallel with* C–E)
20. **Vitest config + test setup** (§1.8).
21. **Per-element test files** — added incrementally alongside each component as it stabilizes in B/C. Hard requirement before phase exit: every interactive element listed in §1.8 has a test file with at least one happy-path and one edge case.

### Final gates
22. **Integration rehearsal**: run the success criteria script from `PROJECT.md` end-to-end on a staging deployment mock.
23. **Production hardening audit**: verify dev-auth assertion triggers, verify no `console.log` leaks initData, verify Sentry `beforeSend` scrub, verify admin whitelist is env-var driven.

---

## 4. Summary Table — New vs Modified

| Area | New Files | Modified Files |
|---|---|---|
| Avatars | `client/src/assets/avatars/*`, `AvatarPicker.tsx`, `utils/avatars.ts` | `schema.prisma`, `UserRepository`, `index.ts`, `SeatsDisplay`, `ProfileSettings`, `types` |
| Hand history | `HandHistoryRepository.ts`, `ProfileHistory.tsx`, `HandHistory` model | `Game.ts` (callback), `Table.ts`, `index.ts`, `types` |
| Action bubbles | `ActionBubble.tsx`, `useActionBubbles.ts` | `Game.ts` (callback), `Table.ts`, `index.ts`, `App.tsx`, `Table.tsx`/`SeatsDisplay`, `types` |
| Reconnect | `SessionStore.ts`, `useReconnect.ts` | `TableManager`, `User.ts`, `auth.ts`, `index.ts`, `App.tsx`, `types`, Socket.io options |
| Crash safety | `recovery/restoreSessions.ts`, migration | `UserRepository`, `index.ts`, `schema.prisma` |
| Admin | `server/admin/*`, `client/src/admin/*`, `AdminAuditLog` model | `TableManager`, `Table.ts`, `UserRepository`, `schema.prisma`, `auth.ts`, `types` |
| UI redesign | `neon.css`, `ui/NeonPanel|Button|Badge|GlowBar`, `DepositStub`, `DepositComingSoon`, static pages | all pages, `Table.tsx`, `GameControls.tsx`, `SeatsDisplay.tsx`, `tailwind.config.ts` |
| Tests | `vitest.config.ts`, `test/setup.ts`, `test/socketMock.ts`, N×`*.test.tsx` | `client/package.json`, `vite.config.ts` |
| Observability | `observability/sentry.ts` (both), `observability/analytics.ts` | `server/index.ts`, `client/src/index.tsx`, `App.tsx`, `.env.example` |
| Dev-auth gate | — | `server/middleware/auth.ts`, `server/index.ts`, `.env.example` |

---

## 5. Open Integration Questions (to resolve in phase-specific research)

1. **Analytics destination** — PostHog self-hosted vs. Umami vs. plain structured logs piped to Grafana. All are compatible with the `track()` abstraction; pick during Phase E.
2. **Admin auth — whitelist vs. separate creds** — MVP choice is whitelist; research whether a minimal password gate (e.g. iron-session cookie) is cheap enough to do now.
3. **Deposit stub deep-link** — does the "coming soon" block link to a Telegram payments sandbox doc or an in-app page? Marketing decision.
4. **Responsible-gaming content** — jurisdiction coverage unclear; may need regionalized disclaimers for eventual real-money phase (out of scope this cycle but write the page extensibly).
5. **Hand history depth** — default shown = 50, stored = unbounded? Or TTL-prune at 1000 rows/user? Decide during Phase C.
6. **Avatar art delivery** — user provides 20 final images at Phase B start. Until then, use placeholder set.

---

*Integration research: 2026-04-14*
