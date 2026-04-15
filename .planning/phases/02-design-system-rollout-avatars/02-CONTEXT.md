# Phase 2: Design System Rollout & Avatars - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Every player-facing page is redesigned in Neon Strip using shared `ui/` primitives; new users receive an animal avatar atomically on signup and can re-pick it; first-launch ToS/Privacy/RG consent is shipped client-side; a Deposit stub block lives first on Main Menu.

**In scope:**
1. Logo asset (AI-generated) wired to Main Menu + launch splash; brand name stays `NightRiver` for v1.0.
2. Shared `client/src/components/ui/` primitives: Button, Card, Tab, Badge — all four built upfront, variants keyed to Neon Strip action tiers.
3. Four-page redesign: Main Menu, Table List, Profile/Settings, Game Room chrome.
4. Deposit stub: first-position Main Menu block → in-app "Coming soon" route, no external links, no payment SDK.
5. Avatar system: 20 AI-generated anthropomorphic-animal WebP assets, server-side random assign on user create, grid picker in Profile/Avatar tab, `SeatsDisplay` renders each seat's avatar.
6. Compliance/consent: ToS / Privacy / Responsible Gaming static pages + first-launch consent gate (client-side; server-side `joinTable` enforcement is Phase 5) + non-blocking grandfather banner.
7. `PROFILE-01` surface: stats + display name + avatar + daily-bonus eligibility state.

**Out of scope (carried over):**
- Server-side `joinTable` ToS rejection → Phase 5 (COMPLIANCE-04).
- Hand history reads/writes → Phase 3 (a placeholder History tab stub ships now to lock Profile layout).
- Action bubbles, chip checkpointing → Phase 3.
- Reconnect snapshot flow → Phase 4.
- Admin / observability → Phase 5.
- Test suite → Phase 6.

</domain>

<decisions>
## Implementation Decisions

### Branding (BRAND-01, BRAND-02)
- **D-01:** Ship v1.0 as `NightRiver` — no rename in this milestone. BRAND-01 is satisfied by adopting NightRiver as the real name (not a codename) across UI copy, `index.html` title, manifest, and wherever copy currently says "NightRiver" / "tg-poker".
- **D-02:** Logo asset is **AI-generated in this phase**. Produce SVG (primary) + PNG + ICO. Style: Neon Strip — dark background, neon-tinted mark, legible at 32×32 (Telegram Mini App header) and 192×192 (splash). Icon + wordmark composite on Main Menu header; icon-only for favicon/splash.
- **D-03:** Logo generation happens during phase execution (not planning). Planner defines the asset slots and prompt/style brief; executor produces and commits the bytes.

### Shared `ui/` Primitives (UI-05)
- **D-04:** Build all four primitives upfront in a dedicated plan before any page redesign: `client/src/components/ui/{Button,Card,Tab,Badge}.tsx`. Pages consume them from day one.
- **D-05:** Variant API is **action-tier only**, keyed to Neon Strip semantic tokens. No freeform color props. Authoritative variant list:
  - `fold` (red) · `call` (cyan) · `raise` (amber) · `allin` (orange) · `sit` (green) · `active` (cyan, emphasis) · `neutral` (gray)
  - Generic UI buttons (e.g., "Accept", "Cancel", "Back", "Continue", daily-bonus CTA) use `active` / `sit` / `neutral` rather than poker-specific tiers.
- **D-06:** Primitives consume CSS custom properties from `client/src/styles/neon.css` (Phase 1 deliverable). No inline hex literals. `NEON` legacy objects in `GameControls.tsx` / `SeatsDisplay.tsx` were promoted in Phase 1; Phase 2 primitives read the same tokens.
- **D-07:** `GameControls.tsx` buttons migrate to `<Button variant="fold|call|raise|allin" />` as part of the Game Room chrome redesign — eliminating the duplicate NEON map.

