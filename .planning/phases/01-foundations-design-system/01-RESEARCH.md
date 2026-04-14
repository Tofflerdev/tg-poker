# Phase 1: Foundations & Design System - Research

**Researched:** 2026-04-14
**Domain:** Brownfield foundations — Tailwind v4 theming, Prisma v7 migration, Node `crypto` HMAC, Socket.io identity refactor, callback seams in an existing poker engine
**Confidence:** HIGH (all findings grounded in the repo + official docs; no speculative claims required)

## Summary

Phase 1 is a **structural scaffolding phase** — no gameplay behavior changes. Five independent-but-coordinated workstreams land together:

1. **Neon Strip tokens** promoted out of two component-local `NEON` literal objects into a shared `client/src/styles/neon.css` + Tailwind v4 `@theme` block.
2. **Prisma migration `v1_mvp_launch`** — additive columns on `User` plus new `HandHistory` and `AdminAuditLog` tables. Repo has **no `prisma/migrations/` directory** today (history shows `db push`), so this is the **first real migration**, which means `prisma migrate dev --name v1_mvp_launch` will also baseline the existing `User` table.
3. **telegramId identity refactor** — big-bang key swap in `TableManager`, `userStorage`, `Game.addPlayer(id)` callers, and `server/index.ts` socket handlers. `Player.id` currently holds `socket.id`; this becomes `telegramId` (as `string`) while `Player.socketId` becomes a mutable transport handle.
4. **Game callback seams** — add `setOnPlayerAction` + `setOnHandComplete` to `Game.ts`, mirroring the existing `setOnShowdown` / `setOnStateChange` / `setOnTurnTimeout` pattern. Fire **synchronously** from `fold/check/call/raise/allIn` and from `endHand`-equivalent sites (`nextStage` single-winner branch, `showdown()`, `runOutBoard` showdown). Phase 1 wires no-op consumers.
5. **Fail-closed auth** — rewrite `server/middleware/auth.ts` to gate dev bypass on `ALLOW_DEV_AUTH=true` AND `NODE_ENV !== 'production'`, replace string-equality HMAC comparison with `crypto.timingSafeEqual`, and never fabricate a dev user on validation failure. Add a boot-time fatal-exit check in `server/index.ts` **before** `server.listen()`.

**Primary recommendation:** Execute as five parallel task streams with a single integration wave. The only cross-stream dependency is that the telegramId refactor must land before the Game callbacks are consumed by anything real (Phase 3) — but since Phase 1 wires no-ops, the two streams can land in either order. Auth hardening and Prisma migration are fully independent. Token extraction is client-only and fully independent.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Neon Strip Tokens (BRAND-03)**
- **D-01:** Tokens in new `client/src/styles/neon.css` as CSS custom properties, referenced by Tailwind v4 `@theme` block.
- **D-02:** Semantic action-tier naming: `--color-action-fold`, `--color-action-call`, `--color-action-raise`, `--color-action-allin`, `--color-action-sit`, `--color-active`, `--color-chip`, `--color-neutral`.
- **D-03:** Existing `NEON` literals in `GameControls.tsx` and `SeatsDisplay.tsx` refactored in this phase to consume tokens — no orphan hex values remain in those two files.

**telegramId Identity Refactor (RESILIENCE-03)**
- **D-04:** Big-bang refactor keying `TableManager`, `userStorage`, socket handler maps by `telegramId`. No adapter layer.
- **D-05:** `Player` retains `socketId` as per-player transport handle (updated on reconnect). `telegramId` is the durable identity key.
- **D-06:** `telegramId ↔ socketId` mapping lives on `TableManager` (`Map<telegramId, socketId>`).
- **D-07:** Reconnect-time socket eviction is scaffolded now: new socket with already-mapped telegramId closes the prior socket. `replacedBySession` event payload + GameState snapshot are Phase 4.

**Game Callback Contract (GAME-04)**
- **D-08:** Two setters: `setOnPlayerAction(cb)`, `setOnHandComplete(cb)`. No EventEmitter.
- **D-09:** Sync fire-and-forget invocation. Listeners queue async work themselves.
- **D-10:** `onPlayerAction` payload: `{ tableId, telegramId, seat, action, amount, totalBetThisStreet, potAfter }`.
- **D-11:** `onHandComplete` payload: `{ handId, tableId, completedAt, board, perPlayer: Array<{ telegramId, seat, holeCards, finalChips, netDelta, won, showedDown }> }`.
- **D-12:** Phase 1 wires both callbacks on every Table; consumers are no-ops (no behavior change).

**Prisma `v1_mvp_launch` Migration (RESILIENCE-01)**
- **D-13:** Single migration named `v1_mvp_launch` containing all Phase 1 schema changes.
- **D-14:** Additive nullable `User` columns: `avatarId String?`, `currentTableId String?`, `currentSeat Int?`, `currentChips Int?`, `sessionToken String?`, `disconnectedAt DateTime?`, `lastSeenAt DateTime?`, `bannedAt DateTime?`, `tosAcceptedAt DateTime?`, `tosVersion String?`.
- **D-15:** `HandHistory` per-player rows (see CONTEXT for schema).
- **D-16:** `AdminAuditLog` with typed core + JSON before/after (see CONTEXT for schema).
- **D-17:** Targeted indexes: `HandHistory(telegramId, playedAt DESC)`, `HandHistory(playedAt)`, `AdminAuditLog(adminTelegramId, createdAt DESC)`, `AdminAuditLog(action, createdAt DESC)`, `User(currentTableId)`.

