import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/prisma.js', () => ({
  default: {
    user: { findMany: vi.fn() },
  },
}));
vi.mock('../db/UserRepository.js', () => ({
  UserRepository: {
    refundCurrentChips: vi.fn(),
  },
}));

import * as SessionRecovery from '../SessionRecovery.js';
import prisma from '../db/prisma.js';
import { UserRepository } from '../db/UserRepository.js';

describe('SessionRecovery', () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findMany).mockReset();
    vi.mocked(UserRepository.refundCurrentChips).mockReset();
  });

  it('calls refundCurrentChips for every row with currentTableId IS NOT NULL (D-C1)', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { telegramId: BigInt(1001), currentTableId: 'table-standard-1', currentChips: 500 },
      { telegramId: BigInt(1002), currentTableId: 'table-pro-1', currentChips: 2500 },
    ] as any);
    vi.mocked(UserRepository.refundCurrentChips).mockResolvedValue({ refunded: 500 });
    const result = await SessionRecovery.recoverPersistedSessions();
    expect(UserRepository.refundCurrentChips).toHaveBeenCalledTimes(2);
    expect(UserRepository.refundCurrentChips).toHaveBeenCalledWith('1001');
    expect(UserRepository.refundCurrentChips).toHaveBeenCalledWith('1002');
    expect(result.recovered).toBe(2);
  });

  it('logs warn for stale tableId not in PREDEFINED_TABLES but still refunds (D-C3)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { telegramId: BigInt(1001), currentTableId: 'deleted-table-xyz', currentChips: 500 },
    ] as any);
    vi.mocked(UserRepository.refundCurrentChips).mockResolvedValue({ refunded: 500 });
    await SessionRecovery.recoverPersistedSessions();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[BootRecovery] stale tableId'),
      'deleted-table-xyz',
      expect.anything(),
      expect.anything(),
    );
    expect(UserRepository.refundCurrentChips).toHaveBeenCalledWith('1001');
    warnSpy.mockRestore();
  });

  it('per-row sweep — one row failing does not abort others (D-C4)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { telegramId: BigInt(1001), currentTableId: 'table-standard-1', currentChips: 500 },
      { telegramId: BigInt(1002), currentTableId: 'table-pro-1', currentChips: 2500 },
      { telegramId: BigInt(1003), currentTableId: 'table-standard-2', currentChips: 1000 },
    ] as any);
    vi.mocked(UserRepository.refundCurrentChips)
      .mockResolvedValueOnce({ refunded: 500 })
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce({ refunded: 1000 });
    const result = await SessionRecovery.recoverPersistedSessions();
    expect(UserRepository.refundCurrentChips).toHaveBeenCalledTimes(3);
    expect(result.recovered).toBe(2); // 1001 + 1003 (1002 failed)
    errSpy.mockRestore();
  });

  it('returns { recovered: 0 } when no persisted sessions exist', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);
    const result = await SessionRecovery.recoverPersistedSessions();
    expect(result.recovered).toBe(0);
    expect(UserRepository.refundCurrentChips).not.toHaveBeenCalled();
  });
});
