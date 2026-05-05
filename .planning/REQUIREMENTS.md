# Requirements — Milestone v1.0 MVP Launch

**Project:** NightRiver (tg-poker)
**Milestone:** v1.0 MVP Launch
**Defined:** 2026-04-14

Requirements are grouped by category. Each has a unique `CATEGORY-NN` ID used by `ROADMAP.md` and phase artifacts for traceability.

---

## v1.0 Requirements (Active)

### BRAND — Branding & Identity

- [ ] **BRAND-01** — Final project name (replaces "NightRiver" codename) is chosen and adopted across UI copy, manifest, and bot handle references.
- [ ] **BRAND-02** — Logo asset (SVG + PNG/ICO) is produced and rendered on main menu and Telegram Mini App launch splash.
- [ ] **BRAND-03** — Neon Strip palette is extracted from `NEON` literals into a single source of truth (`neon.css` CSS vars + Tailwind theme), consumed by all new UI.

### UI — Full Neon Strip UI Redesign

- [ ] **UI-01** — Main menu page is redesigned in Neon Strip (Deposit block in first position; daily bonus; table list entry; profile entry).
- [ ] **UI-02** — Table list page is redesigned in Neon Strip with stake tier, player count, and buy-in clearly displayed.
- [ ] **UI-03** — Profile / Settings page is redesigned in Neon Strip with tabs for profile, avatar, and hand history.
- [ ] **UI-04** — Game room non-table chrome (header/footer/overlays) is redesigned in Neon Strip; redundant top-left table/phase label and top-right pot label are removed.
- [ ] **UI-05** — Redesign uses the `frontend-design` skill and shared `ui/` primitives (Button, Card, Tab, Badge) derived from the Neon Strip tokens.

### AVATAR — Custom Avatar System

- [x] **AVATAR-01** — 20 curated anthropomorphic-animal-playing-poker avatar assets ship as hashed Vite bundle assets (WebP).
- [x] **AVATAR-02** — New users are assigned a random avatar on first successful Telegram auth, atomically (UPDATE WHERE avatarId IS NULL — no client-side race).
- [x] **AVATAR-03** — User can re-pick their avatar from the Profile / Avatar tab; the choice replaces the Telegram avatar everywhere the app shows a user image.
- [x] **AVATAR-04** — `SeatsDisplay` renders each seat's avatar (falling back to initial-letter only if a user somehow has no `avatarId`).

### PROFILE — Profile Expansion & Hand History

- [ ] **PROFILE-01** — Profile page shows existing stats (balance, handsPlayed, handsWon, totalWinnings, biggestPot) plus display name, avatar, and daily-bonus eligibility state.
- [ ] **PROFILE-02** — Hand history is persisted on hand completion without blocking the game loop (async/batched write queue).
- [x] **PROFILE-03** — Profile shows the user's **last 50 hands** (date, table, hole cards at showdown only, board, result, net delta).
- [x] **PROFILE-04** — Hand history older than **90 days** is removed by a retention job; profile view never exposes other players' hole cards at non-showdown.

### DEPOSIT — Deposit Stub

- [ ] **DEPOSIT-01** — Main menu shows a first-position "Deposit" block styled in Neon Strip.
- [ ] **DEPOSIT-02** — Tapping Deposit opens an in-app "Coming soon" page; no external links, no payment SDK.

### GAME — Game Table Enhancements

- [x] **GAME-01** — Redundant labels on the game room (top-left table/phase, top-right pot) are removed.
- [x] **GAME-02** — On every player action, a floating "action bubble" appears over that seat (Fold / Check / Call N / Bet N / Raise to N / All-in) using `motion/react`, with FIFO queueing so bubbles never stack or overlap.
- [x] **GAME-03** — Bubble duration honors per-action minimum display (~800-1000 ms) and respects `prefers-reduced-motion`.
- [ ] **GAME-04** — `Game.ts` exposes `onPlayerAction` and `onHandComplete` callbacks consumed by `server/index.ts` for broadcasting bubbles, writing history, and checkpointing chips.

### RESILIENCE — Reconnect & Crash Safety

- [ ] **RESILIENCE-01** — `User` persistence is extended with `currentTableId`, `currentSeat`, `currentChips`, `sessionToken`, `disconnectedAt`, `lastSeenAt` (additive Prisma migration `v1_mvp_launch`).
- [x] **RESILIENCE-02** — Economic state (`currentChips`, `currentTableId`, `currentSeat`) is written at hand boundaries via `onHandComplete`; mid-hand ephemeral state (hole cards, bets, timers) is never persisted.
- [ ] **RESILIENCE-03** — Telegram identity is the durable key: `TableManager`, `userStorage`, and socket mappings are refactored to key by `telegramId`, not `socketId`.
- [x] **RESILIENCE-04** — On socket reconnect, the server re-verifies `initData` HMAC every time (session token disambiguates connections, it never authenticates), emits `replacedBySession` to any prior socket, evicts it, and sends a full `GameState` snapshot including the player's own hole cards.
- [x] **RESILIENCE-05** — Client shows a "Reconnecting…" overlay during disconnect with a grace window of 30 s mid-hand / 120 s between hands before the server treats the player as sat-out / vacated.
- [x] **RESILIENCE-06** — On server boot, a recovery module reads persisted session rows and either reseats the player sitting-out at their table, or refunds `currentChips` to `balance` and clears the session columns. Never restores in-flight hand state.
- [x] **RESILIENCE-07** — Buy-in / cashout balance transitions use atomic SQL (`UPDATE ... WHERE balance >= :n`) and refuse on insufficient funds (no double-spend on concurrent reconnects).

