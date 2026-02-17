import crypto from 'crypto';
import type { WebAppInitData, TelegramUser } from '../../types/index.js';

// Telegram Bot Token (should be from environment variable in production)
const BOT_TOKEN = process.env.BOT_TOKEN || '';

/**
 * Validate Telegram WebApp initData
 * See: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateInitData(initData: string): { valid: boolean; data?: WebAppInitData } {
  // For development: accept empty initData
  if (process.env.NODE_ENV === 'development' && initData === '') {
    return { valid: true };
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
export function createUserFromInitData(
  socketId: string, 
  initData: WebAppInitData
): TelegramUser {
  if (!initData.user) {
    // Return mock user for development
    return {
      id: socketId,
      telegramId: parseInt(socketId.slice(0, 8), 16) || 123456789,
      firstName: 'Player',
      username: 'player_' + socketId.slice(0, 4),
      balance: 1000,
    };
  }

  return {
    id: socketId,
    telegramId: initData.user.id,
    username: initData.user.username,
    firstName: initData.user.first_name,
    lastName: initData.user.last_name,
    photoUrl: initData.user.photo_url,
    balance: 1000, // Default starting balance
  };
}
