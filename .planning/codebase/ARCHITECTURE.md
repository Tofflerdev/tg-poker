# Architecture

**Analysis Date:** 2026-04-13

## Pattern Overview

**Overall:** Socket.io-centric monolith with a layered backend (transport → table registry → table wrapper → game engine) and a thin React SPA client driven entirely by server-pushed state.

**Key Characteristics:**
- **Socket.io is the sole transport for gameplay** — REST exists only for health (`GET /`) and table listing fallback (`GET /api/tables`). All game actions, chat, auth, and profile flow through socket events.
- **Authoritative server** — the `Game` engine on the server is source of truth; the client renders `GameState` snapshots pushed after every action.
- **Singleton `TableManager`** — one process-wide registry holding 6 predefined in-memory tables. Exported as `tableManager` from `server/TableManager.ts`.
- **Per-table Socket.io rooms** — `socket.join(tableId)` groups players; per-player personalised state is emitted via `io.to(socketId).emit(...)` so hidden cards stay hidden.
- **Shared types directory** — `types/index.ts` is the single source of truth imported by both server and client (relative `../../types`).

## Layers

**Transport / Socket handlers (`server/index.ts`):**
- Purpose: Wire Socket.io events to business logic; no game rules here.
- Responsibilities: auth dispatch, table join/leave with buy-in/cashout DB writes, forward player actions (`fold/check/call/raise/allIn/sitOut/sitIn/showCards`) to the correct `Table`, chat broadcast, disconnect cleanup.
- Depends on: `tableManager`, `userStorage`, `UserRepository`, `validateInitData`.

**Table Registry (`server/TableManager.ts`):**
- Purpose: Singleton managing all `Table` instances and `socketId → tableId` mapping.
- Responsibilities: create predefined tables on boot (`initializePredefinedTables` dynamic-imports `config/tables.ts`), find tables, route joins (`joinTable`), handle disconnects (`handleDisconnect → leaveTable`), expose summaries.
- Depends on: `models/Table.ts`, `models/User.ts`, `config/tables.ts`.

**Table Wrapper (`server/models/Table.ts`):**
- Purpose: One instance per poker table. Owns a `Game` instance plus table-level concerns (status, auto-start timers, callbacks).
- Responsibilities: seat allocation (`findFirstAvailableSeat`, `isSeatAvailable`), auto-start loop (`tryStartNextHand`, `scheduleNextHand` with a 5000ms `NEXT_HAND_DELAY`), forwards actions to `Game`, bridges `Game` callbacks (`onStateChange`, `onShowdown`, `onTurnTimeout`) to the socket layer.
- Depends on: `Game`.

**Game Engine (`server/Game.ts`, 835 lines):**
- Purpose: Pure poker logic. No socket or DB awareness.
- Responsibilities: deck management (`Deck.ts`), hand lifecycle (`startNextHand → postBlinds → preflop/flop/turn/river → showdown`), betting round validation (`isBettingRoundComplete`), side-pot calculation (`calculatePots`), hand evaluation via `pokersolver`'s `Hand.solve` / `Hand.winners`, turn timer (`TURN_TIME_LIMIT = 30000ms` internal constant; table-config `turnTime` is not currently piped in), personalised state projection (`getStateForPlayer` hides opponents' `hand` as `"back"` unless showdown/all-in runout).
- Depends on: `Deck.ts`, `pokersolver`, shared types.

**Persistence (`server/db/`):**
- Purpose: Prisma-backed durable storage for user identity, balance, and stats.
- Responsibilities: `UserRepository.updateBalance` (buy-in deducts, leave/disconnect refunds chip stack), `claimDailyBonus` (balance<1000 + 24h window, sets to 1000), `getProfile`, `updateProfile`.
- Depends on: `@prisma/client` via `server/db/prisma.ts`.

**Auth (`server/middleware/auth.ts`):**
- Purpose: Validate Telegram `initData` HMAC with `BOT_TOKEN`; create/upsert user via `UserRepository`.
- Dev mode: accepts empty/mock `initData` with an optional `devId` so multi-tab testing works (`?player=1..6` on client → deterministic ID 100001..100006).

**Client SPA (`client/src/App.tsx`):**
- Single Socket.io connection at module load (`SOCKET_URL = window.location.origin` in prod, `localhost:3000` in dev).
- View state machine: `loading → auth → menu → tables → game | profile`.
- Holds `gameState`, `showdown`, `mySeat`, `currentUser`, `tables` in React state; every server `state` event replaces `gameState` wholesale.

## Data Flow

**Hand lifecycle (authoritative, server-driven):**

1. Player emits action socket event (e.g. `raise(amount)`).
2. `server/index.ts` `handleGameAction` routes to `table.raise(socketId, amount)` → `Game.raise`.
3. `Game` mutates internal state, calls `nextPlayer()`. If `isBettingRoundComplete()`, calls `nextStage()` which recomputes pots (`calculatePots`) and deals flop/turn/river — or if all remaining players are all-in, `runOutBoard()` auto-runs the board with 1s delays, emitting `onStateChange` between streets.
4. `Game.startTurnTimer` schedules a 30s auto-fold for the next actor; `turnExpiresAt` timestamp is included in every `GameState` for client countdown.
5. On river or fold-to-winner, `Game.showdown()` runs `pokersolver.Hand.winners` per pot, distributes chips, sets `lastShowdown`, fires `onShowdown`.
6. `Table`'s `onShowdown` bubbles up; `server/index.ts handleTableShowdown` broadcasts `showdown` to every `socketId` at the table, evicts zero-stack players (converted to spectators with "Ваш стек равен 0" message), then calls `updateTableState`.
7. After a 100ms tick, `Table.scheduleNextHand()` sets `game.nextHandIn = Date.now() + 5000` and schedules `Game.startNextHand()`. This loop runs continuously while ≥2 eligible players remain.

