---
phase: 03-gameplay-additions
plan: 04
subsystem: server-socket-api
tags: [hand-history, reader, privacy, socket-io, dto, tdd]
dependency_graph:
  requires: ["03-00", "03-02"]
  provides: ["HandHistoryDTO", "HandHistoryOpponentDTO", "HandHistoryRepository.findForUser", "getHandHistory socket event", "handHistoryData/handHistoryError responses"]
  affects: ["03-05"]
tech_stack:
  added: []
  patterns:
    - "Two-step Prisma findMany: own rows then opponent rows by handId (RESEARCH §Privacy filter at read time)"
    - "Read-time privacy filter via ternary on showedDown — single source of truth"
    - "Server-side limit clamp Math.min(Math.max(1, Math.trunc(n)), 50) — defends T-3-DOS"
    - "Zero-arg socket handler — payload ignored, identity from socket.data.telegramId only (T-3-AUTHZ)"
    - "Generic error string + stderr log of raw error (T-3-INFO-LEAK)"
    - "Inline test harness mirrors handler body when full server boot is too coupled to spin up"
key_files:
  created:
    - server/__tests__/HandHistoryRepository.privacy.test.ts
    - server/__tests__/getHandHistory.test.ts
  modified:
    - types/index.ts
    - server/db/HandHistoryRepository.ts
    - server/index.ts
decisions:
  - "Test count for HandHistoryRepository.privacy is 12 (plan said 11 in summary blurb, but the action block specified 12 cases — implementation faithful to action block)"
  - "Fixed test date generator that overflowed past day 31 (auto-rule 1 bug fix in own test) — switched to Date.UTC second-stride for 50 valid timestamps"
  - "Did NOT modify Prisma schema (D-19 + RESEARCH Open Q1 Option A) — tableName resolved at read time via PREDEFINED_TABLES map"
metrics:
  duration: "~6 minutes"
  completed_at: "2026-04-21T07:16:14Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 3
requirements_addressed: [PROFILE-03, PROFILE-04]
---

# Phase 03 Plan 04: Hand-History Reader (Server) Summary

**One-liner:** Server-side `getHandHistory` Socket.io handler returning the user's last 50 hands grouped by handId with read-time privacy filter that strips opponent holeCards to `[]` unless `showedDown=true`.

## What Was Built

### Task 1 — Types + HandHistoryRepository.findForUser

**`types/index.ts` additions:**
- `HandHistoryOpponentDTO` — opponent slice with `holeCards: []` when not shown
- `HandHistoryDTO` — viewer's hand projection: own row fields + `tableName` + `opponents[]`
- `ExtendedClientEvents.getHandHistory: () => void` — zero-payload request
- `ExtendedServerEvents.handHistoryData: (rows: HandHistoryDTO[]) => void`
- `ExtendedServerEvents.handHistoryError: (msg: string) => void`

**`server/db/HandHistoryRepository.ts` additions:**
- New imports: `PREDEFINED_TABLES` from `../config/tables.js`; `HandHistoryDTO`, `HandHistoryOpponentDTO` from shared types
- `findForUser(telegramId: string, limit = 50): Promise<HandHistoryDTO[]>` — implementation at line 97:
  - Step 1: `prisma.handHistory.findMany({ where: { telegramId }, orderBy: { playedAt: 'desc' }, take: cap })` — only the requesting user's rows define which hands appear
  - Step 2: `prisma.handHistory.findMany({ where: { handId: { in: handIds } } })` — fetches every row sharing those handIds
  - Group by `handId` via `Map<string, Row[]>` — O(1) opponent lookup
  - Build DTOs in DESC-ordered own-row sequence
  - **Privacy filter (line 140):** `holeCards: r.showedDown ? r.holeCards : []` — single source of truth for D-18 / T-3-PRIVACY
  - **Limit clamp (line 98):** `Math.min(Math.max(1, Math.trunc(limit)), 50)` — T-3-DOS guard; clamps any caller-supplied value
  - **TableName resolution (lines 127-128, 150):** `PREDEFINED_TABLES.map(...)` → `Map<id,name>` lookup with raw-tableId fallback for unknown ids (defensive)
  - **ISO serialization (line 151):** `playedAt.toISOString()` — string DTO field, portable across socket.io serialization

