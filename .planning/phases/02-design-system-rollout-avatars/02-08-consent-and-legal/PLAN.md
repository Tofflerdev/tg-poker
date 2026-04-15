---
phase: 02-design-system-rollout-avatars
plan: 08
type: execute
wave: 3
depends_on: ["02-01", "02-02", "02-04"]
files_modified:
  - client/src/pages/legal/ToS.tsx
  - client/src/pages/legal/Privacy.tsx
  - client/src/pages/legal/ResponsibleGaming.tsx
  - client/src/pages/Consent.tsx
  - client/src/components/ConsentBanner.tsx
  - client/src/App.tsx
  - server/index.ts
autonomous: true
requirements: [COMPLIANCE-01, COMPLIANCE-02, COMPLIANCE-03, COMPLIANCE-05]
must_haves:
  truths:
    - "Three static legal pages exist at routes legal-tos / legal-privacy / legal-rg, each Neon Strip styled and reachable from Main Menu footer + Profile (D-26, COMPLIANCE-01)"
    - "First-launch consent is a single full-page route: shown to any authenticated user with tosAcceptedAt == null (D-27, COMPLIANCE-02)"
    - "Consent route has inline links to all 3 legal docs + one combined checkbox + Accept button"
    - "On Accept: socket emits acceptTos { version: '1.0' }; server writes tosAcceptedAt = now() and tosVersion = '1.0' to User row; emits tosAccepted ack; client transitions to menu"
    - "Defense-in-depth guard at top of App.tsx render: if currentUser && !currentUser.tosAcceptedAt && view !== 'consent' && !view.startsWith('legal-') → render Consent (RESEARCH Pitfall 4)"
    - "Server-side validation: acceptTos requires authenticated socket (socket.data.telegramId), payload.version is non-empty string ≤ 16 chars; otherwise reject"
    - "Grandfather banner (ConsentBanner) shown on Main Menu IFF currentUser.tosAcceptedAt == null AND localStorage 'consent_banner_dismissed_v1' != '1' (D-29, COMPLIANCE-03)"
    - "Banner Accept goes through the same acceptTos socket flow + sets the localStorage flag; banner Dismiss only sets localStorage flag"
    - "RG page contains: virtual-chip disclaimer, explicit 'not for real money', daily-bonus-only economy description, informational 'take a break' guidance — NO forced lockouts, NO timer, NO session tracking (D-30, COMPLIANCE-05)"
    - "Server-side joinTable enforcement is NOT added in this plan — explicitly deferred to Phase 5 COMPLIANCE-04 (D-28)"
  artifacts:
    - path: "client/src/pages/legal/ToS.tsx"
      provides: "Static Terms of Service page, Neon Strip styled"
    - path: "client/src/pages/legal/Privacy.tsx"
      provides: "Static Privacy Policy page"
    - path: "client/src/pages/legal/ResponsibleGaming.tsx"
      provides: "Static RG page per D-30"
    - path: "client/src/pages/Consent.tsx"
      provides: "First-launch consent gate full-page route"
    - path: "client/src/components/ConsentBanner.tsx"
      provides: "Grandfather banner for Main Menu (non-blocking, dismissible)"
    - path: "client/src/App.tsx"
      provides: "AppView extended with consent + legal-{tos,privacy,rg}; defense-in-depth gate guard; routing branches"
    - path: "server/index.ts"
      provides: "acceptTos socket handler with validation + ack"
  key_links:
    - from: "client/src/pages/Consent.tsx"
      to: "server/index.ts acceptTos handler"
      via: "socket.emit('acceptTos', { version: '1.0' })"
      pattern: "acceptTos"
    - from: "server/index.ts acceptTos"
      to: "prisma User row"
      via: "prisma.user.update({ where: { telegramId }, data: { tosAcceptedAt: new Date(), tosVersion } })"
      pattern: "tosAcceptedAt"
    - from: "client/src/App.tsx authSuccess listener"
      to: "Consent route"
      via: "setView(userData.tosAcceptedAt ? 'menu' : 'consent')"
      pattern: "tosAcceptedAt \\? 'menu' : 'consent'"
    - from: "client/src/components/ConsentBanner.tsx"
      to: "localStorage"
      via: "consent_banner_dismissed_v1 key"
      pattern: "consent_banner_dismissed"
