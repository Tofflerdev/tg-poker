# Phase 2: Design System Rollout & Avatars - Research

**Researched:** 2026-04-16
**Domain:** Frontend design-system rollout (Tailwind v4 primitives) + avatar asset pipeline + client-side compliance gate
**Confidence:** HIGH (substrate is fully known; all questions answered against current code)

## Summary

Phase 1 already shipped the Neon Strip token substrate (`client/src/styles/neon.css`) as a Tailwind v4 `@theme` block, refactored both `GameControls.tsx` and `SeatsDisplay.tsx` to consume tokens via `var(--…)` + `color-mix()` (with no hex literals remaining), and migrated the Prisma `User` model to include every column Phase 2 needs (`avatarId`, `tosAcceptedAt`, `tosVersion`). The Phase 2 task is therefore additive: build four `ui/` primitives reading the existing tokens, redesign four pages that consume them, ship 20 WebP avatar assets behind a shared manifest, and bolt a client-side consent gate onto the existing `App.tsx` view-switch router.

There is **no React Router** in this project — `App.tsx` switches on a `view: AppView` state. Every "route" mentioned in CONTEXT (`/deposit`, `/legal/*`, `/consent`) is implemented as a new variant of that union, not a URL. The consent gate is therefore a guard inside the `view` resolution, not router middleware.

**Primary recommendation:** Build primitives as vanilla TS components with a discriminated `variant` prop mapped to a small `VARIANT_TIER` lookup → `var(--color-action-*)`. Do not add `class-variance-authority` (zero-dep policy fits this codebase). Mirror the `AVATARS` constant from `types/avatars.ts` (server-consumed, NodeNext, `.js` import suffix) and re-export it via `client/src/assets/avatars/manifest.ts` with a static `Record<AvatarId, string>` of Vite `new URL('./fox.webp', import.meta.url).href` references so Vite hashes them.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Ship v1.0 as `NightRiver` — no rename. BRAND-01 is satisfied by adopting NightRiver as real name across UI copy, `index.html` title, manifest, anywhere current copy says "NightRiver" / "tg-poker".
- **D-02:** Logo asset AI-generated this phase. SVG (primary) + PNG + ICO. Neon Strip style; legible at 32×32 and 192×192. Icon + wordmark on Main Menu header; icon-only for favicon/splash.
- **D-03:** Logo generation in execution (not planning). Planner defines slots + prompt brief; executor produces bytes.
- **D-04:** All four primitives (`Button`, `Card`, `Tab`, `Badge`) built upfront in dedicated plan before any page redesign. Pages consume them from day one.
- **D-05:** Variant API is **action-tier only**: `fold | call | raise | allin | sit | active | neutral`. Generic UI buttons use `active` / `sit` / `neutral`. No freeform color props.
- **D-06:** Primitives consume CSS custom properties from `client/src/styles/neon.css`. No inline hex literals.
- **D-07:** `GameControls.tsx` buttons migrate to `<Button variant="…">` as part of Game Room chrome redesign — eliminating the duplicate NEON map.
- **D-08:** 20 anthropomorphic-animal-poker WebP assets at `client/src/assets/avatars/{slug}.webp`. Vite hashes them.
- **D-09:** Species list proposed by Claude, **approved by user before generation** (blocking gate inside the avatar plan).
- **D-10:** `User.avatarId` stores species slug (string). Self-documenting filenames; no migration on add/remove.
- **D-11:** Single static manifest `client/src/assets/avatars/manifest.ts` (`AVATARS` const + `AvatarId` type). Mirrored into `types/avatars.ts` for the server.
- **D-12:** Atomic random-assign happens server-side **inside `UserRepository.create`** — single INSERT writes `avatarId`. No post-insert UPDATE.
- **D-13:** Re-pick UX: 4×5 grid on Profile → Avatar tab. Tap-to-select + explicit Confirm button (no instant-save).
- **D-14:** `SeatsDisplay` resolves seat avatar from `avatarId` via manifest. Initial-letter fallback retained but only fires if `avatarId` null/unknown.
- **D-15:** Custom avatar **replaces Telegram avatar everywhere**. `useTelegram` `photo_url` ignored in rendering.
- **D-16:** Main Menu block order: **Deposit → Tables → Daily Bonus → Profile**.
- **D-17:** Deposit tap → in-app "Coming soon" page. No external links, no payment SDK, no email capture.
- **D-18:** Table List grouped by stake tier with section headers (Beginner / Standard / Pro / High Stakes). Dense rows showing name, blinds, buy-in, `N/6`. Tier-colored accent on header.
- **D-19:** Tier color mapping: Beginner = `--color-action-sit`, Standard = `--color-action-call`, Pro = `--color-action-raise`, High Stakes = `--color-action-allin` OR `--color-action-fold` (planner picks more readable one — see Q9).
- **D-20:** Profile is **3 tabs: Profile / Avatar / History**. History is a "Coming in next release" stub.
- **D-21:** Profile tab: avatar, editable display name (inline), stats grid (`balance`, `handsPlayed`, `handsWon`, `totalWinnings`, `biggestPot`), daily-bonus eligibility state. Each section uses `Card` primitive.
- **D-22:** Avatar tab: 4×5 grid + Confirm button (D-13).
- **D-23:** History tab: Neon Strip empty state + "Your last 50 hands will appear here after the next release". No socket/data wiring in Phase 2.
- **D-24:** **Remove top-left table/phase label and top-right pot label outright. No replacement.** Pot visible at center via `PotDisplay`. Maximum table real estate.
- **D-25:** Game Room chrome scope: redesign existing header/footer/overlays in Neon Strip; keep small back-to-menu affordance discoverable. Redundant labels removed, not moved.
- **D-26:** Three static pages at `/legal/tos`, `/legal/privacy`, `/legal/responsible-gaming`. Reachable from Main Menu footer link and Profile settings.
- **D-27:** First-launch consent is a **single full-page route** (not modal) shown to any user with `tosAcceptedAt IS NULL`. Inline links to view docs. One combined "I agree to ToS, Privacy, RG" checkbox + Accept. On Accept: write `tosAcceptedAt = now()`, `tosVersion = "1.0"`; unblock client router.
- **D-28:** Server-side `joinTable` enforcement **deferred to Phase 5 (COMPLIANCE-04)**. Phase 2 gate is client-side only.
- **D-29:** Grandfather flow: users created before ToS gate see non-blocking dismissible banner at top of Main Menu. Dismissible once per session (`localStorage`). Clicking Accept goes through same flow.
- **D-30:** RG page copy: virtual-chip disclaimer, "not for real money", daily-bonus-only economy description, informational "take a break" guidance. No forced lockouts, no timer, no session-duration tracking.

