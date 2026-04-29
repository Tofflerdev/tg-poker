import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/prisma.js', () => ({
  default: {
    user: {
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import { UserRepository } from '../db/UserRepository.js';
import prisma from '../db/prisma.js';

describe('UserRepository atomic helpers', () => {
  beforeEach(() => {
    vi.mocked(prisma.user.updateMany).mockReset();
    vi.mocked(prisma.user.findUnique).mockReset();
  });

  describe('tryDecrementBalance (D-D1)', () => {
    it('returns true when updateMany affects 1 row (balance >= amount)', async () => {
      vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 });
      const ok = await UserRepository.tryDecrementBalance(1001, 500);
      expect(ok).toBe(true);
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { telegramId: BigInt(1001), balance: { gte: 500 } },
        data: { balance: { decrement: 500 } },
      });
    });

    it('returns false when updateMany affects 0 rows (insufficient funds — no DB write)', async () => {
      vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 0 });
      const ok = await UserRepository.tryDecrementBalance(1001, 500);
      expect(ok).toBe(false);
    });
  });

  describe('refundCurrentChips (D-D2)', () => {
    it('returns { refunded: N } and clears all session columns when currentChips IS NOT NULL', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ currentChips: 500 } as any);
      vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 });
      const result = await UserRepository.refundCurrentChips('1001');
      expect(result).toEqual({ refunded: 500 });
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
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
    });

    it('returns null when currentChips IS NULL (never seated / already cleared)', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ currentChips: null } as any);
      const result = await UserRepository.refundCurrentChips('1001');
      expect(result).toBeNull();
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('returns null on idempotent second call (race: another caller already cleared, count: 0)', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ currentChips: 500 } as any);
      vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 0 });
      const result = await UserRepository.refundCurrentChips('1001');
      expect(result).toBeNull();
    });

    it('returns null when user not found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      const result = await UserRepository.refundCurrentChips('1001');
      expect(result).toBeNull();
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });
  });
});
