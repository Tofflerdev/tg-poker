# Project Research Summary

**Project:** NightRiver (codename) — Telegram Mini App poker
**Domain:** 6-max Texas Hold'em cash-game poker (virtual chips) — brownfield feature additions
**Milestone:** v1.0 MVP Launch
**Researched:** 2026-04-14
**Confidence:** HIGH (existing codebase facts + verified stack versions); MEDIUM on niche Telegram Mini App + social-casino RG norms

---

## Executive Summary

NightRiver is a brownfield Telegram Mini App poker client. The core poker engine, multi-table orchestration, Telegram `initData` HMAC auth, PostgreSQL persistence, Socket.io transport, and the "Neon Strip" design language on `GameControls` / `SeatsDisplay` are already shipping. The v1.0 MVP cycle adds 12 features that bring the rest of the product up to the Neon Strip quality bar and to parity with regulated-room UX expectations: branding, a full UI redesign, a 20-animal avatar system, profile + hand history, a deposit stub, action bubbles, game-table cleanup, reconnect + crash safety, production auth hardening, a hidden admin panel, a Vitest/RTL test suite, and observability + responsible-gaming disclaimers. **Deploy infrastructure is explicitly out of scope this cycle.**

The recommended approach keeps the existing architectural invariants intact — Socket.io is the sole gameplay transport, `Game.ts` stays pure and grows only a callback surface (`onPlayerAction`, `onHandComplete`), and `types/index.ts` remains the contract — while layering a small set of additive libraries: `motion` (formerly framer-motion) for action bubbles, `vitest` + `@testing-library/react` for the test suite, `@sentry/{react,node}` + `posthog-{js,node}` for observability, and `react-hook-form` + `zod` + `recharts` scoped to the admin panel. A single Prisma migration (`v1_mvp_launch`) adds `avatarId`, session/crash-safety columns, `bannedAt`, `tosAcceptedAt`, and the new `HandHistory` + `AdminAuditLog` tables. A cross-cutting **key-by-telegramId refactor** (replacing socketId-keyed maps) is the linchpin prerequisite for reconnect, admin, hand history, and analytics — it must land early.

The headline risks are all security- and state-integrity-shaped: the existing dev-mode auth bypass must become unreachable in production (fail-closed gate + boot assertion), reconnect must re-verify HMAC on every connection (session tokens disambiguate, they do not authenticate), crash recovery must persist economic state only (never mid-hand ephemeral state), admin must live on a separate Socket.io namespace with env-based allowlist and mandatory audit logging, and hand-history writes must be asynchronous off the game loop. Every one of these maps to a concrete phase below with verification tests.

---

## Key Findings

### Recommended Stack

All **existing** stack choices (Node/Express/Socket.io/React 18/Vite/Tailwind 4/Prisma 7/pokersolver) are validated and carry forward. Additions are scoped and minimal; no global state library, no React Router, no REST layer, no Jest — all explicitly rejected in favor of the current server-authoritative single-socket model.

**Core additions (versions verified 2026-04):**

- **`motion` `^12.38.0`** (was `framer-motion`, rebranded 2025) — action-bubble mount/unmount animations and Neon Strip page transitions. `AnimatePresence` required for exit animations CSS cannot express. Import via `motion/react` for tree-shaking.
- **`vitest` `^4.1.4`** + **`@testing-library/react` `^16.3.0`** + **`@testing-library/jest-dom` `^6.6.3`** + **`@testing-library/user-event` `^14.5.2`** + **`jsdom` `^25.0.1`** — Vite-native test runner; reuses existing Vite 5.3 transform/ESM pipeline; behavior-first component tests, one file per interactive element.
- **`@sentry/react` `^10.48.0`** + **`@sentry/node` `^10.48.0`** + **`@sentry/vite-plugin`** — error tracking on both sides; Replay (masked) for reconnect bug reproduction; `beforeSend` PII scrubber for `initData` and session tokens is non-optional.
- **`posthog-js` `^1.200.0`** + **`posthog-node` `^4.18.0`** — anonymous product analytics (funnel: menu → table list → sit → first hand; retention). Server-side capture required because Socket.io is the primary transport. Events use sha256(telegramId), never raw id.
- **`react-hook-form` `^7.53.0`** + **`@hookform/resolvers` `^3.9.0`** + **`zod` `^3.23.8`** — admin-panel forms only. Zod also validates inbound admin socket payloads server-side; `z.infer` shares types with `types/index.ts`.
- **`recharts` `^2.13.0`** — admin dashboards, lazy-loaded chunk so it never enters the player bundle.
- **`clsx` `^2.1.1`**, **`date-fns` `^4.1.0`** — supporting utilities.

