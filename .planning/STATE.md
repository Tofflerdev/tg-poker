---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: verifying
stopped_at: Completed 06-05-PLAN.md (CI YAML + client test scripts; 187 tests GREEN; Phase 6 complete)
last_updated: "2026-05-05T05:36:49.568Z"
last_activity: 2026-05-05
progress:
  total_phases: 6
  completed_phases: 6
  total_plans: 38
  completed_plans: 38
  percent: 100
---

# Project State

## Current Position

Phase: 06 (test-hardening) — EXECUTING
Plan: 6 of 6
Status: Phase complete — ready for verification
Last activity: 2026-05-05
Stopped at: Completed 06-05-PLAN.md (CI YAML + client test scripts; 187 tests GREEN; Phase 6 complete)

## Session Continuity

Last session: 2026-05-05T05:36:49.564Z
Stopped at: Completed 05-05-PLAN.md (lazy admin subtree, AdminApp, 4 tabs, IS_ADMIN_PATH gate)
Resume file: None

## Current Milestone

**v1.0 MVP Launch** — 12 target features, 44 requirements, 6 phases.

## Progress

- [x] Phase 1: Foundations & Design System  ✓ complete
- [x] Phase 2: Design System Rollout & Avatars  ✓ complete (asset drop pending)
- [x] Phase 3: Gameplay Additions  ✓ complete (human UAT tracked in 03-HUMAN-UAT.md)
- [x] Phase 4: Resilience  ✓ complete (manual UAT tracked in 04-HUMAN-UAT.md)
- [x] Phase 5: Admin, Ops & Observability  ✓ complete (ADMIN-03 closed; manual smoke in 05-05-SUMMARY.md)
- [ ] Phase 6: Test Hardening

## Accumulated Context

### Key Decisions

