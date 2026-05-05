---
plan: 02-04
name: main-menu-deposit
status: complete
requirements: [UI-01, DEPOSIT-01, DEPOSIT-02]
decisions: [D-15, D-16, D-17]
---

# Plan 02-04 Summary — Main Menu Redesign + Deposit Stub

## Commits
- `74ff3cd` — feat(02-04): redesign MainMenu in Neon Strip — 4 blocks, logo header, avatar via manifest
- `090b7f5` — feat(02-04): add Deposit.tsx stub + wire `'deposit'` AppView variant

## Outcomes
- MainMenu redesigned in Neon Strip consuming `ui/Button`, `ui/Card`, `ui/Badge` primitives.
- Block order per D-16: **Deposit → Tables → Daily Bonus → Profile**.
- NightRiver logo header wired via `import logoUrl from '../assets/logo.svg'`.
- User avatar resolved via `avatarUrl(currentUser.avatarId)` — Telegram `photo_url` no longer rendered (D-15).
- Deposit block opens `'deposit'` AppView variant → `Deposit.tsx` "Coming soon" page (D-17): no external links, no payment SDK, no email capture.
- Footer legal-link handlers are `() => {}` placeholders (legal AppView variants land in Plan 02-08).
- `setHeaderColor('#0a0a0e')` on Deposit mount for Plan 02-03 brand continuity.

## Files Modified
- `client/src/pages/MainMenu.tsx` (redesign)
- `client/src/pages/Deposit.tsx` (new)
- `client/src/App.tsx` (AppView + `'deposit'` render branch)
- `client/src/components/DailyBonusButton.tsx`

## Verification
- `cd client && npm run build` → passes (only carried-over WebP warnings from Plan 02-02 deferred assets).

## Deviations
None.

## Notes
Executor was interrupted by usage-limit mid-session after both feature commits landed; this SUMMARY was materialized by the orchestrator on resume. All task work is committed.
