/**
 * crypto-payments-rake phase 5 §I — withdrawal policy.
 *
 * No documentary KYC (decided 2026-07-14): without a gambling licence no
 * verification provider onboards us, and home-made document checks are theatre.
 * Identity is the Telegram account; the custodial provider does its own AML.
 * What we defend against is TRANSIT — deposit, dump the chips to an accomplice
 * (or barely play), withdraw the "winnings" — using activity thresholds, daily
 * caps, and flags a human looks at. Never autobans: at our volumes a false
 * positive costs more than a manual glance.
 *
 * Every number lives in env, not in code, so it can be tuned without a deploy.
 */
import { MIN_WITHDRAWAL_CHIPS } from './peg.js';

function envInt(name: string, fallback: number): number {
  const raw = (process.env[name] ?? '').trim();
  if (raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export interface WithdrawalPolicy {
  /** Smallest payout ($10 — plan §A). */
  minChips: number;
  /**
   * Crypto Pay caps a single `transfer` at roughly 25000 USD equivalent
   * (documented as "~1-25000 USD"). Requesting more would fail at the provider,
   * so reject it up front with a comprehensible message.
   */
  maxPerRequestChips: number;
  /** Rolling 24h payout cap per player ($500 — plan §I). */
  dailyLimitChips: number;
  /**
   * Hands required since the last deposit before a payout is allowed. DROPPED
   * 2026-08-05 — stays 0, including at launch. It never bought what it promised:
   * a HandHistory row is written for every occupied seat (sitting out included),
   * so the counter is farmable for free, and the transit flow it targeted cashes
   * out through an account that never deposited — which skips the check outright.
   * Churn is already priced by the 3% deposit fee the player pays. The switch
   * stays wired so it can be turned on from env if real abuse appears.
   */
  minHandsSinceDeposit: number;
  /** Flag (not a block) when a payout eats most of a barely-played deposit. */
  transitFlagRatioPct: number;
  transitFlagHandsBelow: number;
}

export function getWithdrawalPolicy(): WithdrawalPolicy {
  return {
    minChips: envInt('WITHDRAWAL_MIN_CHIPS', MIN_WITHDRAWAL_CHIPS),
    maxPerRequestChips: envInt('WITHDRAWAL_MAX_CHIPS', 2_500_000),
    dailyLimitChips: envInt('WITHDRAWAL_DAILY_LIMIT_CHIPS', 50_000),
    minHandsSinceDeposit: envInt('WITHDRAWAL_MIN_HANDS', 0),
    transitFlagRatioPct: envInt('WITHDRAWAL_FLAG_RATIO_PCT', 90),
    transitFlagHandsBelow: envInt('WITHDRAWAL_FLAG_HANDS_BELOW', 100),
  };
}

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Machine-readable rejection reasons — the client maps them to copy. */
export type WithdrawalBlockCode =
  | 'BELOW_MIN'
  | 'ABOVE_MAX'
  | 'INSUFFICIENT_BALANCE'
  | 'DAILY_LIMIT'
  | 'NOT_ENOUGH_HANDS'
  | 'NOT_AVAILABLE';

export interface WithdrawalEligibility {
  /** Chips the player may withdraw right now (0 when blocked outright). */
  maxAvailableChips: number;
  balanceChips: number;
  minChips: number;
  /** Remaining slice of the rolling 24h cap. */
  remainingDailyChips: number;
  handsSinceDeposit: number;
  requiredHands: number;
  /** Blocking reasons that apply regardless of amount (e.g. too few hands). */
  blockedBy: WithdrawalBlockCode | null;
}

/**
 * Decide whether a specific amount may be withdrawn. Pure — all the DB reads
 * happen in the caller, which keeps this fully unit-testable.
 */
export function checkWithdrawalAmount(
  amountChips: number,
  eligibility: WithdrawalEligibility,
  policy: WithdrawalPolicy,
): { ok: true } | { ok: false; code: WithdrawalBlockCode; message: string } {
  if (!Number.isInteger(amountChips) || amountChips <= 0) {
    return { ok: false, code: 'BELOW_MIN', message: 'Enter a whole number of chips.' };
  }
  if (eligibility.blockedBy === 'NOT_ENOUGH_HANDS') {
    const left = policy.minHandsSinceDeposit - eligibility.handsSinceDeposit;
    return {
      ok: false,
      code: 'NOT_ENOUGH_HANDS',
      message: `Play ${left} more hand${left === 1 ? '' : 's'} before withdrawing.`,
    };
  }
  if (amountChips < policy.minChips) {
    return {
      ok: false,
      code: 'BELOW_MIN',
      message: `Minimum withdrawal is ${policy.minChips} chips.`,
    };
  }
  if (amountChips > policy.maxPerRequestChips) {
    return {
      ok: false,
      code: 'ABOVE_MAX',
      message: `Maximum per request is ${policy.maxPerRequestChips} chips.`,
    };
  }
  if (amountChips > eligibility.balanceChips) {
    return { ok: false, code: 'INSUFFICIENT_BALANCE', message: 'Not enough chips on your balance.' };
  }
  if (amountChips > eligibility.remainingDailyChips) {
    return {
      ok: false,
      code: 'DAILY_LIMIT',
      message: `Daily limit reached — ${Math.max(0, eligibility.remainingDailyChips)} chips left for today.`,
    };
  }
  return { ok: true };
}

export interface WithdrawalFlagInput {
  amountChips: number;
  totalDepositedChips: number;
  handsSinceDeposit: number;
}

/**
 * §I flags for the admin queue. These NEVER block — they colour a row so a human
 * decides. Returned as short codes the UI renders as badges.
 */
export function computeWithdrawalFlags(
  input: WithdrawalFlagInput,
  policy: WithdrawalPolicy,
): string[] {
  const flags: string[] = [];
  if (input.totalDepositedChips > 0) {
    const pct = (input.amountChips / input.totalDepositedChips) * 100;
    if (pct >= policy.transitFlagRatioPct && input.handsSinceDeposit < policy.transitFlagHandsBelow) {
      flags.push('POSSIBLE_TRANSIT');
    }
  }
  if (input.handsSinceDeposit === 0) flags.push('NO_HANDS_SINCE_DEPOSIT');
  if (input.totalDepositedChips === 0) flags.push('NEVER_DEPOSITED');
  return flags;
}
