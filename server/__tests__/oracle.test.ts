import { describe, it, expect } from 'vitest';
import { checkHand, parseSession, runOracle } from '../bot/oracle.js';
import type { HandCompleteEvent, HandCompletePerPlayer, Pot } from '../../types/index.js';

const pp = (over: Partial<HandCompletePerPlayer> & { telegramId: string }): HandCompletePerPlayer => ({
  seat: 0, holeCards: [], finalChips: 1000, netDelta: 0, won: false, showedDown: true, contributed: 0, ...over,
});

// Heads-up showdown: h1 (trips aces) beats -1 (trips kings). 100 each into one pot.
const cleanHand = (): HandCompleteEvent => ({
  handId: 'A', tableId: 't', completedAt: new Date(), board: ['Ah', 'Kd', 'Qc', '7s', '2d'],
  perPlayer: [
    pp({ telegramId: 'h1', seat: 0, holeCards: ['As', 'Ad'], finalChips: 1100, netDelta: 100, won: true, contributed: 100 }),
    pp({ telegramId: '-1', seat: 1, holeCards: ['Ks', 'Kh'], finalChips: 900, netDelta: -100, won: false, contributed: 100 }),
  ],
  pots: [{ amount: 200, eligiblePlayers: ['h1', '-1'], name: 'Main Pot' }],
});

// 3-way side pot: A all-in 50 (AA, wins main), B 100 (KK, wins side), C 100 (QQ, loses).
const sidePotHand = (): HandCompleteEvent => ({
  handId: 'B', tableId: 't', completedAt: new Date(), board: ['2c', '5d', '9h', 'Js', '3s'],
  perPlayer: [
    pp({ telegramId: 'A', seat: 0, holeCards: ['Ac', 'As'], finalChips: 150, netDelta: 100, won: true, contributed: 50 }),
    pp({ telegramId: 'B', seat: 1, holeCards: ['Kc', 'Ks'], finalChips: 1000, netDelta: 0, won: true, contributed: 100 }),
    pp({ telegramId: 'C', seat: 2, holeCards: ['Qc', 'Qs'], finalChips: 900, netDelta: -100, won: false, contributed: 100 }),
  ],
  pots: [
    { amount: 150, eligiblePlayers: ['A', 'B', 'C'], name: 'Main Pot' },
    { amount: 100, eligiblePlayers: ['B', 'C'], name: 'Side Pot 1' },
  ],
});

describe('checkHand — clean hands produce no findings', () => {
  it('passes a clean heads-up showdown', () => {
    expect(checkHand(cleanHand())).toEqual([]);
  });
  it('passes a correct 3-way side pot', () => {
    expect(checkHand(sidePotHand())).toEqual([]);
  });
});

describe('checkHand — invariant violations', () => {
  it('flags chip conservation when netDelta does not sum to zero', () => {
    const h = cleanHand();
    h.perPlayer[0].netDelta = 150; // created 50 chips
    const checks = checkHand(h).map((f) => f.check);
    expect(checks).toContain('chipConservation');
  });

  it('flags pots accounting when pot sum != contributed', () => {
    const h = cleanHand();
    h.pots![0].amount = 250; // pot bigger than the 200 contributed
    const checks = checkHand(h).map((f) => f.check);
    expect(checks).toContain('potsAccounting');
  });

  it('flags a wrong winner', () => {
    const h = cleanHand();
    h.perPlayer[0].won = false; // real winner unmarked
    h.perPlayer[1].won = true;  // wrong player marked
    const f = checkHand(h);
    expect(f.map((x) => x.check)).toContain('winnerRecompute');
  });

  it('flags a folded/non-showdown player listed as eligible', () => {
    const h = cleanHand();
    h.perPlayer.push(pp({ telegramId: 'gh', seat: 2, holeCards: ['3c', '4c'], showedDown: false, won: false, contributed: 0 }));
    h.pots![0].eligiblePlayers.push('gh');
    const checks = checkHand(h).map((f) => f.check);
    expect(checks).toContain('eligibility');
  });

  it('flags a phantom eligible id not present in perPlayer', () => {
    const h = cleanHand();
    h.pots![0].eligiblePlayers.push('ghost');
    const checks = checkHand(h).map((f) => f.check);
    expect(checks).toContain('eligibility');
  });

  it('flags a non-nested side pot', () => {
    const h = sidePotHand();
    h.pots![1].eligiblePlayers = ['B', 'X']; // X not in main pot's eligible set
    const checks = checkHand(h).map((f) => f.check);
    expect(checks).toContain('eligibility');
  });
});

describe('parseSession — grouping', () => {
  it('buffers actions per table and attaches them to the next hand', () => {
    const lines = [
      JSON.stringify({ ts: 1, kind: 'action', e: { tableId: 't', telegramId: 'h1', seat: 0, action: 'raise', amount: 40, totalBetThisStreet: 40, potAfter: 70 } }),
      JSON.stringify({ ts: 2, kind: 'action', e: { tableId: 't', telegramId: '-1', seat: 1, action: 'call', amount: 40, totalBetThisStreet: 40, potAfter: 110 } }),
      JSON.stringify({ ts: 3, kind: 'hand', e: cleanHand() }),
    ].join('\n');
    const { hands } = parseSession(lines);
    expect(hands).toHaveLength(1);
    expect(hands[0].actions).toHaveLength(2);
  });

  it('records a finding for malformed lines but keeps going', () => {
    const lines = ['not json', JSON.stringify({ ts: 1, kind: 'hand', e: cleanHand() })].join('\n');
    const report = runOracle(lines);
    expect(report.handsChecked).toBe(1);
    expect(report.findings.some((f) => f.check === 'parse')).toBe(true);
  });
});

describe('runOracle — clean session', () => {
  it('reports zero findings for a session of clean hands', () => {
    const lines = [
      JSON.stringify({ ts: 1, kind: 'hand', e: cleanHand() }),
      JSON.stringify({ ts: 2, kind: 'hand', e: sidePotHand() }),
    ].join('\n');
    const report = runOracle(lines);
    expect(report.handsChecked).toBe(2);
    expect(report.findings).toEqual([]);
  });
});
