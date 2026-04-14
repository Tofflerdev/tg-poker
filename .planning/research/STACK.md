# Stack Research — v1.0 MVP Additions

**Domain:** Telegram Mini App poker — brownfield feature additions
**Researched:** 2026-04-14
**Confidence:** HIGH (versions verified against npm/official sources 2026-04)
**Scope:** NEW stack only. Existing stack (Node/Express/Socket.io/React 18/Vite/Tailwind 4/Prisma 7/pokersolver) is validated and NOT re-researched.

---

## Recommended Stack Additions

### Core New Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `motion` (was `framer-motion`) | `^12.38.0` | Action-bubble popups, page transitions, seat-highlight micro-animations across the Neon Strip redesign | Rebranded from framer-motion in 2025; same API. React 18/19 compatible; declarative `AnimatePresence` is ideal for short-lived "Fold / Call N / Raise to N" bubbles that mount over seats and unmount after ~1.5s. Tree-shakeable `motion/react` import keeps Mini App bundle small. Industry standard for React animation in 2026. |
| `vitest` | `^4.1.4` | Unit + component test runner (per-element test files requirement) | Native Vite integration — the client already uses Vite 5.3, so Vitest reuses the same transform/ESM pipeline with zero extra config. Jest-compatible API. First-class TS support. Default React testing choice in 2026. |
| `@testing-library/react` | `^16.3.0` | Component DOM assertions (React 18 concurrent-safe) | RTL 16.x is the React 18/19 line; pairs with Vitest's `jsdom` environment. Enforces behavior-first testing, which fits the "one file per interactive element" spec. |
| `@testing-library/jest-dom` | `^6.6.3` | Custom matchers (`toBeInTheDocument`, `toHaveClass`, etc.) | Required for readable assertions in Neon-Strip style tests (checking border colors, glow classes, active/folded states). |
| `@testing-library/user-event` | `^14.5.2` | Realistic user interaction simulation | Click/tap/keyboard flows for GameControls, action buttons, seat joins. More accurate than `fireEvent` for touch-target tests. |
| `jsdom` | `^25.0.1` | Browser-like DOM for Vitest | Standard Vitest env for RTL. Lighter than `happy-dom` for components using `requestAnimationFrame` (motion/react needs it). |
| `@sentry/react` | `^10.48.0` | Client-side error tracking + session replay for reconnect/crash debugging | Sentry v10 is the active major line (all `@sentry/*` versioned together). Error Boundary integration, automatic React component stack traces, optional Replay for reproducing reconnect bugs. Free tier sufficient for MVP. |
| `@sentry/node` | `^10.48.0` | Server-side error tracking (Socket.io handler errors, Prisma failures, game-engine edge cases) | Version-locked with `@sentry/react`. Captures unhandled promise rejections in socket event handlers — critical for the crash-safety milestone. |
| `posthog-js` | `^1.200.0` | Anonymous product analytics (session length, hands played, table-selection funnel) | PostHog has generous free tier (1M events/mo), supports autocapture + custom events, and ships GDPR-friendly anonymous-mode. Better fit than Plausible for *product* analytics (funnels, retention) vs pure pageviews. Self-host later if needed; cloud start is fine for MVP. |
| `posthog-node` | `^4.18.0` | Server-side event capture (hand outcomes, admin actions, economy metrics) | Needed because Socket.io is the primary transport — many analytics events originate server-side (hand won, buy-in taken) where there is no pageview. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | `^3.23.8` | Runtime validation for admin-panel forms and socket payloads | Admin panel introduces free-form inputs (edit table params, grant balance, ban reasons). Zod schemas double as TS types via `z.infer`, reducing drift with `types/index.ts`. Also useful for validating stored `handHistory` JSON shape on read. |
| `react-hook-form` | `^7.53.0` | Admin-panel form state (edit table params, kick/ban dialogs, grant-balance) | Pairs with Zod via `@hookform/resolvers/zod`. Tiny (~25KB), uncontrolled-by-default — good performance for rapid admin edits. Overkill for the existing simple forms, so scope to admin panel only. |
| `@hookform/resolvers` | `^3.9.0` | Bridge Zod → react-hook-form | Required companion for the Zod+RHF pattern. |
| `clsx` | `^2.1.1` | Conditional className composition across Neon-Strip variants | Neon Strip has many conditional classes (active/folded/waiting/empty). `clsx` is 200 bytes and already idiomatic in Tailwind codebases. Alternative `classnames` is functionally equivalent but larger. |
| `date-fns` | `^4.1.0` | Hand-history timestamps, "last seen" in admin panel, daily-bonus countdowns | Tree-shakeable (import only `format`, `formatDistanceToNow`). Much smaller than moment. No need for the heavier `luxon` — we have no timezone math. |
| `recharts` | `^2.13.0` | Admin dashboards (live tables, users online, economy graphs) | Declarative React charts, sufficient for line/bar/area dashboards. Lighter than `visx` or `echarts`. Admin-only bundle so size is not user-facing. Lazy-load the admin route to keep it out of the main bundle. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `@vitest/ui` | Optional browser UI for running/debugging tests | Dev-dep only. Useful during the "per-element test file" push when many tests run in parallel. |
| `@vitest/coverage-v8` | Coverage reports | v8 provider is faster than istanbul; aligns with Node's native coverage. |
| `@sentry/vite-plugin` | Source-map upload at build time | Run in CI/build step so production stack traces are readable. Dev-dep. |

