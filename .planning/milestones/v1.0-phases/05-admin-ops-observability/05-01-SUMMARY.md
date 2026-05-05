---
phase: 05
plan: 01
subsystem: server-gate
tags: [compliance, security, tos, ban, socket]
dependency_graph:
  requires: [05-00]
  provides: [joinGate, bannedAt-mirror]
  affects: [server/index.ts, client/src/App.tsx]
tech_stack:
  added: []
  patterns: [gate-helper, typed-error-envelope]
key_files:
  created:
    - server/middleware/joinGate.ts
  modified:
    - server/index.ts
    - types/index.ts
    - server/db/UserRepository.ts
    - client/src/App.tsx
decisions:
  - "Ban-first ordering in gateUserOrEmit: banned users get BANNED error even when tosAcceptedAt is missing (per RESEARCH Open Q3)"
  - "Auth handler does NOT ban-check: banned users can authenticate and see the menu; they are only gated at joinTable (per RESEARCH Open Q3 recommendation)"
  - "JoinGateUser accepts string|Date|null for both fields so helper works with TelegramUser (string) and Prisma row (Date) without reshaping"
metrics:
  duration_seconds: 140
  completed_date: "2026-05-02"
  tasks_completed: 3
  files_changed: 5
---

# Phase 5 Plan 01: ToS Gate + Ban Check on joinTable Summary

One-liner: Server-side joinTable gate that rejects un-accepted-ToS users and banned users with typed `serverError` events, closing COMPLIANCE-04 and RESEARCH Open Q3.

## What Was Built

### joinGate.ts shape and where it is invoked

`server/middleware/joinGate.ts` exports a single pure function:

```typescript
export function gateUserOrEmit(user: JoinGateUser, socket: GateSocket): boolean
```

`JoinGateUser` is a minimal interface with `tosAcceptedAt?: string | Date | null` and `bannedAt?: string | Date | null`, allowing the helper to work with both the in-memory `TelegramUser` (string fields) and a fresh Prisma row (Date fields) without reshaping at the call site.

Logic (ban-first per RESEARCH Open Q3):
1. If `user.bannedAt` is truthy → `socket.emit('serverError', { type: 'BANNED' })` → return `false`
2. If `!user.tosAcceptedAt` → `socket.emit('serverError', { type: 'TOS_REQUIRED' })` → return `false`
3. Otherwise → return `true`

**Invocation location** in `server/index.ts` `joinTable` handler — immediately after `if (!user) { ... return; }` and before the balance check:

```typescript
if (!gateUserOrEmit(user, socket)) {
  return;
}
// Check balance against buy-in
```

### types/index.ts diff (TelegramUser.bannedAt added)

Added to `TelegramUser` interface:
```typescript
bannedAt?: string;  // Plan 05-01 (COMPLIANCE-04 + RESEARCH Open Q3): ISO timestamp; truthy = banned
```

### UserRepository.mapToTelegramUser change

Added to the returned object in `private static mapToTelegramUser`:
```typescript
bannedAt: user.bannedAt ? user.bannedAt.toISOString() : undefined,
```

This mirrors the Prisma `DateTime?` column into the in-memory `TelegramUser` so `gateUserOrEmit` sees the ban flag without an additional DB round-trip.

### App.tsx serverError listener routing logic

Added inside the socket-listeners `useEffect` block, after `tableError`:

```typescript
socket.on("serverError", (payload) => {
  if (payload.type === 'TOS_REQUIRED') {
    setView('consent');
    hapticFeedback?.notificationOccurred('warning');
  } else if (payload.type === 'BANNED') {
    alert('Your account has been banned and cannot join tables.');
    hapticFeedback?.notificationOccurred('error');
    setCurrentTableId(null);
    setMySeat(null);
  }
});
```

Cleanup: `socket.off("serverError")` added next to `socket.off("tableError")`.

The existing `tableError` string handler is unchanged (RESEARCH Open Q1 — do not overload).

### Tests turning GREEN: tosGate.test.ts (3/3)

All 3 RED tests from Plan 05-00 scaffold are now GREEN:
1. `gateUserOrEmit returns "TOS_REQUIRED" when tosAcceptedAt is null` — PASS
2. `gateUserOrEmit returns "BANNED" when bannedAt is set` — PASS
3. `gateUserOrEmit returns true for accepted-and-not-banned user` — PASS

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `0b33139` | feat(05-01): add gateUserOrEmit helper |
| 2 | `016bdd0` | feat(05-01): wire gateUserOrEmit into joinTable + mirror bannedAt |
| 3 | `6df19cc` | feat(05-01): wire serverError listener in client App.tsx |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all logic is fully wired.

## Threat Flags

No new network endpoints, auth paths, file access patterns, or schema changes introduced beyond what the plan's threat model already covers.

## Self-Check: PASSED

- [x] `server/middleware/joinGate.ts` exists and exports `gateUserOrEmit`
- [x] `server/index.ts` contains `import { gateUserOrEmit } from "./middleware/joinGate.js"`
- [x] `server/index.ts` contains `if (!gateUserOrEmit(user, socket))` before balance check
- [x] `types/index.ts` TelegramUser contains `bannedAt?: string`
- [x] `server/db/UserRepository.ts` mapToTelegramUser includes `bannedAt` field
- [x] `client/src/App.tsx` contains `socket.on("serverError"` with TOS_REQUIRED and BANNED branches
- [x] `client/src/App.tsx` cleanup contains `socket.off("serverError")`
- [x] `tosGate.test.ts` 3/3 GREEN
- [x] 66 previously-passing server tests still pass
- [x] 57 client tests still pass
- [x] `npm run build` exits 0
- [x] `cd client && npm run build` exits 0
