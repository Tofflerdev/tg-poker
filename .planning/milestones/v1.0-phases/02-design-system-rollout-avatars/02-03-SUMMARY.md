---
gsd_summary_version: 1.0
phase: 02-design-system-rollout-avatars
plan: 03
subsystem: branding
tags: [branding, logo, favicon, manifest, telegram-chrome, neon-strip]
requires: [phase-01 complete, --color-surface-base token in neon.css (Plan 02-01)]
provides:
  - "client/src/assets/logo.svg: primary 512x128 icon + wordmark composite ready for Plan 04 Main Menu header import"
  - "client/public/favicon.svg: icon-only 64x64 rounded-square favicon (modern browsers honor <link rel='icon' type='image/svg+xml'>)"
  - "client/public/manifest.webmanifest: web manifest declaring name=NightRiver, theme/background #0a0a0e, SVG + 192 PNG icons, display=standalone"
  - "client/index.html: title 'NightRiver — Poker' (BRAND-01), theme-color #0a0a0e, color-scheme dark, three <link> tags for icon/apple-touch/manifest"
  - "Zero occurrences of Telegram-blue '#2481cc' anywhere in client/ (setHeaderColor calls + CSS fallback defaults all migrated to '#0a0a0e')"
affects:
  - "client/src/App.tsx (setHeaderColor + setBackgroundColor call site)"
  - "client/src/pages/MainMenu.tsx (setHeaderColor call site + one CSS fallback in pre-redesign styles)"
  - "client/src/pages/TableList.tsx (setHeaderColor call site + one CSS fallback in pre-redesign styles)"
  - "client/src/pages/ProfileSettings.tsx (two CSS fallback defaults in pre-redesign styles)"
  - "client/src/styles/telegram.css (two fallback hex values in :root token layer)"
tech-stack:
  added: []
  patterns:
    - "Hand-authored SVG logo — neon-rim strokes + gradient river sweep + SVG glow filters (feGaussianBlur + feMerge) matching Neon Strip glow vocabulary"
    - "Dual favicon pattern: image/svg+xml (modern) + image/x-icon (legacy) with svg listed first so it wins when both are available"
    - "Telegram WebApp API hex-literal exception to D-06: setHeaderColor takes a string, so the hex is duplicated in code with a comment tying it to --color-surface-base"
key-files:
  created:
    - "client/src/assets/logo.svg"
    - "client/public/favicon.svg"
    - "client/public/manifest.webmanifest"
  modified:
    - "client/index.html"
    - "client/src/App.tsx"
    - "client/src/pages/MainMenu.tsx"
    - "client/src/pages/TableList.tsx"
    - "client/src/pages/ProfileSettings.tsx"
    - "client/src/styles/telegram.css"
decisions:
  - "Logo asset strategy: hand-authored SVG as primary deliverable; PNG 192 and ICO 32 deferred (no image-rasterization tooling in this executor env — same pattern as Plan 02-02 WebP gap)"
  - "Added favicon.svg alongside the .ico slot so modern browsers get a working icon immediately; .ico gap is documented but not blocking (Telegram WebApp uses BotFather avatar for its chrome, not the site favicon — research Q7)"
  - "Scope of #2481cc purge extended beyond the 3 setHeaderColor call sites to include ALL CSS fallback defaults (telegram.css base tokens + four var(--tg-theme-*, #2481cc) fallbacks in pre-redesign page styles) to satisfy the plan's verify criterion ('grep -rn #2481cc must return zero'). Those pages are wholesale redesigned in Plans 04/05/06; this change only affects the fallback when Telegram theme vars are absent."
  - "setHeaderColor + setBackgroundColor both migrated to '#0a0a0e' (App.tsx — plan only specified setHeaderColor but setBackgroundColor was passing '#f1f1f1' bright grey against the dark app; Rule 1 auto-fix)"
  - "--color-surface-base in neon.css left untouched — Plan 02-01 already added it; plan-checker FLAG-6 acknowledged in prompt notes"