### Task 2 — Socket handler in `server/index.ts`

`socket.on("getHandHistory", async () => { ... })` placed immediately after `getProfile` (line 338, 24 lines):
- Zero-arg arrow function — payload ignored entirely (T-3-AUTHZ)
- Auth gate: emits `authError` with `{ message: 'Not authenticated' }` if `socket.data.telegramId` missing
- Calls `HandHistoryRepository.findForUser(telegramId)` with NO limit arg → repo default 50
- On success: `socket.emit("handHistoryData", rows)`
- On rejection: `console.error("[HandHistory] Error:", error)` + `socket.emit("handHistoryError", "Server error")` — raw error never serialized to client

## Exported Contracts (consumed by Plan 03-05)

```ts
// Client → Server (zero payload)
socket.emit("getHandHistory");

// Server → Client (success)
socket.on("handHistoryData", (rows: HandHistoryDTO[]) => { ... });

// Server → Client (failure)
socket.on("handHistoryError", (msg: string) => { ... });

// DTO shape
interface HandHistoryDTO {
  handId: string;
  tableId: string;
  tableName: string;     // resolved from PREDEFINED_TABLES; falls back to raw tableId
  playedAt: string;      // ISO 8601
  board: string[];
  // Viewer's own row:
  seat: number;
  holeCards: string[];   // always populated for viewer
  netDelta: number;
  finalChips: number;
  showedDown: boolean;
  won: boolean;
  // Other seats from same handId:
  opponents: HandHistoryOpponentDTO[];
}

interface HandHistoryOpponentDTO {
  telegramId: string;
  seat: number;
  holeCards: string[];   // [] unless showedDown === true
  finalChips: number;
  netDelta: number;
  won: boolean;
  showedDown: boolean;
}
```

## Single-Source-of-Truth Locations (for VALIDATION.md)

| Concern | File | Line(s) |
|---------|------|---------|
| Privacy filter (D-18 / T-3-PRIVACY) | `server/db/HandHistoryRepository.ts` | 140 |
| 50-row cap (T-3-DOS) | `server/db/HandHistoryRepository.ts` | 98 |
| Two-step query (Step 1, Step 2) | `server/db/HandHistoryRepository.ts` | 100-116 |
| TableName resolution | `server/db/HandHistoryRepository.ts` | 127-128, 150 |
| Auth gate (T-3-AUTHZ) | `server/index.ts` | 339-342 |
| Error path (T-3-INFO-LEAK) | `server/index.ts` | 347-350 |
| Zero-arg handler signature | `server/index.ts` | 338 |

## Test Results

```
server/__tests__/HandHistoryRepository.privacy.test.ts   12 passed
server/__tests__/getHandHistory.test.ts                   6 passed
server/__tests__/HandHistoryQueue.test.ts                 6 passed (regression)
server/__tests__/handHistoryRetention.test.ts             4 passed (regression)
server/__tests__/checkpointSeatedPlayers.test.ts          4 passed (regression)
server/__tests__/actionBubbleBroadcast.test.ts            4 passed (regression)
tests/smoke.test.ts                                       2 passed (regression)
Total: 38 passed, 0 failed
```

### Test breakdown for VALIDATION.md per-task table

**`HandHistoryRepository.privacy.test.ts` (12 cases, PROFILE-04 + PROFILE-03 coverage):**
1. returns `[]` when user has no played hands (no second findMany call)
2. strips opponent holeCards when `showedDown=false`
3. returns opponent holeCards verbatim when `showedDown=true`
4. always returns own holeCards verbatim, regardless of own `showedDown`
5. groups multiple opponent rows under the same handId
6. orders results by `playedAt DESC` and limits to default 50
7. clamps explicit limit > 50 down to 50 (T-3-DOS)
8. clamps non-integer limit safely (12.7 → 12)
9. resolves tableName from `PREDEFINED_TABLES`
10. falls back to raw tableId when tableId is unknown
11. serializes `playedAt` as ISO 8601 string
12. step-2 query uses `where: { handId: { in: ownHandIds } }` — no leakage of unrelated hands

