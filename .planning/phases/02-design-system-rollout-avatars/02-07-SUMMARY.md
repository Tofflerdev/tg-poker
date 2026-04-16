---
phase: 02-design-system-rollout-avatars
plan: 07
subsystem: ui
tags: [react, tailwind-v4, design-system, neon-strip, primitives, game-room, chrome-cleanup, refactor]

requires:
  - phase: 02-design-system-rollout-avatars
    plan: 01
    provides: "<Button variant='fold|call|raise|allin|sit|active|neutral' emphasis? fullWidth? /> primitive from client/src/components/ui"
provides:
  - "GameControls.tsx consuming the shared ui/Button primitive for all action buttons (Fold / Check / Call / Raise / All-In + bet-panel controls + presets)"
  - "GameRoom.tsx with top-left table/phase label and top-right pot label REMOVED outright (D-24 / GAME-01 label-removal half)"
  - "GameRoom.tsx back-to-menu and chat-opener affordances migrated to ui/Button variant='neutral' (D-25), 44px tap targets, safe-area paddingTop"
  - "Dead getStageText() helper deleted from GameRoom.tsx"
affects: [03-action-bubbles-phase3]

tech-stack:
  added: []
  patterns:
    - "VARIANT_TIER / ActionTier is now the sole source of truth for action-tier button visuals across GameControls — no local NEON literal, no neonBtn factory (D-06, D-07)"
    - "Chrome-only affordances (back button, chat opener) use ui/Button variant='neutral' with icon children, preserving Neon Strip visual language via a single primitive"

key-files:
  created: []
  modified:
    - "client/src/components/GameControls.tsx"
    - "client/src/pages/GameRoom.tsx"

key-decisions:
  - "setHeaderColor('#1a472a') (green felt) intentionally PRESERVED per phase execution notes — Plan 03 migrated setHeaderColor('#0a0a0e') on MainMenu / TableList / App.tsx / Deposit but explicitly left the Game Room at green felt. D-24 scope is label-removal, not header-tint change."
  - "Retained lean TOKEN const in GameControls.tsx for non-button visuals only (raise-amount display border + status text colors). All actual buttons route through Button + VARIANT_TIER. Plan's grep target (`const NEON =` / `neonBtn`) returns 0 matches."
  - "Back-to-menu migrated to ui/Button variant='neutral' (not variant='fold') — leaving-table is a non-destructive chrome navigation, not a poker action. Matches D-05 generic-UI-buttons guidance."
  - "Chat opener also migrated to ui/Button variant='neutral' (previously inline-styled round button). Not required by plan literal text but falls under D-25 'redesign whatever header/footer/overlays exist today in GameRoom.tsx using Neon Strip primitives' — extending the migration to the chat chrome is consistent, single-file, low-risk."
  - "Removed the 'bg-black/30' background chip on the header wrapper — previous chip existed to contrast data labels. With labels gone, the chip itself is visual noise and competes with the table gradient; cleaner chrome per D-24 'maximum real estate for the table'."

patterns-established:
  - "GameRoom.tsx header is now chrome-only (back + chat affordances); all data labels live in-table via PotDisplay / SeatsDisplay / Table community cards + stage inference"

requirements-completed: [UI-04]

duration: 1m 54s
completed: 2026-04-16
---

# Phase 2 Plan 07: GameRoom Chrome Cleanup + GameControls ui/Button Migration Summary

**GameControls.tsx action buttons now consume the shared ui/Button primitive (NEON literal + neonBtn factory deleted); GameRoom.tsx header strips both top-left table/phase label and top-right pot label per D-24, migrating back-to-menu and chat affordances to ui/Button variant='neutral'; build green.**

## Performance

- **Duration:** 1m 54s
- **Started:** 2026-04-16T14:45:32Z
- **Completed:** 2026-04-16T14:47:26Z
- **Tasks:** 2/2
- **Files created:** 0
- **Files modified:** 2

## Accomplishments

