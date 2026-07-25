import { describe, it, expect } from 'vitest';
import {
  checkWithdrawalAmount,
  computeWithdrawalFlags,
  getWithdrawalPolicy,
  type WithdrawalEligibility,
  type WithdrawalPolicy,
} from '../payments/withdrawalPolicy.js';

/**
 * crypto-payments-rake phase 5 §I — the payout rules.
 *
 * Anti-transit measures, not KYC: activity threshold, rolling daily cap, and
 * advisory flags a human reads. Nothing here ever autobans.
 */
const POLICY: WithdrawalPolicy = {
  minChips: 1000,
  maxPerRequestChips: 2_500_000,
  dailyLimitChips: 50_000,
  minHandsSinceDeposit: 50,
  transitFlagRatioPct: 90,
  transitFlagHandsBelow: 100,
};

const eligible = (over: Partial<WithdrawalEligibility> = {}): WithdrawalEligibility => ({
  maxAvailableChips: 50_000,
  balanceChips: 50_000,
  minChips: POLICY.minChips,
  remainingDailyChips: 50_000,
  handsSinceDeposit: 100,
  requiredHands: 50,
  blockedBy: null,
  ...over,
});

describe('withdrawal policy (§I)', () => {
  it('accepts a normal request', () => {
    expect(checkWithdrawalAmount(2000, eligible(), POLICY)).toEqual({ ok: true });
  });

  it('enforces the $10 minimum and the per-transfer ceiling', () => {
    expect(checkWithdrawalAmount(999, eligible(), POLICY)).toMatchObject({ ok: false, code: 'BELOW_MIN' });
    // Crypto Pay caps a single transfer around $25000 — reject before the API does.
    expect(
      checkWithdrawalAmount(2_500_001, eligible({ balanceChips: 9_000_000, remainingDailyChips: 9_000_000 }), POLICY),
    ).toMatchObject({ ok: false, code: 'ABOVE_MAX' });
  });

  it('never lets a payout exceed the balance', () => {
    expect(checkWithdrawalAmount(6000, eligible({ balanceChips: 5000 }), POLICY)).toMatchObject({
      ok: false,
      code: 'INSUFFICIENT_BALANCE',
    });
  });

  it('applies the rolling daily cap on top of the balance', () => {
    const res = checkWithdrawalAmount(20_000, eligible({ remainingDailyChips: 10_000 }), POLICY);
    expect(res).toMatchObject({ ok: false, code: 'DAILY_LIMIT' });
    expect((res as any).message).toContain('10000');
  });

  it('blocks on the activity threshold regardless of amount, and says how many hands are left', () => {
    const res = checkWithdrawalAmount(
      2000,
      eligible({ handsSinceDeposit: 12, blockedBy: 'NOT_ENOUGH_HANDS' }),
      POLICY,
    );
    expect(res).toMatchObject({ ok: false, code: 'NOT_ENOUGH_HANDS' });
    expect((res as any).message).toContain('38'); // 50 − 12
  });

  it('rejects non-integer / non-positive amounts', () => {
    expect(checkWithdrawalAmount(0, eligible(), POLICY).ok).toBe(false);
    expect(checkWithdrawalAmount(-5, eligible(), POLICY).ok).toBe(false);
    expect(checkWithdrawalAmount(10.5, eligible(), POLICY).ok).toBe(false);
  });
});

describe('withdrawal flags (§I — advisory only)', () => {
  it('flags cashing out nearly a whole deposit after barely playing', () => {
    const flags = computeWithdrawalFlags(
      { amountChips: 9500, totalDepositedChips: 10_000, handsSinceDeposit: 3 },
      POLICY,
    );
    expect(flags).toContain('POSSIBLE_TRANSIT');
  });

  it('does not flag a normal cash-out after real play', () => {
    const flags = computeWithdrawalFlags(
      { amountChips: 9500, totalDepositedChips: 10_000, handsSinceDeposit: 400 },
      POLICY,
    );
    expect(flags).not.toContain('POSSIBLE_TRANSIT');
  });

  it('flags a player who has not played at all since depositing', () => {
    expect(
      computeWithdrawalFlags({ amountChips: 1000, totalDepositedChips: 50_000, handsSinceDeposit: 0 }, POLICY),
    ).toContain('NO_HANDS_SINCE_DEPOSIT');
  });

  it('flags withdrawing without ever having deposited (winnings only)', () => {
    expect(
      computeWithdrawalFlags({ amountChips: 1000, totalDepositedChips: 0, handsSinceDeposit: 300 }, POLICY),
    ).toContain('NEVER_DEPOSITED');
  });
});

describe('policy configuration', () => {
  it('reads thresholds from env so they can be tuned without a deploy', () => {
    const prev = process.env.WITHDRAWAL_MIN_HANDS;
    process.env.WITHDRAWAL_MIN_HANDS = '50';
    expect(getWithdrawalPolicy().minHandsSinceDeposit).toBe(50);
    process.env.WITHDRAWAL_MIN_HANDS = '';
    // Default is 0 while on testnet (documented in withdrawalPolicy.ts).
    expect(getWithdrawalPolicy().minHandsSinceDeposit).toBe(0);
    if (prev === undefined) delete process.env.WITHDRAWAL_MIN_HANDS;
    else process.env.WITHDRAWAL_MIN_HANDS = prev;
  });

  it('ignores garbage env values instead of disabling a limit', () => {
    const prev = process.env.WITHDRAWAL_DAILY_LIMIT_CHIPS;
    process.env.WITHDRAWAL_DAILY_LIMIT_CHIPS = 'not-a-number';
    expect(getWithdrawalPolicy().dailyLimitChips).toBe(50_000);
    if (prev === undefined) delete process.env.WITHDRAWAL_DAILY_LIMIT_CHIPS;
    else process.env.WITHDRAWAL_DAILY_LIMIT_CHIPS = prev;
  });
});
