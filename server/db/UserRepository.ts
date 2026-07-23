import prisma from './prisma.js';
import { generateRandomName } from '../utils/nameGenerator.js';
import { TelegramUser, UserProfile } from '../../types/index.js';
import { randomAvatarId } from '../../types/avatars.js';
import {
  HOUSE_TELEGRAM_ID,
  BOT_BANKROLL_TELEGRAM_ID,
  isSystemAccount,
} from '../payments/systemAccounts.js';

export class UserRepository {
  static async findOrCreate(telegramId: number, username?: string, _photoUrl?: string): Promise<TelegramUser> {
    // §H/§K: house (0) and bot-bankroll are money-holding system accounts, never
    // logins. Real Telegram ids are ≥ 1, so this only ever fires on a bug or a
    // forged/dev id — refuse to create or resolve a session for them.
    if (isSystemAccount(telegramId)) {
      throw new Error(`[UserRepository] refusing to log in system account telegramId=${telegramId}`);
    }
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
          // §G: real-money economy — new users start with 0 chips (was 1000).
          balance: 0
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

  /**
   * crypto-payments-rake phase 2 + phase 4 §H: append a `rake` row to the ledger
   * AND credit the rake to the house account balance.
   *
   * The rake chips are removed from play at hand settlement (Game.ts deducts them
   * from the pots before payout); §H makes them land as house balance rather than
   * simply vanishing from circulation. Balance UPDATE + ledger row commit together
   * in one DB transaction, so the money invariant stays closed
   * (`Σ balances + chips in play` is conserved: chips leave play, house grows).
   *
   * `meta` carries { handId, tableId, breakdown } where `breakdown` is the
   * per-participant rake split proportional to contribution — a hook for future
   * rakeback with no schema change. It is the source of truth for total rake (§E).
   *
   * No-op for `amount <= 0` (preflop folds / sub-threshold pots rake nothing).
   */
  static async recordRake(
    amount: number,
    meta: { handId: string; tableId: string; breakdown?: Record<string, number> }
  ): Promise<void> {
    if (!Number.isInteger(amount) || amount <= 0) return;
    await prisma.$transaction(async (tx) => {
      const result = await tx.user.updateMany({
        where: { telegramId: BigInt(HOUSE_TELEGRAM_ID) },
        data: { balance: { increment: amount } },
      });
      if (result.count !== 1) {
        // House row must exist (seeded at boot by ensureSystemAccounts). Fail
        // loudly rather than silently drop rake from the ledger and invariant.
        throw new Error('[recordRake] house account row missing — rake not recorded');
      }
      const house = await tx.user.findUnique({
        where: { telegramId: BigInt(HOUSE_TELEGRAM_ID) },
        select: { id: true, balance: true },
      });
      await tx.transaction.create({
        data: {
          userId: house!.id,
          type: 'rake',
          amount,
          balanceAfter: house!.balance,
          meta: meta as any,
        },
      });
    });
  }

  /**
   * phase 4 §H/§K: idempotently seed a money-holding system account (house or bot
   * bankroll). Called once per account at boot. `update: {}` guarantees a restart
   * NEVER resets an accrued balance — only the initial `create` sets balance 0.
   * These rows are excluded from login (findOrCreate guard) and from any
   * player-facing list.
   */
  static async ensureSystemAccount(telegramId: number, displayName: string): Promise<void> {
    await prisma.user.upsert({
      where: { telegramId: BigInt(telegramId) },
      update: {},
      create: {
        telegramId: BigInt(telegramId),
        displayName,
        balance: 0,
      },
    });
  }

  /** phase 4: seed both system accounts (house §H + bot bankroll §K) at boot. */
  static async ensureSystemAccounts(): Promise<void> {
    await this.ensureSystemAccount(HOUSE_TELEGRAM_ID, 'House');
    await this.ensureSystemAccount(BOT_BANKROLL_TELEGRAM_ID, 'Bot Bankroll');
  }

  /**
   * phase 4 §K: debit the bot bankroll to fund one bot buy-in on a live table.
   * Reuses the guarded, atomic `tryDecrementBalance` path (WHERE balance >= amount
   * → a `buyin` ledger row scoped to the bankroll). Returns false when the float
   * is insufficient — the caller must then NOT seat the bot (no overdraft) and
   * raise an alert. No session columns are written (system account never "sits").
   */
  static async debitBankrollForBotBuyIn(
    amount: number,
    meta: { tableId: string; seat: number }
  ): Promise<boolean> {
    return this.tryDecrementBalance(BOT_BANKROLL_TELEGRAM_ID, amount, { ...meta, bot: true });
  }

  /**
   * phase 4 §K: return a leaving bot's remaining stack to the bankroll. Bots are
   * never checkpointed (see checkpointSeatedPlayers), so their chips live only in
   * the live Game state — the caller reads the stack from there and passes it here.
   * A busted bot has stack 0: nothing to credit and a zero-amount cashout is pure
   * ledger noise, so we no-op (mirrors refundCurrentChips). Balance UPDATE +
   * `cashout` row commit together.
   */
  static async creditBankrollFromBotCashout(
    amount: number,
    meta: { tableId: string }
  ): Promise<void> {
    if (!Number.isInteger(amount) || amount <= 0) return;
    await prisma.$transaction(async (tx) => {
      const result = await tx.user.updateMany({
        where: { telegramId: BigInt(BOT_BANKROLL_TELEGRAM_ID) },
        data: { balance: { increment: amount } },
      });
      if (result.count !== 1) {
        throw new Error('[creditBankrollFromBotCashout] bankroll row missing — stack not returned');
      }
      const bankroll = await tx.user.findUnique({
        where: { telegramId: BigInt(BOT_BANKROLL_TELEGRAM_ID) },
        select: { id: true, balance: true },
      });
      await tx.transaction.create({
        data: {
          userId: bankroll!.id,
          type: 'cashout',
          amount,
          balanceAfter: bankroll!.balance,
          meta: { ...meta, bot: true },
        },
      });
    });
  }

  /**
   * crypto-payments-rake phase 4 (§D): record a pending deposit for a freshly
   * created Crypto Pay invoice. `externalId = invoiceId` (@unique) is what makes
   * the eventual webhook idempotent. balanceAfter stays null until the payment is
   * confirmed and credited (creditDepositIfPending). `amount` holds the requested
   * chips for now; it is finalized to the actual net credit on completion.
   */
  static async createPendingDeposit(
    telegramId: number,
    amountChips: number,
    invoiceId: string,
  ): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
      select: { id: true },
    });
    if (!user) throw new Error(`[createPendingDeposit] user ${telegramId} not found`);
    await prisma.transaction.create({
      data: {
        userId: user.id,
        type: 'deposit',
        amount: amountChips,
        balanceAfter: null,
        externalId: invoiceId,
        status: 'pending',
        meta: { requestedChips: amountChips },
      },
    });
  }

  /**
   * crypto-payments-rake phase 4 (§D/§E): credit a paid deposit exactly once.
   *
   * Idempotent against duplicate webhook deliveries via a guarded status
   * transition: the pending → completed flip is an `updateMany WHERE status =
   * 'pending'`, so only the first caller (which takes the row lock) proceeds to
   * increment the balance; a racing delivery sees count 0 and bails. Balance
   * increment + ledger finalization commit together.
   *
   * `netChips` is what we actually credit (paid amount minus provider fee — the
   * player pays the fee, plan §D decision 2026-07-21). A net of 0 marks the row
   * failed without crediting.
   */
  static async creditDepositIfPending(
    invoiceId: string,
    netChips: number,
    paymentMeta: Record<string, unknown>,
  ): Promise<{ credited: boolean; reason?: string; telegramId?: number; balance?: number; creditedChips?: number }> {
    return prisma.$transaction(async (tx) => {
      const row = await tx.transaction.findUnique({ where: { externalId: invoiceId } });
      if (!row || row.type !== 'deposit') return { credited: false, reason: 'unknown_invoice' };
      if (row.status === 'completed') return { credited: false, reason: 'already_credited' };
      if (row.userId === null) return { credited: false, reason: 'no_user' };

      const prevMeta = (row.meta as Record<string, unknown> | null) ?? {};

      if (!Number.isInteger(netChips) || netChips <= 0) {
        // Net rounded to zero after fee — mark failed (guarded) and credit nothing.
        await tx.transaction.updateMany({
          where: { id: row.id, status: 'pending' },
          data: { status: 'failed', meta: { ...prevMeta, ...paymentMeta, note: 'net<=0' } as any },
        });
        return { credited: false, reason: 'net_zero' };
      }

      // Guarded claim: only the first delivery flips pending → completed.
      const claim = await tx.transaction.updateMany({
        where: { id: row.id, status: 'pending' },
        data: { status: 'completed' },
      });
      if (claim.count !== 1) return { credited: false, reason: 'already_credited' };

      const updated = await tx.user.update({
        where: { id: row.userId },
        data: { balance: { increment: netChips } },
        select: { telegramId: true, balance: true },
      });
      await tx.transaction.update({
        where: { id: row.id },
        data: {
          amount: netChips, // finalized to the actual net credit
          balanceAfter: updated.balance,
          meta: { ...prevMeta, ...paymentMeta } as any,
        },
      });
      return {
        credited: true,
        telegramId: Number(updated.telegramId),
        balance: updated.balance,
        creditedChips: netChips,
      };
    });
  }

  /**
   * §H: reserve a house rake withdrawal — guarded atomic debit of the house
   * balance + a `pending` withdrawal ledger row keyed by `spendId` (externalId
   * @unique). The guard (`balance >= amount`) makes it impossible to withdraw
   * player money. Returns ok:false/'insufficient' when the house lacks funds.
   * The actual Crypto Pay transfer happens AFTER this commits (see adminMutations).
   */
  static async debitHouseForWithdrawal(
    amountChips: number,
    spendId: string,
    meta: Record<string, unknown>,
  ): Promise<{ ok: boolean; reason?: string; newBalance?: number }> {
    if (!Number.isInteger(amountChips) || amountChips <= 0) return { ok: false, reason: 'bad_amount' };
    return prisma.$transaction(async (tx) => {
      const res = await tx.user.updateMany({
        where: { telegramId: BigInt(HOUSE_TELEGRAM_ID), balance: { gte: amountChips } },
        data: { balance: { decrement: amountChips } },
      });
      if (res.count !== 1) return { ok: false, reason: 'insufficient' };
      const house = await tx.user.findUnique({
        where: { telegramId: BigInt(HOUSE_TELEGRAM_ID) },
        select: { id: true, balance: true },
      });
      await tx.transaction.create({
        data: {
          userId: house!.id,
          type: 'withdrawal',
          amount: -amountChips,
          balanceAfter: house!.balance,
          externalId: spendId,
          status: 'pending',
          meta: meta as any,
        },
      });
      return { ok: true, newBalance: house!.balance };
    });
  }

  /** §H: mark a house withdrawal row completed (transfer succeeded). */
  static async completeHouseWithdrawal(spendId: string, extraMeta?: Record<string, unknown>): Promise<void> {
    await prisma.transaction.updateMany({
      where: { externalId: spendId, status: 'pending' },
      data: { status: 'completed', ...(extraMeta ? { meta: extraMeta as any } : {}) },
    });
  }

  /**
   * §H: transfer failed — credit the debited amount back to the house and mark
   * the row failed. Guarded (only a still-`pending` row) so it is idempotent and
   * cannot double-refund. A failed row is excluded from the money invariant.
   */
  static async refundHouseWithdrawal(spendId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const row = await tx.transaction.findUnique({ where: { externalId: spendId } });
      if (!row || row.status !== 'pending') return;
      const claim = await tx.transaction.updateMany({
        where: { id: row.id, status: 'pending' },
        data: { status: 'failed' },
      });
      if (claim.count !== 1) return;
      // row.amount is negative (money leaving house) → credit back by -amount.
      await tx.user.updateMany({
        where: { telegramId: BigInt(HOUSE_TELEGRAM_ID) },
        data: { balance: { increment: -row.amount } },
      });
    });
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
   * The guarded `UPDATE ... WHERE balance >= n` and the ledger `buyin` row are
   * written inside one interactive DB transaction (crypto-payments-rake phase 1),
   * so a successful buy-in and its ledger entry commit or roll back together.
   * The UPDATE takes a row lock, so the subsequent read of `balance` for
   * `balanceAfter` reflects our own write (no TOCTOU on the snapshot).
   *
   * Returns true iff exactly one row was updated (caller had sufficient balance).
   * On insufficient funds no row is touched and no ledger row is written.
   *
   * Closes Concern #5 (buy-in double-spend race) — no read-then-write window.
   * Verified safe on Prisma 7.4.2 (post issue #8612 fix in 4.4.0).
   */
  static async tryDecrementBalance(
    telegramId: number,
    amount: number,
    meta?: Record<string, unknown>,
    session?: { tableId: string; seat: number }
  ): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const result = await tx.user.updateMany({
        where: { telegramId: BigInt(telegramId), balance: { gte: amount } },
        data:  {
          balance: { decrement: amount },
          // exit-reconnect B3: seat the player in the SAME transaction as the debit.
          // currentChips is the sole refund source of truth (refundCurrentChips), but
          // it was previously only written at hand boundaries by checkpointSeatedPlayers.
          // That left a window between buy-in and the first hand end where it held NULL
          // (first ever sit-down) or 0 (re-buy after busting) — leaving in that window
          // refunded nothing and destroyed the whole buy-in.
          ...(session
            ? {
                currentChips: amount,
                currentTableId: session.tableId,
                currentSeat: session.seat,
              }
            : {}),
        }
      });
      if (result.count !== 1) return false;

      const fresh = await tx.user.findUnique({
        where: { telegramId: BigInt(telegramId) },
        select: { id: true, balance: true }
      });
      await tx.transaction.create({
        data: {
          userId: fresh!.id,
          type: 'buyin',
          amount: -amount,
          balanceAfter: fresh!.balance,
          ...(meta ? { meta: meta as any } : {}),
        }
      });
      return true;
    });
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
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { telegramId: BigInt(Number(telegramId)) },
        select: { id: true, currentChips: true, currentTableId: true }
      });
      if (!user || user.currentChips === null) return null;

      const chipsToRefund = user.currentChips;

      const result = await tx.user.updateMany({
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

      // Idempotency (Pitfall 3): a concurrent refund committed first → count 0.
      // No balance change happened here, so we write no ledger row and bail.
      if (result.count === 0) return null;

      // A busted player has currentChips = 0: the session columns above still need
      // clearing, but there is no money to record. A zero-amount cashout is pure
      // noise in an append-only money ledger — and it was frequent, since every
      // bust-out ends in either "leave table" or a re-buy, each writing one.
      if (chipsToRefund === 0) return { refunded: 0 };

      const fresh = await tx.user.findUnique({
        where: { telegramId: BigInt(Number(telegramId)) },
        select: { balance: true }
      });
      await tx.transaction.create({
        data: {
          userId: user.id,
          type: 'cashout',
          amount: chipsToRefund,
          balanceAfter: fresh!.balance,
          ...(user.currentTableId ? { meta: { tableId: user.currentTableId } } : {}),
        }
      });
      return { refunded: chipsToRefund };
    });
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
    // The guarded UPDATE and the ledger `adjustment` row commit together
    // (crypto-payments-rake phase 1).
    return prisma.$transaction(async (tx) => {
      if (delta > 0) {
        const result = await tx.user.updateMany({
          where: { telegramId: tid },
          data:  { balance: { increment: delta } }
        });
        if (result.count !== 1) return { success: false };
      } else {
        // delta < 0 → require balance >= |delta|
        const result = await tx.user.updateMany({
          where: { telegramId: tid, balance: { gte: -delta } },
          data:  { balance: { increment: delta } } // increment by negative number
        });
        if (result.count !== 1) return { success: false };
      }
      const fresh = await tx.user.findUnique({ where: { telegramId: tid }, select: { id: true, balance: true } });
      await tx.transaction.create({
        data: {
          userId: fresh!.id,
          type: 'adjustment',
          amount: delta,
          balanceAfter: fresh!.balance,
        }
      });
      return { success: true, newBalance: fresh!.balance };
    });
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

  // crypto-payments-rake §G: daily bonus removed — the real-money economy has no
  // free play-money top-up. `lastDailyRefill` stays a dead DB column. (Deleted
  // claimDailyBonus + its socket handler + client UI.)

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

  /**
   * Increment per-hand stats for one player. `winnings` is the net chip delta for
   * the hand (may be negative). Called from the onHandComplete flow (audit #12).
   */
  static async updateStats(telegramId: number, won: boolean, winnings: number): Promise<void> {
    await prisma.user.update({
      where: { telegramId: BigInt(telegramId) },
      data: {
        handsPlayed: { increment: 1 },
        handsWon: won ? { increment: 1 } : undefined,
        totalWinnings: { increment: winnings },
      }
    });

    // biggestPot = max(biggestPot, winnings), race-free: a single guarded UPDATE
    // (WHERE biggest_pot < winnings) instead of the old read-then-write TOCTOU that
    // could overwrite a larger concurrent value (audit #12 / prior WR-03).
    if (winnings > 0) {
      await prisma.user.updateMany({
        where: { telegramId: BigInt(telegramId), biggestPot: { lt: winnings } },
        data: { biggestPot: winnings }
      });
    }
  }

  private static mapToTelegramUser(user: any): TelegramUser {
    // §G: daily-bonus fields removed — chips only enter via deposits.
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
