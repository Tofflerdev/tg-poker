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
import { getMiniAppUrl } from '../config/app.js';

const MAINNET_BASE = 'https://pay.crypt.bot/api';
const TESTNET_BASE = 'https://testnet-pay.crypt.bot/api';

/**
 * How long a deposit invoice stays payable (1 hour). The API defaults to no
 * expiry, which would leave abandoned invoices — and their pending ledger rows —
 * open indefinitely. Long enough for a distracted payer, short enough that a
 * stale row means something.
 */
export const INVOICE_TTL_SECONDS = 3600;

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

  /**
   * §H: transfer coins from the app's Crypto Pay wallet to a Telegram user
   * (house rake withdrawal → owner). `spendId` is a required unique idempotency
   * key — Crypto Pay dedupes retries with the same spend_id, so a repeated call
   * never double-sends. The recipient must have interacted with the (test)bot.
   */
  async transfer(params: {
    userId: number;
    amountUsdt: string;
    spendId: string;
    comment?: string;
  }): Promise<{ transfer_id: number; status: string }> {
    const body: Record<string, unknown> = {
      user_id: params.userId,
      asset: 'USDT',
      amount: params.amountUsdt,
      spend_id: params.spendId,
      comment: params.comment,
      disable_send_notification: false,
    };
    try {
      return await this.call('transfer', body);
    } catch (err) {
      // Crypto Pay forbids comments for apps younger than 30 days
      // (CANNOT_ATTACH_COMMENT, hit on prod 2026-07-25). The comment is
      // cosmetic, so drop it and send the money rather than failing the payout.
      // Safe to retry: the call was REJECTED (nothing processed) and the retry
      // carries the same spend_id, which the provider dedupes anyway.
      if (params.comment && String((err as Error).message).includes('CANNOT_ATTACH_COMMENT')) {
        console.warn('[CryptoPay] comments not allowed yet (app < 30 days) — retrying without one');
        return this.call('transfer', { ...body, comment: undefined });
      }
      throw err;
    }
  }

  /**
   * Transfers matching a `spend_id` (the API filters on it directly). This is
   * how we settle an AMBIGUOUS transfer failure: when the HTTP call blew up we
   * cannot know whether the provider processed it, and refunding a payout that
   * actually went out would pay the player twice. Ask instead of assuming.
   */
  async getTransfersBySpendId(spendId: string): Promise<Array<{ transfer_id: number; status: string }>> {
    const result = await this.call<{ items?: Array<{ transfer_id: number; status: string }> }>(
      'getTransfers',
      { spend_id: spendId, count: 10 },
    );
    return result?.items ?? [];
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
    /** Seconds until the invoice expires (API allows 1…2678400). */
    expiresIn?: number;
  }): Promise<CreateInvoiceResult> {
    const returnUrl = getMiniAppUrl();
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
      // "Back to the app" button CryptoBot shows once the invoice is paid.
      // Only sent when a link is configured (BOT_USERNAME / MINI_APP_URL) —
      // paid_btn_url is mandatory whenever paid_btn_name is present, so the two
      // travel together or not at all.
      ...(returnUrl ? { paid_btn_name: 'openBot', paid_btn_url: returnUrl } : {}),
      // Without `expires_in` an unpaid invoice lives forever and its pending
      // ledger row never resolves. Bound it so abandoned deposits age out.
      expires_in: params.expiresIn ?? INVOICE_TTL_SECONDS,
      // Shown by CryptoBot right after payment — sets the expectation that the
      // balance updates on its own (the webhook credits asynchronously).
      hidden_message: 'Chips are credited to your balance automatically.',
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
   * Most recent PAID invoices (newest last). Used only to observe the current
   * commission rate at boot (see depositFee.ts) — Crypto Pay publishes the rate
   * nowhere else, but every paid invoice carries `paid_amount` + `fee_amount`.
   */
  async getPaidInvoices(count = 10): Promise<PaidInvoicePayload[]> {
    const result = await this.call<{ items?: PaidInvoicePayload[] }>('getInvoices', {
      status: 'paid',
      count,
    });
    return result?.items ?? [];
  }

  /**
   * Look up specific invoices by id (API: `invoice_ids`, comma-separated). This
   * is the reconciliation path — the authoritative answer to "was this invoice
   * ever paid?" when no webhook arrived. Returns whatever the API knows about;
   * unknown ids are simply absent.
   */
  async getInvoicesByIds(invoiceIds: string[]): Promise<PaidInvoicePayload[]> {
    if (invoiceIds.length === 0) return [];
    const result = await this.call<{ items?: PaidInvoicePayload[] }>('getInvoices', {
      invoice_ids: invoiceIds.join(','),
      count: invoiceIds.length,
    });
    return result?.items ?? [];
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

// Shared singleton so index.ts (deposits/webhook) and adminMutations (house
// withdrawal) use the same configured client. Lazily created once from env.
let _instance: CryptoPayClient | null | undefined;
export function getCryptoPay(): CryptoPayClient | null {
  if (_instance === undefined) _instance = CryptoPayClient.fromEnv();
  return _instance;
}
