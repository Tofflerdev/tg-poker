---
phase: 02-design-system-rollout-avatars
plan: 04
type: execute
wave: 2
depends_on: ["02-01", "02-02", "02-03"]
files_modified:
  - client/src/pages/MainMenu.tsx
  - client/src/pages/Deposit.tsx
  - client/src/App.tsx
  - client/src/components/DailyBonusButton.tsx
autonomous: true
requirements: [UI-01, DEPOSIT-01, DEPOSIT-02]
must_haves:
  truths:
    - "Main Menu renders 4 Neon Strip blocks in order Deposit → Tables → Daily Bonus → Profile (D-16)"
    - "Main Menu shows the user's avatar via avatarUrl(currentUser.avatarId) — Telegram photo_url is not rendered (D-15)"
    - "Main Menu header shows the NightRiver logo (logo.svg from Plan 03)"
    - "Tapping Deposit transitions view to 'deposit' rendering Deposit.tsx 'Coming soon' page; no external links, no SDK, no email capture (D-17)"
    - "App.tsx AppView union extended with 'deposit' variant; route resolved without router (project idiom — RESEARCH Q5)"
    - "Main Menu uses Card + Button primitives from client/src/components/ui/ (no inline neonBtn duplication)"
  artifacts:
    - path: "client/src/pages/MainMenu.tsx"
      provides: "Redesigned Main Menu using ui primitives, 4-block layout, logo header"
    - path: "client/src/pages/Deposit.tsx"
      provides: "Coming soon page; back button returns to menu"
      exports: ["Deposit"]
    - path: "client/src/App.tsx"
      provides: "AppView extended with 'deposit'; render branch added"
  key_links:
    - from: "client/src/pages/MainMenu.tsx"
      to: "client/src/components/ui/index.ts"
      via: "import { Button, Card } from '../components/ui'"
      pattern: "from '\\.\\./components/ui'"
    - from: "client/src/pages/MainMenu.tsx"
      to: "client/src/assets/avatars/manifest.ts"
      via: "avatarUrl(currentUser.avatarId)"
      pattern: "avatarUrl\\("
    - from: "client/src/App.tsx"
      to: "client/src/pages/Deposit.tsx"
      via: "view === 'deposit' render branch"
      pattern: "view === 'deposit'"
---

<objective>
Redesign the Main Menu in Neon Strip using shared ui/ primitives (Plan 01); 4 blocks in order Deposit → Tables → Daily Bonus → Profile (D-16); show user avatar via the manifest resolver (Plan 02); show NightRiver logo header (Plan 03). Ship the Deposit "Coming soon" stub page and wire the new `'deposit'` AppView variant in App.tsx (D-17, RESEARCH Q5).

Per RESEARCH UI-05: use the `frontend-design` skill for the visual layout pass.

Output: Redesigned MainMenu.tsx, new Deposit.tsx, App.tsx routing extended. UI-01 + DEPOSIT-01 + DEPOSIT-02 satisfied.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/02-design-system-rollout-avatars/02-CONTEXT.md
@.planning/phases/02-design-system-rollout-avatars/02-RESEARCH.md
@.planning/codebase/CONVENTIONS.md
@client/src/pages/MainMenu.tsx
@client/src/App.tsx
@client/src/components/DailyBonusButton.tsx
@.planning/phases/02-design-system-rollout-avatars/02-01-ui-primitives/02-01-SUMMARY.md
@.planning/phases/02-design-system-rollout-avatars/02-02-avatar-pipeline/02-02-SUMMARY.md
@.planning/phases/02-design-system-rollout-avatars/02-03-branding-logo/02-03-SUMMARY.md

<interfaces>
<!-- From Plan 01 -->
import { Button, Card, type ActionTier } from '../components/ui';
// Button variants: 'fold' | 'call' | 'raise' | 'allin' | 'sit' | 'active' | 'neutral'
// Card optional variant + glow

