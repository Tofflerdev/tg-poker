# Feature Research

**Domain:** Telegram Mini App — 6-max Texas Hold'em cash-game poker (brownfield, v1.0 MVP)
**Researched:** 2026-04-14
**Confidence:** MEDIUM-HIGH (domain conventions are well-established in online poker; Telegram Mini App specifics MEDIUM; social-casino responsible-gaming patterns HIGH from industry sources)

## Scope Note

Core poker engine, multi-table, auth, persistence, daily bonus, buy-in/cashout, sit-out/in, chat, auto-start, turn timers are **already implemented** and intentionally out of scope for this research. This document covers only the **9 new capabilities** queued for v1.0 MVP.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Missing these makes the product feel incomplete, unprofessional, or unsafe.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Branding — name, logo, splash** | Every shipped poker app has a brand. Unbranded = "test build" perception. Telegram Mini Apps also need a square icon for the launcher and a short description that renders in the chat card. | LOW | Deliverables: final name, wordmark, square logo (≥512×512), favicon, splash, Neon-Strip-aligned palette tokens exported as CSS vars. |
| **Avatar system with fallback** | Users want visible identity at each seat. Telegram avatar alone is inconsistent (missing, NSFW, or uninformative). A curated set avoids moderation burden and gives the product visual character. | LOW-MEDIUM | 20 animal PNGs bundled as static assets; random assignment on first `auth`; `avatarId` field on `User`; picker in profile. Dependency: requires Prisma migration adding `avatarId` (string). |
| **Reconnect flow** | Mobile Telegram users background the app constantly. A player who returns 10 seconds later MUST see their seat, chips, hole cards, and remaining turn timer — not a blank lobby. This is industry-standard on every real-money and play-money poker room. | HIGH | Server must: persist `socketId → userId` via durable key (telegramId), hold the seat for a grace window (typical 30–60s), rebind on reconnect, re-project `getStateForPlayer` including hole cards. Client must: auto-rejoin `tableId` on `socket.connect` after disconnect. Depends on existing `getStateForPlayer` projection. |
| **Action bubbles / action log** | Floating labels like "Call 100", "Raise to 500", "Fold", "All-In" above the acting seat are universal in online poker (PokerStars, GG, WSOP, Zynga). Without them, players miss what just happened — especially on fast tables. | MEDIUM | Client-side only if server already emits actions. Render a short-lived (1.2–1.8s) absolutely-positioned pill above the seat; queue so rapid actions don't overlap. Can piggyback on existing `state` events by diffing previous state, OR add a dedicated `playerAction` event (cleaner). |
| **Hand history (recent hands)** | Every serious poker player checks "what just happened". Standard depth is 20–100 recent hands showing: timestamp, hole cards, board, pot won/lost, final delta. Telegram poker competitors (TGPoker, Poker Hero) expose a basic version. | MEDIUM | New `HandHistory` Prisma model keyed to `userId`; write on every `showdown` in `Game.ts`; paginated read endpoint over socket; UI list + expandable detail. Configurable retention (e.g. last 100). |
| **Responsible-gaming disclaimer** | Even play-money social-casino apps in 2026 publish RG notices. Telegram's own policy scrutinises gambling-adjacent apps. Not having a disclaimer is a review risk. | LOW | Static "Play responsibly — virtual chips only, no real-money value" footer on main menu + Terms/Privacy links in profile. ToS & Privacy stub pages. |
| **Crash-safe chip persistence** | Users rage-quit if a server restart eats their stack. Competitive poker apps persist current-table chips within seconds of every mutation so process restarts are transparent. | MEDIUM | Add `currentTableId` + `currentChips` columns to `User`; write on every betting action (debounced or end-of-hand only is acceptable for MVP); on boot, restore state from DB. Tightly coupled to Reconnect. |
| **Production auth hardening** | Current `auth.ts` accepts empty `initData` via `devId`. Leaving this in prod = unauthenticated impersonation. | LOW | Gate the dev bypass behind `NODE_ENV !== 'production'` AND a build-time flag so tree-shaking removes it from prod bundles. |
| **Deposit screen (stub)** | Users will immediately tap any "Deposit" block and expect *something*. A well-designed "Coming soon — earn free chips daily" screen beats a dead button or silence. | LOW | Single styled page: upcoming-feature message, daily-bonus CTA redirect, expected-launch hint. No payment flow. |
| **Observability — error reporting (silent)** | Users don't expect to *see* error reports, but they expect the app to not silently swallow bugs. Devs need Sentry-class capture to diagnose reconnect/crash issues. From the user's POV: clear user-facing error toasts for actionable failures only. | LOW-MEDIUM | Sentry (or self-hosted GlitchTip) on client + server; strip PII; user-facing toasts already exist via `errorMessage` socket event. |

