import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BotDriver, type TableLike } from '../bot/BotDriver.js';
import type { GameState, Player } from '../../types/index.js';

function mkPlayer(seat: number, id: string, isBot: boolean, over: Partial<Player> = {}): Player {
  return {
    id, seat, hand: ['Ts', 'Td'], chips: 1000, bet: 0, totalBet: 0,
    folded: false, allIn: false, acted: false, showCards: false,
    owesBlind: false, sittingOut: false, isBot, ...over,
  };
}

function mkState(seats: (Player | null)[], currentPlayer: number | null, over: Partial<GameState> = {}): GameState {
  return {
    seats, spectators: [], communityCards: [], pots: [], totalPot: 100,
    currentBet: 40, currentPlayer, dealerPosition: 0, smallBlind: 10, bigBlind: 20,
    stage: 'preflop', turnExpiresAt: null, nextHandIn: null, lastRoundBets: [], ...over,
  };
}

class FakeTable implements TableLike {
  state: GameState;
  calls: { method: string; id: string; amount?: number }[] = [];
  /** optional: seat the turn moves to after an action (default null = hand stalls) */
  private nextSeatAfterAction: (cur: number) => number | null;

  constructor(state: GameState, nextSeatAfterAction: (cur: number) => number | null = () => null) {
    this.state = state;
    this.nextSeatAfterAction = nextSeatAfterAction;
  }
  getState() { return this.state; }
  fold(id: string) { return this.record('fold', id); }
  check(id: string) { return this.record('check', id); }
  call(id: string) { return this.record('call', id); }
  raise(id: string, amount: number) { return this.record('raise', id, amount); }
  allIn(id: string) { return this.record('allIn', id); }

  private record(method: string, id: string, amount?: number): boolean {
    this.calls.push({ method, id, amount });
    const cur = this.state.currentPlayer ?? -1;
    this.state = { ...this.state, currentPlayer: this.nextSeatAfterAction(cur) };
    return true;
  }
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const mkDriver = (table: FakeTable, onActed = vi.fn()) =>
  new BotDriver({
    getTable: () => table,
    onActed,
    minDelayMs: 1000,
    maxDelayMs: 1000,
    rng: () => 0,
  });

describe('BotDriver', () => {
  it('schedules and fires a bot action after the delay, then settles', () => {
    const bot = mkPlayer(0, 'bot1', true);   // TT, facing a bet of 40 -> strong -> call
    const human = mkPlayer(1, 'h1', false);
    const table = new FakeTable(mkState([bot, human], 0));
    const onActed = vi.fn();
    const driver = mkDriver(table, onActed);

    driver.notifyStateChanged('t');
    expect(table.calls).toHaveLength(0); // not yet — waiting out the delay

    vi.advanceTimersByTime(1000);
    expect(table.calls).toEqual([{ method: 'call', id: 'bot1', amount: undefined }]);
    expect(onActed).toHaveBeenCalledWith('t');
  });

  it('does not double-schedule the same turn across repeated notifications', () => {
    const table = new FakeTable(mkState([mkPlayer(0, 'bot1', true), mkPlayer(1, 'h1', false)], 0));
    const driver = mkDriver(table);

    driver.notifyStateChanged('t');
    driver.notifyStateChanged('t');
    driver.notifyStateChanged('t');

    vi.advanceTimersByTime(1000);
    expect(table.calls).toHaveLength(1);
  });

  it('skips acting when the turn has moved on before the timer fires', () => {
    const table = new FakeTable(mkState([mkPlayer(0, 'bot1', true), mkPlayer(1, 'h1', false)], 0));
    const onActed = vi.fn();
    const driver = mkDriver(table, onActed);

    driver.notifyStateChanged('t');
    // Turn auto-advances to the human (e.g. the 30s timer auto-folded the bot elsewhere).
    table.state = { ...table.state, currentPlayer: 1 };

    vi.advanceTimersByTime(1000);
    expect(table.calls).toHaveLength(0);
    expect(onActed).toHaveBeenCalledWith('t'); // still broadcasts
  });

  it('never schedules on a human turn', () => {
    const table = new FakeTable(mkState([mkPlayer(0, 'h1', false), mkPlayer(1, 'bot1', true)], 0));
    const driver = mkDriver(table);

    driver.notifyStateChanged('t');
    vi.advanceTimersByTime(5000);
    expect(table.calls).toHaveLength(0);
  });

  it('chains bot-to-bot via onActed re-entering notifyStateChanged', () => {
    // seat 0 -> seat 1 -> null
    const table = new FakeTable(
      mkState([mkPlayer(0, 'bot0', true), mkPlayer(1, 'bot1', true)], 0),
      (cur) => (cur === 0 ? 1 : null),
    );
    const driver = new BotDriver({
      getTable: () => table,
      onActed: () => driver.notifyStateChanged('t'),
      minDelayMs: 1000,
      maxDelayMs: 1000,
      rng: () => 0,
    });

    driver.notifyStateChanged('t');
    vi.advanceTimersByTime(1000); // bot0 acts -> onActed -> schedules bot1
    expect(table.calls).toHaveLength(1);
    vi.advanceTimersByTime(1000); // bot1 acts
    expect(table.calls).toHaveLength(2);
    expect(table.calls.map((c) => c.id)).toEqual(['bot0', 'bot1']);
  });
});
