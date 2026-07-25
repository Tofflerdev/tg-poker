/**
 * crypto-payments-rake phase 4 — the Crypto Pay commission, observed live.
 *
 * WHY THIS EXISTS: Crypto Pay charges the app a commission on every paid invoice
 * (3% at the time of writing), so a $50 invoice credits 4850 chips, not 5000.
 * The deposit UI used to promise the gross amount — this module supplies the real
 * number so the player is quoted what will actually land on their balance.
 *
 * THE RATE IS NOT EXPOSED BY THE API. Probed 2026-07-25 against the live app:
 * `getStats` and `getCurrencies` carry no commission field, and an unpaid invoice
 * has no `fee_*` fields at all — they only appear once it is paid. So the only
 * honest source is observation: every paid invoice reports `paid_amount` and
 * `fee_amount`, whose ratio IS the rate. We therefore:
 *   - refresh from the most recent paid invoice at boot (`refreshFeeFromHistory`);
 *   - re-observe on every incoming paid-invoice webhook (`observeDepositFee`);
 *   - fall back to DEFAULT_DEPOSIT_FEE_BPS until something is observed.
 * If Crypto Pay ever changes the rate, the first payment at the new rate teaches
 * it to us and the quote follows automatically.
 *
 * Quotes are advisory. The ledger always credits what actually arrived (see the
 * webhook in index.ts) — this module never touches money.
 */
import type { CryptoPayClient } from './cryptoPay.js';

/** Observed rate on testnet + mainnet as of 2026-07-25: 3%. */
export const DEFAULT_DEPOSIT_FEE_BPS = 300;

/**
 * Sanity ceiling for an observed rate (20%). A ratio above this means we
 * misread the payload (wrong field, different asset, dust invoice) — keep the
 * previous value rather than quote something absurd.
 */
const MAX_PLAUSIBLE_FEE_BPS = 2000;

export interface DepositFeeInfo {
  /** Commission in basis points (300 = 3%). */
  bps: number;
  /** Whether `bps` came from a real payment or is still the built-in default. */
  source: 'observed' | 'default';
  /** ISO timestamp of the observation, null while on the default. */
  observedAt: string | null;
}

let observed: { bps: number; observedAt: Date } | null = null;

/** Current commission in basis points — observed if we have seen a payment. */
export function getDepositFeeBps(): number {
  return observed?.bps ?? DEFAULT_DEPOSIT_FEE_BPS;
}

export function getDepositFeeInfo(): DepositFeeInfo {
  return observed
    ? { bps: observed.bps, source: 'observed', observedAt: observed.observedAt.toISOString() }
    : { bps: DEFAULT_DEPOSIT_FEE_BPS, source: 'default', observedAt: null };
}

/**
 * Learn the rate from a paid invoice. Both arguments are integer cents (chips).
 * Returns true when the observation was accepted.
 */
export function observeDepositFee(paidCents: number, feeCents: number): boolean {
  if (!Number.isFinite(paidCents) || !Number.isFinite(feeCents)) return false;
  if (paidCents <= 0 || feeCents < 0 || feeCents > paidCents) return false;
  const bps = Math.round((feeCents / paidCents) * 10_000);
  if (bps > MAX_PLAUSIBLE_FEE_BPS) return false;
  observed = { bps, observedAt: new Date() };
  return true;
}

/**
 * Commission a gross invoice of `grossChips` will cost, in chips.
 *
 * Floored, matching the peg's floor-everything rule (peg.ts) and therefore the
 * arithmetic the webhook itself performs (`usdtToCents(fee)` truncates to cents).
 */
export function depositFeeChips(grossChips: number, bps: number = getDepositFeeBps()): number {
  if (!Number.isFinite(grossChips) || grossChips <= 0) return 0;
  return Math.floor((grossChips * bps) / 10_000);
}

/** Chips that will actually reach the balance for a `grossChips` invoice. */
export function netDepositChips(grossChips: number, bps: number = getDepositFeeBps()): number {
  return Math.max(0, Math.trunc(grossChips) - depositFeeChips(grossChips, bps));
}

/**
 * Best-effort boot refresh: read the most recent paid invoices and take the rate
 * from the newest one that carries usable numbers. Never throws — deposits work
 * fine on the default rate, only the quote would be stale.
 */
export async function refreshFeeFromHistory(client: CryptoPayClient): Promise<DepositFeeInfo> {
  try {
    const items = await client.getPaidInvoices(10);
    // getInvoices returns oldest-first in practice; scan from the newest end.
    for (let i = items.length - 1; i >= 0; i--) {
      const inv = items[i];
      const paid = Number(inv.paid_amount ?? inv.amount ?? 0);
      const fee = Number(inv.fee_amount ?? inv.fee ?? 0);
      if (!Number.isFinite(paid) || paid <= 0) continue;
      // Compare in the invoice's own units — the ratio is unit-free.
      if (observeDepositFee(Math.round(paid * 100), Math.round(fee * 100))) break;
    }
  } catch (err) {
    console.error('[Boot] Crypto Pay fee refresh failed — quoting the default rate:', err);
  }
  return getDepositFeeInfo();
}

/** Test seam: drop the observed rate so each test starts from the default. */
export function __resetDepositFeeForTests(): void {
  observed = null;
}