**Prisma schema additions (one migration `v1_mvp_launch`, all nullable/additive):**
- On `User`: `avatarId Int @default(0)`, `currentTableId String?`, `currentSeat Int?`, `currentChips Int?`, `sessionToken String?`, `disconnectedAt DateTime?`, `lastSeenAt DateTime?`, `bannedAt DateTime?`, `tosAcceptedAt DateTime?`, `tosVersion Int?`.
- New models: `HandHistory` (one row per participating player per hand; indexed `(telegramId, playedAt desc)`; 90-day retention) and `AdminAuditLog` (mandatory write BEFORE mutation commits).

Full detail: `.planning/research/STACK.md`.

### Expected Features

All 12 PROJECT.md items are defensible as launch-required.

**Must have (table stakes):** Branding & identity, Full UI redesign (Neon Strip), Custom avatar system (20 bundled WebP), Hand history (flat list), Deposit stub, Action bubbles (discrete-event driven, 800-1000ms min, FIFO queue, reduced-motion), Game-table cleanup, Reconnect flow (30s mid-hand / 120s between, re-verify initData, full snapshot, "Reconnecting…" overlay), Crash-safe persistence (economic state only), Production auth hardening (fail-closed + boot assertion + timingSafeEqual), Observability (silent with scrubber), Responsible-gaming + ToS/Privacy (server-gated `tosAcceptedAt`).

**Should have (differentiators):** 20 curated animals, Hidden admin panel (separate `/admin` namespace, env allowlist, recharts dashboards, mandatory audit log), Branded "resuming" splash, UI test suite (per-element).

**Defer (v1.1+):** Hand-history street-by-street replayer, Chat moderation, 60-min session reminder, avatar unlock streaks, push-via-bot.

**Anti-features rejected:** Free-form avatar upload, client-side admin role toggle, real-money deposit, user-created tables, user-visible stack traces, forced RG lockouts, dismissible-banner-only ToS.

Full dependency graph: `.planning/research/FEATURES.md`.

### Architecture Approach

Seven guiding principles: Socket.io sole gameplay transport; server authoritative; `Game.ts` stays pure (callbacks only); telegramId replaces socketId as durable identity; `types/index.ts` is the contract; admin is a separate surface; dev bypasses gated by explicit env var.

**Major integration points:**
1. **Shared types** — add `avatarId`, `PlayerAction`, `HandResult`, `HandHistoryEntry`, `SessionResumed`, `ReplacedBySession`, admin event suite, handshake `auth: { initData, sessionToken? }`.
2. **`Game.ts` callback surface** — `setOnPlayerAction` (bubbles) + `setOnHandComplete` (history + checkpoint + analytics).
3. **Key-by-telegramId refactor** — `TableManager`, `models/User`, `index.ts`, `models/Table`. Largest structural change; must land early.
4. **SessionStore + grace timers** — centralized `clearAllTimers`; `connectionStateRecovery` as fast-path fallback; full snapshot always on resume.
5. **Recovery module** — `server/recovery/restoreSessions.ts` at boot. Reseat with `sittingOut=true` OR refund and clear. Never restores mid-hand state.
6. **Admin namespace** — `io.of('/admin')` with namespace-level middleware, env allowlist, separate lazy client subtree.
7. **Neon Strip tokens** — `client/src/styles/neon.css` CSS vars mirrored in `tailwind.config.ts`, consumed via `ui/` primitives.
8. **Observability layer** — `track()` abstraction, PII scrubber, fixed event taxonomy.

Full integration map: `.planning/research/ARCHITECTURE.md`.

### Critical Pitfalls (top 6 of 17)

