import prisma from './db/prisma.js';
import { PREDEFINED_TABLES } from './config/tables.js';
import { UserRepository } from './db/UserRepository.js';

/**
 * Plan 04-04 / RESILIENCE-06 / D-C1..D-C4:
 * Boot-time session recovery sweep.
 *
 * On server start, every User row with `currentTableId IS NOT NULL` is treated
 * as a stale persisted session and is refunded:
 *   - currentChips → balance (atomic, via UserRepository.refundCurrentChips)
 *   - all session columns cleared (currentTableId, currentSeat, currentChips,
 *     disconnectedAt, lastSeenAt)
 *
 * Always-refund policy (D-C1): NO reseat-as-sit-out branch. The in-memory Game
 * instance is empty after boot anyway (engine is I/O-free per Phase 1 D-09);
 * there is nothing to "reseat into" until players reconnect. Refund + restart
 * is the simplest correct semantics.
 *
 * Per-row blast radius (D-C4, amended 2026-04-29): one row failing does NOT
 * abort the sweep. Each refund runs inside its own try/catch. No outer
 * $transaction is used — UserRepository.refundCurrentChips already provides
 * row-level atomicity via its own conditional updateMany (WHERE currentChips IS
 * NOT NULL). A single outer $transaction would re-introduce blast-radius: one
 * row's constraint violation would roll back all preceding refunds.
 *
 * Idempotent against client-driven races (Pitfall 3): UserRepository.refundCurrentChips
 * has the WHERE currentChips IS NOT NULL guard — if a fast client reconnects
 * during the boot window and triggers a refund first, the sweep sees null and
 * returns null (no double credit).
 *
 * Hookup (Plan 04-06): server/index.ts:182 setTimeout block, AFTER setupTableEvents.
 */
export async function recoverPersistedSessions(): Promise<{ recovered: number }> {
  const knownTableIds = new Set(PREDEFINED_TABLES.map((t) => t.id));

  const rows = await prisma.user.findMany({
    // exit-reconnect B5: bots are excluded. They never buy in (addBots seats them
    // through table.addPlayer with no debit and no ledger row), so "refunding" them
    // mints chips into a bot balance and writes a phantom cashout — prod had already
    // accumulated 4145 chips across 10 such rows before checkpointSeatedPlayers was
    // taught to skip bots. That fix stops new rows being marked; this one stops the
    // sweep acting on the stale rows already sitting in the database.
    where: { currentTableId: { not: null }, isBot: false },
    select: { telegramId: true, currentTableId: true, currentChips: true },
  });

  let recovered = 0;
  for (const row of rows) {
    const tid = String(row.telegramId);
    const tableId = row.currentTableId;

    // D-C3: stale tableId (no match in PREDEFINED_TABLES) → warn + still refund.
    if (tableId && !knownTableIds.has(tableId)) {
      console.warn(
        '[BootRecovery] stale tableId %s for telegramId=%s — refunded',
        tableId,
        tid,
        { currentChips: row.currentChips }
      );
    }

    try {
      const result = await UserRepository.refundCurrentChips(tid);
      if (result) {
        console.log(
          '[BootRecovery] refunded telegramId=%s chips=%d table=%s',
          tid,
          result.refunded,
          tableId
        );
        recovered++;
      }
      // result === null means: race-cleared by another caller, never seated, or user not found.
      // Not an error. Do not increment recovered, do not log.
    } catch (err) {
      // Per-row blast-radius bound (D-C4, amended 2026-04-29): one failure does
      // not abort the sweep. No $transaction wraps the loop — each row is
      // independent. refundCurrentChips atomicity is self-contained per row.
      console.error('[BootRecovery] refund failed for telegramId=%s:', tid, err);
    }
  }

  return { recovered };
}