### Claude's Discretion
- Exact AI prompts and style guide for the 20 avatars and the logo (planner drafts; executor refines).
- Internal file layout inside `client/src/components/ui/` and whether barreled via `ui/index.ts`.
- Tier color for "High Stakes": `--color-action-allin` (orange) vs `--color-action-fold` (red) — pick on readability.
- ToS / Privacy / RG initial copy (English v1.0); user will review.
- Micro-interactions (hover, press) within Neon Strip glow/pulse vocabulary from Phase 1.

### Deferred Ideas (OUT OF SCOPE)
- BRAND-01 rename to non-codename → v1.1+.
- Server-side `joinTable` ToS enforcement → Phase 5 (COMPLIANCE-04).
- Hand history content on Profile → History tab → Phase 3 (PROFILE-02/03). Stub only here.
- `prefers-reduced-motion` audit → Phase 3 (honor it for any new animations introduced here).
- Avatar unlock / streak rewards → v1.1+.
- Free-form avatar upload → out of scope (REQUIREMENTS.md).
- Session-duration reminder toast → v1.1+.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BRAND-01 | Adopt final name across UI/copy/manifest | Q7 — `index.html` title + manifest wiring |
| BRAND-02 | Logo asset SVG + PNG/ICO on main menu + splash | Q7 — slot inventory and Telegram Mini App header reqs |
| UI-01 | Main Menu redesigned in Neon Strip | Q1, Q2 — primitive consumption pattern |
| UI-02 | Table List redesigned (tier groups, blinds, buy-in, N/6) | Q9 — tier color readability |
| UI-03 | Profile/Settings redesigned (3 tabs) | Q1, Q2 — Tab primitive |
| UI-04 | Game room chrome redesigned; top labels removed | Q1, Q2 — Button primitive replaces inline NEON map |
| UI-05 | Uses `frontend-design` skill + shared `ui/` primitives | Q1, Q2 — Phase 1 substrate already exposes tokens |
| AVATAR-01 | 20 anthropomorphic-animal WebP assets ship hashed | Q3 — Vite asset URL pattern |
| AVATAR-02 | Atomic random-assign on first auth | Q4 — single INSERT in `findOrCreate` |
| AVATAR-03 | User can re-pick from Profile → Avatar tab | Q1, Q10 — Card grid primitive + socket update event |
| AVATAR-04 | `SeatsDisplay` renders avatar from manifest | Q10 — `Avatar` component swap from `avatarUrl` to `avatarId` resolver |
| DEPOSIT-01 | First-position Deposit block on Main Menu | Q5 — view-union routing |
| DEPOSIT-02 | Tap → in-app "Coming soon" page | Q5 — new `'deposit'` view variant |
| COMPLIANCE-01 | Static ToS / Privacy / RG pages reachable from menu+settings | Q5 — view-union routes |
| COMPLIANCE-02 | First-launch consent gate writes `tosAcceptedAt`+`tosVersion` | Q5, Q6, Q10 — guard in `App.tsx` view switch + new socket event |
| COMPLIANCE-03 | Grandfather banner non-blocking dismissible | Q6 — localStorage-per-session pattern |
| COMPLIANCE-05 | RG page contents | D-30 verbatim — no research needed |
| PROFILE-01 | Profile shows stats + name + avatar + bonus eligibility | Q4 — `mapToTelegramUser` already computes `canClaimDaily` |

## Project Constraints (from CLAUDE.md)

- **Server module system:** ES2022 + NodeNext → server-side imports of `types/avatars.ts` MUST use `.js` extension (`from '../../types/avatars.js'`). Verified: `UserRepository.ts` imports `'../../types/index.js'`.
- **Client module system:** Bundler resolution; client imports of `types/avatars` omit extension.
- **Tailwind v4 zero-config:** No `tailwind.config.js`. Tokens belong in `@theme` block inside `client/src/styles/neon.css`.
- **No ESLint/Prettier** — style maintained by convention. Match existing patterns in `GameControls.tsx`/`SeatsDisplay.tsx`.
- **Dev-mode CORS** restricted to `https://tgp.isgood.host` in prod (do not modify).
- **Socket.io is the only transport** — avatar update + ToS accept events follow existing request/ack pattern in `server/index.ts`.
- **Inline `style={{…}}`** is the established pattern for dynamic Neon glow values; reserve Tailwind utilities for layout/spacing/flex (per CONVENTIONS.md). Primitives can use both.
- **No barrel files beyond `types/index.ts`** is the current convention; a new `ui/index.ts` is acceptable but not required.

## Standard Stack

### Already in the tree (no new deps)
| Library | Version | Purpose | Why it covers Phase 2 |
|---------|---------|---------|--------------|
| `tailwindcss` | 4.2.1 | Utility CSS + `@theme` tokens | Phase 1 already exposes Neon Strip via `@theme`; primitives just consume `var(--…)`. [VERIFIED: `client/package.json`] |
| `@tailwindcss/vite` | 4.2.1 | Tailwind v4 Vite integration | [VERIFIED: `client/package.json`] |
| `react` | 18.2.0 | UI | [VERIFIED: `client/package.json`] |
| `vite` | 5.3.0 | Bundler — also handles WebP hashing via `new URL(...)` | [VERIFIED: `client/package.json`] |
| `socket.io-client` | 4.7.5 | Avatar update + ToS accept events | [VERIFIED: `client/package.json`] |
| `@prisma/client` | 7.4.2 | `User.avatarId` already exists | [VERIFIED: `prisma/schema.prisma:25`] |

### Explicitly NOT added
| Considered | Why not |
|------------|---------|
| `class-variance-authority` | Project has zero variant-system deps; a 6-line `VARIANT_TIER` lookup table is enough for action-tier-only API (D-05). |
| `react-router-dom` | App uses `view: AppView` state union, not URL routing. Adding a router for 4 new "routes" would force rewriting auth/socket lifecycle. Stay with the union. |
| `clsx` / `classnames` | Not needed; primitives use a tiny inline `cx()` helper or template literals. |
| Image generation library | Avatars and logo are produced by the executor agent itself during execution; no runtime tool needed in the codebase. |