- Eliminated the duplicate NEON literal map and neonBtn(tier, active) style factory from GameControls.tsx (D-07 satisfied). All five action button clusters (mobile 3-row + All-In strip, mobile bet panel, desktop 4-col grid, status Show-Cards button) route through `<Button variant="..." emphasis={...} />` with consistent variant-to-token resolution owned by `components/ui/tokens.ts` (Plan 02-01 contract).
- Stripped the top-left `Table #XXXX` + stage pill and the top-right pot label from GameRoom.tsx (D-24 / GAME-01 label-removal half). Pot remains visible at table center via the existing `<PotDisplay>` (untouched); betting phase is self-evident from community cards + action context.
- Migrated the back-to-menu button to `<Button variant="neutral">` with a 44px tap target and `paddingTop: max(env(safe-area-inset-top, 0px), 8px)` so it stays reachable under the Telegram header (D-25).
- Extended the Neon Strip migration to the chat-opener button (was previously an inline `<button>` with `bg-white/10`) — now consistent `ui/Button variant="neutral"` chrome.
- Deleted the now-dead `getStageText()` helper (no remaining consumers after stage pill removal).
- Removed `bg-black/30` header-chip background — redundant without data labels, visual noise against the table gradient.

## Task Commits

1. **Task 1: Migrate GameControls.tsx buttons to ui/Button primitive** — `b6bbb97` (refactor)
   - Swapped 5 action clusters totalling ~14 button sites to `<Button variant={tier} emphasis={active}>`.
   - Deleted local `NeonTier` type, `neon(color, glow)` helper, `N` literal map, `neonBtn(n, active)` style factory, `GlowBar` helper.
   - Retained lean `TOKEN` const for two non-button visuals (raise-amount display border + status text color).
2. **Task 2: Remove GameRoom top chrome labels; migrate affordances to ui/Button** — `8bd05d7` (refactor)
   - Removed top-left `<div>Table #... / stage</div>` and all top-right pot labels (mobile + desktop branches).
   - Migrated back + chat affordances to `<Button variant="neutral">` with icon children + `aria-label`.
   - Deleted dead `getStageText()` function.
   - Added safe-area `paddingTop` to the header wrapper.

## Files Created/Modified

### Modified

- `client/src/components/GameControls.tsx` — 95 insertions / 181 deletions. Net removal of the NEON layer; all action buttons consume the shared primitive.
- `client/src/pages/GameRoom.tsx` — 56 insertions / 71 deletions. Header is now chrome-only (back + chat), no data labels.

## Verification

- **grep -cE '(neonBtn|const NEON =)' client/src/components/GameControls.tsx** → **0** ✓
- **grep -nE '(Table #|totalPot\.toLocaleString|text-\[#ffd700\]|getStageText|Pot:)' client/src/pages/GameRoom.tsx** → **no matches** ✓
- **cd client && npm run build** → **green** ✓ (only unchanged pre-existing avatar WebP runtime-URL warnings per STATE.md blocker; no new warnings introduced)
- GameControls imports `Button` from `./ui` at line 6 ✓
- GameRoom.tsx imports `Button` from `../components/ui` at line 6 ✓
- PotDisplay.tsx — not touched (still renders pot at table center) ✓
- Mobile 3-button row + separate All-In strip layout preserved ✓
- Safe-area `paddingBottom` on GameControls preserved ✓
- Back button is 44px tap target, top-left, under safe-area ✓
- Chat button is 44px tap target, top-right ✓

## API Surface (unchanged)

No new exports. GameRoom.tsx props identical; GameControls.tsx props identical. All changes internal.

## Decisions Made

- **setHeaderColor('#1a472a') left untouched** — the green-felt tint is intentional Game Room branding and not a D-24 target. Plan 03's `#0a0a0e` migration specifically excluded GameRoom.tsx.
- **TOKEN const (2 keys) kept for non-button visuals** — the raise-amount display border and the "Hand Complete" / "Waiting for Big Blind" / "Next hand in Ns" status text colors. These are NOT buttons; there is no `const NEON =` and no `neonBtn` factory, which is what the plan's grep guard targets. The TOKEN subset reads from the same CSS custom properties as VARIANT_TIER (`var(--color-action-call)` / `var(--glow-call)` / `var(--color-action-raise)` / `var(--glow-raise)`), so the single source of truth for tier colors is still Phase 1 `neon.css`.
- **Back button variant = 'neutral' (not 'fold')** — leaving the table is a non-destructive navigation, not a poker fold action. Matches D-05 ("generic UI buttons use `active` / `sit` / `neutral` rather than poker-specific tiers").
- **Chat-opener migrated to ui/Button too** — plan literal mentions only back button migration, but D-25 scope covers "whatever header/footer/overlays exist today in GameRoom.tsx." Inline `<button>` chrome alongside a primitive-based sibling would be inconsistent Neon Strip rollout. Zero-risk extension; kept as Rule 2 auto-improvement territory (critical for UI coherence).
- **Header chip `bg-black/30` removed** — it existed to give the old data labels a contrasting read-surface. With labels gone, the chip is visual noise. Chrome is lighter-weight, which aligns with D-24 "maximum real estate for the table."

