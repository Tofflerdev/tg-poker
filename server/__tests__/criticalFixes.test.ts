import { describe, it, expect } from 'vitest';
import Game from '../Game.js';
import { Table } from '../models/Table.js';
import type { Player, TableConfig } from '../../types/index.js';

function mkPlayer(seat: number, id: string, over: Partial<Player> = {}): Player {
  return {
    id, seat, hand: ['Ts', 'Td'], chips: 1000, bet: 0, totalBet: 0,
    folded: false, allIn: false, acted: false, showCards: false,
    owesBlind: false, sittingOut: false, isBot: false, ...over,
  };
}

/** Seat two players and make `seat` the current actor so raise() is valid. */
function gameReadyToRaise(): Game {
  const g = new Game('t');
  const seats = [mkPlayer(0, 'A', { bet: 0 }), mkPlayer(1, 'B', { bet: 20 }), null, null, null, null];
  (g as any).seats = seats;
  (g as any).stage = 'preflop';
  (g as any).currentPlayer = 0;
  (g as any).currentBet = 20;
  (g as any).bigBlind = 20;
  return g;
}

describe('raise input validation (audit 1.2 — NaN/float/negative must not corrupt state)', () => {
  for (const bad of [NaN, Infinity, -50, 0, 10.5, '100' as unknown as number]) {
    it(`rejects raise amount ${String(bad)} and leaves stack/pot intact`, () => {
      const g = gameReadyToRaise();
      const before = { chips: (g as any).seats[0].chips, currentBet: (g as any).currentBet };

      const ok = g.raise('A', bad);

      expect(ok).toBe(false);
      const after = (g as any).seats[0];
      expect(after.chips).toBe(before.chips);
      expect(Number.isNaN(after.chips)).toBe(false);
      expect((g as any).currentBet).toBe(before.currentBet);
      expect(Number.isNaN((g as any).currentBet)).toBe(false);
    });
  }

  it('accepts a valid integer raise', () => {
    const g = gameReadyToRaise();
    const ok = g.raise('A', 40); // amount on top of the 20 call
    expect(ok).toBe(true);
    expect((g as any).currentBet).toBe(60);
  });
});

describe('blind config wiring (audit 2.1 — engine must use table config, not hardcoded 10/20)', () => {
  const cfg = (over: Partial<TableConfig> = {}): TableConfig => ({
    smallBlind: 5, bigBlind: 10, maxPlayers: 6, turnTime: 20, minBuyIn: 400, maxBuyIn: 1000, category: 'cash', ...over,
  });

  it('Table posts blinds from its config, not the engine default', () => {
    const t = new Table('hs', 'High Stakes', cfg({ smallBlind: 100, bigBlind: 200 }));
    t.addPlayer('A', 0, 10000);
    t.addPlayer('B', 1, 10000);
    (t.game as any).startNextHand();

    const state = t.getState();
    const posted = state.seats.filter((p): p is Player => p !== null).map(p => p.bet).sort((a, b) => a - b);
    expect(state.smallBlind).toBe(100);
    expect(state.bigBlind).toBe(200);
    expect(posted).toEqual([100, 200]);
  });

  it('turnTime from config drives the turn timer (not hardcoded 30s)', () => {
    const t = new Table('pro', 'Pro', cfg({ turnTime: 15 }));
    expect((t.game as any).turnTimeLimit).toBe(15000);
  });

  it('setBlinds updates blinds and rejects invalid values', () => {
    const g = new Game('t');
    expect(g.setBlinds(25, 50)).toBe(true);
    expect((g as any).smallBlind).toBe(25);
    expect((g as any).bigBlind).toBe(50);
    expect(g.setBlinds(NaN, 50)).toBe(false);
    expect(g.setBlinds(-5, 10)).toBe(false);
    expect((g as any).smallBlind).toBe(25); // unchanged after rejected calls
  });
});
