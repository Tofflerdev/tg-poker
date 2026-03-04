import crypto from 'crypto';
import type { WebAppInitData, TelegramUser } from '../../types/index.js';
import { UserRepository } from '../db/UserRepository.js';

// Telegram Bot Token (should be from environment variable in production)
const BOT_TOKEN = process.env.BOT_TOKEN || '';

/**
 * Validate Telegram WebApp initData
 * See: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateInitData(initData: string): { valid: boolean; data?: WebAppInitData } {
  // For development: accept empty initData
  if (process.env.NODE_ENV === 'development' && initData === '') {
    return { valid: true, data: {} as WebAppInitData };
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
  initData: WebAppInitData
): Promise<TelegramUser> {
  if (!initData.user) {
    // Return mock user for development
    // Use a fixed ID for dev to test persistence if needed, or random
    const devTelegramId = 123456789; 
    const user = await UserRepository.findOrCreate(devTelegramId, 'dev_user');
    
    return {
      ...user,
      firstName: 'Dev Player',
      // We use the DB id, but we might need to map it to string if it's not already
    };
  }

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
}
