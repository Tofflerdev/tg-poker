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

/**
 * exit-reconnect A/B5 — bot removal. Bots hold no money, so none of this is about
 * refunds: it is about not corrupting a live hand, and about bots never touching the
 * money-recovery machinery at all.
 */
describe('bot removal defers to the hand boundary (exit-reconnect A)', () => {
  const cfg = (over: Partial<TableConfig> = {}): TableConfig => ({
    smallBlind: 5, bigBlind: 10, maxPlayers: 6, turnTime: 20,
    minBuyIn: 400, maxBuyIn: 1000, category: 'cash', ...over,
  });

  function tableWithBots(): Table {
    const t = new Table('bt', 'BT', cfg());
    t.addPlayer('A', 0, 1000);                                       // human
    t.addPlayer('-1', 1, 1000, -1, 'Bot One', undefined, undefined, true);
    t.addPlayer('-2', 2, 1000, -2, 'Bot Two', undefined, undefined, true);
    return t;
  }

  it('removes bots immediately when the table is between hands', () => {
    const t = tableWithBots();
    expect(t.requestBotRemoval()).toBe(2);
    expect(t.isSeated('-1')).toBe(false);
    expect(t.isSeated('-2')).toBe(false);
    expect(t.isSeated('A')).toBe(true);
  });

  it('holds the seats mid-hand and marks the bots leaving instead', () => {
    const t = tableWithBots();
    (t.game as any).startNextHand();

    expect(t.requestBotRemoval()).toBe(2);

    // Still seated: yanking them out now would force-fold an all-in bot out of a pot
    // it was entitled to, and drop it from evt.perPlayer so the session recorder's
    // chip conservation stops balancing for this hand.
    expect(t.isSeated('-1')).toBe(true);
    expect(t.isSeated('-2')).toBe(true);
    expect((t.game as any).seats[1].leaving).toBe(true);
    expect((t.game as any).seats[1].sittingOut).toBe(true);
  });

  it('drops the deferred bots at the next between-hands boundary', () => {
    const t = tableWithBots();
    (t.game as any).startNextHand();
    t.requestBotRemoval();

    // scheduleNextHand() is the between-hands boundary; it runs maybeCleanupBots.
    (t.game as any).stage = 'waiting';
    t.scheduleNextHand();

    expect(t.isSeated('-1')).toBe(false);
    expect(t.isSeated('-2')).toBe(false);
    expect(t.isSeated('A')).toBe(true);
  });
});

/**
 * exit-reconnect B7 — "in this hand" means holding cards, not a set of flags.
 *
 * Found on prod 2026-07-15: a player sat out by the disconnect handler was dealt out
 * of the next hand (canPlayerPlayInCurrentHand excludes sittingOut) but getNextPlayer
 * — which checked only folded/allIn/chips/waitingForBB — still handed them the turn.
 */
describe('a dealt-out player is never asked to act (exit-reconnect B7)', () => {
  const cfg = (over: Partial<TableConfig> = {}): TableConfig => ({
    smallBlind: 1, bigBlind: 2, maxPlayers: 6, turnTime: 30,
    minBuyIn: 80, maxBuyIn: 200, category: 'cash', ...over,
  });

  function tableWithSatOutB(): Table {
    const t = new Table('p', 'P', cfg());
    t.addPlayer('A', 0, 200);
    t.addPlayer('B', 1, 200);
    t.addPlayer('C', 2, 200);
    t.sitOut('B'); // what GraceRegistry.onHandBoundary does to a disconnected player
    (t.game as any).startNextHand();
    return t;
  }

  it('never makes a cardless player the current player', () => {
    const t = tableWithSatOutB();
    const st = t.getState();
    expect(st.seats[1]!.hand.length).toBe(0); // B was dealt out, as intended
    const actor = st.currentPlayer !== null ? st.seats[st.currentPlayer] : null;
    expect(actor).not.toBeNull();
    expect(actor!.hand.length).toBeGreaterThan(0);
    expect(actor!.id).not.toBe('B');
  });

  it('refuses an action from a player holding no cards', () => {
    const t = tableWithSatOutB();
    // Even if something hands B the turn, they cannot act in a hand they are not in.
    (t.game as any).currentPlayer = 1;
    expect(t.call('B')).toBe(false);
    expect(t.fold('B')).toBe(false);
  });

  it('the table survives a sit-in landing on a dealt-out player mid-hand', () => {
    // The exact prod sequence: sat out at the boundary, dealt out of the next hand,
    // reconnects mid-hand and is sat back in (which sets waitingForBB). Previously B
    // was already currentPlayer here, so the turn timer's fold() was refused,
    // currentPlayer never advanced, the timer never re-armed and the table died.
    const t = tableWithSatOutB();
    t.sitIn('B');

    const st = t.getState();
    const actor = st.currentPlayer !== null ? st.seats[st.currentPlayer] : null;
    expect(actor!.id).not.toBe('B');
    expect(actor!.hand.length).toBeGreaterThan(0);
  });
});

/**
 * exit-reconnect B8 — a table must never become unplayable.
 *
 * Prod 2026-07-15: table-funnel-1 dealt nothing from 14:31:18 onwards. Players sat
 * down, waited 30-40 s showing "Wait BB", and left. Three times.
 */