**`getHandHistory.test.ts` (6 cases, handler contract coverage):**
1. emits `authError` when `socket.data.telegramId` is undefined
2. calls `findForUser` with `socket.data.telegramId` only (no second arg → default 50)
3. emits `handHistoryData` with the rows on success
4. emits `handHistoryError` with generic message on rejection (T-3-INFO-LEAK)
5. ignores any payload — uses ONLY `socket.data.telegramId` (T-3-AUTHZ)
6. does not pass a second arg to `findForUser` (limit is repo-default → server-bounded)

## Critical Invariants Verified

| # | Invariant | Verification |
|---|-----------|--------------|
| 1 | Server strips opponent holeCards unless showedDown | `grep -c "showedDown ? r.holeCards : \[\]" server/db/HandHistoryRepository.ts` → **1** |
| 2 | getHandHistory handler is zero-arg | `grep -cE 'socket\.on\("getHandHistory", *async *\(\) *=>' server/index.ts` → **1** |
| 3 | No DB schema change | `git log --oneline -- prisma/` → last touch is Phase 01-02; no plan 03-04 commits in prisma/ |
| 4 | Group by handId | `byHandId.set(r.handId, [r])` at HandHistoryRepository.ts:123 + `where: { handId: { in: handIds } }` at line 115 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test date generator overflowed past day 31**
- **Found during:** Task 1 GREEN run (test #6 "orders results by playedAt DESC and limits to default 50")
- **Issue:** The test built 60 own rows using `2026-04-${i+1}` template — days 32-60 are invalid Date values, causing `RangeError: Invalid time value` in repo's `toISOString()` call
- **Fix:** Reduced the row count to 50 (test only slices 0..50 anyway), and switched to `Date.UTC(2026, 3, 1, 0, 0, i)` so all 50 timestamps are valid sequential seconds
- **Files modified:** `server/__tests__/HandHistoryRepository.privacy.test.ts` (line 122-127)
- **Commit:** `24e01de` (folded into Task 1 GREEN commit since the test was rewritten before the GREEN landed)

### Plan-vs-Action Discrepancy

The plan's `<verification>` block says "11 cases" but the `<action>` block actually specifies 12 test cases. Implementation faithful to the action block (12 cases) — VALIDATION.md table updates should reference 12, not 11.

## Known Stubs

None — Plan 03-04 is the read-side contract; the next plan (03-05) wires the client UI consumer.

## Threat Flags

None — no new network endpoints beyond the planned `getHandHistory` socket event (which lives within the existing authenticated socket boundary), no new auth paths, no file access, no schema change. The threat model in 03-04-PLAN.md (T-3-AUTHZ, T-3-PRIVACY, T-3-DOS, T-3-INFO-LEAK) is the complete surface; all four are mitigated as planned.

## Pre-existing Issues (not blocking)

- `client/src/hooks/useTelegram.ts:131` — `TS2345: Property 'displayName' is missing` — pre-existing prior to Phase 03 (already documented in `.planning/phases/03-gameplay-additions/deferred-items.md` from Plan 03-03). Not introduced by this plan; verified by stashing my changes and re-running `npx tsc --noEmit -p client/tsconfig.json`.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `types/index.ts` (modified) | FOUND: 3 new types + 3 new event entries |
| `server/db/HandHistoryRepository.ts` (modified) | FOUND: findForUser at line 97 |
| `server/index.ts` (modified) | FOUND: getHandHistory handler at line 338 |
| `server/__tests__/HandHistoryRepository.privacy.test.ts` (created) | FOUND: 12 tests passing |
| `server/__tests__/getHandHistory.test.ts` (created) | FOUND: 6 tests passing |
| Commit `41a7253` (Task 1 RED) | FOUND |
| Commit `24e01de` (Task 1 GREEN) | FOUND |
| Commit `3a36ad1` (Task 2 RED/harness) | FOUND |
| Commit `70bd1c5` (Task 2 GREEN) | FOUND |