---

<objective>
Ship the complete client-side compliance gate end-to-end:
1. Three static legal pages (ToS, Privacy, Responsible Gaming) — D-26.
2. First-launch full-page consent route writing `tosAcceptedAt` + `tosVersion` — D-27.
3. Defense-in-depth render guard preventing un-accepted users from reaching gameplay views — RESEARCH Pitfall 4.
4. Grandfather banner on Main Menu for legacy users — D-29.
5. Server `acceptTos` socket handler with validation — RESEARCH Pitfall 6.
6. Wire footer/profile entry points to legal pages — left as placeholders by Plan 04, finalized here.

Per D-28: server-side `joinTable` ToS enforcement is **explicitly out of scope** (Phase 5 COMPLIANCE-04). Phase 2 gate is client-side only — this is the documented trade-off.

Output: COMPLIANCE-01 + COMPLIANCE-02 + COMPLIANCE-03 + COMPLIANCE-05 satisfied.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/02-design-system-rollout-avatars/02-CONTEXT.md
@.planning/phases/02-design-system-rollout-avatars/02-RESEARCH.md
@client/src/App.tsx
@server/index.ts
@server/db/UserRepository.ts
@.planning/phases/02-design-system-rollout-avatars/02-01-ui-primitives/02-01-SUMMARY.md
@.planning/phases/02-design-system-rollout-avatars/02-02-avatar-pipeline/02-02-SUMMARY.md
@.planning/phases/02-design-system-rollout-avatars/02-04-main-menu-deposit/02-04-SUMMARY.md

<interfaces>
<!-- From Plan 01 -->
import { Button, Card } from '../components/ui';

<!-- From Plan 02 -->
// types/index.ts already extended:
TelegramUser.tosAcceptedAt?: string;
ExtendedClientEvents.acceptTos: ({ version: string }) => void;
ExtendedServerEvents.tosAccepted: ({ tosAcceptedAt: string; tosVersion: string }) => void;

<!-- App.tsx AppView union (after Plan 04 added 'deposit') -->
type AppView = 'loading' | 'auth' | 'menu' | 'tables' | 'game' | 'profile' | 'deposit';
// extend in this plan with: | 'consent' | 'legal-tos' | 'legal-privacy' | 'legal-rg'

<!-- Page contracts -->
interface ConsentProps {
  socket: Socket;
  onAccept: () => void;
  onViewLegal: (which: 'tos' | 'privacy' | 'rg') => void;
}
interface LegalPageProps { onBack: () => void; }
interface ConsentBannerProps {
  socket: Socket;
  onAccept: () => void;
  onViewLegal: (which: 'tos' | 'privacy' | 'rg') => void;
}

<!-- Existing Prisma User columns from Phase 1 -->
tosAcceptedAt: DateTime?
tosVersion: String?
// No migration needed.

