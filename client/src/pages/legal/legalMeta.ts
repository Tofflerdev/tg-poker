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
 */

export const LEGAL_VERSION = '2.0';

/** Rendered under each document title next to the version. */
export const LEGAL_UPDATED = 'August 2026';
