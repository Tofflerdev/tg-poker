/**
 * crypto-payments-rake phase 5 — player withdrawals.
 *
 * Shape (plan §D/§I): the player requests a payout → the chips are HELD
 * immediately (guarded debit + `pending` ledger row, so they cannot also be
 * played at a table) → the request waits in the admin queue → an admin approves,
 * which fires the Crypto Pay `transfer`, or rejects, which refunds the hold.
 *
 * Payouts go to the player's own Telegram account (Crypto Pay `transfer` takes a
 * user_id) — there is no address to mistype, and it keeps the payout bound to
 * the identity that deposited.
 *
 * THE DANGEROUS PART is the transfer call. A failure that is merely ambiguous
 * (socket hung up, timeout) does NOT mean the money stayed put, and refunding a
 * payout that actually went out pays the player twice. So on any error we ask
 * the provider what happened (`getTransfers` filtered by our spend_id) and only
 * refund when it confirms nothing was sent. `spend_id` also makes the provider
 * itself idempotent, so a retry can never double-send.
 */
import { randomUUID } from 'crypto';
import { UserRepository } from '../db/UserRepository.js';
import { getCryptoPay } from './cryptoPay.js';
import { chipsToUsdt } from './peg.js';
import {
  DAY_MS,
  checkWithdrawalAmount,
  computeWithdrawalFlags,
  getWithdrawalPolicy,
  type WithdrawalEligibility,
} from './withdrawalPolicy.js';

export interface WithdrawalRequestResult {
  spendId: string;
  amountChips: number;
  balance: number;
}

/**
 * Everything the withdrawal screen needs to render limits and gate the button.
 * Reads are independent, so they run in parallel.
 */
export async function getWithdrawalEligibility(telegramId: number): Promise<WithdrawalEligibility> {
  const policy = getWithdrawalPolicy();
  const user = await UserRepository.findByTelegramId(telegramId);
  const balanceChips = user?.balance ?? 0;

  const lastDeposit = await UserRepository.lastDepositAt(telegramId);
  const [handsSinceDeposit, withdrawnToday] = await Promise.all([
    UserRepository.countHandsSince(telegramId, lastDeposit),
    UserRepository.withdrawnChipsSince(telegramId, new Date(Date.now() - DAY_MS)),
  ]);

  const remainingDailyChips = Math.max(0, policy.dailyLimitChips - withdrawnToday);
  // A player who never deposited cannot be laundering a deposit — the activity
  // threshold only makes sense relative to money that came in.
  const handsSatisfied = lastDeposit === null || handsSinceDeposit >= policy.minHandsSinceDeposit;

  const maxAvailableChips = handsSatisfied
    ? Math.min(balanceChips, remainingDailyChips, policy.maxPerRequestChips)
    : 0;

  return {
    maxAvailableChips,
    balanceChips,
    minChips: policy.minChips,
    remainingDailyChips,
    handsSinceDeposit,
    requiredHands: lastDeposit === null ? 0 : policy.minHandsSinceDeposit,
    blockedBy: handsSatisfied ? null : 'NOT_ENOUGH_HANDS',
  };
}

/**
 * Create a withdrawal request and hold the chips. Throws with a player-readable
 * message when policy rejects it; the money is only debited once every check has
 * passed, and the debit itself is guarded so a race cannot overdraw.
 */
export async function requestWithdrawal(
  telegramId: number,
  amountChips: number,
): Promise<WithdrawalRequestResult> {
  const policy = getWithdrawalPolicy();
  if (!getCryptoPay()) throw new Error('Withdrawals are not available right now');

  const eligibility = await getWithdrawalEligibility(telegramId);
  const verdict = checkWithdrawalAmount(amountChips, eligibility, policy);
  if (!verdict.ok) throw new Error(verdict.message);

  const spendId = `wd-${telegramId}-${randomUUID()}`;
  const debit = await UserRepository.debitForWithdrawal(telegramId, amountChips, spendId, {
    requestedChips: amountChips,
    requestedAt: new Date().toISOString(),
    targetUserId: telegramId,
  });
  if (!debit.ok) {
    // Lost a race against a buy-in or another request — the guard did its job.
    throw new Error(
      debit.reason === 'insufficient' ? 'Not enough chips on your balance.' : 'Could not reserve the withdrawal.',
    );
  }
  return { spendId, amountChips, balance: debit.newBalance ?? 0 };
}

export interface QueuedWithdrawal {
  spendId: string;
  telegramId: number;
  displayName: string;
  amountChips: number;
  createdAt: string;
  /** §I advisory flags — colour for the human, never an automatic block. */
  flags: string[];
  handsSinceDeposit: number;
  totalDepositedChips: number;
}