metrics:
  duration_sec: ~900
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 6
  commits: 2
  completed_at: "2026-04-16"
---

# Phase 02 Plan 03: Branding & Logo Summary

Shipped the NightRiver brand substrate end-to-end: primary SVG logo (icon + wordmark composite) ready for Plan 04's Main Menu header, icon-only SVG favicon for modern browsers, web manifest declaring the app identity, updated `<head>` wiring in `index.html`, and a full purge of Telegram-blue `#2481cc` everywhere in `client/` — setHeaderColor calls and every CSS fallback default — all migrated to the Neon Strip dark surface `#0a0a0e`. PNG 192 and ICO 32 raster assets could not be generated in this executor env (no image-rasterization tooling) and are tracked as deferred; the SVG primary works in every modern browser and the in-app logo is the real deliverable for Plan 04.

## Import path for Plan 04 (copy verbatim)

```typescript
import logoUrl from '../assets/logo.svg';
// or, from within pages/:
import logoUrl from '../assets/logo.svg';
```

Rendering on the Main Menu header:
```tsx
<img src={logoUrl} alt="NightRiver" style={{ height: 40 }} />
```

Vite will emit it as `dist/assets/logo-<hash>.svg` the first time a module imports it. The SVG viewBox is `0 0 512 128` (4:1 aspect) so constraining via `height` scales the wordmark cleanly; `width: 'auto'` (CSS default) keeps proportions.

## Logo design notes

