---
phase: 02-design-system-rollout-avatars
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - types/avatars.ts
  - types/index.ts
  - client/src/assets/avatars/manifest.ts
  - client/src/assets/avatars/README.md
  - server/db/UserRepository.ts
  - server/index.ts
  - client/src/components/SeatsDisplay.tsx
autonomous: false
requirements: [AVATAR-01, AVATAR-02, AVATAR-03, AVATAR-04]
must_haves:
  truths:
    - "A new user logging in for the first time receives a non-null `avatarId` atomically inside `UserRepository.findOrCreate` (single INSERT with avatarId column populated)"
    - "An existing user with avatarId IS NULL gets one assigned idempotently on next findOrCreate (one-time backfill, single UPDATE)"
    - "Server validates `updateAvatar` payload against the AVATARS allowlist before persisting; unknown slugs are rejected"
    - "Server seat→Player projection populates `Player.avatarId` from `User.avatarId` so SeatsDisplay can resolve avatars"
    - "SeatsDisplay renders the manifest-resolved WebP for each seat; falls back to initial letter only if avatarId is null/unknown (D-14)"
    - "Telegram `photo_url` is no longer rendered anywhere downstream of this plan (D-15)"
    - "Client production build hashes all 20 WebPs into dist/ via Vite asset pipeline (D-08)"
  artifacts:
    - path: "types/avatars.ts"
      provides: "Single source AVATARS const + AvatarId type + randomAvatarId() helper, no I/O"
      exports: ["AVATARS", "AvatarId", "randomAvatarId"]
    - path: "client/src/assets/avatars/manifest.ts"
      provides: "Vite-hashed URL map keyed by AvatarId + avatarUrl(id) resolver"
      exports: ["AVATARS", "AvatarId", "avatarUrl"]
    - path: "client/src/assets/avatars/{slug}.webp"
      provides: "20 WebP assets, one per locked species slug"
    - path: "server/db/UserRepository.ts"
      provides: "Atomic avatar assign in create + idempotent backfill in else branch + tosAcceptedAt + avatarId surfaced via mapToTelegramUser"
    - path: "server/index.ts"
      provides: "updateAvatar socket handler with allowlist validation"
    - path: "client/src/components/SeatsDisplay.tsx"
      provides: "Avatar component reads player.avatarId via manifest resolver"
  key_links:
    - from: "server/db/UserRepository.ts"
      to: "types/avatars.ts"
      via: "import { randomAvatarId } from '../../types/avatars.js'"
      pattern: "from '\\.\\./\\.\\./types/avatars\\.js'"
    - from: "client/src/assets/avatars/manifest.ts"
      to: "types/avatars.ts"
      via: "import { AVATARS, AvatarId } from shared module (no .js extension on client)"
      pattern: "from '\\.\\./\\.\\./\\.\\./\\.\\./types/avatars'"
    - from: "client/src/components/SeatsDisplay.tsx"
      to: "client/src/assets/avatars/manifest.ts"
      via: "avatarUrl(player.avatarId)"
      pattern: "avatarUrl\\("
    - from: "server/index.ts updateAvatar handler"
      to: "AVATARS allowlist"
      via: "AVATARS.includes(payload.avatarId) check before UserRepository.updateProfile"
      pattern: "AVATARS\\.includes"
---

<objective>
Ship the complete avatar system end-to-end: shared `types/avatars.ts` constant + 20 WebP assets + Vite-hashed manifest + atomic server assign on user create + idempotent backfill for grandfathered users + server-side `updateAvatar` socket handler with allowlist validation + `Player.avatarId` broadcast wiring + `SeatsDisplay` avatar resolver. Replaces Telegram `photo_url` rendering everywhere (D-15).

Per D-09, the species list is a **blocking gate** — Task 1 proposes it and waits for user approval before Task 2 (asset generation) runs.

Purpose: AVATAR-01..04 in one cohesive vertical slice. Subsequent page redesign plans consume `avatarUrl()` and `AVATARS` directly with zero further plumbing.

