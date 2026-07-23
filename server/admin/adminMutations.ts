import prisma from '../db/prisma.js';
import { tableManager } from '../TableManager.js';
import { userStorage } from '../models/User.js';
import { UserRepository } from '../db/UserRepository.js';
import { randomUUID } from 'crypto';
import { acquireBotIdentity } from '../bot/botRegistry.js';
import { clampBuyIn } from '../config/tables.js';
import { BOT_BANKROLL_TELEGRAM_ID, HOUSE_TELEGRAM_ID } from '../payments/systemAccounts.js';
import { getCryptoPay } from '../payments/cryptoPay.js';
import { chipsToUsdt, MIN_WITHDRAWAL_CHIPS } from '../payments/peg.js';
import * as GraceRegistry from '../GraceRegistry.js';
import type { Server } from 'socket.io';
import type { DefaultEventsMap } from 'socket.io';
import type {
  AdminClientEvents,
  AdminServerEvents,
  Player,
} from '../../types/index.js';

/**
 * Phase 5 / Plan 05-04 / ADMIN-05 / ADMIN-06 / D-04 / D-07 / D-08.
 *
 * Fire-and-fail admin audit pattern. EVERY mutation goes through runWithAudit:
 *   - prisma.adminAuditLog.create() runs FIRST
 *   - if it throws, mutationFn is NEVER called
 *   - if it succeeds, mutationFn runs (await); audit row stays even if mutation fails
 *     (caller is responsible for handling mutation errors and surfacing adminError)
 */
export interface AuditMeta {
  adminUser: string;       // ADMIN_USER env value (D-04 — stored as adminTelegramId)
  action: string;
  targetType: string;
  targetId: string;
  beforeJson: unknown;
  afterJson: unknown;
}

export async function runWithAudit<T>(
  meta: AuditMeta,
  mutationFn: () => Promise<T>
): Promise<T> {
  // Fire: insert audit row FIRST. A throw here aborts before the mutation runs.
  await prisma.adminAuditLog.create({
    data: {
      adminTelegramId: meta.adminUser,
      action: meta.action,
      targetType: meta.targetType,
      targetId: meta.targetId,
      beforeJson: meta.beforeJson as any,
      afterJson: meta.afterJson as any,
    }
  });
  // Run mutation only after audit succeeded.
  return await mutationFn();
}

// ============================================================================
// User-target mutations (D-08 kick, ban, grant)
// ============================================================================

type AdminNs = ReturnType<Server['of']>;

/**
 * Phase 5 / Plan 05-04 / ADMIN-05 / D-08.
 *
 * Kick reuses the Phase 4 eviction path verbatim:
 *   1. emit replacedBySession to the player's current socket (bare event)
 *   2. socket.disconnect(true) — closes the transport
 *   3. tableManager.leaveTable(telegramId) — removes them from the table
 *   4. UserRepository.refundCurrentChips(telegramId) — clears session + refunds chips
 *   5. GraceRegistry.clear(telegramId) — cancels any pending grace timer
 */
export async function kickUser(
  io: Server,
  adminNs: AdminNs,
  adminUser: string,
  telegramId: string
): Promise<void> {
  const before = userStorage.getUser(telegramId);
  await runWithAudit(
    {
      adminUser,
      action: 'kick',
      targetType: 'user',
      targetId: telegramId,
      beforeJson: before ? { displayName: before.displayName, balance: before.balance } : null,
      afterJson: null,
    },
    async () => {
      const sid = tableManager.getSocketIdForTelegram(telegramId);
      if (sid) {
        const sock = io.sockets.sockets.get(sid);
        if (sock) {
          sock.emit('replacedBySession');
          sock.disconnect(true);
        }
      }
      tableManager.leaveTable(telegramId);
      await UserRepository.refundCurrentChips(telegramId);
      GraceRegistry.clear(telegramId);
    }
  );
  adminNs.emit('userKicked', { telegramId });
}

/**
 * Phase 5 / Plan 05-04 / ADMIN-05.
 *
 * Ban: sets bannedAt = now() in DB, also kicks any active session (kick is a no-op
 * when not seated). Mirrors bannedAt into in-memory userStorage so the joinTable
 * gate (Plan 05-01) sees the new value on the very next join attempt.
 */
