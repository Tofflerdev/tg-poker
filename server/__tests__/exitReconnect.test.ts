import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Game from '../Game.js';
import { Table } from '../models/Table.js';
import * as PendingExits from '../PendingExits.js';
import type { HandCompleteEvent, Player, TableConfig } from '../../types/index.js';

/**
 * exit-reconnect fix — see plans/exit-reconnect-fix-plan.md.
 *
 * Covers the three money bugs found by the 2026-07-15 prod playtest:
 *   B1 — joinTable destroyed a held stack instead of resuming (isSeated gate)
 *   B2 — leaving mid-hand refunded the stale pre-hand checkpoint (deferred exit)
 *   B3 — buy-in never wrote currentChips (asserted in UserRepository.atomic.test.ts)
 */

function mkPlayer(seat: number, id: string, over: Partial<Player> = {}): Player {
  return {
    id, seat, hand: ['Ts', 'Td'], chips: 1000, bet: 0, totalBet: 0,
    folded: false, allIn: false, acted: false, showCards: false,
    waitingForBB: false, sittingOut: false, isBot: false, ...over,
  };
}

/** Two seated players mid-hand, `currentPlayer` = seat 0. */
function midHandGame(over0: Partial<Player> = {}, over1: Partial<Player> = {}): Game {
  const g = new Game('t');
  (g as any).seats = [mkPlayer(0, 'A', over0), mkPlayer(1, 'B', over1), null, null, null, null];
  (g as any).stage = 'flop';
  (g as any).currentPlayer = 0;
  (g as any).currentBet = 0;
  (g as any).bigBlind = 20;
  return g;
}

describe('Game.markLeaving (exit-reconnect A)', () => {
  it('holds the seat — the player is NOT removed', () => {
    const g = midHandGame();
    expect(g.markLeaving('A')).toBe(true);
    // Seat still occupied: checkpointSeatedPlayers only checkpoints occupied seats,
    // and that checkpoint is what the refund pays out.
    expect(g.isSeated('A')).toBe(true);
    expect((g as any).seats[0].leaving).toBe(true);
  });

  it('sits the player out so the next hand cannot deal them back in', () => {
    const g = midHandGame();
    g.markLeaving('A');
    // getEligiblePlayers filters !sittingOut — this is what makes the settle-at-
    // boundary path immune to racing the 5 s NEXT_HAND_DELAY.
    expect((g as any).seats[0].sittingOut).toBe(true);
    expect(g.getEligiblePlayers().map((p: Player) => p.id)).not.toContain('A');
  });

  it('returns false for a player who is not seated', () => {
    const g = midHandGame();
    expect(g.markLeaving('nobody')).toBe(false);
  });
});

describe('Game.isInHand / isSeated (exit-reconnect A, E)', () => {
  it('isInHand is true mid-hand with cards and no fold', () => {
    expect(midHandGame().isInHand('A')).toBe(true);
  });

  it('isInHand is false once folded', () => {
    expect(midHandGame({ folded: true }).isInHand('A')).toBe(false);
  });

  it('isInHand is false between hands', () => {
    const g = midHandGame();
    (g as any).stage = 'waiting';
    expect(g.isInHand('A')).toBe(false);
  });

  it('isInHand is TRUE for an all-in player — they still own their pot equity', () => {
    // The old removePlayer force-folded exactly this player (hand.length > 0 &&
    // !folded), handing a pot they were entitled to to their opponents.
    expect(midHandGame({ allIn: true, chips: 0 }).isInHand('A')).toBe(true);
  });

  it('isSeated is false for a non-seated id (busted player kept as spectator)', () => {
    const g = midHandGame();
    expect(g.isSeated('A')).toBe(true);
    expect(g.isSeated('ghost')).toBe(false);
  });
});

