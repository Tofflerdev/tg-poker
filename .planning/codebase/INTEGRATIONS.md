# External Integrations

**Analysis Date:** 2026-04-13

## APIs & External Services

**Telegram Platform:**
- **Telegram WebApp SDK** — injected via `window.Telegram.WebApp` in the Mini App browser context
  - Consumed in: `client/src/hooks/useTelegram.ts`
  - Features used: `initDataUnsafe`, `initData`, `themeParams`, plus WebApp methods (expand, close, haptics, etc.)
  - No npm package; relies on script provided by Telegram host
- **Telegram Bot API (initData validation)** — server-side HMAC verification of login payload
  - Implementation: `server/middleware/auth.ts` (`validateInitData`)
  - Algorithm: HMAC-SHA256 using secret key derived from `BOT_TOKEN` (Node `crypto` module)
  - Auth window: rejects `auth_date` older than 24 hours
  - Dev bypass: empty / mock initData accepted when `NODE_ENV=development`
  - Env var: `BOT_TOKEN`

## Data Storage

**Databases:**
- PostgreSQL 16 (Alpine) — primary persistence
  - Container: `postgres:16-alpine` (`docker-compose.yml`)
  - Credentials (dev): user `poker` / password `poker` / db `poker_db`, port `5432`
  - Volume: `pgdata`
  - Connection string: `DATABASE_URL` env var
  - Client: Prisma 7.4.2 via `@prisma/adapter-pg` + `pg` Pool (`server/db/prisma.ts`)
  - Schema: `prisma/schema.prisma` — single `User` model (`users` table)
  - Repository layer: `server/db/UserRepository.ts`

**File Storage:**
- Local filesystem only (card assets bundled in `client/src/assets/cards/`)
- No external object store (S3 / GCS / etc.) detected

**Caching:**
- None (no Redis, Memcached, or in-process cache layer detected)
- In-memory state held by `server/TableManager.ts` and `server/models/User.ts`

## Authentication & Identity

**Auth Provider:**
- Telegram Mini App `initData` — only auth mechanism
  - Validation: `server/middleware/auth.ts`
  - User creation / lookup: `UserRepository.findOrCreate` keyed by `telegramId`
  - Dev mode: synthetic users `dev_player_1` .. `dev_player_6` via `devId` query param
- No password, OAuth, JWT, or session cookie system

## Realtime Transport

**Socket.io:**
- Server: `socket.io` 4.7.5 attached to the Express HTTP server (`server/index.ts`)
- Client: `socket.io-client` 4.7.5 (`client/package.json`)
- CORS allow-list:
  - Production: `https://tgp.isgood.host`
  - Development: `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:3000`
- `credentials: true` enabled on Socket.io CORS
- All game logic (bet, call, fold, chat, profile updates) runs over Socket.io — no REST endpoints for gameplay
- Shared event typings: `types/index.ts` (`ExtendedClientEvents`, `ExtendedServerEvents`)

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry, Datadog, Rollbar, etc.)

**Logs:**
- `console.log` / `console.error` only (e.g. `server/middleware/auth.ts`)
- No structured logger (pino, winston) detected

**Metrics:**
- Minimal debug endpoint at `GET /` returns table + player counts (`server/index.ts`)

## CI/CD & Deployment

**Hosting:**
- Target domain: `https://tgp.isgood.host` (hard-coded in production CORS)
- Deployment artifacts: Dockerfile + nginx config NOT present (MVP blocker per project memory)

**CI Pipeline:**
- None detected (no `.github/workflows`, `.gitlab-ci.yml`, etc. observed)

## Poker Logic Library

**pokersolver 2.1.1:**
- Used in `server/Game.ts` for hand evaluation and showdown comparison
- No license wrapper / fork — direct npm dependency

## Environment Configuration

**Required env vars (`.env.example`):**
- `DATABASE_URL` — PostgreSQL connection string
- `BOT_TOKEN` — Telegram bot HMAC secret
- `NODE_ENV` — controls dev auth bypass + CORS origin
- `PORT` — HTTP/Socket.io server port (default 3000)

**Secrets location:**
- Local `.env` file (not committed; existence only — contents not read)
- No secret manager integration (Vault, AWS Secrets Manager, Doppler) detected

## Webhooks & Callbacks

**Incoming:**
- None — the app does not register a Telegram Bot webhook; it only validates `initData` from the Mini App client

**Outgoing:**
- None — server does not call external HTTP APIs (no `fetch` / `axios` to third parties detected)

## Third-Party Client SDKs Summary

| Purpose            | Package / Source                      | Location                                 |
|--------------------|---------------------------------------|------------------------------------------|
| Telegram Mini App  | `window.Telegram.WebApp` (host-injected) | `client/src/hooks/useTelegram.ts`     |
| Realtime (client)  | `socket.io-client` 4.7.5              | `client/src/App.tsx`                     |
| Realtime (server)  | `socket.io` 4.7.5                     | `server/index.ts`                        |
| Postgres driver    | `pg` 8.19.0 + `@prisma/adapter-pg`    | `server/db/prisma.ts`                    |
| ORM                | `@prisma/client` 7.4.2                | `server/db/UserRepository.ts`            |
| Poker evaluation   | `pokersolver` 2.1.1                   | `server/Game.ts`                         |
| HMAC validation    | Node built-in `crypto`                | `server/middleware/auth.ts`              |

---

*Integration audit: 2026-04-13*
