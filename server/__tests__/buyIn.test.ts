import { describe, it, expect } from 'vitest';
import { clampBuyIn, PREDEFINED_TABLES } from '../config/tables.js';

// Beginner range: 400–1000 chips (40–100BB at BB=10).
const BEGINNER = { minBuyIn: 400, maxBuyIn: 1000 };

describe('clampBuyIn (crypto-payments-rake phase 3)', () => {
  it('returns the requested amount when within range', () => {
    expect(clampBuyIn(700, BEGINNER)).toBe(700);
  });

  it('clamps below-min requests up to minBuyIn', () => {
    expect(clampBuyIn(100, BEGINNER)).toBe(400);
    expect(clampBuyIn(0, BEGINNER)).toBe(400);
    expect(clampBuyIn(-50, BEGINNER)).toBe(400);
  });

  it('clamps above-max requests down to maxBuyIn', () => {
    expect(clampBuyIn(5000, BEGINNER)).toBe(1000);
  });

  it('defaults to maxBuyIn when the amount is missing or non-integer', () => {
    expect(clampBuyIn(undefined, BEGINNER)).toBe(1000);
    expect(clampBuyIn(NaN, BEGINNER)).toBe(1000);
    expect(clampBuyIn(700.5, BEGINNER)).toBe(1000);
  });

  it('honours the exact range boundaries', () => {
    expect(clampBuyIn(400, BEGINNER)).toBe(400);
    expect(clampBuyIn(1000, BEGINNER)).toBe(1000);
  });
});

describe('predefined table lineup (phase 3)', () => {
  it('every table has a valid 40–100BB buy-in range', () => {
    for (const t of PREDEFINED_TABLES) {
      const { minBuyIn, maxBuyIn, bigBlind } = t.config;
      expect(minBuyIn).toBeLessThan(maxBuyIn);
      // 40BB floor, 100BB ceiling (exact, since the lineup is defined that way).
      expect(minBuyIn).toBe(40 * bigBlind);
      expect(maxBuyIn).toBe(100 * bigBlind);
    }
  });

  it('includes the funnel onboarding table (1/2 blinds, 80–200 buy-in)', () => {
    const funnel = PREDEFINED_TABLES.find((t) => t.id === 'table-funnel-1');
    expect(funnel).toBeDefined();
    expect(funnel!.config.smallBlind).toBe(1);
    expect(funnel!.config.bigBlind).toBe(2);
    expect(funnel!.config.minBuyIn).toBe(80);
    expect(funnel!.config.maxBuyIn).toBe(200);
    expect(funnel!.config.rakeBps).toBe(500);
    expect(funnel!.config.rakeCapBB).toBe(3);
  });
});