1. **Session token treated as identity on reconnect** — re-run `validateInitData` HMAC on every connection; token only disambiguates. *Reconnect phase.*
2. **Dev auth bypass surviving into prod** — gate on both `ALLOW_DEV_AUTH` AND `NODE_ENV !== 'production'`; boot-time `process.exit(1)` assertion; remove `createDevUser` fabricate-on-failure. *Prod Hardening.*
3. **Crash recovery restoring in-flight hands** — persist only at hand boundaries; never restore hole cards/bets/timers. *Crash-safety.*
4. **Split-brain from double-connect** — `oldSocket.disconnect(true)` + `replacedBySession` before rebinding; keying by telegramId enables this. *Reconnect.*
5. **Admin on main namespace** — separate `/admin` namespace, env allowlist, mandatory `AdminAuditLog` write BEFORE mutation. *Admin Panel.*
6. **Hand-history writes on hot path** — async queue with backpressure; `currentChips` checkpoint stays synchronous (bounded). *Hand History.*

Additional named: buy-in double-spend (atomic UPDATE), initData in logs (Sentry scrubber), avatar race (server-side atomic UPDATE WHERE NULL), iOS viewport (`Telegram.WebApp.viewportStableHeight`, real-device QA), grace-timer leak, unbounded history growth, HMAC non-timing-safe compare, ToS client-only, bubble flicker.

Full catalog: `.planning/research/PITFALLS.md`.

---

## Implications for Roadmap

Coarse granularity (user preference): **5 phases + 1 cross-cutting test track.**

### Phase 1: Foundations & Design System
**Rationale:** Five structural prerequisites that unblock everything. Ship in one phase so downstream phases consume a clean contract.
**Delivers:** shared types, Prisma migration `v1_mvp_launch`, key-by-telegramId refactor, `Game` callbacks, dev-auth env gate + boot assertion + `timingSafeEqual`, Neon Strip tokens (`neon.css` + Tailwind theme + `ui/` primitives).
**Avoids:** pitfalls #2, #15; precondition for #4.
**Research flag:** MEDIUM — telegramId refactor deserves a `/gsd-research-phase`.

### Phase 2: Design System Rollout & Avatars
**Rationale:** With tokens landed, UI work parallelizes. Avatar art delivery is the critical-path bottleneck.
**Delivers:** MainMenu/TableList/ProfileSettings rewrites, game-table cleanup, deposit stub + `DepositComingSoon`, compliance pages (ToS/Privacy/RG) + first-launch consent, 20 WebP avatars + `AvatarPicker` + atomic server-side assignment + SeatsDisplay integration.
**Avoids:** #10 (avatar race), #11 (CORS/cache), #14 (ToS gate), #13 (iOS viewport QA).
**Research flag:** LOW.

### Phase 3: Gameplay Additions (Bubbles + History + Checkpointing)
**Rationale:** All three consume Phase 1 callbacks; history + checkpoint share one `onHandComplete` subscription.
**Delivers:** `motion/react` + `ActionBubble` + `useActionBubbles` FIFO + `playerAction` broadcast + reduced-motion; `HandHistoryRepository` + socket events + profile tab; **async write queue** with backpressure + batch; chip-checkpoint in same hook; 90-day retention job.
**Avoids:** #7 (sync writes), #8 (bubble race), #17 (unbounded growth).
**Research flag:** MEDIUM — hole-card privacy at non-showdown + retention policy defaults.

### Phase 4: Resilience (Reconnect + Crash Recovery)
**Rationale:** Depends on Phase 1 refactor + Phase 3 checkpointing. End-of-milestone because it exercises every earlier piece.
**Delivers:** `SessionStore` with centralized `clearAllTimers`; handshake `{initData, sessionToken}` with mandatory re-verification; `replacedBySession` eviction; "Reconnecting…" overlay + `sessionResumed`; full snapshot with hole cards; `restoreSessions.ts` at boot (reseat sitting-out OR refund); atomic buy-in SQL.
**Avoids:** #1, #3, #4, #6, #16.
**Research flag:** HIGH — riskiest phase; design `clearAllTimers` discipline + per-telegramId serialization lock.