**No `npm install` step is required for Phase 2.** [VERIFIED: cross-checked `package.json` and `client/package.json`]

## Architecture Patterns

### Recommended file layout
```
client/src/
├── components/
│   ├── ui/                         # NEW — shared primitives
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Tab.tsx
│   │   ├── Badge.tsx
│   │   └── tokens.ts               # VARIANT_TIER lookup (single source for variant→token mapping)
│   ├── ConsentBanner.tsx           # NEW — grandfather banner
│   ├── SeatsDisplay.tsx            # MODIFIED — Avatar resolver
│   └── GameControls.tsx            # MODIFIED — migrate to ui/Button
├── pages/
│   ├── MainMenu.tsx                # REDESIGNED
│   ├── TableList.tsx               # REDESIGNED
│   ├── ProfileSettings.tsx         # REDESIGNED (3 tabs)
│   ├── GameRoom.tsx                # CHROME REDESIGN
│   ├── Deposit.tsx                 # NEW — "Coming soon"
│   ├── Consent.tsx                 # NEW — first-launch gate
│   └── legal/
│       ├── ToS.tsx                 # NEW
│       ├── Privacy.tsx             # NEW
│       └── ResponsibleGaming.tsx   # NEW
├── assets/
│   ├── avatars/                    # NEW
│   │   ├── manifest.ts             # re-exports types/avatars constants + URL map
│   │   ├── fox.webp …              # 20 files (slug names per D-09)
│   ├── logo.svg                    # NEW
│   ├── logo-192.png                # NEW
│   └── favicon.ico                 # NEW (or under client/public/)
└── App.tsx                         # MODIFIED — view-union additions + consent guard

types/
└── avatars.ts                      # NEW — shared AVATARS / AvatarId source
```

### Pattern 1: Action-tier `Button` primitive (vanilla TS, no CVA)

```typescript
// client/src/components/ui/tokens.ts
export type ActionTier = 'fold' | 'call' | 'raise' | 'allin' | 'sit' | 'active' | 'neutral';

export const VARIANT_TIER: Record<ActionTier, { color: string; glow: string }> = {
  fold:    { color: 'var(--color-action-fold)',  glow: 'var(--glow-fold)' },
  call:    { color: 'var(--color-action-call)',  glow: 'var(--glow-call)' },
  raise:   { color: 'var(--color-action-raise)', glow: 'var(--glow-raise)' },
  allin:   { color: 'var(--color-action-allin)', glow: 'var(--glow-allin)' },
  sit:     { color: 'var(--color-action-sit)',   glow: 'var(--glow-sit)' },
  active:  { color: 'var(--color-active)',       glow: 'var(--glow-call)' },
  neutral: { color: 'var(--color-neutral)',      glow: 'var(--glow-neutral)' },
};
```

```typescript
// client/src/components/ui/Button.tsx — sketch (consumed pattern from GameControls.tsx:55-83)
import { VARIANT_TIER, type ActionTier } from './tokens';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant: ActionTier;
  emphasis?: boolean;            // applies inset glow (matches `active` in neonBtn)
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ variant, emphasis, fullWidth, style, children, ...rest }) => {
  const t = VARIANT_TIER[variant];
  return (
    <button
      {...rest}
      style={{
        background: emphasis
          ? `linear-gradient(180deg, color-mix(in srgb, ${t.color} 10%, transparent) 0%, color-mix(in srgb, ${t.color} 3%, transparent) 100%)`
          : 'transparent',
        border: `1.5px solid color-mix(in srgb, ${t.color} 38%, transparent)`,
        borderRadius: 14,
        color: t.color,
        fontWeight: 700,
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
        minHeight: 44,
        width: fullWidth ? '100%' : undefined,
        boxShadow: emphasis ? `0 0 18px ${t.glow}, inset 0 0 12px ${t.glow}` : 'none',
        transition: 'box-shadow .15s, background .15s, transform .1s',
        WebkitTapHighlightColor: 'transparent',
        ...style,
      }}
    >
      {children}
    </button>
  );
};
```

This mirrors the existing `neonBtn(n, active)` factory in `GameControls.tsx:65-83` — Phase 1 work is the de-facto spec for the primitive.

### Pattern 2: View-union "routing" in `App.tsx`

`App.tsx:30` defines `type AppView = 'loading' | 'auth' | 'menu' | 'tables' | 'game' | 'profile';`. Phase 2 extends this:

```typescript
type AppView =
  | 'loading' | 'auth'
  | 'consent'              // NEW — first-launch gate
  | 'menu' | 'tables' | 'game' | 'profile'
  | 'deposit'              // NEW
  | 'legal-tos'            // NEW
  | 'legal-privacy'        // NEW
  | 'legal-rg';            // NEW
```

After successful `authSuccess`, gate the transition to `'menu'`:
```typescript
socket.on('authSuccess', (userData) => {
  setCurrentUser(userData);
  setView(userData.tosAcceptedAt ? 'menu' : 'consent');
  hapticFeedback?.notificationOccurred('success');
});
```
Server `mapToTelegramUser` (`server/db/UserRepository.ts:148-159`) MUST be extended to surface `tosAcceptedAt` (currently absent from `TelegramUser`). Add `tosAcceptedAt?: string` to the `TelegramUser` interface in `types/index.ts`.

### Pattern 3: Avatar manifest with Vite-hashed URLs

```typescript
// types/avatars.ts — shared, server reads it for atomic INSERT
export const AVATARS = ['fox', 'owl', 'wolf', /* … 20 total */] as const;
export type AvatarId = typeof AVATARS[number];

export function randomAvatarId(): AvatarId {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)];
}
```

```typescript
// client/src/assets/avatars/manifest.ts
import { AVATARS, type AvatarId } from '../../../../types/avatars';

// Vite resolves these at build time and hashes the .webp files.
const URLS: Record<AvatarId, string> = {
  fox:  new URL('./fox.webp',  import.meta.url).href,
  owl:  new URL('./owl.webp',  import.meta.url).href,
  wolf: new URL('./wolf.webp', import.meta.url).href,
  // … 20 entries
};

export { AVATARS, type AvatarId };
export const avatarUrl = (id: AvatarId | null | undefined): string | undefined =>
  id && URLS[id] ? URLS[id] : undefined;
```