Output: 20 WebP assets, 1 shared types module, 1 client manifest, server `findOrCreate`/`updateAvatar`/seat-projection updates, `SeatsDisplay` migrated. Avatar picker UI is built in Plan 06 (Profile redesign) — this plan only ships the substrate.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/02-design-system-rollout-avatars/02-CONTEXT.md
@.planning/phases/02-design-system-rollout-avatars/02-RESEARCH.md
@.planning/codebase/STACK.md
@.planning/codebase/ARCHITECTURE.md
@server/db/UserRepository.ts
@server/index.ts
@types/index.ts
@client/src/components/SeatsDisplay.tsx
@prisma/schema.prisma

<interfaces>
<!-- Existing types/index.ts shapes (Phase 1) -->
```typescript
export interface Player {
  id: string;             // telegramId stringified
  socketId?: string;
  telegramId?: number;
  displayName?: string;
  avatarUrl?: string;     // ← will keep as fallback during transition; new field added
  // ... seat, hand, chips, etc.
}

export interface TelegramUser {
  id: string;
  telegramId: number;
  username?: string;
  displayName: string;
  firstName: string;
  avatarUrl?: string;     // ← legacy; ignored in rendering after this plan
  balance: number;
  lastDailyRefill?: string;
  canClaimDaily: boolean;
  // additions in this plan: avatarId?: AvatarId; tosAcceptedAt?: string;
}
```

<!-- This plan's exported API -->
```typescript
// types/avatars.ts (SHARED — server uses .js suffix per NodeNext, client omits)
export const AVATARS: readonly string[];        // exact 20 slugs, locked in Task 1
export type AvatarId = typeof AVATARS[number];
export function randomAvatarId(): AvatarId;

// client/src/assets/avatars/manifest.ts
export { AVATARS, type AvatarId };
export function avatarUrl(id: AvatarId | null | undefined): string | undefined;

// types/index.ts new socket events
ExtendedClientEvents.updateAvatar: (payload: { avatarId: AvatarId }) => void;
ExtendedServerEvents.avatarUpdated: (payload: { avatarId: AvatarId }) => void;

// Player.avatarId added (string), TelegramUser.avatarId + tosAcceptedAt added.
```

<!-- Existing UserRepository.findOrCreate (server/db/UserRepository.ts:6-32) -->
The `create` branch must add `avatarId: randomAvatarId()` to the data object (D-12 atomic single INSERT). The `else` branch must, when `user.avatarId == null`, perform an idempotent `prisma.user.update({ where: { id: user.id }, data: { avatarId: randomAvatarId() } })` to backfill grandfathered users (RESEARCH Open Q4). avatarUrl from Telegram is NOT written on create (D-15).

<!-- Existing socket handler patterns (server/index.ts) -->
`updateProfile`, `claimDailyBonus` follow request → DB write → ack-event back to client. `updateAvatar` follows the same shape: validate `payload.avatarId ∈ AVATARS`, call `UserRepository.updateProfile(telegramId, undefined, payload.avatarId)` (or new `updateAvatarId` method), emit `avatarUpdated`.

<!-- Existing seat→Player serializer -->
Server currently builds Player objects in Game.ts / TableManager / index.ts. The seat broadcaster currently sets `avatarUrl` from User.avatarUrl (Telegram photo). This plan finds those sites and additionally writes `avatarId` from User.avatarId. Grep `avatarUrl:` under server/ to locate.
</interfaces>
</context>

<tasks>