<!-- From Plan 02 -->
import { avatarUrl, type AvatarId } from '../assets/avatars/manifest';
// currentUser.avatarId: AvatarId | undefined  (added to TelegramUser by Plan 02)

<!-- From Plan 03 -->
import logoUrl from '../assets/logo.svg';

<!-- App.tsx existing AppView union -->
type AppView = 'loading' | 'auth' | 'menu' | 'tables' | 'game' | 'profile';
// extend to add: | 'deposit'  (other variants land in Plans 06 + 08)

<!-- Deposit page contract -->
interface DepositProps { onBack: () => void; }
export const Deposit: React.FC<DepositProps>;
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Redesign MainMenu.tsx with 4-block Neon Strip layout</name>
  <files>client/src/pages/MainMenu.tsx, client/src/components/DailyBonusButton.tsx</files>
  <action>
    Use the `frontend-design` skill (UI-05) for visual decisions. Rebuild MainMenu.tsx:

    Layout (top to bottom, mobile-first):
    1. **Header strip**: NightRiver logo (`<img src={logoUrl} alt="NightRiver" style={{ height: 40 }} />`) centered or left-aligned with safe-area-top padding. Per Plan 03, replaces any current text title.
    2. **Block order (D-16)**:
       - **Deposit block** (first) — `<Card variant="raise" glow>` containing label "Deposit", subtext "Add chips" or similar, with a tap handler `onClick={() => onNavigate('deposit')}`. Use the `raise` (amber/chip) tier as the primary CTA color matching the chip semantic.
       - **Tables block** — `<Card variant="call">` "Play Now" → `onNavigate('tables')`.
       - **Daily Bonus block** — `<Card variant="sit">` containing the existing `<DailyBonusButton>` (refactor it to consume `<Button variant="sit" emphasis>` instead of any inline neon literals); shows claim state from `currentUser.canClaimDaily`.
       - **Profile block** — `<Card variant="active">` containing avatar + display name + balance summary, tap handler `onNavigate('profile')`. Render avatar via `<img src={avatarUrl(currentUser.avatarId)} alt={currentUser.displayName} style={{ width: 48, height: 48, borderRadius: 999, objectFit: 'cover' }} />` with initial-letter fallback if avatarUrl returns undefined (D-14, D-15). DO NOT render `currentUser.avatarUrl` (Telegram photo).
    3. **Footer strip** — small text links to legal pages: ToS · Privacy · Responsible Gaming. These tap-targets call `onNavigate('legal-tos' | 'legal-privacy' | 'legal-rg')`. Plan 08 owns the legal pages and ConsentBanner — this footer just provides the entry points and the click handlers will be wired in Plan 08 when the AppView variants are added. For now, render the links as visible affordances; the click handlers can be no-ops or `console.log` placeholders that Plan 08 replaces.

    Style notes:
    - All blocks use `<Card>` from `../components/ui`. NO inline NEON literal objects — Plan 01 primitives are the only allowed source of variant styling.
    - Block height ≥56px, full-width, generous tap target.
    - Add `paddingBottom: max(env(safe-area-inset-bottom), 16px)` on the outer container.
    - Refactor DailyBonusButton.tsx to consume `<Button variant="sit" emphasis={canClaim} disabled={!canClaim}>` from ui/. Keep the existing claim-state computation logic; only swap the button visuals.

    Props: MainMenu receives `currentUser: TelegramUser`, `onNavigate: (view: AppView) => void`, `onClaimDailyBonus: () => void` (existing). No new props beyond `onNavigate` accepting the new variant.

    Per RESEARCH Pitfall 3 confirmation: keep the `setHeaderColor('#0a0a0e')` call from Plan 03 — do not regress.
  </action>
  <verify>
    <automated>cd client && npm run build</automated>
  </verify>
  <done>MainMenu.tsx renders 4 Card blocks in order Deposit→Tables→Bonus→Profile; uses ui/ Button + Card; avatar resolves via manifest.ts; logo header visible; footer legal links present (handlers may be placeholders); DailyBonusButton uses ui/Button; no inline NEON object remains in MainMenu.tsx; client build passes.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Create Deposit.tsx + extend App.tsx AppView with 'deposit' route</name>
  <files>client/src/pages/Deposit.tsx, client/src/App.tsx</files>
  <action>
    Create `client/src/pages/Deposit.tsx`. Per D-17:
    - Full-page Neon Strip layout, dark surface.
    - Header: small back button (top-left, ui/Button variant="neutral", arrow + "Back") wired to `props.onBack()`.
    - Center content: `<Card variant="active" glow>` with:
      - Headline: "Coming Soon" (large, `var(--color-active)`)
      - Body: "Real-money deposits are not yet available — play with virtual chips and claim your daily bonus."
    - **Strict per D-17**: NO external links, NO email capture form, NO payment SDK import, NO "notify me" button. Just informational copy and back button.

    In `client/src/App.tsx`:
    - Extend `AppView` union: add `'deposit'` (and reserve room for Plans 06/08 additions in a comment, but only add 'deposit' here — Plan 06 adds 'profile' subviews handled in-component, Plan 08 adds 'consent' + 'legal-*').
    - Add render branch: `if (view === 'deposit') return <Deposit onBack={() => setView('menu')} />;`
    - Update the `MainMenu` render call to pass an `onNavigate` prop that accepts the union: e.g., `onNavigate={(v) => setView(v)}`. If MainMenu currently uses dedicated handlers (`onSelectTables`, `onSelectProfile`), refactor to a single onNavigate or add `onSelectDeposit={() => setView('deposit')}` — match whatever existing pattern is cleanest. Prefer a single `onNavigate` prop going forward to ease Plan 08 extension.
    - Per RESEARCH Pitfall 4 (defense-in-depth consent gate): do NOT add the consent guard yet — Plan 08 owns it. Just add the 'deposit' variant.
  </action>
  <verify>
    <automated>cd client && npm run build</automated>
  </verify>
  <done>Deposit.tsx renders Coming Soon card + back button using ui/ primitives; AppView union includes 'deposit'; tapping Deposit on Main Menu transitions to the page; back button returns to menu; no external/payment refs; build passes.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| n/a | Pure UI rendering. No new server interactions; consumes existing currentUser state. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-04-01 | Information disclosure | currentUser.displayName / balance rendering | accept | React auto-escapes interpolation; same data already rendered in pre-redesign Main Menu. |