### Avatar System (AVATAR-01..04)
- **D-08:** 20 anthropomorphic-animal-playing-poker WebP assets generated in-session during execution. Output path: `client/src/assets/avatars/{id}.webp`, where `{id}` is the species slug (e.g., `fox`, `owl`). Vite hashes them at build.
- **D-09:** **Species list to be proposed by Claude and approved by user before generation**. Target a balanced mix (mammals / birds / reptiles / aquatic / varied moods). Locking the list is a blocking step inside the avatar generation plan — planner must gate asset production on user approval of the species list.
- **D-10:** `User.avatarId` stores the species slug (string), not a numeric index. This keeps asset filenames self-documenting and lets us add/remove/rename without a migration (slug is the contract).
- **D-11:** Client exposes the species list as a single static manifest `client/src/assets/avatars/manifest.ts` (`export const AVATARS = ['fox', 'owl', ...] as const; export type AvatarId = typeof AVATARS[number];`). Used by the picker, the seat avatar resolver, and the server for random selection (shared constant — mirror into `types/avatars.ts` consumed by both server and client).
- **D-12:** **Atomic random-assign happens server-side during `UserRepository.create`**. Inside the same transaction that inserts the User row, pick a random slug from `AVATARS` and write `avatarId` on the INSERT. No post-insert UPDATE WHERE dance required — atomicity comes from the single INSERT statement.
- **D-13:** Re-pick UX is a **4×5 grid on the Profile → Avatar tab**. Tap to select, explicit Confirm button commits (no instant-save — prevents accidental changes). Currently selected avatar has an Neon Strip `active` glow ring.
- **D-14:** `SeatsDisplay` renders each seat's avatar from `avatarId` via the manifest resolver. Initial-letter fallback is kept in code but only triggers if `avatarId` is null/unknown (defensive — shouldn't happen post-migration since new users always get one assigned).
- **D-15:** Custom avatar **replaces the Telegram avatar everywhere** (Main Menu, Profile, SeatsDisplay). The existing `useTelegram` hook's `photo_url` is ignored in rendering — still available for reference but not displayed.

### Page Redesigns

#### Main Menu (UI-01, DEPOSIT-01, DEPOSIT-02)
- **D-16:** Block order (top to bottom): **Deposit → Tables → Daily Bonus → Profile**. Deposit is required first (DEPOSIT-01); Tables second so the primary action stays one tap away; Bonus third; Profile last.
- **D-17:** Deposit block tap opens an in-app `/deposit` route rendering a "Coming soon" page: headline, short copy ("Real-money deposits are not yet available — play with virtual chips and the daily bonus"), back button. No external links, no payment SDK, no email capture.

#### Table List (UI-02)
- **D-18:** **Grouped by stake tier**: section headers (Beginner / Standard / Pro / High Stakes) with dense rows under each. Each row shows table name, blinds, buy-in, live player count (`N/6`). Tier-colored accent on the section header.
- **D-19:** Tier color mapping (consistent across Table List and any future tier indicator): Beginner = green (`--color-action-sit`), Standard = cyan (`--color-action-call`), Pro = amber (`--color-action-raise`), High Stakes = orange/red (`--color-action-allin` or `--color-action-fold` — planner picks the more readable one).

#### Profile / Settings (UI-03, PROFILE-01)
- **D-20:** **Three tabs: Profile / Avatar / History**. History tab exists as a "Coming in the next release" stub so Phase 3 can drop content in without reshaping the page. Locks the layout now.
- **D-21:** Profile tab content: avatar (current), display name (editable inline), stats grid (`balance`, `handsPlayed`, `handsWon`, `totalWinnings`, `biggestPot`), daily-bonus eligibility state (claimable / next-available-at). Uses `Card` primitive for each section.
- **D-22:** Avatar tab content: 4×5 grid picker + Confirm button (D-13).
- **D-23:** History tab content: Neon Strip styled empty state + "Your last 50 hands will appear here after the next release" copy. No socket/data wiring in Phase 2.

#### Game Room Chrome (UI-04, GAME-01)
- **D-24:** **Remove the top-left table/phase label and top-right pot label outright. No replacement.** Pot is visible at table center via `PotDisplay`; betting phase is self-evident from community cards and action context. Maximum real estate for the table.
- **D-25:** Chrome redesign scope in Phase 2: redesign whatever header/footer/overlays exist today in `GameRoom.tsx` using Neon Strip primitives; keep back-to-menu affordance discoverable (small top-left back button is acceptable, but it is chrome — not a data label). Redundant labels are out, not "moved".