<task type="checkpoint:decision" gate="blocking">
  <name>Task 1: Lock 20-species avatar list (D-09 gate)</name>
  <decision>Approve the final list of 20 species slugs that will become file names (e.g., `fox.webp`) and the durable `AvatarId` enum. Slug = filename = DB value forever (D-10).</decision>
  <context>
    Per D-09, Claude proposes a balanced mix and the user approves before any binary asset is generated. Slugs are lowercase ASCII, single word, hyphen-free. Renaming later requires a backfill migration, so this is locked at this gate.

    Proposed list (balanced across mammals / birds / reptiles / aquatic, varied moods):

    Mammals (8): `fox`, `wolf`, `bear`, `tiger`, `panda`, `raccoon`, `lion`, `rabbit`
    Birds (4): `owl`, `eagle`, `flamingo`, `penguin`
    Reptiles (3): `crocodile`, `chameleon`, `cobra`
    Aquatic (3): `shark`, `octopus`, `dolphin`
    Other (2): `frog`, `bat`

    Total: 20. Even distribution across vertebrate classes; mix of "intimidating" (shark, wolf, cobra, eagle) and "playful" (panda, raccoon, frog, penguin) so users get options matching their self-image.

    Also lock the **AI prompt brief** for asset generation (executor refines if needed):
    > Style: dark-background neon-rim portrait, anthropomorphic, head-and-shoulders, holding/playing poker (cards or chips visible). 256×256 square. Cyan/amber neon rim lighting matching Neon Strip palette. Same camera distance, same lighting setup, same crop across all 20. Background near-black or transparent. Subject expression: confident/playful, character-appropriate.
  </context>
  <options>
    <option id="approve-as-proposed">
      <name>Approve list and prompt brief as proposed</name>
      <pros>Balanced mix, 20 evocative animals, locks the contract immediately.</pros>
      <cons>None — list can be tweaked at execute time but slugs become permanent.</cons>
    </option>
    <option id="approve-with-edits">
      <name>Approve with substitutions</name>
      <pros>User gets exact creative control over the cast.</pros>
      <cons>Requires user to specify swaps inline (e.g., "replace bat with hawk").</cons>
    </option>
    <option id="defer-to-executor">
      <name>Reject — re-propose</name>
      <pros>—</pros>
      <cons>Blocks the entire phase; not recommended unless list is unusable.</cons>
    </option>
  </options>
  <resume-signal>Reply with: "approve-as-proposed", or "approve-with-edits: <swap list>", or "defer".</resume-signal>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Create types/avatars.ts + 20 WebP assets + client manifest</name>
  <files>types/avatars.ts, client/src/assets/avatars/manifest.ts, client/src/assets/avatars/README.md, client/src/assets/avatars/{slug}.webp (×20)</files>
  <action>
    Create `types/avatars.ts` exporting `AVATARS = [...20 locked slugs] as const`, type `AvatarId = typeof AVATARS[number]`, and `randomAvatarId(): AvatarId` using `Math.floor(Math.random() * AVATARS.length)`. Per RESEARCH Q8 / Pitfall 1: pure module — no I/O, no fs, no imports beyond TS. Server consumers will import with `.js` suffix (NodeNext); client consumers without extension.

    Generate 20 WebP avatars matching the locked species list and prompt brief from Task 1. Output to `client/src/assets/avatars/{slug}.webp`. Target 256×256, quality ~80, ≤15 KB each, total ≤300 KB (RESEARCH §Q3 budget). Use whatever image-generation MCP tool is available; if none, ask the user to supply assets matching the brief and pause until provided.

    Create `client/src/assets/avatars/manifest.ts`. Build a STATIC `Record<AvatarId, string>` literal where each entry is `new URL('./{slug}.webp', import.meta.url).href` — one explicit literal per slug (RESEARCH Pitfall 2: no template strings, no loops, Vite needs static analysis). Export `AVATARS`, `AvatarId` re-exports, and `avatarUrl(id: AvatarId | null | undefined): string | undefined` returning `URLS[id]` or `undefined`. Re-import AVATARS from `../../../../types/avatars` (no extension on client per RESEARCH Q8).

    Create `client/src/assets/avatars/README.md` — short note: "20 WebP avatars, slug-keyed, hashed by Vite via manifest.ts. Add/remove a slug = update types/avatars.ts AVATARS const + add/delete the .webp + add/remove the entry in manifest.ts URLS literal. No DB migration needed (D-10)."
  </action>
  <verify>
    <automated>cd client && npm run build && node -e "const m = require('fs').readdirSync('client/src/assets/avatars').filter(f => f.endsWith('.webp')); if (m.length !== 20) { console.error('Expected 20 webps, got ' + m.length); process.exit(1); }"</automated>
  </verify>
  <done>20 WebP files exist (one per locked slug); types/avatars.ts compiles standalone (`tsc --noEmit types/avatars.ts`); manifest.ts URL literals reference each slug exactly once; client build succeeds and emits hashed WebPs into dist/.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Wire shared types + server (UserRepository atomic assign + backfill + updateAvatar handler) + Player.avatarId broadcast</name>
  <files>types/index.ts, server/db/UserRepository.ts, server/index.ts</files>
  <action>
    In `types/index.ts`:
    - Add `avatarId?: string` to the `Player` interface (alongside existing `avatarUrl?` — keep both during transition per RESEARCH Q10).
    - Add `avatarId?: string` and `tosAcceptedAt?: string` to the `TelegramUser` interface.
    - Extend `ExtendedClientEvents` with `updateAvatar: (payload: { avatarId: string }) => void` and `acceptTos: (payload: { version: string }) => void` (acceptTos handler ships in Plan 08; type lands here so server build stays clean).
    - Extend `ExtendedServerEvents` with `avatarUpdated: (payload: { avatarId: string }) => void` and `tosAccepted: (payload: { tosAcceptedAt: string; tosVersion: string }) => void`.

    In `server/db/UserRepository.ts`:
    - Add `import { AVATARS, randomAvatarId } from '../../types/avatars.js';` (NodeNext .js suffix per Pitfall 1).
    - In `findOrCreate` create branch: add `avatarId: randomAvatarId()` to the prisma.user.create data object. REMOVE `avatarUrl: photoUrl` (D-15: Telegram photo no longer stored for rendering — leave column but write `null`). Per D-12, this is atomic — single INSERT writes avatarId.
    - In `findOrCreate` else branch: AFTER the username-update block, add `if (!user.avatarId) { user = await prisma.user.update({ where: { id: user.id }, data: { avatarId: randomAvatarId() } }); }` — idempotent backfill for grandfathered users (RESEARCH Q4 / Open Q4).
    - Extend `mapToTelegramUser` to include `avatarId: user.avatarId ?? undefined` and `tosAcceptedAt: user.tosAcceptedAt?.toISOString()` in the returned object.
    - Add a new method `static async updateAvatarId(telegramId: number, avatarId: string): Promise<void>` that calls `prisma.user.update({ where: { telegramId: BigInt(telegramId) }, data: { avatarId } })`.

    In `server/index.ts`:
    - Add `import { AVATARS } from '../types/avatars.js';` (path relative to server/index.ts; verify against existing imports).
    - Register a new socket handler `socket.on('updateAvatar', async (payload) => { ... })`:
      1. Require `socket.data.telegramId` (auth-gate per existing pattern); reject otherwise (return).
      2. Validate `typeof payload?.avatarId === 'string' && AVATARS.includes(payload.avatarId as any)` — reject (return) and log if invalid (mitigates threat T-02-02-02).
      3. Call `UserRepository.updateAvatarId(socket.data.telegramId, payload.avatarId)`.
      4. Emit `socket.emit('avatarUpdated', { avatarId: payload.avatarId })`.
      5. Trigger any seat broadcast refresh if the user is currently seated (find existing pattern used by `updateProfile`'s name change broadcast and mirror it so SeatsDisplay updates live for other clients at the same table).
    - Locate the seat→Player serializer (grep server/ for `avatarUrl:` and the current `Player` build site — likely in `server/index.ts` table-broadcast helper or `server/Game.ts` `getGameState`). Add `avatarId: user?.avatarId ?? undefined` next to the existing `avatarUrl` field. Keep `avatarUrl` populated for one transition release; downstream consumers prefer avatarId.
  </action>
  <verify>
    <automated>npm run build</automated>
  </verify>
  <done>Server builds with no TS errors; `types/index.ts` exports the new event signatures + Player.avatarId + TelegramUser.avatarId/tosAcceptedAt; UserRepository writes avatarId on create AND backfills on else-branch; updateAvatar handler validates against AVATARS; seat broadcaster includes avatarId field in Player projection.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 4: Migrate SeatsDisplay to manifest resolver + add updateAvatar listener in App.tsx</name>
  <files>client/src/components/SeatsDisplay.tsx, client/src/App.tsx</files>
  <action>
    In `client/src/components/SeatsDisplay.tsx`:
    - `import { avatarUrl as resolveAvatar, type AvatarId } from '../assets/avatars/manifest';`
    - At each `<Avatar avatarUrl={...} />` call site (RESEARCH Q10 cites lines ~332-337, ~463-469), change the `avatarUrl` prop value to `resolveAvatar(player.avatarId as AvatarId | undefined)`. The `Avatar` component already falls back to initial-letter when prop is undefined (D-14).
    - Do NOT remove `Player.avatarUrl` from types/index.ts in this plan — keep it during transition. Only stop reading it in SeatsDisplay.
    - Per D-15: confirm no Telegram `photo_url` is referenced inside SeatsDisplay anywhere.

    In `client/src/App.tsx`:
    - Add a `socket.on('avatarUpdated', (payload) => { setCurrentUser(prev => prev ? { ...prev, avatarId: payload.avatarId } : prev); })` listener inside the existing `useEffect` that registers socket handlers. This propagates the new avatar to MainMenu / Profile views immediately on confirm.
    - Per D-15: anywhere `currentUser.avatarUrl` is used to render the user's own image in MainMenu / ProfileSettings (will be redesigned in Plans 04 + 06), document via inline comment that it should resolve via `avatarUrl(currentUser.avatarId)` going forward — but do NOT modify those pages here; they're full redesigns owned by Plans 04 + 06.
  </action>
  <verify>
    <automated>cd client && npm run build</automated>
  </verify>
  <done>SeatsDisplay reads avatarId via manifest resolver; client builds; `socket.on('avatarUpdated', ...)` registered in App.tsx; existing initial-letter fallback path still active for null avatarId.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → server `updateAvatar` socket event | Untrusted payload string crosses into DB write path |
| client → server seat broadcasts | Server builds Player with avatarId (server-controlled, trusted) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-02-01 | Spoofing | `updateAvatar` handler | mitigate | Require `socket.data.telegramId` populated (auth happened) before any DB write — same pattern as existing updateProfile. |
| T-02-02-02 | Tampering | `updateAvatar` payload.avatarId | mitigate | Server-side `AVATARS.includes(payload.avatarId)` check before persist; reject silently otherwise. ASVS V5 input validation. |
| T-02-02-03 | Tampering | Avatar URL injection (legacy `avatarUrl` field) | mitigate | We no longer render arbitrary `avatarUrl` strings — manifest-resolved hashed URLs only (RESEARCH §Security). avatarUrl column kept but no read path uses it for img src. |
| T-02-02-04 | Information disclosure | Other users' avatarId in seat broadcast | accept | avatarId is non-PII visual identifier; broadcast already exposes displayName/seat/chips publicly per game design. |
| T-02-02-05 | DoS | Repeated updateAvatar spam | accept | No rate-limit ships this phase; magnitude is one DB UPDATE per click; deferred to Phase 5 ops if observed. |
</threat_model>

<verification>
- 20 WebPs exist with slugs matching the locked AVATARS const exactly (no orphans, no missing).
- New user (clear DB row, hit findOrCreate) → row has non-null avatarId.
- Existing user with null avatarId → next findOrCreate populates avatarId; second call is a no-op.
- Server rejects `updateAvatar { avatarId: 'unicorn' }` (not in AVATARS) without writing.
- SeatsDisplay shows the WebP for a seated player whose avatarId is set; falls back to initial letter for null.
- Telegram `photo_url` no longer renders anywhere in SeatsDisplay.
- Client + server builds green.
</verification>

<success_criteria>
- AVATAR-01: 20 WebPs hashed by Vite into dist/.
- AVATAR-02: New users get atomic random assign in `findOrCreate` create branch (single INSERT).
- AVATAR-03: `updateAvatar` socket round-trip works (substrate ready; picker UI lands in Plan 06).
- AVATAR-04: SeatsDisplay resolves avatars via manifest with initial-letter fallback only when avatarId is null/unknown.
- D-15 honored: Telegram `photo_url` no longer rendered (in SeatsDisplay; MainMenu/Profile follow in Plans 04+06).
</success_criteria>

<output>
After completion, create `.planning/phases/02-design-system-rollout-avatars/02-02-avatar-pipeline/02-02-SUMMARY.md` documenting: locked species list (final 20 slugs), file size totals, exact source location of seat→Player serializer that was modified, any deviations from the validated prop shapes, and the exact server/client import paths for `types/avatars` (so Plan 06 can copy them).
</output>
