# NightRiver — Project Context

## What This Is

A Telegram Mini App for 6-max Texas Hold'em cash-game poker with a distinctive "Neon Strip" visual identity. Players launch from a bot, are assigned an animal avatar, join a predefined table, play hands with reconnect-safe persistence, and see their hand history in their profile. Admins manage tables and users through a hidden admin panel. The app is fully redesigned, test-covered, and observable.

## Core Value

Deliver poker that feels *designed*, not generic — a cohesive Neon Strip experience from main menu through showdown, reliable across reconnects, with a quality bar above the typical chat-game UX.

## Current State — v1.0 MVP Launch (shipped 2026-05-05)

- **Brand & identity shipped** — NightRiver name adopted across all UI copy, manifest, and page titles; SVG logo + favicon; Neon Strip tokens in `neon.css` as single source of truth.
- **Full UI redesign complete** — Main Menu, Table List, Profile/Settings, Game Room chrome all rebuilt in Neon Strip using shared `ui/` primitives (Button, Card, Tab, Badge).
- **20-animal avatar system** — random on signup, re-selectable in Profile, live-propagating to all seats; 20 WebP assets shipped.
- **Gameplay additions** — Action bubbles (motion/react FIFO, 900ms hold, reduced-motion support); hand history (async queue, 50-row limit, 90-day retention, opponent privacy filter); chip checkpointing at hand boundaries.
- **Reconnect-safe sessions** — 30s/120s grace windows, full GameState snapshot on reconnect, crash recovery at server boot, atomic buy-in/cashout.
- **Hidden admin panel** — `/admin` Socket.io namespace, JWT auth (HS256 8h), 4 live dashboards, 6 admin mutations, write-before-commit audit trail.
- **Observability** — Sentry (react + node) with PII scrubber; PostHog (client + server) with sha256(telegramId) identity; fixed event taxonomy.
- **Compliance** — ToS, Privacy, RG static pages; first-launch consent gate; server-side joinTable enforcement.
- **Test suite** — 204 tests (Vitest + RTL + jsdom); per-element coverage for all 11 interactive components; 5 scenario flows; GitHub Actions CI gate on push/PR to main.
- **Gaps (accepted)** — Raster favicon.ico + logo-192.png not generated (SVG ships; Telegram users unaffected). Deploy infrastructure explicitly out of scope.

See `.planning/milestones/v1.0-ROADMAP.md` for full phase archive.

## Requirements

### Validated (v1.0)

- ✓ Neon Strip palette as single source of truth (neon.css + Tailwind theme) — v1.0
- ✓ Full Neon Strip UI redesign — all 4 pages + shared ui/ primitives — v1.0
- ✓ NightRiver brand identity (name, SVG logo, favicon, web manifest) — v1.0
- ✓ 20-animal avatar system (random assign, user-changeable, seat rendering) — v1.0
- ✓ Profile: stats, avatar, display name, daily-bonus state — v1.0
- ✓ Deposit stub (first-position block → "coming soon" page) — v1.0
- ✓ Action bubbles on every player action (FIFO, reduced-motion) — v1.0
- ✓ Hand history (async write, 50 hands, 90-day retention, privacy filter) — v1.0
- ✓ Chip checkpointing at hand boundaries — v1.0
- ✓ Reconnect with full snapshot resume (30s/120s grace, replacedBySession) — v1.0
- ✓ Atomic buy-in/cashout (no double-spend) — v1.0
- ✓ Crash recovery at server boot (refund or reseat) — v1.0
- ✓ Fail-closed auth hardening (timingSafeEqual, boot assertion, no dev bypass in prod) — v1.0
- ✓ Hidden admin panel (JWT, 4 dashboards, 6 mutations, audit trail) — v1.0
- ✓ Sentry + PostHog observability with PII scrubbing — v1.0
- ✓ ToS/Privacy/RG compliance pages + consent gate + server-side enforcement — v1.0
- ✓ Vitest + RTL test suite (204 tests, per-element, 5 scenarios, CI gate) — v1.0

### Active (for v1.1+)