### Differentiators (Competitive Advantage)

Features that elevate the product above generic Telegram poker bots.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **20 curated anthropomorphic animal avatars** | Most Telegram poker apps reuse Telegram avatars or generic silhouettes. A bespoke illustrated set "animal playing poker" creates memorable brand moments and screenshot-worthy seats. Fits Neon Strip aesthetic. | LOW (assets) | Art delivery is the bottleneck; technically trivial. Consider pre-computing small/medium sizes. |
| **Animated action bubbles matched to Neon Strip** | Color-coded glow pills (red Fold, cyan Check/Call, amber Raise, orange All-In) reinforce brand and make table scanning instant. | MEDIUM | Reuse existing `NEON` token map from `GameControls.tsx`. Spring/fade animation (~200ms in, 1200ms hold, 300ms out). |
| **Session duration reminder** | 2026 social-casino standard: unobtrusive reminder after 60 min ("You've been playing for 1 hour"). Builds trust, pre-empts regulatory scrutiny, differentiates from black-box Telegram bots. | LOW | Client-side timer; modal at 60 min with "Keep playing / Take a break" buttons. No forced logout needed for virtual chips. |
| **Hidden admin panel** | A single well-built admin panel (live tables view, user search, balance grant, table enable/disable, live-edit blinds/buy-in, kick/ban) dramatically shortens incident response vs connecting to Postgres directly. Competitors rarely expose this to operators. | HIGH | Access pattern: gate by hardcoded `telegramId` allow-list in env var, accessed via a secret route (e.g. `/admin` hidden from nav, or a tap-count easter egg on logo). Socket namespace `/admin` with its own auth check. Log every admin action (audit trail). |
| **Reconnect shows "resuming" state** | Instead of a raw loading spinner, show a branded "Reconnecting to table Beginner 5/10…" screen with the table preview. Small polish, big perceived reliability win. | LOW | Client-side; uses `socket.io-client` reconnection events. |
| **Hand-history cards replay** | Tap a history row → animated replay showing street-by-street board reveal. Table stakes for serious poker rooms (PokerStars Replayer, GG Replayer). MVP can skip and ship flat-text summary. | HIGH | Defer to v1.1 unless art/engineering budget allows. Requires storing per-street snapshots, not just final state. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Free-form avatar upload** | Users want personal photos/memes. | Moderation nightmare (NSFW, copyrighted, offensive). Telegram will flag the app. Storage & CDN costs. | Curated 20-animal set exactly as scoped; optional future: unlock more via daily-bonus streaks. |
| **Public chat with no moderation** | "Players want to talk." | Toxic chat tanks retention; harassment reports; Telegram policy risk. Existing chat already ships — don't make it worse. | Keep existing chat but add: rate-limit, profanity filter, per-user mute, report button. (Not in v1.0 scope — flag for v1.1.) |
| **Real-money deposit in MVP** | Natural "next step" after stub. | Requires licensing, KYC, AML, payment processors, fraud ops. Out of scope per PROJECT.md. | Keep the stub clear: "Virtual chips only. No purchase required." |
| **In-hand "reconnect as fresh player" grace** | Users expect seat held forever. | Holds seat indefinitely = other players stuck. | Standard 30–60s grace window, then auto-fold remaining bets and free the seat, chips returned per existing disconnect-refund path. |
| **Admin panel exposed via same UI as players (with role toggle)** | "Just hide the buttons." | Client-side hiding is trivially bypassed via devtools. Any admin action sent over the normal socket is a privilege-escalation vector. | Separate secret route + server-side `telegramId` allow-list check on every admin socket event. Never trust client-declared role. |
| **Forced responsible-gaming lockouts** | "Be a responsible platform." | Virtual chips = no actual harm; aggressive limits annoy users and violate the "it's just a game" framing. | Soft reminders (60-min notice, optional user-set session caps) + visible "virtual chips, no real-money value" disclaimer. |
| **User-visible error stack traces / debug toasts** | "Transparency." | Leaks internals, confuses users, looks broken. | User-friendly toasts for actionable errors only ("Not enough chips", "Table full"); everything else → silent Sentry capture. |
| **Custom table creation by players** | "Give users flexibility." | Out of scope. Existing 6 predefined tables simplify matchmaking and economy; custom tables fragment player pool. | Keep predefined tables; admin can live-edit params via admin panel. |