/** The admin approval queue, enriched with the §I flags. */
export async function listWithdrawalQueue(): Promise<QueuedWithdrawal[]> {
  const policy = getWithdrawalPolicy();
  const rows = await UserRepository.listPendingWithdrawals();
  return Promise.all(
    rows.map(async (row) => {
      const lastDeposit = await UserRepository.lastDepositAt(row.telegramId);
      const [handsSinceDeposit, totalDepositedChips] = await Promise.all([
        UserRepository.countHandsSince(row.telegramId, lastDeposit),
        UserRepository.totalDepositedChips(row.telegramId),
      ]);
      return {
        spendId: row.spendId,
        telegramId: row.telegramId,
        displayName: row.displayName,
        amountChips: row.amountChips,
        createdAt: row.createdAt.toISOString(),
        handsSinceDeposit,
        totalDepositedChips,
        flags: computeWithdrawalFlags(
          { amountChips: row.amountChips, totalDepositedChips, handsSinceDeposit },
          policy,
        ),
      };
    }),
  );
}

export interface ApprovalOutcome {
  spendId: string;
  telegramId: number;
  amountChips: number;
  transferId?: number;
  /** True when the provider had already processed this spend_id (idempotency). */
  alreadySent?: boolean;
}

/**
 * Approve a queued withdrawal: send the coins, then close the ledger row.
 *
 * On a transfer error we never guess. `getTransfers(spend_id)` is the provider's
 * own record of whether the payout happened:
 *   - it exists  → the money left; complete the row (do NOT refund).
 *   - it doesn't → nothing was sent; refund the hold and fail the row.
 *   - the lookup itself fails → leave the row PENDING and surface the error, so
 *     a human resolves it. Leaving money held is recoverable; refunding a payout
 *     that already went out is not.
 */
export async function approveWithdrawal(spendId: string): Promise<ApprovalOutcome> {
  const cryptoPay = getCryptoPay();
  if (!cryptoPay) throw new Error('Crypto Pay is not configured');

  const pending = (await UserRepository.listPendingWithdrawals()).find((r) => r.spendId === spendId);
  if (!pending) throw new Error('No pending withdrawal with that id');

  try {
    const res = await cryptoPay.transfer({
      userId: pending.telegramId,
      amountUsdt: chipsToUsdt(pending.amountChips),
      spendId,
      comment: 'Withdrawal from NightRiver Poker',
    });
    await UserRepository.completeWithdrawal(spendId, {
      transferId: res.transfer_id,
      transferStatus: res.status,
      approvedAt: new Date().toISOString(),
    });
    return { spendId, telegramId: pending.telegramId, amountChips: pending.amountChips, transferId: res.transfer_id };
  } catch (err) {
    const message = (err as Error).message;
    let sent: Array<{ transfer_id: number; status: string }>;
    try {
      sent = await cryptoPay.getTransfersBySpendId(spendId);
    } catch (lookupErr) {
      // Unknown state. Hold the money and hand it to a human — never refund blind.
      console.error('[Withdraw] transfer failed AND lookup failed for %s:', spendId, lookupErr);
      throw new Error(
        `Transfer failed and its status could not be verified (${message}). ` +
          `The request is still pending — check spend_id ${spendId} in CryptoBot before retrying.`,
      );
    }

    if (sent.length > 0) {
      // It did go out despite the error — record it rather than paying twice.
      await UserRepository.completeWithdrawal(spendId, {
        transferId: sent[0].transfer_id,
        transferStatus: sent[0].status,
        note: 'confirmed via getTransfers after an ambiguous failure',
        approvedAt: new Date().toISOString(),
      });
      console.warn('[Withdraw] %s errored but the transfer exists — completed, not refunded', spendId);
      return {
        spendId,
        telegramId: pending.telegramId,
        amountChips: pending.amountChips,
        transferId: sent[0].transfer_id,
        alreadySent: true,
      };
    }

    await UserRepository.refundWithdrawal(spendId, `transfer_failed: ${message}`);
    console.error('[Withdraw] transfer for %s failed, refunded:', spendId, err);
    throw new Error(`Transfer failed, the chips were returned: ${message}`);
  }
}

/** Reject a queued withdrawal and return the held chips to the player. */
export async function rejectWithdrawal(
  spendId: string,
  reason: string,
): Promise<{ spendId: string; telegramId: number; amountChips: number }> {
  const pending = (await UserRepository.listPendingWithdrawals()).find((r) => r.spendId === spendId);
  if (!pending) throw new Error('No pending withdrawal with that id');
  const refunded = await UserRepository.refundWithdrawal(spendId, `rejected: ${reason || 'no reason given'}`);
  if (!refunded) throw new Error('Withdrawal is no longer pending');
  return { spendId, telegramId: pending.telegramId, amountChips: pending.amountChips };
}
