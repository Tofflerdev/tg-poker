# Technology Stack

**Analysis Date:** 2026-04-13

## Languages

**Primary:**
- TypeScript 5.9.2 (server) / 5.1.3 (client) — all application code
- SQL (PostgreSQL dialect) — schema via Prisma (`prisma/schema.prisma`)

**Secondary:**
- JSON/YAML — configuration (`package.json`, `docker-compose.yml`, `tsconfig.json`)

## Runtime

**Environment:**
- Node.js (requires ES2022 + NodeNext module resolution per `tsconfig.json`)
- Browser runtime for client (Vite dev server / static build)

**Package Manager:**
- npm (lockfiles not inspected; two separate `package.json` files in root and `client/`)
- Lockfile: present in repo convention (monorepo without workspaces)

## Frameworks

**Core (server — `package.json`):**
- Express 4.19.2 — HTTP server (`server/index.ts`)
- Socket.io 4.7.5 — realtime game events (`server/index.ts`)

**Core (client — `client/package.json`):**
- React 18.2.0 — UI framework (`client/src/App.tsx`)
- React DOM 18.2.0
- Vite 5.3.0 — dev server / build (`client/vite.config.ts`)
- Tailwind CSS 4.2.1 + `@tailwindcss/vite` 4.2.1 — styling
- `@vitejs/plugin-react` 4.0.0 — React JSX/Fast Refresh

**Testing:**
- Not detected (no test framework in either `package.json`)

**Build/Dev:**
- TypeScript compiler `tsc` — server build to `dist/` (`tsconfig.json`)
- Vite — client build
- `concurrently` 9.2.1 — runs server + client in parallel (`npm run dev:all`)
- `ts-node` 10.9.2 — dev-only (not used by `npm run dev` script)

## Key Dependencies

**Critical (server):**
- `@prisma/client` 7.4.2 — ORM client (`server/db/prisma.ts`)
- `@prisma/adapter-pg` 7.4.2 — Prisma driver adapter for node-postgres
- `pg` 8.19.0 — PostgreSQL driver used by Prisma adapter
- `prisma` 7.4.2 (dev) — schema tooling / migrations
- `pokersolver` 2.1.1 — hand evaluation engine (`server/Game.ts`)
- `crypto-js` 4.2.0 + `@types/crypto-js` 4.2.2 — types only; HMAC uses Node's built-in `crypto` (`server/middleware/auth.ts`)
- `dotenv` 17.3.1 — env loading (`import "dotenv/config"` in `server/index.ts`)

**Critical (client):**
- `socket.io-client` 4.7.5 — matches server Socket.io version

**Type Definitions:**
- `@types/node` 20.11.30
- `@types/express` 4.17.21
- `@types/pg` 8.18.0
- `@types/socket.io` 3.0.2
- `@types/react` 18.0.28, `@types/react-dom` 18.0.11

## Configuration

**TypeScript (`tsconfig.json`):**
- `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext`
- `rootDir: .`, `outDir: ./dist`, `strict: true`
- Includes `server/` and `types/`; excludes `client/`, `node_modules`, `dist`
- Client uses its own TS config (not inspected in this pass)

**Vite (`client/vite.config.ts`):**
- Dev server port 5173
- `fs.allow: ['..']` — grants access to shared `types/` directory one level above

**Environment (`.env.example`):**
- `DATABASE_URL` — Postgres connection string
- `BOT_TOKEN` — Telegram bot token
- `NODE_ENV` — `development` | `production`
- `PORT` — server port (default 3000)
- `.env` file existence only noted; contents not read

## Database Layer

**Provider:** PostgreSQL 16 (Alpine image per `docker-compose.yml`)
**ORM:** Prisma 7.4.2 with `prisma-client-js` generator and `@prisma/adapter-pg`
**Schema:** `prisma/schema.prisma` — single `User` model, table mapped `users`
**Migration tooling:** `npx prisma migrate dev` / `npx prisma db push`

## Platform Requirements

**Development:**
- Docker / Docker Compose (Postgres container, port 5432)
- Node.js (ES2022 capable, e.g. Node 18+)
- Two dev processes: `npm run dev` (server) + `cd client && npm run dev` (Vite)

**Production:**
- Hosted behind HTTPS at `https://tgp.isgood.host` (required by Telegram Mini App)
- CORS restricted to that origin (`server/index.ts`)
- Dockerfile / nginx config not yet present (noted MVP blocker)

---

*Stack analysis: 2026-04-13*
