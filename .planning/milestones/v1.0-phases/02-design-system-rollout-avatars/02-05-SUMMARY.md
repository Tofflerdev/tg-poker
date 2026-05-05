---
phase: 02-design-system-rollout-avatars
plan: 05
subsystem: ui
tags: [react, tailwind-v4, neon-strip, table-list, tier-grouping, typescript]

requires:
  - phase: 02-design-system-rollout-avatars
    plan: 01
    provides: "Neon Strip primitives — Card, Badge, Button, ActionTier union, VARIANT_TIER lookup — barreled via client/src/components/ui/index.ts"
  - phase: 01-foundations-design-system
    provides: "Neon Strip CSS custom properties (--color-action-*, --color-active, --color-chip, --color-neutral, --glow-*, --color-surface-base) in client/src/styles/neon.css"
provides:
  - "TableList page redesigned in Neon Strip with 4 tier-grouped sections (Beginner / Standard / Pro / High Stakes)"
  - "Tier classification helper keyed off bigBlind — reusable pattern for any future tier indicator"
  - "Locked High Stakes tier color to fold (red) per RESEARCH Q9 recommendation"
affects: []

tech-stack:
  added: []
  patterns:
    - "TableList consumes ui/ primitives exclusively (Card for rows, Badge for section headers, Button for back affordance)"
    - "Zero inline NEON hex literals in the page — tier colors route through VARIANT_TIER and var(--color-*) tokens"
    - "Fixed-order tier iteration (TIER_ORDER const) with empty-tier skip — future-proof if server adds new tiers"

key-files:
  created: []
  modified:
    - "client/src/pages/TableList.tsx"

key-decisions:
  - "Locked High Stakes tier color to `fold` (red) per RESEARCH Q9 — red distinguishes cleanly from Pro's amber, where the alternate `allin` (orange) would have been hue-adjacent and harder to read at a glance on small mobile screens."
  - "Kept table.name as-is including the server-provided emoji prefixes (🌱 / ⭐ / 🔥 / 💎) — they already encode tier visually and complement the colored Badge header. Stripping them would have required coordinating a server config change outside this plan's scope."
  - "Full tables (`playerCount >= maxPlayers`) dim to opacity 0.5 but remain tappable — per plan, server gates join attempts; visual cue only."
  - "Added small Live/Open/Full text indicator under the table name (below the main title) in tier-neutral color, with `Live` lighting cyan when `status === 'playing'`. Adds at-a-glance activity signal without introducing a new tier color."

patterns-established:
  - "Page-level tier classification pattern: bigBlind-keyed tierOf() helper + TIER_ORDER const + TIER_VARIANT Record<Tier, ActionTier>. Reusable for any future tier-aware view."

requirements-completed: [UI-02]

duration: 1m 50s
completed: 2026-04-16
---

# Phase 2 Plan 05: Table List Tier Groups Summary

**TableList.tsx rebuilt in Neon Strip — 4 tier-grouped sections (Beginner / Standard / Pro / High Stakes) with tier-colored Badge headers and Card rows showing table name, blinds, buy-in, and live N/6 count; High Stakes locked to `fold` (red) per RESEARCH Q9; zero inline NEON hex literals; build green.**

## Performance

- **Duration:** 1m 50s
- **Started:** 2026-04-16T06:28:13Z
- **Completed:** 2026-04-16T06:30:03Z
- **Tasks:** 1/1
- **Files created:** 0
- **Files modified:** 1

## Accomplishments

- Replaced the legacy Telegram-themed TableList (light background, generic button chrome, Russian labels, emoji status dots) with a full Neon Strip tier-grouped layout consuming Phase 2 Plan 01 primitives (`Card`, `Badge`, `Button`).
- Satisfied UI-02 in one task: tier-colored section headers + dense rows showing `name`, `sb/bb`, `buyIn`, and `playerCount/maxPlayers`.
- Locked D-18 grouping (4 tier sections) and D-19 tier color mapping (Beginner=sit, Standard=call, Pro=raise, High Stakes=fold) directly in `TIER_VARIANT` — single source of truth for the page.
- Preserved the existing `onSelectTable(tableId)` / `onBack` contract so no wire-up changes were needed in `App.tsx:378-382`.
- Preserved the Plan 02-03 `setHeaderColor('#0a0a0e')` call so Telegram chrome does not regress to Telegram blue.

