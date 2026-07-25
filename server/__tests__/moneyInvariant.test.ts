import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * crypto-payments-rake phase 6 — the money invariant.
 *
 * deposits − withdrawals must equal every balance + chips on tables + baseline.
 * Anything else means chips were minted or burned.
 */
const db = vi.hoisted(() => ({
  deposits: 0,
  withdrawals: 0, // stored negative, as the ledger does
  balances: 0,
}));

const tables = vi.hoisted(() => ({ list: [] as any[] }));

vi.mock('../db/prisma.js', () => ({
  default: {
    transaction: {
      aggregate: async ({ where }: any) => ({
        _sum: { amount: where.type === 'deposit' ? db.deposits : db.withdrawals },
      }),
    },
    user: {
      aggregate: async () => ({ _sum: { balance: db.balances } }),
    },
  },
}));

vi.mock('../TableManager.js', () => ({
  tableManager: { getAllTables: () => tables.list },
}));

import {
  computeMoneyInvariant,
  checkMoneyInvariant,
  countChipsInPlay,
  __resetInvariantForTests,
} from '../payments/moneyInvariant.js';

/** A table whose seats hold `stacks` and whose pot holds `pot`. */
function table(stacks: Array<number | null>, pot = 0) {
  return {
    getState: () => ({
      seats: stacks.map((c) => (c === null ? null : { chips: c })),
      totalPot: pot,
    }),
  };
}

describe('money invariant', () => {
  beforeEach(() => {
    __resetInvariantForTests();
    db.deposits = 0;
    db.withdrawals = 0;
    db.balances = 0;
    tables.list = [];
    process.env.MONEY_INVARIANT_BASELINE_CHIPS = '';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('balances on the real prod numbers of 2026-07-25', async () => {
    // deposits 15520 − withdrawals 1000 = 14520
    // balances 13356 (bankroll 4850 + house 6 + player 8500) + in play 0 + baseline 1164
    db.deposits = 15_520;
    db.withdrawals = -1000;
    db.balances = 13_356;
    process.env.MONEY_INVARIANT_BASELINE_CHIPS = '1164';

    const report = await computeMoneyInvariant();

    expect(report.ledgerNetChips).toBe(14_520);
    expect(report.driftChips).toBe(0);
    expect(report.ok).toBe(true);
  });

  it('counts chips that are already in the pot, not just the stacks', async () => {
    // Mid-hand: bets have LEFT the stacks and sit in the pot. Counting stacks
    // alone would report a false shortfall equal to the pot on every check.
    db.deposits = 1000;
    db.balances = 0;
    tables.list = [table([400, 300, null], 300)];

    expect(countChipsInPlay()).toBe(1000);
    expect((await computeMoneyInvariant()).ok).toBe(true);
  });

  it('counts bot stacks too (they are funded from the bankroll)', async () => {
    db.deposits = 5000;
    db.balances = 3000;
    tables.list = [table([1000, null]), table([1000, null])];
    expect((await computeMoneyInvariant()).driftChips).toBe(0);
  });

  it('spots minted chips', async () => {
    db.deposits = 1000;
    db.balances = 1500; // 500 out of thin air
    const report = await computeMoneyInvariant();
    expect(report.driftChips).toBe(-500);
    expect(report.ok).toBe(false);
  });

  it('spots burned chips', async () => {
    db.deposits = 1000;
    db.balances = 700;
    expect((await computeMoneyInvariant()).driftChips).toBe(300);
  });

  it('treats a withdrawal as money leaving, not arriving', async () => {
    db.deposits = 10_000;
    db.withdrawals = -2500;
    db.balances = 7500;
    expect((await computeMoneyInvariant()).ok).toBe(true);
  });

  it('ignores a garbage baseline instead of skewing the books', async () => {
    process.env.MONEY_INVARIANT_BASELINE_CHIPS = 'oops';
    db.deposits = 100;
    db.balances = 100;
    expect((await computeMoneyInvariant()).baselineChips).toBe(0);
  });

  it('does not cry wolf over an in-flight buy-in', async () => {
    // First read catches the gap between "balance debited" and "player seated";
    // the second read sees the chips on the table.
    db.deposits = 1000;
    db.balances = 0;
    tables.list = [];
    vi.useFakeTimers();

    const promise = checkMoneyInvariant();
    // The buy-in lands while the checker waits to confirm.
    tables.list = [table([1000, null])];
    await vi.runAllTimersAsync();
    const report = await promise;

    expect(report.ok).toBe(true);
    expect(report.confirmed).toBe(false);
    vi.useRealTimers();
  });

  it('confirms a drift that is still there on the second look', async () => {
    db.deposits = 1000;
    db.balances = 400; // genuinely missing 600
    vi.useFakeTimers();

    const promise = checkMoneyInvariant();
    await vi.runAllTimersAsync();
    const report = await promise;

    expect(report.ok).toBe(false);
    expect(report.confirmed).toBe(true);
    expect(report.driftChips).toBe(600);
    vi.useRealTimers();
  });
});
