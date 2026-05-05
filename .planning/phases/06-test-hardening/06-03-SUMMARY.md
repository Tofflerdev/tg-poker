---
phase: 06
plan: 03
subsystem: client-tests
tags: [testing, vitest, rtl, admin-panels, recharts, jsdom]
dependency_graph:
  requires:
    - phase: 06-00
      provides: telegram-webappstub, test setup infrastructure
  provides:
    - admin-tables-tests
    - admin-users-tests
    - admin-audit-tests
    - admin-economy-tests
  affects: [client/src/pages/admin/__tests__]
tech_stack:
  added: []
  patterns: [vitest-tdd, rtl-fireEvent, ResizeObserver-stub-per-file, socket-mock-emit-assert]
key_files:
  created:
    - client/src/pages/admin/__tests__/AdminTables.test.tsx
    - client/src/pages/admin/__tests__/AdminUsers.test.tsx
    - client/src/pages/admin/__tests__/AdminAudit.test.tsx
    - client/src/pages/admin/__tests__/AdminEconomy.test.tsx
  modified: []
key_decisions:
  - "AdminTables button is labeled 'Disable Table' (not 'Disable') — test uses /disable table/i role query"
  - "AdminTables uses t.id (not t.tableId) for the table identifier — makeTable fixture uses id field"
  - "AdminState has totalChipsInPlay at top level (not economy sub-object); recentAuditLogs (not recentAuditLog)"
  - "AdminAuditLogEntry uses createdAt + beforeJson/afterJson (not timestamp/before/after)"
  - "AdminEconomy 'Active Players' value = String(state.users.length) — fixture passes users array not economy.activePlayers"
  - "AdminUsers Kick is two-step: first click shows inline confirm (role=alert), not immediate emit"
  - "ResizeObserver stub in beforeAll of AdminEconomy.test.tsx only — per-file, not global setup.ts"
requirements-completed:
  - TEST-02
duration: 2min
completed: "2026-05-05"
---

# Phase 6 Plan 3: Admin Panel Smoke Tests Summary

Four smoke + interaction test files covering all admin panel components — AdminTables (disable-emit), AdminUsers (kick confirm flow), AdminAudit (action labels), AdminEconomy (recharts in jsdom via ResizeObserver stub) — closing the D-02 admin discretion clause with 11 GREEN tests.

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-05T08:19:18Z
- **Completed:** 2026-05-05T08:21:14Z
- **Tasks:** 3
- **Files modified:** 4 created

## Accomplishments

