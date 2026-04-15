---
phase: 02-design-system-rollout-avatars
plan: 06
type: execute
wave: 2
depends_on: ["02-01", "02-02"]
files_modified:
  - client/src/pages/ProfileSettings.tsx
autonomous: true
requirements: [UI-03, PROFILE-01, AVATAR-03]
must_haves:
  truths:
    - "ProfileSettings renders 3 tabs in fixed order: Profile / Avatar / History (D-20)"
    - "Profile tab shows: avatar (current), inline-editable display name, stats grid (balance, handsPlayed, handsWon, totalWinnings, biggestPot), daily-bonus eligibility (D-21, PROFILE-01)"
    - "Avatar tab shows a 4×5 grid of all 20 avatars (D-22, D-13); selected tile has active glow ring; explicit Confirm button — disabled when pending == current; Confirm emits socket.emit('updateAvatar', { avatarId: pending })"
    - "History tab shows Neon Strip empty state with copy 'Your last 50 hands will appear here after the next release' (D-23); no socket/data wiring"
    - "Avatar resolves via avatarUrl(id) from manifest (D-14, D-15); Telegram photo_url is not rendered"
    - "Page uses ui/ Tab + TabBar + Card + Button primitives; no inline NEON"
  artifacts:
    - path: "client/src/pages/ProfileSettings.tsx"
      provides: "Redesigned Profile/Settings page with 3 tabs (Profile / Avatar / History)"
  key_links:
    - from: "ProfileSettings.tsx Avatar tab Confirm button"
      to: "server updateAvatar handler (Plan 02)"
      via: "socket.emit('updateAvatar', { avatarId: pending })"
      pattern: "socket\\.emit\\('updateAvatar'"
    - from: "ProfileSettings.tsx"
      to: "client/src/assets/avatars/manifest.ts"
      via: "AVATARS, avatarUrl"
      pattern: "from '\\.\\./assets/avatars/manifest'"
    - from: "ProfileSettings.tsx display name edit"
      to: "server updateProfile handler"
      via: "existing socket.emit('updateProfile', { displayName })"
      pattern: "updateProfile"
---

<objective>
Redesign Profile/Settings as a 3-tab page (Profile / Avatar / History — D-20) using ui/ Tab + Card + Button primitives. Profile tab shows full PROFILE-01 surface (D-21). Avatar tab is the 4×5 grid picker with explicit Confirm (D-22, D-13, AVATAR-03 / RESEARCH §Example 3 / Pitfall 5). History tab is a stub locking layout for Phase 3 (D-23).

Per UI-05: use `frontend-design` skill.

Output: Redesigned ProfileSettings.tsx. UI-03 + PROFILE-01 + AVATAR-03 satisfied.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/02-design-system-rollout-avatars/02-CONTEXT.md
@.planning/phases/02-design-system-rollout-avatars/02-RESEARCH.md
@client/src/pages/ProfileSettings.tsx
@client/src/App.tsx
@.planning/phases/02-design-system-rollout-avatars/02-01-ui-primitives/02-01-SUMMARY.md
@.planning/phases/02-design-system-rollout-avatars/02-02-avatar-pipeline/02-02-SUMMARY.md

<interfaces>
<!-- From Plan 01 -->
import { Button, Card, Tab, TabBar, type ActionTier } from '../components/ui';

<!-- From Plan 02 -->
import { AVATARS, avatarUrl, type AvatarId } from '../assets/avatars/manifest';
// currentUser.avatarId: AvatarId | undefined
// socket events: 'updateAvatar' (emit) + 'avatarUpdated' (listen — App.tsx already wires per Plan 02)

