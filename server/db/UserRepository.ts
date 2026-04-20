import prisma from './prisma.js';
import { generateRandomName } from '../utils/nameGenerator.js';
import { TelegramUser, UserProfile } from '../../types/index.js';
import { randomAvatarId } from '../../types/avatars.js';

export class UserRepository {
  static async findOrCreate(telegramId: number, username?: string, _photoUrl?: string): Promise<TelegramUser> {
    let user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) }
    });

    if (!user) {
      // D-12: atomic assign — single INSERT writes avatarId.
      // D-15: Telegram photo_url is NOT stored for rendering — column left null.
      user = await prisma.user.create({
        data: {
          telegramId: BigInt(telegramId),
          telegramUsername: username,
          displayName: generateRandomName(),
          avatarUrl: null,
          avatarId: randomAvatarId(),
          balance: 1000
        }
      });
    } else {
      // Update username if changed (optional, but good for keeping data fresh)
      if (username && user.telegramUsername !== username) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { telegramUsername: username }
        });
      }
      // Idempotent backfill for grandfathered users (RESEARCH Open Q4).
      // One-time UPDATE the first time a null-avatarId user hits findOrCreate;
      // subsequent calls no-op because avatarId is now populated.
      if (!user.avatarId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { avatarId: randomAvatarId() }
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

  /**
   * Plan 02-02: persist a validated AvatarId slug.
   * Caller MUST have already verified the slug against AVATARS (T-02-02-02);
   * this method does not re-validate — it is a trusted write path.
   */
  static async updateAvatarId(telegramId: number, avatarId: string): Promise<void> {
    await prisma.user.update({
      where: { telegramId: BigInt(telegramId) },
      data: { avatarId }
    });
  }

  /**
   * Plan 03-02 / RESILIENCE-02 (D-14, D-15, D-17): hand-boundary chip checkpoint.
   *
   * Writes the trio (currentChips, currentTableId, currentSeat) for one seated
   * player. Called per `onHandComplete` perPlayer entry by
   * checkpointSeatedPlayers(). NEVER writes mid-hand ephemeral state
   * (holeCards, street bets, turn timer) per D-17.
   *
   * NOTE: BigInt conversion mirrors `updateBalance` — telegramId param is a
   * string here (HandCompletePerPlayer.telegramId), converted via
   * BigInt(Number(tid)). Telegram IDs are 10-digit, safely within Number's
   * safe-integer range.
   */
  static async checkpointSeat(
    telegramId: string,
    data: { currentChips: number; currentTableId: string; currentSeat: number }
  ): Promise<void> {
    await prisma.user.update({
      where: { telegramId: BigInt(Number(telegramId)) },
      data: {
        currentChips: data.currentChips,
        currentTableId: data.currentTableId,
        currentSeat: data.currentSeat,
      },
    });
  }

  /**
   * Plan 02-08: record ToS acceptance for an authenticated user.
   *
   * Caller MUST have already validated the `version` string (T-02-08-02:
   * non-empty, length ≤ 16). This method is a trusted write path — it
   * stamps `tosAcceptedAt = now()` and `tosVersion = version` in a single
   * UPDATE and returns the updated timestamp fields for the ack payload.
   *
   * Idempotent by design: a second call from the same telegramId simply
   * re-stamps the timestamp (new `now()`), which is acceptable per D-27 —
   * we record the most recent acceptance of the given version.
   */
  static async acceptTos(
    telegramId: number,
    version: string
  ): Promise<{ tosAcceptedAt: Date; tosVersion: string }> {
    const now = new Date();
    const user = await prisma.user.update({
      where: { telegramId: BigInt(telegramId) },
      data: { tosAcceptedAt: now, tosVersion: version }
    });
    // Prisma returns Date | null — we just wrote both, so non-null is guaranteed.
    return {
      tosAcceptedAt: user.tosAcceptedAt!,
      tosVersion: user.tosVersion!
    };
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
      avatarId: user.avatarId || undefined,
      tosAcceptedAt: user.tosAcceptedAt?.toISOString(),
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