## Task Commits

1. **Task 1: Redesign TableList.tsx with tier-grouped sections** — `e34447b` (feat)

## Files Created/Modified

### Modified

- `client/src/pages/TableList.tsx` — Full rewrite (399 insertions / 259 deletions). Dropped 160 lines of bespoke CSS classes in favor of inline `style={{…}}` driven by CSS custom properties (matches the existing `GameControls.tsx` / `SeatsDisplay.tsx` pattern). Split into `TableList` (container), `TierSection` (per-tier header + rows), `TableRow` (individual Card row), and `EmptyState` (no-tables Card). Exposes three internal helpers: `tierOf(table)`, `groupByTier(tables)`, and `tierColorVar(variant)` — last only used for the separator-line `color-mix()` interpolation.

## API Surface

No public API changes. Props remain:

```ts
interface TableListProps {
  tables: TableInfo[];
  onSelectTable: (tableId: string) => void;
  onBack: () => void;
}
```

`App.tsx` call site (`App.tsx:378-382`) unchanged.

## Tier Color Mapping (locked)

| Tier         | ActionTier variant | CSS token                  | Hex     | Rationale                                                                                   |
| ------------ | ------------------ | -------------------------- | ------- | ------------------------------------------------------------------------------------------- |
| Beginner     | `sit`              | `--color-action-sit`       | #4caf50 | Green = safe/entry — matches "sit at table" semantics.                                      |
| Standard     | `call`             | `--color-action-call`      | #00e5ff | Cyan = default neutral-positive poker action; most common tier gets the most "neutral" hue. |
| Pro          | `raise`            | `--color-action-raise`     | #ffab00 | Amber = higher stakes; matches the Neon Strip "chip" accent token.                          |
| High Stakes  | `fold`             | `--color-action-fold`      | #ff4757 | **Red** chosen over `allin` orange — RESEARCH Q9 rationale verified below.                  |

### High Stakes color: `fold` (red) vs `allin` (orange) — final choice

**Choice: `fold` (red).**

Rationale (matches RESEARCH Q9):
- Pro tier renders in amber (`raise`). `allin` is orange, which is hue-adjacent to amber and harder to distinguish as a Badge pill on a small mobile screen, especially with the low-alpha background tint.
- Red (`fold`) is unambiguously the strongest signal in the palette. Semantically it typically means "fold", but in an informational tier-header context that cross-purposing is acceptable — the Badge is not an actionable button.
- Readability test on rendered mocks: the red Badge is immediately distinguishable from the amber Pro Badge above it at any realistic viewport.

No fallback to `allin` was needed.

## Layout Breakdown

```
┌─────────────────────────────────────────────┐
│  [← Back]  TABLES                           │  ← header: neutral Button + title
├─────────────────────────────────────────────┤
│  [BEGINNER] ────────────── 2 TABLES         │  ← Badge sit green + separator + count
│  ┌─────────────────────────────────────┐    │
│  │ 🌱 Beginner Table #1   5/10  500 0/6│    │  ← Card sit variant
│  │ Live                   Blinds       │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │ 🌱 Beginner Table #2   5/10  500 2/6│    │
│  └─────────────────────────────────────┘    │
│                                             │
│  [STANDARD] ────────────── 2 TABLES         │  ← Badge call cyan
│  ┌─────────────────────────────────────┐    │
│  │ ⭐ Standard Table #1  10/20 1000 0/6│    │  ← Card call variant
│  └─────────────────────────────────────┘    │
│  …                                          │
│                                             │
│  [PRO] ────────────────────  1 TABLE        │  ← Badge raise amber
│  …                                          │
│                                             │
│  [HIGH STAKES] ───────────── 1 TABLE        │  ← Badge fold red
│  …                                          │
└─────────────────────────────────────────────┘
```

Row structure (left → right): Table name + live/full/open status underline → blinds `sb/bb` (amber mono with glow) → buy-in + `N/6` stacked right.

