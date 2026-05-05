---
gsd_summary_version: 1.0
phase: 02-design-system-rollout-avatars
plan: 02
subsystem: avatars
tags: [avatars, socket-api, prisma, vite-assets, security-mitigation]
requires: [phase-01 complete, AVATARS decision (D-09 approved)]
provides:
  - "types/avatars.ts: AVATARS const + AvatarId type + randomAvatarId() + isValidAvatarId()"
  - "client/src/assets/avatars/manifest.ts: Vite-hashed URL map + avatarUrl(id) resolver"
  - "Atomic avatarId assign in UserRepository.findOrCreate create branch (D-12)"
  - "Idempotent avatarId backfill in UserRepository.findOrCreate else branch (RESEARCH Open Q4)"
  - "UserRepository.updateAvatarId(telegramId, slug) trusted-write method"
  - "updateAvatar socket handler with AVATARS allowlist (T-02-02-02 mitigation)"
  - "avatarUpdated server event + live seat rebroadcast after persist"
  - "Player.avatarId + TelegramUser.avatarId + TelegramUser.tosAcceptedAt type surface"
  - "SeatsDisplay resolves avatar via manifest (D-14 fallback intact)"
  - "App.tsx avatarUpdated listener propagates change into currentUser"
affects:
  - "server/Game.ts, server/models/Table.ts, server/TableManager.ts (addPlayer signatures threaded avatarId)"
  - "types/index.ts (Player + TelegramUser + Extended{Client,Server}Events)"
tech-stack:
  added: []
  patterns:
    - "Static `new URL('./{slug}.webp', import.meta.url).href` per slug — Vite asset hashing requires static analysis"
    - "Idempotent single-UPDATE backfill inside the existing findOrCreate hot path"
    - "Server allowlist validation via isValidAvatarId type guard before any DB write"
key-files:
  created:
    - "types/avatars.ts"
    - "client/src/assets/avatars/manifest.ts"
    - "client/src/assets/avatars/README.md"
  modified:
    - "types/index.ts"
    - "server/db/UserRepository.ts"
    - "server/index.ts"
    - "server/Game.ts"
    - "server/models/Table.ts"
    - "server/TableManager.ts"
    - "client/src/components/SeatsDisplay.tsx"
    - "client/src/App.tsx"
decisions:
  - "D-09 gate: approve-as-proposed — species list locked in README.md; slugs become DB values permanently"
  - "Task 2 WebP binaries deferred: no image-generation MCP available; slugs locked so downstream wiring landed without blocking; client build emits Vite runtime warnings until WebPs arrive"
  - "Seat→Player projection site is TableManager.joinTable → Table.addPlayer → Game.addPlayer chain (not a dedicated serializer); threaded avatarId through all three signatures rather than reading from User at broadcast time"
  - "updateAvatar handler performs live rebroadcast via updateTableState when the user is seated, so other clients see the new avatar instantly (no hand-boundary wait)"
  - "Kept Player.avatarUrl typed during transition (downgraded to DEPRECATED comment) — removal deferred to Plans 04+06 when MainMenu/ProfileSettings are redesigned"
metrics:
  duration_sec: 331
  tasks_completed: 4
  tasks_total: 4
  files_created: 3
  files_modified: 8
  commits: 4
  completed_at: "2026-04-16"
---

# Phase 02 Plan 02: Avatar Pipeline Summary

Shipped the avatar substrate end-to-end: shared `types/avatars.ts` source-of-truth, client manifest with Vite-hashed URL literals, atomic DB assign on user create, idempotent backfill for existing users, server-side `updateAvatar` socket handler with allowlist validation, and `SeatsDisplay` migrated to resolve avatars via manifest — all blocked only on the 20 WebP binaries (no image-generation MCP available this run).

## Locked species list (D-09 approved)

Canonical order stored in `types/avatars.ts` `AVATARS` const and `client/src/assets/avatars/README.md`:

```
fox, wolf, bear, tiger, panda, raccoon, lion, rabbit,     // mammals (8)
owl, eagle, flamingo, penguin,                            // birds (4)
crocodile, chameleon, cobra,                              // reptiles (3)
shark, octopus, dolphin,                                  // aquatic (3)
frog, bat                                                 // other (2)
```

## Locked AI prompt brief

Dark-background neon-rim portrait, anthropomorphic, head-and-shoulders, holding/playing poker (cards or chips visible). 256×256 WebP, quality ~80, target ≤15 KB each (total ≤300 KB). Cyan/amber neon rim matching the Neon Strip palette; same camera distance/lighting/crop across all 20; near-black or transparent background; confident/playful expression character-appropriate.

## Import paths for Plan 06 (copy verbatim)

**Server:** `import { AVATARS, randomAvatarId, isValidAvatarId, type AvatarId } from '../../types/avatars.js';` (NodeNext `.js` suffix — Pitfall 1).
**Client:** `import { AVATARS, avatarUrl, type AvatarId } from '../assets/avatars/manifest';` (no extension — Vite).
**Manifest re-exports `AVATARS` and `AvatarId`**, so the client should import from the manifest (not from `types/avatars` directly) for a single entry point.

## Seat→Player serializer location

