import { describe, it, expect } from 'vitest';
import { preflopStrength, postflopStrength, evaluateStrength } from '../bot/handStrength.js';

describe('preflopStrength', () => {
  it('rates big pairs and AK/AQ as premium', () => {
    expect(preflopStrength(['As', 'Ah'])).toBe('premium'); // AA
    expect(preflopStrength(['Js', 'Jd'])).toBe('premium'); // JJ
    expect(preflopStrength(['Ah', 'Kd'])).toBe('premium'); // AKo
    expect(preflopStrength(['As', 'Qs'])).toBe('premium'); // AQs
  });

  it('rates medium pairs, AJ, KQ as strong', () => {
    expect(preflopStrength(['Ts', 'Td'])).toBe('strong'); // TT
    expect(preflopStrength(['8h', '8c'])).toBe('strong');  // 88
    expect(preflopStrength(['Ah', 'Jd'])).toBe('strong');  // AJo
    expect(preflopStrength(['Kh', 'Qd'])).toBe('strong');  // KQo
  });

  it('rates small pairs, broadway, suited Ax, suited connectors as medium', () => {
    expect(preflopStrength(['2s', '2d'])).toBe('medium');  // 22
    expect(preflopStrength(['Qh', 'Jd'])).toBe('medium');  // QJo
    expect(preflopStrength(['As', '5s'])).toBe('medium');  // A5s
    expect(preflopStrength(['8s', '7s'])).toBe('medium');  // 87s
  });

  it('rates junk as weak', () => {
    expect(preflopStrength(['7h', '2d'])).toBe('weak');    // 72o
    expect(preflopStrength(['Ah', '4d'])).toBe('weak');    // A4o (offsuit low Ax)
    expect(preflopStrength(['9h', '4c'])).toBe('weak');
  });
});

describe('postflopStrength', () => {
  const board = ['Qc', 'Jd', '4h'];
  it('rates a full house+ as premium', () => {
    expect(postflopStrength(['Qs', 'Jh'], ['Qc', 'Jd', 'Qh'])).toBe('premium'); // QQQ + JJ = full house
  });
  it('rates trips/two pair/flush as strong', () => {
    expect(postflopStrength(['Qs', 'Qh'], board)).toBe('strong');            // set of queens (trips)
    expect(postflopStrength(['Qh', 'Jh'], board)).toBe('strong');            // two pair Q+J
    expect(postflopStrength(['Ah', 'Th'], ['Kh', 'Qh', '2h'])).toBe('strong'); // flush
  });
  it('rates a single pair as medium', () => {
    expect(postflopStrength(['Qh', '7d'], board)).toBe('medium'); // pair of queens
  });
  it('rates no-made-hand as weak', () => {
    expect(postflopStrength(['9h', '7d'], board)).toBe('weak'); // 9-high, no pair
  });
});

describe('evaluateStrength', () => {
  it('uses preflop logic with no community cards', () => {
    expect(evaluateStrength(['As', 'Ah'], [])).toBe('premium');
  });
  it('uses postflop logic once the flop is out', () => {
    expect(evaluateStrength(['Qh', '7d'], ['Qc', 'Jd', '4h'])).toBe('medium');
  });
});
