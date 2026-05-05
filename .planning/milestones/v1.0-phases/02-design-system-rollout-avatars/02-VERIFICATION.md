---
phase: 02-design-system-rollout-avatars
verified: 2026-04-16T19:32:02Z
status: gaps_found
score: 3/5 success criteria verified
overrides_applied: 0
gaps:
  - truth: "A first-time user cannot joinTable until they tap Accept on the consent screen; ToS/Privacy/Responsible Gaming pages are reachable from menu and settings; existing users see a non-blocking reminder banner (SC-4, COMPLIANCE-01/02/03)"
    status: failed
    reason: "App.tsx imports Consent, ToS, Privacy, ResponsibleGaming modules and declares the AppView union with 'consent' | 'legal-tos' | 'legal-privacy' | 'legal-rg', but NO render branches exist for any of those views; the MainMenu onNavigate handler explicitly filters and drops 'legal-*' / 'consent' targets as a no-op; the defense-in-depth consent gate that 02-08-SUMMARY.md claims ('if currentUser && !currentUser.tosAcceptedAt && view !== consent && !view.startsWith(legal-), force-render <Consent />') is absent; App.tsx does not pass the now-required socket / showGrandfatherBanner / onTosAccepted props to MainMenu so the component call is TypeScript-broken (tsc --noEmit fails with TS2739); App.tsx has no listener for the 'tosAccepted' server event to mirror tosAcceptedAt onto currentUser."
    artifacts:
      - path: "client/src/App.tsx"
        issue: "AppView union declares 'consent' | 'legal-*' variants and imports all four page components, but no if (view === 'consent') / 'legal-tos' / 'legal-privacy' / 'legal-rg' render branches exist (file ends at line 471 with only menu/tables/profile/deposit/game branches). onNavigate callback for MainMenu (lines 388-406) explicitly excludes 'legal-*' and 'consent' ('unrecognized values are intentionally dropped (no-op click)'). MainMenu call site (lines 386-408) passes only {user, onNavigate, onClaimBonus} — omits the now-required {socket, showGrandfatherBanner, onTosAccepted} props."
      - path: "client/src/App.tsx"
        issue: "No socket.on('tosAccepted', …) listener to update currentUser.tosAcceptedAt after acceptance; no computed showGrandfatherBanner flag; no setView('consent') / force-render guard for users where currentUser.tosAcceptedAt is null."
    missing:
      - "Render branch in App.tsx for view === 'consent' that mounts <Consent socket={socket} onAccept={…} onViewLegal={…} />"
      - "Render branches in App.tsx for view === 'legal-tos' / 'legal-privacy' / 'legal-rg' that mount <ToS/Privacy/ResponsibleGaming onBack={…} />"
      - "Pass socket, showGrandfatherBanner (= !currentUser?.tosAcceptedAt && !dismissed), and onTosAccepted to <MainMenu />"
      - "Expand the MainMenu onNavigate predicate to also setView('consent') / setView('legal-tos') / setView('legal-privacy') / setView('legal-rg')"
      - "Defense-in-depth render guard at top of render: if (currentUser && !currentUser.tosAcceptedAt && view !== 'consent' && !view.startsWith('legal-')) return <Consent … />"
      - "socket.on('tosAccepted', payload => setCurrentUser(prev => prev ? { ...prev, tosAcceptedAt: payload.tosAcceptedAt } : prev))"
  - truth: "A brand-new user completes first-launch auth and is atomically assigned one of 20 curated animal avatars (no client race); the avatar appears on Main Menu, Profile, and SeatsDisplay (SC-2). BRAND-02 also requires a logo asset produced and rendered on main menu / launch splash in both SVG AND PNG/ICO."
    status: partial
    reason: "Slug-layer and code-layer contract for 20 avatars is complete — types/avatars.ts has the AVATARS const with 20 locked slugs, randomAvatarId() wired into UserRepository.findOrCreate, updateAvatar socket handler with isValidAvatarId allowlist, manifest with 20 literal new URL entries, SeatsDisplay / MainMenu / ProfileSettings all resolve via avatarUrl(id). BUT none of the 20 .webp binary files exist in client/src/assets/avatars/ (directory contains only README.md + manifest.ts). Vite emits 20 'doesn't exist at build time' warnings; at runtime every <img src> will 404 and fall through to the initial-letter fallback, meaning the product surface SC-2 ('avatar appears on Main Menu, Profile, and SeatsDisplay') never shows an actual animal avatar. Same situation for BRAND-02 raster assets: favicon.ico and logo-192.png are declared in index.html and manifest.webmanifest but the files don't exist in client/public/; legacy browsers and apple-touch-icon slot will 404."
    artifacts:
      - path: "client/src/assets/avatars/"
        issue: "Expected 20 .webp files (fox, wolf, bear, tiger, panda, raccoon, lion, rabbit, owl, eagle, flamingo, penguin, crocodile, chameleon, cobra, shark, octopus, dolphin, frog, bat). Found 0 .webp files. ls returns only README.md + manifest.ts."
      - path: "client/public/favicon.ico"
        issue: "Referenced from index.html line 10 as <link rel='icon' type='image/x-icon'>; file does not exist. favicon.svg (shipped) covers modern browsers but BRAND-02 explicitly requires the ICO raster slot."
      - path: "client/public/logo-192.png"
        issue: "Referenced from index.html line 11 as apple-touch-icon and from manifest.webmanifest as the 192 icon entry; file does not exist. Apple home-screen save and PWA splash will fall back to auto-generated low-quality icons."
    missing:
      - "20 WebP binary files at client/src/assets/avatars/{slug}.webp matching the locked species list (fox..bat) and the prompt brief in README.md / 02-02-SUMMARY.md"
      - "client/public/favicon.ico (32x32 raster rasterized from favicon.svg)"
      - "client/public/logo-192.png (192x192 PNG rasterized from logo.svg icon portion on dark #0a0a0e background)"

