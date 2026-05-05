---
phase: 04
slug: resilience
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-28
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 1.6.1 (server: node env), Vitest 1.6.1 + @testing-library/react 14.3.1 (client: jsdom env) |
| **Config file** | `vitest.config.server.ts` (server), `client/vitest.config.ts` (client) |
| **Quick run command** | `npm run test:server` (server-only ~5s) or `cd client && vitest run` (client-only) |
| **Full suite command** | `npm test` (server + client) |
| **Estimated runtime** | ~15 seconds full suite |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:server` for server tasks; `cd client && vitest run` for client tasks (each task minimally runs the file it touches).
- **After every plan wave:** Run `npm test` (full suite).
- **Before `/gsd-verify-work`:** Full suite must be green.
- **Max feedback latency:** 15 seconds.

---

## Per-Task Verification Map

> Task IDs below are placeholders keyed off the four CONTEXT.md decision blocks (A reconnect handshake, B grace + overlay, C boot recovery, D atomic balance) plus client overlay (E). The planner finalizes plan/wave numbering; this map is updated by the plan-checker pass and during execution.

| Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 00 (Wave 0) | 0 | RESILIENCE-04 | T-04-A1 | Auth handler emits `tableJoined + state` snapshot for already-seated telegramId | unit | `vitest run --config vitest.config.server.ts server/__tests__/reconnectHandshake.test.ts` | ❌ W0 | ⬜ pending |
| 00 (Wave 0) | 0 | RESILIENCE-04 | T-04-A3 | Auth handler emits `replacedBySession` to prior socket and `disconnect(true)`s it | unit | same file as above | ❌ W0 | ⬜ pending |
| — | — | RESILIENCE-04 | — | `getStateForPlayer(telegramId)` reveals own hole cards (regression) | unit (existing) | covered by Phase 1 / Phase 3 tests | ✅ | ⬜ pending |
| 00 (Wave 0) | 0 | RESILIENCE-05 | T-04-B1 | Grace timer mid-hand 30s arms when `stage ∈ {preflop, flop, turn, river}` | unit | `vitest run --config vitest.config.server.ts server/__tests__/GraceRegistry.test.ts` | ❌ W0 | ⬜ pending |
| 00 (Wave 0) | 0 | RESILIENCE-05 | T-04-B1 | Grace timer between-hands 120s arms when `stage ∈ {waiting, showdown}` | unit | same file as above | ❌ W0 | ⬜ pending |
| 00 (Wave 0) | 0 | RESILIENCE-05 | T-04-B2 | Mid-hand 30s timer re-arms to 120s when hand ends mid-grace | unit | same file (uses `vi.useFakeTimers()` + `setOnHandComplete` mock) | ❌ W0 | ⬜ pending |
| 00 (Wave 0) | 0 | RESILIENCE-05 | — | `clear(telegramId)` cancels in-flight timer and removes registry entry | unit | same file as above | ❌ W0 | ⬜ pending |
| 00 (Wave 0) | 0 | RESILIENCE-05 | T-04-B3 | Mid-hand expiry → `table.sitOut(tid)` + clears `disconnectedAt` | unit | same file (mocks tableManager + prisma.user.update) | ❌ W0 | ⬜ pending |
| 00 (Wave 0) | 0 | RESILIENCE-05 | T-04-B3 | Between-hands expiry → `tableManager.leaveTable(tid)` + `refundCurrentChips` | unit | same file (mocks tableManager + UserRepository.refundCurrentChips) | ❌ W0 | ⬜ pending |
| 00 (Wave 0) | 0 | RESILIENCE-05 | T-04-B4 | Client overlay does NOT render when reconnect lands within 1500ms | unit | `cd client && vitest run src/components/__tests__/ReconnectOverlay.test.tsx` | ❌ W0 | ⬜ pending |
| 00 (Wave 0) | 0 | RESILIENCE-05 | T-04-B4 | Client overlay renders 1500ms after disconnect with countdown | unit | same file (uses `vi.useFakeTimers()`, advances 1500ms) | ❌ W0 | ⬜ pending |
| 00 (Wave 0) | 0 | RESILIENCE-05 | T-04-B4 | Client overlay dismisses on `tableJoined` event | unit | same file (mock socket emit, assert overlay unmounts) | ❌ W0 | ⬜ pending |
| 00 (Wave 0) | 0 | RESILIENCE-05 | T-04-B4 | Client overlay shows "sat out" sub-view when 30s expires without reconnect | unit | same file (advance 31500ms total) | ❌ W0 | ⬜ pending |
| 00 (Wave 0) | 0 | RESILIENCE-06 | T-04-C1 | `recoverPersistedSessions` calls `refundCurrentChips` for every row with `currentTableId IS NOT NULL` | unit | `vitest run --config vitest.config.server.ts server/__tests__/SessionRecovery.test.ts` | ❌ W0 | ⬜ pending |
| 00 (Wave 0) | 0 | RESILIENCE-06 | T-04-C3 | Stale tableId (not in `PREDEFINED_TABLES`) logs warn + still refunds | unit | same file as above | ❌ W0 | ⬜ pending |
| 00 (Wave 0) | 0 | RESILIENCE-06 | T-04-C4 | Sweep is per-row — one row failing does not abort the sweep | unit | same file as above (mock one rejection) | ❌ W0 | ⬜ pending |
| 00 (Wave 0) | 0 | RESILIENCE-07 | T-04-D1 | `tryDecrementBalance` returns true when `balance >= amount` | unit | `vitest run --config vitest.config.server.ts server/__tests__/UserRepository.atomic.test.ts` | ❌ W0 | ⬜ pending |
| 00 (Wave 0) | 0 | RESILIENCE-07 | T-04-D1 | `tryDecrementBalance` returns false when `balance < amount` (no DB write) | unit | same file (mock `updateMany` returning `{count: 0}`) | ❌ W0 | ⬜ pending |
| 00 (Wave 0) | 0 | RESILIENCE-07 | T-04-D2 | `refundCurrentChips` is idempotent: second call returns null and does no second write | unit | same file as above | ❌ W0 | ⬜ pending |
| 00 (Wave 0) | 0 | RESILIENCE-07 | T-04-D2 | `refundCurrentChips` returns null when `currentChips IS NULL` (never seated) | unit | same file as above | ❌ W0 | ⬜ pending |
| 00 (Wave 0) | 0 | RESILIENCE-02 | T-04-D2 | Grace-expiry refund path uses the SAME `refundCurrentChips` helper as boot recovery | unit | covered by `GraceRegistry.test.ts` via mock-spy on `UserRepository.refundCurrentChips` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/__tests__/GraceRegistry.test.ts` — covers RESILIENCE-05 timer state machine + re-arm logic. Pattern: `vi.useFakeTimers()` + module-level `__resetForTests` (mirror `server/__tests__/HandHistoryQueue.test.ts`).
- [ ] `server/__tests__/SessionRecovery.test.ts` — covers RESILIENCE-06 boot sweep. Mock `prisma.user.findMany` and `UserRepository.refundCurrentChips`.
- [ ] `server/__tests__/UserRepository.atomic.test.ts` — covers RESILIENCE-07. Mock `prisma.user.updateMany` returning `{count: 0}` and `{count: 1}`. Mock `prisma.user.findUnique` for the read step in `refundCurrentChips`.
- [ ] `server/__tests__/reconnectHandshake.test.ts` — covers RESILIENCE-04. Inline-harness pattern (mirror `server/__tests__/getHandHistory.test.ts:20`); copy the auth handler body verbatim and assert `socket.emit` + `tableManager.setSocketForTelegram` calls.
- [ ] `client/src/components/__tests__/ReconnectOverlay.test.tsx` — covers RESILIENCE-05 client side. Use `render` + `vi.useFakeTimers()` (mirror `client/src/components/__tests__/ActionBubbleLayer.test.tsx:45`).