Why explicit `URLS` literal (not a loop)? Vite needs the `new URL(staticString, import.meta.url)` form to be statically analyzable for hashing. Globbing via `import.meta.glob('./*.webp', { eager: true, query: '?url' })` is the only loop-style alternative that works under Vite. [CITED: Vite docs — Static Asset Handling, `new URL` pattern].

### Anti-patterns to avoid
- **Don't use `class-variance-authority`** — over-engineering for a 7-variant enum.
- **Don't expose `color` / `colorClass` props** on primitives — D-05 is non-negotiable; only `variant: ActionTier` is allowed.
- **Don't add `react-router-dom`** for 4 new screens; the view-union router is the project's idiom.
- **Don't store WebPs in `client/public/`** — they would bypass Vite hashing and lose cache-busting. Use `client/src/assets/avatars/`.
- **Don't render Telegram `photo_url`** anywhere after this phase ships (D-15). The only allowed avatar source is the manifest resolver.

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Variant→class mapping | Custom CVA-style DSL | Plain `Record<Variant, …>` lookup (Pattern 1) | 7 variants; one-line lookup is clearer than a generic system. |
| Asset hashing/CDN | Manual file copy to `dist/` | Vite `new URL('./foo.webp', import.meta.url)` | Vite already does content hashing + tree-shakes unused. |
| Random selection per insert | Cron job, db trigger, two-step UPDATE | `Math.random()` inside the same `prisma.user.create()` call (Pattern 4 below) | Single INSERT is atomic by definition — no race window exists. |
| URL routing | `react-router-dom` | Extend `view: AppView` union | Project's existing idiom; auth/socket lifecycle already wired around it. |
| Per-session dismissal | Cookie + server flag | `localStorage.getItem('consent_banner_dismissed')` reset on logout | Banner is non-blocking decoration; no security need for server state. |
| Telegram Mini App favicon | Custom service worker | Plain `<link rel="icon">` in `index.html` + manifest | Telegram WebView honors standard HTML icon hints. |

**Key insight:** Most "infrastructure" for this phase is already in place from Phase 1. Phase 2 is glue + assets, not new systems.

## Per-Question Findings (from prompt)

### Q1 — Phase 1 substrate, what tokens exist?
[VERIFIED: `client/src/styles/neon.css`]
The complete published API is:

| Token | Hex |
|-------|-----|
| `--color-action-fold` | `#ff4757` |
| `--color-action-call` | `#00e5ff` |
| `--color-action-raise` | `#ffab00` |
| `--color-action-allin` | `#ff6d00` |
| `--color-action-sit` | `#4caf50` |
| `--color-active` | `#00e5ff` |
| `--color-chip` | `#ffab00` |
| `--color-neutral` | `#b0bec5` |
| `--glow-{fold,call,raise,allin,sit,neutral}` | `rgba(...)` derivatives |

Tailwind v4's `@theme` block automatically generates utility classes for `--color-*` tokens (e.g. `bg-action-fold`, `text-action-call`, `border-action-raise`). [CITED: tailwindcss.com/docs/theme — v4 derives utilities from `@theme` color custom properties.] You can write `<button className="text-action-call border-action-call">` instead of inline `style`. **However**, the existing Phase 1 components (`GameControls.tsx`, `SeatsDisplay.tsx`) use **inline `style` with raw `var(--…)`** — match that style for consistency and because the Neon Strip glow effects (`box-shadow` with multiple stops + `color-mix`) don't map to Tailwind utilities cleanly.

No additional tokens are needed for Phase 2 — the existing palette covers every variant in D-05.

### Q2 — Tailwind v4 + primitive patterns
The recommended pattern is **vanilla TS components with a `Record`-based variant lookup** (Pattern 1 above). CVA / `tailwind-variants` are popular in greenfield projects, but they're built around composing class strings — they add little value when 80% of the styling is dynamic `box-shadow` / `color-mix` strings (which Phase 1 has already proven is the right approach for Neon Strip).

Card / Tab / Badge follow the same ingredient set:
- **Card:** dark translucent `rgba(10,10,14,0.88)` + `backdrop-filter: blur(12px)` + `1.5px solid color-mix(...)` border. Optional `variant` prop tints the border.
- **Tab:** Underline-style with bottom `GlowBar` (extracted from `SeatsDisplay.tsx:120-134`). Active tab uses `--color-active`.
- **Badge:** Pill, low-alpha background + colored border + small text-shadow glow (extracted from `StatusBadge` at `SeatsDisplay.tsx:96-117`).

Every visual recipe needed already exists in Phase 1 — extract, parameterize on `variant: ActionTier`, ship.

### Q3 — WebP avatar generation
[VERIFIED via Vite docs] Vite hashes any asset referenced via `new URL('./file.ext', import.meta.url)` or `import url from './file.ext?url'`. WebPs in `client/src/assets/avatars/` will be emitted to `dist/assets/foo-<hash>.webp` and the URL substituted at build time.

**File-size targets** for 20 avatars on a Telegram Mini App:
- Display size: avatar is 22-28px circular at seat (`SeatsDisplay.tsx:231`), 64px or larger in picker grid. Source at **256×256** WebP, lossy quality 80 → typically **8-15 KB per file**, total budget **≈200-300 KB for all 20**. [ASSUMED: based on common WebP encoder behavior; verify after first file.]
- Telegram Mini App load budget is informally ~1 MB. 20 avatars at 200-300 KB total is fine. [ASSUMED — no published Telegram limit.]

**Generation approach for the executor agent:** the executor produces the binary bytes itself (via image-generation MCP tool or, if absent, generates SVG fallbacks and converts). The planner's job is to write the file slots, the prompt brief, and the gate (D-09) that pauses for user approval of the species list. Recommended prompt-brief skeleton (planner refines):
- Style: dark-background neon-rim portrait, anthropomorphic, holding/playing poker
- Composition: 256×256 square, centered head-and-shoulders, transparent or near-black background
- Lighting: cyan/amber rim light to match Neon Strip palette
- Consistency: same camera distance, same lighting setup, same head-and-shoulders crop across all 20

### Q4 — Atomic random-assign in `UserRepository.create`

Current code (`server/db/UserRepository.ts:11-20`):
```typescript
user = await prisma.user.create({
  data: {
    telegramId: BigInt(telegramId),
    telegramUsername: username,
    displayName: generateRandomName(),
    avatarUrl: photoUrl,         // ← will become ignored for rendering (D-15)
    balance: 1000
  }
});
```