---

## Feature Dependencies

```
Branding (name, logo, palette)
    └──blocks──> Full UI redesign
                     └──blocks──> Deposit stub page (needs final palette)
                     └──blocks──> Avatar picker UI (needs final palette)

Avatar system
    └──requires──> User.avatarId migration
    └──enhances──> SeatsDisplay (replace Telegram avatar fallback)
    └──enhances──> Profile page
    └──enhances──> Hand history (show avatar per hand)

Reconnect flow
    └──requires──> Crash-safe persistence (currentTableId, currentChips)
    └──requires──> Production auth hardening (stable userId from initData)
    └──enhances──> "Resuming" splash state

Crash-safe persistence
    └──requires──> Prisma migration (currentTableId, currentChips on User)
    └──requires──> Game.ts hook on every state mutation

Action bubbles
    └──requires──> Game table cleanup (need clean seat positions to anchor bubbles)
    └──may require──> New `playerAction` socket event (cleaner than diffing state)

Hand history
    └──requires──> HandHistory Prisma model + migration
    └──requires──> Game.ts showdown hook → write record
    └──enhances──> Profile page

Hidden admin panel
    └──requires──> Admin allow-list (env var of telegramIds)
    └──requires──> Separate socket namespace + auth
    └──requires──> Audit log table
    └──enhances──> Crash-safe persistence (can grant balance without DB access)

Responsible-gaming
    └──blocks──> App Store / Telegram listing review
    └──independent──> can ship standalone
```

### Dependency Notes

- **Branding blocks UI redesign:** palette tokens & logo must be final before wholesale screen redesigns; otherwise rework cost is high.
- **Reconnect requires crash-safe persistence:** a reconnecting user expects their chip stack at the table, which requires server to have persisted it. Shipping reconnect without persistence = half-reconnect that fails on process restarts.
- **Reconnect requires prod auth hardening:** reconnect keys off stable `telegramId`; with dev-bypass enabled, reconnect can be spoofed to seize someone else's seat.
- **Action bubbles benefit from game-table cleanup:** both touch `Table.tsx` / `SeatsDisplay.tsx` positioning; do together to avoid double-rework.
- **Admin panel is orthogonal to gameplay** but naturally ships *after* crash-safe persistence (admin wants to inspect/modify persisted state).
- **Responsible-gaming is fully independent** — can ship in parallel to any phase.

---

## MVP Definition

### Launch With (v1.0 — this milestone)

Everything listed in PROJECT.md is in scope; research confirms all 12 items are defensible as "launch-required" given the Neon Strip quality bar. Ordered by blocking/unblocking others:

- [x] **Branding & identity** — unblocks UI redesign
- [x] **Full UI redesign (Neon Strip)** — unblocks avatar picker, deposit stub, hand history UI
- [x] **Custom avatar system** — table stakes identity
- [x] **Profile expansion + hand history** — table stakes for serious poker
- [x] **Deposit stub page** — prevents dead-button rage
- [x] **Action bubbles** — table stakes; massive readability win
- [x] **Game table cleanup** — pairs with action bubbles
- [x] **Reconnect logic** — table stakes; mobile Telegram demands it
- [x] **Crash safety + prod auth hardening** — table stakes; enables reliable reconnect
- [x] **Hidden admin panel** — differentiator; dramatically reduces ops pain
- [x] **UI test suite** — prerequisite for all of the above not regressing
- [x] **Observability & RG compliance** — review-risk mitigation + debuggability

### Add After Validation (v1.1)

- [ ] **Hand-history replayer** — animated street-by-street; defer until usage confirms demand.
- [ ] **Chat moderation (rate-limit, profanity filter, mute, report)** — add once concurrent-user count justifies.
- [ ] **Player stats page expansion** — VPIP, PFR, BB/100 for power users.
- [ ] **Avatar unlock progression** — daily-bonus streaks award new animals.
- [ ] **Push notifications via Telegram bot** — "Your table is waiting".

