# Phase 6: Test Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-03
**Phase:** 06-test-hardening
**Areas discussed:** Coverage scope

---

## Coverage Scope

### Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Coverage scope | TEST-02 scope: leaf primitives vs all interactive components | ✓ |
| Socket.io mock depth | Shared mock vs per-test stubs | |
| Scenario test structure | Location + depth of scenario tests | |
| CI gate interpretation | GitHub Actions vs local npm-test gate | |

**User's choice:** Coverage scope only — remaining areas left to Claude's discretion.

---

### Q: How broadly to interpret 'every interactive UI element'?

| Option | Description | Selected |
|--------|-------------|----------|
| Broad: all interactive components | Every tappable/clickable/typeable component gets a test | ✓ |
| Strict leaf-only: Button + Tab + inputs | Only ui/ primitives and form inputs | |
| Tiered: high-value components only | GameControls, DailyBonusButton, Chat, ConsentBanner only | |

**User's choice:** Broad — all interactive components.

---

### Q: SeatsDisplay — unit test or scenario only?

| Option | Description | Selected |
|--------|-------------|----------|
| Scenario only — skip SeatsDisplay unit test | Join-table scenario covers it | |
| Both — SeatsDisplay gets its own unit test | Unit test + scenario (better isolation) | ✓ |

**User's choice:** Both — SeatsDisplay gets its own unit test.

---

### Q: GameControls interaction states depth?

| Option | Description | Selected |
|--------|-------------|----------|
| Happy path only — fold/call/raise fire socket.emit | One test per action, vi.fn() stubs | ✓ |
| Happy path + edge cases — min/max raise, disabled states | Thorough but heavy setup | |
| Edge cases only for the tricky bits | Slider edge cases, all-in visibility | |

**User's choice:** Happy path only — fold/call/raise emit.

---

### Q: Pages — unit tests or scenario only?

| Option | Description | Selected |
|--------|-------------|----------|
| Scenario tests cover pages — no separate page unit tests | TEST-03 scenarios cover pages | ✓ |
| Pages get shallow render smoke tests | ~5 extra tests, catches import errors | |
| Pages get full interaction tests | Heaviest coverage, duplicates scenarios | |

**User's choice:** Scenario tests only — no separate page unit tests.

---

### Q: ui/ primitives — which ones need tests?

| Option | Description | Selected |
|--------|-------------|----------|
| Button and Tab get tests, Badge/Card skipped | Button + Tab are interactive; Badge/Card display-only | ✓ |
| All 4 ui/ primitives get tests | Max primitive coverage | |
| Skip all ui/ primitives — covered by component tests | Indirect coverage through GameControls etc. | |

**User's choice:** Button + Tab get tests; Badge + Card skipped.

---

## Claude's Discretion

- Socket.io mock strategy (shared setup.ts mock vs per-test vi.fn())
- CI gate: GitHub Actions YAML vs local npm-test gate vs coverage thresholds
- Admin UI panels beyond AdminLogin (AdminTables, AdminUsers, AdminAudit, AdminEconomy)
- Disconnect+reconnect scenario test depth (existing ReconnectOverlay.test.tsx may suffice)
- Coverage threshold configuration

## Deferred Ideas

- Coverage thresholds (lines ≥ 80%) — v1.1+ hardening
- Playwright / Cypress E2E — no deploy infra in this cycle
- Visual regression tests — v1.1+ when design stable
- GameControls slider edge cases — v1.1+ after game play feedback
