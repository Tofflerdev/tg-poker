# Pitfalls Research — NightRiver v1.0 MVP (Brownfield)

**Domain:** Production Telegram Mini App poker — adding reconnect, crash-safety, admin, avatars, hand history, action bubbles, tests, observability, RG/ToS, and prod hardening to an existing Socket.io + Prisma codebase.
**Researched:** 2026-04-14
**Confidence:** HIGH (grounded in `CONCERNS.md`, `reconnect-and-crash-safety.md`, and Socket.io/Telegram docs)

---

## Critical Pitfalls

### Pitfall 1: Reconnect restores state from session token instead of `initData`

**What goes wrong:**
A client reconnects carrying a `sessionToken` from `localStorage`; the server re-binds the new socket to the existing telegramId using only that token. Anyone who exfiltrates a token (shared device, XSS in a webview, Telegram cache) becomes that account.

**Why it happens:**
Developers conflate "session continuity" with "identity". The reconnect path feels like a plain session lookup, and verifying HMAC on every reconnect feels redundant.

**How to avoid:**
Identity is ALWAYS rederived from fresh `initData` HMAC on every connection (incl. reconnect). `sessionToken` only disambiguates "which socket" — it never authenticates. If `initData` fails HMAC, drop the connection regardless of any token. See research doc §1 ("Key rule").

**Warning signs:**
Code path that reads `sessionToken` before (or instead of) `validateInitData`. Tests that pass `sessionToken` with no `initData`.

**Phase to address:** Reconnect / Crash-safety phase.

---

### Pitfall 2: Dev-mode bypass survives into prod via `NODE_ENV` typo

**What goes wrong:**
`NODE_ENV` misspelled (`production ` with trailing space, missing in systemd unit, overridden by Docker `ENV`) → `IS_DEV=true` → `auth.ts` accepts any `initData`, including empty string with a client-supplied `devId`. Full account takeover.