**Recommended change (Pattern 4):**
```typescript
import { randomAvatarId } from '../../types/avatars.js';     // .js for NodeNext

user = await prisma.user.create({
  data: {
    telegramId: BigInt(telegramId),
    telegramUsername: username,
    displayName: generateRandomName(),
    avatarId: randomAvatarId(),                              // ← single INSERT, atomic
    balance: 1000
    // avatarUrl intentionally omitted — D-15 says ignore Telegram photo
  }
});
```

The `mapToTelegramUser` function (`server/db/UserRepository.ts:132-159`) must also be extended to surface `avatarId` and `tosAcceptedAt` on the `TelegramUser` payload so the client can read them.

**Why this is atomic:** PostgreSQL guarantees a single `INSERT` is atomic with respect to concurrent transactions. Because the slug is computed in JS *before* the INSERT and written as a regular column value, there's no read-modify-write window. AVATAR-02's "UPDATE WHERE avatarId IS NULL" wording in REQUIREMENTS.md is an alternative pattern; D-12 deliberately picks the simpler INSERT-time pattern, which has identical correctness with less code.

### Q5 — Client-side consent-gate routing

[VERIFIED: `client/src/App.tsx:30, 144-148, 308-405`] App uses no router — view selection is a chain of `if (view === '…')` returns. The pattern for the consent gate:

1. Extend `AppView` union with `'consent' | 'deposit' | 'legal-tos' | 'legal-privacy' | 'legal-rg'`.
2. In the `authSuccess` handler, set view to `'consent'` if `userData.tosAcceptedAt == null`, else `'menu'`.
3. Add a render branch `if (view === 'consent') return <Consent socket={socket} onAccept={() => setView('menu')} />;`.
4. The `Consent` component emits a new socket event `acceptTos` (Pattern 5) and on ack updates `currentUser.tosAcceptedAt` and calls `onAccept()`.

**Crucial:** because there is no router, the gate is enforced by the **absence of a render branch that lets a non-accepted user reach `'menu'` / `'tables'` / `'game'`**. Add a defense-in-depth check at the top of the render: `if (currentUser && !currentUser.tosAcceptedAt && view !== 'consent' && !view.startsWith('legal-')) return <Consent .../>;`. This handles the edge case where some other event (server reconnect, etc.) tries to setView away from consent.

### Q6 — Grandfather banner

`localStorage` is the right store: per-device, persists across reloads, but a fresh session (clearing cache or new device) re-shows the banner. Per-session dismissal as written in D-29 actually means **per-localStorage-entry-lifetime** in this context.

Pattern:
```typescript
const KEY = 'consent_banner_dismissed_v1';
const [dismissed, setDismissed] = useState(() => localStorage.getItem(KEY) === '1');
const onDismiss = () => { localStorage.setItem(KEY, '1'); setDismissed(true); };
```

**Coexistence with `acceptTos` flow:** if user clicks Accept inside the banner, it calls the same `socket.emit('acceptTos', { version: '1.0' })` flow as `Consent.tsx`. On server ack, both `currentUser.tosAcceptedAt` is updated AND `localStorage[KEY] = '1'` so the banner doesn't reappear after refresh either. Show banner iff: `currentUser?.tosAcceptedAt == null && !dismissed`.

### Q7 — Logo / favicon / manifest wiring

[VERIFIED: `client/index.html`] Current `<head>` is minimal: theme-color, title `"Poker - Telegram Mini App"`, no favicon, no manifest. Phase 2 must:

| Slot | File | Wire-up |
|------|------|---------|
| Title | n/a | `<title>NightRiver — Poker</title>` |
| Favicon | `client/public/favicon.ico` (32×32 ICO) | `<link rel="icon" type="image/x-icon" href="/favicon.ico">` |
| Apple touch icon | `client/public/logo-192.png` | `<link rel="apple-touch-icon" sizes="192x192" href="/logo-192.png">` |
| Web manifest | `client/public/manifest.webmanifest` | `<link rel="manifest" href="/manifest.webmanifest">` — name=NightRiver, theme_color matches Neon Strip dark bg |
| In-app logo | `client/src/assets/logo.svg` | `import logoUrl from './assets/logo.svg'` (Vite hashes); composite with wordmark on Main Menu header |
| Splash | reuse `logo-192.png` or new `splash.png` | optional — Telegram WebApp doesn't define a splash spec; the icon-only logo on first paint is sufficient |

**Telegram Mini App header requirements:** Telegram does not consume `<link rel="icon">` for its native header — the WebApp header shows the bot's avatar (set via BotFather), not the Mini App's favicon. [CITED: telegram.org/api/bots/webapps]. So `favicon.ico` matters for browser tabs (when devs open the site directly) and the in-app `<img src={logoUrl}>` matters for visible branding inside the app. Splash is fully under our control via the loading view (`App.tsx:308-315`).

`theme_color` meta should change from current `#2481cc` (Telegram blue) to a Neon-Strip-compatible dark color (`#0a0a0e` or similar). Same for `setHeaderColor` calls in `App.tsx:109` / `MainMenu.tsx:36` / `TableList.tsx:15` — they set Telegram chrome to bright blue, jarring against the dark neon UI. Replace with a dark token to match the app surface.

### Q8 — Shared `AVATARS` constant

[VERIFIED: `tsconfig.json`, `client/tsconfig.json`, `server/db/UserRepository.ts:1-3`]

- Server (`tsconfig.json` includes `"types"`) → server can `import { AVATARS, randomAvatarId } from '../../types/avatars.js';` (NodeNext requires `.js`).
- Client (`client/tsconfig.json` includes `"../types"`) → client can `import { AVATARS, type AvatarId } from '../../../types/avatars';` (no extension; bundler resolves).

Both sides see the same source file; no duplication. `manifest.ts` lives client-side only because it imports the actual WebP URLs (which the server has no use for).

**Pitfall:** if `types/avatars.ts` ever imports anything non-trivial (e.g. a fs lookup), it'll break the client bundle. Keep it pure: just `export const AVATARS` + `export type AvatarId` + `export function randomAvatarId()`. No I/O.

### Q9 — Tier color readability for High Stakes

Both `--color-action-allin` (`#ff6d00` orange) and `--color-action-fold` (`#ff4757` red) are saturated, high-contrast against the dark background. Practical recommendation: **use `--color-action-fold` (red) for High Stakes**.

