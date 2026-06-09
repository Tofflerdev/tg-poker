import { describe, it, expect } from 'vitest';
import { parseSession } from '../bot/oracle.js';
import { computeStats, isBotId } from '../bot/sessionStats.js';
import { buildReportMarkdown } from '../bot/reportBuilder.js';
import type { HandCompleteEvent } from '../../types/index.js';

const board = ['Ah', 'Kd', 'Qc', '7s', '2d'];

// h1 (human) beats -1 (bot); one 200 pot, no all-in.
const hand1: HandCompleteEvent = {
  handId: 'A', tableId: 't', completedAt: new Date(), board,
  perPlayer: [
    { telegramId: 'h1', seat: 0, holeCards: ['As', 'Ad'], finalChips: 1100, netDelta: 100, won: true, showedDown: true, contributed: 100 },
    { telegramId: '-1', seat: 1, holeCards: ['Ks', 'Kh'], finalChips: 900, netDelta: -100, won: false, showedDown: true, contributed: 100 },
  ],
  pots: [{ amount: 200, eligiblePlayers: ['h1', '-1'], name: 'Main Pot' }],
};

// h1 stacks -1 all-in to 0.
const hand2: HandCompleteEvent = {
  handId: 'B', tableId: 't', completedAt: new Date(), board,
  perPlayer: [
    { telegramId: 'h1', seat: 0, holeCards: ['As', 'Ad'], finalChips: 1200, netDelta: 200, won: true, showedDown: true, contributed: 200 },
    { telegramId: '-1', seat: 1, holeCards: ['Ks', 'Kh'], finalChips: 0, netDelta: -200, won: false, showedDown: true, contributed: 200 },
  ],
  pots: [{ amount: 400, eligiblePlayers: ['h1', '-1'], name: 'Main Pot' }],
};

const session = [
  JSON.stringify({ ts: 1000, kind: 'action', e: { tableId: 't', telegramId: 'h1', seat: 0, action: 'raise', amount: 40, totalBetThisStreet: 40, potAfter: 70 } }),
  JSON.stringify({ ts: 1000, kind: 'action', e: { tableId: 't', telegramId: '-1', seat: 1, action: 'call', amount: 40, totalBetThisStreet: 40, potAfter: 110 } }),
  JSON.stringify({ ts: 2000, kind: 'hand', e: hand1 }),
  JSON.stringify({ ts: 5000, kind: 'hand', e: hand2 }),
].join('\n');

describe('isBotId', () => {
  it('treats negative telegramIds as bots', () => {
    expect(isBotId('-1')).toBe(true);
    expect(isBotId('100')).toBe(false);
  });
});

describe('computeStats', () => {
  const stats = computeStats(parseSession(session));

  it('counts hands, showdowns and all-ins', () => {
    expect(stats.handsTotal).toBe(2);
    expect(stats.showdownHands).toBe(2);
    expect(stats.winByFoldHands).toBe(0);
    expect(stats.sidePotHands).toBe(0);
    expect(stats.allInHands).toBe(1); // hand2: -1 busts to 0
  });

  it('aggregates pots and actions', () => {
    expect(stats.avgPot).toBe(300);
    expect(stats.biggestPot).toBe(400);
    expect(stats.actionCounts.raise).toBe(1);
    expect(stats.actionCounts.call).toBe(1);
  });

  it('builds per-player aggregates with bot/human split', () => {
    expect(stats.humans).toBe(1);
    expect(stats.bots).toBe(1);
    const h1 = stats.players.find((p) => p.id === 'h1')!;
    const bot = stats.players.find((p) => p.id === '-1')!;
    expect(h1.net).toBe(300);
    expect(h1.handsWon).toBe(2);
    expect(h1.handsVoluntary).toBe(1); // only hand1 had a recorded voluntary action
    expect(bot.net).toBe(-300);
    expect(bot.allIns).toBe(1);
  });

  it('computes duration from ts bounds', () => {
    expect(stats.durationMs).toBe(4000);
  });
});

describe('buildReportMarkdown', () => {
  it('renders the clean-session scaffold with all three sections', () => {
    const parsed = parseSession(session);
    const stats = computeStats(parsed);
    const md = buildReportMarkdown({ file: 's.jsonl', handsChecked: 2, findings: [], stats, generatedAt: new Date('2026-06-09T00:00:00Z') });

    expect(md).toContain('# Playtest Session Report');
    expect(md).toContain('1 human / 1 bot');
    expect(md).toContain('No invariant violations');
    expect(md).toContain('## 2. Balance / gameplay');
    expect(md).toContain('| Player | Type | Hands | VPIP | Won | Net | All-ins |');
    expect(md).toContain('Reviewer notes (Claude)');
  });

  it('surfaces oracle findings under Rules correctness', () => {
    const stats = computeStats(parseSession(session));
    const md = buildReportMarkdown({
      file: 's.jsonl', handsChecked: 2, stats,
      findings: [{ handId: 'B', tableId: 't', check: 'chipConservation', message: 'Σ netDelta = 50 (expected 0)' }],
    });
    expect(md).toContain('⚠️ 1 finding');
    expect(md).toContain('### chipConservation');
    expect(md).toContain('Σ netDelta = 50');
  });
});
