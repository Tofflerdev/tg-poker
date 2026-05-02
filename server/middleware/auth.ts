import crypto from 'crypto';
import type { WebAppInitData, TelegramUser } from '../../types/index.js';
import { UserRepository } from '../db/UserRepository.js';

// Read env vars once at module load
const BOT_TOKEN = (process.env.BOT_TOKEN || '').trim();
const ALLOW_DEV_AUTH = process.env.ALLOW_DEV_AUTH === 'true';
const IS_PROD = process.env.NODE_ENV === 'production';
const DEV_BYPASS_ACTIVE = ALLOW_DEV_AUTH && !IS_PROD;

// Track synthetic dev-bypass payloads by object identity so createUserFromInitData
// can identify them without any string-equality comparison on the hash field.
const devBypassPayloads = new WeakSet<WebAppInitData>();

/**
 * Boot guard — must be called BEFORE any listener binds.
 * Exits with code 1 if NODE_ENV=production and the env is misconfigured.
 */
export function assertSafeBootOrExit(): void {
  if (!IS_PROD) return;

  if (BOT_TOKEN === '') {
    process.stderr.write('FATAL: refusing to start — BOT_TOKEN is empty in production\n');
    process.exit(1);
  }

  if (ALLOW_DEV_AUTH) {
    process.stderr.write('FATAL: refusing to start — ALLOW_DEV_AUTH=true is set in production\n');
    process.exit(1);
  }

  // Phase 5 / Plan 05-03 / ADMIN-01 / Discretionary fail-closed JWT_SECRET guard.
  // Required for admin login (POST /api/admin/login) and the /admin Socket.io
  // namespace middleware (Plan 05-04). Dev mode falls back to an ephemeral
  // secret in adminAuth.ts; prod must have a stable secret.
  const JWT_SECRET = (process.env.JWT_SECRET ?? '').trim();
  if (JWT_SECRET === '') {
    process.stderr.write('FATAL: refusing to start — JWT_SECRET is empty in production\n');
    process.exit(1);
  }
}

/**
 * Validate Telegram WebApp initData.
 * Returns WebAppInitData on success, null on any failure.
 * Never throws to caller; never fabricates a user on HMAC failure.
 *
 * Dev bypass is active ONLY when ALLOW_DEV_AUTH=true AND NODE_ENV !== 'production'.
 */
export function validateInitData(initData: string): WebAppInitData | null {
  try {
    // Dev bypass: only when DEV_BYPASS_ACTIVE and initData is empty/whitespace
    if (DEV_BYPASS_ACTIVE && initData.trim() === '') {
      const synthetic: WebAppInitData = {
        auth_date: Math.floor(Date.now() / 1000),
        hash: '',
        user: undefined,
      };
      devBypassPayloads.add(synthetic);
      return synthetic;
    }

    const urlParams = new URLSearchParams(initData);
    const providedHashHex = urlParams.get('hash');

    if (!providedHashHex) {
      console.warn('[Auth] HMAC validation failed: missing hash parameter');
      return null;
    }

    // Build data_check_string per Telegram spec (exclude hash, sort alphabetically)
    urlParams.delete('hash');
    const params: string[] = [];
    urlParams.forEach((value, key) => {
      params.push(`${key}=${value}`);
    });
    params.sort();
    const dataCheckString = params.join('\n');

    // Compute HMAC_SHA256(HMAC_SHA256('WebAppData', BOT_TOKEN), dataCheckString)
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(BOT_TOKEN)
      .digest();

    const calculatedBuf = Buffer.from(
      crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex'),
      'utf8'
    );

    const providedBuf = Buffer.from(providedHashHex, 'utf8');

    // Length check before timingSafeEqual to guard against RangeError
    if (calculatedBuf.length !== providedBuf.length) {
      console.warn(
        `[Auth] HMAC validation failed: hash length mismatch ` +
        `(calculated=${calculatedBuf.length}, provided=${providedBuf.length}, ` +
        `providedHash="${providedHashHex}", botTokenLen=${BOT_TOKEN.length})`
      );
      return null;
    }

    if (!crypto.timingSafeEqual(calculatedBuf, providedBuf)) {
      console.warn('[Auth] HMAC validation failed: hash mismatch');
      return null;
    }

    // Validate auth_date freshness (24h window)
    const authDateStr = urlParams.get('auth_date');
    if (!authDateStr) {
      console.warn('[Auth] HMAC validation failed: missing auth_date');
      return null;
    }
    const authTimestamp = parseInt(authDateStr, 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - authTimestamp > 86400) {
      console.warn('[Auth] HMAC validation failed: auth_date too old');
      return null;
    }

    // Parse user JSON
    const userStr = urlParams.get('user');
    if (!userStr) {
      console.warn('[Auth] HMAC validation failed: missing user field');
      return null;
    }

    let user: WebAppInitData['user'];
    try {
      user = JSON.parse(userStr);
    } catch {
      console.warn('[Auth] HMAC validation failed: malformed user JSON');
      return null;
    }

    if (!user || typeof user.id !== 'number') {
      console.warn('[Auth] HMAC validation failed: invalid user object');
      return null;
    }

    return {
      user,
      auth_date: authTimestamp,
      hash: providedHashHex,
      query_id: urlParams.get('query_id') ?? undefined,
    } as WebAppInitData;
  } catch {
    console.warn('[Auth] HMAC validation failed: unexpected error');
    return null;
  }
}

/**
 * Build a TelegramUser from validated WebAppInitData.
 * Rejects on DB error — NO createDevUser fallback on failure.
 * Dev path (via devId) is active ONLY when DEV_BYPASS_ACTIVE is true.
 */
export async function createUserFromInitData(
  data: WebAppInitData,
  devId?: number
): Promise<TelegramUser> {
  // Dev path: only for synthetic payloads produced by the dev bypass
  if (DEV_BYPASS_ACTIVE && devBypassPayloads.has(data)) {
    const id = devId ?? 123456789;
    const playerLabel = id >= 100001 && id <= 100006
      ? `${id - 100000}`
      : `${id}`;
    const devUsername = id >= 100001 && id <= 100006
      ? `dev_player_${id - 100000}`
      : `dev_${id}`;
    console.log(`[Auth] Dev bypass: finding/creating user telegramId=${id}`);
    const user = await UserRepository.findOrCreate(id, devUsername);
    return {
      ...user,
      firstName: `Dev Player ${playerLabel}`,
    };
  }

  if (!data.user) {
    throw new Error('[Auth] No user data in validated initData');
  }

  const user = await UserRepository.findOrCreate(
    data.user.id,
    data.user.username,
    data.user.photo_url
  );

  return {
    ...user,
    firstName: data.user.first_name,
    lastName: data.user.last_name,
    photoUrl: data.user.photo_url,
  };
}