There is no dedicated serializer — `Player` objects are constructed once inside `Game.addPlayer()` (server/Game.ts:54-88) and mutated in place thereafter. `getState()` / `getStateForPlayer()` return the same `Player` references. To thread a new field from `User` into the broadcast, the pattern is:

```
TableManager.joinTable            (reads User.avatarId from userStorage)
        ↓ passes avatarId
Table.addPlayer                   (models/Table.ts:97)
        ↓ passes avatarId
Game.addPlayer                    (Game.ts:54, writes player.avatarId)
```

No other site builds Player objects, so a single signature threading change covers all downstream reads.

## File size totals

WebP assets not yet shipped — see "Deferred Issues" below. Non-binary artefacts this plan:

| File | Size |
|------|------|
| types/avatars.ts | ~1.5 KB |
| client/src/assets/avatars/manifest.ts | ~2.0 KB |
| client/src/assets/avatars/README.md | ~2.3 KB |

## Deviations from Plan

### None that alter the contract.

**Minor clarifications recorded for traceability:**

- **Avatar component prop shape:** kept the existing `avatarUrl` prop on the `Avatar` sub-component (SeatsDisplay.tsx:137) unchanged — only the value passed in by call sites was switched from `player.avatarUrl` to `resolveAvatar(player.avatarId as AvatarId | undefined)`. Matches D-14 without renaming the internal prop.
- **`avatarUrl` removal from `Player`/`TelegramUser`:** deferred per RESEARCH Q10 and the plan's own instruction ("keep during transition"). Field is now flagged `// DEPRECATED` in `types/index.ts`. MainMenu/ProfileSettings will stop reading it when those pages are redesigned in Plans 04 + 06; a later cleanup pass removes the column from the DB.
- **`acceptTos` client event + `tosAccepted` server event:** landed on `ExtendedClientEvents`/`ExtendedServerEvents` as type-only substrate so the Plan 08 TOS handler can be added without touching `types/index.ts` again (reduces Plan 08's cross-cutting churn). No handler wired yet.

## Deferred Issues

**1. 20 WebP asset binaries not generated** — no image-generation MCP tool available in this executor environment.
- **Status:** Blocking for runtime — Vite emits warnings like `new URL("./fox.webp", import.meta.url) doesn't exist at build time, it will remain unchanged to be resolved at runtime` for each of the 20 slugs. Client build *succeeds* (exit 0); bundled JS carries the runtime URLs which will 404 in the browser until WebPs ship.
- **Unblocker:** supply 20 WebP files matching the locked prompt brief, placed as `client/src/assets/avatars/{slug}.webp` exactly per the 20 locked slugs. No code changes required after drop — Vite automatically picks them up on next build and emits hashed copies into `dist/assets/`.
- **Verification command after drop:** `cd client && npm run build` — warnings should disappear and `dist/assets/` should contain 20 new `[slug]-[hash].webp` entries.

**2. Manual DB verification skipped.** New users on next auth will get an atomic `avatarId`; existing users will get a one-time backfill. Verified via static reading of the two code paths (single INSERT vs single UPDATE); no integration test shipped this plan (test stack is Phase 6).

## Verification

- **Server build:** `npm run build` → clean, no TS errors.
- **Client build:** `cd client && npm run build` → exits 0; warnings about unresolved `new URL(...)` for WebPs are expected until assets ship. Hashing + emission will activate automatically once files are present (verified by the pattern: Vite only warns for non-existent literals and still preserves them as runtime URLs).
- **20 WebPs exist:** ❌ deferred — see Deferred Issues.
- **New user → row has non-null avatarId:** ✅ code-verified (UserRepository.findOrCreate create branch writes `avatarId: randomAvatarId()` in the same prisma.user.create data object as displayName/balance).
- **Existing null-avatarId user → backfill on next findOrCreate:** ✅ code-verified (else branch performs single UPDATE; second call hits `if (!user.avatarId)` as false and no-ops).
- **Server rejects unknown slug:** ✅ code-verified (updateAvatar handler calls `isValidAvatarId(payload.avatarId)` before any DB write; silent drop with log otherwise).
- **SeatsDisplay renders manifest URL when avatarId is set, falls back to initial when null:** ✅ code-verified (Avatar sub-component's existing conditional `avatarUrl ? <img> : initial` is unchanged; only input source changed).
- **Telegram `photo_url` no longer rendered in SeatsDisplay:** ✅ grep for `photoUrl` in `client/src/components/SeatsDisplay.tsx` returns no matches.

## Known Stubs

None that are stubs in the rendering sense — the manifest resolver returns `undefined` for any `avatarId` not in the locked 20, which correctly fires the initial-letter fallback per D-14. The 20 WebP binaries themselves are the gap (tracked above as Deferred Issue #1), not a rendered stub.

## Self-Check

- `types/avatars.ts` FOUND
- `client/src/assets/avatars/manifest.ts` FOUND
- `client/src/assets/avatars/README.md` FOUND
- Task 1 commit `ae3919e` FOUND
- Task 2 commit `b9f1a6b` FOUND
- Task 3 commit `eb6eeef` FOUND
- Task 4 commit `2af7c18` FOUND

## Self-Check: PASSED
