
## 2026-04-30 — During 04-04 execution

- `.planning/phases/04-resilience/04-02-SUMMARY.md` is untracked (never committed) even though its underlying feature work landed in commit `bc0b330` (`feat(04-02): add GraceRegistry singleton-as-module timer state machine`). Out of scope for plan 04-04. Recommend committing this orphan SUMMARY in a `docs(04-02): backfill missed SUMMARY` housekeeping commit before phase close.

## 2026-04-30 — During 04-06 execution

- Pre-existing TypeScript error in `client/src/hooks/useTelegram.ts:131` — `displayName` missing on `TelegramUser` set-state arg. Verified present on main BEFORE 04-06's edits to App.tsx. Out of scope for 04-06 per SCOPE BOUNDARY rule. Client vitest suite (57/57) and the App.tsx changes themselves typecheck fine; this is in an unrelated file. Tracking for a future fix (likely Phase 6 test hardening or a follow-up CLAUDE.md hygiene pass).
