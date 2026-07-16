import { describe, it, expect } from 'vitest';
import Game from '../Game.js';
import { Table } from '../models/Table.js';
import { RateLimiter } from '../utils/rateLimit.js';
import type { Player, Pot, TableConfig } from '../../types/index.js';

function mkPlayer(seat: number, id: string, over: Partial<Player> = {}): Player {
  return {
    id, seat, hand: ['Ts', 'Td'], chips: 1000, bet: 0, totalBet: 0,
    folded: false, allIn: false, acted: false, showCards: false,
    owesBlind: false, sittingOut: false, isBot: false, ...over,
  };
}

function gameWithSeats(seats: (Player | null)[], over: Partial<Record<string, unknown>> = {}): Game {
  const g = new Game('t');
  (g as any).seats = seats;
  Object.assign(g as any, over);
  return g;
}

const calc = (g: Game): Pot[] => (g as any).calculatePots();
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const cfg = (over: Partial<TableConfig> = {}): TableConfig => ({
  smallBlind: 5, bigBlind: 10, maxPlayers: 6, turnTime: 20, minBuyIn: 400, maxBuyIn: 1000, category: 'cash', ...over,
});

describe('audit #4 — pot preserved when a player leaves mid-hand', () => {
  it('a leaver\'s committed chips stay in the pot for the remaining players', () => {
    const seats = [
      mkPlayer(0, 'A', { totalBet: 100, bet: 0 }),
      mkPlayer(1, 'B', { totalBet: 100, bet: 0 }),
      mkPlayer(2, 'C', { totalBet: 100, bet: 0 }),
      null, null, null,
    ];
    const g = gameWithSeats(seats, { stage: 'flop', currentPlayer: 0, dealerPosition: 0 });

    // C leaves mid-hand (not the current actor).
    g.removePlayer('C');

    const pots = calc(g);
    // All 300 chips remain in play; only A and B can win.
    expect(sum(pots.map(p => p.amount))).toBe(300);
    expect([...pots[0].eligiblePlayers].sort()).toEqual(['A', 'B']);
    // Total pot reflects the dead contribution immediately (no dip).
    expect((g as any).getTotalPot()).toBe(300);
  });

  it('deadContributions is cleared on reset (does not leak into the next hand)', () => {
    const seats = [mkPlayer(0, 'A', { totalBet: 100 }), mkPlayer(1, 'B', { totalBet: 100 }), mkPlayer(2, 'C', { totalBet: 100 }), null, null, null];
    const g = gameWithSeats(seats, { stage: 'flop', currentPlayer: 0, dealerPosition: 0 });
    g.removePlayer('C');
    expect((g as any).deadContributions.length).toBe(1);
    g.reset();
    expect((g as any).deadContributions.length).toBe(0);
    expect((g as any).getTotalPot()).toBe(0);
  });
});

describe('audit #7/#8 — blind positions', () => {
  it('#7 blinds skip a sitting-out player', () => {
    const seats = [
      mkPlayer(0, 'A'),
      mkPlayer(1, 'X', { sittingOut: true }),
      mkPlayer(2, 'B'),
      mkPlayer(3, 'C'),
      null, null,
    ];
    const g = gameWithSeats(seats, { dealerPosition: 0 });
    // Eligible = A,B,C (3) → not heads-up. SB skips the sitting-out seat 1.
    expect((g as any).getSmallBlindPosition()).toBe(2);
    expect((g as any).getBigBlindPosition()).toBe(3);
  });

  it('#8 heads-up: the button posts the small blind', () => {
    const t = new Table('hu', 'HU', cfg({ smallBlind: 5, bigBlind: 10 }));
    t.addPlayer('A', 0, 1000);
    t.addPlayer('B', 1, 1000);
    (t.game as any).startNextHand();

    const st = t.getState();
    const dealerSeat = st.seats[st.dealerPosition]!;
    const otherSeat = st.seats.find((p): p is Player => p !== null && p.seat !== st.dealerPosition)!;
    expect(dealerSeat.bet).toBe(5);   // button = small blind
    expect(otherSeat.bet).toBe(10);   // opponent = big blind
  });
});

