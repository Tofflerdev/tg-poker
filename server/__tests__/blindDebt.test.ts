import { describe, it, expect } from 'vitest';
import Game from '../Game.js';
import { checkHand } from '../bot/oracle.js';
import type { HandCompleteEvent, Player, Pot } from '../../types/index.js';

/**
 * blind-debt — owesBlind replaces waitingForBB (plans/blind-debt-plan.md).
 *
 * The invariant under test everywhere: settling a blind debt costs EXACTLY one
 * big blind on any position, is charged only when a hand actually starts, and
 * never touches eligibility. Anything cheaper reopens the blind-dodge exploit;
 * anything leaking past the pot breaks chip conservation.
 */

const SB = 5;
const BB = 10;

/** Fresh game, players seated while the table is idle (no debt), sb/bb = 5/10. */
function gameWith(players: { id: string; seat: number; chips?: number }[]): Game {
  const g = new Game('t', { smallBlind: SB, bigBlind: BB });
  for (const p of players) g.addPlayer(p.id, p.seat, p.chips ?? 1000);
  return g;
}

const seat = (g: Game, i: number): Player => (g as any).seats[i] as Player;
const dead = (g: Game): { playerId: string; amount: number }[] => (g as any).deadContributions;
const deadOf = (g: Game, id: string) => dead(g).filter(d => d.playerId === id).reduce((s, d) => s + d.amount, 0);

describe('settleBlindDebts — the post costs exactly one BB on any position', () => {
  it('off the blinds: a dead post of exactly BB lands in the pot', () => {
    const g = gameWith([{ id: 'A', seat: 0 }, { id: 'B', seat: 1 }, { id: 'C', seat: 2 }]);
    seat(g, 2).owesBlind = true;
    (g as any).dealerPosition = 1; // advances to 2 → dealer=C, SB=A(0), BB=B(1)

    expect(g.startNextHand()).toBe(true);
    const c = seat(g, 2);
    expect(c.chips).toBe(1000 - BB);
    expect(c.owesBlind).toBe(false);
    expect(c.hand.length).toBe(2);          // dealt in, same hand
    expect(c.bet).toBe(0);                  // dead, not live — no free check later
    expect(c.totalBet).toBe(0);
    expect(deadOf(g, 'C')).toBe(BB);
    // Pot balances: SB + BB + dead post, nothing burnt.
    expect((g as any).getTotalPot()).toBe(SB + BB + BB);
  });

  it('on the BB: the live blind covers the debt, no double charge', () => {
    const g = gameWith([{ id: 'A', seat: 0 }, { id: 'B', seat: 1 }, { id: 'C', seat: 2 }]);
    seat(g, 2).owesBlind = true;
    (g as any).dealerPosition = 5; // advances to 0 → dealer=A, SB=B(1), BB=C(2)

    expect(g.startNextHand()).toBe(true);
    const c = seat(g, 2);
    expect(c.chips).toBe(1000 - BB);        // live BB only
    expect(c.bet).toBe(BB);
    expect(c.owesBlind).toBe(false);
    expect(deadOf(g, 'C')).toBe(0);
  });

  it('on the SB: live SB plus a dead remainder — total exactly BB (dodge closed)', () => {
    // Miss your BB and you re-enter exactly on the SB (the button moves one seat).
    // If the live SB alone settled the debt, timing the sit-in would cost 0.5BB
    // per orbit instead of 1.5BB — the very exploit this feature exists to kill.
    const g = gameWith([{ id: 'A', seat: 0 }, { id: 'B', seat: 1 }, { id: 'C', seat: 2 }]);
    seat(g, 2).owesBlind = true;
    (g as any).dealerPosition = 0; // advances to 1 → dealer=B, SB=C(2), BB=A(0)

    expect(g.startNextHand()).toBe(true);
    const c = seat(g, 2);
    expect(c.chips).toBe(1000 - BB);        // 5 live + 5 dead = full BB
    expect(c.bet).toBe(SB);                 // the live part
    expect(c.owesBlind).toBe(false);
    expect(deadOf(g, 'C')).toBe(BB - SB);   // the dead remainder
  });

  it('stack ≤ 1BB: debt forgiven, cards dealt, flag CLEARED (no resurrection)', () => {
    const g = gameWith([{ id: 'A', seat: 0 }, { id: 'B', seat: 1 }, { id: 'C', seat: 2, chips: BB }]);
    seat(g, 2).owesBlind = true;
    (g as any).dealerPosition = 1; // dealer=C, SB=A, BB=B — C off the blinds

    expect(g.startNextHand()).toBe(true);
    const c = seat(g, 2);
    expect(c.chips).toBe(BB);               // untouched — a dead all-in post would be theft
    expect(c.hand.length).toBe(2);
    expect(c.owesBlind).toBe(false);        // forgiven for good, no charge after a double-up
    expect(deadOf(g, 'C')).toBe(0);
  });
});