export async function banUser(
  io: Server,
  adminNs: AdminNs,
  adminUser: string,
  telegramId: string
): Promise<void> {
  const before = userStorage.getUser(telegramId);
  const banAt = new Date();
  await runWithAudit(
    {
      adminUser,
      action: 'ban',
      targetType: 'user',
      targetId: telegramId,
      beforeJson: before ? { bannedAt: before.bannedAt ?? null } : null,
      afterJson: { bannedAt: banAt.toISOString() },
    },
    async () => {
      const result = await UserRepository.setBannedAt(telegramId, banAt);
      if (!result.success) throw new Error(`User ${telegramId} not found`);
      // Kick the live session if any.
      const sid = tableManager.getSocketIdForTelegram(telegramId);
      if (sid) {
        const sock = io.sockets.sockets.get(sid);
        if (sock) {
          sock.emit('replacedBySession');
          sock.disconnect(true);
        }
      }
      tableManager.leaveTable(telegramId);
      await UserRepository.refundCurrentChips(telegramId);
      GraceRegistry.clear(telegramId);
      // Mirror into in-memory cache so Plan 05-01 gate sees BANNED on next joinTable.
      const cached = userStorage.getUser(telegramId);
      if (cached) cached.bannedAt = banAt.toISOString();
    }
  );
  adminNs.emit('userBanned', { telegramId, bannedAt: banAt.toISOString() });
}

/**
 * Phase 5 / Plan 05-04 / ADMIN-05.
 *
 * Balance grant (positive or negative delta). Atomic via UserRepository.adjustBalanceAtomic.
 * Negative delta is rejected when it would drive balance below zero.
 */
export async function grantBalance(
  adminNs: AdminNs,
  adminUser: string,
  telegramId: string,
  delta: number
): Promise<void> {
  const before = userStorage.getUser(telegramId);
  await runWithAudit(
    {
      adminUser,
      action: 'grantBalance',
      targetType: 'user',
      targetId: telegramId,
      beforeJson: before ? { balance: before.balance } : null,
      afterJson: { delta },
    },
    async () => {
      const result = await UserRepository.adjustBalanceAtomic(telegramId, delta);
      if (!result.success) {
        throw new Error('Balance grant failed: insufficient funds or invalid delta');
      }
      // Mirror into in-memory cache.
      const cached = userStorage.getUser(telegramId);
      if (cached && typeof result.newBalance === 'number') cached.balance = result.newBalance;
      adminNs.emit('balanceGranted', { telegramId, delta, newBalance: result.newBalance ?? 0 });
    }
  );
}

// ============================================================================
// Table-target mutations (enable / disable / drain / editParams)
// ============================================================================

// Track in-memory admin overlay state for tables. The Table model itself doesn't
// carry these fields; this module owns them. Plan 05-05 reads via buildAdminState.
const tableAdminState = new Map<string, { status: 'enabled' | 'disabled' | 'draining' }>();

export function getTableAdminStatus(tableId: string): 'enabled' | 'disabled' | 'draining' {
  return tableAdminState.get(tableId)?.status ?? 'enabled';
}

export async function enableTable(adminNs: AdminNs, adminUser: string, tableId: string): Promise<void> {
  const before = getTableAdminStatus(tableId);
  await runWithAudit(
    { adminUser, action: 'enableTable', targetType: 'table', targetId: tableId, beforeJson: { status: before }, afterJson: { status: 'enabled' } },
    async () => { tableAdminState.set(tableId, { status: 'enabled' }); }
  );
}

export async function disableTable(adminNs: AdminNs, adminUser: string, tableId: string): Promise<void> {
  const before = getTableAdminStatus(tableId);
  await runWithAudit(
    { adminUser, action: 'disableTable', targetType: 'table', targetId: tableId, beforeJson: { status: before }, afterJson: { status: 'disabled' } },
    async () => { tableAdminState.set(tableId, { status: 'disabled' }); }
  );
}

export async function drainTable(adminNs: AdminNs, adminUser: string, tableId: string): Promise<void> {
  const before = getTableAdminStatus(tableId);
  await runWithAudit(
    { adminUser, action: 'drainTable', targetType: 'table', targetId: tableId, beforeJson: { status: before }, afterJson: { status: 'draining' } },
    async () => { tableAdminState.set(tableId, { status: 'draining' }); }
  );
}

// ============================================================================
// Playtest bot mutations (addBots / removeBots)
// ============================================================================