### Future Consideration (v2+)

- [ ] **Real-money deposits** — licensing/KYC lift; out of scope explicitly.
- [ ] **Tournaments (SNG/MTT)** — large engine change.
- [ ] **Leaderboards, friends, private tables** — out of scope per PROJECT.md.
- [ ] **Multi-language (beyond RU/EN)** — based on user distribution.
- [ ] **Native wrappers** — Telegram-only per PROJECT.md.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Branding & identity | HIGH | LOW | P1 |
| Full UI redesign (Neon Strip) | HIGH | HIGH | P1 |
| Avatar system (20 animals) | MEDIUM | LOW | P1 |
| Hand history (flat list) | HIGH | MEDIUM | P1 |
| Deposit stub page | LOW | LOW | P1 (easy win, prevents confusion) |
| Action bubbles | HIGH | MEDIUM | P1 |
| Game table cleanup | MEDIUM | LOW | P1 (pairs with above) |
| Reconnect logic | HIGH | HIGH | P1 |
| Crash-safe persistence | HIGH | MEDIUM | P1 (blocks reconnect quality) |
| Prod auth hardening | HIGH (security) | LOW | P1 |
| Hidden admin panel | MEDIUM (ops) | HIGH | P1 (ships with v1.0 because post-launch ops require it) |
| UI test suite | MEDIUM | MEDIUM | P1 |
| Observability (Sentry-class) | MEDIUM | LOW | P1 |
| RG disclaimers + ToS/Privacy | MEDIUM (review risk) | LOW | P1 |
| Session-duration reminder | LOW | LOW | P2 |
| Hand-history replayer | MEDIUM | HIGH | P2 |
| Chat moderation | MEDIUM | MEDIUM | P2 |
| Real-money deposits | HIGH | VERY HIGH | P3 (out of scope) |
| Tournaments | HIGH | VERY HIGH | P3 |

**Priority key:**
- P1: Must have for v1.0 launch
- P2: v1.1 — add once v1.0 validated in production
- P3: v2+ — requires major scope expansion or regulatory work

---

## Poker-Specific Feature Notes

### Action Bubbles — recommended behavior

