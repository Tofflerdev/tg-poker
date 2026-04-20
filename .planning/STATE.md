---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
last_updated: "2026-04-20T23:53:47.087Z"
last_activity: 2026-04-20
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 19
  completed_plans: 17
  percent: 89
---

# Project State

## Current Position

Phase: 03 (gameplay-additions) — EXECUTING
Plan: 5 of 6 (next: 03-04 hand-history read API)
Status: Ready to execute
Last activity: 2026-04-20
Stopped at: Completed 03-03-PLAN.md (client action-bubble layer)

## Current Milestone

**v1.0 MVP Launch** — 12 target features, 44 requirements, 6 phases.

## Progress

- [x] Phase 1: Foundations & Design System  ✓ complete
- [x] Phase 2: Design System Rollout & Avatars  ✓ complete (asset drop pending)
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
- D-09 species list LOCKED: fox, wolf, bear, tiger, panda, raccoon, lion, rabbit, owl, eagle, flamingo, penguin, crocodile, chameleon, cobra, shark, octopus, dolphin, frog, bat (slugs = DB values permanently; rename requires backfill)
- D-09 AI prompt brief LOCKED: dark-background neon-rim portrait, 256×256 WebP, anthropomorphic, cyan/amber rim, ≤15 KB each
- 03-01: ActionBubbleEvent extends PlayerActionEvent with no extra fields (T-3-SCHEMA / D-01) — no holeCards ever in broadcast payload
- 03-01: setOnHandComplete no-op preserved — owned by Plan 03-02
- 03-03: motion@^12.38.0 added as client dep; ActionBubble + ActionBubbleLayer render per-seat FIFO pills with 900 ms hold and useReducedMotion fallback
- 03-03: vi.mock('motion/react', ...) passthrough in tests (Fragment AnimatePresence + plain-tag motion proxy) — deterministic FIFO assertions under vi.useFakeTimers(); production keeps real enter/exit animations

### Blockers

- **20 WebP avatar binaries not generated** — no image-generation MCP in executor env. Client build emits Vite runtime-URL warnings for all 20 slugs; runtime will 404 on `<img src>` until files ship at `client/src/assets/avatars/{slug}.webp`. Unblocker: human-supplied WebPs matching the locked brief; no further code changes required after drop.

### Pending Todos

- Supply 20 WebP binaries per locked species list + prompt brief
- Continue Plan 02-03 (next page redesign)

## Notes

Brownfield project — core game engine, persistence, transport, and auth already implemented. Existing codebase map in `.planning/codebase/`. Research summary in `.planning/research/SUMMARY.md`.
