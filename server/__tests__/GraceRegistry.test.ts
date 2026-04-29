import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock collaborators BEFORE importing the module under test.
vi.mock('../TableManager.js', () => ({
  tableManager: {
    getPlayerTable: vi.fn(),
    leaveTable: vi.fn(),
  },
}));
vi.mock('../db/UserRepository.js', () => ({
  UserRepository: {
    refundCurrentChips: vi.fn(),
  },
}));
vi.mock('../db/prisma.js', () => ({
  default: {
    user: { update: vi.fn() },
  },
}));

import * as GraceRegistry from '../GraceRegistry.js';
import { tableManager } from '../TableManager.js';
import { UserRepository } from '../db/UserRepository.js';
import prisma from '../db/prisma.js';

describe('GraceRegistry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    GraceRegistry.__resetForTests();
    vi.mocked(tableManager.getPlayerTable).mockReset();
    vi.mocked(tableManager.leaveTable).mockReset();
    vi.mocked(UserRepository.refundCurrentChips).mockReset();
    vi.mocked(prisma.user.update).mockReset();
  });
  afterEach(() => {
    GraceRegistry.__resetForTests();
    vi.useRealTimers();
  });

  it('arm() with stage=mid-hand sets a 30000 ms timer (D-B2)', () => {
    GraceRegistry.arm('1001', 'mid-hand', 'table-standard-1');
    const entry = GraceRegistry.__getInternalsForTests().registry.get('1001');
    expect(entry).toBeDefined();
    expect(entry!.stage).toBe('mid-hand');
    // expiresAt is approximately Date.now() + 30000
    expect(entry!.expiresAt - Date.now()).toBeGreaterThanOrEqual(29000);
    expect(entry!.expiresAt - Date.now()).toBeLessThanOrEqual(31000);
  });

  it('arm() with stage=between-hands sets a 120000 ms timer (D-B2)', () => {
    GraceRegistry.arm('1001', 'between-hands', 'table-standard-1');
    const entry = GraceRegistry.__getInternalsForTests().registry.get('1001');
    expect(entry!.stage).toBe('between-hands');
    expect(entry!.expiresAt - Date.now()).toBeGreaterThanOrEqual(119000);
    expect(entry!.expiresAt - Date.now()).toBeLessThanOrEqual(121000);
  });

  it('clear() cancels timer and removes registry entry', () => {
    GraceRegistry.arm('1001', 'mid-hand', 'table-standard-1');
    GraceRegistry.clear('1001');
    expect(GraceRegistry.__getInternalsForTests().registry.has('1001')).toBe(false);
  });

  it('arm() called twice replaces the prior timer (idempotent re-arm)', () => {
    GraceRegistry.arm('1001', 'mid-hand', 'table-standard-1');
    GraceRegistry.arm('1001', 'between-hands', 'table-standard-1');
    const entry = GraceRegistry.__getInternalsForTests().registry.get('1001');
    expect(entry!.stage).toBe('between-hands');
    expect(GraceRegistry.__getInternalsForTests().registry.size).toBe(1);
  });

  it('reArmIfMidHand() swaps mid-hand entry to between-hands keeping same tableId (D-B2 hand-end re-arm)', () => {
    GraceRegistry.arm('1001', 'mid-hand', 'table-standard-1');
    GraceRegistry.reArmIfMidHand('1001');
    const entry = GraceRegistry.__getInternalsForTests().registry.get('1001');
    expect(entry!.stage).toBe('between-hands');
    expect(entry!.tableId).toBe('table-standard-1');
  });

  it('reArmIfMidHand() is a no-op when entry stage is already between-hands', () => {
    GraceRegistry.arm('1001', 'between-hands', 'table-standard-1');
    const before = GraceRegistry.__getInternalsForTests().registry.get('1001')!.expiresAt;
    GraceRegistry.reArmIfMidHand('1001');
    const after = GraceRegistry.__getInternalsForTests().registry.get('1001')!.expiresAt;
    expect(after).toBe(before);
  });

  it('reArmIfMidHand() is a no-op when no entry exists', () => {
    GraceRegistry.reArmIfMidHand('1001');
    expect(GraceRegistry.__getInternalsForTests().registry.size).toBe(0);
  });

  it('mid-hand expiry calls table.sitOut(tid) and clears disconnectedAt (D-B3)', async () => {
    const sitOut = vi.fn();
    vi.mocked(tableManager.getPlayerTable).mockReturnValue({ id: 'table-standard-1', sitOut } as any);
    GraceRegistry.arm('1001', 'mid-hand', 'table-standard-1');
    await vi.advanceTimersByTimeAsync(30_001);
    expect(sitOut).toHaveBeenCalledWith('1001');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { telegramId: BigInt(1001) },
      data: { disconnectedAt: null },
    });
    expect(GraceRegistry.__getInternalsForTests().registry.has('1001')).toBe(false);
  });

  it('between-hands expiry calls leaveTable + refundCurrentChips (D-B3)', async () => {
    vi.mocked(tableManager.getPlayerTable).mockReturnValue({ id: 'table-standard-1' } as any);
    vi.mocked(UserRepository.refundCurrentChips).mockResolvedValue({ refunded: 500 });
    GraceRegistry.arm('1001', 'between-hands', 'table-standard-1');
    await vi.advanceTimersByTimeAsync(120_001);
    expect(tableManager.leaveTable).toHaveBeenCalledWith('1001');
    expect(UserRepository.refundCurrentChips).toHaveBeenCalledWith('1001');
    expect(GraceRegistry.__getInternalsForTests().registry.has('1001')).toBe(false);
  });

  it('expiry is a no-op when player already left table (getPlayerTable returns undefined)', async () => {
    vi.mocked(tableManager.getPlayerTable).mockReturnValue(undefined);
    GraceRegistry.arm('1001', 'between-hands', 'table-standard-1');
    await vi.advanceTimersByTimeAsync(120_001);
    expect(tableManager.leaveTable).not.toHaveBeenCalled();
    expect(UserRepository.refundCurrentChips).not.toHaveBeenCalled();
  });
});
