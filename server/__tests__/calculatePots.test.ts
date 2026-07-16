import { describe, it, expect } from 'vitest';
import Game from '../Game.js';
import type { Player, Pot } from '../../types/index.js';

function mkPlayer(seat: number, id: string, over: Partial<Player> = {}): Player {
  return {
    id, seat, hand: ['Ts', 'Td'], chips: 1000, bet: 0, totalBet: 0,
    folded: false, allIn: false, acted: false, showCards: false,
    owesBlind: false, sittingOut: false, isBot: false, ...over,
  };
}

/** Build a Game with the given seats wired in (bypasses the public seat flow). */
function gameWithSeats(seats: (Player | null)[], dealerPosition = 0): Game {
  const g = new Game('t');
  (g as any).seats = seats;
  (g as any).dealerPosition = dealerPosition;
  return g;
}

const calc = (g: Game): Pot[] => (g as any).calculatePots();
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const totalContributed = (seats: (Player | null)[]) =>
  sum(seats.map(p => (p ? p.totalBet : 0)));

describe('calculatePots — no phantom side pots', () => {
  it('a folded blind (short dead contribution) does NOT create a side pot', () => {
    // Repro of session hand 13d432c7: -2 folds for 10, two players go 120 each.
    const seats = [
      mkPlayer(0, 'A', { totalBet: 120 }),
      mkPlayer(1, 'B', { totalBet: 120 }),
      mkPlayer(2, 'C', { totalBet: 10, folded: true }),
      null, null, null,
    ];
    const pots = calc(gameWithSeats(seats));

    expect(pots).toHaveLength(1);
    expect(pots[0].name).toBe('Main Pot');
    expect(pots[0].amount).toBe(250);
    expect([...pots[0].eligiblePlayers].sort()).toEqual(['A', 'B']);
    expect(sum(pots.map(p => p.amount))).toBe(totalContributed(seats));
  });

  it('win-by-fold with unequal dead money collapses to a single pot', () => {
    // Repro of session hand b7c29f0a: one live player, the other folded for less.
    const seats = [
      mkPlayer(0, 'A', { totalBet: 50 }),
      mkPlayer(1, 'B', { totalBet: 20, folded: true }),
      null, null, null, null,
    ];
    const pots = calc(gameWithSeats(seats));

    expect(pots).toHaveLength(1);
    expect(pots[0].amount).toBe(70);
    expect(pots[0].eligiblePlayers).toEqual(['A']);
  });

  it('an uncalled all-in stays a single pot for the lone caller-beater', () => {
    // Repro of session hand 07f09a59: shove 445, only 20 called then folded.
    const seats = [
      mkPlayer(0, 'A', { totalBet: 445 }),
      mkPlayer(1, 'B', { totalBet: 20, folded: true }),
      null, null, null, null,
    ];
    const pots = calc(gameWithSeats(seats));

    expect(pots).toHaveLength(1);
    expect(pots[0].amount).toBe(465);
    expect(pots[0].eligiblePlayers).toEqual(['A']);
  });
});

describe('calculatePots — genuine side pots still split', () => {
  it('a real short all-in produces a main pot + side pot with different eligibility', () => {
    // A all-in for 50; B and C continue to 200. Side pot is B vs C only.
    const seats = [
      mkPlayer(0, 'A', { totalBet: 50, allIn: true }),
      mkPlayer(1, 'B', { totalBet: 200 }),
      mkPlayer(2, 'C', { totalBet: 200 }),
      null, null, null,
    ];
    const pots = calc(gameWithSeats(seats));

    expect(pots).toHaveLength(2);
    expect(pots[0].name).toBe('Main Pot');
    expect(pots[0].amount).toBe(150); // 50 * 3
    expect([...pots[0].eligiblePlayers].sort()).toEqual(['A', 'B', 'C']);

    expect(pots[1].name).toBe('Side Pot 1');
    expect(pots[1].amount).toBe(300); // 150 * 2
    expect([...pots[1].eligiblePlayers].sort()).toEqual(['B', 'C']);

    expect(sum(pots.map(p => p.amount))).toBe(totalContributed(seats));
  });
});

describe('showdown — odd chip is not lost', () => {
  it('awards the remainder to the player nearest left of the dealer', () => {
    // Board is a royal flush in hearts → both live players tie playing the board.
    // Pot = 25 + 25 + 5(folded) = 55, split 2 ways → 27 each + 1 odd chip.
    const seats = [
      null,
      mkPlayer(1, 'A', { totalBet: 25, chips: 0, hand: ['2s', '3s'] }),
      mkPlayer(2, 'B', { totalBet: 25, chips: 0, hand: ['2d', '3d'] }),
      mkPlayer(3, 'C', { totalBet: 5, folded: true, chips: 0, hand: ['4c', '5c'] }),
      null, null,
    ];
    const g = gameWithSeats(seats, /* dealerPosition */ 0);
    (g as any).communityCards = ['Ah', 'Kh', 'Qh', 'Jh', 'Th'];

    (g as any).showdown();

    // seatOrderFromDealer: A(seat1)=0, B(seat2)=1 → A is first left of the button.
    expect(seats[1]!.chips).toBe(28);
    expect(seats[2]!.chips).toBe(27);
    expect(seats[1]!.chips + seats[2]!.chips).toBe(55);
  });
});
