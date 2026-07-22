/**
 * crypto-payments-rake phase 4 — chip ↔ USDT peg (plan §A).
 *
 * CONSTANT FOR THE LIFE OF THE GAME: 1 chip = 0.01 USDT (a chip is a cent).
 * The whole engine stays integer; money never touches a float on the way in or
 * out. USDT has 6 decimals on TON, but the peg only exposes 2 (cents) — sub-cent
 * dust is always floored away so we never credit chips we didn't receive.
 */

/** 1 chip = 0.01 USDT. Cents and chips are the same integer unit. */
export const CHIPS_PER_USDT = 100;

/** Raw USDT (6 decimals) per chip: 0.01 * 10^6. Used only when talking raw jettons. */
export const USDT_RAW_PER_CHIP = 10_000;

/** Minimum deposit: $5 = 500 chips (plan §A). */
export const MIN_DEPOSIT_CHIPS = 500;

/** Minimum withdrawal: $10 = 1000 chips (plan §A; enforced in phase 5). */
export const MIN_WITHDRAWAL_CHIPS = 1000;

/**
 * Parse a decimal USDT amount string (e.g. "5", "5.5", "5.129") to integer cents,
 * flooring anything beyond 2 decimals. Cents == chips under the peg.
 *
 * Deliberately string-based (no `parseFloat` on the money path): we split on the
 * decimal point and take exactly the first two fractional digits, so "5.129"
 * yields 512 cents, never 512.9999… from binary float error.
 *
 * Accepts number too (Crypto Pay sometimes returns amounts as numbers) — it is
 * stringified first, which is lossless for the 2-decimal values we deal with.
 */
export function usdtToCents(amount: string | number): number {
  const s = String(amount).trim();
  if (s === '' || s === '-') return 0;
  const negative = s.startsWith('-');
  const [intPartRaw, fracPartRaw = ''] = s.replace('-', '').split('.');
  const intPart = intPartRaw === '' ? 0 : parseInt(intPartRaw, 10);
  // Pad/truncate the fractional part to exactly 2 digits (floor beyond cents).
  const frac2 = (fracPartRaw + '00').slice(0, 2);
  if (Number.isNaN(intPart)) return 0;
  const cents = intPart * 100 + parseInt(frac2, 10);
  return negative ? -cents : cents;
}

/** Alias: under the peg, cents and chips are identical. */
export const usdtToChips = usdtToCents;

/**
 * Format an integer chip amount as a decimal USDT string with 2 decimals
 * (e.g. 500 → "5.00", 1250 → "12.50"), suitable for the Crypto Pay `amount`
 * param. Integer arithmetic only — no float division of money.
 */
export function chipsToUsdt(chips: number): string {
  const sign = chips < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(chips));
  const dollars = Math.trunc(abs / 100);
  const cents = abs % 100;
  return `${sign}${dollars}.${String(cents).padStart(2, '0')}`;
}