### SECURITY — Production Auth Hardening

- [ ] **SECURITY-01** — Dev-mode `initData` bypass is gated on BOTH `ALLOW_DEV_AUTH=true` AND `NODE_ENV !== 'production'`; either condition absent means no bypass.
- [ ] **SECURITY-02** — On server start, if `NODE_ENV=production` AND (`ALLOW_DEV_AUTH=true` OR `BOT_TOKEN` is empty), the process logs a fatal error and exits with code 1.
- [ ] **SECURITY-03** — HMAC comparison uses `crypto.timingSafeEqual`; `validateInitData` never returns a fabricated dev user on HMAC failure.
- [x] **SECURITY-04** — Telegram `initData`, `sessionToken`, and raw `telegramId` are scrubbed from Sentry events, structured logs, and analytics via a `beforeSend` hook / log redactor.

### ADMIN — Hidden Admin Panel

- [x] **ADMIN-01** — Admins are identified by an `ADMIN_TELEGRAM_IDS` env allowlist; no `isAdmin` database flag. Admin access is denied by default.
- [x] **ADMIN-02** — Admin lives on a separate `io.of('/admin')` Socket.io namespace with namespace-level middleware that re-runs `initData` HMAC and checks allowlist membership.
- [x] **ADMIN-03** — Admin UI is a lazy-loaded client subtree (recharts + react-hook-form + zod) with a distinct "ADMIN MODE" banner; it is not linked from the player UI and has no server-side affordance to regular users.
- [x] **ADMIN-04** — Admin can view live dashboards: active tables (player count, stakes, hand-in-progress), active users, economy (total chips in play), and recent errors.
- [x] **ADMIN-05** — Admin can: enable/disable a table, drain a table (block new seats, finish current hand), edit table parameters (blinds/buy-in — applied at next hand), kick a user (disconnect + clear session), ban a user (sets `bannedAt`), and grant balance (positive or negative delta).
- [x] **ADMIN-06** — Every admin mutation writes an `AdminAuditLog` row (admin telegramId, action, target, before/after, timestamp) BEFORE the mutation commits; failed audit write aborts the mutation.

### TEST — UI Test Suite

- [x] **TEST-01** — Vitest + `@testing-library/react` + jsdom is configured and runs from `npm test`; shared test setup mocks `Telegram.WebApp` and Socket.io client.
- [x] **TEST-02** — Every interactive UI element (button, input, tab, picker) has at least one co-located `*.test.tsx` file covering its happy-path interaction.
- [x] **TEST-03** — Scenario tests cover: joining a table, folding/calling/raising, disconnect+reconnect UI states, avatar selection, ToS gate, and deposit-stub navigation.
- [ ] **TEST-04** — CI runs the suite against a prod-like Vite build; the test suite is a hard phase-exit gate for phases that ship UI.

### OBS — Observability

- [x] **OBS-01** — `@sentry/react` + `@sentry/node` are initialized with a shared DSN, environment tag (`development` / `production`), release tag, and the PII scrubber from SECURITY-04.
- [x] **OBS-02** — Sentry Replay is enabled (errors sampled, privacy-masked) to aid reconnect-bug reproduction.
- [x] **OBS-03** — PostHog Cloud is initialized on both server (`posthog-node`) and client (`posthog-js`) with anonymous product analytics. User identity is `sha256(telegramId)`; raw telegramId never leaves the server.
- [x] **OBS-04** — A `track()` abstraction emits a fixed event taxonomy: `user_signed_up`, `daily_bonus_claimed`, `table_joined`, `table_left`, `hand_completed`, `reconnect_succeeded`, `reconnect_failed`, `admin_action`, `error_shown`.

### COMPLIANCE — Responsible Gaming, ToS & Privacy

