import prisma from '../db/prisma.js';
import { tableManager } from '../TableManager.js';
import { userStorage } from '../models/User.js';
import { UserRepository } from '../db/UserRepository.js';
import { acquireBotIdentity } from '../bot/botRegistry.js';
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
 * Returns the number actually seated.
 */
export async function addBots(adminUser: string, tableId: string, count: number): Promise<{ added: number }> {
  const table = tableManager.getTable(tableId);
  if (!table) throw new Error(`Table ${tableId} not found`);

  const before = { playerCount: table.getState().seats.filter((s) => s !== null).length };
  let added = 0;
  await runWithAudit(
    { adminUser, action: 'addBots', targetType: 'table', targetId: tableId, beforeJson: before, afterJson: { requested: count } },
    async () => {
      for (let i = 0; i < count; i++) {
        const seat = table.findFirstAvailableSeat();
        if (seat === -1) break; // table full
        // Re-read seated bots each iteration so successive ids don't collide.
        const identity = acquireBotIdentity(tableManager.getActiveBotIds());
        await UserRepository.ensureBotUser(identity.telegramId, identity.displayName, identity.avatarId);
        const ok = table.addPlayer(
          String(identity.telegramId),
          seat,
          table.config.buyIn,
          identity.telegramId,
          identity.displayName,
          undefined,
          identity.avatarId,
          true, // isBot
        );
        if (ok) added++;
      }
    }
  );
  return { added };
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
      botIds.forEach((id) => table.removePlayer(id));
    }
  );
  return { removed: botIds.length };
}

export async function editTableParams(
  adminNs: AdminNs,
  adminUser: string,
  tableId: string,
  params: { smallBlind: number; bigBlind: number; buyIn: number }
): Promise<void> {
  const table = tableManager.getTable(tableId);
  if (!table) throw new Error(`Table ${tableId} not found`);
  const before = { smallBlind: table.config.smallBlind, bigBlind: table.config.bigBlind, buyIn: table.config.buyIn };
  await runWithAudit(
    { adminUser, action: 'editTableParams', targetType: 'table', targetId: tableId, beforeJson: before, afterJson: params },
    async () => {
      // Apply at next hand: mutate config in place. The Table's continuous game loop
      // picks up the new values when it starts the next hand (existing behavior —
      // smallBlind/bigBlind are read at hand start in Game.ts).
      (table.config as any).smallBlind = params.smallBlind;
      (table.config as any).bigBlind = params.bigBlind;
      (table.config as any).buyIn = params.buyIn;
    }
  );
}