describe('audit #9 — min-raise rules', () => {
  it('rejects a re-raise smaller than the last raise size', () => {
    const seats = [mkPlayer(0, 'A'), mkPlayer(1, 'B'), null, null, null, null];
    const g = gameWithSeats(seats, { stage: 'preflop', currentPlayer: 0, currentBet: 20, bigBlind: 20, lastRaiseSize: 20 });

    expect(g.raise('A', 40)).toBe(true);          // first raise of 40 → lastRaiseSize = 40
    expect((g as any).lastRaiseSize).toBe(40);
    expect((g as any).currentBet).toBe(60);
    expect(g.raise('B', 20)).toBe(false);         // 20 < 40 → illegal
    expect(g.raise('B', 40)).toBe(true);          // 40 ≥ 40 → legal
    expect((g as any).currentBet).toBe(100);
  });

  it('an under-raise all-in does NOT reopen betting for players who already acted', () => {
    const seats = [
      mkPlayer(0, 'A', { bet: 20, chips: 980, acted: true }),
      mkPlayer(1, 'B', { bet: 0, chips: 30 }),
      null, null, null, null,
    ];
    const g = gameWithSeats(seats, { stage: 'preflop', currentPlayer: 1, currentBet: 20, bigBlind: 20, lastRaiseSize: 20 });

    g.allIn('B'); // B to 30 — only +10 over currentBet, less than a full raise (20)
    expect((g as any).currentBet).toBe(30);
    expect((g as any).lastRaiseSize).toBe(20);     // unchanged by an under-raise
    expect(seats[0]!.acted).toBe(true);            // A not forced to re-act
  });

  it('a full-raise all-in reopens betting and updates the min raise', () => {
    const seats = [
      mkPlayer(0, 'A', { bet: 20, chips: 980, acted: true }),
      mkPlayer(1, 'B', { bet: 0, chips: 100 }),
      null, null, null, null,
    ];
    const g = gameWithSeats(seats, { stage: 'preflop', currentPlayer: 1, currentBet: 20, bigBlind: 20, lastRaiseSize: 20 });

    g.allIn('B'); // B to 100 — +80 over currentBet, a full raise
    expect((g as any).currentBet).toBe(100);
    expect((g as any).lastRaiseSize).toBe(80);
    expect(seats[0]!.acted).toBe(false);           // A must respond again
  });
});

describe('audit #6 — broadcast strips socketId + numeric telegramId', () => {
  it('getStateForPlayer omits socketId and telegramId', () => {
    const t = new Table('dto', 'DTO', cfg());
    t.addPlayer('A', 0, 1000, 12345, 'Alice', undefined, 'av-1');
    t.updatePlayerSocketId('A', 'socket-xyz');

    const st = t.getStateForPlayer('A');
    const me = st.seats[0] as any;
    expect(me.id).toBe('A');            // durable string id kept
    expect(me.socketId).toBeUndefined();
    expect(me.telegramId).toBeUndefined();
  });
});

describe('audit #11 — RateLimiter', () => {
  it('allows up to max within the window, then blocks; keys are independent', () => {
    const rl = new RateLimiter(2, 10_000);
    expect(rl.take('a')).toBe(true);
    expect(rl.take('a')).toBe(true);
    expect(rl.take('a')).toBe(false);
    expect(rl.take('b')).toBe(true); // different key unaffected
  });

  it('resets after the window elapses', () => {
    const rl = new RateLimiter(1, 20);
    expect(rl.take('a')).toBe(true);
    expect(rl.take('a')).toBe(false);
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(rl.take('a')).toBe(true);
        resolve();
      }, 30);
    });
  });
});
