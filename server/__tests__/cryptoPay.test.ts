import { describe, it, expect, vi, afterEach } from 'vitest';
import crypto from 'crypto';
import { CryptoPayClient, INVOICE_TTL_SECONDS } from '../payments/cryptoPay.js';

const TOKEN = '12345:test-token';

function sign(rawBody: string, token: string): string {
  const secret = crypto.createHash('sha256').update(token).digest();
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

describe('CryptoPayClient.verifyWebhookSignature', () => {
  const client = new CryptoPayClient({ token: TOKEN, testnet: true });
  const body = JSON.stringify({ update_type: 'invoice_paid', payload: { invoice_id: 42 } });

  it('accepts a signature made with the correct token', () => {
    expect(client.verifyWebhookSignature(body, sign(body, TOKEN))).toBe(true);
  });

  it('accepts when rawBody is a Buffer (as express provides it)', () => {
    expect(client.verifyWebhookSignature(Buffer.from(body, 'utf8'), sign(body, TOKEN))).toBe(true);
  });

  it('rejects a signature made with the wrong token', () => {
    expect(client.verifyWebhookSignature(body, sign(body, 'wrong-token'))).toBe(false);
  });

  it('rejects a tampered body', () => {
    const sig = sign(body, TOKEN);
    const tampered = JSON.stringify({ update_type: 'invoice_paid', payload: { invoice_id: 99 } });
    expect(client.verifyWebhookSignature(tampered, sig)).toBe(false);
  });

  it('rejects a missing signature header', () => {
    expect(client.verifyWebhookSignature(body, undefined)).toBe(false);
  });

  it('rejects a garbage signature without throwing', () => {
    expect(client.verifyWebhookSignature(body, 'not-hex-!!')).toBe(false);
  });
});

/**
 * API-contract checks against the Crypto Pay reference
 * (https://help.send.tg/en/articles/10279948-crypto-pay-api).
 */
describe('CryptoPayClient request contract', () => {
  const client = new CryptoPayClient({ token: TOKEN, testnet: true });

  function stubFetch(result: unknown) {
    const calls: Array<{ url: string; body: any }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      return { json: async () => ({ ok: true, result }) } as any;
    }));
    return calls;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('createInvoice bounds the invoice lifetime (no endless pending rows)', async () => {
    const calls = stubFetch({ invoice_id: 1, status: 'active', bot_invoice_url: 'u' });
    await client.createInvoice({ amountUsdt: '50.00', payload: '123' });
    expect(calls[0].url).toContain('/createInvoice');
    expect(calls[0].body).toMatchObject({
      asset: 'USDT',
      amount: '50.00',
      payload: '123',
      expires_in: INVOICE_TTL_SECONDS,
      allow_comments: false,
    });
  });

  it('adds a "back to the app" button when a bot link is configured', async () => {
    const prev = process.env.BOT_USERNAME;
    process.env.BOT_USERNAME = '@Testpoke_bot';
    const calls = stubFetch({ invoice_id: 1, status: 'active', bot_invoice_url: 'u' });

    await client.createInvoice({ amountUsdt: '5.00', payload: '1' });

    // paid_btn_url is mandatory whenever paid_btn_name is present.
    expect(calls[0].body).toMatchObject({
      paid_btn_name: 'openBot',
      paid_btn_url: 'https://t.me/Testpoke_bot',
    });
    if (prev === undefined) delete process.env.BOT_USERNAME;
    else process.env.BOT_USERNAME = prev;
  });

  it('omits the button entirely when no link is configured', async () => {
    const prevUser = process.env.BOT_USERNAME;
    const prevUrl = process.env.MINI_APP_URL;
    delete process.env.BOT_USERNAME;
    delete process.env.MINI_APP_URL;
    const calls = stubFetch({ invoice_id: 1, status: 'active', bot_invoice_url: 'u' });

    await client.createInvoice({ amountUsdt: '5.00', payload: '1' });

    expect(calls[0].body).not.toHaveProperty('paid_btn_name');
    expect(calls[0].body).not.toHaveProperty('paid_btn_url');
    if (prevUser !== undefined) process.env.BOT_USERNAME = prevUser;
    if (prevUrl !== undefined) process.env.MINI_APP_URL = prevUrl;
  });

  it('getPaidInvoices asks only for paid invoices and unwraps `items`', async () => {
    const calls = stubFetch({ items: [{ invoice_id: 7, status: 'paid' }] });
    const items = await client.getPaidInvoices(5);
    expect(calls[0].url).toContain('/getInvoices');
    expect(calls[0].body).toMatchObject({ status: 'paid', count: 5 });
    expect(items).toHaveLength(1);
  });

  it('getPaidInvoices tolerates a response with no items', async () => {
    stubFetch({});
    expect(await client.getPaidInvoices()).toEqual([]);
  });

  it('still pays out when the app is too young to attach a comment', async () => {
    // Real prod failure 2026-07-25: apps under 30 days old get
    // CANNOT_ATTACH_COMMENT. The comment is cosmetic — the payout is not.
    const calls: Array<Record<string, unknown>> = [];
    let attempt = 0;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
      calls.push(JSON.parse(init.body));
      attempt += 1;
      return {
        json: async () =>
          attempt === 1
            ? { ok: false, error: { code: 400, name: 'CANNOT_ATTACH_COMMENT' } }
            : { ok: true, result: { transfer_id: 42, status: 'completed' } },
      } as any;
    }));

    const res = await client.transfer({
      userId: 158394554,
      amountUsdt: '10.00',
      spendId: 'wd-1',
      comment: 'Withdrawal',
    });

    expect(res.transfer_id).toBe(42);
    expect(calls).toHaveLength(2);
    expect(calls[1].comment).toBeUndefined();
    // Same idempotency key on the retry — the provider can never double-send.
    expect(calls[1].spend_id).toBe('wd-1');
    expect(calls[1].amount).toBe('10.00');
  });

  it('does not swallow other transfer errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      json: async () => ({ ok: false, error: { code: 403, name: 'METHOD_DISABLED' } }),
    } as any)));

    await expect(
      client.transfer({ userId: 1, amountUsdt: '10.00', spendId: 'wd-2', comment: 'x' }),
    ).rejects.toThrow(/METHOD_DISABLED/);
  });
});

describe('CryptoPayClient.fromEnv', () => {
  it('returns null when no token is configured', () => {
    const prev = process.env.CRYPTO_PAY_TOKEN;
    delete process.env.CRYPTO_PAY_TOKEN;
    expect(CryptoPayClient.fromEnv()).toBeNull();
    if (prev !== undefined) process.env.CRYPTO_PAY_TOKEN = prev;
  });
});