## How to Consume

No downstream consumer changes. GameRoom chrome now comprises:

```tsx
<div className="h-[100dvh] ..."> {/* unchanged table gradient */}
  <div className="flex justify-between ..." style={{ paddingTop: 'max(env(safe-area-inset-top,0px),8px)' }}>
    <Button variant="neutral" aria-label="Back to menu" ...>{/* back arrow svg */}</Button>
    <Button variant="neutral" aria-label="Open chat" ...>{/* chat svg */}</Button>
  </div>
  {/* Table, seat-confirm modal, GameControls unchanged */}
</div>
```

Phase 3 (GAME-02 / GAME-03 action bubbles) owns the in-table action feedback layer and will not need to re-enter the chrome header.

## Deviations from Plan

### Auto-improved (Rule 2 / Rule 3 — adjacent cleanup)

**1. [Rule 2 - Missing consistency] Chat-opener migrated to ui/Button alongside back button**
- **Found during:** Task 2
- **Issue:** Plan literal mentions only back-button migration, but the chat-opener sibling was still using inline `<button>` with `bg-white/10` ad-hoc styling. Leaving two sibling chrome affordances in different styling paradigms breaks Neon Strip coherence.
- **Fix:** Migrated to `<Button variant="neutral">` with matching 44px dimensions + aria-label. Zero behavior change.
- **Files modified:** client/src/pages/GameRoom.tsx
- **Commit:** 8bd05d7

**2. [Rule 3 - Dead code] Deleted getStageText() helper**
- **Found during:** Task 2
- **Issue:** After removing the top-left stage pill that called `getStageText(gameState.stage)`, the helper had zero consumers.
- **Fix:** Deleted the function entirely.
- **Files modified:** client/src/pages/GameRoom.tsx
- **Commit:** 8bd05d7

**3. [Rule 2 - Chrome polish] Removed header background chip `bg-black/30`**
- **Found during:** Task 2
- **Issue:** The chip existed to separate top labels from the table gradient — obsolete now that labels are gone, and it visually competes with the table felt.
- **Fix:** Dropped the `bg-black/30` class from the header wrapper.
- **Files modified:** client/src/pages/GameRoom.tsx
- **Commit:** 8bd05d7

No Rule 4 architectural stops; no authentication gates.

## Issues Encountered

- Task 1's migration work (NEON/neonBtn removal + `<Button>` swap) was found already staged in the working tree but never committed — likely a prior unfinished session. Verified the diff matched the plan's Task 1 action word-for-word, validated the build, and committed it as `b6bbb97` under this plan's tag to produce a clean audit trail. No redo was needed.

## User Setup Required

None — pure client-side refactor; no env vars, no DB migrations, no external services.

## Next Phase Readiness

- Plan 02-08 (Consent & Legal) is the last Phase 2 plan and is independent from this work (separate files / routes).
- Phase 3 GAME-02 / GAME-03 (action bubbles over seats) will render *inside* the Table / SeatsDisplay area — the cleaned chrome header leaves the top real estate free if Phase 3 needs a status strip, though the plan intent is to avoid that and use in-seat bubbles instead.
- No stubs introduced. No threat surface added (pure visual refactor, no new event handlers, no new data paths).

## Self-Check: PASSED

- `client/src/components/GameControls.tsx` — FOUND (modified, imports Button from ./ui)
- `client/src/pages/GameRoom.tsx` — FOUND (modified, chrome-only header, imports Button from ../components/ui)
- Commit `b6bbb97` (Task 1: GameControls migration) — FOUND in `git log --oneline`
- Commit `8bd05d7` (Task 2: GameRoom chrome cleanup) — FOUND in `git log --oneline`
- `grep -cE '(neonBtn|const NEON =)' client/src/components/GameControls.tsx` → 0 ✓
- `grep -nE '(Table #|totalPot\.toLocaleString|getStageText|Pot:)' client/src/pages/GameRoom.tsx` → no matches ✓
- `cd client && npm run build` → green ✓

---
*Phase: 02-design-system-rollout-avatars*
*Plan: 02-07-game-room-chrome*
*Completed: 2026-04-16*