<!-- Existing socket auth pattern -->
Server handlers gate on `socket.data.telegramId` populated by initData HMAC validation in middleware/auth.ts.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Create three static legal pages (ToS, Privacy, Responsible Gaming)</name>
  <files>client/src/pages/legal/ToS.tsx, client/src/pages/legal/Privacy.tsx, client/src/pages/legal/ResponsibleGaming.tsx</files>
  <action>
    Each page: top back button (ui/Button variant="neutral", onClick={onBack}), page title, scrollable Card-wrapped body of static legal copy. Neon Strip styled, dark surface, comfortable line-height (1.6) for readability.

    Drafts (planner-discretion English v1.0 per D-26 — user reviews and replaces before production launch; mark prominently in code comments that copy is DRAFT v1.0):

    **ToS.tsx** (Terms of Service):
    - Sections: 1. Acceptance of Terms · 2. Eligibility (18+) · 3. Virtual Chips Only (no real money, no cash redemption) · 4. Account & Conduct (no cheating, no multi-accounting) · 5. Daily Bonus rules · 6. Termination (we may suspend) · 7. Limitation of Liability · 8. Changes to Terms · 9. Contact.
    - Tone: plain English, short paragraphs.

    **Privacy.tsx**:
    - Sections: 1. What We Collect (Telegram ID, display name, gameplay stats — no real-name, no payment data, no contact details beyond Telegram) · 2. How We Use It (run the game, prevent abuse, anonymous analytics) · 3. Sharing (we don't sell data; aggregated analytics only) · 4. Cookies/Storage (sessionStorage + localStorage for game state) · 5. Data Retention (hand history 90 days per Phase 3) · 6. Your Rights (request deletion via support) · 7. Contact.

    **ResponsibleGaming.tsx** per D-30 / COMPLIANCE-05 — REQUIRED CONTENT:
    - **Virtual-chip disclaimer**: "All chips, balances, and bonuses in NightRiver are virtual and have no monetary value. They cannot be exchanged for cash, goods, or other consideration."
    - **Not for real money**: "NightRiver is a free play-money poker app. There is no deposit, no withdrawal, and no gambling for real money or prizes."
    - **Daily-bonus-only economy**: "Your chip balance refills to 1000 once every 24 hours when it falls below that amount. There is no other way to acquire chips."
    - **Take a break (informational)**: "Even play-money poker rewards focus and discipline. If a session is making you tense, frustrated, or causing you to neglect responsibilities, step away. Healthy play looks like: short sessions, clear stop times, and time spent away from the table."
    - Explicitly state the absence of forced lockouts: "We do not enforce session-duration limits, deposit limits, or self-exclusion at this time. The above guidance is informational."
    - NO forced lockouts, NO timer, NO session tracking, NO age verification UI.

    Each file: pure functional component, ≤ 200 lines, no socket, no data fetch, no state beyond an internal scroll position if needed. Mark copy as `/* DRAFT v1.0 — user to review before production launch */`.
  </action>
  <verify>
    <automated>cd client && npm run build</automated>
  </verify>
  <done>Three legal page files exist with required sections; RG page contains all 4 mandated content items + explicit no-lockout statement; Neon Strip styled (Card + back Button); build passes.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Build Consent.tsx full-page gate + ConsentBanner.tsx grandfather banner + server acceptTos handler</name>
  <files>client/src/pages/Consent.tsx, client/src/components/ConsentBanner.tsx, server/index.ts</files>
  <action>
    **client/src/pages/Consent.tsx** per D-27 / RESEARCH §Example 2:
    - Full-page Neon Strip layout (`minHeight: '100vh'`).
    - Headline: "Welcome to NightRiver".
    - Body explaining briefly: "Before you play, please review and accept our terms."
    - 3 inline links (`<a onClick={() => onViewLegal('tos' | 'privacy' | 'rg')}>Terms of Service / Privacy Policy / Responsible Gaming</a>`) — clicking transitions to the corresponding legal-* view; from there back returns to Consent (preserving in-progress agreement state if simple, or restarting cleanly).
    - One COMBINED checkbox: "I agree to the Terms, Privacy Policy, and Responsible Gaming guidelines." (single checkbox — D-27 explicit).
    - `<Button variant="active" emphasis disabled={!agreed || submitting}>` Accept.
    - On Accept: `setSubmitting(true); socket.emit('acceptTos', { version: '1.0' }); socket.once('tosAccepted', (payload) => { setSubmitting(false); onAccept(); });` (and update currentUser.tosAcceptedAt — actually App.tsx does this in its tosAccepted listener; see Task 3).
    - No skip button. No "remind me later". This is a gate.

    **client/src/components/ConsentBanner.tsx** per D-29 / RESEARCH Q6:
    - Renders at top of MainMenu when shown.
    - Props: `socket`, `onAccept` (clears banner state in parent), `onViewLegal`.
    - State: `const [dismissed, setDismissed] = useState(() => localStorage.getItem('consent_banner_dismissed_v1') === '1');`
    - Conditional render: parent (MainMenu, modified in this task) decides to show banner only if `currentUser.tosAcceptedAt == null && !dismissed`.
    - Banner UI: small `<Card variant="raise">` (amber for attention) with copy "Please review our updated Terms" + 2 buttons:
      - `<Button variant="active" emphasis>Accept</Button>` — same acceptTos flow as Consent.tsx; on success ALSO `localStorage.setItem('consent_banner_dismissed_v1', '1')`.
      - `<Button variant="neutral">Dismiss</Button>` — `localStorage.setItem('consent_banner_dismissed_v1', '1'); setDismissed(true);` only (does NOT call acceptTos).
    - Tappable inline link "Read terms" → onViewLegal('tos').
    - Modify `MainMenu.tsx` (Plan 04 owner — coordinate touch via simple insertion at the top of the page when banner condition is true; this is a 5-line additive change to a Plan 04 file — call out in SUMMARY).

    **server/index.ts** acceptTos handler per RESEARCH §Pitfall 6 + Security:
    - Register `socket.on('acceptTos', async (payload) => { ... })`:
      1. Require `socket.data.telegramId` populated (auth gate); reject (silent return) otherwise. Mitigates T-02-08-01.
      2. Validate `typeof payload?.version === 'string' && payload.version.length > 0 && payload.version.length <= 16`; reject otherwise. Mitigates T-02-08-02 (ASVS V5 input validation).
      3. Update Prisma: `await prisma.user.update({ where: { telegramId: BigInt(socket.data.telegramId) }, data: { tosAcceptedAt: new Date(), tosVersion: payload.version } });` — capture the returned user.
      4. Emit `socket.emit('tosAccepted', { tosAcceptedAt: updatedUser.tosAcceptedAt!.toISOString(), tosVersion: updatedUser.tosVersion! })`.
    - Add a corresponding repository helper if cleaner: `UserRepository.acceptTos(telegramId, version)` returning the updated row. Optional refactor.
  </action>
  <verify>
    <automated>npm run build && cd client && npm run build</automated>
  </verify>
  <done>Consent.tsx renders gate UI + emits acceptTos on Accept; ConsentBanner.tsx renders dismissible banner gated on tosAcceptedAt + localStorage; server acceptTos handler validates auth + version length + writes timestamps + emits ack; both client + server builds pass; MainMenu.tsx renders banner conditionally.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Wire AppView routing extensions + defense-in-depth consent guard + tosAccepted listener</name>
  <files>client/src/App.tsx</files>
  <action>
    Per RESEARCH §Q5 + Pitfall 4:

    1. **Extend AppView union**: add `| 'consent' | 'legal-tos' | 'legal-privacy' | 'legal-rg'` (Plan 04 already added 'deposit').

    2. **authSuccess listener** — change the post-auth view selection:
       ```typescript
       socket.on('authSuccess', (userData) => {
         setCurrentUser(userData);
         setView(userData.tosAcceptedAt ? 'menu' : 'consent');
         hapticFeedback?.notificationOccurred?.('success');
       });
       ```

    3. **tosAccepted listener** — register inside the same useEffect that wires socket events:
       ```typescript
       socket.on('tosAccepted', (payload) => {
         setCurrentUser(prev => prev ? { ...prev, tosAcceptedAt: payload.tosAcceptedAt } : prev);
         // if currently on 'consent' view, transition to menu
         setView(v => v === 'consent' ? 'menu' : v);
       });
       ```

    4. **Defense-in-depth render guard** — at the very top of the render function, AFTER currentUser is loaded but BEFORE any `view === '...'` branch:
       ```typescript
       if (
         currentUser &&
         !currentUser.tosAcceptedAt &&
         view !== 'consent' &&
         !view.startsWith('legal-')
       ) {
         return <Consent socket={socket} onAccept={() => setView('menu')} onViewLegal={(w) => setView(`legal-${w}` as AppView)} />;
       }
       ```
       This catches any code path that accidentally setView's away from consent (Pitfall 4). Single-source enforcement.

    5. **Add render branches** for the four new variants:
       ```typescript
       if (view === 'consent') return <Consent socket={socket} onAccept={() => setView('menu')} onViewLegal={(w) => setView(`legal-${w}` as AppView)} />;
       if (view === 'legal-tos') return <ToS onBack={() => setView(currentUser?.tosAcceptedAt ? 'menu' : 'consent')} />;
       if (view === 'legal-privacy') return <Privacy onBack={() => setView(currentUser?.tosAcceptedAt ? 'menu' : 'consent')} />;
       if (view === 'legal-rg') return <ResponsibleGaming onBack={() => setView(currentUser?.tosAcceptedAt ? 'menu' : 'consent')} />;
       ```

    6. **Wire MainMenu footer legal links + Profile legal links**: Plan 04 left these as placeholders — wire them to `onNavigate('legal-tos' | 'legal-privacy' | 'legal-rg')`. The single `onNavigate` prop already supports the new union variants since AppView is extended.

    7. **Cleanup**: Remove or no-op any earlier placeholder console.log handlers from Plan 04 footer.

    Per D-28: do NOT modify the server-side `joinTable` handler. Server-side ToS enforcement is Phase 5 (COMPLIANCE-04). Document this in the SUMMARY.
  </action>
  <verify>
    <automated>cd client && npm run build</automated>
  </verify>
  <done>AppView union extended; authSuccess routes to consent when tosAcceptedAt is null; tosAccepted listener updates currentUser + transitions; defense-in-depth guard renders Consent for any non-legal/non-consent view when tosAcceptedAt is null; legal page render branches added; MainMenu footer + Profile legal links wired; build passes.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → server `acceptTos` socket event | Untrusted payload crosses into DB write of compliance-relevant timestamp |
| client-side gate vs server-side gate | Phase 2 gate is intentionally client-side only (D-28); server-side enforcement deferred to Phase 5 COMPLIANCE-04 — accepted gap |
| localStorage | Per-device, can be cleared by user; banner re-shows on clear (acceptable per D-29) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-08-01 | Spoofing | acceptTos from un-authed socket | mitigate | Require `socket.data.telegramId` populated before any DB write — same pattern as updateProfile/updateAvatar. |
| T-02-08-02 | Tampering | acceptTos.version arbitrary string | mitigate | Server validates `typeof payload.version === 'string'` and `version.length` between 1 and 16 inclusive; reject otherwise. ASVS V5. |
| T-02-08-03 | Elevation of privilege | Direct socket emit bypassing the consent UI to mark user as accepted | accept | A user determined enough to forge `acceptTos` is consenting by definition; legal weight is preserved (the timestamp is recorded under their authenticated telegramId). Out of scope to prevent. |
| T-02-08-04 | Elevation of privilege | Bypassing the client-side gate to call joinTable without acceptance | accept | **Documented design gap (D-28).** Phase 5 COMPLIANCE-04 adds server-side joinTable enforcement. Client-side gate is best-effort UX, not security boundary. |
| T-02-08-05 | Tampering | localStorage banner-dismissed flag forgery | accept | Banner is non-blocking decoration; forgery only hides a reminder. No security impact. |
| T-02-08-06 | Information disclosure | Legal page user-rendered content | mitigate | All copy is hardcoded literals; no user-supplied content interpolated. React auto-escape protects any future dynamic interpolation. No dangerouslySetInnerHTML. |
</threat_model>

<verification>
- Three legal pages exist with required sections; RG page passes the D-30 content checklist.
- A new user (tosAcceptedAt == null in DB) lands on Consent page after auth, cannot reach 'menu' / 'tables' / 'game' / 'profile' / 'deposit' until Accept (defense-in-depth guard verified by attempting setView('menu') manually in dev tools).
- After Accept: server row shows `tosAcceptedAt = <recent>` and `tosVersion = '1.0'`; client transitions to menu; banner does NOT appear (currentUser.tosAcceptedAt is now set).
- An existing user with NULL tosAcceptedAt sees the banner on MainMenu; Dismiss persists in localStorage (banner gone next render); Accept goes through full flow + sets localStorage.
- Server rejects `acceptTos { version: '' }` and `acceptTos { version: 'x'.repeat(17) }`.
- Server rejects `acceptTos` from a socket without `socket.data.telegramId`.
- joinTable handler is UNCHANGED (D-28).
- Both builds pass.
</verification>

<success_criteria>
- COMPLIANCE-01: Three static pages reachable from Main Menu and Profile.
- COMPLIANCE-02: First-launch consent screen writes tosAcceptedAt + tosVersion before user can `joinTable` (client-side enforcement; server side is Phase 5).
- COMPLIANCE-03: Grandfather banner non-blocking, dismissible per session.
- COMPLIANCE-05: RG page content matches D-30 verbatim including no-lockout statement.
- D-26 / D-27 / D-28 / D-29 / D-30 honored.
</success_criteria>

<output>
After completion, create `.planning/phases/02-design-system-rollout-avatars/02-08-consent-and-legal/02-08-SUMMARY.md` documenting: final ToS/Privacy/RG copy line counts, acceptance of D-28 client-side-only gate trade-off, exact App.tsx render-guard placement, screenshot of consent flow if produced.
</output>
