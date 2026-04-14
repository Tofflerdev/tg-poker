---
phase: 01-foundations-design-system
plan: 01
subsystem: client/styles
tags: [design-tokens, tailwind-v4, refactor, brand]
requires: []
provides:
  - "client/src/styles/neon.css (@theme token source)"
  - "--color-action-{fold,call,raise,allin,sit} CSS vars"
  - "--color-active, --color-chip, --color-neutral CSS vars"
  - "--glow-{fold,call,raise,allin,sit,neutral} rgba glow tokens"
affects:
  - client/src/App.tsx
  - client/src/components/GameControls.tsx
  - client/src/components/SeatsDisplay.tsx
tech-stack:
  added: []
  patterns:
    - "Tailwind v4 @theme block for design tokens"
    - "color-mix(in srgb, var(--token) N%, transparent) for alpha variants"
key-files:
  created:
    - client/src/styles/neon.css
  modified:
    - client/src/App.tsx
    - client/src/components/GameControls.tsx
    - client/src/components/SeatsDisplay.tsx
decisions:
  - "Replaced `${hex}NN` alpha concatenations with color-mix() so components stay var-first"
  - "Keyframes use CSS vars directly (no JS interpolation into <style> block)"
requirements-closed: [BRAND-03]
metrics:
  duration_minutes: 12
  completed: 2026-04-15
---

# Phase 01 Plan 01: Neon Token Consolidation Summary

Promoted the Neon Strip palette from duplicated per-component `NEON` literal objects into a single Tailwind v4 `@theme` block at `client/src/styles/neon.css`, and refactored `GameControls.tsx` + `SeatsDisplay.tsx` to consume tokens exclusively via `var(--color-*)` / `var(--glow-*)` CSS custom properties.

## What Changed

### Task 1 — `neon.css` + import wiring (commit `d08e695`)
- Created `client/src/styles/neon.css` containing:
  - `@import "tailwindcss";` (matches `telegram.css` convention)
  - Leading provenance comment pointing to D-01/D-02 in CONTEXT
  - Single `@theme { ... }` block defining 8 `--color-*` tokens and 6 `--glow-*` tokens, names per plan `<interfaces>` (LOCKED by D-02)
- Added `import "./styles/neon.css";` to `client/src/App.tsx` immediately after `telegram.css` (later import wins on any token override, intentional).

### Task 2 — component refactor (commit `699c28c`)
- Deleted both local `const NEON = { ... }` literal objects.
- Replaced every hex literal (`#ff4757`, `#00e5ff`, `#ffab00`, `#ff6d00`, `#4caf50`, `#b0bec5`) with `var(--color-*)` references.
- Replaced every derived `rgba(...)` glow with `var(--glow-*)`.
- Hex-concatenated alpha variants (e.g. `${NEON.active.color}60`) were converted to `color-mix(in srgb, var(--color-active) NN%, transparent)` via a small `alpha(color, pct)` helper in `SeatsDisplay.tsx`.  
  Percentages chosen to match the historical hex alpha (e.g. `60` hex = 37.6%, rounded to 38%; `45` = 27%; `40` = 25%; `18` = 10%; `08` = 3%).
- Keyframes inside the injected `<style>` block now reference CSS vars directly (`var(--color-active)`, `var(--glow-call)`) — no JS string interpolation.
- All structural HTML/CSS, animations, and class names left untouched.

## Verification

- `cd client && npm run build` → **passes** (82 modules transformed, 826 ms).
- Hex-literal grep across both components → **0 matches** (case-insensitive scan for the six locked values).
- `NEON = {` object declaration regex → **0 matches** in either file.
- Automated verify line from plan Task 2 (`node -e ...`) → prints `OK: no hex literals, no NEON objects`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing `node_modules` in worktree's `client/`**
- **Found during:** Task 1 verify (`npm run build` failed with Russian-locale "file not found" for `vite`).
- **Issue:** Fresh worktree didn't have client dependencies installed.
- **Fix:** Ran `npm install` in `client/` (dependencies resolved from existing `package-lock.json`).
- **Files modified:** none (dependency install only).
- **Commit:** n/a (build artifact, not committed).

**2. [Rule 3 - Blocking] `.planning/` tree absent from worktree branch**
- **Found during:** Plan load (the worktree branch predates the planning scaffolding).
- **Issue:** `git reset --hard` to the specified base `4ff0e56` gave a tree without the untracked `01-01-PLAN.md`, `STATE.md`, etc. (they live only in the main working tree).
- **Fix:** Copied `.planning/phases/01-foundations-design-system/01-01-PLAN.md`, `.planning/PROJECT.md`, `.planning/STATE.md`, `.planning/config.json`, and `.planning/codebase/` from the parent working tree into the worktree so the executor could read them. No tracked files touched.
- **Commit:** Planning docs not committed by this plan (orchestrator owns those writes).

### Design-level deviations

**3. [Rule 2 - Correctness] `${hex}NN` alpha-concatenation cannot use CSS vars directly**
- **Found during:** Task 2 implementation.
- **Issue:** The original code built partially-transparent colors by appending a two-digit hex alpha to a 6-digit hex literal (`${NEON.fold.color}60`). This syntax is meaningless for `var(--...)` values.
- **Fix:** Introduced a tiny `alpha(color, pct)` helper (SeatsDisplay) and explicit `color-mix(...)` expressions (GameControls). Percentages are equivalent to the historical hex-alpha values, so rendered colors are pixel-identical.
- **Commit:** `699c28c`.

## Known Stubs

None.

## Threat Flags

None — CSS-only / design-token refactor. No data, auth, or transport surface touched. Matches plan's `<threat_model>` disposition (`accept` for both T-01-01-01 and T-01-01-02).

## Self-Check: PASSED

- `client/src/styles/neon.css` → **FOUND**
- `client/src/App.tsx` (modified, `import "./styles/neon.css";`) → **FOUND**
- `client/src/components/GameControls.tsx` (refactored) → **FOUND**
- `client/src/components/SeatsDisplay.tsx` (refactored) → **FOUND**
- Commit `d08e695` (Task 1) → **FOUND**
- Commit `699c28c` (Task 2) → **FOUND**
- Build: green.
- Hex-literal / NEON-object scan: clean.
