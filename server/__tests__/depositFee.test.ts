import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DEFAULT_DEPOSIT_FEE_BPS,
  depositFeeChips,
  describeDepositInvoice,
  formatFeePercent,
  getDepositFeeBps,
  getDepositFeeInfo,
  netDepositChips,
  observeDepositFee,
  refreshFeeFromHistory,
  __resetDepositFeeForTests,
} from '../payments/depositFee.js';

/**
 * crypto-payments-rake phase 4 — the Crypto Pay commission quote.
 *
 * The provider does not publish its rate anywhere in the API (probed 2026-07-25:
 * absent from getStats/getCurrencies, and unpaid invoices carry no fee fields),
 * so we observe it from paid invoices. These tests pin that behaviour and the
 * net-chip arithmetic the deposit UI quotes.
 */
describe('deposit fee', () => {
  beforeEach(() => {
    __resetDepositFeeForTests();
  });

  it('falls back to the built-in 3% until a payment is observed', () => {
    expect(getDepositFeeBps()).toBe(DEFAULT_DEPOSIT_FEE_BPS);
    expect(getDepositFeeInfo()).toMatchObject({ bps: 300, source: 'default', observedAt: null });
  });

  it('learns the rate from a paid invoice (the real 2026-07-25 payment)', () => {
    // Invoice 885777: paid 50 USDT, fee 1.5 USDT → 3%.
    expect(observeDepositFee(5000, 150)).toBe(true);
    expect(getDepositFeeBps()).toBe(300);
    expect(getDepositFeeInfo().source).toBe('observed');
  });

  it('follows a rate change on the provider side', () => {
    observeDepositFee(5000, 150);
    observeDepositFee(5000, 250); // Crypto Pay moves to 5%
    expect(getDepositFeeBps()).toBe(500);
  });

  it('ignores nonsense observations instead of quoting them', () => {
    observeDepositFee(5000, 150); // establish 3%
    expect(observeDepositFee(0, 10)).toBe(false); // no paid amount
    expect(observeDepositFee(5000, -1)).toBe(false); // negative fee
    expect(observeDepositFee(5000, 6000)).toBe(false); // fee above the payment
    expect(observeDepositFee(100, 50)).toBe(false); // 50% — beyond the sanity ceiling
    expect(observeDepositFee(Number.NaN, 1)).toBe(false);
    expect(getDepositFeeBps()).toBe(300); // unchanged
  });

  it('quotes net chips the player will actually receive', () => {
    // The presets, at the observed 3%.
    expect(netDepositChips(500, 300)).toBe(485); // $5
    expect(netDepositChips(1000, 300)).toBe(970); // $10
    expect(netDepositChips(5000, 300)).toBe(4850); // $50 — matches invoice 885777
    expect(netDepositChips(10_000, 300)).toBe(9700); // $100 — matches invoice 885239
  });

  it('floors the fee like the rest of the peg (never over-charges the quote)', () => {
    // 777 chips at 3% = 23.31 → the webhook's usdtToCents floors to 23.
    expect(depositFeeChips(777, 300)).toBe(23);
    expect(netDepositChips(777, 300)).toBe(754);
    expect(depositFeeChips(0, 300)).toBe(0);
    expect(depositFeeChips(-100, 300)).toBe(0);
  });

  it('refreshes from invoice history, taking the newest usable entry', async () => {
    const client = {
      getPaidInvoices: vi.fn(async () => [
        { invoice_id: 1, status: 'paid', paid_amount: '10', fee_amount: '0.3' },
        { invoice_id: 2, status: 'paid', paid_amount: '100', fee_amount: '4' }, // newest → 4%
      ]),
    };
    const info = await refreshFeeFromHistory(client as any);
    expect(info).toMatchObject({ bps: 400, source: 'observed' });
  });

  /**
   * Regression: the 2026-08-12 mainnet smoke minted an invoice reading
   * "Deposit 2000 chips" and credited 1940. The invoice text is the last thing a
   * player reads before paying, so it must quote what the deposit screen quotes.
   */
  it('describes an invoice in NET chips, never the gross amount', () => {
    expect(describeDepositInvoice('Deposit', 2000)).toBe(
      'Deposit $20.00 → 1,940 chips (after 3% Crypto Pay fee)',
    );
    expect(describeDepositInvoice('Bankroll deposit', 2000)).toContain('1,940 chips');
  });

  it('follows the observed rate into the invoice text', () => {
    observeDepositFee(10_000, 400); // 4%
    expect(describeDepositInvoice('Deposit', 2000)).toBe(
      'Deposit $20.00 → 1,920 chips (after 4% Crypto Pay fee)',
    );
  });

  it('formats the rate the way the client does', () => {
    expect(formatFeePercent(300)).toBe('3%');
    expect(formatFeePercent(275)).toBe('2.75%');
  });

  it('survives an API failure by keeping the default rate', async () => {
    const client = { getPaidInvoices: vi.fn(async () => { throw new Error('502'); }) };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const info = await refreshFeeFromHistory(client as any);
    expect(info).toMatchObject({ bps: DEFAULT_DEPOSIT_FEE_BPS, source: 'default' });
  });
});
