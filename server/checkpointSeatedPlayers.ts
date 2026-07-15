import { UserRepository } from './db/UserRepository.js';
import type { HandCompleteEvent } from '../types/index.js';

/**
 * Phase 3 / Plan 03-02: chip-state checkpoint helper.
 *
 * Decisions:
 * - D-14: separate awaited path, NOT the HandHistoryQueue (different durability)
 * - D-15: every occupied seat at hand end (= every entry in evt.perPlayer)
 * - D-17: NO mid-hand ephemeral state — only finalChips/tableId/seat
 *
 * Promise.all is used over $transaction (RESEARCH §"Per-player update vs
 * single transaction"): at most 6 players per table, the per-player updates
 * are independent (different rows), and partial success is acceptable for
 * crash recovery (Phase 4 will refund any orphan currentChips on boot if a
 * checkpoint half-failed).
 *
 * Caller (server/index.ts setOnHandComplete) MUST wrap this in try/catch —
 * a Prisma rejection here is logged but never re-thrown into Game.ts.
 */
export async function checkpointSeatedPlayers(evt: HandCompleteEvent): Promise<void> {
  await Promise.all(
    evt.perPlayer
      // exit-reconnect B5: NEVER checkpoint bots (reserved negative telegramId range).
      // The checkpoint exists solely so refundCurrentChips can pay a human back after
      // a crash. Bots never buy in — addBots seats them straight through
      // table.addPlayer with no balance debit and no ledger row — but they were being
      // checkpointed anyway, which left currentTableId set on their User rows. The
      // boot sweep then found them (WHERE currentTableId IS NOT NULL), "refunded"
      // chips they never paid for into their balance and wrote a cashout ledger row
      // for each. Prod had already minted 4145 chips across 10 such rows this way,
      // breaking the plan's §E invariant (deposits − withdrawals = Σ balances + chips
      // in play). Bots are re-seated fresh at maxBuyIn on every spawn, so they have
      // nothing to recover. Mirrors the bot filter on the stats path in index.ts.
      .filter((p) => Number(p.telegramId) > 0)
      .map((p) =>
        UserRepository.checkpointSeat(p.telegramId, {
          currentChips: p.finalChips,
          currentTableId: evt.tableId,
          currentSeat: p.seat,
        })
      )
  );
}
