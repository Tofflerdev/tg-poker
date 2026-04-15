# Codebase Concerns

**Analysis Date:** 2026-04-13

Findings grouped by severity. All file paths are repo-relative.

---

## CRITICAL

### 1. No socket reconnect / session resume logic
- Files: `server/index.ts:532-557`, `server/TableManager.ts:235-237`, `server/models/User.ts:55-70`
- Issue: `disconnect` handler calls `tableManager.handleDisconnect()` → `leaveTable()` → removes player from table immediately. Chips are returned to DB, then `userStorage.removeUser(socketId)` wipes session state. A momentary network blip (common on mobile Telegram) boots the player out of their seat mid-hand.
- Impact: Any disconnect = lost seat, forced cashout, broken UX. Mobile/Telegram environments disconnect often.
- Fix: Grace period (e.g., 30–60 s) where player is marked disconnected but seat retained; re-associate new `socket.id` with existing `telegramId` on re-auth.

### 2. No crash safety — seat/chips are in-memory only
- Files: `server/Game.ts:9` (`seats` in-memory), `server/models/Table.ts:12`, `prisma/schema.prisma`
- Issue: `currentTableId`, seat index, and `currentChips` are held only in the `Game` instance and `TableManager.playerToTable` map. Server restart or crash wipes all in-progress games and in-play chip stacks. Chips return path only runs on clean disconnect/leave.
- Impact: Any process restart = every player at every table loses their buy-in without getting chips back to DB balance.
- Fix: Persist `currentTableId`, `seat`, `currentChips` on `User` model; on boot, either restore or refund.

### 3. Dev-mode auth bypass still active in production build path
- Files: `server/middleware/auth.ts:15-38, 117-124, 143-147, 170-180`
- Issue: Bypass is gated only on `NODE_ENV === 'development'`. If `NODE_ENV` is unset/misspelled in prod env, `IS_DEV=true` silently, and the server accepts ANY `initData` including empty string. `createDevUser` also returns a fabricated user if the DB fails.
- Impact: Anyone can impersonate any `telegramId` by sending `devId` field. Account takeover / balance theft.
- Fix: Default to strict mode unless `IS_DEV` is explicitly true AND `BOT_TOKEN` missing; hard-fail boot if `NODE_ENV !== 'production'` in prod deploys; add integration test.

### 4. `BOT_TOKEN` silently defaults to empty string
- Files: `server/middleware/auth.ts:6`
- Issue: `const BOT_TOKEN = process.env.BOT_TOKEN || ''`. In production (non-dev), with an empty token, the HMAC is computed against empty secret — any initData with a hash calculated using empty secret would pass. More practically, all real Telegram signatures will fail silently, giving no indication the server is misconfigured.
- Fix: Throw on boot if `BOT_TOKEN` missing in production.

### 5. Buy-in deduction race / double-spend vector
- Files: `server/index.ts:254-305, 445-498`
- Issue: Balance check (`user.balance < tableInfo.config.buyIn`) reads from in-memory session cache, not DB. Two concurrent `joinTable` emissions could both pass the check before either writes. `UserRepository.updateBalance` uses `{ increment: amount }` which is atomic at the column level, but a user with balance 500 could join two 500-buy-in tables back-to-back if messages arrive before the first completes.
- Fix: Use a transactional check-and-decrement (e.g., `UPDATE ... WHERE balance >= buyIn RETURNING balance`); reject if no row updated.

---

## HIGH

