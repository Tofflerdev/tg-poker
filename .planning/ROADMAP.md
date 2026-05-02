# Roadmap — Milestone v1.0 MVP Launch

**Project:** NightRiver (tg-poker)
**Milestone:** v1.0 MVP Launch
**Created:** 2026-04-14
**Granularity:** coarse (6 phases)
**Coverage:** 44/44 requirements mapped

---

## Phases

- [x] **Phase 1: Foundations & Design System** — Shared contracts, Prisma migration, telegramId refactor, Game callbacks, auth hardening, Neon Strip tokens ✓ 2026-04-15
- [ ] **Phase 2: Design System Rollout & Avatars** — Full UI redesign, 20-animal avatar system, deposit stub, compliance/consent pages
- [x] **Phase 3: Gameplay Additions** — Action bubbles, hand history, async write queue, chip checkpointing ✓ 2026-04-22
- [ ] **Phase 4: Resilience** — Reconnect with full-snapshot resume, crash-safe recovery, atomic buy-in
- [x] **Phase 5: Admin, Ops & Observability** — Hidden admin panel, Sentry + PostHog, server-side ToS gate (completed 2026-05-02)
- [ ] **Phase 6: Test Hardening** — Vitest + RTL suite, per-element coverage, scenario tests, CI gate

---

## Phase Details

### Phase 1: Foundations & Design System
**Goal:** Land every structural contract downstream phases depend on — shared types, durable telegramId identity, Game callbacks, a fail-closed auth posture, and Neon Strip design tokens as a single source of truth.
**Depends on:** Nothing (first phase)
**Requirements:** BRAND-03, RESILIENCE-01, RESILIENCE-03, GAME-04, SECURITY-01, SECURITY-02, SECURITY-03
**Success Criteria** (what must be TRUE):
  1. A single `neon.css` + Tailwind theme exposes the Neon Strip palette as CSS variables; new UI consumes the tokens rather than hard-coded literals.
  2. The Prisma migration `v1_mvp_launch` is applied, adding `avatarId`, session/crash-safety columns, `bannedAt`, `tosAcceptedAt`, `tosVersion`, and the `HandHistory` + `AdminAuditLog` tables.
  3. `TableManager`, `userStorage`, and socket mappings are keyed by `telegramId`; a single telegramId can be traced across connect/disconnect cycles.
  4. `Game.ts` exposes `setOnPlayerAction` and `setOnHandComplete` callbacks consumed by `server/index.ts`, with no behavior change to existing gameplay.
  5. Booting with `NODE_ENV=production` plus `ALLOW_DEV_AUTH=true` (or empty `BOT_TOKEN`) exits with code 1; HMAC comparison uses `crypto.timingSafeEqual`; failed validation never fabricates a dev user.
**Plans:** 5 plans

Plans:
- [x] 01-01-PLAN.md — Neon Strip tokens (neon.css + consumer refactor)
- [x] 01-02-PLAN.md — Prisma v1_mvp_launch migration
- [x] 01-03-PLAN.md — Game.ts callback seams (setOnPlayerAction/setOnHandComplete)
- [x] 01-04-PLAN.md — telegramId identity refactor + eviction scaffold
- [x] 01-05-PLAN.md — Auth hardening (timingSafeEqual, fail-closed boot)

### Phase 2: Design System Rollout & Avatars
**Goal:** Every player-facing page is redesigned in Neon Strip, new users receive an animal avatar atomically on signup and can re-pick it, and first-launch ToS/Privacy/RG consent is shipped.
**Depends on:** Phase 1
**Requirements:** BRAND-01, BRAND-02, UI-01, UI-02, UI-03, UI-04, UI-05, AVATAR-01, AVATAR-02, AVATAR-03, AVATAR-04, DEPOSIT-01, DEPOSIT-02, COMPLIANCE-01, COMPLIANCE-02, COMPLIANCE-03, COMPLIANCE-05, PROFILE-01
**Success Criteria** (what must be TRUE):
  1. A user launches the Mini App and sees a cohesively redesigned Main Menu, Table List, Profile/Settings, and Game Room chrome — all in Neon Strip, using shared `ui/` primitives, with redundant table/phase/pot labels removed.
  2. A brand-new user completes first-launch auth and is atomically assigned one of 20 curated animal avatars (no client race); the avatar appears on Main Menu, Profile, and `SeatsDisplay`.
  3. A user can open Profile → Avatar tab, pick a different animal, and see the change propagate everywhere the app shows their image (replacing the Telegram avatar).
  4. A first-time user cannot `joinTable` until they tap Accept on the consent screen; ToS/Privacy/Responsible Gaming pages are reachable from menu and settings; existing users see a non-blocking reminder banner.
  5. Main Menu shows a first-position Deposit block that opens an in-app "Coming soon" page with no external links or payment SDK.
**Plans:** TBD
**UI hint**: yes