describe('turn timeout auto-action (exit-reconnect A)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('auto-CHECKS when checking is free instead of folding away equity', () => {
    const g = midHandGame();
    (g as any).currentBet = 0;
    (g as any).startTurnTimer();
    vi.advanceTimersByTime(31_000);
    expect((g as any).seats[0].folded).toBe(false);
    expect((g as any).seats[0].acted).toBe(true);
  });

  it('auto-FOLDS when facing a bet', () => {
    const g = midHandGame({ bet: 0 }, { bet: 50 });
    (g as any).currentBet = 50;
    (g as any).startTurnTimer();
    vi.advanceTimersByTime(31_000);
    expect((g as any).seats[0].folded).toBe(true);
  });

  it('a leaving player acts immediately instead of stalling the table', () => {
    const g = midHandGame();
    g.markLeaving('A');
    (g as any).startTurnTimer();
    // Not the full turn limit — the player is gone, there is nothing to wait for.
    vi.advanceTimersByTime(0);
    expect((g as any).seats[0].acted).toBe(true);
  });

  it('a merely disconnected (not leaving) player keeps the full turn timer', () => {
    const g = midHandGame();
    (g as any).startTurnTimer();
    vi.advanceTimersByTime(0);
    // Still their turn — they may yet reconnect inside the grace window and act.
    expect((g as any).seats[0].acted).toBe(false);
  });
});

/**
 * B2 end-to-end: drive a REAL hand to completion through Table/Game and assert on the
 * HandCompleteEvent, because that event IS what checkpointSeatedPlayers writes to
 * currentChips — and currentChips is exactly what refundCurrentChips pays out.
 * If the checkpoint says the truth, the refund cannot mint or destroy chips.
 */