deferred: []

human_verification:
  - test: "Launch the Mini App as a fresh Telegram user (no prior tosAcceptedAt on the User row, no localStorage flag)."
    expected: "After auth success the client routes to the Consent page, not MainMenu. Tapping Accept flips `tosAcceptedAt`, the server emits `tosAccepted`, and the client transitions to MainMenu. Before this is wired (see gap #1) the user will be routed to MainMenu and the app will crash at runtime because MainMenu requires socket/showGrandfatherBanner/onTosAccepted props."
    why_human: "Cannot verify without running the full client stack inside Telegram / Vite dev with a real Socket.io connection and a freshly-seeded DB row; requires observing the client-side router transition."
  - test: "As a grandfathered user (row has tosAcceptedAt IS NULL but was seen before the gate shipped), launch the Mini App."
    expected: "MainMenu renders with the ConsentBanner (amber/raise variant) at the top of the page, above the Deposit block. Tapping Dismiss hides the banner for the session (localStorage key 'consent_banner_dismissed_v1' = '1'). Tapping Accept goes through the acceptTos flow."
    why_human: "Requires localStorage state manipulation + live MainMenu render; cannot be verified statically because App.tsx does not pass `showGrandfatherBanner` today (gap #1)."
  - test: "Visual verification that the four redesigned pages (MainMenu, TableList, ProfileSettings, GameRoom chrome) cohere under the Neon Strip design language end-to-end."
    expected: "All four pages use shared ui/ primitives, dark translucent surface, glow vocabulary matches; no legacy tg-card / tg-btn styles leak through."
    why_human: "SC-1 is a visual/coherence claim. Static greps confirm primitive consumption and CSS-var routing, but page-level coherence (spacing, rhythm, glow intensity, mobile touch feel) needs eyes."
  - test: "Verify that the deposit 'Coming soon' page has no external links, no payment SDK references, no email capture form, and the Back button returns to MainMenu."
    expected: "Deposit page renders, the Back button returns to menu, no <a href> to an external origin, no 'notify me' form, no window.open / shareURL calls."
    why_human: "Static read of Deposit.tsx looks clean, but plays to 'no external links' and 'no email capture' are easier to spot-check by tapping through."
  - test: "Swap the Telegram initData photo_url in dev mode and confirm MainMenu / Profile / SeatsDisplay all render the manifest-resolved custom avatar (or initial-letter fallback if no .webp files ship), never the Telegram photo_url."
    expected: "Telegram photo_url is fetched by useTelegram but never rendered. Product shows only animal avatars (or initials) per D-15."
    why_human: "Confirmed by grep (zero occurrences of user.photoUrl / user.photo_url as an <img src> binding) but the runtime assertion across three surfaces is easier to confirm visually."
  - test: "Verify the seat→player avatar propagation: user taps Avatar → Confirm in ProfileSettings, returns to a table they are seated at, and other clients at the same table see the avatar change in SeatsDisplay without waiting for a new hand."
    expected: "server/index.ts updateAvatar handler calls updateTableState(seatedTable.id) after mutating player.avatarId, so all seated clients receive a fresh state broadcast. Client avatarUpdated listener updates currentUser.avatarId in App.tsx."
    why_human: "End-to-end real-time broadcast verification needs a multi-client Telegram/dev-mode session — static grep shows the code paths are wired."
