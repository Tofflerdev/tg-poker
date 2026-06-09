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

  /**
   * Playtest bots: idempotently ensure a bot User row exists for a (negative)
   * reserved telegramId. balance is 0 (bots don't use a wallet) and isBot=true
   * so leaderboard/stats queries can exclude them. Safe to call before every
   * seat — upsert is a no-op when the row already exists.
   */
  static async ensureBotUser(telegramId: number, displayName: string, avatarId: string): Promise<void> {
    await prisma.user.upsert({
      where: { telegramId: BigInt(telegramId) },
      update: { isBot: true },
      create: {
        telegramId: BigInt(telegramId),
        displayName,
        avatarId,
        balance: 0,
        isBot: true,
      },
    });
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

  /**
   * Plan 04-01 / RESILIENCE-07 / D-D1 / D-D2:
   * Atomic balance deduction with insufficient-funds guard.
   *
   * Single SQL round-trip: `UPDATE users SET balance = balance - n WHERE telegram_id = ? AND balance >= n`.
   * Returns true iff exactly one row was updated (caller had sufficient balance).
   *
   * Closes Concern #5 (buy-in double-spend race) — no read-then-write window.
   * Verified safe on Prisma 7.4.2 (post issue #8612 fix in 4.4.0).
   */
  static async tryDecrementBalance(telegramId: number, amount: number): Promise<boolean> {
    const result = await prisma.user.updateMany({
      where: { telegramId: BigInt(telegramId), balance: { gte: amount } },
      data:  { balance: { decrement: amount } }
    });
    return result.count === 1;
  }

  /**
   * Plan 04-01 / RESILIENCE-02 / RESILIENCE-07 / D-D2:
   * Atomic refund of `currentChips` back to `balance`, with idempotent column-clear.
   *
   * Two-step:
   *   1. Read `currentChips` to capture the amount to refund.
   *   2. Single UPDATE with `WHERE currentChips IS NOT NULL` guard:
   *      - increments balance by chipsToRefund
   *      - sets currentChips, currentTableId, currentSeat, disconnectedAt, lastSeenAt to null
   *
   * The IS-NOT-NULL guard makes the write idempotent: a concurrent boot-recovery
   * sweep racing with a client-driven refund cannot double-credit. The second
   * caller sees `count === 0` and returns null — no double write.
   *
   * Returns:
   *   - { refunded: N } on the first successful refund
   *   - null when never seated (currentChips IS NULL) OR already refunded by another caller (count === 0) OR user not found
   *
   * Used by:
   *   - GraceRegistry.onExpire (between-hands branch) — Plan 04-02
   *   - SessionRecovery boot sweep — Plan 04-04
   *   - leaveTable cashout handler — Plan 04-06
   *
   * Telegram IDs are ≤10 digits in 2026; BigInt(Number(telegramId)) round-trip is safe (Pitfall 7).
   */
  static async refundCurrentChips(telegramId: string): Promise<{ refunded: number } | null> {
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(Number(telegramId)) },
      select: { currentChips: true }
    });
    if (!user || user.currentChips === null) return null;

    const chipsToRefund = user.currentChips;

    const result = await prisma.user.updateMany({
      where: { telegramId: BigInt(Number(telegramId)), currentChips: { not: null } },
      data:  {
        balance: { increment: chipsToRefund },
        currentChips: null,
        currentTableId: null,
        currentSeat: null,
        disconnectedAt: null,
        lastSeenAt: null
      }
    });

    if (result.count === 0) return null;
    return { refunded: chipsToRefund };
  }

  /**
   * Phase 5 / Plan 05-04 / ADMIN-05:
   * Atomic balance delta for admin grant. Returns { success, newBalance? }.
   *
   *   - delta > 0: unconditional increment (no upper cap in MVP).
   *   - delta < 0: only succeeds if `balance + delta >= 0` (cannot drive into negative).
   *   - delta === 0: rejected at validation layer (zod refine in admin UI Plan 05-05),
   *     but defensively returns { success: false } here too.
   */
  static async adjustBalanceAtomic(
    telegramId: string | number,
    delta: number
  ): Promise<{ success: boolean; newBalance?: number }> {
    if (!Number.isInteger(delta) || delta === 0) {
      return { success: false };
    }
    const tid = typeof telegramId === 'string' ? BigInt(telegramId) : BigInt(telegramId);
    if (delta > 0) {
      const result = await prisma.user.updateMany({
        where: { telegramId: tid },
        data:  { balance: { increment: delta } }
      });
      if (result.count !== 1) return { success: false };
    } else {
      // delta < 0 → require balance >= |delta|
      const result = await prisma.user.updateMany({
        where: { telegramId: tid, balance: { gte: -delta } },
        data:  { balance: { increment: delta } } // increment by negative number
      });
      if (result.count !== 1) return { success: false };
    }
    const fresh = await prisma.user.findUnique({ where: { telegramId: tid }, select: { balance: true } });
    return { success: true, newBalance: fresh?.balance ?? undefined };
  }

  /**
   * Phase 5 / Plan 05-04 / ADMIN-05:
   * Atomic ban: sets bannedAt = banAt AND clears all session columns
   * (currentTableId, currentSeat, currentChips, disconnectedAt, lastSeenAt) in
   * one update so the banned user cannot resume a session via reconnect.
   */
  static async setBannedAt(telegramId: string | number, banAt: Date): Promise<{ success: boolean }> {
    const tid = typeof telegramId === 'string' ? BigInt(telegramId) : BigInt(telegramId);
    const result = await prisma.user.updateMany({
      where: { telegramId: tid },
      data: {
        bannedAt: banAt,
        currentTableId: null,
        currentSeat: null,
        currentChips: null,
        disconnectedAt: null,
        lastSeenAt: null,
      }
    });
    return { success: result.count === 1 };
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
      bannedAt: user.bannedAt ? user.bannedAt.toISOString() : undefined,
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
