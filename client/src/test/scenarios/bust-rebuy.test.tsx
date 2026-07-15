import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';

/**
 * exit-reconnect B10 — busting out.
 *
 * Losing your stack is normal poker, not a failure. The old flow fired a system
 * errorMessage ("Ваш стек равен 0. Вы покидаете стол.") which both alarmed the player
 * and lied — they had not left; they were sitting there as a spectator with a seat map
 * that had turned clickable. Picking a seat then emitted the legacy `join`, which
 * bought in at minBuyIn on whichever table was free first.
 *
 * Now: the buy-in picker appears, offering top-up or leave. Seats stay auto-assigned.
 */

const socketMock = vi.hoisted(() => {
  const handlers = new Map<string, Set<(payload?: any) => void>>();
  return {
    connected: true,
    on: vi.fn((event: string, cb: (payload?: any) => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(cb);
    }),
    off: vi.fn((event: string, cb?: (payload?: any) => void) => {
      if (!cb) handlers.delete(event);
      else handlers.get(event)?.delete(cb);
    }),
    emit: vi.fn(),
    _trigger: (event: string, payload?: any) => {
      handlers.get(event)?.forEach((cb) => cb(payload));
    },
    _reset: () => { handlers.clear(); socketMock.emit.mockClear(); },
  };
});

vi.mock('socket.io-client', () => ({ io: () => socketMock, Socket: class {} }));

import App from '../../App';

const authOk = {
  id: '1', telegramId: 158394554, displayName: 'Fair Hawk 49',
  firstName: 'F', balance: 920,
  tosAcceptedAt: new Date().toISOString(), tosVersion: '1.0',
};

const table = {
  id: 'table-funnel-1',
  name: '🐣 Funnel Table',
  config: {
    smallBlind: 1, bigBlind: 2, maxPlayers: 6, turnTime: 30,
    minBuyIn: 80, maxBuyIn: 200, category: 'cash', rakeBps: 500, rakeCapBB: 3,
  },
  status: 'active',
  playerCount: 3,
  maxPlayers: 6,
};

const gameState = {
  seats: Array(6).fill(null), spectators: [], communityCards: [], pots: [],
  totalPot: 0, currentBet: 0, currentPlayer: null, dealerPosition: 0,
  smallBlind: 1, bigBlind: 2, rakeBps: 500, rakeCapBB: 3,
  stage: 'waiting', turnExpiresAt: null, nextHandIn: null, lastRoundBets: [],
};

/** Seat the player, then bust them out. */
async function bustOut() {
  render(<App />);
  act(() => {
    socketMock._trigger('tableJoined', {
      tableId: table.id, seat: 1, state: gameState, reconnectWindowMs: 120_000,
    });
  });
  act(() => { socketMock._trigger('authSuccess', authOk); });
  act(() => { socketMock._trigger('bustedOut', { table }); });
  await waitFor(() => expect(screen.getByTestId('rebuy-heading')).toBeInTheDocument());
}

describe('busting out offers a re-buy (exit-reconnect B10)', () => {
  beforeEach(() => { socketMock._reset(); socketMock.connected = true; });

  it('shows the buy-in picker, not a system error', async () => {
    await bustOut();
    expect(screen.getByTestId('rebuy-heading')).toBeInTheDocument();
    // Both ways out are offered explicitly.
    expect(screen.getByRole('button', { name: /leave table/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /top up/i })).toBeInTheDocument();
  });

  it('topping up re-buys with the CHOSEN amount and an auto-assigned seat', async () => {
    await bustOut();
    fireEvent.click(screen.getByRole('button', { name: /top up/i }));

    const join = socketMock.emit.mock.calls.find(([e]) => e === 'joinTable');
    expect(join).toBeDefined();
    // seat -1: the client never names a seat. The old path went through `join(seat)`
    // and always bought in at minBuyIn, ignoring the phase-3 picker entirely.
    expect(join![1].seat).toBe(-1);
    expect(join![1].tableId).toBe(table.id);
    expect(join![1].buyInAmount).toBeGreaterThanOrEqual(table.config.minBuyIn);
    expect(join![1].buyInAmount).toBeLessThanOrEqual(table.config.maxBuyIn);
  });

  it('declining leaves the table — there is no "just close"', async () => {
    await bustOut();
    fireEvent.click(screen.getByRole('button', { name: /leave table/i }));

    expect(socketMock.emit.mock.calls.some(([e]) => e === 'leaveTable')).toBe(true);
    await waitFor(() => {
      expect(screen.queryByTestId('rebuy-heading')).not.toBeInTheDocument();
    });
  });

  it('a normal join shows the plain picker, with no bust copy', async () => {
    render(<App />);
    act(() => { socketMock._trigger('authSuccess', authOk); });
    act(() => { socketMock._trigger('tablesList', [table]); });

    await waitFor(() => expect(screen.getByRole('button', { name: /play now/i })).toBeInTheDocument());
    expect(screen.queryByTestId('rebuy-heading')).not.toBeInTheDocument();
  });
});