Reasoning:
- Pro tier already uses `--color-action-raise` (amber). Orange (allin) is hue-adjacent to amber and harder to distinguish on a section header glance, especially on small mobile screens.
- Red unambiguously signals "highest stakes / highest stakes risk", which matches user intuition for the High Stakes label.
- Red is reserved in Neon Strip for "fold" semantically, but tier color usage is a different context (informational header, not actionable button), so cross-purposing is acceptable.

[ASSUMED — visual judgement; planner should verify against rendered prototype before locking.] Confidence: MEDIUM. If executor finds amber/orange contrast acceptable in practice, switch to `allin`.

### Q10 — `SeatsDisplay` avatar resolver integration

[VERIFIED: `client/src/components/SeatsDisplay.tsx:137-175, 332-337, 463-469`] Current `Avatar` component takes `avatarUrl?: string`; if present, renders `<img src={avatarUrl}>`, else falls back to initial letter. Players carry `avatarUrl` on the `Player` interface (`types/index.ts:13`).

**Migration:**
1. Add `avatarId?: string` to `Player` in `types/index.ts` alongside `avatarUrl` (don't remove `avatarUrl` yet — server seat broadcaster needs to populate `avatarId` first).
2. Server's seat→Player projection (find in `server/Game.ts` / `server/index.ts` where the broadcast `Player` is built; not exhaustively read in this research) must populate `avatarId` from the `User.avatarId` column.
3. In `SeatsDisplay.tsx`, replace the prop call site:
   ```typescript
   import { avatarUrl as resolveAvatar } from '../assets/avatars/manifest';
   // …
   <Avatar
     initial={initial}
     size={avatarSize}
     isActive={isActive}
     avatarUrl={resolveAvatar(player.avatarId as AvatarId | undefined)}
   />
   ```
4. Once everything renders correctly from `avatarId`, remove `Player.avatarUrl` and stop populating it server-side.

`useTelegram.ts` `photo_url` is currently surfaced via `currentUser.photoUrl` / `currentUser.avatarUrl` (`App.tsx:230-236`). After this phase, `MainMenu` and `Profile` views resolve avatars exclusively via `avatarUrl(currentUser.avatarId)`. The Telegram `photo_url` is dropped from rendering (per D-15).

## Runtime State Inventory

This is **NOT** a rename/refactor phase, but it does add data and there are runtime considerations worth flagging:

| Category | Items found | Action |
|----------|-------------|--------|
| Stored data | Existing users have `avatarId = NULL` (column added in v1_mvp_launch but never populated) | One-time backfill: on first `findOrCreate` for an existing user, if `avatarId == null`, assign random and persist (additive, atomic). Could also be a one-shot SQL migration; `findOrCreate` is sufficient. |
| Live service config | None — no n8n/Datadog/Tailscale on this project | None — verified by reading `package.json`, `docker-compose.yml`. |
| OS-registered state | None — single Node process, no Task Scheduler | None. |
| Secrets/env vars | No new secrets. `BOT_TOKEN`, `DATABASE_URL` unchanged. | None. |
| Build artifacts | Vite hashes new WebPs cleanly; `dist/` build artifacts will include them after `cd client && npm run build` | None — clean rebuild. |

**Key implication:** Existing users (created before D-12 ships) will have `avatarId = NULL`. The `findOrCreate` path handles new users; for existing users, add the same `randomAvatarId()` assignment inside the `else` branch when `user.avatarId == null` (idempotent). This avoids needing a separate migration script.

## Common Pitfalls

### Pitfall 1: NodeNext `.js` extension on server-side import
**What goes wrong:** `import { AVATARS } from '../../types/avatars'` works in TS source but fails at runtime in the compiled `dist/` because Node resolves the literal path.
**Why:** `tsconfig.json` uses `module: NodeNext`, which preserves import strings verbatim.
**Avoid:** Always write `from '../../types/avatars.js'` in server code. [VERIFIED: `server/db/UserRepository.ts:1-3` does this for `prisma.js`, `nameGenerator.js`, `index.js`.]

### Pitfall 2: Vite static analysis of `new URL(…)`
**What goes wrong:** `new URL(`./avatars/${slug}.webp`, import.meta.url)` does NOT get hashed — Vite can't statically determine which files to emit, returns dev-mode URL that 404s in prod build.
**Avoid:** Always use string literal: `new URL('./fox.webp', import.meta.url)`. Build the full `Record<AvatarId, string>` literally as in Pattern 3, OR use `import.meta.glob('./*.webp', { eager: true, query: '?url', import: 'default' })`.

### Pitfall 3: `setHeaderColor('#2481cc')` clashing with dark UI
**What goes wrong:** Telegram bot chrome stays bright blue while the redesigned app is Neon-dark.
**Avoid:** Replace `setHeaderColor('#2481cc')` everywhere (`App.tsx:109`, `MainMenu.tsx:36`, `TableList.tsx:15`) with a dark Neon-Strip-compatible color. Add the value as a token in `neon.css` (e.g. `--color-surface-base: #0a0a0e`) for consistency. [VERIFIED: 3 call sites grep'd in code reads above.]

### Pitfall 4: Defense-in-depth consent gate
**What goes wrong:** A future code change accidentally calls `setView('menu')` for an unaccepted user (e.g. on profile-update echo), bypassing the gate set in `authSuccess`.
**Avoid:** Add the top-of-render guard described in Q5 (`if (currentUser && !currentUser.tosAcceptedAt && view !== 'consent' && !view.startsWith('legal-')) return <Consent />;`). Single-source enforcement instead of relying on every setView call site.

### Pitfall 5: Picker instant-save vs. Confirm button
**What goes wrong:** Tapping a tile emits `updateAvatar` immediately → user fat-fingers a different animal and is now committed.
**Avoid:** D-13 mandates explicit Confirm. State pattern: `const [pendingAvatar, setPending] = useState(currentUser.avatarId); const onTap = (id) => setPending(id); const onConfirm = () => socket.emit('updateAvatar', { avatarId: pendingAvatar });`. Disable Confirm if `pendingAvatar === currentUser.avatarId`.

### Pitfall 6: ToS accept event payload schema
**What goes wrong:** Server validates a missing `tosVersion` field and rejects.
**Avoid:** Define the new event explicitly in `types/index.ts` extension:
```typescript
// add to ExtendedClientEvents:
acceptTos: (payload: { version: string }) => void;
updateAvatar: (payload: { avatarId: AvatarId }) => void;
// add to ExtendedServerEvents:
tosAccepted: (payload: { tosAcceptedAt: string; tosVersion: string }) => void;
avatarUpdated: (payload: { avatarId: AvatarId }) => void;
```
Both follow the existing request/ack pattern of `claimDailyBonus` + `dailyBonusClaimed`.

### Pitfall 7: Tailwind v4 class generation for new tokens
**What goes wrong:** Adding a new token to `@theme` (e.g. `--color-surface-base`) doesn't auto-generate utilities until Vite restart.
**Avoid:** After modifying `neon.css`, restart `cd client && npm run dev`. Tailwind v4 file watcher catches CSS changes but a hard restart is the safe path.

## Code Examples

### Example 1: `Card` primitive

```typescript
// client/src/components/ui/Card.tsx
import { VARIANT_TIER, type ActionTier } from './tokens';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: ActionTier;        // omitted = neutral border
  glow?: boolean;
}

export const Card: React.FC<CardProps> = ({ variant = 'neutral', glow, children, style, ...rest }) => {
  const t = VARIANT_TIER[variant];
  return (
    <div
      {...rest}
      style={{
        background: 'rgba(10,10,14,0.88)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1.5px solid color-mix(in srgb, ${t.color} 38%, transparent)`,
        borderRadius: 14,
        padding: 16,
        boxShadow: glow ? `0 0 18px ${t.glow}` : 'none',
        ...style,
      }}
    >
      {children}
    </div>
  );
};
```

### Example 2: Consent component skeleton

```typescript
// client/src/pages/Consent.tsx
import { useState } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

