import { describe, it, expect } from 'vitest';
import { decideBotAction, type BotContext } from '../bot/decideAction.js';

const base: BotContext = {
  hole: ['7h', '2d'],   // weak by default
  community: [],
  stage: 'preflop',
  toCall: 0,
  currentBet: 0,
  myBet: 0,
  myChips: 1000,
  bigBlind: 20,
  potTotal: 100,
  activeCount: 3,
  rng: () => 0.99,      // suppress optional raises unless a test overrides
};

const ctx = (over: Partial<BotContext>): BotContext => ({ ...base, ...over });

describe('decideBotAction — when checking is free (toCall = 0)', () => {
  it('checks weak/medium hands', () => {
    expect(decideBotAction(ctx({ hole: ['7h', '2d'] })).kind).toBe('check');
    expect(decideBotAction(ctx({ hole: ['2s', '2d'] })).kind).toBe('check'); // medium
  });

  it('value-bets premium hands part of the time', () => {
    const d = decideBotAction(ctx({ hole: ['As', 'Ah'], rng: () => 0.1 }));
    expect(d.kind).toBe('raise');
    expect(d.amount).toBe(50); // max(BB=20, floor(pot 100 * 0.5)=50)
  });

  it('still checks premium hands the rest of the time (passive)', () => {
    expect(decideBotAction(ctx({ hole: ['As', 'Ah'], rng: () => 0.9 })).kind).toBe('check');
  });

  it('shoves instead of betting when a min-bet would commit the stack', () => {
    const d = decideBotAction(ctx({ hole: ['As', 'Ah'], myChips: 30, rng: () => 0.1 }));
    expect(d.kind).toBe('allIn');
  });
});

describe('decideBotAction — facing a bet (toCall > 0)', () => {
  it('folds weak hands', () => {
    expect(decideBotAction(ctx({ hole: ['7h', '2d'], toCall: 20, currentBet: 20 })).kind).toBe('fold');
  });

  it('calls strong hands passively', () => {
    expect(decideBotAction(ctx({ hole: ['Ts', 'Td'], toCall: 40, currentBet: 40 })).kind).toBe('call');
  });

  it('calls premium hands but raises some of the time', () => {
    expect(decideBotAction(ctx({ hole: ['As', 'Ah'], toCall: 20, currentBet: 20, rng: () => 0.9 })).kind).toBe('call');
    const raised = decideBotAction(ctx({ hole: ['As', 'Ah'], toCall: 20, currentBet: 20, rng: () => 0.1 }));
    expect(raised.kind).toBe('raise');
    expect(raised.amount).toBe(60); // max(BB=20, floor((pot 100 + toCall 20) * 0.5)=60)
  });

  it('calls medium hands only when cheap', () => {
    expect(decideBotAction(ctx({ hole: ['2s', '2d'], toCall: 20, currentBet: 20 })).kind).toBe('call'); // <= 3*BB
    expect(decideBotAction(ctx({ hole: ['2s', '2d'], toCall: 200, currentBet: 200 })).kind).toBe('fold'); // too expensive
  });
});