/**
 * Seat up to `count` tight-passive playtest bots at a table (BotDriver acts on
 * them — see server/bot/). Each bot gets a reserved-range User row (isBot=true)
 * so its hands persist to hand-history. Stops early if the table fills up.
 *
 * §K: bots now play for real chips against humans, so each buy-in is funded from
 * the bot bankroll float — an atomic, guarded debit. If the float is insufficient
 * the bot is NOT seated (no overdraft) and the loop stops; `skippedInsufficientFloat`
 * reports how many were dropped so the caller can raise an alert. On a rare seat
 * failure after a successful debit, the buy-in is returned to the bankroll.
 *
 * Returns the number actually seated and the number skipped for lack of float.
 */
export async function addBots(
  adminUser: string,
  tableId: string,
  count: number,
): Promise<{ added: number; skippedInsufficientFloat: number }> {
  const table = tableManager.getTable(tableId);
  if (!table) throw new Error(`Table ${tableId} not found`);

  const before = { playerCount: table.getState().seats.filter((s) => s !== null).length };
  const buyIn = clampBuyIn(table.config.maxBuyIn, table.config);
  let added = 0;
  let skippedInsufficientFloat = 0;
  await runWithAudit(
    { adminUser, action: 'addBots', targetType: 'table', targetId: tableId, beforeJson: before, afterJson: { requested: count } },
    async () => {
      for (let i = 0; i < count; i++) {
        const seat = table.findFirstAvailableSeat();
        if (seat === -1) break; // table full

        // §K: fund this bot's buy-in from the bankroll. Insufficient float → stop.
        const funded = await UserRepository.debitBankrollForBotBuyIn(buyIn, { tableId, seat });
        if (!funded) {
          skippedInsufficientFloat++;
          console.warn(
            `[BotBankroll] insufficient float to seat a bot at ${tableId} (buyIn=${buyIn}); skipping remaining`,
          );
          break; // float is out — no point trying more this call
        }

        // Re-read seated bots each iteration so successive ids don't collide.
        const identity = acquireBotIdentity(tableManager.getActiveBotIds());
        await UserRepository.ensureBotUser(identity.telegramId, identity.displayName, identity.avatarId);
        const ok = table.addPlayer(
          String(identity.telegramId),
          seat,
          buyIn,
          identity.telegramId,
          identity.displayName,
          undefined,
          identity.avatarId,
          true, // isBot
        );
        if (ok) {
          added++;
        } else {
          // Seat lost to a race after the debit — return the buy-in so it doesn't leak.
          await UserRepository.creditBankrollFromBotCashout(buyIn, { tableId });
        }
      }
    }
  );
  return { added, skippedInsufficientFloat };
}

/**
 * Remove every bot seated at a table. Mid-hand bots are auto-folded by
 * Game.removePlayer. The bot User rows are left in place (reused on next spawn).
 * Returns the number removed.
 */
export async function removeBots(adminUser: string, tableId: string): Promise<{ removed: number }> {
  const table = tableManager.getTable(tableId);
  if (!table) throw new Error(`Table ${tableId} not found`);

  const botIds = table.getState().seats
    .filter((p): p is Player => !!p?.isBot)
    .map((p) => p.id);

  await runWithAudit(
    { adminUser, action: 'removeBots', targetType: 'table', targetId: tableId, beforeJson: { botCount: botIds.length }, afterJson: { removed: botIds.length } },
    async () => {
      // exit-reconnect A: mid-hand this defers to the next boundary instead of
      // force-folding the bots out of a live hand (which would hand away an all-in
      // bot's pot and break the session recorder's chip conservation for that hand).
      table.requestBotRemoval();
    }
  );
  return { removed: botIds.length };
}

/**
 * §K: external owner top-up of the bot bankroll float. Real money entering the
 * system from outside (owner's own funds), recorded as an `adjustment` on the
 * bankroll account. `amountChips` is a positive chip amount (1 chip = $0.01).
 * Returns the bankroll's new balance.
 */
export async function topUpBankroll(adminUser: string, amountChips: number): Promise<{ newBalance: number }> {
  if (!Number.isInteger(amountChips) || amountChips <= 0) {
    throw new Error('amount must be a positive integer chip amount');
  }
  let newBalance = 0;
  await runWithAudit(
    {
      adminUser,
      action: 'topUpBankroll',
      targetType: 'bankroll',
      targetId: String(BOT_BANKROLL_TELEGRAM_ID),
      beforeJson: null,
      afterJson: { amountChips },
    },
    async () => {
      const res = await UserRepository.topUpBankroll(amountChips);
      if (!res.success) throw new Error('bankroll top-up failed (account row missing?)');
      newBalance = res.newBalance!;
    },
  );
  return { newBalance };
}

