import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, screen, waitFor } from '@testing-library/react';
import React from 'react';

/**
 * exit-reconnect B1/B4 — the two client bugs behind the prod stack loss.
 * See plans/exit-reconnect-fix-plan.md.
 *
 * B4: auth was emitted once on mount. socket.io reconnects the transport by opening
 *     a NEW server socket that has no session, so every reconnect left the player
 *     connected-but-unauthenticated with no way out but restarting the app.
 * B1: authSuccess forced view='menu', clobbering the tableJoined resume snapshot the
 *     server sends first. The player landed in the menu and pressed "join", which
 *     bought a fresh stack and destroyed the held one.
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
    _reset: () => {
      handlers.clear();
      socketMock.emit.mockClear();
      socketMock.on.mockClear();
    },
  };
});

vi.mock('socket.io-client', () => ({
  io: () => socketMock,
  Socket: class {},
}));

// useTelegram is NOT mocked: the shared setup already stubs window.Telegram.WebApp,
// so the real hook runs and the app takes its dev-mode auth path (initData is empty).
import App from '../../App';

// tosAcceptedAt matters: without it the app routes to the Consent gate and never
// reaches menu or table, which would make every assertion below meaningless.
const authOk = {
  id: '1', telegramId: 158394554, displayName: 'Fair Hawk 49',
  username: 'x', firstName: 'F', lastName: 'H', photoUrl: '', balance: 141,
  tosAcceptedAt: new Date().toISOString(), tosVersion: '1.0',
};

/** Six seats with the authenticated player seated at `seat` and one opponent. */
const seatsWithMeAt = (seat: number) => {
  const mk = (id: string, s: number) => ({
    id, seat: s, displayName: id, hand: ['As', 'Kd'], chips: 80, bet: 0, totalBet: 0,
    folded: false, allIn: false, acted: false, showCards: false,
    owesBlind: false, sittingOut: false,
  });
  const seats: any[] = Array(6).fill(null);
  seats[seat] = mk(String(authOk.telegramId), seat);
  seats[0] = mk('-1', 0);
  return seats;
};

const gameState = {
  seats: Array(6).fill(null), spectators: [], communityCards: [], pots: [],
  totalPot: 0, currentBet: 0, currentPlayer: null, dealerPosition: 0,
  smallBlind: 1, bigBlind: 2, rakeBps: 500, rakeCapBB: 3,
  stage: 'waiting', turnExpiresAt: null, nextHandIn: null, lastRoundBets: [],
};

describe('reconnect resume (exit-reconnect B1/B4)', () => {
  beforeEach(() => {
    socketMock._reset();
    socketMock.connected = true;
  });

  const authEmits = () => socketMock.emit.mock.calls.filter(([e]) => e === 'auth');

  it('re-authenticates on every connect, not just on mount', async () => {
    render(<App />);
    await waitFor(() => expect(authEmits().length).toBe(1));

    // The transport drops and socket.io brings it back on a NEW server socket.
    act(() => { socketMock._trigger('disconnect'); });
    act(() => { socketMock._trigger('connect'); });

    // Without this the new socket stays anonymous: every action returns authError
    // and the only escape is closing and reopening the app (the reported symptom).
    await waitFor(() => expect(authEmits().length).toBe(2));
  });

  // "Play Now — browse tables" is the menu's own button; "Open chat" only exists at
  // the table. They tell the two views apart without adding test-only markup.
  const menuShown = () => screen.queryByRole('button', { name: /play now/i });
  const tableShown = () => screen.queryByRole('button', { name: /open chat/i });

  it('keeps the restored table when authSuccess arrives after tableJoined', async () => {
    render(<App />);

    // Server order on a reconnect with a held seat: resume snapshot, THEN authSuccess.
    act(() => {
      socketMock._trigger('tableJoined', {
        tableId: 'table-funnel-1', seat: 0, state: gameState, reconnectWindowMs: 120_000,
      });
    });
    act(() => { socketMock._trigger('authSuccess', authOk); });

    // The player must still be at the table. Landing in the menu here is exactly what
    // led them to press "join" and destroy the held stack.
    await waitFor(() => {
      expect(tableShown()).toBeInTheDocument();
      expect(menuShown()).not.toBeInTheDocument();
    });
  });

  // B6, reported from prod: "I reopened the app, landed at the table but saw myself
  // from the outside, and when it was my turn I could do nothing until the timer
  // auto-folded me."
  it('takes mySeat from the tableJoined payload so a resumed player can act', async () => {
    render(<App />);

    // Exact server order on resume: snapshot first, state broadcast, THEN authSuccess.
    // It is seat 5's turn — i.e. the table is waiting on us.
    const myTurnState = { ...gameState, stage: 'preflop', currentPlayer: 5, seats: seatsWithMeAt(5) };
    act(() => {
      socketMock._trigger('tableJoined', {
        tableId: 'table-funnel-1', seat: 5, state: myTurnState, reconnectWindowMs: 120_000,
      });
    });
    act(() => { socketMock._trigger('state', myTurnState); });
    act(() => { socketMock._trigger('authSuccess', authOk); });

    // Controls live only when mySeat is known: GameRoom gates them on
    // `mySeat !== null && currentPlayer === mySeat`. With mySeat null nothing renders
    // and nothing can break the deadlock, because no one else is due to act.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /fold/i })).toBeInTheDocument();
    });
  });

  it('still lands in the menu when there is no seat to restore', async () => {
    render(<App />);
    act(() => { socketMock._trigger('authSuccess', authOk); });
    // No tableJoined => nothing to preserve => normal menu landing. Guards against
    // "fixing" B1 by never leaving the loading view.
    await waitFor(() => {
      expect(menuShown()).toBeInTheDocument();
      expect(tableShown()).not.toBeInTheDocument();
    });
  });
});
