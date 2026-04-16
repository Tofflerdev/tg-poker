---
phase: 02-design-system-rollout-avatars
plan: 01
subsystem: ui
tags: [react, tailwind-v4, design-system, neon-strip, primitives, typescript]

requires:
  - phase: 01-foundations-design-system
    provides: "Neon Strip CSS custom properties in client/src/styles/neon.css (@theme block): --color-action-{fold,call,raise,allin,sit}, --color-active, --color-chip, --color-neutral, --glow-{fold,call,raise,allin,sit,neutral}"
provides:
  - "Action-tier Button primitive (client/src/components/ui/Button.tsx) with variant + emphasis + fullWidth"
  - "Dark translucent Card primitive with optional variant border + glow"
  - "Underline Tab + TabBar primitives (fixed active/neutral semantics)"
  - "Pill Badge primitive keyed to ActionTier"
  - "VARIANT_TIER lookup + closed ActionTier union in tokens.ts (single source for variant→CSS-var mapping)"
  - "New --color-surface-base CSS token in neon.css (owned by Plan 02-01, consumed later by Plan 04 setHeaderColor and Card default background)"
  - "Barrel index.ts re-exporting all primitives + types for ergonomic imports"
affects: [02-04-main-menu-deposit, 02-05-table-list-tier-groups, 02-06-profile-three-tabs, 02-07-game-room-chrome, 02-08-consent-and-legal]

tech-stack:
  added: []
  patterns:
    - "Closed ActionTier union enforces action-tier-only variant API at compile time (D-05)"
    - "Primitives consume CSS custom properties via var(--…) + color-mix() — no inline hex literals (D-06)"
    - "Single VARIANT_TIER Record lookup (no CVA, no clsx) — matches zero-dep policy"

key-files:
  created:
    - "client/src/components/ui/tokens.ts"
    - "client/src/components/ui/Button.tsx"
    - "client/src/components/ui/Card.tsx"
    - "client/src/components/ui/Tab.tsx"
    - "client/src/components/ui/Badge.tsx"
    - "client/src/components/ui/index.ts"
  modified:
    - "client/src/styles/neon.css"

key-decisions:
  - "Kept the discretionary barrel `ui/index.ts` (CONVENTIONS notes the project otherwise avoids barrels beyond `types/index.ts`). Rationale: 4 primitives + types is a small enough surface that a single ergonomic import outweighs the convention carve-out, and Plans 04–08 each consume 2–4 of them."
  - "Tailwind `active:scale-95` class used for press feedback on Button (vs. inline transform+transition). Matches existing GameControls.tsx patterns and keeps the style object focused on Neon Strip visuals."
  - "Card surface base retained as literal `rgba(10,10,14,0.88)` (not swapped to `var(--color-surface-base)` with alpha). Plan `<done>` criterion explicitly allows this project precedent; `--color-surface-base` is retained for Plan 04 setHeaderColor consumption where an opaque value is required."

patterns-established:
  - "ActionTier + VARIANT_TIER contract: one closed union + one Record is the single source of truth for all tier-keyed primitive variants this phase"
  - "Primitives forward ...rest spreads and merge incoming style — consumers can extend but never override tier color/glow"

requirements-completed: [UI-05, BRAND-03]

duration: 2m 19s
completed: 2026-04-16
---

# Phase 2 Plan 01: UI Primitives Summary

**Four Neon Strip primitives (Button / Card / Tab+TabBar / Badge) keyed to the closed ActionTier union, consuming Phase 1 CSS custom properties — zero hex literals in tsx, barreled via `components/ui/index.ts`, build green.**

## Performance

- **Duration:** 2m 19s
- **Started:** 2026-04-16T06:03:24Z
- **Completed:** 2026-04-16T06:05:43Z
- **Tasks:** 3/3
- **Files created:** 6
- **Files modified:** 1

## Accomplishments

- Shipped the full Phase 2 primitive substrate so Plans 02-04 through 02-08 can start importing `{ Button, Card, Tab, TabBar, Badge }` from day one (D-04).
- Enforced D-05 at the type level: variants are `ActionTier` only — no `color` / `colorClass` / freeform-string props leak through any primitive API.
- Added the phase-owned `--color-surface-base` token (plan-checker FLAG-6 ownership) in `neon.css` for downstream `setHeaderColor` replacement (Plan 04) and Card opaque surface consumption.
- Zero hex color literals inside `client/src/components/ui/*.tsx` (grepped clean). Only `rgba(10,10,14,0.88)` appears in Card.tsx, which is explicitly allowed by the plan's done criterion (matches project precedent in SeatsDisplay/GameControls).

## Task Commits

1. **Task 1: tokens.ts + --color-surface-base** — `4e66c71` (feat)
2. **Task 2: Button + Card primitives** — `e1042dd` (feat)
3. **Task 3: Tab + TabBar + Badge + barrel index** — `87156b8` (feat)

_(Task 1 commit also carried previously-staged PLAN.md directory renames that the orchestrator had already queued; content diff is solely the ActionTier tokens + neon.css addition.)_

## Files Created/Modified

### Created