### Phase 5: Admin, Ops & Observability
**Rationale:** Admin wants checkpointed state visible. Observability call sites stabilize last. ToS gate on `joinTable` is trivial once `tosAcceptedAt` populated.
**Delivers:** `/admin` namespace + env allowlist + namespace middleware; enable/disable/drain/edit-params (next-hand only) / kick / ban / grant-balance; mandatory `AdminAuditLog` write before commit; admin UI subtree (recharts + RHF+zod, distinct "ADMIN MODE" banner); Sentry init both sides with scrubber + snapshot test; PostHog `track()` taxonomy at signup / daily bonus / join-leave / hand complete / reconnect / admin action (sha256 telegramId); server-side ToS gate.
**Avoids:** #5, #9, #14.
**Research flag:** MEDIUM — admin auth strategy (env vs password+cookie); analytics destination.

### Cross-Cutting: UI Test Suite
**Rationale:** Run in parallel with Phases 2-5 to prevent end-of-milestone cliff.
**Delivers:** `vitest.config.ts`, `test/setup.ts`, `test/socketMock.ts`, per-element `*.test.tsx` co-located; page-level tests; CI pipeline runs tests against prod-like Vite build; hard phase-exit gate.
**Avoids:** #12 (Vitest+Tailwind CI flakiness).
**Research flag:** LOW.

### Phase Ordering Rationale
- Dependencies dictate 1 → 3 → 4 (types/refactor/callbacks → checkpointing → reconnect consumes checkpointing).
- Phase 2 parallelizes after Phase 1 (thin server touch only).
- Observability in Phase 5 because call sites stabilize last.
- Tests are cross-cutting to catch regressions during redesign.

### Research Flags
Need `/gsd-research-phase`: Phase 1 (MEDIUM), Phase 3 (MEDIUM), Phase 4 (HIGH), Phase 5 (MEDIUM).
Skip research: Phase 2, Cross-cutting tests.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions verified npm 2026-04; React 18 compatibility confirmed; Sentry/PostHog version-locking per official docs. |
| Features | MEDIUM-HIGH | Domain conventions HIGH from industry training data; Telegram-specific MEDIUM; social-casino RG HIGH. |
| Architecture | HIGH | Existing-code facts grounded in `.planning/codebase/`; proposed patterns follow conventions. |
| Pitfalls | HIGH | Grounded in `CONCERNS.md`, `reconnect-and-crash-safety.md`, Socket.io + Telegram official docs. |

**Overall:** HIGH — proceed to roadmap.

### Gaps to Address
- Hand-history depth/retention policy defaults (Phase 3 planning).
- Admin auth strategy: env allowlist vs password/cookie (Phase 5 kickoff).
- Analytics destination: PostHog Cloud vs self-host vs log-pipeline (Phase 5, coupled to out-of-scope infra).
- Avatar art delivery (non-engineering critical path for Phase 2).
- Deposit-stub CTA copy/deep-link (marketing call).
- RG/ToS jurisdiction coverage — write pages extensibly.
- Existing-user ToS re-prompt vs grandfather (compliance call).

---

## Sources

### Primary (HIGH)
- `.planning/codebase/STACK.md`, `ARCHITECTURE.md`, `CONCERNS.md`
- `.planning/research/reconnect-and-crash-safety.md`
- `CLAUDE.md`, `.planning/PROJECT.md`
- npm registry (2026-04) for motion, Sentry, Vitest, RTL, PostHog, recharts, zod, RHF
- motion.dev upgrade guide; Socket.io CSR docs; Telegram Mini App docs; Node crypto.timingSafeEqual; AGA RG guide.

### Secondary (MEDIUM)
- PostHog vs Plausible 2026 comparisons
- Sixty6 / RotoGrinders RG policies
- Telegram Mini App UX guides (Turumburum, Magnetto 2026)
- Training-data knowledge of PokerStars/GG/WSOP/Zynga conventions
- OWASP Session / Timing-attack cheat sheets

### Tertiary (LOW)
- TGPoker / Poker Hero Mini App listings (positioning only)
- Generic online-poker UX articles (corroboration only)

---
*Research completed: 2026-04-14*
*Ready for roadmap: yes*