**Auth Hardening (SECURITY-01/02/03)**
- **D-18:** Dev bypass requires `ALLOW_DEV_AUTH=true` AND `NODE_ENV !== 'production'`. Default for `ALLOW_DEV_AUTH` is unset/false.
- **D-19:** On boot: if `NODE_ENV=production` AND (`ALLOW_DEV_AUTH=true` OR `BOT_TOKEN` is empty/whitespace-only) → log single fatal line to stderr (`FATAL: refusing to start — <reason>`) and `process.exit(1)`. Check runs before any listener binds.
- **D-20:** HMAC comparison uses `crypto.timingSafeEqual` over equal-length `Buffer`s. On any validation failure, `validateInitData` returns `null` / throws — never fabricates a dev user.
- **D-21:** SECURITY-04 PII scrubbing is deferred to Phase 5. Phase 1 only ensures auth itself doesn't echo `initData` to logs.

### Claude's Discretion
- File names/paths within the above constraints (`client/src/styles/neon.css`, `server/SessionMap.ts` if extracted, etc.).
- Internal helpers and types as needed to satisfy the contracts.
- Whether to colocate the `telegramId↔socket` map directly on `TableManager` or extract a small helper inside the same module.

### Deferred Ideas (OUT OF SCOPE)
- `replacedBySession` event payload + full `GameState` snapshot on reconnect → **Phase 4** (RESILIENCE-04).
- PII scrubbing in Sentry / logs / analytics → **Phase 5** (SECURITY-04).
- `HandHistory` write queue + retention job → **Phase 3** (PROFILE-02, PROFILE-04). Schema lands now; writers later.
- `AdminAuditLog` write path + admin namespace → **Phase 5** (ADMIN-*). Schema lands now; writers later.
- Avatar asset bundling, atomic random-assign on signup, profile re-pick → **Phase 2** (AVATAR-*). Column lands now.
- ToS/consent gate on `joinTable` → **Phase 5** (COMPLIANCE-04). Columns land now.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BRAND-03 | Neon Strip palette in `neon.css` + Tailwind theme, single source of truth | Tailwind v4 `@theme` directive (verified), existing NEON token inventory in `GameControls.tsx` (lines 38-45) and `SeatsDisplay.tsx` (lines 18-27) |
| RESILIENCE-01 | Additive Prisma migration `v1_mvp_launch` | Prisma v7 `migrate dev --name` workflow, repo has no prior migrations dir, current schema at `prisma/schema.prisma` |
| RESILIENCE-03 | telegramId-keyed TableManager/userStorage/socket maps | Current `Player.id = socket.id` usage across `Game.ts`, `Table.ts`, `TableManager.ts`, `index.ts`; Socket.io rooms work with any string key |
| GAME-04 | `setOnPlayerAction` + `setOnHandComplete` consumed by `server/index.ts` | Existing callback pattern in `Game.ts` (lines 824-834: `setOnTurnTimeout/StateChange/Showdown`); natural emission sites in `fold/check/call/raise/allIn` and `showdown()`/`nextStage`'s win-by-fold branch |
| SECURITY-01 | Dev bypass requires both `ALLOW_DEV_AUTH=true` AND non-prod NODE_ENV | Current `IS_DEV` check at `auth.ts:7` uses only NODE_ENV — needs env-var composition |
| SECURITY-02 | Boot exit(1) when prod + dev-auth or empty BOT_TOKEN | Node `process.exit(1)` + stderr write; check before `server.listen()` at `index.ts:560` |
| SECURITY-03 | `crypto.timingSafeEqual` for HMAC; no fabricated dev user on failure | Current `auth.ts:72` uses `!==` string compare; `createUserFromInitData` falls back to `createDevUser` on failure (lines 121-127, 142-148) — must be removed |

## Standard Stack

### Core (already in repo — verified via `package.json` / `client/package.json`)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `tailwindcss` | ^4.2.1 (client) | Design tokens via `@theme` directive | Tailwind v4 is installed; `@theme` is the official v4 way to expose design tokens as both CSS vars and Tailwind utilities [VERIFIED: client/package.json] |
| `@tailwindcss/vite` | ^4.2.1 | Tailwind v4 Vite plugin | Already wired in `client/vite.config.ts` [VERIFIED] |
| `@prisma/client` + `prisma` | ^7.4.2 | ORM + migration tooling | Already installed; v7 uses `prisma migrate dev --name <name>` to produce named SQL migrations [VERIFIED: package.json] |
| `@prisma/adapter-pg` + `pg` | ^7.4.2 / ^8.19.0 | Postgres driver adapter | Already installed [VERIFIED] |
| Node `crypto` (built-in) | Node 20.x | `timingSafeEqual`, `createHmac` | Node stdlib — no dep needed. Already used in `auth.ts:1` [VERIFIED] |
| `socket.io` | ^4.7.5 | Transport | Already installed; identity refactor is a call-site change, no API change [VERIFIED] |

### Notes on what is NOT needed
- **No new runtime deps for Phase 1.** Every piece of scaffolding uses libraries already in the tree.
- `crypto-js` (^4.2.0) is currently in `package.json` but CLAUDE.md says it is used for initData HMAC — the actual `auth.ts` uses Node built-in `crypto` module [VERIFIED: auth.ts line 1]. Do **not** rewrite with `crypto-js`; stay on Node `crypto`. `timingSafeEqual` is only available on Node `crypto`, not `crypto-js`, which is another reason to consolidate on the built-in.

**Version verification:** All versions above are read directly from `package.json` / `client/package.json` in the repo. No registry check needed — the repo already commits to these versions.

## Architecture Patterns

### Tailwind v4 `@theme` + CSS-vars pattern [CITED: tailwindcss.com/docs/theme (v4)]

