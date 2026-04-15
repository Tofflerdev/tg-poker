---
phase: 02-design-system-rollout-avatars
plan: 03
type: execute
wave: 1
depends_on: []
files_modified:
  - client/src/assets/logo.svg
  - client/public/favicon.ico
  - client/public/logo-192.png
  - client/public/manifest.webmanifest
  - client/index.html
  - client/src/styles/neon.css
autonomous: true
requirements: [BRAND-01, BRAND-02]
must_haves:
  truths:
    - "An SVG logo (icon + wordmark composite) lives at client/src/assets/logo.svg and is importable via Vite"
    - "A favicon.ico (32×32) and logo-192.png live in client/public/ and are referenced from index.html <head>"
    - "A web manifest at client/public/manifest.webmanifest declares name=NightRiver, theme_color matching Neon Strip dark surface"
    - "index.html <title> is 'NightRiver — Poker' (BRAND-01: NightRiver adopted as real name, not codename)"
    - "All current setHeaderColor('#2481cc') calls are replaced with the dark Neon-Strip-compatible color (--color-surface-base / hex equivalent)"
  artifacts:
    - path: "client/src/assets/logo.svg"
      provides: "Primary in-app logo (icon + wordmark composite) for Main Menu header"
    - path: "client/public/favicon.ico"
      provides: "32×32 browser favicon"
    - path: "client/public/logo-192.png"
      provides: "192×192 splash + apple-touch-icon"
    - path: "client/public/manifest.webmanifest"
      provides: "Web app manifest declaring NightRiver name, theme color, icons"
    - path: "client/index.html"
      provides: "<title>, <link rel=icon>, <link rel=apple-touch-icon>, <link rel=manifest>, theme-color meta updated to dark"
  key_links:
    - from: "client/index.html"
      to: "client/public/{favicon.ico,logo-192.png,manifest.webmanifest}"
      via: "<link rel=...> tags"
      pattern: "rel=\"(icon|apple-touch-icon|manifest)\""
    - from: "MainMenu (Plan 04 consumer)"
      to: "client/src/assets/logo.svg"
      via: "import logoUrl from '../assets/logo.svg'"
      pattern: "logo\\.svg"
---

<objective>
Generate the NightRiver logo + favicon + splash assets, wire them into `client/index.html` and the web manifest, fix the title, and replace every Telegram-blue `setHeaderColor('#2481cc')` call in the codebase with a dark Neon-Strip surface color.

Per D-01: BRAND-01 satisfied by adopting NightRiver as real name — no rename.
Per D-02 / D-03: assets generated this phase; planner specifies slots + brief, executor produces bytes.

Purpose: BRAND-01 + BRAND-02 in one focused chunk. Plan 04 (Main Menu redesign) imports `logoUrl` from `assets/logo.svg` for the header — substrate must exist first.

Output: Logo asset family + favicon + manifest + index.html updates + setHeaderColor cleanup. No page redesign work — Plans 04-07 own that.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/02-design-system-rollout-avatars/02-CONTEXT.md
@.planning/phases/02-design-system-rollout-avatars/02-RESEARCH.md
@client/index.html
@client/src/styles/neon.css
@client/src/App.tsx
@client/src/pages/MainMenu.tsx
@client/src/pages/TableList.tsx

<interfaces>
<!-- Current index.html <head> minimal: theme-color #1a1a1a (or similar), title="Poker - Telegram Mini App" -->
<!-- After this plan: -->
- <title>NightRiver — Poker</title>
- <meta name="theme-color" content="#0a0a0e">
- <link rel="icon" type="image/x-icon" href="/favicon.ico">
- <link rel="apple-touch-icon" sizes="192x192" href="/logo-192.png">
- <link rel="manifest" href="/manifest.webmanifest">

<!-- Web manifest schema -->
{
  "name": "NightRiver",
  "short_name": "NightRiver",
  "description": "Texas Hold'em poker — Telegram Mini App",
  "icons": [
    { "src": "/logo-192.png", "sizes": "192x192", "type": "image/png" }
  ],
  "theme_color": "#0a0a0e",
  "background_color": "#0a0a0e",
  "display": "standalone"
}

<!-- setHeaderColor replacement (RESEARCH Pitfall 3) -->
3 known call sites:
- client/src/App.tsx ~line 109
- client/src/pages/MainMenu.tsx ~line 36
- client/src/pages/TableList.tsx ~line 15

