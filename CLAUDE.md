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

The game UI uses a **"Neon Strip"** design language across controls and player seats:

### Shared Tokens & Principles
- Dark translucent backgrounds (`rgba(10,10,14,0.85-0.9)`) with `backdrop-blur(12px)`
- Neon color palette: **red** (Fold `#ff4757`), **cyan** (Check/Call/Active `#00e5ff`), **amber** (Raise/Chips `#ffab00`), **orange** (All-In `#ff6d00`), **green** (Sit `#4caf50`), **gray** (Neutral `#b0bec5`)
- Borders: `1.5px solid` with color at 50-60% opacity; dashed for empty/interactive elements
- Glow effects: `box-shadow` with color-matched `rgba` glow values; `text-shadow` for chip counts
- `NEON` token objects defined at top of `GameControls.tsx` and `SeatsDisplay.tsx`

### Game Controls (`GameControls.tsx`)
- Buttons are transparent with colored borders and a glowing bar (`GlowBar`) at the bottom edge
- Active/primary buttons get an inner glow via `box-shadow: inset 0 0 12px`
- Mobile: 3 main buttons in a row (56px height) + separate All-In strip below
- All bottom-docked panels use `paddingBottom: max(env(safe-area-inset-bottom), 12px)`
- Touch targets minimum 44px, `active:scale-95` for tap feedback

### Player Seats (`SeatsDisplay.tsx`) — "Compact Card" design
- **Layout**: Vertical card-style seats — avatar on top (floats above card edge), cards in middle, name + stack at bottom
- **Fixed seat sizes**: 64px wide (mobile) / 80px wide (desktop), aspect ratio 1.35; padding `4px 6px 8px`
- **Seat positions**: 6 seats around the table with position arrays `SEAT_POSITIONS_DESKTOP` / `SEAT_POSITIONS_MOBILE`; seats rotate so "my seat" is always at bottom
- **Avatar**: Circular 22px (mobile) / 28px (desktop) with initial-letter fallback; cyan glow ring + `box-shadow` when active
- **Timer**: SVG circular progress ring (`TimerRing`) around avatar; depletes over turn duration; cyan → red when <5s
- **Active turn**: Pulsing neon glow border (`seat-glow-pulse` animation, border 45%→70% opacity) + bottom accent `GlowBar` in cyan
- **Folded players**: Seat card opacity `0.65` to visually dim
- **Name**: Truncated, white, 9-10px; **Stack**: Monospace `#ffab00` with `text-shadow` glow
- **Cards**: `HandDisplay` component scaled `0.7` (mobile) / `0.85` (desktop) via `transform: scale()`
- **Status badges**: Pill-shaped (`StatusBadge`) — Fold (red), All-in (orange), Sit out (gray), Wait BB (amber)
- **Empty seats**: Dashed green border with `empty-seat-breathe` animation (30%→60%), `+` icon, green glow on hover
- **WaitBB seats**: Amber border at 40% opacity
- **Mobile "my seat"**: Expanded layout — large cards above (`HandDisplay` at `seatWidth * 0.75`), compact info strip below (avatar + name + chips); strip has `borderRadius: 14px`
- Keyframe animations (`neon-pulse`, `seat-glow-pulse`, `timer-urgency`, `empty-seat-breathe`) injected via `<style>` tag

When adding new UI elements, follow this neon style with colored borders, glow effects, and dark translucent backgrounds.

## DB Schema

Single `User` model: `telegramId` (unique), `displayName`, `balance` (default 1000), stats (`handsPlayed`, `handsWon`, `totalWinnings`, `biggestPot`), `lastDailyRefill`.

Daily bonus: claimable if balance < 1000 AND last claim > 24h ago. Sets balance to 1000 (not additive).
