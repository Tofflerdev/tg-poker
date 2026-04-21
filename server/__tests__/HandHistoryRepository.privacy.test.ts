import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the prisma singleton BEFORE importing the repository.
// findMany is called twice per findForUser; we configure the two responses per test.
const findManyMock = vi.fn();
vi.mock('../db/prisma.js', () => ({
  default: {
    handHistory: {
      findMany: (...args: any[]) => findManyMock(...args),
    },
  },
}));

import { HandHistoryRepository } from '../db/HandHistoryRepository.js';

const playedAt = (iso: string) => new Date(iso);

const userRow = (over: Partial<any> = {}) => ({
  id: 'cuid-1',
  handId: 'h1',
  telegramId: '1001',
  tableId: 'table-standard-1',
  playedAt: playedAt('2026-04-18T12:00:00Z'),
  board: ['As', 'Kd', 'Qc', 'Jh', 'Th'],
  holeCards: ['Ah', 'Kh'],
  seat: 0,
  netDelta: 500,
  finalChips: 1500,
  showedDown: true,
  won: true,
  ...over,
});

const opponentRow = (over: Partial<any> = {}) => ({
  id: 'cuid-x',
  handId: 'h1',
  telegramId: '1002',
  tableId: 'table-standard-1',
  playedAt: playedAt('2026-04-18T12:00:00Z'),
  board: ['As', 'Kd', 'Qc', 'Jh', 'Th'],
  holeCards: ['7c', '2d'],
  seat: 3,
  netDelta: -100,
  finalChips: 900,
  showedDown: false,
  won: false,
  ...over,
});

