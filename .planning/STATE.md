# Project State

## Current Position

Phase: Phase 1 — Foundations & Design System
Plan: —
Status: Ready to plan Phase 1
Last activity: 2026-04-14 — Roadmap created (6 phases, 44/44 requirements mapped)

## Current Milestone

**v1.0 MVP Launch** — 12 target features, 44 requirements, 6 phases.

## Progress

- [ ] Phase 1: Foundations & Design System  ← current
- [ ] Phase 2: Design System Rollout & Avatars
- [ ] Phase 3: Gameplay Additions
- [ ] Phase 4: Resilience
- [ ] Phase 5: Admin, Ops & Observability
- [ ] Phase 6: Test Hardening

## Accumulated Context

### Key Decisions
- Design language locked: **Neon Strip** (tokens in CLAUDE.md)
- Deploy infrastructure explicitly OUT OF SCOPE for this cycle
- Real-money payments OUT OF SCOPE (Deposit is a stub)
- UI redesign uses the `frontend-design` skill to avoid generic AI aesthetics
- Avatar system replaces Telegram avatar (20 generated anthropomorphic-animal images)
- Test stack: Vitest + React Testing Library, one file per interactive element
- Key-by-telegramId refactor is the linchpin and lands in Phase 1 (unblocks reconnect, admin, history, analytics)
- Dev-auth bypass hardened in Phase 1 (fail-closed gate + boot assertion + timingSafeEqual)
- Test track is a dedicated Phase 6 (coarse granularity favors a single verification gate)

### Blockers
- None

### Pending Todos
- Plan Phase 1 via `/gsd-plan-phase 1`

## Notes

Brownfield project — core game engine, persistence, transport, and auth already implemented. Existing codebase map in `.planning/codebase/`. Research summary in `.planning/research/SUMMARY.md`.