*No framework install needed — Vitest + RTL already configured (Phase 3).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Multi-tab eviction observed end-to-end on real Telegram client | RESILIENCE-04 | Two real Telegram WebApp sessions cannot be scripted in CI; need physical/secondary device | `04-HUMAN-UAT.md` — open Mini App on device A, open same bot on device B, confirm device A receives `replacedBySession` and reverts to login screen |
| Mobile reconnect UX (300–800 ms WebSocket hiccup) does NOT flicker the overlay | RESILIENCE-05 | Real cellular network jitter is unscriptable; debounce calibration must be felt on device | `04-HUMAN-UAT.md` — toggle airplane mode on/off briefly while at table; overlay must NOT appear unless disconnect persists ≥1500ms |
| `Reconnecting…` overlay countdown reads naturally on mobile widths | RESILIENCE-05 | Visual/typographic judgment; Neon Strip glow rendering on real OLED | `04-HUMAN-UAT.md` — close Mini App mid-hand, reopen at 5s, 15s, 25s, 35s; confirm countdown text + glow + sat-out sub-view |
| Server boot recovery refunds visible on next login | RESILIENCE-06 | Requires server restart in dev/staging; not a unit-test target | `04-HUMAN-UAT.md` — sit at a table with chips, restart server, reopen Mini App, confirm balance reflects refund and no seat is held |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (5 new test files)
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