Tailwind v4 exposes design tokens via a single `@theme` block. Any value declared inside `@theme` is **both** a CSS custom property (`--color-action-fold`) **and** an auto-generated utility class (`bg-action-fold`, `text-action-fold`, `border-action-fold`). This is the official v4 replacement for `tailwind.config.js`.

```css
/* client/src/styles/neon.css */
@import "tailwindcss";

@theme {
  --color-action-fold: #ff4757;
  --color-action-call: #00e5ff;        /* also: check, active */
  --color-action-raise: #ffab00;       /* also: chips, waitbb */
  --color-action-allin: #ff6d00;
  --color-action-sit: #4caf50;
  --color-active: #00e5ff;
  --color-chip: #ffab00;
  --color-neutral: #b0bec5;

  /* Glow shadows as semantic tokens */
  --shadow-neon-fold:  0 0 18px rgba(255,71,87,0.35);
  --shadow-neon-call:  0 0 18px rgba(0,229,255,0.30);
  --shadow-neon-raise: 0 0 18px rgba(255,171,0,0.35);
  --shadow-neon-allin: 0 0 18px rgba(255,109,0,0.40);
}
```

Consumer sites (inline styles in `GameControls.tsx`, `SeatsDisplay.tsx`) reference via `var(--color-action-fold)` — no JS-side NEON objects needed, though a thin TS re-export (`client/src/styles/neon.ts` exporting `getComputedStyle` accessors or literal strings matched to the CSS) is acceptable as the interop surface for inline-style props. **Simplest approach:** consumers use the CSS var string directly in inline styles (`color: 'var(--color-action-fold)'`) — supported by React style props natively.

The existing `client/src/styles/telegram.css` already uses an `@import "tailwindcss"` pattern [VERIFIED: telegram.css line 1]. `neon.css` should be a second imported stylesheet (imported from the app entry), not replace it.

### Prisma v7 migration pattern (first migration from `db push` state) [CITED: prisma.io/docs/orm/prisma-migrate/getting-started]

The repo has **no `prisma/migrations/` directory** — schema has been pushed with `prisma db push`. First-time use of `migrate dev` against an existing DB requires **baselining** before adding new columns:

**Option A (clean slate, recommended for dev):** Drop local DB, run `prisma migrate dev --name v1_mvp_launch` — Prisma generates a single migration containing the full schema (existing User table + new columns + new tables). Works because CLAUDE.md confirms Docker-local Postgres and no production data yet (out-of-scope deploy).

**Option B (baseline):** Generate an "initial" migration from the current schema (`prisma migrate diff --from-empty --to-schema-datamodel ... > migrations/0_init/migration.sql`), mark it applied (`prisma migrate resolve --applied 0_init`), then `prisma migrate dev --name v1_mvp_launch` for the additive diff.

Because the project is pre-deploy and no production DB exists, **Option A is simpler and safe**. If the user has meaningful local test data, Option B avoids data loss.

### `Game.ts` callback seam pattern (established in existing code)

`Game.ts` already exposes three setter methods (lines 824-834):
```ts
public setOnTurnTimeout(callback: () => void)
public setOnStateChange(callback: () => void)
public setOnShowdown(callback: (result: ShowdownResult) => void)
```

The two new setters follow exactly this shape — private field + public setter + null-checked call site:

```ts
// Game.ts additions
private onPlayerAction: ((evt: PlayerActionEvent) => void) | null = null;
private onHandComplete: ((evt: HandCompleteEvent) => void) | null = null;

public setOnPlayerAction(cb: (evt: PlayerActionEvent) => void) { this.onPlayerAction = cb; }
public setOnHandComplete(cb: (evt: HandCompleteEvent) => void) { this.onHandComplete = cb; }
```

**Emission sites for `onPlayerAction`:** end of each of `fold()`, `check()`, `call()`, `raise()`, `allIn()` — after state mutation, before `this.nextPlayer()`. All five methods already have `player.acted = true; this.nextPlayer();` as the trailing statements, so the call slots in between. `action` tag is derivable from the method name; `amount` is the delta the method computed (`actualBet` for call, `totalBet` for raise/allIn, `0` for fold/check); `totalBetThisStreet` = `player.bet`; `potAfter` = `this.getTotalPot()`.

**Emission sites for `onHandComplete`:** two paths converge at "hand is over":
1. Single-active-player branch inside `nextStage()` (lines 473-502 — "Win by Fold") — right before `this.onShowdown(this.lastShowdown!)`.
2. Real showdown at the end of `showdown()` (line 651-672) — right before the `return this.lastShowdown`.
3. `runOutBoard()` (line 543-585) terminates via `showdown()`, so path 2 covers it transitively.

`handId` is a new cuid generated at `startNextHand()` and stored on the Game instance (simple new field). `board` = `this.communityCards`. `perPlayer` is built from `this.seats` filtered non-null, with `netDelta = finalChips - startingChips` — which means `Game.ts` also needs to snapshot each player's chips at `startNextHand` start (a `handStartChips: number[]` parallel to `seats`).

### Identity refactor shape

Current flow uses `socket.id` as the `Player.id`:
- `Game.addPlayer(id, seat, chips, telegramId?, ...)` — receives `socket.id` at call sites; `telegramId` is an optional secondary field.
- `TableManager.playerToTable: Map<string, string>` — key is `socket.id`.
- `userStorage.users: Map<string, TelegramUser>` — key is `socket.id`; `socketToTelegram` is a parallel index.
- Socket handlers use `socket.id` as the authoritative caller identity; `table.fold(socket.id)`, etc.

