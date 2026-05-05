---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: MVP Launch
status: complete
stopped_at: v1.0 milestone archived — all 6 phases, 38 plans complete
last_updated: "2026-05-05T00:00:00.000Z"
last_activity: 2026-05-05
progress:
  total_phases: 6
  completed_phases: 6
  total_plans: 38
  completed_plans: 38
  percent: 100
---

# Project State

## Current Position

Milestone v1.0 MVP Launch — **COMPLETE AND ARCHIVED**

All 6 phases, 38 plans shipped. Git tag v1.0 created.

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-05)

**Core value:** Poker that feels designed — cohesive Neon Strip experience from main menu through showdown, reliable across reconnects.
**Current focus:** Planning next milestone (deploy infra + production launch)

## Milestone Archive

- `.planning/milestones/v1.0-ROADMAP.md` — full phase + plan details
- `.planning/milestones/v1.0-REQUIREMENTS.md` — all 52 requirements with final status
- `.planning/MILESTONES.md` — milestone index

## Accumulated Context

### Key Decisions (v1.0)

- Design language: **Neon Strip** (tokens in CLAUDE.md, neon.css)
- Deploy infrastructure explicitly OUT OF SCOPE for v1.0 — primary unlock for v1.1
- Real-money payments OUT OF SCOPE (Deposit is a stub)
- Avatar system: 20 curated WebP animal images; species slugs are permanent DB values
- Test stack: Vitest + React Testing Library, one file per interactive element
- Key-by-telegramId is the durable identity key across all server state
- Dev-auth bypass fail-closed in Phase 1 (timingSafeEqual + boot assertion)
- Admin auth: HS256 JWT (8h) + ADMIN_TELEGRAM_IDS env allowlist (no isAdmin DB flag)
- HandHistoryQueue is async/off-hot-path; game loop never blocks on DB I/O
- Always-refund boot recovery policy (not reseat-as-sit-out)
- AdminApp lazy-loaded Vite chunk (zero admin code in player main bundle)

### Blockers

None. Next milestone should start with `/gsd-new-milestone`.

## Notes

v1.0 shipped 2026-05-05. 204 tests, CI gate live, all 6 phases complete.
Next: deploy infrastructure (Dockerfile, nginx, HTTPS) is the primary unlock for production launch.