## Decisions Made

- **High Stakes = `fold` (red):** Red survives the amber-adjacency test that orange fails; RESEARCH Q9 recommendation verified, locked.
- **Full-table UX:** Opacity 0.5 visual cue only; row stays tappable — the server is authoritative on admission. Matches the plan's `<action>` guidance ("tap may still be allowed").
- **Status text under name:** Added a small uppercase `Live` / `Open` / `Full` indicator to replace the old emoji status dots. When `status === 'playing'`, the text lights cyan with a `var(--glow-call)` textShadow — cheap at-a-glance signal without introducing a new tier color.
- **Kept emojis in `table.name`:** The server config ships the names with prefix glyphs (🌱 ⭐ 🔥 💎). They pair cleanly with the colored Badge headers and stripping them would need a coordinated change to `server/config/tables.ts` outside this plan's file list.
- **Inline `style={{…}}` over Tailwind classes:** Matches the established Phase 1/2 pattern (`GameControls.tsx`, `SeatsDisplay.tsx`). The Neon Strip glow/color-mix recipes don't map to Tailwind utilities cleanly, and the primitives themselves already encode 95% of the visual recipes.

## Deviations from Plan

None — plan executed exactly as written. No Rule 1/2/3 auto-fixes, no Rule 4 architectural stops, no authentication gates.

Every `<done>` criterion verified:
- 4 tier sections in fixed order ✓ (TIER_ORDER const)
- Section header + grouped rows under each ✓ (TierSection component)
- Rows use Card with tier variant ✓ (TableRow passes `variant={variant}`)
- Player count + blinds + buy-in visible per row ✓ (three-column flex)
- Tap joins table (existing handler unchanged) ✓ (onClick → `onSelect(table)` → `onSelectTable(table.id)`)
- No inline NEON literals ✓ (grep confirms only `#0a0a0e` surface base and `#fff` plain white text; no palette hex)
- `cd client && npm run build` passes ✓

## Issues Encountered

- **`node_modules` missing in worktree:** The client's `node_modules` did not carry over into the `agent-ab2f4276` worktree; `npm run build` failed until `npm install` ran inside `client/`. Not a code issue, worktree setup only. The install and build both completed in ~4s total.
- **Pre-existing Vite build warnings (out of scope):** Plan 02-02's avatar manifest produces 16 `new URL("./{animal}.webp", import.meta.url) doesn't exist at build time` warnings at `npm run build` time. These are pre-existing (avatar WebPs not yet generated; scheduled for a later plan) and are not caused by this plan's changes — left unchanged per scope-boundary rule. Build still succeeds.

## User Setup Required

None.

## Next Phase Readiness

- TableList is fully migrated to `ui/` primitives; no follow-up page-touches required by later plans in Phase 2.
- The `tierOf(table)` helper + `TIER_VARIANT` map are local to `TableList.tsx` today; if a future feature needs tier classification elsewhere (e.g. a tier filter in admin panel, tier indicator on seat), consider promoting them to a shared `client/src/lib/tiers.ts` module. Not needed in Phase 2.
- Plan 02-07 (Game Room Chrome) and Plan 02-06 (Profile 3-tabs) can continue independently; this plan did not touch any shared primitives or tokens.

## Self-Check: PASSED

- `client/src/pages/TableList.tsx` — FOUND (modified, 399 insertions)
- Commit `e34447b` (Task 1) — FOUND in `git log --oneline --all`
- Build artifact `client/dist/assets/index-*.js` — produced (257.08 KB, 79.23 KB gzip) — FOUND
- Tier variants mapped to closed ActionTier union from `components/ui/tokens.ts` — VERIFIED (import at line 4)
- Zero NEON palette hex literals in TableList.tsx (only `#0a0a0e` surface base + `#fff` plain text) — VERIFIED via Grep
- `onSelectTable` / `onBack` props unchanged vs `App.tsx:378-382` — VERIFIED

---
*Phase: 02-design-system-rollout-avatars*
*Plan: 05-table-list-tier-groups*
*Completed: 2026-04-16*
