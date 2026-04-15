# Codebase Structure

**Analysis Date:** 2026-04-13

## Directory Layout

```
tg-poker/
├── server/                  # Node.js backend (Express + Socket.io)
│   ├── index.ts             # Entry point: HTTP server, Socket.io, all event handlers (564 lines)
│   ├── Game.ts              # Core poker engine — betting, side pots, showdown (835 lines)
│   ├── Deck.ts              # 52-card deck with shuffle/deal (33 lines)
│   ├── TableManager.ts      # Singleton registry of all tables (270 lines)
│   ├── config/
│   │   └── tables.ts        # 6 predefined table configs (PREDEFINED_TABLES)
│   ├── models/
│   │   ├── Table.ts         # Table wrapper: Game + auto-start loop (334 lines)
│   │   └── User.ts          # In-memory userStorage: Map<socketId, TelegramUser>
│   ├── middleware/
│   │   └── auth.ts          # validateInitData HMAC + createUserFromInitData
│   ├── db/
│   │   ├── prisma.ts        # Prisma client singleton
│   │   └── UserRepository.ts# CRUD: balance, daily bonus, profile, stats
│   └── utils/
│       └── nameGenerator.ts # Random displayName fallback
│
├── client/                  # Vite + React 18 SPA
│   ├── index.html
│   ├── vite.config.ts
│   ├── package.json         # Separate from root — client has its own deps
│   └── src/
│       ├── index.tsx        # ReactDOM mount
│       ├── App.tsx          # Router + single socket + view state machine (410 lines)
│       ├── pages/
│       │   ├── MainMenu.tsx         # Balance, daily bonus, table preview
│       │   ├── TableList.tsx        # Full list of 6 tables with status
│       │   ├── GameRoom.tsx         # Table + controls + chat wrapper
│       │   └── ProfileSettings.tsx  # Edit displayName / avatarUrl
│       ├── components/
│       │   ├── Table.tsx            # Felt background + community cards + pot
│       │   ├── SeatsDisplay.tsx     # 6 seats around table (neon-strip design)
│       │   ├── GameControls.tsx     # Fold/Check/Call/Raise/AllIn buttons
│       │   ├── Card.tsx, AnimatedCard.tsx, HandDisplay.tsx
│       │   ├── CommunityCards.tsx, PotDisplay.tsx, DealerButton.tsx
│       │   ├── BetChipsDisplay.tsx, PayoutChipsDisplay.tsx, PokerChip.tsx
│       │   ├── Chat.tsx, DailyBonusButton.tsx
│       │   └── DevToolbar.tsx       # Dev-only, lazy-loaded, tree-shaken in prod
│       ├── hooks/
│       │   └── useTelegram.ts       # Telegram WebApp SDK wrapper
│       ├── assets/cards/            # PNG card images (52 + back)
│       └── styles/telegram.css      # Telegram-themed CSS utilities
│
├── types/
│   ├── index.ts             # Shared types: Player, GameState, Pot, socket events, Telegram (261 lines)
│   └── pokersolver.d.ts     # Ambient declarations for untyped pokersolver lib
│
├── prisma/
│   └── schema.prisma        # Single User model (PostgreSQL)
│
├── nginx/                   # Reverse proxy config for production deploy
├── dist/                    # Compiled server output (tsc → ES2022, NodeNext)
├── plans/                   # Planning markdown docs (MVP plans)
├── screenshots/             # UI reference images
│
├── Dockerfile               # Multi-stage server build
├── docker-compose.yml       # Local dev: Postgres 16
├── docker-compose.prod.yml  # Production stack
├── deploy.sh / update.sh    # Deploy helpers
├── DEPLOY.md                # Deployment notes
├── CLAUDE.md                # Project instructions for Claude Code
├── package.json             # Root server deps + scripts
├── tsconfig.json            # Server tsc config (ES2022, NodeNext)
└── prisma.config.ts         # Prisma v7 config
```

## Directory Purposes

**`server/`:**
- Purpose: All backend code. Compiles via `tsc` to `dist/`.
- Contains: Socket.io entry point, game engine, table management, DB access, auth middleware.
- Key files: `index.ts`, `Game.ts`, `TableManager.ts`, `models/Table.ts`.

**`server/config/`:**
- Purpose: Static configuration data loaded at boot.
- `tables.ts` exports `PREDEFINED_TABLES` — the 6 cash-game tables (Beginner×2, Standard×2, Pro, High Stakes). Loaded via dynamic `import()` in `TableManager` constructor.

**`server/models/`:**
- Purpose: Stateful in-memory domain objects.
- `Table.ts`: one per poker table, wraps `Game`, owns auto-start setTimeout.
- `User.ts`: `userStorage` singleton — `Map<socketId, TelegramUser>` session cache (cleared on disconnect).

**`server/middleware/`:**
- Purpose: Request/event interceptors. Only `auth.ts` currently — Telegram HMAC validation + DB user upsert. Has dev-mode bypass (must be disabled before prod launch).

**`server/db/`:**
- Purpose: Persistence layer (Prisma v7, `@prisma/adapter-pg`).
- `prisma.ts`: shared `PrismaClient` instance.
- `UserRepository.ts`: all user DB operations — `findOrCreate`, `updateBalance`, `claimDailyBonus`, `getProfile`, `updateProfile`, stats updates.

**`server/utils/`:**
- Purpose: Pure helper functions. Currently only `nameGenerator.ts` (random fallback display names).

**`client/src/pages/`:**
- Purpose: Top-level route components, one per view in the `AppView` state machine (`loading | auth | menu | tables | game | profile`). Each receives data and callbacks from `App.tsx` via props — no shared router library.