describe('HandHistoryRepository.findForUser — privacy + grouping', () => {
  beforeEach(() => {
    findManyMock.mockReset();
  });

  it('returns [] when the user has no played hands', async () => {
    findManyMock.mockResolvedValueOnce([]); // first findMany returns no rows
    const result = await HandHistoryRepository.findForUser('1001');
    expect(result).toEqual([]);
    // Second findMany must NOT be called when ownRows is empty (no handIds to fetch).
    expect(findManyMock).toHaveBeenCalledTimes(1);
  });

  it('strips opponent holeCards when showedDown=false (T-3-PRIVACY)', async () => {
    findManyMock
      .mockResolvedValueOnce([userRow()])
      .mockResolvedValueOnce([
        userRow(),                           // own row again, returned in step 2
        opponentRow({ showedDown: false, holeCards: ['7c', '2d'] }),
      ]);
    const result = await HandHistoryRepository.findForUser('1001');
    expect(result).toHaveLength(1);
    // Own holeCards always present
    expect(result[0].holeCards).toEqual(['Ah', 'Kh']);
    // Opponent holeCards stripped
    expect(result[0].opponents).toHaveLength(1);
    expect(result[0].opponents[0].holeCards).toEqual([]);
    expect(result[0].opponents[0].showedDown).toBe(false);
  });

  it('returns opponent holeCards verbatim when showedDown=true', async () => {
    findManyMock
      .mockResolvedValueOnce([userRow()])
      .mockResolvedValueOnce([
        userRow(),
        opponentRow({ showedDown: true, holeCards: ['Qd', 'Qs'] }),
      ]);
    const result = await HandHistoryRepository.findForUser('1001');
    expect(result[0].opponents[0].holeCards).toEqual(['Qd', 'Qs']);
    expect(result[0].opponents[0].showedDown).toBe(true);
  });

  it('always returns own holeCards verbatim, regardless of own showedDown', async () => {
    findManyMock
      .mockResolvedValueOnce([userRow({ showedDown: false, holeCards: ['Ks', '5s'] })])
      .mockResolvedValueOnce([userRow({ showedDown: false, holeCards: ['Ks', '5s'] })]);
    const result = await HandHistoryRepository.findForUser('1001');
    expect(result[0].holeCards).toEqual(['Ks', '5s']);
    expect(result[0].showedDown).toBe(false);
  });

  it('groups multiple opponent rows under the same handId', async () => {
    findManyMock
      .mockResolvedValueOnce([userRow()])
      .mockResolvedValueOnce([
        userRow(),
        opponentRow({ telegramId: '1002', seat: 1, showedDown: false }),
        opponentRow({ telegramId: '1003', seat: 2, showedDown: true, holeCards: ['Tc', 'Td'] }),
        opponentRow({ telegramId: '1004', seat: 4, showedDown: false }),
      ]);
    const result = await HandHistoryRepository.findForUser('1001');
    expect(result[0].opponents).toHaveLength(3);
    const o1003 = result[0].opponents.find((o) => o.telegramId === '1003')!;
    expect(o1003.holeCards).toEqual(['Tc', 'Td']);
    const o1002 = result[0].opponents.find((o) => o.telegramId === '1002')!;
    expect(o1002.holeCards).toEqual([]);
  });

  it('orders results by playedAt DESC and limits to default 50', async () => {
    // Construct 50 own rows with valid sequential timestamps; the repo trusts
    // Prisma's `take:50` ordering and does not re-sort. Use millisecond stride
    // so all 50 dates are valid (Date(0)..Date(49000)).
    const ownRows = Array.from({ length: 50 }, (_, i) =>
      userRow({
        id: `cuid-${i}`,
        handId: `h${i}`,
        playedAt: new Date(Date.UTC(2026, 3, 1, 0, 0, i)), // 2026-04-01T00:00:00Z + i seconds
      })
    );
    findManyMock
      .mockResolvedValueOnce(ownRows) // Prisma honored take:50
      .mockResolvedValueOnce(ownRows); // step 2: same hands, no opponents

    const result = await HandHistoryRepository.findForUser('1001'); // default limit 50
    expect(result).toHaveLength(50);
    // Verify Prisma was called with take:50 and orderBy desc.
    const firstCallArgs = findManyMock.mock.calls[0][0];
    expect(firstCallArgs.take).toBe(50);
    expect(firstCallArgs.orderBy).toEqual({ playedAt: 'desc' });
    expect(firstCallArgs.where).toEqual({ telegramId: '1001' });
  });

  it('clamps an explicit limit > 50 down to 50 (T-3-DOS guard)', async () => {
    findManyMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await HandHistoryRepository.findForUser('1001', 9999);
    const firstCallArgs = findManyMock.mock.calls[0][0];
    expect(firstCallArgs.take).toBe(50);
  });

  it('clamps a non-integer limit safely', async () => {
    findManyMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await HandHistoryRepository.findForUser('1001', 12.7);
    const firstCallArgs = findManyMock.mock.calls[0][0];
    expect(firstCallArgs.take).toBe(12);
  });

  it('resolves tableName from PREDEFINED_TABLES', async () => {
    findManyMock
      .mockResolvedValueOnce([userRow({ tableId: 'table-standard-1' })])
      .mockResolvedValueOnce([userRow({ tableId: 'table-standard-1' })]);
    const result = await HandHistoryRepository.findForUser('1001');
    expect(result[0].tableName).toBe('⭐ Standard Table #1');
  });

  it('falls back to raw tableId when tableId is unknown (defensive)', async () => {
    findManyMock
      .mockResolvedValueOnce([userRow({ tableId: 'table-removed-99' })])
      .mockResolvedValueOnce([userRow({ tableId: 'table-removed-99' })]);
    const result = await HandHistoryRepository.findForUser('1001');
    expect(result[0].tableName).toBe('table-removed-99');
  });

  it('serializes playedAt as an ISO 8601 string', async () => {
    const iso = '2026-04-18T12:34:56.000Z';
    findManyMock
      .mockResolvedValueOnce([userRow({ playedAt: new Date(iso) })])
      .mockResolvedValueOnce([userRow({ playedAt: new Date(iso) })]);
    const result = await HandHistoryRepository.findForUser('1001');
    expect(result[0].playedAt).toBe(iso);
  });

  it('step-2 query uses where: { handId: { in: ownHandIds } } — no leakage of unrelated hands', async () => {
    findManyMock
      .mockResolvedValueOnce([
        userRow({ handId: 'h-A' }),
        userRow({ handId: 'h-B', id: 'cuid-2' }),
      ])
      .mockResolvedValueOnce([
        userRow({ handId: 'h-A' }),
        userRow({ handId: 'h-B', id: 'cuid-2' }),
      ]);
    await HandHistoryRepository.findForUser('1001');
    const secondCallArgs = findManyMock.mock.calls[1][0];
    expect(secondCallArgs.where).toEqual({ handId: { in: ['h-A', 'h-B'] } });
    expect(secondCallArgs).not.toHaveProperty('take'); // step 2 returns all opponent rows for those hands
  });
});