- All four admin panel components now have regression backstop test files
- AdminEconomy recharts ResponsiveContainer works in jsdom via per-file ResizeObserver stub
- Fixtures adapted to actual AdminState shape (diverged from plan's assumed schema)
- 109/109 client tests passing after merge (98 prior + 11 new admin tests)

## Task Commits

1. **Task 1: AdminTables smoke + disable-emit** — `26abba5` (test)
2. **Task 2: AdminUsers + AdminAudit smoke** — `41dddee` (test)
3. **Task 3: AdminEconomy recharts-in-jsdom** — `1ebe030` (test)

## Files Created/Modified

- `client/src/pages/admin/__tests__/AdminTables.test.tsx` — 3 tests: empty state, table row render, disableTable emit with tableId
- `client/src/pages/admin/__tests__/AdminUsers.test.tsx` — 3 tests: empty state, user row render, Kick inline-confirm flow
- `client/src/pages/admin/__tests__/AdminAudit.test.tsx` — 3 tests: empty state, kick label, three-entry render with Kicked/Banned/Balance Grant
- `client/src/pages/admin/__tests__/AdminEconomy.test.tsx` — 2 tests: empty economy StatCards, populated economy with active player count

## Test Counts Per File

| File | Tests |
|------|-------|
| AdminTables.test.tsx | 3 |
| AdminUsers.test.tsx | 3 |
| AdminAudit.test.tsx | 3 |
| AdminEconomy.test.tsx | 2 |
| **Total new** | **11** |

Total client test count after merge: **109/109 passing** (19 test files).

## ResizeObserver Stub Strategy

Stub placed in `beforeAll()` inside `AdminEconomy.test.tsx` only. Added conditionally (`if typeof ResizeObserver === 'undefined'`) so it does not overwrite any stub that may already exist in the environment. Not added to global `setup.ts` — per-file isolation prevents leakage.

## Event-Name Corrections After Reading Source

| Plan Assumption | Actual (from source) | File |
|----------------|---------------------|------|
| Button labeled "Disable" | "Disable Table" (full label in AdminTables.tsx) | AdminTables.test.tsx |
| `t.tableId` | `t.id` (AdminTableInfo uses `id`) | AdminTables.test.tsx |
| `state.recentAuditLog` | `state.recentAuditLogs` (AdminAudit.tsx:37) | AdminAudit.test.tsx |
| `row.timestamp` | `row.createdAt` | AdminAudit.test.tsx |
| `row.before`/`row.after` | `row.beforeJson`/`row.afterJson` | AdminAudit.test.tsx |
| `economy.totalChipsInPlay` | `state.totalChipsInPlay` (top-level) | AdminEconomy.test.tsx |
| `economy.activePlayers` | `state.users.length` (computed) | AdminEconomy.test.tsx |
| Kick emits immediately | First click → inline confirm (`role=alert`) | AdminUsers.test.tsx |

## Decisions Made

- Adapted all fixtures to actual type shapes rather than plan's assumed shapes — correctness over fidelity to plan template
- AdminUsers kick test asserts on `role=alert` (the confirm div has `role="alert"`) rather than `queryByText(/sure|confirm/i)` — more robust against text wording changes
- AdminEconomy test asserts `String(state.users.length) = '2'` (active players) instead of checking formatted chip number, avoiding locale-sensitivity

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan fixtures used wrong AdminState shape**
- **Found during:** Task 1 (reading types/index.ts before writing)
- **Issue:** Plan's scaffolded code used `economy: { totalChipsInPlay, activePlayers, chipsPerTable }` sub-object and `recentAuditLog` / `recentErrors` fields that don't exist in the actual `AdminState` interface. Actual shape has `totalChipsInPlay` at top level, `recentAuditLogs` (plural), and no `recentErrors` or `economy` sub-object.
- **Fix:** All `makeState()` fixture functions use the correct flat shape with `totalChipsInPlay`, `recentAuditLogs`. `makeTable()` uses `id` not `tableId`. `makeUser()` uses `chips`/`tableId`/`seat` not `balance`/`online`.
- **Files modified:** All 4 test files
- **Commit:** Integrated into per-task commits

**2. [Rule 1 - Bug] Plan button label '/disable/i' does not match actual "Disable Table"**
- **Found during:** Task 1 (reading AdminTables.tsx before writing)
- **Issue:** AdminTables.tsx renders `<Button>Disable Table</Button>` (line 117), not "Disable". Test using `{ name: /disable/i }` would be ambiguous (matches "Disable Table" AND "Enable Table" if /disable/ is non-anchored, but role query + name pattern would be fine — however the plan's third test assertion `eventName.toMatch(/disable/i)` is correct). Adjusted test to use exact pattern `/disable table/i`.
- **Fix:** `getByRole('button', { name: /disable table/i })` for unambiguous selection.
- **Files modified:** `AdminTables.test.tsx`
- **Commit:** 26abba5

**3. [Rule 1 - Bug] AdminAuditLogEntry uses createdAt not timestamp**
- **Found during:** Task 2 (reading types/index.ts)
- **Issue:** Plan's `makeEntry()` helper sets `timestamp: new Date().toISOString()` but the actual interface uses `createdAt: string`.
- **Fix:** `makeEntry()` uses `createdAt` field.
- **Files modified:** `AdminAudit.test.tsx`
- **Commit:** 41dddee

---

**Total deviations:** 3 auto-fixed (all Rule 1 bugs from plan's assumptions diverging from actual types)
**Impact on plan:** All fixes required for test correctness. No scope creep.

## Known Stubs

None. Test files only.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Self-Check: PASSED

Files created:
- FOUND: client/src/pages/admin/__tests__/AdminTables.test.tsx
- FOUND: client/src/pages/admin/__tests__/AdminUsers.test.tsx
- FOUND: client/src/pages/admin/__tests__/AdminAudit.test.tsx
- FOUND: client/src/pages/admin/__tests__/AdminEconomy.test.tsx

Commits:
- FOUND: 26abba5 (test(06-03): add AdminTables smoke + disable-emit tests)
- FOUND: 41dddee (test(06-03): add AdminUsers + AdminAudit smoke + interaction tests)
- FOUND: 1ebe030 (test(06-03): add AdminEconomy recharts-in-jsdom smoke tests)

Full client suite: 109/109 passing (19 test files).