- [ ] Deploy infrastructure — Dockerfile, nginx, HTTPS, CI/CD pipeline (was explicitly out-of-scope v1.0; now the primary blocker for production launch)
- [ ] Street-by-street hand replayer on profile
- [ ] 60-minute session "take a break" reminder toast
- [ ] Avatar unlock / streak rewards
- [ ] Telegram bot push notifications (hand results, daily bonus ready)
- [ ] Chat moderation / profanity filter
- [ ] Raster favicon.ico + logo-192.png generation (minor asset gap from v1.0)

### Out of Scope

- **Real-money payments** — Deposit is and remains a stub. No payment SDK, bank rails, KYC, or wallet integration.
- **Tournaments, leaderboards, friends, private tables** — 6 predefined tables remain the universe.
- **Mobile-native wrappers (iOS/Android apps)** — Telegram Mini App only.
- **Free-form avatar upload** — only the 20 curated assets are selectable.
- **Player-created tables** — explicitly rejected; 6 predefined tables by design.
- **Client-gated admin role toggle** — rejected as insecure.
- **Forced responsible-gaming lockouts** — virtual-chip play; disclaimers only.
- **Self-hosted PostHog** — cloud for now; migration deferred to v1.1+.

## Key Decisions

| Decision | Outcome | Status |
|----------|---------|--------|
| Design language: Neon Strip | Full palette in neon.css; consumed by all UI via CSS custom properties | ✓ Good |
| Deploy infra out of scope v1.0 | Accepted; deploy is the primary v1.1 unlock | — Pending |
| Key-by-telegramId (not socketId) | Unlocked reconnect, admin, history, analytics | ✓ Good |
| 20 curated animal avatars (not upload) | Shipped; species list + slugs are permanent DB values | ✓ Good |
| Vitest + RTL (not Playwright E2E) | 204 tests in CI; fast, deterministic | ✓ Good |
| Admin auth: JWT + env allowlist | Pragmatic for v1.0; upgrade to password+cookie in v1.1+ | ⚠ Revisit |
| Async HandHistoryQueue (off hot path) | Zero game-loop blocking | ✓ Good |
| Session token disambiguates, never authenticates | HMAC re-verified on every reconnect | ✓ Good |
| Always-refund boot recovery (not reseat-as-sit-out) | Simpler invariant; no ghost seats on boot | ✓ Good |
| AdminApp lazy-loaded chunk | Zero admin code in player main bundle | ✓ Good |

## Vision

A polished, fast, mobile-first Texas Hold'em poker Mini App for Telegram — 6-max cash games with a distinctive "Neon Strip" visual identity. The v1.0 goal was a production-ready app that players can launch from a bot, play reliably across reconnects, and enjoy a cohesive visual experience from main menu to final showdown.

## Tech Stack

Server: Node 20+, Express, Socket.io, TypeScript ES2022/NodeNext
Client: React 18, Vite, Tailwind CSS 4, Socket.io-client
DB: PostgreSQL 16, Prisma v7
Auth: Telegram `initData` HMAC (production fail-closed)
Poker logic: `pokersolver`
Tests: Vitest + React Testing Library + jsdom

## Design Language

**"Neon Strip"** — defined in `CLAUDE.md`. All new UI uses these tokens:
- Dark translucent backgrounds `rgba(10,10,14,0.85-0.9)` + `backdrop-blur(12px)`
- Neon palette: red `#ff4757`, cyan `#00e5ff`, amber `#ffab00`, orange `#ff6d00`, green `#4caf50`, gray `#b0bec5`
- 1.5px colored borders at 50-60% opacity; dashed for empty/interactive
- Color-matched `box-shadow` glows; monospace amber chip counts with `text-shadow`

## Workflow Configuration

- Mode: interactive (confirm gates)
- Granularity: coarse (3-5 phases per milestone)
- Research before planning: yes
- Plan-check + verifier: yes
- Git: planning docs committed

---

*Last updated: 2026-05-05 — v1.0 milestone complete (6 phases, 38 plans, 204 tests, shipped)*
