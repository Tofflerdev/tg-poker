# CLAUDE.md

## Project Overview

Telegram Mini App for Texas Hold'em poker (6-max cash games).

## Tech Stack

**Server:** Node.js, Express, Socket.io, TypeScript (ES2022, NodeNext modules)
**Client:** React 18, Vite, Tailwind CSS 4, Socket.io-client
**Database:** PostgreSQL 16 (via Docker), Prisma ORM (v7, `@prisma/adapter-pg`)
**Poker logic:** `pokersolver` library for hand evaluation
**Auth:** Telegram `initData` HMAC validation (`crypto-js`)

## Project Structure

```
server/           — Backend (Express + Socket.io)
  index.ts        — Entry point, socket event handlers (auth, game actions, chat, profile)
  Game.ts         — Core poker engine (betting rounds, side pots, showdown, timers)
  Deck.ts         — Card deck
  TableManager.ts — Singleton managing all tables
  models/Table.ts — Table wrapper with auto-start game loop
  models/User.ts  — In-memory user storage
  middleware/auth.ts — Telegram initData HMAC validation
  db/UserRepository.ts — Prisma CRUD (balance, daily bonus, stats)
  db/prisma.ts    — Prisma client init
  config/tables.ts — 6 predefined table configs
  utils/nameGenerator.ts — Random display name generator

client/           — Frontend (React + Vite)
  src/App.tsx     — Main router + socket state management
  src/pages/      — GameRoom, MainMenu, ProfileSettings, TableList
  src/components/ — Table, Card, GameControls, Chat, SeatsDisplay, PotDisplay, etc.
  src/hooks/useTelegram.ts — Telegram WebApp SDK hook
  src/assets/cards/ — Card images (PNG)

types/index.ts    — Shared types (Player, GameState, Pot, socket events, Telegram types)
prisma/schema.prisma — DB schema (single `User` model)
```

## Commands

```bash
# Dev
docker-compose up -d          # Start PostgreSQL
npm run dev                   # Build server + run (port 3000)
npm run dev:all               # Server + client (Vite on port 5173) concurrently
cd client && npm run dev      # Client only

# Build
npm run build                 # tsc (server)
cd client && npm run build    # Vite build (client)

# Database
npx prisma generate           # Generate Prisma client
npx prisma db push             # Push schema to DB
npx prisma migrate dev         # Create migration
```

## Environment Variables

See `.env.example`:
- `DATABASE_URL` — PostgreSQL connection string (default: `postgresql://poker:poker@localhost:5432/poker_db`)
- `BOT_TOKEN` — Telegram bot token (used for initData HMAC validation)
- `NODE_ENV` — `development` | `production`
- `PORT` — Server port (default: 3000)

## Architecture Notes

- **Monorepo** with shared `types/` directory (no workspaces, manual imports via `../../types`)
- Server compiles with `tsc` to `dist/`, client builds with Vite separately
- Communication is **Socket.io only** (no REST API for game logic)
- All tables are predefined in `server/config/tables.ts` (6 tables, not dynamically created)
- Game auto-starts when 2+ players are seated; continuous loop between hands
- Turn timer with configurable duration per table (15-30s)
- Side pot calculation handled in `Game.ts`
- Auth: in dev mode, `auth.ts` accepts empty `initData` with optional `devId`
- Production CORS restricted to `https://tgp.isgood.host`

## UI Design — "Neon Strip" Style

Game controls (`GameControls.tsx`) use a **"Neon Strip"** design language:
- Dark translucent backgrounds (`rgba(10,10,14,0.9+)`) with `backdrop-blur`
- Each action has a distinct neon color: **red** (Fold `#ff4757`), **cyan** (Check/Call `#00e5ff`), **amber** (Raise `#ffab00`), **orange** (All-In `#ff6d00`)
- Buttons are transparent with colored borders (`1.5px solid`) and a glowing bar (`GlowBar`) at the bottom edge
- Active/primary buttons get an inner glow via `box-shadow: inset 0 0 12px`
- Mobile: 3 main buttons in a row (56px height) + separate All-In strip below
- All bottom-docked panels use `paddingBottom: max(env(safe-area-inset-bottom), 12px)` for Android nav bar / iOS home indicator
- Touch targets minimum 44px, `active:scale-95` for tap feedback
- Neon color tokens defined in `NEON` object at top of `GameControls.tsx`

When adding new UI controls, follow this neon style with colored borders, glow effects, and dark backgrounds.

## DB Schema

Single `User` model: `telegramId` (unique), `displayName`, `balance` (default 1000), stats (`handsPlayed`, `handsWon`, `totalWinnings`, `biggestPot`), `lastDailyRefill`.

Daily bonus: claimable if balance < 1000 AND last claim > 24h ago. Sets balance to 1000 (not additive).
