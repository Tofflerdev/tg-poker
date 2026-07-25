import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * crypto-payments-rake phase 5 — the payout path, especially its failure modes.
 *
 * The money-critical rule: a transfer error does NOT mean the coins stayed put.
 * Refunding a payout that actually went out pays the player twice, so the code
 * must ask Crypto Pay (getTransfers by spend_id) before it refunds anything.
 */
const repo = vi.hoisted(() => ({
  findByTelegramId: vi.fn(),
  lastDepositAt: vi.fn(),
  countHandsSince: vi.fn(),
  withdrawnChipsSince: vi.fn(),
  debitForWithdrawal: vi.fn(),
  completeWithdrawal: vi.fn(),
  refundWithdrawal: vi.fn(),
  listPendingWithdrawals: vi.fn(),
  totalDepositedChips: vi.fn(),
}));
const pay = vi.hoisted(() => ({
  transfer: vi.fn(),
  getTransfersBySpendId: vi.fn(),
}));

vi.mock('../db/UserRepository.js', () => ({ UserRepository: repo }));
vi.mock('../payments/cryptoPay.js', () => ({ getCryptoPay: () => pay }));

import {
  approveWithdrawal,
  rejectWithdrawal,
  requestWithdrawal,
  getWithdrawalEligibility,
} from '../payments/withdrawals.js';

const PLAYER = 158394554;
const SPEND_ID = 'wd-158394554-abc';

const pendingRow = {
  spendId: SPEND_ID,
  telegramId: PLAYER,
  displayName: 'Fair Hawk 49',
  amountChips: 5000,
  createdAt: new Date(),
  balanceAfter: 4500,
};

describe('withdrawal request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WITHDRAWAL_MIN_HANDS = '';
    repo.findByTelegramId.mockResolvedValue({ balance: 9500 });
    repo.lastDepositAt.mockResolvedValue(new Date('2026-07-23T09:46:00Z'));
    repo.countHandsSince.mockResolvedValue(120);
    repo.withdrawnChipsSince.mockResolvedValue(0);
    repo.debitForWithdrawal.mockResolvedValue({ ok: true, newBalance: 4500 });
  });

  it('holds the chips immediately so they cannot also be played', async () => {
    const res = await requestWithdrawal(PLAYER, 5000);
    expect(repo.debitForWithdrawal).toHaveBeenCalledWith(
      PLAYER,
      5000,
      expect.stringContaining(`wd-${PLAYER}-`),
      expect.objectContaining({ requestedChips: 5000, targetUserId: PLAYER }),
    );
    expect(res).toMatchObject({ amountChips: 5000, balance: 4500 });
  });

  it('refuses more than the balance without touching the ledger', async () => {
    await expect(requestWithdrawal(PLAYER, 99_999)).rejects.toThrow(/Not enough chips/i);
    expect(repo.debitForWithdrawal).not.toHaveBeenCalled();
  });

  it('refuses below the minimum', async () => {
    await expect(requestWithdrawal(PLAYER, 500)).rejects.toThrow(/Minimum withdrawal/i);
    expect(repo.debitForWithdrawal).not.toHaveBeenCalled();
  });

  it('counts pending requests against the daily cap', async () => {
    repo.withdrawnChipsSince.mockResolvedValue(48_000); // 2000 left of 50000
    await expect(requestWithdrawal(PLAYER, 5000)).rejects.toThrow(/Daily limit/i);
    expect(repo.debitForWithdrawal).not.toHaveBeenCalled();
  });

  it('blocks on the activity threshold when it is configured', async () => {
    process.env.WITHDRAWAL_MIN_HANDS = '50';
    repo.countHandsSince.mockResolvedValue(10);
    await expect(requestWithdrawal(PLAYER, 5000)).rejects.toThrow(/40 more hands/i);
    process.env.WITHDRAWAL_MIN_HANDS = '';
  });

  it('does not apply the activity threshold to someone who never deposited', async () => {
    process.env.WITHDRAWAL_MIN_HANDS = '50';
    repo.lastDepositAt.mockResolvedValue(null);
    repo.countHandsSince.mockResolvedValue(0);
    const e = await getWithdrawalEligibility(PLAYER);
    expect(e.blockedBy).toBeNull();
    process.env.WITHDRAWAL_MIN_HANDS = '';
  });

  it('surfaces a lost race against the guarded debit', async () => {
    repo.debitForWithdrawal.mockResolvedValue({ ok: false, reason: 'insufficient' });
    await expect(requestWithdrawal(PLAYER, 5000)).rejects.toThrow(/Not enough chips/i);
  });
});