**Why it happens:**
Fail-open defaulting. `NODE_ENV === 'development'` as the gate means every deployment error is an auth bypass. Already live in `server/middleware/auth.ts:15-38` (CONCERNS #3, #4).

**How to avoid:**
- Fail-closed: require explicit `ALLOW_DEV_AUTH=true` AND `NODE_ENV !== 'production'` for the bypass.
- Hard-fail boot if `NODE_ENV === 'production'` AND `BOT_TOKEN` empty/unset.
- Add a prod smoke test that POSTs empty `initData` and asserts 401.
- Remove `createDevUser` fabricated-on-DB-failure path.

**Warning signs:**
Grep for `NODE_ENV === 'development'` gating security logic. Any code path that returns a user object when the DB query throws.

**Phase to address:** Prod Hardening phase — must ship before public launch.

---

### Pitfall 3: Crash recovery restores in-flight hands (stale hole cards / bets)

**What goes wrong:**
Server restarts mid-hand. Boot logic restores `currentTableId`, seat, chips — AND tries to resume the hand from the last-saved state. Hole cards are gone, pot snapshot is stale, turn timer is re-armed against a new deck. Chaos: players see mismatched cards, pot math is wrong, side pots duplicate.

**Why it happens:**
"Persist everything" instinct. Developers don't distinguish economic state from ephemeral hand state.

**How to avoid:**
Persist only at hand boundaries: buy-in, showdown, cashout/leave. On boot, NEVER restore mid-hand — reseat with `currentChips` and `sittingOut=true`, OR refund chips and clear `currentTableId`. The dead hand is forgiven (research doc §2, §4 "Server crash mid-hand").

**Warning signs:**
Any attempt to persist `holeCards`, `bet`, `totalBet`, `turnExpiresAt`, community cards, or deck. DB writes on every bet.

**Phase to address:** Crash-safety phase.

---

### Pitfall 4: Split-brain from double-connect (old socket still alive)

**What goes wrong:**
User opens the Mini App in a second Telegram client (desktop + mobile) or the old socket never cleanly closed. Both sockets emit `playerAction` for the same seat. Race: server accepts both, player folds AND calls in sequence, stack desyncs, hand can deadlock.

**Why it happens:**
Assuming Socket.io cleans up old connections automatically. It doesn't; mobile backgrounding can leave zombie sockets for minutes.

**How to avoid:**
On every successful auth for a `telegramId` already bound to a live socket, call `oldSocket.disconnect(true)` BEFORE rebinding. Emit `replacedBySession` to old client. Key the `playerToTable` map by `telegramId`, not `socketId` (research doc §4 "Double-connect"; also fixes CONCERNS #1).

**Warning signs:**
`playerToTable.get(socketId)` anywhere. No test that covers "same user connects twice".

**Phase to address:** Reconnect phase.

---

### Pitfall 5: Admin panel shares the main socket namespace and auth path

**What goes wrong:**
Admin endpoints bolted onto the default Socket.io namespace and gated by an `isAdmin` boolean on User. A bug in the auth middleware, a missing check on one of 40 admin events, or a client-side enable of an admin button leaks privileged ops. "Grant balance" becomes a money printer.

**Why it happens:**
Convenience — reuse existing `io.on('connection')`. Developers forget that Socket.io middlewares are per-namespace and that every event needs an explicit admin check.

**How to avoid:**
- Separate namespace: `io.of('/admin')`.
- Namespace-level middleware that hard-rejects non-admins.
- Hard-coded admin telegramId allowlist in env (`ADMIN_TELEGRAM_IDS`), NOT a DB flag (DB flags can be flipped via SQL injection in some feature later).
- Audit log: every admin action writes an `AdminAudit` row (who, what, when, target, before/after) BEFORE the mutation is committed.
- CSRF is moot for Socket.io (no cookies on handshake), but validate `Origin` header on upgrade.
- No admin UI bundled in the public client — separate route `/admin` only rendered for allowlisted ids, but don't rely on client-side hiding for security.

**Warning signs:**
Admin events on the default namespace. `if (user.isAdmin)` checks inside individual event handlers. Any admin mutation without a corresponding audit-log write.

**Phase to address:** Admin Panel phase.

---

### Pitfall 6: Buy-in double-spend through race during reconnect storm

**What goes wrong:**
User reconnects, client auto-rejoins table, server reads balance from the in-memory cache (stale — CONCERNS #5, #6), deducts buy-in again. Or: two tabs, two reconnects, both see `balance=1000`, both deduct 500 → negative balance.

**Why it happens:**
Cached balance. Non-atomic check-then-write. Already broken today.

**How to avoid:**
Atomic conditional update: `UPDATE users SET balance = balance - $buyIn WHERE telegramId=$id AND balance >= $buyIn AND currentTableId IS NULL RETURNING balance`. Zero rows → reject. Never trust the in-memory balance for money decisions. Reconnect path re-seats using existing `currentChips`, never re-deducts a buy-in.

**Warning signs:**
Any code path that reads `user.balance` from `UserStorage` before a `joinTable`. Missing `currentTableId IS NULL` guard in buy-in SQL.

**Phase to address:** Reconnect phase + Crash-safety phase (both touch seat/buy-in flow).

---

### Pitfall 7: Hand history writes on the hot path

**What goes wrong:**
`HandHistory.create()` awaited inline at showdown. A DB hiccup (lock, autovacuum, bloat) stalls the game loop — every player at every table waits. At 6 tables × frequent hands, tail latency balloons; tables freeze.

**Why it happens:**
It feels transactional — "I must save the hand before starting the next one." But the next hand doesn't depend on the history row.

**How to avoid:**
- Write history asynchronously via `setImmediate` / a bounded in-memory queue with backpressure — never `await` on the hand loop.
- Batch inserts (e.g., flush every 2s or every 50 rows).
- Drop-oldest on queue overflow; log a counter to observability.
- `currentChips` checkpoint (economic state) IS on the hot path — that one MUST complete, but it's a single row upsert per surviving player, bounded.

**Warning signs:**
`await prisma.handHistory.create` inside `finalizeHand`. History queue with no size cap. P99 hand-completion time growing over days.

**Phase to address:** Profile expansion / Hand history phase.

---

### Pitfall 8: Action bubbles race the next action

**What goes wrong:**
Player A raises → bubble "Raise to 500" animates for 1.2s. Before it finishes, player B auto-folds (timeout fires fast) → bubble "Fold" overwrites A's mid-animation. Users see flicker, miss A's action, think the UI is broken. On slow Android webviews it's worse — bubbles never catch up.

**Why it happens:**
Each `gameState` update triggers a re-render; bubble component keyed by seatIndex only. No queue, no minimum display time, no interruption policy.

**How to avoid:**
- Derive bubbles from a discrete event stream (`playerActed` events), not from diffing `gameState`.
- Per-seat FIFO queue with a minimum visible time (800–1000ms) before the next bubble displaces it.
- Cap queue depth at 2 per seat; drop oldest beyond.
- Use `prefers-reduced-motion` to disable animation entirely for accessibility.
- `will-change: transform, opacity` only during animation, removed after — otherwise GPU layers pile up on low-end Android.

**Warning signs:**
Bubble component re-renders on every `gameState` change. No `AnimatePresence`-equivalent exit delay. No `prefers-reduced-motion` test.

**Phase to address:** Action Bubbles / UI Redesign phase.

---

### Pitfall 9: Telegram `initData` logged as PII

**What goes wrong:**
Observability (Sentry, pino) auto-captures request auth. `initData` string contains the user's Telegram `id`, `first_name`, `username`, photo_url — and the HMAC `hash`. Shipped to a third-party SaaS. GDPR/ToS violation; the hash also enables replay if the log is breached within TTL.

**Why it happens:**
Default serializers include `socket.handshake.auth`. Error boundaries dump the whole event payload.

**How to avoid:**
- Central redaction list in the logger: `initData`, `sessionToken`, `hash`, `auth.*`.
- Log `telegramId` (internal numeric) and a truncated `displayName`, nothing else personal.
- Sentry `beforeSend` scrubs `event.request`, `event.extra.auth`, `event.contexts.socket`.
- Add a unit test that asserts a sample log record with `initData` comes out redacted.

**Warning signs:**
Grep logs for `query_id=` or `auth_date=` (Telegram initData markers). Sentry events with `first_name` in the payload.

**Phase to address:** Observability phase.

---

### Pitfall 10: Avatar random-assignment race on first login

**What goes wrong:**
User opens Mini App twice in quick succession before the first handshake finishes writing their avatar. Two parallel `UPSERT user` calls each pick `floor(random()*20)` → the second overwrites the first. Worse: if the random pick is done client-side, a malicious client always picks the "rare" avatar.

**Why it happens:**
Non-atomic "if null then assign random" pattern. Client-side randomness for a server-authoritative field.

**How to avoid:**
Server-side only. Atomic: `UPDATE users SET avatarId = $random WHERE telegramId = $id AND avatarId IS NULL`. If affected rows = 0 → user already has one, read it. Random pick uses `crypto.randomInt`, not `Math.random`.

**Warning signs:**
Client posting an `avatarId` on signup. `Math.random` in user-creation path.

**Phase to address:** Avatar system phase.

---

### Pitfall 11: Avatar assets served without cache headers / CORS

**What goes wrong:**
20 PNGs served from Express with default headers. Every seat re-fetches per render. On the iOS Telegram webview, cross-origin rules block images loaded from a different host than the main app, silently showing broken images.

**Why it happens:**
Serving from Node/Express with no static-asset strategy. Avatar host differs from app host (nginx route missing).

**How to avoid:**
- Bundle the 20 avatars as static assets in the client build (`client/src/assets/avatars/`). Imported → hashed → cache-forever by Vite.
- Avatar ID on user = integer 0..19 → client maps to bundled asset. Zero network fetches at runtime.
- If ever served dynamically: `Cache-Control: public, max-age=31536000, immutable`, same origin, and `Access-Control-Allow-Origin` scoped to `https://tgp.isgood.host`.

**Warning signs:**
`<img src={avatarUrl}>` where `avatarUrl` is an absolute http URL. Network tab shows avatar fetches on every render.

**Phase to address:** Avatar system phase.

---

### Pitfall 12: Vitest + Tailwind 4 + Socket.io mocks — "works locally, flaky in CI"

**What goes wrong:**
Tailwind 4 uses a new Lightning CSS pipeline; tests that assert on computed styles or class composition pass locally (dev CSS loaded) and fail in CI (no CSS processing). Socket mocks using `vi.fn()` don't replicate event ordering; tests assert on timer-based effects that race the microtask queue.

**Why it happens:**
RTL assumes CSS doesn't matter for behavior tests, but Neon Strip has visual affordances tested via class names. Socket.io's event loop interleaves with fake timers unpredictably.

**How to avoid:**
- Test behavior via roles/aria labels/text, NOT computed styles. Class-name assertions only for feature toggles (e.g., `disabled`).
- Single global `vi.mock('socket.io-client')` with a controllable `MockSocket` helper that exposes `.emitToClient()` — explicit event delivery, no timing surprises.
- `vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval'] })` — do NOT fake `queueMicrotask`/`Promise`. Flush with `await vi.advanceTimersByTimeAsync(n)`.
- One test file per interactive element (already the requirement) — forces small surface area per test.

**Warning signs:**
`getComputedStyle` in tests. Tests that `await new Promise(r => setTimeout(r, 100))`. `vi.useFakeTimers()` with no `toFake` filter.

**Phase to address:** UI Test Suite phase.

---

### Pitfall 13: Telegram viewport + keyboard overlay breaks action controls

**What goes wrong:**
On iOS Telegram, opening the native keyboard (e.g., chat input, name editor) resizes the webview but not via `resize` events — `window.innerHeight` doesn't update consistently. Action bar docked with `position: fixed; bottom: 0` ends up BEHIND the keyboard or above a phantom safe area.

**Why it happens:**
Telegram Mini App viewport is managed by `Telegram.WebApp.viewportHeight` and `viewportStableHeight`, which are the source of truth — not `window.innerHeight`. iOS Safari's `visualViewport` differs from `window`.

**How to avoid:**
- Call `Telegram.WebApp.expand()` on load.
- Use `Telegram.WebApp.onEvent('viewportChanged', ...)` as the viewport source of truth; mirror `viewportStableHeight` to a CSS var `--tg-vh`.
- Action bar bottom: `max(env(safe-area-inset-bottom), 12px)` (already done per CLAUDE.md) — verify on iOS 17+ Telegram build specifically; simulator lies.
- Disable chat input expansion during active turn; use an overlay modal rather than inline input to dodge the keyboard issue entirely.
- Test on BOTH iOS Telegram and Android Telegram (webview engines differ — Android is system WebView, not Chrome).

**Warning signs:**
`window.innerHeight` anywhere in layout code. No `Telegram.WebApp` event listeners. QA only on desktop.

**Phase to address:** UI Redesign phase + dedicated QA pass.

---

### Pitfall 14: Responsible-gaming / ToS gating loophole

**What goes wrong:**
RG disclaimer shown as a dismissible banner on first load. User dismisses, never sees it again. Or: ToS acceptance stored client-side in `localStorage` — user clears storage, never re-prompted. Jurisdictional exposure (some regions require explicit age-gate before play-money even if no real money).

**Why it happens:**
Treating RG/ToS as UI decoration rather than a hard gate tied to account state.

**How to avoid:**
- Store `tosAcceptedAt`, `tosVersion`, `rgAcknowledgedAt` on `User`. Block `joinTable` server-side until non-null and matching current version.
- Version the ToS; bump = re-prompt.
- RG disclaimer in a fixed location (profile + session-start modal), not only a one-time banner.
- Geo-fence explicitly if needed: reject `telegramId` country-code mismatch for restricted regions (Telegram doesn't reveal country, so use IP-based at the websocket handshake — note Telegram webview proxies may obscure this).
- "Play money only" disclaimer on every balance-affecting screen; clearly state no cash-out.

**Warning signs:**
ToS acceptance only in `localStorage`. No `tosVersion` column. RG text only in a footer.

**Phase to address:** Observability & Compliance phase.

---

### Pitfall 15: HMAC timing-unsafe comparison

**What goes wrong:**
`initData` hash verified with `===` or `Buffer.compare` — both are early-exit. A remote attacker with low-jitter path can in theory time-distinguish hash prefixes. More practically: `Buffer.compare` returning 0/non-0 is safe; but `hash === computed` string equality is not.

**Why it happens:**
Copy-paste HMAC verification. Works, tests pass, reviewers don't flag.

**How to avoid:**
`crypto.timingSafeEqual(Buffer.from(hashHex, 'hex'), Buffer.from(computedHex, 'hex'))`. Lengths must match first; wrap in a length check that ALSO doesn't early-return on mismatch (return false after a constant-time compare against a dummy).

**Warning signs:**
`hash === ` or `hash == ` in auth middleware. No `timingSafeEqual` anywhere.

**Phase to address:** Prod Hardening phase.

---

### Pitfall 16: Reconnect grace-period timer stays armed after clean exit

**What goes wrong:**
User disconnects → grace timer starts (30s). User reconnects → timer cleared. But if user cleanly `leaveTable`s BEFORE reconnecting (e.g., from a second device), the grace timer fires anyway and tries to evict a player who's already gone — NPE or double chip-refund.

**Why it happens:**
Multiple code paths mutate session state; each forgets to clear timers owned by another.

**How to avoid:**
Centralize timer lifecycle on a `PlayerSession` object. Every mutation that ends the session (`leaveTable`, `resume`, `evictAfterGrace`) calls `session.clearAllTimers()` as its first act. Unit test: "start grace, then leaveTable, assert no eviction fires at t+30s".

**Warning signs:**
`setTimeout` results stored loose in a `Map` with clears scattered across handlers. No central session object.

**Phase to address:** Reconnect phase.

---

### Pitfall 17: Hand history growth unbounded

**What goes wrong:**
Every hand writes a `HandHistory` row with JSON holeCards + community + showdown. At 6 tables × ~60 hands/hour × 6 players = ~2160 rows/hour ≈ 52k/day. JSON columns bloat; `telegramId` index grows; `GET /profile/history` query at depth 500 scans ever-larger ranges.

**Why it happens:**
"It's just rows, Postgres can handle it." True at 1M, painful at 100M without planning.

**How to avoid:**
- `@@index([telegramId, playedAt(sort: Desc)])` — already in research doc §5. Query uses LIMIT N, not OFFSET.
- Retention: configurable, default 90 days. Nightly job deletes older rows (`DELETE WHERE playedAt < now() - interval '90 days'` with `LIMIT 10000` batched).
- Hot/cold split if ever needed: summary row (won/delta/potAmount/playedAt) vs detail row (holeCards/community/showdown JSON). MVP: single table is fine up to ~1M rows.
- Expose `historyDepth` in profile (user setting) — 50/200/500 — server caps at 500.

**Warning signs:**
No retention job. OFFSET-based pagination. `SELECT * FROM hand_history WHERE telegram_id = ?` without LIMIT.

**Phase to address:** Profile expansion / Hand history phase.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Keep `UserStorage` in-memory cache "for now" | No refactor cost | Stale balance reads leak money (CONCERNS #6) | Never — fix in reconnect phase |
| Admin endpoints on default namespace | Saves namespace boilerplate | One missed check = privilege escalation | Never — separate `/admin` namespace from day 1 |
| Test-skip CSS-level assertions | Green CI | Visual regressions undetected | OK for logic tests; add screenshot tests later |
| `console.log` instead of pino | Zero setup | PII in prod logs, no levels, no redaction | Never in prod — Observability phase replaces |
| `NODE_ENV === 'development'` as sole dev gate | One-line check | Any env typo = auth bypass | Never — require explicit `ALLOW_DEV_AUTH` flag |
| Client-bundled admin UI behind a hidden route | Easy deploy | One bundle leak reveals admin event names | OK if server enforces allowlist; client-hiding is not security |
| Sync hand-history writes | Simple code | Hot-path stall under DB pressure | Never at 6-table scale; async queue from day 1 |
| Dismissible ToS banner only | No user friction | Compliance violation, no record of consent | Never — server-gated `tosAcceptedAt` required |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Telegram `initData` | Trust `user` field directly from the query string | Recompute HMAC with `BOT_TOKEN` over sorted params, `timingSafeEqual` the hash |
| Telegram WebApp viewport | Use `window.innerHeight` | `Telegram.WebApp.viewportStableHeight` + `viewportChanged` event |
| Telegram avatars | Use `user.photo_url` from initData | Ignore — we use in-app avatar system; `photo_url` is optional, CDN expires |
| Socket.io reconnect | Rely on Connection State Recovery alone | CSR as fallback only; always push full snapshot on re-auth (research §1) |
| Sentry | Default PII capture | `beforeSend` scrubber + explicit `initData`/`sessionToken` denylist |
| Prisma | `create` inside a hot loop | Atomic `update ... where` with affected-rows check; batch where possible |
| pokersolver | Trust library output for tied side pots | Add server-side unit tests for tie scenarios (already flagged CONCERNS #9) |
| Tailwind 4 | Assume v3 PostCSS plugin config works | Lightning CSS pipeline; Vite plugin only; test in CI matching prod build |
| Vitest | Import React components that import CSS | Configure `vitest.config.ts` with `css: true` OR mock via `identity-obj-proxy` — pick one and document |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Hand history sync write | P99 hand-finalize latency rises over days | Async queue + batch flush | 6 tables × 50+ hands/hour |
| Unbounded action-bubble queue | Memory growth during long sessions | Cap queue depth at 2/seat, drop-oldest | Long sessions on low-RAM Android |
| Broadcast full `gameState` on every action | WebSocket bytes scale with state size | Delta broadcasts OR accept full push but keep state small (no embedded card assets) | When `gameState` exceeds a few KB or at 36 players |
| Grace-period timer map leak | RSS climbs after many reconnect cycles | Centralized `clearAllTimers` on every session-ending path | Weeks of uptime |
| Avatar PNGs not hashed/immutable | Re-fetches on each render | Vite bundled assets, content-hashed | Immediately on low-bandwidth |
| SeatsDisplay re-renders whole table on one action | Animation jank, dropped frames | `React.memo` per seat keyed by seatIndex; split state | Low-end Android during active hand |
| Prisma N+1 on admin dashboard | Admin page slow to load | Aggregate queries (GROUP BY), single round-trip | Any admin panel view with per-user rows |
| `setInterval` heartbeat not cleared on unmount | Multiple intervals stacking | `useEffect` cleanup discipline; test with React strict mode | After navigating between pages repeatedly |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Dev-auth bypass in prod (CONCERNS #3) | Account takeover, balance theft | Fail-closed `ALLOW_DEV_AUTH` + boot-time assertion |
| `BOT_TOKEN` empty → HMAC against empty secret (CONCERNS #4) | Auth accepts crafted payloads | Hard-fail boot if prod and token empty |
| Non-constant-time HMAC compare | Theoretical timing oracle | `crypto.timingSafeEqual` |
| Admin flag in DB only | SQL injection / data-tier breach → admin | Env-based allowlist cross-checked with DB flag |
| `initData` or `sessionToken` in logs | PII leak, token replay | Central redaction; Sentry `beforeSend` |
| CORS wildcard in prod | Cross-origin session abuse | Explicit origin pin; validate `Origin` on socket upgrade |
| `messageData.text` unbounded (CONCERNS #22) | DoS, UI break, storage bloat | Max 200 chars, per-socket rate limit |
| Client-supplied `avatarId` | User picks rare avatars / injects invalid id | Server-side assignment only; validate 0..19 range |
| Admin grant-balance with no audit log | Rogue admin, no forensics | Mandatory audit row BEFORE mutation commits |
| Client-side ToS enforcement | Compliance gap | Server-gated `tosAcceptedAt` + `tosVersion` check on joinTable |
| Socket event handlers trust `data.telegramId` from client | Impersonation | Always read telegramId from the authenticated socket binding |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Silent reconnect with no UI feedback | User doesn't know if disconnected | Small badge "Reconnecting…" on any `disconnect` event; "Reconnected" toast on resume |
| Action bubble flashes too briefly to read | User misses opponent's action | Min display 800–1000ms, FIFO queue |
| "Reset to default" avatar silently picks random | User expects choice | Present gallery, let user pick; random only on first login |
| Grace-period auto-fold with no warning | User reconnects after fold, confused | Snapshot includes "You were folded while offline" toast (research §4) |
| Hand history shows raw JSON | Unreadable | Render as Neon Strip card rows with hand rank, delta, pot |
| Deposit stub that looks functional | User attempts deposit, frustrated | Clear "Coming soon" state; no text input fields at all |
| RG disclaimer only at signup | User forgets; compliance weak | Also in profile + session-resume modal on long absences |
| Admin-disabled table disappears mid-hand | Players lose chips silently | Graceful shutdown: finish current hand, refund, then flip (research §4 "admin disabled") |
| Keyboard covers action buttons on iOS | User can't act, times out, auto-folds | Viewport-aware layout; disable chat during own turn |
| Action bubble animates during `prefers-reduced-motion` | Accessibility fail, motion sickness | Respect the media query; show static label instead |

## "Looks Done But Isn't" Checklist

- [ ] **Reconnect:** Often missing double-connect eviction — verify opening in 2 tabs disconnects the first with `replacedBySession`.
- [ ] **Reconnect:** Often missing `initData` re-validation — verify reconnect with stale `sessionToken` and forged `initData` is rejected.
- [ ] **Crash safety:** Often missing boot-time `restoreSessions()` — verify killing Node mid-hand and restarting refunds chips OR reseats cleanly.
- [ ] **Crash safety:** Often missing grace-timer cleanup on clean leave — verify `leaveTable` during grace does not double-refund.
- [ ] **Dev bypass removal:** Often missing smoke test — verify prod build with empty `initData` returns 401 in CI.
- [ ] **Admin panel:** Often missing audit log — verify every mutation produces an `AdminAudit` row.
- [ ] **Admin panel:** Often missing namespace isolation — verify admin events on default namespace return "unknown event".
- [ ] **Hand history:** Often missing retention job — verify rows older than threshold are purged.
- [ ] **Hand history:** Often missing async write — verify a DB pause doesn't stall the game loop.
- [ ] **Action bubbles:** Often missing reduced-motion support — verify `prefers-reduced-motion: reduce` renders static labels.
- [ ] **Action bubbles:** Often missing min-display time — verify rapid-fire actions don't flicker.
- [ ] **Avatars:** Often missing atomic assignment — verify concurrent signups can't double-assign.
- [ ] **Observability:** Often missing PII scrubber test — verify a logged `initData` is redacted in captured output.
- [ ] **ToS/RG:** Often missing server gate — verify `joinTable` rejects users with `tosAcceptedAt IS NULL`.
- [ ] **Tests:** Often missing CI parity — verify tests run with prod Tailwind build, not dev CSS.
- [ ] **Telegram viewport:** Often missing iOS QA — verify on a real iOS Telegram client (simulator differs).
- [ ] **Prod hardening:** Often missing `timingSafeEqual` — grep auth code for `===` on hashes.
- [ ] **Prod hardening:** Often missing boot assertion — verify server refuses to start with empty `BOT_TOKEN` in prod.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Dev bypass hit in prod | HIGH | Rotate `BOT_TOKEN`, audit balance deltas since deploy, revert affected `updateBalance` rows, force re-auth for all users, post-mortem |
| Hand-history writes stalled game | MEDIUM | Kill write queue, flush synchronously to a file spool, replay when DB recovers; communicate outage |
| Crash mid-hand, chips not refunded | HIGH | Manual SQL: find users with `currentTableId` set but unseated in-memory, credit `currentChips` back to `balance`, clear `currentTableId` |
| Admin grant-balance abuse | HIGH | Query `AdminAudit` for unusual deltas, reverse via adjustment rows (never delete audit), rotate admin allowlist |
| `initData` logged to Sentry | MEDIUM | Purge Sentry events (API), add scrubber, deploy, document for compliance |
| Avatar double-assignment | LOW | Manual: pick a winner deterministically (smaller telegramId), null the loser's `avatarId`, let them re-pick |
| Reconnect split-brain corrupts stack | HIGH | Reconstruct from last `currentChips` checkpoint + `HandHistory` deltas; refund discrepancy; post-mortem the double-connect path |
| Telegram viewport broken on iOS release | LOW | Hotfix layout to `Telegram.WebApp.viewportStableHeight`, ship; temporarily disable chat-input expansion |
| Action-bubble memory leak on long sessions | LOW | Cap queue; document max-session-length workaround; release hotfix |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Session-token-as-identity | Reconnect | Test: forged initData + valid token → rejected |
| 2. Dev bypass in prod | Prod Hardening | CI smoke test: empty initData → 401; boot fails without BOT_TOKEN |
| 3. Restore in-flight hand state | Crash-safety | Integration test: kill server mid-hand, restart, verify refund OR clean reseat |
| 4. Double-connect split-brain | Reconnect | Test: 2nd connect for same telegramId disconnects 1st with `replacedBySession` |
| 5. Admin namespace leakage | Admin Panel | Test: admin event on `/` namespace returns error; only `/admin` with allowlisted id succeeds |
| 6. Buy-in double-spend | Reconnect + Crash-safety | Concurrency test: 2 parallel joinTable, second returns balance error |
| 7. Sync hand-history write | Profile/Hand History | Load test: DB pause doesn't stall game loop; queue metrics exposed |
| 8. Action-bubble race | Action Bubbles / UI | Test: rapid `playerActed` events → bubbles render sequentially ≥800ms each; reduced-motion honored |
| 9. initData in logs | Observability | Snapshot test: sample log with initData → redacted output |
| 10. Avatar assignment race | Avatar System | Concurrency test: 2 parallel first-logins → one avatarId, not overwritten |
| 11. Avatar asset CORS/cache | Avatar System | Build inspection: avatars are content-hashed, imported; no runtime http fetch |
| 12. Vitest+Tailwind CI flakiness | UI Test Suite | CI pipeline runs tests against prod-like Vite build |
| 13. Telegram viewport/keyboard | UI Redesign + QA | Real-device QA checklist: iOS Telegram, Android Telegram, keyboard open during turn |
| 14. ToS/RG loophole | Observability & Compliance | Test: `joinTable` without `tosAcceptedAt` rejects; ToS version bump re-prompts |
| 15. HMAC timing-unsafe compare | Prod Hardening | Code review gate: grep for `timingSafeEqual`; unit test with mismatched hash |
| 16. Grace-timer leak after clean leave | Reconnect | Test: disconnect → leaveTable → wait 30s → no eviction fires |
| 17. Hand-history unbounded growth | Profile/Hand History | Retention job exists, runs in CI, LIMIT-paginated queries reviewed |

## Sources

- `.planning/codebase/CONCERNS.md` — HIGH — items #1, #2, #3, #4, #5, #6, #22
- `.planning/research/reconnect-and-crash-safety.md` — HIGH — §1, §2, §3, §4
- Socket.io Connection State Recovery — HIGH — https://socket.io/docs/v4/connection-state-recovery
- Telegram Mini App WebApp API — HIGH — https://core.telegram.org/bots/webapps
- Node.js `crypto.timingSafeEqual` — HIGH — https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b
- OWASP Session Management / Timing attacks — MEDIUM — OWASP Cheat Sheet Series
- Industry poker disconnect-protection norms (PokerStars/GG/888) — MEDIUM — public policy pages

---
*Pitfalls research for: NightRiver v1.0 MVP brownfield feature additions*
*Researched: 2026-04-14*