### 6. Dual user storage — in-memory `UserStorage` + Prisma — inconsistent
- Files: `server/models/User.ts` (entire file), `server/db/UserRepository.ts`, `server/index.ts:145, 167-240`
- Issue: `userStorage` caches `TelegramUser` by socketId including `balance`. Mutations after DB updates (`user.balance = newBalance`) keep cache in sync manually, but any missed path (e.g., `updateStats` in `UserRepository.ts:109-130` writing to DB without updating cache) drifts. `userStorage.profiles` map is set but never meaningfully read (profile endpoint uses `UserRepository.getProfile` directly).
- Impact: Stale balance displayed, auth-check reads stale value (see #5). Dead code confuses maintainers.
- Fix: Remove `UserStorage.profiles`/`getOrCreateProfile`/`updateProfileStats` (unused DB-shadow), make it a pure `socketId → {telegramId, displayName}` session cache; always read balance from DB at action time.

### 7. Table `turnTime` config ignored by game engine
- Files: `server/Game.ts:26` (`TURN_TIME_LIMIT = 30000` hardcoded), `server/config/tables.ts:21,33,45,57,69,81`, `server/models/Table.ts:22-48`
- Issue: Tables define `turnTime: 15/20/30` but `Game` never receives or uses it — all turns are 30 s regardless.
- Impact: High-stakes/Pro tables advertising 15–20 s actually have 30 s. Misleading UX; no enforcement of tempo differences.
- Fix: Pass `config.turnTime * 1000` into `Game` constructor or setter; use it in `startTurnTimer`.

### 8. Table-level `NEXT_HAND_DELAY` also hardcoded
- Files: `server/models/Table.ts:19` (`NEXT_HAND_DELAY = 5000`)
- Issue: Not configurable per table.

### 9. No automated tests anywhere
- Files: Entire project; no `*.test.ts` or `*.spec.ts` in `server/`, `client/`, or `types/`. `package.json` has no `test` script.
- Impact: Core poker engine (`Game.ts`, 835 lines with side pots, betting rounds, showdown) has no safety net. Any refactor risks silent regressions in payout math.
- Fix: Add Vitest/Jest, prioritize `Game.ts` unit tests (side-pot splits, all-in mid-round, blind posting, showdown ties).

### 10. `Game.ts` is a 835-line god class
- Files: `server/Game.ts` (835 lines)
- Issue: Single class owns deck, seats, pots, betting rounds, timers, showdown, state projection. Hard to test in isolation; every change touches unrelated logic.
- Fix: Extract `BettingRound`, `PotCalculator`, `TurnTimer`, `ShowdownEngine` modules.

### 11. Rollback on failed buy-in deduction is a TODO
- Files: `server/index.ts:286-293`
- Issue: Comment: `// Rollback join? For now just log error`. Player seated without paying buy-in on DB failure.
- Fix: If `updateBalance` throws, call `table.removePlayer(socket.id)` and emit `tableError`.

### 12. Production CORS limited but relies on `NODE_ENV`
- Files: `server/index.ts:25-34`
- Issue: Correctly restricts to `https://tgp.isgood.host` only if `NODE_ENV === 'production'`. Combined with #3/#4, an env misconfig opens CORS AND bypasses auth.
- Fix: Fail-closed defaults.

---

## MEDIUM

### 13. Singleton `TableManager` — scaling ceiling
- Files: `server/TableManager.ts:270`, `server/models/User.ts:121` (also singleton)
- Issue: Single-process, in-memory state. Cannot horizontally scale; a second server instance would have separate table sets. Socket.io without Redis adapter also can't broadcast cross-instance.
- Impact: Hard ceiling at one Node process. For 6 tables × 6 seats = 36 players, fine short-term, but any growth requires redesign.
- Fix (future): Redis-backed table state + socket.io-redis adapter, or accept single-process constraint and document it.

### 14. Race: double handling of chip returns on disconnect during scheduled next hand
- Files: `server/index.ts:532-553`, `server/models/Table.ts:156-165`
- Issue: `handleDisconnect` → `leaveTable` → `removePlayer` → `scheduleNextHand` fires callbacks; meanwhile `index.ts` reads `chipsToReturn` before `tableManager.handleDisconnect` executes — then calls `updateBalance(chipsToReturn)`. If player had 0 chips (zero-stack cleanup at `index.ts:85-91` already removed them) there's no double-return, but the ordering (`updateTableState(tableId)` runs AFTER `handleDisconnect` in the code — actually it runs before; line 542 before 543) — but chip capture is line 540, before mutation. Still, no guard against being called twice if `leaveTable` then disconnect both fire.
- Fix: Centralize "return chips" in one path (inside `TableManager.leaveTable`).

### 15. `any` types in hot paths
- Files: `server/index.ts:340, 423, 73` (`result: any`, `table: any`), `server/models/Table.ts:216, 304, 311` (`any`), `server/db/UserRepository.ts:90, 132, 161` (`data: any`, `user: any`)
- Impact: Type safety bypassed at socket-action dispatcher and repository mappers.
- Fix: Define proper `ShowdownResult` propagation; type Prisma user returns directly (remove mapper `any`).

### 16. Biggest-pot stats has dual-write bug pattern
- Files: `server/db/UserRepository.ts:109-130`
- Issue: First `update` sets `biggestPot = Math.max(winnings, 0)` unconditionally (overwrites with smaller pots!), then a follow-up compare-and-set tries to correct it. Because `{ set: Math.max(winnings, 0) }` runs first, a player with biggestPot=10000 winning a 500 pot has biggestPot clobbered to 500, then the corrective check compares 500 > (now-500) and does nothing.
- Fix: Remove the `set:` from the first update; do only the compare-and-update.

### 17. `_telegramId` unused in `removeUser`
- Files: `server/models/User.ts:66-70`
- Issue: Assigned then discarded (`const telegramId = ... ; this.users.delete(socketId); this.socketToTelegram.delete(socketId);`). Dead line, minor.

### 18. Client-build copy strategy at runtime via entrypoint
- Files: `Dockerfile:76-77, 80`, `docker-entrypoint.sh`
- Issue: Client assets copied to volume at container start (`/app/client-dist`). Requires nginx to read the shared volume. Fragile if entrypoint fails partway; nginx serves empty dir.
- Fix: Bake client into nginx image directly, avoid runtime copy.

### 19. `nginx/nginx.conf` not reviewed for HTTPS/HSTS/rate-limit
- Files: `nginx/nginx.conf`
- Status: Config present but not audited here; verify TLS, WebSocket upgrade headers, rate limiting, socket.io path proxy.

### 20. Plaintext DB creds in default connection string
- Files: `docker-compose.yml`, memory `postgres://poker:poker@...`
- Issue: Weak default credentials documented; ensure `docker-compose.prod.yml` uses secrets/env-file and not these defaults.

---

## LOW

### 21. Name-length validation client/server mismatch risk
- Files: `server/index.ts:217-220` (2–20 chars), `prisma/schema.prisma:13` (VarChar(50))
- Issue: DB allows 50 but server rejects >20. Consistent, but client should match to avoid user confusion.

### 22. Chat has no rate limit / no length cap
- Files: `server/index.ts:503-527`
- Issue: No check on `messageData.text.length`. Spam/DoS vector.
- Fix: Max 200 chars, per-socket rate limit (e.g., 1 msg/sec).

### 23. Chat message ID not cryptographically unique
- Files: `server/index.ts:516` (`${socket.id}-${Date.now()}`)
- Fine for display; note only.

### 24. Auto-fold-on-timeout depends on single callback wire
- Files: `server/Game.ts:757-766`, `server/models/Table.ts:43-48`
- Issue: `onTurnTimeout` set on Table only notifies state change; actual fold logic lives inside `Game`. If the callback wire is missed (e.g., new code path), player hangs forever. Acceptable now but test coverage needed (see #9).

### 25. `repomix-output.txt` / `.xml` committed?
- Files: `repomix-output.txt`, `repomix-output.xml` in repo root
- Status: Large generated artifacts; verify `.gitignore` and remove if tracked.

### 26. `prisma.config.ts.bak` leftover
- Files: `prisma.config.ts.bak`
- Fix: Delete.

### 27. `dev.db` file present in repo root
- Files: `dev.db`
- Issue: SQLite file in a Postgres project — likely stale. Delete.

### 28. Extensive Russian-language code comments
- Files: `server/Game.ts`, `server/models/Table.ts` — many comments in Russian.
- Note: Not a defect, but mixed-language codebase complicates onboarding for non-Russian speakers.

### 29. `console.log`-only logging
- Files: throughout `server/`
- Fix: Structured logger (pino) with levels; redact PII.

### 30. No `healthz` endpoint separate from `/`
- Files: `server/index.ts:40-48`
- `/` returns internal state (table counts, player counts). OK for debug but shouldn't be the prod liveness probe (leaks info). Add `/healthz` returning 200 only.

---

## Test Coverage Gaps (critical untested areas)

- **`server/Game.ts` betting engine** — side pots, all-in splits, blind posting edges, showdown ties. Highest risk of silent monetary bugs.
- **`server/middleware/auth.ts`** — HMAC validation path; no test prevents regression of dev-bypass into prod.
- **`server/db/UserRepository.ts`** — daily-bonus windows, concurrent balance updates, biggest-pot logic (#16).
- **Reconnect flow** — doesn't exist yet; must come with tests.

---

## MVP Blockers (from memory — verified)

| # | Blocker | Status | Evidence |
|---|---------|--------|----------|
| 1 | Deploy infra (Dockerfile, nginx, HTTPS) | **Partial** | `Dockerfile`, `docker-compose.prod.yml`, `nginx/nginx.conf`, `deploy.sh` exist; TLS/nginx config unverified (#19) |
| 2 | Reconnect logic | **Missing** | See #1 above |
| 3 | Crash safety (persist currentTableId/chips) | **Missing** | See #2 above |
| 4 | Dev-mode auth disabled in prod | **Fragile** | See #3, #4 above |
| 5 | In-memory User alongside Prisma consistency | **Inconsistent** | See #6 |
| 6 | CORS restricted to prod origin | **Done (conditional)** | `server/index.ts:26-28`, but depends on NODE_ENV (#12) |

---

*Concerns audit: 2026-04-13*