**After refactor:**
- `Player.id` becomes `telegramId` (as `string`, since existing `id: string` type is preserved — stringify BigInt/number on construction).
- `Player.socketId?: string` is added as a mutable transport handle.
- `TableManager.playerToTable: Map<telegramId, tableId>`.
- `TableManager.socketByTelegram: Map<telegramId, socketId>` (new) — the D-06 mapping. Exposed via `getSocketId(telegramId)` and `setSocket(telegramId, socketId, onEvict: (oldSocketId) => void)` — eviction callback lets `server/index.ts` close the old socket (D-07 scaffold).
- `userStorage.users: Map<telegramId, TelegramUser>` (key swap); remove `socketToTelegram`.
- Socket handlers resolve `telegramId = userStorage.getTelegramIdBySocket(socket.id)` at the top of each handler via a thin `socketToTelegram: Map<socketId, telegramId>` kept on `TableManager` alongside the inverse map — or pass telegramId through via `socket.data.telegramId` (Socket.io supports arbitrary `socket.data` — verified via official types).

**Simplest realization (recommended):** Stash `telegramId` on `socket.data.telegramId` at `auth` handler completion; every downstream handler reads from `socket.data`. This eliminates one of the two maps and mirrors an established Socket.io idiom. `TableManager` keeps only `Map<telegramId, socketId>` (for eviction lookup) and `Map<telegramId, tableId>`.

### Fail-closed auth pattern

```ts
// middleware/auth.ts
const BOT_TOKEN = (process.env.BOT_TOKEN || '').trim();
const ALLOW_DEV_AUTH = process.env.ALLOW_DEV_AUTH === 'true';
const IS_PROD = process.env.NODE_ENV === 'production';
const DEV_BYPASS_ACTIVE = ALLOW_DEV_AUTH && !IS_PROD;

export function assertSafeBootOrExit(): void {
  if (IS_PROD && (ALLOW_DEV_AUTH || !BOT_TOKEN)) {
    const reason = !BOT_TOKEN
      ? 'BOT_TOKEN is empty in production'
      : 'ALLOW_DEV_AUTH=true is set in production';
    process.stderr.write(`FATAL: refusing to start — ${reason}\n`);
    process.exit(1);
  }
}

export function validateInitData(initData: string): WebAppInitData | null {
  if (DEV_BYPASS_ACTIVE && /* empty or mock */) return { /* dev payload */ };
  try {
    // ... parse hash + build data_check_string ...
    const calculated = Buffer.from(calculatedHash, 'hex');
    const provided = Buffer.from(hash, 'hex');
    if (calculated.length !== provided.length) return null;
    if (!crypto.timingSafeEqual(calculated, provided)) return null;
    // ... auth_date window check, parse user, return payload ...
  } catch {
    return null;
  }
}
```