- Design language locked: **Neon Strip** (tokens in CLAUDE.md)
- Deploy infrastructure explicitly OUT OF SCOPE for this cycle
- Real-money payments OUT OF SCOPE (Deposit is a stub)
- UI redesign uses the `frontend-design` skill to avoid generic AI aesthetics
- Avatar system replaces Telegram avatar (20 generated anthropomorphic-animal images)
- Test stack: Vitest + React Testing Library, one file per interactive element
- Key-by-telegramId refactor is the linchpin and lands in Phase 1 (unblocks reconnect, admin, history, analytics)
- Dev-auth bypass hardened in Phase 1 (fail-closed gate + boot assertion + timingSafeEqual)
- Test track is a dedicated Phase 6 (coarse granularity favors a single verification gate)
- D-09 species list LOCKED: fox, wolf, bear, tiger, panda, raccoon, lion, rabbit, owl, eagle, flamingo, penguin, crocodile, chameleon, cobra, shark, octopus, dolphin, frog, bat (slugs = DB values permanently; rename requires backfill)
- D-09 AI prompt brief LOCKED: dark-background neon-rim portrait, 256×256 WebP, anthropomorphic, cyan/amber rim, ≤15 KB each
- 03-01: ActionBubbleEvent extends PlayerActionEvent with no extra fields (T-3-SCHEMA / D-01) — no holeCards ever in broadcast payload
- 03-01: setOnHandComplete no-op preserved — owned by Plan 03-02
- 03-03: motion@^12.38.0 added as client dep; ActionBubble + ActionBubbleLayer render per-seat FIFO pills with 900 ms hold and useReducedMotion fallback
- 03-03: vi.mock('motion/react', ...) passthrough in tests (Fragment AnimatePresence + plain-tag motion proxy) — deterministic FIFO assertions under vi.useFakeTimers(); production keeps real enter/exit animations
- 03-04: HandHistoryRepository.findForUser uses two-step Prisma query (own rows then opponent rows by handId) with read-time privacy filter `r.showedDown ? r.holeCards : []` — single source of truth at HandHistoryRepository.ts:140 (D-18 / T-3-PRIVACY)
- 03-04: getHandHistory socket handler is zero-arg — identity comes ONLY from socket.data.telegramId; payload ignored entirely (T-3-AUTHZ); 50-row server cap (T-3-DOS); generic 'Server error' string with raw error logged to stderr (T-3-INFO-LEAK)
- 03-04: tableName resolved at read time via PREDEFINED_TABLES Map lookup with raw-tableId fallback for unknown ids — zero schema impact (RESEARCH Open Q1 Option A; D-19)
- 04-00: Wave-0 RED test scaffolds written FIRST — 5 Vitest files (4 server + 1 client) establish behavior contracts for Plans 04-01..04-06 before any implementation lands; honors Nyquist rule (every <verify> has automated target)
- 04-00: reconnectHandshake.test.ts uses inline auth-handler harness — passes today as contract specimen; Plan 04-06 must mirror handler shape verbatim (seat: state.seats.findIndex(p => p?.id === telegramId), replacedBySession bare event, GraceRegistry.clear on reconnect) or 5 tests fail
- 04-00: ReconnectOverlay constants (RECONNECT_OVERLAY_DEBOUNCE_MS=1500, GRACE_MID_HAND_MS=30000, GRACE_BETWEEN_HANDS_MS=120000) exported as named consts — tests assert literal values not timing-fragile observed values; Plan 04-05 must export these or suite fails on import
- 04-01: tryDecrementBalance + refundCurrentChips atomic helpers added to UserRepository — single-statement updateMany with `gte` / `IS NOT NULL` guards close Concern #5 (buy-in double-spend) and provide race-safe refund for grace expiry / boot recovery / leaveTable; 6 RED tests in UserRepository.atomic.test.ts → GREEN; updateBalance preserved unchanged for daily-bonus / winnings paths (D-D2)
- 04-01: refundCurrentChips uses two-step pattern (findUnique → updateMany WHERE currentChips IS NOT NULL) NOT a single $transaction — D-D2 idempotency guard makes concurrent boot-recovery + client-driven refund safe to race; loser sees count===0 and returns null without double-credit
- 04-02: GraceRegistry shipped as singleton-as-module (timer state machine for disconnect grace windows) — RED test scaffold from Plan 04-00 → GREEN; surface used by Plan 04-04 (boot recovery) and Plan 04-06 (auth handler reconnect path)
- 04-03: replacedBySession typed as bare event `() => void` in ExtendedServerEvents — pure-additive type change (Phase 1 placeholder was `'sessionReplaced' as any`, never declared in interface); Plan 04-06 owns runtime cast removal at server/index.ts:239 to keep review-boundary discipline (RESILIENCE-04 / D-A3 / T-04-A3-1)
- 04-05: ReconnectOverlay component shipped — 5-state OverlayState union (hidden / reconnecting / sat-out / vacated / replaced), triple useRef timer storage (debounce / grace / tick), 1500 ms debounce closes Pitfall 5 rapid-cycle flicker, replacedBySession bypasses debounce per D-A3; tickNow synced at overlay-open inside debounce callback (Rule 1 deviation from plan-supplied code) — without sync, stale mount-time tickNow renders countdown as 32/122 not 30/120; 11 RED → GREEN, full client suite 57 / 57
- 04-04: SessionRecovery boot sweep shipped — recoverPersistedSessions() enumerates User rows with currentTableId IS NOT NULL via @@index, refunds each through Plan 04-01's UserRepository.refundCurrentChips inside a per-row try/catch (D-C4 amended 2026-04-29 — no outer $transaction; the helper is self-contained atomic per row), warns on stale tableIds (D-C3) but refunds anyway, returns { recovered: N }; always-refund policy (D-C1) — no reseat-as-sit-out branch; 4 RED → GREEN, full server suite 59 → 63
- 04-06: Phase 4 integration complete — 8 production-code edits across server/index.ts (auth handler, joinTable, legacy join, leaveTable, disconnect, setOnHandComplete, boot block) + client/src/App.tsx (ReconnectOverlay mount). Auth handler emits typed `replacedBySession` (no `as any`, no payload) + tableJoined snapshot via getStateForPlayer (T-04-Info-Leak mitigated); disconnect handler arms stage-aware GraceRegistry timer (no immediate leave/refund — RESILIENCE-02 preserved); joinTable + legacy join + leaveTable atomic via tryDecrementBalance/refundCurrentChips (Concerns #5/#11 closed); boot block awaits SessionRecovery.recoverPersistedSessions; setOnHandComplete listener calls reArmIfMidHand (Pitfall 1 closed); ReconnectOverlay mounted via const-once + 11 inline mounts; 63/63 server + 57/57 client tests still GREEN; tableManager.handleDisconnect retained for Phase 5 ADMIN-05 kick
- 05-00: Wave-0 RED scaffold pattern used for Phase 5 — 7 test files written before any implementation; each downstream plan (05-01..05-05) has a pre-written automated verification target; honors Nyquist rule (every <verify> has automated target)
- 05-00: server/__tests__ excluded from tsconfig.json include scope — test files run by vitest only, not tsc; avoids tsc errors from RED imports referencing not-yet-created modules (Rule 3 auto-fix)
- 05-00: Implementation seam ownership locked: scrubber.ts → 05-02; analytics.ts → 05-02; adminAuth.ts → 05-03; adminNamespace.ts → 05-04; adminMutations.ts → 05-04; joinGate.ts → 05-01; AdminLogin.tsx → 05-05
- 05-01: gateUserOrEmit checks ban-first (banned users get BANNED error even without tosAcceptedAt); auth handler unchanged (banned users can authenticate per RESEARCH Open Q3); JoinGateUser interface accepts string|Date|null for Prisma and in-memory TelegramUser compatibility; COMPLIANCE-04 closed
- 05-02: client entry point is index.tsx not main.tsx — Sentry/PostHog boot init applied to index.tsx; posthog-node engine warning for node 22.19.0 vs required 22.22.0 is non-blocking; OBS-01/02/03/04 + SECURITY-04 closed
- 05-02: analyticsId = sha256(telegramId) injected into authSuccess payload; client calls identifyAnalytics(analyticsId) once on auth; raw telegramId never reaches PostHog (D-12); scrubSentryEvent wired as beforeSend on both server and client Sentry init
- 05-03: POST /api/admin/login issues HS256 JWT (8h) via signAdminToken; validateCredentials uses crypto.timingSafeEqual; assertSafeBootOrExit exits 1 in prod if JWT_SECRET missing; generic 401 for all login failures (no username-vs-password oracle); express.json+cors registered before Socket.io setup (T-5-03-1..5, T-5-03-7, T-5-03-9)
- 05-04: io.of() cast to any to avoid TS2558 — Socket.io v4 of() TypeScript overloads accept 0 type args; admin namespace typed via ReturnType<typeof io.of> cast; runtime behavior identical
- 05-04: tableAdminState Map owned by adminMutations.ts module — Table model not extended; admin overlay (enabled/disabled/draining) is admin-only concern; buildAdminState reads via getTableAdminStatus()
- 05-04: runWithAudit is the single chokepoint for ADMIN-06 — prisma.adminAuditLog.create() BEFORE mutationFn(); throw in create() aborts mutation; audit row persists even if mutation throws after
- 05-05: AdminApp lazy-loaded via React.lazy() — separate Vite chunk AdminApp-C3D6-bPz.js; zero admin code in player main bundle (T-5-05-1 mitigated); ADMIN-03 closed
- 05-05: IS_ADMIN_PATH = window.location.pathname.startsWith('/admin') computed once at module load; player socket null-cast when on admin path; short-circuit at top of App component before useTelegram or any player state
- 05-05: TabBar API uses tabs/activeId/onChange props (not children JSX) — adjusted from plan template to match actual Tab.tsx component contract (Rule 1 auto-fix)
- 06-00: window.Telegram stub uses vi.fn() for all callables in setup.ts; initData='' keeps useTelegram() in standalone mode — tests cannot exercise real Telegram auth; baseline client suite was 60 tests (plan stated 57); final count after Button + Tab tests is 71
- 06-04: Scenario tests use role='radio' for avatar tiles, role='button' with name regex for BlockCard; Confirm label is 'No changes' when dirty=false (not 'Confirm') — plan template corrected; 5 new files, 15 tests, TEST-03 closed

### Blockers

- **20 WebP avatar binaries not generated** — no image-generation MCP in executor env. Client build emits Vite runtime-URL warnings for all 20 slugs; runtime will 404 on `<img src>` until files ship at `client/src/assets/avatars/{slug}.webp`. Unblocker: human-supplied WebPs matching the locked brief; no further code changes required after drop.

### Pending Todos

- Supply 20 WebP binaries per locked species list + prompt brief
- Continue Plan 02-03 (next page redesign)

## Notes

Brownfield project — core game engine, persistence, transport, and auth already implemented. Existing codebase map in `.planning/codebase/`. Research summary in `.planning/research/SUMMARY.md`.
