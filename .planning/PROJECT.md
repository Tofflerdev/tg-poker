# NightRiver — Project Context

> Working codename. Final name + logo are produced in Phase 1 (Branding & Identity).

## What This Is

A Telegram Mini App for 6-max Texas Hold'em cash-game poker, with a distinctive "Neon Strip" visual identity. Players launch it from a bot, pick an animal avatar, join a predefined table, and play hands with reconnect-safe persistence.

## Core Value

Deliver poker that feels *designed*, not generic — a cohesive Neon Strip experience from main menu through showdown, reliable across reconnects, with a quality bar above the typical chat-game UX.

## Current Milestone: v1.0 MVP Launch

**Goal:** Ship a production-ready Neon Strip Telegram Mini App poker client — branded, fully redesigned, reconnect-safe, crash-safe, admin-controllable, and test-covered.

**Target features:**
- Branding & identity (name, logo, palette tokens)
- Full UI redesign (home, profile, table list, game room) — Neon Strip
- Custom avatar system (20 animal images; random-on-signup; user-changeable)
- Profile expansion (hand history + supporting fields)
- Deposit stub (first-position main-screen block → "coming soon")
- Action bubbles (floating popups over seats: Fold / Call N / Raise to N)
- Game table cleanup (remove redundant labels; redesign rest)
- Reconnect logic (restore seat/chips/hole cards/turn)
- Crash safety + prod auth hardening (persist table/chips; disable dev `initData` bypass)
- Hidden admin panel (dashboards + live controls)
- UI test suite (Vitest + RTL; per-element files)
- Observability & compliance (error tracking, anonymous analytics, RG disclaimers, ToS/Privacy)

## Requirements

See `.planning/REQUIREMENTS.md` (generated during this milestone cycle).

## Vision

A polished, fast, mobile-first **Texas Hold'em poker Mini App for Telegram** — 6-max cash games with a distinctive "Neon Strip" visual identity. The MVP goal is to deliver a production-ready Telegram Mini App that players can launch from a bot, play reliably across reconnects, and enjoy a cohesive visual experience from main menu to final showdown.

## Current State (brownfield)

- **Core game engine complete** — betting rounds, side pots, showdown, turn timers, auto-start loop, multi-table (6 predefined tables).
- **Persistence complete** — PostgreSQL + Prisma; User model with balance, stats, daily bonus; `HandHistory` table with 90-day retention.
- **Transport complete** — Socket.io-only communication; Telegram `initData` HMAC auth hardened fail-closed in Phase 1.
- **Design language shipped** — "Neon Strip" applied across Main Menu, Table List, Profile/Settings, Game Room chrome, GameControls, SeatsDisplay, ActionBubble, and HandHistory UI.
- **Gameplay additions shipped (Phase 3)** — action bubbles broadcast off `onPlayerAction`, async `HandHistoryQueue` off the hot path, zero-arg `getHandHistory` socket handler with read-time opponent-hole-card strip, hand-boundary `checkpointSeat`.
- **Test stack in place** — Vitest + RTL scaffolded in Phase 3; 84 tests passing (38 server + 46 client). Dedicated Phase 6 extends coverage to per-element granularity.
- **Gaps** — no deploy infra (explicitly out of scope), no reconnect logic (Phase 4), no crash-safety recovery on boot (Phase 4), no admin panel (Phase 5), no observability (Phase 5).

See `.planning/codebase/` for the full codebase map (7 docs).

## Phase Status

- [x] Phase 1: Foundations & Design System — 2026-04-15
- [x] Phase 2: Design System Rollout & Avatars — (complete; 20 WebP binaries pending)
- [x] Phase 3: Gameplay Additions — 2026-04-22 (automated verification passed; 3 human UAT items tracked in `03-HUMAN-UAT.md`)
- [ ] Phase 4: Resilience
- [ ] Phase 5: Admin, Ops & Observability
- [ ] Phase 6: Test Hardening

## MVP Scope (this initialization)

1. **Branding & identity** — final name, logo, palette tokens aligned with Neon Strip
2. **Full UI redesign** — home, profile, table list, game room — all in Neon Strip via `frontend-design` skill
3. **Custom avatar system** — 20 generated anthropomorphic-animal-playing-poker images; random on first login; user can re-pick in profile (replaces Telegram avatar)
4. **Profile expansion** — add hand history (configurable depth) and supporting fields
5. **Deposit stub** — first-position block on main screen linking to a "coming soon" deposit page
6. **Action bubbles** — floating popup over a player seat announcing their action (Fold / Call 100 / Raise to 500 …)
7. **Game table cleanup** — remove redundant top-left table/phase labels, top-right pot label, etc.; redesign the rest
8. **Reconnect logic** — restore seat, chips, hole cards, turn state on socket reconnect
9. **Crash safety & prod auth hardening** — persist `currentTableId` + `currentChips`; disable dev-mode `initData` bypass in prod
10. **Hidden admin panel** — dashboards (live tables/users/economy/ops) + controls (enable/disable tables, edit params live, kick/ban, grant balance)
11. **UI test suite** — Vitest + React Testing Library, one test file per interactive UI element, scenario coverage
12. **Observability & compliance** — error tracking (Sentry-class), basic anonymous analytics, responsible-gaming disclaimers, ToS/Privacy pages

## Explicitly Out of Scope (this cycle)

- Deploy infrastructure (Dockerfile, nginx, HTTPS, CI/CD) — user opted out for this cycle; will be handled separately
- Real money / payments integration — Deposit block is a stub only
- Tournaments, leaderboards, friend system, private tables
- Mobile-native wrappers (iOS/Android) — Telegram Mini App only

## Tech Stack (inherited)

Server: Node 20+, Express, Socket.io, TypeScript ES2022/NodeNext
Client: React 18, Vite, Tailwind CSS 4, Socket.io-client
DB: PostgreSQL 16, Prisma v7
Auth: Telegram `initData` HMAC
Poker logic: `pokersolver`
Tests (new): Vitest + React Testing Library

## Design Language

**"Neon Strip"** — already defined in `CLAUDE.md`. All new UI must use these tokens:
- Dark translucent backgrounds `rgba(10,10,14,0.85-0.9)` + `backdrop-blur(12px)`
- Neon palette: red `#ff4757`, cyan `#00e5ff`, amber `#ffab00`, orange `#ff6d00`, green `#4caf50`, gray `#b0bec5`
- 1.5px colored borders at 50-60% opacity; dashed for empty/interactive
- Color-matched `box-shadow` glows; monospace amber chip counts with `text-shadow`

Redesign work uses the `frontend-design` skill to avoid generic AI aesthetics.

## Success Criteria

- A new Telegram user opens the Mini App → lands on a cohesive Neon Strip main menu → picks an animal avatar → joins a table → plays a full hand → sees action bubbles → disconnects mid-hand → reconnects and resumes seat/cards/turn cleanly.
- Admin opens the hidden panel → sees live metrics → toggles a table off → confirms it disappears from the public list.
- Every interactive UI element has unit-test coverage for happy path + edge cases.
- Dev-mode auth bypass is unreachable in a production build.

## Workflow Configuration

- Mode: interactive (confirm gates)
- Granularity: coarse (3-5 phases)
- Research before planning: yes
- Plan-check + verifier: yes
- Git: planning docs committed

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

_Last updated: 2026-04-22 — Phase 3 complete (action bubbles, hand history pipeline, profile history UI, hand-boundary checkpointing)_