`assertSafeBootOrExit()` is called from `server/index.ts` as the **first line** after imports, before `express()`. `createUserFromInitData` drops all `IS_DEV && ... createDevUser` fallback branches (lines 117-119, 123-126, 142-148 in current file) — if `validateInitData` returned a valid payload, the user object is built from it; if `UserRepository.findOrCreate` throws, the error propagates and `auth` handler emits `authError`. **No fabrication.**

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Constant-time string comparison | Custom loop over chars | `crypto.timingSafeEqual(Buffer, Buffer)` | Node built-in, timing-safe, rejects mismatched lengths [CITED: nodejs.org/api/crypto.html#cryptotimingsafeequala-b] |
| Design token plumbing (CSS → JS) | Parallel TS `NEON` object + CSS vars that drift | Tailwind v4 `@theme` — single declaration, auto-generates utilities + vars | v4 killed the config file duality for this exact reason [CITED: tailwindcss.com/docs/theme] |
| Migration SQL hand-writing | Hand-edited `.sql` files | `prisma migrate dev --name v1_mvp_launch` — Prisma generates + applies | Baseline safety, checksum tracking, auto-rollback on partial failure [CITED: prisma.io/docs/orm/prisma-migrate] |
| Synchronous UUID/handId generation | `Date.now() + random` string | Prisma `@default(cuid())` in the schema, or `crypto.randomUUID()` server-side for `handId` | Collision-safe, already used in the pending `HandHistory` schema |
| EventEmitter for Game callbacks | `new EventEmitter()` in Game.ts | Two setter methods (D-08) | Explicit contract, no typing gymnastics, matches existing `setOnShowdown` pattern — decision already locked |

## Common Pitfalls

### Pitfall 1: Prisma `migrate dev` against a `db push`-seeded DB [VERIFIED: local repo has no migrations dir]
**What goes wrong:** Running `prisma migrate dev --name v1_mvp_launch` on a DB whose schema was applied via `db push` will detect drift ("the migration history is empty but the database is not") and offer to reset the DB. If the dev accepts, local data is wiped.
**How to avoid:** Decide **Option A (reset dev DB)** or **Option B (baseline)** explicitly in the plan. For this phase, Option A is acceptable per project state (no prod deploy, no precious test data).
**Warning signs:** Prisma CLI prompt asking "Do you want to reset your database?" — make it an intentional step in the plan, not a surprise.

### Pitfall 2: Silent NODE_ENV default in auth bypass [VERIFIED: auth.ts:7 reads `IS_DEV = NODE_ENV === 'development'`]
**What goes wrong:** If `NODE_ENV` is unset (not "development", not "production"), current code treats `IS_DEV` as `false` and requires HMAC — but some deploy envs leave `NODE_ENV` unset, and some test runners set it to `"test"`. After refactor, if the composition is `!IS_PROD` (rather than `IS_DEV === true`), **any non-prod env** (including unset) allows dev bypass when `ALLOW_DEV_AUTH=true`.
**How to avoid:** D-18 specifies `NODE_ENV !== 'production'`, which is the correct fail-closed-in-prod-only semantic. The boot assertion (D-19) guards the prod case explicitly. Document that **ALLOW_DEV_AUTH defaults to unset = false** and must be set true to enable the dev path.
**Warning signs:** A test env that sets `ALLOW_DEV_AUTH=true` without realizing; a staging env that forgets to set `NODE_ENV=production`. Boot assertion catches the second; only code review catches the first.

### Pitfall 3: `timingSafeEqual` throws on mismatched-length Buffers [CITED: nodejs.org/api/crypto]
**What goes wrong:** `crypto.timingSafeEqual(a, b)` throws `RangeError` if `a.length !== b.length`. A malformed `hash` query param could be any length.
**How to avoid:** Check `a.length === b.length` before calling; return `null` / fail if not. Always hex-decode both sides to Buffers first.
**Warning signs:** Unexpected 500s on auth with malformed initData strings.

### Pitfall 4: Socket.io `socket.data` typing [CITED: socket.io/docs/v4/typescript]
**What goes wrong:** `socket.data.telegramId` is untyped by default; TS won't catch typos.
**How to avoid:** The `Server<Listen, Emit, ServerSide, Data>` generic takes a 4th type arg for `socket.data`. Extend the existing `Server<ExtendedClientEvents, ExtendedServerEvents>` to `Server<ExtendedClientEvents, ExtendedServerEvents, DefaultEventsMap, SocketData>` where `SocketData = { telegramId?: string }`.
**Warning signs:** Handlers reading `socket.data.telegramId` compile without assertion but runtime returns `undefined` because auth didn't set it.

### Pitfall 5: BigInt → string conversion for `Player.id`
**What goes wrong:** Prisma `User.telegramId` is `BigInt @unique`. `TelegramUser.telegramId` in `types/index.ts` is `number` (line 115). JS `number` loses precision above 2^53; Telegram user IDs fit comfortably today but normalizing to `string` everywhere avoids the footgun at the TS boundary.
**How to avoid:** In the refactor, `Player.id` (currently `string` holding socket.id) continues to be `string` — just `String(telegramId)`. `TelegramUser.telegramId` stays `number` for API compatibility; conversion happens at construction. Document that all map keys are `string`-ified telegramIds.
**Warning signs:** A `Map<number, ...>` lookup with a `string` key returning `undefined` — silent bug.

### Pitfall 6: `onPlayerAction` emitted during `removePlayer` mid-hand auto-fold
**What goes wrong:** `Game.removePlayer` (line 100-131) auto-folds the leaving player if they're mid-hand. If `onPlayerAction` is emitted from inside `fold()`, this path will emit a fold event for a player who is disconnecting. Downstream (Phase 3) that might push a bubble for a player already gone.
**How to avoid:** Either emit from `removePlayer` too (with a flag `isLeaving: true`), or document that `onPlayerAction` fires only from the direct action methods and auto-folds are silent. Phase 1 wires no-ops so it doesn't matter yet, but the decision should be made **now** so Phase 3 doesn't rediscover it. **Recommended:** emit from `fold()` method itself (single source), including auto-fold paths — simpler, single call site.
**Warning signs:** In Phase 3, bubbles appearing for players no longer at the table.

## Runtime State Inventory

> This is a refactor phase. The identity-key migration and Prisma migration touch runtime state.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | PostgreSQL `User` table — rows exist with `telegramId` populated; no other app data. No other datastores (no Redis, Mongo, Mem0, Chroma). Hand history doesn't exist yet. | **Data migration: none needed** for telegramId refactor (Prisma side) — telegramId already the unique key. New nullable columns backfill as NULL. `HandHistory` and `AdminAuditLog` are new empty tables. |
| Live service config | No external services with embedded identity. Tables are hardcoded in `server/config/tables.ts` (in-repo). No n8n, no Datadog, no Cloudflare. | None. |
| OS-registered state | None — no Task Scheduler, systemd, pm2 registrations documented. Dev loop is `docker-compose up -d` + `npm run dev`. | None. |
| Secrets / env vars | `.env.example` defines `DATABASE_URL`, `BOT_TOKEN`, `NODE_ENV`, `PORT`. Phase 1 **adds a new env var**: `ALLOW_DEV_AUTH`. | **Update `.env.example`** to include `ALLOW_DEV_AUTH=false` (commented) and document that it must be `true` for the dev bypass path. |
| Build artifacts / installed packages | Server compiles to `dist/` via `tsc`. Vite builds client to `client/dist/`. No Prisma client regeneration gotcha beyond routine `npx prisma generate` after schema edits. | **Plan must include** `npx prisma generate` after schema change and before `tsc` (the Prisma client is imported in `db/prisma.ts` / `UserRepository.ts` and will fail typecheck if stale). |

**In-memory state at runtime (not persisted but worth naming):**
- `TableManager.tables: Map<tableId, Table>` — recreated on each server start, so no migration. A live restart drops everything; this is accepted until Phase 4.
- `userStorage.users` / `profiles` / `socketToTelegram` — in-memory, drops on restart. Refactor rewrites these maps; no carry-over needed.
- **Live-coded socket connections**: if the server restarts mid-refactor-test, any client holding a socket reconnects fresh — no state to preserve.

**Nothing found in category** for (Stored data beyond User, Live service config, OS-registered state). Verified by grepping the repo for external-service indicators and reading docker-compose/CLAUDE.md.

## Code Examples

### Example 1: Tailwind v4 `@theme` block with CSS custom properties

```css
/* client/src/styles/neon.css — Source: tailwindcss.com/docs/theme (v4) */
@import "tailwindcss";

@theme {
  --color-action-fold:  #ff4757;
  --color-action-call:  #00e5ff;
  --color-action-raise: #ffab00;
  --color-action-allin: #ff6d00;
  --color-action-sit:   #4caf50;
  --color-active:       #00e5ff;
  --color-chip:         #ffab00;
  --color-neutral:      #b0bec5;

  /* Derived glow rgba tokens (captured from existing NEON literals) */
  --glow-fold:   rgba(255, 71, 87, 0.35);
  --glow-call:   rgba(0, 229, 255, 0.30);
  --glow-raise:  rgba(255, 171, 0, 0.35);
  --glow-allin:  rgba(255, 109, 0, 0.40);
  --glow-sit:    rgba(76, 175, 80, 0.35);
  --glow-neutral: rgba(176, 190, 197, 0.15);
}
```

### Example 2: Node `crypto.timingSafeEqual` HMAC check

```ts
// Source: nodejs.org/api/crypto.html#cryptotimingsafeequala-b
import crypto from 'crypto';

function verifyInitDataHmac(dataCheckString: string, providedHashHex: string, botToken: string): boolean {
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculated = crypto.createHmac('sha256', secret).update(dataCheckString).digest();
  const provided = Buffer.from(providedHashHex, 'hex');
  if (calculated.length !== provided.length) return false;
  return crypto.timingSafeEqual(calculated, provided);
}
```

### Example 3: Prisma callback pattern in `Game.ts` (mirrors existing setters at line 824-834)

```ts
// Source: server/Game.ts lines 824-834 (existing pattern)
import type { PlayerActionEvent, HandCompleteEvent } from '../types/index.js';

// Field additions
private onPlayerAction: ((evt: PlayerActionEvent) => void) | null = null;
private onHandComplete: ((evt: HandCompleteEvent) => void) | null = null;
private currentHandId: string | null = null;
private handStartChips: number[] = Array(6).fill(0);

// Setters
public setOnPlayerAction(cb: (evt: PlayerActionEvent) => void) { this.onPlayerAction = cb; }
public setOnHandComplete(cb: (evt: HandCompleteEvent) => void) { this.onHandComplete = cb; }

// Emission inside fold(), e.g. — inserted before `this.nextPlayer();`
private emitPlayerAction(player: Player, action: PlayerActionEvent['action'], amount: number) {
  if (!this.onPlayerAction) return;
  this.onPlayerAction({
    tableId: this.tableId,              // Game needs a tableId ref now (add in constructor)
    telegramId: player.id,              // after refactor, Player.id IS telegramId
    seat: player.seat,
    action,
    amount,
    totalBetThisStreet: player.bet,
    potAfter: this.getTotalPot(),
  });
}
```

### Example 4: Socket.io typed `socket.data` [CITED: socket.io/docs/v4/typescript]

```ts
// types/index.ts addition
export interface SocketData {
  telegramId?: string;
}

// server/index.ts
const io = new Server<ExtendedClientEvents, ExtendedServerEvents, {}, SocketData>(server, { /* ... */ });

// In auth handler, on success:
socket.data.telegramId = String(user.telegramId);

// In any downstream handler:
const telegramId = socket.data.telegramId;
if (!telegramId) { socket.emit('errorMessage', 'Not authenticated'); return; }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tailwind v3 `tailwind.config.js` with `theme.extend.colors` | Tailwind v4 `@theme { --color-* }` in CSS | Tailwind 4.0 (Jan 2025) | Single source of truth for CSS vars + utility classes; no JS config needed for tokens |
| `prisma db push` (schema prototyping) | `prisma migrate dev --name <n>` (versioned migrations) | Best practice for any env beyond greenfield local | Required for production-shaped workflows; baseline step needed the first time |
| String `===` on HMAC outputs | `crypto.timingSafeEqual(Buffer, Buffer)` | Node 6.6+ (long-standing) | Prevents timing side-channel leaks in auth paths |
| `EventEmitter`-based game engines | Explicit setter-injected callbacks (this repo's style) | Project convention | Typed contracts, no registration order issues |

**Deprecated/outdated in current code:**
- `auth.ts` line 72: `if (calculatedHash !== hash)` — string compare, non-timing-safe. Replace.
- `auth.ts` lines 117-119, 123-126, 142-148: dev fallback fabricates a user on any failure. Remove entirely (keep only the top-of-function `DEV_BYPASS_ACTIVE` intentional bypass).
- `TableManager.playerToTable: Map<string, string> // socketId -> tableId` (line 11). Key becomes telegramId.
- `userStorage.users: Map<string, TelegramUser> // socketId -> TelegramUser` (line 8). Key becomes telegramId; `socketToTelegram` removed (replaced by `socket.data.telegramId`).
- `Game.addPlayer(id: string, ...)` where `id` is socketId with `telegramId?` as secondary field (line 42). `id` becomes telegramId; socketId tracked separately.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Local dev has no precious data → Option A (reset DB) is acceptable for the first migration | Architecture Patterns | If dev has hand-crafted test data, accepting the reset wipes it. Mitigation: planner confirms or switches to Option B (baseline). |
| A2 | `socket.data` is the simplest place to stash telegramId post-auth, eliminating one map | Architecture Patterns | If typing friction appears, fall back to an explicit `Map<socketId, telegramId>` on TableManager. |
| A3 | Emitting `onPlayerAction` from `Game.fold()` (single call site) covers auto-fold-on-disconnect too | Common Pitfalls (6) | If Phase 3 decides auto-folds should be silent (no bubble), need a parameter or second emission path. Low risk since decision is deferrable. |
| A4 | `ALLOW_DEV_AUTH=false` default via "unset or not === 'true'" is sufficient | User Constraints (D-18) | None — D-18 explicitly locks this semantic. |
| A5 | No production deployment exists yet, so the fail-closed boot assertion has no hot-path production impact to test on real infra | Domain | None — deploy is out of scope per REQUIREMENTS.md OOS list. Verified with manual env-var test at boot. |

## Open Questions

1. **Should `Game.ts` own a `tableId` reference?**
   - What we know: Current `Game.ts` is table-agnostic; `Table.ts` wraps it. The `onPlayerAction` / `onHandComplete` payloads include `tableId`.
   - What's unclear: Cleanest wiring — pass `tableId` at construction (`new Game(tableId)`), or pass it into each callback emission from the Table layer (callback wraps Game's emission)?
   - Recommendation: **Wrap at the Table layer.** Game stays table-agnostic. `Table` sets `game.setOnPlayerAction((evt) => onPlayerAction({ ...evt, tableId: this.id }))`. Matches existing pattern where Table owns contextual state.

