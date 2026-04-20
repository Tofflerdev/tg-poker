import prisma from './prisma.js';
import type { HandCompleteEvent, HandCompletePerPlayer } from '../../types/index.js';

/**
 * Phase 3 / Plan 03-02: Prisma CRUD for HandHistory.
 *
 * `createMany` is invoked from HandHistoryQueue's flush loop with batches up
 * to 50 rows. `skipDuplicates: true` defends against retry double-insertion
 * (D-12). The PK is a per-row cuid, so the dedup target is effectively the
 * row id — a re-enqueued row with a fresh `enqueue()` call gets a new cuid
 * and would NOT be deduped by this flag (acceptable per D-12 best-effort).
 *
 * Plan 03-03 will add `findForUser` here for the reader path.
 */
export type HandHistoryWriteRow = {
  handId: string;
  telegramId: string;
  tableId: string;
  playedAt: Date;
  board: string[];
  holeCards: string[];
  seat: number;
  netDelta: number;
  finalChips: number;
  showedDown: boolean;
  won: boolean;
};

export class HandHistoryRepository {
  static async createMany(rows: HandHistoryWriteRow[]): Promise<{ count: number }> {
    if (rows.length === 0) return { count: 0 };
    const result = await prisma.handHistory.createMany({
      data: rows,
      skipDuplicates: true,
    });
    return { count: result.count };
  }

  static async deleteOlderThan(cutoff: Date): Promise<{ count: number }> {
    const result = await prisma.handHistory.deleteMany({
      where: { playedAt: { lt: cutoff } },
    });
    return { count: result.count };
  }

  /**
   * Plan 03-02: helper to convert HandCompleteEvent + perPlayer to a write row.
   * Stored verbatim — privacy filter is at READ time per D-18 (Plan 03-03).
   */
  static toWriteRow(evt: HandCompleteEvent, p: HandCompletePerPlayer): HandHistoryWriteRow {
    return {
      handId: evt.handId,
      telegramId: p.telegramId,
      tableId: evt.tableId,
      playedAt: evt.completedAt,
      board: evt.board,
      holeCards: p.holeCards,
      seat: p.seat,
      netDelta: p.netDelta,
      finalChips: p.finalChips,
      showedDown: p.showedDown,
      won: p.won,
    };
  }
}
