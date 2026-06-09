import prisma from '../db/prisma.js';
import { tableManager } from '../TableManager.js';
import { userStorage } from '../models/User.js';
import { getTableAdminStatus } from './adminMutations.js';
import type {
  AdminState,
  AdminTableInfo,
  AdminUserInfo,
  AdminAuditLogEntry,
} from '../../types/index.js';

/**
 * Phase 5 / Plan 05-04 / ADMIN-04 / Pattern 9 (RESEARCH).
 *
 * Build the full adminState snapshot. Called:
 *   - on every new admin connection (full snapshot)
 *   - whenever an admin client requests a refresh (rare; deltas are preferred)
 *
 * Reads tableManager + userStorage in-memory state and the last 10 AdminAuditLog
 * rows from Postgres. No mutations.
 */

export function buildAdminTableInfo(tableId: string): AdminTableInfo | null {
  const table = tableManager.getTable(tableId);
  if (!table) return null;
  const state = table.getState();
  return {
    id: table.id,
    name: table.name,
    config: table.config,
    status: getTableAdminStatus(tableId),
    playerCount: state.seats.filter((s) => s !== null).length,
    botCount: state.seats.filter((s) => s?.isBot).length,
    botsContinue: table.botsContinue,
    handInProgress: state.stage !== 'waiting',
  };
}

export async function buildAdminState(): Promise<AdminState> {
  const tableInfos: AdminTableInfo[] = tableManager
    .getAllTables()
    .map((t) => buildAdminTableInfo(t.id))
    .filter((x): x is AdminTableInfo => x !== null);

  // Connected users — those with an active socket binding via tableManager.
  // Read the in-memory userStorage and map to AdminUserInfo. We include both
  // seated and standing users so the admin sees everyone who has authenticated.
  const allUsers = userStorage.getAllUsers();
  const userInfos: AdminUserInfo[] = allUsers.map((u) => {
    const tid = String(u.telegramId);
    const tbl = tableManager.getPlayerTable(tid);
    let chips = 0;
    let seat: number | null = null;
    let tableId: string | null = null;
    if (tbl) {
      tableId = tbl.id;
      const state = tbl.getState();
      const idx = state.seats.findIndex((p) => p?.id === tid);
      if (idx >= 0) {
        seat = idx;
        chips = state.seats[idx]?.chips ?? 0;
      }
    }
    return {
      telegramId: tid,
      displayName: u.displayName,
      chips,
      tableId,
      seat,
      bannedAt: u.bannedAt ?? null,
    };
  });

  const totalChipsInPlay = userInfos.reduce((sum, u) => sum + u.chips, 0);

  // Last 10 audit log rows.
  const rows = await prisma.adminAuditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  const recentAuditLogs: AdminAuditLogEntry[] = rows.map((r) => ({
    id: r.id,
    adminTelegramId: r.adminTelegramId,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    beforeJson: r.beforeJson,
    afterJson: r.afterJson,
    createdAt: r.createdAt.toISOString(),
  }));

  return { tables: tableInfos, users: userInfos, totalChipsInPlay, recentAuditLogs };
}