<!-- Existing TelegramUser fields used here -->
balance, handsPlayed, handsWon, totalWinnings, biggestPot, displayName, canClaimDaily, lastDailyRefill (and now avatarId from Plan 02)
NOTE: handsPlayed/handsWon/totalWinnings/biggestPot are on UserProfile (server/db). Confirm at execution time whether mapToTelegramUser already exposes them or whether mapToUserProfile does — Plan 02 adds avatarId/tosAcceptedAt to TelegramUser; if stats are missing from TelegramUser, this plan must add them too OR call an existing getProfile socket event.

<!-- Existing socket events for display name change -->
ExtendedClientEvents.updateProfile: ({ displayName?, avatarUrl? }) — existing
ExtendedServerEvents.profileUpdated: (...) — existing pattern
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Build Profile tab content + History stub + page shell with TabBar</name>
  <files>client/src/pages/ProfileSettings.tsx</files>
  <action>
    Use `frontend-design` skill (UI-05). Rebuild ProfileSettings.tsx as a single component with internal `activeTab` state ('profile' | 'avatar' | 'history').

    **Page shell:**
    - Top: Back button (ui/Button variant="neutral") + page title "Profile".
    - `<TabBar tabs={[{id:'profile',label:'Profile'},{id:'avatar',label:'Avatar'},{id:'history',label:'History'}]} activeId={activeTab} onChange={setActiveTab} />` — fixed order (D-20).
    - Below TabBar: conditional content per `activeTab`.
    - Safe-area paddingBottom.

    **Profile tab (D-21):**
    - `<Card variant="active">`: avatar (large, 96×96, circular, avatarUrl(currentUser.avatarId) with initial-letter fallback) + display name (inline-editable: tap to switch to `<input>`, blur or Enter commits via existing socket emit `updateProfile { displayName }`; show subtle pencil affordance).
    - `<Card variant="raise">`: stats grid — 2 cols × 3 rows (or 3×2):
      - Balance: `{currentUser.balance}` (amber chip color)
      - Hands Played: `{handsPlayed}`
      - Hands Won: `{handsWon}`
      - Total Winnings: `{totalWinnings}`
      - Biggest Pot: `{biggestPot}`
    - `<Card variant="sit">`: Daily Bonus eligibility — if `canClaimDaily` show "Claimable now" + `<Button variant="sit" emphasis>Claim 1000</Button>` (wired to existing socket flow); else show "Next claim available at: {formatted lastDailyRefill + 24h}".
    - If `handsPlayed`/etc are NOT on TelegramUser at execute time, add them to the `mapToTelegramUser` projection in server/db/UserRepository.ts within this task (small additive change). Cross-check: Plan 02's mapToTelegramUser changes only added avatarId + tosAcceptedAt; PROFILE-01 needs the stats. They may already be there from earlier work — verify and extend if missing.

    **History tab (D-23):**
    - `<Card variant="neutral">`: empty-state with neutral border + soft glow, large icon-or-text placeholder, copy: "Your last 50 hands will appear here after the next release." No data fetch, no socket call.

    Per D-15: NO `currentUser.avatarUrl` (Telegram photo) rendered — only `avatarUrl(currentUser.avatarId)`.

    Defer Avatar tab content to Task 2 — render `<div>(Avatar picker — Task 2)</div>` placeholder so this task ships independently testable.
  </action>
  <verify>
    <automated>cd client && npm run build</automated>
  </verify>
  <done>3 tabs render in order Profile / Avatar / History; Profile tab shows avatar + editable name + stats grid + bonus state; History tab shows empty state; Avatar tab shows placeholder (Task 2 fills); ui/ primitives used throughout; build passes.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Build Avatar tab — 4×5 grid picker + explicit Confirm</name>
  <files>client/src/pages/ProfileSettings.tsx</files>
  <action>
    Implement the Avatar tab content per RESEARCH §Example 3 + D-13 / D-22 / Pitfall 5:

    State (inside ProfileSettings):
    ```typescript
    const [pendingAvatar, setPendingAvatar] = useState<AvatarId | undefined>(currentUser.avatarId as AvatarId | undefined);
    const dirty = pendingAvatar !== undefined && pendingAvatar !== currentUser.avatarId;
    ```

    Layout:
    - **Grid**: `<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>` with one tile per slug in `AVATARS` (20 total → 4×5).
    - Each tile is a `<button onClick={() => setPendingAvatar(id)}>` showing `<img src={avatarUrl(id)} alt={id} />` filling the tile, aspectRatio 1, borderRadius 14, dark bg.
    - Selected tile (`pendingAvatar === id`): border `1.5px solid color-mix(in srgb, var(--color-active) 56%, transparent)` + boxShadow `0 0 16px var(--glow-call), inset 0 0 8px var(--glow-call)`. Unselected: subtle neutral border at 18% alpha. Use the existing pattern in RESEARCH §Example 3 verbatim — no new tokens needed.
    - Tap target ≥ 60px square minimum; padding around grid for safe-area.

    Below grid:
    - `<Button variant="active" emphasis disabled={!dirty} fullWidth onClick={onConfirm}>Confirm</Button>`
    - `onConfirm`: `socket.emit('updateAvatar', { avatarId: pendingAvatar })`. Server emits `avatarUpdated` (already wired in App.tsx by Plan 02) which updates currentUser, which re-renders ProfileSettings with the new avatar — at which point `dirty` becomes false and Confirm disables.
    - Optional: Show a small toast or inline status after confirm (skip if it bloats — D-13 only requires the explicit Confirm gesture, not feedback chrome).

    Per Pitfall 5: NO instant-save on tap. Tap only updates `pendingAvatar`; only Confirm emits. Reviewer must verify by tapping multiple tiles before Confirm — only the final selection is submitted.

    Per Pitfall 6 / RESEARCH §Security: server already validates `payload.avatarId ∈ AVATARS` (Plan 02) — no additional client-side validation needed beyond using the manifest's typed `AvatarId`.
  </action>
  <verify>
    <automated>cd client && npm run build</automated>
  </verify>
  <done>Avatar tab renders 4×5 grid of 20 WebPs; tap selects (visual ring); Confirm disabled when pending == current; Confirm emits socket event; client build passes; no instant-save behavior.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → server `updateAvatar` | Already covered by Plan 02 threat model (T-02-02-02 input validation) |