### Consent & Compliance (COMPLIANCE-01/02/03/05) — Claude's Discretion
User skipped this gray area. Applying sensible defaults:
- **D-26:** Three static pages at `/legal/tos`, `/legal/privacy`, `/legal/responsible-gaming`. All Neon Strip styled; reachable from Main Menu footer link and Profile settings. Content drafted during execution; user can replace copy before launch.
- **D-27:** First-launch consent is a **single full-page route** (not a modal) shown to any user whose `tosAcceptedAt IS NULL`, with links to view all three documents inline or open full pages. One combined "I agree to the Terms, Privacy Policy, and Responsible Gaming guidelines" checkbox + Accept button. On Accept: write `tosAcceptedAt = now()`, `tosVersion = "1.0"`; then unblock the client-side router.
- **D-28:** Server-side enforcement on `joinTable` is explicitly **deferred to Phase 5 (COMPLIANCE-04)**. Phase 2 gate is client-side only — the client refuses to route past the consent screen. This is the documented trade-off.
- **D-29:** Grandfather flow (COMPLIANCE-03): users created before the ToS gate shipped see a non-blocking dismissible banner at the top of Main Menu prompting acceptance. Dismissible once per session (stored in localStorage). Clicking Accept in the banner goes through the same flow as first-launch.
- **D-30:** RG page copy (COMPLIANCE-05) includes: virtual-chip disclaimer, explicit "not for real money" statement, daily-bonus-only economy description, informational "take a break" guidance (no forced lockouts, no timer, no session-duration tracking).

### Claude's Discretion
- Exact AI prompts and style guide for the 20 avatars and the logo (planner drafts; executor refines).
- Internal file layout inside `client/src/components/ui/` and whether primitives are barreled via `ui/index.ts`.
- Whether the tier color for "High Stakes" is `--color-action-allin` (orange) or `--color-action-fold` (red) — pick on readability with the final palette.
- ToS / Privacy / RG initial copy (English v1.0); user will review.
- Micro-interactions (hover states, press animations) as long as they stay inside the Neon Strip glow/pulse vocabulary from Phase 1.

### Folded Todos
None — no todos in the backlog matched Phase 2.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Milestone
- `.planning/PROJECT.md` — vision, Neon Strip language, current state.
- `.planning/REQUIREMENTS.md` — requirement IDs (BRAND-01/02, UI-01..05, AVATAR-01..04, DEPOSIT-01/02, COMPLIANCE-01/02/03/05, PROFILE-01).
- `.planning/ROADMAP.md` §"Phase 2: Design System Rollout & Avatars" — goal, success criteria, requirement mapping.

### Phase 1 Context (established substrate)
- `.planning/phases/01-foundations-design-system/01-CONTEXT.md` — Neon Strip token naming, token file location, primitives guidance.
- `.planning/phases/01-foundations-design-system/01-05-SUMMARY.md` and sibling SUMMARY files — what Phase 1 delivered.

### Codebase Map
- `.planning/codebase/CONVENTIONS.md`
- `.planning/codebase/STRUCTURE.md`
- `.planning/codebase/STACK.md`
- `.planning/codebase/ARCHITECTURE.md`
- `CLAUDE.md` — Neon Strip UI design notes, commands, env vars.

### Code Touch Points (Phase 2 will create / modify)
- `client/src/components/ui/` (new directory) — Button.tsx, Card.tsx, Tab.tsx, Badge.tsx, index.ts.
- `client/src/pages/MainMenu.tsx` — redesign + Deposit block.
- `client/src/pages/TableList.tsx` — redesign (grouped-by-tier).
- `client/src/pages/ProfileSettings.tsx` — redesign (3 tabs: Profile / Avatar / History).
- `client/src/pages/GameRoom.tsx` — chrome cleanup (remove top labels); consume Button primitive in GameControls.
- `client/src/pages/Deposit.tsx` (new) — "Coming soon" page.
- `client/src/pages/legal/{ToS,Privacy,ResponsibleGaming}.tsx` (new) — static content pages.
- `client/src/pages/Consent.tsx` (new) — first-launch consent route.
- `client/src/components/ConsentBanner.tsx` (new) — grandfather banner.
- `client/src/components/SeatsDisplay.tsx` — render avatar from `avatarId`.
- `client/src/components/GameControls.tsx` — migrate buttons to `ui/Button`.
- `client/src/assets/avatars/` (new) — 20 WebP assets + `manifest.ts`.
- `client/src/assets/logo.svg` / `logo-192.png` / `favicon.ico` (new) — brand assets.
- `client/src/App.tsx` — route additions (`/deposit`, `/legal/*`, `/consent`), consent-gate routing logic.
- `client/index.html` — logo/title/manifest references.
- `server/db/UserRepository.ts` — random avatar assign on create (`AVATARS` import, atomic INSERT).
- `server/index.ts` — socket handler to update `avatarId`, `displayName`, and `tosAcceptedAt`/`tosVersion`.
- `types/index.ts` — extend events for avatar update + ToS accept; import `AvatarId`.
- `types/avatars.ts` (new) — shared `AVATARS` constant and `AvatarId` type.
- `client/src/styles/neon.css` — may add additional semantic tokens if redesign needs them (kept minimal).