| T-02-04-02 | Tampering | Deposit page injecting payment form later via copy-paste mistake | mitigate | Plan explicitly states no SDK / no form / no external link; reviewer enforces during execution. |
</threat_model>

<verification>
- MainMenu shows: NightRiver logo header, then Card blocks Deposit → Tables → Daily Bonus → Profile, then footer legal links.
- User avatar in Profile block resolves from `avatarUrl(currentUser.avatarId)` (verified by checking server response includes avatarId after Plan 02 ships).
- Telegram `photo_url` is not rendered (grep MainMenu.tsx for `photoUrl` / `currentUser.avatarUrl` — should be absent or commented out).
- Tapping Deposit → Deposit.tsx Coming Soon page; back button returns.
- No payment SDK or external href visible in Deposit.tsx.
- Build green.
</verification>

<success_criteria>
- UI-01: Main Menu redesigned in Neon Strip using shared ui/ primitives.
- DEPOSIT-01: First-position Deposit block on Main Menu.
- DEPOSIT-02: Tap → in-app "Coming soon" page; no external links, no SDK.
- D-15: Telegram avatar no longer rendered on Main Menu.
- D-16: Block order locked Deposit → Tables → Bonus → Profile.
</success_criteria>

<output>
After completion, create `.planning/phases/02-design-system-rollout-avatars/02-04-main-menu-deposit/02-04-SUMMARY.md` documenting: final block order verified, screenshot path if produced, the exact `onNavigate` prop signature used (so Plan 08 can extend with legal/consent variants without API conflict).
</output>
