/**
 * crypto-payments-rake phase 4 — deposit reconciliation (the webhook safety net).
 *
 * WHY: an `invoice_paid` webhook is the ONLY thing that credits a deposit. If it
 * never reaches us — the container was down for a deploy, the network dropped it,
 * the provider gave up retrying — the ledger row stays `pending` forever: the
 * player's money is gone and their chips never arrive, and nothing in the system
 * ever fixes it. Every payment provider needs a pull path to complement the push.
 *
 * WHAT: periodically take our own pending deposits and ask Crypto Pay what became
 * of them (`getInvoices` filtered by `invoice_ids` — the documented lookup), then
 *   - `paid`    → credit exactly once, through the same idempotent guarded update
 *                 the webhook uses, so a late webhook and a reconciliation pass can
 *                 never both credit;
 *   - `expired` → close the row as failed (it can never be paid now);
 *   - `active`  → leave it alone, the player may still pay.
 *
 * Crediting is deliberately shared with the webhook (`creditPaidInvoice`) so the
 * two paths cannot drift in how they compute the net amount or what they record.
 */
import { UserRepository } from '../db/UserRepository.js';
import { usdtToCents } from './peg.js';
import { observeDepositFee } from './depositFee.js';
import type { CryptoPayClient, PaidInvoicePayload } from './cryptoPay.js';

/** How often the sweep runs. Deposits are rare; a lost one should not sit long. */
export const RECONCILE_INTERVAL_MS = 10 * 60 * 1000;

/** Cap per pass — keeps one query and one API call bounded. */
const BATCH_SIZE = 100;

export interface CreditOutcome {
  credited: boolean;
  reason?: string;
  telegramId?: number;
  balance?: number;
  creditedChips?: number;
}

/** Called after a deposit is actually credited, so the UI can be pushed. */
export type CreditedNotifier = (outcome: {
  invoiceId: string;
  telegramId: number;
  creditedChips: number;
  balance: number;
}) => void | Promise<void>;

/**
 * Credit a paid invoice exactly once. Shared by the webhook and the reconciler.
 *
 * The player pays the provider fee (plan §D, decided 2026-07-21), so the credit
 * is net = paid − fee. Idempotency lives in `creditDepositIfPending`'s guarded
 * pending → completed transition, so calling this twice is safe by construction.
 */
export async function creditPaidInvoice(
  inv: PaidInvoicePayload,
  source: 'webhook' | 'reconcile',
  onCredited?: CreditedNotifier,
): Promise<CreditOutcome> {
  const invoiceId = String(inv.invoice_id);
  const paidCents = usdtToCents(inv.paid_amount ?? inv.amount ?? '0');
  const feeCents = usdtToCents(inv.fee_amount ?? inv.fee ?? '0');
  // Keep the quoted commission in step with reality: this payment IS the rate.
  observeDepositFee(paidCents, feeCents);

  const result = await UserRepository.creditDepositIfPending(invoiceId, paidCents - feeCents, {
    paidAmount: inv.paid_amount ?? inv.amount,
    fee: inv.fee_amount ?? inv.fee,
    asset: inv.paid_asset ?? inv.asset,
    usdRate: inv.paid_usd_rate,
    ...(source === 'reconcile' ? { creditedBy: 'reconciliation' } : {}),
  });

  if (result.credited && result.telegramId !== undefined) {
    console.log(
      '[Deposit] credited invoice %s: +%d chips to %d (%s)',
      invoiceId,
      result.creditedChips,
      result.telegramId,
      source,
    );
    await onCredited?.({
      invoiceId,
      telegramId: result.telegramId,
      creditedChips: result.creditedChips ?? 0,
      balance: result.balance ?? 0,
    });
  }
  return result;
}

export interface ReconcileResult {
  /** Pending rows examined this pass. */
  checked: number;
  /** Rows the provider confirmed paid and we credited now (the rescued ones). */
  credited: number;
  /** Rows closed because the invoice expired unpaid. */
  expired: number;
  /** Rows still legitimately awaiting payment. */
  stillPending: number;
  /** Rows Crypto Pay knows nothing about (left untouched for a human to look at). */
  unknown: number;
}

/**
 * One reconciliation pass. Never throws — a provider outage must not take the
 * server down or abort boot; the next pass tries again.
 */
export async function reconcilePendingDeposits(
  client: CryptoPayClient,
  onCredited?: CreditedNotifier,
): Promise<ReconcileResult> {
  const result: ReconcileResult = { checked: 0, credited: 0, expired: 0, stillPending: 0, unknown: 0 };
  try {
    const pending = await UserRepository.listPendingDeposits(BATCH_SIZE);
    if (pending.length === 0) return result;
    result.checked = pending.length;

    const invoices = await client.getInvoicesByIds(pending.map((p) => p.invoiceId));
    const byId = new Map(invoices.map((i) => [String(i.invoice_id), i]));

    for (const row of pending) {
      const inv = byId.get(row.invoiceId);
      if (!inv) {
        // Not our app's invoice, or purged provider-side. Never guess about money.
        result.unknown++;
        continue;
      }
      if (inv.status === 'paid') {
        const outcome = await creditPaidInvoice(inv, 'reconcile', onCredited);
        if (outcome.credited) result.credited++;
        else result.stillPending++; // e.g. a webhook won the race a moment ago
      } else if (inv.status === 'expired') {
        if (await UserRepository.failPendingDeposit(row.invoiceId, 'invoice_expired')) {
          result.expired++;
        }
      } else {
        result.stillPending++;
      }
    }

    if (result.credited > 0 || result.expired > 0) {
      console.log(
        '[Deposit] reconciliation: %d checked, %d credited (missed webhooks), %d expired, %d still pending',
        result.checked,
        result.credited,
        result.expired,
        result.stillPending,
      );
    }
  } catch (err) {
    console.error('[Deposit] reconciliation pass failed:', err);
  }
  return result;
}

/**
 * Run a pass now (catching up on anything missed while we were down) and then on
 * an interval. Returns a stop function for tests/shutdown; the timer is unref'd
 * so it never keeps the process alive.
 */
export function startDepositReconciliation(
  client: CryptoPayClient,
  onCredited?: CreditedNotifier,
  intervalMs: number = RECONCILE_INTERVAL_MS,
): () => void {
  void reconcilePendingDeposits(client, onCredited);
  const timer = setInterval(() => {
    void reconcilePendingDeposits(client, onCredited);
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return () => clearInterval(timer);
}
