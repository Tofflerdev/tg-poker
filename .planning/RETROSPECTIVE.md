# Retrospective — NightRiver (tg-poker)

---

## Milestone: v1.0 — MVP Launch

**Shipped:** 2026-05-05
**Phases:** 6 | **Plans:** 38 | **Tests:** 204

### What Was Built

1. Full Neon Strip redesign — all 4 pages with shared ui/ primitives; NightRiver brand (SVG logo, favicon, manifest)
2. 20-animal avatar system — random on signup, user-changeable, live-propagating to seats; 20 WebP assets shipped
3. Reconnect-safe sessions — 30s/120s grace windows, full GameState snapshot, crash recovery at boot, atomic buy-in/cashout
4. Hidden admin panel — JWT auth, 4 live dashboards, 6 admin mutations, write-before-commit audit trail
5. 204-test Vitest + RTL suite — per-element coverage, 5 scenario flows, GitHub Actions CI gate
6. Sentry + PostHog observability with PII scrubbing; ToS/Privacy/RG compliance + server-side joinTable enforcement

### What Worked

- **RED scaffold pattern (Phases 4, 5):** Writing Vitest test files before implementation made contracts explicit and caught integration issues before they became bugs. The Nyquist rule (every verify criterion has an automated target) paid off consistently.
- **Phase 1 linchpin strategy:** Landing telegramId-keyed storage, Game callbacks, and auth hardening in Phase 1 unblocked all downstream phases without re-entrant refactors.
- **Coarse granularity:** 6 phases with 38 plans gave a good balance — enough structure to parallelize planning without over-engineering the roadmap.
- **Separate lazy chunk for admin:** Zero admin code in the player main bundle from day one (IS_ADMIN_PATH gate + React.lazy). No future leakage risk.
- **Async HandHistoryQueue:** The decision to keep DB writes off the game-loop hot path was the right call. Zero game-loop latency impact.

### What Was Inefficient

- **REQUIREMENTS.md tracking lag:** The requirements traceability table was never updated after Phase 1 and Phase 2 executed. By Phase 6, it showed 30/52 complete when actual was ~50/52. Future milestones should update REQUIREMENTS.md checkboxes at each phase completion rather than leaving it to the milestone-close ceremony.
- **ROADMAP.md Phase 2 entry:** Phase 2 ran 8 plans but ROADMAP.md showed it as "0/0 plans, Not started" throughout the milestone. The ROADMAP progress table needs updating when plan counts are finalized.
- **Executor interruptions (usage-limit):** Plans 02-04, 02-06, and 02-08 were each interrupted mid-session by usage limits; the orchestrator materialized SUMMARY files on resume. This pattern is recoverable but adds ceremony. No data was lost.
- **WebP asset generation deferred:** Plan 02-02 shipped the full avatar pipeline but could not generate 20 WebP files (no image-generation tooling). The gap was tracked and closed via a dedicated commit but added a separate work item outside the GSD plan structure.

### Patterns Established

- **ActionTier closed union** as the single source of truth for all action-tier visuals — variants route through VARIANT_TIER → CSS custom properties, no escaped hex literals.
- **runWithAudit chokepoint** for admin mutations — audit write before mutation; throw in audit aborts mutation. Clean invariant, single enforcement site.
- **Two-step privacy filter in HandHistoryRepository** — read own rows then opponent rows by handId; `showedDown ? holeCards : []` is the single source of truth for privacy at line 140.
- **Module-singleton GraceRegistry** — timer state machine for disconnect grace windows; owned by one module, imported by reconnect + boot paths. No shared mutable state in index.ts.

### Key Lessons

1. **Update tracking artifacts at phase completion, not milestone close.** REQUIREMENTS.md checkboxes and ROADMAP.md plan counts should be updated immediately after each phase completes, not left for the milestone ceremony.
2. **The linchpin phase is worth extra planning time.** Phase 1 (telegramId refactor + auth hardening + callbacks) was the most leveraged investment — every downstream phase depended on it. Getting the contracts exactly right there saved re-entrant work later.
3. **Lazy-load admin from day one.** Retrofitting code-splitting after the fact is painful. The IS_ADMIN_PATH gate + React.lazy approach from Phase 5 cost nothing extra to establish early.
4. **Executor context loss is recoverable.** Several plans were interrupted by usage limits. The pattern of materializing SUMMARY files on resume (with full commit history intact) worked reliably.

---

## Cross-Milestone Trends

| Metric | v1.0 |
|--------|------|
| Phases | 6 |
| Plans | 38 |
| Timeline | 21 days |
| Tests | 204 |
| LOC (TS/TSX) | ~17,744 |
| Known gaps | 2 (minor, accepted) |