---

## Installation

```bash
# Client — animation + analytics + error tracking
cd client
npm install motion @sentry/react posthog-js clsx date-fns
npm install react-hook-form @hookform/resolvers zod  # admin panel only
npm install recharts                                  # admin dashboards

# Client — dev (testing)
npm install -D vitest @vitest/ui @vitest/coverage-v8 jsdom \
  @testing-library/react @testing-library/jest-dom @testing-library/user-event \
  @sentry/vite-plugin

# Server — error tracking + server-side analytics + validation
cd ..
npm install @sentry/node posthog-node zod
```

---

## Integration Points with Existing Stack

| New Piece | Integrates With | How |
|-----------|-----------------|-----|
| `motion/react` | `SeatsDisplay.tsx`, new `ActionBubble` component | Wrap bubbles in `<AnimatePresence>`; drive mount/unmount from `lastAction` fields pushed via existing `state` Socket.io event. Keep `NEON` color tokens; motion only handles transform/opacity. |
| Vitest + RTL | `client/src/components/*` | Co-locate `*.test.tsx` next to each component; set `test.environment: 'jsdom'` in `vite.config.ts` (reuse existing config with a `test` block). No separate Jest config. |
| Sentry React | `client/src/App.tsx` | Wrap root with `Sentry.ErrorBoundary`; init before `io(SOCKET_URL)` call so socket errors are captured. Use `Sentry.setUser({ id: telegramId })` after auth. |
| Sentry Node | `server/index.ts` | `Sentry.init()` at top of file; wrap Socket.io handlers in `try/catch` → `Sentry.captureException`. Add `Sentry.setContext("table", { tableId, seat })` in `handleGameAction`. |
| PostHog client | `client/src/App.tsx` | Init after Telegram auth; identify with `telegramId` hash (not raw — compliance). Autocapture off; explicit `posthog.capture("hand_joined", …)`. |
| PostHog server | `server/Game.ts` callbacks (`onShowdown`) | Emit `hand_played`, `pot_awarded` events from the socket layer (not `Game.ts` — keep engine pure). Server events carry authoritative numbers. |
| Zod schemas | `types/index.ts` | Add `schemas/` next to types; derive TS types with `z.infer`. Validate admin-panel socket payloads server-side before applying. |
| Hand history | Prisma `User` model | Add `HandHistory` table (new Prisma model) — `userId`, `tableId`, `handId`, `result`, `delta`, `holeCards`, `board`, `playedAt`. Keep last N per user, truncate older. Writes fired from `onShowdown` callback in `server/index.ts`. |
| Reconnect state | Prisma `User` model | Add columns: `currentTableId String?`, `currentChips Int?`. Updated on join/leave/showdown. On socket reconnect, client sends `reconnect` event → server looks up, re-seats, re-sends `state` with hole cards. |

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `motion` (framer-motion) | `react-spring` | If we needed physics-based gestures (drag, swipe). We don't — bubbles are simple mount/unmount with spring tweens. |
| `motion` | CSS + Tailwind `transition` only | For the simplest bubble case this works, but `AnimatePresence` is required to animate *on unmount* — CSS can't. Already a keyframe mix (`seat-glow-pulse`, `empty-seat-breathe`); motion unifies the remaining imperative animations. |
| Vitest | Jest | Only if we had no Vite. We do — Vitest reuses the transform pipeline, saving config and CI time. |
| `@testing-library/react` 16 | `@testing-library/react` 15 | RTL 15 is for React <18. Not applicable. |
| Sentry | Rollbar / Bugsnag / self-hosted GlitchTip | GlitchTip if we wanted self-host (API-compatible with Sentry); defer until scale demands it. Rollbar/Bugsnag have smaller React ecosystems. |
| PostHog | Plausible | Plausible if we only needed pageview counts. We want *funnels* (menu → table list → sit → first hand) and *retention*, which Plausible does not cover. |
| PostHog | Umami, Mixpanel | Umami lacks funnels/session-replay. Mixpanel has no free tier suitable for MVP. |
| `recharts` | `visx`, `echarts-for-react`, `nivo` | visx is lower-level (more custom work). echarts bundle is huge. recharts is the 80/20 pick for admin dashboards. |
| `zod` | `yup`, `valibot`, `io-ts` | valibot is lighter but less React-Hook-Form tooling. Zod is default in 2026 TS stacks. |
| `date-fns` | `dayjs`, `luxon` | dayjs is plugin-heavy; luxon is overkill without timezones. |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Redux / Zustand / Jotai** | Existing `App.tsx` state model (single `gameState` replaced wholesale by server events) works fine for a server-authoritative game. A global store is extra surface area. | Continue with React `useState` + prop drilling / small context for auth. |
| **React Router** | Current view-state machine (`loading → auth → menu → tables → game | profile`) is string-driven and trivial. Adding Router means hash-routing inside Telegram WebView — unnecessary friction. | Keep the existing state-machine. Admin panel can be a separate view key (`?admin=1`). |
| **React Query / SWR** | Socket.io is the transport for *all* live data. There are no REST fetch loops to cache. | Keep the single socket as the data source. |
| **Storybook** | Per-element Vitest+RTL tests already cover component surface. Storybook adds CI/build overhead and a second render pipeline. | Use Vitest's `@vitest/ui` for iterative component debugging. |
| **Jest** | Dual test runners = wasted config. | Vitest only. |
| **Moment.js** | Deprecated; huge bundle. | `date-fns`. |
| **Lodash (full)** | Most modern needs covered by native ES. | Cherry-pick `lodash-es/*` only if a specific helper is needed. |
| **Payment SDKs** (Stripe, Telegram Payments) | Deposit is a *stub* this cycle. | Static "coming soon" page. |
| **Socket.io Redis adapter** | Single-process deployment this cycle. | Revisit when horizontal scaling is in scope. |
| **Helmet / express-rate-limit** at app level | Not explicitly in MVP scope, but trivial once deploy cycle starts — not this cycle's problem. | Note for future infra milestone. |