### Tooling
- `frontend-design` skill — **mandated** for page redesigns (UI-05; confirmed by PROJECT.md / STATE.md).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `client/src/styles/neon.css` (Phase 1) — CSS custom properties (`--color-action-*`, `--color-active`, etc.) are the single source of truth the `ui/` primitives consume.
- `client/src/components/SeatsDisplay.tsx` — already has avatar slot + initial-letter fallback; plumbing avatar image into it is additive.
- `client/src/components/GameControls.tsx` — reference implementation of action-tier button visuals; informs `Button` variant design, then migrates to consume it.
- `useTelegram` hook (`client/src/hooks/useTelegram.ts`) — provides Telegram user photo; this phase stops rendering it.
- `UserRepository` (`server/db/UserRepository.ts`) — already has a `create`/`findOrCreate` path; avatar assign hooks in naturally.

### Established Patterns
- Tailwind v4 + `@theme` from CSS custom properties.
- Socket.io-only transport (no REST); avatar update / ToS accept events follow the existing request/ack pattern.
- Prisma single-`User` model; `avatarId` / `tosAcceptedAt` / `tosVersion` columns already shipped in Phase 1 migration.
- Pages are thin route components calling hooks; no state-management library — lean on React state + socket events.

### Integration Points
- `App.tsx` is the only router — consent gate, legal routes, deposit stub all register here.
- `TableManager` / `Game.ts` / socket handlers in `server/index.ts` are untouched by Phase 2 (pure UI + one additive server handler for `updateAvatar` + one for `acceptTos`).
- `prisma/schema.prisma` untouched in Phase 2 — all required columns landed in v1_mvp_launch.

</code_context>

<specifics>
## Specific Ideas

- Brand name stays `NightRiver` — don't waste cycles renaming; BRAND-01 is considered satisfied by adopting the codename as the real name.
- Logo is AI-generated to completion this phase; no "supply later" contract.
- Avatar slug strategy (D-10) is deliberate: self-documenting filenames, zero-migration add/remove.
- Action-tier-only Button API (D-05) is an explicit opinionated constraint — generic buttons use `active` / `sit` / `neutral`, not new variants.
- 3-tab Profile with a History stub (D-20) locks layout for Phase 3 so nothing reshapes later.
- Game Room chrome labels are **removed, not moved** (D-24). This is a specific user preference from discussion.
- Picker is explicit-confirm, not instant-save (D-13) — prevents fat-finger avatar changes.

</specifics>

<deferred>
## Deferred Ideas

- **BRAND-01 rename to a non-codename brand** → future milestone (v1.1+) if marketing demands it. v1.0 ships as NightRiver.
- **Server-side `joinTable` ToS enforcement** → Phase 5 (COMPLIANCE-04). Phase 2 gate is client-side only.
- **Hand history content on Profile → History tab** → Phase 3 (PROFILE-02/03). Phase 2 ships the stub tab only.
- **`prefers-reduced-motion` handling in Neon Strip animations** — if any new pulse/glow animation is introduced in Phase 2, honor it; full audit happens alongside action bubbles in Phase 3.
- **Avatar unlock / streak rewards** — v1.1+ (noted in REQUIREMENTS.md future section).
- **Free-form avatar upload** — explicitly out of scope (REQUIREMENTS.md).
- **Session-duration reminder toast** — v1.1+.

</deferred>

---

*Phase: 02-design-system-rollout-avatars*
*Context gathered: 2026-04-15*
