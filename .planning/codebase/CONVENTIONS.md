# Coding Conventions

**Analysis Date:** 2026-04-13

## TypeScript Configuration

**Server (`tsconfig.json`):**
- `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext`
- `strict: true`, `esModuleInterop: true`, `forceConsistentCasingInFileNames: true`
- `rootDir: "."`, `outDir: "./dist"`
- `include: ["server", "types"]`, `exclude: ["node_modules", "dist", "client"]`
- Emits compiled JS to `dist/` — server runs from `dist/server/index.js`

**Client (`client/tsconfig.json`):**
- `target: ESNext`, `module: ESNext`, `moduleResolution: Node`
- `jsx: react-jsx`, `isolatedModules: true`, `noEmit: true` (Vite handles transpile)
- `include: ["src", "../types"]` — shares `types/` with server
- No `strict` flag enabled here (vs server which has `strict: true`)

**Linting/Formatting:**
- No ESLint, Prettier, Biome, or editorconfig present in the project
- No `.eslintrc*`, `.prettierrc*`, `biome.json` — style is maintained by convention only

## Module System

- Both server and client are **ESM** (`"type": "module"` in both `package.json` files)
- Server uses NodeNext resolution → **imports must include `.js` extensions** (even for `.ts` sources). Examples from `server/index.ts`:
  ```ts
  import { validateInitData } from "./middleware/auth.js";
  import { tableManager } from "./TableManager.js";
  import type { TelegramUser } from "../types/index.js";
  ```
- Client imports omit extensions (bundler resolution):
  ```ts
  import { MainMenu } from "./pages/MainMenu";
  import type { GameState } from "../../types/index";
  ```
- Shared `types/index.ts` is imported by both sides via relative paths (no workspace aliases)

## Naming Patterns

**Files:**
- Server classes/modules: PascalCase (`Game.ts`, `TableManager.ts`, `Deck.ts`, `UserRepository.ts`)
- Server utilities: camelCase (`nameGenerator.ts`, `prisma.ts`, `auth.ts`)
- React components/pages: PascalCase (`GameControls.tsx`, `SeatsDisplay.tsx`, `GameRoom.tsx`)
- React hooks: camelCase with `use` prefix (`useTelegram.ts`, `useIsMobile.ts`)
- Config: camelCase/lowercase (`tables.ts`)

**Identifiers:**
- Functions/variables: camelCase (`validateInitData`, `getDevPlayerId`, `mySeat`)
- Types/interfaces/React components: PascalCase (`GameState`, `TelegramUser`, `Props`)
- Constants: SCREAMING_SNAKE_CASE or PascalCase token objects (`PORT`, `CORS_ORIGIN`, `SOCKET_URL`, `NEON`, `SEAT_POSITIONS_DESKTOP`)
- Enum-like string unions preferred over TS enums (e.g. `type AppView = 'loading' | 'auth' | ...`)

## Import Organization

Observed ordering (not enforced, but consistent):
1. External packages (`react`, `express`, `socket.io`, `dotenv/config`)
2. Internal modules via relative paths (`./middleware/auth.js`, `./pages/MainMenu`)
3. Type-only imports last, using `import type { ... }` (e.g. `server/index.ts:11-17`, `client/src/App.tsx:9-17`)
4. CSS/styles imported after modules (`import "./styles/telegram.css"` in `App.tsx`)

## File Organization

**Server layout (`server/`):**
- Root-level: domain engines (`Game.ts`, `Deck.ts`, `TableManager.ts`) and `index.ts` entry
- `models/` — domain wrappers (`Table.ts`, `User.ts` — in-memory user store)
- `db/` — Prisma access (`prisma.ts` client init, `UserRepository.ts` CRUD)
- `middleware/` — Express/Socket.io middleware (`auth.ts`)
- `config/` — static configuration (`tables.ts`, 6 predefined tables)
- `utils/` — pure helpers (`nameGenerator.ts`)

**Client layout (`client/src/`):**
- `App.tsx` — root router + socket lifecycle; view switching via `AppView` union
- `index.tsx` — React root mount
- `pages/` — top-level screens (`MainMenu`, `TableList`, `GameRoom`, `ProfileSettings`)
- `components/` — reusable presentational components (flat directory, no subfolders)
- `hooks/` — custom React hooks
- `assets/cards/` — card image PNGs
- `styles/telegram.css` — single global stylesheet entry (Tailwind import + CSS custom props)

## Shared Types