2. **Who generates `handId`?**
   - What we know: `handId` appears in `onHandComplete` payload. It should also correlate with future HandHistory rows (one handId, N rows).
   - What's unclear: Game.ts vs Table.ts.
   - Recommendation: **Game.ts generates at `startNextHand()` start**, via `crypto.randomUUID()`. Game exposes `this.currentHandId` read-only for inclusion in `onHandComplete`. `Player.id` (telegramId) + `handId` uniquely identify a HandHistory row.

3. **Does reconnect eviction in Phase 1 emit anything?**
   - What we know: D-07 says "seam exists and closes the prior socket; Phase 4 fills in the `replacedBySession` event payload."
   - What's unclear: Should Phase 1 emit a placeholder event (`connectionReplaced`) so clients don't silently break, or just `socket.disconnect(true)` with no notification?
   - Recommendation: **Silent `socket.disconnect(true)` with a TODO comment pointing at Phase 4.** Matches "scaffolding only" — no client-side behavior to test in Phase 1, no contract to negotiate. Phase 4 adds the typed event.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL 16 (Docker) | Prisma migration | Expected per CLAUDE.md `docker-compose up -d` | 16 | None — migration must run against real PG |
| Node.js | Server build + Prisma CLI | Expected (ES2022 target in `package.json`) | 20.x per `@types/node ^20.11.30` | None |
| `prisma` CLI (^7.4.2) | `prisma migrate dev` | ✓ installed [VERIFIED: package.json devDependencies] | 7.4.2 | None |
| `@tailwindcss/vite` | `@theme` directive | ✓ installed [VERIFIED: client/package.json] | 4.2.1 | None |

