import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { CryptoPayClient } from '../payments/cryptoPay.js';

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

describe('CryptoPayClient.fromEnv', () => {
  it('returns null when no token is configured', () => {
    const prev = process.env.CRYPTO_PAY_TOKEN;
    delete process.env.CRYPTO_PAY_TOKEN;
    expect(CryptoPayClient.fromEnv()).toBeNull();
    if (prev !== undefined) process.env.CRYPTO_PAY_TOKEN = prev;
  });
});
