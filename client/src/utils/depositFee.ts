/**
 * Crypto Pay commission maths — client mirror of server/payments/depositFee.ts.
 *
 * The provider takes a cut of every paid invoice (3% as of 2026-07-25), so a $50
 * deposit credits 4850 chips. The rate is not published by the API; the server
 * observes it from paid invoices and ships it down as `depositInfo.feeBps`. Keep
 * the rounding here identical to the server's (floor, like the whole peg).
 */

/** Fallback until the server's `depositInfo` arrives (300 = 3%). */
export const DEFAULT_DEPOSIT_FEE_BPS = 300;

/** Commission on a gross invoice, in chips. */
export function depositFeeChips(grossChips: number, bps: number): number {
  if (!Number.isFinite(grossChips) || grossChips <= 0) return 0;
  return Math.floor((grossChips * bps) / 10_000);
}

/** Chips that actually land on the balance after the commission. */
export function netDepositChips(grossChips: number, bps: number): number {
  return Math.max(0, Math.trunc(grossChips) - depositFeeChips(grossChips, bps));
}

/** "3%" / "2.75%" — trims the pointless decimals on whole percentages. */
export function formatFeePercent(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`;
}