interface Props {
  socket: Socket<ExtendedServerEvents, ExtendedClientEvents>;
  onAccept: () => void;
  onViewLegal: (which: 'tos' | 'privacy' | 'rg') => void;
}

export const Consent: React.FC<Props> = ({ socket, onAccept, onViewLegal }) => {
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleAccept = () => {
    setSubmitting(true);
    socket.emit('acceptTos', { version: '1.0' });
    socket.once('tosAccepted', () => { setSubmitting(false); onAccept(); });
  };

  return (
    <div style={{ minHeight: '100vh', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card variant="active">
        <h1 style={{ color: 'var(--color-active)' }}>Welcome to NightRiver</h1>
        <p style={{ color: '#fff' }}>Before you play, please review and accept:</p>
        <ul>
          <li><a onClick={() => onViewLegal('tos')}>Terms of Service</a></li>
          <li><a onClick={() => onViewLegal('privacy')}>Privacy Policy</a></li>
          <li><a onClick={() => onViewLegal('rg')}>Responsible Gaming</a></li>
        </ul>
        <label style={{ color: '#fff', display: 'flex', gap: 8 }}>
          <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
          I agree to the Terms, Privacy Policy, and Responsible Gaming guidelines
        </label>
        <Button variant="active" emphasis disabled={!agreed || submitting} onClick={handleAccept}>
          {submitting ? 'Saving…' : 'Accept'}
        </Button>
      </Card>
    </div>
  );
};
```

### Example 3: Avatar picker grid (4×5)

```typescript
// inside ProfileSettings.tsx — Avatar tab
import { AVATARS, type AvatarId } from '../assets/avatars/manifest';
import { avatarUrl } from '../assets/avatars/manifest';
import { Button } from '../components/ui/Button';

const [pending, setPending] = useState<AvatarId>(currentAvatarId);
const dirty = pending !== currentAvatarId;

return (
  <div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
      {AVATARS.map((id) => (
        <button
          key={id}
          onClick={() => setPending(id)}
          style={{
            aspectRatio: '1',
            borderRadius: 14,
            background: 'rgba(10,10,14,0.85)',
            border: `1.5px solid ${
              pending === id
                ? 'color-mix(in srgb, var(--color-active) 56%, transparent)'
                : 'rgba(176,190,197,0.18)'
            }`,
            boxShadow: pending === id ? '0 0 16px var(--glow-call), inset 0 0 8px var(--glow-call)' : 'none',
            cursor: 'pointer',
          }}
        >
          <img src={avatarUrl(id)} alt={id} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }} />
        </button>
      ))}
    </div>
    <Button variant="active" emphasis disabled={!dirty} onClick={() => socket.emit('updateAvatar', { avatarId: pending })}>
      Confirm
    </Button>
  </div>
);
```

## State of the Art

| Old approach | Current approach in this codebase | Notes |
|--------------|-----------------------------------|-------|
| `tailwind.config.js` color extension | Tailwind v4 `@theme` block in CSS | Already adopted in Phase 1. |
| Per-component `NEON` literal objects | CSS custom properties + `color-mix()` | Already adopted in Phase 1. |
| `react-router-dom` for SPA routing | `view: AppView` discriminated union in `App.tsx` | Project idiom; do not change. |
| URL-based asset paths in `public/` | Vite-hashed `new URL('./asset', import.meta.url)` from `src/assets/` | Standard Vite pattern. |
| Telegram `photo_url` for player avatars | Custom 20-WebP curated set, slug-keyed | This phase. |

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 | 256×256 WebP @ quality 80 yields 8-15 KB per file | Q3 | Total bundle weight could exceed informal Telegram budget; verify after first asset. |
| A2 | Telegram Mini App ~1 MB practical load budget | Q3 | If much smaller, downscale to 192×192. No published spec found. |
| A3 | High Stakes red is more readable than orange next to amber Pro | Q9 | Visual judgement; planner should eyeball rendered prototype. |
| A4 | Telegram WebApp ignores `<link rel="icon">` for in-app header | Q7 | If Telegram does honor it, no harm — favicon is set anyway. |
| A5 | All existing users' `avatarId IS NULL` (column added but never populated by Phase 1) | Runtime State | If Phase 1 already populated it, the backfill is a no-op (idempotent — safe). |

**No claim about settled decisions D-01..D-30 needs user re-confirmation.** All assumptions above are about implementation tactics, not phase scope.

## Open Questions (RESOLVED)

1. **Telegram bot avatar sync.** Bot's profile avatar in Telegram is set via BotFather, independent of the Mini App. Should the executor also update BotFather's avatar to match the new logo for brand consistency? **Recommendation:** Out of scope for Phase 2 — flag for the human after logo ships.

2. **Splash screen during Mini App load.** Currently the loading view (`App.tsx:308-315`) shows a generic spinner. Should it show the new logo? **Recommendation:** Yes — trivially swap the spinner for an `<img src={logoUrl}>` once logo asset exists. Counts under D-25 chrome work.

3. **Player.avatarId broadcast wiring.** Server's `Player` projection (built somewhere in `server/Game.ts` / `server/index.ts`, not exhaustively read here) needs to populate `avatarId` from the `User` row when broadcasting `GameState`. **Recommendation:** Plan this as an explicit task — find the seat→Player serializer and add the `avatarId` field. Without this, `SeatsDisplay` falls back to initial letters.

4. **Backfill timing for existing users.** D-12 covers new-user atomic assign. The `else` branch in `findOrCreate` (`server/db/UserRepository.ts:21-29`) does NOT currently set `avatarId`. **Recommendation:** Add idempotent backfill: `if (!user.avatarId) { user = await prisma.user.update({ where: { id: user.id }, data: { avatarId: randomAvatarId() } }); }`. Single UPDATE; no race because `User.id` lock is held implicitly.

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js 18+ | Build | ✓ (assumed; project compiles today) | n/a | — |
| Vite 5 | WebP hashing | ✓ | 5.3.0 | — |
| Tailwind v4 | `@theme` tokens | ✓ | 4.2.1 | — |
| Prisma 7 | `User.avatarId` field | ✓ | 7.4.2 | — |
| Image generation tooling (executor agent capability) | 20 WebP avatars + logo | ⚠ depends on executor's available MCP tools | n/a | If image MCP unavailable, executor must request user provide assets OR generate vector SVG fallbacks |

**Missing dependencies with no fallback:** None at the codebase level. The only soft dependency is the executor's image-generation capability — flag in plan that the avatar-generation task may need to ask the user for help if no MCP image tool is available.

## Validation Architecture

> Skipped — Phase 6 (TEST-01..TEST-04) is the sole test-infrastructure phase per ROADMAP.md. Phase 2 ships UI without a co-located test suite; tests are added in Phase 6 against the prod-like Vite build. Plan-check should not require co-located `*.test.tsx` files for Phase 2 tasks.

Manual validation per task:
- **Per task commit:** `cd client && npm run build` — must succeed.
- **Per wave merge:** Manual smoke in Telegram dev mode (`?player=1` URL trick, see `App.tsx:37-61`).
- **Phase gate:** Manual checklist against the 5 success criteria in ROADMAP.md Phase 2.

## Security Domain

> `security_enforcement` is not explicitly set in `.planning/config.json`; treating as enabled (default).

### Applicable ASVS categories

| ASVS | Applies | Standard control in this codebase |
|------|---------|-----------------------------------|
| V2 Authentication | yes (touched indirectly) | Existing Telegram `initData` HMAC validation in `server/middleware/auth.ts` (Phase 1 hardened). Phase 2 does not modify auth. |
| V3 Session Management | no | No session changes; Phase 2 reads `currentUser` from auth. |
| V4 Access Control | yes (consent gate) | **Phase 2 gate is client-side only by design (D-28).** Server-side `joinTable` ToS rejection is COMPLIANCE-04 / Phase 5. This is an *accepted* gap, documented in ROADMAP and CONTEXT. |
| V5 Input Validation | yes | New socket events `acceptTos { version }` and `updateAvatar { avatarId }` MUST validate server-side: `version` is non-empty string ≤ 16 chars; `avatarId` is one of `AVATARS`. Reject and log otherwise. |
| V6 Cryptography | no | No new crypto. |

### Known threat patterns for this stack

| Pattern | STRIDE | Mitigation |
|---------|--------|------------|
| Forged `acceptTos` from un-authed socket | Spoofing | Server handler must require `socket.data.telegramId` populated (auth happened); reject otherwise. Same as existing `updateProfile` handler. |
| `updateAvatar` with arbitrary string slug | Tampering | Validate `payload.avatarId` ∈ `AVATARS` server-side before persisting. Slug is the unique key — accepting unknown values would leave dangling state. |
| ToS bypass via direct socket emit | Elevation of privilege | Out of scope this phase by D-28; documented as Phase 5 work (COMPLIANCE-04). |
| XSS via display name in legal/consent pages | Tampering | All user-rendered names already pass through React's auto-escaping (`{displayName}` interpolation). No `dangerouslySetInnerHTML` introduced. |
| Avatar URL injection | Tampering | We no longer render arbitrary `avatarUrl` strings — only manifest-resolved hashed URLs. Eliminates the class of issue. |

## Sources

### Primary (HIGH confidence)
- `client/src/styles/neon.css` — token inventory verified line-by-line
- `client/src/App.tsx` — view-union routing pattern verified
- `client/src/components/SeatsDisplay.tsx` — Avatar component, manifest integration point
- `client/src/components/GameControls.tsx` — Button primitive reference implementation
- `server/db/UserRepository.ts` — `findOrCreate` and `mapToTelegramUser` paths verified
- `prisma/schema.prisma` — `User.avatarId`, `tosAcceptedAt`, `tosVersion` columns confirmed
- `types/index.ts` — `TelegramUser`, `Player`, `ExtendedServerEvents` shapes confirmed
- `client/index.html` — current `<head>` inventory
- `client/package.json` + `package.json` — dependency versions
- `tsconfig.json` + `client/tsconfig.json` — module resolution constraints
- `.planning/codebase/CONVENTIONS.md`, `STACK.md` — project conventions
- `.planning/phases/01-foundations-design-system/01-01-SUMMARY.md` — Phase 1 token delivery confirmation
- `CLAUDE.md` — Neon Strip spec and project guardrails

### Secondary (MEDIUM confidence)
- Tailwind v4 `@theme` → utility class auto-generation behavior [CITED: tailwindcss.com/docs/theme]
- Vite static asset handling via `new URL('./file', import.meta.url)` [CITED: vite.dev/guide/assets.html]

### Tertiary / assumed (LOW confidence)
- WebP file size estimates for 256×256 portrait avatars (Pitfall section A1, A2)
- Telegram Mini App practical load budget (~1 MB) — informal community knowledge
- Tier color readability judgement for High Stakes (Q9 / A3)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions read from package.json, no new deps added
- Architecture: HIGH — Phase 1 substrate fully understood, all integration points verified in source
- Pitfalls: HIGH — every pitfall traced to a specific code line
- Avatar asset weight estimates: LOW (assumed, verify after first generation)
- Tier color choice for High Stakes: MEDIUM (judgement call, easy to flip)

**Research date:** 2026-04-16
**Valid until:** ~2026-05-16 (30 days; no fast-moving deps in scope)