**`client/src/components/`:**
- Purpose: Reusable presentational components. Follow "Neon Strip" design (see CLAUDE.md § UI Design).
- Key: `SeatsDisplay.tsx` (6 player seats with avatars, timers, status badges), `GameControls.tsx` (action buttons with `NEON` color tokens), `Table.tsx` (felt + pot + community cards).

**`client/src/hooks/`:**
- Purpose: Custom React hooks. `useTelegram.ts` wraps `window.Telegram.WebApp` SDK (initData, haptics, theme colors, expand).

**`types/`:**
- Purpose: Shared TypeScript types imported by both server and client via relative path (`../../types/index.js` from server, `../../types/index` from client). No npm workspace — manual import paths.
- Source of truth for: `Player`, `GameState`, `Pot`, `PotResult`, `ShowdownResult`, `TelegramUser`, `TableConfig`, `TableInfo`, `ClientEvents`, `ServerEvents`, `ExtendedClientEvents`, `ExtendedServerEvents`, `ChatMessage`, `AuthPayload`.

**`prisma/`:**
- Purpose: DB schema + migrations. Single `User` model with `telegramId` unique key, `balance` (default 1000), stats columns, `lastDailyRefill`.

**`nginx/`:**
- Purpose: Production reverse proxy. Terminates HTTPS and proxies `/socket.io/` to Node.

## Key File Locations

**Entry Points:**
- `server/index.ts`: server bootstrap + every socket event handler.
- `client/src/index.tsx`: React mount.
- `client/src/App.tsx`: client-side routing and socket lifecycle.

**Configuration:**
- `server/config/tables.ts`: predefined tables.
- `.env` / `.env.example`: `DATABASE_URL`, `BOT_TOKEN`, `NODE_ENV`, `PORT`.
- `tsconfig.json`: server tsc (ES2022, NodeNext modules — hence `.js` import suffixes in server TS).
- `client/vite.config.ts`: client build config.
- `prisma/schema.prisma`: DB schema.

**Core Logic:**
- `server/Game.ts`: poker rules, betting rounds, side pots, showdown, turn timer.
- `server/models/Table.ts`: auto-start hand loop, seat management.
- `server/TableManager.ts`: global table registry.
- `server/db/UserRepository.ts`: balance, daily bonus, profile.

**Testing:** None — no test files or test runner configured in this repo.

## Naming Conventions

**Files:**
- Server TS modules: PascalCase for classes/domain (`Game.ts`, `Deck.ts`, `TableManager.ts`, `UserRepository.ts`), camelCase for utilities (`nameGenerator.ts`).
- Client components: PascalCase matching the default export (`SeatsDisplay.tsx`).
- Pages: PascalCase (`MainMenu.tsx`, `GameRoom.tsx`).

**Directories:**
- Lowercase (`server/`, `client/`, `components/`, `pages/`, `hooks/`, `models/`, `db/`, `middleware/`, `utils/`, `config/`).

**Import paths (server, NodeNext):**
- Must include `.js` extension even in `.ts` source (e.g. `import { tableManager } from "./TableManager.js"`).

**Shared types from client:**
- Relative `../../types/index` (no extension — Vite resolves).

## Where to Add New Code

**New Socket Event:**
- Add signature to `types/index.ts` `ExtendedClientEvents` or `ExtendedServerEvents`.
- Register handler inside the `io.on("connection", ...)` block in `server/index.ts`.
- Subscribe on client in `App.tsx`'s `useEffect` with cleanup in return.

**New Game Rule / Poker Logic:**
- Implement as method on `Game` class in `server/Game.ts`. Keep it pure (no socket/DB).
- Expose via a thin forwarder on `Table` (`server/models/Table.ts`).
- Wire a socket action case inside `handleGameAction` in `server/index.ts`.

**New Table Configuration:**
- Edit `server/config/tables.ts` `PREDEFINED_TABLES` array. No DB migration required (tables are in-memory).

**New UI Component:**
- Create under `client/src/components/` with PascalCase filename.
- Follow "Neon Strip" tokens (see CLAUDE.md): dark translucent bg, neon border with glow, `backdrop-blur(12px)`.
- Import shared types from `../../../types/index`.

**New Page / View:**
- Add file under `client/src/pages/`.
- Add view name to `AppView` union in `client/src/App.tsx` and a conditional render block.

**New DB Column / Model:**
- Edit `prisma/schema.prisma`.
- Run `npx prisma migrate dev` locally.
- Update `server/db/UserRepository.ts` with new methods.
- Propagate to `TelegramUser` / `UserProfile` in `types/index.ts`.

**Shared Type:**
- Add to `types/index.ts`. Used by both server (`../../types/index.js`) and client (`../../types/index`).

## Special Directories

**`dist/`:**
- Purpose: Compiled server JS output from `tsc`.
- Generated: Yes (`npm run build`).
- Committed: No (build artifact).

**`node_modules/`:**
- Two locations: repo root (server deps) and `client/node_modules/` (client deps). No workspace config — install separately.
- Generated: Yes. Committed: No.

**`client/dist/`:**
- Purpose: Vite production bundle served by nginx in production.
- Generated: Yes (`cd client && npm run build`).
- Committed: No.

**`screenshots/`:**
- Purpose: Design reference images for UI work.
- Committed: Yes.

**`plans/`:**
- Purpose: Human-authored planning docs (`mvp-launch-plan.md`, `mvp-plan.md`). Separate from `.planning/` which is GSD-managed.

**`.planning/`:**
- Purpose: GSD command workspace (this file lives here).

---

*Structure analysis: 2026-04-13*
