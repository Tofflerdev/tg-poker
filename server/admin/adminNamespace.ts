import type { Server } from 'socket.io';
import type { DefaultEventsMap } from 'socket.io';
import { verifyAdminToken } from './adminAuth.js';
import { buildAdminState, buildAdminTableInfo } from './adminState.js';
import {
  kickUser,
  banUser,
  grantBalance,
  enableTable,
  disableTable,
  drainTable,
  editTableParams,
  addBots,
  removeBots,
  setBotsContinue,
} from './adminMutations.js';
import type { AdminClientEvents, AdminServerEvents } from '../../types/index.js';

interface AdminSocketData { adminUser: string; }

/**
 * Phase 5 / Plan 05-04 / ADMIN-02 / Pattern 1 + Pitfall 5 (RESEARCH).
 *
 * Namespace middleware — exported separately so unit tests (Plan 05-00 RED
 * suite) can invoke it directly without standing up a Socket.io server.
 */
export function adminNamespaceMiddleware(
  socket: { handshake: { auth?: { token?: unknown } }; data: { adminUser?: string } },
  next: (err?: Error) => void
): void {
  const token = socket.handshake.auth?.token;
  if (typeof token !== 'string' || token.length === 0) {
    next(new Error('UNAUTHORIZED'));
    return;
  }
  try {
    const payload = verifyAdminToken(token);
    socket.data.adminUser = payload.username;
    next();
  } catch {
    next(new Error('UNAUTHORIZED'));
  }
}

/**
 * Phase 5 / Plan 05-04 / ADMIN-02 / ADMIN-04 / D-06.
 *
 * Mounts the /admin namespace on the existing io. Called once at boot from
 * server/index.ts.
 */
export interface AdminNamespaceDeps {
  /** Broadcast player-facing game state for a table (server/index.ts updateTableState). */
  broadcastTableState: (tableId: string) => void;
}

