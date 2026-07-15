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
import * as PendingExits from '../PendingExits.js';
import * as ExitNotices from '../ExitNotices.js';
import { tableManager } from '../TableManager.js';
import { UserRepository } from '../db/UserRepository.js';
import prisma from '../db/prisma.js';

/**
 * exit-reconnect D — single reconnect window. See plans/exit-reconnect-fix-plan.md.
 * Replaces the two-stage 30 s/120 s design: chips are protected by sitting the player
 * out at the hand boundary, so the window is now a pure seat-holding policy.
 */

/** Minimal Table double — only what GraceRegistry touches. */
function mockTable(over: Partial<Record<string, unknown>> = {}) {
  const seats: any[] = [{ id: '42', sittingOut: false }];
  return {
    id: 'table-funnel-1',
    getState: vi.fn(() => ({ seats })),
    sitOut: vi.fn((id: string) => {
      const p = seats.find((s) => s?.id === id);
      if (p) p.sittingOut = true;
      return true;
    }),
    sitIn: vi.fn((id: string) => {
      const p = seats.find((s) => s?.id === id);
      if (p) p.sittingOut = false;
      return true;
    }),
    isInHand: vi.fn(() => false),
    markLeaving: vi.fn(() => true),
    _seats: seats,
    ...over,
  };
}