**State fan-out:**
- Every state mutation calls `updateTableState(tableId)` in `server/index.ts`, which iterates `table.getAllPlayerIds()` and emits a per-player `getStateForPlayer(socketId)` projection — opponents' hole cards are replaced with `"back"` strings.

**Join flow:**
1. Client `joinTable({tableId, seat})` → server checks balance vs `config.buyIn`, leaves any current table, calls `tableManager.joinTable`, deducts buy-in via `UserRepository.updateBalance(-buyIn)`, emits `balanceUpdate` + `tableJoined`, then `updateTableState`.
2. `Table.addPlayer` → `Game.addPlayer` (sets `owesBlind` if the rotation is alive — the player posts a dead BB in the next `startNextHand`) → `tryStartNextHand` kicks off the auto-start loop if the table was idle.

**Leave / disconnect:**
- Both `leaveTable` and `disconnect` call `tableManager.leaveTable` / `handleDisconnect`, read the player's current `chips` from game state, and credit that amount back to `User.balance`. In-hand leaves trigger `Game.removePlayer`'s auto-fold branch (advances `currentPlayer` if the leaver was on the button).

**State Management (client):**
- All game state is server-owned; `App.tsx` holds a single `gameState` object updated by the `state` event. `mySeat` is derived by finding `socket.id` in `seats`.

## Key Abstractions

**`Game`** (`server/Game.ts`):
- Pure engine with no I/O. Exposes imperative methods (`fold/check/call/raise/allIn/showCards/sitOut/sitIn`) returning `boolean` success flags. Guards every action through `getCurrentPlayerIfValid`.
- Three callbacks: `setOnStateChange`, `setOnShowdown`, `setOnTurnTimeout`.

**`Table`** (`server/models/Table.ts`):
- Facade over `Game` + auto-start scheduler + `playerIds: Set<string>`. Wires `Game`'s callbacks to `onStateChangeCallback` which the socket layer subscribes to.

**`Pot`** (shared type):
- `{ amount, eligiblePlayers: string[], name }`. An array of these is recomputed at every `nextStage()` and at final `showdown()`.

**`Player`** (shared type):
- Includes `bet` (current round), `totalBet` (full hand — used for side-pot math), flags `folded / allIn / acted / showCards / owesBlind / sittingOut`.

## Entry Points

**Server boot:** `server/index.ts`
- Creates Express app + `http.Server` + `Server<ExtendedClientEvents, ExtendedServerEvents>` (Socket.io with typed events).
- CORS: `https://tgp.isgood.host` in prod, localhost:5173/3000 in dev.
- At T+1000ms, binds `setupTableEvents(tableId)` for every table produced by `tableManager.getAllTablesInfo()` (delayed because `TableManager` loads `config/tables.ts` via dynamic `import()`).

**Client boot:** `client/src/index.tsx` → `App.tsx`
- Single `io(SOCKET_URL)` on module load — shared across all views.

## Error Handling

**Strategy:** Optimistic server-side validation with user-facing error socket events. Game methods return `false` on invalid action; socket layer emits `errorMessage` to the offending socket only.

**Patterns:**
- `socket.emit("errorMessage", "...")` for gameplay violations.
- `socket.emit("tableError" | "authError" | "profileError" | "dailyBonusError", msg)` for category-specific failures.
- DB operations wrapped in try/catch; failures logged with `console.error` and surfaced as generic "Server error" messages.
- No rollback for partial failures (e.g. join succeeds but buy-in deduction throws — noted as TODO in `server/index.ts:292`).

## Cross-Cutting Concerns

**Logging:** `console.log / console.warn / console.error` prefixed with bracketed module tags (`[Auth]`, `[Socket]`, `[Table]`, `[Chat]`, `[Tables]`, `[DailyBonus]`, `[TableManager]`).

**Validation:** Inline in socket handlers (balance vs buy-in, `displayName` length 2–20). Game rules validated inside `Game` methods.

**Authentication:** Telegram `initData` HMAC-SHA256 via `crypto-js` in `server/middleware/auth.ts`. Session cache = in-memory `userStorage: Map<socketId, TelegramUser>` (`server/models/User.ts`). Durable identity = `User` table (Prisma).

**Personalised state:** `Game.getStateForPlayer(socketId)` clones `GameState` and masks every other player's `hand` to `["back", "back"]` unless showdown (non-fold) or all-in runout, or the player explicitly chose `showCards`.

**Auto-start loop:** Driven by `Table.scheduleNextHand` setTimeout (5s). `game.nextHandIn` timestamp is exposed to the client for countdown UI.

**Turn timer:** `Game.TURN_TIME_LIMIT = 30000ms` hardcoded. `turnExpiresAt` timestamp in `GameState` lets the client render a depleting ring (`SeatsDisplay.tsx TimerRing`). On timeout, server calls `fold(currentPlayerId)` and fires `onTurnTimeout`.

**Side pots:** `Game.calculatePots` builds pots from unique `totalBet` levels; folded players contribute chips but are excluded from `eligiblePlayers`. `showdown()` resolves each pot independently via `pokersolver.Hand.winners` restricted to that pot's eligible set, distributing `Math.floor(amount / winners.length)` (floor-division remainder is lost — minor concern).

---

*Architecture analysis: 2026-04-13*
