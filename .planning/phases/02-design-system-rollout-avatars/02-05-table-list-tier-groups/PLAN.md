---
phase: 02-design-system-rollout-avatars
plan: 05
type: execute
wave: 2
depends_on: ["02-01"]
files_modified:
  - client/src/pages/TableList.tsx
autonomous: true
requirements: [UI-02]
must_haves:
  truths:
    - "TableList groups the 6 predefined tables under 4 tier section headers: Beginner / Standard / Pro / High Stakes (D-18)"
    - "Each row shows table name, blinds (SB/BB), buy-in, and live player count N/6"
    - "Tier section headers carry the tier color: Beginner=sit/green, Standard=call/cyan, Pro=raise/amber, High Stakes=fold/red (D-19, RESEARCH Q9)"
    - "Rows use Card primitive; tier headers use Badge primitive; tap on a row joins the table (preserves existing onJoin handler)"
    - "Page uses ui/ primitives; no inline NEON literals"
  artifacts:
    - path: "client/src/pages/TableList.tsx"
      provides: "Redesigned Table List page grouped by stake tier with Neon Strip styling"
  key_links:
    - from: "client/src/pages/TableList.tsx"
      to: "client/src/components/ui/index.ts"
      via: "import { Card, Badge, Button } from '../components/ui'"
      pattern: "from '\\.\\./components/ui'"
    - from: "TableList row click"
      to: "App.tsx onJoinTable handler"
      via: "existing onSelectTable / joinTable prop (preserved)"
      pattern: "onSelectTable\\(|onJoinTable\\("
---

<objective>
Redesign the Table List in Neon Strip with **tier-grouped sections** (D-18) and tier-colored headers (D-19). The 6 predefined tables (server/config/tables.ts) are grouped: 2 Beginner (5/10), 2 Standard (10/20), 1 Pro (25/50), 1 High Stakes (100/200). Per RESEARCH Q9, High Stakes uses `fold` (red) — chosen for distinguishability from Pro's `raise` (amber).

Per UI-05: use `frontend-design` skill for layout pass.

Output: Redesigned TableList.tsx using ui/ Card + Badge primitives. UI-02 satisfied.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/02-design-system-rollout-avatars/02-CONTEXT.md
@.planning/phases/02-design-system-rollout-avatars/02-RESEARCH.md
@client/src/pages/TableList.tsx
@server/config/tables.ts
@.planning/phases/02-design-system-rollout-avatars/02-01-ui-primitives/02-01-SUMMARY.md

<interfaces>
<!-- From Plan 01 -->
import { Card, Badge, Button, type ActionTier } from '../components/ui';

<!-- TableInfo shape (existing in types/index.ts) -->
interface TableInfo {
  id: string;
  name: string;
  smallBlind: number;
  bigBlind: number;
  buyIn: number;
  playerCount: number;     // current
  maxPlayers: number;      // 6
  // ... possibly more
}

<!-- Tier mapping (locked by D-19 + RESEARCH Q9) -->
type Tier = 'Beginner' | 'Standard' | 'Pro' | 'High Stakes';
const TIER_VARIANT: Record<Tier, ActionTier> = {
  'Beginner':    'sit',     // green
  'Standard':    'call',    // cyan
  'Pro':         'raise',   // amber
  'High Stakes': 'fold',    // red (RESEARCH Q9 — readability over allin orange)
};

<!-- Tier classification by big blind (matches server/config/tables.ts) -->
function tierOf(t: TableInfo): Tier {
  if (t.bigBlind <= 10) return 'Beginner';
  if (t.bigBlind <= 20) return 'Standard';
  if (t.bigBlind <= 50) return 'Pro';
  return 'High Stakes';
}
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Redesign TableList.tsx with tier-grouped sections</name>
  <files>client/src/pages/TableList.tsx</files>
  <action>
    Use `frontend-design` skill (UI-05) for layout. Rebuild TableList.tsx:

    Layout (top to bottom):
    1. **Header**: Back button (top-left, ui/Button variant="neutral", arrow + "Back") + page title "Tables".
    2. **Tier sections** (in order Beginner → Standard → Pro → High Stakes): Iterate tables; group by `tierOf(table)`; render each non-empty tier as:
       - **Section header row**: Tier name + `<Badge variant={TIER_VARIANT[tier]}>` showing tier label OR a small horizontal accent strip in the tier color (planner pick — Badge is cleanest). Place at the start of each group with vertical spacing.
       - **Table rows under header**: Each row is a `<Card variant={TIER_VARIANT[tier]}>` with onClick={() => onSelectTable(table.id)} (or whatever the existing handler name is — match it). Row contents in a flex layout:
         - Left: Table name (`{table.name}`, white, semibold)
         - Middle: Blinds `{table.smallBlind}/{table.bigBlind}` (mono, `var(--color-chip)` amber)
         - Right: Buy-in `{table.buyIn}` chips · player count `{table.playerCount}/{table.maxPlayers}` (e.g., "3/6")
       - Disabled/full row: dim opacity 0.5 if `playerCount >= maxPlayers`; tap may still be allowed (server gates). Visual cue only.

    Keep all existing data flow (props: `tables: TableInfo[]`, `onSelectTable`, `onBack` etc — match the actual current signature); only the visual layer changes.

    Preserve safe-area paddingBottom + paddingTop.

    Per Plan 03: keep `setHeaderColor('#0a0a0e')` if it's currently in this file — do not regress to '#2481cc'.

    Per D-19 + RESEARCH Q9: lock High Stakes to `fold` (red). If rendered prototype shows readability issue, planner-discretion fallback is `allin` (orange) — note in SUMMARY which was finally used.
  </action>
  <verify>
    <automated>cd client && npm run build</automated>
  </verify>
  <done>TableList renders 4 tier sections (Beginner → Standard → Pro → High Stakes) each with header + grouped rows; rows use Card with tier variant; player count + blinds + buy-in visible per row; tap joins table (existing handler unchanged); no inline NEON literals; build passes.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| n/a | Pure UI; data already comes via existing socket events, not modified. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-05-01 | Information disclosure | Table list publicly visible | accept | Already-public game lobby; no PII surfaced. |
</threat_model>

<verification>
- TableList shows 4 tier section headers in fixed order (or only the non-empty ones if a tier has zero tables — current config has all 4 tiers populated).
- Each row shows name + blinds + buy-in + N/6.
- Tier colors: Beginner green, Standard cyan, Pro amber, High Stakes red.
- Tap on a row triggers the existing join handler (verified by smoke test or matching the current signature).
- Build green.
</verification>

<success_criteria>
- UI-02: Table List redesigned in Neon Strip with stake tier, player count, buy-in clearly displayed.
- D-18 grouping satisfied; D-19 tier colors locked.
</success_criteria>

<output>
After completion, create `.planning/phases/02-design-system-rollout-avatars/02-05-table-list-tier-groups/02-05-SUMMARY.md` documenting: final tier color choice for High Stakes (fold vs allin), screenshot path if produced.
</output>