/**
 * §H: withdraw accumulated house rake to a Telegram user via Crypto Pay transfer.
 * The ONLY sanctioned way to take profit out (never straight from the CryptoBot
 * UI, which would desync the money invariant).
 *
 * Flow: guarded atomic debit of the house balance + a `pending` withdrawal row
 * (spendId = idempotency key) → Crypto Pay `transfer` → mark completed. On a
 * transfer error the debit is refunded and the row marked failed. Crypto Pay
 * dedupes by spend_id, so this never double-sends.
 *
 * NOTE: on an ambiguous network failure the refund assumes "not sent". If the
 * transfer may actually have gone through, reconcile manually against the
 * CryptoBot transfer history (the spendId is in the ledger row + audit log).
 */
export async function withdrawHouseRake(
  adminUser: string,
  amountChips: number,
  targetUserId: number,
): Promise<{ newBalance: number }> {
  if (!Number.isInteger(amountChips) || amountChips < MIN_WITHDRAWAL_CHIPS) {
    throw new Error(`Minimum withdrawal is ${MIN_WITHDRAWAL_CHIPS} chips`);
  }
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    throw new Error('Invalid target Telegram user id');
  }
  const cryptoPay = getCryptoPay();
  if (!cryptoPay) throw new Error('Crypto Pay is not configured');

  const spendId = `house-wd-${randomUUID()}`;
  let newBalance = 0;
  await runWithAudit(
    {
      adminUser,
      action: 'withdrawHouseRake',
      targetType: 'house',
      targetId: String(HOUSE_TELEGRAM_ID),
      beforeJson: { amountChips, targetUserId },
      afterJson: { spendId },
    },
    async () => {
      const debit = await UserRepository.debitHouseForWithdrawal(amountChips, spendId, {
        targetUserId,
        adminUser,
      });
      if (!debit.ok) {
        throw new Error(debit.reason === 'insufficient' ? 'House balance is insufficient' : 'Debit failed');
      }
      newBalance = debit.newBalance!;
      try {
        const res = await cryptoPay.transfer({
          userId: targetUserId,
          amountUsdt: chipsToUsdt(amountChips),
          spendId,
          comment: 'House rake withdrawal',
        });
        await UserRepository.completeHouseWithdrawal(spendId, {
          targetUserId,
          transferId: res.transfer_id,
        });
      } catch (err) {
        // Definitive/most errors → not sent. Refund and surface.
        await UserRepository.refundHouseWithdrawal(spendId);
        newBalance += amountChips;
        console.error('[HouseWithdraw] transfer failed, refunded:', err);
        throw new Error(`Transfer failed: ${(err as Error).message}`);
      }
    },
  );
  return { newBalance };
}

/**
 * Toggle the "bots keep playing without a human" option for a table (decision B).
 * When turned off, idle bots are dropped if no human is present (between hands).
 */
export async function setBotsContinue(adminUser: string, tableId: string, enabled: boolean): Promise<void> {
  const table = tableManager.getTable(tableId);
  if (!table) throw new Error(`Table ${tableId} not found`);
  const before = { botsContinue: table.botsContinue };
  await runWithAudit(
    { adminUser, action: 'setBotsContinue', targetType: 'table', targetId: tableId, beforeJson: before, afterJson: { botsContinue: enabled } },
    async () => {
      table.setBotsContinue(enabled);
    }
  );
}

export async function editTableParams(
  adminNs: AdminNs,
  adminUser: string,
  tableId: string,
  params: { smallBlind: number; bigBlind: number; minBuyIn: number; maxBuyIn: number }
): Promise<void> {
  const table = tableManager.getTable(tableId);
  if (!table) throw new Error(`Table ${tableId} not found`);
  const before = { smallBlind: table.config.smallBlind, bigBlind: table.config.bigBlind, minBuyIn: table.config.minBuyIn, maxBuyIn: table.config.maxBuyIn };
  await runWithAudit(
    { adminUser, action: 'editTableParams', targetType: 'table', targetId: tableId, beforeJson: before, afterJson: params },
    async () => {
      // Apply at next hand: mutate config in place AND push blinds into the engine.
      // Game reads smallBlind/bigBlind only at hand start (postBlinds), so setBlinds
      // here takes effect on the next hand and never corrupts the current one.
      (table.config as any).smallBlind = params.smallBlind;
      (table.config as any).bigBlind = params.bigBlind;
      (table.config as any).minBuyIn = params.minBuyIn;
      (table.config as any).maxBuyIn = params.maxBuyIn;
      table.game.setBlinds(params.smallBlind, params.bigBlind);
    }
  );
}
