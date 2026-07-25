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
});

describe('CryptoPayClient.fromEnv', () => {
  it('returns null when no token is configured', () => {
    const prev = process.env.CRYPTO_PAY_TOKEN;
    delete process.env.CRYPTO_PAY_TOKEN;
    expect(CryptoPayClient.fromEnv()).toBeNull();
    if (prev !== undefined) process.env.CRYPTO_PAY_TOKEN = prev;
  });
});