**Missing dependencies with no fallback:** None identified — all tools required for Phase 1 are present.

**Note:** Because deploy is out of scope, no production env-var check is possible this phase; the fail-closed boot check is verified locally by temporarily setting `NODE_ENV=production ALLOW_DEV_AUTH=true` and confirming exit(1).

## Validation Architecture

> Phase 6 is the dedicated test-hardening phase; Vitest is not yet installed per CLAUDE.md. Per config.json `ui_test_framework: vitest+rtl`. Phase 1 predates Phase 6, so **automated tests for Phase 1 are limited to manual/smoke verification** — the full Vitest + RTL suite lands in Phase 6 (TEST-01/02/03/04).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | **None installed yet.** Phase 6 installs `vitest + @testing-library/react + jsdom`. |
| Config file | Does not exist (Wave 0 for Phase 6, not Phase 1) |
| Quick run command | `npm run build` (tsc typecheck is the only automated gate Phase 1 can run) |
| Full suite command | `npm run build && cd client && npm run build` (type-check both halves) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BRAND-03 | `GameControls.tsx` and `SeatsDisplay.tsx` contain no hex literals | grep-based smoke check | `rg "#[0-9a-fA-F]{6}" client/src/components/GameControls.tsx client/src/components/SeatsDisplay.tsx \| grep -v var\\(` returns empty | ❌ manual |
| BRAND-03 | Client builds & renders with tokens | smoke (build) | `cd client && npm run build` | ✅ |
| RESILIENCE-01 | Migration applies cleanly | integration (DB) | `npx prisma migrate dev --name v1_mvp_launch && npx prisma migrate status` returns up-to-date | ✅ |
| RESILIENCE-01 | Prisma client typechecks with new fields | unit (types) | `npx prisma generate && npm run build` | ✅ |
| RESILIENCE-03 | Two sockets with same telegramId → older disconnects | manual integration | Manual: open two clients with devId=100001, second connect closes first | ❌ manual |
| RESILIENCE-03 | Table ops work after refactor | manual smoke | Manual: join table, fold, next hand, all-in — existing gameplay unchanged | ❌ manual |
| GAME-04 | Callbacks fire on every action + hand completion | manual instrument | Temporary `console.log` hooks wired in `server/index.ts` during dev, removed before merge | ❌ manual |
| SECURITY-01 | Dev bypass blocked when `NODE_ENV=production && ALLOW_DEV_AUTH=true` via boot exit | smoke | `NODE_ENV=production ALLOW_DEV_AUTH=true BOT_TOKEN=x node dist/server/index.js; echo $?` returns `1` | ❌ manual |
| SECURITY-02 | Empty `BOT_TOKEN` in prod → exit(1) | smoke | `NODE_ENV=production BOT_TOKEN= node dist/server/index.js; echo $?` returns `1` | ❌ manual |
| SECURITY-03 | `timingSafeEqual` used; malformed hash → `null` (not fabricated user) | unit-ish | Manual: connect with garbage `initData` in prod mode → `authError` emitted, no user created | ❌ manual |