- `client/src/components/ui/tokens.ts` — Exports `ActionTier` (closed 7-variant union) and `VARIANT_TIER: Record<ActionTier, { color; glow }>` keyed to Phase 1 CSS custom properties.
- `client/src/components/ui/Button.tsx` — `ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant, emphasis?, fullWidth? }`. Transparent base / low-alpha gradient on `emphasis`; 1.5px 38%-alpha border; 14px radius; uppercase 0.03em; 44px min tap target; `active:scale-95` press.
- `client/src/components/ui/Card.tsx` — `CardProps extends React.HTMLAttributes<HTMLDivElement> { variant?, glow?, padding? }`. `rgba(10,10,14,0.88)` + `backdrop-blur(12px)`, variant border tint (default `neutral`), optional outer glow, `padding: number | string` (default 16).
- `client/src/components/ui/Tab.tsx` — `Tab { label, active, onClick }` + `TabBar { tabs, activeId, onChange }`. Underline style: active tab color `var(--color-active)` with 2px cyan GlowBar; inactive `var(--color-neutral)`. 44px tap target.
- `client/src/components/ui/Badge.tsx` — `BadgeProps { variant, children }`. Pill (borderRadius 999), low-alpha tier bg, 50%-alpha colored border, tier-colored text with `textShadow: 0 0 6px ${glow}`.
- `client/src/components/ui/index.ts` — Barrel re-export of all four primitives + their prop types + `VARIANT_TIER` + `ActionTier`.

### Modified

- `client/src/styles/neon.css` — Added `--color-surface-base: #0a0a0e;` inside the existing `@theme` block. No other tokens touched.

## API Surface (for downstream consumers)

```ts
import {
  Button,      // variant: ActionTier; emphasis?; fullWidth?
  Card,        // variant?: ActionTier = 'neutral'; glow?; padding?
  Tab,         // label; active; onClick
  TabBar,      // tabs: {id,label}[]; activeId; onChange
  Badge,       // variant: ActionTier; children
  VARIANT_TIER,
  type ActionTier,  // 'fold' | 'call' | 'raise' | 'allin' | 'sit' | 'active' | 'neutral'
} from '../components/ui';
```

All tier-colored values route through `VARIANT_TIER[variant]` → `var(--color-*)` / `var(--glow-*)`. There is intentionally no escape hatch for freeform colors (D-05).

## How to Consume

Downstream plans should reach for `Button variant="active" emphasis` for primary CTAs (Accept / Confirm / Claim), `variant="sit"` for affirmative auxiliary actions (Sit, Accept-adjacent), `variant="neutral"` for secondary / Cancel / Back. Poker-specific seats continue to use `fold | call | raise | allin` (Plan 07 game room). `Card` wraps any dark translucent panel — add `variant` + `glow` to highlight (e.g., active avatar tile, section header). `TabBar` renders the 3-tab Profile layout; `Tab` is available standalone for ad-hoc tab UIs. `Badge` pills replace every bespoke status indicator (tier labels on Table List, Fold / All-in / Sit-out on seats once migrated).

## Decisions Made

- **Kept the barrel `ui/index.ts`** — explicit discretionary choice in RESEARCH; 4 primitives is a small enough surface that one ergonomic import path beats the project's "no barrels beyond types" convention for downstream plan ergonomics.
- **`active:scale-95` Tailwind utility** for Button press feedback instead of inline `transform` — matches existing `GameControls.tsx` patterns and RESEARCH note ("class is acceptable").
- **Card retains `rgba(10,10,14,0.88)` literal** — plan `<done>` criterion explicitly permits this surface base as project precedent. `--color-surface-base` token is owned here for Plan 04 `setHeaderColor` consumption (which needs an opaque hex), not for Card.

## Deviations from Plan

None — plan executed exactly as written. No Rule 1/2/3 auto-fixes, no Rule 4 architectural stops, no authentication gates. Every `<done>` criterion verified:

- `tokens.ts` exports `ActionTier` + `VARIANT_TIER` ✓
- `neon.css` has new `--color-surface-base` inside `@theme` ✓
- Button.tsx / Card.tsx export documented prop shapes ✓
- Tab.tsx exports `Tab` + `TabBar` per interface ✓
- Badge.tsx exports `Badge` per interface ✓
- `ui/index.ts` barrel contains exactly 6 files (tokens + 4 primitives + index) ✓
- `cd client && npm run build` passes on every task ✓
- Zero hex literals in `ui/*.tsx` (grep clean) ✓

## Issues Encountered

- Tailwind v4 tree-shakes unreferenced `@theme` custom properties from the compiled CSS bundle. `--color-surface-base` is present in `neon.css` source but not emitted to `dist/assets/*.css` yet because no consumer references it in this plan's code. Expected v4 behavior — it will appear in compiled CSS as soon as Plan 04 uses `var(--color-surface-base)` in `setHeaderColor` or a Card consumer. Not a defect; the token definition lives at the source-of-truth level and the plan's done criterion is about the token existing in `neon.css`, which it does.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plans 02-04 through 02-08 can begin importing from `../components/ui` immediately.
- Plan 02-03 (branding/logo) runs in parallel on Wave 1; no file overlap with this plan beyond `client/src/styles/neon.css`, where 02-03 adds logo asset references and this plan added `--color-surface-base`. Plan-checker FLAG-6 coordination honored — 02-03 will NOT re-add `--color-surface-base`.
- GameControls.tsx migration to `<Button variant="fold|call|raise|allin">` (D-07) is scheduled for Plan 02-07 (Game Room Chrome).

## Self-Check: PASSED

- `client/src/components/ui/tokens.ts` — FOUND
- `client/src/components/ui/Button.tsx` — FOUND
- `client/src/components/ui/Card.tsx` — FOUND
- `client/src/components/ui/Tab.tsx` — FOUND
- `client/src/components/ui/Badge.tsx` — FOUND
- `client/src/components/ui/index.ts` — FOUND
- `client/src/styles/neon.css` `--color-surface-base` — FOUND (line 18, inside @theme)
- Commit `4e66c71` (Task 1) — FOUND
- Commit `e1042dd` (Task 2) — FOUND
- Commit `87156b8` (Task 3) — FOUND

---
*Phase: 02-design-system-rollout-avatars*
*Plan: 01-ui-primitives*
*Completed: 2026-04-16*