describe('debt lifecycle — set, kept, settled once', () => {
  it('debt is NOT charged when the hand fails to start (eligible < 2)', () => {
    const g = gameWith([{ id: 'A', seat: 0 }, { id: 'B', seat: 1 }]);
    seat(g, 0).owesBlind = true;
    g.sitOut('B');

    expect(g.startNextHand()).toBe(false);
    // The post would have gone into a pot nobody plays — chips burnt. Never charge.
    expect(seat(g, 0).chips).toBe(1000);
    expect(seat(g, 0).owesBlind).toBe(true); // debt survives until a real hand
  });

  it('sitIn while the table is idle does not erase an existing debt (OR, not assignment)', () => {
    const g = gameWith([{ id: 'A', seat: 0 }, { id: 'B', seat: 1 }]);
    const a = seat(g, 0);
    a.owesBlind = true;
    a.sittingOut = true;
    // Debtor sat out, table emptied to 'waiting', debtor sits back in: an
    // assignment (`owesBlind = stage !== 'waiting'`) would wipe the debt here
    // and hand out a free orbit once the table wakes up.
    g.sitIn('A');
    expect(a.owesBlind).toBe(true);
    expect(a.sittingOut).toBe(false);
  });

  it('sit-out → sit-in costs exactly one post, then the player is a regular', () => {
    const g = gameWith([
      { id: 'A', seat: 0 }, { id: 'B', seat: 1 }, { id: 'C', seat: 2 },
      { id: 'D', seat: 3 }, { id: 'E', seat: 4 },
    ]);
    (g as any).dealerPosition = 5;
    expect(g.startNextHand()).toBe(true);   // hand 1: dealer=0, SB=1, BB=2

    g.sitOut('E');
    g.sitIn('E');                           // mid-hand → debt via stage !== 'waiting'
    expect(seat(g, 4).owesBlind).toBe(true);

    const chipsBefore = seat(g, 4).chips;
    expect(g.startNextHand()).toBe(true);   // hand 2: dealer=1, SB=2, BB=3 — E off blinds
    expect(seat(g, 4).chips).toBe(chipsBefore - BB);
    expect(seat(g, 4).owesBlind).toBe(false);
    expect(deadOf(g, 'E')).toBe(BB);

    expect(g.startNextHand()).toBe(true);   // hand 3: E pays no second post
    expect(deadOf(g, 'E')).toBe(0);
  });

  it('a sitting-out debtor is not charged; the debt outlives the hand', () => {
    const g = gameWith([{ id: 'A', seat: 0 }, { id: 'B', seat: 1 }, { id: 'C', seat: 2 }]);
    const c = seat(g, 2);
    c.owesBlind = true;
    c.sittingOut = true;

    expect(g.startNextHand()).toBe(true);   // A vs B play on
    expect(c.chips).toBe(1000);
    expect(c.owesBlind).toBe(true);
    expect(c.hand.length).toBe(0);
  });
});

