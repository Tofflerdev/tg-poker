---
plan: 02-08
name: consent-and-legal
status: complete
requirements: [COMPLIANCE-01, COMPLIANCE-02, COMPLIANCE-03, COMPLIANCE-05]
decisions: [D-26, D-27, D-28, D-29, D-30]
---

# Plan 02-08 Summary — Consent & Legal

## Commits
- `7fd78de` — feat(02-08): add static legal pages (ToS, Privacy, Responsible Gaming)
- `c2eacf9` — feat(02-08): add Consent page + grandfather banner with client-side gate
- `7327446` — feat(02-08): add server acceptTos handler + UserRepository.acceptTos

## Outcomes

### Task 1 — Static legal pages (D-26, COMPLIANCE-01/02/05)
- `client/src/pages/legal/ToS.tsx` — Terms of Service, Neon Strip styled.
- `client/src/pages/legal/Privacy.tsx` — Privacy policy, Neon Strip styled.
- `client/src/pages/legal/ResponsibleGaming.tsx` — RG page with D-30 content:
  virtual-chip disclaimer, explicit "not for real money" statement, daily-bonus-only
  economy description, informational "take a break" guidance. **No forced lockouts,
  no timer, no session-duration tracking.**

### Task 2 — Consent gate + grandfather banner (D-27, D-29, COMPLIANCE-03)
- `client/src/pages/Consent.tsx` — **full-page route, NOT a modal**. Shown when
  `currentUser.tosAcceptedAt IS NULL`. Single combined checkbox + Accept button.
  Inline links to ToS/Privacy/RG. On Accept: `socket.emit('acceptTos', { version: '1.0' })`,
  waits for `tosAccepted` server ack, then transitions out of gate.
- `client/src/components/ConsentBanner.tsx` — non-blocking dismissible banner for
  grandfathered users. Dismissible once per session via localStorage. Accept routes
  to the full Consent page for the same flow as first-launch.
- `client/src/App.tsx` — `AppView` extended with `'consent' | 'legal-tos' | 'legal-privacy' | 'legal-rg'`.
  Defense-in-depth render guard at top-of-render: if `currentUser && !currentUser.tosAcceptedAt &&
  view !== 'consent' && !view.startsWith('legal-')`, force-render `<Consent />`.
- `client/src/pages/MainMenu.tsx` — footer legal-link placeholders from Plan 02-04 activated
  with real `onNavigate` dispatch; `<ConsentBanner />` mounted at top for grandfather flow.

### Task 3 — Server acceptTos handler (COMPLIANCE-02)
- `server/index.ts` — socket `acceptTos` handler with:
  - **Auth gate (T-02-08-01):** requires populated `socket.data.telegramId`; silent drop otherwise.
  - **Version validation (T-02-08-02):** payload.version must be non-empty string, length ≤ 16 (ASVS V5).
  - Writes via `UserRepository.acceptTos`, mirrors into in-memory session, emits `tosAccepted` ack.
- `server/db/UserRepository.ts` — `acceptTos(telegramId, version)` trusted-write method:
  single UPDATE stamping `tosAcceptedAt = now()` and `tosVersion`. Idempotent per D-27.

## Explicit scope boundary
**D-28 accepted:** server-side `joinTable` ToS enforcement is **deferred to Phase 5
(COMPLIANCE-04)**. This plan does NOT touch `joinTable`. Threat T-02-08-04 disposition =
`accept` — the client-side gate is the Phase 2 boundary as documented.

## Files Modified
- `client/src/pages/legal/ToS.tsx` (new)
- `client/src/pages/legal/Privacy.tsx` (new)
- `client/src/pages/legal/ResponsibleGaming.tsx` (new)
- `client/src/pages/Consent.tsx` (new)
- `client/src/components/ConsentBanner.tsx` (new)
- `client/src/App.tsx`
- `client/src/pages/MainMenu.tsx`
- `server/index.ts`
- `server/db/UserRepository.ts`

## Verification
- `cd client && npm run build` → passes (only carried-over WebP warnings from Plan 02-02 deferred assets).
- `npm run build` (server) → passes.

## Deviations
None — D-30 copy requirements honored, D-28 scope boundary respected, defense-in-depth render
guard implemented as specified.

## Notes
Executor was interrupted by usage-limit after all three tasks' code landed on disk (Task 1
committed; Tasks 2 and 3 staged/untracked). This SUMMARY was materialized by the orchestrator
on resume after committing the remaining work into two atomic commits preserving task boundaries.
