import { describe, it, expect } from 'vitest';
import { computeRake, type RakeParams } from '../rake.js';

// Beginner-table structure by default: 5% rake, 4BB cap, BB=10 → cap = 40 chips.
const BEGINNER: RakeParams = { rakeBps: 500, rakeCapBB: 4, bigBlind: 10 };

describe('computeRake (crypto-payments-rake phase 2)', () => {
  it('no flop, no drop — a hand that never dealt a flop rakes 0', () => {
    // Preflop fold: BB(10) wins vs SB(5); no community cards.
    const r = computeRake({
      pots: [{ amount: 15 }],
      contributions: [10, 5],
      communityCardCount: 0,
      params: BEGINNER,
    });
    expect(r.total).toBe(0);
    expect(r.perPot).toEqual([0]);
  });

  it('rakes 5% once a flop is seen (floor)', () => {
    // Two players each put 100 in; fully called. Pot 200, flop dealt.
    const r = computeRake({
      pots: [{ amount: 200 }],
      contributions: [100, 100],
      communityCardCount: 3,
      params: BEGINNER,
    });
    // 5% of 200 = 10, under the 40 cap.
    expect(r.total).toBe(10);
    expect(r.perPot).toEqual([10]);
  });

  it('floors sub-threshold pots to 0 rake', () => {
    // Pot 18 → 5% = 0.9 → floor 0.
    const r = computeRake({
      pots: [{ amount: 18 }],
      contributions: [9, 9],
      communityCardCount: 3,
      params: BEGINNER,
    });
    expect(r.total).toBe(0);
  });

  it('does not rake the uncalled bet (postflop overbet returned)', () => {
    // Preflop each put 20 (pot 60 w/ 3 players); on the flop A bets 100 and B, C
    // fold. A's total = 120, others 20. Uncalled = 120 - 20 = 100. Rakeable = 60.
    const r = computeRake({
      pots: [{ amount: 160 }],
      contributions: [120, 20, 20],
      communityCardCount: 3,
      params: BEGINNER,
    });
    // 5% of the contested 60 = 3 (NOT 5% of 160).
    expect(r.total).toBe(3);
  });

  it('applies the cap to the whole hand, not per side pot (multiway all-in)', () => {
    // Three-way all-in for big amounts across a main pot + two side pots.
    // High Stakes: BB=200, cap 2.5BB = 500 chips.
    const HS: RakeParams = { rakeBps: 500, rakeCapBB: 2.5, bigBlind: 200 };
    const r = computeRake({
      pots: [{ amount: 3000 }, { amount: 2000 }, { amount: 1000 }],
      contributions: [2000, 2000, 2000], // fully called, no uncalled excess
      communityCardCount: 5,
      params: HS,
    });
    // 5% of 6000 = 300, under the 500 cap → single cap, not 3× per pot.
    expect(r.total).toBe(300);
    // Distributed proportional to pot size: 150 / 100 / 50.
    expect(r.perPot).toEqual([150, 100, 50]);
    expect(r.perPot.reduce((s, x) => s + x, 0)).toBe(300);
  });

  it('caps rake when 5% exceeds the BB cap', () => {
    // Pot 2000, cap 40 (Beginner). 5% = 100 → clamped to 40.
    const r = computeRake({
      pots: [{ amount: 2000 }],
      contributions: [1000, 1000],
      communityCardCount: 5,
      params: BEGINNER,
    });
    expect(r.total).toBe(40);
    expect(r.perPot).toEqual([40]);
  });

  it('puts the rounding remainder on the main pot and never exceeds a pot', () => {
    // Force a proportional split with a remainder. rakeBps 1000 (10%) for clarity.
    // Equal top contributions ⇒ no uncalled bet, so rakeable = totalPot = 137.
    // 10% = 13. Proportional: floor(13*100/137)=9, floor(13*30/137)=2,
    // floor(13*7/137)=0 → assigned 11, remainder 2 → main pot ⇒ perPot[0]=11.
    const r = computeRake({
      pots: [{ amount: 100 }, { amount: 30 }, { amount: 7 }],
      contributions: [100, 100],
      communityCardCount: 5,
      params: { rakeBps: 1000, rakeCapBB: 0, bigBlind: 10 },
    });
    expect(r.total).toBe(13);
    expect(r.perPot[0]).toBe(11);
    expect(r.perPot.reduce((s, x) => s + x, 0)).toBe(13);
    // No pot raked beyond its own amount.
    r.perPot.forEach((rk, i) => {
      expect(rk).toBeLessThanOrEqual([100, 30, 7][i]);
    });
  });

  it('single-eligible pot won from folders IS raked (only true uncalled exempt)', () => {
    // A raises 50 preflop, B & C call 50; on the flop everyone checks; turn A bets
    // 50, all call. Nobody folds uncalled. Contributions all 100, pot 300.
    const r = computeRake({
      pots: [{ amount: 300 }],
      contributions: [100, 100, 100],
      communityCardCount: 4,
      params: BEGINNER,
    });
    expect(r.total).toBe(15); // 5% of 300, under cap
  });

  it('returns zero when rakeBps is 0 (rake disabled)', () => {
    const r = computeRake({
      pots: [{ amount: 500 }],
      contributions: [250, 250],
      communityCardCount: 5,
      params: { rakeBps: 0, rakeCapBB: 4, bigBlind: 10 },
    });
    expect(r.total).toBe(0);
  });
});