describe('heads-up with a debtor (dealer = SB)', () => {
  it('debtor on the button/SB pays live SB + dead remainder', () => {
    const g = gameWith([{ id: 'A', seat: 0 }, { id: 'B', seat: 1 }]);
    seat(g, 1).owesBlind = true;
    (g as any).dealerPosition = 0; // advances to 1 → dealer=B=SB, BB=A

    expect(g.startNextHand()).toBe(true);
    const b = seat(g, 1);
    expect(b.chips).toBe(1000 - BB);
    expect(b.bet).toBe(SB);
    expect(deadOf(g, 'B')).toBe(BB - SB);
    expect(b.owesBlind).toBe(false);
    expect((g as any).currentPlayer).not.toBeNull(); // table alive, someone to act
  });

  it('debtor on the BB is covered by the live blind', () => {
    const g = gameWith([{ id: 'A', seat: 0 }, { id: 'B', seat: 1 }]);
    seat(g, 1).owesBlind = true;
    (g as any).dealerPosition = 1; // advances to 0 → dealer=A=SB, BB=B

    expect(g.startNextHand()).toBe(true);
    const b = seat(g, 1);
    expect(b.chips).toBe(1000 - BB);
    expect(b.bet).toBe(BB);
    expect(deadOf(g, 'B')).toBe(0);
    expect(b.owesBlind).toBe(false);
  });
});

describe('money accounting with a dead post', () => {
  it('side pot: dead post money is winnable, capped sets stay nested', () => {
    // D posted a dead BB and folded pre; A is all-in short; B and C play on.
    const g = gameWith([
      { id: 'A', seat: 0 }, { id: 'B', seat: 1 }, { id: 'C', seat: 2 }, { id: 'D', seat: 3 },
    ]);
    const [a, b, c, d] = [0, 1, 2, 3].map(i => seat(g, i));
    Object.assign(a, { hand: ['As', 'Ad'], totalBet: 50, allIn: true, chips: 0 });
    Object.assign(b, { hand: ['Ks', 'Kd'], totalBet: 200 });
    Object.assign(c, { hand: ['Qs', 'Qd'], totalBet: 200 });
    Object.assign(d, { hand: ['2s', '7d'], totalBet: 0, folded: true });
    dead(g).push({ playerId: 'D', amount: BB });

    const pots: Pot[] = (g as any).calculatePots();
    expect(pots.map(p => p.amount).reduce((s, x) => s + x, 0)).toBe(50 + 200 + 200 + BB);
    // Main pot: everyone's first 50 plus the dead post — A, B, C can win it.
    expect(pots[0].amount).toBe(50 * 3 + BB);
    expect([...pots[0].eligiblePlayers].sort()).toEqual(['A', 'B', 'C']);
    // Side pot: B and C above A's all-in level.
    expect(pots[1].amount).toBe(150 * 2);
    expect([...pots[1].eligiblePlayers].sort()).toEqual(['B', 'C']);
  });

  it('HandCompleteEvent balances and the oracle stays green on a dead-post hand', () => {
    const g = gameWith([
      { id: 'A', seat: 0 }, { id: 'B', seat: 1 }, { id: 'C', seat: 2 }, { id: 'D', seat: 3 },
    ]);
    seat(g, 3).owesBlind = true;
    (g as any).dealerPosition = 5; // dealer=A(0), SB=B(1), BB=C(2), D(3) posts dead

    let evt: HandCompleteEvent | null = null;
    g.setOnHandComplete(e => { evt = e; });

    expect(g.startNextHand()).toBe(true);
    // Everyone folds to the BB — win by fold, hand completes.
    expect(g.fold('D')).toBe(true);
    expect(g.fold('A')).toBe(true);
    expect(g.fold('B')).toBe(true);
    expect(g.check('C')).toBe(true);

    expect(evt).not.toBeNull();
    const per = new Map(evt!.perPlayer.map(p => [p.telegramId, p]));

    // The debtor's post is real money: in netDelta AND in contributed.
    expect(per.get('D')!.netDelta).toBe(-BB);
    expect(per.get('D')!.contributed).toBe(BB);
    // Winner takes SB + dead post (their own BB comes back).
    expect(per.get('C')!.netDelta).toBe(SB + BB);
    // Chip conservation across the table.
    expect(evt!.perPlayer.reduce((s, p) => s + p.netDelta, 0)).toBe(0);
    // The oracle's invariants (chipConservation, potsAccounting, eligibility)
    // must hold — this is the "money never burns past the pot" guarantee.
    expect(checkHand(evt!)).toEqual([]);
  });
});