### Sampling Rate
- **Per task commit:** `npm run build` (both halves) — fast typecheck is the only gate available.
- **Per wave merge:** manual smoke of joinable gameplay + all four fail-closed env-var matrices.
- **Phase gate:** manual verification checklist for each of the 5 workstreams + green Prisma migration status.

### Wave 0 Gaps
- None for Phase 1 automated tests — the test suite is Phase 6 deliverable.
- A **test checklist document** (e.g., `.planning/phases/01-.../TEST-CHECKLIST.md`) with the env-var and refactor smoke tests is optional but recommended for `/gsd-verify-work` to reference.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Telegram initData HMAC-SHA256, `crypto.timingSafeEqual`, fail-closed on missing BOT_TOKEN |
| V3 Session Management | partial (schema only) | `sessionToken` column lands; consumer in Phase 4 |
| V4 Access Control | partial | Admin allowlist pattern defined for Phase 5; `bannedAt` column lands |
| V5 Input Validation | yes | `initData` parsed via `URLSearchParams`; `user` JSON `JSON.parse` in try/catch; `auth_date` 24h window |
| V6 Cryptography | yes | **Never hand-roll.** Node `crypto` `createHmac` + `timingSafeEqual` only. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged `initData` (no bot signature) | Spoofing | HMAC verification with bot-token-derived secret (Telegram's spec) |
| Timing attack on HMAC string compare | Information disclosure | `crypto.timingSafeEqual` on equal-length Buffers |
| Dev-auth bypass enabled in production | Elevation of privilege | Boot assertion `exit(1)` when `NODE_ENV=production && ALLOW_DEV_AUTH=true` |
| Empty `BOT_TOKEN` → HMAC secret is deterministic empty-key → attacker signs arbitrary initData | Spoofing | Boot assertion `exit(1)` when `NODE_ENV=production && !BOT_TOKEN` |
| Fabricated dev user on HMAC failure bypasses auth | Spoofing | Remove all `createDevUser` fallbacks from `createUserFromInitData` non-bypass path |
| `initData` echoed to logs (later shipped to Sentry) | Information disclosure | Don't log `initData` string; log only length + failure reason (Phase 1). Full PII scrubber = Phase 5 (SECURITY-04). |
| Session fixation across reconnect | Spoofing | RESILIENCE-04 mandates HMAC re-verification every reconnect (not session-token auth). Schema lands now; enforcement Phase 4. |
| Socket hijack via stale socket.id | Tampering | telegramId is the durable identity key (Phase 1 deliverable); socketId is transport-only and evicted on reconnect collision |

## Sources

### Primary (HIGH confidence)
- **Repo** (read directly, no speculation):
  - `server/Game.ts` (836 lines — full read)
  - `server/TableManager.ts` (271 lines — full read)
  - `server/models/Table.ts` (335 lines — full read)
  - `server/models/User.ts` (122 lines — full read)
  - `server/middleware/auth.ts` (182 lines — full read)
  - `server/index.ts` (565 lines — full read)
  - `prisma/schema.prisma` (25 lines — full read)
  - `types/index.ts` (262 lines — full read)
  - `client/src/styles/telegram.css` (full read; confirms `@import "tailwindcss"` Tailwind v4 pattern in use)
  - `client/vite.config.ts` (confirms `@tailwindcss/vite` plugin wired)
  - `client/src/components/GameControls.tsx` (head read — NEON literal at lines 38-45)
  - `client/src/components/SeatsDisplay.tsx` (head read — NEON literal at lines 18-27)
  - `package.json` + `client/package.json` (full reads — version authority)
  - `.planning/config.json`
- **Phase artifacts:**
  - `.planning/phases/01-foundations-design-system/01-CONTEXT.md`
  - `.planning/REQUIREMENTS.md`
  - `.planning/ROADMAP.md`
  - `.planning/STATE.md`
  - `CLAUDE.md`

### Secondary (MEDIUM confidence — cited, not refetched this session)
- `tailwindcss.com/docs/theme` — Tailwind v4 `@theme` directive semantics
- `prisma.io/docs/orm/prisma-migrate/getting-started` — `migrate dev --name` + baselining workflow
- `nodejs.org/api/crypto.html#cryptotimingsafeequala-b` — `timingSafeEqual` length-mismatch throw behavior
- `socket.io/docs/v4/typescript` — `Server` 4th generic for `socket.data` typing
- `core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app` — Telegram initData HMAC spec (auth.ts:10 references)

### Tertiary (LOW confidence)
- None — no claim in this research rests on unverified web search.

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — every lib already in the repo at a known version; no "what should we use?" question.
- Architecture patterns: **HIGH** — all patterns either already exist in repo (callback setter style, `@import tailwindcss`) or are the locked CONTEXT.md decisions (D-01 through D-21).
- Don't hand-roll: **HIGH** — standard Node stdlib / Prisma / Tailwind guidance.
- Common pitfalls: **HIGH** for refactor-mechanics pitfalls (verified from code read); **MEDIUM** for pitfall 1 (local DB state unknowable without asking the user — hence A1).
- Security domain: **HIGH** — threats are standard for Telegram Mini App auth; mitigations are Node stdlib primitives.

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (30 days — stable deps, brownfield refactor not subject to upstream churn)
