---
phase: 02-design-system-rollout-avatars
plan: 07
type: execute
wave: 2
depends_on: ["02-01"]
files_modified:
  - client/src/pages/GameRoom.tsx
  - client/src/components/GameControls.tsx
autonomous: true
requirements: [UI-04]
must_haves:
  truths:
    - "Top-left table/phase label is removed from GameRoom.tsx outright (D-24, GAME-01) — no replacement"
    - "Top-right pot label is removed from GameRoom.tsx outright (D-24, GAME-01) — pot remains visible at center via existing PotDisplay"
    - "GameControls buttons consume <Button variant='fold|call|raise|allin'> from ui/ — the inline NEON object + neonBtn factory is removed (D-07)"
    - "A small back-to-menu affordance (top-left, ui/Button variant='neutral') remains discoverable but is chrome, not a data label (D-25)"
    - "If a loading/splash branch exists in App.tsx that uses a generic spinner, swap to logo (RESEARCH Open Q2) — non-blocking nicety"
  artifacts:
    - path: "client/src/pages/GameRoom.tsx"
      provides: "GameRoom with redundant chrome labels removed; back affordance preserved in Neon Strip style"
    - path: "client/src/components/GameControls.tsx"
      provides: "Action buttons migrated to ui/Button; NEON literal object removed"
  key_links:
    - from: "client/src/components/GameControls.tsx"
      to: "client/src/components/ui/Button.tsx"
      via: "import { Button } from './ui/Button' (or '../ui')"
      pattern: "from '\\./ui|from '\\.\\./ui"
    - from: "client/src/pages/GameRoom.tsx top labels"
      to: "(deleted)"
      via: "removal — verified by absence"
      pattern: "(table label / phase label / top-right pot — must NOT be present)"
---

<objective>
Clean Game Room chrome (UI-04, GAME-01): outright remove top-left table/phase label and top-right pot label per D-24 (no replacement — pot is at center via PotDisplay; phase is self-evident). Migrate `GameControls.tsx` action buttons to consume the shared `ui/Button` primitive per D-07, eliminating the duplicate `NEON` literal map and the inline `neonBtn(n, active)` factory.

Per UI-05: use `frontend-design` skill where the back-affordance / chrome layout decisions need a visual pass.

Output: GameRoom chrome cleanup + GameControls migration. UI-04 + GAME-01 satisfied (note: GAME-01 is also tagged in Phase 3 ROADMAP for action bubbles — Phase 2 satisfies the label-removal half; Phase 3 owns the bubble work).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/02-design-system-rollout-avatars/02-CONTEXT.md
@.planning/phases/02-design-system-rollout-avatars/02-RESEARCH.md
@client/src/pages/GameRoom.tsx
@client/src/components/GameControls.tsx
@client/src/components/PotDisplay.tsx
@.planning/phases/02-design-system-rollout-avatars/02-01-ui-primitives/02-01-SUMMARY.md

<interfaces>
<!-- From Plan 01 -->
import { Button, type ActionTier } from '../components/ui';
// Variant maps directly to the existing GameControls action vocabulary:
//   Fold  → variant="fold"
//   Check → variant="call"  (semantic: passive accept)
//   Call  → variant="call"
//   Bet   → variant="raise"
//   Raise → variant="raise"
//   All-In → variant="allin"
// `emphasis` prop = the existing `active` argument to neonBtn(n, active).

<!-- GameControls.tsx existing factory ~lines 55-83 -->
const NEON = { fold:..., call:..., raise:..., allin:... };  // ← REMOVE
function neonBtn(tier, active) { return {...inlineStyles}; }   // ← REMOVE