/* ══════════════ Phase 2 — post now / wait for the BB ══════════════ */

/** Humans get a socketId (connected); bots do not — mirrors prod addPlayer. */
function gameWithSockets(players: { id: string; seat: number; chips?: number; bot?: boolean }[]): Game {
  const g = new Game('t', { smallBlind: SB, bigBlind: BB });
  for (const p of players) {
    g.addPlayer(p.id, p.seat, p.chips ?? 1000, undefined, undefined, undefined,
      p.bot ? undefined : `s-${p.id}`, undefined, p.bot ?? false);
  }
  return g;
}

/** Park a seated player as a waiting-by-choice debtor. */
function parkWaiting(g: Game, seatIdx: number): Player {
  const p = seat(g, seatIdx);
  p.owesBlind = true;
  p.blindMode = 'wait';
  p.sittingOut = true;
  return p;
}

describe('wait for BB — seated exactly on the blind, for free', () => {
  it('stays parked while the BB is elsewhere, then enters as the live BB', () => {
    const g = gameWithSockets([
      { id: '-1', seat: 0, bot: true }, { id: '-2', seat: 1, bot: true }, { id: 'W', seat: 2 },
    ]);
    const w = parkWaiting(g, 2);

    (g as any).dealerPosition = 0; // hand 1: dealer=1, simulated BB lands on seat 0 — not W
    expect(g.startNextHand()).toBe(true);
    expect(w.sittingOut).toBe(true);   // still waiting
    expect(w.chips).toBe(1000);        // and still uncharged

    expect(g.startNextHand()).toBe(true); // hand 2: dealer=0, SB=1, BB=W's seat
    expect(w.sittingOut).toBe(false);
    expect(w.hand.length).toBe(2);
    expect(w.bet).toBe(BB);            // the live blind — nothing else
    expect(w.chips).toBe(1000 - BB);
    expect(w.owesBlind).toBe(false);
    expect(deadOf(g, 'W')).toBe(0);    // free: no dead post ever
  });

  it('two adjacent waiters enter one at a time, each as the BB (fixpoint)', () => {
    const g = gameWithSockets([
      { id: '-1', seat: 0, bot: true }, { id: '-2', seat: 1, bot: true },
      { id: 'W1', seat: 2 }, { id: 'W2', seat: 3 },
    ]);
    const w1 = parkWaiting(g, 2);
    const w2 = parkWaiting(g, 3);

    (g as any).dealerPosition = 0;
    expect(g.startNextHand()).toBe(true); // hand 1: bots only, both wait
    expect(w1.sittingOut).toBe(true);
    expect(w2.sittingOut).toBe(true);

    expect(g.startNextHand()).toBe(true); // hand 2: BB reaches seat 2 — W1 only
    expect(w1.sittingOut).toBe(false);
    expect(w1.bet).toBe(BB);
    // A batch flip would have shoved W2 in on the SB here, charging the dead
    // remainder they chose to wait out.
    expect(w2.sittingOut).toBe(true);
    expect(w2.chips).toBe(1000);

    expect(g.startNextHand()).toBe(true); // hand 3: BB reaches seat 3 — W2
    expect(w2.sittingOut).toBe(false);
    expect(w2.bet).toBe(BB);
    expect(deadOf(g, 'W1')).toBe(0);
    expect(deadOf(g, 'W2')).toBe(0);
    expect(w2.chips).toBe(1000 - BB);
  });

  it('a disconnected waiter is never auto-seated (auto-fold would burn the blind)', () => {
    const g = gameWithSockets([
      { id: '-1', seat: 0, bot: true }, { id: '-2', seat: 1, bot: true }, { id: 'W', seat: 2 },
    ]);
    const w = parkWaiting(g, 2);
    g.updatePlayerSocketId('W', undefined); // grace window: seat held, socket gone

    (g as any).dealerPosition = 0;
    expect(g.startNextHand()).toBe(true);
    expect(g.startNextHand()).toBe(true); // the hand where W would have been BB
    expect(w.sittingOut).toBe(true);      // skipped — resumes after reconnect
    expect(w.chips).toBe(1000);
  });
});