### Phase 3: Gameplay Additions
**Goal:** Enrich gameplay with action bubbles, persistent hand history, and hand-boundary chip checkpointing — all driven off the Phase 1 Game callbacks, with writes off the hot path.
**Depends on:** Phase 1
**Requirements:** GAME-01, GAME-02, GAME-03, PROFILE-02, PROFILE-03, PROFILE-04
**Success Criteria** (what must be TRUE):
  1. On every player action, a floating bubble (Fold / Check / Call N / Bet N / Raise to N / All-in) renders over the correct seat with ~800–1000 ms minimum display, FIFO queueing prevents overlap, and `prefers-reduced-motion` is honored.
  2. Hand completion writes a `HandHistory` row per participating player through an async batched queue; the game loop never blocks on DB I/O.
  3. A player opens Profile → Hand History and sees their last 50 hands (date, table, board, result, net delta); only their own hole cards appear at showdown, never at non-showdown.
  4. A retention job removes hand history older than 90 days; profile views never expose other players' hole cards at non-showdown.
  5. On each `onHandComplete`, `currentChips`, `currentTableId`, and `currentSeat` are written to the `User` row; mid-hand ephemeral state (hole cards, bets, timers) is never persisted.
**Plans:** TBD

### Phase 4: Resilience
**Goal:** A player who disconnects mid-hand or between hands can close and reopen the Mini App and resume their seat, chips, hole cards, and turn state; the server recovers sessions cleanly on boot without restoring in-flight hand state.
**Depends on:** Phase 1, Phase 3
**Requirements:** RESILIENCE-02, RESILIENCE-04, RESILIENCE-05, RESILIENCE-06, RESILIENCE-07
**Success Criteria** (what must be TRUE):
  1. A player mid-hand closes their client, reopens within 30 s, and sees their seat, chip stack, hole cards, and turn timer restored from a full server snapshot (the handshake always re-verifies `initData` HMAC; session token only disambiguates).
  2. Opening a second client with the same telegramId evicts the first with a `replacedBySession` event before the new socket is bound — no split-brain state.
  3. Clients show a "Reconnecting…" overlay during disconnect; grace window is 30 s mid-hand and 120 s between hands before the server marks the player sat-out / vacated.
  4. On server boot, persisted sessions either reseat the player sitting-out at their table or refund `currentChips` back to `balance` and clear the session columns; no in-flight hand state is ever restored.
  5. Buy-in and cashout transitions use atomic SQL (`UPDATE ... WHERE balance >= :n`) and refuse on insufficient funds — concurrent reconnects cannot double-spend.
**Plans:** TBD

### Phase 5: Admin, Ops & Observability
**Goal:** Ship the hidden admin surface (dashboards + live controls with mandatory audit logging), turn on error tracking and anonymous analytics with PII scrubbing, and enforce the ToS gate server-side on `joinTable`.
**Depends on:** Phase 1, Phase 2, Phase 4
**Requirements:** ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04, ADMIN-05, ADMIN-06, OBS-01, OBS-02, OBS-03, OBS-04, SECURITY-04, COMPLIANCE-04
**Success Criteria** (what must be TRUE):
  1. An allowlisted admin connects to the `/admin` Socket.io namespace (namespace middleware re-runs `initData` HMAC and checks `ADMIN_TELEGRAM_IDS`), opens the lazy-loaded admin UI, and sees an "ADMIN MODE" banner plus live dashboards for tables, users, economy, and recent errors — with no admin affordance in the player UI.
  2. An admin can enable/disable a table, drain it, edit blinds/buy-in (applied next hand), kick a user, ban a user, and grant a positive or negative balance delta — and every mutation writes an `AdminAuditLog` row BEFORE commit; a failed audit write aborts the mutation.
  3. Sentry (react + node) initializes with a shared DSN, environment + release tags, Replay with privacy masking, and a `beforeSend` scrubber that strips `initData`, `sessionToken`, and raw `telegramId` from events, logs, and analytics.
  4. PostHog (client + server) emits the fixed event taxonomy (`user_signed_up`, `daily_bonus_claimed`, `table_joined`, `table_left`, `hand_completed`, `reconnect_succeeded`, `reconnect_failed`, `admin_action`, `error_shown`) using `sha256(telegramId)` — raw telegramId never leaves the server.
  5. A new user with `tosAcceptedAt IS NULL` receives a typed error from the server-side `joinTable` handler that routes them to the consent screen; grandfathered users pass through.
**Plans:** 6/6 plans complete
**UI hint**: yes

### Phase 6: Test Hardening
**Goal:** Ship a Vitest + React Testing Library suite with per-element coverage and scenario tests, wired as a hard CI exit gate against a prod-like Vite build.
**Depends on:** Phase 2, Phase 3, Phase 4, Phase 5
**Requirements:** TEST-01, TEST-02, TEST-03, TEST-04
**Success Criteria** (what must be TRUE):
  1. `npm test` runs Vitest + `@testing-library/react` + jsdom from a shared setup that mocks `Telegram.WebApp` and the Socket.io client.
  2. Every interactive UI element (button, input, tab, picker) has at least one co-located `*.test.tsx` file covering happy-path interaction.
  3. Scenario tests cover joining a table, fold/call/raise, disconnect+reconnect UI states, avatar selection, ToS gate, and deposit-stub navigation.
  4. CI runs the suite against a prod-like Vite build and blocks phase exits for any phase that ships UI.
**Plans:** TBD

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundations & Design System | 5/5 | Complete | 2026-04-15 |
| 2. Design System Rollout & Avatars | 0/0 | Not started | — |
| 3. Gameplay Additions | 6/6 | Complete | 2026-04-22 |
| 4. Resilience | 5/7 | In progress | — |
| 5. Admin, Ops & Observability | 6/6 | Complete   | 2026-05-02 |
| 6. Test Hardening | 0/0 | Not started | — |

---

*Last updated: 2026-04-22 — Phase 3 complete (automated verification passed; human UAT tracked in 03-HUMAN-UAT.md)*
