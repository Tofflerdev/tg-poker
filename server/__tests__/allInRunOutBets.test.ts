import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Game from '../Game.js';
import type { Player } from '../../types/index.js';

function mkPlayer(seat: number, id: string, hand: string[], over: Partial<Player> = {}): Player {
  return {
    id, seat, hand, chips: 0, bet: 0, totalBet: 0,
    folded: false, allIn: false, acted: true, showCards: false,
    owesBlind: false, sittingOut: false, isBot: false, ...over,
  };
}

/** Колода с предсказуемым порядком — чтобы борд не пересекался с картами игроков. */
function stubDeck(cards: string[]) {
  const rest = [...cards];
  return { deal: (n: number) => rest.splice(0, n) };
}

/**
 * Клиент (BetChipsDisplay) запускает анимацию сбора фишек на каждой смене
 * стадии, у которой lastRoundBets непустые. Раннаут при all-in прокручивает
 * до четырёх стадий подряд на один-единственный раунд торговли, поэтому
 * ставки должны «доехать» ровно до первой смены стадии.
 */
describe('all-in run-out: lastRoundBets survive only the first stage change', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const RUNOUT = ['2c', '3c', '4d', '5h', '9s'];

  /** Двое в all-in на указанной стадии; возвращает снимки состояния по каждому notify. */
  async function runOut(stage: 'preflop' | 'flop' | 'turn' | 'river', boardSoFar: number) {
    const g = new Game('t');
    (g as any).seats = [
      mkPlayer(0, 'A', ['As', 'Kd'], { allIn: true, bet: 300, totalBet: 300 }),
      mkPlayer(1, 'B', ['Qh', 'Jc'], { allIn: true, bet: 300, totalBet: 300 }),
      null, null, null, null,
    ];
    (g as any).stage = stage;
    (g as any).communityCards = RUNOUT.slice(0, boardSoFar);
    (g as any).deck = stubDeck(RUNOUT.slice(boardSoFar));

    const snapshots: { stage: string; bets: number[] }[] = [];
    g.setOnStateChange(() => {
      const s = g.getState();
      snapshots.push({ stage: s.stage, bets: [...s.lastRoundBets] });
    });

    (g as any).nextStage();
    await vi.advanceTimersByTimeAsync(10000);
    return snapshots;
  }

  it('preflop all-in: только переход на флоп несёт ставки', async () => {
    const snapshots = await runOut('preflop', 0);

    expect(snapshots.map(s => s.stage)).toEqual(['flop', 'turn', 'river', 'showdown']);
    expect(snapshots[0].bets).toEqual([300, 300, 0, 0, 0, 0]);
    for (const later of snapshots.slice(1)) {
      expect(later.bets).toEqual([0, 0, 0, 0, 0, 0]);
    }
  });

  it('flop all-in: только переход на тёрн несёт ставки', async () => {
    const snapshots = await runOut('flop', 3);

    expect(snapshots.map(s => s.stage)).toEqual(['turn', 'river', 'showdown']);
    expect(snapshots[0].bets).toEqual([300, 300, 0, 0, 0, 0]);
    for (const later of snapshots.slice(1)) {
      expect(later.bets).toEqual([0, 0, 0, 0, 0, 0]);
    }
  });

  it('river all-in: единственный переход (на шоудаун) несёт ставки', async () => {
    const snapshots = await runOut('river', 5);

    expect(snapshots.map(s => s.stage)).toEqual(['showdown']);
    expect(snapshots[0].bets).toEqual([300, 300, 0, 0, 0, 0]);
  });
});