- All cross-boundary types live in `types/index.ts` (Player, GameState, Pot, Telegram types, socket event maps)
- Socket typing uses `Server<ClientEvents, ServerEvents>` and `Socket<ServerEvents, ClientEvents>` on both sides for event-level type safety
- No barrel files beyond the single `types/index.ts`

## React Patterns

- Function components only; class components are not used
- Props typed via local `interface Props { ... }` (see `GameControls.tsx:7-11`)
- Hooks extracted next to component when local (e.g. `useCountdown` inside `GameControls.tsx`), promoted to `hooks/` only when reused
- Lazy-loading dev-only code with `React.lazy` + `import.meta.env.DEV` guard (see `App.tsx:20-22` for `DevToolbar`)
- Side-effect-driven socket listeners live in `App.tsx`; game state is held at App level and passed down by props

## Styling Conventions

**Tailwind CSS 4:**
- Activated via `@tailwindcss/vite` plugin (`client/vite.config.ts:3`) and single `@import "tailwindcss";` at top of `styles/telegram.css`
- No `tailwind.config.js` — Tailwind 4 zero-config mode
- Utility classes used inline in JSX for layout, spacing, flex
- CSS custom properties defined in `:root` in `telegram.css` map Telegram theme vars (`--tg-theme-bg-color`) and poker-specific tokens (`--poker-felt`, `--poker-gold`)

**Inline styles for dynamic/computed styling:**
- Complex color/glow values use React inline `style={{ ... }}` objects (not Tailwind)
- Style factory functions return `React.CSSProperties` (e.g. `neonBtn()` in `GameControls.tsx:48`)
- Keyframe animations injected via a `<style>` tag inside components (see `SeatsDisplay.tsx`, `GameControls.tsx`) — not in global CSS

## "Neon Strip" UI Design Language

Canonical style for all game-surface UI. New UI must conform.

**Tokens (declared at top of `GameControls.tsx` and `SeatsDisplay.tsx` as `NEON` objects):**
- Fold — red `#ff4757`
- Check/Call/Active — cyan `#00e5ff`
- Raise/Chips — amber `#ffab00`
- All-In — orange `#ff6d00`
- Sit (empty seat) — green `#4caf50`
- Neutral/Preset — gray `#b0bec5`
- Each token defines `{ color, glow: 'rgba(...)' }` pair

**Surface recipe:**
- Background: `rgba(10,10,14,0.85-0.9)` + `backdrop-filter: blur(12px)`
- Border: `1.5px solid {color}60` (50–60% opacity); dashed for empty/interactive slots
- Corners: `borderRadius: 14` for buttons, `14` for seat strips
- Active state: inner glow `box-shadow: inset 0 0 12px {color}`; outer glow via color-matched `rgba`
- Chip counts: monospace + amber + `text-shadow` glow
- Bottom-docked panels: `paddingBottom: max(env(safe-area-inset-bottom), 12px)`
- Touch targets: ≥ 44px; `active:scale-95` for tap feedback
- Fixed seat dimensions: 64px (mobile) / 80px (desktop), aspect ratio 1.35

**Animations (keyframes injected inline):** `neon-pulse`, `seat-glow-pulse`, `timer-urgency`, `empty-seat-breathe`.

See `CLAUDE.md` → "UI Design — Neon Strip Style" for the authoritative spec.

## Error Handling

- Server: `try/catch` in socket handlers; errors returned via typed socket events or logged to `console.error`
- Auth: `validateInitData` returns result object; dev mode falls back to empty `initData` + `devId`
- Client: no global error boundary; socket disconnect handled by re-render in `App.tsx`
- No custom error classes; plain `Error` is thrown where needed

## Logging

- `console.log` / `console.error` throughout server (28 occurrences across 4 files)
- No structured logger (winston/pino) — plain console
- Client logs via `console` for dev diagnostics only; `DevToolbar` is lazy-loaded in dev

## Comments

- JSDoc blocks for non-obvious helpers (e.g. `getDevPlayerId` in `App.tsx:31-35`)
- Inline `//` comments explain intent, not mechanics
- Mixed Russian/English comments in configs (see `tsconfig.json:7`, `vite.config.ts:11`) — not enforced either way

## Build / Run

- Server: `npm run build` → `tsc` → `dist/`; `npm run dev` = build + `node dist/server/index.js`
- Client: `cd client && npm run dev` (Vite on 5173); `npm run build` (Vite production)
- `npm run dev:all` runs both concurrently via `concurrently`
- No watch mode for server (requires rebuild); consider `tsc --watch` when iterating

---

*Convention analysis: 2026-04-13*
