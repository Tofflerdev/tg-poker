# Phase 1: Foundations & Design System - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Land every structural contract downstream phases depend on:
1. Neon Strip design tokens as a single source of truth
2. Prisma `v1_mvp_launch` migration (avatar, session/crash columns, ToS, ban, HandHistory, AdminAuditLog)
3. Identity refactor: `telegramId` keys `TableManager`, `userStorage`, and socket mappings
4. `Game.ts` callbacks (`setOnPlayerAction`, `setOnHandComplete`) wired into `server/index.ts` with no gameplay change
5. Fail-closed auth posture (env-var gating, fatal-exit boot check, `timingSafeEqual`, no fabricated dev users on HMAC failure)

No UI redesign rollout (Phase 2), no bubbles/history writes (Phase 3), no reconnect snapshots (Phase 4), no admin or observability (Phase 5).
</domain>

<decisions>
## Implementation Decisions

### Neon Strip Tokens (BRAND-03)
- **D-01:** Tokens exposed as CSS custom properties in a new `client/src/styles/neon.css`, referenced by Tailwind v4 `@theme` block. Single source of truth; runtime-themable.
- **D-02:** Naming is **semantic action-tier**: `--color-action-fold` (red), `--color-action-call` (cyan), `--color-action-raise` (amber), `--color-action-allin` (orange), `--color-action-sit` (green), `--color-active` (cyan), `--color-chip` (amber), `--color-neutral` (gray). Intent-named so palette swaps don't require touching consumers.
- **D-03:** Existing `NEON` literal objects in `GameControls.tsx` and `SeatsDisplay.tsx` are **refactored in this phase** to read from the new tokens. Proves the system end-to-end before Phase 2 redesign rollout. No orphan literal hex values remain in those two files.

### telegramId Identity Refactor (RESILIENCE-03)
- **D-04:** **Big-bang refactor** keying `TableManager`, `userStorage`, and socket handler maps by `telegramId`. No adapter layer; clean substrate for Phase 4.
- **D-05:** `Player` retains a `socketId` field as a per-player **transport handle** (updated on reconnect). `telegramId` is the durable identity key everywhere else.
- **D-06:** The `telegramId ↔ socketId` mapping lives on `TableManager` (in-memory `Map<telegramId, socketId>`), colocated with player ownership.
- **D-07:** Reconnect-time **socket eviction is scaffolded now**: when a new socket connects with a `telegramId` already mapped, the prior socket is closed. The `replacedBySession` event payload + full `GameState` snapshot land in Phase 4 (eviction hook is the seam).

### Game Callback Contract (GAME-04)
- **D-08:** Two setter methods on `Game.ts`: `setOnPlayerAction(cb)` and `setOnHandComplete(cb)`. No EventEmitter, no dispatcher.
- **D-09:** **Sync fire-and-forget** invocation. `Game.ts` calls `cb(...)` synchronously and ignores the return value. Listeners must queue async work themselves (matches PROFILE-02 — game loop never blocks on I/O).
- **D-10:** `onPlayerAction` payload (raw + derived bubble fields):
  ```ts
  {
    tableId: string;
    telegramId: string;
    seat: number;
    action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';
    amount: number;          // chips committed by this action
    totalBetThisStreet: number;
    potAfter: number;
  }
  ```
- **D-11:** `onHandComplete` payload (per-player results):
  ```ts
  {
    handId: string;
    tableId: string;
    completedAt: Date;
    board: string[];
    perPlayer: Array<{
      telegramId: string;
      seat: number;
      holeCards: string[];     // for HandHistory write; server filters before broadcasting
      finalChips: number;
      netDelta: number;
      won: boolean;
      showedDown: boolean;
    }>;
  }
  ```
- **D-12:** In Phase 1, `server/index.ts` wires both callbacks on every `Table` instance and currently does **nothing** (no behavior change). Wiring exists; consumers (bubbles, HandHistory, chip checkpoint) land in Phase 3/4.

### Prisma `v1_mvp_launch` Migration (RESILIENCE-01)
- **D-13:** **Single migration** named `v1_mvp_launch` containing all Phase 1 schema changes. Atomic, matches success criterion #2.
- **D-14:** Additive `User` columns: `avatarId String?`, `currentTableId String?`, `currentSeat Int?`, `currentChips Int?`, `sessionToken String?`, `disconnectedAt DateTime?`, `lastSeenAt DateTime?`, `bannedAt DateTime?`, `tosAcceptedAt DateTime?`, `tosVersion String?`. All nullable; existing rows backfill as NULL.
- **D-15:** `HandHistory` is **per-player rows** (one row per (hand, player)):
  ```
  id          String   @id @default(cuid())
  handId      String
  telegramId  String
  tableId     String
  playedAt    DateTime @default(now())
  board       String[]
  holeCards   String[]
  seat        Int
  netDelta    Int
  finalChips  Int
  showedDown  Boolean
  won         Boolean
  @@index([telegramId, playedAt(sort: Desc)])
  @@index([playedAt])  // retention job
  ```
- **D-16:** `AdminAuditLog` uses **typed core + JSON before/after**:
  ```
  id              String   @id @default(cuid())
  adminTelegramId String
  action          String
  targetType      String
  targetId        String
  beforeJson      Json?
  afterJson       Json?
  createdAt       DateTime @default(now())
  @@index([adminTelegramId, createdAt(sort: Desc)])
  @@index([action, createdAt(sort: Desc)])
  ```
- **D-17:** Targeted indexes (beyond PKs): `HandHistory(telegramId, playedAt DESC)`, `HandHistory(playedAt)`, `AdminAuditLog(adminTelegramId, createdAt DESC)`, `AdminAuditLog(action, createdAt DESC)`, `User(currentTableId)` for Phase 4 boot recovery.

