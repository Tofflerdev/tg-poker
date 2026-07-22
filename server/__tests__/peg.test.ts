import { describe, it, expect } from 'vitest';
import {
  usdtToCents,
  usdtToChips,
  chipsToUsdt,
  MIN_DEPOSIT_CHIPS,
  MIN_WITHDRAWAL_CHIPS,
} from '../payments/peg.js';

describe('peg — usdtToCents (floor to cents, no float)', () => {
  it('parses whole dollars', () => {
    expect(usdtToCents('5')).toBe(500);
    expect(usdtToCents('0')).toBe(0);
    expect(usdtToCents('123')).toBe(12300);
  });

  it('parses two-decimal amounts exactly', () => {
    expect(usdtToCents('5.00')).toBe(500);
    expect(usdtToCents('12.50')).toBe(1250);
    expect(usdtToCents('0.07')).toBe(7);
    expect(usdtToCents('0.7')).toBe(70); // single decimal = tenths
  });

  it('floors anything beyond two decimals (never over-credits)', () => {
    expect(usdtToCents('5.129')).toBe(512);
    expect(usdtToCents('5.019')).toBe(501);
    expect(usdtToCents('0.009')).toBe(0); // sub-cent dust floored away
    expect(usdtToCents('9.999999')).toBe(999);
  });

  it('accepts a number input losslessly for 2-decimal values', () => {
    expect(usdtToCents(5)).toBe(500);
    expect(usdtToCents(12.5)).toBe(1250);
  });

  it('handles negative amounts (e.g. a fee)', () => {
    expect(usdtToCents('-0.05')).toBe(-5);
    expect(usdtToCents('-1.239')).toBe(-123);
  });

  it('is robust to empty / malformed input', () => {
    expect(usdtToCents('')).toBe(0);
    expect(usdtToCents('-')).toBe(0);
    expect(usdtToCents('.5')).toBe(50);
  });

  it('usdtToChips is an alias (chips == cents under the peg)', () => {
    expect(usdtToChips('7.77')).toBe(777);
  });
});

describe('peg — chipsToUsdt (integer arithmetic, 2 decimals)', () => {
  it('formats chip amounts as decimal USDT', () => {
    expect(chipsToUsdt(500)).toBe('5.00');
    expect(chipsToUsdt(1250)).toBe('12.50');
    expect(chipsToUsdt(7)).toBe('0.07');
    expect(chipsToUsdt(0)).toBe('0.00');
    expect(chipsToUsdt(100)).toBe('1.00');
  });

  it('formats negatives', () => {
    expect(chipsToUsdt(-5)).toBe('-0.05');
  });
});

describe('peg — round-trip', () => {
  it('chips → usdt → chips is identity for exact-cent amounts', () => {
    for (const chips of [500, 501, 999, 1250, 20000, 1]) {
      expect(usdtToChips(chipsToUsdt(chips))).toBe(chips);
    }
  });
});

describe('peg — thresholds', () => {
  it('min deposit is $5, min withdrawal is $10', () => {
    expect(MIN_DEPOSIT_CHIPS).toBe(500);
    expect(MIN_WITHDRAWAL_CHIPS).toBe(1000);
  });
});