---

## Stack Patterns by Feature

**Action bubbles:**
- `motion/react` `<AnimatePresence>` with `mode="popLayout"`
- Keyed by `playerId + actionSeq` so successive actions replace cleanly
- Positioned absolutely over each seat using the existing `SEAT_POSITIONS_*` arrays
- Auto-dismiss at ~1500ms via `useEffect(setTimeout)` or motion's `onAnimationComplete`

**Reconnect logic:**
- Client: Socket.io `reconnection: true` (default); on `connect` after auth, emit `rejoin` with `telegramId`
- Server: Look up `User.currentTableId` + `currentChips`; call `tableManager.joinTable(tableId, savedSeat, savedChips)`; re-send personalized `state`
- Prisma: Add nullable `currentTableId` + `currentChips` fields; written in `joinTable`/`leaveTable`/`onShowdown`

**Crash safety:**
- Same Prisma fields above
- On server boot, optional reconciliation: for each `User` with `currentTableId`, attempt re-seat (else clear)

**Admin panel:**
- Hidden route (`?admin=<secret>` or Telegram ID allowlist in env)
- Lazy-loaded chunk — keeps recharts + react-hook-form out of the main bundle
- Admin actions are new Socket.io events (`admin:toggleTable`, `admin:editParams`, `admin:kick`, `admin:grantBalance`); each validated with Zod, authorized via `isAdmin(telegramId)`, logged to Sentry + PostHog

