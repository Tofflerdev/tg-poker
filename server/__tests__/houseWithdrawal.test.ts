import { describe, it, expect, beforeEach, vi } from 'vitest';

// §H: withdrawHouseRake orchestration — debit → Crypto Pay transfer → complete,
// with refund-on-failure. All collaborators mocked.
vi.mock('../db/prisma.js', () => ({
  default: { adminAuditLog: { create: vi.fn(async () => ({ id: 'a1' })) } },
}));
vi.mock('../TableManager.js', () => ({ tableManager: { getTable: vi.fn() } }));

const transfer = vi.fn();
vi.mock('../payments/cryptoPay.js', () => ({ getCryptoPay: () => ({ transfer }) }));

vi.mock('../db/UserRepository.js', () => ({
  UserRepository: {
    debitHouseForWithdrawal: vi.fn(),
    completeHouseWithdrawal: vi.fn(async () => {}),
    refundHouseWithdrawal: vi.fn(async () => {}),
  },
}));

import { withdrawHouseRake } from '../admin/adminMutations.js';
import { UserRepository } from '../db/UserRepository.js';

describe('withdrawHouseRake (§H)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('debits, transfers, and completes on success', async () => {
    vi.mocked(UserRepository.debitHouseForWithdrawal).mockResolvedValue({ ok: true, newBalance: 4000 });
    transfer.mockResolvedValue({ transfer_id: 77, status: 'completed' });

    const res = await withdrawHouseRake('admin', 1000, 424242);

    expect(res.newBalance).toBe(4000);
    expect(transfer).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 424242, amountUsdt: '10.00', spendId: expect.stringMatching(/^house-wd-/) }),
    );
    expect(UserRepository.completeHouseWithdrawal).toHaveBeenCalled();
    expect(UserRepository.refundHouseWithdrawal).not.toHaveBeenCalled();
  });

  it('rejects below the minimum withdrawal (no debit)', async () => {
    await expect(withdrawHouseRake('admin', 500, 424242)).rejects.toThrow(/Minimum withdrawal/);
    expect(UserRepository.debitHouseForWithdrawal).not.toHaveBeenCalled();
  });

  it('rejects a bad target user id (no debit)', async () => {
    await expect(withdrawHouseRake('admin', 1000, 0)).rejects.toThrow(/target Telegram user id/);
    expect(UserRepository.debitHouseForWithdrawal).not.toHaveBeenCalled();
  });

  it('throws on insufficient house balance and never transfers', async () => {
    vi.mocked(UserRepository.debitHouseForWithdrawal).mockResolvedValue({ ok: false, reason: 'insufficient' });
    await expect(withdrawHouseRake('admin', 1000, 424242)).rejects.toThrow(/insufficient/i);
    expect(transfer).not.toHaveBeenCalled();
  });

  it('refunds and marks failed when the transfer errors', async () => {
    vi.mocked(UserRepository.debitHouseForWithdrawal).mockResolvedValue({ ok: true, newBalance: 4000 });
    transfer.mockRejectedValue(new Error('recipient not found'));

    await expect(withdrawHouseRake('admin', 1000, 424242)).rejects.toThrow(/Transfer failed/);
    expect(UserRepository.refundHouseWithdrawal).toHaveBeenCalledWith(expect.stringMatching(/^house-wd-/));
    expect(UserRepository.completeHouseWithdrawal).not.toHaveBeenCalled();
  });
});
