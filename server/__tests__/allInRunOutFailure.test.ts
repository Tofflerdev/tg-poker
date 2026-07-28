import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Game from '../Game.js';
import type { Player, ShowdownResult } from '../../types/index.js';

function mkPlayer(seat: number, id: string, hand: string[], over: Partial<Player> = {}): Player {
  return {
    id, seat, hand, chips: 0, bet: 0, totalBet: 0,
    folded: false, allIn: false, acted: true, showCards: false,
    owesBlind: false, sittingOut: false, isBot: false, ...over,
  };
}

function stubDeck(cards: string[]) {
  const rest = [...cards];
  return { deal: (n: number) => rest.splice(0, n) };
}

/**
 * Раннаут при all-in — единственный кусок движка, живущий между таймерами:
 * вызывающий его не ждёт, поэтому бросок изнутри раньше уходил в unhandled
 * rejection, а стол вставал навсегда (ходить некому, showdown не сработал,
 * следующую раздачу планировать некому).
 */
describe('all-in run-out: failure aborts the hand instead of wedging the table', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const RUNOUT = ['2c', '3c', '4d', '5h', '9s'];

  /** Двое all-in на префлопе по 300 из 1000 стека. */
  function allInPreflop() {
    const g = new Game('t');
    (g as any).seats = [
      mkPlayer(0, 'A', ['As', 'Kd'], { allIn: true, chips: 700, bet: 300, totalBet: 300 }),
      mkPlayer(1, 'B', ['Qh', 'Jc'], { allIn: true, chips: 700, bet: 300, totalBet: 300 }),
      null, null, null, null,
    ];
    (g as any).stage = 'preflop';
    (g as any).communityCards = [];
    (g as any).deck = stubDeck(RUNOUT);
    (g as any).currentHandId = 'hand-1';
    (g as any).handStartChips = [1000, 1000];
    return g;
  }

  it('не роняет процесс unhandled rejection и завершает раздачу', async () => {
    const g = allInPreflop();
    (g as any).showdown = () => { throw new Error('boom'); };

    const showdowns: ShowdownResult[] = [];
    g.setOnShowdown(r => { showdowns.push(r); });

    // Если бы бросок улетал наружу, этот await отклонился бы.
    (g as any).nextStage();
    await vi.advanceTimersByTimeAsync(10000);

    expect(g.getState().stage).toBe('showdown');
    expect(showdowns).toHaveLength(1);
    expect(showdowns[0].winners).toEqual([]);
    expect(g.getState().currentPlayer).toBeNull();
  });

  it('возвращает вклады игрокам, когда до выплат не дошло (банк не сгорает)', async () => {
    const g = allInPreflop();
    (g as any).showdown = () => { throw new Error('boom'); };

    (g as any).nextStage();
    await vi.advanceTimersByTimeAsync(10000);

    const seats = (g as any).seats as (Player | null)[];
    expect(seats[0]!.chips).toBe(1000);
    expect(seats[1]!.chips).toBe(1000);
    expect(seats.every(p => !p || (p.bet === 0 && p.totalBet === 0))).toBe(true);
    expect((g as any).pots).toEqual([]);
    // Аннулированная раздача не должна попасть в историю.
    expect((g as any).currentHandId).toBeNull();
  });

  it('мёртвый вклад возвращается тому, кто ещё за столом', async () => {
    const g = allInPreflop();
    (g as any).deadContributions = [
      { playerId: 'A', amount: 20 },   // долг блайнда — игрок сидит
      { playerId: 'GONE', amount: 50 }, // ушёл посреди раздачи — вернуть некому
    ];
    (g as any).showdown = () => { throw new Error('boom'); };

    (g as any).nextStage();
    await vi.advanceTimersByTimeAsync(10000);

    const seats = (g as any).seats as (Player | null)[];
    expect(seats[0]!.chips).toBe(1020);
    expect(seats[1]!.chips).toBe(1000);
    expect((g as any).deadContributions).toEqual([]);
  });

  it('НЕ трогает стеки, если упало уже после выплат', async () => {
    const g = allInPreflop();
    const real = (g as any).showdown.bind(g);
    (g as any).showdown = () => real();

    // Падаем в рассылке — showdown к этому моменту уже раздал фишки.
    let firstShowdownResult: ShowdownResult | null = null;
    g.setOnShowdown(r => {
      if (!firstShowdownResult) { firstShowdownResult = r; throw new Error('broadcast boom'); }
    });

    (g as any).nextStage();
    await vi.advanceTimersByTimeAsync(10000);

    const seats = (g as any).seats as (Player | null)[];
    // Пот 600 достался одному из двоих — суммарно фишки на месте, повторной
    // раздачи/возврата не произошло.
    expect(seats[0]!.chips + seats[1]!.chips).toBe(2000);
    expect([seats[0]!.chips, seats[1]!.chips].sort((a, b) => a - b)).toEqual([700, 1300]);
    expect(firstShowdownResult).not.toBeNull();
    expect(g.getState().stage).toBe('showdown');
  });

  it('падение при раздаче улицы тоже аннулирует раздачу, а не вешает стол', async () => {
    const g = allInPreflop();
    (g as any).turn = () => { throw new Error('deck boom'); };

    const showdowns: ShowdownResult[] = [];
    g.setOnShowdown(r => { showdowns.push(r); });

    (g as any).nextStage();
    await vi.advanceTimersByTimeAsync(10000);

    const seats = (g as any).seats as (Player | null)[];
    expect(seats[0]!.chips).toBe(1000);
    expect(seats[1]!.chips).toBe(1000);
    expect(g.getState().stage).toBe('showdown');
    expect(showdowns).toHaveLength(1);
  });
});
