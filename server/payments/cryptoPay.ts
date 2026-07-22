/**
 * crypto-payments-rake phase 4 — minimal Crypto Pay API client (plan §D).
 *
 * Custodial deposit provider (@CryptoBot). We use exactly three surfaces:
 *   - getMe()              — token sanity check at boot.
 *   - createInvoice()      — mint a USDT invoice for a deposit.
 *   - verifyWebhookSignature() — authenticate the invoice_paid webhook.
 *
 * No SDK: a thin wrapper over global fetch. All amounts are decimal USDT strings
 * on the wire (see peg.ts) — money never becomes a float here.
 *
 * Docs: https://help.crypt.bot/crypto-pay-api
 */
import crypto from 'crypto';

const MAINNET_BASE = 'https://pay.crypt.bot/api';
const TESTNET_BASE = 'https://testnet-pay.crypt.bot/api';

export interface CreateInvoiceResult {
  invoiceId: string;
  /** URL the client opens to pay (mini-app invoice URL preferred, then bot URL). */
  payUrl: string;
  status: string;
}

/**
 * The subset of a paid-invoice webhook payload we rely on. Crypto Pay sends more
 * fields; we read defensively (field names have drifted across API versions).
 */
export interface PaidInvoicePayload {
  invoice_id: number | string;
  status: string;
  /** Our deposit Transaction id, echoed back from createInvoice. */
  payload?: string;
  amount?: string;
  paid_amount?: string;
  fee?: string;
  fee_amount?: string;
  paid_usd_rate?: string;
  asset?: string;
  paid_asset?: string;
}

export interface CryptoPayWebhookUpdate {
  update_id: number;
  update_type: string;
  request_date?: string;
  payload: PaidInvoicePayload;
}

export class CryptoPayClient {
  private readonly token: string;
  private readonly base: string;

  constructor(opts: { token: string; testnet: boolean }) {
    this.token = opts.token;
    this.base = opts.testnet ? TESTNET_BASE : MAINNET_BASE;
  }

  /** True when a token is configured — deposits are disabled otherwise. */
  static fromEnv(): CryptoPayClient | null {
    const token = (process.env.CRYPTO_PAY_TOKEN ?? '').trim();
    if (token === '') return null;
    const testnet = process.env.CRYPTO_PAY_TESTNET === 'true';
    return new CryptoPayClient({ token, testnet });
  }

  private async call<T>(method: string, body?: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.base}/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Crypto-Pay-API-Token': this.token,
      },
      body: JSON.stringify(body ?? {}),
    });
    const json = (await res.json()) as { ok: boolean; result?: T; error?: unknown };
    if (!json.ok) {
      throw new Error(`[CryptoPay] ${method} failed: ${JSON.stringify(json.error)}`);
    }
    return json.result as T;
  }

  /** Token sanity check — returns the app name on success. Throws on a bad token. */
  async getMe(): Promise<{ app_id: number; name: string }> {
    return this.call('getMe');
  }

  /**
   * Create a USDT invoice. `amountUsdt` is a decimal string (see chipsToUsdt).
   * `payload` is our deposit Transaction id — echoed back on the webhook so we
   * can match the payment to the pending ledger row idempotently.
   */
  async createInvoice(params: {
    amountUsdt: string;
    payload: string;
    description?: string;
  }): Promise<CreateInvoiceResult> {
    const result = await this.call<{
      invoice_id: number;
      status: string;
      pay_url?: string;
      bot_invoice_url?: string;
      mini_app_invoice_url?: string;
      web_app_invoice_url?: string;
    }>('createInvoice', {
      asset: 'USDT',
      amount: params.amountUsdt,
      payload: params.payload,
      description: params.description,
      allow_comments: false,
      allow_anonymous: true,
    });
    const payUrl =
      result.mini_app_invoice_url ??
      result.bot_invoice_url ??
      result.web_app_invoice_url ??
      result.pay_url ??
      '';
    return { invoiceId: String(result.invoice_id), payUrl, status: result.status };
  }

  /**
   * Authenticate a Crypto Pay webhook. The signature is
   * HMAC-SHA256(rawBody, key = SHA256(token)) as hex, sent in the
   * `crypto-pay-api-signature` header. Constant-time compare.
   *
   * `rawBody` MUST be the exact bytes received (mount express.raw on the webhook
   * route) — re-serializing a parsed JSON body would change the bytes and fail.
   */
  verifyWebhookSignature(rawBody: Buffer | string, signatureHeader: string | undefined): boolean {
    if (!signatureHeader) return false;
    const secret = crypto.createHash('sha256').update(this.token).digest();
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signatureHeader, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }
}