**Hand history:**
- New Prisma `HandHistory` model — rows inserted from `onShowdown` (server/index.ts)
- Trim to last N (e.g. 100) per user via a Prisma `deleteMany` guard, or configurable
- Profile page fetches via new socket event `profile:handHistory`

**UI tests (per-element):**
- File layout: `client/src/components/GameControls/FoldButton.test.tsx` etc.
- Each test renders in isolation, asserts Neon Strip classes, click/keyboard behavior, disabled/active states
- `vitest.config.ts` with `test.environment: 'jsdom'`, `test.setupFiles: ['./src/test/setup.ts']` (imports `@testing-library/jest-dom`)

**Observability:**
- Client: `Sentry.init({ dsn, integrations: [Sentry.replayIntegration({ maskAllText: true })] })` — mask PII for Telegram users
- Server: `Sentry.init({ dsn, tracesSampleRate: 0.1 })`
- PostHog events named in `screaming_snake_case` (`HAND_STARTED`, `TABLE_JOINED`, `DEPOSIT_STUB_CLICKED`)

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `motion@12` | React 18+, React 19 | Drop-in for existing `framer-motion` imports; change path to `motion/react`. |
| `@testing-library/react@16` | React 18, 19 | React 18.2 (current) is supported. |
| `vitest@4` | Vite 5.x, Vite 6.x, Node 18+ | Works with existing Vite 5.3. |
| `@sentry/react@10` | React 16.14+ | Fine with React 18.2. Requires `@sentry/node@10` on server (lockstep majors). |
| `recharts@2.13` | React 16.8+ | Compatible with React 18. Recharts 3.x is in beta — stick with 2.x. |
| `posthog-js@1.200` | Any modern browser | No React version coupling. |
| `zod@3.23` | TypeScript 4.5+ | Current server TS 5.9 / client TS 5.1 both fine. (Zod 4 is out but ecosystem like `@hookform/resolvers` still default to 3; upgrade path is non-breaking later.) |

---

## Sources

- [motion (framer-motion) on npm](https://www.npmjs.com/package/framer-motion) — v12.38.0 current, React 18/19 supported (HIGH)
- [Motion upgrade guide](https://motion.dev/docs/react-upgrade-guide) — rename from framer-motion confirmed (HIGH)
- [@sentry/react on npm](https://www.npmjs.com/package/@sentry/react) — v10.48.0 current, all `@sentry/*` version-locked (HIGH)
- [Vitest on npm](https://vitest.dev/) — v4.1.4 current, default React test runner 2026 (HIGH)
- [PostHog 2026 comparison](https://f3fundit.com/the-solopreneur-analytics-stack-2026-posthog-vs-plausible-vs-fathom-analytics-and-why-you-should-ditch-google-analytics/) — funnels + free tier (MEDIUM)
- [PostHog vs Plausible self-host](https://selfhosting.sh/compare/posthog-vs-plausible/) — PostHog for product analytics, Plausible for pageviews (MEDIUM)
- Existing `.planning/codebase/STACK.md` + `ARCHITECTURE.md` — inherited validated stack (HIGH)

---

*Stack research for: v1.0 MVP feature additions (brownfield)*
*Researched: 2026-04-14*