describe('withdrawal approval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.listPendingWithdrawals.mockResolvedValue([pendingRow]);
    repo.completeWithdrawal.mockResolvedValue(true);
    repo.refundWithdrawal.mockResolvedValue(true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('sends the coins and closes the row', async () => {
    pay.transfer.mockResolvedValue({ transfer_id: 777, status: 'completed' });
    const res = await approveWithdrawal(SPEND_ID);
    expect(pay.transfer).toHaveBeenCalledWith(
      expect.objectContaining({ userId: PLAYER, amountUsdt: '50.00', spendId: SPEND_ID }),
    );
    expect(repo.completeWithdrawal).toHaveBeenCalledWith(SPEND_ID, expect.objectContaining({ transferId: 777 }));
    expect(repo.refundWithdrawal).not.toHaveBeenCalled();
    expect(res.transferId).toBe(777);
  });

  it('refunds only when the provider confirms nothing was sent', async () => {
    pay.transfer.mockRejectedValue(new Error('USER_NOT_FOUND'));
    pay.getTransfersBySpendId.mockResolvedValue([]);
    await expect(approveWithdrawal(SPEND_ID)).rejects.toThrow(/chips were returned/i);
    expect(repo.refundWithdrawal).toHaveBeenCalledWith(SPEND_ID, expect.stringContaining('USER_NOT_FOUND'));
  });

  it('NEVER refunds when the transfer actually went out despite the error', async () => {
    // The dangerous case: the HTTP call blew up after the provider processed it.
    pay.transfer.mockRejectedValue(new Error('socket hang up'));
    pay.getTransfersBySpendId.mockResolvedValue([{ transfer_id: 999, status: 'completed' }]);

    const res = await approveWithdrawal(SPEND_ID);

    expect(repo.refundWithdrawal).not.toHaveBeenCalled(); // would have paid twice
    expect(repo.completeWithdrawal).toHaveBeenCalledWith(SPEND_ID, expect.objectContaining({ transferId: 999 }));
    expect(res.alreadySent).toBe(true);
  });

  it('leaves the money held when the outcome cannot be verified at all', async () => {
    pay.transfer.mockRejectedValue(new Error('ETIMEDOUT'));
    pay.getTransfersBySpendId.mockRejectedValue(new Error('503'));

    await expect(approveWithdrawal(SPEND_ID)).rejects.toThrow(/could not be verified/i);

    // Neither completed nor refunded — a human resolves it from the spend_id.
    expect(repo.completeWithdrawal).not.toHaveBeenCalled();
    expect(repo.refundWithdrawal).not.toHaveBeenCalled();
  });

  it('refuses to settle an id that is not pending', async () => {
    repo.listPendingWithdrawals.mockResolvedValue([]);
    await expect(approveWithdrawal(SPEND_ID)).rejects.toThrow(/No pending withdrawal/i);
    expect(pay.transfer).not.toHaveBeenCalled();
  });
});

describe('withdrawal rejection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.listPendingWithdrawals.mockResolvedValue([pendingRow]);
    repo.refundWithdrawal.mockResolvedValue(true);
  });

  it('returns the held chips and records why', async () => {
    const res = await rejectWithdrawal(SPEND_ID, 'suspected transit');
    expect(repo.refundWithdrawal).toHaveBeenCalledWith(SPEND_ID, expect.stringContaining('suspected transit'));
    expect(res).toMatchObject({ telegramId: PLAYER, amountChips: 5000 });
    expect(pay.transfer).not.toHaveBeenCalled();
  });

  it('fails loudly if the row stopped being pending underneath us', async () => {
    repo.refundWithdrawal.mockResolvedValue(false);
    await expect(rejectWithdrawal(SPEND_ID, 'x')).rejects.toThrow(/no longer pending/i);
  });
});