- **Style:** Neon Strip — dark surface (transparent bg for in-app composability), cyan (#00e5ff) + amber (#ffab00) accents, SVG glow filters using `feGaussianBlur + feMerge` to echo the `box-shadow` glow vocabulary established in Phase 1.
- **Icon mark:** crescent moon with a spade silhouette cut out (via SVG `mask`), floating above a two-stroke river sweep with a gradient stop. Three small amber dots on the river echo the amber chip-count text-shadow used in `SeatsDisplay.tsx`.
- **Wordmark:** "Night" in cyan-tinted off-white (#e0f7fa), "River" in amber (#ffab00) — amber mirrors the chip-count color used everywhere chips/stack are rendered, giving subtle brand-game continuity. Thin cyan GlowBar underline (two `<rect>` stacked, echoing the `GlowBar` pattern in `GameControls.tsx`).
- **Sizing:** viewBox `0 0 512 128` (4:1 aspect), non-stretched; legible scaling from ~320px wide down to ~128px wide. Below that, use the icon-only `favicon.svg`.

## `--color-surface-base` note

Already present in `client/src/styles/neon.css` (added by Plan 02-01). This plan did NOT re-add it; plan-checker FLAG-6 in the orchestrator prompt was honored. The hex literal `#0a0a0e` used by `setHeaderColor()` call sites matches this token's value — a documented D-06 exception because the Telegram WebApp API accepts a literal string, not a CSS var reference.

## File inventory

| File | Size | Purpose |
|------|------|---------|
| client/src/assets/logo.svg | 4050 B | Primary in-app logo (icon + wordmark), Vite-hashed when imported |
| client/public/favicon.svg | 1153 B | Icon-only favicon for modern browsers, served at /favicon.svg |
| client/public/manifest.webmanifest | 461 B | Web app manifest (name, theme, icons) |
| client/index.html | 794 B | Updated `<head>` with title, theme-color, 3 `<link>` tags |

## Deviations from Plan

### Rule 1 — Bug: setBackgroundColor was passing '#f1f1f1' (bright grey)

**Found during:** Task 2.
**Issue:** `App.tsx` set `setBackgroundColor('#f1f1f1')` right next to `setHeaderColor('#2481cc')`. Plan verify only called out setHeaderColor, but leaving bright-grey background against a dark Neon Strip UI would be the same Telegram-chrome/app-UI mismatch the plan was trying to fix, just on a different axis.
**Fix:** Updated both `setHeaderColor` and `setBackgroundColor` in App.tsx to `'#0a0a0e'`. One-line change; keeps Telegram chrome consistent.
**Files modified:** `client/src/App.tsx`.
**Commit:** 90d3e9c.

### Rule 1 — Scope extension: CSS fallback hex defaults also purged

**Found during:** Task 2 grep verification.
**Issue:** After updating the 3 `setHeaderColor` call sites, `grep -rn '#2481cc' client/src client/index.html` still returned 6 matches: two in `telegram.css` base tokens, one in each of `MainMenu.tsx` / `TableList.tsx`, and two in `ProfileSettings.tsx`. All six are CSS fallback defaults of the form `var(--tg-theme-*-color, #2481cc)` — they only fire when Telegram hasn't injected its theme var (e.g. when the app is opened outside Telegram). The plan's verify criterion explicitly demands zero `#2481cc` occurrences, so these fallbacks had to move.
**Fix:** Replaced all six with `#0a0a0e` (dark Neon Strip surface). Does not change runtime visuals inside Telegram (Telegram always injects its theme vars there); outside Telegram, the pages now default to dark instead of Telegram-blue — which matches the Neon Strip design direction anyway.
**Impact:** No functional regression; pages MainMenu/TableList/ProfileSettings are being wholesale redesigned in Plans 04/05/06, so the pre-redesign legacy styles these fallbacks belong to are transient.
**Files modified:** `client/src/styles/telegram.css`, `client/src/pages/MainMenu.tsx`, `client/src/pages/TableList.tsx`, `client/src/pages/ProfileSettings.tsx`.
**Commit:** 90d3e9c.

### Rule 2 — Added favicon.svg (not in the plan asset list)

**Found during:** Task 1.
**Issue:** Plan asset list names `favicon.ico` (raster) and `logo-192.png` (raster). Neither can be produced in this executor env — no image-rasterization tooling. Shipping only `logo.svg` would leave the `<link rel="icon">` slot pointing at a nonexistent file until a human supplies bytes.
**Fix:** Hand-authored `client/public/favicon.svg` — a simpler icon-only 64×64 SVG (rounded-square dark surface + cyan crescent moon + river sweep + amber dots). Modern browsers (Chrome, Firefox, Safari 12+, Edge) honor `<link rel="icon" type="image/svg+xml">` at any size, so the site gets a real favicon on first paint. `index.html` lists the svg link *before* the ico link so modern browsers pick svg first; older browsers fall through to the (still-missing) ico slot.
**Impact:** Gives the site a working favicon immediately; the `favicon.ico` raster is documented as a deferred gap but is no longer strictly blocking.
**Files modified:** `client/public/favicon.svg`, `client/index.html`, `client/public/manifest.webmanifest` (lists svg as the any-size icon).
**Commit:** 945f479.

## Deferred Issues

**1. `client/public/favicon.ico` (32×32 raster ICO) not generated.**
- **Status:** Legacy-browser gap only. Modern browsers use `favicon.svg` (shipped). The `<link rel="icon" type="image/x-icon" href="/favicon.ico">` tag is present in `index.html` as a fallback but the file itself is missing — legacy browsers (IE 11, very old Android WebView) will show a broken-icon placeholder when opening the Mini App directly. Telegram WebApp chrome uses the BotFather bot avatar, not the site favicon, so Telegram users are unaffected.
- **Unblocker:** rasterize `favicon.svg` to a 32×32 ICO (e.g. via ImageMagick: `magick favicon.svg -resize 32x32 favicon.ico`, or an online SVG→ICO converter). Place at `client/public/favicon.ico`. No code changes required after drop — the `<link>` is already wired.
- **Verification after drop:** `cd client && npm run build` — `dist/favicon.ico` should appear alongside `dist/favicon.svg`.

**2. `client/public/logo-192.png` (192×192 raster PNG) not generated.**
- **Status:** Apple-touch-icon + PWA splash gap. The `<link rel="apple-touch-icon">` tag and the manifest's 192 icon entry both point at this missing file. Apple devices (iOS Safari home-screen save, iPadOS) and PWA-install flows will fall back to lower-quality auto-generated icons until the file ships. Telegram Mini App chrome is unaffected (uses BotFather avatar).
- **Unblocker:** rasterize `logo.svg` (icon portion only, cropped to 0..128 of the viewBox) or `favicon.svg` to a 192×192 PNG on dark (#0a0a0e) background. E.g. `magick favicon.svg -resize 192x192 -background "#0a0a0e" -flatten logo-192.png`. Place at `client/public/logo-192.png`.
- **Verification after drop:** `cd client && npm run build` — `dist/logo-192.png` should appear. On iOS, "Add to Home Screen" should show the NightRiver icon crisp at 192.

**3. No change to `setHeaderColor("#1a472a")` in `GameRoom.tsx`.**
- **Status:** Intentional scope boundary. Plan 02-03 targets Telegram-**blue** `#2481cc` specifically; `GameRoom.tsx:38` uses `#1a472a` (dark poker-felt green) which is already a dark color, not blue. Game Room chrome redesign belongs to a later plan (D-24/D-25) and will revisit this call site wholesale.
- **Unblocker:** n/a — will be handled in Game Room chrome plan.

## Verification

- **`cd client && npm run build`:** ✅ exits 0; emits `dist/favicon.svg`, `dist/manifest.webmanifest`, `dist/index.html` (with updated title + links), hashed CSS + JS. The 20 WebP warnings are carried over from Plan 02-02 and are unrelated to this plan.
- **`grep -rn '#2481cc' client/src client/index.html`:** ✅ zero matches.
- **`client/index.html` `<title>`:** ✅ "NightRiver — Poker".
- **`client/index.html` `<meta name="theme-color">`:** ✅ `#0a0a0e`.
- **`client/index.html` three `<link>` tags:** ✅ icon (svg + ico), apple-touch-icon (192), manifest.
- **`client/public/manifest.webmanifest` valid JSON:** ✅ parses clean; name=NightRiver, theme/background #0a0a0e, svg+png icons, display=standalone.
- **`client/src/assets/logo.svg` exists:** ✅ 4050 B, well-formed XML, single `<svg>`/`</svg>` pair.
- **`client/public/favicon.svg` exists:** ✅ 1153 B, well-formed XML.
- **`client/public/favicon.ico`:** ❌ deferred — see Deferred Issue #1.
- **`client/public/logo-192.png`:** ❌ deferred — see Deferred Issue #2.
- **`setHeaderColor` migrated to `#0a0a0e` in 3 call sites:** ✅ App.tsx, MainMenu.tsx, TableList.tsx.
- **"tg-poker" / "Poker - Telegram Mini App" not in user-visible copy:** ✅ `grep -rn 'tg-poker\|Poker - Telegram Mini App' client/` returns no matches (index.html title updated; no other occurrences in `client/src/`).

## Known Stubs

None introduced by this plan. The `logo-192.png` and `favicon.ico` slots in `index.html` and the manifest are real wire-up referencing deferred files; they're tracked as asset gaps (Deferred Issues #1/#2) with clear unblocker commands, matching the Plan 02-02 WebP pattern.

## Self-Check

- `client/src/assets/logo.svg` FOUND (4050 B)
- `client/public/favicon.svg` FOUND (1153 B)
- `client/public/manifest.webmanifest` FOUND (461 B)
- `client/index.html` UPDATED (794 B; contains `NightRiver — Poker` + three link tags + theme-color #0a0a0e)
- Task 1 commit `945f479` FOUND
- Task 2 commit `90d3e9c` FOUND

## Self-Check: PASSED
