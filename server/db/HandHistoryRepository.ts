import prisma from './prisma.js';
import { PREDEFINED_TABLES } from '../config/tables.js';
import type {
  HandCompleteEvent,
  HandCompletePerPlayer,
  HandHistoryDTO,
  HandHistoryOpponentDTO,
} from '../../types/index.js';

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

  /**
   * Phase 3 / Plan 03-04 (PROFILE-03, PROFILE-04): privacy-filtered hand history reader.
   *
   * Two-step query (RESEARCH.md §"Privacy filter at read time"):
   *   1. Fetch the requesting user's last `limit` rows (one per hand they played).
   *   2. Fetch ALL rows that share those handIds — gives us opponent rows.
   *
   * Then for each hand:
   *   - Build the DTO from the user's own row (own holeCards always included).
   *   - Attach opponent rows with `holeCards: []` unless `opponentRow.showedDown === true`.
   *
   * SECURITY (T-3-AUTHZ): the requesting `telegramId` MUST come from
   * `socket.data.telegramId` (server-set during Phase 1 auth), not from any
   * client payload. The handler in server/index.ts enforces this; this method
   * trusts its `telegramId` argument and ONLY returns rows derivable from it.
   *
   * SECURITY (T-3-PRIVACY): opponent holeCards are stripped to [] when
   * `showedDown === false` for that opponent — the persisted holeCards are
   * NEVER returned at non-showdown.
   *
   * SECURITY (T-3-DOS): hard-cap `limit` at 50 (D-19). The default is 50; any
   * argument above 50 is clamped down to 50.
   *
   * Returns hands ordered by `playedAt DESC`.
   */
  static async findForUser(telegramId: string, limit = 50): Promise<HandHistoryDTO[]> {
    const cap = Math.min(Math.max(1, Math.trunc(limit)), 50);

    // Step 1: get the user's own rows — these define which hands appear in the
    // result and the user's own seat/holeCards/netDelta for each.
    const ownRows = await prisma.handHistory.findMany({
      where: { telegramId },
      orderBy: { playedAt: 'desc' },
      take: cap,
    });
    if (ownRows.length === 0) return [];

    const handIds = ownRows.map((r) => r.handId);

    // Step 2: fetch every row for those handIds — includes the user's own row
    // again plus all opponent seats. This is bounded: at most 6 rows per handId
    // (max table size), so cap=50 ⇒ ≤ 300 rows.
    const allRows = await prisma.handHistory.findMany({
      where: { handId: { in: handIds } },
    });

    // Group by handId for O(1) opponent lookup.
    const byHandId = new Map<string, typeof allRows>();
    for (const r of allRows) {
      const arr = byHandId.get(r.handId);
      if (arr) arr.push(r);
      else byHandId.set(r.handId, [r]);
    }

    // Resolve tableName once per unique tableId.
    const tableNameById = new Map<string, string>(
      PREDEFINED_TABLES.map((t) => [t.id, t.name])
    );

    // Build DTOs in the order of ownRows (already DESC by playedAt).
    return ownRows.map((own) => {
      const handRows = byHandId.get(own.handId) ?? [own];
      const opponents: HandHistoryOpponentDTO[] = handRows
        .filter((r) => r.telegramId !== telegramId)
        .map((r) => ({
          telegramId: r.telegramId,
          seat: r.seat,
          // PRIVACY (D-18): strip opponent holeCards unless that opponent showed down.
          holeCards: r.showedDown ? r.holeCards : [],
          finalChips: r.finalChips,
          netDelta: r.netDelta,
          won: r.won,
          showedDown: r.showedDown,
        }));
      return {
        handId: own.handId,
        tableId: own.tableId,
        // Defensive fallback to raw tableId if a row references a removed table config.
        tableName: tableNameById.get(own.tableId) ?? own.tableId,
        playedAt: own.playedAt.toISOString(),
        board: own.board,
        seat: own.seat,
        holeCards: own.holeCards, // own cards always returned verbatim
        netDelta: own.netDelta,
        finalChips: own.finalChips,
        showedDown: own.showedDown,
        won: own.won,
        opponents,
      };
    });
  }
}