describe('an idle table cannot be bricked (exit-reconnect B8)', () => {
  const cfg = (over: Partial<TableConfig> = {}): TableConfig => ({
    smallBlind: 1, bigBlind: 2, maxPlayers: 6, turnTime: 30,
    minBuyIn: 80, maxBuyIn: 200, category: 'cash', ...over,
  });

  /** Hand over, stage still 'showdown', the only human sat out by the grace handler. */
  function idleTableAtShowdown(): Table {
    const t = new Table('b', 'B', cfg());
    t.addPlayer('H', 0, 200);
    t.addPlayer('-1', 1, 200, -1, 'B1', undefined, undefined, true);
    t.addPlayer('-2', 2, 200, -2, 'B2', undefined, undefined, true);
    (t.game as any).stage = 'showdown';
    t.sitOut('H');
    return t;
  }

  it('a human joining between hands is dealt in, not parked on Wait BB', () => {
    const t = idleTableAtShowdown();
    t.addPlayer('H2', 3, 200);

    // showdown is BETWEEN hands: there is no blind in flight to wait for. Flagging
    // H2 here made them ineligible, and with no eligible human canRunHands() stays
    // false, so startNextHand never runs — and only startNextHand ever clears the
    // flag. The table was dead for good, and so was every human who sat down next.
    expect(t.getState().seats[3]!.waitingForBB).toBe(false);
    expect(t.game.getEligiblePlayers().some((p: Player) => p.id === 'H2')).toBe(true);
  });

  it('sitting back in between hands does not park the player either', () => {
    const t = idleTableAtShowdown();
    t.sitIn('H');
    expect(t.getState().seats[0]!.waitingForBB).toBe(false);
    expect(t.game.getEligiblePlayers().some((p: Player) => p.id === 'H')).toBe(true);
  });

  it('still waits for the big blind when a hand really is running', () => {
    // The rule itself must survive: joining mid-hand cannot dodge the blinds.
    const t = new Table('b2', 'B2', cfg());
    t.addPlayer('H', 0, 200);
    t.addPlayer('-1', 1, 200, -1, 'B1', undefined, undefined, true);
    (t.game as any).startNextHand();
    expect(t.getState().stage).toBe('preflop');

    t.addPlayer('H2', 3, 200);
    expect(t.getState().seats[3]!.waitingForBB).toBe(true);
  });
});

/**
 * exit-reconnect B9 — the deadlock B8 only half-closed.
 *
 * waitingForBB excludes a player from getEligiblePlayers(). canRunHands() asked for
 * an ELIGIBLE human. Only dealing clears waitingForBB (activateWaitingPlayers runs
 * solely inside startNextHand). So the last human waiting for the big blind could
 * never be activated: prod 2026-07-15 14:47:24, the second human left and
 * table-funnel-1 never dealt again.
 */
describe('the last human waiting for the BB cannot brick the table (exit-reconnect B9)', () => {
  const cfg = (over: Partial<TableConfig> = {}): TableConfig => ({
    smallBlind: 1, bigBlind: 2, maxPlayers: 6, turnTime: 30,
    minBuyIn: 80, maxBuyIn: 200, category: 'cash', ...over,
  });

  /** One human legitimately waiting for the blind, plus bots. Table idle. */
  function waitingHumanWithBots(): Table {
    const t = new Table('w', 'W', cfg());
    t.addPlayer('H', 0, 200);
    t.addPlayer('-1', 1, 200, -1, 'B1', undefined, undefined, true);
    t.addPlayer('-2', 2, 200, -2, 'B2', undefined, undefined, true);
    const anyT = t as any;
    if (anyT.nextHandTimer) { clearTimeout(anyT.nextHandTimer); anyT.nextHandTimer = null; }
    (t.game as any).seats[0].waitingForBB = true;
    (t.game as any).stage = 'waiting';
    return t;
  }

  it('a human waiting for the blind still counts as a human at the table', () => {
    const t = waitingHumanWithBots();
    // The circularity in one line: not eligible, yet must keep the table alive.
    expect(t.game.getEligiblePlayers().some((p: Player) => !p.isBot)).toBe(false);
    expect(t.game.hasPlayableHuman()).toBe(true);
  });

  it('keeps dealing so the waiting human can be activated', () => {
    vi.useFakeTimers();
    const t = waitingHumanWithBots();
    t.tryStartNextHand();
    expect((t as any).nextHandTimer).not.toBeNull();
    vi.useRealTimers();
  });

  it('actually activates the waiting human — the table heals itself', () => {
    const t = waitingHumanWithBots();
    // Deal until the big blind reaches seat 0. With 3 seats this takes a few hands;
    // the point is that it terminates rather than sitting dead forever.
    for (let i = 0; i < 6 && (t.game as any).seats[0].waitingForBB; i++) {
      (t.game as any).startNextHand();
      (t.game as any).stage = 'waiting';
    }
    expect((t.game as any).seats[0].waitingForBB).toBe(false);
    expect(t.game.getEligiblePlayers().some((p: Player) => p.id === 'H')).toBe(true);
  });

  it('a sat-out or busted human does NOT keep the table dealing', () => {
    // They are not waiting on anything — decision B still applies.
    const t = waitingHumanWithBots();
    t.sitOut('H');
    expect(t.game.hasPlayableHuman()).toBe(false);

    const t2 = waitingHumanWithBots();
    (t2.game as any).seats[0].chips = 0;
    expect(t2.game.hasPlayableHuman()).toBe(false);
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
