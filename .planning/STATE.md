# Project State

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-14 — Milestone v1.0 MVP Launch started

## Current Milestone

**v1.0 MVP Launch** — 12 target features. Research-first mode selected.

## Accumulated Context

### Key Decisions
- Design language locked: **Neon Strip** (tokens in CLAUDE.md)
- Deploy infrastructure explicitly OUT OF SCOPE for this cycle
- Real-money payments OUT OF SCOPE (Deposit is a stub)
- UI redesign uses the `frontend-design` skill to avoid generic AI aesthetics
- Avatar system replaces Telegram avatar (20 generated anthropomorphic-animal images)
- Test stack: Vitest + React Testing Library, one file per interactive element

### Blockers
- None

### Pending Todos
- None

## Notes

Brownfield project — core game engine, persistence, transport, and auth already implemented. Existing codebase map in `.planning/codebase/`. Pre-existing research on reconnect/crash-safety in `.planning/research/reconnect-and-crash-safety.md`.