<!-- GameRoom.tsx top chrome to remove -->
- Top-left: typically a `<div>{tableName} · {gameStage}</div>` or similar — REMOVE outright (D-24).
- Top-right: a small pot label (e.g., `<div>Pot: {totalPot}</div>`) — REMOVE outright (D-24, redundant with PotDisplay at table center).
- Back-to-menu button (if currently styled inline): MIGRATE to <Button variant="neutral"> in same top-left position — small, chrome only.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Migrate GameControls.tsx buttons to ui/Button primitive</name>
  <files>client/src/components/GameControls.tsx</files>
  <action>
    Per D-07 / RESEARCH §Pattern 1: replace the local `NEON` literal object and the `neonBtn(tier, active)` style factory with consumption of `<Button variant="..." emphasis={isActive}>` from `../components/ui`.

    Mapping:
    - Fold button → `<Button variant="fold" onClick={onFold}>Fold</Button>`
    - Check button → `<Button variant="call" emphasis>Check</Button>`
    - Call button → `<Button variant="call" emphasis>Call {amount}</Button>`
    - Bet/Raise button → `<Button variant="raise" emphasis>Raise to {amount}</Button>`
    - All-In button → `<Button variant="allin" emphasis>All-In {amount}</Button>` (separate strip below per existing mobile layout — preserve layout, only swap visuals)

    Preserve all current behavior:
    - Disabled states (pass through `disabled` prop).
    - Mobile layout: 3 main buttons in a row at 56px height + separate All-In strip.
    - Safe-area paddingBottom on the bottom-docked panel.
    - Tap haptic feedback if hooked up.
    - Bet sizing slider / quick-bet chips: keep existing implementation; only the action buttons themselves move to the primitive.

    DELETE the local `NEON` const and `neonBtn` function — Plan 01's `VARIANT_TIER` is now the single source of truth (D-06, D-07). Remove any unused imports.

    Verify: grep `client/src/components/GameControls.tsx` for `NEON` and `neonBtn` after change — should return 0 matches.
  </action>
  <verify>
    <automated>cd client && npm run build && grep -cE "(neonBtn|const NEON =)" client/src/components/GameControls.tsx</automated>
    <!-- grep -c should return 0; build must pass. If grep returns >0 the migration is incomplete. -->
  </verify>
  <done>GameControls.tsx imports Button from ui/ and uses it for all 4-5 action buttons; NEON literal + neonBtn factory deleted; mobile layout preserved (3-button row + All-In strip); build passes; visual smoke test shows identical button appearance to pre-migration.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Remove top-left and top-right chrome labels in GameRoom.tsx; preserve back affordance</name>
  <files>client/src/pages/GameRoom.tsx</files>
  <action>
    Per D-24 / GAME-01 / RESEARCH UI-04:
    - **Locate and DELETE outright** the top-left table-name + game-phase label (likely a small overlay div in the GameRoom header area). NO replacement — phase is self-evident from community cards + action context.
    - **Locate and DELETE outright** the top-right pot label. Pot stays visible at table center via the existing `<PotDisplay>` component (do not modify PotDisplay).
    - **Preserve / migrate back-to-menu affordance** (D-25): keep a small back button at top-left corner (chrome only, no data). Migrate to `<Button variant="neutral">` from ui/ if currently inline-styled. Touch target ≥44px; safe-area paddingTop.
    - **Anywhere else** in GameRoom.tsx that references these label DOM nodes (state, refs, useEffect cleanup) — clean up dead code as well.

    Use `frontend-design` skill (UI-05) for the back-button placement decision so it stays discoverable without competing with seat avatars.

    Per Plan 03: keep `setHeaderColor('#0a0a0e')` if present on this page; do not regress.

    Out of scope (DO NOT touch in this plan):
    - PotDisplay.tsx itself (already correct visual location).
    - SeatsDisplay.tsx (Plan 02 owns avatar wiring).
    - Action bubbles (Phase 3 GAME-02 / GAME-03).
    - Any reconnect overlay (Phase 4 RESILIENCE-05).
  </action>
  <verify>
    <automated>cd client && npm run build</automated>
  </verify>
  <done>GameRoom.tsx no longer contains top-left table/phase label or top-right pot label DOM; back-to-menu button remains discoverable (small, top-left, neutral variant); PotDisplay at center unchanged; build passes; visual smoke test confirms maximum table real estate per D-24.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| n/a | Visual cleanup only; no event handlers added; no data flow change. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-07-01 | n/a | GameControls migration | n/a | Pure visual refactor; behavior preserved (same onClick handlers, same disabled logic). |
</threat_model>

<verification>
- GameControls renders identical action buttons (Fold/Check/Call/Raise/All-In) but via ui/Button.
- `grep "neonBtn\\|const NEON =" client/src/components/GameControls.tsx` returns nothing.
- GameRoom no longer shows top-left table/phase or top-right pot labels.
- Back button still present, top-left, ui/Button variant="neutral".
- Pot still visible at table center (PotDisplay unchanged).
- Build green.
</verification>

<success_criteria>
- UI-04: Game room non-table chrome redesigned in Neon Strip; redundant top-left table/phase + top-right pot labels removed.
- GAME-01 (label-removal half): satisfied this phase.
- D-07: GameControls duplicate NEON map eliminated.
- D-24 / D-25 honored.
</success_criteria>

<output>
After completion, create `.planning/phases/02-design-system-rollout-avatars/02-07-game-room-chrome/02-07-SUMMARY.md` documenting: exact line ranges that were removed, screenshot of clean game room if produced, confirmation grep returns zero NEON/neonBtn matches.
</output>