- [ ] **COMPLIANCE-01** — ToS, Privacy Policy, and Responsible Gaming pages are static, reachable from the main menu and settings, and styled in Neon Strip.
- [ ] **COMPLIANCE-02** — New users must tap "Accept" on a first-launch consent screen before `joinTable` is honored; acceptance sets `tosAcceptedAt` + `tosVersion` on the user row.
- [ ] **COMPLIANCE-03** — Existing users are grandfathered: they see a non-blocking banner/modal prompting acceptance but are not prevented from playing.
- [x] **COMPLIANCE-04** — The server-side `joinTable` handler rejects users with `tosAcceptedAt IS NULL` that were created after the ToS gate shipped (new-user enforcement), with a client error that routes to the consent screen.
- [ ] **COMPLIANCE-05** — Responsible-gaming page displays: virtual-chip disclaimer, "not for real money" statement, daily-bonus-only economy description, and (informational) "take a break" guidance — no forced lockouts.

---

## Future Requirements (deferred to v1.1+)

- Street-by-street hand replayer on profile.
- 60-minute session-duration "take a break" reminder toast.
- Avatar unlock / streak rewards.
- Telegram bot push notifications (hand results, daily bonus ready).
- Chat moderation / profanity filter.
- Per-stake custom reconnect grace windows.
- Admin DB-flag grant flow (admin-grants-admin).
- Admin password+cookie auth (upgrade from env allowlist).
- Self-hosted PostHog migration.

---

## Out of Scope (this milestone)

- **Deploy infrastructure** — Dockerfile, nginx, HTTPS, CI/CD. Explicitly deferred by user; handled separately.
- **Real-money payments** — Deposit is a stub. No payment SDK, bank rails, KYC, or wallet integration.
- **Tournaments, leaderboards, friends, private tables.**
- **Mobile-native wrappers (iOS/Android apps)** — Telegram Mini App only.
- **Free-form avatar upload** — only the 20 curated assets are selectable.
- **Player-created tables** — the 6 predefined tables remain the universe.
- **Client-gated admin role toggle** — rejected as insecure.
- **Forced responsible-gaming lockouts** — virtual-chip play; disclaimers only.

---

## Requirement Quality

All requirements above are:
- **Specific and testable** — each maps to observable UI/server behavior.
- **User-centric where applicable** — phrased as "User can / New user is / Server rejects…".
- **Atomic** — single capability per ID.
- **Independent where possible** — explicit dependencies called out in ROADMAP.md traceability.

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| BRAND-01 | Phase 2 | Pending |
| BRAND-02 | Phase 2 | Pending |
| BRAND-03 | Phase 1 | Pending |
| UI-01 | Phase 2 | Pending |
| UI-02 | Phase 2 | Pending |
| UI-03 | Phase 2 | Pending |
| UI-04 | Phase 2 | Pending |
| UI-05 | Phase 2 | Pending |
| AVATAR-01 | Phase 2 | Complete |
| AVATAR-02 | Phase 2 | Complete |
| AVATAR-03 | Phase 2 | Complete |
| AVATAR-04 | Phase 2 | Complete |
| PROFILE-01 | Phase 2 | Pending |
| PROFILE-02 | Phase 3 | Pending |
| PROFILE-03 | Phase 3 | Complete |
| PROFILE-04 | Phase 3 | Complete |
| DEPOSIT-01 | Phase 2 | Pending |
| DEPOSIT-02 | Phase 2 | Pending |
| GAME-01 | Phase 3 | Complete |
| GAME-02 | Phase 3 | Complete |
| GAME-03 | Phase 3 | Complete |
| GAME-04 | Phase 1 | Pending |
| RESILIENCE-01 | Phase 1 | Pending |
| RESILIENCE-02 | Phase 3 | Complete |
| RESILIENCE-03 | Phase 1 | Pending |
| RESILIENCE-04 | Phase 4 | Complete |
| RESILIENCE-05 | Phase 4 | Complete |
| RESILIENCE-06 | Phase 4 | Complete |
| RESILIENCE-07 | Phase 4 | Complete |
| SECURITY-01 | Phase 1 | Pending |
| SECURITY-02 | Phase 1 | Pending |
| SECURITY-03 | Phase 1 | Pending |
| SECURITY-04 | Phase 5 | Complete |
| ADMIN-01 | Phase 5 | Complete |
| ADMIN-02 | Phase 5 | Complete |
| ADMIN-03 | Phase 5 | Complete |
| ADMIN-04 | Phase 5 | Complete |
| ADMIN-05 | Phase 5 | Complete |
| ADMIN-06 | Phase 5 | Complete |
| TEST-01 | Phase 6 | Complete |
| TEST-02 | Phase 6 | Complete |
| TEST-03 | Phase 6 | Complete |
| TEST-04 | Phase 6 | Pending |
| OBS-01 | Phase 5 | Complete |
| OBS-02 | Phase 5 | Complete |
| OBS-03 | Phase 5 | Complete |
| OBS-04 | Phase 5 | Complete |
| COMPLIANCE-01 | Phase 2 | Pending |
| COMPLIANCE-02 | Phase 2 | Pending |
| COMPLIANCE-03 | Phase 2 | Pending |
| COMPLIANCE-04 | Phase 5 | Complete |
| COMPLIANCE-05 | Phase 2 | Pending |

**Coverage:** 44/44 requirements mapped (100%).