| client → server `updateProfile` (display name) | Existing event; no new attack surface |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-06-01 | Tampering | Display name input (XSS via stored name) | mitigate | React `{currentUser.displayName}` interpolation auto-escapes; no dangerouslySetInnerHTML. |
| T-02-06-02 | Tampering | Display name length / charset abuse | accept | Server-side validation already covers (existing updateProfile handler); no new validation introduced here. If server lacks length cap, surface as Phase 5 hardening. |
| T-02-06-03 | Information disclosure | Other users' stats | n/a | Profile only shows current user's own stats. |
</threat_model>

<verification>
- Tab order: Profile / Avatar / History.
- Profile tab: avatar (manifest-resolved), inline-editable display name, 5 stats, bonus eligibility state.
- Avatar tab: 4×5 = 20 tiles; tap-to-select; Confirm respects dirty state; emits updateAvatar.
- History tab: empty-state copy, no data fetch.
- Telegram photo_url not rendered.
- Build green.
</verification>

<success_criteria>
- UI-03: Profile/Settings redesigned with 3 tabs.
- PROFILE-01: All required fields visible.
- AVATAR-03: User can re-pick avatar via 4×5 grid + Confirm; choice replaces Telegram avatar everywhere.
- D-13 / D-20 / D-21 / D-22 / D-23 honored.
</success_criteria>

<output>
After completion, create `.planning/phases/02-design-system-rollout-avatars/02-06-profile-three-tabs/02-06-SUMMARY.md` documenting: any extension to mapToTelegramUser (if stats had to be added), screenshot of all 3 tabs if produced, confirmation that instant-save was not introduced.
</output>
