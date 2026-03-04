import prisma from './prisma.js';
import { generateRandomName } from '../utils/nameGenerator.js';
import { TelegramUser, UserProfile } from '../../types/index.js';

export class UserRepository {
  static async findOrCreate(telegramId: number, username?: string, photoUrl?: string): Promise<TelegramUser> {
    let user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId: BigInt(telegramId),
          telegramUsername: username,
          displayName: generateRandomName(),
          avatarUrl: photoUrl,
          balance: 1000
        }
      });
    } else {
      // Update username/photo if changed (optional, but good for keeping data fresh)
      if (username && user.telegramUsername !== username) {
        await prisma.user.update({
          where: { id: user.id },
          data: { telegramUsername: username }
        });
      }
    }

    return this.mapToTelegramUser(user);
  }

  static async findById(id: number): Promise<TelegramUser | null> {
    const user = await prisma.user.findUnique({
      where: { id }
    });
    return user ? this.mapToTelegramUser(user) : null;
  }

  static async findByTelegramId(telegramId: number): Promise<TelegramUser | null> {
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) }
    });
    return user ? this.mapToTelegramUser(user) : null;
  }

  static async updateBalance(telegramId: number, amount: number): Promise<number> {
    const user = await prisma.user.update({
      where: { telegramId: BigInt(telegramId) },
      data: { balance: { increment: amount } }
    });
    return user.balance;
  }

  static async claimDailyBonus(telegramId: number): Promise<{ success: boolean; balance: number; nextClaimAt?: Date; message?: string }> {
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) }
    });

    if (!user) return { success: false, balance: 0, message: 'User not found' };

    if (user.balance >= 1000) {
      return { success: false, balance: user.balance, message: 'Balance is already 1000 or more' };
    }

    const now = new Date();
    const lastRefill = user.lastDailyRefill;
    
    if (lastRefill) {
      const nextClaim = new Date(lastRefill.getTime() + 24 * 60 * 60 * 1000);
      if (now < nextClaim) {
        return { success: false, balance: user.balance, nextClaimAt: nextClaim, message: 'Daily bonus already claimed' };
      }
    }

    const updatedUser = await prisma.user.update({
      where: { telegramId: BigInt(telegramId) },
      data: {
        balance: 1000,
        lastDailyRefill: now
      }
    });

    const nextClaimAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return { success: true, balance: updatedUser.balance, nextClaimAt };
  }

  static async updateProfile(telegramId: number, displayName?: string, avatarUrl?: string): Promise<UserProfile> {
    const data: any = {};
    if (displayName) data.displayName = displayName;
    if (avatarUrl) data.avatarUrl = avatarUrl;

    const user = await prisma.user.update({
      where: { telegramId: BigInt(telegramId) },
      data
    });

    return this.mapToUserProfile(user);
  }

  static async getProfile(telegramId: number): Promise<UserProfile | null> {
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) }
    });
    return user ? this.mapToUserProfile(user) : null;
  }

  static async updateStats(telegramId: number, won: boolean, winnings: number) {
    await prisma.user.update({
      where: { telegramId: BigInt(telegramId) },
      data: {
        handsPlayed: { increment: 1 },
        handsWon: won ? { increment: 1 } : undefined,
        totalWinnings: { increment: winnings },
        biggestPot: winnings > 0 ? { set: Math.max(winnings, 0) } : undefined // Logic for biggest pot needs check against current biggest
      }
    });
    
    // Correct logic for biggest pot:
    if (winnings > 0) {
        const user = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
        if (user && winnings > user.biggestPot) {
            await prisma.user.update({
                where: { telegramId: BigInt(telegramId) },
                data: { biggestPot: winnings }
            });
        }
    }
  }

  private static mapToTelegramUser(user: any): TelegramUser {
    const now = new Date();
    const lastRefill = user.lastDailyRefill;
    let canClaimDaily = false;
    
    if (user.balance < 1000) {
        if (!lastRefill) {
            canClaimDaily = true;
        } else {
            const nextClaim = new Date(lastRefill.getTime() + 24 * 60 * 60 * 1000);
            if (now >= nextClaim) {
                canClaimDaily = true;
            }
        }
    }

    return {
      id: user.id.toString(),
      telegramId: Number(user.telegramId),
      username: user.telegramUsername || undefined,
      displayName: user.displayName,
      firstName: '', // Not stored in DB, usually comes from initData
      avatarUrl: user.avatarUrl || undefined,
      balance: user.balance,
      lastDailyRefill: user.lastDailyRefill?.toISOString(),
      canClaimDaily
    };
  }

  private static mapToUserProfile(user: any): UserProfile {
    return {
      telegramId: Number(user.telegramId),
      username: user.telegramUsername || undefined,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl || undefined,
      totalWinnings: user.totalWinnings,
      handsPlayed: user.handsPlayed,
      handsWon: user.handsWon,
      biggestPot: user.biggestPot,
      joinedAt: user.createdAt.toISOString()
    };
  }
}