---

# Phase 2: Design System Rollout & Avatars — Verification Report

**Phase Goal:** Every player-facing page is redesigned in Neon Strip, new users receive an animal avatar atomically on signup and can re-pick it, and first-launch ToS/Privacy/RG consent is shipped.
**Verified:** 2026-04-16T19:32:02Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Success Criteria (ROADMAP contract)

| # | Success Criterion | Status | Evidence |
|---|-------------------|--------|----------|
| SC-1 | Cohesively redesigned Main Menu, Table List, Profile/Settings, Game Room chrome in Neon Strip using shared `ui/` primitives, redundant table/phase/pot labels removed | VERIFIED (with human visual check queued) | MainMenu.tsx, TableList.tsx, ProfileSettings.tsx, GameRoom.tsx all import from `components/ui` (Button / Card / Tab / TabBar / Badge); GameControls.tsx migrated to `<Button variant=>` (no `const NEON =` / `neonBtn` left in the file); GameRoom.tsx has no `Table #`, `Pot:`, `totalPot.toLocaleString`, or `getStageText` occurrences; TableList groups by Beginner / Standard / Pro / High Stakes with tier-colored Badge headers. |
| SC-2 | Brand-new user is atomically assigned one of 20 curated animal avatars on first auth; avatar appears on Main Menu, Profile, and SeatsDisplay | PARTIAL (see gap #2) | Code-layer complete: `types/avatars.ts` locks 20 slugs; `UserRepository.findOrCreate` create branch writes `avatarId: randomAvatarId()` in the same INSERT; `manifest.ts` declares 20 literal `new URL` entries; MainMenu / ProfileSettings / SeatsDisplay all consume `avatarUrl(id)`; Telegram `photo_url` is not rendered anywhere (D-15). **But 0 of the 20 .webp binaries exist**, so the runtime product always falls through to the initial-letter fallback. |
| SC-3 | User can open Profile → Avatar tab, pick a different animal, Confirm; choice replaces Telegram avatar everywhere | VERIFIED (with human end-to-end check queued) | ProfileSettings.tsx renders the 4×5 AVATARS grid; `pendingAvatar` local state, `dirty` flag, disabled Confirm button (D-13 explicit-confirm); `socket.emit('updateAvatar', { avatarId })` on Confirm; server handler allowlist-validates against `isValidAvatarId` then persists via `UserRepository.updateAvatarId`; emits `avatarUpdated` ack and also rebroadcasts the table state if the user is seated; App.tsx has `socket.on('avatarUpdated', …)` listener that updates `currentUser.avatarId`. |
| SC-4 | First-time user cannot joinTable until they tap Accept on the consent screen; ToS/Privacy/RG pages reachable from menu and settings; existing users see a non-blocking reminder banner | FAILED (see gap #1) | **Note on scope:** per D-28, the phase accepts that the *server-side joinTable enforcement* is deferred to Phase 5 / COMPLIANCE-04. The client-side consent gate is the Phase 2 contract. That contract is NOT delivered: App.tsx imports Consent/ToS/Privacy/ResponsibleGaming but never renders them; MainMenu requires props that App.tsx does not pass; onNavigate filter drops `legal-*` / `consent` dispatches as no-ops; there is no consent render guard and no `tosAccepted` listener on the client. The substrate (Consent.tsx, ConsentBanner.tsx, all three legal pages, server acceptTos handler, UserRepository.acceptTos, socket events on types) is all present — only the App.tsx wiring is missing. |
| SC-5 | Main Menu shows a first-position Deposit block that opens an in-app "Coming soon" page with no external links or payment SDK | VERIFIED | MainMenu block order is Deposit → Tables → Daily Bonus → Profile (D-16 satisfied). Deposit block dispatches `onNavigate('deposit')`; App.tsx has a `view === 'deposit'` branch that mounts `<Deposit onBack={…} />`. Deposit.tsx has no external <a href>, no payment SDK imports, no email capture form, no shareURL / openLink calls — pure informational stub with a Back button. |

**Score:** 3/5 criteria verified (SC-1, SC-3, SC-5 pass; SC-2 partial; SC-4 failed)

### Implementation Decisions (D-01..D-30)

| Decision | Status | Evidence |
|----------|--------|----------|
| D-01 Brand name stays "NightRiver" | VERIFIED | `index.html` title `NightRiver — Poker`; `manifest.webmanifest` name: NightRiver; logo wordmark renders "NightRiver"; Consent / Deposit / MainMenu copy uses "NightRiver"; grep finds zero occurrences of "tg-poker" in user-visible client copy. |
| D-02 Logo SVG + PNG + ICO produced in-phase | PARTIAL | `client/src/assets/logo.svg` ✓ (4050 B, composite icon + wordmark). `client/public/favicon.svg` ✓ (1153 B). `client/public/favicon.ico` MISSING. `client/public/logo-192.png` MISSING. Deferred gaps carried over from 02-03-SUMMARY. |
| D-03 Logo generation happens during phase execution | VERIFIED | Hand-authored SVG committed in `945f479`; Plan 02-03 was the execution step. |
| D-04 All four primitives shipped upfront in a dedicated plan | VERIFIED | `client/src/components/ui/{Button,Card,Tab,Badge}.tsx` + `tokens.ts` + `index.ts` all created in Plan 02-01 (commits `4e66c71`, `e1042dd`, `87156b8`). |
| D-05 Variant API is action-tier only (`ActionTier`) | VERIFIED | `tokens.ts` exports the closed `ActionTier` union; Button / Card / Badge primitives take only `variant: ActionTier`; no freeform color / colorClass / style-color escape hatches. Tab has fixed semantic active/neutral (no variant). |
| D-06 Primitives consume CSS custom properties from neon.css, no inline hex literals | VERIFIED | `grep '#[0-9a-fA-F]{3,6}' client/src/components/ui/` returns no matches; all variant recipes route through `var(--color-*)` / `var(--glow-*)` / `color-mix(…)`. Only non-token literal in the directory is the `rgba(10,10,14,0.88)` surface in Card.tsx (explicitly allowed by plan precedent). |
| D-07 GameControls migrated to `<Button variant=>`, NEON map / neonBtn deleted | VERIFIED | `grep -cE '(neonBtn\|const NEON =)' client/src/components/GameControls.tsx` → 0. `GameControls` imports Button from `./ui` and uses `<Button variant={tier} emphasis={active}>` across all five button clusters. |
| D-08 20 WebP assets at client/src/assets/avatars/{slug}.webp | FAILED | 0 .webp files present; documented gap. |
| D-09 Species list approved before generation | VERIFIED | Locked list in `types/avatars.ts` matches the README.md species order: fox, wolf, bear, tiger, panda, raccoon, lion, rabbit, owl, eagle, flamingo, penguin, crocodile, chameleon, cobra, shark, octopus, dolphin, frog, bat. |
| D-10 avatarId is the species slug (string) | VERIFIED | Prisma schema User.avatarId is a String; `AVATARS` is a tuple of slug strings, not numeric indices. |
| D-11 Single manifest as shared constant — mirror in `types/avatars.ts` | VERIFIED | `types/avatars.ts` is the single-source `AVATARS` const; server imports via `../../types/avatars.js`, client manifest re-exports `AVATARS` from `../../../../types/avatars` and consumers import from the manifest. |
| D-12 Atomic random-assign in UserRepository.create (single INSERT) | VERIFIED | `UserRepository.findOrCreate` create branch passes `avatarId: randomAvatarId()` inside the `prisma.user.create({ data: … })` object — one INSERT, no post-insert UPDATE race. Also has idempotent backfill in the else branch for grandfathered rows. |
| D-13 4×5 grid picker + explicit Confirm (no instant-save) | VERIFIED | ProfileSettings Avatar tab renders `AVATARS.map` in a 4-column grid of 20 radio-role buttons; `pendingAvatar` state diverges from `currentUser.avatarId`; Confirm button is disabled unless `dirty` is true; only Confirm emits `updateAvatar`. |
| D-14 SeatsDisplay renders avatar from avatarId; initial-letter fallback | VERIFIED | `SeatsDisplay.tsx` imports `avatarUrl as resolveAvatar` from the manifest; call sites pass `resolveAvatar(player.avatarId as AvatarId \| undefined)` to the `Avatar` sub-component, which falls back to the initial letter when avatarUrl is missing. |
| D-15 Custom avatar replaces Telegram avatar everywhere; photo_url ignored | VERIFIED | `grep 'photoUrl\|photo_url'` in `client/src` matches only the useTelegram hook's initialization (line 138) — never used as an `<img src>`. MainMenu / ProfileSettings / SeatsDisplay all read `currentUser.avatarId` / `player.avatarId` and resolve via the manifest. |
| D-16 Block order: Deposit → Tables → Daily Bonus → Profile | VERIFIED | MainMenu.tsx renders the four BlockCards in that exact order (Deposit=raise, Tables=call, Daily Bonus=sit, Profile=active). |
| D-17 Deposit tap opens in-app /deposit "Coming soon" with no external links, no payment SDK | VERIFIED | Deposit.tsx has no external `<a href>`, no payment-SDK imports, no email capture. Just headline, short copy ("Real-money deposits are not yet available…"), Back button. |
| D-18 Table List grouped by tier with section headers | VERIFIED | TableList.tsx has `TIER_ORDER = ['Beginner','Standard','Pro','High Stakes']`, `groupByTier`, per-tier `TierSection` component with Badge header and TableRow children. |
| D-19 Tier color mapping (Beginner=sit, Standard=call, Pro=raise, High Stakes=fold or allin) | VERIFIED | `TIER_VARIANT: Record<Tier, ActionTier> = { Beginner: 'sit', Standard: 'call', Pro: 'raise', 'High Stakes': 'fold' }`. High Stakes locked to red (`fold`) per RESEARCH Q9. |
| D-20 Three tabs: Profile / Avatar / History | VERIFIED | ProfileSettings TABS const `[{id:'profile'}, {id:'avatar'}, {id:'history'}]` rendered via `<TabBar>`; History tab is a stub. |
| D-21 Profile tab: avatar, editable display name, stats grid, daily-bonus eligibility | VERIFIED | ProfileSettings renderProfileTab renders avatar Card (96×96), inline-editable `displayName`, Stats Card with `balance / handsPlayed / handsWon / totalWinnings / biggestPot`, Daily Bonus Card driven by `currentUser.canClaimDaily` / `lastDailyRefill`. |
| D-22 Avatar tab: 4×5 grid picker + Confirm | VERIFIED | See D-13. |
| D-23 History tab: empty-state stub (no Phase 2 wiring) | VERIFIED | renderHistoryTab renders a Card with "Your last 50 hands will appear here after the next release." — no socket.emit, no data fetch. |
| D-24 Remove top-left table/phase label and top-right pot label outright | VERIFIED | `grep -nE '(Table #\|totalPot\.toLocaleString\|getStageText\|Pot:)' client/src/pages/GameRoom.tsx` returns no matches; header chip bg `bg-black/30` also removed. |
| D-25 GameRoom chrome redesigned with Neon Strip primitives; back button retained | VERIFIED | GameRoom.tsx imports `Button` from `../components/ui` and renders the back-to-menu + chat-opener buttons as `<Button variant='neutral'>` with 44px tap targets and safe-area paddingTop. |
| D-26 Three static pages at /legal/{tos,privacy,responsible-gaming} reachable from menu and settings | PARTIAL | The three page components exist (`client/src/pages/legal/{ToS,Privacy,ResponsibleGaming}.tsx`) and MainMenu footer dispatches `onNavigate('legal-tos'\|'legal-privacy'\|'legal-rg')`, **but App.tsx has no render branches for those views** (see gap #1). So the pages are not actually reachable at runtime. |
| D-27 First-launch consent is a single full-page route, combined checkbox, Accept writes tosAcceptedAt/tosVersion | PARTIAL | `Consent.tsx` implements the full-page layout correctly (single combined checkbox, inline legal links, Accept button emits `acceptTos { version: '1.0' }`). Server handler in `server/index.ts` writes `tosAcceptedAt` + `tosVersion` via `UserRepository.acceptTos`. **But App.tsx does not route to Consent for users with tosAcceptedAt = null** (see gap #1). |
| D-28 Server-side joinTable enforcement deferred to Phase 5 | VERIFIED (scope boundary acknowledged) | Plan 02-08 explicitly does not touch `joinTable`. Not a failure — per-note in task instructions. |
| D-29 Grandfather banner — non-blocking, dismissible once per session via localStorage | PARTIAL | `ConsentBanner.tsx` implements the dismissible banner correctly (localStorage key `consent_banner_dismissed_v1`, Accept + Dismiss actions). `MainMenu.tsx` conditionally renders `<ConsentBanner>` when its `showGrandfatherBanner` prop is true. **But App.tsx never computes / passes the `showGrandfatherBanner` prop** (see gap #1), so the banner never mounts in practice. |
| D-30 RG page content includes virtual-chip disclaimer, "not for real money", daily-bonus-only economy, informational "take a break" | VERIFIED | `ResponsibleGaming.tsx` Sections: "Virtual Chips Only", "Not for Real Money", "Daily Bonus Economy" (implied from context — plan mentions content #3), "Take a Break". No timer, no lockout, no session tracking. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| BRAND-01 | 02-03 | NightRiver name adopted across UI copy, manifest, bot handle refs | VERIFIED | index.html title = "NightRiver — Poker"; manifest.webmanifest name=NightRiver; grep for "tg-poker" in client user-visible copy returns 0 matches |
| BRAND-02 | 02-03 | Logo asset (SVG + PNG/ICO) produced and rendered on main menu and Telegram Mini App launch splash | PARTIAL | logo.svg ✓; favicon.svg ✓; logo rendered on MainMenu header; but favicon.ico and logo-192.png raster assets are MISSING (see gap #2) |
| BRAND-03 | 01 | Neon Strip palette extracted into neon.css + Tailwind theme | VERIFIED | Phase 1 complete; `neon.css` @theme block defines `--color-action-{fold,call,raise,allin,sit}`, `--color-active`, `--color-chip`, `--color-neutral`, `--glow-*`, `--color-surface-base`. All Phase 2 primitives consume these. |
| UI-01 | 02-04 | Main menu redesigned in Neon Strip (Deposit first, daily bonus, table list, profile) | VERIFIED | See D-16/D-17/SC-5 evidence. |
| UI-02 | 02-05 | Table list redesigned in Neon Strip with stake tier, player count, buy-in | VERIFIED | TableList.tsx renders per-tier sections with name, sb/bb, buy-in, playerCount/maxPlayers. |
| UI-03 | 02-06 | Profile/Settings page redesigned with tabs for profile / avatar / history | VERIFIED | See D-20..D-23. |
| UI-04 | 02-07 | Game room non-table chrome redesigned; redundant labels removed | VERIFIED | See D-24/D-25. |
| UI-05 | 02-01 | Redesign uses frontend-design skill and shared ui/ primitives (Button, Card, Tab, Badge) | VERIFIED | All four primitives exist in `components/ui/`; all four redesigned pages import from there. |
| AVATAR-01 | 02-02 | 20 curated avatar assets ship as hashed Vite bundle assets (WebP) | FAILED | Slug contract + manifest + import paths exist, but 0 of the 20 .webp binaries are present. Deferred gap; prevents the runtime product from ever showing an animal avatar. |
| AVATAR-02 | 02-02 | New users assigned random avatar on first auth, atomically (single INSERT) | VERIFIED | UserRepository.findOrCreate create branch writes `avatarId: randomAvatarId()` in the same INSERT object. |
| AVATAR-03 | 02-06 | User can re-pick avatar from Profile/Avatar tab; choice replaces Telegram avatar everywhere | VERIFIED (code-wise; runtime masked by AVATAR-01 asset gap) | 4×5 grid + Confirm + socket event + allowlist validate + seat rebroadcast all wired. Once .webp files ship, the end-to-end flow is live. |
| AVATAR-04 | 02-02 | SeatsDisplay renders each seat's avatar (initial-letter fallback) | VERIFIED (code-wise) | SeatsDisplay resolves via `resolveAvatar(player.avatarId)`; fallback kicks in when avatarId is null/unknown. |
| PROFILE-01 | 02-06 | Profile page shows stats + display name + avatar + daily-bonus eligibility | VERIFIED | See D-21. |
| DEPOSIT-01 | 02-04 | Main menu first-position Deposit block styled in Neon Strip | VERIFIED | See D-16. |
| DEPOSIT-02 | 02-04 | Deposit tap opens in-app "Coming soon"; no external links, no payment SDK | VERIFIED | See D-17. |
| COMPLIANCE-01 | 02-08 | ToS, Privacy, RG pages static, reachable from main menu and settings, styled in Neon Strip | FAILED (partially — pages exist but NOT reachable at runtime) | Pages exist; MainMenu footer attempts to dispatch; App.tsx swallows the dispatch. See gap #1. |
| COMPLIANCE-02 | 02-08 | New users must tap Accept on first-launch consent before joinTable; acceptance sets tosAcceptedAt + tosVersion | FAILED (partially — server handler and Consent page exist but App.tsx routing gate missing) | Consent.tsx / acceptTos handler / UserRepository.acceptTos / TelegramUser.tosAcceptedAt field all exist; but App.tsx never routes to Consent for users where tosAcceptedAt is null. See gap #1. |
| COMPLIANCE-03 | 02-08 | Existing users are grandfathered: non-blocking banner, not prevented from playing | FAILED (partially — ConsentBanner component exists but App.tsx does not mount it through MainMenu) | ConsentBanner.tsx fully implements the dismissible banner; MainMenu expects `showGrandfatherBanner` prop; App.tsx never computes or passes it. See gap #1. |
| COMPLIANCE-05 | 02-08 | RG page displays virtual-chip disclaimer, "not for real money", daily-bonus-only economy, take a break | VERIFIED | See D-30. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| client/src/App.tsx | 388-406 | onNavigate handler silently drops 'legal-*' / 'consent' targets with a comment calling it intentional — while the AppView union and imports declare those views as supported | Blocker | Users cannot reach ToS / Privacy / RG / Consent pages at all. The phase's consent-gate contract is broken end-to-end. |
| client/src/App.tsx | 386 (<MainMenu> call site) | MainMenu requires props {socket, showGrandfatherBanner, onTosAccepted} per its MainMenuProps interface; App.tsx passes only {user, onNavigate, onClaimBonus} | Blocker | TypeScript type-check fails (TS2739 on tsc --noEmit). At runtime the component will still render but the grandfather banner never mounts and Consent cannot be triggered. |
| client/src/hooks/useTelegram.ts | 132 | setUser({...}) call omits the required `displayName` field from TelegramUser | Warning | TS2345; pre-existing issue not introduced by Phase 2 but carries through into Phase 2 artifacts that depend on the type. |
| client/src/assets/avatars/ | — | 20 .webp asset slots declared in manifest.ts but 0 of 20 files present | Blocker (for SC-2 runtime) | Every rendered avatar <img> will 404 and fall through to the initial-letter fallback; the product goal "avatar appears on Main Menu, Profile, and SeatsDisplay" is code-complete but visually unachieved. |
| client/public/ | — | favicon.ico and logo-192.png referenced from index.html / manifest.webmanifest but missing | Warning | Legacy browsers will 404 on favicon.ico; apple-touch-icon will 404; modern browsers and Telegram WebApp chrome are unaffected because favicon.svg ships and Telegram uses the BotFather bot avatar. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Client build compiles (vite build) | `cd client && npm run build` | Exit 0; 20 expected WebP warnings; outputs dist/ | PASS |
| Client TypeScript type-check | `cd client && npx tsc --noEmit` | TS2739 on App.tsx MainMenu call site (missing socket/showGrandfatherBanner/onTosAccepted), TS2345 on useTelegram.ts setUser (missing displayName) | FAIL |
| Server build compiles | `tsc --noEmit` (root) | Exit 0; no errors | PASS |
| ui/ primitives contain zero hex literals | `grep '#[0-9a-fA-F]{3,6}' client/src/components/ui/` | 0 matches | PASS |
| GameControls free of NEON/neonBtn | `grep -cE '(const NEON =\|neonBtn)' client/src/components/GameControls.tsx` | 0 | PASS |
| GameRoom free of redundant labels | `grep -nE '(Table #\|totalPot\.toLocaleString\|getStageText)' client/src/pages/GameRoom.tsx` | No matches | PASS |
| Telegram photo_url not rendered anywhere in client/src | `grep 'user\.photoUrl\|\.photo_url\|photoUrl' client/src` (excluding hook init) | Only useTelegram.ts line 138 (assignment, not render) | PASS |
| 20 avatar WebP files present | `ls client/src/assets/avatars/*.webp \| wc -l` | 0 | FAIL |
| favicon.ico + logo-192.png present | `ls client/public/favicon.ico client/public/logo-192.png` | Neither file exists | FAIL |
| Server acceptTos handler exists and compiled | `grep 'acceptTos' dist/server/index.js` | 2 matches (handler + UserRepository call) | PASS |
| Server updateAvatar handler exists with allowlist | `grep 'isValidAvatarId' server/index.ts && server/db/UserRepository.ts updateAvatarId` | Present; validation before DB write | PASS |
| UserRepository.findOrCreate assigns avatarId atomically | Read `server/db/UserRepository.ts` create branch | `avatarId: randomAvatarId()` inside single `prisma.user.create.data` | PASS |
| App.tsx has render branches for consent + legal-* | Read `client/src/App.tsx` body | No branch for 'consent' / 'legal-tos' / 'legal-privacy' / 'legal-rg' | FAIL |
| App.tsx has 'tosAccepted' socket listener | `grep 'tosAccepted' client/src/App.tsx` | 0 matches | FAIL |

### Human Verification Required

See frontmatter `human_verification:` block. Six items cover: first-launch consent routing, grandfather banner behavior, end-to-end Neon Strip visual coherence, Deposit stub hygiene, custom-avatar replacement of Telegram photo, and real-time avatar broadcast propagation.

### Gaps Summary

Two concrete gaps block Phase 2 goal achievement:

**Gap #1 — Consent & Legal routing is unwired in App.tsx (blocks SC-4, COMPLIANCE-01/02/03).** All building blocks exist: Consent.tsx, ConsentBanner.tsx, ToS/Privacy/ResponsibleGaming pages, server `acceptTos` handler, `UserRepository.acceptTos`, socket event types, TelegramUser.tosAcceptedAt field. The gap is in App.tsx integration — four render branches, one computed prop flag, one onNavigate extension, one server-event listener, and one defense-in-depth render guard. **This is the single most important gap because it invalidates the phase's compliance promise end-to-end, even though every underlying component is already built.** The 02-08-SUMMARY.md claims this wiring was done; the codebase shows it was not.

**Gap #2 — 20 avatar WebP binaries + 2 brand raster assets are missing (blocks SC-2 at runtime, BRAND-02 rasters, AVATAR-01).** The code contract around the 20 animal avatars is complete; the binaries are the gap. Documented in 02-02-SUMMARY and 02-03-SUMMARY as deferred due to no image-generation MCP tool being available. To close the gap: generate 20 WebP files matching the locked prompt brief (README.md / 02-02-SUMMARY.md) and drop them as `client/src/assets/avatars/{slug}.webp`; rasterize the existing `favicon.svg` / `logo.svg` to `favicon.ico` and `logo-192.png` into `client/public/`.

**Also flagged but non-blocking:**
- `useTelegram.ts` setUser call is missing a required `displayName` field — pre-existing but surfaced by the strict `tsc --noEmit` run during verification. Fix is a one-line addition in the hook.
- TypeScript is not part of the client build script (`vite build` skips tsc). Consider adding `tsc --noEmit` to the build pipeline so integration gaps like Gap #1 surface at build time, not runtime.

Gap #1 is intentional-deviation unlikely (02-08-SUMMARY explicitly claims this was done). Gap #2 is explicitly accepted as a documented deferred asset gap (both SUMMARYs flag it with clear unblocker commands); no override is suggested because BRAND-02 and AVATAR-01 are phase-scope requirements and the phase goal relies on their visible product surface. Both gaps should be closed via `/gsd-plan-phase --gaps`.

---

*Verified: 2026-04-16T19:32:02Z*
*Verifier: Claude (gsd-verifier)*
