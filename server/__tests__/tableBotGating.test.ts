import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Table } from '../models/Table.js';
import type { TableConfig } from '../../types/index.js';

const CONFIG: TableConfig = {
  smallBlind: 5, bigBlind: 10, maxPlayers: 6, turnTime: 30, minBuyIn: 400, maxBuyIn: 1000, category: 'cash',
};

const seatHuman = (t: Table, seat: number, id: string) =>
  t.addPlayer(id, seat, 500, Number(id), `H${seat}`, undefined, undefined, false);
const seatBot = (t: Table, seat: number, id: string) =>
  t.addPlayer(id, seat, 500, Number(id), `B${seat}`, undefined, undefined, true);

const nonNull = (t: Table) => t.getState().seats.filter((s) => s !== null);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Table bot gating (decision B)', () => {
  it('does NOT start a hand when only bots are seated', () => {
    const t = new Table('t1', 'T', CONFIG);
    seatBot(t, 0, '-1');
    seatBot(t, 1, '-2');

    const state = t.getState();
    expect(state.stage).toBe('waiting');
    expect(state.nextHandIn).toBeNull(); // no hand scheduled
  });

  it('starts a hand once an eligible human is seated with bots', () => {
    const t = new Table('t2', 'T', CONFIG);
    seatBot(t, 0, '-1');
    seatHuman(t, 1, '100');

    expect(t.getState().nextHandIn).not.toBeNull(); // scheduled
    vi.advanceTimersByTime(5000);
    expect(t.getState().stage).toBe('preflop'); // dealt
  });

  it('allows bot-only play when botsContinue is enabled', () => {
    const t = new Table('t3', 'T', CONFIG);
    seatBot(t, 0, '-1');
    seatBot(t, 1, '-2');
    expect(t.getState().nextHandIn).toBeNull();

    t.setBotsContinue(true);
    expect(t.getState().nextHandIn).not.toBeNull();
    vi.advanceTimersByTime(5000);
    expect(t.getState().stage).toBe('preflop');
  });
});

describe('Table bot cleanup (decision D)', () => {
  it('removes stranded bots when the last human leaves between hands', () => {
    const t = new Table('t4', 'T', CONFIG);
    seatHuman(t, 0, '100');
    seatBot(t, 1, '-1');
    seatBot(t, 2, '-2');
    // A hand is scheduled but not yet dealt (timer not advanced) — stage is 'waiting'.
    expect(t.getState().stage).toBe('waiting');

    t.removePlayer('100'); // human leaves between hands

    expect(nonNull(t)).toHaveLength(0); // bots cleaned up
    expect(t.getState().stage).toBe('waiting');
  });

  it('defers bot cleanup while a hand is in progress', () => {
    const t = new Table('t5', 'T', CONFIG);
    seatHuman(t, 0, '100');
    seatBot(t, 1, '-1');
    seatBot(t, 2, '-2');
    vi.advanceTimersByTime(5000); // deal the hand
    expect(t.getState().stage).toBe('preflop');

    t.removePlayer('100'); // human leaves mid-hand

    const seated = nonNull(t);
    expect(seated).toHaveLength(2);            // bots NOT removed mid-hand
    expect(seated.every((p) => p!.isBot)).toBe(true);
  });

  it('keeps bots when a human is still seated (sitting out)', () => {
    const t = new Table('t6', 'T', CONFIG);
    seatHuman(t, 0, '100');
    seatBot(t, 1, '-1');
    t.sitOut('100'); // human present but not eligible

    // Between hands, no eligible human → no new hand, but bots stay (human seated).
    t.scheduleNextHand();
    expect(nonNull(t).length).toBe(2);
    expect(t.getState().nextHandIn).toBeNull();
  });
});
