---
phase: 3
slug: gameplay-additions
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-18
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 1.x (server: `environment: 'node'`, client: `environment: 'jsdom'` + `@testing-library/react`) |
| **Config file** | `vitest.config.server.ts`, `client/vitest.config.ts` (Wave 0 installs both) |
| **Quick run command** | `npx vitest run --reporter=dot` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds full suite |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=dot <touched-file>`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 3-00-01 | 00 | 0 | INFRA | — | N/A | install | `npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom @vitest/coverage-v8` | ❌ W0 | ⬜ pending |
| 3-00-02 | 00 | 0 | INFRA | — | N/A | config | `npx vitest run --reporter=dot tests/smoke.test.ts` | ❌ W0 | ⬜ pending |
| 3-XX-XX | XX | 1+ | GAME-01 | — | actionBubble event broadcast on every player action | unit (server) | `npx vitest run server/__tests__/actionBubbleBroadcast.test.ts` | ❌ W0 | ⬜ pending |
| 3-XX-XX | XX | 1+ | GAME-02 | — | motion/react renders bubble with reduced-motion respected | unit (client) | `npx vitest run client/src/components/__tests__/ActionBubble.test.tsx` | ❌ W0 | ⬜ pending |
| 3-XX-XX | XX | 1+ | GAME-03 | — | min 900ms display + per-seat FIFO | unit (client) | `npx vitest run client/src/components/__tests__/ActionBubbleLayer.test.tsx` | ❌ W0 | ⬜ pending |
| 3-XX-XX | XX | 1+ | PROFILE-02 | — | HandHistoryQueue batches and createMany succeeds; retry+drop works | unit (server) | `npx vitest run server/__tests__/HandHistoryQueue.test.ts` | ❌ W0 | ⬜ pending |
| 3-XX-XX | XX | 1+ | PROFILE-03 | — | getHandHistory returns ≤50 rows for the requesting user, ordered DESC | unit (server) | `npx vitest run server/__tests__/HandHistoryRepository.test.ts` | ❌ W0 | ⬜ pending |
| 3-XX-XX | XX | 1+ | PROFILE-04 | T-3-PRIVACY | opponent holeCards stripped at non-showdown; own always visible | unit (server) | `npx vitest run server/__tests__/HandHistoryRepository.privacy.test.ts` | ❌ W0 | ⬜ pending |
| 3-XX-XX | XX | 1+ | RESILIENCE-02 | — | checkpointSeatedPlayers writes currentChips/currentTableId/currentSeat per seat | unit (server) | `npx vitest run server/__tests__/checkpointSeatedPlayers.test.ts` | ❌ W0 | ⬜ pending |
| 3-XX-XX | XX | 1+ | RETENTION | — | retention sweep removes rows older than 90d | unit (server) | `npx vitest run server/__tests__/handHistoryRetention.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Planner will replace `XX` placeholders with concrete plan/task IDs and may add per-task rows. Wave 0 must populate File Exists column with actual stub paths.*

---

## Wave 0 Requirements

- [ ] `vitest.config.server.ts` — Node environment, NodeNext resolve, includes `server/**/__tests__/**`
- [ ] `client/vitest.config.ts` — jsdom environment, includes `client/src/**/__tests__/**`
- [ ] `server/__tests__/setup.ts` — Prisma test client mock or in-memory adapter wiring
- [ ] `client/src/test/setup.ts` — `@testing-library/jest-dom` registration, `matchMedia` mock for `prefers-reduced-motion`
- [ ] Install: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `@vitest/coverage-v8`
- [ ] `tests/smoke.test.ts` — single passing test confirming runner works
- [ ] Update root `package.json` with `test`, `test:watch`, `test:coverage` scripts (no watch flags in `test`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Bubble visual fidelity (Neon Strip color/glow per action tier) | GAME-02 | Visual aesthetics not assertable in unit tests | Open Game Room with 2+ players; trigger Fold/Check/Call/Bet/Raise/All-in; confirm color matches `--color-action-{fold,call,raise,allin}` and glow is visible |
| Bubble anchor position above each seat | GAME-02 | Layout depends on rendered seat coordinates | Trigger actions from each of 6 seats; confirm bubble renders above the avatar, never overlaps cards or stack strip; verify on mobile + desktop |
| `prefers-reduced-motion` honored | GAME-02 | Browser-level OS setting | Enable Reduce Motion in OS settings; trigger action; confirm bubble snaps in/out (no scale/fade/drift) but holds 900 ms |
| 5 near-simultaneous folds render in parallel (per-seat queues) | GAME-03 | Timing-sensitive multi-seat interaction | Use 6-handed table; force 5 folds in <100 ms; confirm all 5 bubbles visible at once, none queued globally |
| Profile → History tab shows last 50 hands with correct net delta colors | PROFILE-03 | End-to-end UI rendering | Play ≥3 hands; open Profile → History; verify list ordered DESC, green for win, red for loss, expand-on-tap shows board + own hole cards |
| Hole-card privacy at non-showdown (opponent) | PROFILE-04 | Cross-user view validation | Player A folds pre-flop; Player B opens History; expand the hand row; confirm Player A's hole cards are NOT visible (only own hole cards on non-showdown) |
| Chip checkpoint survives server restart | RESILIENCE-02 | Requires process restart cycle | Sit at table with N chips; complete 1 hand; stop server; restart; query `User` row in DB; confirm `currentChips` reflects post-hand value, `currentTableId` and `currentSeat` set |
| Retention deletes rows older than 90 days | PROFILE-02 (boundary) | Date-dependent; manual easier than time-mocking in tests | Manually insert HandHistory row with `playedAt = now() - 91d`; restart server (boot sweep) OR wait for next 24h tick; confirm row deleted; check stderr log for count |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