### Auth Hardening (SECURITY-01/02/03)
- **D-18:** Dev bypass requires **both** `ALLOW_DEV_AUTH=true` AND `NODE_ENV !== 'production'`. Default for `ALLOW_DEV_AUTH` is unset/false.
- **D-19:** On boot: if `NODE_ENV=production` AND (`ALLOW_DEV_AUTH=true` OR `BOT_TOKEN` is empty/whitespace-only), log a single fatal line to stderr (`FATAL: refusing to start — <reason>`) and `process.exit(1)`. Check runs before any HTTP/socket listener binds.
- **D-20:** HMAC comparison uses `crypto.timingSafeEqual` over equal-length `Buffer`s. On any validation failure (HMAC mismatch, malformed payload, missing `user`), `validateInitData` returns `null` / throws — never fabricates a dev user.
- **D-21:** SECURITY-04 PII scrubbing (Sentry `beforeSend`, log redactor) is **deferred to Phase 5** where Sentry/PostHog are wired. Phase 1 only ensures auth itself doesn't echo `initData` to logs.

### Claude's Discretion
- File names/paths within the above constraints (`client/src/styles/neon.css`, `server/SessionMap.ts` if extracted, etc.).
- Internal helpers and types as needed to satisfy the contracts above.
- Whether to colocate the `telegramId↔socket` map directly on `TableManager` or extract a small helper inside the same module — both satisfy D-06.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Milestone
- `.planning/PROJECT.md` — vision, Neon Strip language, current state, out-of-scope items.
- `.planning/REQUIREMENTS.md` — full requirement IDs (BRAND-*, RESILIENCE-*, GAME-*, SECURITY-*).
- `.planning/ROADMAP.md` §"Phase 1" — goal, success criteria, requirement mapping.

### Codebase Map
- `.planning/codebase/` — generated codebase docs (CONVENTIONS, STRUCTURE, STACK, etc.).
- `CLAUDE.md` — project-level conventions, Neon Strip UI design notes, commands, env vars.

### Code Touch Points (Phase 1 will modify)
- `server/Game.ts` — add `setOnPlayerAction` / `setOnHandComplete` setters and emission sites.
- `server/TableManager.ts` — telegramId-keyed players; owns `Map<telegramId, socketId>`; eviction hook.
- `server/models/Table.ts` — wire callbacks per Game instance.
- `server/models/User.ts` — telegramId-keyed in-memory store.
- `server/index.ts` — register callbacks (no-op consumers in Phase 1); refactor socket handlers to use telegramId.
- `server/middleware/auth.ts` — fail-closed env gating, `timingSafeEqual`, no fabricated dev user.
- `server/index.ts` boot path — fatal-exit check before listener bind.
- `prisma/schema.prisma` — additive User columns + `HandHistory` + `AdminAuditLog` models.
- `client/src/components/GameControls.tsx`, `client/src/components/SeatsDisplay.tsx` — strip `NEON` literals; consume tokens.
- `client/src/styles/neon.css` (new) — CSS custom properties.
- `client/tailwind.config.*` / Tailwind v4 `@theme` — reference CSS vars.

### Types
- `types/index.ts` — extend with callback payload types (`PlayerActionEvent`, `HandCompleteEvent`).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `NEON` token objects already exist at the top of `GameControls.tsx` and `SeatsDisplay.tsx` — palette values are known, just need promotion to a shared source.
- `pokersolver` already produces the data needed for `onHandComplete.perPlayer` (winners, hand ranks).
- `userStorage` (in-memory) and `UserRepository` (Prisma) already separate transport identity from persistence — telegramId refactor is straightforward.

### Established Patterns
- Socket.io-only transport — no REST surface to also refactor.
- Singleton `TableManager` — natural home for the telegramId↔socket map.
- Prisma single-`User` model — additive migration is low risk.
- Tailwind v4 already in client; `@theme` directive available.

### Integration Points
- `server/index.ts` is the only consumer of `TableManager` socket maps and the only place that validates `initData` — refactor blast radius is contained.
- `Game.ts` already has natural emission points (end of `applyAction`, end of `endHand`) where callbacks slot in.

</code_context>

<specifics>
## Specific Ideas

- Token naming follows action semantics from CLAUDE.md's "Neon Strip" section (Fold red, Check/Call cyan, Raise amber, All-In orange, Sit green, Neutral gray, Chips amber).
- Migration name `v1_mvp_launch` is fixed by RESILIENCE-01 wording.
- Eviction "scaffolding only" means: the seam exists and closes the prior socket; Phase 4 fills in the `replacedBySession` event payload + GameState snapshot resume.
- Callback payloads were sized to satisfy Phase 3 (bubbles, HandHistory) and Phase 4 (chip checkpoint) without requiring later signature changes.

</specifics>

<deferred>
## Deferred Ideas

- **`replacedBySession` event payload + full `GameState` snapshot on reconnect** → Phase 4 (RESILIENCE-04).
- **PII scrubbing in Sentry / logs / analytics** → Phase 5 (SECURITY-04) when observability stack is wired.
- **HandHistory write queue + retention job** → Phase 3 (PROFILE-02, PROFILE-04). Schema lands now; writers later.
- **AdminAuditLog write path + admin namespace** → Phase 5 (ADMIN-*). Schema lands now; writers later.
- **Avatar asset bundling, atomic random-assign on signup, profile re-pick** → Phase 2 (AVATAR-*). Column lands now.
- **ToS/consent gate on `joinTable`** → Phase 5 (COMPLIANCE-04). Columns land now.

</deferred>

---

*Phase: 01-foundations-design-system*
*Context gathered: 2026-04-14*