- Anchor: above the acting seat (adjusted for mobile rotation so bubble never overlaps hole cards).
- Content patterns: `Fold` · `Check` · `Call 100` · `Bet 250` · `Raise to 500` · `All-In 1,240` · `Show` · `Muck`.
- Color: match existing `NEON` tokens (red/cyan/amber/orange/gray).
- Timing: 200ms fade-in → 1,200ms hold → 300ms fade-out (total ~1.7s).
- Queue: if a second bubble fires on same seat while prior is visible, replace (don't stack).
- Accessibility: also log the action in the existing chat/event log so it's not purely transient.

### Reconnect Flow — recommended behavior

1. Client detects `socket.disconnect` → show "Reconnecting…" Neon Strip overlay.
2. Socket.io-client auto-reconnects (exponential backoff, already built-in).
3. On `connect`, client re-sends `auth` then, if `currentTableId` is known (from `currentUser` state or server-pushed on auth), emits `rejoinTable`.
4. Server validates: user is still in `table.playerIds` AND within grace window (30s default).
   - If YES → rebind new `socket.id` to existing player slot, emit `tableJoined` + full `getStateForPlayer` projection (including hole cards if hand in progress).
   - If NO (grace expired) → treat as fresh session; chips already refunded via existing disconnect handler.
5. Client replaces `gameState` wholesale; turn timer auto-syncs via `turnExpiresAt` timestamp already in state.

**Grace window tuning:** 30s default; extend to 60s for high-stakes tables (give reconnecting player a fair shot). The pending turn-timer continues running server-side — no pause — so other players aren't held hostage.

### Hidden Admin Panel — recommended behavior

- **Access:** route `/admin` not linked from any UI. Gated by `ADMIN_TELEGRAM_IDS` env var (comma-separated). Server checks on socket namespace `/admin` connect.
- **Dashboards:** live tables (players, pot, stakes), online users count, economy snapshot (total chips in play, daily bonus claims today), recent errors.
- **Controls:** enable/disable table (hides from public list), live-edit blinds/buy-in/turn-time, kick player from seat, ban user (telegramId block), grant/deduct balance (with reason field).
- **Audit:** every admin action writes to `AdminAuditLog` table (adminId, action, target, params, timestamp).
- **UI:** same Neon Strip palette but with a distinct red/amber "ADMIN MODE" banner so you can't confuse it with a player session.

### Responsible Gaming — minimum viable compliance

- Static footer on main menu: *"Virtual chips only — no real-money value. Play responsibly."*
- Profile → Legal → Terms of Service + Privacy Policy (stub pages OK for v1.0 if content is accurate).
- Optional (P2): 60-minute session reminder modal: "You've been playing for 1 hour. [Keep playing] [Take a break]".
- No forced lockouts, no self-exclusion flow required for virtual-chip play (per 2026 social-casino norms).

---

## Competitor Feature Analysis

Observed from public Telegram poker Mini Apps (TGPoker, Poker Hero, TG Poker Free) and broader online poker norms (PokerStars, GG, WSOP, Zynga Poker):

| Feature | TG poker competitors | Major online poker rooms | NightRiver v1.0 target |
|---------|---------------------|--------------------------|------------------------|
| Branded identity | Weak / generic | Strong | **Strong (Neon Strip)** |
| Custom avatars | Telegram avatar reuse | Curated sets + unlocks | **20-animal curated set** |
| Hand history | Rare | Standard + replayer | **Flat list v1.0; replayer v1.1** |
| Action bubbles | Sometimes | Universal | **Neon-Strip styled** |
| Reconnect | Spotty | Industry-standard | **Full grace-window rejoin** |
| Admin tools | Unknown (closed) | Heavy | **Hidden panel v1.0** |
| Responsible gaming | Inconsistent | Mandatory (regulated) | **Disclaimers + ToS/Privacy** |
| Session limits | Rare | Mandatory in regulated markets | **Not required v1.0 (virtual chips)** |
| Observability | Unknown | Heavy (Splunk/Datadog) | **Sentry-class error tracking** |

**Positioning:** v1.0 aims to match regulated-room polish on *UX and reliability* (reconnect, admin, RG, observability) while keeping the *scope* cash-games-only to stay within Telegram Mini App constraints. The Neon Strip brand is the primary differentiator against generic Telegram poker bots.

---

## Sources

- [What Deposit Limits, Session Timers and Self-Exclusion Actually Do — 2026](https://journalamdc.com/what-deposit-limits-session-timers-and-self/) — MEDIUM confidence
- [Sixty6 Social Casino — Responsible Gaming Policy](https://sixty6.com/responsible-gaming-policy) — MEDIUM
- [Social Casino Responsible Gaming: Warning Signs & Best Practices (RotoGrinders)](https://rotogrinders.com/social-casinos/responsible-gaming) — MEDIUM
- [American Gaming Association — Responsible Gaming Regulations Guide](https://www.americangaming.org/resources/responsible-gaming-regulations-and-statutes-guide/) — HIGH
- [Telegram Mini Apps UX Guide (Turumburum)](https://turumburum.com/blog/telegram-mini-app-beyond-the-standard-ui-designing-a-truly-native-experience) — MEDIUM
- [Everything About Telegram Mini Apps — 2026 Guide (Magnetto)](https://magnetto.com/blog/everything-you-need-to-know-about-telegram-mini-apps) — MEDIUM
- [Telegram Mini Apps — Authorizing User (official docs)](https://docs.telegram-mini-apps.com/platform/authorizing-user) — HIGH
- [TGPoker — Telegram Mini App listing](https://telegraminiapps.com/app/tgpoker/) — LOW (competitor surface-observation)
- [Poker Hero — Telegram Mini App listing](https://www.findmini.app/poker_hero_bot/) — LOW
- [Enhancing Online Poker UX — AIS Technolabs](https://www.aistechnolabs.com/blog/what-players-think-about-online-poker-ux) — LOW-MEDIUM
- [UI/UX in Poker Software — Creatiosoft](https://creatiosoft.com/blogs/ui-ux-for-poker-game-software-importance-and-how-to-improve/) — LOW-MEDIUM
- Training-data knowledge of PokerStars/GG/WSOP client conventions — MEDIUM (standard industry practice)
- Project-internal: `CLAUDE.md`, `.planning/PROJECT.md`, `.planning/codebase/ARCHITECTURE.md` — HIGH (authoritative for this codebase)