describe('deferred exit settles on the true post-hand stack (exit-reconnect B2)', () => {
  const cfg = (over: Partial<TableConfig> = {}): TableConfig => ({
    smallBlind: 5, bigBlind: 10, maxPlayers: 6, turnTime: 20,
    minBuyIn: 400, maxBuyIn: 1000, category: 'cash', ...over,
  });

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Heads-up table with A and B on 1000 each, one hand dealt. */
  function dealtTable(): { t: Table; evt: () => HandCompleteEvent | null } {
    const t = new Table('hu', 'HU', cfg());
    t.addPlayer('A', 0, 1000);
    t.addPlayer('B', 1, 1000);
    let captured: HandCompleteEvent | null = null;
    t.setOnHandComplete((e) => { captured = e; });
    (t.game as any).startNextHand();
    return { t, evt: () => captured };
  }

  it('checkpoints the stack AFTER the bets, not the pre-hand stack the exploit refunded', () => {
    const { t, evt } = dealtTable();

    // Whoever acts first commits chips, then asks to leave mid-hand.
    const actor = t.getState().currentPlayer!;
    const actorId = t.getState().seats[actor]!.id;
    t.raise(actorId, 100);
    const committed = t.getState().seats.find((p) => p?.id === actorId)!.totalBet;
    expect(committed).toBeGreaterThan(0);

    t.markLeaving(actorId);
    expect(t.isSeated(actorId)).toBe(true); // seat held — the whole point

    // Play the hand out; the leaving player auto-acts instantly on every turn.
    for (let i = 0; i < 12 && !evt(); i++) {
      const st = t.getState();
      if (st.currentPlayer === null) break;
      const turnId = st.seats[st.currentPlayer]!.id;
      if (turnId !== actorId) t.fold(turnId);
      vi.advanceTimersByTime(21_000);
    }

    const e = evt();
    expect(e).not.toBeNull();

    // The leaver MUST appear in perPlayer — otherwise checkpointSeatedPlayers never
    // writes their true stack and the refund falls back to the stale value (the bug).
    const mine = e!.perPlayer.find((p) => p.telegramId === actorId);
    expect(mine).toBeDefined();

    // Chip conservation across the hand: nothing minted, nothing destroyed.
    const netSum = e!.perPlayer.reduce((s, p) => s + p.netDelta, 0);
    expect(netSum + (e!.rake ?? 0)).toBe(0);

    // finalChips is the real post-hand stack, reachable from the pre-hand 1000.
    expect(mine!.finalChips).toBe(1000 + mine!.netDelta);
  });

  // The hazard the deferred path exists to avoid, pinned as a characterization test.
  // removePlayer is still used for admin kicks and bot teardown, so if this ever
  // stops being true the deferred exit can be simplified — and if someone routes a
  // player leave back through it, this documents what breaks.
  it('removePlayer mid-hand drops the player from perPlayer — the checkpoint never sees them', () => {
    // Three-handed: removing one mid-hand must still leave two players to finish it.
    const t = new Table('t3', 'T3', cfg());
    t.addPlayer('A', 0, 1000);
    t.addPlayer('B', 1, 1000);
    t.addPlayer('C', 2, 1000);
    let captured: HandCompleteEvent | null = null;
    t.setOnHandComplete((e) => { captured = e; });
    (t.game as any).startNextHand();

    const actorId = t.getState().seats[t.getState().currentPlayer!]!.id;
    t.raise(actorId, 100);

    // The OLD leave path: yank the seat out mid-hand.
    t.removePlayer(actorId);
    const otherId = t.getState().seats.find((p) => p !== null)!.id;

    for (let i = 0; i < 12 && !captured; i++) {
      const st = t.getState();
      if (st.currentPlayer === null) break;
      t.fold(st.seats[st.currentPlayer]!.id);
      vi.advanceTimersByTime(21_000);
    }

    const e = captured as HandCompleteEvent | null;
    expect(e).not.toBeNull();
    // Absent from perPlayer ⇒ checkpointSeatedPlayers never writes their currentChips
    // ⇒ refundCurrentChips pays out the PRE-hand stack while the 100 they committed
    // is paid to the winner. That difference is minted chips (B2).
    expect(e!.perPlayer.some((p) => p.telegramId === actorId)).toBe(false);
    expect(e!.perPlayer.some((p) => p.telegramId === otherId)).toBe(true);
  });

  it('a leaving player still WINS the pot when everyone else folds', () => {
    const { t, evt } = dealtTable();

    // Heads-up the button posts the SB and acts first, so the OTHER seat is the BB.
    // Make the BB the leaver: the SB folds preflop and the leaver takes the blinds.
    const sbId = t.getState().seats[t.getState().currentPlayer!]!.id;
    const bbId = t.getState().seats.find((p) => p && p.id !== sbId)!.id;

    t.markLeaving(bbId);
    t.fold(sbId);
    vi.advanceTimersByTime(21_000);

    const e = evt();
    expect(e).not.toBeNull();
    const mine = e!.perPlayer.find((p) => p.telegramId === bbId)!;

    // Leaving is not forfeiting: the old force-fold on removePlayer handed this pot
    // to the opponent even when the leaver was all-in with no decision left.
    expect(mine.won).toBe(true);
    expect(mine.netDelta).toBeGreaterThan(0);
    expect(mine.finalChips).toBeGreaterThan(1000);
  });
});

describe('PendingExits registry (exit-reconnect A)', () => {
  beforeEach(() => PendingExits.__resetForTests());

  it('marks, reports and clears an in-flight exit', () => {
    PendingExits.mark('42', 'table-funnel-1');
    expect(PendingExits.isPending('42')).toBe(true);
    expect(PendingExits.tableOf('42')).toBe('table-funnel-1');
    PendingExits.clear('42');
    expect(PendingExits.isPending('42')).toBe(false);
  });

  it('forTable returns only that table\'s pending exits', () => {
    PendingExits.mark('1', 'table-a');
    PendingExits.mark('2', 'table-a');
    PendingExits.mark('3', 'table-b');
    expect(PendingExits.forTable('table-a').sort()).toEqual(['1', '2']);
    expect(PendingExits.forTable('table-b')).toEqual(['3']);
  });

  it('mark is idempotent — a double leave click cannot queue two refunds', () => {
    PendingExits.mark('42', 'table-a');
    PendingExits.mark('42', 'table-a');
    expect(PendingExits.forTable('table-a')).toEqual(['42']);
  });
});
