/**
 * Shared metadata for the three legal pages (ToS, Privacy, Responsible Gaming)
 * and the consent gate that links to them.
 *
 * VERSION IS THE POINT OF THIS FILE. `Consent.tsx` sends it to the server, which
 * stores it in `User.tosVersion` alongside `tosAcceptedAt` — so the version here
 * is the record of *what* a given player actually agreed to. Bump it whenever the
 * substance of any of the three documents changes, and keep all four files on the
 * same constant so the stored version can never drift from the text on screen.
 *
 * 2.0 (2026-08) — real money. 1.0 described a play-money app with a daily bonus:
 * virtual chips, "no deposit, no withdrawal", no rake. None of that survived the
 * move to Crypto Pay deposits, rake, and payouts, so consent given to 1.0 does not
 * cover this product and the version had to move.
 *
 * 2.1 (2026-08-13) — gaps found by comparing 2.0 against a competitor's terms:
 * ToS §2 says plainly that we are not a currency service, ToS §9 states the right
 * to review play, ToS §15 adds governing law and disputes (2.0 had neither), and
 * the flat "we do not ask for identity documents" in Privacy §2 gained a narrow
 * fraud exception — mirrored in ToS §7.
 *
 * ⚠️ Bumping this constant does NOT force anyone to accept again: both consent
 * gates (client App.tsx, server middleware/joinGate.ts) test `tosAcceptedAt` for
 * null and ignore the stored version. 2.1 ships before the mainnet launch into an
 * empty production database, so nobody there accepted 2.0 — but ToS §14 promises
 * re-acceptance on material change, and that promise needs version gating before
 * the next bump lands on live accounts.
 */

export const LEGAL_VERSION = '2.1';

/** Rendered under each document title next to the version. */
export const LEGAL_UPDATED = 'August 2026';
