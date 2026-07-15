import { describe, it, expect, vi, beforeEach } from 'vitest';

// Interactive-transaction mock: $transaction(fn) invokes `fn` with a tx client
// that exposes the same user methods plus transaction.create. The real code
// (crypto-payments-rake phase 1) does the balance UPDATE and the ledger insert
// inside one $transaction, so tests assert on both.
const txClient = {
  user: {
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  transaction: {
    create: vi.fn(),
  },
};

vi.mock('../db/prisma.js', () => ({
  default: {
    user: {
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    transaction: {
      create: vi.fn(),
    },
    $transaction: vi.fn((fn: any) => fn(txClient)),
  },
}));

import { UserRepository } from '../db/UserRepository.js';
import prisma from '../db/prisma.js';

describe('UserRepository atomic helpers', () => {
  beforeEach(() => {
    vi.mocked(prisma.user.updateMany).mockReset();
    vi.mocked(prisma.user.findUnique).mockReset();
    txClient.user.updateMany.mockReset();
    txClient.user.findUnique.mockReset();
    txClient.user.update.mockReset();
    txClient.transaction.create.mockReset();
  });

  describe('tryDecrementBalance (D-D1)', () => {
    it('returns true and writes a buyin ledger row when balance >= amount', async () => {
      txClient.user.updateMany.mockResolvedValue({ count: 1 });
      txClient.user.findUnique.mockResolvedValue({ id: 7, balance: 500 });
      const ok = await UserRepository.tryDecrementBalance(1001, 500, { tableId: 't1' });
      expect(ok).toBe(true);
      expect(txClient.user.updateMany).toHaveBeenCalledWith({
        where: { telegramId: BigInt(1001), balance: { gte: 500 } },
        data: { balance: { decrement: 500 } },
      });
      expect(txClient.transaction.create).toHaveBeenCalledWith({
        data: {
          userId: 7,
          type: 'buyin',
          amount: -500,
          balanceAfter: 500,
          meta: { tableId: 't1' },
        },
      });
    });

    it('returns false and writes NO ledger row when insufficient funds', async () => {
      txClient.user.updateMany.mockResolvedValue({ count: 0 });
      const ok = await UserRepository.tryDecrementBalance(1001, 500);
      expect(ok).toBe(false);
      expect(txClient.transaction.create).not.toHaveBeenCalled();
    });

    // exit-reconnect B3: currentChips is the sole refund source of truth but used to be
    // written only at hand boundaries, so a leave before the first hand ended refunded
    // NULL (first sit-down) or 0 (re-buy after busting) and destroyed the buy-in.
    it('seats the session trio in the SAME update as the debit when session is given', async () => {
      txClient.user.updateMany.mockResolvedValue({ count: 1 });
      txClient.user.findUnique.mockResolvedValue({ id: 7, balance: 920 });
      const ok = await UserRepository.tryDecrementBalance(1001, 80, { tableId: 'table-funnel-1' }, {
        tableId: 'table-funnel-1',
        seat: 3,
      });
      expect(ok).toBe(true);
      expect(txClient.user.updateMany).toHaveBeenCalledWith({
        where: { telegramId: BigInt(1001), balance: { gte: 80 } },
        data: {
          balance: { decrement: 80 },
          currentChips: 80,
          currentTableId: 'table-funnel-1',
          currentSeat: 3,
        },
      });
    });

    it('leaves the session columns untouched when no session is given', async () => {
      txClient.user.updateMany.mockResolvedValue({ count: 1 });
      txClient.user.findUnique.mockResolvedValue({ id: 7, balance: 500 });
      await UserRepository.tryDecrementBalance(1001, 500, { tableId: 't1' });
      expect(txClient.user.updateMany).toHaveBeenCalledWith({
        where: { telegramId: BigInt(1001), balance: { gte: 500 } },
        data: { balance: { decrement: 500 } },
      });
    });
  });

  describe('refundCurrentChips (D-D2)', () => {
    it('returns { refunded } , clears session columns, and writes a cashout ledger row', async () => {
      txClient.user.findUnique
        .mockResolvedValueOnce({ id: 7, currentChips: 500, currentTableId: 't1' })
        .mockResolvedValueOnce({ balance: 1500 });
      txClient.user.updateMany.mockResolvedValue({ count: 1 });
      const result = await UserRepository.refundCurrentChips('1001');
      expect(result).toEqual({ refunded: 500 });
      expect(txClient.user.updateMany).toHaveBeenCalledWith({
        where: { telegramId: BigInt(1001), currentChips: { not: null } },
        data: {
          balance: { increment: 500 },
          currentChips: null,
          currentTableId: null,
          currentSeat: null,
          disconnectedAt: null,
          lastSeenAt: null,
        },
      });
      expect(txClient.transaction.create).toHaveBeenCalledWith({
        data: {
          userId: 7,
          type: 'cashout',
          amount: 500,
          balanceAfter: 1500,
          meta: { tableId: 't1' },
        },
      });
    });

    it('returns null and writes NO ledger row when currentChips IS NULL', async () => {
      txClient.user.findUnique.mockResolvedValue({ id: 7, currentChips: null, currentTableId: null });
      const result = await UserRepository.refundCurrentChips('1001');
      expect(result).toBeNull();
      expect(txClient.user.updateMany).not.toHaveBeenCalled();
      expect(txClient.transaction.create).not.toHaveBeenCalled();
    });

    // A bust-out leaves currentChips = 0, and every bust ends in "leave table" or a
    // re-buy — so this fired constantly and littered the ledger with 0-value cashouts.
    it('clears the session but writes NO ledger row when there is nothing to refund', async () => {
      txClient.user.findUnique.mockResolvedValue({ id: 7, currentChips: 0, currentTableId: 't1' });
      txClient.user.updateMany.mockResolvedValue({ count: 1 });

      const result = await UserRepository.refundCurrentChips('1001');

      expect(result).toEqual({ refunded: 0 });
      expect(txClient.transaction.create).not.toHaveBeenCalled();
      // The columns must still be cleared, or the boot sweep would keep finding them.
      expect(txClient.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ currentChips: null, currentTableId: null }),
        })
      );
    });

    it('returns null and writes NO ledger row on idempotent second call (count: 0)', async () => {
      txClient.user.findUnique.mockResolvedValue({ id: 7, currentChips: 500, currentTableId: 't1' });
      txClient.user.updateMany.mockResolvedValue({ count: 0 });
      const result = await UserRepository.refundCurrentChips('1001');
      expect(result).toBeNull();
      expect(txClient.transaction.create).not.toHaveBeenCalled();
    });

    it('returns null when user not found', async () => {
      txClient.user.findUnique.mockResolvedValue(null);
      const result = await UserRepository.refundCurrentChips('1001');
      expect(result).toBeNull();
      expect(txClient.user.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('adjustBalanceAtomic (adjustment ledger)', () => {
    it('writes an adjustment ledger row on a positive delta', async () => {
      txClient.user.updateMany.mockResolvedValue({ count: 1 });
      txClient.user.findUnique.mockResolvedValue({ id: 7, balance: 1200 });
      const result = await UserRepository.adjustBalanceAtomic('1001', 200);
      expect(result).toEqual({ success: true, newBalance: 1200 });
      expect(txClient.transaction.create).toHaveBeenCalledWith({
        data: { userId: 7, type: 'adjustment', amount: 200, balanceAfter: 1200 },
      });
    });

    it('rejects delta === 0 without touching the DB', async () => {
      const result = await UserRepository.adjustBalanceAtomic('1001', 0);
      expect(result).toEqual({ success: false });
      expect(txClient.user.updateMany).not.toHaveBeenCalled();
    });

    it('returns failure and writes NO ledger row when a negative delta underflows', async () => {
      txClient.user.updateMany.mockResolvedValue({ count: 0 });
      const result = await UserRepository.adjustBalanceAtomic('1001', -9999);
      expect(result).toEqual({ success: false });
      expect(txClient.transaction.create).not.toHaveBeenCalled();
    });
  });

  describe('claimDailyBonus (bonus ledger)', () => {
    it('sets balance to 1000 and records the delta as a bonus ledger row', async () => {
      txClient.user.findUnique.mockResolvedValue({ id: 7, balance: 300, lastDailyRefill: null });
      txClient.user.update.mockResolvedValue({ balance: 1000 });
      const result = await UserRepository.claimDailyBonus(1001);
      expect(result.success).toBe(true);
      expect(result.balance).toBe(1000);
      expect(txClient.transaction.create).toHaveBeenCalledWith({
        data: { userId: 7, type: 'bonus', amount: 700, balanceAfter: 1000 },
      });
    });

    it('does not write a ledger row when balance is already >= 1000', async () => {
      txClient.user.findUnique.mockResolvedValue({ id: 7, balance: 1000, lastDailyRefill: null });
      const result = await UserRepository.claimDailyBonus(1001);
      expect(result.success).toBe(false);
      expect(txClient.transaction.create).not.toHaveBeenCalled();
    });
  });
});