describe('wait for BB — presence and the impossible-deal guard', () => {
  it('a waiting human counts as a playable human (bots keep dealing)', () => {
    const g = gameWithSockets([
      { id: '-1', seat: 0, bot: true }, { id: '-2', seat: 1, bot: true }, { id: 'W', seat: 2 },
    ]);
    parkWaiting(g, 2);
    expect(g.hasPlayableHuman()).toBe(true);

    // Presence = the seat: still true while disconnected inside the grace window.
    g.updatePlayerSocketId('W', undefined);
    expect(g.hasPlayableHuman()).toBe(true);
  });

  it('a plain sit-out human (post mode) still does NOT keep the table dealing', () => {
    const g = gameWithSockets([
      { id: '-1', seat: 0, bot: true }, { id: '-2', seat: 1, bot: true }, { id: 'H', seat: 2 },
    ]);
    const h = seat(g, 2);
    h.sittingOut = true; // disconnect sit-out, no wait choice
    expect(g.hasPlayableHuman()).toBe(false);
  });

  it('guard: two lone waiters are force-seated with the debt intact', () => {
    const g = gameWithSockets([{ id: 'W1', seat: 0 }, { id: 'W2', seat: 1 }]);
    const w1 = parkWaiting(g, 0);
    const w2 = parkWaiting(g, 1);

    // No one else can deal — their BB would never arrive. Forced in, the usual
    // settle rules apply: the BB is free, the SB pays the dead remainder up to
    // one full BB. A free entry here would be bot-dodging with house money.
    expect(g.startNextHand()).toBe(true);
    expect(w1.sittingOut).toBe(false);
    expect(w2.sittingOut).toBe(false);
    expect(w1.owesBlind).toBe(false);
    expect(w2.owesBlind).toBe(false);
    const paid = (w: Player) => 1000 - w.chips;
    // Heads-up: one is SB (5 live + 5 dead), the other BB (10 live) — both exactly BB.
    expect(paid(w1)).toBe(BB);
    expect(paid(w2)).toBe(BB);
  });

  it('guard does not fire pointlessly: a single waiter at a dead table stays waiting', () => {
    const g = gameWithSockets([{ id: 'W', seat: 0 }]);
    const w = parkWaiting(g, 0);

    expect(g.startNextHand()).toBe(false); // still cannot deal
    expect(w.sittingOut).toBe(true);       // wait preserved — free BB entry when the table revives
    expect(w.owesBlind).toBe(true);
    expect(w.chips).toBe(1000);
  });
});

describe('setBlindMode', () => {
  it('wait parks only a debtor; without debt the player stays in', () => {
    const g = gameWithSockets([{ id: 'A', seat: 0 }, { id: 'B', seat: 1 }]);
    expect(g.setBlindMode('A', 'wait')).toBe(true);
    expect(seat(g, 0).sittingOut).toBe(false); // no debt — nothing to wait out

    seat(g, 0).owesBlind = true;
    expect(g.setBlindMode('A', 'wait')).toBe(true);
    expect(seat(g, 0).sittingOut).toBe(true);
  });

  it('switching back to post sits the player in — dead post next hand', () => {
    const g = gameWithSockets([
      { id: '-1', seat: 0, bot: true }, { id: '-2', seat: 1, bot: true }, { id: 'W', seat: 2 },
    ]);
    const w = parkWaiting(g, 2);
    expect(g.setBlindMode('W', 'post')).toBe(true);
    expect(w.sittingOut).toBe(false);

    (g as any).dealerPosition = 1; // dealer=W's seat, SB=0, BB=1 — W off the blinds
    expect(g.startNextHand()).toBe(true);
    expect(w.chips).toBe(1000 - BB);
    expect(deadOf(g, 'W')).toBe(BB);
    expect(w.owesBlind).toBe(false);
  });

  it('bots cannot set a blind mode', () => {
    const g = gameWithSockets([{ id: '-1', seat: 0, bot: true }]);
    expect(g.setBlindMode('-1', 'wait')).toBe(false);
  });
});
