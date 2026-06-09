import { evaluateStrength } from './handStrength.js';
import type { GameStage } from '../../types/index.js';

/**
 * Pure decision function for a playtest bot — tight-passive, never bluffs.
 *
 * "Passive" means it prefers call over raise: even premium hands mostly just
 * call, raising only some of the time for value. Weak hands fold to any bet and
 * check when free. The aim is predictable behaviour that's easy to debug, while
 * still occasionally building multiway pots that exercise side-pot logic.
 *
 * Returns the engine action plus, for a raise, the `amount` increment ABOVE the
 * call (matching Game.raise's contract: totalBet = toCall + amount, amount >= BB).
 */
export type BotActionKind = 'fold' | 'check' | 'call' | 'raise' | 'allIn';

export interface BotDecision {
  kind: BotActionKind;
  amount?: number; // raise increment above the call (only for kind === 'raise')
}

export interface BotContext {
  hole: string[];
  community: string[];
  stage: GameStage;
  toCall: number;      // currentBet - myBet, clamped to >= 0
  currentBet: number;
  myBet: number;
  myChips: number;
  bigBlind: number;
  potTotal: number;
  activeCount: number; // players still in the hand (not folded)
  rng?: () => number;  // injectable for deterministic tests
}

/** Open/continuation bet sizing when checked to us (toCall === 0). */
function makeBet(ctx: BotContext): BotDecision {
  if (ctx.myChips <= 0) return { kind: 'check' };
  let amount = Math.max(ctx.bigBlind, Math.floor(ctx.potTotal * 0.5));
  amount = Math.min(amount, ctx.myChips);
  if (amount >= ctx.myChips) return { kind: 'allIn' };
  if (amount < ctx.bigBlind) return { kind: 'check' }; // can't make a legal min bet
  return { kind: 'raise', amount };
}

/**
 * Raise sizing when facing a bet (toCall > 0). Returns null when a legal raise
 * isn't possible (caller falls back to call, which auto all-ins if short).
 */
function makeRaise(ctx: BotContext): BotDecision | null {
  const remaining = ctx.myChips - ctx.toCall; // chips left after calling in full
  if (remaining <= 0) return null;             // can't even cover the call → just call
  const desired = Math.max(ctx.bigBlind, Math.floor((ctx.potTotal + ctx.toCall) * 0.5));
  if (desired >= remaining) {
    // Not enough for the desired raise; shove only if we can make a legal min-raise.
    return remaining >= ctx.bigBlind ? { kind: 'allIn' } : null;
  }
  return { kind: 'raise', amount: desired };
}

export function decideBotAction(ctx: BotContext): BotDecision {
  const rng = ctx.rng ?? Math.random;
  const strength = evaluateStrength(ctx.hole, ctx.community);
  const canCheck = ctx.toCall <= 0;

  if (canCheck) {
    // Passive: mostly check; raise for value only with the strongest holdings.
    if (strength === 'premium' && rng() < 0.7) return makeBet(ctx);
    if (strength === 'strong' && rng() < 0.25) return makeBet(ctx);
    return { kind: 'check' };
  }

  // Facing a bet.
  switch (strength) {
    case 'premium': {
      if (rng() < 0.5) {
        const r = makeRaise(ctx);
        if (r) return r;
      }
      return { kind: 'call' };
    }
    case 'strong':
      return { kind: 'call' };
    case 'medium': {
      // Continue only when it's cheap relative to the blind or our stack.
      const cheap = ctx.toCall <= ctx.bigBlind * 3 || ctx.toCall <= ctx.myChips * 0.1;
      return cheap ? { kind: 'call' } : { kind: 'fold' };
    }
    default:
      return { kind: 'fold' };
  }
}