export function setupAdminNamespace(io: Server, deps: AdminNamespaceDeps): void {
  const adminNs = (io.of('/admin') as any) as ReturnType<typeof io.of>;

  adminNs.use((socket, next) => adminNamespaceMiddleware(socket as any, next));

  adminNs.on('connection', async (socket) => {
    const adminUser = socket.data.adminUser ?? 'unknown';
    console.log(`[Admin] connected: ${adminUser} (${socket.id})`);

    // ADMIN-04 / D-06: full snapshot on connect.
    try {
      const snapshot = await buildAdminState();
      socket.emit('adminState', snapshot);
    } catch (err) {
      console.error('[Admin] buildAdminState failed:', err);
      socket.emit('adminError', { code: 'STATE_BUILD_FAILED', message: 'Failed to build admin state' });
    }

    // ADMIN-05: bind admin client events. Each handler wraps its work in
    // runWithAudit (inside the mutation module) and emits a delta on success.
    socket.on('enableTable', async ({ tableId }) => {
      try {
        await enableTable(adminNs as any, adminUser, tableId);
        const info = buildAdminTableInfo(tableId);
        if (info) adminNs.emit('tableStateChanged', info);
      } catch (err) {
        socket.emit('adminError', { code: 'ENABLE_TABLE_FAILED', message: (err as Error).message });
      }
    });
    socket.on('disableTable', async ({ tableId }) => {
      try {
        await disableTable(adminNs as any, adminUser, tableId);
        const info = buildAdminTableInfo(tableId);
        if (info) adminNs.emit('tableStateChanged', info);
      } catch (err) {
        socket.emit('adminError', { code: 'DISABLE_TABLE_FAILED', message: (err as Error).message });
      }
    });
    socket.on('drainTable', async ({ tableId }) => {
      try {
        await drainTable(adminNs as any, adminUser, tableId);
        const info = buildAdminTableInfo(tableId);
        if (info) adminNs.emit('tableStateChanged', info);
      } catch (err) {
        socket.emit('adminError', { code: 'DRAIN_TABLE_FAILED', message: (err as Error).message });
      }
    });
    socket.on('editTableParams', async ({ tableId, smallBlind, bigBlind, minBuyIn, maxBuyIn }) => {
      // Validate basic invariants server-side too (defense-in-depth — UI uses zod).
      if (!Number.isInteger(smallBlind) || !Number.isInteger(bigBlind) ||
          !Number.isInteger(minBuyIn) || !Number.isInteger(maxBuyIn) ||
          smallBlind <= 0 || bigBlind <= 0 || minBuyIn <= 0 || maxBuyIn <= 0 ||
          bigBlind !== smallBlind * 2 || minBuyIn > maxBuyIn) {
        socket.emit('adminError', { code: 'INVALID_PARAMS', message: 'Invalid table params (positive ints; bigBlind = 2 * smallBlind; minBuyIn ≤ maxBuyIn)' });
        return;
      }
      try {
        await editTableParams(adminNs as any, adminUser, tableId, { smallBlind, bigBlind, minBuyIn, maxBuyIn });
        const info = buildAdminTableInfo(tableId);
        if (info) adminNs.emit('tableStateChanged', info);
      } catch (err) {
        socket.emit('adminError', { code: 'EDIT_PARAMS_FAILED', message: (err as Error).message });
      }
    });
    socket.on('kickUser', async ({ telegramId }) => {
      try { await kickUser(io, adminNs as any, adminUser, telegramId); }
      catch (err) { socket.emit('adminError', { code: 'KICK_FAILED', message: (err as Error).message }); }
    });
    socket.on('banUser', async ({ telegramId }) => {
      try { await banUser(io, adminNs as any, adminUser, telegramId); }
      catch (err) { socket.emit('adminError', { code: 'BAN_FAILED', message: (err as Error).message }); }
    });
    socket.on('grantBalance', async ({ telegramId, delta }) => {
      // Defense-in-depth bound check on delta (zod also enforces in UI Plan 05-05).
      if (!Number.isInteger(delta) || delta === 0 || delta < -100000 || delta > 100000) {
        socket.emit('adminError', { code: 'INVALID_DELTA', message: 'Delta must be a non-zero integer in [-100000, 100000]' });
        return;
      }
      try { await grantBalance(adminNs as any, adminUser, telegramId, delta); }
      catch (err) { socket.emit('adminError', { code: 'GRANT_FAILED', message: (err as Error).message }); }
    });

    // Playtest bots — seat/remove server-side bots driven by the BotDriver.
    socket.on('addBots', async ({ tableId, count }) => {
      if (!Number.isInteger(count) || count < 1 || count > 5) {
        socket.emit('adminError', { code: 'INVALID_BOT_COUNT', message: 'count must be an integer in [1, 5]' });
        return;
      }
      try {
        await addBots(adminUser, tableId, count);
        deps.broadcastTableState(tableId); // refresh seated humans
        const info = buildAdminTableInfo(tableId);
        if (info) adminNs.emit('tableStateChanged', info);
      } catch (err) {
        socket.emit('adminError', { code: 'ADD_BOTS_FAILED', message: (err as Error).message });
      }
    });
    socket.on('removeBots', async ({ tableId }) => {
      try {
        await removeBots(adminUser, tableId);
        deps.broadcastTableState(tableId);
        const info = buildAdminTableInfo(tableId);
        if (info) adminNs.emit('tableStateChanged', info);
      } catch (err) {
        socket.emit('adminError', { code: 'REMOVE_BOTS_FAILED', message: (err as Error).message });
      }
    });
    socket.on('setBotsContinue', async ({ tableId, enabled }) => {
      if (typeof enabled !== 'boolean') {
        socket.emit('adminError', { code: 'INVALID_FLAG', message: 'enabled must be a boolean' });
        return;
      }
      try {
        await setBotsContinue(adminUser, tableId, enabled);
        deps.broadcastTableState(tableId);
        const info = buildAdminTableInfo(tableId);
        if (info) adminNs.emit('tableStateChanged', info);
      } catch (err) {
        socket.emit('adminError', { code: 'SET_BOTS_CONTINUE_FAILED', message: (err as Error).message });
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Admin] disconnected: ${adminUser} (${socket.id})`);
    });
  });
}
