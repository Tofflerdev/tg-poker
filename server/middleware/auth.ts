import crypto from 'crypto';
import type { WebAppInitData, TelegramUser } from '../../types/index.js';
import { UserRepository } from '../db/UserRepository.js';

// Telegram Bot Token (should be from environment variable in production)
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const IS_DEV = process.env.NODE_ENV === 'development';

/**
 * Validate Telegram WebApp initData
 * See: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateInitData(initData: string): { valid: boolean; data?: WebAppInitData } {
  // For development: accept any initData (empty, mock, or real)
  if (IS_DEV) {
    if (initData === '' || initData.includes('mock_hash_for_dev') || initData.startsWith('query_id=') || initData.includes('user=')) {
      // Try to parse user data from mock initData if present
      try {
        const urlParams = new URLSearchParams(initData);
        const userStr = urlParams.get('user');
        if (userStr) {
          const userData = JSON.parse(userStr);
          return {
            valid: true,
            data: {
              user: userData,
              auth_date: parseInt(urlParams.get('auth_date') || '0', 10),
              hash: urlParams.get('hash') || 'dev',
              query_id: urlParams.get('query_id') || undefined,
            } as WebAppInitData
          };
        }
      } catch {
        // Parsing failed, return empty data
      }
      return { valid: true, data: {} as WebAppInitData };
    }
  }

  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    
    if (!hash) {
      return { valid: false };
    }

    // Remove hash from data_check_string
    urlParams.delete('hash');

    // Sort params alphabetically and create data_check_string
    const params: string[] = [];
    urlParams.forEach((value, key) => {
      params.push(`${key}=${value}`);
    });
    params.sort();
    const dataCheckString = params.join('\n');

    // Create secret key from bot token
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(BOT_TOKEN)
      .digest();

    // Calculate hash
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // Compare hashes
    if (calculatedHash !== hash) {
      return { valid: false };
    }

    // Parse user data
    const userStr = urlParams.get('user');
    const authDate = urlParams.get('auth_date');
    
    if (!userStr || !authDate) {
      return { valid: false };
    }

    // Check auth_date is not too old (24 hours)
    const authTimestamp = parseInt(authDate, 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - authTimestamp > 86400) {
      return { valid: false };
    }

    const userData = JSON.parse(userStr);
    
    return {
      valid: true,
      data: {
        user: userData,
        auth_date: authTimestamp,
        hash,
        query_id: urlParams.get('query_id') || undefined,
      } as WebAppInitData
    };
  } catch (error) {
    console.error('Error validating initData:', error);
    return { valid: false };
  }
}

/**
 * Create or get Telegram user from initData
 */
export async function createUserFromInitData(
  socketId: string,
  initData: WebAppInitData,
  devId?: number
): Promise<TelegramUser> {
  // In dev mode with devId, always use the dev path for consistent behavior
  if (IS_DEV && devId) {
    return createDevUser(devId);
  }

  if (!initData.user) {
    // No user data and no devId — use generic dev fallback
    if (IS_DEV) {
      return createDevUser(devId || 123456789);
    }
    throw new Error('No user data in initData');
  }

  try {
    const user = await UserRepository.findOrCreate(
      initData.user.id,
      initData.user.username,
      initData.user.photo_url
    );

    return {
      ...user,
      firstName: initData.user.first_name,
      lastName: initData.user.last_name,
      photoUrl: initData.user.photo_url,
    };
  } catch (dbError) {
    if (IS_DEV) {
      console.error('[Auth] DB error, falling back to in-memory user:', dbError);
      return createDevUser(initData.user.id || devId || 123456789);
    }
    throw dbError;
  }
}

/**
 * Create a dev user — tries DB first, falls back to in-memory
 */
async function createDevUser(devTelegramId: number): Promise<TelegramUser> {
  const playerLabel = devTelegramId >= 100001 && devTelegramId <= 100006
    ? `${devTelegramId - 100000}`
    : `${devTelegramId}`;
  const devUsername = devTelegramId >= 100001 && devTelegramId <= 100006
    ? `dev_player_${devTelegramId - 100000}`
    : `dev_${devTelegramId}`;

  console.log(`[Auth] Dev mode: Creating/finding user with telegramId=${devTelegramId}, username=${devUsername}`);

  try {
    const user = await UserRepository.findOrCreate(devTelegramId, devUsername);
    return {
      ...user,
      firstName: `Dev Player ${playerLabel}`,
    };
  } catch (dbError) {
    console.error('[Auth] DB error in dev mode, creating in-memory user:', dbError);
    return {
      id: `dev-${devTelegramId}`,
      telegramId: devTelegramId,
      username: devUsername,
      displayName: `Dev Player ${playerLabel}`,
      firstName: `Dev Player ${playerLabel}`,
      balance: 1000,
    };
  }
}