describe('GraceRegistry — single reconnect window (exit-reconnect D)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    GraceRegistry.__resetForTests();
    PendingExits.__resetForTests();
    ExitNotices.__resetForTests();
    vi.mocked(tableManager.getPlayerTable).mockReset();
    vi.mocked(tableManager.leaveTable).mockReset();
    vi.mocked(UserRepository.refundCurrentChips).mockReset();
    vi.mocked(prisma.user.update).mockReset();
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);
  });
  afterEach(() => {
    GraceRegistry.__resetForTests();
    vi.useRealTimers();
  });

  it('arm() holds the seat for one stage-independent window', () => {
    GraceRegistry.arm('42', 'table-funnel-1');
    expect(GraceRegistry.isDisconnected('42')).toBe(true);
    expect(GraceRegistry.expiresAt('42')).toBe(Date.now() + GraceRegistry.RECONNECT_WINDOW_MS);
  });

  it('clear() cancels the window — reconnecting stops the clock', () => {
    const table = mockTable();
    vi.mocked(tableManager.getPlayerTable).mockReturnValue(table as never);
    GraceRegistry.arm('42', 'table-funnel-1');
    GraceRegistry.clear('42');
    expect(GraceRegistry.isDisconnected('42')).toBe(false);

    vi.advanceTimersByTime(GraceRegistry.RECONNECT_WINDOW_MS * 2);
    expect(tableManager.leaveTable).not.toHaveBeenCalled();
  });

  // exit-reconnect B6b. onHandBoundary sits a disconnected player out to stop the
  // blind bleed — they never chose that, so coming back has to undo it. Without this
  // they sit at the table dealt out of every hand with no way back: the client has no
  // sit-in button, so the only escape would be leaving.
  it('clear() sits a disconnected player back in', () => {
    const table = mockTable();
    vi.mocked(tableManager.getPlayerTable).mockReturnValue(table as never);

    GraceRegistry.arm('42', 'table-funnel-1');
    GraceRegistry.onHandBoundary(['42']);
    expect(table._seats[0].sittingOut).toBe(true);

    GraceRegistry.clear('42');

    expect(table.sitIn).toHaveBeenCalledWith('42');
    expect(table._seats[0].sittingOut).toBe(false);
  });

  it('clear() does NOT touch a player who was never sat out (fast reconnect)', () => {
    // Game.sitIn also sets waitingForBB, so calling it here would make a player who
    // reconnected inside one hand sit out the blind for nothing.
    const table = mockTable();
    vi.mocked(tableManager.getPlayerTable).mockReturnValue(table as never);

    GraceRegistry.arm('42', 'table-funnel-1');
    GraceRegistry.clear('42');

    expect(table.sitIn).not.toHaveBeenCalled();
  });

  it('clear() does NOT sit in a player whose exit is settling', () => {
    const table = mockTable();
    vi.mocked(tableManager.getPlayerTable).mockReturnValue(table as never);
    GraceRegistry.arm('42', 'table-funnel-1');
    GraceRegistry.onHandBoundary(['42']);
    PendingExits.mark('42', 'table-funnel-1', 'left');

    GraceRegistry.clear('42');

    // markLeaving set sittingOut on purpose; the boundary is about to cash them out.
    expect(table.sitIn).not.toHaveBeenCalled();
  });

  it('arm() twice replaces the prior timer — no leak under churn', () => {
    GraceRegistry.arm('42', 'table-funnel-1');
    GraceRegistry.arm('42', 'table-funnel-1');
    expect(GraceRegistry.__getInternalsForTests().registry.size).toBe(1);
  });

  describe('onHandBoundary — sit out as soon as the current hand ends', () => {
    it('sits out a player who is still inside the window', () => {
      const table = mockTable();
      vi.mocked(tableManager.getPlayerTable).mockReturnValue(table as never);
      GraceRegistry.arm('42', 'table-funnel-1');

      GraceRegistry.onHandBoundary(['42', '99']);

      // This is what stops the blind bleed and lets the window be long.
      expect(table.sitOut).toHaveBeenCalledWith('42');
      expect(table.sitOut).toHaveBeenCalledTimes(1); // '99' is connected — untouched
    });

    it('leaves connected players alone', () => {
      const table = mockTable();
      vi.mocked(tableManager.getPlayerTable).mockReturnValue(table as never);
      GraceRegistry.onHandBoundary(['42']);
      expect(table.sitOut).not.toHaveBeenCalled();
    });
  });

  describe('expiry', () => {
    it('vacates and refunds when the player is NOT in a hand', async () => {
      const table = mockTable({ isInHand: vi.fn(() => false) });
      vi.mocked(tableManager.getPlayerTable).mockReturnValue(table as never);
      vi.mocked(UserRepository.refundCurrentChips).mockResolvedValue({ refunded: 78 });

      GraceRegistry.arm('42', 'table-funnel-1');
      await vi.advanceTimersByTimeAsync(GraceRegistry.RECONNECT_WINDOW_MS);

      expect(tableManager.leaveTable).toHaveBeenCalledWith('42');
      expect(UserRepository.refundCurrentChips).toHaveBeenCalledWith('42');
    });

    it('parks a notice — nobody is connected to be told, so auth delivers it', async () => {
      const table = mockTable();
      vi.mocked(tableManager.getPlayerTable).mockReturnValue(table as never);
      vi.mocked(UserRepository.refundCurrentChips).mockResolvedValue({ refunded: 78 });

      GraceRegistry.arm('42', 'table-funnel-1');
      await vi.advanceTimersByTimeAsync(GraceRegistry.RECONNECT_WINDOW_MS);

      expect(ExitNotices.take('42')).toEqual({ tableId: 'table-funnel-1', refunded: 78 });
    });

    it('NEVER vacates mid-hand — hands over to the deferred-exit path instead', async () => {
      // The hand they dropped in outlived the window. Refunding now would pay out the
      // stale pre-hand checkpoint while their committed chips go to the winner (B2).
      const table = mockTable({ isInHand: vi.fn(() => true) });
      vi.mocked(tableManager.getPlayerTable).mockReturnValue(table as never);

      GraceRegistry.arm('42', 'table-funnel-1');
      await vi.advanceTimersByTimeAsync(GraceRegistry.RECONNECT_WINDOW_MS);

      expect(tableManager.leaveTable).not.toHaveBeenCalled();
      expect(UserRepository.refundCurrentChips).not.toHaveBeenCalled();
      expect(table.markLeaving).toHaveBeenCalledWith('42');
      expect(PendingExits.get('42')).toEqual({ tableId: 'table-funnel-1', reason: 'disconnected' });
    });

    it('is a no-op when the player already left the table', async () => {
      vi.mocked(tableManager.getPlayerTable).mockReturnValue(undefined as never);
      GraceRegistry.arm('42', 'table-funnel-1');
      await vi.advanceTimersByTimeAsync(GraceRegistry.RECONNECT_WINDOW_MS);
      expect(tableManager.leaveTable).not.toHaveBeenCalled();
      expect(UserRepository.refundCurrentChips).not.toHaveBeenCalled();
    });

    it('holds the seat for the FULL window and not a moment less', async () => {
      const table = mockTable();
      vi.mocked(tableManager.getPlayerTable).mockReturnValue(table as never);
      vi.mocked(UserRepository.refundCurrentChips).mockResolvedValue({ refunded: 78 });

      GraceRegistry.arm('42', 'table-funnel-1');
      await vi.advanceTimersByTimeAsync(GraceRegistry.RECONNECT_WINDOW_MS - 1000);
      expect(tableManager.leaveTable).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1000);
      expect(tableManager.leaveTable).toHaveBeenCalledWith('42');
    });
  });
});