All currently pass '#2481cc' (Telegram blue). Replace with '#0a0a0e' (or `getComputedStyle(document.documentElement).getPropertyValue('--color-surface-base').trim()` if a CSS-token-driven approach is preferred — string literal is acceptable since Telegram WebApp API requires hex string).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Generate logo + favicon + splash assets</name>
  <files>client/src/assets/logo.svg, client/public/favicon.ico, client/public/logo-192.png</files>
  <action>
    Per D-02/D-03 generate the asset family. Brief:
    - **Style:** Neon Strip — dark background (#0a0a0e), neon-tinted glyph, cyan + amber accents, soft glow.
    - **Mark:** A river-curve motif crossed with a poker chip or playing-card silhouette — must read as poker AND "night river" (the brand). Symmetric, simple, readable at 32×32.
    - **Wordmark:** "NightRiver" — uppercase or title case, geometric sans, slight letter-spacing, cyan or off-white with subtle amber highlight.
    - **logo.svg** (PRIMARY): icon + wordmark composite, horizontal layout, ~512×128 viewBox, transparent background. This is the in-app Main Menu header asset.
    - **favicon.ico**: 32×32, icon-only (no wordmark — illegible at that size), dark background OK or transparent.
    - **logo-192.png**: 192×192, icon-only on dark background (#0a0a0e), used for apple-touch-icon AND splash.

    Use whatever image-generation MCP tool is available. If only a vector tool is available, hand-author the SVG and rasterize the PNG/ICO via available CLI (e.g., ImageMagick/sharp); if neither is available, ask the user to supply the binaries matching the brief and pause until provided. SVG is the primary deliverable — PNG/ICO can be rasterized from it.

    Place SVG under `client/src/assets/` (Vite will hash on build); place ICO + PNG + manifest under `client/public/` (served at root URL, RESEARCH Q7).
  </action>
  <verify>
    <automated>node -e "const fs = require('fs'); ['client/src/assets/logo.svg','client/public/favicon.ico','client/public/logo-192.png'].forEach(p => { if (!fs.existsSync(p) || fs.statSync(p).size < 100) { console.error('Missing/empty: ' + p); process.exit(1); } });"</automated>
  </verify>
  <done>logo.svg, favicon.ico, logo-192.png exist with non-trivial sizes; SVG opens cleanly in browser; PNG renders at 192px on dark background; ICO is valid (file utility shows MS Windows icon resource).</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Wire index.html + manifest + replace setHeaderColor calls</name>
  <files>client/index.html, client/public/manifest.webmanifest, client/src/App.tsx, client/src/pages/MainMenu.tsx, client/src/pages/TableList.tsx, client/src/styles/neon.css</files>
  <action>
    Update `client/index.html` `<head>`:
    - Set `<title>NightRiver — Poker</title>` (BRAND-01).
    - Update `<meta name="theme-color" content="#0a0a0e">` (replace Telegram blue if present).
    - Add `<link rel="icon" type="image/x-icon" href="/favicon.ico">`.
    - Add `<link rel="apple-touch-icon" sizes="192x192" href="/logo-192.png">`.
    - Add `<link rel="manifest" href="/manifest.webmanifest">`.

    Create `client/public/manifest.webmanifest` per the schema in `<interfaces>`.

    Replace `setHeaderColor('#2481cc')` calls (RESEARCH Pitfall 3 — 3 known sites: App.tsx ~109, MainMenu.tsx ~36, TableList.tsx ~15) with `setHeaderColor('#0a0a0e')`. Grep entire client/src/ for any other occurrences of '#2481cc' and replace identically. Same for `setBackgroundColor` if it uses Telegram blue — set to '#0a0a0e' to match the dark surface.

    In `client/src/styles/neon.css`: if Plan 01 already added `--color-surface-base: #0a0a0e` to @theme, leave it. If Plan 01 did not (parallel-wave race risk), add it here. The hex literal '#0a0a0e' in setHeaderColor calls is acceptable — Telegram WebApp API requires a literal string, not a CSS var.

    Per BRAND-01 also grep `client/src/` and `client/index.html` for occurrences of "tg-poker" or "Poker - Telegram Mini App" in user-visible copy and replace with "NightRiver" / "NightRiver — Poker" as appropriate. Do NOT rename the GitHub repo, package.json name, or directory paths — codebase identifier vs brand identifier are distinct.
  </action>
  <verify>
    <automated>cd client && npm run build && grep -rn "#2481cc" client/src client/index.html | grep -v node_modules</automated>
    <!-- Second grep should return zero matches; build must pass. -->
  </verify>
  <done>index.html has new title + 3 link tags + dark theme-color; manifest.webmanifest exists with correct fields; zero occurrences of '#2481cc' remain in client/src or index.html; client build succeeds and emits favicon.ico + logo-192.png + manifest.webmanifest into dist/.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| n/a | Static brand assets only — no input handling, no auth, no DB. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-03-01 | Tampering | Public asset URL forgery (someone hosts a malicious favicon mimicking ours) | accept | Out of our control; standard web brand spoofing risk; not a Phase 2 concern. |
</threat_model>

<verification>
- index.html `<head>` shows new title, theme-color #0a0a0e, three `<link rel="...">` tags pointing to /favicon.ico, /logo-192.png, /manifest.webmanifest.
- manifest.webmanifest is valid JSON, parses correctly.
- favicon.ico is a valid ICO, 32×32.
- logo.svg is valid SVG, scales legibly down to 24px.
- logo-192.png is 192×192 PNG.
- `grep -rn '#2481cc' client/src client/index.html` returns zero matches.
- `cd client && npm run build` succeeds.
</verification>

<success_criteria>
- BRAND-01: NightRiver name visible in title, manifest, and any updated UI copy strings.
- BRAND-02: SVG (primary) + PNG + ICO produced; PNG/ICO referenced from index.html; logo.svg ready for Main Menu consumption (Plan 04).
- Telegram chrome no longer flashes blue against the dark Neon Strip UI (D-25 / RESEARCH Pitfall 3).
</success_criteria>

<output>
After completion, create `.planning/phases/02-design-system-rollout-avatars/02-03-branding-logo/02-03-SUMMARY.md` documenting: asset file paths + sizes, the import path for `logo.svg` (so Plan 04 can copy it verbatim), and any note about whether `--color-surface-base` was added by this plan or Plan 01.
</output>
